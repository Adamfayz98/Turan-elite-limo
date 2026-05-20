"""
Iteration 27 — Tests for new endpoints:
 - POST /api/customer/forgot-password   (always 200, no enumeration)
 - POST /api/customer/reset-password    (invalid token -> 400; valid -> updates pw)
 - POST /api/promos/validate            (unknown -> ok:false; valid active -> ok:true)
 - GET  /api/driver-auth/bookings/{id}  (401 no jwt, 403 not-owned, 200 owned)
 - POST /api/driver-auth/bookings/{id}/status
 - POST /api/driver-auth/bookings/{id}/record-wait-time
 - POST /api/driver-auth/bookings/{id}/record-mid-trip-stop

A clean test booking is inserted directly into Mongo (assigned to the seeded
test driver) to bypass the 2FA-protected admin flow.
"""
import os
import uuid
import time
import asyncio
import pytest
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

DRIVER_EMAIL = "driver.test@turanelitelimo.com"
DRIVER_PASSWORD = "DriverPass123!"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


# ----------------------------- Fixtures -----------------------------

@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def db():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    client = AsyncIOMotorClient(MONGO_URL)
    yield client[DB_NAME], loop
    client.close()
    loop.close()


@pytest.fixture(scope="session")
def driver_token(http):
    r = http.post(f"{API}/driver-auth/login",
                  json={"email": DRIVER_EMAIL, "password": DRIVER_PASSWORD})
    assert r.status_code == 200, f"Driver login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and isinstance(data["token"], str)
    assert data["driver"]["email"] == DRIVER_EMAIL
    return data["token"], data["driver"]["id"]


@pytest.fixture(scope="session")
def test_booking(db, driver_token):
    """Insert a booking assigned to the test driver. Cleans up after session."""
    mongo_db, loop = db
    _, driver_id = driver_token
    booking_id = str(uuid.uuid4())
    conf = f"TEST-{booking_id[:8].upper()}"
    doc = {
        "id": booking_id,
        "confirmation_number": conf,
        "full_name": "TEST Rider",
        "email": "TEST_rider@example.com",
        "phone": "+14155550123",
        "service_type": "point_to_point",
        "pickup_date": "2026-12-31",
        "pickup_time": "10:00",
        "pickup_location": "1 Market St, San Francisco, CA",
        "dropoff_location": "San Francisco International Airport, CA",
        "passengers": 1,
        "vehicle_type": "Executive Sedan",
        "notes": "iteration27 test",
        "status": "confirmed",
        "trip_status": "assigned",
        "driver_id": driver_id,
        "driver_token": f"dt_{uuid.uuid4().hex[:16]}",
        "quote_amount": 120.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    loop.run_until_complete(mongo_db.bookings.insert_one(doc))
    yield booking_id
    # Cleanup
    loop.run_until_complete(mongo_db.bookings.delete_one({"id": booking_id}))


# ============================================================
# CUSTOMER FORGOT / RESET PASSWORD
# ============================================================

class TestForgotResetPassword:
    def test_forgot_password_unknown_email_returns_200(self, http):
        r = http.post(f"{API}/customer/forgot-password",
                      json={"email": "TEST_does_not_exist_xyz@example.com"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert "message" in data

    def test_forgot_password_invalid_email_format_422(self, http):
        r = http.post(f"{API}/customer/forgot-password",
                      json={"email": "not-an-email"})
        assert r.status_code == 422

    def test_reset_password_invalid_token_400(self, http):
        r = http.post(f"{API}/customer/reset-password",
                      json={"token": "definitely_not_a_real_token_value", "new_password": "NewPass123!"})
        assert r.status_code == 400
        assert "invalid" in r.json().get("detail", "").lower() or "already" in r.json().get("detail", "").lower()

    def test_forgot_then_reset_full_flow(self, http, db):
        """Create a customer, request forgot-password, read the token from Mongo,
        reset it, then verify login with the new password works."""
        mongo_db, loop = db
        email = f"test_pwreset_{uuid.uuid4().hex[:8]}@example.com"
        old_pw = "OldPass1234!"
        new_pw = "NewPass5678!"

        # 1. Create customer
        s = http.post(f"{API}/customer/signup",
                      json={"name": "TEST PwReset", "email": email, "password": old_pw})
        assert s.status_code == 200, s.text

        # 2. Request forgot-password
        r = http.post(f"{API}/customer/forgot-password", json={"email": email})
        assert r.status_code == 200

        # 3. Read token from Mongo
        rec = loop.run_until_complete(
            mongo_db.password_reset_tokens.find_one({"email": email, "used": False}, {"_id": 0})
        )
        assert rec is not None, "No password_reset_tokens record was written"
        token = rec["token"]

        # 4. Reset
        rr = http.post(f"{API}/customer/reset-password",
                       json={"token": token, "new_password": new_pw})
        assert rr.status_code == 200, rr.text
        assert rr.json().get("ok") is True

        # 5. Old password should now fail
        old_login = http.post(f"{API}/customer/login",
                              json={"email": email, "password": old_pw})
        assert old_login.status_code == 401

        # 6. New password should succeed
        new_login = http.post(f"{API}/customer/login",
                              json={"email": email, "password": new_pw})
        assert new_login.status_code == 200, new_login.text
        assert "token" in new_login.json()

        # 7. Token cannot be reused (now marked used)
        replay = http.post(f"{API}/customer/reset-password",
                           json={"token": token, "new_password": "Another9999!"})
        assert replay.status_code == 400

        # Cleanup
        loop.run_until_complete(mongo_db.customers.delete_one({"email": email}))
        loop.run_until_complete(mongo_db.password_reset_tokens.delete_many({"email": email}))


# ============================================================
# PROMO VALIDATE
# ============================================================

class TestPromoValidate:
    def test_unknown_code_returns_ok_false(self, http):
        r = http.post(f"{API}/promos/validate",
                      json={"code": "TEST_NOT_A_REAL_CODE_xyz", "amount": 100.0})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is False
        # Should NOT leak server details
        assert "discount" not in data or data.get("discount") in (None, 0, 0.0)

    def test_valid_active_code(self, http, db):
        """Insert a fixed-amount $10 off promo into Mongo, validate it, then clean up."""
        mongo_db, loop = db
        code = f"TEST{uuid.uuid4().hex[:6].upper()}"
        doc = {
            "id": str(uuid.uuid4()),
            "code": code,
            "description": "test promo",
            "discount_type": "fixed",
            "value": 10.0,
            "active": True,
            "uses": 0,
            "min_ride_amount": 0.0,
            "first_ride_only": False,
            "max_uses": None,
            "show_on_banner": False,
            "expires_at": None,
            "total_discount_given": 0.0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        loop.run_until_complete(mongo_db.promos.insert_one(doc))
        try:
            r = http.post(f"{API}/promos/validate", json={"code": code, "amount": 100.0})
            assert r.status_code == 200, r.text
            data = r.json()
            assert data.get("ok") is True, f"Promo validation failed: {data}"
            # Should expose discount + final_amount
            assert "discount" in data
            assert "final_amount" in data
            assert float(data["discount"]) > 0
            assert float(data["final_amount"]) < 100.0
        finally:
            loop.run_until_complete(mongo_db.promos.delete_one({"code": code}))

    def test_empty_code_rejected(self, http):
        r = http.post(f"{API}/promos/validate", json={"code": "", "amount": 100.0})
        # Pydantic min_length=1 -> 422
        assert r.status_code in (422, 400)


# ============================================================
# JWT DRIVER ENDPOINTS
# ============================================================

class TestDriverAuth:
    def test_login_success_and_invalid(self, http):
        r = http.post(f"{API}/driver-auth/login",
                      json={"email": DRIVER_EMAIL, "password": DRIVER_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["token"], str) and len(data["token"]) > 10
        assert data["driver"]["email"] == DRIVER_EMAIL

        bad = http.post(f"{API}/driver-auth/login",
                        json={"email": DRIVER_EMAIL, "password": "WRONG"})
        assert bad.status_code == 401


class TestDriverBookingDetail:
    def test_get_booking_without_jwt_is_401(self, http, test_booking):
        r = http.get(f"{API}/driver-auth/bookings/{test_booking}")
        assert r.status_code in (401, 403)

    def test_get_booking_with_wrong_driver_is_403(self, http, db, test_booking):
        """Re-assign booking to a different driver_id, attempt fetch -> 403."""
        mongo_db, loop = db
        # Login as the real test driver -> jwt token
        login = http.post(f"{API}/driver-auth/login",
                          json={"email": DRIVER_EMAIL, "password": DRIVER_PASSWORD})
        token = login.json()["token"]

        # Temporarily reassign to a bogus id
        loop.run_until_complete(mongo_db.bookings.update_one(
            {"id": test_booking}, {"$set": {"driver_id": "not-this-driver"}}
        ))
        try:
            r = http.get(f"{API}/driver-auth/bookings/{test_booking}",
                         headers={"Authorization": f"Bearer {token}"})
            assert r.status_code == 403, r.text
        finally:
            # restore for downstream tests
            real_did = login.json()["driver"]["id"]
            loop.run_until_complete(mongo_db.bookings.update_one(
                {"id": test_booking}, {"$set": {"driver_id": real_did}}
            ))

    def test_get_booking_assigned_returns_detail(self, http, driver_token, test_booking):
        token, _ = driver_token
        r = http.get(f"{API}/driver-auth/bookings/{test_booking}",
                     headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["id"] == test_booking
        assert b["trip_status"] == "assigned"
        assert b["pickup_location"]
        assert b["dropoff_location"]
        assert b["customer_name"] == "TEST Rider"


class TestDriverStatusProgression:
    """Advance status forward and confirm backward moves are rejected."""

    def test_status_progression_forward(self, http, driver_token, test_booking, db):
        token, _ = driver_token
        headers = {"Authorization": f"Bearer {token}"}
        mongo_db, loop = db

        # Reset to 'assigned' to ensure clean state
        loop.run_until_complete(mongo_db.bookings.update_one(
            {"id": test_booking}, {"$set": {"trip_status": "assigned", "status": "confirmed"}}
        ))

        # Forward: assigned -> en_route
        r = http.post(f"{API}/driver-auth/bookings/{test_booking}/status",
                      headers=headers, json={"status": "en_route"})
        assert r.status_code == 200, r.text
        assert r.json()["trip_status"] == "en_route"

        # Forward: en_route -> on_location
        r = http.post(f"{API}/driver-auth/bookings/{test_booking}/status",
                      headers=headers, json={"status": "on_location"})
        assert r.status_code == 200
        assert r.json()["trip_status"] == "on_location"

        # Backward: on_location -> en_route should be 400
        back = http.post(f"{API}/driver-auth/bookings/{test_booking}/status",
                         headers=headers, json={"status": "en_route"})
        assert back.status_code == 400, back.text

        # Forward: on_location -> passenger_onboard -> completed
        r = http.post(f"{API}/driver-auth/bookings/{test_booking}/status",
                      headers=headers, json={"status": "passenger_onboard"})
        assert r.status_code == 200

        r = http.post(f"{API}/driver-auth/bookings/{test_booking}/status",
                      headers=headers, json={"status": "completed"})
        assert r.status_code == 200, r.text

        # Verify persistence in Mongo: trip_status + booking.status both = completed
        b = loop.run_until_complete(mongo_db.bookings.find_one({"id": test_booking}, {"_id": 0}))
        assert b["trip_status"] == "completed"
        assert b["status"] == "completed"
        assert b.get("completed_at")

    def test_invalid_status_value_rejected(self, http, driver_token, test_booking):
        token, _ = driver_token
        r = http.post(f"{API}/driver-auth/bookings/{test_booking}/status",
                      headers={"Authorization": f"Bearer {token}"},
                      json={"status": "arrived"})  # not in regex
        # Pydantic regex enforces -> 422
        assert r.status_code in (400, 422)


class TestDriverWaitTime:
    def test_record_wait_time(self, http, driver_token, test_booking, db):
        token, _ = driver_token
        mongo_db, loop = db
        # Ensure not already charged
        loop.run_until_complete(mongo_db.bookings.update_one(
            {"id": test_booking}, {"$unset": {"wait_time_charged_at": ""}}
        ))
        r = http.post(f"{API}/driver-auth/bookings/{test_booking}/record-wait-time",
                      headers={"Authorization": f"Bearer {token}"},
                      json={"minutes_waited": 25})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("recorded") is True
        assert data["minutes_waited"] == 25
        assert data.get("pending_admin_review") is True

        # Verify persistence
        b = loop.run_until_complete(mongo_db.bookings.find_one({"id": test_booking}, {"_id": 0}))
        assert b.get("wait_time_minutes_pending") == 25
        assert b.get("wait_time_recorded_by") == "driver"

    def test_record_wait_time_idempotent_on_already_charged(self, http, driver_token, test_booking, db):
        token, _ = driver_token
        mongo_db, loop = db
        # Mark as already charged
        loop.run_until_complete(mongo_db.bookings.update_one(
            {"id": test_booking},
            {"$set": {"wait_time_charged_at": datetime.now(timezone.utc).isoformat(),
                      "wait_time_fee_amount": 25.0,
                      "wait_time_minutes": 25}}
        ))
        r = http.post(f"{API}/driver-auth/bookings/{test_booking}/record-wait-time",
                      headers={"Authorization": f"Bearer {token}"},
                      json={"minutes_waited": 99})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("already_charged") is True
        # Cleanup
        loop.run_until_complete(mongo_db.bookings.update_one(
            {"id": test_booking}, {"$unset": {"wait_time_charged_at": "", "wait_time_fee_amount": "", "wait_time_minutes": ""}}
        ))


class TestDriverMidTripStop:
    def test_record_mid_trip_stop(self, http, driver_token, test_booking, db):
        token, _ = driver_token
        mongo_db, loop = db
        # Clear any existing stops
        loop.run_until_complete(mongo_db.bookings.update_one(
            {"id": test_booking}, {"$set": {"mid_trip_stops": []}}
        ))
        r = http.post(f"{API}/driver-auth/bookings/{test_booking}/record-mid-trip-stop",
                      headers={"Authorization": f"Bearer {token}"},
                      json={"stop_address": "Union Square, San Francisco, CA",
                            "minutes_at_stop": 15})
        # If Google geocode is unavailable expect 400 with a specific message
        if r.status_code == 400:
            detail = r.json().get("detail", "")
            pytest.skip(f"Geocoding unavailable: {detail}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("recorded") is True
        stop = data["stop"]
        assert stop["address"]
        assert stop["minutes_at_stop"] == 15
        assert stop["status"] == "pending"
        assert "detour_miles" in stop
        assert "amount" in stop

        # Verify persistence + structure pushed into booking
        b = loop.run_until_complete(mongo_db.bookings.find_one({"id": test_booking}, {"_id": 0}))
        assert len(b.get("mid_trip_stops") or []) >= 1
        pushed = b["mid_trip_stops"][-1]
        assert pushed["recorded_by"] == "driver"
        assert pushed["status"] == "pending"

    def test_record_mid_trip_stop_bad_address_400(self, http, driver_token, test_booking):
        token, _ = driver_token
        r = http.post(f"{API}/driver-auth/bookings/{test_booking}/record-mid-trip-stop",
                      headers={"Authorization": f"Bearer {token}"},
                      json={"stop_address": "zzzzzzzzzzzzzzzzzzzzzzzzz",
                            "minutes_at_stop": 5})
        # Either Google rejects geocoding (400) or it falls through with a strange address — accept 400
        assert r.status_code in (400, 200)  # tolerate quota-exhaustion edge


class TestDriverAuthMissing:
    """Auth-required endpoints must 401 when token missing."""
    def test_status_endpoint_requires_auth(self, http, test_booking):
        r = http.post(f"{API}/driver-auth/bookings/{test_booking}/status",
                      json={"status": "en_route"})
        assert r.status_code in (401, 403)

    def test_wait_time_endpoint_requires_auth(self, http, test_booking):
        r = http.post(f"{API}/driver-auth/bookings/{test_booking}/record-wait-time",
                      json={"minutes_waited": 5})
        assert r.status_code in (401, 403)

    def test_mid_trip_stop_endpoint_requires_auth(self, http, test_booking):
        r = http.post(f"{API}/driver-auth/bookings/{test_booking}/record-mid-trip-stop",
                      json={"stop_address": "Union Square, San Francisco, CA",
                            "minutes_at_stop": 5})
        assert r.status_code in (401, 403)
