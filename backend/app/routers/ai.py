"""
AI API router — GPT, XGBoost, and PyTorch endpoints.
AI results are advisory only. Human review makes final decisions.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.dependencies import get_current_user, get_officer
from app.database.postgres import get_db
from app.database.mongodb import get_mongo_db
from app.models.claim import Claim
from app.models.policy import Policy
from app.models.user import User
from app.ai.gpt_service import summarize_claim, extract_document_info
from app.ai.fraud_model import compute_fraud_score, prepare_claim_features
from app.ai.pytorch_service import analyze_damage_image
from app.core.logging_config import get_logger
from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/ai", tags=["AI Services"])
logger = get_logger(__name__)


class ClaimSummaryRequest(BaseModel):
    claim_id: str


class FraudScoreRequest(BaseModel):
    claim_id: str


class DocumentAnalysisRequest(BaseModel):
    document_text: str
    document_type: str


class ImageAnalysisRequest(BaseModel):
    document_id: str  # MongoDB document ID


@router.post("/claim-summary")
async def get_claim_summary(
    payload: ClaimSummaryRequest,
    current_user: User = Depends(get_officer),
    db: AsyncSession = Depends(get_db),
):
    """
    Officer/Admin: Get AI-generated summary and analysis for a claim.
    Uses GPT-4o to extract structured information from claim description.
    AI result is advisory only — officer makes the final decision.
    """
    result = await db.execute(select(Claim).where(Claim.id == payload.claim_id))
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    summary = await summarize_claim(
        claim_description=claim.description or "",
        incident_type=claim.incident_type,
        requested_amount=float(claim.requested_amount),
    )

    # Store in MongoDB
    mongo_db = get_mongo_db()
    await mongo_db["ai_analysis"].insert_one({
        "claim_id": payload.claim_id,
        "analysis_type": "GPT_SUMMARY",
        "model_version": summary.get("model", "gpt-4o"),
        "input_data": {
            "description": claim.description,
            "incident_type": claim.incident_type,
            "requested_amount": float(claim.requested_amount),
        },
        "output_data": summary,
        "created_at": datetime.now(timezone.utc),
        "requested_by": current_user.id,
    })

    logger.info(f"AI claim summary generated for claim={payload.claim_id} by user={current_user.id}")
    return summary


@router.post("/fraud-score")
async def get_fraud_score(
    payload: FraudScoreRequest,
    current_user: User = Depends(get_officer),
    db: AsyncSession = Depends(get_db),
):
    """
    Officer/Admin: Get XGBoost fraud risk score for a claim.
    Result is a recommendation — human makes the final decision.

    Risk levels:
    - 0.00–0.25: LOW → Auto-process
    - 0.26–0.50: MODERATE → Standard review
    - 0.51–0.75: HIGH → Manual review required
    - 0.76–1.00: VERY HIGH → Fraud investigation
    """
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.policy), selectinload(Claim.customer))
        .where(Claim.id == payload.claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    # Count previous claims by this customer
    claims_count_result = await db.execute(
        select(func.count(Claim.id)).where(Claim.customer_id == claim.customer_id)
    )
    customer_claims_count = (claims_count_result.scalar() or 1) - 1  # Exclude current

    # Prepare features
    features = prepare_claim_features(claim, claim.policy, customer_claims_count)

    # Compute score
    fraud_result = compute_fraud_score(features)

    # Update claim record with fraud score
    claim.fraud_score = fraud_result["fraud_probability"]
    claim.risk_level = fraud_result["risk_level"]
    await db.commit()

    # Store in MongoDB
    mongo_db = get_mongo_db()
    await mongo_db["ai_analysis"].insert_one({
        "claim_id": payload.claim_id,
        "analysis_type": "FRAUD_SCORE",
        "model_version": fraud_result.get("model_version"),
        "input_data": features,
        "output_data": fraud_result,
        "created_at": datetime.now(timezone.utc),
        "requested_by": current_user.id,
    })

    logger.info(
        f"Fraud score computed for claim={payload.claim_id}: "
        f"probability={fraud_result['fraud_probability']} risk={fraud_result['risk_level']}"
    )
    return fraud_result


@router.post("/document-analysis")
async def analyze_document(
    payload: DocumentAnalysisRequest,
    current_user: User = Depends(get_officer),
):
    """Officer/Admin: Extract structured information from a document using GPT-4o."""
    result = await extract_document_info(payload.document_text, payload.document_type)
    return result


@router.post("/image-analysis")
async def analyze_image(
    payload: ImageAnalysisRequest,
    current_user: User = Depends(get_officer),
):
    """
    Officer/Admin: Analyze a damage image using PyTorch ResNet-50.
    Returns damage detection, type, severity, and confidence.
    """
    from bson import ObjectId

    mongo_db = get_mongo_db()
    doc = await mongo_db["claim_documents"].find_one({"_id": ObjectId(payload.document_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.get("mime_type", "").startswith("image/"):
        # Read the file
        try:
            with open(doc["file_path"], "rb") as f:
                image_bytes = f.read()
            analysis = await analyze_damage_image(image_bytes, doc["filename"])
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Image file not found on disk")
    else:
        raise HTTPException(status_code=400, detail="Document is not an image file")

    # Store result
    await mongo_db["ai_analysis"].insert_one({
        "claim_id": doc["claim_id"],
        "document_id": payload.document_id,
        "analysis_type": "IMAGE_ANALYSIS",
        "output_data": analysis,
        "created_at": datetime.now(timezone.utc),
        "requested_by": current_user.id,
    })

    return analysis


@router.get("/claim-analysis/{claim_id}")
async def get_claim_ai_results(
    claim_id: str,
    current_user: User = Depends(get_officer),
):
    """Get all AI analysis results for a specific claim from MongoDB."""
    mongo_db = get_mongo_db()
    cursor = mongo_db["ai_analysis"].find({"claim_id": claim_id}).sort("created_at", -1)

    results = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        results.append(doc)

    return {"claim_id": claim_id, "analyses": results}
