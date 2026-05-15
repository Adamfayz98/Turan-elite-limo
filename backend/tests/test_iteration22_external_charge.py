"""
Iteration 22 — Round 5 polish: Admin "Mark as charged externally" manual-charge endpoints.

Covers 3 new endpoints (all require admin auth, no Stripe call):
- POST /api/admin/bookings/{id}/mark-wait-time-external
- POST /api/admin/bookings/{id}/mark-mid-trip-stop-external
- POST /api/admin/bookings/{id}/mark-damage-external

Each test verifies:
  * 401 without auth
  * 404 for unknown booking id
  * validation errors (missing/short fields)
  * idempotency where applicable
  * DB persistence side-effects via re-fetch of admin bookings list
  * Regression smoke on iter-18..21 endpoints still alive.

Booking used: 5d6c9c49-a7b5-4bd6-97b0-86cbffff288b (no saved card on purpose).
Driver token: 5oOuv345Fr-LxKIaj8o94g.
"""
import os
import uuid
import asyncio
from datetime import datetime, timezone, timedelta
import bcrypt
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

BOOKING_ID = "5d6c9c49-a7b5-4bd6-97b0-86cbffff288b"
DRIVER_TOKEN = "5oOuv345Fr-LxKIaj8o94g"
FAKE_BOOKING_ID = "00000000-dead-beef-0000-000000000000"

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")


# ---------- shared session + admin auth ----------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    """2FA bypass: seed challenge directly in Mongo with known code."""
    from motor.motor_asyncio import AsyncIOMotorClient
    if not MONGO_URL or not DB_NAME:
        pytest.skip("MONGO_URL/DB_NAME missing")

    r = api.post(f"{BASE_URL}/api/admin/login", json={
        "email": "support@turanelitelimo.com",
        "password": "TuronAdmin@2025",
    })
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    j = r.json()
    if not j.get("requires_2fa"):
        return j.get("token")

    async def seed():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        cid = str(uuid.uuid4())
        code_hash = bcrypt.hashpw(b"123456", bcrypt.gensalt()).decode()
        await db.admin_2fa_challenges.insert_one({
            "challenge_id": cid,
            "admin_email": "support@turanelitelimo.com",
            "code_hash": code_hash,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            "attempts": 0,
            "used": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        client.close()
        return cid

    cid = asyncio.get_event_loop().run_until_complete(seed())
    r2 = api.post(f"{BASE_URL}/api/admin/verify-2fa", json={"challenge_id": cid, "code": "123456"})
    assert r2.status_code == 200, f"verify-2fa failed: {r2.text[:200]}"
    return r2.json()["token"]


@pytest.fixture(scope="module")
def auth(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- Mongo helpers ----------
async def _fetch_booking():
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    b = await db.bookings.find_one({"id": BOOKING_ID}, {"_id": 0})
    client.close()
    return b


async def _reset_wait_time_state():
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await db.bookings.update_one(
        {"id": BOOKING_ID},
        {"$unset": {
            "wait_time_minutes": "",
            "wait_time_fee_amount": "",
            "wait_time_charged_at": "",
            "wait_time_payment_intent_id": "",
            "wait_time_external_note": "",
        }},
    )
    client.close()


async def _reset_first_stop_charge():
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    b = await db.bookings.find_one({"id": BOOKING_ID}, {"_id": 0, "mid_trip_stops": 1})
    if b and (b.get("mid_trip_stops") or []):
        sid = b["mid_trip_stops"][0]["id"]
        await db.bookings.update_one(
            {"id": BOOKING_ID, "mid_trip_stops.id": sid},
            {"$unset": {
                "mid_trip_stops.$.charged_at": "",
                "mid_trip_stops.$.payment_intent_id": "",
                "mid_trip_stops.$.external_note": "",
            }},
        )
    client.close()
    return b


async def _trim_damage_charges(keep_count: int = 0):
    """Remove all damage_charges entries created by tests (leaves keep_count entries)."""
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    b = await db.bookings.find_one({"id": BOOKING_ID}, {"_id": 0, "damage_charges": 1})
    if b:
        existing = b.get("damage_charges") or []
        kept = existing[:keep_count]
        await db.bookings.update_one({"id": BOOKING_ID}, {"$set": {"damage_charges": kept}})
    client.close()


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(scope="module")
def initial_damage_count():
    b = _run(_fetch_booking())
    return len(b.get("damage_charges") or [])


# ---------- 1) mark-wait-time-external ----------
class TestMarkWaitTimeExternal:
    URL = f"{BASE_URL}/api/admin/bookings/{BOOKING_ID}/mark-wait-time-external"

    def test_requires_auth(self, api):
        r = api.post(self.URL, json={"minutes_waited": 15, "amount": 25})
        assert r.status_code == 401, f"got {r.status_code}: {r.text[:200]}"

    def test_unknown_booking_404(self, api, auth):
        r = api.post(
            f"{BASE_URL}/api/admin/bookings/{FAKE_BOOKING_ID}/mark-wait-time-external",
            json={"minutes_waited": 10, "amount": 5},
            headers=auth,
        )
        assert r.status_code == 404

    def test_validation_amount_required(self, api, auth):
        _run(_reset_wait_time_state())
        r = api.post(self.URL, json={"minutes_waited": 12}, headers=auth)
        # amount is None -> 400 "Missing amount."
        assert r.status_code == 400
        assert "amount" in r.text.lower()

    def test_validation_minutes_must_be_positive(self, api, auth):
        _run(_reset_wait_time_state())
        # minutes_waited=0 should fail Pydantic ge=1 -> 422
        r = api.post(self.URL, json={"minutes_waited": 0, "amount": 5}, headers=auth)
        assert r.status_code in (400, 422)

    def test_records_and_persists(self, api, auth):
        _run(_reset_wait_time_state())
        payload = {"minutes_waited": 17, "amount": 30.50, "note": "Charged via Stripe dashboard pi_test123"}
        r = api.post(self.URL, json=payload, headers=auth)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body.get("recorded") is True
        assert body.get("external") is True
        assert body.get("amount") == 30.50
        assert body.get("minutes_waited") == 17

        # Re-fetch from DB and verify all four fields persisted
        b = _run(_fetch_booking())
        assert b["wait_time_minutes"] == 17
        assert abs(b["wait_time_fee_amount"] - 30.50) < 0.001
        assert b.get("wait_time_charged_at")
        assert b.get("wait_time_payment_intent_id", "").startswith("manual:")
        assert "Stripe dashboard" in b.get("wait_time_external_note", "")

    def test_idempotent_when_already_charged(self, api, auth):
        # State left charged from previous test
        r = api.post(self.URL, json={"minutes_waited": 99, "amount": 999}, headers=auth)
        assert r.status_code == 200
        body = r.json()
        assert body.get("already_charged") is True
        # And DB still has 17 / 30.50 (didn't overwrite)
        b = _run(_fetch_booking())
        assert b["wait_time_minutes"] == 17
        assert abs(b["wait_time_fee_amount"] - 30.50) < 0.001


# ---------- 2) mark-mid-trip-stop-external ----------
class TestMarkMidTripStopExternal:
    URL = f"{BASE_URL}/api/admin/bookings/{BOOKING_ID}/mark-mid-trip-stop-external"

    def test_requires_auth(self, api):
        r = api.post(self.URL, json={"stop_id": "anything"})
        assert r.status_code == 401

    def test_unknown_booking_404(self, api, auth):
        r = api.post(
            f"{BASE_URL}/api/admin/bookings/{FAKE_BOOKING_ID}/mark-mid-trip-stop-external",
            json={"stop_id": "abc"},
            headers=auth,
        )
        assert r.status_code == 404

    def test_unknown_stop_404(self, api, auth):
        r = api.post(self.URL, json={"stop_id": "definitely-not-a-stop-id"}, headers=auth)
        assert r.status_code == 404
        assert "stop" in r.text.lower()

    def test_missing_stop_id_400(self, api, auth):
        r = api.post(self.URL, json={"note": "no stop id"}, headers=auth)
        assert r.status_code == 400

    def test_records_and_persists(self, api, auth):
        b = _run(_reset_first_stop_charge())
        stops = b.get("mid_trip_stops") or []
        if not stops:
            pytest.skip("Test booking has no mid_trip_stops to charge")
        stop_id = stops[0]["id"]

        r = api.post(self.URL, json={"stop_id": stop_id, "note": "Cash collected on board"}, headers=auth)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body.get("recorded") is True
        assert body.get("external") is True
        assert body.get("stop_id") == stop_id

        # Verify Mongo positional update applied
        b2 = _run(_fetch_booking())
        target = next(s for s in b2["mid_trip_stops"] if s["id"] == stop_id)
        assert target.get("charged_at")
        assert target.get("payment_intent_id", "").startswith("manual:")
        assert "Cash collected" in target.get("external_note", "")

    def test_idempotent_when_already_charged(self, api, auth):
        b = _run(_fetch_booking())
        stop_id = b["mid_trip_stops"][0]["id"]
        r = api.post(self.URL, json={"stop_id": stop_id, "note": "Second call should be no-op"}, headers=auth)
        assert r.status_code == 200
        body = r.json()
        assert body.get("already_charged") is True

    def teardown_class(cls):  # noqa: N805 - pytest classic teardown
        _run(_reset_first_stop_charge())


# ---------- 3) mark-damage-external ----------
class TestMarkDamageExternal:
    URL = f"{BASE_URL}/api/admin/bookings/{BOOKING_ID}/mark-damage-external"

    def test_requires_auth(self, api):
        r = api.post(self.URL, json={"amount": 100, "reason": "Stained seat"})
        assert r.status_code == 401

    def test_unknown_booking_404(self, api, auth):
        r = api.post(
            f"{BASE_URL}/api/admin/bookings/{FAKE_BOOKING_ID}/mark-damage-external",
            json={"amount": 50, "reason": "Test reason"},
            headers=auth,
        )
        assert r.status_code == 404

    def test_validation_amount_required(self, api, auth):
        r = api.post(self.URL, json={"reason": "Test reason here"}, headers=auth)
        assert r.status_code == 400
        assert "amount" in r.text.lower()

    def test_validation_reason_min_4(self, api, auth):
        r = api.post(self.URL, json={"amount": 10, "reason": "abc"}, headers=auth)
        assert r.status_code == 400
        assert "reason" in r.text.lower()

    def test_validation_reason_missing(self, api, auth):
        r = api.post(self.URL, json={"amount": 10}, headers=auth)
        assert r.status_code == 400

    def test_records_and_persists(self, api, auth, initial_damage_count):
        payload = {"amount": 125.75, "reason": "Stained leather seat — interior cleaning", "note": "Paid via Zelle ref ZP-9921"}
        r = api.post(self.URL, json=payload, headers=auth)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        assert body.get("recorded") is True
        assert body.get("external") is True
        entry = body.get("entry") or {}
        assert abs(entry.get("amount", 0) - 125.75) < 0.001
        assert entry.get("payment_intent_id", "").startswith("manual:")

        # DB has one more damage entry than at module-start
        b = _run(_fetch_booking())
        damage = b.get("damage_charges") or []
        assert len(damage) >= initial_damage_count + 1
        last = damage[-1]
        assert "Stained leather seat" in last.get("reason", "")
        assert "Zelle" in last.get("external_note", "")

    def teardown_class(cls):  # noqa: N805
        # Trim any damage entries we added back to whatever was there before this run.
        # Conservative: leave existing pre-run entries intact (we don't know exact count here,
        # but the test added exactly one row, so pop the last one).
        from motor.motor_asyncio import AsyncIOMotorClient

        async def cleanup():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            b = await db.bookings.find_one({"id": BOOKING_ID}, {"_id": 0, "damage_charges": 1})
            if b:
                arr = b.get("damage_charges") or []
                # Only pop if last entry looks like ours (manual:Paid via Zelle...)
                if arr and (arr[-1].get("payment_intent_id", "").startswith("manual:")):
                    arr = arr[:-1]
                    await db.bookings.update_one({"id": BOOKING_ID}, {"$set": {"damage_charges": arr}})
            client.close()

        _run(cleanup())


# ---------- 4) Regression smoke on prior iters ----------
class TestRegressionSmoke:
    def test_quote_with_additional_stops_still_works(self, api):
        # /api/quote with additional_stops list (per_stop_fee + routed detour math)
        r = api.post(f"{BASE_URL}/api/quote", json={
            "pickup_location": "JFK Airport, NY",
            "dropoff_location": "Times Square, NY",
            "vehicle_type": "sedan",
            "additional_stops": ["Brooklyn Bridge, NY"],
        })
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert "quotes" in j and isinstance(j["quotes"], list) and len(j["quotes"]) > 0
        assert j.get("distance_miles", 0) > 0

    def test_admin_bookings_list(self, api, auth):
        r = api.get(f"{BASE_URL}/api/admin/bookings", headers=auth)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_driver_view_returns_mid_trip_stops(self, api):
        r = api.get(f"{BASE_URL}/api/driver/{DRIVER_TOKEN}")
        assert r.status_code == 200
        j = r.json()
        assert "mid_trip_stops" in j

    def test_charge_wait_time_no_card_400(self, api, auth):
        # Existing endpoint must still 400 because test booking has no saved card.
        # First re-arm a pending wait time so the precondition is met.
        async def arm():
            from motor.motor_asyncio import AsyncIOMotorClient
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            await db.bookings.update_one(
                {"id": BOOKING_ID},
                {"$set": {"wait_time_minutes_pending": 15},
                 "$unset": {"wait_time_charged_at": ""}},
            )
            client.close()
        _run(arm())
        r = api.post(
            f"{BASE_URL}/api/admin/bookings/{BOOKING_ID}/charge-wait-time",
            json={"minutes_waited": 15},
            headers=auth,
        )
        # Either 400 "No saved card" OR 400 consent/other — must NOT be 500.
        assert r.status_code == 400, f"Unexpected: {r.status_code} {r.text[:200]}"
        assert "card" in r.text.lower() or "consent" in r.text.lower()

    def test_charge_damages_no_card_400(self, api, auth):
        r = api.post(
            f"{BASE_URL}/api/admin/bookings/{BOOKING_ID}/charge-damages",
            json={"amount": 20, "reason": "Smoke regression check"},
            headers=auth,
        )
        assert r.status_code == 400

    def test_charge_mid_trip_stop_no_card_400(self, api, auth):
        b = _run(_fetch_booking())
        stops = b.get("mid_trip_stops") or []
        # find one not yet charged
        target = next((s for s in stops if not s.get("charged_at")), None)
        if not target:
            pytest.skip("No uncharged stop to test against")
        r = api.post(
            f"{BASE_URL}/api/admin/bookings/{BOOKING_ID}/charge-mid-trip-stop",
            json={"stop_id": target["id"]},
            headers=auth,
        )
        assert r.status_code == 400


# ---------- Final session-level cleanup ----------
@pytest.fixture(scope="session", autouse=True)
def _final_cleanup():
    yield
    _run(_reset_wait_time_state())
    _run(_reset_first_stop_charge())
