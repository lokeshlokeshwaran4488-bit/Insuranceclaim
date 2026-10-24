"""
Tests for Claim Submission, Lifecycle Status Transitions, and Role Restrictions.
"""

import uuid
import pytest


def test_customer_claim_creation_and_timeline(client, customer_headers, officer_headers):
    """
    End-to-end claim lifecycle test:
    Customer fetches policies -> submits claim -> views timeline ->
    Officer starts formal review -> Officer requests documents -> Officer approves claim.
    """
    # 1. Customer fetches policies
    pol_res = client.get("/api/policies/my-policies", headers=customer_headers)
    assert pol_res.status_code == 200
    policies = pol_res.json()
    assert len(policies) > 0, "Seeded customer has no policies"
    policy_id = policies[0]["id"]

    # 2. Customer submits claim
    claim_payload = {
        "policy_id": policy_id,
        "incident_type": "VEHICLE_ACCIDENT",
        "incident_date": "2026-03-10",
        "incident_time": "14:30",
        "incident_location": "Connaught Place, New Delhi",
        "description": "Front fender and headlight cracked in parking lot collision.",
        "requested_amount": 18500.0,
    }
    create_res = client.post("/api/claims", json=claim_payload, headers=customer_headers)
    assert create_res.status_code == 201, f"Claim creation failed: {create_res.text}"
    claim = create_res.json()
    claim_id = claim["id"]
    assert claim["status"] == "DRAFT"
    assert claim["requested_amount"] == 18500.0

    # 2b. Customer submits claim
    sub_res = client.post(f"/api/claims/{claim_id}/submit", headers=customer_headers)
    assert sub_res.status_code == 200
    assert sub_res.json()["status"] == "SUBMITTED"

    # 3. Customer checks timeline
    timeline_res = client.get(f"/api/claims/{claim_id}/timeline", headers=customer_headers)
    assert timeline_res.status_code == 200
    timeline = timeline_res.json()
    assert len(timeline) >= 1

    # 4. Officer initiates review
    review_res = client.post(f"/api/claims/{claim_id}/start-review", headers=officer_headers)
    assert review_res.status_code == 200
    assert review_res.json()["status"] == "UNDER_OFFICER_REVIEW"

    # 5. Officer requests documents
    doc_req_res = client.post(
        f"/api/claims/{claim_id}/request-documents",
        json={
            "document_types": ["REPAIR_ESTIMATE", "DAMAGE_PHOTO"],
            "message": "Please attach authorized garage estimation.",
            "deadline_days": 7,
        },
        headers=officer_headers,
    )
    assert doc_req_res.status_code == 200
    assert doc_req_res.json()["status"] == "ADDITIONAL_DOCUMENTS_REQUIRED"

    # 6. Officer adds note
    note_res = client.post(
        f"/api/claims/{claim_id}/notes",
        json={"remarks": "Customer contacted via phone to confirm damage extent.", "is_internal": True},
        headers=officer_headers,
    )
    assert note_res.status_code in (200, 201)

    # 7. Officer approves claim
    approve_res = client.post(
        f"/api/claims/{claim_id}/approve",
        json={"approved_amount": 17000.0, "approval_notes": "Estimated parts approved per policy guidelines."},
        headers=officer_headers,
    )
    assert approve_res.status_code == 200
    approved_claim = approve_res.json()
    assert approved_claim["status"] == "APPROVED"
    assert approved_claim["approved_amount"] == 17000.0


def test_cross_customer_claim_isolation(client, customer_headers):
    """
    Security test: Customer B must NEVER access Customer A's private claim.
    """
    # 1. Register Customer B
    unique_email = f"cust_b_{uuid.uuid4().hex[:8]}@example.com"
    reg_res = client.post(
        "/api/auth/register",
        json={
            "full_name": "Customer B",
            "email": unique_email,
            "password": "Password@123",
        },
    )
    assert reg_res.status_code == 201
    login_res = client.post(
        "/api/auth/login",
        json={"email": unique_email, "password": "Password@123"},
    )
    cust_b_token = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

    # 2. Get customer A's claims
    cust_a_claims_res = client.get("/api/claims", headers=customer_headers)
    assert cust_a_claims_res.status_code == 200
    claims = cust_a_claims_res.json()["claims"]
    if claims:
        target_claim_id = claims[0]["id"]
        # Customer B tries to view Customer A's claim
        unauthorized_res = client.get(f"/api/claims/{target_claim_id}", headers=cust_b_token)
        assert unauthorized_res.status_code in (403, 404), (
            f"Security flaw: Customer B accessed Customer A's claim! Status: {unauthorized_res.status_code}"
        )
