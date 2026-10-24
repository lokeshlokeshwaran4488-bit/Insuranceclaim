from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class SettlementCreate(BaseModel):
    claim_id: str
    payment_amount: float
    payment_method: str
    bank_account: Optional[str] = None  # Will be encrypted before storage


class SettlementUpdate(BaseModel):
    payment_reference: Optional[str] = None
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None
    failure_reason: Optional[str] = None


class SettlementOut(BaseModel):
    id: str
    claim_id: str
    approved_amount: float
    payment_amount: float
    payment_reference: Optional[str]
    payment_method: Optional[str]
    payment_status: str
    failure_reason: Optional[str]
    processed_by: Optional[str]
    processed_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime

    # Enriched
    claim_number: Optional[str] = None
    customer_name: Optional[str] = None

    model_config = {"from_attributes": True}


class SettlementListResponse(BaseModel):
    settlements: list[SettlementOut]
    total: int
    page: int
    page_size: int
