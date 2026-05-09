"""Iteration 6 backend tests: brand rename to TuranEliteLimo, TEL-XXXXXX confirmation #,
auto-confirm on payment success, /payments/checkout auto-generates CN, regression."""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://limo-experience-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@turonlimo.com"
ADMIN_PASSWORD = "TuronAdmin@2025"

# New: TEL- prefix, alphabet excludes I, O, 0, 1
CN_REGEX = re.compile(r"^TEL-[A-HJ-NP-Z2-9]{6}$")


@pytest.fixture(scope="session")
def auth_headers():
    r = requests.post(f"{API}/admin/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


def _create_booking(extra=None):
    p = {
        "full_name": "TEST Iter6",
        "email": "test_iter6@example.com",
        "phone": "5551237777",
        "service_type": "Airport Transfer",
        "pickup_date": "2026-08-15",
        "pickup_time": "10:00",
        "pickup_location": "SFO",
        "dropoff_location": "Pier 39 San Francisco",
        "passengers": 2,
        "vehicle_type": "Executive Sedan",
    }
    if extra:
        p.update(extra)
    r = requests.post(f"{API}/bookings", json=p, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- Brand rename ----------
class TestBrand:
    def test_root_brand(self):
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        assert "TuranEliteLimo" in r.json().get("message", "")


# ---------- Confirmation # format & auto-gen on /payments/checkout ----------
class TestCheckoutAutoGenCN:
    def test_admin_confirm_uses_TEL_prefix(self, auth_headers):
        b = _create_booking()
        bid = b["id"]
        try:
            r = requests.patch(f"{API}/admin/bookings/{bid}",
                               json={"status": "confirmed"},
                               headers=auth_headers, timeout=30)
            assert r.status_code == 200, r.text
            cn = r.json().get("confirmation_number")
            assert cn and CN_REGEX.match(cn), f"Bad CN: {cn}"
            # Forbidden ambiguous chars
            for ch in "IO01":
                assert ch not in cn[4:], f"Ambiguous char {ch} in {cn}"
        finally:
            requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers)

    def test_checkout_generates_CN_when_missing(self, auth_headers):
        """POST /payments/checkout on a booking without CN must generate TEL-XXXXXX and persist."""
        b = _create_booking()
        bid = b["id"]
        try:
            # Booking is "pending" with no CN — call checkout directly
            assert b.get("confirmation_number") is None
            r = requests.post(f"{API}/payments/checkout",
                              json={"booking_id": bid, "origin_url": BASE_URL},
                              timeout=60)
            assert r.status_code == 200, r.text
            cd = r.json()
            assert cd["url"].startswith("http")
            assert cd["session_id"]
            assert cd["amount"] > 0
            assert "_id" not in cd

            # Public endpoint should now reflect the new CN
            pub = requests.get(f"{API}/bookings/{bid}/public", timeout=20).json()
            cn1 = pub["confirmation_number"]
            assert cn1 and CN_REGEX.match(cn1), f"CN not generated/persisted: {cn1}"

            # Idempotent: re-call checkout, CN must remain same
            r2 = requests.post(f"{API}/payments/checkout",
                               json={"booking_id": bid, "origin_url": BASE_URL},
                               timeout=60)
            assert r2.status_code == 200, r2.text
            pub2 = requests.get(f"{API}/bookings/{bid}/public", timeout=20).json()
            assert pub2["confirmation_number"] == cn1, "CN changed across checkout calls"
        finally:
            requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers)

    def test_checkout_call_only_no_CN_required(self, auth_headers):
        """call_only vehicle: checkout returns 400, no CN gets created."""
        b = _create_booking({"vehicle_type": "Stretch Limousine"})
        bid = b["id"]
        try:
            r = requests.post(f"{API}/payments/checkout",
                              json={"booking_id": bid, "origin_url": BASE_URL}, timeout=30)
            assert r.status_code == 400
            pub = requests.get(f"{API}/bookings/{bid}/public", timeout=20).json()
            assert pub.get("confirmation_number") in (None, "")
        finally:
            requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers)


# ---------- /payments/status auto-confirm + 500-resilience ----------
class TestPaymentStatus:
    def test_status_no_500_on_stripe_failure(self, auth_headers):
        """After checkout we know Stripe lookup of fresh sid often fails in this env.
        Endpoint must return 200 with fallback fields, never 500. (Iter5 regression)"""
        b = _create_booking()
        bid = b["id"]
        try:
            cr = requests.post(f"{API}/payments/checkout",
                               json={"booking_id": bid, "origin_url": BASE_URL},
                               timeout=60)
            assert cr.status_code == 200, cr.text
            sid = cr.json()["session_id"]
            sr = requests.get(f"{API}/payments/status/{sid}", timeout=30)
            assert sr.status_code == 200, sr.text
            sd = sr.json()
            for k in ["payment_status", "booking_status", "amount", "currency", "confirmation_number"]:
                assert k in sd
            # CN should already be present
            assert sd["confirmation_number"] and CN_REGEX.match(sd["confirmation_number"])
        finally:
            requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers)

    def test_status_unknown_session_returns_404(self):
        r = requests.get(f"{API}/payments/status/cs_test_does_not_exist", timeout=20)
        assert r.status_code == 404


# ---------- Admin path regression: confirmation # idempotent ----------
class TestAdminConfirmIdempotent:
    def test_idempotent(self, auth_headers):
        b = _create_booking()
        bid = b["id"]
        try:
            r1 = requests.patch(f"{API}/admin/bookings/{bid}",
                                json={"status": "confirmed"},
                                headers=auth_headers, timeout=30)
            cn1 = r1.json()["confirmation_number"]
            assert CN_REGEX.match(cn1)
            requests.patch(f"{API}/admin/bookings/{bid}",
                           json={"status": "pending"}, headers=auth_headers)
            r2 = requests.patch(f"{API}/admin/bookings/{bid}",
                                json={"status": "confirmed"},
                                headers=auth_headers, timeout=30)
            cn2 = r2.json()["confirmation_number"]
            assert cn1 == cn2
        finally:
            requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers)


# ---------- Pricing PATCH regression ----------
class TestPricing:
    def test_patch_and_get(self, auth_headers):
        # Read existing
        before = requests.get(f"{API}/admin/pricing", headers=auth_headers, timeout=15).json()
        sedan = next(x for x in before if x["vehicle_type"] == "Executive Sedan")
        # Patch
        r = requests.patch(
            f"{API}/admin/pricing/Executive Sedan",
            json={"base": 80.0, "per_mile": 3.75, "minimum": 90.0},
            headers=auth_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["base"] == 80.0 and d["per_mile"] == 3.75 and d["minimum"] == 90.0
        # GET reflects
        after = requests.get(f"{API}/admin/pricing", headers=auth_headers, timeout=15).json()
        s2 = next(x for x in after if x["vehicle_type"] == "Executive Sedan")
        assert s2["base"] == 80.0 and s2["per_mile"] == 3.75 and s2["minimum"] == 90.0
        # Reset to base values
        requests.patch(
            f"{API}/admin/pricing/Executive Sedan",
            json={"base": sedan["base"], "per_mile": sedan["per_mile"], "minimum": sedan["minimum"]},
            headers=auth_headers, timeout=15,
        )


# ---------- Regression: prior tests still pass ----------
class TestPriorRegression:
    def test_options(self):
        r = requests.get(f"{API}/options", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "S-Class" in d["vehicle_types"]
        assert "Luxury Sedan" not in d["vehicle_types"]

    def test_admin_me(self, auth_headers):
        r = requests.get(f"{API}/admin/me", headers=auth_headers, timeout=15)
        assert r.status_code == 200

    def test_quote(self):
        r = requests.post(f"{API}/quote",
                          json={"pickup_location": "SFO", "dropoff_location": "Pier 39 San Francisco"},
                          timeout=30)
        assert r.status_code == 200
        assert len(r.json()["quotes"]) == 6

    def test_settings_default(self, auth_headers):
        r = requests.get(f"{API}/admin/settings", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert 0 <= d["deposit_percent"] <= 100


# ---------- Final: reset settings & pricing ----------
@pytest.fixture(scope="session", autouse=True)
def _final_reset(auth_headers):
    yield
    try:
        requests.patch(f"{API}/admin/settings",
                       json={"deposit_percent": 100, "currency": "usd"},
                       headers=auth_headers, timeout=10)
        requests.patch(
            f"{API}/admin/pricing/Executive Sedan",
            json={"base": 75.0, "per_mile": 3.5, "minimum": 85.0, "call_only": False},
            headers=auth_headers, timeout=10,
        )
    except Exception:
        pass
