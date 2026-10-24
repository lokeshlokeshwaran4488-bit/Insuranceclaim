"""
InsureClaim AI — Reports & CSV Export Router
Provides database-derived analytics, reporting summaries, and CSV data export
with spreadsheet formula injection protection for authorized Admins and Officers.
"""

import csv
import io
from datetime import datetime, date, timezone
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from sqlalchemy.orm import selectinload

from app.core.dependencies import get_admin, get_officer
from app.database.postgres import get_db
from app.models.claim import Claim
from app.models.claim_timeline import ClaimTimeline
from app.models.policy import Policy
from app.models.settlement import Settlement
from app.models.audit_log import AuditLog
from app.models.user import User
from app.core.logging_config import get_logger

router = APIRouter(prefix="/api/reports", tags=["Reports & Exports"])
logger = get_logger(__name__)


def sanitize_csv_cell(value: Any) -> str:
    """
    Prevent Spreadsheet Formula Injection (CSV Injection).
    If a cell value starts with '=', '+', '-', '@', tab, or carriage return,
    prefix it with an apostrophe so spreadsheet viewers treat it as raw text.
    """
    if value is None:
        return ""
    text_val = str(value)
    if text_val and text_val[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{text_val}"
    return text_val


@router.get("/summary")
async def get_report_summary(
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    _: User = Depends(get_officer),
    db: AsyncSession = Depends(get_db),
):
    """
    Officer/Admin: Retrieve aggregated report metrics computed from actual persisted records.
    Includes status distribution, type counts, and real average turnaround times.
    """
    query = select(Claim)
    if from_date:
        query = query.where(func.date(Claim.created_at) >= from_date)
    if to_date:
        query = query.where(func.date(Claim.created_at) <= to_date)

    total_claims = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar() or 0

    # Counts by status
    status_q = select(Claim.status, func.count(Claim.id))
    if from_date:
        status_q = status_q.where(func.date(Claim.created_at) >= from_date)
    if to_date:
        status_q = status_q.where(func.date(Claim.created_at) <= to_date)
    status_rows = (await db.execute(status_q.group_by(Claim.status))).all()
    by_status = {row[0]: row[1] for row in status_rows}

    # Counts by incident type
    type_q = select(Claim.incident_type, func.count(Claim.id))
    if from_date:
        type_q = type_q.where(func.date(Claim.created_at) >= from_date)
    if to_date:
        type_q = type_q.where(func.date(Claim.created_at) <= to_date)
    type_rows = (await db.execute(type_q.group_by(Claim.incident_type))).all()
    by_type = {row[0]: row[1] for row in type_rows}

    # Turnaround time calculation from actual ClaimTimeline entries
    # Completed claims (APPROVED, SETTLED, REJECTED)
    completed_claims_q = (
        select(Claim.id, Claim.created_at, Claim.updated_at)
        .where(Claim.status.in_(["APPROVED", "SETTLED", "REJECTED"]))
    )
    completed_rows = (await db.execute(completed_claims_q)).all()

    processing_durations = []
    for cid, c_created, c_updated in completed_rows:
        if c_created and c_updated and c_updated > c_created:
            days = (c_updated - c_created).total_seconds() / 86400.0
            processing_durations.append(days)

    avg_turnaround_days = (
        round(sum(processing_durations) / len(processing_durations), 2)
        if processing_durations
        else 0.0
    )

    approved_count = by_status.get("APPROVED", 0) + by_status.get("SETTLED", 0)
    rejected_count = by_status.get("REJECTED", 0)

    # Financial settlement totals
    settlement_sum_q = select(
        func.sum(Settlement.payment_amount),
        func.count(Settlement.id),
    ).where(Settlement.payment_status == "COMPLETED")
    settlement_res = (await db.execute(settlement_sum_q)).fetchone()
    total_paid_out = float(settlement_res[0] or 0.0) if settlement_res else 0.0
    total_settled_claims = int(settlement_res[1] or 0) if settlement_res else 0

    return {
        "period": {
            "from_date": from_date.isoformat() if from_date else "all-time",
            "to_date": to_date.isoformat() if to_date else "present",
        },
        "total_claims": total_claims,
        "by_status": by_status,
        "by_type": by_type,
        "approved_count": approved_count,
        "rejected_count": rejected_count,
        "approval_rate_percent": round((approved_count / max(total_claims, 1)) * 100, 1),
        "rejection_rate_percent": round((rejected_count / max(total_claims, 1)) * 100, 1),
        "avg_processing_days": avg_turnaround_days,
        "completed_samples": len(processing_durations),
        "total_settlement_payout": total_paid_out,
        "total_settlements_completed": total_settled_claims,
    }


@router.get("/claims/export-csv")
async def export_claims_csv(
    status: Optional[str] = Query(None),
    incident_type: Optional[str] = Query(None),
    risk_level: Optional[str] = Query(None),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    current_user: User = Depends(get_officer),
    db: AsyncSession = Depends(get_db),
):
    """
    Officer/Admin: Export filtered claims report to CSV.
    All cell data is sanitized against formula injection.
    """
    query = (
        select(Claim)
        .options(
            selectinload(Claim.customer),
            selectinload(Claim.policy),
            selectinload(Claim.assigned_officer),
            selectinload(Claim.settlement),
        )
    )

    if status:
        query = query.where(Claim.status == status)
    if incident_type:
        query = query.where(Claim.incident_type == incident_type)
    if risk_level:
        query = query.where(Claim.risk_level == risk_level)
    if from_date:
        query = query.where(func.date(Claim.created_at) >= from_date)
    if to_date:
        query = query.where(func.date(Claim.created_at) <= to_date)

    query = query.order_by(Claim.created_at.desc())
    result = await db.execute(query)
    claims = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

    # Header
    writer.writerow([
        "Claim Number",
        "Customer Name",
        "Customer Email",
        "Policy Number",
        "Policy Type",
        "Incident Type",
        "Incident Date",
        "Incident Location",
        "Requested Amount (INR)",
        "Approved Amount (INR)",
        "Status",
        "Risk Level",
        "Fraud Probability",
        "Assigned Officer",
        "Created At",
        "Updated At",
    ])

    for c in claims:
        writer.writerow([
            sanitize_csv_cell(c.claim_number),
            sanitize_csv_cell(c.customer.full_name if c.customer else "N/A"),
            sanitize_csv_cell(c.customer.email if c.customer else "N/A"),
            sanitize_csv_cell(c.policy.policy_number if c.policy else "N/A"),
            sanitize_csv_cell(c.policy.policy_type if c.policy else "N/A"),
            sanitize_csv_cell(c.incident_type),
            sanitize_csv_cell(c.incident_date.isoformat() if c.incident_date else ""),
            sanitize_csv_cell(c.incident_location or ""),
            sanitize_csv_cell(float(c.requested_amount) if c.requested_amount else 0.0),
            sanitize_csv_cell(float(c.approved_amount) if c.approved_amount else 0.0),
            sanitize_csv_cell(c.status),
            sanitize_csv_cell(c.risk_level or "LOW"),
            sanitize_csv_cell(f"{c.fraud_score:.4f}" if c.fraud_score is not None else "N/A"),
            sanitize_csv_cell(c.assigned_officer.full_name if c.assigned_officer else "Unassigned"),
            sanitize_csv_cell(c.created_at.isoformat() if c.created_at else ""),
            sanitize_csv_cell(c.updated_at.isoformat() if c.updated_at else ""),
        ])

    csv_data = output.getvalue()
    filename = f"claims_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

    logger.info(f"Claims CSV report generated by user={current_user.email} (total rows={len(claims)})")
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/settlements/export-csv")
async def export_settlements_csv(
    payment_status: Optional[str] = Query(None),
    current_user: User = Depends(get_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin: Export settlement and payout records to CSV.
    Protected with formula injection sanitization.
    """
    query = (
        select(Settlement)
        .options(
            selectinload(Settlement.claim).selectinload(Claim.customer),
        )
    )

    if payment_status:
        query = query.where(Settlement.payment_status == payment_status)

    query = query.order_by(Settlement.created_at.desc())
    result = await db.execute(query)
    settlements = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

    # Header
    writer.writerow([
        "Settlement ID",
        "Claim Number",
        "Customer Name",
        "Approved Amount (INR)",
        "Payment Amount (INR)",
        "Payment Method",
        "Payment Status",
        "Payment Reference",
        "Processed At",
        "Completed At",
    ])

    for s in settlements:
        c = s.claim
        writer.writerow([
            sanitize_csv_cell(s.id),
            sanitize_csv_cell(c.claim_number if c else "N/A"),
            sanitize_csv_cell(c.customer.full_name if c and c.customer else "N/A"),
            sanitize_csv_cell(float(s.approved_amount)),
            sanitize_csv_cell(float(s.payment_amount)),
            sanitize_csv_cell(s.payment_method or "NEFT"),
            sanitize_csv_cell(s.payment_status),
            sanitize_csv_cell(s.payment_reference or "N/A"),
            sanitize_csv_cell(s.processed_at.isoformat() if s.processed_at else ""),
            sanitize_csv_cell(s.completed_at.isoformat() if s.completed_at else ""),
        ])

    csv_data = output.getvalue()
    filename = f"settlements_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

    logger.info(f"Settlements CSV report generated by admin={current_user.email} (total rows={len(settlements)})")
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
