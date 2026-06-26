"""
Iteration 43 — Affiliate Payments Tracker & 1099 Prep backend tests.

Covers:
- Affiliate CRUD with new tax/1099 fields (legal_name, tax_id, tax_classification,
  w9_received, mailing_address)
- AffiliatePayment CRUD (POST/GET/PATCH/DELETE)
- Validation (method, payment_date)
- Filters (year/affiliate_id/method) + sort desc
- Summary endpoint (grand_total + per-affiliate rows)
- Ledger CSV export
- 1099 prep CSV export (corporation exclusion logic)
- Route-ordering correctness: PATCH /payments/{id} must NOT hit affiliate handler
- AuthN: 401 without bearer token
- paid_ytd populated on GET /affiliates
"""
from __future__ import annotations

import csv
import io
import os
import time
import uuid
from datetime import datetime, timezone

import jwt
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://limo-experience-1.preview.emergentagent.com").rstrip("/")
JWT_SECRET = "d5b4e1a3c8f47921e6b3d9f1c2a4e7891f5d6c8b3a2e9f1d4c7b8a5e2f1d9c8b"
ADMIN_EMAIL = "support@turanelitelimo.com"
CUR_YEAR = datetime.now(timezone.utc).year


def _mint_admin_token() -> str:
    payload = {
        "sub": ADMIN_EMAIL,
        "role": "admin",
        "type": "access",
        "exp": int(time.time()) + 3600,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


@pytest.fixture(scope="session")
def auth_headers():
    return {"Authorization": f"Bearer {_mint_admin_token()}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def created_ids():
    """Tracks created affiliate ids + payment ids for teardown."""
    return {"affiliates": [], "payments": []}


@pytest.fixture(scope="session", autouse=True)
def cleanup(auth_headers, created_ids):
    yield
    # Delete payments
    for pid in created_ids["payments"]:
        try:
            requests.delete(f"{BASE_URL}/api/admin/affiliates/payments/{pid}", headers=auth_headers, timeout=10)
        except Exception:
            pass
    # Soft-delete affiliates
    for aid in created_ids["affiliates"]:
        try:
            requests.delete(f"{BASE_URL}/api/admin/affiliates/{aid}", headers=auth_headers, timeout=10)
        except Exception:
            pass


# ---- auth -----------------------------------------------------------------

def test_payments_endpoint_requires_auth():
    r = requests.get(f"{BASE_URL}/api/admin/affiliates/payments", timeout=10)
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


def test_create_payment_requires_auth():
    r = requests.post(
        f"{BASE_URL}/api/admin/affiliates/payments",
        json={"affiliate_id": "x", "amount": 1, "payment_date": "2026-01-01", "method": "Zelle"},
        timeout=10,
    )
    assert r.status_code in (401, 403)


# ---- affiliate w/ tax fields ----------------------------------------------

def test_create_affiliate_with_tax_fields(auth_headers, created_ids):
    payload = {
        "name": f"TEST_Affiliate {uuid.uuid4().hex[:6]}",
        "phone": "+15555550100",
        "email": "test_aff@example.com",
        "city": "Sacramento",
        "service_areas": ["Sacramento"],
        "vehicle_types": ["Sedan"],
        "legal_name": "TEST Legal Name LLC",
        "tax_id": "12-3456789",
        "tax_classification": "Single-Member LLC",
        "w9_received": True,
        "mailing_address": "123 Main St\nSacramento, CA 95814",
    }
    r = requests.post(f"{BASE_URL}/api/admin/affiliates", json=payload, headers=auth_headers, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    data = r.json()
    assert data["legal_name"] == "TEST Legal Name LLC"
    assert data["tax_id"] == "12-3456789"
    assert data["tax_classification"] == "Single-Member LLC"
    assert data["w9_received"] is True
    assert "Sacramento" in (data["mailing_address"] or "")
    assert data["paid_ytd"] == 0.0
    created_ids["affiliates"].append(data["id"])
    created_ids["affiliate_main"] = data["id"]
    created_ids["affiliate_main_name"] = data["name"]


def test_patch_affiliate_updates_tax_fields(auth_headers, created_ids):
    aid = created_ids["affiliate_main"]
    r = requests.patch(
        f"{BASE_URL}/api/admin/affiliates/{aid}",
        json={"tax_classification": "C-Corp", "w9_received": False},
        headers=auth_headers,
        timeout=10,
    )
    assert r.status_code == 200, r.text
    assert r.json()["tax_classification"] == "C-Corp"
    # restore so 1099 logic test below can use a non-corp default
    r2 = requests.patch(
        f"{BASE_URL}/api/admin/affiliates/{aid}",
        json={"tax_classification": "Single-Member LLC", "w9_received": True},
        headers=auth_headers,
        timeout=10,
    )
    assert r2.status_code == 200


def test_create_second_corporation_affiliate(auth_headers, created_ids):
    """Create a second affiliate flagged as S-Corp to verify 1099 exclusion logic."""
    payload = {
        "name": f"TEST_CorpAff {uuid.uuid4().hex[:6]}",
        "city": "San Jose",
        "tax_classification": "S-Corp",
        "legal_name": "TEST Corp Inc.",
        "tax_id": "98-7654321",
        "w9_received": True,
    }
    r = requests.post(f"{BASE_URL}/api/admin/affiliates", json=payload, headers=auth_headers, timeout=10)
    assert r.status_code == 200
    created_ids["affiliates"].append(r.json()["id"])
    created_ids["affiliate_corp"] = r.json()["id"]


# ---- payment validation ---------------------------------------------------

def test_create_payment_invalid_method_rejected(auth_headers, created_ids):
    r = requests.post(
        f"{BASE_URL}/api/admin/affiliates/payments",
        json={
            "affiliate_id": created_ids["affiliate_main"],
            "amount": 100,
            "payment_date": "2026-01-15",
            "method": "Bitcoin",
        },
        headers=auth_headers,
        timeout=10,
    )
    assert r.status_code == 400, r.text


def test_create_payment_invalid_date_rejected(auth_headers, created_ids):
    r = requests.post(
        f"{BASE_URL}/api/admin/affiliates/payments",
        json={
            "affiliate_id": created_ids["affiliate_main"],
            "amount": 100,
            "payment_date": "02/15/2026",
            "method": "Zelle",
        },
        headers=auth_headers,
        timeout=10,
    )
    assert r.status_code == 400


def test_create_payment_unknown_affiliate_404(auth_headers):
    r = requests.post(
        f"{BASE_URL}/api/admin/affiliates/payments",
        json={
            "affiliate_id": "non-existent-id-xyz",
            "amount": 50,
            "payment_date": "2026-02-01",
            "method": "Zelle",
        },
        headers=auth_headers,
        timeout=10,
    )
    assert r.status_code == 404


# ---- payment CRUD ---------------------------------------------------------

def test_create_payments_success(auth_headers, created_ids):
    aid_main = created_ids["affiliate_main"]
    aid_corp = created_ids["affiliate_corp"]
    payments = [
        {"affiliate_id": aid_main, "amount": 400, "payment_date": f"{CUR_YEAR}-01-10", "method": "Zelle", "reference": "Z-001"},
        {"affiliate_id": aid_main, "amount": 350.50, "payment_date": f"{CUR_YEAR}-03-22", "method": "Venmo", "reference": "V-002"},
        {"affiliate_id": aid_corp, "amount": 1200, "payment_date": f"{CUR_YEAR}-02-15", "method": "Check", "reference": "C-100"},
        # Payment in a different year (last year) — should be excluded by year filter
        {"affiliate_id": aid_main, "amount": 999, "payment_date": f"{CUR_YEAR-1}-12-30", "method": "Wire"},
    ]
    ids = []
    for p in payments:
        r = requests.post(f"{BASE_URL}/api/admin/affiliates/payments", json=p, headers=auth_headers, timeout=10)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert body["amount"] == p["amount"]
        assert body["method"] == p["method"]
        assert body["affiliate_name"]  # snapshot populated
        ids.append(body["id"])
    created_ids["payments"].extend(ids)
    created_ids["payment_main_1"] = ids[0]
    created_ids["payment_main_2"] = ids[1]
    created_ids["payment_corp"] = ids[2]
    created_ids["payment_lastyear"] = ids[3]


def test_list_payments_filter_by_year_sorted_desc(auth_headers, created_ids):
    r = requests.get(f"{BASE_URL}/api/admin/affiliates/payments?year={CUR_YEAR}", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    items = r.json()
    # Make sure our payments are present and last-year payment is NOT
    our_ids = {created_ids["payment_main_1"], created_ids["payment_main_2"], created_ids["payment_corp"]}
    found_ids = {p["id"] for p in items}
    assert our_ids.issubset(found_ids)
    assert created_ids["payment_lastyear"] not in found_ids
    # Sort: payment_date desc
    relevant = [p for p in items if p["id"] in our_ids]
    dates = [p["payment_date"] for p in relevant]
    assert dates == sorted(dates, reverse=True)


def test_list_payments_filter_by_affiliate_and_method(auth_headers, created_ids):
    aid = created_ids["affiliate_main"]
    r = requests.get(
        f"{BASE_URL}/api/admin/affiliates/payments?year={CUR_YEAR}&affiliate_id={aid}&method=Zelle",
        headers=auth_headers,
        timeout=10,
    )
    assert r.status_code == 200
    items = r.json()
    assert all(p["affiliate_id"] == aid and p["method"] == "Zelle" for p in items)
    assert any(p["id"] == created_ids["payment_main_1"] for p in items)


def test_patch_payment_updates_fields(auth_headers, created_ids):
    pid = created_ids["payment_main_1"]
    r = requests.patch(
        f"{BASE_URL}/api/admin/affiliates/payments/{pid}",
        json={"amount": 425.75, "notes": "Updated note", "reference": "Z-001-UPD"},
        headers=auth_headers,
        timeout=10,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["amount"] == 425.75
    assert body["notes"] == "Updated note"
    assert body["reference"] == "Z-001-UPD"
    # Verify via list/GET
    r2 = requests.get(f"{BASE_URL}/api/admin/affiliates/payments?year={CUR_YEAR}", headers=auth_headers, timeout=10)
    pl = [p for p in r2.json() if p["id"] == pid][0]
    assert pl["amount"] == 425.75
    assert pl["reference"] == "Z-001-UPD"


def test_route_ordering_patch_payments_does_not_hit_affiliate(auth_headers, created_ids):
    """Regression: PATCH /admin/affiliates/payments/{id} must NOT match
    /admin/affiliates/{affiliate_id}. If route ordering is wrong the affiliate
    handler would treat the payment_id as an affiliate_id and 404 (or worse,
    update an affiliate). Verify the payment was actually updated."""
    pid = created_ids["payment_main_2"]
    r = requests.patch(
        f"{BASE_URL}/api/admin/affiliates/payments/{pid}",
        json={"method": "ACH"},
        headers=auth_headers,
        timeout=10,
    )
    assert r.status_code == 200, f"Wrong route hit, body: {r.text}"
    body = r.json()
    # If affiliate handler was hit, it wouldn't return these payment fields
    assert "method" in body and body["method"] == "ACH"
    assert "affiliate_id" in body
    assert "payment_date" in body
    # And the affiliate document was not modified to have a 'method' field
    r2 = requests.get(f"{BASE_URL}/api/admin/affiliates?include_inactive=true", headers=auth_headers, timeout=10)
    affs = r2.json()
    main_aff = [a for a in affs if a["id"] == created_ids["affiliate_main"]][0]
    assert "method" not in main_aff  # affiliate model has no method field


def test_paid_ytd_populated_in_list_affiliates(auth_headers, created_ids):
    r = requests.get(f"{BASE_URL}/api/admin/affiliates?include_inactive=true", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    affs = r.json()
    main_aff = [a for a in affs if a["id"] == created_ids["affiliate_main"]][0]
    # main_1 (425.75 after update) + main_2 (350.50) = 776.25
    assert main_aff["paid_ytd"] == pytest.approx(776.25, abs=0.01), f"got {main_aff['paid_ytd']}"


def test_payments_summary(auth_headers, created_ids):
    r = requests.get(f"{BASE_URL}/api/admin/affiliates/payments/summary?year={CUR_YEAR}", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "grand_total" in data
    assert "rows" in data
    aid_main = created_ids["affiliate_main"]
    aid_corp = created_ids["affiliate_corp"]
    rows_by_id = {r_["affiliate_id"]: r_ for r_ in data["rows"]}
    assert rows_by_id[aid_main]["total"] == pytest.approx(776.25, abs=0.01)
    assert rows_by_id[aid_main]["count"] == 2
    assert rows_by_id[aid_corp]["total"] == pytest.approx(1200.0, abs=0.01)
    # sorted desc — corp row should come before main
    sorted_totals = [r_["total"] for r_ in data["rows"]]
    assert sorted_totals == sorted(sorted_totals, reverse=True)


def test_export_ledger_csv(auth_headers, created_ids):
    r = requests.get(
        f"{BASE_URL}/api/admin/affiliates/payments/export.csv?year={CUR_YEAR}",
        headers=auth_headers,
        timeout=15,
    )
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    assert "attachment" in r.headers.get("content-disposition", "").lower()
    rows = list(csv.reader(io.StringIO(r.text)))
    header = rows[0]
    # Schema check (spec says columns include these)
    for col in ["Payment Date", "Method", "Reference", "Booking ID", "Booking Label", "Notes", "Recorded By", "Recorded At"]:
        assert any(col in h for h in header), f"Missing column {col} in header {header}"
    # Our payments must be in there
    body_text = r.text
    assert "Z-001-UPD" in body_text or "V-002" in body_text


def test_export_1099_csv(auth_headers, created_ids):
    r = requests.get(
        f"{BASE_URL}/api/admin/affiliates/payments/1099-csv?year={CUR_YEAR}&threshold=600",
        headers=auth_headers,
        timeout=15,
    )
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    rows = list(csv.reader(io.StringIO(r.text)))
    header = rows[0]
    for col in ["Vendor (DBA)", "Legal Name", "Tax ID", "Tax Classification", "W-9 Received", "Mailing Address", "City", "Phone", "Email"]:
        assert any(col in h for h in header), f"missing {col}"
    # Find our main affiliate row (Single-Member LLC, total 776.25 > 600 → Yes)
    main_name = created_ids["affiliate_main_name"]
    # Find the corp row (S-Corp, total 1200 > 600 but is corp → No)
    name_idx = next(i for i, h in enumerate(header) if "Vendor" in h)
    req_idx = next(i for i, h in enumerate(header) if "1099 Required" in h)
    main_row = next((row for row in rows[1:] if row[name_idx] == main_name), None)
    corp_row = next((row for row in rows[1:] if "TEST_CorpAff" in row[name_idx]), None)
    assert main_row is not None, "Main affiliate missing from 1099 CSV"
    assert corp_row is not None, "Corp affiliate missing from 1099 CSV"
    assert main_row[req_idx] == "Yes", f"LLC >$600 should be Yes, got {main_row[req_idx]}"
    assert corp_row[req_idx] == "No", f"S-Corp should be No regardless of total, got {corp_row[req_idx]}"


def test_delete_payment_404_for_nonexistent(auth_headers):
    r = requests.delete(f"{BASE_URL}/api/admin/affiliates/payments/nonexistent-pid", headers=auth_headers, timeout=10)
    assert r.status_code == 404


def test_delete_payment_success(auth_headers, created_ids):
    pid = created_ids["payment_lastyear"]
    r = requests.delete(f"{BASE_URL}/api/admin/affiliates/payments/{pid}", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    created_ids["payments"].remove(pid)
    # Confirm gone by attempting another delete
    r2 = requests.delete(f"{BASE_URL}/api/admin/affiliates/payments/{pid}", headers=auth_headers, timeout=10)
    assert r2.status_code == 404
