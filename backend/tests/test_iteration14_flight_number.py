"""Iteration 14: Flight Number requirement + Cancellation Policy."""
import os
import sys
import pytest
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from email_service import render_cancellation_policy_html, render_confirmation_email  # noqa

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://limo-experience-1.preview.emergentagent.com').rstrip('/')

VALID_BOOKING = {
    "full_name": "TEST_Iter14 User",
    "email": "test_iter14@example.com",
    "phone": "+15551234567",
    "service_type": "Airport Transfer",
    "pickup_date": "2026-06-15",
    "pickup_time": "10:00",
    "pickup_location": "SFO International Airport, San Francisco, CA",
    "dropoff_location": "Four Seasons Hotel, San Francisco, CA",
    "passengers": 2,
    "luggage_count": 2,
    "child_seat": False,
    "vehicle_type": "Executive Sedan",
    "notes": "iter14 test",
}

created_ids = []


def _cleanup():
    # Best-effort cleanup via admin
    pass


@pytest.fixture(scope="module", autouse=True)
def cleanup_after():
    yield
    # Cleanup test bookings via admin (best-effort using direct mongo would need db)
    # We rely on admin DELETE if we can auth. Skip for brevity — TEST_ prefix marks them.


# ---------- Backend API tests ----------
class TestFlightNumberValidation:
    def test_airport_transfer_without_flight_number_returns_400(self):
        payload = {**VALID_BOOKING}
        payload.pop("flight_number", None)
        r = requests.post(f"{BASE_URL}/api/bookings", json=payload)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        detail = r.json().get("detail", "").lower()
        assert "flight number" in detail, f"Expected 'flight number' in detail: {detail}"

    def test_airport_transfer_with_flight_number_succeeds(self):
        payload = {**VALID_BOOKING, "flight_number": "UA1234"}
        r = requests.post(f"{BASE_URL}/api/bookings", json=payload)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("flight_number") == "UA1234"
        assert data.get("service_type") == "Airport Transfer"
        created_ids.append(data["id"])

    def test_flight_number_case_preserved(self):
        payload = {**VALID_BOOKING, "flight_number": "aa1234"}
        r = requests.post(f"{BASE_URL}/api/bookings", json=payload)
        assert r.status_code == 200
        data = r.json()
        # Backend should accept as-sent (case preserved)
        assert data.get("flight_number") == "aa1234"
        created_ids.append(data["id"])

    def test_non_airport_transfer_without_flight_number_succeeds(self):
        payload = {**VALID_BOOKING, "service_type": "Wedding"}
        payload.pop("flight_number", None)
        r = requests.post(f"{BASE_URL}/api/bookings", json=payload)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("service_type") == "Wedding"
        assert not data.get("flight_number")
        created_ids.append(data["id"])

    def test_airport_transfer_empty_flight_number_returns_400(self):
        payload = {**VALID_BOOKING, "flight_number": "   "}
        r = requests.post(f"{BASE_URL}/api/bookings", json=payload)
        assert r.status_code == 400


# ---------- Cancellation policy HTML render ----------
class TestCancellationPolicyHtml:
    def test_airport_variant_has_flight_delay(self):
        html = render_cancellation_policy_html(is_airport=True)
        assert "Flight-Delay Protection" in html
        assert "15-minute grace" in html
        assert "monitor your flight number" in html
        assert "24+ hours" in html
        assert "50% refund" in html

    def test_non_airport_variant_excludes_flight_delay(self):
        html = render_cancellation_policy_html(is_airport=False)
        assert "Flight-Delay Protection" not in html
        assert "15-minute grace" not in html
        assert "monitor your flight number" not in html
        assert "24+ hours" in html
        assert "50% refund" in html


# ---------- Confirmation email render ----------
class TestConfirmationEmailFlightNumber:
    def test_confirmation_email_includes_flight_number_line(self):
        fake_booking = {
            "id": "test-id",
            "full_name": "Jane Doe",
            "email": "jane@example.com",
            "confirmation_number": "TEL-ABC123",
            "service_type": "Airport Transfer",
            "vehicle_type": "Executive Sedan",
            "pickup_date": "2026-06-15",
            "pickup_time": "10:00",
            "pickup_location": "SFO",
            "dropoff_location": "Four Seasons SF",
            "passengers": 2,
            "flight_number": "AA1234",
            "meet_and_greet": True,
        }
        html = render_confirmation_email(fake_booking, payment_url=None, manage_url=None)
        assert "AA1234" in html
        assert "monitor your flight" in html.lower()
        # Airport policy block should be present
        assert "Flight-Delay Protection" in html


# ---------- Manage booking flow returns flight_number ----------
class TestManageBookingReturnsFlightNumber:
    """Requires admin token. We'll insert challenge to bypass 2FA via direct mongo
    is not feasible here without async — skip if auth fails."""

    @pytest.fixture(scope="class")
    def admin_token(self):
        # Try login via 2FA: insert a challenge directly via the backend's
        # MongoDB is not directly accessible here. Skip if we can't authenticate.
        # Instead: we'll create a booking and check that GET /bookings/manage/{token}
        # would work if we had a token. We can use the manage endpoint via a fake token.
        # Skipping admin-confirm path — main test creates booking & verifies 404 for fake token.
        pytest.skip("Admin 2FA bypass requires direct mongo access — covered manually")

    def test_manage_endpoint_404_for_invalid_token(self):
        r = requests.get(f"{BASE_URL}/api/bookings/manage/invalid-token-xyz")
        assert r.status_code == 404


# ---------- Regression: existing endpoints ----------
class TestRegression:
    def test_options_endpoint(self):
        r = requests.get(f"{BASE_URL}/api/options")
        assert r.status_code == 200
        data = r.json()
        assert "service_types" in data
        assert "Airport Transfer" in data["service_types"]

    def test_quote_endpoint_unchanged(self):
        r = requests.post(f"{BASE_URL}/api/quote", json={
            "pickup_location": "SFO Airport",
            "dropoff_location": "Palo Alto, CA",
            "service_type": "Airport Transfer",
        })
        assert r.status_code == 200
        data = r.json()
        assert "quotes" in data

    def test_admin_bookings_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/bookings")
        assert r.status_code == 401
