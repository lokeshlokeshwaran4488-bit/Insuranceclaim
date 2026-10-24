"""
Tests for Reports Summary, CSV Data Export, and Formula Injection Prevention.
"""

from app.routers.reports import sanitize_csv_cell


def test_sanitize_csv_cell_formula_injection():
    """
    Test CSV formula injection prevention:
    Cells beginning with =, +, -, @, \t, or \r must be prefixed with an apostrophe.
    """
    assert sanitize_csv_cell("=1+2") == "'=1+2"
    assert sanitize_csv_cell("+cmd|' /C calc'!A0") == "'+cmd|' /C calc'!A0"
    assert sanitize_csv_cell("-5+2") == "'-5+2"
    assert sanitize_csv_cell("@SUM(1,2)") == "'@SUM(1,2)"
    assert sanitize_csv_cell("\tmalicious") == "'\tmalicious"
    # Normal safe strings must remain untouched
    assert sanitize_csv_cell("CLAIM-2026-001") == "CLAIM-2026-001"
    assert sanitize_csv_cell("Amit Sharma") == "Amit Sharma"
    assert sanitize_csv_cell(12345.50) == "12345.5"
    assert sanitize_csv_cell(None) == ""


def test_reports_summary_endpoint(client, officer_headers):
    """
    Verify /api/reports/summary returns genuine aggregated metrics.
    """
    res = client.get("/api/reports/summary", headers=officer_headers)
    assert res.status_code == 200
    data = res.json()
    assert "total_claims" in data
    assert "by_status" in data
    assert "avg_processing_days" in data
    assert "approval_rate_percent" in data
    assert "rejection_rate_percent" in data


def test_claims_csv_export_endpoint(client, officer_headers):
    """
    Verify /api/reports/claims/export-csv returns text/csv with attachment header.
    """
    res = client.get("/api/reports/claims/export-csv", headers=officer_headers)
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "attachment" in res.headers.get("content-disposition", "")
    lines = res.text.strip().split("\r\n")
    if len(lines) == 1:
        lines = res.text.strip().split("\n")
    assert len(lines) >= 1
    # Check header columns
    header = lines[0]
    assert "Claim Number" in header
    assert "Customer Name" in header
    assert "Requested Amount" in header


def test_settlements_csv_export_endpoint(client, admin_headers):
    """
    Verify /api/reports/settlements/export-csv returns text/csv (Admin role required).
    """
    res = client.get("/api/reports/settlements/export-csv", headers=admin_headers)
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "Settlement ID" in res.text
