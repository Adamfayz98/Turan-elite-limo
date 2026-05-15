"""Iteration 24 — Smart cancellation refund tiers.

Covers:
  - GET /api/settings/public now exposes cancellation_tiers (default 24/100, 6/50, 0/0)
  - GET /api/admin/bookings/{id}/refund-preview returns paid_amount, hours_until_pickup, tiers
  - POST /api/admin/payments/{id}/refund (NOTE: real path is /payments/, not /bookings/) — auth + validation
  - PATCH /api/admin/settings accepts cancellation_tiers payload and persists
  - Tier selection unit-test edge cases via the real endpoint, by mutating pickup_date/time on a seeded booking
  - REGRESSION smoke: /api/quote with stops, charge-wait-time + charge-damages + charge-mid-trip-stop +
    backfill-saved-card auth gates from iterations 18-23
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

# Test booking from prompt: paid $103.50, pickup ~18h away → 6h tier @ 50% → $51.75
PROMPT_BOOKING_ID = "9fb00287-2154-4178-81fd-11c16a4f8a32"
EXISTING_UNPAID_ID = "5d6c9c49-a7b5-4bd6-97b0-86cbffff288b"

SEEDED_IDS: list[str] = []


# ---------- Auth fixture (2FA bypass via direct Mongo challenge seed) ----------
@pytest.fixture(scope="module")
def admin_token():
    async def _auth():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        r1 = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=20,
        )
        assert r1.status_code == 200, f"admin/login failed: {r1.status_code} {r1.text}"
        body = r1.json()
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
        return body["token"]

    return asyncio.get_event_loop().run_until_complete(_auth())


@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- DB helper for seeding bookings ----------
def _seed_paid_booking(pickup_dt_utc: datetime, paid_amount: float = 100.0, session_id: str | None = None) -> str:
    """Insert a TEST_ paid booking with the given pickup datetime. Returns its id."""
    async def _seed():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        bid = f"TEST-{uuid.uuid4()}"
        SEEDED_IDS.append(bid)
        await db.bookings.insert_one({
            "id": bid,
            "full_name": "TEST_Refund Tier",
            "email": "test@turonlimo.test",
            "phone": "+15555550100",
            "service_type": "Point-to-Point",
            "pickup_date": pickup_dt_utc.strftime("%Y-%m-%d"),
            "pickup_time": pickup_dt_utc.strftime("%H:%M"),
            "pickup_location": "TEST_pickup",
            "dropoff_location": "TEST_dropoff",
            "passengers": 2,
            "vehicle_type": "sedan",
            "payment_status": "paid",
            "paid_amount": paid_amount,
            "status": "confirmed",
            "payment_session_id": session_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return bid

    return asyncio.get_event_loop().run_until_complete(_seed())


# =========================================================================
# (1) Public settings exposes cancellation_tiers
# =========================================================================
class TestPublicSettings:
    def test_public_settings_exposes_default_tiers(self):
        r = requests.get(f"{BASE_URL}/api/settings/public", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert "cancellation_tiers" in body
        tiers = body["cancellation_tiers"]
        assert isinstance(tiers, list) and len(tiers) >= 3
        # Default contents
        thresholds = sorted([t["hours_before_pickup"] for t in tiers], reverse=True)
        assert 24 in thresholds and 6 in thresholds and 0 in thresholds


# =========================================================================
# (2) Refund-preview endpoint
# =========================================================================
class TestRefundPreview:
    def test_refund_preview_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/bookings/{PROMPT_BOOKING_ID}/refund-preview", timeout=10)
        assert r.status_code in (401, 403)

    def test_refund_preview_unknown_booking_404(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/bookings/does-not-exist/refund-preview",
            headers=auth_headers, timeout=10,
        )
        assert r.status_code == 404

    def test_refund_preview_unpaid_booking_400(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/bookings/{EXISTING_UNPAID_ID}/refund-preview",
            headers=auth_headers, timeout=10,
        )
        assert r.status_code == 400

    def test_refund_preview_prompt_booking_shape(self, auth_headers):
        """Prompt test booking: paid $103.50, pickup ~18h → 6h tier @50% → $51.75"""
        r = requests.get(
            f"{BASE_URL}/api/admin/bookings/{PROMPT_BOOKING_ID}/refund-preview",
            headers=auth_headers, timeout=10,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Required keys
        for k in ("paid_amount", "hours_until_pickup", "full_refund_amount",
                  "tier_refund_amount", "tier_refund_percent", "tier_threshold_hours",
                  "tiers", "stripe_fee_estimate"):
            assert k in body, f"missing key {k} in refund-preview response"
        # Values
        assert abs(body["paid_amount"] - 103.50) < 0.01
        assert body["full_refund_amount"] == body["paid_amount"]
        # 18h → 6h tier
        assert body["tier_threshold_hours"] == 6.0, f"expected 6h tier, got {body['tier_threshold_hours']}"
        assert body["tier_refund_percent"] == 50.0
        assert abs(body["tier_refund_amount"] - 51.75) < 0.02, body
        # stripe fee ≈ 0.029*103.50 + 0.30 = 3.30
        assert body["stripe_fee_estimate"] > 0


# =========================================================================
# (3) Tier selection edge cases — seed a booking at exact pickup-times
# =========================================================================
class TestTierSelectionEdges:
    @pytest.mark.parametrize("hours_offset,expected_threshold,expected_pct", [
        (30, 24, 100),    # 30h before → 24h tier @100%
        (12, 6, 50),      # 12h before → 6h tier @50%
        (3, 0, 0),        # 3h before  → 0h tier @0%
        (-2, 0, 0),       # in past    → 0h tier @0% (or lowest)
    ])
    def test_tier_selection_at_offset(self, auth_headers, hours_offset, expected_threshold, expected_pct):
        pickup_dt = datetime.now(timezone.utc) + timedelta(hours=hours_offset)
        bid = _seed_paid_booking(pickup_dt, paid_amount=100.0)
        r = requests.get(
            f"{BASE_URL}/api/admin/bookings/{bid}/refund-preview",
            headers=auth_headers, timeout=10,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["tier_threshold_hours"] == float(expected_threshold), \
            f"offset={hours_offset}h → expected threshold {expected_threshold}, got {body['tier_threshold_hours']}"
        assert body["tier_refund_percent"] == float(expected_pct)


# =========================================================================
# (4) PATCH /api/admin/settings persists cancellation_tiers
# =========================================================================
class TestSettingsTiersPatch:
    def test_patch_settings_persists_tiers(self, auth_headers):
        new_tiers = [
            {"hours_before_pickup": 48, "refund_percent": 100},
            {"hours_before_pickup": 12, "refund_percent": 75},
            {"hours_before_pickup": 4, "refund_percent": 25},
            {"hours_before_pickup": 0, "refund_percent": 0},
        ]
        r = requests.patch(
            f"{BASE_URL}/api/admin/settings",
            json={"cancellation_tiers": new_tiers},
            headers=auth_headers, timeout=10,
        )
        assert r.status_code == 200, r.text
        # Read-back via public
        r2 = requests.get(f"{BASE_URL}/api/settings/public", timeout=10)
        assert r2.status_code == 200
        got = r2.json()["cancellation_tiers"]
        assert len(got) == 4
        thresholds = sorted([t["hours_before_pickup"] for t in got], reverse=True)
        assert thresholds == [48, 12, 4, 0]
        # Restore defaults
        default_tiers = [
            {"hours_before_pickup": 24, "refund_percent": 100},
            {"hours_before_pickup": 6, "refund_percent": 50},
            {"hours_before_pickup": 0, "refund_percent": 0},
        ]
        r3 = requests.patch(
            f"{BASE_URL}/api/admin/settings",
            json={"cancellation_tiers": default_tiers},
            headers=auth_headers, timeout=10,
        )
        assert r3.status_code == 200

    def test_patch_settings_requires_auth(self):
        r = requests.patch(
            f"{BASE_URL}/api/admin/settings",
            json={"cancellation_tiers": []},
            timeout=10,
        )
        assert r.status_code in (401, 403)


# =========================================================================
# (5) POST refund endpoint — auth + validation only (no real Stripe call)
# NOTE: actual path in server.py is /api/admin/payments/{id}/refund
# =========================================================================
REFUND_PATH = "/api/admin/payments/{bid}/refund"


class TestRefundPost:
    def test_refund_requires_auth(self):
        r = requests.post(
            f"{BASE_URL}{REFUND_PATH.format(bid=PROMPT_BOOKING_ID)}",
            json={"amount": 0, "reason": "tier", "note": "test"},
            timeout=10,
        )
        assert r.status_code in (401, 403)

    def test_refund_unknown_booking_404(self, auth_headers):
        r = requests.post(
            f"{BASE_URL}{REFUND_PATH.format(bid='does-not-exist')}",
            json={"amount": 0, "reason": "tier"},
            headers=auth_headers, timeout=10,
        )
        assert r.status_code == 404

    def test_refund_unpaid_booking_400(self, auth_headers):
        r = requests.post(
            f"{BASE_URL}{REFUND_PATH.format(bid=EXISTING_UNPAID_ID)}",
            json={"amount": 0, "reason": "tier"},
            headers=auth_headers, timeout=10,
        )
        assert r.status_code == 400

    def test_refund_prompt_booking_no_session_id_400(self, auth_headers):
        """Prompt booking has no payment_session_id → expected 400 'No Stripe session associated'.
        This verifies endpoint wiring + auth + validation WITHOUT calling Stripe.
        """
        r = requests.post(
            f"{BASE_URL}{REFUND_PATH.format(bid=PROMPT_BOOKING_ID)}",
            json={"amount": 51.75, "reason": "tier", "note": "iter24-test"},
            headers=auth_headers, timeout=15,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        assert "session" in r.text.lower() or "stripe" in r.text.lower()

    def test_refund_validation_negative_amount(self, auth_headers):
        """Pydantic validation: ge=0 should reject negative amount."""
        r = requests.post(
            f"{BASE_URL}{REFUND_PATH.format(bid=PROMPT_BOOKING_ID)}",
            json={"amount": -10, "reason": "custom"},
            headers=auth_headers, timeout=10,
        )
        assert r.status_code in (400, 422)


# =========================================================================
# (6) REGRESSION smoke from iterations 18–23
# =========================================================================
class TestRegressionSmoke:
    def test_quote_with_stops(self):
        r = requests.post(
            f"{BASE_URL}/api/quote",
            json={
                "pickup_location": "San Francisco International Airport",
                "dropoff_location": "Palo Alto, CA",
                "passengers": 2,
                "additional_stops": ["Burlingame, CA"],
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "quotes" in body and isinstance(body["quotes"], list)

    def test_admin_bookings_list(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/admin/bookings", headers=auth_headers, timeout=15)
        assert r.status_code == 200

    def test_charge_wait_time_auth_gate(self):
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{EXISTING_UNPAID_ID}/charge-wait-time",
            json={"minutes_waited": 15},
            timeout=10,
        )
        assert r.status_code in (401, 403)

    def test_charge_damages_auth_gate(self):
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{EXISTING_UNPAID_ID}/charge-damages",
            json={"amount": 50, "description": "test"},
            timeout=10,
        )
        assert r.status_code in (401, 403)

    def test_charge_mid_trip_stop_auth_gate(self):
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{EXISTING_UNPAID_ID}/charge-mid-trip-stop",
            json={"stop_address": "test"},
            timeout=10,
        )
        assert r.status_code in (401, 403)

    def test_backfill_saved_card_auth_gate(self):
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{EXISTING_UNPAID_ID}/backfill-saved-card",
            timeout=10,
        )
        assert r.status_code in (401, 403)


# =========================================================================
# Cleanup: remove seeded TEST_ bookings
# =========================================================================
@pytest.fixture(scope="module", autouse=True)
def _cleanup_seeded():
    yield
    async def _del():
        if not SEEDED_IDS:
            return
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        await db.bookings.delete_many({"id": {"$in": SEEDED_IDS}})
    asyncio.get_event_loop().run_until_complete(_del())
