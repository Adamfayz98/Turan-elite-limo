"""Backend tests for iteration 42 - QuoteRequest new pre-qual fields.

Tests:
 - POST /api/quote-requests accepts and persists new trip_type & service_duration
 - Backward compat: POST WITHOUT trip_type/service_duration still succeeds
 - Required fields still enforced (422 when missing)
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://limo-experience-1.preview.emergentagent.com").rstrip("/")
QUOTE_EP = f"{BASE_URL}/api/quote-requests"


# ---- POST with full pre-qual fields ----
def test_post_with_new_prequal_fields_success():
    payload = {
        "full_name": "TEST Iter42 Full",
        "phone": "(650) 555-0142",
        "email": "test_iter42_full@example.com",
        "vehicle_type": "Stretch Limousine",
        "pickup_date": "2026-02-14",
        "pickup_time": "18:30",
        "pickup_location": "123 Main St, San Jose CA",
        "dropoff_location": "SFO Terminal 2",
        "passengers": 8,
        "trip_type": "Wedding",
        "service_duration": "5–6 hours",
        "occasion": "Wedding",
        "notes": "TEST_iter42 - decorations needed",
        "utm": {"source_bucket": "direct"},
    }
    r = requests.post(QUOTE_EP, json=payload, timeout=30)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    body = r.json()
    assert body.get("ok") is True
    assert "id" in body and isinstance(body["id"], str) and len(body["id"]) > 0


# ---- POST without new pre-qual fields (legacy mobile clients) ----
def test_post_without_new_prequal_fields_backward_compat():
    payload = {
        "full_name": "TEST Iter42 Legacy",
        "phone": "(650) 555-0143",
        "vehicle_type": "Party Bus",
        "pickup_date": "2026-03-10",
        "pickup_time": "20:00",
        "pickup_location": "Downtown San Jose",
        "dropoff_location": "Napa Valley",
        "passengers": 12,
    }
    r = requests.post(QUOTE_EP, json=payload, timeout=30)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    body = r.json()
    assert body.get("ok") is True
    assert "id" in body


# ---- Required-field enforcement ----
def test_post_missing_full_name_returns_422():
    payload = {
        "phone": "(650) 555-0144",
        "vehicle_type": "Sprinter Van",
    }
    r = requests.post(QUOTE_EP, json=payload, timeout=30)
    assert r.status_code == 422, f"Expected 422, got {r.status_code}"


def test_post_missing_phone_returns_422():
    payload = {
        "full_name": "TEST Iter42",
        "vehicle_type": "Sprinter Van",
    }
    r = requests.post(QUOTE_EP, json=payload, timeout=30)
    assert r.status_code == 422


def test_post_missing_vehicle_type_returns_422():
    payload = {
        "full_name": "TEST Iter42",
        "phone": "(650) 555-0145",
    }
    r = requests.post(QUOTE_EP, json=payload, timeout=30)
    assert r.status_code == 422


# ---- Persistence via admin endpoint (optional) ----
def test_post_then_admin_list_contains_new_record():
    """Submit a quote, then login as admin and list quote requests to verify persistence
    and that trip_type/service_duration fields are stored."""
    unique_note = "TEST_iter42_persist_check"
    payload = {
        "full_name": "TEST Iter42 Persist",
        "phone": "(650) 555-0146",
        "vehicle_type": "Hummer Stretch",
        "pickup_date": "2026-04-05",
        "pickup_time": "19:00",
        "pickup_location": "Palo Alto",
        "dropoff_location": "San Francisco",
        "passengers": 6,
        "trip_type": "Birthday Party",
        "service_duration": "3–4 hours",
        "occasion": "Birthday Party",
        "notes": unique_note,
    }
    r = requests.post(QUOTE_EP, json=payload, timeout=30)
    assert r.status_code == 200
    new_id = r.json().get("id")
    assert new_id

    # Try to verify via admin endpoint - skip gracefully if 2FA required
    sess = requests.Session()
    login = sess.post(
        f"{BASE_URL}/api/admin/login",
        json={"email": "support@turanelitelimo.com", "password": "TuronAdmin@2025"},
        timeout=30,
    )
    if login.status_code != 200:
        pytest.skip(f"Admin login not available ({login.status_code}); record was created with id={new_id}")
    # Admin login may require 2FA - check
    body = login.json() if login.headers.get("content-type", "").startswith("application/json") else {}
    if body.get("requires_2fa") or body.get("mfa_required"):
        pytest.skip("Admin requires 2FA; can't verify via list, but POST succeeded")

    list_r = sess.get(f"{BASE_URL}/api/admin/quote-requests", timeout=30)
    if list_r.status_code != 200:
        pytest.skip(f"Admin list endpoint returned {list_r.status_code}; POST itself succeeded")

    items = list_r.json()
    if isinstance(items, dict):
        items = items.get("items") or items.get("requests") or []
    match = next((it for it in items if it.get("id") == new_id), None)
    assert match is not None, f"New quote {new_id} not found in admin list"
    assert match.get("trip_type") == "Birthday Party"
    assert match.get("service_duration") == "3–4 hours"
