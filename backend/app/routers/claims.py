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
)
from app.services.audit_service import create_audit_log, get_client_ip
from app.services.notification_service import (
    notify_claim_submitted, notify_claim_approved,
    notify_claim_rejected, notify_document_requested,
)
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List claims — filtered by role."""
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

    if claim_status:
        query = query.where(Claim.status == claim_status)
    if incident_type:
        query = query.where(Claim.incident_type == incident_type)
    if risk_level:
        query = query.where(Claim.risk_level == risk_level)
    if search:
        query = query.where(Claim.claim_number.ilike(f"%{search}%"))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar()

    query = query.order_by(Claim.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    claims = result.scalars().all()

    return ClaimListResponse(
        claims=[ClaimOut(**_enrich_claim(c)) for c in claims],
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
    """Get claim details."""
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

    return ClaimOut(**_enrich_claim(claim))


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
    """Officer: Escalate a claim for fraud investigation."""
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
        review_type="ESCALATION",
        remarks=payload.remarks,
        recommendation="ESCALATE",
        is_internal=True,
    )
    db.add(review)

    claim.status = "UNDER_FRAUD_REVIEW"
    await _add_timeline(
        db, claim.id, "UNDER_FRAUD_REVIEW",
        f"Claim escalated for fraud investigation by officer {current_officer.full_name}.",
        current_officer.id,
    )
    await db.commit()
    await db.refresh(claim)
    return ClaimOut(**_enrich_claim(claim))


# ─── Approve / Reject (Officer & Admin) ──────────────────────────────────────

@router.post("/{claim_id}/approve", response_model=ClaimOut)
async def approve_claim(
    claim_id: str,
    payload: ApproveClaimRequest,
    request: Request,
    current_reviewer: User = Depends(get_officer),
    db: AsyncSession = Depends(get_db),
):
    """Officer/Admin: Approve a claim."""
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

    old_status = claim.status
    claim.status = "APPROVED"
    claim.approved_amount = payload.approved_amount
    claim.approval_notes = payload.approval_notes

    await _add_timeline(
        db, claim.id, "APPROVED",
        f"Claim approved by {current_reviewer.full_name} for ₹{payload.approved_amount:,.2f}.",
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
    return ClaimOut(**_enrich_claim(claim))


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
    claim.rejection_reason = payload.rejection_reason

    await _add_timeline(
        db, claim.id, "REJECTED",
        f"Claim rejected by {current_reviewer.full_name}. Reason: {payload.rejection_reason}",
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
        new_value={"status": "REJECTED", "rejection_reason": payload.rejection_reason},
        ip_address=get_client_ip(request),
    )
    await db.commit()
    await db.refresh(claim)
    logger.info(f"Claim rejected: {claim.claim_number}")
    return ClaimOut(**_enrich_claim(claim))


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
