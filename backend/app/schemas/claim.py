from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date, time, datetime


# ─── Claim Creation / Update ─────────────────────────────────────────────────

class ClaimCreate(BaseModel):
    policy_id: str
    incident_type: str
    incident_date: Optional[date] = None
    incident_time: Optional[time] = None
    incident_location: Optional[str] = None
    description: Optional[str] = None
    requested_amount: float = 0.0

    @field_validator("requested_amount")
    @classmethod
    def non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Requested amount cannot be negative")
        return v


class ClaimUpdate(BaseModel):
    incident_type: Optional[str] = None
    incident_date: Optional[date] = None
    incident_time: Optional[time] = None
    incident_location: Optional[str] = None
    description: Optional[str] = None
    requested_amount: Optional[float] = None


class ClaimSubmit(BaseModel):
    """No extra fields needed — just the claim ID in the URL."""
    pass


# ─── Officer Actions ─────────────────────────────────────────────────────────

class AssignOfficerRequest(BaseModel):
    officer_id: str


class RequestDocumentsRequest(BaseModel):
    document_types: list[str]
    message: str
    deadline_days: Optional[int] = 7


class AddClaimNoteRequest(BaseModel):
    remarks: str
    is_internal: bool = True


class ClaimReviewOut(BaseModel):
    id: str
    officer_id: str
    review_type: str
    remarks: str
    recommendation: Optional[str] = None
    is_internal: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentRequestOut(BaseModel):
    id: str
    claim_id: str
    requested_by: str
    document_types: list[str]
    message: str
    is_fulfilled: bool
    created_at: datetime
    fulfilled_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class RecommendApprovalRequest(BaseModel):
    remarks: str
    recommended_amount: Optional[float] = None


class RecommendRejectionRequest(BaseModel):
    remarks: str
    rejection_reason: str


class EscalateRequest(BaseModel):
    reason: Optional[str] = None
    remarks: Optional[str] = None
    evidence_references: Optional[list[str]] = None
    ai_findings: Optional[str] = None

    def get_reason(self) -> str:
        r = (self.reason or self.remarks or "").strip()
        if not r:
            raise ValueError("Escalation reason is mandatory")
        return r


class RequestClarificationRequest(BaseModel):
    reason: str


class MarkManualReviewRequest(BaseModel):
    reason: str


# ─── Admin Actions ────────────────────────────────────────────────────────────

class RespondClarificationRequest(BaseModel):
    instructions: str
    officer_id: Optional[str] = None


class AdminDecisionRequest(BaseModel):
    decision: str  # APPROVE | REJECT | RETURN_TO_OFFICER
    reason: str    # Mandatory decision reason
    approved_amount: Optional[float] = None
    instructions: Optional[str] = None
    assigned_officer_id: Optional[str] = None


class ApproveClaimRequest(BaseModel):
    approved_amount: float
    approval_notes: Optional[str] = None

    @field_validator("approved_amount")
    @classmethod
    def positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Approved amount must be positive")
        return v


class RejectClaimRequest(BaseModel):
    rejection_reason: str


# ─── Responses ───────────────────────────────────────────────────────────────

class ClaimTimelineOut(BaseModel):
    id: str
    status: str
    description: str
    created_by: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class ClaimOut(BaseModel):
    id: str
    claim_number: str
    policy_id: str
    customer_id: str
    incident_type: str
    incident_date: Optional[date]
    incident_time: Optional[time]
    incident_location: Optional[str]
    description: Optional[str]
    requested_amount: float
    approved_amount: Optional[float]
    status: str
    fraud_score: Optional[float]
    risk_level: Optional[str]
    assigned_officer_id: Optional[str]
    rejection_reason: Optional[str]
    approval_notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    # AI Verification Scores & Escalation
    image_verification_score: Optional[float] = None
    document_verification_score: Optional[float] = None
    overall_verification_status: Optional[str] = None
    escalation_reason: Optional[str] = None
    escalated_by_name: Optional[str] = None
    escalated_at: Optional[datetime] = None

    # Nested
    customer_name: Optional[str] = None
    policy_number: Optional[str] = None
    officer_name: Optional[str] = None
    settlement_id: Optional[str] = None
    settlement_amount: Optional[float] = None
    payment_status: Optional[str] = None
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None

    model_config = {"from_attributes": True}


class ClaimListResponse(BaseModel):
    claims: list[ClaimOut]
    total: int
    page: int
    page_size: int
