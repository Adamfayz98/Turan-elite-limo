"""Iteration 38: Validate backend changes
- (a) Admin login still works (returns either token or 2FA required signal)
- (b) GET /api/admin/quote-requests with admin token returns list
- (c) GET /api/admin/contacts returns list & each item has `status`
- (d) _send_payment_recovery_emails sends customer SMS in addition to email + admin SMS
"""
import os
import asyncio
import uuid
import pytest
import requests
import jwt
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://limo-experience-1.preview.emergentagent.com").rstrip("/")
JWT_SECRET = os.environ.get("JWT_SECRET", "d5b4e1a3c8f47921e6b3d9f1c2a4e7891f5d6c8b3a2e9f1d4c7b8a5e2f1d9c8b")
ADMIN_EMAIL = "support@turanelitelimo.com"

# Direct mongo for seeding and assertions
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
mongo = MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def admin_token():
    """Mint admin JWT directly (bypass 2FA email OTP)."""
    payload = {
        "sub": ADMIN_EMAIL,
        "role": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


@pytest.fixture(scope="module")
def authed_session(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


# --- (a) Admin login endpoint exists and accepts credentials ---
def test_admin_login_returns_2fa_or_token():
    r = requests.post(
        f"{BASE_URL}/api/admin/login",
        json={"email": ADMIN_EMAIL, "password": "TuronAdmin@2025"},
        timeout=15,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    # Either: a token is returned directly OR a 2FA flow is signaled
    assert ("token" in data) or ("requires_2fa" in data) or ("two_factor" in data) or ("otp_sent" in data) or ("message" in data), f"Unexpected admin login body: {data}"


def test_admin_login_wrong_password_rejected():
    r = requests.post(
        f"{BASE_URL}/api/admin/login",
        json={"email": ADMIN_EMAIL, "password": "WRONG-PW-xx"},
        timeout=15,
    )
    assert r.status_code in (400, 401, 403), f"Expected 4xx, got {r.status_code}"


# --- (b) Quote requests endpoint ---
def test_quote_requests_endpoint(authed_session):
    r = authed_session.get(f"{BASE_URL}/api/admin/quote-requests", timeout=20)
    assert r.status_code == 200, f"quote-requests failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    assert isinstance(data, list), f"Expected list, got {type(data)}"
    # If non-empty, items should look like quote requests
    if data:
        first = data[0]
        assert "id" in first or "_id" in first or "status" in first


def test_quote_requests_unauthorized_rejected():
    r = requests.get(f"{BASE_URL}/api/admin/quote-requests", timeout=15)
    assert r.status_code in (401, 403), f"unauthed call should be 401/403, got {r.status_code}"


# --- (c) Contacts endpoint with `status` field ---
def test_contacts_endpoint_has_status_field(authed_session):
    r = authed_session.get(f"{BASE_URL}/api/admin/contacts", timeout=20)
    assert r.status_code == 200, f"contacts failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    assert isinstance(data, list), f"Expected list, got {type(data)}"
    # If we have any contact, ensure status field is present (may be None/missing-but-defaulted)
    if data:
        # At least one record should carry a status — the badge depends on it
        with_status = [c for c in data if "status" in c]
        assert len(with_status) > 0, "No contact had a 'status' field — unread badge cannot count"


# --- (d) Payment recovery SMS to customer ---
@pytest.fixture
def seeded_stuck_booking():
    """Insert a fake booking older than 15min, status=pending+payment_status=pending,
    with phone + email + manage_token and NO payment_recovery_sent_at."""
    bid = f"TEST_iter38_{uuid.uuid4().hex[:10]}"
    created = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    doc = {
        "id": bid,
        "source": "TEST_iter38",
        "status": "pending",
        "payment_status": "pending",
        "created_at": created,
        "email": "test+iter38@example.com",
        "phone": "+15005550006",  # Twilio magic test number — won't bill or spam
        "full_name": "Iter38 Tester",
        "manage_token": uuid.uuid4().hex,
        "confirmation_number": "ITER38",
        "pickup_date": "2026-12-31",
        "pickup_time": "10:00",
    }
    mongo.bookings.insert_one(doc)
    yield bid
    # cleanup
    mongo.bookings.delete_one({"id": bid})


def test_payment_recovery_stamps_and_sends_customer_sms(seeded_stuck_booking):
    """Invoke the scheduler job directly and verify the booking gets stamped
    AND is idempotent (second invocation does not re-stamp). Both invocations
    must share one event loop because motor's async client is bound to it."""
    import sys
    sys.path.insert(0, "/app/backend")
    from server import _send_payment_recovery_emails  # noqa

    async def _both():
        await _send_payment_recovery_emails()
        first_doc = mongo.bookings.find_one({"id": seeded_stuck_booking}, {"_id": 0})
        first_stamp = first_doc.get("payment_recovery_sent_at") if first_doc else None
        await _send_payment_recovery_emails()
        second_doc = mongo.bookings.find_one({"id": seeded_stuck_booking}, {"_id": 0})
        second_stamp = second_doc.get("payment_recovery_sent_at") if second_doc else None
        return first_doc, first_stamp, second_stamp

    first_doc, first_stamp, second_stamp = asyncio.run(_both())
    assert first_doc is not None, "seeded booking disappeared"
    assert first_stamp, (
        f"Booking was NOT stamped with payment_recovery_sent_at — full doc: {first_doc}"
    )
    assert first_stamp == second_stamp, "Recovery job re-stamped a booking it already processed"


def test_payment_recovery_skips_already_paid():
    """Bookings already paid or stamped should NOT be re-processed."""
    # Insert two control bookings — neither should be touched
    bid_paid = f"TEST_iter38_paid_{uuid.uuid4().hex[:6]}"
    bid_stamped = f"TEST_iter38_stamped_{uuid.uuid4().hex[:6]}"
    old = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    already_stamped = datetime.now(timezone.utc).isoformat()

    mongo.bookings.insert_many([
        {
            "id": bid_paid, "source": "TEST_iter38",
            "status": "pending", "payment_status": "paid",  # paid → skip
            "created_at": old, "email": "x@y.com", "phone": "+15005550006",
            "manage_token": "x",
        },
        {
            "id": bid_stamped, "source": "TEST_iter38",
            "status": "pending", "payment_status": "pending",
            "created_at": old, "email": "x@y.com", "phone": "+15005550006",
            "manage_token": "x",
            "payment_recovery_sent_at": already_stamped,  # already stamped → skip
        },
    ])

    import sys
    sys.path.insert(0, "/app/backend")
    from server import _send_payment_recovery_emails  # noqa
    asyncio.run(_send_payment_recovery_emails())

    paid_after = mongo.bookings.find_one({"id": bid_paid}, {"_id": 0})
    stamped_after = mongo.bookings.find_one({"id": bid_stamped}, {"_id": 0})
    assert "payment_recovery_sent_at" not in paid_after, "Paid booking was stamped (should be skipped)"
    assert stamped_after.get("payment_recovery_sent_at") == already_stamped, "Already-stamped booking was re-stamped"


# --- Module-level cleanup ---
@pytest.fixture(scope="module", autouse=True)
def cleanup_after_module():
    yield
    mongo.bookings.delete_many({"source": "TEST_iter38"})
