"""Iteration 9 — hourly pricing + Google trust badge."""
import os
import sys
import uuid
import bcrypt
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://limo-experience-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

mc = MongoClient(MONGO_URL)
db = mc[DB_NAME]

ADMIN_EMAIL = "turonlimosupport@gmail.com"
ADMIN_PASSWORD = "TuronAdmin@2025"


@pytest.fixture(scope="module")
def admin_token():
    # 2FA bypass: insert challenge directly
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
    r = requests.post(f"{API}/admin/verify-2fa", json={"challenge_id": cid, "code": "123456"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# --- /api/quote hourly mode ---
def test_quote_hourly_mode():
    r = requests.post(f"{API}/quote", json={
        "service_type": "Hourly Chauffeur", "hours": 4,
        "pickup_location": "any", "dropoff_location": "any",
    }, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["pricing_mode"] == "hourly"
    assert d["hours"] == 4
    assert d["included_miles"] == 80
    assert d["distance_miles"] is None
    quotes = {q["vehicle_type"]: q for q in d["quotes"]}
    # Defaults: ES 95, S-Class 125, Lux SUV 145
    assert quotes["Executive Sedan"]["price"] == 380.0
    assert quotes["S-Class"]["price"] == 500.0
    assert quotes["Luxury SUV"]["price"] == 580.0
    # Call-only vehicles
    assert quotes["Stretch Limousine"]["price"] is None


def test_quote_distance_default():
    r = requests.post(f"{API}/quote", json={
        "pickup_location": "SFO Airport", "dropoff_location": "Palo Alto, CA",
    }, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["pricing_mode"] == "distance"
    assert d["hours"] is None


def test_quote_hours_without_hourly_falls_back_to_distance():
    r = requests.post(f"{API}/quote", json={
        "service_type": "Airport Transfer", "hours": 4,
        "pickup_location": "SFO Airport", "dropoff_location": "Palo Alto, CA",
    }, timeout=30)
    assert r.status_code == 200
    assert r.json()["pricing_mode"] == "distance"


# --- /api/bookings hours validation ---
def _booking_payload(**overrides):
    base = {
        "full_name": "TEST_iter9",
        "email": "test_iter9@example.com",
        "phone": "650-555-0100",
        "service_type": "Hourly Chauffeur",
        "pickup_date": "2030-01-01",
        "pickup_time": "10:00",
        "pickup_location": "SFO",
        "dropoff_location": "Napa",
        "passengers": 2,
        "vehicle_type": "Executive Sedan",
    }
    base.update(overrides)
    return base


def test_booking_hourly_hours2_ok():
    r = requests.post(f"{API}/bookings", json=_booking_payload(hours=2), timeout=15)
    assert r.status_code == 200, r.text
    db.bookings.delete_one({"id": r.json()["id"]})


def test_booking_hours1_rejected_422():
    r = requests.post(f"{API}/bookings", json=_booking_payload(hours=1), timeout=15)
    assert r.status_code == 422


def test_booking_hourly_no_hours_400():
    r = requests.post(f"{API}/bookings", json=_booking_payload(), timeout=15)
    assert r.status_code == 400
    assert "minimum of 2 hours" in r.json()["detail"].lower() or "minimum of 2 hours" in r.json()["detail"]


# --- /api/admin/pricing hourly_rate ---
def test_admin_pricing_lists_hourly_rate(auth_headers):
    r = requests.get(f"{API}/admin/pricing", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    rows = {x["vehicle_type"]: x for x in r.json()}
    assert len(rows) == 6
    for vt in ["Executive Sedan", "S-Class", "Luxury SUV", "Stretch Limousine", "Sprinter Van", "Party Bus"]:
        assert "hourly_rate" in rows[vt]
    assert rows["Executive Sedan"]["hourly_rate"] >= 0
    assert rows["S-Class"]["hourly_rate"] >= 0
    assert rows["Luxury SUV"]["hourly_rate"] >= 0


def test_patch_hourly_rate_persists_and_quote_reflects(auth_headers):
    # Save original
    orig = requests.get(f"{API}/admin/pricing", headers=auth_headers, timeout=15).json()
    orig_es = next(x for x in orig if x["vehicle_type"] == "Executive Sedan")["hourly_rate"]
    try:
        r = requests.patch(f"{API}/admin/pricing/Executive Sedan",
                           headers=auth_headers, json={"hourly_rate": 110.0}, timeout=15)
        assert r.status_code == 200
        assert r.json()["hourly_rate"] == 110.0

        # Verify persistence
        r2 = requests.get(f"{API}/admin/pricing", headers=auth_headers, timeout=15)
        es = next(x for x in r2.json() if x["vehicle_type"] == "Executive Sedan")
        assert es["hourly_rate"] == 110.0

        # Quote with hours=3 → 330
        rq = requests.post(f"{API}/quote", json={
            "service_type": "Hourly Chauffeur", "hours": 3,
            "pickup_location": "any", "dropoff_location": "any",
        }, timeout=20)
        es_q = next(q for q in rq.json()["quotes"] if q["vehicle_type"] == "Executive Sedan")
        assert es_q["price"] == 330.0
    finally:
        # RESTORE
        requests.patch(f"{API}/admin/pricing/Executive Sedan",
                       headers=auth_headers, json={"hourly_rate": orig_es}, timeout=15)


# --- Stripe checkout for hourly booking ---
def test_payments_checkout_hourly_amount():
    bp = _booking_payload(hours=4)
    r = requests.post(f"{API}/bookings", json=bp, timeout=15)
    assert r.status_code == 200
    bid = r.json()["id"]
    try:
        co = requests.post(f"{API}/payments/checkout", json={
            "booking_id": bid, "origin_url": BASE_URL,
        }, timeout=30)
        assert co.status_code == 200, co.text
        d = co.json()
        # hourly_rate (95) × 4 = 380
        assert d["amount"] == 380.0
        assert d["url"].startswith("https://")
    finally:
        db.bookings.delete_one({"id": bid})
        db.payment_transactions.delete_many({"booking_id": bid})


# --- /api/reviews/summary graceful empty ---
def test_reviews_summary_empty_when_unconfigured():
    r = requests.get(f"{API}/reviews/summary", timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert d == {"google": {}, "yelp": {}}


# --- existing flows sanity ---
def test_options_endpoint():
    r = requests.get(f"{API}/options", timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert "Hourly Chauffeur" in d["service_types"]
    assert "Executive Sedan" in d["vehicle_types"]


def test_contact_endpoint():
    r = requests.post(f"{API}/contact", json={
        "name": "TEST_iter9", "email": "t@t.com", "message": "hello world",
    }, timeout=15)
    assert r.status_code == 200
    db.contacts.delete_one({"id": r.json()["id"]})


def test_admin_account_endpoint(auth_headers):
    r = requests.get(f"{API}/admin/account", headers=auth_headers, timeout=10)
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL.lower()
