"""
XGBoost fraud detection model for insurance claims.
Features engineered from claim data to predict fraud probability.
"""

import os
import numpy as np
from typing import Optional
from pathlib import Path
from app.core.logging_config import get_logger

logger = get_logger(__name__)

MODEL_PATH = Path(__file__).parent / "model_weights" / "fraud_model.pkl"

_model = None  # Lazy-loaded


def _load_model():
    """Load the XGBoost model from disk (lazy)."""
    global _model
    if _model is not None:
        return _model

    if not MODEL_PATH.exists():
        logger.warning("XGBoost fraud model not found. Using heuristic scoring.")
        return None

    try:
        import joblib
        _model = joblib.load(MODEL_PATH)
        logger.info(f"XGBoost fraud model loaded from {MODEL_PATH}")
        return _model
    except Exception as e:
        logger.error(f"Failed to load XGBoost model: {e}")
        return None


def _get_risk_level(probability: float) -> str:
    """Map fraud probability to risk category."""
    if probability <= 0.25:
        return "LOW"
    elif probability <= 0.50:
        return "MODERATE"
    elif probability <= 0.75:
        return "HIGH"
    else:
        return "VERY_HIGH"


def _get_recommendation(risk_level: str) -> str:
    """Map risk level to processing recommendation."""
    mapping = {
        "LOW": "AUTO_PROCESS",
        "MODERATE": "STANDARD_REVIEW",
        "HIGH": "MANUAL_REVIEW",
        "VERY_HIGH": "FRAUD_INVESTIGATION",
    }
    return mapping.get(risk_level, "MANUAL_REVIEW")


def compute_fraud_score(claim_features: dict) -> dict:
    """
    Compute fraud probability for a claim.

    Expected features:
    - claim_amount: float
    - policy_coverage: float
    - amount_ratio: float (claim_amount / policy_coverage)
    - days_since_policy_start: int
    - days_to_report: int (days between incident and submission)
    - previous_claims_count: int
    - previous_fraud_flags: int
    - document_count: int
    - incident_type_encoded: int (0-4)
    - customer_age_days: int

    Returns:
    {
        "fraud_probability": 0.78,
        "risk_level": "HIGH",
        "recommendation": "MANUAL_REVIEW",
        "factors": [...],
        "model_version": "xgboost-v1.0"
    }
    """
    model = _load_model()

    if model is None:
        # Heuristic fallback scoring
        return _heuristic_fraud_score(claim_features)

    try:
        # Prepare feature vector
        features = np.array([[
            claim_features.get("claim_amount", 0),
            claim_features.get("policy_coverage", 100000),
            claim_features.get("amount_ratio", 0.5),
            claim_features.get("days_since_policy_start", 365),
            claim_features.get("days_to_report", 1),
            claim_features.get("previous_claims_count", 0),
            claim_features.get("previous_fraud_flags", 0),
            claim_features.get("document_count", 0),
            claim_features.get("incident_type_encoded", 0),
            claim_features.get("customer_age_days", 365),
        ]], dtype=np.float32)

        probability = float(model.predict_proba(features)[0][1])
        risk_level = _get_risk_level(probability)

        return {
            "fraud_probability": round(probability, 4),
            "risk_level": risk_level,
            "recommendation": _get_recommendation(risk_level),
            "factors": _get_risk_factors(claim_features),
            "model_version": "xgboost-v1.0",
        }

    except Exception as e:
        logger.error(f"XGBoost prediction failed: {e}")
        return _heuristic_fraud_score(claim_features)


def _heuristic_fraud_score(features: dict) -> dict:
    """
    Rule-based heuristic scoring when XGBoost model is not available.
    Based on industry-standard fraud indicators.
    """
    score = 0.1  # Base score
    risk_factors = []

    amount_ratio = features.get("amount_ratio", 0.5)
    if amount_ratio > 0.9:
        score += 0.25
        risk_factors.append("Claim amount is very close to policy coverage limit")
    elif amount_ratio > 0.7:
        score += 0.10
        risk_factors.append("High claim-to-coverage ratio")

    days_to_report = features.get("days_to_report", 1)
    if days_to_report == 0:
        score += 0.10
        risk_factors.append("Claim submitted same day as incident")
    elif days_to_report > 30:
        score += 0.15
        risk_factors.append("Significant delay in reporting incident")

    previous_claims = features.get("previous_claims_count", 0)
    if previous_claims > 5:
        score += 0.20
        risk_factors.append("High number of previous claims")
    elif previous_claims > 2:
        score += 0.10
        risk_factors.append("Multiple previous claims")

    fraud_flags = features.get("previous_fraud_flags", 0)
    if fraud_flags > 0:
        score += 0.30
        risk_factors.append("Customer has previous fraud flags")

    days_policy = features.get("days_since_policy_start", 365)
    if days_policy < 30:
        score += 0.15
        risk_factors.append("Claim submitted very shortly after policy start")

    doc_count = features.get("document_count", 0)
    if doc_count == 0:
        score += 0.10
        risk_factors.append("No supporting documents uploaded")

    probability = min(score, 0.99)
    risk_level = _get_risk_level(probability)

    return {
        "fraud_probability": round(probability, 4),
        "risk_level": risk_level,
        "recommendation": _get_recommendation(risk_level),
        "factors": risk_factors,
        "model_version": "heuristic-v1.0",
    }


def _get_risk_factors(features: dict) -> list:
    """Generate human-readable risk factor descriptions."""
    factors = []
    if features.get("amount_ratio", 0) > 0.8:
        factors.append("High claim-to-coverage ratio")
    if features.get("previous_fraud_flags", 0) > 0:
        factors.append("Previous fraud indicators on record")
    if features.get("days_since_policy_start", 999) < 60:
        factors.append("Recent policy — claim filed soon after start")
    if features.get("previous_claims_count", 0) > 3:
        factors.append("Multiple prior claims")
    if features.get("days_to_report", 1) > 14:
        factors.append("Delayed incident reporting")
    return factors


def prepare_claim_features(claim, policy, customer_claims_count: int = 0) -> dict:
    """
    Prepare feature dictionary from claim, policy, and customer history.
    Called before running fraud scoring.
    """
    from datetime import date

    today = date.today()

    claim_amount = float(claim.requested_amount or 0)
    coverage = float(policy.coverage_amount or 1)
    amount_ratio = claim_amount / coverage if coverage > 0 else 0

    # Days since policy started
    policy_start = policy.start_date if hasattr(policy.start_date, 'toordinal') else today
    days_since_policy = (today - policy_start).days

    # Days between incident and submission
    incident_date = claim.incident_date if claim.incident_date else today
    days_to_report = (today - incident_date).days

    incident_encoding = {
        "Motor Vehicle Accident": 0,
        "Natural Disaster": 1,
        "Theft": 2,
        "Medical Emergency": 3,
        "Property Damage": 4,
    }.get(claim.incident_type, 5)

    return {
        "claim_amount": claim_amount,
        "policy_coverage": coverage,
        "amount_ratio": amount_ratio,
        "days_since_policy_start": days_since_policy,
        "days_to_report": days_to_report,
        "previous_claims_count": customer_claims_count,
        "previous_fraud_flags": 0,  # Would be from customer profile in production
        "document_count": 0,  # Updated after doc upload
        "incident_type_encoded": incident_encoding,
        "customer_age_days": 365,  # Would be from customer profile
    }
