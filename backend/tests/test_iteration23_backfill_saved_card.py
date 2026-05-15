"""Iteration 23 — Backfill saved-card endpoints (race-condition recovery).

Covers:
  - POST /api/admin/bookings/{id}/backfill-saved-card  (single)
  - POST /api/admin/payments/backfill-saved-cards      (bulk)
  - Auth gates (401 when unauthenticated)
  - 404 unknown booking
  - 400 unpaid / 400 no-session-id / 400 stripe-returned-no-pm
  - Bulk endpoint response shape with seeded TEST_ paid-but-missing-pm booking
  - REGRESSION smoke: /api/quote with stops, /api/admin/bookings list
"""
import os
import asyncio
import uuid
import bcrypt
import pytest
import requests
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "support@turanelitelimo.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "TuronAdmin@2025")

# Pre-existing test booking from prior iterations (unpaid, no saved card)
EXISTING_UNPAID_ID = "5d6c9c49-a7b5-4bd6-97b0-86cbffff288b"

# IDs of test bookings we seed; tracked for cleanup
SEEDED_IDS: list[str] = []


# ---------- Auth fixture (2FA bypass via direct Mongo challenge seed) ----------
@pytest.fixture(scope="module")
def admin_token():
    async def _auth():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        # Step 1: kick off login → server creates a 2FA challenge in Mongo
        r1 = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=20,
        )
        assert r1.status_code == 200, f"admin/login failed: {r1.status_code} {r1.text}"
        body = r1.json()
        # If 2FA returned a challenge_id, overwrite with a known code hash
        cid = body.get("challenge_id")
        if cid:
            code_hash = bcrypt.hashpw(b"123456", bcrypt.gensalt()).decode()
            await db.admin_2fa_challenges.update_one(
                {"challenge_id": cid},
                {"$set": {
                    "code_hash": code_hash,
                    "attempts": 0,
                    "used": False,
                    "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
                }},
            )
            r2 = requests.post(
                f"{BASE_URL}/api/admin/verify-2fa",
                json={"challenge_id": cid, "code": "123456"},
                timeout=20,
            )
            assert r2.status_code == 200, f"verify-2fa failed: {r2.status_code} {r2.text}"
            return r2.json()["token"]
        # No 2FA path — old shape
        return body["token"]

    return asyncio.get_event_loop().run_until_complete(_auth())


@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- Seed/cleanup helpers ----------
async def _seed_paid_booking_missing_pm(payment_session_id: str | None) -> str:
    """Insert a TEST_ paid booking with no saved card, with optional session_id.
    Returns its id."""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    bid = f"TEST_{uuid.uuid4()}"
    cn = f"TEST{int(datetime.now().timestamp()) % 1000000}"
    doc = {
        "id": bid,
        "confirmation_number": cn,
        "email": "test@example.com",
        "full_name": "TEST backfill",
        "phone": "+15555550100",
        "service_type": "to_airport",
        "pickup_date": "2026-12-01",
        "pickup_time": "10:00",
        "pickup_location": "TEST pickup",
        "dropoff_location": "TEST dropoff",
        "passengers": 1,
        "vehicle_type": "sedan",
        "payment_status": "paid",
        "status": "pending",
        "paid_amount": 100.0,
        "paid_currency": "usd",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if payment_session_id is not None:
        doc["payment_session_id"] = payment_session_id
    await db.bookings.insert_one(doc)
    SEEDED_IDS.append(bid)
    return bid


async def _cleanup_seeded():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    if SEEDED_IDS:
        await db.bookings.delete_many({"id": {"$in": SEEDED_IDS}})
        SEEDED_IDS.clear()


@pytest.fixture(scope="module", autouse=True)
def cleanup_after_module():
    yield
    asyncio.get_event_loop().run_until_complete(_cleanup_seeded())


# ============================================================
# Auth gates
# ============================================================
class TestAuthGates:
    def test_single_backfill_requires_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{EXISTING_UNPAID_ID}/backfill-saved-card",
            timeout=20,
        )
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_bulk_backfill_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/admin/payments/backfill-saved-cards", timeout=20)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


# ============================================================
# Single backfill endpoint error paths
# ============================================================
class TestSingleBackfillErrors:
    def test_404_unknown_booking(self, auth_headers):
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/nonexistent-id-xyz/backfill-saved-card",
            headers=auth_headers,
            timeout=20,
        )
        assert r.status_code == 404
        assert "not found" in r.json().get("detail", "").lower()

    def test_400_when_booking_not_paid(self, auth_headers):
        """Use the existing unpaid test booking — should refuse with 400."""
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{EXISTING_UNPAID_ID}/backfill-saved-card",
            headers=auth_headers,
            timeout=20,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
        assert "not paid" in r.json().get("detail", "").lower()

    def test_400_when_no_session_id(self, auth_headers):
        """Paid booking with no payment_session_id and no payment_transactions row → 400."""
        bid = asyncio.get_event_loop().run_until_complete(
            _seed_paid_booking_missing_pm(payment_session_id=None)
        )
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{bid}/backfill-saved-card",
            headers=auth_headers,
            timeout=20,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
        assert "session" in r.json().get("detail", "").lower()

    def test_400_when_stripe_returns_no_pm(self, auth_headers):
        """Paid booking with a bogus session_id → _capture_off_session_ids returns {} → 400."""
        bid = asyncio.get_event_loop().run_until_complete(
            _seed_paid_booking_missing_pm(payment_session_id="cs_test_invalid_fake_session_xyz")
        )
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{bid}/backfill-saved-card",
            headers=auth_headers,
            timeout=30,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"
        detail = r.json().get("detail", "").lower()
        assert "payment_method" in detail or "payment method" in detail or "stripe" in detail


# ============================================================
# Bulk backfill endpoint
# ============================================================
class TestBulkBackfill:
    def test_bulk_returns_proper_shape_and_skips_invalid(self, auth_headers):
        # Seed: one paid booking with no session, one with bogus session
        bid_no_sid = asyncio.get_event_loop().run_until_complete(
            _seed_paid_booking_missing_pm(payment_session_id=None)
        )
        bid_bad_sid = asyncio.get_event_loop().run_until_complete(
            _seed_paid_booking_missing_pm(payment_session_id="cs_test_bogus_xyz")
        )
        r = requests.post(
            f"{BASE_URL}/api/admin/payments/backfill-saved-cards",
            headers=auth_headers,
            timeout=60,
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code} {r.text}"
        data = r.json()
        # Shape assertions
        assert "backfilled_count" in data
        assert "skipped_count" in data
        assert "affected" in data and isinstance(data["affected"], list)
        assert "skipped" in data and isinstance(data["skipped"], list)
        assert isinstance(data["backfilled_count"], int)
        assert isinstance(data["skipped_count"], int)
        # Both seeded bookings should appear in skipped (no real Stripe pm available)
        skipped_ids = {s.get("id") for s in data["skipped"]}
        assert bid_no_sid in skipped_ids, f"seeded no-sid booking missing from skipped: {data['skipped']}"
        assert bid_bad_sid in skipped_ids, f"seeded bad-sid booking missing from skipped: {data['skipped']}"
        # Each skipped entry has id, cn, reason
        for s in data["skipped"]:
            assert "id" in s and "cn" in s and "reason" in s
        # Sanity: skipped reasons mention session or payment_method
        for s in data["skipped"]:
            if s.get("id") == bid_no_sid:
                assert "session" in s["reason"].lower()
            if s.get("id") == bid_bad_sid:
                reason = s["reason"].lower()
                assert "payment_method" in reason or "stripe" in reason or "no payment" in reason


# ============================================================
# Regression smoke — iters 18-22
# ============================================================
class TestRegression:
    def test_quote_with_stops_still_works(self):
        r = requests.post(
            f"{BASE_URL}/api/quote",
            json={
                "pickup_location": "SFO, San Francisco, CA",
                "dropoff_location": "Palo Alto, CA",
                "additional_stops": ["Burlingame, CA"],
                "service_type": "to_airport",
                "pickup_datetime": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            },
            timeout=30,
        )
        assert r.status_code == 200, f"quote failed: {r.status_code} {r.text}"
        data = r.json()
        assert "quotes" in data and isinstance(data["quotes"], list) and len(data["quotes"]) > 0
        assert "distance_miles" in data

    def test_admin_bookings_list_still_works(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/admin/bookings", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_me_still_works(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/admin/me", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body.get("email") == ADMIN_EMAIL

    def test_charge_wait_time_still_gated_on_no_saved_card(self, auth_headers):
        """Existing unpaid test booking — charge-wait-time should refuse (400) since no PM."""
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{EXISTING_UNPAID_ID}/charge-wait-time",
            headers=auth_headers,
            json={"minutes_waited": 10},
            timeout=20,
        )
        # 400 with 'no saved card' or similar
        assert r.status_code in (400, 404), f"expected 400/404, got {r.status_code} {r.text}"
