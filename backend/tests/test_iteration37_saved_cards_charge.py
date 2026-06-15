"""
Iteration 37 — Saved Cards / 1-Tap Rebooking & Invoice Charges (P1)

Scope:
  * POST /api/quote-offer/{token}/checkout consent gating
      - 400 when consent_accepted missing/false (BEFORE Stripe is called)
      - on consent_accepted=true, Stripe Checkout request is built with
        setup_future_usage=off_session + customer_creation=always (verified
        via source-code inspection — see test_regression_main_checkout_setup_future_usage)
  * POST /api/admin/bookings/{id}/charge-card (NEW generic endpoint)
      - 401/403 without admin
      - 404 with unknown booking
      - 400 when wait_time_consent=false
      - 400 when no saved card on booking
      - 400 when amount < $0.50
      - 400 when amount > $10,000
  * Regression: existing /charge-wait-time and /charge-damages still gate on
    wait_time_consent + saved card.
  * Regression: main /api/payments/checkout still uses setup_future_usage and
    customer_creation=always (source check).

Admin auth: mints JWT directly (bypasses 2FA email).
Stripe: backend currently has sk_live_* key. We avoid creating real Stripe
sessions in this test by only exercising 400/404/401 paths. The success
path of charge-card requires a real saved pm_/cus_ pair which we cannot
fabricate in live mode; main agent should confirm the happy path manually
or via a separately seeded sk_test_ environment.
"""
from __future__ import annotations

import os
import sys
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

import jwt as _jwt

sys.path.insert(0, "/app/backend")

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001").rstrip("/")
JWT_SECRET = os.environ.get("JWT_SECRET") or "d5b4e1a3c8f47921e6b3d9f1c2a4e7891f5d6c8b3a2e9f1d4c7b8a5e2f1d9c8b"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "support@turanelitelimo.com")
API = f"{BASE_URL}/api"


def _mint_admin_token() -> str:
    payload = {
        "sub": ADMIN_EMAIL,
        "role": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        "type": "access",
    }
    return _jwt.encode(payload, JWT_SECRET, algorithm="HS256")


@pytest.fixture(scope="session")
def admin_headers():
    return {"Authorization": f"Bearer {_mint_admin_token()}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ----------------------------- helpers -----------------------------


def _create_quote_with_offer(s, admin_headers) -> dict:
    """Create a quote and have admin send-to-customer to get confirm_token."""
    payload = {
        "full_name": "TEST_iter37 Card Saver",
        "email": f"TEST_iter37_{uuid.uuid4().hex[:8]}@example.com",
        "phone": "+14155550199",
        "vehicle_type": "Mercedes E-Class",
        "pickup_location": "SFO Airport",
        "dropoff_location": "Palace Hotel, SF",
        "pickup_date": "2026-12-25",
        "pickup_time": "10:00",
        "passengers": 2,
        "occasion": "TEST_iter37",
        "notes": "iteration 37 saved-card test",
    }
    r = s.post(f"{API}/quote-requests", json=payload, timeout=20)
    assert r.status_code in (200, 201), f"quote-requests failed: {r.status_code} {r.text[:300]}"
    qid = r.json().get("id")
    assert qid

    # admin sends offer back
    patch = {"quoted_price": 250.00, "deposit_pct": 50, "send_to_customer": True}
    r2 = requests.patch(
        f"{API}/admin/quote-requests/{qid}",
        json=patch,
        headers=admin_headers,
        timeout=15,
    )
    assert r2.status_code == 200, f"patch quote failed: {r2.status_code} {r2.text[:300]}"
    body = r2.json()
    token = body.get("confirm_token") or body.get("data", {}).get("confirm_token")
    if not token:
        # Fetch it back
        r3 = requests.get(f"{API}/admin/quote-requests/{qid}", headers=admin_headers, timeout=10)
        token = (r3.json() or {}).get("confirm_token")
    assert token, f"No confirm_token. body={body}"
    return {"id": qid, "confirm_token": token}


def _seed_booking_in_mongo(
    *, wait_time_consent: bool, with_saved_card: bool
) -> str:
    """Insert a synthetic booking directly into Mongo (bypasses Stripe).
    Used to exercise validation paths on /charge-card without paying."""
    from pymongo import MongoClient
    cli = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    dbn = os.environ.get("DB_NAME", "test_database")
    coll = cli[dbn]["bookings"]
    bid = str(uuid.uuid4())
    doc = {
        "id": bid,
        "confirmation_number": f"TEST{bid[:6].upper()}",
        "name": "TEST_iter37 Synth",
        "email": f"TEST_iter37_synth_{bid[:6]}@example.com",
        "phone": "+14155550199",
        "vehicle_type": "Mercedes E-Class",
        "pickup_location": "SFO",
        "dropoff_location": "Downtown SF",
        "pickup_date": "2026-12-31",
        "pickup_time": "12:00",
        "passengers": 1,
        "amount": 200.0,
        "deposit_paid": 100.0,
        "balance_due": 100.0,
        "currency": "usd",
        "status": "confirmed",
        "payment_status": "deposit_paid",
        "wait_time_consent": wait_time_consent,
        "source": "TEST_iter37",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if with_saved_card:
        doc["stripe_customer_id"] = "cus_TEST_iter37_synthetic"
        doc["stripe_payment_method_id"] = "pm_TEST_iter37_synthetic"
        doc["card_brand"] = "visa"
        doc["card_last4"] = "4242"
    coll.insert_one(doc)
    return bid


@pytest.fixture(scope="session", autouse=True)
def _cleanup_at_end():
    yield
    try:
        from pymongo import MongoClient
        cli = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        dbn = os.environ.get("DB_NAME", "test_database")
        cli[dbn]["bookings"].delete_many({"source": "TEST_iter37"})
        cli[dbn]["quote_requests"].delete_many({"occasion": "TEST_iter37"})
    except Exception:
        pass


# ============================================================
# 1) Consent gate on /quote-offer/{token}/checkout
# ============================================================


class TestQuoteOfferConsentGate:
    def test_checkout_rejected_without_consent(self, s, admin_headers):
        q = _create_quote_with_offer(s, admin_headers)
        r = s.post(
            f"{API}/quote-offer/{q['confirm_token']}/checkout",
            json={"origin_url": "https://example.com"},  # no consent_accepted
            timeout=15,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} body={r.text[:300]}"
        body = r.json()
        detail = str(body.get("detail", "")).lower()
        assert "card" in detail and ("authoriz" in detail or "accept" in detail), (
            f"Expected card-on-file auth message, got: {body}"
        )

    def test_checkout_rejected_with_consent_false(self, s, admin_headers):
        q = _create_quote_with_offer(s, admin_headers)
        r = s.post(
            f"{API}/quote-offer/{q['confirm_token']}/checkout",
            json={"origin_url": "https://example.com", "consent_accepted": False},
            timeout=15,
        )
        assert r.status_code == 400


# ============================================================
# 2) Generic /admin/bookings/{id}/charge-card endpoint
# ============================================================


class TestChargeCardOnFile:
    def test_unauthenticated_rejected(self):
        r = requests.post(
            f"{API}/admin/bookings/anything/charge-card",
            json={"amount": 10, "reason": "extra_hour", "description": "test"},
            timeout=10,
        )
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_unknown_booking_returns_404(self, admin_headers):
        r = requests.post(
            f"{API}/admin/bookings/{uuid.uuid4()}/charge-card",
            json={"amount": 10, "reason": "extra_hour", "description": "test charge"},
            headers=admin_headers,
            timeout=10,
        )
        assert r.status_code == 404

    def test_rejects_when_no_consent(self, admin_headers):
        bid = _seed_booking_in_mongo(wait_time_consent=False, with_saved_card=True)
        r = requests.post(
            f"{API}/admin/bookings/{bid}/charge-card",
            json={"amount": 15, "reason": "extra_hour", "description": "Extra hour"},
            headers=admin_headers,
            timeout=10,
        )
        assert r.status_code == 400
        assert "consent" in str(r.json().get("detail", "")).lower()

    def test_rejects_when_no_saved_card(self, admin_headers):
        bid = _seed_booking_in_mongo(wait_time_consent=True, with_saved_card=False)
        r = requests.post(
            f"{API}/admin/bookings/{bid}/charge-card",
            json={"amount": 15, "reason": "extra_hour", "description": "Extra hour"},
            headers=admin_headers,
            timeout=10,
        )
        assert r.status_code == 400
        detail = str(r.json().get("detail", "")).lower()
        assert "saved card" in detail or "backfill" in detail

    def test_rejects_amount_below_minimum(self, admin_headers):
        bid = _seed_booking_in_mongo(wait_time_consent=True, with_saved_card=True)
        r = requests.post(
            f"{API}/admin/bookings/{bid}/charge-card",
            json={"amount": 0.10, "reason": "tolls", "description": "tiny"},
            headers=admin_headers,
            timeout=10,
        )
        assert r.status_code == 400
        assert "0.50" in str(r.json().get("detail", "")) or "small" in str(r.json().get("detail", "")).lower()

    def test_rejects_amount_above_maximum(self, admin_headers):
        bid = _seed_booking_in_mongo(wait_time_consent=True, with_saved_card=True)
        r = requests.post(
            f"{API}/admin/bookings/{bid}/charge-card",
            json={"amount": 10001, "reason": "balance", "description": "too big"},
            headers=admin_headers,
            timeout=10,
        )
        assert r.status_code == 400
        detail = str(r.json().get("detail", "")).lower()
        assert "10,000" in str(r.json().get("detail", "")) or "exceeds" in detail


# ============================================================
# 3) Regression — existing endpoints still gate properly
# ============================================================


class TestRegressionChargeEndpoints:
    def test_charge_wait_time_requires_consent(self, admin_headers):
        bid = _seed_booking_in_mongo(wait_time_consent=False, with_saved_card=True)
        r = requests.post(
            f"{API}/admin/bookings/{bid}/charge-wait-time",
            json={"minutes": 30},
            headers=admin_headers,
            timeout=10,
        )
        assert r.status_code == 400

    def test_charge_damages_requires_consent(self, admin_headers):
        bid = _seed_booking_in_mongo(wait_time_consent=False, with_saved_card=True)
        r = requests.post(
            f"{API}/admin/bookings/{bid}/charge-damages",
            json={"amount": 50, "reason": "test damage scuff"},
            headers=admin_headers,
            timeout=10,
        )
        assert r.status_code == 400


# ============================================================
# 4) Regression — source check that main checkout still uses
#    setup_future_usage=off_session + customer_creation=always
# ============================================================


class TestRegressionMainCheckoutSource:
    def test_payments_checkout_uses_setup_future_usage(self):
        with open("/app/backend/routes/payments.py", "r") as fh:
            src = fh.read()
        assert '("payment_intent_data[setup_future_usage]", "off_session")' in src, (
            "main /api/payments/checkout missing setup_future_usage=off_session"
        )
        assert '("customer_creation", "always")' in src, (
            "main /api/payments/checkout missing customer_creation=always"
        )

    def test_quote_offer_checkout_uses_setup_future_usage(self):
        with open("/app/backend/routes/admin.py", "r") as fh:
            src = fh.read()
        assert '("payment_intent_data[setup_future_usage]", "off_session")' in src
        assert '("customer_creation", "always")' in src

    def test_quote_offer_finalize_expands_payment_method(self):
        with open("/app/backend/routes/admin.py", "r") as fh:
            src = fh.read()
        assert "payment_intent.payment_method" in src, (
            "finalize endpoint must expand payment_intent.payment_method"
        )
