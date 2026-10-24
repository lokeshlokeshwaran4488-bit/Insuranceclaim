from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class DocumentOut(BaseModel):
    id: str  # MongoDB ObjectId as string
    claim_id: str
    customer_id: str
    filename: str
    original_filename: str
    document_category: str
    file_path: str
    file_size: int
    mime_type: str
    status: str
    upload_timestamp: datetime
    verified_by: Optional[str]
    verified_at: Optional[datetime]
    rejection_reason: Optional[str]


class DocumentVerifyRequest(BaseModel):
    notes: Optional[str] = None


class DocumentRejectRequest(BaseModel):
    rejection_reason: str


class DocumentListResponse(BaseModel):
    documents: list[DocumentOut]
    total: int
