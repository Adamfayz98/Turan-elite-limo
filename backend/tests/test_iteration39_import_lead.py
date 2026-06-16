"""
Iteration 39: Off-platform lead import (LLM extraction + commit endpoints).

Covers:
- POST /api/admin/quote-requests/import-lead (LLM extraction + risk scoring)
- POST /api/admin/quote-requests/import-lead/commit (creates quote_request row)
- GET  /api/admin/quote-requests (row appears with source + risk_band)
- DELETE /api/admin/quote-requests/{id} (cleanup)
- Regression: POST /api/admin/safety/risk-check (Spencer green)
"""

import os
import jwt
import pytest
import requests
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://limo-experience-1.preview.emergentagent.com").rstrip("/")
JWT_SECRET = os.environ["JWT_SECRET"]

SPENCER_TEXT = (
    "I need a bus for 17 people (8 adults, 9 kids aged 6 to 12) on June 27, 2026. "
    "It is a round trip. Pick up is at 1pm at Mayacama in Santa Rosa; destination "
    "is 4902 Redwood Road in Napa; departure from 4902 Redwood Road is at 4pm, "
    "with dropoff again at Mayacama."
)


@pytest.fixture(scope="module")
def admin_token():
    return jwt.encode(
        {
            "sub": "support@turanelitelimo.com",
            "role": "admin",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
        JWT_SECRET,
        algorithm="HS256",
    )


@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json",
    })
    return s


@pytest.fixture(scope="module")
def parsed_lead(admin_client):
    """Run LLM extraction once, share for downstream tests."""
    r = admin_client.post(
        f"{BASE_URL}/api/admin/quote-requests/import-lead",
        json={"source": "yelp", "raw_text": SPENCER_TEXT},
        timeout=30,
    )
    assert r.status_code == 200, f"LLM extraction failed: {r.status_code} {r.text}"
    return r.json()


# ---- Extraction ----

class TestImportLeadExtraction:
    def test_extraction_returns_structured_payload(self, parsed_lead):
        assert "extracted" in parsed_lead
        assert "risk" in parsed_lead
        assert parsed_lead.get("source") == "yelp"

    def test_extracted_passengers(self, parsed_lead):
        assert parsed_lead["extracted"].get("passengers") == 17

    def test_extracted_pickup_date(self, parsed_lead):
        assert parsed_lead["extracted"].get("pickup_date") == "2026-06-27"

    def test_extracted_pickup_time(self, parsed_lead):
        assert parsed_lead["extracted"].get("pickup_time") == "13:00"

    def test_extracted_pickup_location_contains_mayacama(self, parsed_lead):
        pickup = (parsed_lead["extracted"].get("pickup_location") or "").lower()
        assert "mayacama" in pickup, f"Pickup did not contain Mayacama: {pickup!r}"

    def test_extracted_dropoff_location_contains_address(self, parsed_lead):
        dropoff = (parsed_lead["extracted"].get("dropoff_location") or "").lower()
        assert "4902 redwood" in dropoff, f"Dropoff missing address: {dropoff!r}"

    def test_risk_band_green(self, parsed_lead):
        assert parsed_lead["risk"].get("band") == "green", parsed_lead["risk"]


# ---- Edge cases on extraction ----

class TestImportLeadEdgeCases:
    def test_empty_raw_text_returns_400(self, admin_client):
        r = admin_client.post(
            f"{BASE_URL}/api/admin/quote-requests/import-lead",
            json={"source": "yelp", "raw_text": ""},
            timeout=15,
        )
        assert r.status_code == 400

    def test_too_long_raw_text_returns_400(self, admin_client):
        r = admin_client.post(
            f"{BASE_URL}/api/admin/quote-requests/import-lead",
            json={"source": "yelp", "raw_text": "a" * 8001},
            timeout=15,
        )
        assert r.status_code == 400

    def test_unauthenticated_returns_401(self):
        r = requests.post(
            f"{BASE_URL}/api/admin/quote-requests/import-lead",
            json={"source": "yelp", "raw_text": SPENCER_TEXT},
            timeout=15,
        )
        # 401 unauth, or 403 forbidden depending on dep
        assert r.status_code in (401, 403)


# ---- Commit ----

class TestImportLeadCommit:
    def test_commit_no_contact_returns_400(self, admin_client):
        r = admin_client.post(
            f"{BASE_URL}/api/admin/quote-requests/import-lead/commit",
            json={"source": "yelp", "fields": {"full_name": "", "phone": "", "email": ""}},
            timeout=15,
        )
        assert r.status_code == 400

    def test_commit_creates_row_and_appears_in_list(self, admin_client, parsed_lead):
        extracted = dict(parsed_lead["extracted"])
        extracted["full_name"] = "Spencer Pahlke"
        extracted["phone"] = "4155184873"

        # commit
        commit_r = admin_client.post(
            f"{BASE_URL}/api/admin/quote-requests/import-lead/commit",
            json={"source": "yelp", "fields": extracted, "raw_text": SPENCER_TEXT},
            timeout=20,
        )
        assert commit_r.status_code == 200, commit_r.text
        body = commit_r.json()
        assert body.get("ok") is True
        new_id = body["id"]
        qr = body["quote_request"]
        assert qr["source"] == "yelp"
        assert qr.get("risk_band") == "green"
        assert qr["full_name"] == "Spencer Pahlke"
        assert qr["phone"] == "4155184873"
        assert qr["pickup_date"] == "2026-06-27"
        assert qr["pickup_time"] == "13:00"
        assert qr.get("passengers") == 17

        # appears in list
        list_r = admin_client.get(f"{BASE_URL}/api/admin/quote-requests", timeout=15)
        assert list_r.status_code == 200
        items = list_r.json()
        match = next((x for x in items if x.get("id") == new_id), None)
        assert match is not None, "Newly committed quote_request did not appear in list"
        assert match["source"] == "yelp"
        assert match["risk_band"] == "green"
        assert "mayacama" in (match.get("pickup_location") or "").lower()

        # cleanup
        del_r = admin_client.delete(
            f"{BASE_URL}/api/admin/quote-requests/{new_id}", timeout=10
        )
        assert del_r.status_code in (200, 204)


# ---- Regression: Quick Risk Check (Iter 38) still works ----

class TestRiskCheckRegression:
    def test_spencer_risk_check_green(self, admin_client):
        r = admin_client.post(
            f"{BASE_URL}/api/admin/safety/risk-check",
            json={"full_name": "Spencer Pahlke", "phone": "4155184873"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("band") == "green"
        assert data.get("score", 100) < 30
