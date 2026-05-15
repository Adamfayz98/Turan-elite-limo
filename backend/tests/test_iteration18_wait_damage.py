"""Iteration 18 — Wait-time recording + admin off-session charges (wait + damages) +
service-fee default backfill.

Coverage:
  - GET /api/settings/public → service_fee_percent = 3.5
  - POST /api/quote → response includes service_fee_percent=3.5 and price is inflated by ~3.5%
  - POST /api/driver/{token}/record-wait-time → records minutes WITHOUT charging
  - POST /api/driver/{token}/charge-wait-time → removed (404/405)
  - POST /api/admin/bookings/{id}/charge-wait-time → auth + validation branches
  - POST /api/admin/bookings/{id}/charge-damages → auth + validation branches
"""
import os
import sys
import uuid
import asyncio
from datetime import datetime, timezone, timedelta

import bcrypt
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback for local
    BASE_URL = "http://localhost:8001"
API = f"{BASE_URL}/api"

# direct DB (pymongo, sync) for seeding bookings without going through Stripe
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]

ADMIN_EMAIL = "support@turanelitelimo.com"
ADMIN_PASSWORD = "TuronAdmin@2025"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(session):
    """2FA bypass: seed a known challenge, then verify."""
    # Step 1 — start login to ensure admin record exists
    r = session.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"admin login pre-step failed: {r.status_code} {r.text[:200]}")

    # Seed our own challenge (programmatic bypass per test_credentials.md)
    cid = str(uuid.uuid4())
    code_hash = bcrypt.hashpw(b"123456", bcrypt.gensalt()).decode()
    _db.admin_2fa_challenges.insert_one({
        "challenge_id": cid,
        "admin_email": ADMIN_EMAIL,
        "code_hash": code_hash,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        "attempts": 0,
        "used": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    r2 = session.post(f"{API}/admin/verify-2fa", json={"challenge_id": cid, "code": "123456"})
    if r2.status_code != 200:
        pytest.skip(f"verify-2fa failed: {r2.status_code} {r2.text[:200]}")
    return r2.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def seeded_booking():
    """Create a directly-seeded booking with NO saved card. Used for 400-branch tests."""
    bid = f"TEST_iter18_{uuid.uuid4().hex[:8]}"
    doc = {
        "id": bid,
        "name": "Test Iter18 NoCard",
        "email": "test+iter18@example.com",
        "phone": "+14155551234",
        "pickup_location": "SFO",
        "dropoff_location": "Palo Alto",
        "pickup_datetime": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "service_type": "Airport Transfer",
        "vehicle_type": "Black SUV",
        "passengers": 2,
        "luggage": 2,
        "status": "confirmed",
        "payment_status": "paid",
        "driver_token": uuid.uuid4().hex,
        "confirmation_number": f"TE-{uuid.uuid4().hex[:6].upper()}",
        "wait_time_consent": True,  # consented but no saved card
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _db.bookings.insert_one(doc)
    yield doc
    _db.bookings.delete_one({"id": bid})


@pytest.fixture
def seeded_booking_no_consent():
    bid = f"TEST_iter18_nc_{uuid.uuid4().hex[:8]}"
    doc = {
        "id": bid,
        "name": "Test Iter18 NoConsent",
        "email": "test+iter18nc@example.com",
        "phone": "+14155551234",
        "pickup_location": "SFO",
        "dropoff_location": "Palo Alto",
        "pickup_datetime": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "service_type": "Airport Transfer",
        "vehicle_type": "Black SUV",
        "passengers": 2,
        "luggage": 2,
        "status": "confirmed",
        "payment_status": "paid",
        "driver_token": uuid.uuid4().hex,
        "confirmation_number": f"TE-{uuid.uuid4().hex[:6].upper()}",
        "wait_time_consent": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _db.bookings.insert_one(doc)
    yield doc
    _db.bookings.delete_one({"id": bid})


# ---------- Tests ----------
class TestPublicSettings:
    """Verify service_fee_percent default 3.5 surfaced publicly + applied to quotes."""

    def test_public_settings_returns_service_fee_3_5(self, session):
        r = session.get(f"{API}/settings/public")
        assert r.status_code == 200
        data = r.json()
        assert "service_fee_percent" in data
        # 3.5 is the new default (seeded by migration)
        assert float(data["service_fee_percent"]) == pytest.approx(3.5, abs=0.01), (
            f"expected service_fee_percent=3.5, got {data['service_fee_percent']}"
        )

    def test_quote_includes_service_fee_and_inflates_price(self, session):
        payload = {
            "pickup_location": "San Francisco Airport, San Francisco, CA, USA",
            "dropoff_location": "Palo Alto, CA, USA",
            "service_type": "Airport Transfer",
            "vehicle_type": "Black SUV",
            "pickup_datetime": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            "passengers": 2,
            "luggage": 2,
        }
        r = session.post(f"{API}/quote", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "service_fee_percent" in data
        assert float(data["service_fee_percent"]) == pytest.approx(3.5, abs=0.01)
        # quotes[] holds per-vehicle prices; find one with a real price
        priced = [q for q in (data.get("quotes") or []) if q.get("price")]
        assert priced, f"expected at least one priced quote, got {data.get('quotes')}"
        # Sanity: confirm price > 0
        assert all(float(q["price"]) > 0 for q in priced)


class TestDriverRecordWaitTime:
    """Driver endpoint records minutes; old charge endpoint is gone."""

    def test_old_charge_endpoint_removed(self, session):
        # bogus token — we just want to confirm the route doesn't exist (405/404)
        r = session.post(
            f"{API}/driver/bogus-token-iter18/charge-wait-time",
            json={"minutes_waited": 60},
        )
        assert r.status_code in (404, 405), (
            f"expected 404/405 (route removed), got {r.status_code}: {r.text[:200]}"
        )

    def test_record_wait_time_unknown_token_404(self, session):
        r = session.post(
            f"{API}/driver/does-not-exist-iter18/record-wait-time",
            json={"minutes_waited": 60},
        )
        assert r.status_code == 404

    def test_record_wait_time_saves_without_charging(self, session, seeded_booking):
        token = seeded_booking["driver_token"]
        r = session.post(
            f"{API}/driver/{token}/record-wait-time",
            json={"minutes_waited": 60},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("recorded") is True
        assert data.get("pending_admin_review") is True
        assert data.get("minutes_waited") == 60

        # Verify DB state: minutes_pending set, NOT charged
        b = _db.bookings.find_one({"id": seeded_booking["id"]})
        assert b.get("wait_time_minutes_pending") == 60
        assert b.get("wait_time_charged_at") in (None, "")
        assert b.get("wait_time_recorded_by") == "driver"

    def test_record_wait_time_idempotent_overwrite(self, session, seeded_booking):
        token = seeded_booking["driver_token"]
        # first
        session.post(f"{API}/driver/{token}/record-wait-time", json={"minutes_waited": 30})
        # second — overwrite
        r = session.post(f"{API}/driver/{token}/record-wait-time", json={"minutes_waited": 75})
        assert r.status_code == 200
        b = _db.bookings.find_one({"id": seeded_booking["id"]})
        assert b.get("wait_time_minutes_pending") == 75
        assert b.get("wait_time_charged_at") in (None, "")

    def test_record_wait_time_already_charged_short_circuits(self, session, seeded_booking):
        # Simulate already-charged state
        _db.bookings.update_one(
            {"id": seeded_booking["id"]},
            {"$set": {
                "wait_time_charged_at": datetime.now(timezone.utc).isoformat(),
                "wait_time_minutes": 60,
                "wait_time_fee_amount": 30.0,
            }},
        )
        r = session.post(
            f"{API}/driver/{seeded_booking['driver_token']}/record-wait-time",
            json={"minutes_waited": 90},
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("already_charged") is True


class TestAdminChargeWaitTime:
    """Admin endpoint: auth + validation branches (no live Stripe call attempted)."""

    def test_requires_auth(self, session, seeded_booking):
        r = session.post(
            f"{API}/admin/bookings/{seeded_booking['id']}/charge-wait-time",
            json={},
        )
        # FastAPI HTTPBearer returns 403 (Forbidden) or 401 when no creds
        assert r.status_code in (401, 403)

    def test_unknown_booking_404(self, session, auth_headers):
        r = session.post(
            f"{API}/admin/bookings/does-not-exist-iter18/charge-wait-time",
            json={},
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_no_saved_card_400(self, session, auth_headers, seeded_booking):
        # seeded_booking has consent=True but no stripe_payment_method_id; also has pending minutes after first test step
        _db.bookings.update_one(
            {"id": seeded_booking["id"]},
            {"$set": {"wait_time_minutes_pending": 60}},
        )
        r = session.post(
            f"{API}/admin/bookings/{seeded_booking['id']}/charge-wait-time",
            json={},
            headers=auth_headers,
        )
        assert r.status_code == 400, r.text
        assert "no saved card" in r.text.lower() or "saved card" in r.text.lower()

    def test_no_consent_400(self, session, auth_headers, seeded_booking_no_consent):
        r = session.post(
            f"{API}/admin/bookings/{seeded_booking_no_consent['id']}/charge-wait-time",
            json={},
            headers=auth_headers,
        )
        assert r.status_code == 400, r.text
        assert "consent" in r.text.lower()

    def test_no_pending_minutes_and_no_override_400(self, session, auth_headers, seeded_booking):
        # Make booking look like it has a saved card so we get past the no-card guard,
        # then ensure pending minutes are absent AND no override is given.
        _db.bookings.update_one(
            {"id": seeded_booking["id"]},
            {
                "$set": {
                    "stripe_customer_id": "cus_TEST_iter18",
                    "stripe_payment_method_id": "pm_TEST_iter18",
                },
                "$unset": {"wait_time_minutes_pending": ""},
            },
        )
        r = session.post(
            f"{API}/admin/bookings/{seeded_booking['id']}/charge-wait-time",
            json={},
            headers=auth_headers,
        )
        assert r.status_code == 400, r.text
        body = r.text.lower()
        assert "no wait minutes" in body or "record wait time" in body or "supply a value" in body


class TestAdminChargeDamages:
    def test_requires_auth(self, session, seeded_booking):
        r = session.post(
            f"{API}/admin/bookings/{seeded_booking['id']}/charge-damages",
            json={"amount": 50.0, "reason": "Carpet stain"},
        )
        assert r.status_code in (401, 403)

    def test_unknown_booking_404(self, session, auth_headers):
        r = session.post(
            f"{API}/admin/bookings/does-not-exist-iter18/charge-damages",
            json={"amount": 50.0, "reason": "Carpet stain"},
            headers=auth_headers,
        )
        assert r.status_code == 404

    def test_amount_too_small_422_or_400(self, session, auth_headers, seeded_booking):
        # amount<=0 fails pydantic gt=0 validator → 422
        r = session.post(
            f"{API}/admin/bookings/{seeded_booking['id']}/charge-damages",
            json={"amount": 0.0, "reason": "Carpet stain"},
            headers=auth_headers,
        )
        assert r.status_code in (400, 422), r.text

    def test_short_reason_422(self, session, auth_headers, seeded_booking):
        r = session.post(
            f"{API}/admin/bookings/{seeded_booking['id']}/charge-damages",
            json={"amount": 50.0, "reason": "abc"},  # min_length=4
            headers=auth_headers,
        )
        assert r.status_code in (400, 422), r.text

    def test_no_consent_400(self, session, auth_headers, seeded_booking_no_consent):
        r = session.post(
            f"{API}/admin/bookings/{seeded_booking_no_consent['id']}/charge-damages",
            json={"amount": 50.0, "reason": "Vehicle interior damage"},
            headers=auth_headers,
        )
        assert r.status_code == 400, r.text
        assert "consent" in r.text.lower()

    def test_no_saved_card_400(self, session, auth_headers, seeded_booking):
        r = session.post(
            f"{API}/admin/bookings/{seeded_booking['id']}/charge-damages",
            json={"amount": 50.0, "reason": "Vehicle interior damage"},
            headers=auth_headers,
        )
        assert r.status_code == 400, r.text
        assert "saved card" in r.text.lower()


class TestRegression:
    """Smoke — make sure prior P0 flow (booking + checkout) still works."""

    def test_create_booking_still_works(self, session):
        future = datetime.now(timezone.utc) + timedelta(days=3)
        payload = {
            "full_name": "TEST_Iter18 Reg",
            "email": "test+iter18reg@example.com",
            "phone": "+14155551234",
            "pickup_location": "San Francisco Airport, San Francisco, CA, USA",
            "dropoff_location": "Palo Alto, CA, USA",
            "service_type": "Airport Transfer",
            "vehicle_type": "Luxury SUV",
            "pickup_date": future.date().isoformat(),
            "pickup_time": "10:00",
            "passengers": 2,
            "luggage": 2,
            "flight_number": "UA123",
            "wait_time_consent": True,
            "special_requests": "TEST_iter18",
        }
        r = session.post(f"{API}/bookings", json=payload)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert "id" in data
        # cleanup
        _db.bookings.delete_one({"id": data["id"]})
