"""
Backend tests for the new Safety / Anti-Fraud (Phase 1+2+3) system.

Covers:
  * /api/quote-requests risk-scoring enrichment (clean -> green, hostile -> red)
  * /api/admin/safety/blacklist CRUD + silent-accept behavior
  * /api/admin/safety/review-queue + clear-risk endpoints
  * /api/admin/safety/ip-lookup (ip-api.com proxy)
  * /api/admin/safety/pending-otps (MOCK mode surfacing)
  * /api/quote-offer/{token}/send-otp + verify-otp
  * /api/quote-offer/{token}/checkout HTTP 428 phone_verify_required gate
  * Settings safety_* fields PATCH + GET
  * Regression: plain valid quote-request submission still works (no risk fields required by old clients)

Admin auth: mints a JWT directly using JWT_SECRET (bypasses email-based 2FA).
"""
from __future__ import annotations

import os
import sys
import uuid
import time
import pytest
import requests
from datetime import datetime, timezone, timedelta

# JWT minting — same secret used by backend
import jwt as _jwt

# Ensure backend dir is importable for db access (cleanup helper at session end)
sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback for in-container test
    BASE_URL = "http://localhost:8001"

JWT_SECRET = os.environ.get("JWT_SECRET") or "d5b4e1a3c8f47921e6b3d9f1c2a4e7891f5d6c8b3a2e9f1d4c7b8a5e2f1d9c8b"
JWT_ALG = "HS256"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "support@turanelitelimo.com")


def _mint_admin_token() -> str:
    payload = {
        "sub": ADMIN_EMAIL,
        "role": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        "type": "access",
    }
    return _jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


# ----------------------------- Fixtures -----------------------------


@pytest.fixture(scope="session")
def admin_headers():
    return {"Authorization": f"Bearer {_mint_admin_token()}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session", autouse=True)
def _restore_settings_at_end(admin_headers):
    """Snapshot settings before, restore after — never leave phone-verify on."""
    orig = requests.get(f"{BASE_URL}/api/admin/settings", headers=admin_headers, timeout=10).json()
    yield
    try:
        restore = {
            "safety_review_threshold": orig.get("safety_review_threshold", 1500),
            "safety_phone_verify_required": orig.get("safety_phone_verify_required", False),
            "safety_phone_verify_threshold": orig.get("safety_phone_verify_threshold", 0),
        }
        requests.patch(f"{BASE_URL}/api/admin/settings", json=restore, headers=admin_headers, timeout=10)
    except Exception:
        pass


# ----------------------------- Tests -----------------------------


class TestAdminAuthSanity:
    def test_admin_me_with_minted_token(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/me", headers=admin_headers, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json().get("role") == "admin"


# --- Risk scoring on submission ---


class TestQuoteRequestRiskScoring:
    def test_clean_submission_green_band(self, s):
        payload = {
            "full_name": "Jane Smith",
            "phone": "(415) 555-1234",
            "email": f"clean.test.{uuid.uuid4().hex[:6]}@gmail.com",
            "vehicle_type": "Sedan",
            "pickup_date": "2026-06-01",
            "pickup_time": "10:00",
            "pickup_location": "100 Main St, San Francisco, CA 94103",
            "dropoff_location": "200 Geary St, San Francisco, CA 94102",
            "passengers": 2,
            "occasion": "TEST_clean",
        }
        # Use a normal browser UA, no XFF -> ingress will set internal IP
        r = s.post(
            f"{BASE_URL}/api/quote-requests",
            json=payload,
            headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 Chrome/120 Safari/537.36"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "id" in body
        # Fetch via admin list
        token = _mint_admin_token()
        time.sleep(0.3)
        admin_r = requests.get(
            f"{BASE_URL}/api/admin/quote-requests",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        assert admin_r.status_code == 200
        found = next((q for q in admin_r.json() if q.get("id") == body["id"]), None)
        assert found is not None, "submitted quote not found in admin list"
        # Risk fields should exist
        assert "risk_score" in found and "risk_band" in found
        assert found["risk_band"] == "green", f"expected green band, got {found['risk_band']} score={found.get('risk_score')} flags={found.get('risk_flags')}"
        assert found.get("blacklisted") is False

    def test_high_risk_submission_red_band(self, s):
        payload = {
            "full_name": "John 123 Doe",
            "phone": "(415) 555-9988",
            "email": f"throwaway{uuid.uuid4().hex[:5]}@mailinator.com",
            "vehicle_type": "Sedan",
            "pickup_date": "2026-06-01",
            "pickup_time": "10:00",
            "pickup_location": "100 Main St, San Francisco, CA 94103",
            "dropoff_location": "200 Geary St, San Francisco, CA 94102",
            "passengers": 2,
            "occasion": "TEST_hostile",
        }
        r = s.post(
            f"{BASE_URL}/api/quote-requests",
            json=payload,
            headers={"X-Forwarded-For": "8.8.8.8", "User-Agent": "python-requests/2.31"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        rid = r.json()["id"]

        token = _mint_admin_token()
        time.sleep(0.3)
        admin_r = requests.get(
            f"{BASE_URL}/api/admin/quote-requests",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        found = next((q for q in admin_r.json() if q.get("id") == rid), None)
        assert found is not None
        assert found.get("ip_address") == "8.8.8.8"
        assert "python-requests" in (found.get("user_agent") or "")
        assert found.get("risk_band") in ("red", "yellow"), f"expected red/yellow, got {found.get('risk_band')} score={found.get('risk_score')}"
        # Should have multiple flags including disposable + ua_bot + name_has_digits
        flag_codes = [f.get("code") for f in (found.get("risk_flags") or [])]
        assert "email_disposable" in flag_codes
        assert "ua_bot_like" in flag_codes
        assert "name_has_digits" in flag_codes


# --- Blacklist CRUD + silent-accept ---


class TestBlacklistCRUD:
    def test_blacklist_add_list_silent_accept_and_delete(self, s, admin_headers):
        domain_val = f"@evil-{uuid.uuid4().hex[:6]}.test"
        # CREATE
        r = requests.post(
            f"{BASE_URL}/api/admin/safety/blacklist",
            json={"kind": "email", "value": domain_val, "reason": "TEST_automated"},
            headers=admin_headers, timeout=10,
        )
        assert r.status_code == 200, r.text
        entry = r.json()
        eid = entry["id"]
        assert entry["kind"] == "email" and entry["value"] == domain_val

        # GET list
        lr = requests.get(f"{BASE_URL}/api/admin/safety/blacklist", headers=admin_headers, timeout=10)
        assert lr.status_code == 200
        ids = [e["id"] for e in lr.json()]
        assert eid in ids

        # Submit a quote with matching disposable domain via wildcard → silent accept + blacklisted=true
        bad_email = f"victim{uuid.uuid4().hex[:5]}{domain_val}"
        q = s.post(
            f"{BASE_URL}/api/quote-requests",
            json={
                "full_name": "Black List User",
                "phone": "(415) 555-7777",
                "email": bad_email,
                "vehicle_type": "Sedan",
                "pickup_location": "1 Mkt St, San Francisco, CA 94103",
                "dropoff_location": "100 Bay St, San Francisco, CA 94133",
                "occasion": "TEST_blacklist",
            },
            timeout=20,
        )
        assert q.status_code == 200, q.text
        qid = q.json()["id"]
        time.sleep(0.3)
        admin_q = requests.get(f"{BASE_URL}/api/admin/quote-requests", headers=admin_headers, timeout=15).json()
        found = next((x for x in admin_q if x.get("id") == qid), None)
        assert found is not None
        assert found.get("blacklisted") is True
        assert found.get("risk_band") in ("yellow", "red")

        # DELETE
        d = requests.delete(f"{BASE_URL}/api/admin/safety/blacklist/{eid}", headers=admin_headers, timeout=10)
        assert d.status_code == 200
        # Verify removed
        lr2 = requests.get(f"{BASE_URL}/api/admin/safety/blacklist", headers=admin_headers, timeout=10).json()
        assert eid not in [e["id"] for e in lr2]

    def test_blacklist_validation(self, admin_headers):
        # bad kind
        r = requests.post(
            f"{BASE_URL}/api/admin/safety/blacklist",
            json={"kind": "spaghetti", "value": "foo"},
            headers=admin_headers, timeout=10,
        )
        assert r.status_code == 400
        # missing value
        r = requests.post(
            f"{BASE_URL}/api/admin/safety/blacklist",
            json={"kind": "email", "value": ""},
            headers=admin_headers, timeout=10,
        )
        assert r.status_code == 400


# --- Review queue + clear-risk ---


class TestReviewQueueAndClear:
    def test_review_queue_contains_red_and_clear_removes(self, s, admin_headers):
        # Submit a fresh red-risk quote
        q = s.post(
            f"{BASE_URL}/api/quote-requests",
            json={
                "full_name": "Test 99 Reviewer",
                "phone": "(415) 555-3344",
                "email": f"trash{uuid.uuid4().hex[:5]}@mailinator.com",
                "vehicle_type": "Sedan",
                "pickup_location": "1 Mkt St, San Francisco, CA 94103",
                "dropoff_location": "100 Bay St, San Francisco, CA 94133",
                "occasion": "TEST_reviewq",
            },
            headers={"X-Forwarded-For": "1.1.1.1", "User-Agent": "curl/8.0"},
            timeout=20,
        )
        assert q.status_code == 200
        qid = q.json()["id"]

        rq = requests.get(f"{BASE_URL}/api/admin/safety/review-queue", headers=admin_headers, timeout=15)
        assert rq.status_code == 200, rq.text
        data = rq.json()
        assert "quotes" in data and "bookings" in data and "threshold" in data
        in_q = any(x.get("id") == qid for x in data["quotes"])
        assert in_q, f"red-risk quote {qid} not in review queue"

        # Clear risk
        cr = requests.post(
            f"{BASE_URL}/api/admin/safety/quote-requests/{qid}/clear-risk",
            headers=admin_headers, timeout=10,
        )
        assert cr.status_code == 200
        assert cr.json().get("cleared") is True

        # Verify removed from queue
        rq2 = requests.get(f"{BASE_URL}/api/admin/safety/review-queue", headers=admin_headers, timeout=15).json()
        assert not any(x.get("id") == qid for x in rq2["quotes"])

    def test_clear_risk_bookings_404_unknown(self, admin_headers):
        r = requests.post(
            f"{BASE_URL}/api/admin/safety/bookings/nonexistent-id-xyz/clear-risk",
            headers=admin_headers, timeout=10,
        )
        assert r.status_code == 404


# --- IP lookup ---


class TestIpLookup:
    def test_ip_lookup_returns_geo(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/admin/safety/ip-lookup",
            params={"ip": "8.8.8.8"},
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ip") == "8.8.8.8"
        geo = body.get("geo") or {}
        # ip-api may rate-limit; tolerate empty geo but log
        if geo:
            assert "country" in geo
            assert "isp" in geo
            assert "proxy" in geo
            assert "hosting" in geo
        else:
            pytest.skip("ip-api.com did not return geo (rate limit or network)")


# --- OTP flow (MOCKED) ---


class TestPhoneOTP:
    def test_full_otp_flow_mocked(self, s, admin_headers):
        # Need a quote with confirm_token. Submit a quote then set quoted_price + confirm_token via admin
        # Use admin_update_quote_request flow
        q = s.post(
            f"{BASE_URL}/api/quote-requests",
            json={
                "full_name": "OTP Tester",
                "phone": "(415) 555-1010",
                "email": f"otp{uuid.uuid4().hex[:5]}@gmail.com",
                "vehicle_type": "Sedan",
                "pickup_location": "1 Mkt St, San Francisco, CA 94103",
                "dropoff_location": "100 Bay St, San Francisco, CA 94133",
                "occasion": "TEST_otp",
            },
            timeout=20,
        )
        assert q.status_code == 200
        qid = q.json()["id"]

        # Quote a price → server mints confirm_token
        up = requests.patch(
            f"{BASE_URL}/api/admin/quote-requests/{qid}",
            json={"quoted_price": 250.0, "deposit_pct": 50},
            headers=admin_headers, timeout=10,
        )
        assert up.status_code in (200, 204), up.text
        confirm_token = up.json().get("confirm_token")
        assert confirm_token, f"server did not return confirm_token: {up.json()}"

        # Now send OTP via public endpoint
        sr = s.post(f"{BASE_URL}/api/quote-offer/{confirm_token}/send-otp", json={}, timeout=15)
        assert sr.status_code == 200, sr.text
        body = sr.json()
        assert body.get("ok") is True
        assert body.get("mocked") is True
        assert body.get("phone_last4") == "1010"

        # Wrong code
        bad = s.post(
            f"{BASE_URL}/api/quote-offer/{confirm_token}/verify-otp",
            json={"code": "000000"}, timeout=15,
        )
        assert bad.status_code == 400

        # Get the code from pending-otps
        po = requests.get(f"{BASE_URL}/api/admin/safety/pending-otps", headers=admin_headers, timeout=10)
        assert po.status_code == 200
        # phone digits-only is 4155551010
        entry = next((o for o in po.json() if o.get("phone") == "4155551010" and o.get("purpose") == "quote_confirm"), None)
        assert entry is not None, f"OTP not found in pending list; pending={po.json()}"
        code = entry["code"]
        assert len(code) == 6

        # Verify with right code
        ok = s.post(
            f"{BASE_URL}/api/quote-offer/{confirm_token}/verify-otp",
            json={"code": code}, timeout=15,
        )
        assert ok.status_code == 200, ok.text
        assert ok.json().get("ok") is True

    def test_send_otp_unknown_token(self, s):
        r = s.post(f"{BASE_URL}/api/quote-offer/nope-bad-token/send-otp", json={}, timeout=10)
        assert r.status_code == 404


# --- Settings safety_* fields ---


class TestSafetySettings:
    def test_get_and_patch_safety_settings(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/settings", headers=admin_headers, timeout=10)
        assert r.status_code == 200
        body = r.json()
        for k in ("safety_review_threshold", "safety_phone_verify_required", "safety_phone_verify_threshold"):
            assert k in body, f"missing {k} in GET /admin/settings"

        # PATCH
        p = requests.patch(
            f"{BASE_URL}/api/admin/settings",
            json={"safety_review_threshold": 1234.0,
                  "safety_phone_verify_required": True,
                  "safety_phone_verify_threshold": 100.0},
            headers=admin_headers, timeout=10,
        )
        assert p.status_code in (200, 204), p.text

        # Re-fetch
        r2 = requests.get(f"{BASE_URL}/api/admin/settings", headers=admin_headers, timeout=10).json()
        assert r2["safety_review_threshold"] == 1234.0
        assert r2["safety_phone_verify_required"] is True
        assert r2["safety_phone_verify_threshold"] == 100.0

        # Revert phone_verify_required so other tests aren't impacted (autouse fixture also restores)
        requests.patch(
            f"{BASE_URL}/api/admin/settings",
            json={"safety_phone_verify_required": False, "safety_phone_verify_threshold": 0.0},
            headers=admin_headers, timeout=10,
        )

    def test_negative_threshold_rejected(self, admin_headers):
        p = requests.patch(
            f"{BASE_URL}/api/admin/settings",
            json={"safety_review_threshold": -5},
            headers=admin_headers, timeout=10,
        )
        assert p.status_code in (400, 422)


# --- 428 phone-verify gate on checkout ---


class TestCheckout428Gate:
    def test_checkout_returns_428_when_gate_on(self, s, admin_headers):
        # Submit quote, set quoted_price + confirm_token
        q = s.post(
            f"{BASE_URL}/api/quote-requests",
            json={
                "full_name": "Gate Tester",
                "phone": "(415) 555-2020",
                "email": f"gate{uuid.uuid4().hex[:5]}@gmail.com",
                "vehicle_type": "Sedan",
                "pickup_location": "1 Mkt St, San Francisco, CA 94103",
                "dropoff_location": "100 Bay St, San Francisco, CA 94133",
                "occasion": "TEST_gate",
            },
            timeout=20,
        )
        assert q.status_code == 200
        qid = q.json()["id"]

        confirm_token = None
        up = requests.patch(
            f"{BASE_URL}/api/admin/quote-requests/{qid}",
            json={"quoted_price": 250.0, "deposit_pct": 50},
            headers=admin_headers, timeout=10,
        )
        assert up.status_code in (200, 204), up.text
        confirm_token = up.json().get("confirm_token")
        assert confirm_token, f"server did not return confirm_token: {up.json()}"

        # Turn gate ON
        requests.patch(
            f"{BASE_URL}/api/admin/settings",
            json={"safety_phone_verify_required": True, "safety_phone_verify_threshold": 0.0},
            headers=admin_headers, timeout=10,
        )

        try:
            # Trigger checkout without verifying — expect 428 phone_verify_required
            co = s.post(
                f"{BASE_URL}/api/quote-offer/{confirm_token}/checkout",
                json={"origin_url": BASE_URL},
                timeout=15,
            )
            assert co.status_code == 428, f"expected 428, got {co.status_code} body={co.text}"
            # detail should be phone_verify_required
            assert "phone_verify_required" in co.text
        finally:
            # turn gate OFF
            requests.patch(
                f"{BASE_URL}/api/admin/settings",
                json={"safety_phone_verify_required": False, "safety_phone_verify_threshold": 0.0},
                headers=admin_headers, timeout=10,
            )


# --- Regression: plain quote-request submission ---


class TestRegressionPlainQuoteRequest:
    def test_plain_quote_request_submission_works(self, s):
        payload = {
            "full_name": "Regression Smith",
            "phone": "(415) 555-9000",
            "email": f"regress{uuid.uuid4().hex[:5]}@gmail.com",
            "vehicle_type": "SUV",
            "pickup_location": "300 Mission St, San Francisco, CA 94105",
            "dropoff_location": "500 Howard St, San Francisco, CA 94105",
            "passengers": 4,
            "occasion": "TEST_regression",
        }
        r = s.post(f"{BASE_URL}/api/quote-requests", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        b = r.json()
        assert b.get("ok") is True and "id" in b
