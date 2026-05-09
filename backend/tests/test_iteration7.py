"""Iteration 7 backend tests:
- Admin 2FA login flow (challenge + verify)
- Admin self-service /account GET + PATCH
- Public regression: contact, bookings, quote, payments/checkout
- Address verification via /api/options is N/A — address is FE-only;
  this file focuses on backend endpoints relevant to iter7 spec.
"""
import os
import re
import uuid
import time
import pytest
import requests
import bcrypt
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@turonlimo.com"
ADMIN_PASSWORD = "TuronAdmin@2025"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

CN_REGEX = re.compile(r"^TEL-[A-HJ-NP-Z2-9]{6}$")


# --------------------- Mongo helper for 2FA bypass ---------------------
def _mongo():
    return MongoClient(MONGO_URL)[DB_NAME]


def _insert_known_challenge(admin_email=ADMIN_EMAIL, code="123456", expires_minutes=10, used=False, attempts=0):
    db = _mongo()
    cid = str(uuid.uuid4())
    code_hash = bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()
    db.admin_2fa_challenges.insert_one({
        "challenge_id": cid,
        "admin_email": admin_email,
        "code_hash": code_hash,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)).isoformat(),
        "attempts": attempts,
        "used": used,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return cid


# --------------------- Auth fixture (uses 2FA bypass) ---------------------
@pytest.fixture(scope="session")
def admin_token():
    cid = _insert_known_challenge()
    r = requests.post(f"{API}/admin/verify-2fa",
                      json={"challenge_id": cid, "code": "123456"}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and data.get("email") == ADMIN_EMAIL
    assert data.get("role") == "admin"
    return data["token"]


@pytest.fixture(scope="session")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ----------------------------- 2FA Login -----------------------------
class TestAdmin2FALogin:
    def test_login_returns_2fa_challenge(self):
        r = requests.post(f"{API}/admin/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("requires_2fa") is True
        assert isinstance(d.get("challenge_id"), str) and len(d["challenge_id"]) > 0
        assert "*" in d.get("recovery_email_masked", "")
        assert "token" not in d  # no token in step 1
        assert d.get("expires_in") == 600

    def test_login_wrong_password_401(self):
        r = requests.post(f"{API}/admin/login",
                          json={"email": ADMIN_EMAIL, "password": "WRONG_PWD"}, timeout=20)
        assert r.status_code == 401

    def test_verify_wrong_code_401(self):
        cid = _insert_known_challenge(code="999999")
        r = requests.post(f"{API}/admin/verify-2fa",
                          json={"challenge_id": cid, "code": "000000"}, timeout=20)
        assert r.status_code == 401
        # ensure attempts counter incremented
        ch = _mongo().admin_2fa_challenges.find_one({"challenge_id": cid})
        assert ch["attempts"] == 1

    def test_verify_correct_code_returns_token(self):
        cid = _insert_known_challenge(code="123456")
        r = requests.post(f"{API}/admin/verify-2fa",
                          json={"challenge_id": cid, "code": "123456"}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("token"), str) and len(d["token"]) > 20
        assert d.get("email") == ADMIN_EMAIL
        assert d.get("role") == "admin"

    def test_verify_used_code_rejected(self):
        cid = _insert_known_challenge(code="123456")
        # First use - success
        r1 = requests.post(f"{API}/admin/verify-2fa",
                           json={"challenge_id": cid, "code": "123456"}, timeout=20)
        assert r1.status_code == 200
        # Reuse - should fail with 400 (used) per server.py:518
        r2 = requests.post(f"{API}/admin/verify-2fa",
                           json={"challenge_id": cid, "code": "123456"}, timeout=20)
        assert r2.status_code == 400

    def test_verify_expired_code_400(self):
        cid = _insert_known_challenge(code="123456", expires_minutes=-1)
        r = requests.post(f"{API}/admin/verify-2fa",
                          json={"challenge_id": cid, "code": "123456"}, timeout=20)
        assert r.status_code == 400

    def test_verify_max_attempts_429(self):
        # Pre-set attempts to 5, so any verify call triggers 429
        cid = _insert_known_challenge(code="123456", attempts=5)
        r = requests.post(f"{API}/admin/verify-2fa",
                          json={"challenge_id": cid, "code": "111111"}, timeout=20)
        assert r.status_code == 429

    def test_verify_unknown_challenge_404(self):
        r = requests.post(f"{API}/admin/verify-2fa",
                          json={"challenge_id": "does-not-exist-xyz", "code": "123456"}, timeout=20)
        assert r.status_code == 404


# ----------------------------- Account Self-Service -----------------------------
class TestAdminAccount:
    def test_get_account(self, auth_headers):
        r = requests.get(f"{API}/admin/account", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["email"] == ADMIN_EMAIL
        assert "recovery_email" in d
        assert "_id" not in d

    def test_patch_account_wrong_current_password_401(self, auth_headers):
        r = requests.patch(f"{API}/admin/account",
                           json={"current_password": "BAD_PWD",
                                 "recovery_email": "test@example.com"},
                           headers=auth_headers, timeout=15)
        assert r.status_code == 401

    def test_patch_account_change_recovery_email(self, auth_headers):
        # Get original recovery email so we can restore
        original = requests.get(f"{API}/admin/account", headers=auth_headers, timeout=15).json()
        original_recovery = original["recovery_email"]
        new_recovery = "TEST_recovery_iter7@example.com"
        try:
            r = requests.patch(f"{API}/admin/account",
                               json={"current_password": ADMIN_PASSWORD,
                                     "recovery_email": new_recovery},
                               headers=auth_headers, timeout=20)
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["recovery_email"] == new_recovery.lower()
            assert d["email"] == ADMIN_EMAIL
            # GET reflects update
            r2 = requests.get(f"{API}/admin/account", headers=auth_headers, timeout=15).json()
            assert r2["recovery_email"] == new_recovery.lower()
        finally:
            # Restore original recovery email
            requests.patch(f"{API}/admin/account",
                           json={"current_password": ADMIN_PASSWORD,
                                 "recovery_email": original_recovery},
                           headers=auth_headers, timeout=20)

    def test_patch_account_no_changes_400(self, auth_headers):
        r = requests.patch(f"{API}/admin/account",
                           json={"current_password": ADMIN_PASSWORD},
                           headers=auth_headers, timeout=15)
        assert r.status_code == 400

    def test_get_account_requires_auth(self):
        r = requests.get(f"{API}/admin/account", timeout=15)
        assert r.status_code in (401, 403)


# ----------------------------- Public regression -----------------------------
class TestPublicRegression:
    def test_contact_post(self):
        r = requests.post(f"{API}/contact", json={
            "name": "TEST Iter7",
            "email": "test_iter7@example.com",
            "phone": "5551112222",
            "message": "Iteration 7 regression message",
        }, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("name") == "TEST Iter7"
        assert "_id" not in d

    def test_quote_post(self):
        r = requests.post(f"{API}/quote", json={
            "pickup_location": "SFO",
            "dropoff_location": "Pier 39 San Francisco",
        }, timeout=30)
        assert r.status_code == 200, r.text
        assert len(r.json()["quotes"]) == 6

    def test_booking_post_and_checkout(self, auth_headers):
        b = requests.post(f"{API}/bookings", json={
            "full_name": "TEST Iter7 Booking",
            "email": "test_iter7@example.com",
            "phone": "5551112222",
            "service_type": "Airport Transfer",
            "pickup_date": "2026-09-01",
            "pickup_time": "10:00",
            "pickup_location": "SFO",
            "dropoff_location": "Pier 39 San Francisco",
            "passengers": 2,
            "vehicle_type": "Executive Sedan",
        }, timeout=30)
        assert b.status_code == 200, b.text
        bid = b.json()["id"]
        try:
            co = requests.post(f"{API}/payments/checkout",
                               json={"booking_id": bid, "origin_url": BASE_URL}, timeout=60)
            assert co.status_code == 200, co.text
            cd = co.json()
            assert cd["url"].startswith("http")
            assert "stripe" in cd["url"].lower() or "checkout" in cd["url"].lower()
            assert cd["session_id"]
        finally:
            requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers)

    def test_options_endpoint(self):
        r = requests.get(f"{API}/options", timeout=15)
        assert r.status_code == 200
        d = r.json()
        # Sanity: vehicle types still include known instant-priced
        for v in ["Executive Sedan", "S-Class", "Luxury SUV"]:
            assert v in d["vehicle_types"]
        # Call-only ones still listed
        for v in ["Stretch Limousine", "Sprinter Van", "Party Bus"]:
            assert v in d["vehicle_types"]

    def test_places_autocomplete(self):
        r = requests.get(f"{API}/places/autocomplete", params={"input": "San Fr"}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        # Expect a predictions list with at least some entries
        preds = d.get("predictions", [])
        assert isinstance(preds, list)
        assert len(preds) >= 3, f"Expected >=3 predictions, got {len(preds)}"


# ----------------------------- Final cleanup of test challenges ------------
@pytest.fixture(scope="session", autouse=True)
def _cleanup_test_challenges():
    yield
    try:
        # Remove all challenges we inserted (admin@turonlimo.com is the only seed; safe to wipe used+old)
        db = _mongo()
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        db.admin_2fa_challenges.delete_many({"created_at": {"$lt": cutoff}})
    except Exception:
        pass
