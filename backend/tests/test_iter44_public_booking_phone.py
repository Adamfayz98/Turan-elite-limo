"""Iteration 44 — verify GET /api/bookings/{id}/public includes `phone`
field (added for Google Ads Enhanced Conversions). Also asserts no
regression on existing public booking fields."""

import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://limo-experience-1.preview.emergentagent.com").rstrip("/")
SEED_BID = "9fb00287-2154-4178-81fd-11c16a4f8a32"


def test_public_booking_returns_phone_field():
    r = requests.get(f"{BASE_URL}/api/bookings/{SEED_BID}/public", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    # NEW field — must be present and equal seed value
    assert "phone" in data, "phone field missing from public booking response"
    assert data["phone"] == "+16504100687"
    # Existing fields that must continue to work
    assert data["email"] == "t@t.com"
    assert data["id"] == SEED_BID
    assert data["confirmation_number"] == "TEST-RFND"
    assert data["payment_status"] == "paid"


def test_public_booking_preserves_all_existing_fields():
    r = requests.get(f"{BASE_URL}/api/bookings/{SEED_BID}/public", timeout=15)
    assert r.status_code == 200
    data = r.json()
    expected_keys = {
        "id", "confirmation_number", "status", "payment_status", "full_name",
        "email", "phone", "service_type", "vehicle_type", "pickup_date",
        "pickup_time", "pickup_location", "dropoff_location", "passengers",
        "luggage_count", "child_seat", "return_trip", "return_location",
        "additional_stops", "quote_amount", "deposit_amount",
        "deposit_percent", "currency", "paid_amount", "driver_name",
        "trip_status", "manage_token",
    }
    missing = expected_keys - set(data.keys())
    assert not missing, f"Missing keys in public booking response: {missing}"
    # MongoDB ObjectId must not leak
    assert "_id" not in data


def test_public_booking_404_for_unknown_id():
    r = requests.get(f"{BASE_URL}/api/bookings/does-not-exist-xyz/public", timeout=15)
    assert r.status_code == 404
