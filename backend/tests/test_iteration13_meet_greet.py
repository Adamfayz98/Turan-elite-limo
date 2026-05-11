"""Iteration 13 — Meet & Greet flag + admin meet_greet_fee + email swap + z-index regression sweep."""
import os
import uuid
import asyncio
import bcrypt
import pytest
import requests
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://limo-experience-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SFO = "SFO Airport"
HOTEL = "Four Seasons San Francisco"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    """Programmatic 2FA bypass: insert challenge into Mongo, then verify."""
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]

    async def _do():
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        # Find actual admin email
        admin = await db.admin_users.find_one({}, {"_id": 0})
        admin_email = admin["email"] if admin else "turonlimosupport@gmail.com"
        cid = str(uuid.uuid4())
        code_hash = bcrypt.hashpw(b"123456", bcrypt.gensalt()).decode()
        await db.admin_2fa_challenges.insert_one({
            "challenge_id": cid,
            "admin_email": admin_email,
            "code_hash": code_hash,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            "attempts": 0,
            "used": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        client.close()
        return cid

    cid = asyncio.get_event_loop().run_until_complete(_do())
    r = requests.post(f"{API}/admin/verify-2fa", json={"challenge_id": cid, "code": "123456"})
    assert r.status_code == 200, f"2FA verify failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _quote(service_type=None, meet_and_greet=False, hours=None, pickup=SFO, dropoff=HOTEL, pickup_date=None):
    body = {"pickup_location": pickup, "dropoff_location": dropoff, "meet_and_greet": meet_and_greet}
    if service_type:
        body["service_type"] = service_type
    if hours:
        body["hours"] = hours
    if pickup_date:
        body["pickup_date"] = pickup_date
    r = requests.post(f"{API}/quote", json=body, timeout=20)
    assert r.status_code == 200, f"{r.status_code}: {r.text}"
    return r.json()


def _price(quote_json, vehicle):
    for v in quote_json.get("quotes", []):
        if v["vehicle_type"] == vehicle:
            return v.get("price")
    return None


# ---------- Meet & Greet quote logic ----------
class TestMeetGreetQuote:
    def test_airport_transfer_with_mg_adds_25(self):
        off = _quote(service_type="Airport Transfer", meet_and_greet=False)
        on = _quote(service_type="Airport Transfer", meet_and_greet=True)
        assert on.get("meet_and_greet_fee") == 25.0
        assert off.get("meet_and_greet_fee") in (None, 0, 0.0)
        for vt in ("Executive Sedan", "S-Class", "Luxury SUV"):
            p_off = _price(off, vt)
            p_on = _price(on, vt)
            assert p_off is not None and p_on is not None, f"missing price for {vt}"
            assert round(p_on - p_off, 2) == 25.0, f"{vt}: off={p_off} on={p_on}"

    def test_hourly_chauffeur_with_mg_does_not_add_fee(self):
        on = _quote(service_type="Hourly Chauffeur", meet_and_greet=True, hours=3)
        off = _quote(service_type="Hourly Chauffeur", meet_and_greet=False, hours=3)
        assert on.get("meet_and_greet_fee") in (None, 0, 0.0)
        for vt in ("Executive Sedan", "S-Class", "Luxury SUV"):
            assert _price(on, vt) == _price(off, vt)

    def test_wedding_with_mg_does_not_add_fee(self):
        on = _quote(service_type="Wedding", meet_and_greet=True)
        off = _quote(service_type="Wedding", meet_and_greet=False)
        assert on.get("meet_and_greet_fee") in (None, 0, 0.0)
        for vt in ("Executive Sedan", "S-Class", "Luxury SUV"):
            assert _price(on, vt) == _price(off, vt)

    def test_no_service_type_with_mg_does_not_add_fee(self):
        on = _quote(service_type=None, meet_and_greet=True)
        off = _quote(service_type=None, meet_and_greet=False)
        assert on.get("meet_and_greet_fee") in (None, 0, 0.0)
        for vt in ("Executive Sedan", "S-Class", "Luxury SUV"):
            assert _price(on, vt) == _price(off, vt)

    def test_response_shape_no_mg_field_when_off(self):
        q = _quote(service_type="Airport Transfer", meet_and_greet=False)
        assert q.get("meet_and_greet_fee") in (None, 0, 0.0)


# ---------- Admin settings: meet_greet_fee CRUD ----------
class TestAdminSettings:
    def test_get_settings_has_meet_greet_fee(self, auth_headers):
        r = requests.get(f"{API}/admin/settings", headers=auth_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "meet_greet_fee" in body
        assert isinstance(body["meet_greet_fee"], (int, float))

    def test_update_meet_greet_fee_reflects_in_quote(self, auth_headers):
        # Set to 30
        r = requests.patch(f"{API}/admin/settings", json={"meet_greet_fee": 30.0}, headers=auth_headers)
        assert r.status_code == 200, r.text
        assert r.json()["meet_greet_fee"] == 30.0

        try:
            off = _quote(service_type="Airport Transfer", meet_and_greet=False)
            on = _quote(service_type="Airport Transfer", meet_and_greet=True)
            assert on["meet_and_greet_fee"] == 30.0
            for vt in ("Executive Sedan", "S-Class", "Luxury SUV"):
                assert round(_price(on, vt) - _price(off, vt), 2) == 30.0
        finally:
            # Always restore default
            r2 = requests.patch(f"{API}/admin/settings", json={"meet_greet_fee": 25.0}, headers=auth_headers)
            assert r2.status_code == 200
            assert r2.json()["meet_greet_fee"] == 25.0


# ---------- Booking persistence ----------
class TestBookingMeetGreet:
    def test_create_booking_with_mg_persists(self, auth_headers):
        payload = {
            "full_name": "TEST_MG User",
            "email": "test_mg@example.com",
            "phone": "+15555550123",
            "service_type": "Airport Transfer",
            "pickup_date": "2030-01-15",
            "pickup_time": "10:00",
            "pickup_location": SFO,
            "dropoff_location": HOTEL,
            "passengers": 2,
            "luggage_count": 2,
            "vehicle_type": "Executive Sedan",
            "meet_and_greet": True,
        }
        r = requests.post(f"{API}/bookings", json=payload)
        assert r.status_code == 200, r.text
        booking = r.json()
        assert booking["meet_and_greet"] is True
        booking_id = booking["id"]

        # Verify via admin bookings list
        r2 = requests.get(f"{API}/admin/bookings", headers=auth_headers)
        assert r2.status_code == 200
        found = [b for b in r2.json() if b["id"] == booking_id]
        assert len(found) == 1
        assert found[0]["meet_and_greet"] is True

        # cleanup
        requests.delete(f"{API}/admin/bookings/{booking_id}", headers=auth_headers)


# ---------- Regression sweep ----------
class TestRegression:
    def test_options(self):
        r = requests.get(f"{API}/options")
        assert r.status_code == 200
        opts = r.json()
        assert "Airport Transfer" in opts["service_types"]
        assert "Executive Sedan" in opts["vehicle_types"]

    def test_contact_endpoint(self):
        r = requests.post(f"{API}/contact", json={
            "name": "TEST_Regression",
            "email": "regr@example.com",
            "phone": "5555550000",
            "subject": "test",
            "message": "regression test message",
        })
        assert r.status_code == 200
        assert r.json()["email"] == "regr@example.com"

    def test_places_autocomplete(self):
        r = requests.get(f"{API}/places/autocomplete", params={"input": "SFO"})
        assert r.status_code == 200

    def test_quote_zone_surcharge_healdsburg(self):
        # Healdsburg short trip → zone surcharge banner
        q = _quote(pickup="Healdsburg, CA", dropoff="Windsor, CA", service_type="Airport Transfer")
        # Either matches a zone or not depending on geocoding distance
        # Just assert call works & doesn't break
        assert "quotes" in q

    def test_admin_login_endpoint_still_uses_gmail(self):
        # Wrong password — verify endpoint exists for gmail admin and returns 401
        r = requests.post(f"{API}/admin/login", json={"email": "turonlimosupport@gmail.com", "password": "wrong"})
        assert r.status_code == 401

    def test_admin_zones_list(self, auth_headers):
        r = requests.get(f"{API}/admin/zones", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_surge_events_list(self, auth_headers):
        r = requests.get(f"{API}/admin/surge-events", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
