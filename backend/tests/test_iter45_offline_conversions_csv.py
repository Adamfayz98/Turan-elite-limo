"""Iteration 45 — Google Ads Offline Conversion CSV exporter.

Tests:
  * /api/admin/ads/offline-conversions/preview (admin auth required)
  * /api/admin/ads/offline-conversions.csv (admin auth required, Google format)

Seeds a synthetic booking with utm.gclid='TEST-GCLID-XYZ', verifies it appears
in CSV with correct columns/format, then cleans up.
"""
import os
import re
import csv
import io
import jwt
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fall back to reading frontend env directly
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                break

# Read backend env directly (avoid relying on process env in test session)
JWT_SECRET = None
MONGO_URL = None
DB_NAME = None
with open("/app/backend/.env") as f:
    for line in f:
        line = line.strip()
        if line.startswith("JWT_SECRET="):
            JWT_SECRET = line.split("=", 1)[1].strip().strip('"')
        elif line.startswith("MONGO_URL="):
            MONGO_URL = line.split("=", 1)[1].strip().strip('"')
        elif line.startswith("DB_NAME="):
            DB_NAME = line.split("=", 1)[1].strip().strip('"')

assert BASE_URL, "REACT_APP_BACKEND_URL not configured"
assert JWT_SECRET, "JWT_SECRET not configured"
assert MONGO_URL and DB_NAME, "MongoDB env not configured"

ADMIN_EMAIL = "support@turanelitelimo.com"
SEED_ID = "it45-csv-test"


def _mint_admin_token() -> str:
    payload = {
        "sub": ADMIN_EMAIL,
        "role": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


@pytest.fixture(scope="module")
def admin_token():
    return _mint_admin_token()


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture
def seeded_booking(db):
    """Insert a synthetic paid booking with a gclid; clean up after test."""
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": SEED_ID,
        "payment_status": "paid",
        "status": "confirmed",
        "utm": {"gclid": "TEST-GCLID-XYZ", "source_bucket": "google_ads"},
        "amount_paid": 300,
        "stripe_paid_at": now_iso,
        "created_at": now_iso,
        "confirmation_number": "TEST-IT45",
    }
    db.bookings.delete_one({"id": SEED_ID})
    db.bookings.insert_one(doc)
    yield doc
    db.bookings.delete_one({"id": SEED_ID})


# ---------- AUTH ----------

class TestAuth:
    def test_preview_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/ads/offline-conversions/preview?days=30")
        assert r.status_code == 401, r.text

    def test_csv_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/ads/offline-conversions.csv?days=30")
        assert r.status_code == 401, r.text


# ---------- PREVIEW ----------

class TestPreview:
    def test_preview_basic_shape(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/ads/offline-conversions/preview?days=30",
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("days", "paid_bookings", "rows_with_gclid", "skipped_no_gclid", "total_value"):
            assert k in data, f"missing key {k}"
        assert data["days"] == 30
        assert isinstance(data["paid_bookings"], int)
        assert isinstance(data["rows_with_gclid"], int)

    def test_preview_with_seed_counts_row(self, auth_headers, seeded_booking):
        r = requests.get(
            f"{BASE_URL}/api/admin/ads/offline-conversions/preview?days=30",
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        # at least our seed must be counted
        assert data["rows_with_gclid"] >= 1
        assert data["paid_bookings"] >= 1
        # Total value at minimum >= 300 (our seed)
        assert data["total_value"] >= 300.0


# ---------- CSV ----------

class TestCsv:
    def test_csv_headers_and_format_with_seed(self, auth_headers, seeded_booking):
        r = requests.get(
            f"{BASE_URL}/api/admin/ads/offline-conversions.csv?days=30",
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        # Content-Type
        assert "text/csv" in r.headers.get("content-type", "").lower()
        # Content-Disposition
        cd = r.headers.get("content-disposition", "")
        assert "google-ads-offline-conversions-" in cd
        assert re.search(r'filename="google-ads-offline-conversions-\d{4}-\d{2}-\d{2}\.csv"', cd), cd
        # Custom headers
        assert "x-rows-written" in {k.lower() for k in r.headers.keys()}
        assert int(r.headers["x-rows-written"]) >= 1
        assert "x-skipped-no-gclid" in {k.lower() for k in r.headers.keys()}
        assert "x-skipped-unpaid" in {k.lower() for k in r.headers.keys()}

        text = r.text
        lines = text.splitlines()
        # Line 1: Parameters:TimeZone=...
        assert lines[0].startswith("Parameters:TimeZone=America/Los_Angeles"), lines[0]
        # Line 2: blank
        assert lines[1].strip() == "", repr(lines[1])
        # Line 3: column header
        assert lines[2] == "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency", lines[2]
        # Find our seed row
        seed_row = None
        reader = csv.reader(io.StringIO("\n".join(lines[2:])))
        rows = list(reader)
        header = rows[0]
        for row in rows[1:]:
            if row and row[0] == "TEST-GCLID-XYZ":
                seed_row = dict(zip(header, row))
                break
        assert seed_row is not None, f"seed row not found in CSV; rows={rows[1:5]}"
        assert seed_row["Conversion Name"] == "Purchase"
        assert seed_row["Conversion Value"] == "300.00"
        assert seed_row["Conversion Currency"] == "USD"
        # Conversion Time format: YYYY-MM-DD HH:MM:SS±HH:MM (colon in offset)
        ct = seed_row["Conversion Time"]
        assert re.match(r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$", ct), ct

    def test_csv_conversion_name_override(self, auth_headers, seeded_booking):
        r = requests.get(
            f"{BASE_URL}/api/admin/ads/offline-conversions.csv?days=30&conversion_name=Lead",
            headers=auth_headers,
        )
        assert r.status_code == 200
        lines = r.text.splitlines()
        reader = csv.reader(io.StringIO("\n".join(lines[2:])))
        rows = list(reader)
        header = rows[0]
        seed_row = None
        for row in rows[1:]:
            if row and row[0] == "TEST-GCLID-XYZ":
                seed_row = dict(zip(header, row))
                break
        assert seed_row is not None
        assert seed_row["Conversion Name"] == "Lead"

    def test_csv_excludes_unpaid_and_no_gclid(self, db, auth_headers):
        """Insert two extra bookings (one no gclid, one not paid) and verify they're excluded but counted."""
        now_iso = datetime.now(timezone.utc).isoformat()
        no_gclid = {
            "id": "it45-no-gclid",
            "payment_status": "paid",
            "utm": {"source_bucket": "google_ads"},  # no gclid
            "amount_paid": 100,
            "stripe_paid_at": now_iso,
            "created_at": now_iso,
        }
        unpaid_gclid = {
            "id": "it45-unpaid",
            "payment_status": "pending",
            "utm": {"gclid": "UNPAID-GCLID"},
            "amount_paid": 0,
            "created_at": now_iso,
        }
        db.bookings.delete_one({"id": "it45-no-gclid"})
        db.bookings.delete_one({"id": "it45-unpaid"})
        db.bookings.insert_one(no_gclid)
        db.bookings.insert_one(unpaid_gclid)
        try:
            r = requests.get(
                f"{BASE_URL}/api/admin/ads/offline-conversions.csv?days=30",
                headers=auth_headers,
            )
            assert r.status_code == 200
            # The "unpaid_gclid" row should NOT appear
            assert "UNPAID-GCLID" not in r.text
            # Skip counters should reflect at least 1 each
            assert int(r.headers["x-skipped-no-gclid"]) >= 1
            assert int(r.headers["x-skipped-unpaid"]) >= 1

            # Preview counts should match same logic
            p = requests.get(
                f"{BASE_URL}/api/admin/ads/offline-conversions/preview?days=30",
                headers=auth_headers,
            )
            pdata = p.json()
            assert pdata["skipped_no_gclid"] >= 1
        finally:
            db.bookings.delete_one({"id": "it45-no-gclid"})
            db.bookings.delete_one({"id": "it45-unpaid"})

    def test_csv_days_validation_clamps(self, auth_headers):
        """Out-of-range days should clamp (1-365) and not 500."""
        r = requests.get(
            f"{BASE_URL}/api/admin/ads/offline-conversions.csv?days=9999",
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        r = requests.get(
            f"{BASE_URL}/api/admin/ads/offline-conversions.csv?days=0",
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
