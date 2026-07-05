"""
Iteration 50 — Pay-after-ride marketing push backend tests.

The only backend changes this iteration are:
  1) POST /api/payments/checkout — now adds submit_type=book and
     custom_text.submit.message on the Stripe Checkout session, plus a
     line item description with pickup→dropoff and date.
  2) POST /api/payments/checkout-setup — now adds custom_text.submit.message
     with the "$0 today · pay after ride" copy.

Both endpoints are otherwise unchanged. These tests only verify:
  - The endpoints still succeed with the new params (Stripe accepts them).
  - Session URLs come back and DB side-effects fire.
  - Existing iter49 flow still works (regression).

We deliberately do NOT try to inspect the Stripe Session object contents
(would require Stripe secret + separate API call and risks rate-limits on
the LIVE key). If Stripe rejected submit_type / custom_text params, the
endpoint would 502.
"""

import os
import uuid
import datetime as dt
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set in environment"


def _future_date(days: int = 21) -> str:
    return (dt.date.today() + dt.timedelta(days=days)).isoformat()


def _make_booking(vehicle_type: str = "Executive Sedan") -> dict:
    payload = {
        "full_name": "TEST Iter50",
        "email": f"iter50-test+{uuid.uuid4().hex[:6]}@example.com",
        "phone": "+14155550101",
        "service_type": "A to B Transfer",
        "pickup_date": _future_date(),
        "pickup_time": "10:00",
        "pickup_location": "SFO Airport, San Francisco, CA",
        "dropoff_location": "Palo Alto, CA",
        "passengers": 2,
        "luggage_count": 1,
        "vehicle_type": vehicle_type,
        "wait_time_consent": True,
    }
    r = requests.post(f"{BASE_URL}/api/bookings", json=payload, timeout=20)
    assert r.status_code == 200, f"Booking create failed: {r.status_code} {r.text[:400]}"
    return r.json()


class TestCheckoutPayNow:
    """/api/payments/checkout — pay-now flow with new submit_type + custom_text."""

    def test_checkout_pay_now_still_creates_stripe_session(self):
        booking = _make_booking(vehicle_type="Executive Sedan")
        body = {"booking_id": booking["id"], "origin_url": BASE_URL}
        r = requests.post(f"{BASE_URL}/api/payments/checkout", json=body, timeout=30)
        assert r.status_code == 200, f"checkout failed: {r.status_code} {r.text[:600]}"
        data = r.json()
        assert "url" in data and data["url"].startswith("https://checkout.stripe.com/"), \
            f"bad session url: {data.get('url','')[:100]}"
        assert "session_id" in data
        sid = data["session_id"]
        assert sid.startswith("cs_live_") or sid.startswith("cs_test_")
        assert float(data.get("amount", 0)) > 0

    def test_checkout_pay_now_status_pending(self):
        booking = _make_booking(vehicle_type="Luxury SUV")
        r = requests.post(
            f"{BASE_URL}/api/payments/checkout",
            json={"booking_id": booking["id"], "origin_url": BASE_URL},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:400]
        sid = r.json()["session_id"]
        st = requests.get(f"{BASE_URL}/api/payments/status/{sid}", timeout=20)
        assert st.status_code == 200, st.text[:400]
        stj = st.json()
        assert stj.get("payment_status") in ("pending", "unpaid", "initiated"), stj


class TestCheckoutSetupCustomText:
    """/api/payments/checkout-setup — pay-after-ride with custom_text still works."""

    def test_setup_still_creates_session(self):
        booking = _make_booking(vehicle_type="First Class")
        body = {"booking_id": booking["id"], "origin_url": BASE_URL}
        r = requests.post(f"{BASE_URL}/api/payments/checkout-setup", json=body, timeout=30)
        assert r.status_code == 200, f"checkout-setup failed: {r.status_code} {r.text[:600]}"
        data = r.json()
        assert data["url"].startswith("https://checkout.stripe.com/")
        assert float(data.get("amount", 0)) > 0

        # Verify booking side-effect
        pub = requests.get(f"{BASE_URL}/api/bookings/{booking['id']}/public", timeout=15).json()
        assert pub["payment_mode"] == "pay_after_ride"
        assert pub["pay_later_amount"] is not None and float(pub["pay_later_amount"]) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
