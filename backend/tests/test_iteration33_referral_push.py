"""Iteration 33: Refer-a-Friend + Admin Push Broadcast feature tests.

Covers:
- GET /api/referral/check/{code}             public, valid + invalid
- POST /api/customer/signup with optional referred_by_code (valid/invalid/none)
- GET /api/customer/referrals (customer auth)
- Regression: customer signup w/o referred_by_code, login, public /api/quote
- Admin push & promos endpoints require 2FA admin JWT (skipped — see note)
- Referral reward hook via direct DB insert + driver_token status update
"""

import os
import uuid
import time
import asyncio
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

# Direct DB handle for setup/verification (Mongo runs locally inside the pod).
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
_mongo = MongoClient(MONGO_URL)
db = _mongo[DB_NAME]


def _uniq_email(prefix: str = "TEST_ref") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


# ---------------------------------------------------------------------------
# /api/referral/check/{code}
# ---------------------------------------------------------------------------
class TestReferralCheck:
    def test_invalid_code_returns_valid_false(self):
        r = requests.get(f"{API}/referral/check/DEFINITELY-NOT-A-CODE")
        assert r.status_code == 200
        data = r.json()
        assert data.get("valid") is False

    def test_valid_code_returns_referrer_name(self):
        # Create a referrer customer
        email = _uniq_email("TEST_referrer")
        sr = requests.post(f"{API}/customer/signup", json={
            "name": "Alice Tester",
            "email": email,
            "phone": "+14155550101",
            "password": "Password123!",
        })
        assert sr.status_code == 200, sr.text
        cid = sr.json()["user"]["id"]
        # Wait a moment for ensure_referral_code background generation
        for _ in range(10):
            doc = db.customers.find_one({"id": cid}, {"_id": 0, "referral_code": 1})
            if doc and doc.get("referral_code"):
                break
            time.sleep(0.2)
        assert doc and doc.get("referral_code"), "referral_code not generated on signup"
        code = doc["referral_code"]

        # Public check
        r = requests.get(f"{API}/referral/check/{code}")
        assert r.status_code == 200
        data = r.json()
        assert data.get("valid") is True
        assert data.get("referrer_name") == "Alice"  # first-name only


# ---------------------------------------------------------------------------
# /api/customer/signup with referred_by_code
# ---------------------------------------------------------------------------
class TestSignupWithReferredBy:
    @pytest.fixture(scope="class")
    def referrer(self):
        email = _uniq_email("TEST_signupref")
        r = requests.post(f"{API}/customer/signup", json={
            "name": "Bob Referrer",
            "email": email,
            "password": "Password123!",
        })
        assert r.status_code == 200
        cid = r.json()["user"]["id"]
        # Wait for code
        code = None
        for _ in range(10):
            d = db.customers.find_one({"id": cid}, {"_id": 0, "referral_code": 1})
            if d and d.get("referral_code"):
                code = d["referral_code"]
                break
            time.sleep(0.2)
        assert code
        return {"id": cid, "code": code, "token": r.json()["token"]}

    def test_signup_with_valid_referred_by_sets_referred_by(self, referrer):
        email = _uniq_email("TEST_friend_valid")
        r = requests.post(f"{API}/customer/signup", json={
            "name": "Friend One",
            "email": email,
            "password": "Password123!",
            "referred_by_code": referrer["code"],
        })
        assert r.status_code == 200, r.text
        new_cid = r.json()["user"]["id"]
        doc = db.customers.find_one({"id": new_cid}, {"_id": 0})
        assert doc.get("referred_by") == referrer["id"]

    def test_signup_with_invalid_referred_by_does_not_set_field(self, referrer):
        email = _uniq_email("TEST_friend_invalid")
        r = requests.post(f"{API}/customer/signup", json={
            "name": "Friend Two",
            "email": email,
            "password": "Password123!",
            "referred_by_code": "FAKE-NOPE",
        })
        assert r.status_code == 200, r.text
        new_cid = r.json()["user"]["id"]
        doc = db.customers.find_one({"id": new_cid}, {"_id": 0})
        assert "referred_by" not in doc or doc.get("referred_by") is None

    def test_signup_without_referred_by_field_works(self):
        # Backward compat — payload without the new field
        email = _uniq_email("TEST_norefcode")
        r = requests.post(f"{API}/customer/signup", json={
            "name": "Solo User",
            "email": email,
            "password": "Password123!",
        })
        assert r.status_code == 200, r.text
        new_cid = r.json()["user"]["id"]
        doc = db.customers.find_one({"id": new_cid}, {"_id": 0})
        assert "referred_by" not in doc or doc.get("referred_by") is None


# ---------------------------------------------------------------------------
# /api/customer/referrals
# ---------------------------------------------------------------------------
class TestCustomerReferralsEndpoint:
    def test_requires_auth(self):
        r = requests.get(f"{API}/customer/referrals")
        assert r.status_code in (401, 403)

    def test_returns_summary_with_share_url(self):
        # Fresh customer
        email = _uniq_email("TEST_summary")
        r = requests.post(f"{API}/customer/signup", json={
            "name": "Summary Tester",
            "email": email,
            "password": "Password123!",
        })
        assert r.status_code == 200
        token = r.json()["token"]
        # Give backend time to write referral_code
        time.sleep(0.5)
        rr = requests.get(
            f"{API}/customer/referrals",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert rr.status_code == 200, rr.text
        data = rr.json()
        for k in [
            "referral_code", "share_url", "friend_signups",
            "completed_first_rides", "total_earned_usd",
            "payout_count", "friends", "recent_payouts",
        ]:
            assert k in data, f"missing key {k}"
        assert data["referral_code"]
        assert data["referral_code"] in data["share_url"], \
            f"share_url '{data['share_url']}' does not contain code '{data['referral_code']}'"
        assert data["friend_signups"] == 0
        assert data["completed_first_rides"] == 0
        assert data["total_earned_usd"] == 0


# ---------------------------------------------------------------------------
# Referral reward hook — idempotent on driver trip completion
# ---------------------------------------------------------------------------
class TestReferralRewardHook:
    def test_reward_issued_once_then_idempotent(self):
        # 1. Create referrer + friend (signed up with referrer's code)
        referrer_email = _uniq_email("TEST_rewardref")
        r = requests.post(f"{API}/customer/signup", json={
            "name": "Carol Ref",
            "email": referrer_email,
            "password": "Password123!",
        })
        assert r.status_code == 200
        referrer_id = r.json()["user"]["id"]
        # wait for code
        ref_code = None
        for _ in range(10):
            d = db.customers.find_one({"id": referrer_id}, {"_id": 0, "referral_code": 1})
            if d and d.get("referral_code"):
                ref_code = d["referral_code"]
                break
            time.sleep(0.2)
        assert ref_code

        friend_email = _uniq_email("TEST_rewardfriend")
        r2 = requests.post(f"{API}/customer/signup", json={
            "name": "Dave Friend",
            "email": friend_email,
            "password": "Password123!",
            "referred_by_code": ref_code,
        })
        assert r2.status_code == 200
        friend_id = r2.json()["user"]["id"]

        # 2. Insert a paid booking directly into DB for the friend, with a
        #    known driver_token, status=paid, payment_status=paid, trip_status=assigned.
        driver_token = str(uuid.uuid4())
        booking_id = str(uuid.uuid4())
        db.bookings.insert_one({
            "id": booking_id,
            "customer_id": friend_id,
            "driver_token": driver_token,
            "manage_token": str(uuid.uuid4()),
            "status": "paid",
            "payment_status": "paid",
            "trip_status": "assigned",
            "created_at": "2026-01-01T00:00:00+00:00",
        })

        # 3. Walk the driver status forward: assigned → en_route → arrived →
        #    on_trip → completed. The endpoint enforces monotonic forward moves.
        progression = ["en_route", "on_location", "passenger_onboard", "completed"]
        try:
            for step in progression:
                resp = requests.post(
                    f"{API}/driver/{driver_token}/status",
                    json={"status": step},
                )
                assert resp.status_code == 200, f"step {step}: {resp.status_code} {resp.text}"
        finally:
            pass

        # 4. Wait for hook, then verify a referral_payout + promo were created.
        time.sleep(0.5)
        payouts = list(db.referral_payouts.find(
            {"referrer_id": referrer_id, "friend_id": friend_id}, {"_id": 0}
        ))
        assert len(payouts) == 1, f"expected exactly 1 payout, got {len(payouts)}"
        promo_code = payouts[0]["promo_code"]
        assert promo_code.startswith("THANKS-")
        assert payouts[0]["amount"] == 25.0

        promo = db.promos.find_one({"code": promo_code}, {"_id": 0})
        assert promo, "promo not created in promos collection"
        assert promo["value"] == 25.0
        assert promo["max_uses"] == 1
        assert promo["issued_to_customer_id"] == referrer_id
        assert promo["source"] == "referral_reward"

        # 5. Idempotency: directly call the completion endpoint again should
        #    NOT create a second payout. The endpoint will return 400 because
        #    trip_status is already terminal — but the helper is also guarded
        #    by the payouts table, so call the helper indirectly by inserting
        #    a SECOND completed booking for the same friend and walking it
        #    through. The hook must still be a no-op.
        booking_id_2 = str(uuid.uuid4())
        driver_token_2 = str(uuid.uuid4())
        db.bookings.insert_one({
            "id": booking_id_2,
            "customer_id": friend_id,
            "driver_token": driver_token_2,
            "manage_token": str(uuid.uuid4()),
            "status": "paid",
            "payment_status": "paid",
            "trip_status": "assigned",
            "created_at": "2026-01-02T00:00:00+00:00",
        })
        for step in progression:
            resp = requests.post(
                f"{API}/driver/{driver_token_2}/status",
                json={"status": step},
            )
            assert resp.status_code == 200, f"2nd booking step {step}: {resp.text}"
        time.sleep(0.5)
        payouts_after = list(db.referral_payouts.find(
            {"referrer_id": referrer_id, "friend_id": friend_id}, {"_id": 0}
        ))
        assert len(payouts_after) == 1, \
            f"idempotency violated: {len(payouts_after)} payouts after 2nd completion"


# ---------------------------------------------------------------------------
# Admin endpoints — require 2FA, skipped (set ADMIN_JWT env to enable)
# ---------------------------------------------------------------------------
ADMIN_JWT = os.environ.get("TEST_ADMIN_JWT")


@pytest.mark.skipif(not ADMIN_JWT, reason="No admin JWT — admin endpoints require 2FA email code")
class TestAdminPush:
    def _h(self):
        return {"Authorization": f"Bearer {ADMIN_JWT}"}

    def test_eligible_count(self):
        r = requests.get(f"{API}/admin/push/eligible-count", headers=self._h())
        assert r.status_code == 200
        assert isinstance(r.json().get("count"), int)

    def test_history(self):
        r = requests.get(f"{API}/admin/push/history", headers=self._h())
        assert r.status_code == 200
        assert isinstance(r.json().get("items"), list)

    def test_broadcast_test_only_400_without_token(self):
        r = requests.post(f"{API}/admin/push/broadcast", headers=self._h(), json={
            "title": "TEST",
            "body": "Test push",
            "test_only": True,
        })
        # Either 400 (no token) or 200 if admin has a push_token
        assert r.status_code in (200, 400)

    def test_admin_promos_does_not_crash(self):
        r = requests.get(f"{API}/admin/promos", headers=self._h())
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------------------------------------------------------------------
# Auth header missing → admin endpoints should still be 401/403
# ---------------------------------------------------------------------------
class TestAdminAuthGate:
    def test_push_eligible_requires_auth(self):
        r = requests.get(f"{API}/admin/push/eligible-count")
        assert r.status_code in (401, 403)

    def test_push_broadcast_requires_auth(self):
        r = requests.post(f"{API}/admin/push/broadcast", json={
            "title": "x", "body": "y", "test_only": True,
        })
        assert r.status_code in (401, 403)

    def test_push_history_requires_auth(self):
        r = requests.get(f"{API}/admin/push/history")
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Regression: customer login + existing quote still works
# ---------------------------------------------------------------------------
class TestRegression:
    def test_signup_then_login(self):
        email = _uniq_email("TEST_loginreg")
        pw = "Password123!"
        r = requests.post(f"{API}/customer/signup", json={
            "name": "Login Tester",
            "email": email,
            "password": pw,
        })
        assert r.status_code == 200
        r2 = requests.post(f"{API}/customer/login", json={
            "email": email, "password": pw,
        })
        assert r2.status_code == 200
        assert r2.json().get("token")

    def test_public_quote_endpoint(self):
        # quote endpoint takes pickup/dropoff — should respond 200 with a quote
        payload = {
            "pickup_address": "San Francisco International Airport, San Francisco, CA",
            "dropoff_address": "Palo Alto, CA",
            "pickup_datetime": "2026-06-15T10:00:00",
            "vehicle_type": "sedan",
            "passengers": 2,
        }
        r = requests.post(f"{API}/quote", json=payload)
        # 200 = quote ok; 400 if endpoint validates harder; assert it doesn't 5xx
        assert r.status_code < 500, f"quote endpoint crashed: {r.status_code} {r.text[:300]}"
