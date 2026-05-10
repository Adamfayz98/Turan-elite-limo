"""Iteration 10 — 12-hour time UI + admin search.

Verifies:
- Backend still accepts/stores pickup_time='HH:MM' 24h (wire format unchanged).
- email_service._format_time_12h() and sms_service._fmt_12h() helpers.
- render_confirmation_email uses 12h formatting.
- render_new_paid_booking_sms / render_cancellation_sms use 12h formatting.
- Regression: /api/quote (distance + hourly), /api/contact, /api/options,
  /api/places/autocomplete, admin auth + 2FA, /bookings/manage/{token} GET+POST,
  /admin/pricing GET+PATCH (incl hourly_rate), /reviews/summary empty.
"""
import os
import sys
import uuid
import bcrypt
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

sys.path.insert(0, "/app/backend")

from email_service import _format_time_12h, render_confirmation_email  # noqa: E402
from sms_service import (
    _fmt_12h,
    render_new_paid_booking_sms,
    render_cancellation_sms,
)  # noqa: E402

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://limo-experience-1.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

mc = MongoClient(MONGO_URL)
db = mc[DB_NAME]

ADMIN_EMAIL = "turonlimosupport@gmail.com"


# ---------------- Auth fixtures (2FA bypass) ----------------
@pytest.fixture(scope="module")
def admin_token():
    cid = str(uuid.uuid4())
    code_hash = bcrypt.hashpw(b"123456", bcrypt.gensalt()).decode()
    db.admin_2fa_challenges.insert_one({
        "challenge_id": cid,
        "admin_email": ADMIN_EMAIL.lower(),
        "code_hash": code_hash,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        "attempts": 0,
        "used": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    r = requests.post(
        f"{API}/admin/verify-2fa",
        json={"challenge_id": cid, "code": "123456"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------- 12h helper unit tests ----------------
@pytest.mark.parametrize("inp,expected", [
    ("00:00", "12:00 AM"),
    ("00:30", "12:30 AM"),
    ("01:00", "1:00 AM"),
    ("11:45", "11:45 AM"),
    ("12:00", "12:00 PM"),
    ("12:30", "12:30 PM"),
    ("13:30", "1:30 PM"),
    ("23:45", "11:45 PM"),
    ("08:05", "8:05 AM"),
])
def test_format_time_12h_email(inp, expected):
    assert _format_time_12h(inp) == expected


@pytest.mark.parametrize("inp,expected", [
    ("00:00", "12:00 AM"),
    ("12:00", "12:00 PM"),
    ("13:30", "1:30 PM"),
    ("23:45", "11:45 PM"),
])
def test_fmt_12h_sms(inp, expected):
    assert _fmt_12h(inp) == expected


def test_format_time_12h_invalid_returns_input():
    assert _format_time_12h("") == ""
    assert _format_time_12h("not-a-time") == "not-a-time"
    assert _fmt_12h("") == ""


# ---------------- Email/SMS rendering uses 12h ----------------
def test_render_confirmation_email_uses_12h():
    booking = {
        "confirmation_number": "TEL-TEST10",
        "full_name": "Test Iter10",
        "pickup_date": "2026-02-15",
        "pickup_time": "13:30",
        "pickup_location": "SFO",
        "dropoff_location": "Palo Alto",
        "vehicle_type": "Executive Sedan",
        "service_type": "Airport Transfer",
        "passengers": 2,
    }
    html = render_confirmation_email(booking, payment_url=None, manage_url=None)
    assert "1:30 PM" in html
    assert "13:30" not in html


def test_render_confirmation_email_midnight():
    booking = {
        "confirmation_number": "TEL-MID",
        "full_name": "Mid Night",
        "pickup_date": "2026-02-15",
        "pickup_time": "00:00",
        "pickup_location": "A",
        "dropoff_location": "B",
        "vehicle_type": "S-Class",
        "service_type": "Airport Transfer",
        "passengers": 1,
    }
    html = render_confirmation_email(booking, payment_url=None)
    assert "12:00 AM" in html


def test_render_new_paid_booking_sms_uses_12h():
    booking = {
        "confirmation_number": "TEL-SMS10",
        "full_name": "SMS Test",
        "pickup_date": "2026-02-15",
        "pickup_time": "23:45",
        "pickup_location": "SFO",
        "dropoff_location": "San Jose",
        "vehicle_type": "Luxury SUV",
        "phone": "+15555550100",
        "paid_amount": 250.0,
    }
    body = render_new_paid_booking_sms(booking)
    assert "11:45 PM" in body
    assert "23:45" not in body


def test_render_cancellation_sms_uses_12h():
    booking = {
        "confirmation_number": "TEL-CANCEL10",
        "full_name": "Cancel Test",
        "pickup_date": "2026-02-15",
        "pickup_time": "12:00",
    }
    body = render_cancellation_sms(booking, requested=True)
    assert "12:00 PM" in body


# ---------------- Backend wire format regression ----------------
def test_post_bookings_accepts_24h_pickup_time(auth_headers):
    payload = {
        "full_name": "TEST_iter10 Wire",
        "email": "test_iter10@example.com",
        "phone": "+15555550110",
        "service_type": "Airport Transfer",
        "pickup_date": "2026-03-01",
        "pickup_time": "13:30",  # 24h wire format
        "pickup_location": "SFO Airport, San Francisco, CA",
        "dropoff_location": "Palo Alto, CA",
        "vehicle_type": "Executive Sedan",
        "passengers": 2,
    }
    r = requests.post(f"{API}/bookings", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["pickup_time"] == "13:30"  # stored as-is in 24h
    bid = d["id"]
    # confirmation_number / manage_token are generated later by the payment flow,
    # so they are NOT expected on the bare /api/bookings POST response.

    # Verify via DB persistence
    doc = db.bookings.find_one({"id": bid})
    assert doc is not None
    assert doc["pickup_time"] == "13:30"

    # Cleanup
    db.bookings.delete_one({"id": bid})


@pytest.mark.parametrize("wire", ["00:00", "12:00", "23:45", "08:05"])
def test_post_bookings_accepts_various_24h_times(wire):
    payload = {
        "full_name": f"TEST_iter10 t{wire}",
        "email": "test_iter10_times@example.com",
        "phone": "+15555550111",
        "service_type": "Airport Transfer",
        "pickup_date": "2026-03-02",
        "pickup_time": wire,
        "pickup_location": "SFO Airport, San Francisco, CA",
        "dropoff_location": "Oakland, CA",
        "vehicle_type": "Executive Sedan",
        "passengers": 2,
    }
    r = requests.post(f"{API}/bookings", json=payload, timeout=30)
    assert r.status_code == 200, f"wire={wire}: {r.text}"
    d = r.json()
    assert d["pickup_time"] == wire
    db.bookings.delete_one({"id": d["id"]})


def test_post_bookings_rejects_missing_pickup_time():
    payload = {
        "full_name": "TEST_iter10 Bad",
        "email": "bad@example.com",
        "phone": "+15555550112",
        "service_type": "Airport Transfer",
        "pickup_date": "2026-03-02",
        "pickup_location": "SFO",
        "dropoff_location": "OAK",
        "vehicle_type": "Executive Sedan",
        "passengers": 1,
    }
    r = requests.post(f"{API}/bookings", json=payload, timeout=15)
    assert r.status_code in (400, 422)


# ---------------- Manage cancel flow regression ----------------
def test_manage_get_and_cancel(auth_headers):
    payload = {
        "full_name": "TEST_iter10 Manage",
        "email": "manage_iter10@example.com",
        "phone": "+15555550113",
        "service_type": "Airport Transfer",
        "pickup_date": "2026-04-01",
        "pickup_time": "09:15",
        "pickup_location": "SFO Airport",
        "dropoff_location": "Mountain View, CA",
        "vehicle_type": "Executive Sedan",
        "passengers": 1,
    }
    r = requests.post(f"{API}/bookings", json=payload, timeout=20)
    assert r.status_code == 200
    bid = r.json()["id"]
    # /bookings POST does not auto-generate manage_token; inject one for this regression test
    token = uuid.uuid4().hex
    db.bookings.update_one({"id": bid}, {"$set": {"manage_token": token}})

    g = requests.get(f"{API}/bookings/manage/{token}", timeout=15)
    assert g.status_code == 200
    assert g.json()["pickup_time"] == "09:15"

    c = requests.post(f"{API}/bookings/manage/{token}/cancel", json={"reason": "test"}, timeout=15)
    assert c.status_code == 200
    after = db.bookings.find_one({"id": bid})
    assert after["status"] in ("cancelled", "cancellation_requested")
    db.bookings.delete_one({"id": bid})


# ---------------- /api/quote regressions ----------------
def test_quote_distance():
    r = requests.post(f"{API}/quote", json={
        "pickup_location": "SFO Airport, San Francisco, CA",
        "dropoff_location": "Palo Alto, CA",
    }, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["pricing_mode"] == "distance"
    assert d["hours"] is None


def test_quote_hourly():
    r = requests.post(f"{API}/quote", json={
        "service_type": "Hourly Chauffeur", "hours": 4,
        "pickup_location": "San Francisco, CA", "dropoff_location": "San Francisco, CA",
    }, timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["pricing_mode"] == "hourly"
    assert d["hours"] == 4
    assert d["included_miles"] == 80


# ---------------- /api/options + /api/contact ----------------
def test_options_endpoint():
    r = requests.get(f"{API}/options", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "Executive Sedan" in d["vehicle_types"]
    assert "Hourly Chauffeur" in d["service_types"]


def test_contact_endpoint():
    r = requests.post(f"{API}/contact", json={
        "name": "TEST_iter10 Contact",
        "email": "c10@example.com",
        "phone": "+15555550114",
        "subject": "Test",
        "message": "Hello iter10",
    }, timeout=15)
    assert r.status_code == 200
    cid = r.json().get("id")
    if cid:
        db.contacts.delete_one({"id": cid})


# ---------------- /api/places/autocomplete ----------------
def test_places_autocomplete_returns_200():
    r = requests.get(f"{API}/places/autocomplete", params={"input": "SFO"}, timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert "predictions" in body or "status" in body


# ---------------- /api/admin/pricing GET + PATCH (incl hourly) ----------------
def test_admin_pricing_get_and_patch_hourly(auth_headers):
    g = requests.get(f"{API}/admin/pricing", headers=auth_headers, timeout=15)
    assert g.status_code == 200
    rows = g.json()
    assert isinstance(rows, list) and len(rows) > 0
    es = next((x for x in rows if x["vehicle_type"] == "Executive Sedan"), None)
    assert es is not None
    original_hourly = es.get("hourly_rate")

    # PATCH hourly_rate
    new_val = (original_hourly or 95.0) + 1.0
    p = requests.patch(
        f"{API}/admin/pricing/Executive Sedan",
        headers=auth_headers,
        json={"hourly_rate": new_val},
        timeout=15,
    )
    assert p.status_code == 200, p.text
    # Roundtrip
    g2 = requests.get(f"{API}/admin/pricing", headers=auth_headers, timeout=15)
    es2 = next((x for x in g2.json() if x["vehicle_type"] == "Executive Sedan"), None)
    assert abs(es2["hourly_rate"] - new_val) < 0.001

    # Restore
    if original_hourly is not None:
        requests.patch(
            f"{API}/admin/pricing/Executive Sedan",
            headers=auth_headers,
            json={"hourly_rate": original_hourly},
            timeout=15,
        )


# ---------------- /api/reviews/summary empty when keys unset ----------------
def test_reviews_summary_empty_when_unset():
    r = requests.get(f"{API}/reviews/summary", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "google" in d and "yelp" in d
    g = d["google"]
    assert not (g.get("rating") and g.get("count"))
