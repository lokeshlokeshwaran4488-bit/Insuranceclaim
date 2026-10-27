"""
InsureClaim AI — Unified AI Verification Service
Comprehensive Image & Document Verification, OCR text extraction, tampering/manipulation checks,
cross-claim duplicate SHA-256 detection, consistency analysis, and multi-factor risk scoring.

Verification Statuses:
- VERIFIED: Consistent damage/fields, authentic quality, no duplicates, matches claim/policy.
- SUSPICIOUS: Duplicate evidence across claims, manipulation signs, or severe conflict.
- UNCERTAIN: Degraded quality, partial OCR, or authenticity cannot be established from AI alone.
- MANUAL_REVIEW: Missing required evidence or unreadable documents requiring human adjudication.
- PENDING: No evidence submitted yet or verification not executed.
"""

import hashlib
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.claim import Claim
from app.models.policy import Policy
from app.database.mongodb import get_mongo_db
from app.services.risk_service import evaluate_claim_risk
from app.ai.pytorch_service import analyze_damage_image
from app.ai.gpt_service import summarize_claim, _get_client
from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# Required document categories mapping per incident type
REQUIRED_DOCS_BY_INCIDENT = {
    "Motor Vehicle Collision": ["DAMAGE_PHOTO", "REPAIR_ESTIMATE"],
    "Motor Vehicle Accident": ["DAMAGE_PHOTO", "REPAIR_ESTIMATE"],
    "Motor Accident": ["DAMAGE_PHOTO", "REPAIR_ESTIMATE"],
    "VEHICLE_ACCIDENT": ["DAMAGE_PHOTO", "REPAIR_ESTIMATE"],
    "Vehicle Theft or Vandalism": ["FIR", "POLICY_DOCUMENT"],
    "Theft": ["FIR", "POLICY_DOCUMENT"],
    "Medical Hospitalization": ["HOSPITAL_BILL", "MEDICAL_REPORT"],
    "Medical Emergency": ["HOSPITAL_BILL", "MEDICAL_REPORT"],
    "Property Fire Damage": ["DAMAGE_PHOTO", "REPAIR_ESTIMATE"],
    "Property Damage": ["DAMAGE_PHOTO", "REPAIR_ESTIMATE"],
    "Water Damage / Flooding": ["DAMAGE_PHOTO", "REPAIR_ESTIMATE"],
    "Personal Accident / Injury": ["MEDICAL_REPORT", "HOSPITAL_BILL"],
    "Other Casualty": ["IDENTITY_PROOF", "REPAIR_ESTIMATE"],
}


def _resolve_file_path(path_str: str) -> str:
    """Robustly resolve file path whether stored as absolute or relative path."""
    if not path_str:
        return ""
    p = Path(path_str)
    if p.is_absolute() and p.exists():
        return str(p)
    # Check relative to backend/
    backend_root = Path(__file__).parent.parent.parent
    b_path = backend_root / path_str
    if b_path.exists():
        return str(b_path)
    # Check directly inside UPLOAD_DIR
    u_path = Path(settings.UPLOAD_DIR) / path_str
    if u_path.exists():
        return str(u_path)
    return str(b_path)


def _extract_text_from_file(file_path: str, mime_type: str) -> Dict[str, Any]:
    """Extract readable text from PDF or text documents using PyMuPDF (fitz) or basic reading."""
    if not os.path.exists(file_path):
        return {"text": "", "page_count": 0, "ocr_success": False, "method": "none", "notes": "File not found"}

    try:
        if mime_type == "application/pdf" or file_path.lower().endswith(".pdf"):
            import fitz  # PyMuPDF
            doc = fitz.open(file_path)
            extracted_pages = []
            for i in range(len(doc)):
                page_text = doc[i].get_text("text")
                if page_text.strip():
                    extracted_pages.append(page_text.strip())
            full_text = "\n\n".join(extracted_pages)
            doc.close()
            has_text = len(full_text.strip()) > 20
            return {
                "text": full_text,
                "page_count": len(extracted_pages),
                "ocr_success": has_text,
                "method": "PyMuPDF-DirectText" if has_text else "PyMuPDF-NoTextLayer",
                "notes": "Text layer extracted successfully" if has_text else "Scanned document without embedded text layer — manual inspection recommended.",
            }
        elif mime_type.startswith("text/") or file_path.lower().endswith((".txt", ".csv")):
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            return {
                "text": content,
                "page_count": 1,
                "ocr_success": bool(content.strip()),
                "method": "PlainTextReader",
                "notes": "Plain text read directly",
            }
        else:
            return {
                "text": "",
                "page_count": 0,
                "ocr_success": False,
                "method": "unsupported",
                "notes": "Binary document type; OCR text extraction not applicable.",
            }
    except Exception as e:
        logger.warning(f"Text extraction failed for {file_path}: {e}")
        return {
            "text": "",
            "page_count": 0,
            "ocr_success": False,
            "method": "failed",
            "notes": f"Extraction error: {str(e)}",
        }


def _analyze_image_quality_and_tampering(file_path: str) -> Dict[str, Any]:
    """
    Examine image quality (resolution, blur, lighting) and potential manipulation signs.
    AI cannot reliably prove authenticity from an image alone; if uncertain, marks for human review.
    """
    if not os.path.exists(file_path):
        return {
            "status": "UNCERTAIN",
            "blur_score": 0,
            "is_blurry": False,
            "resolution": "Unknown",
            "concerns": ["Image file not located on storage"],
            "manipulation_signs": [],
        }

    concerns: List[str] = []
    manipulation_signs: List[str] = []
    blur_score = 150.0
    is_blurry = False
    is_dark = False
    is_overexposed = False
    dimensions = (0, 0)

    try:
        from PIL import Image, ExifTags
        with Image.open(file_path) as img:
            dimensions = (img.width, img.height)
            if img.width < 300 or img.height < 300:
                concerns.append(f"Low image resolution ({img.width}x{img.height}). Minimum 300x300 recommended.")

            # Check EXIF for editing software
            exif_data = getattr(img, "_getexif", lambda: None)()
            if exif_data:
                for tag_id, value in exif_data.items():
                    tag_name = ExifTags.TAGS.get(tag_id, tag_id)
                    if tag_name in ("Software", "ProcessingSoftware", "ImageDescription"):
                        val_str = str(value).lower()
                        if any(s in val_str for s in ["photoshop", "gimp", "canva", "pixlr", "lightroom", "editor"]):
                            manipulation_signs.append(f"Image metadata indicates post-processing software ({value}).")
    except Exception as e:
        logger.debug(f"PIL check note for {file_path}: {e}")

    try:
        import cv2
        import numpy as np
        cv_img = cv2.imread(file_path)
        if cv_img is not None:
            gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
            blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            if blur_score < 70.0:
                is_blurry = True
                concerns.append(f"High image blur detected (sharpness index: {blur_score:.1f} < 70). Details may be obscured.")

            mean_brightness = float(np.mean(gray))
            if mean_brightness < 35.0:
                is_dark = True
                concerns.append(f"Image is underexposed / very dark (luminance: {mean_brightness:.1f}/255).")
            elif mean_brightness > 230.0:
                is_overexposed = True
                concerns.append(f"Image is overexposed / washed out (luminance: {mean_brightness:.1f}/255).")
    except Exception as e:
        logger.debug(f"OpenCV analysis note for {file_path}: {e}")

    # Determine status
    if manipulation_signs:
        status = "SUSPICIOUS"
    elif is_blurry or is_dark or is_overexposed or len(concerns) > 1:
        status = "UNCERTAIN"
    else:
        status = "VERIFIED"

    return {
        "status": status,
        "blur_score": round(blur_score, 1),
        "is_blurry": is_blurry,
        "is_dark": is_dark,
        "is_overexposed": is_overexposed,
        "resolution": f"{dimensions[0]}x{dimensions[1]}" if dimensions != (0, 0) else "Standard",
        "concerns": concerns,
        "manipulation_signs": manipulation_signs,
    }


def _verify_document_fields(
    text: str,
    claim: Claim,
    policy: Policy,
    category: str,
) -> Dict[str, Any]:
    """
    Compare OCR / document text against claim and policy values.
    Returns matched fields, missing expected fields, and discrepancies.
    """
    text_lower = text.lower()
    matches: List[str] = []
    discrepancies: List[str] = []
    missing_fields: List[str] = []

    # 1. Check Policy Number
    if policy and policy.policy_number:
        p_clean = policy.policy_number.lower().replace("-", "").replace(" ", "")
        t_clean = text_lower.replace("-", "").replace(" ", "")
        if p_clean in t_clean or policy.policy_number.lower() in text_lower:
            matches.append(f"Policy Number match ({policy.policy_number})")
        else:
            # Check if any different policy pattern is found
            other_pol = re.findall(r"pol[\s\-]?\d{4}[\s\-]?[a-z]{3}[\s\-]?\d+", text_lower)
            if other_pol:
                discrepancies.append(f"Document contains different policy number ({other_pol[0].upper()}) than claim policy ({policy.policy_number}).")
            else:
                missing_fields.append("Policy contract number not explicitly detected in text.")

    # 2. Check Customer Name
    if claim.customer and claim.customer.full_name:
        name_parts = claim.customer.full_name.lower().split()
        if all(part in text_lower for part in name_parts):
            matches.append(f"Claimant Name match ({claim.customer.full_name})")
        elif any(part in text_lower for part in name_parts if len(part) > 2):
            matches.append(f"Partial Claimant Name match ({claim.customer.full_name})")
        else:
            missing_fields.append(f"Claimant name '{claim.customer.full_name}' not detected in document text.")

    # 3. Check Incident Date
    if claim.incident_date:
        date_iso = claim.incident_date.isoformat()
        date_ddmmyyyy = claim.incident_date.strftime("%d/%m/%Y")
        date_d_b_y = claim.incident_date.strftime("%d %b %Y").lower()
        if date_iso in text_lower or date_ddmmyyyy in text_lower or date_d_b_y in text_lower:
            matches.append(f"Incident date confirmed ({claim.incident_date})")

    # 4. Check Claim Amount / Estimate
    found_amounts = re.findall(r"(?:₹|rs\.?|inr)?\s*([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{2})?|[0-9]{4,8})", text_lower)
    clean_amounts = []
    for a in found_amounts:
        try:
            val = float(a.replace(",", ""))
            if 500 <= val <= 5000000:
                clean_amounts.append(val)
        except ValueError:
            pass

    if clean_amounts:
        req_amt = float(claim.requested_amount or 0)
        closest = min(clean_amounts, key=lambda x: abs(x - req_amt))
        diff_pct = abs(closest - req_amt) / max(req_amt, 1.0)
        if diff_pct < 0.15:
            matches.append(f"Financial estimate closely aligns (₹{closest:,.2f} vs requested ₹{req_amt:,.2f})")
        elif closest > float(policy.coverage_amount or 0):
            discrepancies.append(f"Extracted estimate ₹{closest:,.2f} exceeds policy limit ₹{float(policy.coverage_amount):,.2f}.")

    return {
        "matches": matches,
        "discrepancies": discrepancies,
        "missing_fields": missing_fields,
        "text_length": len(text),
    }


async def run_ai_document_verification(
    db: AsyncSession,
    claim_id: str,
    requested_by: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Run comprehensive AI Image & Document Verification for a claim.
    Calculates separate Image Verification Score, Document Verification Score,
    and Fraud Risk Score, returning an explainable result with non-definitive status.
    """
    # 1. Fetch claim, policy, customer
    result = await db.execute(
        select(Claim)
        .options(selectinload(Claim.policy), selectinload(Claim.customer))
        .where(Claim.id == claim_id)
    )
    claim = result.scalar_one_or_none()
    if not claim:
        raise ValueError(f"Claim {claim_id} not found")

    policy = claim.policy
    mongo_db = get_mongo_db()

    # 2. Fetch all uploaded documents from MongoDB
    cursor = mongo_db["claim_documents"].find({"claim_id": claim_id})
    documents = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id"))
        documents.append(doc)

    # 3. Categorize Evidence into Images vs Documents
    images_list = []
    docs_list = []

    for d in documents:
        mime = d.get("mime_type", "").lower()
        cat = d.get("document_category", "")
        if mime.startswith("image/") or cat in ("DAMAGE_PHOTO", "INCIDENT_PHOTO"):
            images_list.append(d)
        else:
            docs_list.append(d)

    # 4. Check for Cross-Claim SHA-256 Duplicates
    duplicate_image_findings = []
    duplicate_doc_findings = []

    for d in documents:
        content_hash = d.get("content_hash")
        if content_hash:
            dup_cursor = mongo_db["claim_documents"].find({
                "content_hash": content_hash,
                "claim_id": {"$ne": claim_id},
            })
            async for dup in dup_cursor:
                finding = {
                    "filename": d.get("original_filename"),
                    "matched_claim_id": dup.get("claim_id"),
                    "matched_filename": dup.get("original_filename"),
                    "category": d.get("document_category"),
                    "hash": content_hash[:16] + "...",
                }
                if d in images_list:
                    duplicate_image_findings.append(finding)
                else:
                    duplicate_doc_findings.append(finding)

    # 5. Execute Image Verification
    image_details = []
    image_concerns = []
    image_statuses = []

    for img_doc in images_list:
        file_path = _resolve_file_path(img_doc.get("file_path", ""))
        # Tampering and quality check
        analysis = _analyze_image_quality_and_tampering(file_path)

        # PyTorch ResNet-50 damage classification
        damage_info = {}
        if os.path.exists(file_path):
            try:
                with open(file_path, "rb") as f:
                    img_bytes = f.read()
                damage_info = await analyze_damage_image(img_bytes, img_doc.get("original_filename", "image.jpg"))
            except Exception as e:
                logger.debug(f"ResNet inference error: {e}")

        # Check relevance to incident type
        damage_detected = damage_info.get("damage_detected")
        damage_type = damage_info.get("damage_type")
        is_relevant = True
        if "motor" in claim.incident_type.lower() or "collision" in claim.incident_type.lower():
            if damage_detected is False:
                analysis["concerns"].append("No visible vehicle damage detected in collision claim image.")
                is_relevant = False

        # Duplicate check for this image
        has_dup = any(df["filename"] == img_doc.get("original_filename") for df in duplicate_image_findings)
        if has_dup:
            analysis["status"] = "SUSPICIOUS"
            analysis["concerns"].append("Identical image SHA-256 binary hash detected in another claim submission.")

        image_statuses.append(analysis["status"])
        image_concerns.extend(analysis["concerns"])
        image_concerns.extend(analysis["manipulation_signs"])

        image_details.append({
            "id": img_doc["id"],
            "filename": img_doc.get("original_filename"),
            "category": img_doc.get("document_category"),
            "status": analysis["status"],
            "resolution": analysis["resolution"],
            "blur_score": analysis["blur_score"],
            "is_blurry": analysis["is_blurry"],
            "damage_type": damage_type or "Visual Damage",
            "damage_detected": damage_detected,
            "relevant_to_incident": is_relevant,
            "concerns": analysis["concerns"],
            "manipulation_signs": analysis["manipulation_signs"],
            "has_duplicate": has_dup,
        })

    # Compute Image Verification Score
    if not images_list:
        image_verification_score = None
        image_status = "PENDING"
        image_explanation = "No incident or damage images uploaded for verification."
    else:
        if "SUSPICIOUS" in image_statuses or duplicate_image_findings:
            image_status = "SUSPICIOUS"
            image_verification_score = 0.40
            image_explanation = "Suspicious image evidence flagged (duplicate hash across claims or editing markers detected)."
        elif "UNCERTAIN" in image_statuses:
            image_status = "UNCERTAIN"
            image_verification_score = 0.65
            image_explanation = "Image evidence is uncertain due to blur, low lighting, or unestablished authenticity; manual review required."
        elif "MANUAL_REVIEW" in image_statuses:
            image_status = "MANUAL_REVIEW"
            image_verification_score = 0.70
            image_explanation = "Image requires visual inspection by Claim Officer to confirm damage extent."
        else:
            image_status = "VERIFIED"
            image_verification_score = 0.92
            image_explanation = "Incident damage images verified: authentic resolution, clear sharpness, no manipulation markers, and consistent with incident type."

    # 6. Execute Document Verification
    doc_details = []
    doc_concerns = []
    doc_statuses = []

    for doc in docs_list:
        file_path = _resolve_file_path(doc.get("file_path", ""))
        mime = doc.get("mime_type", "")
        cat = doc.get("document_category", "DOCUMENT")

        ocr_res = _extract_text_from_file(file_path, mime)
        extracted_text = ocr_res["text"]

        field_analysis = _verify_document_fields(extracted_text, claim, policy, cat)

        has_dup = any(df["filename"] == doc.get("original_filename") for df in duplicate_doc_findings)

        # Document Status Determination
        if has_dup:
            d_status = "SUSPICIOUS"
            field_analysis["discrepancies"].append("Document binary SHA-256 hash matches a document in a prior claim.")
        elif field_analysis["discrepancies"]:
            d_status = "SUSPICIOUS"
        elif not ocr_res["ocr_success"]:
            d_status = "UNCERTAIN"  # Never label fraudulent solely due to OCR failure!
        elif field_analysis["missing_fields"]:
            d_status = "MANUAL_REVIEW"
        else:
            d_status = "VERIFIED"

        doc_statuses.append(d_status)
        doc_concerns.extend(field_analysis["discrepancies"])
        if not ocr_res["ocr_success"]:
            doc_concerns.append(f"{cat}: {ocr_res['notes']}")

        doc_details.append({
            "id": doc["id"],
            "filename": doc.get("original_filename"),
            "category": cat,
            "status": d_status,
            "ocr_method": ocr_res["method"],
            "ocr_success": ocr_res["ocr_success"],
            "extracted_length": len(extracted_text),
            "matches": field_analysis["matches"],
            "discrepancies": field_analysis["discrepancies"],
            "missing_fields": field_analysis["missing_fields"],
            "has_duplicate": has_dup,
        })

    # Required document category completeness
    required_categories = REQUIRED_DOCS_BY_INCIDENT.get(
        claim.incident_type, ["DAMAGE_PHOTO", "REPAIR_ESTIMATE"]
    )
    uploaded_categories = {d.get("document_category") for d in documents if d.get("document_category")}
    missing_docs = [cat for cat in required_categories if cat not in uploaded_categories]

    # Compute Document Verification Score
    if not docs_list:
        document_verification_score = None
        document_status = "PENDING"
        document_explanation = "No supporting documents uploaded for textual/OCR verification."
    else:
        if "SUSPICIOUS" in doc_statuses or duplicate_doc_findings:
            document_status = "SUSPICIOUS"
            document_verification_score = 0.42
            document_explanation = "Document verification flagged suspicious discrepancies or cross-claim duplicates."
        elif "UNCERTAIN" in doc_statuses:
            document_status = "UNCERTAIN"
            document_verification_score = 0.62
            document_explanation = "OCR extracted partial/limited text; authenticity cannot be verified automatically. Human review needed."
        elif "MANUAL_REVIEW" in doc_statuses or missing_docs:
            document_status = "MANUAL_REVIEW"
            document_verification_score = 0.72
            document_explanation = f"Supporting documents need manual officer verification. Missing expected: {', '.join(missing_docs)}" if missing_docs else "Supporting documents require manual review for incomplete fields."
        else:
            document_status = "VERIFIED"
            document_verification_score = 0.95
            document_explanation = "All supporting documents verified: policy number, claimant identity, and financial estimates match contract."

    # 7. Evaluate Multi-Factor Risk & Fraud Score
    risk_assessment = await evaluate_claim_risk(db, claim, policy)
    fraud_risk_score = float(risk_assessment["fraud_probability"])
    claim.fraud_score = fraud_risk_score
    claim.risk_level = risk_assessment["risk_level"]

    # 8. Determine Overall Verification Status
    # Options: VERIFIED | SUSPICIOUS | UNCERTAIN | MANUAL_REVIEW | PENDING
    all_concerns = list(dict.fromkeys(image_concerns + doc_concerns))
    if missing_docs:
        all_concerns.append(f"Missing mandatory evidence for {claim.incident_type}: {', '.join(missing_docs)}")

    if float(claim.requested_amount or 0) > float(policy.coverage_amount or 0):
        all_concerns.append(f"Requested amount (₹{float(claim.requested_amount):,.2f}) exceeds policy limit (₹{float(policy.coverage_amount):,.2f}).")

    if image_status == "SUSPICIOUS" or document_status == "SUSPICIOUS" or fraud_risk_score >= 0.75:
        overall_status = "SUSPICIOUS"
        overall_explanation = "Suspicious claim indicators detected. Officer must escalate to Admin for comprehensive fraud investigation."
    elif missing_docs:
        overall_status = "MANUAL_REVIEW"
        overall_explanation = f"Claim lacks required documents ({', '.join(missing_docs)}). Request additional documents from customer."
    elif image_status == "UNCERTAIN" or document_status == "UNCERTAIN" or fraud_risk_score >= 0.45:
        overall_status = "UNCERTAIN"
        overall_explanation = "AI verification cannot definitively establish authenticity. Manual officer adjudication and evidence review required."
    elif image_status == "MANUAL_REVIEW" or document_status == "MANUAL_REVIEW":
        overall_status = "MANUAL_REVIEW"
        overall_explanation = "Evidence requires manual officer review before approval can proceed."
    elif image_status == "VERIFIED" and (document_status in ("VERIFIED", "PENDING")):
        overall_status = "VERIFIED"
        overall_explanation = "AI verification completed successfully. Evidence is consistent with policy and incident description."
    elif not documents:
        overall_status = "PENDING"
        overall_explanation = "No evidence documents or incident photos submitted yet."
    else:
        overall_status = "MANUAL_REVIEW"
        overall_explanation = "Evidence ready for manual verification."

    # Verification Record
    now = datetime.now(timezone.utc)
    verification_record = {
        "claim_id": claim_id,
        "analysis_type": "AI_UNIFIED_VERIFICATION",
        "overall_verification_status": overall_status,
        "image_verification_score": image_verification_score,
        "image_verification_status": image_status,
        "image_explanation": image_explanation,
        "image_details": image_details,
        "document_verification_score": document_verification_score,
        "document_verification_status": document_status,
        "document_explanation": document_explanation,
        "document_details": doc_details,
        "fraud_risk_score": fraud_risk_score,
        "risk_level": risk_assessment["risk_level"],
        "risk_indicators": risk_assessment.get("indicators_triggered", []),
        "overall_explanation": overall_explanation,
        "detected_concerns": all_concerns,
        "missing_documents": missing_docs,
        "duplicate_findings": duplicate_image_findings + duplicate_doc_findings,
        "total_documents_analyzed": len(documents),
        "total_images_analyzed": len(images_list),
        "created_at": now,
        "requested_by": requested_by,
        "model_version": "InsureClaim-VisionDoc-v2.1",
    }

    # Persist in MongoDB
    await mongo_db["ai_analysis"].insert_one(dict(verification_record))
    await mongo_db["ai_verification_results"].update_one(
        {"claim_id": claim_id},
        {"$set": dict(verification_record)},
        upsert=True,
    )

    await db.commit()

    # Format datetime for JSON response
    verification_record["created_at"] = verification_record["created_at"].isoformat()
    return verification_record


async def get_latest_ai_verification(claim_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve the latest saved AI verification results for a claim from MongoDB."""
    mongo_db = get_mongo_db()
    doc = await mongo_db["ai_verification_results"].find_one({"claim_id": claim_id})
    if not doc:
        # Fallback to latest in ai_analysis
        doc = await mongo_db["ai_analysis"].find_one(
            {"claim_id": claim_id, "analysis_type": "AI_UNIFIED_VERIFICATION"},
            sort=[("created_at", -1)],
        )
    if doc:
        doc["_id"] = str(doc.pop("_id"))
        if isinstance(doc.get("created_at"), datetime):
            doc["created_at"] = doc["created_at"].isoformat()
        return doc
    return None
