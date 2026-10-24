from pydantic import BaseModel, field_validator
from typing import Optional, Any
from datetime import date, datetime
from decimal import Decimal


class PolicyCreate(BaseModel):
    policy_number: str
    customer_id: str
    policy_type: str  # Motor | Health | Property | Life | Travel
    coverage_amount: float
    premium_amount: float
    deductible_amount: float = 0.0
    start_date: date
    expiry_date: date
    policy_details: Optional[dict] = None

    @field_validator("expiry_date")
    @classmethod
    def expiry_after_start(cls, v: date, info) -> date:
        if "start_date" in info.data and v <= info.data["start_date"]:
            raise ValueError("Expiry date must be after start date")
        return v

    @field_validator("coverage_amount", "premium_amount")
    @classmethod
    def positive_amount(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v


class PolicyUpdate(BaseModel):
    policy_type: Optional[str] = None
    coverage_amount: Optional[float] = None
    premium_amount: Optional[float] = None
    deductible_amount: Optional[float] = None
    start_date: Optional[date] = None
    expiry_date: Optional[date] = None
    status: Optional[str] = None
    policy_details: Optional[dict] = None


class PolicyOut(BaseModel):
    id: str
    policy_number: str
    customer_id: str
    policy_type: str
    coverage_amount: float
    premium_amount: float
    deductible_amount: float
    start_date: date
    expiry_date: date
    status: str
    policy_details: Optional[dict]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PolicyListResponse(BaseModel):
    policies: list[PolicyOut]
    total: int
    page: int
    page_size: int
