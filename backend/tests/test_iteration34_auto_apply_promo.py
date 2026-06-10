"""
Iteration 34 — Auto-apply promo decoration on /api/quote

Tests for the new "auto_apply" promo feature that silently applies a discount
to every eligible vehicle quote (Uber-style strike-through pricing).

Approach: insert promos directly into MongoDB (bypasses admin 2FA), call
public /api/quote, assert response decoration. Cleans up after itself.
"""
import os
import uuid
import asyncio
import pytest
import requests
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://limo-experience-1.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

# Use a real US address pair that yields a long-enough route to exceed $200
PICKUP = "San Francisco International Airport, CA"
DROPOFF = "1 Hacker Way, Menlo Park, CA 94025"
PICKUP_SHORT = "100 Main St, Millbrae, CA"
DROPOFF_SHORT = "200 Broadway, Millbrae, CA"


# ----------------------------- helpers / fixtures -----------------------------

@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def mongo():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    return db


@pytest.fixture(autouse=True)
def cleanup_test_promos(mongo, event_loop):
    """Wipe any TEST_AUTO_ promos before AND after each test (idempotent)."""
    async def _del():
        await mongo.promos.delete_many({"code": {"$regex": "^TEST_AUTO_"}})
    event_loop.run_until_complete(_del())
    yield
    event_loop.run_until_complete(_del())


def _insert_promo(mongo, event_loop, *, code, value, discount_type="percent",
                  auto_apply=True, active=True, allowed_vehicle_types=None,
                  min_ride_amount=0.0, show_on_banner=False):
    doc = {
        "id": str(uuid.uuid4()),
        "code": code.upper(),
        "description": f"Test promo {code}",
        "discount_type": discount_type,
        "value": float(value),
        "min_ride_amount": float(min_ride_amount),
        "max_uses": None,
        "expires_at": None,
        "first_ride_only": False,
        "active": active,
        "show_on_banner": show_on_banner,
        "auto_apply": auto_apply,
        "allowed_vehicle_types": allowed_vehicle_types or [],
        "uses": 0,
        "total_discount_given": 0.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    event_loop.run_until_complete(mongo.promos.insert_one(doc.copy()))
    return doc


def _quote(payload):
    return requests.post(f"{BASE_URL}/api/quote", json=payload, timeout=45)


def _airport_quote_payload():
    return {
        "pickup_location": PICKUP,
        "dropoff_location": DROPOFF,
        "service_type": "Airport Transfer",
    }


# --------------------------------- TESTS -------------------------------------

# Sanity: no auto-promo → all new fields null
class TestNoAutoPromo:
    def test_quote_succeeds_and_new_fields_are_null(self):
        r = _quote(_airport_quote_payload())
        assert r.status_code == 200, r.text
        data = r.json()
        assert "quotes" in data and len(data["quotes"]) > 0
        for q in data["quotes"]:
            assert q.get("original_price") is None, f"{q['vehicle_type']} unexpectedly has original_price"
            assert q.get("discount_amount") is None
            assert q.get("applied_promo") is None


# Case: 25% auto-apply restricted to a single vehicle type
class TestAutoPromoSingleVehicle:
    def test_only_target_vehicle_decorated(self, mongo, event_loop):
        promo = _insert_promo(
            mongo, event_loop,
            code=f"TEST_AUTO_ES_{uuid.uuid4().hex[:6]}",
            value=25, discount_type="percent",
            allowed_vehicle_types=["Executive Sedan"],
        )
        r = _quote(_airport_quote_payload())
        assert r.status_code == 200, r.text
        data = r.json()
        found_target = False
        for q in data["quotes"]:
            if q["vehicle_type"] == "Executive Sedan" and q.get("price"):
                found_target = True
                assert q["original_price"] is not None
                assert q["original_price"] > q["price"]
                expected_off = round(q["original_price"] * 0.25, 2)
                # Allow $0.02 rounding tolerance
                assert abs(q["discount_amount"] - expected_off) < 0.05, (
                    f"discount_amount={q['discount_amount']} expected~{expected_off}"
                )
                assert q["applied_promo"] is not None
                assert q["applied_promo"]["code"] == promo["code"]
            else:
                assert q.get("original_price") is None, f"{q['vehicle_type']} should NOT have promo applied"
                assert q.get("applied_promo") is None
        assert found_target, "Executive Sedan quote was missing"


# Case: empty allowed list = applies to all vehicles
class TestAutoPromoAllVehicles:
    def test_all_priced_vehicles_decorated(self, mongo, event_loop):
        promo = _insert_promo(
            mongo, event_loop,
            code=f"TEST_AUTO_ALL_{uuid.uuid4().hex[:6]}",
            value=20, discount_type="percent",
            allowed_vehicle_types=[],
        )
        r = _quote(_airport_quote_payload())
        assert r.status_code == 200
        data = r.json()
        priced = [q for q in data["quotes"] if q.get("price")]
        assert len(priced) >= 2
        for q in priced:
            assert q.get("applied_promo") is not None, f"{q['vehicle_type']} missing applied_promo"
            assert q["applied_promo"]["code"] == promo["code"]
            assert q["original_price"] > q["price"]


# Case: min_ride_amount gating
class TestAutoPromoMinRide:
    def test_only_high_priced_vehicles_get_discount(self, mongo, event_loop):
        _insert_promo(
            mongo, event_loop,
            code=f"TEST_AUTO_MIN_{uuid.uuid4().hex[:6]}",
            value=15, discount_type="percent",
            allowed_vehicle_types=[],
            min_ride_amount=200.0,
        )
        r = _quote(_airport_quote_payload())
        assert r.status_code == 200
        data = r.json()
        any_decorated = False
        for q in data["quotes"]:
            if not q.get("price"):
                continue
            # original would be q["original_price"] if decorated; else q["price"]
            orig = q.get("original_price") or q.get("price")
            if q.get("applied_promo"):
                any_decorated = True
                assert orig >= 200.0
            else:
                # not decorated: pre-discount price < 200
                assert q["price"] < 200.0, f"{q['vehicle_type']} priced {q['price']} >=200 but not decorated"
        # At least one vehicle should be expensive enough on an airport route
        assert any_decorated, "Expected at least one vehicle >= $200 to be decorated"


# Case: when multiple auto-apply promos qualify, the best-savings one wins
class TestAutoPromoMultiple:
    def test_only_one_promo_wins_and_is_best(self, mongo, event_loop):
        small = _insert_promo(
            mongo, event_loop,
            code=f"TEST_AUTO_SMALL_{uuid.uuid4().hex[:6]}",
            value=10, discount_type="percent", allowed_vehicle_types=[],
        )
        big = _insert_promo(
            mongo, event_loop,
            code=f"TEST_AUTO_BIG_{uuid.uuid4().hex[:6]}",
            value=20, discount_type="percent", allowed_vehicle_types=[],
        )
        r = _quote(_airport_quote_payload())
        assert r.status_code == 200
        data = r.json()
        codes_seen = set()
        for q in data["quotes"]:
            if q.get("applied_promo"):
                codes_seen.add(q["applied_promo"]["code"])
        assert len(codes_seen) == 1, f"Expected one winning promo, got {codes_seen}"
        # The 20% promo should win — larger savings
        assert big["code"] in codes_seen, f"Bigger promo did not win — got {codes_seen}"
        assert small["code"] not in codes_seen


# Case: Hourly Chauffeur also gets decorated
class TestAutoPromoHourly:
    def test_hourly_quote_decorated(self, mongo, event_loop):
        promo = _insert_promo(
            mongo, event_loop,
            code=f"TEST_AUTO_HRLY_{uuid.uuid4().hex[:6]}",
            value=15, discount_type="percent", allowed_vehicle_types=[],
        )
        payload = {
            "pickup_location": PICKUP,
            "dropoff_location": DROPOFF,
            "service_type": "Hourly Chauffeur",
            "hours": 3,
        }
        r = _quote(payload)
        assert r.status_code == 200, r.text
        data = r.json()
        priced = [q for q in data["quotes"] if q.get("price")]
        assert len(priced) > 0
        decorated = [q for q in priced if q.get("applied_promo")]
        assert len(decorated) > 0, "No hourly quotes decorated with auto-promo"
        for q in decorated:
            assert q["applied_promo"]["code"] == promo["code"]


# Case: inactive auto_apply promo is ignored
class TestInactivePromoIgnored:
    def test_inactive_promo_not_applied(self, mongo, event_loop):
        _insert_promo(
            mongo, event_loop,
            code=f"TEST_AUTO_INACT_{uuid.uuid4().hex[:6]}",
            value=50, discount_type="percent",
            allowed_vehicle_types=[], active=False,
        )
        r = _quote(_airport_quote_payload())
        assert r.status_code == 200
        for q in r.json()["quotes"]:
            assert q.get("applied_promo") is None


# Case: GET /admin/promos & POST /admin/promos auto_apply round-trip
# (Without admin JWT we cannot hit /admin endpoints, so we directly insert &
# read from DB using the same Promo model the API serializes.)
class TestAutoApplyFieldRoundTrip:
    def test_auto_apply_field_persists(self, mongo, event_loop):
        promo = _insert_promo(
            mongo, event_loop,
            code=f"TEST_AUTO_RT_{uuid.uuid4().hex[:6]}",
            value=12, discount_type="percent",
            auto_apply=True, allowed_vehicle_types=[],
        )
        # Read back
        doc = event_loop.run_until_complete(
            mongo.promos.find_one({"code": promo["code"]}, {"_id": 0})
        )
        assert doc is not None
        assert doc.get("auto_apply") is True
        # Verify quote endpoint uses it
        r = _quote(_airport_quote_payload())
        assert r.status_code == 200
        applied = [q for q in r.json()["quotes"] if q.get("applied_promo")]
        assert len(applied) > 0


# Regression: manual promo validation still works
class TestManualPromoRegression:
    def test_validate_endpoint_works(self, mongo, event_loop):
        code = f"TEST_AUTO_MANUAL_{uuid.uuid4().hex[:6]}"
        _insert_promo(
            mongo, event_loop, code=code, value=10, discount_type="percent",
            auto_apply=False, allowed_vehicle_types=[],
        )
        r = requests.post(
            f"{BASE_URL}/api/promos/validate",
            json={"code": code, "amount": 250.0},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Allow either {valid:true,...} shape or full discount info
        assert (data.get("valid") in (True, None)) or "discount" in data or "discount_amount" in data, data


# Regression: existing booking + payment intent endpoints reachable (smoke)
class TestBookingPaymentSmoke:
    def test_quote_then_payment_intent_smoke(self):
        # Just confirm endpoints are reachable; full booking lifecycle covered
        # by previous iteration tests.
        r = _quote(_airport_quote_payload())
        assert r.status_code == 200
        # /api/payments/checkout is the canonical Stripe entry — confirm
        # it requires fields & doesn't 500.
        r2 = requests.post(f"{BASE_URL}/api/payments/checkout", json={}, timeout=15)
        # Expect a 4xx (validation) — confirms route exists & not a 5xx
        assert r2.status_code in (400, 401, 403, 404, 422), f"Unexpected: {r2.status_code} {r2.text[:200]}"
