"""
Tests for Health Check, Database Connectivity, and Secrets Redaction.
"""

def test_health_check_status_and_services(client):
    """
    Verify /api/health returns HTTP 200 with both Postgres and MongoDB connected.
    """
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] in ("healthy", "degraded")
    assert data["app"] == "InsureClaim AI"

    # PostgreSQL checks
    services = data.get("services", {})
    assert "postgres" in services
    assert services["postgres"]["status"] == "connected"
    assert "latency_ms" in services["postgres"]
    assert services["postgres"]["latency_ms"] >= 0

    # MongoDB checks
    assert "mongodb" in services
    assert services["mongodb"]["status"] == "connected"
    assert "latency_ms" in services["mongodb"]
    assert services["mongodb"]["latency_ms"] >= 0
    assert "collections" in services["mongodb"]
    assert "claim_documents" in services["mongodb"]["collections"]


def test_health_check_secrets_not_exposed(client):
    """
    Verify /api/health never leaks connection passwords or secret URIs.
    """
    res = client.get("/api/health")
    content = res.text.lower()
    assert "password" not in content
    assert "secret" not in content
    assert "mongodb+srv://" not in content
    assert "postgres://" not in content
