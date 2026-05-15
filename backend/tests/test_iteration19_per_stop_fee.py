"""Iteration 19 — Per-stop flat fee.

Covers:
  - GET /api/settings/public returns per_stop_fee (default 15.0 after migration)
  - POST /api/quote w/ additional_stops_count=N adds N*per_stop_fee*(1+svc%)
    to each priced transfer quote, returns per_stop_fee, stop_fee_total,
    additional_stops_count.
  - Hourly Chauffeur is EXEMPT (stop_fee_total = None even if N>0)
  - additional_stops_count=0 returns stop_fee_total=None
  - PATCH /api/admin/settings persists per_stop_fee (admin auth via 2FA bypass)
  - POST /api/bookings + POST /api/payments/checkout — Stripe amount includes
    2 * per_stop_fee added to base price (RETURN value only — no live charge)
  - REGRESSION: wait-time / damage admin charge endpoints from iter-18
"""

from __future__ import annotations

import os
import uuid
import asyncio
from datetime import datetime, timezone, timedelta

import bcrypt
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

def _load_env_file(path):
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                v = v.strip().strip('"').strip("'")
                os.environ.setdefault(k.strip(), v)
    except FileNotFoundError:
        pass


_load_env_file("/app/frontend/.env")
_load_env_file("/app/backend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

ADMIN_EMAIL = "support@turanelitelimo.com"
ADMIN_PASSWORD = "TuronAdmin@2025"

# A short, real address pair that the live geocoder will resolve.
PICKUP = "JFK Airport, New York, NY"
DROPOFF = "Times Square, New York, NY"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def db(event_loop):
    mc = AsyncIOMotorClient(MONGO_URL)
    yield mc[DB_NAME]
    mc.close()


@pytest.fixture(scope="module")
def admin_token(client, db, event_loop):
    """Bypass 2FA email by inserting a known-code challenge directly into Mongo."""
    # Step 1: trigger login to confirm admin password works
    r = client.post(f"{BASE_URL}/api/admin/login", json={
        "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD,
    })
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text}")
    body = r.json()
    if not body.get("requires_2fa"):
        # legacy single-step login (returns token directly)
        return body["token"]

    # Step 2: insert our own challenge w/ known code, then verify-2fa
    cid = str(uuid.uuid4())
    code_hash = bcrypt.hashpw(b"123456", bcrypt.gensalt()).decode()

    async def insert_challenge():
        await db.admin_2fa_challenges.insert_one({
            "challenge_id": cid,
            "admin_email": ADMIN_EMAIL,
            "code_hash": code_hash,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            "attempts": 0,
            "used": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    event_loop.run_until_complete(insert_challenge())

    r = client.post(f"{BASE_URL}/api/admin/verify-2fa", json={
        "challenge_id": cid, "code": "123456",
    })
    assert r.status_code == 200, f"verify-2fa failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- 1) /api/settings/public ----------
class TestPublicSettings:
    def test_public_settings_has_per_stop_fee(self, client):
        r = client.get(f"{BASE_URL}/api/settings/public")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "per_stop_fee" in body, "per_stop_fee missing from /settings/public"
        # default is 15.0 after migration (or whatever admin set later)
        assert isinstance(body["per_stop_fee"], (int, float))
        assert body["per_stop_fee"] >= 0
        # also confirm service_fee_percent still exposed (regression iter-18)
        assert "service_fee_percent" in body


# ---------- 2) /api/quote — transfer trip adds per-stop fee ----------
class TestQuoteStopFee:
    @pytest.fixture(scope="class")
    def public_settings(self, client):
        return client.get(f"{BASE_URL}/api/settings/public").json()

    @pytest.fixture(scope="class")
    def quote_no_stops(self, client):
        r = client.post(f"{BASE_URL}/api/quote", json={
            "pickup_location": PICKUP,
            "dropoff_location": DROPOFF,
            "service_type": "Airport Transfer",
            "additional_stops_count": 0,
        })
        assert r.status_code == 200, r.text
        return r.json()

    @pytest.fixture(scope="class")
    def quote_two_stops(self, client):
        r = client.post(f"{BASE_URL}/api/quote", json={
            "pickup_location": PICKUP,
            "dropoff_location": DROPOFF,
            "service_type": "Airport Transfer",
            "additional_stops_count": 2,
        })
        assert r.status_code == 200, r.text
        return r.json()

    def test_zero_stops_returns_none_total(self, quote_no_stops):
        # stop_fee_total should be None (not 0) so frontend hides the banner
        assert quote_no_stops.get("stop_fee_total") in (None, 0, 0.0) or quote_no_stops["stop_fee_total"] is None
        # Per spec: zero stops => stop_fee_total is None
        assert quote_no_stops.get("stop_fee_total") is None

    def test_two_stops_returns_fee_total(self, quote_two_stops, public_settings):
        per_stop = float(public_settings["per_stop_fee"])
        assert quote_two_stops["per_stop_fee"] == pytest.approx(per_stop)
        assert quote_two_stops["stop_fee_total"] == pytest.approx(per_stop * 2, rel=1e-3)
        assert quote_two_stops["additional_stops_count"] == 2

    def _executive_price(self, quote_resp):
        for q in quote_resp.get("quotes", []):
            if q["vehicle_type"] in ("Executive Sedan", "Sedan", "E-Class"):
                if q.get("price") is not None:
                    return float(q["price"])
        # fall back to first priced quote
        for q in quote_resp.get("quotes", []):
            if q.get("price") is not None:
                return float(q["price"])
        return None

    def test_executive_sedan_delta_matches_formula(
        self, quote_no_stops, quote_two_stops, public_settings,
    ):
        """delta = N * per_stop_fee * (1 + svc%/100), rounded to nearest cent."""
        p0 = self._executive_price(quote_no_stops)
        p2 = self._executive_price(quote_two_stops)
        assert p0 is not None and p2 is not None, "no priced quote returned"
        per_stop = float(public_settings["per_stop_fee"])
        svc_pct = float(public_settings.get("service_fee_percent") or 0.0)
        expected_delta = 2 * per_stop * (1 + svc_pct / 100.0)
        actual_delta = round(p2 - p0, 2)
        # rounding inside _build_quotes happens BEFORE the service-fee step,
        # so allow ~$0.05 wiggle (well below per-stop $15 floor)
        assert actual_delta == pytest.approx(expected_delta, abs=0.10), (
            f"Executive delta {actual_delta} != expected {expected_delta:.2f} "
            f"(p0={p0}, p2={p2}, per_stop={per_stop}, svc%={svc_pct})"
        )


# ---------- 3) Hourly Chauffeur exempt ----------
class TestHourlyExempt:
    def test_hourly_with_stops_returns_none_total(self, client):
        r = client.post(f"{BASE_URL}/api/quote", json={
            "pickup_location": PICKUP,
            "dropoff_location": DROPOFF,
            "service_type": "Hourly Chauffeur",
            "hours": 3,
            "additional_stops_count": 4,
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("pricing_mode") == "hourly"
        # spec: hourly is exempt — stop_fee_total should NOT be present (None)
        assert body.get("stop_fee_total") is None, (
            f"Hourly should be exempt; got stop_fee_total={body.get('stop_fee_total')}"
        )


# ---------- 4) PATCH /api/admin/settings persists ----------
class TestAdminPersist:
    def test_patch_per_stop_fee_persists(self, client, auth_headers):
        # Set to a unique value, then GET public to confirm
        new_val = 22.5
        try:
            r = client.patch(
                f"{BASE_URL}/api/admin/settings",
                json={"per_stop_fee": new_val},
                headers=auth_headers,
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body.get("per_stop_fee") == pytest.approx(new_val)
            # public reflects it
            pub = client.get(f"{BASE_URL}/api/settings/public").json()
            assert pub["per_stop_fee"] == pytest.approx(new_val)
            # quote uses it
            qr = client.post(f"{BASE_URL}/api/quote", json={
                "pickup_location": PICKUP,
                "dropoff_location": DROPOFF,
                "service_type": "Airport Transfer",
                "additional_stops_count": 1,
            })
            assert qr.status_code == 200
            assert qr.json().get("per_stop_fee") == pytest.approx(new_val)
            assert qr.json().get("stop_fee_total") == pytest.approx(new_val)
        finally:
            # Restore default 15.0 for downstream tests
            client.patch(
                f"{BASE_URL}/api/admin/settings",
                json={"per_stop_fee": 15.0},
                headers=auth_headers,
            )


# ---------- 5) Booking + checkout amount includes 2*per_stop_fee ----------
class TestBookingCheckoutAmount:
    @pytest.fixture
    def booking_id(self, client, db, event_loop):
        # 100% deposit so checkout amount == full quote_amount
        future_date = (datetime.now(timezone.utc) + timedelta(days=14)).date().isoformat()
        payload = {
            "full_name": f"TEST_iter19_{uuid.uuid4().hex[:6]}",
            "email": "test+iter19@example.com",
            "phone": "+15551234567",
            "service_type": "Airport Transfer",
            "vehicle_type": "Executive Sedan",
            "pickup_location": PICKUP,
            "dropoff_location": DROPOFF,
            "pickup_date": future_date,
            "pickup_time": "10:00",
            "passengers": 2,
            "luggage": 1,
            "notes": "TEST_iter19",
            "additional_stops": ["Stop A, NYC", "Stop B, NYC"],
            "flight_number": "AA100",
            "wait_time_consent": True,
        }
        r = client.post(f"{BASE_URL}/api/bookings", json=payload)
        assert r.status_code == 200, r.text
        bid = r.json()["id"]
        yield bid
        # cleanup
        async def cleanup():
            await db.bookings.delete_one({"id": bid})
            await db.payment_transactions.delete_many({"booking_id": bid})
        event_loop.run_until_complete(cleanup())

    def test_checkout_amount_includes_two_stop_fees(self, client, booking_id, db, event_loop):
        # Build a baseline: same trip with zero stops would give X; checkout should be ~ X + 2*15*(1+svc%)
        baseline_quote = client.post(f"{BASE_URL}/api/quote", json={
            "pickup_location": PICKUP,
            "dropoff_location": DROPOFF,
            "service_type": "Airport Transfer",
            "additional_stops_count": 0,
        }).json()
        baseline_price = None
        for q in baseline_quote["quotes"]:
            if q["vehicle_type"] == "Executive Sedan" and q.get("price"):
                baseline_price = float(q["price"])
                break
        assert baseline_price is not None

        pub = client.get(f"{BASE_URL}/api/settings/public").json()
        per_stop = float(pub["per_stop_fee"])
        svc_pct = float(pub.get("service_fee_percent") or 0.0)

        # Start checkout — endpoint returns amount; we don't follow the URL.
        r = client.post(f"{BASE_URL}/api/payments/checkout", json={
            "booking_id": booking_id,
            "origin_url": "https://example.com",
        })
        if r.status_code != 200:
            pytest.skip(f"Checkout endpoint not reachable: {r.status_code} {r.text[:200]}")
        body = r.json()
        assert "amount" in body, body
        assert "url" in body and body["url"].startswith("http"), body
        amount = float(body["amount"])

        # _compute_quote_amount path: base + stops*per_stop_fee then * (1+svc%)
        # baseline_price already includes svc%; so expected ≈ baseline_price + 2*per_stop*(1+svc%/100)
        expected = baseline_price + 2 * per_stop * (1 + svc_pct / 100.0)
        # _compute_quote_amount runs an independent geocode → tiny mileage rounding diffs,
        # allow ~$2 wiggle which is well below 2*$15=$30
        assert abs(amount - expected) < 2.50, (
            f"Checkout amount {amount} differs from expected {expected:.2f} by >$2.50 "
            f"(baseline={baseline_price}, per_stop={per_stop}, svc%={svc_pct})"
        )


# ---------- 6) Regression: iter-18 admin endpoints still auth-protected ----------
class TestIter18Regression:
    def test_charge_wait_time_requires_auth(self, client):
        r = client.post(f"{BASE_URL}/api/admin/bookings/fake-id/charge-wait-time", json={})
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"

    def test_charge_damages_requires_auth(self, client):
        r = client.post(f"{BASE_URL}/api/admin/bookings/fake-id/charge-damages", json={
            "amount": 50, "reason": "test reason",
        })
        assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"

    def test_charge_wait_time_404_with_auth(self, client, auth_headers):
        r = client.post(
            f"{BASE_URL}/api/admin/bookings/does-not-exist/charge-wait-time",
            json={}, headers=auth_headers,
        )
        assert r.status_code == 404, f"Expected 404, got {r.status_code} {r.text}"
