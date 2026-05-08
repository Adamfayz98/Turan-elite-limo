"""End-to-end backend API tests for Turonlimo."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://limo-experience-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@turonlimo.com"
ADMIN_PASSWORD = "TuronAdmin@2025"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def admin_token(session):
    r = session.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data["email"] == ADMIN_EMAIL and data["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="session")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- Public ----------
class TestPublic:
    def test_root(self, session):
        r = session.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_options(self, session):
        r = session.get(f"{API}/options")
        assert r.status_code == 200
        d = r.json()
        for k in ["vehicle_types", "service_types", "booking_statuses"]:
            assert k in d and isinstance(d[k], list) and len(d[k]) > 0
        assert "Executive Sedan" in d["vehicle_types"]
        assert "Airport Transfer" in d["service_types"]
        assert set(d["booking_statuses"]) == {"pending", "confirmed", "completed", "cancelled"}

    def test_create_booking_valid(self, session):
        payload = {
            "full_name": "TEST Jane Doe",
            "email": "test_jane@example.com",
            "phone": "5551234567",
            "service_type": "Airport Transfer",
            "pickup_date": "2026-02-15",
            "pickup_time": "10:30",
            "pickup_location": "SFO Terminal 2",
            "dropoff_location": "Four Seasons SF",
            "passengers": 2,
            "vehicle_type": "Executive Sedan",
            "notes": "Child seat",
        }
        r = session.post(f"{API}/bookings", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "_id" not in d
        assert d["id"] and d["status"] == "pending"
        assert d["full_name"] == payload["full_name"]
        assert d["vehicle_type"] == payload["vehicle_type"]
        assert d["passengers"] == 2

    def test_create_booking_invalid_vehicle(self, session):
        payload = {
            "full_name": "TEST Bad Vehicle",
            "email": "test_bad@example.com",
            "phone": "5550000000",
            "service_type": "Airport Transfer",
            "pickup_date": "2026-02-15",
            "pickup_time": "10:30",
            "pickup_location": "A",
            "dropoff_location": "B",
            "passengers": 1,
            "vehicle_type": "Spaceship",
        }
        r = session.post(f"{API}/bookings", json=payload)
        assert r.status_code == 400

    def test_create_booking_invalid_service(self, session):
        payload = {
            "full_name": "TEST Bad Service",
            "email": "test_bad2@example.com",
            "phone": "5550000000",
            "service_type": "TimeTravel",
            "pickup_date": "2026-02-15",
            "pickup_time": "10:30",
            "pickup_location": "A",
            "dropoff_location": "B",
            "passengers": 1,
            "vehicle_type": "Executive Sedan",
        }
        r = session.post(f"{API}/bookings", json=payload)
        assert r.status_code == 400

    def test_create_contact(self, session):
        payload = {
            "name": "TEST Contact",
            "email": "test_contact@example.com",
            "phone": "5551112222",
            "subject": "Question",
            "message": "Looking for hourly chauffeur in SF.",
        }
        r = session.post(f"{API}/contact", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "_id" not in d
        assert d["id"] and d["status"] == "new"
        assert d["name"] == payload["name"]


# ---------- Admin auth ----------
class TestAdminAuth:
    def test_login_wrong_password(self, session):
        r = session.post(f"{API}/admin/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_login_wrong_email(self, session):
        r = session.post(f"{API}/admin/login", json={"email": "nobody@x.com", "password": "x"})
        assert r.status_code == 401

    def test_admin_me_no_token(self, session):
        r = requests.get(f"{API}/admin/me")
        assert r.status_code == 401

    def test_admin_me_with_token(self, auth_headers):
        r = requests.get(f"{API}/admin/me", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == ADMIN_EMAIL and d["role"] == "admin"

    def test_admin_me_invalid_token(self):
        r = requests.get(f"{API}/admin/me", headers={"Authorization": "Bearer not-a-real-token"})
        assert r.status_code == 401


# ---------- Admin protected ----------
class TestAdminBookings:
    def test_list_bookings_auth_required(self):
        r = requests.get(f"{API}/admin/bookings")
        assert r.status_code == 401

    def test_list_bookings(self, auth_headers):
        r = requests.get(f"{API}/admin/bookings", headers=auth_headers)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        if items:
            assert "_id" not in items[0]
            assert "id" in items[0]

    def test_full_booking_lifecycle(self, session, auth_headers):
        # Create
        payload = {
            "full_name": "TEST Lifecycle",
            "email": "test_lifecycle@example.com",
            "phone": "5550009999",
            "service_type": "Wedding",
            "pickup_date": "2026-03-10",
            "pickup_time": "14:00",
            "pickup_location": "Napa",
            "dropoff_location": "Sonoma",
            "passengers": 4,
            "vehicle_type": "Stretch Limousine",
        }
        c = session.post(f"{API}/bookings", json=payload)
        assert c.status_code == 200
        bid = c.json()["id"]

        # Verify in list
        lst = requests.get(f"{API}/admin/bookings", headers=auth_headers)
        assert lst.status_code == 200
        assert any(b["id"] == bid for b in lst.json())

        # Update status -> confirmed
        u = requests.patch(f"{API}/admin/bookings/{bid}", json={"status": "confirmed"}, headers=auth_headers)
        assert u.status_code == 200, u.text
        assert u.json()["status"] == "confirmed"

        # Invalid status
        bad = requests.patch(f"{API}/admin/bookings/{bid}", json={"status": "weird"}, headers=auth_headers)
        assert bad.status_code == 400

        # Update status -> completed
        u2 = requests.patch(f"{API}/admin/bookings/{bid}", json={"status": "completed"}, headers=auth_headers)
        assert u2.status_code == 200 and u2.json()["status"] == "completed"

        # Delete
        d = requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers)
        assert d.status_code == 200 and d.json().get("deleted") is True

        # Delete again -> 404
        d2 = requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers)
        assert d2.status_code == 404


class TestAdminContacts:
    def test_contact_lifecycle(self, session, auth_headers):
        c = session.post(f"{API}/contact", json={
            "name": "TEST Inquiry Lifecycle",
            "email": "test_inquiry_l@example.com",
            "subject": "Quote",
            "message": "Hello",
        })
        assert c.status_code == 200
        cid = c.json()["id"]

        lst = requests.get(f"{API}/admin/contacts", headers=auth_headers)
        assert lst.status_code == 200
        assert any(x["id"] == cid for x in lst.json())

        m = requests.patch(f"{API}/admin/contacts/{cid}", json={"status": "read"}, headers=auth_headers)
        assert m.status_code == 200 and m.json()["status"] == "read"

        d = requests.delete(f"{API}/admin/contacts/{cid}", headers=auth_headers)
        assert d.status_code == 200

        d2 = requests.delete(f"{API}/admin/contacts/{cid}", headers=auth_headers)
        assert d2.status_code == 404

    def test_list_contacts_auth_required(self):
        r = requests.get(f"{API}/admin/contacts")
        assert r.status_code == 401


class TestStats:
    def test_stats(self, auth_headers):
        r = requests.get(f"{API}/admin/stats", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ["total_bookings", "pending", "confirmed", "completed", "inquiries"]:
            assert k in d and isinstance(d[k], int)

    def test_stats_auth_required(self):
        r = requests.get(f"{API}/admin/stats")
        assert r.status_code == 401
