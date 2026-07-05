"""
Iteration 49 — Pay-after-ride / Setup-mode checkout backend tests.

Covers:
  - POST /api/payments/checkout-setup happy path (instant-price vehicle)
  - POST /api/payments/checkout-setup rejection for quote-only vehicle
  - GET  /api/payments/status/{session_id} for setup-mode session (pending)
  - POST /api/admin/bookings/{id}/charge-pay-later (auth + validation)
  - GET  /api/bookings/{id}/public exposes new fields (payment_mode,
    pay_later_amount, pay_later_charge_error)

STRIPE IS LIVE — this test file only verifies session URLs come back and DB
side-effects fire. It never enters card data. `charge-pay-later` is only
verified up to the "No saved card" / non-pay-later guard paths.
"""

import os
import uuid
import datetime as dt
import jwt
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://limo-experience-1.preview.emergentagent.com").rstrip("/")
JWT_SECRET = os.environ.get("JWT_SECRET", "d5b4e1a3c8f47921e6b3d9f1c2a4e7891f5d6c8b3a2e9f1d4c7b8a5e2f1d9c8b")

# ---- helpers ----

def _admin_jwt() -> str:
    """Mint an admin JWT locally — same secret + payload shape as server.create_access_token()."""
    payload = {
        "sub": "support@turanelitelimo.com",
        "role": "admin",
        "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=1),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _future_date(days: int = 21) -> str:
    return (dt.date.today() + dt.timedelta(days=days)).isoformat()


def _make_booking(vehicle_type: str = "Executive Sedan", service_type: str = "A to B Transfer") -> dict:
    """POST /api/bookings and return the booking doc."""
    payload = {
        "full_name": "TEST PayAfter",
        "email": f"paylater-test+{uuid.uuid4().hex[:6]}@example.com",
        "phone": "+14155550101",
        "service_type": service_type,
        "pickup_date": _future_date(),
        "pickup_time": "10:00",
        "pickup_location": "SFO Airport, San Francisco, CA",
        "dropoff_location": "Palo Alto, CA",
        "passengers": 2,
        "luggage_count": 1,
        "vehicle_type": vehicle_type,
        "wait_time_consent": True,
    }
    if service_type == "Airport Transfer":
        payload["flight_number"] = "UA123"
    r = requests.post(f"{BASE_URL}/api/bookings", json=payload, timeout=20)
    assert r.status_code == 200, f"Booking create failed: {r.status_code} {r.text[:400]}"
    return r.json()


# ---- Backend regression: /bookings/{id}/public exposes new fields ----

class TestPublicBookingNewFields:
    def test_public_booking_exposes_pay_later_fields(self):
        booking = _make_booking()
        r = requests.get(f"{BASE_URL}/api/bookings/{booking['id']}/public", timeout=15)
        assert r.status_code == 200, r.text[:400]
        data = r.json()
        # New fields must be present (even if null)
        assert "payment_mode" in data, "payment_mode missing from public booking response"
        assert "pay_later_amount" in data, "pay_later_amount missing from public booking response"
        assert "pay_later_charge_error" in data, "pay_later_charge_error missing"
        # Fresh booking = no pay-after-ride yet.
        assert data["payment_mode"] in (None, "", "pay_now"), f"unexpected default payment_mode={data['payment_mode']}"
        assert data["pay_later_charge_error"] in (None, "")


# ---- POST /payments/checkout-setup ----

class TestCheckoutSetup:
    def test_setup_happy_path_instant_price_vehicle(self):
        """Executive Sedan + A→B Transfer → setup Checkout session, booking flagged pay_after_ride."""
        booking = _make_booking(vehicle_type="Executive Sedan", service_type="A to B Transfer")
        body = {"booking_id": booking["id"], "origin_url": BASE_URL}
        r = requests.post(f"{BASE_URL}/api/payments/checkout-setup", json=body, timeout=30)
        assert r.status_code == 200, f"checkout-setup failed: {r.status_code} {r.text[:500]}"
        data = r.json()

        # 1. Response shape
        assert "url" in data and isinstance(data["url"], str)
        assert data["url"].startswith("https://checkout.stripe.com/"), f"unexpected stripe url: {data['url'][:80]}"
        assert "session_id" in data and (data["session_id"].startswith("cs_live_") or data["session_id"].startswith("cs_test_"))
        assert isinstance(data.get("amount"), (int, float)) and float(data["amount"]) > 0

        # 2. Booking side-effects via public endpoint
        pub = requests.get(f"{BASE_URL}/api/bookings/{booking['id']}/public", timeout=15).json()
        assert pub["payment_mode"] == "pay_after_ride"
        assert pub["pay_later_amount"] is not None and float(pub["pay_later_amount"]) > 0
        assert pub.get("confirmation_number"), "confirmation_number should be generated after setup checkout"

        # 3. Status endpoint returns pending for un-completed setup session
        st = requests.get(f"{BASE_URL}/api/payments/status/{data['session_id']}", timeout=20)
        assert st.status_code == 200, st.text[:400]
        stj = st.json()
        assert stj.get("payment_status") == "pending", f"expected pending, got {stj}"
        assert abs(float(stj.get("amount", 0)) - float(data["amount"])) < 0.02

    def test_setup_rejects_quote_only_vehicle(self):
        """Party Bus (call_only) must NOT be usable with pay-after-ride flow."""
        # A quote-only vehicle can't be created via POST /bookings on some validation flows
        # but Party Bus IS in VEHICLE_TYPES; server-side pricing returns None → 400 phone quote.
        # Use A→B Transfer so booking is accepted, but Party Bus vehicle triggers 400 at checkout.
        booking = _make_booking(vehicle_type="Party Bus", service_type="A to B Transfer")
        body = {"booking_id": booking["id"], "origin_url": BASE_URL}
        r = requests.post(f"{BASE_URL}/api/payments/checkout-setup", json=body, timeout=20)
        assert r.status_code == 400, f"expected 400 for quote-only vehicle, got {r.status_code} {r.text[:300]}"
        detail = r.json().get("detail", "")
        assert "phone quote" in detail.lower() or "requires" in detail.lower(), f"unexpected detail: {detail}"

    def test_setup_404_when_booking_missing(self):
        r = requests.post(
            f"{BASE_URL}/api/payments/checkout-setup",
            json={"booking_id": "bogus-id-" + uuid.uuid4().hex, "origin_url": BASE_URL},
            timeout=15,
        )
        assert r.status_code == 404


# ---- POST /admin/bookings/{id}/charge-pay-later ----

class TestAdminChargePayLater:
    def test_requires_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/nonexistent/charge-pay-later",
            json={},
            timeout=10,
        )
        # Missing bearer → 401 or 403 (FastAPI HTTPBearer returns 403 if no scheme)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code} {r.text[:200]}"

    def test_rejects_non_pay_after_ride_booking(self):
        booking = _make_booking()  # payment_mode not set yet → not pay_after_ride
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{booking['id']}/charge-pay-later",
            json={},
            headers={"Authorization": f"Bearer {_admin_jwt()}"},
            timeout=15,
        )
        assert r.status_code == 400, f"expected 400 non-pay-later, got {r.status_code} {r.text[:300]}"
        assert "pay-after-ride" in r.json().get("detail", "").lower()

    def test_no_saved_card_returns_400(self):
        """Booking flipped to pay_after_ride via checkout-setup but no card actually saved yet."""
        booking = _make_booking()
        # Trigger setup so payment_mode=pay_after_ride
        cs = requests.post(
            f"{BASE_URL}/api/payments/checkout-setup",
            json={"booking_id": booking["id"], "origin_url": BASE_URL},
            timeout=30,
        )
        assert cs.status_code == 200, cs.text[:300]

        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/{booking['id']}/charge-pay-later",
            json={},
            headers={"Authorization": f"Bearer {_admin_jwt()}"},
            timeout=15,
        )
        assert r.status_code == 400, f"expected 400 no-saved-card, got {r.status_code} {r.text[:300]}"
        assert "saved card" in r.json().get("detail", "").lower()

    def test_404_when_booking_missing(self):
        r = requests.post(
            f"{BASE_URL}/api/admin/bookings/does-not-exist-{uuid.uuid4().hex[:8]}/charge-pay-later",
            json={},
            headers={"Authorization": f"Bearer {_admin_jwt()}"},
            timeout=10,
        )
        assert r.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
