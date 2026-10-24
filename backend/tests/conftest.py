"""
InsureClaim AI — Pytest Fixtures and Test Setup
Configures TestClient and pre-authenticated tokens for Customer, Officer, and Admin roles.
"""

import pytest
from starlette.testclient import TestClient
from app.main import app


@pytest.fixture(scope="session")
def client():
    """
    Session-wide TestClient that manages FastAPI lifespan
    (connecting to PostgreSQL and MongoDB).
    """
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def admin_headers(client):
    """
    Returns Authorization headers for the system Administrator.
    """
    res = client.post(
        "/api/auth/login",
        json={"email": "admin@insureclaim.com", "password": "Admin@1234"},
    )
    assert res.status_code == 200, f"Admin login failed: {res.text}"
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def officer_headers(client):
    """
    Returns Authorization headers for Claim Officer 1.
    """
    res = client.post(
        "/api/auth/login",
        json={"email": "officer1@insureclaim.com", "password": "Officer@1234"},
    )
    assert res.status_code == 200, f"Officer login failed: {res.text}"
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def customer_headers(client):
    """
    Returns Authorization headers for seeded customer Amit Sharma.
    """
    res = client.post(
        "/api/auth/login",
        json={"email": "amit@example.com", "password": "Customer@1234"},
    )
    assert res.status_code == 200, f"Customer login failed: {res.text}"
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
