from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.dependencies import get_current_user, get_admin, get_officer
from app.core.security import encrypt_sensitive_data
from app.database.postgres import get_db
from app.models.claim import Claim
from app.models.settlement import Settlement
from app.models.user import User
from app.schemas.settlement import (
    SettlementCreate, SettlementUpdate, SettlementOut, SettlementListResponse
)
from app.services.audit_service import create_audit_log
from app.services.notification_service import notify_settlement_completed
from app.core.logging_config import get_logger

router = APIRouter(prefix="/api/settlements", tags=["Settlements"])
logger = get_logger(__name__)


def _enrich_settlement(s: Settlement) -> dict:
    data = {col.name: getattr(s, col.name) for col in s.__table__.columns}
    data["claim_number"] = s.claim.claim_number if s.claim else None
    data["customer_name"] = s.claim.customer.full_name if s.claim and s.claim.customer else None
    return data


@router.post("", response_model=SettlementOut, status_code=status.HTTP_201_CREATED)
async def create_settlement(
    payload: SettlementCreate,
    current_user: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Create a settlement for an approved claim."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.customer), selectinload(Claim.settlement))
        .where(Claim.id == payload.claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if claim.status != "APPROVED":
        raise HTTPException(
            status_code=400, detail=f"Only approved claims can be settled. Current status: {claim.status}"
        )

    if claim.settlement:
        raise HTTPException(status_code=400, detail="Settlement already exists for this claim")

    # Encrypt bank account if provided
    encrypted_account = None
    if payload.bank_account:
        encrypted_account = encrypt_sensitive_data(payload.bank_account)

    settlement = Settlement(
        claim_id=payload.claim_id,
        approved_amount=float(claim.approved_amount),
        payment_amount=payload.payment_amount,
        payment_method=payload.payment_method,
        bank_account_encrypted=encrypted_account,
        processed_by=current_user.id,
        processed_at=datetime.now(timezone.utc),
    )
    db.add(settlement)
    claim.status = "SETTLEMENT_PENDING"

    await create_audit_log(
        db=db,
        action="CREATE_SETTLEMENT",
        entity_type="settlement",
        entity_id=None,
        user_id=current_user.id,
        new_value={"claim_id": payload.claim_id, "payment_amount": payload.payment_amount},
    )
    await db.flush()
    await db.commit()
    await db.refresh(settlement)

    # Re-load with relationships
    result2 = await db.execute(
        select(Settlement)
        .options(selectinload(Settlement.claim).selectinload(Claim.customer))
        .where(Settlement.id == settlement.id)
    )
    settlement = result2.scalar_one()
    logger.info(f"Settlement created for claim {claim.claim_number}")
    return SettlementOut(**_enrich_settlement(settlement))


@router.get("/eligible-claims")
async def list_eligible_claims(
    current_user: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: List approved claims that need a settlement payout created."""
    from sqlalchemy.orm import selectinload
    from app.schemas.claim import ClaimOut
    from app.routers.claims import _enrich_claim

    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.customer), selectinload(Claim.policy), selectinload(Claim.settlement))
        .where(Claim.status.in_(["APPROVED", "SETTLEMENT_PENDING"]))
    )
    claims = result.scalars().all()
    # Filter only those where no settlement exists or payment not completed
    eligible = [
        {
            **_enrich_claim(c),
            "has_settlement": c.settlement is not None,
            "settlement_id": c.settlement.id if c.settlement else None,
            "settlement_status": c.settlement.payment_status if c.settlement else None,
        }
        for c in claims
    ]
    return eligible


@router.get("", response_model=SettlementListResponse)
async def list_settlements(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    payment_status: str | None = Query(None),
    current_user: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: List all settlements."""
    from sqlalchemy.orm import selectinload

    query = select(Settlement).options(
        selectinload(Settlement.claim).selectinload(Claim.customer)
    )
    if payment_status:
        query = query.where(Settlement.payment_status == payment_status)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()
    query = query.order_by(Settlement.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    settlements = result.scalars().all()

    return SettlementListResponse(
        settlements=[SettlementOut(**_enrich_settlement(s)) for s in settlements],
        total=total, page=page, page_size=page_size,
    )


@router.get("/{settlement_id}", response_model=SettlementOut)
async def get_settlement(
    settlement_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get settlement details (authorized users)."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Settlement)
        .options(selectinload(Settlement.claim).selectinload(Claim.customer))
        .where(Settlement.id == settlement_id)
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Settlement not found")

    if current_user.role == "CUSTOMER" and s.claim and s.claim.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return SettlementOut(**_enrich_settlement(s))


@router.put("/{settlement_id}", response_model=SettlementOut)
async def update_settlement(
    settlement_id: str,
    payload: SettlementUpdate,
    current_user: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Update settlement payment details."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Settlement)
        .options(selectinload(Settlement.claim).selectinload(Claim.customer))
        .where(Settlement.id == settlement_id)
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Settlement not found")

    if s.payment_status == "COMPLETED":
        raise HTTPException(status_code=400, detail="Settlement already completed")

    update_data = payload.model_dump(exclude_none=True)
    for key, value in update_data.items():
        setattr(s, key, value)

    if payload.payment_status == "PROCESSING":
        s.claim.status = "SETTLEMENT_PROCESSING"

    await db.commit()
    await db.refresh(s)
    return SettlementOut(**_enrich_settlement(s))


@router.post("/{settlement_id}/complete", response_model=SettlementOut)
async def complete_settlement(
    settlement_id: str,
    current_user: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Mark settlement as completed."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Settlement)
        .options(selectinload(Settlement.claim).selectinload(Claim.customer))
        .where(Settlement.id == settlement_id)
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Settlement not found")

    if s.payment_status == "COMPLETED":
        raise HTTPException(status_code=400, detail="Settlement already completed")

    s.payment_status = "COMPLETED"
    s.completed_at = datetime.now(timezone.utc)
    s.claim.status = "SETTLED"

    await notify_settlement_completed(db, s.claim, s.claim.customer_id)
    await create_audit_log(
        db=db,
        action="COMPLETE_SETTLEMENT",
        entity_type="settlement",
        entity_id=settlement_id,
        user_id=current_user.id,
    )
    await db.commit()
    await db.refresh(s)
    logger.info(f"Settlement completed: {settlement_id}")
    return SettlementOut(**_enrich_settlement(s))
