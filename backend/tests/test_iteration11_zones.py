"""Iteration 11: Zone Surcharges + domain swap regression tests."""
import os
import sys
import uuid
import bcrypt
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://limo-experience-1.preview.emergentagent.com").rstrip("/")
# Backend .env credentials
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
ADMIN_EMAIL = "turonlimosupport@gmail.com"
ADMIN_PASSWORD = "TuronAdmin@2025"


@pytest.fixture(scope="module")
def mongo_db():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


@pytest.fixture(scope="module")
def admin_token(mongo_db):
    # Step 1: trigger login (sends 2FA), then bypass by inserting a known challenge
    r = requests.post(f"{BASE_URL}/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    # Insert fresh challenge with bcrypt('123456')
    cid = str(uuid.uuid4())
    code_hash = bcrypt.hashpw(b"123456", bcrypt.gensalt()).decode()
    mongo_db.admin_2fa_challenges.insert_one({
        "challenge_id": cid,
        "admin_email": ADMIN_EMAIL,
        "code_hash": code_hash,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        "attempts": 0, "used": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    v = requests.post(f"{BASE_URL}/api/admin/verify-2fa", json={"challenge_id": cid, "code": "123456"}, timeout=20)
    assert v.status_code == 200, f"verify-2fa failed: {v.status_code} {v.text}"
    return v.json()["token"]


@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- /api/quote zone surcharge ----------
class TestQuoteSurcharge:
    def test_healdsburg_zone_applies_65(self):
        r = requests.post(f"{BASE_URL}/api/quote", json={
            "pickup_location": "Healdsburg, CA",
            "dropoff_location": "Geyserville, CA",
        }, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("surcharge_applied") is not None, f"no surcharge: {d}"
        s = d["surcharge_applied"]
        assert s["zone_name"] == "Healdsburg & North Sonoma"
        assert s["amount"] == 65.0
        assert s["threshold_miles"] == 20.0
        assert "reason" in s and len(s["reason"]) > 10
        # Stretch/Sprinter/Party Bus → 'Call for quote'
        for q in d["quotes"]:
            if q["vehicle_type"] in ("Stretch Limousine", "Sprinter Van", "Party Bus"):
                assert q.get("message") == "Call for quote"
                assert q.get("price") is None
            else:
                assert q.get("price") is not None
                assert q.get("price") > 65, q

    def test_calistoga_zone_applies_55(self):
        r = requests.post(f"{BASE_URL}/api/quote", json={
            "pickup_location": "Calistoga, CA",
            "dropoff_location": "Saint Helena, CA",
        }, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("surcharge_applied") is not None, d
        assert d["surcharge_applied"]["zone_name"] == "Calistoga & Upper Napa"
        assert d["surcharge_applied"]["amount"] == 55.0

    def test_no_zone_match_returns_null(self):
        r = requests.post(f"{BASE_URL}/api/quote", json={
            "pickup_location": "SFO, San Francisco, CA",
            "dropoff_location": "Four Seasons San Francisco",
        }, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("surcharge_applied") is None, d

    def test_long_distance_exceeds_threshold(self):
        r = requests.post(f"{BASE_URL}/api/quote", json={
            "pickup_location": "Healdsburg, CA",
            "dropoff_location": "Sacramento, CA",
        }, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("surcharge_applied") is None, d
        assert d.get("distance_miles", 0) > 20

    def test_hourly_mode_bypasses_surcharge(self):
        r = requests.post(f"{BASE_URL}/api/quote", json={
            "pickup_location": "Healdsburg, CA",
            "dropoff_location": "Geyserville, CA",
            "service_type": "Hourly Chauffeur",
            "hours": 4,
        }, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("pricing_mode") == "hourly"
        assert d.get("surcharge_applied") is None

    def test_bay_area_distance_regression(self):
        r = requests.post(f"{BASE_URL}/api/quote", json={
            "pickup_location": "San Jose, CA",
            "dropoff_location": "San Francisco, CA",
        }, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("distance_miles") is not None and d["distance_miles"] > 30


# ---------- /api/admin/zones CRUD ----------
class TestAdminZonesCRUD:
    def test_list_seeded_zones(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/admin/zones", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        rows = r.json()
        names = [z["name"] for z in rows]
        assert "Healdsburg & North Sonoma" in names
        assert "Calistoga & Upper Napa" in names
        # Schema check
        for z in rows:
            assert "id" in z and "keywords" in z and "surcharge_amount" in z
            assert "short_distance_threshold_miles" in z and "enabled" in z

    def test_list_zones_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/zones", timeout=20)
        assert r.status_code == 401

    def test_create_zone_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/admin/zones", json={"name": "X"}, timeout=20)
        assert r.status_code == 401

    def test_patch_zone_requires_auth(self):
        r = requests.patch(f"{BASE_URL}/api/admin/zones/abc", json={"enabled": False}, timeout=20)
        assert r.status_code == 401

    def test_delete_zone_requires_auth(self):
        r = requests.delete(f"{BASE_URL}/api/admin/zones/abc", timeout=20)
        assert r.status_code == 401

    def test_full_crud_lifecycle(self, auth_headers, mongo_db):
        # Create
        name = f"TEST_ZONE_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{BASE_URL}/api/admin/zones", headers=auth_headers, json={
            "name": name,
            "keywords": ["TestKeywordZZZ"],
            "surcharge_amount": 42.0,
            "short_distance_threshold_miles": 15.0,
            "reason": "Test zone reason",
            "enabled": True,
        }, timeout=20)
        assert r.status_code == 200, r.text
        zone = r.json()
        zid = zone["id"]
        assert zone["surcharge_amount"] == 42.0
        assert "testkeywordzzz" in zone["keywords"]  # lowercased

        # Duplicate name -> 409
        r2 = requests.post(f"{BASE_URL}/api/admin/zones", headers=auth_headers, json={
            "name": name, "keywords": [], "surcharge_amount": 1.0,
        }, timeout=20)
        assert r2.status_code == 409

        # PATCH surcharge amount
        r3 = requests.patch(f"{BASE_URL}/api/admin/zones/{zid}", headers=auth_headers,
                            json={"surcharge_amount": 88.0}, timeout=20)
        assert r3.status_code == 200
        assert r3.json()["surcharge_amount"] == 88.0

        # DELETE -> cleanup
        r4 = requests.delete(f"{BASE_URL}/api/admin/zones/{zid}", headers=auth_headers, timeout=20)
        assert r4.status_code == 200

        # Verify gone in DB
        gone = mongo_db.zone_surcharges.find_one({"id": zid})
        assert gone is None

    def test_patch_disabled_zone_skips_surcharge(self, auth_headers, mongo_db):
        # Find Healdsburg zone
        z = mongo_db.zone_surcharges.find_one({"name": "Healdsburg & North Sonoma"})
        assert z is not None
        zid = z["id"]
        try:
            # Disable
            r = requests.patch(f"{BASE_URL}/api/admin/zones/{zid}", headers=auth_headers,
                               json={"enabled": False}, timeout=20)
            assert r.status_code == 200
            assert r.json()["enabled"] is False

            # Now quote should NOT have surcharge
            q = requests.post(f"{BASE_URL}/api/quote", json={
                "pickup_location": "Healdsburg, CA",
                "dropoff_location": "Geyserville, CA",
            }, timeout=30)
            assert q.status_code == 200
            assert q.json().get("surcharge_applied") is None
        finally:
            # RESTORE — re-enable Healdsburg zone
            requests.patch(f"{BASE_URL}/api/admin/zones/{zid}", headers=auth_headers,
                           json={"enabled": True, "surcharge_amount": 65.0,
                                 "short_distance_threshold_miles": 20.0}, timeout=20)

    def test_patch_amount_reflected_in_quote(self, auth_headers, mongo_db):
        z = mongo_db.zone_surcharges.find_one({"name": "Calistoga & Upper Napa"})
        assert z is not None
        zid = z["id"]
        original_amt = z["surcharge_amount"]
        try:
            r = requests.patch(f"{BASE_URL}/api/admin/zones/{zid}", headers=auth_headers,
                               json={"surcharge_amount": 99.0}, timeout=20)
            assert r.status_code == 200
            q = requests.post(f"{BASE_URL}/api/quote", json={
                "pickup_location": "Calistoga, CA",
                "dropoff_location": "Saint Helena, CA",
            }, timeout=30)
            assert q.json()["surcharge_applied"]["amount"] == 99.0
        finally:
            requests.patch(f"{BASE_URL}/api/admin/zones/{zid}", headers=auth_headers,
                           json={"surcharge_amount": original_amt}, timeout=20)


# ---------- Domain / SEO regression ----------
class TestDomainSwap:
    def test_robots_txt(self):
        r = requests.get(f"{BASE_URL}/robots.txt", timeout=20)
        assert r.status_code == 200
        assert "www.turanelitelimo.com" in r.text

    def test_sitemap_xml(self):
        r = requests.get(f"{BASE_URL}/sitemap.xml", timeout=20)
        assert r.status_code == 200
        assert "www.turanelitelimo.com" in r.text


# ---------- _compute_quote_amount applies surcharge in checkout ----------
class TestCheckoutAppliesSurcharge:
    def test_confirmed_zone_booking_includes_surcharge(self, auth_headers, mongo_db):
        # Create booking
        b = requests.post(f"{BASE_URL}/api/bookings", json={
            "full_name": "TEST_Zone Customer",
            "email": "test_zone@example.com",
            "phone": "+15551234567",
            "service_type": "Airport Transfer",
            "pickup_date": "2026-06-01",
            "pickup_time": "10:00",
            "pickup_location": "Healdsburg, CA",
            "dropoff_location": "Geyserville, CA",
            "passengers": 2,
            "luggage_count": 1,
            "vehicle_type": "Executive Sedan",
        }, timeout=30)
        assert b.status_code == 200, b.text
        bid = b.json()["id"]
        try:
            # Confirm -> snapshots quote_amount via _compute_quote_amount
            r = requests.patch(f"{BASE_URL}/api/admin/bookings/{bid}",
                               headers=auth_headers,
                               json={"status": "confirmed"}, timeout=30)
            assert r.status_code == 200, r.text
            # Read quote_amount from DB
            booking_doc = mongo_db.bookings.find_one({"id": bid})
            assert booking_doc is not None
            qamt = booking_doc.get("quote_amount")
            assert qamt is not None and qamt > 65, f"quote_amount missing or no surcharge: {qamt}"
        finally:
            mongo_db.bookings.delete_one({"id": bid})
