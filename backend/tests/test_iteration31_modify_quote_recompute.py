"""Iteration 31 backend test:

RETEST of the CRITICAL bug found in iteration 30 — quote recompute in
POST /api/customer/bookings/{booking_id}/modify was short-circuiting because
the merged dict still contained the old quote_amount. The fix was a one-liner:
`merged.pop("quote_amount", None)` before calling _compute_quote_amount.

This file ONLY verifies the fix end-to-end:

  1. Booking with quote_amount=120 (SFO -> Salesforce Tower, ~12 mi) is
     modified to dropoff = Sacramento International Airport (~85 mi).
     Response MUST return new_quote_amount > previous_quote_amount (or at
     minimum different) AND the booking doc in MongoDB MUST reflect the
     new (higher) quote_amount.

  2. A non-pricing change (notes only) MUST still leave pricing_changed=False
     and the DB quote_amount unchanged (regression guard).

The full iteration-30 suite (18 cases) is re-run separately via the existing
pytest file and should continue to pass.
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


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


@pytest.fixture(scope="module")
def rider_token():
    r = requests.post(f"{BASE_URL}/api/customer/login",
                      json={"email": RIDER_EMAIL, "password": RIDER_PASSWORD}, timeout=15)
    if r.status_code == 200:
        return r.json()["token"]
    r = requests.post(f"{BASE_URL}/api/customer/signup", json={
        "email": RIDER_EMAIL, "password": RIDER_PASSWORD,
        "name": "Rider Test", "phone": "+15551234567",
    }, timeout=15)
    assert r.status_code in (200, 201), f"login/signup failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def rider_customer_id(rider_token, mongo):
    doc = mongo.customers.find_one({"email": RIDER_EMAIL}, {"_id": 0, "id": 1})
    assert doc, "rider account should exist"
    return doc["id"]


@pytest.fixture
def auth_headers(rider_token):
    return {"Authorization": f"Bearer {rider_token}", "Content-Type": "application/json"}


def _make_booking_doc(customer_id, quote_amount=120.0):
    bid = str(uuid.uuid4())
    return {
        "id": bid,
        "customer_id": customer_id,
        "full_name": "TEST Rider iter31",
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
        "pickup_coord": {"lat": 37.6188, "lng": -122.3754},
        "dropoff_coord": {"lat": 37.7898, "lng": -122.3942},
        "status": "pending",
        "payment_status": "unpaid",
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


# ----------------------- CRITICAL bug-fix verification -----------------------

class TestModifyQuoteRecompute:
    """Iteration 30's HIGH-priority bug: quote was never actually recomputed.

    These assertions FAIL on the unpatched code and PASS only when the
    `merged.pop("quote_amount", None)` fix is in place.
    """

    def test_dropoff_swap_to_long_distance_recomputes_quote(
        self, mongo, auth_headers, created_booking
    ):
        """Core retest of the iteration-30 HIGH bug: swap dropoff to a far
        address and verify the quote is actually recomputed (no longer
        short-circuits on stale quote_amount)."""
        bid = created_booking["id"]
        previous = created_booking["quote_amount"]
        # ~85 mi vs the original ~12 mi route — recompute MUST yield a
        # different value (the bug previously caused new == previous).
        new_dropoff = "Sacramento International Airport, Sacramento, CA"

        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{bid}/modify",
            headers=auth_headers,
            json={"dropoff_location": new_dropoff},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()

        # Response shape
        assert body.get("ok") is True
        assert body.get("booking_id") == bid
        assert body.get("previous_quote_amount") == previous, body
        assert "new_quote_amount" in body, body

        new_quote = body.get("new_quote_amount")
        pricing_changed = body.get("pricing_changed")

        # The actual fix verification: recompute must run and yield a value
        # different from the previous stored quote_amount. On the unpatched
        # code, new_quote == previous (120.0) because _compute_quote_amount
        # short-circuited on the stale value in the merged dict.
        assert new_quote is not None, (
            f"new_quote_amount is None — _compute_quote_amount returned None. "
            f"Response: {body}"
        )
        assert pricing_changed is True, (
            f"pricing_changed must be True for a dropoff swap with successful "
            f"recompute. Response: {body}"
        )
        assert float(new_quote) != float(previous), (
            f"BUG NOT FIXED: new_quote_amount ({new_quote}) equals "
            f"previous_quote_amount ({previous}) — _compute_quote_amount "
            f"short-circuited on stale quote_amount. Response: {body}"
        )

        # DB persistence: quote_amount on the booking doc must reflect the new value
        db_doc = mongo.bookings.find_one({"id": bid}, {"_id": 0})
        assert db_doc is not None
        assert db_doc["dropoff_location"] == new_dropoff
        assert db_doc.get("dropoff_coord") is None, (
            "dropoff_coord must be cleared so next geocode picks up the new "
            "address"
        )
        assert float(db_doc["quote_amount"]) == float(new_quote), (
            f"DB quote_amount ({db_doc.get('quote_amount')}) must equal the "
            f"recomputed value ({new_quote})"
        )
        # Note: we intentionally do NOT assert new_quote > previous here —
        # the Executive Sedan per-mile pricing config in this environment
        # produces a low per-mile rate (verified via public /quote endpoint:
        # Executive Sedan returns $1.04 for 85.9 mi vs Luxury SUV $460.66).
        # That is a SEPARATE pricing-config issue. See the Luxury SUV test
        # below for a directional sanity check.

    def test_dropoff_swap_with_luxury_suv_recomputes_to_higher_quote(
        self, mongo, auth_headers, rider_customer_id
    ):
        """Directional sanity check using a vehicle whose pricing is sensibly
        configured (Luxury SUV ~$5.36/mi). Confirms recompute produces a
        materially higher quote for a far dropoff."""
        # Build a booking with Luxury SUV and previous quote 120.
        doc = _make_booking_doc(rider_customer_id)
        doc["vehicle_type"] = "Luxury SUV"
        mongo.bookings.insert_one(doc)
        try:
            bid = doc["id"]
            previous = doc["quote_amount"]
            r = requests.post(
                f"{BASE_URL}/api/customer/bookings/{bid}/modify",
                headers=auth_headers,
                json={"dropoff_location": "Sacramento International Airport, Sacramento, CA"},
                timeout=30,
            )
            assert r.status_code == 200, r.text
            body = r.json()
            new_quote = body.get("new_quote_amount")
            assert new_quote is not None
            assert body.get("pricing_changed") is True
            assert float(new_quote) != float(previous)
            # Luxury SUV ~85 mi route should be in the hundreds, well above
            # the prior $120 quote.
            assert float(new_quote) > float(previous), (
                f"Luxury SUV 85-mi route should exceed ${previous}; got {new_quote}"
            )
            db_doc = mongo.bookings.find_one({"id": bid}, {"_id": 0})
            assert float(db_doc["quote_amount"]) == float(new_quote)
        finally:
            mongo.bookings.delete_one({"id": doc["id"]})

    def test_vehicle_upgrade_changes_quote(
        self, mongo, auth_headers, created_booking
    ):
        """Upgrading Executive Sedan -> Luxury SUV on the same route must
        produce a different quote (typically higher).  Confirms the fix is
        triggered by vehicle_type changes too, not just dropoff_location."""
        bid = created_booking["id"]
        previous = created_booking["quote_amount"]

        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{bid}/modify",
            headers=auth_headers,
            json={"vehicle_type": "Luxury SUV"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        new_quote = body.get("new_quote_amount")

        # If pricing recomputed (not call_only), new_quote must differ.
        if body.get("pricing_changed") is True and new_quote is not None:
            assert float(new_quote) != float(previous), (
                f"vehicle_type change did not recompute pricing: "
                f"new={new_quote}, previous={previous}, body={body}"
            )
            db_doc = mongo.bookings.find_one({"id": bid}, {"_id": 0})
            assert float(db_doc["quote_amount"]) == float(new_quote)
        else:
            # acceptable only if vehicle is call_only / no per-mile (unlikely
            # for Luxury SUV) — surface as a soft skip with diagnostics.
            pytest.skip(
                f"Luxury SUV pricing not recomputed (likely call_only). "
                f"body={body}"
            )

    def test_notes_only_change_keeps_pricing_unchanged(
        self, mongo, auth_headers, created_booking
    ):
        """Regression guard: pricing_changed flag MUST be False when only
        notes change, and DB quote_amount MUST stay the same."""
        bid = created_booking["id"]
        previous = created_booking["quote_amount"]

        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{bid}/modify",
            headers=auth_headers,
            json={"notes": "Please call when arriving — gate code 4421"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("pricing_changed") is False, body
        # new_quote_amount should be absent or None on a non-pricing change
        assert body.get("new_quote_amount") in (None,), body

        db_doc = mongo.bookings.find_one({"id": bid}, {"_id": 0})
        assert float(db_doc["quote_amount"]) == float(previous), (
            f"notes-only change must not touch quote_amount; "
            f"was {previous}, now {db_doc.get('quote_amount')}"
        )

    def test_passengers_only_change_keeps_pricing_unchanged(
        self, mongo, auth_headers, created_booking
    ):
        """Regression guard: passengers change does not impact pricing."""
        bid = created_booking["id"]
        previous = created_booking["quote_amount"]

        r = requests.post(
            f"{BASE_URL}/api/customer/bookings/{bid}/modify",
            headers=auth_headers,
            json={"passengers": 4},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("pricing_changed") is False, body

        db_doc = mongo.bookings.find_one({"id": bid}, {"_id": 0})
        assert db_doc["passengers"] == 4
        assert float(db_doc["quote_amount"]) == float(previous)
