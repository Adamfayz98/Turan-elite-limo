"""Iteration 5 backend API tests: Places autocomplete, confirmation flow, public booking,
Settings, Stripe payments checkout/status, refund, regression."""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://limo-experience-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@turonlimo.com"
ADMIN_PASSWORD = "TuronAdmin@2025"

CN_REGEX = re.compile(r"^TEL-[A-HJ-NP-Z2-9]{6}$")


@pytest.fixture(scope="session")
def auth_headers():
    r = requests.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _create_booking(payload=None):
    p = {
        "full_name": "TEST Iter5 Booking",
        "email": "test_iter5@example.com",
        "phone": "5551237777",
        "service_type": "Airport Transfer",
        "pickup_date": "2026-07-20",
        "pickup_time": "10:00",
        "pickup_location": "SFO",
        "dropoff_location": "Pier 39 San Francisco",
        "passengers": 2,
        "vehicle_type": "Executive Sedan",
    }
    if payload:
        p.update(payload)
    r = requests.post(f"{API}/bookings", json=p, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- Places Autocomplete ----------
class TestPlacesAutocomplete:
    def test_too_short(self):
        r = requests.get(f"{API}/places/autocomplete", params={"input": "F"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["predictions"] == []

    def test_empty_input(self):
        r = requests.get(f"{API}/places/autocomplete", params={"input": ""}, timeout=15)
        assert r.status_code == 200
        assert r.json()["predictions"] == []

    def test_four_seasons_returns_results(self):
        r = requests.get(f"{API}/places/autocomplete", params={"input": "Four Seasons"}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        preds = d.get("predictions", [])
        assert len(preds) >= 3, f"Expected >=3 predictions, got {len(preds)}: {d}"
        for p in preds:
            assert "place_id" in p and p["place_id"]
            assert "description" in p and p["description"]
            assert "main_text" in p
            assert "secondary_text" in p


# ---------- Confirmation flow ----------
class TestConfirmationFlow:
    def test_confirm_generates_confirmation_number(self, auth_headers):
        b = _create_booking()
        bid = b["id"]
        try:
            r = requests.patch(f"{API}/admin/bookings/{bid}", json={"status": "confirmed"}, headers=auth_headers, timeout=30)
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["status"] == "confirmed"
            cn = d.get("confirmation_number")
            assert cn and CN_REGEX.match(cn), f"Bad confirmation_number: {cn}"
            # quote_amount should be set (Executive Sedan is priced)
            assert d.get("quote_amount") and d["quote_amount"] > 0
        finally:
            requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers)

    def test_confirm_idempotent(self, auth_headers):
        b = _create_booking()
        bid = b["id"]
        try:
            r1 = requests.patch(f"{API}/admin/bookings/{bid}", json={"status": "confirmed"}, headers=auth_headers, timeout=30)
            cn1 = r1.json()["confirmation_number"]
            # transition to pending then back to confirmed
            requests.patch(f"{API}/admin/bookings/{bid}", json={"status": "pending"}, headers=auth_headers)
            r2 = requests.patch(f"{API}/admin/bookings/{bid}", json={"status": "confirmed"}, headers=auth_headers, timeout=30)
            cn2 = r2.json()["confirmation_number"]
            assert cn1 == cn2, "confirmation_number must not change"
        finally:
            requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers)

    def test_confirm_call_only_vehicle_no_quote(self, auth_headers):
        b = _create_booking({"vehicle_type": "Stretch Limousine"})
        bid = b["id"]
        try:
            r = requests.patch(f"{API}/admin/bookings/{bid}", json={"status": "confirmed"}, headers=auth_headers, timeout=30)
            assert r.status_code == 200
            d = r.json()
            assert d.get("confirmation_number") and CN_REGEX.match(d["confirmation_number"])
            # call_only -> quote_amount stays None / null
            assert not d.get("quote_amount")
        finally:
            requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers)


# ---------- Public booking ----------
class TestPublicBooking:
    def test_public_booking_no_auth(self, auth_headers):
        b = _create_booking()
        bid = b["id"]
        try:
            requests.patch(f"{API}/admin/bookings/{bid}", json={"status": "confirmed"}, headers=auth_headers, timeout=30)
            r = requests.get(f"{API}/bookings/{bid}/public", timeout=20)
            assert r.status_code == 200, r.text
            d = r.json()
            assert "_id" not in d
            for k in ["id", "confirmation_number", "status", "payment_status",
                      "full_name", "email", "vehicle_type", "pickup_date", "pickup_time",
                      "pickup_location", "dropoff_location", "passengers",
                      "quote_amount", "deposit_amount", "deposit_percent", "currency"]:
                assert k in d, f"missing {k}"
            assert d["id"] == bid
            assert d["status"] == "confirmed"
            assert CN_REGEX.match(d["confirmation_number"])
        finally:
            requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers)

    def test_public_not_found(self):
        r = requests.get(f"{API}/bookings/nonexistent-xyz/public", timeout=15)
        assert r.status_code == 404


# ---------- Settings ----------
class TestSettings:
    def test_settings_auth_required(self):
        r = requests.get(f"{API}/admin/settings")
        assert r.status_code == 401

    def test_get_settings_default(self, auth_headers):
        # Reset first
        requests.patch(f"{API}/admin/settings", json={"deposit_percent": 100, "currency": "usd"}, headers=auth_headers)
        r = requests.get(f"{API}/admin/settings", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["deposit_percent"] == 100
        assert d["currency"] == "usd"

    def test_patch_settings_affects_public_booking(self, auth_headers):
        b = _create_booking()
        bid = b["id"]
        try:
            # Confirm so quote_amount is set
            requests.patch(f"{API}/admin/bookings/{bid}", json={"status": "confirmed"}, headers=auth_headers, timeout=30)
            # Update settings
            r = requests.patch(f"{API}/admin/settings", json={"deposit_percent": 25}, headers=auth_headers)
            assert r.status_code == 200
            assert r.json()["deposit_percent"] == 25

            pub = requests.get(f"{API}/bookings/{bid}/public", timeout=20).json()
            qa = pub["quote_amount"]
            assert qa and qa > 0
            expected = round(float(qa) * 0.25, 2)
            assert pub["deposit_amount"] == expected
            assert pub["deposit_percent"] == 25
        finally:
            requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers)
            # Reset deposit
            requests.patch(f"{API}/admin/settings", json={"deposit_percent": 100}, headers=auth_headers)

    def test_settings_validation(self, auth_headers):
        r = requests.patch(f"{API}/admin/settings", json={"deposit_percent": 150}, headers=auth_headers)
        assert r.status_code == 422


# ---------- Stripe payments ----------
class TestPayments:
    def test_checkout_requires_quote(self, auth_headers):
        # Create call-only booking, confirm, then try to checkout -> 400
        b = _create_booking({"vehicle_type": "Stretch Limousine"})
        bid = b["id"]
        try:
            requests.patch(f"{API}/admin/bookings/{bid}", json={"status": "confirmed"}, headers=auth_headers, timeout=30)
            r = requests.post(f"{API}/payments/checkout", json={"booking_id": bid, "origin_url": BASE_URL}, timeout=30)
            assert r.status_code == 400, r.text
            assert "call" in r.text.lower() or "phone" in r.text.lower()
        finally:
            requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers)

    def test_checkout_creates_session(self, auth_headers):
        b = _create_booking()
        bid = b["id"]
        try:
            requests.patch(f"{API}/admin/bookings/{bid}", json={"status": "confirmed"}, headers=auth_headers, timeout=30)
            r = requests.post(f"{API}/payments/checkout", json={"booking_id": bid, "origin_url": BASE_URL}, timeout=60)
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["url"].startswith("http")
            assert d["session_id"]
            assert d["amount"] > 0
            assert "_id" not in d

            # Booking payment_status should be 'pending'
            lst = requests.get(f"{API}/admin/bookings", headers=auth_headers).json()
            match = next(x for x in lst if x["id"] == bid)
            assert match["payment_status"] == "pending"

            # Status endpoint responds without 500
            sid = d["session_id"]
            sr = requests.get(f"{API}/payments/status/{sid}", timeout=30)
            assert sr.status_code == 200, sr.text
            sd = sr.json()
            for k in ["payment_status", "booking_status", "amount", "currency", "confirmation_number"]:
                assert k in sd
        finally:
            requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers)

    def test_checkout_booking_not_found(self):
        r = requests.post(f"{API}/payments/checkout", json={"booking_id": "no-such-id", "origin_url": BASE_URL}, timeout=15)
        assert r.status_code == 404


# ---------- Refund ----------
class TestRefund:
    def test_refund_auth_required(self):
        r = requests.post(f"{API}/admin/payments/some-id/refund", json={})
        assert r.status_code == 401

    def test_refund_unpaid_returns_400(self, auth_headers):
        b = _create_booking()
        bid = b["id"]
        try:
            r = requests.post(f"{API}/admin/payments/{bid}/refund", json={}, headers=auth_headers, timeout=15)
            assert r.status_code == 400
            assert "not paid" in r.text.lower()
        finally:
            requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers)

    def test_refund_booking_not_found(self, auth_headers):
        r = requests.post(f"{API}/admin/payments/nonexistent/refund", json={}, headers=auth_headers, timeout=15)
        assert r.status_code == 404


# ---------- Regression ----------
class TestRegression:
    def test_options_unchanged(self):
        r = requests.get(f"{API}/options", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "S-Class" in d["vehicle_types"]
        assert "Luxury Sedan" not in d["vehicle_types"]

    def test_admin_login_still_works(self, auth_headers):
        r = requests.get(f"{API}/admin/me", headers=auth_headers)
        assert r.status_code == 200

    def test_pricing_endpoints_still_work(self, auth_headers):
        r = requests.get(f"{API}/admin/pricing", headers=auth_headers)
        assert r.status_code == 200
        assert len(r.json()) == 6

    def test_quote_still_works(self):
        r = requests.post(f"{API}/quote", json={"pickup_location": "SFO", "dropoff_location": "Pier 39 San Francisco"}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert len(d["quotes"]) == 6


# ---------- Final cleanup: ensure deposit_percent is 100 ----------
@pytest.fixture(scope="session", autouse=True)
def _reset_settings_at_end(auth_headers):
    yield
    try:
        requests.patch(f"{API}/admin/settings", json={"deposit_percent": 100, "currency": "usd"}, headers=auth_headers, timeout=10)
    except Exception:
        pass
