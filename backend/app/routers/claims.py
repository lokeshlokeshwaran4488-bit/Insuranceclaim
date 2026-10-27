from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.dependencies import get_current_user, get_admin, get_officer
from app.database.postgres import get_db
from app.models.claim import Claim
from app.models.claim_timeline import ClaimTimeline
from app.models.claim_review import ClaimReview
from app.models.document_request import DocumentRequest
from app.models.policy import Policy
from app.models.user import User
from app.schemas.claim import (
    ClaimCreate, ClaimUpdate, ClaimOut, ClaimListResponse, ClaimTimelineOut,
    AssignOfficerRequest, RequestDocumentsRequest,
    RecommendApprovalRequest, RecommendRejectionRequest, EscalateRequest,
    ApproveClaimRequest, RejectClaimRequest,
    AddClaimNoteRequest, ClaimReviewOut, DocumentRequestOut,
    RequestClarificationRequest, RespondClarificationRequest,
    AdminDecisionRequest, MarkManualReviewRequest,
)
from app.services.audit_service import create_audit_log, get_client_ip
from app.services.notification_service import (
    notify_claim_submitted, notify_claim_approved,
    notify_claim_rejected, notify_document_requested,
)
from app.services.ai_verification_service import run_ai_document_verification, get_latest_ai_verification
from app.database.mongodb import get_mongo_db
from app.utils.claim_number import generate_claim_number
from app.core.logging_config import get_logger

router = APIRouter(prefix="/api/claims", tags=["Claims"])
logger = get_logger(__name__)


def _enrich_claim(claim: Claim) -> dict:
    """Add nested fields to a claim dict for response."""
    data = {col.name: getattr(claim, col.name) for col in claim.__table__.columns}
    d = claim.__dict__
    data["customer_name"] = claim.customer.full_name if ("customer" in d and claim.customer) else None
    data["policy_number"] = claim.policy.policy_number if ("policy" in d and claim.policy) else None
    data["officer_name"] = claim.assigned_officer.full_name if ("assigned_officer" in d and claim.assigned_officer) else None
    if "settlement" in d and claim.settlement:
        data["settlement_id"] = claim.settlement.id
        data["settlement_amount"] = float(claim.settlement.payment_amount)
        data["payment_status"] = claim.settlement.payment_status
        data["payment_method"] = claim.settlement.payment_method
        data["payment_reference"] = claim.settlement.payment_reference
    return data


async def _attach_verification_scores_batch(claims: list[Claim], db: AsyncSession) -> list[dict]:
    """Attach persisted AI verification scores, overall status, and escalation details."""
    if not claims:
        return []
    claim_ids = [c.id for c in claims]
    mongo_db = get_mongo_db()

    verif_map = {}
    try:
        cursor = mongo_db["ai_verification_results"].find({"claim_id": {"$in": claim_ids}})
        async for doc in cursor:
            verif_map[doc["claim_id"]] = doc
    except Exception as e:
        logger.debug(f"Failed to batch fetch AI verification results: {e}")

    # Fetch latest escalation reviews
    esc_map = {}
    try:
        from sqlalchemy.orm import selectinload
        esc_res = await db.execute(
            select(ClaimReview)
            .options(selectinload(ClaimReview.officer))
            .where(ClaimReview.claim_id.in_(claim_ids), ClaimReview.review_type == "ESCALATION")
            .order_by(ClaimReview.created_at.desc())
        )
        for r in esc_res.scalars().all():
            if r.claim_id not in esc_map:
                esc_map[r.claim_id] = r
    except Exception as e:
        logger.debug(f"Failed to fetch escalation reviews: {e}")

    enriched_list = []
    for c in claims:
        data = _enrich_claim(c)
        v = verif_map.get(c.id)
        if v:
            data["image_verification_score"] = v.get("image_verification_score")
            data["document_verification_score"] = v.get("document_verification_score")
            data["overall_verification_status"] = v.get("overall_verification_status")
        else:
            data["image_verification_score"] = None
            data["document_verification_score"] = None
            data["overall_verification_status"] = "PENDING"

        esc = esc_map.get(c.id)
        if esc:
            data["escalation_reason"] = esc.remarks
            data["escalated_at"] = esc.created_at
            data["escalated_by_name"] = esc.officer.full_name if (hasattr(esc, "officer") and esc.officer) else None
        enriched_list.append(data)

    return enriched_list


async def _add_timeline(
    db: AsyncSession, claim_id: str, status: str, description: str, created_by: str | None = None
) -> None:
    """Add a timeline entry for a claim."""
    entry = ClaimTimeline(
        claim_id=claim_id, status=status, description=description, created_by=created_by
    )
    db.add(entry)


# ─── Create Draft Claim ──────────────────────────────────────────────────────

@router.post("", response_model=ClaimOut, status_code=status.HTTP_201_CREATED)
async def create_claim(
    payload: ClaimCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Customer: Create a draft claim."""
    if current_user.role != "CUSTOMER":
        raise HTTPException(status_code=403, detail="Only customers can create claims")

    # Validate policy belongs to customer
    result = await db.execute(
        select(Policy).where(
            Policy.id == payload.policy_id,
            Policy.customer_id == current_user.id,
        )
    )
    policy = result.scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found or does not belong to you")

    if policy.status != "ACTIVE":
        raise HTTPException(
            status_code=400, detail=f"Policy is {policy.status}. Only active policies can have claims."
        )

    # Validate requested amount
    if payload.requested_amount > float(policy.coverage_amount):
        raise HTTPException(
            status_code=400,
            detail=f"Requested amount exceeds policy coverage of ₹{policy.coverage_amount:,.2f}",
        )

    claim_number = await generate_claim_number(db)
    claim = Claim(
        claim_number=claim_number,
        policy_id=payload.policy_id,
        customer_id=current_user.id,
        incident_type=payload.incident_type,
        incident_date=payload.incident_date,
        incident_time=payload.incident_time,
        incident_location=payload.incident_location,
        description=payload.description,
        requested_amount=payload.requested_amount,
        status="DRAFT",
    )
    db.add(claim)
    await db.flush()

    await _add_timeline(db, claim.id, "DRAFT", "Claim draft created", current_user.id)
    await create_audit_log(
        db=db,
        action="CREATE_CLAIM",
        entity_type="claim",
        entity_id=claim.id,
        user_id=current_user.id,
        new_value={"claim_number": claim_number, "status": "DRAFT"},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    await db.refresh(claim)
    logger.info(f"Claim created: {claim_number} by user={current_user.id}")
    return ClaimOut(**_enrich_claim(claim))


# ─── List Claims ─────────────────────────────────────────────────────────────

@router.get("", response_model=ClaimListResponse)
async def list_claims(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    claim_status: str | None = Query(None, alias="status"),
    incident_type: str | None = Query(None),
    risk_level: str | None = Query(None),
    search: str | None = Query(None),
    customer_id: str | None = Query(None),
    assigned_officer_id: str | None = Query(None),
    needs_clarification: bool = Query(False),
    escalated_only: bool = Query(False),
    high_fraud_risk: bool = Query(False),
    unassigned: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List claims — filtered by role and advanced management parameters."""
    from sqlalchemy.orm import selectinload

    query = select(Claim).options(
        selectinload(Claim.customer),
        selectinload(Claim.policy),
        selectinload(Claim.assigned_officer),
    )

    if current_user.role == "CUSTOMER":
        query = query.where(Claim.customer_id == current_user.id)
    elif current_user.role == "CLAIM_OFFICER":
        query = query.where(
            or_(
                Claim.assigned_officer_id == current_user.id,
                Claim.assigned_officer_id.is_(None),
            )
        )
    elif current_user.role == "ADMIN":
        if customer_id:
            query = query.where(Claim.customer_id == customer_id)
        if assigned_officer_id:
            query = query.where(Claim.assigned_officer_id == assigned_officer_id)
        if unassigned:
            query = query.where(Claim.assigned_officer_id.is_(None))
        if needs_clarification:
            query = query.where(Claim.status == "NEEDS_ADMIN_CLARIFICATION")

    if escalated_only:
        query = query.where(
            Claim.status.in_(["ADMIN_REVIEW_REQUIRED", "UNDER_FRAUD_REVIEW", "NEEDS_ADMIN_CLARIFICATION"])
        )
    if high_fraud_risk:
        query = query.where(
            or_(
                Claim.fraud_score >= 0.60,
                Claim.risk_level.in_(["HIGH", "VERY_HIGH"])
            )
        )
    if claim_status:
        query = query.where(Claim.status == claim_status)
    if incident_type:
        query = query.where(Claim.incident_type == incident_type)
    if risk_level:
        query = query.where(Claim.risk_level == risk_level)
    if search:
        query = query.where(
            Claim.claim_number.ilike(f"%{search}%") |
            Claim.incident_type.ilike(f"%{search}%")
        )

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()

    query = query.order_by(Claim.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    claims = result.scalars().all()

    enriched_records = await _attach_verification_scores_batch(claims, db)

    return ClaimListResponse(
        claims=[ClaimOut(**c) for c in enriched_records],
        total=total,
        page=page,
        page_size=page_size,
    )


# ─── Get Single Claim ────────────────────────────────────────────────────────

@router.get("/{claim_id}", response_model=ClaimOut)
async def get_claim(
    claim_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get claim details with persisted verification scores and escalation information."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Claim)
        .options(
            selectinload(Claim.customer),
            selectinload(Claim.policy),
            selectinload(Claim.assigned_officer),
            selectinload(Claim.settlement),
        )
        .where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    # Customers can only see their own claims
    if current_user.role == "CUSTOMER" and claim.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Officers can only see assigned claims or unassigned claims awaiting assignment
    if current_user.role == "CLAIM_OFFICER" and claim.assigned_officer_id and claim.assigned_officer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Claim not assigned to you")

    enriched = await _attach_verification_scores_batch([claim], db)
    return ClaimOut(**enriched[0])


# ─── Update Draft Claim ──────────────────────────────────────────────────────

@router.put("/{claim_id}", response_model=ClaimOut)
async def update_claim(
    claim_id: str,
    payload: ClaimUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Customer: Update a draft claim."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.customer), selectinload(Claim.policy), selectinload(Claim.assigned_officer))
        .where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if current_user.role == "CUSTOMER":
        if claim.customer_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        if claim.status != "DRAFT":
            raise HTTPException(
                status_code=400, detail="Only draft claims can be edited"
            )

    update_data = payload.model_dump(exclude_none=True)
    for key, value in update_data.items():
        setattr(claim, key, value)

    await db.commit()
    await db.refresh(claim)
    return ClaimOut(**_enrich_claim(claim))


# ─── Submit Claim ────────────────────────────────────────────────────────────

@router.post("/{claim_id}/submit", response_model=ClaimOut)
async def submit_claim(
    claim_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Customer: Submit a draft claim for processing."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.customer), selectinload(Claim.policy), selectinload(Claim.assigned_officer))
        .where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if current_user.role == "CUSTOMER" and claim.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if claim.status != "DRAFT":
        raise HTTPException(status_code=400, detail=f"Claim is already {claim.status}")

    if claim.requested_amount <= 0:
        raise HTTPException(status_code=400, detail="Please enter a valid claim amount")

    # Check policy still active
    if claim.policy and claim.policy.status != "ACTIVE":
        raise HTTPException(
            status_code=400, detail="Associated policy is no longer active"
        )

    # Submit
    old_status = claim.status
    claim.status = "SUBMITTED"

    await _add_timeline(
        db, claim.id, "SUBMITTED",
        "Claim submitted by customer. Awaiting document verification.", current_user.id
    )
    await notify_claim_submitted(db, claim, current_user.id)
    await create_audit_log(
        db=db,
        action="SUBMIT_CLAIM",
        entity_type="claim",
        entity_id=claim.id,
        user_id=current_user.id,
        old_value={"status": old_status},
        new_value={"status": "SUBMITTED"},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    await db.refresh(claim)
    logger.info(f"Claim submitted: {claim.claim_number}")

    # Automatically run transparent preliminary AI evidence and risk verification
    try:
        await run_ai_document_verification(db, claim.id, current_user.id)
    except Exception as ai_err:
        logger.warning(f"Initial AI document verification advisory warning: {ai_err}")

    return ClaimOut(**_enrich_claim(claim))


# ─── Claim Timeline ──────────────────────────────────────────────────────────

@router.get("/{claim_id}/timeline", response_model=list[ClaimTimelineOut])
async def get_claim_timeline(
    claim_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the timeline for a claim."""
    result = await db.execute(select(Claim).where(Claim.id == claim_id))
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if current_user.role == "CUSTOMER" and claim.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(ClaimTimeline)
        .where(ClaimTimeline.claim_id == claim_id)
        .order_by(ClaimTimeline.created_at.asc())
    )
    return result.scalars().all()


# ─── Assign Officer ──────────────────────────────────────────────────────────

@router.post("/{claim_id}/assign", response_model=ClaimOut)
async def assign_officer(
    claim_id: str,
    payload: AssignOfficerRequest,
    current_admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Assign a claim officer to a claim."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.customer), selectinload(Claim.policy), selectinload(Claim.assigned_officer))
        .where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    # Verify officer exists
    officer_result = await db.execute(
        select(User).where(User.id == payload.officer_id, User.role == "CLAIM_OFFICER")
    )
    officer = officer_result.scalar_one_or_none()
    if not officer:
        raise HTTPException(status_code=404, detail="Claim officer not found")

    claim.assigned_officer_id = payload.officer_id
    claim.status = "UNDER_OFFICER_REVIEW"

    await _add_timeline(
        db, claim.id, "UNDER_OFFICER_REVIEW",
        f"Claim assigned to officer {officer.full_name} for review.", current_admin.id
    )
    await create_audit_log(
        db=db, action="ASSIGN_OFFICER", entity_type="claim", entity_id=claim_id,
        user_id=current_admin.id, new_value={"officer_id": payload.officer_id},
    )
    await db.commit()
    await db.refresh(claim)
    return ClaimOut(**_enrich_claim(claim))


# ─── Start Officer Review ──────────────────────────────────────────────────

@router.post("/{claim_id}/start-review", response_model=ClaimOut)
async def start_officer_review(
    claim_id: str,
    current_officer: User = Depends(get_officer),
    db: AsyncSession = Depends(get_db),
):
    """Officer: Begin formal review on a claim."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.customer), selectinload(Claim.policy), selectinload(Claim.assigned_officer))
        .where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if not claim.assigned_officer_id:
        claim.assigned_officer_id = current_officer.id

    claim.status = "UNDER_OFFICER_REVIEW"
    await _add_timeline(
        db, claim.id, "UNDER_OFFICER_REVIEW",
        f"Claim review initiated by officer {current_officer.full_name}.",
        current_officer.id,
    )
    await db.commit()
    await db.refresh(claim)
    return ClaimOut(**_enrich_claim(claim))


# ─── Request Additional Documents ────────────────────────────────────────────

@router.post("/{claim_id}/request-documents", response_model=ClaimOut)
async def request_additional_documents(
    claim_id: str,
    payload: RequestDocumentsRequest,
    current_officer: User = Depends(get_officer),
    db: AsyncSession = Depends(get_db),
):
    """Officer: Request additional documents from a customer with reason and deadline."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.customer), selectinload(Claim.policy), selectinload(Claim.assigned_officer))
        .where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    doc_request = DocumentRequest(
        claim_id=claim_id,
        requested_by=current_officer.id,
        document_types=payload.document_types,
        message=payload.message,
    )
    db.add(doc_request)

    claim.status = "ADDITIONAL_DOCUMENTS_REQUIRED"
    deadline_text = f" (Deadline: {payload.deadline_days} days)" if payload.deadline_days else ""
    await _add_timeline(
        db, claim.id, "ADDITIONAL_DOCUMENTS_REQUIRED",
        f"Officer requested documents: {', '.join(payload.document_types)}. Reason: {payload.message}{deadline_text}",
        current_officer.id,
    )
    await notify_document_requested(db, claim, claim.customer_id, f"{payload.message}{deadline_text}")
    await db.commit()
    await db.refresh(claim)
    return ClaimOut(**_enrich_claim(claim))


# ─── Document Requests List ─────────────────────────────────────────────────

@router.get("/{claim_id}/document-requests", response_model=list[DocumentRequestOut])
async def get_claim_document_requests(
    claim_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all document requests for a claim."""
    result = await db.execute(select(Claim).where(Claim.id == claim_id))
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if current_user.role == "CUSTOMER" and claim.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    requests_result = await db.execute(
        select(DocumentRequest)
        .where(DocumentRequest.claim_id == claim_id)
        .order_by(DocumentRequest.created_at.desc())
    )
    return requests_result.scalars().all()


# ─── Claim Notes & Reviews ──────────────────────────────────────────────────

@router.post("/{claim_id}/notes", response_model=ClaimReviewOut)
async def add_claim_note(
    claim_id: str,
    payload: AddClaimNoteRequest,
    current_officer: User = Depends(get_officer),
    db: AsyncSession = Depends(get_db),
):
    """Officer/Admin: Add an internal note or review remark to a claim."""
    result = await db.execute(select(Claim).where(Claim.id == claim_id))
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    review = ClaimReview(
        claim_id=claim_id,
        officer_id=current_officer.id,
        review_type="NOTE",
        remarks=payload.remarks,
        is_internal=payload.is_internal,
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)
    return review


@router.get("/{claim_id}/reviews", response_model=list[ClaimReviewOut])
async def get_claim_reviews(
    claim_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get reviews and notes for a claim."""
    result = await db.execute(select(Claim).where(Claim.id == claim_id))
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if current_user.role == "CUSTOMER" and claim.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    query = select(ClaimReview).where(ClaimReview.claim_id == claim_id)
    if current_user.role == "CUSTOMER":
        query = query.where(ClaimReview.is_internal == False)  # Customer sees only non-internal

    reviews_result = await db.execute(query.order_by(ClaimReview.created_at.desc()))
    return reviews_result.scalars().all()


# ─── Officer Recommendations ──────────────────────────────────────────────────

@router.post("/{claim_id}/recommend-approval", response_model=ClaimOut)
async def recommend_approval(
    claim_id: str,
    payload: RecommendApprovalRequest,
    current_officer: User = Depends(get_officer),
    db: AsyncSession = Depends(get_db),
):
    """Officer: Recommend claim approval."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.customer), selectinload(Claim.policy), selectinload(Claim.assigned_officer))
        .where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    review = ClaimReview(
        claim_id=claim_id,
        officer_id=current_officer.id,
        review_type="RECOMMENDATION",
        remarks=payload.remarks,
        recommendation="APPROVE",
        is_internal=True,
    )
    db.add(review)

    claim.status = "APPROVAL_PENDING"
    if payload.recommended_amount:
        claim.approved_amount = payload.recommended_amount

    await _add_timeline(
        db, claim.id, "APPROVAL_PENDING",
        f"Officer {current_officer.full_name} recommended approval. Awaiting admin decision.",
        current_officer.id,
    )
    await db.commit()
    await db.refresh(claim)
    return ClaimOut(**_enrich_claim(claim))


@router.post("/{claim_id}/recommend-rejection", response_model=ClaimOut)
async def recommend_rejection(
    claim_id: str,
    payload: RecommendRejectionRequest,
    current_officer: User = Depends(get_officer),
    db: AsyncSession = Depends(get_db),
):
    """Officer: Recommend claim rejection."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.customer), selectinload(Claim.policy), selectinload(Claim.assigned_officer))
        .where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    review = ClaimReview(
        claim_id=claim_id,
        officer_id=current_officer.id,
        review_type="RECOMMENDATION",
        remarks=payload.remarks,
        recommendation="REJECT",
        is_internal=True,
    )
    db.add(review)

    claim.status = "APPROVAL_PENDING"
    claim.rejection_reason = payload.rejection_reason

    await _add_timeline(
        db, claim.id, "APPROVAL_PENDING",
        f"Officer {current_officer.full_name} recommended rejection. Awaiting admin decision.",
        current_officer.id,
    )
    await db.commit()
    await db.refresh(claim)
    return ClaimOut(**_enrich_claim(claim))


@router.post("/{claim_id}/escalate", response_model=ClaimOut)
async def escalate_claim(
    claim_id: str,
    payload: EscalateRequest,
    current_officer: User = Depends(get_officer),
    db: AsyncSession = Depends(get_db),
):
    """
    Officer: Escalate a claim to Admin for suspicious evidence, conflicting details, or high-risk cases.
    Mandatory escalation reason with relevant AI findings and evidence references.
    Updates claim status to ADMIN_REVIEW_REQUIRED.
    """
    from sqlalchemy.orm import selectinload

    reason = payload.get_reason()

    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.customer), selectinload(Claim.policy), selectinload(Claim.assigned_officer))
        .where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    old_status = claim.status
    claim.status = "ADMIN_REVIEW_REQUIRED"

    full_remarks = f"Escalation Reason: {reason}"
    if payload.ai_findings:
        full_remarks += f"\nAI Findings: {payload.ai_findings}"
    if payload.evidence_references:
        full_remarks += f"\nFlagged Evidence: {', '.join(payload.evidence_references)}"

    review = ClaimReview(
        claim_id=claim_id,
        officer_id=current_officer.id,
        review_type="ESCALATION",
        remarks=full_remarks,
        recommendation="ESCALATE_TO_ADMIN",
        is_internal=True,
    )
    db.add(review)

    await _add_timeline(
        db, claim.id, "ADMIN_REVIEW_REQUIRED",
        f"Claim escalated to Admin by officer {current_officer.full_name}. Reason: {reason}",
        current_officer.id,
    )
    await create_audit_log(
        db=db,
        action="ESCALATE_TO_ADMIN",
        entity_type="claim",
        entity_id=claim_id,
        user_id=current_officer.id,
        old_value={"status": old_status},
        new_value={
            "status": "ADMIN_REVIEW_REQUIRED",
            "reason": reason,
            "ai_findings": payload.ai_findings,
            "evidence_references": payload.evidence_references,
        },
    )
    await db.commit()
    await db.refresh(claim)
    logger.info(f"Claim {claim.claim_number} escalated to Admin by {current_officer.email}")
    enriched = await _attach_verification_scores_batch([claim], db)
    return ClaimOut(**enriched[0])


@router.post("/{claim_id}/mark-manual-review", response_model=ClaimOut)
async def mark_claim_manual_review(
    claim_id: str,
    payload: MarkManualReviewRequest,
    current_reviewer: User = Depends(get_officer),
    db: AsyncSession = Depends(get_db),
):
    """Officer/Admin: Mark claim as requiring manual verification."""
    from sqlalchemy.orm import selectinload

    if not payload.reason or not payload.reason.strip():
        raise HTTPException(status_code=400, detail="Reason for manual review is required")

    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.customer), selectinload(Claim.policy), selectinload(Claim.assigned_officer))
        .where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    old_status = claim.status
    claim.status = "UNDER_VERIFICATION"

    review = ClaimReview(
        claim_id=claim_id,
        officer_id=current_reviewer.id,
        review_type="MANUAL_REVIEW_FLAG",
        remarks=payload.reason.strip(),
        recommendation="MANUAL_VERIFICATION_REQUIRED",
        is_internal=True,
    )
    db.add(review)

    await _add_timeline(
        db, claim.id, "UNDER_VERIFICATION",
        f"Marked for manual verification by {current_reviewer.full_name}: {payload.reason.strip()}",
        current_reviewer.id,
    )
    await create_audit_log(
        db=db,
        action="MARK_MANUAL_REVIEW",
        entity_type="claim",
        entity_id=claim_id,
        user_id=current_reviewer.id,
        old_value={"status": old_status},
        new_value={"status": "UNDER_VERIFICATION", "reason": payload.reason.strip()},
    )
    await db.commit()
    await db.refresh(claim)
    enriched = await _attach_verification_scores_batch([claim], db)
    return ClaimOut(**enriched[0])


# ─── Clarification Workflow (Officer & Admin) ──────────────────────────────

@router.post("/{claim_id}/request-clarification", response_model=ClaimOut)
async def request_admin_clarification(
    claim_id: str,
    payload: RequestClarificationRequest,
    current_officer: User = Depends(get_officer),
    db: AsyncSession = Depends(get_db),
):
    """
    Officer: Flag claim as 'NEEDS_ADMIN_CLARIFICATION' with mandatory reason.
    Places claim in Admin Clarification Queue for review.
    """
    from sqlalchemy.orm import selectinload

    if not payload.reason or not payload.reason.strip():
        raise HTTPException(status_code=400, detail="Clarification reason is mandatory")

    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.customer), selectinload(Claim.policy), selectinload(Claim.assigned_officer))
        .where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    old_status = claim.status
    claim.status = "NEEDS_ADMIN_CLARIFICATION"

    review = ClaimReview(
        claim_id=claim_id,
        officer_id=current_officer.id,
        review_type="CLARIFICATION_REQUEST",
        remarks=payload.reason.strip(),
        recommendation="CLARIFICATION_NEEDED",
        is_internal=True,
    )
    db.add(review)

    await _add_timeline(
        db, claim.id, "NEEDS_ADMIN_CLARIFICATION",
        f"Claim submitted to Admin for clarification by officer {current_officer.full_name}: {payload.reason.strip()}",
        current_officer.id,
    )
    await create_audit_log(
        db=db,
        action="REQUEST_ADMIN_CLARIFICATION",
        entity_type="claim",
        entity_id=claim_id,
        user_id=current_officer.id,
        old_value={"status": old_status},
        new_value={"status": "NEEDS_ADMIN_CLARIFICATION", "reason": payload.reason.strip()},
    )
    await db.commit()
    await db.refresh(claim)
    logger.info(f"Claim {claim.claim_number} flagged for Admin clarification by {current_officer.email}")
    return ClaimOut(**_enrich_claim(claim))


@router.post("/{claim_id}/respond-clarification", response_model=ClaimOut)
async def respond_admin_clarification(
    claim_id: str,
    payload: RespondClarificationRequest,
    current_admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin: Review officer's doubt, record instructions, and assign/return claim to officer.
    Sets status back to 'UNDER_OFFICER_REVIEW'.
    """
    from sqlalchemy.orm import selectinload

    if not payload.instructions or not payload.instructions.strip():
        raise HTTPException(status_code=400, detail="Clarification instructions are mandatory")

    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.customer), selectinload(Claim.policy), selectinload(Claim.assigned_officer))
        .where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    target_officer_id = payload.officer_id or claim.assigned_officer_id
    if not target_officer_id:
        raise HTTPException(status_code=400, detail="Please designate an assigned claim officer")

    off_res = await db.execute(
        select(User).where(User.id == target_officer_id, User.role == "CLAIM_OFFICER")
    )
    officer = off_res.scalar_one_or_none()
    if not officer:
        raise HTTPException(status_code=404, detail="Selected claim officer not found")

    old_status = claim.status
    claim.assigned_officer_id = target_officer_id
    claim.status = "UNDER_OFFICER_REVIEW"

    review = ClaimReview(
        claim_id=claim_id,
        officer_id=current_admin.id,
        review_type="CLARIFICATION_RESPONSE",
        remarks=payload.instructions.strip(),
        recommendation="CLARIFIED",
        is_internal=True,
    )
    db.add(review)

    await _add_timeline(
        db, claim.id, "UNDER_OFFICER_REVIEW",
        f"Admin clarification provided: {payload.instructions.strip()}. Returned to officer {officer.full_name}.",
        current_admin.id,
    )
    await create_audit_log(
        db=db,
        action="RESPOND_ADMIN_CLARIFICATION",
        entity_type="claim",
        entity_id=claim_id,
        user_id=current_admin.id,
        old_value={"status": old_status},
        new_value={
            "status": "UNDER_OFFICER_REVIEW",
            "instructions": payload.instructions.strip(),
            "assigned_officer_id": target_officer_id,
        },
    )
    await db.commit()
    await db.refresh(claim)
    logger.info(f"Admin clarification recorded for claim {claim.claim_number}, assigned to {officer.email}")
    return ClaimOut(**_enrich_claim(claim))


# ─── On-Demand AI Document & Risk Verification ─────────────────────────────

@router.post("/{claim_id}/verify-ai")
@router.get("/{claim_id}/ai-verification")
async def verify_claim_ai(
    claim_id: str,
    current_user: User = Depends(get_officer),
    db: AsyncSession = Depends(get_db),
):
    """
    Officer/Admin: Fetch or trigger unified AI Image & Document Verification,
    tampering checks, duplicate hash scans, and multi-factor risk scoring.
    """
    # If GET request and results exist, return them
    verification = await get_latest_ai_verification(claim_id)
    if not verification:
        verification = await run_ai_document_verification(db, claim_id, current_user.id)
    return verification


@router.post("/{claim_id}/run-ai-verification")
async def force_run_ai_verification(
    claim_id: str,
    current_user: User = Depends(get_officer),
    db: AsyncSession = Depends(get_db),
):
    """Officer/Admin: Force re-run comprehensive AI evidence verification."""
    verification = await run_ai_document_verification(db, claim_id, current_user.id)
    return verification


# ─── Admin Decision on Escalated / Reviewed Claims ─────────────────────────

@router.post("/{claim_id}/admin-decision", response_model=ClaimOut)
async def admin_decision(
    claim_id: str,
    payload: AdminDecisionRequest,
    request: Request,
    current_admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin: Review escalated claims, suspicious/uncertain evidence, and make authorized decisions.
    Supports:
    - APPROVE: Approves claim (mandatory reason + approved amount, validated against policy coverage limit)
    - REJECT: Rejects claim (mandatory reason)
    - RETURN_TO_OFFICER: Returns claim to Claim Officer for further investigation (mandatory instructions)
    """
    from sqlalchemy.orm import selectinload

    decision = payload.decision.upper().strip()
    reason = (payload.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Mandatory decision reason / explanation must be provided.")

    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.customer), selectinload(Claim.policy), selectinload(Claim.assigned_officer))
        .where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if claim.status in ("SETTLED", "CLOSED"):
        raise HTTPException(status_code=400, detail=f"Cannot modify a claim in '{claim.status}' status.")

    old_status = claim.status

    if decision == "APPROVE":
        if not payload.approved_amount or payload.approved_amount <= 0:
            raise HTTPException(status_code=400, detail="Approved amount is required and must be greater than zero.")
        if payload.approved_amount > float(claim.policy.coverage_amount or 0):
            raise HTTPException(
                status_code=400,
                detail=f"Approved amount (₹{payload.approved_amount:,.2f}) exceeds policy coverage limit of ₹{float(claim.policy.coverage_amount):,.2f}.",
            )
        claim.status = "APPROVED"
        claim.approved_amount = payload.approved_amount
        claim.approval_notes = reason

        review = ClaimReview(
            claim_id=claim_id,
            officer_id=current_admin.id,
            review_type="ADMIN_DECISION",
            remarks=f"Admin Approved: {reason}",
            recommendation="APPROVE",
            is_internal=True,
        )
        db.add(review)

        await _add_timeline(
            db, claim.id, "APPROVED",
            f"Claim approved by Admin {current_admin.full_name} for ₹{payload.approved_amount:,.2f}. Notes: {reason}",
            current_admin.id,
        )
        await notify_claim_approved(db, claim, claim.customer_id)
        action_name = "ADMIN_APPROVE_CLAIM"

    elif decision == "REJECT":
        claim.status = "REJECTED"
        claim.rejection_reason = reason

        review = ClaimReview(
            claim_id=claim_id,
            officer_id=current_admin.id,
            review_type="ADMIN_DECISION",
            remarks=f"Admin Rejected: {reason}",
            recommendation="REJECT",
            is_internal=True,
        )
        db.add(review)

        await _add_timeline(
            db, claim.id, "REJECTED",
            f"Claim rejected by Admin {current_admin.full_name}. Reason: {reason}",
            current_admin.id,
        )
        await notify_claim_rejected(db, claim, claim.customer_id)
        action_name = "ADMIN_REJECT_CLAIM"

    elif decision == "RETURN_TO_OFFICER":
        target_officer_id = payload.assigned_officer_id or claim.assigned_officer_id
        if not target_officer_id:
            raise HTTPException(status_code=400, detail="Assigned claim officer must be designated to return claim.")

        off_res = await db.execute(
            select(User).where(User.id == target_officer_id, User.role == "CLAIM_OFFICER")
        )
        officer = off_res.scalar_one_or_none()
        if not officer:
            raise HTTPException(status_code=404, detail="Designated claim officer not found.")

        claim.status = "UNDER_OFFICER_REVIEW"
        claim.assigned_officer_id = target_officer_id

        review = ClaimReview(
            claim_id=claim_id,
            officer_id=current_admin.id,
            review_type="INVESTIGATION_RETURN",
            remarks=f"Admin returned claim for further investigation: {reason}",
            recommendation="FURTHER_INVESTIGATION_REQUIRED",
            is_internal=True,
        )
        db.add(review)

        await _add_timeline(
            db, claim.id, "UNDER_OFFICER_REVIEW",
            f"Admin {current_admin.full_name} returned claim to officer {officer.full_name} for further investigation: {reason}",
            current_admin.id,
        )
        action_name = "ADMIN_RETURN_FOR_INVESTIGATION"

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid decision '{decision}'. Expected APPROVE, REJECT, or RETURN_TO_OFFICER.",
        )

    await create_audit_log(
        db=db,
        action=action_name,
        entity_type="claim",
        entity_id=claim_id,
        user_id=current_admin.id,
        old_value={"status": old_status},
        new_value={"status": claim.status, "decision": decision, "reason": reason},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    await db.refresh(claim)
    logger.info(f"Admin decision '{decision}' executed for claim {claim.claim_number} by {current_admin.email}")
    enriched = await _attach_verification_scores_batch([claim], db)
    return ClaimOut(**enriched[0])


# ─── Approve / Reject (Officer & Admin) ──────────────────────────────────────

@router.post("/{claim_id}/approve", response_model=ClaimOut)
async def approve_claim(
    claim_id: str,
    payload: ApproveClaimRequest,
    request: Request,
    current_reviewer: User = Depends(get_officer),
    db: AsyncSession = Depends(get_db),
):
    """
    Officer/Admin: Approve a claim.
    Officers cannot approve claims escalated for Admin review.
    Enforces policy coverage limit.
    """
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.customer), selectinload(Claim.policy), selectinload(Claim.assigned_officer))
        .where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if claim.status in ("APPROVED", "SETTLED", "CLOSED"):
        raise HTTPException(status_code=400, detail=f"Claim is already {claim.status}")

    if claim.status == "REJECTED":
        raise HTTPException(status_code=400, detail="A rejected claim cannot be approved")

    # Officers cannot bypass required Admin review for escalated claims
    if claim.status in ("ADMIN_REVIEW_REQUIRED", "UNDER_FRAUD_REVIEW", "NEEDS_ADMIN_CLARIFICATION"):
        if current_reviewer.role != "ADMIN":
            raise HTTPException(
                status_code=403,
                detail="This claim has been escalated for Admin review. Claim Officers cannot approve escalated claims without Admin clearance.",
            )

    # Validate against policy coverage limit
    if payload.approved_amount > float(claim.policy.coverage_amount or 0):
        raise HTTPException(
            status_code=400,
            detail=f"Approved amount (₹{payload.approved_amount:,.2f}) cannot exceed policy coverage limit of ₹{float(claim.policy.coverage_amount):,.2f}.",
        )

    old_status = claim.status
    claim.status = "APPROVED"
    claim.approved_amount = payload.approved_amount
    claim.approval_notes = payload.approval_notes

    await _add_timeline(
        db, claim.id, "APPROVED",
        f"Claim approved by {current_reviewer.full_name} for ₹{payload.approved_amount:,.2f}."
        + (f" Notes: {payload.approval_notes}" if payload.approval_notes else ""),
        current_reviewer.id,
    )
    await notify_claim_approved(db, claim, claim.customer_id)
    await create_audit_log(
        db=db,
        action="APPROVE_CLAIM",
        entity_type="claim",
        entity_id=claim_id,
        user_id=current_reviewer.id,
        old_value={"status": old_status},
        new_value={"status": "APPROVED", "approved_amount": payload.approved_amount},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    await db.refresh(claim)
    logger.info(f"Claim approved: {claim.claim_number} amount={payload.approved_amount}")
    enriched = await _attach_verification_scores_batch([claim], db)
    return ClaimOut(**enriched[0])


@router.post("/{claim_id}/reject", response_model=ClaimOut)
async def reject_claim(
    claim_id: str,
    payload: RejectClaimRequest,
    request: Request,
    current_reviewer: User = Depends(get_officer),
    db: AsyncSession = Depends(get_db),
):
    """Officer/Admin: Reject a claim with mandatory remarks."""
    from sqlalchemy.orm import selectinload

    if not payload.rejection_reason or not payload.rejection_reason.strip():
        raise HTTPException(status_code=400, detail="Rejection reason is mandatory")

    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.customer), selectinload(Claim.policy), selectinload(Claim.assigned_officer))
        .where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if claim.status in ("REJECTED", "SETTLED", "CLOSED"):
        raise HTTPException(status_code=400, detail=f"Claim is already {claim.status}")

    old_status = claim.status
    claim.status = "REJECTED"
    claim.rejection_reason = payload.rejection_reason.strip()

    await _add_timeline(
        db, claim.id, "REJECTED",
        f"Claim rejected by {current_reviewer.full_name}. Reason: {payload.rejection_reason.strip()}",
        current_reviewer.id,
    )
    await notify_claim_rejected(db, claim, claim.customer_id)
    await create_audit_log(
        db=db,
        action="REJECT_CLAIM",
        entity_type="claim",
        entity_id=claim_id,
        user_id=current_reviewer.id,
        old_value={"status": old_status},
        new_value={"status": "REJECTED", "rejection_reason": payload.rejection_reason.strip()},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    await db.refresh(claim)
    logger.info(f"Claim rejected: {claim.claim_number}")
    enriched = await _attach_verification_scores_batch([claim], db)
    return ClaimOut(**enriched[0])


# ─── Delete Draft Claim ───────────────────────────────────────────────────────

@router.delete("/{claim_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_claim(
    claim_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Customer: Delete a draft claim."""
    result = await db.execute(select(Claim).where(Claim.id == claim_id))
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if current_user.role == "CUSTOMER" and claim.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if claim.status != "DRAFT":
        raise HTTPException(status_code=400, detail="Only draft claims can be deleted")

    await db.delete(claim)
    await db.commit()


# ─── Claim AI Analysis & Risk Score Aliases ──────────────────────────────────

@router.get("/{claim_id}/ai-analysis")
async def get_claim_ai_analysis(
    claim_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve all stored AI summaries and analyses for this claim from MongoDB."""
    result = await db.execute(select(Claim).where(Claim.id == claim_id))
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if current_user.role == "CUSTOMER" and claim.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    from app.database.mongodb import get_mongo_db
    mongo_db = get_mongo_db()
    cursor = mongo_db["ai_analysis"].find({"claim_id": claim_id}).sort("created_at", -1)
    analyses = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        analyses.append(doc)

    return {"claim_id": claim_id, "analyses": analyses}


@router.get("/{claim_id}/fraud-score")
async def get_claim_fraud_score(
    claim_id: str,
    current_user: User = Depends(get_officer),
    db: AsyncSession = Depends(get_db),
):
    """Officer/Admin: Retrieve or compute latest transparent risk score for a claim."""
    from sqlalchemy.orm import selectinload
    from app.services.risk_service import evaluate_claim_risk

    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.policy), selectinload(Claim.customer))
        .where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    risk_assessment = await evaluate_claim_risk(db, claim, claim.policy)
    claim.fraud_score = risk_assessment["fraud_probability"]
    claim.risk_level = risk_assessment["risk_level"]
    await db.commit()
    return risk_assessment
