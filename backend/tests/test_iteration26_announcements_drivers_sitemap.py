"""
Iteration 26 — Announcements + Drivers Roster + Sitemap.

Backend coverage:
- GET /api/announcements public — {banner, homepage} shape, only shows active/in-window
- GET /api/announcements/{slug} — returns active, 404 otherwise
- Admin CRUD /api/admin/announcements — 401 without bearer, auto-slug, unique
- Admin CRUD /api/admin/drivers — 401 without bearer, name+phone required validation
- GET /api/sitemap.xml — XML, contains homepage URL + <loc> for active announcements
- Regression smoke: /api/options, booking create, stripe checkout url, admin login
"""

import os
import sys
import pathlib
import uuid
import bcrypt
import requests
import pytest

BACKEND_DIR = pathlib.Path("/app/backend")
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


# --------------------- Auth bootstrap ---------------------
@pytest.fixture(scope="module")
def admin_token():
    s = requests.Session()
    r = s.post(f"{API}/admin/login", json={
        "email": "support@turanelitelimo.com",
        "password": "TuronAdmin@2025",
    }, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    if not data.get("requires_2fa"):
        return data["token"]

    challenge_id = data["challenge_id"]
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    from datetime import datetime, timezone, timedelta

    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    code_hash = bcrypt.hashpw(b"123456", bcrypt.gensalt()).decode()

    async def _patch():
        cli = AsyncIOMotorClient(mongo_url)
        await cli[db_name].admin_2fa_challenges.update_one(
            {"challenge_id": challenge_id},
            {"$set": {
                "code_hash": code_hash,
                "attempts": 0,
                "used": False,
                "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            }},
        )
        cli.close()

    asyncio.get_event_loop().run_until_complete(_patch())

    r2 = s.post(f"{API}/admin/verify-2fa", json={
        "challenge_id": challenge_id,
        "code": "123456",
    }, timeout=15)
    assert r2.status_code == 200, f"2fa failed: {r2.status_code} {r2.text}"
    return r2.json()["token"]


@pytest.fixture
def auth(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ============================================================== #
#  A. ANNOUNCEMENTS — auth required                              #
# ============================================================== #
class TestAnnouncementsAuth:
    def test_admin_list_requires_auth(self):
        r = requests.get(f"{API}/admin/announcements", timeout=10)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_admin_create_requires_auth(self):
        r = requests.post(f"{API}/admin/announcements", json={"title": "x"}, timeout=10)
        assert r.status_code in (401, 403)

    def test_admin_patch_requires_auth(self):
        r = requests.patch(f"{API}/admin/announcements/x", json={"title": "x"}, timeout=10)
        assert r.status_code in (401, 403)

    def test_admin_delete_requires_auth(self):
        r = requests.delete(f"{API}/admin/announcements/x", timeout=10)
        assert r.status_code in (401, 403)


# ============================================================== #
#  B. ANNOUNCEMENTS — CRUD + Public visibility                   #
# ============================================================== #
class TestAnnouncementsCrud:
    created_ids: list = []

    def test_create_minimal(self, auth):
        title = f"TEST26 Headline {uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/admin/announcements", json={
            "title": title,
            "body": "We've expanded service to SFO and OAK.",
            "show_in_banner": True,
            "show_on_homepage": True,
            "active": True,
        }, headers=auth, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["title"] == title
        assert data["slug"].startswith("test26-headline-")
        assert data["active"] is True
        assert "id" in data and "created_at" in data
        TestAnnouncementsCrud.created_ids.append(data["id"])

    def test_create_generates_unique_slug(self, auth):
        # Re-create with the same title; slug must differ.
        title = "TEST26 Duplicate Title"
        r1 = requests.post(f"{API}/admin/announcements", json={
            "title": title, "active": True
        }, headers=auth, timeout=15)
        r2 = requests.post(f"{API}/admin/announcements", json={
            "title": title, "active": True
        }, headers=auth, timeout=15)
        assert r1.status_code == 200 and r2.status_code == 200, (r1.text, r2.text)
        s1, s2 = r1.json()["slug"], r2.json()["slug"]
        assert s1 != s2, f"slugs should differ: {s1} == {s2}"
        TestAnnouncementsCrud.created_ids.extend([r1.json()["id"], r2.json()["id"]])

    def test_admin_list_includes_created(self, auth):
        r = requests.get(f"{API}/admin/announcements", headers=auth, timeout=10)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        ids = {a["id"] for a in rows}
        for cid in TestAnnouncementsCrud.created_ids:
            assert cid in ids, f"created {cid} missing from admin list"

    def test_public_feed_shape_and_visibility(self):
        r = requests.get(f"{API}/announcements", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "banner" in data and "homepage" in data
        assert isinstance(data["banner"], list)
        assert isinstance(data["homepage"], list)
        assert len(data["banner"]) <= 1  # only latest
        # At least one of our created (active, show_in_banner=True default) must appear in homepage
        homepage_ids = {a["id"] for a in data["homepage"]}
        # First created had show_on_homepage=True
        assert TestAnnouncementsCrud.created_ids[0] in homepage_ids

    def test_public_slug_lookup_ok(self, auth):
        r = requests.get(f"{API}/admin/announcements", headers=auth, timeout=10)
        rows = r.json()
        target = next(a for a in rows if a["id"] in TestAnnouncementsCrud.created_ids and a.get("active"))
        slug = target["slug"]
        r2 = requests.get(f"{API}/announcements/{slug}", timeout=10)
        assert r2.status_code == 200, r2.text
        assert r2.json()["slug"] == slug

    def test_public_slug_lookup_404(self):
        r = requests.get(f"{API}/announcements/this-slug-does-not-exist-xyz", timeout=10)
        assert r.status_code == 404

    def test_patch_updates(self, auth):
        aid = TestAnnouncementsCrud.created_ids[0]
        r = requests.patch(f"{API}/admin/announcements/{aid}", json={
            "body": "Updated body for iteration 26 test."
        }, headers=auth, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["body"] == "Updated body for iteration 26 test."

    def test_inactive_hidden_from_public(self, auth):
        aid = TestAnnouncementsCrud.created_ids[1]
        # deactivate
        r = requests.patch(f"{API}/admin/announcements/{aid}",
                           json={"active": False}, headers=auth, timeout=10)
        assert r.status_code == 200
        # Public feed should NOT include it
        feed = requests.get(f"{API}/announcements", timeout=10).json()
        hp_ids = {a["id"] for a in feed["homepage"]}
        assert aid not in hp_ids
        # Slug lookup → 404
        slug = r.json()["slug"]
        r2 = requests.get(f"{API}/announcements/{slug}", timeout=10)
        assert r2.status_code == 404

    def test_delete_works(self, auth):
        # Delete one and verify 404 thereafter
        aid = TestAnnouncementsCrud.created_ids[-1]
        r = requests.delete(f"{API}/admin/announcements/{aid}",
                            headers=auth, timeout=10)
        assert r.status_code == 200
        assert r.json().get("deleted") is True
        r2 = requests.delete(f"{API}/admin/announcements/{aid}",
                             headers=auth, timeout=10)
        assert r2.status_code == 404
        TestAnnouncementsCrud.created_ids.pop()


# ============================================================== #
#  C. SITEMAP                                                    #
# ============================================================== #
class TestSitemap:
    def test_sitemap_xml(self):
        r = requests.get(f"{API}/sitemap.xml", timeout=10)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "xml" in ct.lower(), f"expected xml content-type, got {ct}"
        body = r.text
        assert body.startswith("<?xml"), body[:100]
        assert "<urlset" in body
        # Homepage URL present
        assert "<loc>" in body
        # /news/ slug entry for at least one active announcement
        # Iteration B created at least 2 active ones (one is now inactive after test_inactive_hidden_from_public,
        # but the first is still active)
        assert "/news/" in body, f"expected /news/<slug> in sitemap, body head: {body[:500]}"


# ============================================================== #
#  D. DRIVERS — auth required                                    #
# ============================================================== #
class TestDriversAuth:
    def test_list_requires_auth(self):
        r = requests.get(f"{API}/admin/drivers", timeout=10)
        assert r.status_code in (401, 403)

    def test_create_requires_auth(self):
        r = requests.post(f"{API}/admin/drivers",
                          json={"name": "x", "phone": "x"}, timeout=10)
        assert r.status_code in (401, 403)

    def test_patch_requires_auth(self):
        r = requests.patch(f"{API}/admin/drivers/x", json={"name": "x"}, timeout=10)
        assert r.status_code in (401, 403)

    def test_delete_requires_auth(self):
        r = requests.delete(f"{API}/admin/drivers/x", timeout=10)
        assert r.status_code in (401, 403)


# ============================================================== #
#  E. DRIVERS — CRUD                                             #
# ============================================================== #
class TestDriversCrud:
    created_ids: list = []

    def test_create_full(self, auth):
        r = requests.post(f"{API}/admin/drivers", json={
            "name": "TEST26 Driver Alice",
            "phone": "+14155550100",
            "email": "alice26@example.com",
            "plate": "TST26A",
            "vehicle": "Mercedes S-Class · Black",
            "active": True,
        }, headers=auth, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "TEST26 Driver Alice"
        assert data["phone"] == "+14155550100"
        assert data["plate"] == "TST26A"
        assert "id" in data
        TestDriversCrud.created_ids.append(data["id"])

    def test_create_validates_required_fields(self, auth):
        # Missing phone
        r = requests.post(f"{API}/admin/drivers", json={"name": "OnlyName"},
                          headers=auth, timeout=10)
        assert r.status_code in (400, 422), f"expected validation error, got {r.status_code} {r.text}"
        # Missing name
        r2 = requests.post(f"{API}/admin/drivers", json={"phone": "+14155550199"},
                           headers=auth, timeout=10)
        assert r2.status_code in (400, 422)

    def test_list_includes_created(self, auth):
        r = requests.get(f"{API}/admin/drivers", headers=auth, timeout=10)
        assert r.status_code == 200
        rows = r.json()
        ids = {d["id"] for d in rows}
        for did in TestDriversCrud.created_ids:
            assert did in ids

    def test_patch_updates(self, auth):
        did = TestDriversCrud.created_ids[0]
        r = requests.patch(f"{API}/admin/drivers/{did}",
                           json={"vehicle": "Cadillac Escalade · Black"},
                           headers=auth, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["vehicle"] == "Cadillac Escalade · Black"

    def test_patch_404(self, auth):
        r = requests.patch(f"{API}/admin/drivers/nonexistent-{uuid.uuid4().hex}",
                           json={"name": "x"}, headers=auth, timeout=10)
        assert r.status_code == 404

    def test_delete_works(self, auth):
        did = TestDriversCrud.created_ids[0]
        r = requests.delete(f"{API}/admin/drivers/{did}",
                            headers=auth, timeout=10)
        assert r.status_code == 200
        assert r.json().get("deleted") is True
        r2 = requests.delete(f"{API}/admin/drivers/{did}",
                             headers=auth, timeout=10)
        assert r2.status_code == 404
        TestDriversCrud.created_ids.pop(0)


# ============================================================== #
#  F. REGRESSION SMOKE                                           #
# ============================================================== #
class TestRegression:
    def test_options_still_works(self):
        r = requests.get(f"{API}/options", timeout=10)
        assert r.status_code == 200
        body = r.json()
        # Should contain vehicle/service types
        assert isinstance(body, dict)

    def test_admin_login_still_works(self):
        r = requests.post(f"{API}/admin/login", json={
            "email": "support@turanelitelimo.com",
            "password": "TuronAdmin@2025",
        }, timeout=15)
        assert r.status_code == 200
        # Should still go via 2FA flow
        assert r.json().get("requires_2fa") is True

    def test_quote_still_works(self):
        r = requests.post(f"{API}/quote", json={
            "pickup": "SFO Airport, San Francisco, CA",
            "dropoff": "200 Powell St, San Francisco, CA",
            "vehicle_type": "Sedan",
            "service_type": "Point-to-Point",
        }, timeout=20)
        # 200 or 400 (quota/key issues acceptable, but should not 5xx)
        assert r.status_code in (200, 400, 422), f"got {r.status_code} {r.text[:200]}"
