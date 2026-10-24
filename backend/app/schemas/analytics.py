from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


class AuditLogOut(BaseModel):
    id: str
    user_id: Optional[str]
    action: str
    entity_type: str
    entity_id: Optional[str]
    old_value: Optional[dict]
    new_value: Optional[dict]
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime

    user_name: Optional[str] = None

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    logs: list[AuditLogOut]
    total: int
    page: int
    page_size: int


class DashboardStats(BaseModel):
    total_customers: int
    active_policies: int
    claims_today: int
    total_claims: int
    pending_claims: int
    approved_claims: int
    rejected_claims: int
    fraud_alerts: int
    settlement_pending: int
    total_paid_amount: float


class ClaimsAnalytics(BaseModel):
    claims_by_month: list[dict]
    claims_by_type: list[dict]
    claims_by_status: list[dict]
    approval_rate: float
    rejection_rate: float
    avg_processing_days: float


class FraudAnalytics(BaseModel):
    fraud_alerts_total: int
    by_risk_level: list[dict]
    high_risk_claim_ids: list[str]


class SettlementAnalytics(BaseModel):
    total_settlements: int
    total_paid: float
    pending_amount: float
    avg_settlement_amount: float
    success_rate: float
