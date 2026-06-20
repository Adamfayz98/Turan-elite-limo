"""
Iteration 41 — Backend verification for:
  1. Weekly Digest endpoints (auth gating)
  2. POST /api/quote-requests persisting utm field
  3. POST /api/bookings accepting utm field
"""
import os
import uuid
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://limo-experience-1.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

API = f"{BASE_URL}/api"


# ---------- Weekly Digest auth gating ----------

class TestWeeklyDigestAuth:
    def test_preview_unauth_401(self):
        r = requests.get(f"{API}/admin/weekly-digest/preview", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code} body={r.text[:200]}"

    def test_send_unauth_401(self):
        r = requests.post(f"{API}/admin/weekly-digest/send", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code} body={r.text[:200]}"


# ---------- UTM persistence on /api/quote-requests ----------

class TestQuoteRequestUtm:
    def test_quote_request_persists_utm(self):
        utm = {
            "utm_source": "google",
            "utm_campaign": "airport_sfo",
            "gclid": "abc123-test",
            "source_bucket": "google_ads",
            "captured_at": 1735689600000,
            "landing_path": "/sfo-airport-transfer",
        }
        payload = {
            "full_name": "TEST_UTM Customer",
            "email": f"test_utm_{uuid.uuid4().hex[:8]}@example.com",
            "phone": "+14155551212",
            "vehicle_type": "sedan",
            "pickup_date": "2026-02-15",
            "pickup_time": "14:00",
            "pickup_location": "SFO Airport",
            "dropoff_location": "Palo Alto",
            "passengers": 2,
            "notes": "UTM persistence test",
            "utm": utm,
        }
        r = requests.post(f"{API}/quote-requests", json=payload, timeout=20)
        assert r.status_code in (200, 201), f"create quote failed: {r.status_code} {r.text[:300]}"
        body = r.json()
        assert body.get("ok") is True or "id" in body or body.get("id"), f"unexpected body: {body}"
        qid = body.get("id") or body.get("quote_id")
        assert qid, f"no quote id returned: {body}"

        # Verify persistence directly in MongoDB
        client = MongoClient(MONGO_URL)
        try:
            doc = client[DB_NAME].quote_requests.find_one({"id": qid})
            assert doc is not None, f"quote {qid} not found in db"
            stored_utm = doc.get("utm")
            assert stored_utm is not None, f"utm not persisted on quote_requests doc: keys={list(doc.keys())}"
            assert stored_utm.get("utm_source") == "google"
            assert stored_utm.get("utm_campaign") == "airport_sfo"
            assert stored_utm.get("gclid") == "abc123-test"
            assert stored_utm.get("source_bucket") == "google_ads"
        finally:
            client[DB_NAME].quote_requests.delete_one({"id": qid})
            client.close()


# ---------- UTM persistence on /api/bookings ----------

class TestBookingUtm:
    def test_booking_accepts_utm(self):
        utm = {
            "utm_source": "google",
            "utm_campaign": "airport_sfo",
            "gclid": "booking-test-456",
            "source_bucket": "google_ads",
        }
        payload = {
            "full_name": "TEST_UTM Booker",
            "email": f"test_book_{uuid.uuid4().hex[:8]}@example.com",
            "phone": "+14155551313",
            "service_type": "Airport Transfer",
            "vehicle_type": "Executive Sedan",
            "pickup_date": "2026-02-20",
            "pickup_time": "15:00",
            "pickup_location": "SFO International Airport",
            "dropoff_location": "Palo Alto, CA",
            "passengers": 2,
            "luggage_count": 2,
            "flight_number": "UA123",
            "wait_time_consent": True,
            "notes": "UTM booking test",
            "utm": utm,
        }
        r = requests.post(f"{API}/bookings", json=payload, timeout=30)
        # booking endpoint may return 200 with checkout url or 200/201 with id; we
        # accept anything not 4xx/5xx server error and inspect Mongo directly.
        assert r.status_code < 500, f"booking create 5xx: {r.status_code} {r.text[:400]}"
        if r.status_code >= 400:
            # If 4xx, dump for debug but don't auto-fail — schema may differ.
            print(f"booking POST status={r.status_code} body={r.text[:400]}")
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}

        # Try to find the most recent booking with our utm marker
        client = MongoClient(MONGO_URL)
        try:
            doc = client[DB_NAME].bookings.find_one(
                {"utm.gclid": "booking-test-456"}, sort=[("created_at", -1)]
            )
            assert doc is not None, (
                f"booking with utm.gclid=booking-test-456 not found. "
                f"create status={r.status_code} body={str(body)[:300]}"
            )
            stored = doc.get("utm")
            assert stored.get("utm_source") == "google"
            assert stored.get("source_bucket") == "google_ads"
            bid = doc.get("id") or str(doc.get("_id"))
            # Cleanup
            client[DB_NAME].bookings.delete_one({"_id": doc["_id"]})
            print(f"cleaned booking {bid}")
        finally:
            client.close()
