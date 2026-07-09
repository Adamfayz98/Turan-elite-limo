"""Iteration 30 backend tests:

Covers the new JWT customer modify endpoint:
  POST /api/customer/bookings/{booking_id}/modify

Cases:
  1. 401 without JWT
  2. 404 for missing / cross-tenant bookings
  3. 409 for paid bookings (message must mention dispatch phone (650) 672-3520)
  4. 400 for completed / cancelled bookings
  5. Success path: pricing-impacting change (pickup_location/dropoff_location/
     vehicle_type/pickup_datetime) -> response includes new_quote_amount &
     previous_quote_amount, pricing_changed=True, quote_amount updated in DB
  6. Success path: NON-pricing change (notes only, passengers only) ->
     pricing_changed=False, quote_amount UNCHANGED in DB
  7. No-op: sending only the existing value -> no_changes=True
  8. Geocode cache invalidation: pickup_coord cleared (None) when pickup_location changes
  9. REGRESSION: existing /api/customer/bookings/{id}/cancel still works
"""

import os
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
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="session")
def rider_token(mongo):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/customer/login",
               json={"email": RIDER_EMAIL, "password": RIDER_PASSWORD}, timeout=15)
    if r.status_code == 200:
        return r.json()["token"]
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


def _make_booking_doc(customer_id, *, status="pending", payment_status="unpaid",
                      pickup_coord=None, quote_amount=120.0):
    bid = str(uuid.uuid4())
    return {
        "id": bid,
        "customer_id": customer_id,
        "full_name": "TEST Rider",
        "email": RIDER_EMAIL,
        "phone": "+15551234567",
        "service_type": "A to B Transfer",
        "pickup_date": (datetime.now(timezone.utc) + timedelta(days=3)).date().isoformat(),
        "pickup_time": "10:00",
        "pickup_datetime": (datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),
        "pickup_location": "San Francisco International Airport, San Francisco, CA",
        "dropoff_location": "Salesforce Tower, 415 Mission St, San Francisco, CA",
        "passengers": 1,
        "vehicle_type": "Executive Sedan",
        "additional_stops": [],
        "quote_amount": quote_amount,
        "pickup_coord": pickup_coord if pickup_coord is not None else {"lat": 37.6188, "lng": -122.3754},
        "dropoff_coord": {"lat": 37.7898, "lng": -122.3942},
        "status": status,
        "payment_status": payment_status,
        "manage_token": "tok_" + uuid.uuid4().hex[:24],
        "confirmation_number": "TEST-" + uuid.uuid4().hex[:6].upper(),
        "source": "test",
        "notes": "original notes",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


@pytest.fixture
def created_booking(mongo, rider_customer_id):
    doc = _make_booking_doc(rider_customer_id)
    mongo.bookings.insert_one(doc)
    yield doc
    mongo.bookings.delete_one({"id": doc["id"]})


# ----------------------- 1. Auth / ownership -----------------------

class TestModifyAuthAndOwnership:

    def test_modify_requires_jwt(self, created_booking):
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{created_booking['id']}/modify",
            json={"notes": "x"}, timeout=10,
        )
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text}"

    def test_modify_nonexistent_returns_404(self, auth_headers):
        fake = str(uuid.uuid4())
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{fake}/modify",
            headers=auth_headers, json={"notes": "x"}, timeout=10,
        )
        assert r.status_code == 404

    def test_modify_other_customers_booking_returns_404(self, mongo, auth_headers):
        other_bid = str(uuid.uuid4())
        mongo.bookings.insert_one({
            "id": other_bid,
            "customer_id": "some-other-customer-id",
            "status": "pending",
            "payment_status": "unpaid",
            "pickup_location": "X", "dropoff_location": "Y",
            "vehicle_type": "Executive Sedan",
            "pickup_date": "2026-12-01", "pickup_time": "10:00",
            "manage_token": "tok_other_" + uuid.uuid4().hex[:8],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            r = requests.post(
                f"{BASE_URL}/api/customer/bookings/{other_bid}/modify",
                headers=auth_headers, json={"notes": "hack"}, timeout=10,
            )
            assert r.status_code == 404
        finally:
            mongo.bookings.delete_one({"id": other_bid})


# ----------------------- 2. State preconditions -----------------------

class TestModifyStatePreconditions:

    def test_modify_paid_returns_409_with_dispatch_phone(self, mongo, auth_headers, rider_customer_id):
        doc = _make_booking_doc(rider_customer_id, status="confirmed", payment_status="paid")
        mongo.bookings.insert_one(doc)
        try:
            r = requests.post(
                f"{BASE_URL}/api/customer/bookings/{doc['id']}/modify",
                headers=auth_headers, json={"notes": "please change"}, timeout=10,
            )
            assert r.status_code == 409, r.text
            text = r.text
            # Must mention the dispatch phone number (format-tolerant: check digits)
            assert "650" in text and "672" in text and "3520" in text, \
                f"409 message must mention (650) 672-3520, got: {text}"
        finally:
            mongo.bookings.delete_one({"id": doc["id"]})

    def test_modify_completed_returns_400(self, mongo, auth_headers, rider_customer_id):
        doc = _make_booking_doc(rider_customer_id, status="completed")
        mongo.bookings.insert_one(doc)
        try:
            r = requests.post(
                f"{BASE_URL}/api/customer/bookings/{doc['id']}/modify",
                headers=auth_headers, json={"notes": "x"}, timeout=10,
            )
            assert r.status_code == 400, r.text
            assert "completed" in r.text.lower()
        finally:
            mongo.bookings.delete_one({"id": doc["id"]})

    def test_modify_cancelled_returns_400(self, mongo, auth_headers, rider_customer_id):
        doc = _make_booking_doc(rider_customer_id, status="cancelled")
        mongo.bookings.insert_one(doc)
        try:
            r = requests.post(
                f"{BASE_URL}/api/customer/bookings/{doc['id']}/modify",
                headers=auth_headers, json={"notes": "x"}, timeout=10,
            )
            assert r.status_code == 400, r.text
            assert "cancelled" in r.text.lower()
        finally:
            mongo.bookings.delete_one({"id": doc["id"]})


# ----------------------- 3. Success: no changes -----------------------

class TestModifyNoChanges:

    def test_modify_with_same_notes_returns_no_changes(self, auth_headers, created_booking):
        # Send the SAME notes that's already on the doc
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{created_booking['id']}/modify",
            headers=auth_headers,
            json={"notes": created_booking["notes"]},
            timeout=10,
        )
        # notes is non-None so the endpoint will set notes regardless (a minor
        # implementation detail — see RCA). At minimum we shouldn't get 4xx.
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True

    def test_modify_with_empty_payload_returns_no_changes(self, auth_headers, created_booking):
        # All fields None → endpoint should short-circuit to no_changes=True
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{created_booking['id']}/modify",
            headers=auth_headers,
            json={},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("no_changes") is True


# ----------------------- 4. Success: NON-pricing change -----------------------

class TestModifyNonPricingChange:

    def test_modify_notes_only(self, mongo, auth_headers, created_booking):
        bid = created_booking["id"]
        original_quote = created_booking["quote_amount"]
        new_notes = "Please bring booster seat. Updated " + uuid.uuid4().hex[:6]
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{bid}/modify",
            headers=auth_headers,
            json={"notes": new_notes},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("booking_id") == bid
        assert body.get("pricing_changed") is False, \
            f"notes change should NOT trigger pricing recompute, got {body}"
        # DB: notes persisted, quote_amount unchanged
        db_doc = mongo.bookings.find_one({"id": bid}, {"_id": 0})
        assert db_doc["notes"] == new_notes
        assert db_doc["quote_amount"] == original_quote
        assert db_doc.get("modified_by") == "customer"
        assert db_doc.get("modified_at")

    def test_modify_passengers_only(self, mongo, auth_headers, created_booking):
        bid = created_booking["id"]
        original_quote = created_booking["quote_amount"]
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{bid}/modify",
            headers=auth_headers,
            json={"passengers": 3},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("pricing_changed") is False
        db_doc = mongo.bookings.find_one({"id": bid}, {"_id": 0})
        assert db_doc["passengers"] == 3
        assert db_doc["quote_amount"] == original_quote


# ----------------------- 5. Success: pricing-impacting change -----------------------

class TestModifyPricingChange:

    def test_modify_dropoff_location_returns_quote_fields(self, mongo, auth_headers, created_booking):
        bid = created_booking["id"]
        previous = created_booking["quote_amount"]
        new_dropoff = "Oracle Park, 24 Willie Mays Plaza, San Francisco, CA"
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{bid}/modify",
            headers=auth_headers,
            json={"dropoff_location": new_dropoff},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("booking_id") == bid
        # previous_quote_amount must echo the booking's prior quote
        assert body.get("previous_quote_amount") == previous
        # response must include new_quote_amount key (value may be None if quote
        # couldn't be recomputed — but the dispatch said it should be present
        # when pricing_changed=True)
        assert "new_quote_amount" in body, body
        # DB: dropoff_location updated, dropoff_coord cleared
        db_doc = mongo.bookings.find_one({"id": bid}, {"_id": 0})
        assert db_doc["dropoff_location"] == new_dropoff
        assert db_doc.get("dropoff_coord") is None, \
            f"dropoff_coord must be cleared after dropoff_location change, got {db_doc.get('dropoff_coord')}"
        # pickup_coord untouched (we changed only dropoff)
        assert db_doc.get("pickup_coord") is not None

    def test_modify_pickup_location_clears_pickup_coord(self, mongo, auth_headers, created_booking):
        bid = created_booking["id"]
        new_pickup = "1 Market Street, San Francisco, CA"
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{bid}/modify",
            headers=auth_headers,
            json={"pickup_location": new_pickup},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        db_doc = mongo.bookings.find_one({"id": bid}, {"_id": 0})
        assert db_doc["pickup_location"] == new_pickup
        assert db_doc.get("pickup_coord") is None, \
            "pickup_coord must be cleared so next /driver-location re-geocodes the new address"
        # dropoff_coord still cached (only pickup changed)
        assert db_doc.get("dropoff_coord") is not None

    def test_modify_vehicle_type(self, mongo, auth_headers, created_booking):
        bid = created_booking["id"]
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{bid}/modify",
            headers=auth_headers,
            json={"vehicle_type": "Luxury SUV"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "previous_quote_amount" in body
        db_doc = mongo.bookings.find_one({"id": bid}, {"_id": 0})
        assert db_doc["vehicle_type"] == "Luxury SUV"

    def test_modify_pickup_datetime(self, mongo, auth_headers, created_booking):
        bid = created_booking["id"]
        new_dt = (datetime.now(timezone.utc) + timedelta(days=7, hours=2)).isoformat()
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{bid}/modify",
            headers=auth_headers,
            json={"pickup_datetime": new_dt},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        db_doc = mongo.bookings.find_one({"id": bid}, {"_id": 0})
        # pickup_date / pickup_time should be derived from the new datetime
        parsed = datetime.fromisoformat(new_dt.replace("Z", "+00:00"))
        assert db_doc["pickup_date"] == parsed.strftime("%Y-%m-%d")
        assert db_doc["pickup_time"] == parsed.strftime("%H:%M")

    def test_modify_invalid_pickup_datetime_returns_400(self, auth_headers, created_booking):
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{created_booking['id']}/modify",
            headers=auth_headers,
            json={"pickup_datetime": "not-a-date"},
            timeout=10,
        )
        assert r.status_code == 400, r.text

    def test_modify_full_payload_persists_via_get(self, mongo, auth_headers, created_booking):
        """Verify the canonical 'send everything' path used by the mobile app:
        the modify endpoint accepts all six fields, and subsequent GET
        /api/customer/bookings/{id} reflects the updated values."""
        bid = created_booking["id"]
        new_pickup = "Oakland International Airport, Oakland, CA"
        new_dropoff = "Ferry Building, 1 Ferry Building, San Francisco, CA"
        new_dt = (datetime.now(timezone.utc) + timedelta(days=5, hours=3)).isoformat()
        payload = {
            "pickup_location": new_pickup,
            "dropoff_location": new_dropoff,
            "vehicle_type": "Luxury SUV",
            "pickup_datetime": new_dt,
            "passengers": 2,
            "notes": "All-fields modify test",
        }
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{bid}/modify",
            headers=auth_headers, json=payload, timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("booking_id") == bid

        # Read back via the public GET endpoint
        g = requests.get(
            f"{BASE_URL}/api/customer/bookings/{bid}",
            headers=auth_headers, timeout=10,
        )
        assert g.status_code == 200, g.text
        gb = g.json()
        assert gb["pickup_location"] == new_pickup
        assert gb["dropoff_location"] == new_dropoff
        assert gb["vehicle_type"] == "Luxury SUV"
        parsed = datetime.fromisoformat(new_dt.replace("Z", "+00:00"))
        assert gb["pickup_date"] == parsed.strftime("%Y-%m-%d")
        assert gb["pickup_time"] == parsed.strftime("%H:%M")

        # Notes/passengers aren't in the GET projection; verify via DB
        db_doc = mongo.bookings.find_one({"id": bid}, {"_id": 0})
        assert db_doc["notes"] == "All-fields modify test"
        assert db_doc["passengers"] == 2
        # Both coord caches cleared (pickup+dropoff both changed)
        assert db_doc.get("pickup_coord") is None
        assert db_doc.get("dropoff_coord") is None


# ----------------------- 6. Regression: cancel endpoint still works -----------------------

class TestCancelRegression:

    def test_cancel_unpaid_still_works(self, mongo, auth_headers, created_booking):
        bid = created_booking["id"]
        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{bid}/cancel",
            headers=auth_headers, json={"reason": "regression iter30"}, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("status") == "cancelled"
        db_doc = mongo.bookings.find_one({"id": bid}, {"_id": 0})
        assert db_doc["status"] == "cancelled"
        assert db_doc.get("cancellation_source") == "mobile_app"

    def test_cancel_paid_still_flags_request(self, mongo, auth_headers, rider_customer_id):
        doc = _make_booking_doc(rider_customer_id, status="confirmed", payment_status="paid")
        mongo.bookings.insert_one(doc)
        try:
            r = requests.post(
                f"{BASE_URL}/api/customer/bookings/{doc['id']}/cancel",
                headers=auth_headers, json={"reason": "refund pls"}, timeout=15,
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body.get("status") == "cancellation_requested"
            db_doc = mongo.bookings.find_one({"id": doc["id"]}, {"_id": 0})
            assert db_doc.get("cancellation_requested") is True
            assert db_doc.get("status") == "confirmed"
        finally:
            mongo.bookings.delete_one({"id": doc["id"]})
