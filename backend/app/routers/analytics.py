from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from datetime import datetime, date, timezone, timedelta

from app.core.dependencies import get_admin
from app.database.postgres import get_db
from app.models.claim import Claim
from app.models.policy import Policy
from app.models.user import User
from app.models.settlement import Settlement
from app.models.audit_log import AuditLog
from app.schemas.analytics import (
    DashboardStats, ClaimsAnalytics, FraudAnalytics, SettlementAnalytics, AuditLogListResponse, AuditLogOut
)

router = APIRouter(prefix="/api/admin", tags=["Admin Analytics"])


@router.get("/analytics/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(
    _: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Get system-wide dashboard statistics."""
    today = date.today()

    total_customers = (
        await db.execute(select(func.count(User.id)).where(User.role == "CUSTOMER"))
    ).scalar() or 0

    active_policies = (
        await db.execute(select(func.count(Policy.id)).where(Policy.status == "ACTIVE"))
    ).scalar() or 0

    claims_today = (
        await db.execute(
            select(func.count(Claim.id)).where(
                func.date(Claim.created_at) == today
            )
        )
    ).scalar() or 0

    total_claims = (await db.execute(select(func.count(Claim.id)))).scalar() or 0

    pending_claims = (
        await db.execute(
            select(func.count(Claim.id)).where(
                Claim.status.in_(["SUBMITTED", "UNDER_OFFICER_REVIEW", "APPROVAL_PENDING"])
            )
        )
    ).scalar() or 0

    approved_claims = (
        await db.execute(
            select(func.count(Claim.id)).where(Claim.status.in_(["APPROVED", "SETTLED"]))
        )
    ).scalar() or 0

    rejected_claims = (
        await db.execute(select(func.count(Claim.id)).where(Claim.status == "REJECTED"))
    ).scalar() or 0

    fraud_alerts = (
        await db.execute(
            select(func.count(Claim.id)).where(Claim.risk_level.in_(["HIGH", "VERY_HIGH"]))
        )
    ).scalar() or 0

    settlement_pending = (
        await db.execute(
            select(func.count(Settlement.id)).where(Settlement.payment_status == "PENDING")
        )
    ).scalar() or 0

    total_paid_result = await db.execute(
        select(func.sum(Settlement.payment_amount)).where(Settlement.payment_status == "COMPLETED")
    )
    total_paid = float(total_paid_result.scalar() or 0)

    return DashboardStats(
        total_customers=total_customers,
        active_policies=active_policies,
        claims_today=claims_today,
        total_claims=total_claims,
        pending_claims=pending_claims,
        approved_claims=approved_claims,
        rejected_claims=rejected_claims,
        fraud_alerts=fraud_alerts,
        settlement_pending=settlement_pending,
        total_paid_amount=total_paid,
    )


@router.get("/analytics/claims", response_model=ClaimsAnalytics)
async def get_claims_analytics(
    _: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Claims analytics breakdown."""
    # Status distribution
    status_result = await db.execute(
        select(Claim.status, func.count(Claim.id)).group_by(Claim.status)
    )
    by_status = [{"status": row[0], "count": row[1]} for row in status_result.all()]

    # Type distribution
    type_result = await db.execute(
        select(Claim.incident_type, func.count(Claim.id)).group_by(Claim.incident_type)
    )
    by_type = [{"type": row[0], "count": row[1]} for row in type_result.all()]

    # Monthly (last 6 months)
    month_result = await db.execute(
        select(
            func.to_char(Claim.created_at, "YYYY-MM").label("month"),
            func.count(Claim.id).label("count"),
        ).group_by("month").order_by("month").limit(12)
    )
    by_month = [{"month": row[0], "count": row[1]} for row in month_result.all()]

    # Rates
    total = (await db.execute(select(func.count(Claim.id)))).scalar() or 1
    approved = (
        await db.execute(
            select(func.count(Claim.id)).where(Claim.status.in_(["APPROVED", "SETTLED", "CLOSED"]))
        )
    ).scalar() or 0
    rejected = (
        await db.execute(select(func.count(Claim.id)).where(Claim.status == "REJECTED"))
    ).scalar() or 0

    return ClaimsAnalytics(
        claims_by_month=by_month,
        claims_by_type=by_type,
        claims_by_status=by_status,
        approval_rate=round((approved / total) * 100, 1),
        rejection_rate=round((rejected / total) * 100, 1),
        avg_processing_days=3.5,  # Placeholder; compute from timeline in production
    )


@router.get("/analytics/fraud", response_model=FraudAnalytics)
async def get_fraud_analytics(
    _: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Fraud risk analytics."""
    result = await db.execute(
        select(Claim.risk_level, func.count(Claim.id))
        .where(Claim.risk_level.isnot(None))
        .group_by(Claim.risk_level)
    )
    by_risk = [{"risk_level": row[0], "count": row[1]} for row in result.all()]

    total_fraud = (
        await db.execute(
            select(func.count(Claim.id)).where(Claim.risk_level.in_(["HIGH", "VERY_HIGH"]))
        )
    ).scalar() or 0

    high_risk_result = await db.execute(
        select(Claim.id).where(Claim.risk_level.in_(["HIGH", "VERY_HIGH"])).limit(20)
    )
    high_risk_ids = [str(row[0]) for row in high_risk_result.all()]

    return FraudAnalytics(
        fraud_alerts_total=total_fraud,
        by_risk_level=by_risk,
        high_risk_claim_ids=high_risk_ids,
    )


@router.get("/analytics/settlements", response_model=SettlementAnalytics)
async def get_settlement_analytics(
    _: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Settlement analytics."""
    total_settlements = (await db.execute(select(func.count(Settlement.id)))).scalar() or 0
    total_paid_result = await db.execute(
        select(func.sum(Settlement.payment_amount)).where(Settlement.payment_status == "COMPLETED")
    )
    total_paid = float(total_paid_result.scalar() or 0)

    pending_result = await db.execute(
        select(func.sum(Settlement.payment_amount)).where(Settlement.payment_status == "PENDING")
    )
    pending_amount = float(pending_result.scalar() or 0)

    avg_result = await db.execute(select(func.avg(Settlement.payment_amount)))
    avg_amount = float(avg_result.scalar() or 0)

    completed = (
        await db.execute(
            select(func.count(Settlement.id)).where(Settlement.payment_status == "COMPLETED")
        )
    ).scalar() or 0

    return SettlementAnalytics(
        total_settlements=total_settlements,
        total_paid=total_paid,
        pending_amount=pending_amount,
        avg_settlement_amount=avg_amount,
        success_rate=round((completed / max(total_settlements, 1)) * 100, 1),
    )


@router.get("/audit-logs", response_model=AuditLogListResponse)
async def get_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    action: str | None = Query(None),
    entity_type: str | None = Query(None),
    _: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: Get system audit logs."""
    from sqlalchemy.orm import selectinload

    query = select(AuditLog).options(selectinload(AuditLog.user))
    if action:
        query = query.where(AuditLog.action.ilike(f"%{action}%"))
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()
    query = query.order_by(AuditLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    logs = result.scalars().all()

    log_outs = []
    for log in logs:
        log_out = AuditLogOut(
            id=log.id,
            user_id=log.user_id,
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            old_value=log.old_value,
            new_value=log.new_value,
            ip_address=log.ip_address,
            user_agent=log.user_agent,
            created_at=log.created_at,
            user_name=log.user.full_name if log.user else None,
        )
        log_outs.append(log_out)

    return AuditLogListResponse(logs=log_outs, total=total, page=page, page_size=page_size)
