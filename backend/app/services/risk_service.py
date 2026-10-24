"""
InsureClaim AI — Transparent Preliminary Claim Risk Assessment Service
Evaluates multi-factor insurance risk indicators based on empirical rules,
duplicate submission detection, document content hash matching, and policy checks.
All assessments are clearly labelled decision-support advisories for human officers.
"""

from datetime import date, datetime, timezone, timedelta
from typing import Any, Dict, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_

from app.models.claim import Claim
from app.models.policy import Policy
from app.database.mongodb import get_mongo_db
from app.core.logging_config import get_logger

logger = get_logger(__name__)


def _classify_risk(score: float) -> tuple[str, str]:
    """Map normalized score (0.0 - 1.0) to risk level and officer recommendation."""
    if score <= 0.25:
        return "LOW", "AUTO_PROCESS"
    elif score <= 0.50:
        return "MODERATE", "STANDARD_REVIEW"
    elif score <= 0.75:
        return "HIGH", "MANUAL_REVIEW"
    else:
        return "VERY_HIGH", "FRAUD_INVESTIGATION"


async def evaluate_claim_risk(
    db: AsyncSession,
    claim: Claim,
    policy: Policy,
) -> Dict[str, Any]:
    """
    Perform a multi-point risk indicator audit on an insurance claim.
    Returns structured explanation of all triggered indicators, passed checks,
    hash-based duplicate document findings, and recommended review actions.
    """
    today = date.today()
    indicators: List[Dict[str, Any]] = []
    passed_checks: List[str] = []
    duplicate_docs: List[Dict[str, Any]] = []

    base_score = 0.05  # Standard baseline audit weight

    # ─────────────────────────────────────────────────────────────────────────────
    # Check 1: Mandatory Fields Validation
    # ─────────────────────────────────────────────────────────────────────────────
    if not claim.description or len(claim.description.strip()) < 15:
        indicators.append({
            "code": "INSUFFICIENT_DESCRIPTION",
            "title": "Minimal Incident Description",
            "severity": "WARNING",
            "weight": 0.15,
            "reason": "The provided incident description is unusually brief or vague.",
        })
    else:
        passed_checks.append("Incident description meets minimum detail requirements.")

    # ─────────────────────────────────────────────────────────────────────────────
    # Check 2: Amount Consistency & Coverage Ratio
    # ─────────────────────────────────────────────────────────────────────────────
    req_amount = float(claim.requested_amount or 0)
    coverage = float(policy.coverage_amount or 1)

    if req_amount <= 0:
        indicators.append({
            "code": "INVALID_AMOUNT",
            "title": "Invalid Claim Amount",
            "severity": "CRITICAL",
            "weight": 0.40,
            "reason": "Requested claim amount is zero or negative.",
        })
    elif req_amount > coverage:
        indicators.append({
            "code": "EXCEEDS_POLICY_COVERAGE",
            "title": "Claim Exceeds Coverage Limit",
            "severity": "CRITICAL",
            "weight": 0.35,
            "reason": f"Claim requested (₹{req_amount:,.2f}) exceeds total policy coverage (₹{coverage:,.2f}).",
        })
    else:
        ratio = req_amount / coverage
        if ratio > 0.85:
            indicators.append({
                "code": "HIGH_COVERAGE_UTILIZATION",
                "title": "High Coverage Utilization Ratio",
                "severity": "WARNING",
                "weight": 0.20,
                "reason": f"Claim requested is {ratio * 100:.1f}% of maximum policy limit.",
            })
        else:
            passed_checks.append(f"Requested amount is within normal coverage bounds ({ratio * 100:.1f}% of limit).")

    # ─────────────────────────────────────────────────────────────────────────────
    # Check 3: Incident Date Consistency
    # ─────────────────────────────────────────────────────────────────────────────
    inc_date = claim.incident_date or today
    p_start = policy.start_date
    p_expiry = policy.expiry_date

    if inc_date > today:
        indicators.append({
            "code": "FUTURE_INCIDENT_DATE",
            "title": "Future Incident Date",
            "severity": "CRITICAL",
            "weight": 0.50,
            "reason": f"Reported incident date ({inc_date}) is in the future.",
        })
    elif p_start and inc_date < p_start:
        indicators.append({
            "code": "INCIDENT_PREDATES_POLICY",
            "title": "Incident Pre-dates Policy Start",
            "severity": "CRITICAL",
            "weight": 0.45,
            "reason": f"Incident date ({inc_date}) is before the policy inception date ({p_start}).",
        })
    elif p_expiry and inc_date > p_expiry:
        indicators.append({
            "code": "INCIDENT_AFTER_EXPIRY",
            "title": "Incident Occurred After Expiry",
            "severity": "CRITICAL",
            "weight": 0.45,
            "reason": f"Incident date ({inc_date}) occurred after policy expiry ({p_expiry}).",
        })
    else:
        passed_checks.append("Incident occurred within the active policy term.")

    # Reporting lag
    days_to_report = (today - inc_date).days
    if days_to_report > 30:
        indicators.append({
            "code": "DELAYED_REPORTING",
            "title": "Delayed Claim Submission",
            "severity": "WARNING",
            "weight": 0.15,
            "reason": f"Claim was submitted {days_to_report} days after the incident.",
        })
    elif days_to_report == 0:
        passed_checks.append("Claim submitted promptly on the same day as the incident.")
    else:
        passed_checks.append(f"Reporting turnaround is normal ({days_to_report} days).")

    # Policy maturity (claim filed right after purchasing policy)
    if p_start:
        days_active = (inc_date - p_start).days
        if days_active < 15:
            indicators.append({
                "code": "EARLY_POLICY_CLAIM",
                "title": "Immediate Claim Post-Inception",
                "severity": "WARNING",
                "weight": 0.20,
                "reason": f"Incident occurred only {days_active} day(s) after policy commencement.",
            })
        else:
            passed_checks.append(f"Policy has established tenure ({days_active} days active before incident).")

    # ─────────────────────────────────────────────────────────────────────────────
    # Check 4: Duplicate Submission Detection (Database Query)
    # ─────────────────────────────────────────────────────────────────────────────
    duplicate_query = select(Claim).where(
        Claim.id != claim.id,
        Claim.customer_id == claim.customer_id,
        Claim.policy_id == claim.policy_id,
        or_(
            and_(
                Claim.incident_date == claim.incident_date,
                Claim.status != "REJECTED",
            ),
            and_(
                Claim.requested_amount == claim.requested_amount,
                Claim.created_at >= (datetime.now(timezone.utc) - timedelta(days=30)),
            ),
        ),
    )
    dup_res = await db.execute(duplicate_query)
    potential_duplicates = dup_res.scalars().all()

    if potential_duplicates:
        dup_numbers = [d.claim_number for d in potential_duplicates]
        indicators.append({
            "code": "POTENTIAL_DUPLICATE_CLAIM",
            "title": "Possible Duplicate Claim Submission",
            "severity": "CRITICAL",
            "weight": 0.35,
            "reason": f"Found matching prior claims with identical incident date or amount: {', '.join(dup_numbers)}.",
        })
    else:
        passed_checks.append("No duplicate claim submissions found for this customer and policy.")

    # ─────────────────────────────────────────────────────────────────────────────
    # Check 5: Customer Claim History Velocity
    # ─────────────────────────────────────────────────────────────────────────────
    velocity_query = select(func.count(Claim.id)).where(
        Claim.id != claim.id,
        Claim.customer_id == claim.customer_id,
        Claim.created_at >= (datetime.now(timezone.utc) - timedelta(days=90)),
    )
    recent_claims_count = (await db.execute(velocity_query)).scalar() or 0

    if recent_claims_count >= 3:
        indicators.append({
            "code": "HIGH_CLAIM_VELOCITY",
            "title": "High Recent Claim Frequency",
            "severity": "WARNING",
            "weight": 0.20,
            "reason": f"Customer has submitted {recent_claims_count} other claims within the last 90 days.",
        })
    else:
        passed_checks.append("Customer claim frequency is within standard thresholds.")

    # ─────────────────────────────────────────────────────────────────────────────
    # Check 6: Document Content Hash Duplication (MongoDB)
    # ─────────────────────────────────────────────────────────────────────────────
    try:
        mongo_db = get_mongo_db()
        # Find all documents uploaded for this claim that have a content_hash
        cursor = mongo_db["claim_documents"].find({"claim_id": claim.id, "content_hash": {"$exists": True, "$ne": None}})
        current_docs = await cursor.to_list(length=100)

        if not current_docs:
            indicators.append({
                "code": "NO_DOCUMENTS_ATTACHED",
                "title": "No Supporting Documents Attached",
                "severity": "INFO",
                "weight": 0.05,
                "reason": "Customer has not attached supporting receipts, FIR, or repair estimates.",
            })
        else:
            passed_checks.append(f"{len(current_docs)} supporting document(s) uploaded and hash-verified.")
            for doc in current_docs:
                chash = doc.get("content_hash")
                if chash:
                    # Search across ALL other claims for identical content_hash
                    dup_doc = await mongo_db["claim_documents"].find_one({
                        "claim_id": {"$ne": claim.id},
                        "content_hash": chash,
                    })
                    if dup_doc:
                        duplicate_docs.append({
                            "current_document": doc.get("original_filename"),
                            "matched_claim_id": dup_doc.get("claim_id"),
                            "matched_document": dup_doc.get("original_filename"),
                            "content_hash": chash[:12] + "...",
                        })

            if duplicate_docs:
                indicators.append({
                    "code": "REPEATED_DOCUMENT_CONTENT",
                    "title": "Document Hash Reuse Detected",
                    "severity": "CRITICAL",
                    "weight": 0.35,
                    "reason": f"File '{duplicate_docs[0]['current_document']}' has identical binary SHA-256 hash to a file in claim {duplicate_docs[0]['matched_claim_id']}.",
                })
            else:
                passed_checks.append("All attached file hashes are unique across the repository.")
    except Exception as mongo_err:
        logger.warning(f"Document hash inspection note: {mongo_err}")

    # ─────────────────────────────────────────────────────────────────────────────
    # Aggregate Score & Classification
    # ─────────────────────────────────────────────────────────────────────────────
    total_weight = base_score + sum(ind["weight"] for ind in indicators)
    normalized_score = min(round(total_weight, 4), 0.99)
    risk_level, recommendation = _classify_risk(normalized_score)

    assessment = {
        "claim_id": claim.id,
        "claim_number": claim.claim_number,
        "fraud_probability": normalized_score,
        "risk_level": risk_level,
        "recommendation": recommendation,
        "assessment_method": "RULE_BASED_HEURISTIC_V2",
        "label": "Transparent Multi-Point Risk Indicator Assessment (Rule-Based Decision Support)",
        "indicators_triggered": indicators,
        "passed_checks": passed_checks,
        "duplicate_documents": duplicate_docs,
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "disclaimer": "This risk assessment is strictly advisory and rule-based decision support for authorized claim officers. Claims must never be rejected automatically solely based on risk indicators.",
    }

    # Store assessment in MongoDB
    try:
        mongo_db = get_mongo_db()
        await mongo_db["ai_analysis"].insert_one({
            "claim_id": claim.id,
            "analysis_type": "RISK_INDICATOR_AUDIT",
            "model_version": "rules-heuristic-v2.0",
            "output_data": assessment,
            "created_at": datetime.now(timezone.utc),
        })
    except Exception as mongo_save_err:
        logger.warning(f"Could not persist risk assessment to MongoDB: {mongo_save_err}")

    return assessment
