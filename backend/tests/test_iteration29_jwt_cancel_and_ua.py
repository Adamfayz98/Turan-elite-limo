"""Iteration 29 backend tests:

Covers the three backend changes:
  1. POST /api/customer/bookings/{booking_id}/cancel  (new JWT customer cancel)
  2. POST /api/customer/book-and-pay                   (User-Agent based deep-link detection)
  3. GET  /api/customer/bookings/{booking_id}/driver-location  (pickup_coord/dropoff_coord caching)

Plus regression for:
  - POST /api/bookings/manage/{token}/cancel  (token-based cancel still works)
  - /api/customer/forgot-password + /api/customer/reset-password
"""

import os
import time
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

RIDER_EMAIL = "rider.test@turanelitelimo.com"
RIDER_PASSWORD = "RiderPass123!"


# ----------------------- fixtures -----------------------

@pytest.fixture(scope="session")
def mongo():
    """Direct MongoDB access for setup/verification/teardown."""
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="session")
def rider_token(mongo):
    """Sign up or log in the test rider; return JWT."""
    s = requests.Session()
    # Try login first
    r = s.post(f"{BASE_URL}/api/customer/login",
               json={"email": RIDER_EMAIL, "password": RIDER_PASSWORD}, timeout=15)
    if r.status_code == 200:
        return r.json()["token"]
    # Otherwise sign up
    r = s.post(f"{BASE_URL}/api/customer/signup", json={
        "email": RIDER_EMAIL, "password": RIDER_PASSWORD,
        "name": "Rider Test", "phone": "+15551234567",
    }, timeout=15)
    assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def rider_customer_id(rider_token, mongo):
    doc = mongo.customers.find_one({"email": RIDER_EMAIL}, {"_id": 0, "id": 1})
    assert doc, "rider account should exist in customers collection"
    return doc["id"]


@pytest.fixture
def auth_headers(rider_token):
    return {"Authorization": f"Bearer {rider_token}", "Content-Type": "application/json"}


@pytest.fixture
def created_booking(mongo, rider_customer_id):
    """Insert a minimal booking document tied to the rider; returns booking id.
    Bypasses Stripe (we don't need a real checkout session for the cancel/driver-location tests)."""
    bid = str(uuid.uuid4())
    doc = {
        "id": bid,
        "customer_id": rider_customer_id,
        "full_name": "TEST Rider",
        "email": RIDER_EMAIL,
        "phone": "+15551234567",
        "service_type": "A to B Transfer",
        "pickup_date": (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat(),
        "pickup_time": "10:00",
        "pickup_location": "San Francisco International Airport, San Francisco, CA",
        "dropoff_location": "Salesforce Tower, 415 Mission St, San Francisco, CA",
        "passengers": 1,
        "vehicle_type": "Executive Sedan",
        "additional_stops": [],
        "quote_amount": 120.0,
        "status": "pending",
        "payment_status": "unpaid",
        "manage_token": "tok_" + uuid.uuid4().hex[:24],
        "confirmation_number": "TEST-" + uuid.uuid4().hex[:6].upper(),
        "source": "test",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    mongo.bookings.insert_one(doc)
    yield doc
    mongo.bookings.delete_one({"id": bid})


# ----------------------- 1. New JWT cancel endpoint -----------------------

class TestCustomerJwtCancel:

    def test_cancel_requires_jwt(self, created_booking):
        # No Authorization header => 401
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{created_booking['id']}/cancel",
            json={"reason": "no auth"}, timeout=10,
        )
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text}"

    def test_cancel_nonexistent_returns_404(self, auth_headers):
        fake = str(uuid.uuid4())
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{fake}/cancel",
            headers=auth_headers, json={"reason": "x"}, timeout=10,
        )
        assert r.status_code == 404

    def test_cancel_unpaid_immediately(self, mongo, auth_headers, created_booking):
        bid = created_booking["id"]
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{bid}/cancel",
            headers=auth_headers, json={"reason": "changed plans"}, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("status") == "cancelled"
        # DB persistence
        db_doc = mongo.bookings.find_one({"id": bid}, {"_id": 0})
        assert db_doc["status"] == "cancelled"
        assert db_doc.get("cancellation_requested") is True
        assert db_doc.get("cancellation_source") == "mobile_app"
        assert "changed plans" in (db_doc.get("cancellation_reason") or "")

    def test_cancel_paid_flags_request_but_keeps_status(self, mongo, auth_headers, created_booking):
        bid = created_booking["id"]
        # Flip to paid + confirmed in DB
        mongo.bookings.update_one(
            {"id": bid}, {"$set": {"payment_status": "paid", "status": "confirmed"}},
        )
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{bid}/cancel",
            headers=auth_headers, json={"reason": "refund please"}, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("status") == "cancellation_requested"
        # DB: cancellation_requested True but status stays 'confirmed' (NOT cancelled)
        db_doc = mongo.bookings.find_one({"id": bid}, {"_id": 0})
        assert db_doc.get("cancellation_requested") is True
        assert db_doc.get("status") == "confirmed", \
            f"paid booking should not be auto-cancelled; status={db_doc.get('status')}"
        assert db_doc.get("payment_status") == "paid"

    def test_cancel_already_completed_returns_400(self, mongo, auth_headers, created_booking):
        bid = created_booking["id"]
        mongo.bookings.update_one({"id": bid}, {"$set": {"status": "completed"}})
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{bid}/cancel",
            headers=auth_headers, json={"reason": "too late"}, timeout=10,
        )
        assert r.status_code == 400
        assert "completed" in r.text.lower()

    def test_cancel_idempotent_for_already_cancelled(self, mongo, auth_headers, created_booking):
        bid = created_booking["id"]
        mongo.bookings.update_one({"id": bid}, {"$set": {"status": "cancelled"}})
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{bid}/cancel",
            headers=auth_headers, json={"reason": "again"}, timeout=10,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("already_cancelled") is True
        assert body.get("status") == "cancelled"

    def test_cancel_other_customers_booking_returns_404(self, mongo, auth_headers):
        """A booking belonging to a different customer should NOT be cancellable."""
        other_bid = str(uuid.uuid4())
        mongo.bookings.insert_one({
            "id": other_bid,
            "customer_id": "some-other-customer-id",
            "status": "pending",
            "payment_status": "unpaid",
            "pickup_location": "X", "dropoff_location": "Y", "vehicle_type": "Executive Sedan",
            "pickup_date": "2026-12-01", "pickup_time": "10:00",
            "manage_token": "tok_other_" + uuid.uuid4().hex[:8],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            r = requests.post(
                f"{BASE_URL}/api/customer/bookings/{other_bid}/cancel",
                headers=auth_headers, json={"reason": "x"}, timeout=10,
            )
            assert r.status_code == 404
        finally:
            mongo.bookings.delete_one({"id": other_bid})


# ------------------ 2. User-Agent based success_url detection -------------------

class TestBookAndPayUserAgent:

    _payload = {
        "pickup_location": "San Francisco International Airport, San Francisco, CA",
        "dropoff_location": "Salesforce Tower, 415 Mission St, San Francisco, CA",
        "pickup_datetime": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
        "vehicle_type": "Executive Sedan",
        "quote_amount": 120.0,
        "passenger_count": 1,
        "notes": "",
    }

    def _cleanup(self, mongo, booking_id):
        if booking_id:
            mongo.bookings.delete_one({"id": booking_id})

    def test_book_and_pay_browser_ua(self, mongo, rider_token):
        headers = {
            "Authorization": f"Bearer {rider_token}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        }
        r = requests.post(f"{BASE_URL}/api/customer/book-and-pay",
                          headers=headers, json=self._payload, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("checkout_url", "").startswith("https://")
        assert "stripe.com" in body["checkout_url"]
        assert body.get("booking_id")
        assert body.get("session_id", "").startswith("cs_")
        self._cleanup(mongo, body.get("booking_id"))

    def test_book_and_pay_expo_ua(self, mongo, rider_token):
        headers = {
            "Authorization": f"Bearer {rider_token}",
            "Content-Type": "application/json",
            "User-Agent": "Expo/2.32.0 CFNetwork/1410.0.3 Darwin/22.6.0",
        }
        r = requests.post(f"{BASE_URL}/api/customer/book-and-pay",
                          headers=headers, json=self._payload, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("checkout_url", "").startswith("https://")
        assert body.get("booking_id")
        self._cleanup(mongo, body.get("booking_id"))

    def test_book_and_pay_okhttp_ua(self, mongo, rider_token):
        """Android RN typically advertises 'okhttp' in the UA."""
        headers = {
            "Authorization": f"Bearer {rider_token}",
            "Content-Type": "application/json",
            "User-Agent": "okhttp/4.10.0",
        }
        r = requests.post(f"{BASE_URL}/api/customer/book-and-pay",
                          headers=headers, json=self._payload, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("checkout_url")
        self._cleanup(mongo, body.get("booking_id"))


# ------------- 3. driver-location returns pickup_coord/dropoff_coord ----------

class TestDriverLocationCoords:

    def test_driver_location_includes_coord_keys(self, mongo, auth_headers, created_booking):
        bid = created_booking["id"]
        r = requests.get(
            f"{BASE_URL}/api/customer/bookings/{bid}/driver-location",
            headers=auth_headers, timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Keys MUST be present (values may be None if geocoding fails)
        assert "pickup_coord" in body
        assert "dropoff_coord" in body
        assert body.get("booking_id") == bid

        # If pickup_coord came back non-null, it should be cached on the booking doc
        if body.get("pickup_coord"):
            db_doc = mongo.bookings.find_one({"id": bid}, {"_id": 0, "pickup_coord": 1})
            assert db_doc.get("pickup_coord"), \
                "pickup_coord should be cached on the booking doc after the first call"
            # Coord should be a 2-tuple/list-like of numbers, or a dict with lat/lng
            pc = db_doc["pickup_coord"]
            if isinstance(pc, dict):
                assert "lat" in pc or "latitude" in pc
            else:
                assert len(pc) >= 2

    def test_driver_location_uses_cached_coord(self, mongo, auth_headers, created_booking):
        """Pre-cache coords on the doc; the endpoint should return them without re-geocoding."""
        bid = created_booking["id"]
        mongo.bookings.update_one(
            {"id": bid},
            {"$set": {
                "pickup_coord": {"lat": 37.6188, "lng": -122.3754},
                "dropoff_coord": {"lat": 37.7898, "lng": -122.3942},
            }},
        )
        r = requests.get(
            f"{BASE_URL}/api/customer/bookings/{bid}/driver-location",
            headers=auth_headers, timeout=10,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["pickup_coord"]["lat"] == pytest.approx(37.6188)
        assert body["dropoff_coord"]["lng"] == pytest.approx(-122.3942)


# ----------------------- 4. Regression: token-based cancel -----------------------

class TestTokenBasedCancelRegression:

    def test_token_cancel_unpaid_still_works(self, mongo, created_booking):
        token = created_booking["manage_token"]
        r = requests.post(
            f"{BASE_URL}/api/bookings/manage/{token}/cancel",
            json={"reason": "regression test"}, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("status") == "cancelled"
        db_doc = mongo.bookings.find_one({"id": created_booking["id"]}, {"_id": 0})
        assert db_doc["status"] == "cancelled"
        # Token endpoint historically did NOT set cancellation_source; just verify cancellation_requested set
        assert db_doc.get("cancellation_requested") is True

    def test_token_cancel_bad_token_returns_404(self):
        r = requests.post(
            f"{BASE_URL}/api/bookings/manage/does-not-exist/cancel",
            json={"reason": "x"}, timeout=10,
        )
        assert r.status_code == 404


# --------------- 5. Regression: forgot-password + reset-password ---------------

class TestPasswordResetRegression:

    def test_forgot_password_returns_generic_ok(self):
        # Known email
        r = requests.post(f"{BASE_URL}/api/customer/forgot-password",
                          json={"email": RIDER_EMAIL}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True
        # Unknown email — should ALSO return 200 (no user enumeration)
        r2 = requests.post(f"{BASE_URL}/api/customer/forgot-password",
                           json={"email": f"nobody-{uuid.uuid4().hex}@example.com"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("ok") is True

    def test_reset_password_invalid_token(self):
        r = requests.post(f"{BASE_URL}/api/customer/reset-password",
                          json={"token": "invalid_token_xxxxxxxxxx",
                                "new_password": "NewPass456!"}, timeout=10)
        assert r.status_code == 400

    def test_reset_password_full_flow(self, mongo, rider_customer_id):
        """Insert a token directly, call reset, then log in with the new password,
        then restore the original password so subsequent test runs still work."""
        token_str = "tk_" + uuid.uuid4().hex
        mongo.password_reset_tokens.insert_one({
            "token": token_str,
            "customer_id": rider_customer_id,
            "email": RIDER_EMAIL,
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "used": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        new_pw = "TempPass" + uuid.uuid4().hex[:6] + "!"
        try:
            r = requests.post(f"{BASE_URL}/api/customer/reset-password",
                              json={"token": token_str, "new_password": new_pw}, timeout=10)
            assert r.status_code == 200, r.text
            # Login with new password
            r2 = requests.post(f"{BASE_URL}/api/customer/login",
                               json={"email": RIDER_EMAIL, "password": new_pw}, timeout=10)
            assert r2.status_code == 200, r2.text
            assert r2.json().get("token")
            # Token must now be marked used
            rec = mongo.password_reset_tokens.find_one({"token": token_str}, {"_id": 0})
            assert rec.get("used") is True
            # Reusing the same token should fail
            r3 = requests.post(f"{BASE_URL}/api/customer/reset-password",
                               json={"token": token_str, "new_password": "Another1!"}, timeout=10)
            assert r3.status_code == 400
        finally:
            # Restore original password via second reset token
            restore_token = "tk_restore_" + uuid.uuid4().hex
            mongo.password_reset_tokens.insert_one({
                "token": restore_token,
                "customer_id": rider_customer_id,
                "email": RIDER_EMAIL,
                "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
                "used": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            requests.post(f"{BASE_URL}/api/customer/reset-password",
                          json={"token": restore_token, "new_password": RIDER_PASSWORD}, timeout=10)
            mongo.password_reset_tokens.delete_many(
                {"customer_id": rider_customer_id, "token": {"$in": [token_str, restore_token]}}
            )
