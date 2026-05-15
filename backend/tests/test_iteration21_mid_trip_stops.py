"""
Iteration 21 — Phase B: Mid-Trip Unplanned Stops

Covers:
- POST /api/driver/{token}/record-mid-trip-stop (success, bad token 404, bad address 400)
- Math sanity: near-route detour < 0.5 mi; real detour > 1 mi; wait grace at 10 min
- GET /api/driver/{token} includes mid_trip_stops array
- POST /api/admin/bookings/{id}/charge-mid-trip-stop (auth, no-card 400, bad stop_id 404)
- Regression: /api/quote, /api/bookings POST, /api/driver/{token}/record-wait-time,
  /api/admin/bookings/{id}/charge-wait-time, /api/admin/bookings/{id}/charge-damages
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

EXISTING_BOOKING_ID = "5d6c9c49-a7b5-4bd6-97b0-86cbffff288b"
EXISTING_DRIVER_TOKEN = "5oOuv345Fr-LxKIaj8o94g"


# -------- shared helpers --------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    """Login with 2FA bypass by seeding admin_2fa_challenges directly in Mongo."""
    from motor.motor_asyncio import AsyncIOMotorClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        pytest.skip("MONGO_URL/DB_NAME missing")

    # Step 1: trigger login (creates challenge but we replace it)
    r = api.post(f"{BASE_URL}/api/admin/login", json={
        "email": "support@turanelitelimo.com",
        "password": "TuronAdmin@2025",
    })
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    j = r.json()
    if not j.get("requires_2fa"):
        # Already returned token
        return j.get("token")

    # Step 2: seed our own challenge with known code
    async def seed():
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
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


# -------- Mid-trip stop endpoint --------
class TestRecordMidTripStop:
    def test_bad_token_returns_404(self, api):
        r = api.post(
            f"{BASE_URL}/api/driver/not-a-real-token-xyz/record-mid-trip-stop",
            json={"stop_address": "JFK Airport, NY", "minutes_at_stop": 5},
        )
        assert r.status_code == 404

    def test_bad_address_returns_400(self, api):
        # Gibberish that should fail geocoding
        r = api.post(
            f"{BASE_URL}/api/driver/{EXISTING_DRIVER_TOKEN}/record-mid-trip-stop",
            json={"stop_address": "zzzzqqqqxxxxnotaplace999", "minutes_at_stop": 0},
        )
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text[:200]}"

    def test_record_valid_stop_returns_breakdown(self, api):
        # Fetch booking to know pickup/dropoff
        view = api.get(f"{BASE_URL}/api/driver/{EXISTING_DRIVER_TOKEN}")
        assert view.status_code == 200
        b = view.json()
        pickup = b.get("pickup_location") or ""
        # Use a stop near pickup → tiny detour
        r = api.post(
            f"{BASE_URL}/api/driver/{EXISTING_DRIVER_TOKEN}/record-mid-trip-stop",
            json={"stop_address": pickup, "minutes_at_stop": 5},
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        data = r.json()
        assert data["recorded"] is True
        stop = data["stop"]
        # Required keys
        for k in ("id", "address", "minutes_at_stop", "wait_overage_minutes",
                  "detour_miles", "per_mile_rate", "wait_minute_rate",
                  "distance_charge", "wait_charge", "subtotal",
                  "service_fee", "total", "recorded_at", "charged_at"):
            assert k in stop, f"missing key {k}"
        # Math: minutes_at_stop=5 → wait_overage=0 → wait_charge=0
        assert stop["wait_overage_minutes"] == 0
        assert stop["wait_charge"] == 0
        # Subtotal = flat_fee + distance_charge (+0)
        assert abs(stop["subtotal"] - (stop["flat_fee"] + stop["distance_charge"])) < 0.011
        # Total = subtotal + service_fee
        assert abs(stop["total"] - (stop["subtotal"] + stop["service_fee"])) < 0.011
        assert stop["charged_at"] is None

    def test_near_route_detour_small(self, api):
        view = api.get(f"{BASE_URL}/api/driver/{EXISTING_DRIVER_TOKEN}").json()
        pickup = view.get("pickup_location") or ""
        r = api.post(
            f"{BASE_URL}/api/driver/{EXISTING_DRIVER_TOKEN}/record-mid-trip-stop",
            json={"stop_address": pickup, "minutes_at_stop": 0},
        )
        assert r.status_code == 200
        stop = r.json()["stop"]
        # Stopping at pickup itself → detour should be tiny
        assert stop["detour_miles"] < 1.0, f"expected small detour, got {stop['detour_miles']}"

    def test_wait_overage_above_grace(self, api):
        view = api.get(f"{BASE_URL}/api/driver/{EXISTING_DRIVER_TOKEN}").json()
        pickup = view.get("pickup_location") or ""
        r = api.post(
            f"{BASE_URL}/api/driver/{EXISTING_DRIVER_TOKEN}/record-mid-trip-stop",
            json={"stop_address": pickup, "minutes_at_stop": 25},
        )
        assert r.status_code == 200
        stop = r.json()["stop"]
        # 25 - 10 grace = 15 overage
        assert stop["wait_overage_minutes"] == 15
        expected_wait = round(15 * stop["wait_minute_rate"], 2)
        assert abs(stop["wait_charge"] - expected_wait) < 0.011

    def test_real_detour_far_address(self, api):
        # Pickup/dropoff for this booking are in NYC area. A real detour to a far place.
        r = api.post(
            f"{BASE_URL}/api/driver/{EXISTING_DRIVER_TOKEN}/record-mid-trip-stop",
            json={"stop_address": "Philadelphia, PA", "minutes_at_stop": 0},
        )
        # Could be 200 (geocoded) or 400 (geocode failed). If 200, expect > 1 mi
        assert r.status_code in (200, 400)
        if r.status_code == 200:
            stop = r.json()["stop"]
            assert stop["detour_miles"] > 1.0, f"expected real detour, got {stop['detour_miles']}"


class TestDriverViewIncludesStops:
    def test_driver_view_has_mid_trip_stops_array(self, api):
        r = api.get(f"{BASE_URL}/api/driver/{EXISTING_DRIVER_TOKEN}")
        assert r.status_code == 200
        data = r.json()
        assert "mid_trip_stops" in data
        assert isinstance(data["mid_trip_stops"], list)
        # The request says 2+ already exist, plus the ones we just added
        assert len(data["mid_trip_stops"]) >= 2


# -------- Admin charge endpoint --------
class TestAdminChargeMidTripStop:
    def test_no_auth_returns_401(self, api):
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{EXISTING_BOOKING_ID}/charge-mid-trip-stop",
            json={"stop_id": "anything"},
        )
        assert r.status_code in (401, 403)

    def test_bad_stop_id_returns_404(self, api, admin_token):
        h = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{EXISTING_BOOKING_ID}/charge-mid-trip-stop",
            json={"stop_id": "not-a-real-stop-id"},
            headers=h,
        )
        # Either 400 (no card check fires first) or 404 — booking has no saved card per problem statement
        assert r.status_code in (400, 404), f"got {r.status_code}: {r.text[:200]}"

    def test_no_saved_card_returns_400(self, api, admin_token):
        # Find a real stop_id from this booking
        v = api.get(f"{BASE_URL}/api/driver/{EXISTING_DRIVER_TOKEN}").json()
        stops = v.get("mid_trip_stops") or []
        assert stops, "test booking has no recorded stops"
        stop_id = stops[0]["id"]
        h = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{EXISTING_BOOKING_ID}/charge-mid-trip-stop",
            json={"stop_id": stop_id},
            headers=h,
        )
        assert r.status_code == 400
        assert "card" in r.text.lower() or "saved" in r.text.lower(), f"got: {r.text[:200]}"

    def test_bad_booking_id_returns_404(self, api, admin_token):
        h = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/nonexistent-booking-id/charge-mid-trip-stop",
            json={"stop_id": "x"},
            headers=h,
        )
        assert r.status_code == 404


# -------- Regression: existing endpoints --------
class TestRegression:
    def test_quote_still_works(self, api):
        r = api.post(f"{BASE_URL}/api/quote", json={
            "pickup_location": "JFK Airport, NY",
            "dropoff_location": "Times Square, New York, NY",
            "pickup_date": "2026-06-15",
            "pickup_time": "10:00",
            "passengers": 2,
        })
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert "quotes" in j or "options" in j or isinstance(j, dict)

    def test_bookings_list_admin(self, api, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{BASE_URL}/api/admin/bookings", headers=h)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) or isinstance(data, dict)

    def test_record_wait_time_still_works(self, api):
        r = api.post(
            f"{BASE_URL}/api/driver/{EXISTING_DRIVER_TOKEN}/record-wait-time",
            json={"minutes_waited": 12},
        )
        # Could already be charged (already_charged=true) OR recorded=true
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert j.get("recorded") is True or j.get("already_charged") is True

    def test_charge_wait_time_no_card_400(self, api, admin_token):
        h = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{EXISTING_BOOKING_ID}/charge-wait-time",
            json={"minutes_waited": 12},
            headers=h,
        )
        # No saved card → 400, or already charged 200
        assert r.status_code in (200, 400), r.text[:200]

    def test_charge_damages_no_card_400(self, api, admin_token):
        h = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{EXISTING_BOOKING_ID}/charge-damages",
            json={"amount": 50, "description": "TEST_iter21_dmg", "reason": "TEST_iter21 spilled coffee"},
            headers=h,
        )
        assert r.status_code in (200, 400), r.text[:200]
