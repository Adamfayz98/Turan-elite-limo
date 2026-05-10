"""Iteration 12 — Surge calendar + Hourly minimum bug.
Tests:
- /api/quote hourly minimum (hours<2 → fallback, message, no prices)
- /api/quote hourly hours>=2 → priced
- /api/admin/surge-events CRUD with 2FA-bypass admin token
- /api/quote surge_applied multiplier / flat_surcharge / outside-window
- Combined hourly + surge
- Zone + surge stacking
- Auth required on /admin/surge-events
"""
import os
import uuid
import asyncio
import bcrypt
from datetime import datetime, timezone, timedelta, date

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or os.environ.get(
    "BACKEND_PUBLIC_URL", ""
).rstrip("/")

# Fallback to reading from frontend/.env when env vars aren't exported
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

ADMIN_EMAIL = "turonlimosupport@gmail.com"
ADMIN_PASSWORD = "TuronAdmin@2025"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
# Load from backend/.env if not set
if "MONGO_URL" not in os.environ or "DB_NAME" not in os.environ:
    try:
        with open("/app/backend/.env") as f:
            for ln in f:
                if ln.startswith("MONGO_URL=") and "MONGO_URL" not in os.environ:
                    MONGO_URL = ln.split("=", 1)[1].strip().strip('"')
                if ln.startswith("DB_NAME=") and "DB_NAME" not in os.environ:
                    DB_NAME = ln.split("=", 1)[1].strip().strip('"')
    except Exception:
        pass


# ---------- Helpers / fixtures ----------
def _insert_2fa_challenge_sync(admin_email: str) -> str:
    """Insert a known-code 2FA challenge directly so we can call /verify-2fa."""
    async def _go():
        cli = AsyncIOMotorClient(MONGO_URL)
        db = cli[DB_NAME]
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
        cli.close()
        return cid
    return asyncio.get_event_loop().run_until_complete(_go()) if False else asyncio.run(_go())


@pytest.fixture(scope="session")
def admin_token():
    cid = _insert_2fa_challenge_sync(ADMIN_EMAIL)
    r = requests.post(f"{BASE_URL}/api/admin/verify-2fa",
                      json={"challenge_id": cid, "code": "123456"}, timeout=15)
    assert r.status_code == 200, f"verify-2fa failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_events():
    """Remove any leftover TEST_ surge events both before and after the suite."""
    async def _go():
        cli = AsyncIOMotorClient(MONGO_URL)
        db = cli[DB_NAME]
        await db.surge_events.delete_many({"name": {"$regex": "^TEST_"}})
        cli.close()
    asyncio.run(_go())
    yield
    asyncio.run(_go())


# ---------- 1) Hourly Chauffeur min-hours bug ----------
class TestHourlyMinimum:
    def test_hourly_with_1_hour_returns_no_prices_and_message(self):
        r = requests.post(f"{BASE_URL}/api/quote", json={
            "pickup_location": "SFO",
            "dropoff_location": "Napa",
            "service_type": "Hourly Chauffeur",
            "hours": 1,
        }, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["pricing_mode"] == "hourly"
        assert body["fallback"] is True
        assert body.get("hours") == 1
        for q in body["quotes"]:
            assert q.get("price") in (None, 0) or q.get("price") is None
            # Backend explicitly sets message
            assert q.get("message") == "Minimum 2 hours required", q

    def test_hourly_with_2_hours_returns_prices(self):
        r = requests.post(f"{BASE_URL}/api/quote", json={
            "pickup_location": "SFO",
            "dropoff_location": "Napa",
            "service_type": "Hourly Chauffeur",
            "hours": 2,
        }, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["pricing_mode"] == "hourly"
        assert body.get("hours") == 2
        assert body.get("included_miles") == 40
        priced = [q for q in body["quotes"] if q.get("price") is not None]
        assert len(priced) >= 3, f"Expected ≥3 priced vehicles, got {priced}"


# ---------- 2) Surge events CRUD ----------
class TestSurgeEventsCRUD:
    def test_unauth_returns_401(self):
        assert requests.get(f"{BASE_URL}/api/admin/surge-events", timeout=10).status_code == 401
        assert requests.post(f"{BASE_URL}/api/admin/surge-events", json={
            "name": "TEST_x", "start_date": "2026-06-01", "end_date": "2026-06-02"
        }, timeout=10).status_code == 401
        assert requests.patch(f"{BASE_URL}/api/admin/surge-events/abc", json={"name": "x"}, timeout=10).status_code == 401
        assert requests.delete(f"{BASE_URL}/api/admin/surge-events/abc", timeout=10).status_code == 401

    def test_create_get_patch_delete_flow(self, admin_headers):
        # CREATE
        payload = {
            "name": "TEST_BottleRock",
            "start_date": "2026-05-22",
            "end_date": "2026-05-24",
            "pricing_type": "multiplier",
            "multiplier": 1.5,
            "reason": "BottleRock festival weekend",
            "enabled": True,
        }
        r = requests.post(f"{BASE_URL}/api/admin/surge-events",
                          json=payload, headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        ev = r.json()
        assert ev["name"] == payload["name"]
        assert ev["multiplier"] == 1.5
        assert ev["pricing_type"] == "multiplier"
        eid = ev["id"]

        # bad date range
        bad = requests.post(f"{BASE_URL}/api/admin/surge-events", json={
            **payload, "name": "TEST_Bad", "start_date": "2026-06-10", "end_date": "2026-06-01"
        }, headers=admin_headers, timeout=15)
        assert bad.status_code == 400, bad.text

        # LIST sorted by start_date
        r = requests.get(f"{BASE_URL}/api/admin/surge-events", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        ids = [x["id"] for x in rows]
        assert eid in ids
        dates = [x["start_date"] for x in rows]
        assert dates == sorted(dates), f"Not sorted by start_date: {dates}"

        # PATCH name + dates
        r = requests.patch(f"{BASE_URL}/api/admin/surge-events/{eid}", json={
            "name": "TEST_BottleRock-v2", "multiplier": 1.75
        }, headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["multiplier"] == 1.75

        # PATCH bad date range
        r = requests.patch(f"{BASE_URL}/api/admin/surge-events/{eid}", json={
            "start_date": "2026-08-01", "end_date": "2026-07-01"
        }, headers=admin_headers, timeout=15)
        assert r.status_code == 400

        # DELETE
        r = requests.delete(f"{BASE_URL}/api/admin/surge-events/{eid}",
                            headers=admin_headers, timeout=15)
        assert r.status_code == 200
        # GET to confirm deletion
        r = requests.get(f"{BASE_URL}/api/admin/surge-events", headers=admin_headers, timeout=15)
        assert eid not in [x["id"] for x in r.json()]


# ---------- 3) Surge applied to /quote ----------
class TestSurgeAppliedToQuote:
    def _create(self, headers, **overrides):
        payload = {
            "name": "TEST_QSurge",
            "start_date": "2026-09-01",
            "end_date": "2026-09-30",
            "pricing_type": "multiplier",
            "multiplier": 2.0,
            "flat_surcharge": 0.0,
            "reason": "Test surge",
            "enabled": True,
        }
        payload.update(overrides)
        r = requests.post(f"{BASE_URL}/api/admin/surge-events",
                          json=payload, headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        return r.json()

    def _delete(self, headers, eid):
        requests.delete(f"{BASE_URL}/api/admin/surge-events/{eid}",
                        headers=headers, timeout=10)

    def _base_quote(self, pickup_date=None):
        body = {
            "pickup_location": "San Francisco, CA",
            "dropoff_location": "Napa, CA",
            "service_type": "Airport Transfer",
        }
        if pickup_date:
            body["pickup_date"] = pickup_date
        r = requests.post(f"{BASE_URL}/api/quote", json=body, timeout=45)
        assert r.status_code == 200, r.text
        return r.json()

    def test_multiplier_applied_inside_window(self, admin_headers):
        # Get baseline first
        base = self._base_quote()
        base_prices = {q["vehicle_type"]: q.get("price") for q in base["quotes"] if q.get("price")}
        assert base_prices, "No baseline prices"

        ev = self._create(admin_headers, name="TEST_Mult", start_date="2026-09-10", end_date="2026-09-12", multiplier=1.5)
        try:
            inside = self._base_quote(pickup_date="2026-09-11")
            assert inside.get("surge_applied") is not None
            sa = inside["surge_applied"]
            assert sa["event_name"] == "TEST_Mult"
            assert sa["pricing_type"] == "multiplier"
            assert abs(sa["multiplier"] - 1.5) < 1e-6
            # Verify priced cars roughly doubled... err, 1.5x
            for q in inside["quotes"]:
                vt = q["vehicle_type"]
                if vt in base_prices and q.get("price") is not None:
                    expected = round(base_prices[vt] * 1.5, 2)
                    assert abs(q["price"] - expected) < 0.6, f"{vt}: expected ~{expected}, got {q['price']}"
        finally:
            self._delete(admin_headers, ev["id"])

    def test_flat_surcharge_applied(self, admin_headers):
        base = self._base_quote()
        base_prices = {q["vehicle_type"]: q.get("price") for q in base["quotes"] if q.get("price")}

        ev = self._create(admin_headers, name="TEST_Flat", start_date="2026-10-10", end_date="2026-10-12",
                          pricing_type="flat_surcharge", multiplier=1.0, flat_surcharge=50.0)
        try:
            inside = self._base_quote(pickup_date="2026-10-11")
            sa = inside["surge_applied"]
            assert sa is not None
            assert sa["pricing_type"] == "flat_surcharge"
            assert abs(sa["flat_surcharge"] - 50.0) < 1e-6
            for q in inside["quotes"]:
                vt = q["vehicle_type"]
                if vt in base_prices and q.get("price") is not None:
                    expected = round(base_prices[vt] + 50.0, 2)
                    assert abs(q["price"] - expected) < 0.6, f"{vt}: expected {expected}, got {q['price']}"
        finally:
            self._delete(admin_headers, ev["id"])

    def test_outside_window_no_surge(self, admin_headers):
        ev = self._create(admin_headers, name="TEST_Out", start_date="2026-11-10", end_date="2026-11-12", multiplier=2.0)
        try:
            outside = self._base_quote(pickup_date="2026-11-20")
            assert outside.get("surge_applied") is None
        finally:
            self._delete(admin_headers, ev["id"])

    def test_disabled_event_not_applied(self, admin_headers):
        ev = self._create(admin_headers, name="TEST_Disabled", start_date="2026-12-10", end_date="2026-12-12",
                          multiplier=2.0, enabled=False)
        try:
            res = self._base_quote(pickup_date="2026-12-11")
            assert res.get("surge_applied") is None
        finally:
            self._delete(admin_headers, ev["id"])

    def test_hourly_surge_applied(self, admin_headers):
        # baseline hourly
        r = requests.post(f"{BASE_URL}/api/quote", json={
            "pickup_location": "SFO", "dropoff_location": "Napa",
            "service_type": "Hourly Chauffeur", "hours": 3,
        }, timeout=20)
        base = r.json()
        base_prices = {q["vehicle_type"]: q.get("price") for q in base["quotes"] if q.get("price")}

        ev = self._create(admin_headers, name="TEST_HourlySurge", start_date="2026-07-10",
                          end_date="2026-07-12", multiplier=2.0)
        try:
            r2 = requests.post(f"{BASE_URL}/api/quote", json={
                "pickup_location": "SFO", "dropoff_location": "Napa",
                "service_type": "Hourly Chauffeur", "hours": 3,
                "pickup_date": "2026-07-11",
            }, timeout=20)
            body = r2.json()
            assert body.get("surge_applied") is not None
            for q in body["quotes"]:
                vt = q["vehicle_type"]
                if vt in base_prices and q.get("price") is not None:
                    expected = round(base_prices[vt] * 2.0, 2)
                    assert abs(q["price"] - expected) < 0.6
        finally:
            self._delete(admin_headers, ev["id"])

    def test_zone_and_surge_stack(self, admin_headers):
        """Healdsburg short trip (<20mi) → zone surcharge $65, then ×1.5 surge."""
        # Baseline without surge
        r = requests.post(f"{BASE_URL}/api/quote", json={
            "pickup_location": "Healdsburg, CA",
            "dropoff_location": "Geyserville, CA",
            "service_type": "Airport Transfer",
        }, timeout=45)
        base = r.json()
        if not base.get("surcharge_applied"):
            pytest.skip("Geocoder didn't trigger Healdsburg zone surcharge — geocoding miss")
        base_prices = {q["vehicle_type"]: q.get("price") for q in base["quotes"] if q.get("price")}

        ev = self._create(admin_headers, name="TEST_ZoneSurge", start_date="2026-08-10",
                          end_date="2026-08-12", multiplier=1.5)
        try:
            r2 = requests.post(f"{BASE_URL}/api/quote", json={
                "pickup_location": "Healdsburg, CA",
                "dropoff_location": "Geyserville, CA",
                "service_type": "Airport Transfer",
                "pickup_date": "2026-08-11",
            }, timeout=45)
            body = r2.json()
            assert body.get("surcharge_applied") is not None
            assert body.get("surge_applied") is not None
            for q in body["quotes"]:
                vt = q["vehicle_type"]
                if vt in base_prices and q.get("price") is not None:
                    # surge applied on already-surcharged base price
                    expected = round(base_prices[vt] * 1.5, 2)
                    assert abs(q["price"] - expected) < 0.6, f"{vt}: expected ~{expected}, got {q['price']}"
        finally:
            self._delete(admin_headers, ev["id"])


# ---------- 4) Regression: zones still listable ----------
class TestRegression:
    def test_zones_endpoint_still_works(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/zones", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        names = [z["name"] for z in r.json()]
        # Default zones should still be present
        assert any("Healdsburg" in n for n in names) or any("Calistoga" in n for n in names)

    def test_options_endpoint(self):
        r = requests.get(f"{BASE_URL}/api/options", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert "Hourly Chauffeur" in body["service_types"]
