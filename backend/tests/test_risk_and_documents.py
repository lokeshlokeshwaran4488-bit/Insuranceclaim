"""
Tests for Document Upload Security, SHA-256 Hashing, AI Summarization, and Preliminary Risk Indicators.
"""

import hashlib
import io


def test_file_upload_security_disguised_file_blocked(client, customer_headers):
    """
    Security test: Uploading an executable/arbitrary script renamed as .pdf
    MUST be rejected by magic byte inspection.
    """
    # 1. Fetch a claim eligible for document upload
    claims_res = client.get("/api/claims", headers=customer_headers)
    assert claims_res.status_code == 200
    eligible_claims = [
        c for c in claims_res.json()["claims"]
        if c["status"] in ("DRAFT", "SUBMITTED", "UNDER_OFFICER_REVIEW", "ADDITIONAL_DOCUMENTS_REQUIRED")
    ]
    assert len(eligible_claims) > 0, "No eligible active claim found for upload"
    claim_id = eligible_claims[0]["id"]

    # 2. Fake PDF with text payload (no %PDF header)
    fake_pdf = io.BytesIO(b"echo 'malicious script'; rm -rf /")
    files = {"file": ("malicious.pdf", fake_pdf, "application/pdf")}
    data = {"document_category": "OTHER"}

    res = client.post(f"/api/claims/{claim_id}/documents", files=files, data=data, headers=customer_headers)
    assert res.status_code == 400
    assert "content does not match" in res.text.lower() or "invalid" in res.text.lower()


def test_file_upload_valid_pdf_with_sha256(client, customer_headers):
    """
    Upload a genuine PDF and verify SHA-256 content hash is recorded in response.
    """
    claims_res = client.get("/api/claims", headers=customer_headers)
    eligible_claims = [
        c for c in claims_res.json()["claims"]
        if c["status"] in ("DRAFT", "SUBMITTED", "UNDER_OFFICER_REVIEW", "ADDITIONAL_DOCUMENTS_REQUIRED")
    ]
    assert len(eligible_claims) > 0, "No eligible active claim found for upload"
    claim_id = eligible_claims[0]["id"]

    valid_pdf_bytes = b"%PDF-1.4\n%Fake PDF content for test\n%%EOF"
    expected_hash = hashlib.sha256(valid_pdf_bytes).hexdigest()

    file_obj = io.BytesIO(valid_pdf_bytes)
    files = {"file": ("test_doc.pdf", file_obj, "application/pdf")}
    data = {"document_category": "REPAIR_ESTIMATE"}

    res = client.post(f"/api/claims/{claim_id}/documents", files=files, data=data, headers=customer_headers)
    assert res.status_code == 201, f"Valid PDF upload failed: {res.text}"
    doc = res.json()
    assert doc["original_filename"] == "test_doc.pdf"
    assert doc["content_hash"] == expected_hash


def test_preliminary_risk_indicators_evaluation(client, officer_headers):
    """
    Verify /api/ai/fraud-score evaluates transparent risk indicators and persists to MongoDB.
    """
    claims_res = client.get("/api/claims?page_size=1", headers=officer_headers)
    claim_id = claims_res.json()["claims"][0]["id"]

    res = client.post("/api/ai/fraud-score", json={"claim_id": claim_id}, headers=officer_headers)
    assert res.status_code == 200, f"Fraud scoring failed: {res.text}"
    risk_data = res.json()
    assert "fraud_score" in risk_data
    assert "risk_level" in risk_data
    assert "indicators" in risk_data
    assert "model" in risk_data
    assert 0.0 <= risk_data["fraud_score"] <= 1.0


def test_ai_claim_summary_generation_and_fallback(client, officer_headers):
    """
    Verify /api/ai/claim-summary returns structured summary (using GPT or fallback parser).
    """
    claims_res = client.get("/api/claims?page_size=1", headers=officer_headers)
    claim_id = claims_res.json()["claims"][0]["id"]

    res = client.post("/api/ai/claim-summary", json={"claim_id": claim_id}, headers=officer_headers)
    assert res.status_code == 200, f"Claim summary failed: {res.text}"
    ai_data = res.json()
    assert "claim_id" in ai_data
    assert "summary" in ai_data
    assert len(ai_data["summary"]) > 0
