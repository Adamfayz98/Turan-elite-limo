"""Iteration 8 backend tests:
- GET /api/reviews fallback (handpicked) + sources object
- Booking model: manage_token, completed_at, cancellation_requested fields
- PATCH /api/admin/bookings/{id} confirmed -> manage_token + confirmation_number
- PATCH /api/admin/bookings/{id} completed -> completed_at
- GET /api/bookings/manage/{token} sanitized output + 404
- POST /api/bookings/manage/{token}/cancel for unpaid -> cancelled
- POST /api/bookings/manage/{token}/cancel for paid -> cancellation_requested
- POST /api/bookings/manage/{token}/cancel for completed -> 400
- Idempotent cancel for already-cancelled
- sms_service no-op when env keys blank
- APScheduler _send_pending_review_requests registered
- Public regression
"""
import os
import re
import uuid
import pytest
import requests
import bcrypt
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "turonlimosupport@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "TuronAdmin@2025")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
CN_REGEX = re.compile(r"^TEL-[A-HJ-NP-Z2-9]{6}$")


def _mongo():
    return MongoClient(MONGO_URL)[DB_NAME]


def _insert_known_challenge(admin_email=ADMIN_EMAIL, code="123456"):
    db = _mongo()
    cid = str(uuid.uuid4())
    code_hash = bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()
    db.admin_2fa_challenges.insert_one({
        "challenge_id": cid,
        "admin_email": admin_email,
        "code_hash": code_hash,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        "attempts": 0,
        "used": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return cid


@pytest.fixture(scope="session")
def admin_token():
    cid = _insert_known_challenge()
    r = requests.post(f"{API}/admin/verify-2fa",
                      json={"challenge_id": cid, "code": "123456"}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _create_booking():
    payload = {
        "full_name": "TEST_iter8 Customer",
        "email": "test-iter8@example.com",
        "phone": "+14155550199",
        "service_type": "Airport Transfer",
        "vehicle_type": "Executive Sedan",
        "pickup_date": "2026-12-31",
        "pickup_time": "14:00",
        "pickup_location": "SFO Airport, San Francisco, CA",
        "dropoff_location": "501 Broadway, Millbrae, CA",
        "passengers": 2,
        "luggage_count": 1,
        "child_seat": False,
        "return_trip": False,
        "additional_stops": [],
        "notes": "iter8 automated test",
    }
    r = requests.post(f"{API}/bookings", json=payload, timeout=20)
    assert r.status_code in (200, 201), r.text
    return r.json()


# ================== /api/reviews ==================
class TestReviews:
    def test_reviews_fallback_handpicked(self):
        r = requests.get(f"{API}/reviews", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "reviews" in d and "sources" in d
        s = d["sources"]
        # Env keys are blank, so configured flags must be False
        assert s.get("google_configured") is False
        assert s.get("yelp_configured") is False
        assert s.get("google_count") == 0
        assert s.get("yelp_count") == 0
        revs = d["reviews"]
        assert isinstance(revs, list) and len(revs) == 3
        for r0 in revs:
            assert r0.get("source") == "handpicked"
            assert r0.get("rating") == 5
            assert r0.get("author")
            assert r0.get("text")


# ============ Booking manage flow + admin patch ============
class TestManageBooking:
    def test_admin_patch_confirmed_generates_manage_token_and_cn(self, auth_headers):
        b = _create_booking()
        bid = b["id"]
        r = requests.patch(f"{API}/admin/bookings/{bid}",
                           json={"status": "confirmed"}, headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "confirmed"
        assert d.get("manage_token"), "manage_token should be set"
        assert isinstance(d["manage_token"], str) and len(d["manage_token"]) >= 16
        assert d.get("confirmation_number") and CN_REGEX.match(d["confirmation_number"])

        # GET manage page returns sanitized info
        token = d["manage_token"]
        gr = requests.get(f"{API}/bookings/manage/{token}", timeout=20)
        assert gr.status_code == 200, gr.text
        gd = gr.json()
        assert gd["confirmation_number"] == d["confirmation_number"]
        assert gd["full_name"] == "TEST_iter8 Customer"
        assert gd["status"] == "confirmed"
        assert gd["payment_status"] == "unpaid"
        assert gd.get("cancellation_requested") is False
        assert gd.get("support_phone") and gd.get("support_email")
        # sanitized: must not leak private fields
        assert "password_hash" not in gd

        # Cleanup
        requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers, timeout=20)

    def test_admin_patch_completed_sets_completed_at(self, auth_headers):
        b = _create_booking()
        bid = b["id"]
        # Completed transition
        r = requests.patch(f"{API}/admin/bookings/{bid}",
                           json={"status": "completed"}, headers=auth_headers, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "completed"
        assert d.get("completed_at"), "completed_at should be stamped"
        # ISO parse
        ts = datetime.fromisoformat(d["completed_at"].replace("Z", "+00:00"))
        assert ts.tzinfo is not None
        # cleanup
        requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers, timeout=20)

    def test_manage_view_invalid_token_404(self):
        r = requests.get(f"{API}/bookings/manage/this-is-not-a-real-token", timeout=20)
        assert r.status_code == 404
        assert "not found" in (r.json().get("detail", "").lower() + " expired")

    def test_cancel_unpaid_booking_flips_to_cancelled(self, auth_headers):
        b = _create_booking()
        bid = b["id"]
        r = requests.patch(f"{API}/admin/bookings/{bid}",
                           json={"status": "confirmed"}, headers=auth_headers, timeout=20)
        token = r.json()["manage_token"]

        cr = requests.post(f"{API}/bookings/manage/{token}/cancel",
                           json={"reason": "Plans changed"}, timeout=20)
        assert cr.status_code == 200, cr.text
        cd = cr.json()
        assert cd["ok"] is True
        assert cd["status"] == "cancelled"

        # Verify GET shows status=cancelled
        gr = requests.get(f"{API}/bookings/manage/{token}", timeout=20)
        assert gr.status_code == 200
        gd = gr.json()
        assert gd["status"] == "cancelled"
        assert gd["cancellation_requested"] is True

        # Idempotent: cancel again
        again = requests.post(f"{API}/bookings/manage/{token}/cancel", json={}, timeout=20)
        assert again.status_code == 200
        ad = again.json()
        assert ad["ok"] is True
        assert ad.get("already_cancelled") is True
        # cleanup
        requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers, timeout=20)

    def test_cancel_paid_booking_flags_cancellation_requested(self, auth_headers):
        b = _create_booking()
        bid = b["id"]
        # confirm + flip to paid manually in DB
        r = requests.patch(f"{API}/admin/bookings/{bid}",
                           json={"status": "confirmed"}, headers=auth_headers, timeout=20)
        token = r.json()["manage_token"]
        _mongo().bookings.update_one(
            {"id": bid},
            {"$set": {"payment_status": "paid", "paid_amount": 199.0}},
        )

        cr = requests.post(f"{API}/bookings/manage/{token}/cancel",
                           json={"reason": "Refund please"}, timeout=20)
        assert cr.status_code == 200, cr.text
        cd = cr.json()
        assert cd["ok"] is True
        assert cd["status"] == "cancellation_requested"

        # GET manage shows cancellation_requested=True but status still confirmed
        gr = requests.get(f"{API}/bookings/manage/{token}", timeout=20)
        assert gr.status_code == 200
        gd = gr.json()
        assert gd["cancellation_requested"] is True
        assert gd["status"] == "confirmed"

        # Verify DB has cancellation_reason persisted
        doc = _mongo().bookings.find_one({"id": bid})
        assert doc.get("cancellation_reason") == "Refund please"

        requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers, timeout=20)

    def test_cancel_completed_booking_400(self, auth_headers):
        b = _create_booking()
        bid = b["id"]
        r = requests.patch(f"{API}/admin/bookings/{bid}",
                           json={"status": "confirmed"}, headers=auth_headers, timeout=20)
        token = r.json()["manage_token"]
        # mark completed
        requests.patch(f"{API}/admin/bookings/{bid}",
                       json={"status": "completed"}, headers=auth_headers, timeout=20)

        cr = requests.post(f"{API}/bookings/manage/{token}/cancel", json={}, timeout=20)
        assert cr.status_code == 400, cr.text
        msg = cr.json().get("detail", "").lower()
        assert "complete" in msg

        requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers, timeout=20)


# ============ Booking model fields visible via admin list ============
class TestBookingModelFields:
    def test_booking_doc_has_new_fields(self, auth_headers):
        b = _create_booking()
        bid = b["id"]
        # confirm
        r = requests.patch(f"{API}/admin/bookings/{bid}",
                           json={"status": "confirmed"}, headers=auth_headers, timeout=20)
        d = r.json()
        # Booking model fields
        for k in ["manage_token", "review_request_sent_at",
                  "cancellation_requested", "cancellation_reason", "completed_at"]:
            assert k in d, f"missing field {k} in admin booking response"
        assert d["cancellation_requested"] is False
        assert d["completed_at"] is None
        assert d["review_request_sent_at"] is None

        requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers, timeout=20)


# ===================== SMS service no-op =====================
class TestSMSService:
    def test_sms_no_op_when_env_blank(self):
        # Import after PATH so backend module is found
        import sys
        sys.path.insert(0, "/app/backend")
        import importlib
        sms = importlib.import_module("sms_service")
        assert sms.is_configured() is False
        assert sms.admin_phone() == ""
        # send_sms returns None when no creds (run via asyncio)
        import asyncio
        result = asyncio.run(sms.send_sms("+14155550100", "test message body"))
        assert result is None

    def test_sms_render_helpers(self):
        import sys
        sys.path.insert(0, "/app/backend")
        import importlib
        sms = importlib.import_module("sms_service")
        booking = {
            "confirmation_number": "TEL-ABC123",
            "full_name": "Jane Doe",
            "phone": "+14155550199",
            "pickup_date": "2026-12-31",
            "pickup_time": "14:00",
            "pickup_location": "SFO",
            "dropoff_location": "Millbrae",
            "vehicle_type": "Executive Sedan",
            "paid_amount": 250.0,
        }
        s1 = sms.render_new_paid_booking_sms(booking)
        assert "TEL-ABC123" in s1 and "Jane Doe" in s1 and "$250" in s1
        s2 = sms.render_cancellation_sms(booking, requested=True)
        assert "CANCELLATION REQUESTED" in s2 and "TEL-ABC123" in s2
        s3 = sms.render_cancellation_sms(booking, requested=False)
        assert "CUSTOMER CANCELLED" in s3


# ===================== Scheduler =====================
class TestScheduler:
    def test_review_request_scheduler_log_present(self):
        # The scheduler logs "Review-request scheduler started" at startup
        import subprocess
        out = subprocess.run(
            ["tail", "-n", "400", "/var/log/supervisor/backend.err.log"],
            capture_output=True, text=True, timeout=5
        )
        log = out.stdout + out.stderr
        assert "Review-request scheduler started" in log
        assert "_send_pending_review_requests" in log

    def test_review_request_job_function_callable(self):
        """Directly call _send_pending_review_requests with a seeded booking
        whose completed_at is older than 24h. Verify review_request_sent_at gets stamped."""
        import sys
        sys.path.insert(0, "/app/backend")
        import importlib, asyncio
        srv = importlib.import_module("server")

        db = _mongo()
        bid = f"TEST_iter8_review_{uuid.uuid4().hex[:8]}"
        old = (datetime.now(timezone.utc) - timedelta(hours=30)).isoformat()
        doc = {
            "id": bid,
            "full_name": "TEST_iter8 ReviewSeed",
            "email": "turonlimosupport@gmail.com",  # must be admin email since Resend test mode
            "phone": "+14155550100",
            "service_type": "Airport Transfer",
            "vehicle_type": "Executive Sedan",
            "pickup_date": "2026-01-01",
            "pickup_time": "10:00",
            "pickup_location": "SFO",
            "dropoff_location": "Millbrae",
            "passengers": 1,
            "luggage_count": 0,
            "child_seat": False,
            "return_trip": False,
            "additional_stops": [],
            "status": "completed",
            "payment_status": "paid",
            "completed_at": old,
            "created_at": old,
            "confirmation_number": "TEL-TESTAA",
            "manage_token": _generate_unique_token(),
        }
        db.bookings.insert_one(doc)
        try:
            asyncio.run(srv._send_pending_review_requests())
            updated = db.bookings.find_one({"id": bid}, {"_id": 0})
            assert updated.get("review_request_sent_at") is not None, \
                "review_request_sent_at should be stamped after job runs"
        finally:
            db.bookings.delete_one({"id": bid})


def _generate_unique_token():
    import secrets
    return secrets.token_urlsafe(16)


# ===================== Public regression =====================
class TestPublicRegression:
    def test_options(self):
        r = requests.get(f"{API}/options", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "vehicle_types" in d and "service_types" in d

    def test_quote(self):
        r = requests.post(f"{API}/quote", json={
            "vehicle_type": "Executive Sedan",
            "pickup_location": "SFO",
            "dropoff_location": "501 Broadway, Millbrae, CA",
        }, timeout=30)
        assert r.status_code == 200, r.text

    def test_contact(self):
        r = requests.post(f"{API}/contact", json={
            "name": "TEST_iter8",
            "email": "test@example.com",
            "phone": "+14155550101",
            "subject": "iter8 test",
            "message": "automated regression test"
        }, timeout=20)
        assert r.status_code in (200, 201), r.text

    def test_bookings_then_checkout(self, auth_headers):
        b = _create_booking()
        bid = b["id"]
        # Make sure quote_amount is present so checkout is possible
        _mongo().bookings.update_one({"id": bid}, {"$set": {"quote_amount": 150.0}})
        r = requests.post(f"{API}/payments/checkout",
                          json={"booking_id": bid, "origin_url": BASE_URL}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "url" in d and d["url"].startswith("https://")
        requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers, timeout=20)

    def test_places_autocomplete(self):
        r = requests.get(f"{API}/places/autocomplete", params={"input": "San Fr"}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        # may return predictions or empty depending on key — just shape check
        assert "predictions" in d


# ===================== Cleanup =====================
@pytest.fixture(scope="session", autouse=True)
def _cleanup_session():
    yield
    db = _mongo()
    db.admin_2fa_challenges.delete_many({
        "created_at": {"$lte": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()}
    })
    db.bookings.delete_many({"full_name": {"$regex": "^TEST_iter8"}})
    db.contacts.delete_many({"name": {"$regex": "^TEST_iter8"}})
