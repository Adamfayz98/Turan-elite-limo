"""
Iteration 55 — Double-discount pay-later bug fix (P0) + P1 items.

Covers:
  1. Round-trip Executive Sedan SFO ↔ Monterey + WELCOME 20% promo →
     quote_amount, pay_later_amount, deposit_amount all consistent.
  2. One-way + WELCOME regression.
  3. One-way without promo regression.
  4. Legacy booking safety (pre-lock-in fixture) → checkout-setup applies
     proportional 20% discount.
  5. Admin billing-audit endpoint (401 unauthed, 200 with valid admin JWT).
  6. Spam heuristic tuning — /api/quote succeeds with keyboard-mash input.
  7. Custom invoice pay_after (SETUP mode) create → returns Stripe URL,
     payment_mode='pay_after', stripe_customer_id set. GET lists it.
  8. Custom invoice pay_now regression.
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import pytest
import requests

# Load backend env so MONGO_URL / DB_NAME are available for direct Mongo access.
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

# So we can import bcrypt-compatible helper (same as backend uses).
sys.path.insert(0, "/app/backend")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "support@turanelitelimo.com"
ADMIN_PASSWORD = "TuronAdmin@2025"


# --------------------------- shared fixtures ---------------------------

@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def mongo_db():
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


def _hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


@pytest.fixture(scope="module")
def admin_token(sess, mongo_db):
    """Complete real 2FA flow by patching the DB challenge with a known code."""
    r = sess.post(f"{API}/admin/login", json={
        "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD,
    })
    if r.status_code != 200:
        pytest.skip(f"Admin login failed (bcrypt/password issue?): {r.status_code} {r.text[:200]}")
    challenge_id = r.json()["challenge_id"]

    known_code = "123456"
    async def _patch():
        await mongo_db.admin_2fa_challenges.update_one(
            {"challenge_id": challenge_id},
            {"$set": {
                "code_hash": _hash_pw(known_code),
                "attempts": 0,
                "used": False,
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
            }},
        )
    asyncio.get_event_loop().run_until_complete(_patch())

    r2 = sess.post(f"{API}/admin/verify-2fa", json={
        "challenge_id": challenge_id, "code": known_code,
    })
    if r2.status_code != 200:
        pytest.skip(f"Admin 2FA verify failed: {r2.status_code} {r2.text[:200]}")
    return r2.json()["token"]


# --------------------------- helper: create booking end-to-end ---------------------------

FUTURE_DATE = (datetime.now(timezone.utc) + timedelta(days=14)).strftime("%Y-%m-%d")


def _booking_payload(*, round_trip: bool, promo: str | None, email: str) -> dict:
    return {
        "full_name": "TEST_ Iter55 Customer",
        "email": email,
        "phone": "+16502222222",
        "service_type": "A to B Transfer",
        "pickup_date": FUTURE_DATE,
        "pickup_time": "10:00",
        "pickup_location": "San Francisco International Airport, San Francisco, CA",
        "dropoff_location": "1000 Aguajito Rd, Monterey, CA 93940"
        if round_trip else "Palo Alto, CA",
        "passengers": 2,
        "luggage_count": 2,
        "child_seat": False,
        "child_seat_count": 0,
        "return_trip": round_trip,
        "return_location": "San Francisco International Airport, San Francisco, CA" if round_trip else "",
        "return_date": FUTURE_DATE if round_trip else None,
        "return_time": "18:00" if round_trip else None,
        "vehicle_type": "Executive Sedan",
        "notes": "",
        "meet_and_greet": False,
        "flight_number": None,
        "promo_code": promo,
        "wait_time_consent": True,
        "sms_consent": False,
        "marketing_opt_in": False,
    }


# --------------------------- 1. Round-trip + WELCOME ---------------------------

class TestP0RoundTripWelcome:
    """P0: SFO ↔ Monterey Executive Sedan + WELCOME 20% off. Must be consistent everywhere."""

    def test_quote_reflects_round_trip_discount(self, sess):
        r = sess.post(f"{API}/quote", json={
            "pickup_location": "San Francisco International Airport, San Francisco, CA",
            "dropoff_location": "1000 Aguajito Rd, Monterey, CA 93940",
            "service_type": "Point-to-Point",
            "return_trip": True,
            "return_location": "San Francisco International Airport, San Francisco, CA",
        })
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["round_trip"] is True
        sedan = next((q for q in j["quotes"] if q["vehicle_type"] == "Executive Sedan"), None)
        assert sedan and sedan["price"], f"no sedan in quotes: {j}"
        # ~$944 undiscounted, ~$755 with 20% off.
        assert 900 < sedan["price"] < 1000, sedan["price"]

    def test_end_to_end_consistency(self, sess):
        email = f"TEST_iter55_rt_{uuid.uuid4().hex[:8]}@example.com"
        payload = _booking_payload(round_trip=True, promo="WELCOME", email=email)
        r = sess.post(f"{API}/bookings", json=payload)
        assert r.status_code == 200, r.text
        booking = r.json()
        booking_id = booking["id"]

        qa = booking["quote_amount"]
        oqa = booking.get("original_quote_amount")
        disc = booking.get("discount_amount") or 0
        # After lock-in, quote_amount is POST-discount.
        assert 720 < qa < 780, f"quote_amount out of expected range: {qa} (expect ~755)"
        assert oqa and 900 < oqa < 1000, f"original_quote_amount: {oqa}"
        assert disc > 0
        assert abs((oqa - disc) - qa) < 1.0, "quote_amount != original - discount"

        # /public before checkout-setup — pay_later_amount not yet set; deposit_amount uses quote_amount.
        pub0 = sess.get(f"{API}/bookings/{booking_id}/public").json()
        assert pub0["quote_amount"] == qa
        assert abs(pub0["deposit_amount"] - qa) < 0.01, (
            f"deposit_amount ({pub0['deposit_amount']}) must equal quote_amount ({qa}) "
            f"when deposit_percent=100"
        )

        # checkout-setup — this is the endpoint that had the double-discount bug.
        r2 = sess.post(f"{API}/payments/checkout-setup", json={
            "booking_id": booking_id,
            "origin_url": BASE_URL,
        })
        assert r2.status_code == 200, r2.text
        setup_amt = r2.json()["amount"]
        # setup mode returns $0 (no charge), but the amount reflected on the booking must match.
        # Verify the pay_later_amount stamped on the booking equals quote_amount.
        pub = sess.get(f"{API}/bookings/{booking_id}/public").json()
        pla = pub["pay_later_amount"]
        assert pla is not None, "pay_later_amount not stamped after checkout-setup"
        assert abs(pla - qa) < 0.01, f"DOUBLE-DISCOUNT REGRESSION: pay_later={pla}, quote={qa}"
        assert abs(pub["deposit_amount"] - qa) < 0.01
        assert pub["quote_amount"] == qa
        # setup response amount reflects the (post-discount) charge amount, not $944.
        assert abs(setup_amt - qa) < 0.01, (
            f"checkout-setup response amount {setup_amt} must equal quote {qa}"
        )


# --------------------------- 2. One-way + WELCOME regression ---------------------------

class TestOneWayWithPromoRegression:
    def test_one_way_promo_consistency(self, sess):
        email = f"TEST_iter55_ow_{uuid.uuid4().hex[:8]}@example.com"
        payload = _booking_payload(round_trip=False, promo="WELCOME", email=email)
        r = sess.post(f"{API}/bookings", json=payload)
        assert r.status_code == 200, r.text
        b = r.json()
        qa = b["quote_amount"]
        assert qa > 0
        assert (b.get("original_quote_amount") or 0) > qa  # discount applied

        r2 = sess.post(f"{API}/payments/checkout-setup", json={
            "booking_id": b["id"], "origin_url": BASE_URL,
        })
        assert r2.status_code == 200, r2.text
        pub = sess.get(f"{API}/bookings/{b['id']}/public").json()
        assert abs(pub["pay_later_amount"] - qa) < 0.01, (
            f"one-way pay_later {pub['pay_later_amount']} != quote {qa}"
        )


# --------------------------- 3. One-way, no promo ---------------------------

class TestOneWayNoPromo:
    def test_no_promo_all_equal_vehicle_price(self, sess):
        # quote → capture Executive Sedan price
        rq = sess.post(f"{API}/quote", json={
            "pickup_location": "San Francisco International Airport, San Francisco, CA",
            "dropoff_location": "Palo Alto, CA",
            "service_type": "Point-to-Point",
        }).json()
        sedan_price = next(q["price"] for q in rq["quotes"] if q["vehicle_type"] == "Executive Sedan")
        assert sedan_price > 0

        email = f"TEST_iter55_nopromo_{uuid.uuid4().hex[:8]}@example.com"
        payload = _booking_payload(round_trip=False, promo=None, email=email)
        r = sess.post(f"{API}/bookings", json=payload)
        assert r.status_code == 200, r.text
        b = r.json()
        # No-promo bookings don't stamp quote_amount at create time — it's lazy-computed
        # by /public on first read. Fetch /public to trigger the compute.
        pub = sess.get(f"{API}/bookings/{b['id']}/public").json()
        qa = pub["quote_amount"]
        assert qa is not None
        assert abs(qa - sedan_price) < 0.5, f"booking quote {qa} != vehicle quote {sedan_price}"

        r2 = sess.post(f"{API}/payments/checkout-setup", json={
            "booking_id": b["id"], "origin_url": BASE_URL,
        })
        assert r2.status_code == 200, r2.text
        pub = sess.get(f"{API}/bookings/{b['id']}/public").json()
        assert abs(pub["pay_later_amount"] - qa) < 0.01
        assert abs(pub["deposit_amount"] - qa) < 0.01


# --------------------------- 4. Legacy booking (pre-lock-in) safety ---------------------------

class TestLegacyBookingProportionalDiscount:
    """Legacy: quote_amount == original_quote_amount (PRE-discount) with a stored
    discount_amount. checkout-setup MUST still apply the proportional 20% discount."""

    def test_legacy_math(self, sess, mongo_db):
        legacy_id = str(uuid.uuid4())
        doc = {
            "id": legacy_id,
            "full_name": "TEST_ Legacy Customer",
            "email": f"TEST_iter55_legacy_{uuid.uuid4().hex[:6]}@example.com",
            "phone": "+16501111111",
            "service_type": "Point-to-Point",
            "pickup_date": FUTURE_DATE,
            "pickup_time": "10:00",
            "pickup_location": "SFO",
            "dropoff_location": "Palo Alto, CA",
            "passengers": 2,
            "luggage_count": 1,
            "child_seat": False,
            "child_seat_count": 0,
            "vehicle_type": "Executive Sedan",
            "return_trip": False,
            "wait_time_consent": True,
            "additional_stops": [],
            "status": "confirmed",
            "payment_status": "unpaid",
            "quote_amount": 219.67,           # PRE-discount (legacy behaviour)
            "original_quote_amount": 219.67,  # equal to quote_amount signals pre-lock-in booking
            "discount_amount": 43.93,          # ~20% of 219.67
            "promo_code": "WELCOME",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "manage_token": uuid.uuid4().hex,
        }
        asyncio.get_event_loop().run_until_complete(
            mongo_db.bookings.insert_one(dict(doc))
        )

        try:
            r = sess.post(f"{API}/payments/checkout-setup", json={
                "booking_id": legacy_id, "origin_url": BASE_URL,
            })
            assert r.status_code == 200, r.text
            pla_amt = r.json()["amount"]
            # Legacy path: 219.67 - 43.93 = 175.74
            assert abs(pla_amt - 175.74) < 0.5, (
                f"legacy proportional discount failed: got {pla_amt}, expected ~175.74"
            )

            pub = sess.get(f"{API}/bookings/{legacy_id}/public").json()
            assert abs(pub["pay_later_amount"] - 175.74) < 0.5
        finally:
            asyncio.get_event_loop().run_until_complete(
                mongo_db.bookings.delete_one({"id": legacy_id})
            )


# --------------------------- 5. Admin billing-audit ---------------------------

class TestBillingAuditEndpoint:
    def test_401_unauthenticated(self, sess):
        r = sess.get(f"{API}/admin/billing-audit")
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text[:200]}"

    def test_200_authenticated(self, sess, admin_token):
        r = sess.get(
            f"{API}/admin/billing-audit",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("overcharged", "undercharged", "pay_later_over_discounted", "summary"):
            assert k in j, f"missing key {k}"
        assert isinstance(j["overcharged"], list)
        assert isinstance(j["summary"], dict)


# --------------------------- 6. Spam heuristic tuning ---------------------------

class TestSpamHeuristicTuning:
    def test_keyboard_mash_quote_still_succeeds(self, sess):
        # Heuristics score silently — endpoint must still return 200.
        r = sess.post(f"{API}/quote", json={
            "pickup_location": "SFO",
            "dropoff_location": "sdfsdfsdf",
            "service_type": "Point-to-Point",
        })
        # Even with a bogus dropoff, we expect either a graceful 200 (with fallback prices
        # or an error string per quote), or an intentional 4xx if backend blocks garbage.
        # Per problem statement: "no user-facing behavior change" → 200.
        assert r.status_code == 200, r.text


# --------------------------- 7 + 8. Custom invoices ---------------------------

class TestCustomInvoices:
    def test_pay_after_creates_setup_session(self, sess, admin_token, mongo_db):
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "client_name": "TEST_ PayAfter Customer",
            "client_email": f"TEST_iter55_payafter_{uuid.uuid4().hex[:6]}@example.com",
            "client_phone": "+16503334444",
            "amount": 500,
            "payment_mode": "pay_after",
            "vehicle_type": "Executive Sedan",
            "pickup_location": "SFO",
            "dropoff_location": "Palo Alto",
        }
        r = sess.post(f"{API}/admin/invoices", json=payload, headers=headers)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["payment_mode"] == "pay_after"
        assert j["payment_link"].startswith("https://checkout.stripe.com/"), j["payment_link"]
        assert j["stripe_session_id"]
        assert j.get("stripe_customer_id"), "pay_after must save a stripe_customer_id"
        assert j["status"] == "sent"
        invoice_id = j["id"]

        # GET list — the new invoice should appear.
        rl = sess.get(f"{API}/admin/invoices", headers=headers)
        assert rl.status_code == 200
        found = next((i for i in rl.json() if i["id"] == invoice_id), None)
        assert found, f"invoice {invoice_id} missing from list"
        assert found["payment_mode"] == "pay_after"
        assert found["status"] == "sent"

        # cleanup
        asyncio.get_event_loop().run_until_complete(
            mongo_db.custom_invoices.delete_one({"id": invoice_id})
        )

    def test_pay_now_regression(self, sess, admin_token, mongo_db):
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "client_name": "TEST_ PayNow Customer",
            "client_email": f"TEST_iter55_paynow_{uuid.uuid4().hex[:6]}@example.com",
            "client_phone": "+16505556666",
            "amount": 300,
            "payment_mode": "pay_now",
            "vehicle_type": "Executive Sedan",
        }
        r = sess.post(f"{API}/admin/invoices", json=payload, headers=headers)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["payment_mode"] == "pay_now"
        assert j["payment_link"].startswith("https://checkout.stripe.com/"), j["payment_link"]
        invoice_id = j["id"]

        rl = sess.get(f"{API}/admin/invoices", headers=headers)
        found = next((i for i in rl.json() if i["id"] == invoice_id), None)
        assert found

        asyncio.get_event_loop().run_until_complete(
            mongo_db.custom_invoices.delete_one({"id": invoice_id})
        )

    def test_pay_now_omitted_mode_defaults(self, sess, admin_token, mongo_db):
        """Omitting payment_mode should default to pay_now (regression guard)."""
        headers = {"Authorization": f"Bearer {admin_token}"}
        payload = {
            "client_name": "TEST_ Default Mode",
            "client_email": f"TEST_iter55_default_{uuid.uuid4().hex[:6]}@example.com",
            "client_phone": "+16507778888",
            "amount": 250,
        }
        r = sess.post(f"{API}/admin/invoices", json=payload, headers=headers)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["payment_mode"] == "pay_now"
        invoice_id = j["id"]
        asyncio.get_event_loop().run_until_complete(
            mongo_db.custom_invoices.delete_one({"id": invoice_id})
        )


# --------------------------- 9. Cleanup ---------------------------

@pytest.fixture(scope="module", autouse=True)
def cleanup_test_bookings(mongo_db):
    yield
    # Delete any bookings created by this test run (prefix TEST_ on full_name).
    asyncio.get_event_loop().run_until_complete(
        mongo_db.bookings.delete_many({"full_name": {"$regex": "^TEST_"}})
    )
    asyncio.get_event_loop().run_until_complete(
        mongo_db.custom_invoices.delete_many({"client_name": {"$regex": "^TEST_"}})
    )
