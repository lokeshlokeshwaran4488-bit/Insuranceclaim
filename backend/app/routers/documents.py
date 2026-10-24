from datetime import datetime, timezone
import os
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from bson import ObjectId

from app.core.dependencies import get_current_user, get_officer
from app.database.postgres import get_db
from app.database.mongodb import get_mongo_db
from app.models.claim import Claim
from app.models.user import User
from app.schemas.document import DocumentOut, DocumentVerifyRequest, DocumentRejectRequest, DocumentListResponse
from app.utils.file_utils import save_upload_file
from app.core.logging_config import get_logger

router = APIRouter(tags=["Documents"])
logger = get_logger(__name__)

DOCUMENT_CATEGORIES = [
    "IDENTITY_PROOF", "POLICY_DOCUMENT", "FIR", "HOSPITAL_BILL",
    "MEDICAL_REPORT", "VEHICLE_REGISTRATION", "DRIVING_LICENCE",
    "DAMAGE_PHOTO", "REPAIR_ESTIMATE", "OTHER",
]


def serialize_document(doc: dict) -> dict:
    """Convert MongoDB document to API-safe dict."""
    doc["id"] = str(doc.pop("_id"))
    return doc


@router.post("/api/claims/{claim_id}/documents", response_model=DocumentOut, status_code=201)
async def upload_document(
    claim_id: str,
    file: UploadFile = File(...),
    document_category: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Customer: Upload a document for a claim."""
    # Validate claim ownership
    result = await db.execute(select(Claim).where(Claim.id == claim_id))
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if current_user.role == "CUSTOMER" and claim.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if claim.status not in (
        "DRAFT", "SUBMITTED", "DOCUMENTS_PENDING",
        "ADDITIONAL_DOCUMENTS_REQUIRED", "UNDER_OFFICER_REVIEW"
    ):
        raise HTTPException(
            status_code=400, detail=f"Cannot upload documents to a claim in '{claim.status}' status"
        )

    if document_category not in DOCUMENT_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid document category. Allowed: {', '.join(DOCUMENT_CATEGORIES)}",
        )

    # Save file to disk
    file_path, file_size, safe_name = await save_upload_file(file, claim_id, document_category)

    # Store metadata in MongoDB
    mongo_db = get_mongo_db()
    doc_record = {
        "claim_id": claim_id,
        "customer_id": current_user.id,
        "filename": safe_name,
        "original_filename": file.filename,
        "document_category": document_category,
        "file_path": file_path,
        "file_size": file_size,
        "mime_type": file.content_type or "application/octet-stream",
        "status": "UPLOADED",
        "upload_timestamp": datetime.now(timezone.utc),
        "verified_by": None,
        "verified_at": None,
        "rejection_reason": None,
    }
    insert_result = await mongo_db["claim_documents"].insert_one(doc_record)
    doc_record["_id"] = insert_result.inserted_id

    # If claim was waiting for documents, update to DOCUMENTS_RECEIVED
    if claim.status in ("ADDITIONAL_DOCUMENTS_REQUIRED", "DOCUMENTS_PENDING"):
        claim.status = "DOCUMENTS_RECEIVED"
        from app.models.claim_timeline import ClaimTimeline
        from app.models.document_request import DocumentRequest
        db.add(ClaimTimeline(
            claim_id=claim_id,
            status="DOCUMENTS_RECEIVED",
            description=f"Supporting document '{file.filename}' uploaded by customer.",
            created_by=current_user.id,
        ))
        doc_req_res = await db.execute(
            select(DocumentRequest).where(
                DocumentRequest.claim_id == claim_id,
                DocumentRequest.is_fulfilled == False,
            )
        )
        for req in doc_req_res.scalars().all():
            req.is_fulfilled = True
            req.fulfilled_at = datetime.now(timezone.utc)
        await db.commit()

    logger.info(f"Document uploaded: {safe_name} for claim={claim_id}")
    return DocumentOut(**serialize_document(doc_record))


@router.get("/api/documents/{doc_id}/file")
async def get_document_file(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download/preview uploaded document or image file."""
    mongo_db = get_mongo_db()
    try:
        doc = await mongo_db["claim_documents"].find_one({"_id": ObjectId(doc_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid document ID")

    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if current_user.role == "CUSTOMER" and doc.get("customer_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    file_path = doc.get("file_path")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on storage")

    return FileResponse(
        path=file_path,
        filename=doc.get("original_filename", "document"),
        media_type=doc.get("mime_type", "application/octet-stream"),
    )


@router.get("/api/claims/{claim_id}/documents", response_model=DocumentListResponse)
async def list_documents(
    claim_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all documents for a claim."""
    result = await db.execute(select(Claim).where(Claim.id == claim_id))
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if current_user.role == "CUSTOMER" and claim.customer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    mongo_db = get_mongo_db()
    cursor = mongo_db["claim_documents"].find({"claim_id": claim_id})
    docs = []
    async for doc in cursor:
        docs.append(DocumentOut(**serialize_document(doc)))

    return DocumentListResponse(documents=docs, total=len(docs))


@router.post("/api/documents/{doc_id}/verify", response_model=DocumentOut)
async def verify_document(
    doc_id: str,
    payload: DocumentVerifyRequest,
    current_officer: User = Depends(get_officer),
):
    """Officer: Mark a document as verified."""
    mongo_db = get_mongo_db()
    update_result = await mongo_db["claim_documents"].find_one_and_update(
        {"_id": ObjectId(doc_id)},
        {
            "$set": {
                "status": "VERIFIED",
                "verified_by": current_officer.id,
                "verified_at": datetime.now(timezone.utc),
            }
        },
        return_document=True,
    )
    if not update_result:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentOut(**serialize_document(update_result))


@router.post("/api/documents/{doc_id}/reject", response_model=DocumentOut)
async def reject_document(
    doc_id: str,
    payload: DocumentRejectRequest,
    current_officer: User = Depends(get_officer),
):
    """Officer: Reject a document."""
    mongo_db = get_mongo_db()
    update_result = await mongo_db["claim_documents"].find_one_and_update(
        {"_id": ObjectId(doc_id)},
        {
            "$set": {
                "status": "REJECTED",
                "rejection_reason": payload.rejection_reason,
                "verified_by": current_officer.id,
                "verified_at": datetime.now(timezone.utc),
            }
        },
        return_document=True,
    )
    if not update_result:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentOut(**serialize_document(update_result))


@router.delete("/api/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: str,
    current_user: User = Depends(get_current_user),
):
    """Customer or Admin: Delete a document."""
    from app.utils.file_utils import delete_upload_file

    mongo_db = get_mongo_db()
    doc = await mongo_db["claim_documents"].find_one({"_id": ObjectId(doc_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if current_user.role == "CUSTOMER" and doc["customer_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Delete from disk
    delete_upload_file(doc["file_path"])

    # Delete from MongoDB
    await mongo_db["claim_documents"].delete_one({"_id": ObjectId(doc_id)})
