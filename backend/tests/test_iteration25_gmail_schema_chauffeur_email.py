"""
Iteration 25 — Gmail Reservation JSON-LD + chauffeur-assigned email.

Covers:
- email_service.render_confirmation_email embeds <script type="application/ld+json">
  with @type=Reservation + reservationStatus=ReservationConfirmed in <head>.
- email_service.render_chauffeur_assigned_email exists and renders driver name,
  phone, plate, vehicle, pickup date/time, schema.org JSON-LD. Empty plate hides
  plate row; missing phone hides call/text buttons.
- POST /api/admin/bookings/{id}/assign-driver accepts driver_vehicle + notify_customer.
  notify_customer=false skips the customer email. SMS path still fires.
- Booking response shape includes driver_vehicle.
- DELETE /admin/bookings/{id}/driver clears driver_vehicle (and friends).
- Regression smoke: critical endpoints from iter18-24 still reachable.
"""

import json
import os
import re
import sys
import pathlib
import uuid
import bcrypt
import requests
import pytest

# Make backend importable for unit tests of email_service.*
BACKEND_DIR = pathlib.Path("/app/backend")
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

# Existing seeded prompt booking — has manage_token but NO real payment intent.
TEST_BOOKING_ID = "5d6c9c49-a7b5-4bd6-97b0-86cbffff288b"
TEST_DRIVER_TOKEN = "5oOuv345Fr-LxKIaj8o94g"


# ------------------------------------------------------------------ #
# Admin login w/ 2FA bypass (per /app/memory/test_credentials.md)    #
# ------------------------------------------------------------------ #
@pytest.fixture(scope="module")
def admin_token():
    s = requests.Session()
    r = s.post(f"{API}/admin/login", json={
        "email": "support@turanelitelimo.com",
        "password": "TuronAdmin@2025",
    }, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    if not data.get("requires_2fa"):
        # Legacy direct-token shape — should not happen given 2FA is on.
        return data["token"]

    # Inject a known 2FA challenge directly into Mongo (test-only bypass).
    challenge_id = data["challenge_id"]
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from datetime import datetime, timezone, timedelta

    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    code_hash = bcrypt.hashpw(b"123456", bcrypt.gensalt()).decode()

    async def _patch():
        cli = AsyncIOMotorClient(mongo_url)
        await cli[db_name].admin_2fa_challenges.update_one(
            {"challenge_id": challenge_id},
            {"$set": {
                "code_hash": code_hash,
                "attempts": 0,
                "used": False,
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            }},
        )
        cli.close()

    asyncio.get_event_loop().run_until_complete(_patch())

    r2 = s.post(f"{API}/admin/verify-2fa", json={
        "challenge_id": challenge_id,
        "code": "123456",
    }, timeout=15)
    assert r2.status_code == 200, f"2fa failed: {r2.status_code} {r2.text}"
    return r2.json()["token"]


@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ============================================================== #
#  A. EMAIL RENDERING — pure-Python unit tests                  #
# ============================================================== #
class TestConfirmationEmailJsonLd:
    """render_confirmation_email must embed schema.org JSON-LD in <head>."""

    def _booking(self):
        return {
            "confirmation_number": "TEL-TEST-25-A",
            "full_name": "Jane Customer",
            "email": "jane@example.com",
            "vehicle_type": "Mercedes S-Class",
            "service_type": "Airport Transfer",
            "pickup_date": "2030-01-15",
            "pickup_time": "14:30",
            "pickup_location": "San Francisco Airport (SFO)",
            "dropoff_location": "1 Hotel SF, 8 Mission St",
            "total_price": 250.0,
        }

    def test_schema_block_inside_head(self):
        from email_service import render_confirmation_email
        html = render_confirmation_email(self._booking())
        # <head>...<script type="application/ld+json">...</script>...</head>
        m = re.search(
            r"<head>\s*<script type=\"application/ld\+json\">(.+?)</script>\s*</head>",
            html, re.S,
        )
        assert m, "JSON-LD script must live inside <head>"
        payload = json.loads(m.group(1))
        assert payload["@context"] == "http://schema.org"
        assert payload["@type"] == "Reservation"
        assert payload["reservationStatus"] == "http://schema.org/ReservationConfirmed"
        assert payload["reservationNumber"] == "TEL-TEST-25-A"
        assert payload["underName"]["@type"] == "Person"
        assert payload["underName"]["name"] == "Jane Customer"
        assert payload["reservationFor"]["@type"] == "Taxi"
        assert "TuranEliteLimo" in payload["reservationFor"]["name"]
        assert payload["pickupTime"].startswith("2030-01-15T14:30")
        assert payload["pickupLocation"]["@type"] == "Place"
        assert "SFO" in payload["pickupLocation"]["name"]
        assert payload["dropoffLocation"]["@type"] == "Place"
        assert "Mission" in payload["dropoffLocation"]["name"]
        assert payload["provider"]["@type"] == "Organization"
        assert payload["provider"]["name"] == "TuranEliteLimo"

    def test_no_cancel_keywords_outside_policy(self):
        """Ensures the structured reservationStatus is Confirmed (not Cancelled).
        Gmail picks the explicit @type=Reservation over scanning body text."""
        from email_service import render_confirmation_email
        html = render_confirmation_email(self._booking())
        # The schema block must NOT contain 'Cancelled'
        m = re.search(r"<script type=\"application/ld\+json\">(.+?)</script>", html, re.S)
        assert m
        assert "Cancelled" not in m.group(1)
        assert "ReservationConfirmed" in m.group(1)


class TestChauffeurAssignedEmail:
    """render_chauffeur_assigned_email must include driver fields + schema."""

    def _booking(self, **overrides):
        base = {
            "confirmation_number": "TEL-TEST-25-B",
            "full_name": "Bob Rider",
            "email": "bob@example.com",
            "vehicle_type": "Cadillac Escalade",
            "pickup_date": "2030-02-01",
            "pickup_time": "09:15",
            "pickup_location": "Palo Alto, CA",
            "dropoff_location": "SFO Terminal 2",
            "driver_name": "Aldo Volkov",
            "driver_phone": "+1 415 555 0100",
            "driver_plate": "7XYZ123",
            "driver_vehicle": "Mercedes S-Class · Black",
        }
        base.update(overrides)
        return base

    def test_renders_all_driver_fields_and_schema(self):
        from email_service import render_chauffeur_assigned_email
        html = render_chauffeur_assigned_email(self._booking())
        # Schema in head
        m = re.search(
            r"<head>\s*<script type=\"application/ld\+json\">(.+?)</script>\s*</head>",
            html, re.S,
        )
        assert m, "JSON-LD missing from <head>"
        payload = json.loads(m.group(1))
        assert payload["@type"] == "Reservation"
        assert payload["reservationStatus"] == "http://schema.org/ReservationConfirmed"
        assert payload["reservationNumber"] == "TEL-TEST-25-B"
        assert "Mercedes" in payload["reservationFor"]["name"]
        assert payload["pickupTime"].startswith("2030-02-01T09:15")

        # Visible fields
        assert "Aldo Volkov" in html
        assert "+1 415 555 0100" in html
        assert "7XYZ123" in html  # plate row shown
        assert "Mercedes S-Class" in html
        assert "2030-02-01" in html
        # Call + Text buttons present when phone exists
        assert "tel:+14155550100" in html  # cleaned phone
        assert "sms:+14155550100" in html
        assert "Call chauffeur" in html
        assert "Text chauffeur" in html

    def test_empty_plate_hides_plate_row(self):
        from email_service import render_chauffeur_assigned_email
        html = render_chauffeur_assigned_email(self._booking(driver_plate=""))
        # Plate label should not appear
        assert "7XYZ123" not in html
        # The Plate <td> conditional should be skipped
        # We look at the chauffeur details table — only Vehicle + Pickup labels expected
        assert ">Plate<" not in html

    def test_missing_phone_hides_call_text_buttons(self):
        from email_service import render_chauffeur_assigned_email
        html = render_chauffeur_assigned_email(self._booking(driver_phone=""))
        # Footer still has the dispatch tel: link — that's expected.
        # What MUST be gone is the per-driver Call/Text buttons + sms: link.
        assert "sms:" not in html
        assert "Call chauffeur" not in html
        assert "Text chauffeur" not in html
        # Should fall back to 'Contact via dispatch' for the driver phone row
        assert "Contact via dispatch" in html


# ============================================================== #
#  B. assign-driver endpoint                                     #
# ============================================================== #
class TestAssignDriverEndpoint:
    """POST /admin/bookings/{id}/assign-driver — driver_vehicle + notify_customer."""

    def test_requires_auth(self):
        r = requests.post(f"{API}/admin/bookings/{TEST_BOOKING_ID}/assign-driver", json={
            "driver_name": "X", "driver_phone": "+15551234567",
        }, timeout=15)
        assert r.status_code in (401, 403), r.status_code

    def test_assign_with_vehicle_skip_email(self, auth_headers):
        """notify_customer=false → no email sent; driver_vehicle persisted."""
        payload = {
            "driver_name": "TEST_Iter25 Driver",
            "driver_phone": "+15551239999",
            "driver_email": "",
            "driver_plate": "TST25A",
            "driver_vehicle": "Mercedes S-Class · Black",
            "notify_customer": False,
        }
        r = requests.post(
            f"{API}/admin/bookings/{TEST_BOOKING_ID}/assign-driver",
            json=payload, headers=auth_headers, timeout=20,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert body["ok"] is True
        assert body["driver_token"]
        assert "/driver/" in body["driver_url"]

        # GET booking via admin list and confirm persistence
        listing = requests.get(f"{API}/admin/bookings", headers=auth_headers, timeout=15)
        assert listing.status_code == 200
        rows = [b for b in listing.json() if b["id"] == TEST_BOOKING_ID]
        assert rows, "test booking missing from admin list"
        b = rows[0]
        assert b.get("driver_vehicle") == "Mercedes S-Class · Black"
        assert b.get("driver_name") == "TEST_Iter25 Driver"
        assert b.get("driver_plate") == "TST25A"  # upper-cased server-side
        assert b.get("driver_token")

    def test_default_notify_customer_is_true(self):
        """Pydantic model should default notify_customer=True even if omitted."""
        # Import server model directly to assert the default.
        from server import DriverAssignRequest
        m = DriverAssignRequest(driver_name="X", driver_phone="+15551234567")
        assert m.notify_customer is True
        assert m.driver_vehicle == ""

    def test_booking_response_includes_driver_vehicle_field(self, auth_headers):
        """Booking response shape must include driver_vehicle field key."""
        r = requests.get(f"{API}/admin/bookings", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert rows, "no bookings returned"
        # Every row should at least have the key (may be None)
        assert all("driver_vehicle" in row for row in rows), \
            "driver_vehicle missing from /admin/bookings response shape"

    def test_unassign_clears_driver_vehicle(self, auth_headers):
        # Make sure a driver is assigned first
        requests.post(
            f"{API}/admin/bookings/{TEST_BOOKING_ID}/assign-driver",
            json={
                "driver_name": "TEST_Iter25 Unassign",
                "driver_phone": "+15551231111",
                "driver_vehicle": "Lincoln Navigator",
                "driver_plate": "UNAS01",
                "notify_customer": False,
            },
            headers=auth_headers, timeout=15,
        )
        r = requests.delete(
            f"{API}/admin/bookings/{TEST_BOOKING_ID}/driver",
            headers=auth_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        # Verify cleared
        listing = requests.get(f"{API}/admin/bookings", headers=auth_headers, timeout=15)
        b = next(x for x in listing.json() if x["id"] == TEST_BOOKING_ID)
        assert not b.get("driver_vehicle"), f"driver_vehicle not cleared: {b.get('driver_vehicle')}"
        assert not b.get("driver_name")
        assert not b.get("driver_plate")
        assert not b.get("driver_token")
        assert not b.get("trip_status")


# ============================================================== #
#  C. Regression smoke (iter18-24 endpoints still reachable)     #
# ============================================================== #
class TestRegressionSmoke:
    """Make sure prior iteration endpoints still return their expected
    no-auth/auth status codes (does not re-validate full behavior)."""

    @pytest.mark.parametrize("path", [
        "/admin/bookings/abc/charge-wait-time",
        "/admin/bookings/abc/charge-damages",
        "/admin/bookings/abc/charge-mid-trip-stop",
        "/admin/bookings/abc/backfill-saved-card",
    ])
    def test_auth_required_endpoints_return_401_without_token(self, path):
        r = requests.post(f"{API}{path}", json={}, timeout=15)
        assert r.status_code in (401, 403), f"{path} -> {r.status_code}"

    def test_admin_refund_preview_auth_required(self):
        r = requests.get(f"{API}/admin/bookings/abc/refund-preview", timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_payments_refund_auth_required(self):
        r = requests.post(f"{API}/admin/payments/abc/refund", json={}, timeout=15)
        assert r.status_code in (401, 403)

    def test_quote_endpoint_with_additional_stops(self):
        # Iter18 routed-detour math regression
        body = {
            "pickup_location": "SFO Airport, San Francisco, CA",
            "dropoff_location": "Palo Alto, CA",
            "service_type": "Airport Transfer",
            "passengers": 2,
            "additional_stops": ["San Mateo, CA"],
        }
        r = requests.post(f"{API}/quote", json=body, timeout=30)
        # Quote may 200 (normal) or 400 (geo error) — both prove the route exists.
        assert r.status_code in (200, 400), f"{r.status_code} {r.text[:200]}"

    def test_driver_view_endpoint(self):
        # /driver/{token} should respond even for invalid token (404).
        r = requests.get(f"{API}/driver/INVALID_TOKEN_X", timeout=15)
        assert r.status_code in (404, 401)
