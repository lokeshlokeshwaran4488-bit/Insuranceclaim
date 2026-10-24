"""
GPT-4o integration for claim text analysis, summarization, and extraction.
Gracefully handles missing API key with fallback responses.
"""

import json
from typing import Optional
from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)


def _get_client():
    """Lazy-load OpenAI client."""
    if not settings.OPENAI_API_KEY or settings.OPENAI_API_KEY.startswith("sk-your"):
        return None
    try:
        from openai import AsyncOpenAI
        return AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    except ImportError:
        return None


async def summarize_claim(
    claim_description: str,
    incident_type: str,
    requested_amount: float,
) -> dict:
    """
    Use GPT-4o to extract structured information from a claim description.
    Returns structured claim analysis.
    """
    client = _get_client()
    if not client:
        return _fallback_summary(claim_description, incident_type)

    prompt = f"""
You are an insurance claim analyst. Analyze the following insurance claim description and extract structured information.

Incident Type: {incident_type}
Requested Amount: ₹{requested_amount:,.2f}
Customer Description: {claim_description}

Return a JSON response with the following structure:
{{
  "incident_summary": "Brief one-paragraph professional summary",
  "damage_type": "Type of damage (if applicable)",
  "damage_location": "Location of damage (if applicable)",
  "severity_assessment": "MINOR | MODERATE | MAJOR | CATASTROPHIC",
  "missing_information": ["List of missing details that should be clarified"],
  "recommended_documents": ["List of documents that should be submitted"],
  "red_flags": ["Any concerning inconsistencies or red flags (empty array if none)"],
  "claim_validity_assessment": "LIKELY_VALID | NEEDS_INVESTIGATION | SUSPICIOUS",
  "officer_notes": "Notes for the claim officer reviewing this claim"
}}

Be professional, factual, and neutral. Do not make approval/rejection decisions.
"""

    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "You are an expert insurance claim analyst. Always respond with valid JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        logger.info(f"GPT claim summary generated successfully")
        return {"status": "completed", "data": result, "model": settings.OPENAI_MODEL}
    except Exception as e:
        logger.error(f"GPT summarization failed: {e}")
        return {"status": "failed", "error": str(e), "data": _fallback_summary(claim_description, incident_type)["data"]}


async def extract_document_info(document_text: str, document_type: str) -> dict:
    """
    Use GPT-4o to extract key information from document text.
    """
    client = _get_client()
    if not client:
        return {"status": "skipped", "reason": "OpenAI API not configured", "data": {}}

    prompt = f"""
Extract key information from this {document_type} document text.

Document Text:
{document_text[:3000]}

Return a JSON with relevant extracted fields like:
- document_date
- issuing_authority  
- key_amounts (if any)
- involved_parties (if any)
- key_reference_numbers
- summary
"""
    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "Extract structured information from insurance documents. Return valid JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        return {
            "status": "completed",
            "data": json.loads(response.choices[0].message.content),
            "model": settings.OPENAI_MODEL,
        }
    except Exception as e:
        logger.error(f"GPT document extraction failed: {e}")
        return {"status": "failed", "error": str(e), "data": {}}


async def explain_claim_status(status: str, claim_number: str, context: dict) -> str:
    """Generate a human-readable explanation of a claim status for the customer."""
    client = _get_client()

    explanations = {
        "DRAFT": "Your claim has been saved as a draft. Please review and submit it when ready.",
        "SUBMITTED": "Your claim has been submitted and is being reviewed by our team.",
        "DOCUMENTS_PENDING": "We need additional documents to process your claim. Please upload the required documents.",
        "UNDER_OFFICER_REVIEW": "A claim officer is currently reviewing your claim. We will update you shortly.",
        "APPROVAL_PENDING": "Your claim review is complete and awaiting final approval decision.",
        "APPROVED": f"Congratulations! Your claim has been approved. Settlement processing will begin shortly.",
        "REJECTED": "Your claim has been reviewed and unfortunately could not be approved at this time.",
        "SETTLEMENT_PENDING": "Your claim is approved and the settlement payment is being prepared.",
        "SETTLED": "Payment has been processed for your claim. The settlement is complete.",
    }

    return explanations.get(status, f"Your claim {claim_number} is currently in '{status}' status.")


def _fallback_summary(description: str, incident_type: str) -> dict:
    """Return a basic fallback when GPT is not available."""
    return {
        "status": "fallback",
        "reason": "AI service not configured",
        "data": {
            "incident_summary": description[:200] if description else "No description provided",
            "damage_type": incident_type,
            "severity_assessment": "NEEDS_INVESTIGATION",
            "missing_information": ["AI analysis unavailable — manual review required"],
            "recommended_documents": ["Identity Proof", "Policy Document", "Incident Report"],
            "red_flags": [],
            "claim_validity_assessment": "NEEDS_INVESTIGATION",
            "officer_notes": "AI analysis service is not configured. Please perform manual review.",
        },
    }
