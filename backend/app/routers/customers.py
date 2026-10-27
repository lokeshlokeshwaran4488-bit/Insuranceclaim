import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.dependencies import get_admin, get_current_user
from app.core.security import get_password_hash
from app.database.postgres import get_db
from app.database.mongodb import get_mongo_db
from app.models.user import User
from app.schemas.user import UserOut
from app.schemas.customer import CustomerCreate, CustomerListResponse
from app.services.audit_service import create_audit_log
from app.core.logging_config import get_logger

router = APIRouter(prefix="/api/customers", tags=["Customers"])
logger = get_logger(__name__)


@router.get("", response_model=CustomerListResponse)
async def list_customers(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: str | None = Query(None),
    _: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: List registered customers with search and pagination."""
    query = select(User).where(User.role == "CUSTOMER")
    if search:
        search_filter = f"%{search}%"
        query = query.where(
            User.full_name.ilike(search_filter) | User.email.ilike(search_filter)
        )

    # Count total customers matching query
    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar() or 0

    # Sort latest first, paginate
    query = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    customers = result.scalars().all()

    # Calculate claim counts for each customer
    from app.models.claim import Claim
    cust_ids = [c.id for c in customers]
    claim_counts: dict[str, int] = {}
    if cust_ids:
        counts_res = await db.execute(
            select(Claim.customer_id, func.count(Claim.id))
            .where(Claim.customer_id.in_(cust_ids))
            .group_by(Claim.customer_id)
        )
        claim_counts = dict(counts_res.all())

    customer_out_list = []
    for c in customers:
        u_dict = {
            "id": c.id,
            "full_name": c.full_name,
            "email": c.email,
            "phone": c.phone,
            "role": c.role,
            "is_active": c.is_active,
            "address": c.address,
            "profile_picture_url": c.profile_picture_url,
            "created_at": c.created_at,
            "updated_at": c.updated_at,
            "total_claims": claim_counts.get(c.id, 0),
        }
        customer_out_list.append(UserOut(**u_dict))

    return CustomerListResponse(
        customers=customer_out_list,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_customer(
    payload: CustomerCreate,
    current_admin: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Create a new customer, save in PostgreSQL and MongoDB."""
    # 1. Check duplicate email in PostgreSQL
    existing_pg = await db.execute(select(User).where(User.email == payload.email))
    if existing_pg.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists",
        )

    # 2. Check duplicate email in MongoDB
    try:
        mongo_db = get_mongo_db()
        existing_mongo = await mongo_db["customers"].find_one({"email": payload.email})
        if existing_mongo:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists",
            )
    except Exception as mongo_check_err:
        logger.warning(f"MongoDB duplicate pre-check warning: {mongo_check_err}")

    # 3. Securely hash password using bcrypt
    password_hash = get_password_hash(payload.password)
    now = datetime.now(timezone.utc)
    new_user_id = str(uuid.uuid4())

    # 4. Create and save in PostgreSQL
    new_customer = User(
        id=new_user_id,
        full_name=payload.full_name,
        email=payload.email,
        password_hash=password_hash,
        phone=payload.phone,
        address=payload.address,
        role="CUSTOMER",
        is_active=True,
    )
    db.add(new_customer)
    await db.flush()

    # 5. Create Audit Log
    await create_audit_log(
        db=db,
        action="CREATE_CUSTOMER",
        entity_type="customer",
        entity_id=new_customer.id,
        user_id=current_admin.id,
        new_value={
            "email": payload.email,
            "full_name": payload.full_name,
            "role": "CUSTOMER",
        },
    )
    await db.commit()
    await db.refresh(new_customer)

    # 6. Save customer document to MongoDB
    try:
        mongo_db = get_mongo_db()
        customer_doc = {
            "id": new_customer.id,
            "full_name": new_customer.full_name,
            "email": new_customer.email,
            "phone": new_customer.phone,
            "address": new_customer.address,
            "role": "CUSTOMER",
            "is_active": new_customer.is_active,
            "password_hash": new_customer.password_hash,
            "created_at": new_customer.created_at.isoformat() if new_customer.created_at else now.isoformat(),
            "updated_at": new_customer.updated_at.isoformat() if new_customer.updated_at else now.isoformat(),
        }
        await mongo_db["customers"].update_one(
            {"id": new_customer.id},
            {"$set": customer_doc},
            upsert=True,
        )
        await mongo_db["users"].update_one(
            {"id": new_customer.id},
            {"$set": customer_doc},
            upsert=True,
        )
        logger.info(f"Customer {new_customer.email} saved to MongoDB successfully.")
    except Exception as mongo_err:
        logger.error(f"Failed to persist customer to MongoDB: {mongo_err}")
        # Note: PostgreSQL commit has succeeded.

    return new_customer


@router.get("/{customer_id}", response_model=UserOut)
async def get_customer(
    customer_id: str,
    _: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Get customer details by ID."""
    result = await db.execute(
        select(User).where((User.id == customer_id) & (User.role == "CUSTOMER"))
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found",
        )
    return customer


@router.get("/{customer_id}/details")
async def get_customer_full_details(
    customer_id: str,
    _: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Get comprehensive customer profile, policies, claims history, timelines, and document requests."""
    from sqlalchemy.orm import selectinload
    from app.models.claim import Claim
    from app.models.policy import Policy

    # 1. Fetch customer
    result = await db.execute(
        select(User).where((User.id == customer_id) & (User.role == "CUSTOMER"))
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found",
        )

    # 2. Fetch policies
    pol_res = await db.execute(
        select(Policy).where(Policy.customer_id == customer_id).order_by(Policy.created_at.desc())
    )
    policies = pol_res.scalars().all()

    # 3. Fetch claims with all related details
    claims_res = await db.execute(
        select(Claim)
        .options(
            selectinload(Claim.policy),
            selectinload(Claim.assigned_officer),
            selectinload(Claim.timeline),
            selectinload(Claim.document_requests),
            selectinload(Claim.reviews),
            selectinload(Claim.settlement),
        )
        .where(Claim.customer_id == customer_id)
        .order_by(Claim.created_at.desc())
    )
    claims = claims_res.scalars().all()

    # Format claims list
    formatted_claims = []
    newly_submitted = []
    under_processing = []
    awaiting_docs = []
    approved_claims = []
    rejected_claims = []
    settled_claims = []

    total_requested = 0.0
    total_approved = 0.0

    for c in claims:
        req_amt = float(c.requested_amount or 0)
        app_amt = float(c.approved_amount or 0)
        total_requested += req_amt
        total_approved += app_amt

        c_dict = {
            "id": c.id,
            "claim_number": c.claim_number,
            "policy_id": c.policy_id,
            "policy_number": c.policy.policy_number if c.policy else None,
            "policy_type": c.policy.policy_type if c.policy else None,
            "incident_type": c.incident_type,
            "incident_date": c.incident_date.isoformat() if c.incident_date else None,
            "incident_time": str(c.incident_time) if c.incident_time else None,
            "incident_location": c.incident_location,
            "description": c.description,
            "requested_amount": req_amt,
            "approved_amount": app_amt if c.approved_amount is not None else None,
            "status": c.status,
            "fraud_score": float(c.fraud_score) if c.fraud_score is not None else None,
            "risk_level": c.risk_level,
            "assigned_officer_id": c.assigned_officer_id,
            "officer_name": c.assigned_officer.full_name if c.assigned_officer else None,
            "rejection_reason": c.rejection_reason,
            "approval_notes": c.approval_notes,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            "settlement": {
                "id": c.settlement.id,
                "payment_amount": float(c.settlement.payment_amount),
                "payment_status": c.settlement.payment_status,
                "payment_method": c.settlement.payment_method,
                "payment_reference": c.settlement.payment_reference,
            } if c.settlement else None,
            "timeline": [
                {
                    "id": t.id,
                    "status": t.status,
                    "description": t.description,
                    "created_at": t.created_at.isoformat() if t.created_at else None,
                }
                for t in c.timeline
            ],
            "document_requests": [
                {
                    "id": dr.id,
                    "message": dr.message,
                    "document_types": dr.document_types,
                    "is_fulfilled": dr.is_fulfilled,
                    "created_at": dr.created_at.isoformat() if dr.created_at else None,
                }
                for dr in c.document_requests
            ],
            "reviews": [
                {
                    "id": r.id,
                    "review_type": r.review_type,
                    "remarks": r.remarks,
                    "recommendation": r.recommendation,
                    "is_internal": r.is_internal,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in c.reviews
            ],
        }

        formatted_claims.append(c_dict)

        if c.status in ("SUBMITTED", "DRAFT"):
            newly_submitted.append(c_dict)
        elif c.status in ("UNDER_OFFICER_REVIEW", "UNDER_VERIFICATION", "AI_ANALYSIS_COMPLETED", "NEEDS_ADMIN_CLARIFICATION", "APPROVAL_PENDING", "UNDER_FRAUD_REVIEW"):
            under_processing.append(c_dict)
        elif c.status in ("ADDITIONAL_DOCUMENTS_REQUIRED", "DOCUMENTS_PENDING", "DOCUMENTS_RECEIVED"):
            awaiting_docs.append(c_dict)
        elif c.status in ("APPROVED", "SETTLEMENT_PENDING", "SETTLEMENT_PROCESSING"):
            approved_claims.append(c_dict)
        elif c.status == "REJECTED":
            rejected_claims.append(c_dict)
        elif c.status in ("SETTLED", "CLOSED"):
            settled_claims.append(c_dict)

    return {
        "customer": {
            "id": customer.id,
            "full_name": customer.full_name,
            "email": customer.email,
            "phone": customer.phone,
            "address": customer.address,
            "role": customer.role,
            "is_active": customer.is_active,
            "created_at": customer.created_at.isoformat() if customer.created_at else None,
            "total_claims": len(claims),
        },
        "policies": [
            {
                "id": p.id,
                "policy_number": p.policy_number,
                "policy_type": p.policy_type,
                "coverage_amount": float(p.coverage_amount),
                "premium_amount": float(p.premium_amount),
                "deductible_amount": float(p.deductible_amount),
                "start_date": p.start_date.isoformat() if p.start_date else None,
                "expiry_date": p.expiry_date.isoformat() if p.expiry_date else None,
                "status": p.status,
            }
            for p in policies
        ],
        "claims": formatted_claims,
        "categorized": {
            "newly_submitted": newly_submitted,
            "under_processing": under_processing,
            "awaiting_documents": awaiting_docs,
            "approved": approved_claims,
            "rejected": rejected_claims,
            "settled": settled_claims,
        },
        "summary": {
            "total_claims": len(claims),
            "newly_submitted_count": len(newly_submitted),
            "under_processing_count": len(under_processing),
            "awaiting_documents_count": len(awaiting_docs),
            "approved_count": len(approved_claims),
            "rejected_count": len(rejected_claims),
            "settled_count": len(settled_claims),
            "total_requested_amount": total_requested,
            "total_approved_amount": total_approved,
        },
    }
