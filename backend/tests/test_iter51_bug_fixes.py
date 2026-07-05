"""
Iteration 51 — Bug fixes on top of iter49/50.

Covers:
  BUG #1 — Pay-after-ride discount visibility
      /api/bookings/{id}/public exposes original_quote_amount, discount_amount,
      promo_code, pay_later_amount (= discounted) after /payments/checkout-setup.
  BUG #4 — Child seats as $20/seat:
      - POST /api/quote with child_seat_count=2 returns Executive Sedan price
        ~$40 higher (may include ~3.5% service fee → ~$41.40).
      - POST /api/bookings accepts child_seat_count and stores it.
      - Legacy child_seat=True → 1-seat fallback price.
      - Hourly Chauffeur quotes include child_seat_count.
      - Public booking exposes child_seat_count.

Notes:
  - WELCOME promo (20% off, allowed_vehicle_types=[Executive Sedan, Luxury SUV])
    is toggled auto_apply=True at the start of the auto-apply block and reverted
    at the end. If a test crashes between the two, the fixture teardown restores
    the original auto_apply flag.
"""

import asyncio
import datetime as dt
import os
import uuid

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set in environment"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


# ---------- helpers ----------

def _future_date(days: int = 21) -> str:
    return (dt.date.today() + dt.timedelta(days=days)).isoformat()


def _make_booking_payload(
    vehicle_type: str = "Executive Sedan",
    service_type: str = "A to B Transfer",
    child_seat_count: int = 0,
    promo_code: str | None = None,
    passengers: int = 2,
    child_seat: bool | None = None,
) -> dict:
    payload = {
        "full_name": "TEST Iter51",
        "email": f"iter51-test+{uuid.uuid4().hex[:6]}@example.com",
        "phone": "+14155550101",
        "service_type": service_type,
        "pickup_date": _future_date(),
        "pickup_time": "10:00",
        "pickup_location": "SFO Airport, San Francisco, CA",
        "dropoff_location": "Palo Alto, CA",
        "passengers": passengers,
        "luggage_count": 1,
        "vehicle_type": vehicle_type,
        "wait_time_consent": True,
        "child_seat_count": child_seat_count,
    }
    if child_seat is not None:
        payload["child_seat"] = child_seat
    if promo_code:
        payload["promo_code"] = promo_code
    return payload


def _post_booking(**kwargs) -> dict:
    r = requests.post(f"{BASE_URL}/api/bookings", json=_make_booking_payload(**kwargs), timeout=20)
    assert r.status_code == 200, f"POST /api/bookings failed: {r.status_code} {r.text[:400]}"
    return r.json()


# ---------- MongoDB helpers (auto-apply toggle) ----------

async def _set_promo_auto_apply(code: str, auto_apply: bool) -> bool | None:
    """Toggle auto_apply on a promo. Returns the previous value."""
    client = AsyncIOMotorClient(MONGO_URL)
    try:
        db = client[DB_NAME]
        prior = await db.promos.find_one({"code": code}, {"_id": 0, "auto_apply": 1})
        prior_val = bool(prior.get("auto_apply")) if prior else None
        await db.promos.update_one({"code": code}, {"$set": {"auto_apply": bool(auto_apply)}})
        return prior_val
    finally:
        client.close()


def _set_promo_auto_apply_sync(code: str, auto_apply: bool) -> bool | None:
    return asyncio.get_event_loop().run_until_complete(_set_promo_auto_apply(code, auto_apply))


@pytest.fixture
def welcome_auto_apply():
    """Enable auto_apply on WELCOME for the test and revert after."""
    prior = asyncio.new_event_loop().run_until_complete(_set_promo_auto_apply("WELCOME", True))
    yield
    # Revert
    asyncio.new_event_loop().run_until_complete(_set_promo_auto_apply("WELCOME", bool(prior) if prior is not None else False))


# ================================================================
# BUG #4 — Child seats: $20/seat pricing on /quote
# ================================================================

class TestQuoteChildSeatPricing:
    def _quote_price(self, child_seat_count: int, service_type: str = "A to B Transfer", hours: int | None = None) -> float:
        body = {
            "service_type": service_type,
            "pickup_date": _future_date(),
            "pickup_time": "10:00",
            "pickup_location": "SFO Airport, San Francisco, CA",
            "dropoff_location": "Palo Alto, CA",
            "passengers": 2,
            "luggage_count": 1,
            "child_seat_count": child_seat_count,
        }
        if hours:
            body["hours"] = hours
        r = requests.post(f"{BASE_URL}/api/quote", json=body, timeout=25)
        assert r.status_code == 200, f"/quote failed: {r.status_code} {r.text[:400]}"
        data = r.json()
        # Find Executive Sedan
        for q in data.get("quotes", []):
            if q.get("vehicle_type") == "Executive Sedan":
                assert q.get("price") is not None, "Executive Sedan price is None"
                return float(q["price"])
        pytest.fail("Executive Sedan quote not found")

    def test_quote_sedan_two_seats_costs_about_40_more(self):
        price_0 = self._quote_price(0)
        price_2 = self._quote_price(2)
        delta = price_2 - price_0
        # $20/seat * 2 = $40 base add-on; with ~3.5% service fee gross-up ⇒ ~$41.40
        assert 39.0 <= delta <= 43.0, (
            f"Expected ~$40 price bump for 2 child seats, got ${delta:.2f} "
            f"(price_0={price_0}, price_2={price_2})"
        )

    def test_quote_sedan_one_seat_costs_about_20_more(self):
        price_0 = self._quote_price(0)
        price_1 = self._quote_price(1)
        delta = price_1 - price_0
        assert 19.0 <= delta <= 22.0, (
            f"Expected ~$20 price bump for 1 child seat, got ${delta:.2f}"
        )

    def test_hourly_quote_child_seat_bump(self):
        """Hourly Chauffeur pricing should also honor child seats."""
        price_0 = self._quote_price(0, service_type="Hourly Chauffeur", hours=3)
        price_1 = self._quote_price(1, service_type="Hourly Chauffeur", hours=3)
        delta = price_1 - price_0
        assert 19.0 <= delta <= 22.0, (
            f"Hourly expected ~$20 bump for 1 seat, got ${delta:.2f}"
        )


# ================================================================
# BUG #4 — Booking accepts child_seat_count and stores it
# ================================================================

class TestBookingChildSeatCount:
    def test_booking_accepts_and_persists_child_seat_count(self):
        b = _post_booking(child_seat_count=3, passengers=4)
        # Response should mirror both fields
        assert b.get("child_seat_count") == 3, f"expected 3, got {b.get('child_seat_count')}"
        assert b.get("child_seat") is True, f"legacy bool must mirror to True when count>0"

        # Public endpoint mirrors it
        pub = requests.get(f"{BASE_URL}/api/bookings/{b['id']}/public", timeout=15).json()
        assert pub.get("child_seat_count") == 3
        assert pub.get("child_seat") is True

    def test_booking_count_zero_boolean_false(self):
        b = _post_booking(child_seat_count=0)
        assert b.get("child_seat_count") == 0
        assert b.get("child_seat") is False

    def test_booking_quote_includes_child_seat_fee(self):
        """After /checkout-setup, pay_later_amount should reflect $20/seat."""
        b0 = _post_booking(child_seat_count=0)
        b2 = _post_booking(child_seat_count=2, passengers=4)
        r0 = requests.post(
            f"{BASE_URL}/api/payments/checkout-setup",
            json={"booking_id": b0["id"], "origin_url": BASE_URL},
            timeout=30,
        )
        r2 = requests.post(
            f"{BASE_URL}/api/payments/checkout-setup",
            json={"booking_id": b2["id"], "origin_url": BASE_URL},
            timeout=30,
        )
        assert r0.status_code == 200 and r2.status_code == 200

        pub0 = requests.get(f"{BASE_URL}/api/bookings/{b0['id']}/public", timeout=15).json()
        pub2 = requests.get(f"{BASE_URL}/api/bookings/{b2['id']}/public", timeout=15).json()
        delta = float(pub2["pay_later_amount"]) - float(pub0["pay_later_amount"])
        # ~$40 + service fee (~3.5%)
        assert 39.0 <= delta <= 43.0, (
            f"Booking pay_later_amount delta expected ~$40 for 2 seats, got ${delta:.2f}"
        )


# ================================================================
# BUG #4 — Legacy compat: child_seat=True (no count) still prices $20
# ================================================================

class TestLegacyChildSeatFallback:
    """Insert a booking directly into Mongo with legacy `child_seat=True`
    and NO count, then verify _compute_quote_amount falls back to 1-seat."""

    def test_legacy_boolean_prices_one_seat(self):
        async def _insert():
            client = AsyncIOMotorClient(MONGO_URL)
            try:
                db = client[DB_NAME]
                doc = {
                    "id": "TEST_legacy_" + uuid.uuid4().hex[:8],
                    "full_name": "TEST Legacy",
                    "email": f"legacy-{uuid.uuid4().hex[:6]}@example.com",
                    "phone": "+14155550101",
                    "service_type": "A to B Transfer",
                    "pickup_date": _future_date(),
                    "pickup_time": "10:00",
                    "pickup_location": "SFO Airport, San Francisco, CA",
                    "dropoff_location": "Palo Alto, CA",
                    "passengers": 2,
                    "luggage_count": 1,
                    "vehicle_type": "Executive Sedan",
                    "status": "pending",
                    "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                    # Legacy state — boolean only, no count
                    "child_seat": True,
                    "child_seat_count": 0,
                    "wait_time_consent": True,
                }
                await db.bookings.insert_one(doc)
                return doc["id"]
            finally:
                client.close()

        # Same for baseline (no child seat)
        async def _insert_baseline():
            client = AsyncIOMotorClient(MONGO_URL)
            try:
                db = client[DB_NAME]
                doc = {
                    "id": "TEST_legacybase_" + uuid.uuid4().hex[:8],
                    "full_name": "TEST LegacyBase",
                    "email": f"legacybase-{uuid.uuid4().hex[:6]}@example.com",
                    "phone": "+14155550101",
                    "service_type": "A to B Transfer",
                    "pickup_date": _future_date(),
                    "pickup_time": "10:00",
                    "pickup_location": "SFO Airport, San Francisco, CA",
                    "dropoff_location": "Palo Alto, CA",
                    "passengers": 2,
                    "luggage_count": 1,
                    "vehicle_type": "Executive Sedan",
                    "status": "pending",
                    "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                    "child_seat": False,
                    "child_seat_count": 0,
                    "wait_time_consent": True,
                }
                await db.bookings.insert_one(doc)
                return doc["id"]
            finally:
                client.close()

        legacy_id = asyncio.new_event_loop().run_until_complete(_insert())
        base_id = asyncio.new_event_loop().run_until_complete(_insert_baseline())

        try:
            legacy = requests.get(f"{BASE_URL}/api/bookings/{legacy_id}/public", timeout=15).json()
            base = requests.get(f"{BASE_URL}/api/bookings/{base_id}/public", timeout=15).json()
            delta = float(legacy["quote_amount"]) - float(base["quote_amount"])
            assert 19.0 <= delta <= 22.0, (
                f"Legacy child_seat=True should price ~$20 more than none; got ${delta:.2f}"
            )
        finally:
            # Cleanup
            async def _cleanup():
                client = AsyncIOMotorClient(MONGO_URL)
                try:
                    db = client[DB_NAME]
                    await db.bookings.delete_many({"id": {"$in": [legacy_id, base_id]}})
                finally:
                    client.close()

            asyncio.new_event_loop().run_until_complete(_cleanup())


# ================================================================
# BUG #1 — Pay-after-ride discount visibility on /public
# ================================================================

class TestPayAfterRideDiscount:
    def test_manual_welcome_promo_exposed_on_public_after_setup(self):
        """With explicit promo_code=WELCOME on a booking, /public should expose
        promo_code + discount_amount + original_quote_amount and pay_later_amount
        should equal (quote_amount - discount_amount)."""
        b = _post_booking(
            vehicle_type="Executive Sedan",
            promo_code="WELCOME",
            passengers=3,
            child_seat_count=2,
        )
        # Kick the setup flow so promo is validated + stamped
        r = requests.post(
            f"{BASE_URL}/api/payments/checkout-setup",
            json={"booking_id": b["id"], "origin_url": BASE_URL},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:400]

        pub = requests.get(f"{BASE_URL}/api/bookings/{b['id']}/public", timeout=15).json()

        # Basic pay-after-ride assertions
        assert pub.get("payment_mode") == "pay_after_ride"
        assert pub.get("promo_code") == "WELCOME"

        discount = pub.get("discount_amount")
        original = pub.get("original_quote_amount")
        pay_later = pub.get("pay_later_amount")
        quote = pub.get("quote_amount")

        assert discount is not None and float(discount) > 0, f"discount_amount not positive: {discount}"
        assert original is not None and float(original) > 0, f"original_quote_amount missing: {original}"
        # Original ≈ Quote (deposit_percent=100)
        assert abs(float(original) - float(quote)) <= 1.0, (
            f"original_quote_amount ({original}) should be ~= quote_amount ({quote})"
        )
        # 20% off promo
        expected_discount = round(float(original) * 0.20, 2)
        assert abs(float(discount) - expected_discount) <= 0.5, (
            f"Discount should be ~20% of original ({expected_discount}), got {discount}"
        )
        # pay_later is discounted
        assert abs(float(pay_later) - (float(original) - float(discount))) <= 0.5, (
            f"pay_later_amount ({pay_later}) should equal original-discount "
            f"({original}-{discount}={float(original) - float(discount):.2f})"
        )
        # Child seat fee actually made it into the base quote
        # (2 seats × $20 = $40; with fee ≈ $41.4)
        assert float(quote) > 40, f"quote_amount ({quote}) should include $40 for 2 child seats"

    def test_public_fields_present_when_no_promo(self):
        """No promo — the new promo fields should still be present (null-safe)."""
        b = _post_booking()
        r = requests.post(
            f"{BASE_URL}/api/payments/checkout-setup",
            json={"booking_id": b["id"], "origin_url": BASE_URL},
            timeout=30,
        )
        assert r.status_code == 200
        pub = requests.get(f"{BASE_URL}/api/bookings/{b['id']}/public", timeout=15).json()
        # Keys present (even if None) — this is what frontend relies on
        assert "promo_code" in pub
        assert "discount_amount" in pub
        assert "original_quote_amount" in pub
        assert "child_seat_count" in pub


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
