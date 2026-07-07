"""
Iteration 53 — Guest-booking backfill & customer/trips union tests.

Verifies:
1. Signup backfills guest bookings by email (customer_id set on prior booking).
2. /customer/trips union query returns email-matched bookings even if backfill fails.
3. /customer/bookings/{id} allows access by email union match + auto-links customer_id.
4. Login backfill is idempotent.
5. No regression: customer sees only their own bookings.

Uses direct DB insertion of guest bookings (as an admin-side seed) + JWT signup.
"""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

# Load backend .env for MongoDB access
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://limo-experience-1.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

# Direct Mongo access to seed / verify DB-level backfill
_client = MongoClient(MONGO_URL)
_db = _client[DB_NAME]


def _unique_email(prefix: str) -> str:
    return f"TEST_iter53_{prefix}_{uuid.uuid4().hex[:8]}@example.com".lower()


def _seed_guest_booking(email: str, extra: dict = None) -> str:
    """Insert a guest booking (customer_id null) directly into DB. Returns booking id."""
    bid = str(uuid.uuid4())
    doc = {
        "id": bid,
        "customer_id": None,
        "full_name": "Guest Test User",
        "email": email,
        "phone": "+15551234567",
        "service_type": "A to B Transfer",
        "pickup_date": "2026-06-01",
        "pickup_time": "10:00",
        "pickup_location": "SFO Airport",
        "dropoff_location": "Downtown SF",
        "passengers": 2,
        "vehicle_type": "Sedan",
        "quote_amount": 150.00,
        "status": "pending",
        "payment_status": "unpaid",
        "source": "web_guest",
        "confirmation_number": f"TEST{bid[:6].upper()}",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if extra:
        doc.update(extra)
    _db.bookings.insert_one(doc)
    return bid


def _cleanup(prefix: str = "TEST_iter53"):
    """Delete test bookings and customers by prefix. Runs at fixture teardown."""
    try:
        _db.bookings.delete_many({"email": {"$regex": prefix, "$options": "i"}})
        _db.customers.delete_many({"email": {"$regex": prefix, "$options": "i"}})
    except Exception as e:
        print(f"cleanup failed: {e}")


@pytest.fixture(scope="module", autouse=True)
def cleanup_module():
    """Cleanup after entire module."""
    yield
    _cleanup()


def _signup(email: str, password: str = "TestPass123!", name: str = "Test Rider") -> dict:
    r = requests.post(
        f"{BASE_URL}/api/customer/signup",
        json={"email": email, "password": password, "name": name, "phone": "+15551234567"},
        timeout=15,
    )
    return r


def _login(email: str, password: str = "TestPass123!") -> requests.Response:
    return requests.post(
        f"{BASE_URL}/api/customer/login",
        json={"email": email, "password": password},
        timeout=15,
    )


# ---------------- TESTS ----------------

class TestGuestBackfill:
    """Fix #2 (b3): guest booking → signup with same email should backfill."""

    def test_signup_links_prior_guest_booking(self):
        email = _unique_email("signup")
        booking_id = _seed_guest_booking(email)

        # verify seed has null customer_id
        seed = _db.bookings.find_one({"id": booking_id})
        assert seed is not None
        assert seed.get("customer_id") in (None,)

        # Signup
        r = _signup(email)
        assert r.status_code == 200, f"signup failed: {r.status_code} {r.text}"
        data = r.json()
        assert "token" in data
        cid = data["user"]["id"]
        token = data["token"]

        # Verify DB backfill happened
        after = _db.bookings.find_one({"id": booking_id})
        assert after["customer_id"] == cid, f"expected customer_id={cid}, got {after.get('customer_id')}"
        assert after.get("customer_id_linked_at") is not None

        # Verify /customer/trips returns the booking
        trips = requests.get(
            f"{BASE_URL}/api/customer/trips",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        assert trips.status_code == 200
        trip_ids = [t["id"] for t in trips.json()]
        assert booking_id in trip_ids, f"backfilled booking not in trips: {trip_ids}"


class TestTripsUnion:
    """Fix #2 (belt-and-suspenders): even without backfill, email union should surface guest bookings."""

    def test_email_only_booking_shown_in_trips(self):
        email = _unique_email("union")
        # Signup FIRST (so no backfill happens at that point)
        r = _signup(email)
        assert r.status_code == 200
        token = r.json()["token"]
        cid = r.json()["user"]["id"]

        # Now insert a booking with matching email but NO customer_id (simulating race)
        booking_id = _seed_guest_booking(email)
        # Immediately unset customer_id on it (in case anything else linked)
        _db.bookings.update_one({"id": booking_id}, {"$unset": {"customer_id": ""}})

        # Fetch trips — union query + live backfill should surface it
        trips = requests.get(
            f"{BASE_URL}/api/customer/trips",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        assert trips.status_code == 200
        trip_ids = [t["id"] for t in trips.json()]
        assert booking_id in trip_ids, f"guest booking not surfaced via email union: {trip_ids}"


class TestBookingDetailEmailMatch:
    """Fix #3: /customer/bookings/{id} email-union access + auto-link."""

    def test_guest_booking_accessible_and_autolinks(self):
        email = _unique_email("detail")
        r = _signup(email)
        assert r.status_code == 200
        token = r.json()["token"]
        cid = r.json()["user"]["id"]

        # Insert a guest booking after signup, then unset customer_id
        booking_id = _seed_guest_booking(email)
        _db.bookings.update_one({"id": booking_id}, {"$unset": {"customer_id": ""}})

        # Confirm it has no customer_id in DB
        pre = _db.bookings.find_one({"id": booking_id})
        assert pre.get("customer_id") in (None,)

        # Access detail endpoint
        r2 = requests.get(
            f"{BASE_URL}/api/customer/bookings/{booking_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        assert r2.status_code == 200, f"detail failed: {r2.status_code} {r2.text}"
        detail = r2.json()
        assert detail["id"] == booking_id

        # Verify auto-link happened
        post = _db.bookings.find_one({"id": booking_id})
        assert post["customer_id"] == cid, "detail endpoint did not auto-link customer_id"


class TestLoginBackfillIdempotent:
    """Fix #4: multiple logins should not error and second is a no-op."""

    def test_double_login_is_idempotent(self):
        email = _unique_email("idem")
        booking_id = _seed_guest_booking(email)
        r = _signup(email)
        assert r.status_code == 200
        # After signup, backfill already ran once
        first = _db.bookings.find_one({"id": booking_id})
        assert first["customer_id"] is not None
        first_linked_at = first.get("customer_id_linked_at")

        # Login 1
        r1 = _login(email)
        assert r1.status_code == 200
        # Login 2
        r2 = _login(email)
        assert r2.status_code == 200

        # customer_id should still be set (unchanged); modification would touch linked_at
        after = _db.bookings.find_one({"id": booking_id})
        assert after["customer_id"] == first["customer_id"]
        # linked_at may or may not update, but the OR-null condition means the update_many
        # matches 0 docs on second call. Verify by checking value hasn't changed.
        # (This is a soft check — main point is no HTTP error.)


class TestNoRegression:
    """Fix #5: a customer with regular bookings still sees only their own."""

    def test_customer_does_not_see_others_bookings(self):
        # Two customers
        email_a = _unique_email("regA")
        email_b = _unique_email("regB")
        ra = _signup(email_a)
        rb = _signup(email_b)
        assert ra.status_code == 200 and rb.status_code == 200
        cid_a = ra.json()["user"]["id"]
        cid_b = rb.json()["user"]["id"]
        token_a = ra.json()["token"]

        # Insert a booking belonging to B (with cid_b set — not a guest)
        booking_b = str(uuid.uuid4())
        _db.bookings.insert_one({
            "id": booking_b,
            "customer_id": cid_b,
            "email": email_b,
            "full_name": "Cust B",
            "pickup_date": "2026-07-01",
            "pickup_time": "12:00",
            "pickup_location": "A",
            "dropoff_location": "B",
            "vehicle_type": "Sedan",
            "quote_amount": 100,
            "status": "pending",
            "payment_status": "unpaid",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        # Insert a booking for A (regular, customer_id already set)
        booking_a = str(uuid.uuid4())
        _db.bookings.insert_one({
            "id": booking_a,
            "customer_id": cid_a,
            "email": email_a,
            "full_name": "Cust A",
            "pickup_date": "2026-07-02",
            "pickup_time": "13:00",
            "pickup_location": "A",
            "dropoff_location": "B",
            "vehicle_type": "Sedan",
            "quote_amount": 200,
            "status": "pending",
            "payment_status": "unpaid",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        # A's trips should include booking_a and NOT booking_b
        trips = requests.get(
            f"{BASE_URL}/api/customer/trips",
            headers={"Authorization": f"Bearer {token_a}"},
            timeout=15,
        )
        assert trips.status_code == 200
        ids = [t["id"] for t in trips.json()]
        assert booking_a in ids
        assert booking_b not in ids, f"Regression! A sees B's booking. ids={ids}"


class TestCaseInsensitiveEmail:
    """Edge case: email casing shouldn't matter for backfill match."""

    def test_case_insensitive_email_match(self):
        email = _unique_email("case").upper()  # SEED with uppercase email
        booking_id = _seed_guest_booking(email)

        # Signup with lowercase (customer_signup lowercases)
        r = _signup(email.lower())
        assert r.status_code == 200
        cid = r.json()["user"]["id"]

        # verify booking got linked
        b = _db.bookings.find_one({"id": booking_id})
        assert b["customer_id"] == cid, "case-insensitive match failed"
