"""
P1 backend tests: live driver location streaming end-to-end.

Covers:
  - POST /api/driver-auth/login                                 (driver auth)
  - POST /api/driver-auth/location                              (GPS upsert + booking mirror)
  - GET  /api/customer/bookings/{id}/driver-location            (rider poll)
  - GET  /api/admin/drivers/live                                (admin live map)
  - Full lifecycle of trip_status: assigned → en_route → on_location →
    passenger_onboard → completed
  - ObjectId (`_id`) exclusion in every response
"""

import os
import time
import uuid
import asyncio
import jwt
import pytest
import requests
from datetime import datetime, timedelta, timezone

# ---- ENV ---------------------------------------------------------------
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Fall back to the frontend .env so we always hit the preview backend.
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        for line in open(env_path):
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"')
                break
BASE_URL = (BASE_URL or "").rstrip("/")
API = f"{BASE_URL}/api"

JWT_SECRET = None
MONGO_URL = None
DB_NAME = None
for line in open("/app/backend/.env"):
    line = line.strip()
    if line.startswith("JWT_SECRET="):
        JWT_SECRET = line.split("=", 1)[1].strip().strip('"')
    elif line.startswith("MONGO_URL="):
        MONGO_URL = line.split("=", 1)[1].strip().strip('"')
    elif line.startswith("DB_NAME="):
        DB_NAME = line.split("=", 1)[1].strip().strip('"')

DRIVER_EMAIL = "driver.test@turanelitelimo.com"
DRIVER_PASSWORD = "DriverPass123!"


# ---- HELPERS -----------------------------------------------------------
def _mint_admin_token() -> str:
    """Bypass 2FA for testing by minting a valid admin JWT directly."""
    payload = {
        "sub": "support@turanelitelimo.com",
        "role": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _assert_no_object_id(obj, path="root"):
    """Recursively assert no Mongo `_id` field leaks through."""
    if isinstance(obj, dict):
        assert "_id" not in obj, f"_id leaked at {path}: keys={list(obj.keys())}"
        for k, v in obj.items():
            _assert_no_object_id(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _assert_no_object_id(v, f"{path}[{i}]")


# ---- FIXTURES ----------------------------------------------------------
@pytest.fixture(scope="module")
def driver_token():
    """Login the seeded test driver. Falls back to set-password on 401."""
    r = requests.post(
        f"{API}/driver-auth/login",
        json={"email": DRIVER_EMAIL, "password": DRIVER_PASSWORD},
        timeout=15,
    )
    if r.status_code == 401:
        # Try to set the password (only works if it was never set).
        sp = requests.post(
            f"{API}/driver-auth/set-password",
            json={"email": DRIVER_EMAIL, "password": DRIVER_PASSWORD},
            timeout=15,
        )
        if sp.status_code == 200:
            return sp.json()["token"], sp.json()["driver"]["id"]
        pytest.skip(f"Driver login failed: {r.status_code} {r.text[:200]}; "
                    f"set-password also failed: {sp.status_code} {sp.text[:200]}")
    assert r.status_code == 200, f"driver-auth/login failed: {r.status_code} {r.text}"
    body = r.json()
    assert "token" in body and "driver" in body
    _assert_no_object_id(body)
    return body["token"], body["driver"]["id"]


@pytest.fixture(scope="module")
def customer_token():
    """Create a fresh customer via /customer/signup."""
    ts = int(time.time())
    email = f"driverloctest_{ts}@test.com"
    r = requests.post(
        f"{API}/customer/signup",
        json={
            "email": email,
            "password": "TestPass123!",
            "name": "Loc Tester",
            "phone": "+14155550100",
        },
        timeout=15,
    )
    assert r.status_code == 200, f"customer/signup failed: {r.status_code} {r.text}"
    body = r.json()
    assert "token" in body and "user" in body
    _assert_no_object_id(body)
    return body["token"], body["user"]["id"], email


@pytest.fixture(scope="module")
def admin_token():
    return _mint_admin_token()


@pytest.fixture(scope="module")
def seeded_booking(driver_token, customer_token):
    """Seed a booking directly into Mongo so the driver_id ↔ booking link is
    guaranteed (admin assign-driver only links if phone matches, and SMS
    delivery is irrelevant for this test)."""
    from motor.motor_asyncio import AsyncIOMotorClient

    _, driver_id = driver_token
    _, customer_id, customer_email = customer_token
    booking_id = str(uuid.uuid4())

    async def _seed():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        doc = {
            "id": booking_id,
            "customer_id": customer_id,
            "email": customer_email,
            "phone": "+14155550100",
            "pickup_location": "San Francisco International Airport, San Francisco, CA",
            "dropoff_location": "1 Ferry Building, San Francisco, CA",
            "pickup_date": "2030-01-01",
            "pickup_time": "10:00",
            "passengers": 2,
            "vehicle_type": "Sedan",
            "quote_amount": 150.0,
            "status": "confirmed",
            "driver_id": driver_id,
            "driver_name": "Marcus Thompson",
            "driver_phone": "+14155550199",
            "driver_plate": "8BHK429",
            "driver_vehicle": "Black Mercedes E-Class",
            "trip_status": "assigned",
            "trip_status_updated_at": datetime.now(timezone.utc).isoformat(),
            "manage_token": uuid.uuid4().hex,
            "driver_token": uuid.uuid4().hex,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.bookings.insert_one(doc)
        return doc

    booking = asyncio.get_event_loop().run_until_complete(_seed())
    yield booking

    # Teardown
    async def _cleanup():
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        await db.bookings.delete_one({"id": booking_id})
        await db.driver_locations.delete_one({"driver_id": driver_id})

    try:
        asyncio.get_event_loop().run_until_complete(_cleanup())
    except Exception:
        pass


# ---- TESTS -------------------------------------------------------------

# --- Module: driver auth ---
class TestDriverAuth:
    def test_driver_login_success(self, driver_token):
        token, did = driver_token
        assert isinstance(token, str) and len(token) > 20
        assert isinstance(did, str) and len(did) > 0

    def test_driver_me_returns_profile(self, driver_token):
        token, did = driver_token
        r = requests.get(
            f"{API}/driver-auth/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        _assert_no_object_id(body)
        assert body.get("id") == did
        assert (body.get("email") or "").lower() == DRIVER_EMAIL


# --- Module: POST /driver-auth/location ---
class TestDriverPostLocation:
    def test_requires_auth(self):
        r = requests.post(
            f"{API}/driver-auth/location",
            json={"latitude": 37.7749, "longitude": -122.4194},
            timeout=10,
        )
        assert r.status_code in (401, 403), f"expected auth error, got {r.status_code}"

    def test_validates_lat_lng_bounds(self, driver_token):
        token, _ = driver_token
        r = requests.post(
            f"{API}/driver-auth/location",
            headers={"Authorization": f"Bearer {token}"},
            json={"latitude": 999, "longitude": -122.4194},
            timeout=10,
        )
        assert r.status_code == 422, f"expected 422 validation, got {r.status_code}: {r.text}"

    def test_post_location_upserts_driver_locations(self, driver_token):
        token, did = driver_token
        payload = {
            "latitude": 37.6213,
            "longitude": -122.3790,
            "heading": 45.0,
            "speed": 12.5,
            "accuracy": 5.0,
        }
        r = requests.post(
            f"{API}/driver-auth/location",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
            timeout=10,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        _assert_no_object_id(body)
        assert body.get("ok") is True
        assert "updated_at" in body


# --- Module: full E2E flow (driver posts + customer polls + admin sees) ---
class TestDriverLocationE2E:
    LOCATIONS = [
        (37.6213, -122.3790, 30.0, 10.0),   # SFO
        (37.6500, -122.4000, 45.0, 15.0),   # en-route 1
        (37.6900, -122.4150, 60.0, 18.0),   # en-route 2
    ]

    def test_three_updates_with_booking_mirror(self, driver_token, customer_token, seeded_booking):
        d_token, did = driver_token
        c_token, _, _ = customer_token
        bid = seeded_booking["id"]

        for i, (lat, lng, hd, sp) in enumerate(self.LOCATIONS):
            r = requests.post(
                f"{API}/driver-auth/location",
                headers={"Authorization": f"Bearer {d_token}"},
                json={
                    "latitude": lat, "longitude": lng,
                    "heading": hd, "speed": sp,
                    "active_booking_id": bid,
                },
                timeout=10,
            )
            assert r.status_code == 200, f"POST {i} failed: {r.status_code} {r.text}"
            assert r.json().get("ok") is True

            # Rider poll
            cr = requests.get(
                f"{API}/customer/bookings/{bid}/driver-location",
                headers={"Authorization": f"Bearer {c_token}"},
                timeout=10,
            )
            assert cr.status_code == 200, f"customer poll {i} failed: {cr.status_code} {cr.text}"
            data = cr.json()
            _assert_no_object_id(data)

            # Shape assertions
            assert data["booking_id"] == bid
            assert data["trip_status"] == "assigned"
            assert "driver" in data and "pickup_coord" in data and "dropoff_coord" in data

            drv = data["driver"]
            assert drv["latitude"] == pytest.approx(lat, abs=1e-6), f"lat mismatch on update {i}"
            assert drv["longitude"] == pytest.approx(lng, abs=1e-6), f"lng mismatch on update {i}"
            assert drv["heading"] == pytest.approx(hd, abs=1e-6)
            assert drv["plate"] == "8BHK429"
            assert drv["name"] == "Marcus Thompson"
            assert drv["updated_at"] is not None

            # Lazy-cached coords should be populated after first poll
            assert data["pickup_coord"] is not None and "lat" in data["pickup_coord"], \
                f"pickup_coord not geocoded: {data['pickup_coord']}"
            assert data["dropoff_coord"] is not None and "lat" in data["dropoff_coord"], \
                f"dropoff_coord not geocoded: {data['dropoff_coord']}"

    def test_customer_cannot_fetch_other_booking(self, customer_token):
        c_token, _, _ = customer_token
        r = requests.get(
            f"{API}/customer/bookings/{uuid.uuid4()}/driver-location",
            headers={"Authorization": f"Bearer {c_token}"},
            timeout=10,
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code}"

    def test_customer_endpoint_requires_auth(self, seeded_booking):
        bid = seeded_booking["id"]
        r = requests.get(f"{API}/customer/bookings/{bid}/driver-location", timeout=10)
        assert r.status_code in (401, 403)


# --- Module: GET /admin/drivers/live ---
class TestAdminDriversLive:
    def test_requires_admin_auth(self):
        r = requests.get(f"{API}/admin/drivers/live", timeout=10)
        assert r.status_code in (401, 403)

    def test_returns_live_driver_with_online_flag(self, admin_token, driver_token, seeded_booking):
        d_token, did = driver_token
        # Make sure there's a fresh fix on the driver
        bid = seeded_booking["id"]
        requests.post(
            f"{API}/driver-auth/location",
            headers={"Authorization": f"Bearer {d_token}"},
            json={"latitude": 37.7, "longitude": -122.4, "active_booking_id": bid},
            timeout=10,
        )
        r = requests.get(
            f"{API}/admin/drivers/live",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        rows = r.json()
        _assert_no_object_id(rows)
        assert isinstance(rows, list)
        match = [row for row in rows if row.get("driver_id") == did]
        assert match, f"seeded driver not in /admin/drivers/live response: {[r.get('driver_id') for r in rows]}"
        row = match[0]
        # Shape
        for k in ("driver_id", "name", "plate", "vehicle", "phone",
                  "latitude", "longitude", "heading", "active_booking_id",
                  "updated_at", "stale_seconds", "is_online"):
            assert k in row, f"missing key {k} in admin live row"
        assert row["plate"] == "8BHK429"
        assert row["active_booking_id"] == bid
        assert row["is_online"] is True, f"expected is_online=True, got stale_seconds={row['stale_seconds']}"
        assert row["stale_seconds"] < 120


# --- Module: trip_status lifecycle ---
class TestTripStatusLifecycle:
    @pytest.mark.parametrize("new_status", [
        "en_route", "on_location", "passenger_onboard", "completed"
    ])
    def test_trip_status_propagates_to_customer_endpoint(
        self, customer_token, driver_token, seeded_booking, new_status
    ):
        from motor.motor_asyncio import AsyncIOMotorClient
        c_token, _, _ = customer_token
        d_token, _ = driver_token
        bid = seeded_booking["id"]

        async def _set_status():
            client = AsyncIOMotorClient(MONGO_URL)
            db = client[DB_NAME]
            await db.bookings.update_one(
                {"id": bid},
                {"$set": {
                    "trip_status": new_status,
                    "trip_status_updated_at": datetime.now(timezone.utc).isoformat(),
                }},
            )

        asyncio.get_event_loop().run_until_complete(_set_status())

        # Driver continues to post location
        requests.post(
            f"{API}/driver-auth/location",
            headers={"Authorization": f"Bearer {d_token}"},
            json={"latitude": 37.79, "longitude": -122.41, "active_booking_id": bid},
            timeout=10,
        )
        cr = requests.get(
            f"{API}/customer/bookings/{bid}/driver-location",
            headers={"Authorization": f"Bearer {c_token}"},
            timeout=10,
        )
        assert cr.status_code == 200, cr.text
        data = cr.json()
        _assert_no_object_id(data)
        assert data["trip_status"] == new_status, (
            f"trip_status leak: expected {new_status}, got {data['trip_status']}"
        )
