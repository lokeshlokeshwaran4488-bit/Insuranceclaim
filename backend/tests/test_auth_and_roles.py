"""
Tests for Authentication, Token Handling, and Role-Based Access Control.
"""

import uuid


def test_customer_registration_success(client):
    """
    Test standard customer registration with valid credentials.
    """
    unique_email = f"cust_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "full_name": "Test Customer",
        "email": unique_email,
        "password": "Password@123",
        "phone": "+919876543210",
    }
    res = client.post("/api/auth/register", json=payload)
    assert res.status_code == 201, f"Registration failed: {res.text}"
    data = res.json()
    assert data["email"] == unique_email
    assert data["role"] == "CUSTOMER"


def test_privilege_escalation_prevention(client):
    """
    Security test: Attempt to register as ADMIN. The system MUST force the role to CUSTOMER.
    """
    unique_email = f"hacker_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "full_name": "Privilege Escalation Attempt",
        "email": unique_email,
        "password": "Password@123",
        "role": "ADMIN",  # Attacker attempts to become admin
    }
    res = client.post("/api/auth/register", json=payload)
    assert res.status_code == 201
    data = res.json()
    # Must be forced to CUSTOMER
    assert data["role"] == "CUSTOMER", "CRITICAL SECURITY FLAW: User registered as ADMIN via public registration!"


def test_login_invalid_credentials(client):
    """
    Verify login failure with incorrect credentials returns 401.
    """
    res = client.post(
        "/api/auth/login",
        json={"email": "admin@insureclaim.com", "password": "WrongPassword!"},
    )
    assert res.status_code == 401
    assert "detail" in res.json()


def test_role_enforcement_customer_denied_admin_endpoint(client, customer_headers):
    """
    Verify customer token is rejected with HTTP 403 on Admin analytics endpoint.
    """
    res = client.get("/api/admin/analytics/dashboard", headers=customer_headers)
    assert res.status_code == 403


def test_admin_access_allowed_on_admin_endpoint(client, admin_headers):
    """
    Verify admin token can access Admin analytics dashboard.
    """
    res = client.get("/api/admin/analytics/dashboard", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert "total_claims" in data
    assert "pending_claims" in data
