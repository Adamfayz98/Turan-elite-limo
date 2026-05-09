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


# ---------- Iteration 2: new optional booking fields ----------
class TestBookingNewFields:
    def test_booking_with_all_new_fields(self, session, auth_headers):
        payload = {
            "full_name": "TEST New Fields",
            "email": "test_newfields@example.com",
            "phone": "5551234567",
            "service_type": "Wine Tour",
            "pickup_date": "2026-04-20",
            "pickup_time": "09:00",
            "pickup_location": "Hotel Drisco",
            "dropoff_location": "Domaine Carneros",
            "passengers": 4,
            "luggage_count": 6,
            "child_seat": True,
            "additional_stops": ["Schramsberg Vineyards", "Castello di Amorosa"],
            "return_trip": True,
            "return_location": "Hotel Drisco",
            "vehicle_type": "Luxury SUV",
            "notes": "Anniversary tour",
        }
        r = session.post(f"{API}/bookings", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        bid = d["id"]
        assert d["luggage_count"] == 6
        assert d["child_seat"] is True
        assert d["additional_stops"] == ["Schramsberg Vineyards", "Castello di Amorosa"]
        assert d["return_trip"] is True
        assert d["return_location"] == "Hotel Drisco"

        # GET via admin to verify persistence
        lst = requests.get(f"{API}/admin/bookings", headers=auth_headers)
        assert lst.status_code == 200
        match = next((b for b in lst.json() if b["id"] == bid), None)
        assert match is not None
        assert match["luggage_count"] == 6
        assert match["child_seat"] is True
        assert match["additional_stops"] == ["Schramsberg Vineyards", "Castello di Amorosa"]
        assert match["return_trip"] is True
        assert match["return_location"] == "Hotel Drisco"
        assert "_id" not in match

        # Cleanup
        requests.delete(f"{API}/admin/bookings/{bid}", headers=auth_headers)

    def test_booking_backwards_compat_defaults(self, session, auth_headers):
        # Submit without any new fields
        payload = {
            "full_name": "TEST Backwards Compat",
            "email": "test_bw@example.com",
            "phone": "5550000001",
            "service_type": "Airport Transfer",
            "pickup_date": "2026-05-01",
            "pickup_time": "08:00",
            "pickup_location": "SFO",
            "dropoff_location": "SF Marriott",
            "passengers": 1,
            "vehicle_type": "Executive Sedan",
        }
        r = session.post(f"{API}/bookings", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        # Defaults applied
        assert d["luggage_count"] == 0
        assert d["child_seat"] is False
        assert d["additional_stops"] == []
        assert d["return_trip"] is False
        assert d["return_location"] == ""

        # Cleanup
        requests.delete(f"{API}/admin/bookings/{d['id']}", headers=auth_headers)

    def test_booking_partial_new_fields(self, session, auth_headers):
        # Only some new fields
        payload = {
            "full_name": "TEST Partial",
            "email": "test_partial@example.com",
            "phone": "5550000002",
            "service_type": "Corporate / Executive",
            "pickup_date": "2026-05-10",
            "pickup_time": "07:30",
            "pickup_location": "Office",
            "dropoff_location": "Airport",
            "passengers": 2,
            "luggage_count": 3,
            "additional_stops": ["Coffee Shop"],
            "vehicle_type": "Executive Sedan",
        }
        r = session.post(f"{API}/bookings", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["luggage_count"] == 3
        assert d["additional_stops"] == ["Coffee Shop"]
        assert d["child_seat"] is False
        assert d["return_trip"] is False
        assert d["return_location"] == ""
        requests.delete(f"{API}/admin/bookings/{d['id']}", headers=auth_headers)

    def test_booking_luggage_validation(self, session):
        # Negative luggage should fail
        payload = {
            "full_name": "TEST Bad Luggage",
            "email": "test_bl@example.com",
            "phone": "5550000003",
            "service_type": "Airport Transfer",
            "pickup_date": "2026-05-15",
            "pickup_time": "10:00",
            "pickup_location": "A",
            "dropoff_location": "B",
            "passengers": 1,
            "luggage_count": -5,
            "vehicle_type": "Executive Sedan",
        }
        r = session.post(f"{API}/bookings", json=payload)
        assert r.status_code == 422  # Pydantic validation error


# ---------- Iteration 4: Quote endpoint + S-Class (renamed from Luxury Sedan) ----------
EXPECTED_VEHICLE_ORDER = [
    "Executive Sedan",
    "S-Class",
    "Luxury SUV",
    "Stretch Limousine",
    "Sprinter Van",
    "Party Bus",
]


class TestQuote:
    def test_options_includes_s_class(self, session):
        r = session.get(f"{API}/options")
        assert r.status_code == 200
        vts = r.json()["vehicle_types"]
        assert "S-Class" in vts
        assert "Luxury Sedan" not in vts
        assert "Premium SUV" not in vts
        assert vts == EXPECTED_VEHICLE_ORDER

    def test_quote_valid_addresses(self, session):
        r = session.post(f"{API}/quote", json={
            "pickup_location": "SFO",
            "dropoff_location": "Pier 39 San Francisco",
        }, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["fallback"] is False
        assert d["distance_miles"] is not None and d["distance_miles"] > 0
        assert isinstance(d["quotes"], list) and len(d["quotes"]) == 6
        by_v = {q["vehicle_type"]: q for q in d["quotes"]}
        assert "Luxury Sedan" not in by_v
        assert "S-Class" in by_v
        for vt in ["Executive Sedan", "S-Class", "Luxury SUV"]:
            q = by_v[vt]
            assert q["price"] is not None and q["price"] > 0
            assert q["formatted_price"] and q["formatted_price"].startswith("$")
            assert q["message"] == "Estimated flat rate"
        for vt in ["Stretch Limousine", "Sprinter Van", "Party Bus"]:
            q = by_v[vt]
            assert q["price"] is None
            assert q["message"] == "Call for quote"

    def test_quote_pricing_math(self, session):
        r = session.post(f"{API}/quote", json={
            "pickup_location": "SFO",
            "dropoff_location": "Palo Alto",
        }, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        if d["fallback"]:
            pytest.skip("Geocoding unavailable for math test")
        miles = d["distance_miles"]
        by_v = {q["vehicle_type"]: q for q in d["quotes"]}
        assert by_v["Executive Sedan"]["price"] == round(max(75.0 + 3.50 * miles, 85.0), 2)
        assert by_v["S-Class"]["price"] == round(max(95.0 + 4.50 * miles, 115.0), 2)
        assert by_v["Luxury SUV"]["price"] == round(max(115.0 + 4.75 * miles, 135.0), 2)

    def test_quote_invalid_addresses_fallback(self, session):
        r = session.post(f"{API}/quote", json={
            "pickup_location": "zzqqxxnonsense12345abc",
            "dropoff_location": "qqzznonsense67890xyz",
        }, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["fallback"] is True
        assert d["distance_miles"] is None
        by_v = {q["vehicle_type"]: q for q in d["quotes"]}
        for vt in ["Executive Sedan", "S-Class", "Luxury SUV"]:
            assert by_v[vt]["price"] is None
            assert by_v[vt]["message"] == "Enter pickup & drop-off for an estimate"

    def test_booking_with_s_class(self, session, auth_headers):
        payload = {
            "full_name": "TEST S-Class",
            "email": "test_sclass@example.com",
            "phone": "5550001111",
            "service_type": "Corporate / Executive",
            "pickup_date": "2026-06-01",
            "pickup_time": "09:00",
            "pickup_location": "SFO",
            "dropoff_location": "Palo Alto",
            "passengers": 2,
            "vehicle_type": "S-Class",
        }
        r = session.post(f"{API}/bookings", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["vehicle_type"] == "S-Class"
        requests.delete(f"{API}/admin/bookings/{d['id']}", headers=auth_headers)

    def test_booking_rejects_legacy_luxury_sedan(self, session):
        payload = {
            "full_name": "TEST Legacy Luxury",
            "email": "test_legacy@example.com",
            "phone": "5550001234",
            "service_type": "Airport Transfer",
            "pickup_date": "2026-06-02",
            "pickup_time": "09:00",
            "pickup_location": "SFO",
            "dropoff_location": "Palo Alto",
            "passengers": 1,
            "vehicle_type": "Luxury Sedan",
        }
        r = session.post(f"{API}/bookings", json=payload)
        assert r.status_code == 400


# ---------- Iteration 4: Admin pricing endpoints ----------
DEFAULT_PRICING = {
    "Executive Sedan": {"base": 75.0, "per_mile": 3.50, "minimum": 85.0, "call_only": False},
    "S-Class": {"base": 95.0, "per_mile": 4.50, "minimum": 115.0, "call_only": False},
    "Luxury SUV": {"base": 115.0, "per_mile": 4.75, "minimum": 135.0, "call_only": False},
    "Stretch Limousine": {"base": 0.0, "per_mile": 0.0, "minimum": 0.0, "call_only": True},
    "Sprinter Van": {"base": 0.0, "per_mile": 0.0, "minimum": 0.0, "call_only": True},
    "Party Bus": {"base": 0.0, "per_mile": 0.0, "minimum": 0.0, "call_only": True},
}


def _reset_pricing(auth_headers):
    """Reset every pricing row back to its default."""
    for vt, defaults in DEFAULT_PRICING.items():
        requests.patch(
            f"{API}/admin/pricing/{vt}",
            json=defaults,
            headers=auth_headers,
            timeout=15,
        )


class TestAdminPricing:
    def test_list_pricing_auth_required(self):
        r = requests.get(f"{API}/admin/pricing")
        assert r.status_code == 401

    def test_list_pricing_returns_canonical_order(self, auth_headers):
        r = requests.get(f"{API}/admin/pricing", headers=auth_headers)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and len(rows) == 6
        assert [row["vehicle_type"] for row in rows] == EXPECTED_VEHICLE_ORDER
        # Each row has all required fields
        for row in rows:
            for k in ["vehicle_type", "base", "per_mile", "minimum", "call_only"]:
                assert k in row, f"missing {k} in {row}"
            assert "_id" not in row

    def test_patch_pricing_partial_update_persists(self, auth_headers):
        # Update Executive Sedan: base=80, per_mile=4 (do NOT touch minimum/call_only)
        try:
            r = requests.patch(
                f"{API}/admin/pricing/Executive Sedan",
                json={"base": 80, "per_mile": 4},
                headers=auth_headers,
                timeout=15,
            )
            assert r.status_code == 200, r.text
            updated = r.json()
            assert updated["vehicle_type"] == "Executive Sedan"
            assert updated["base"] == 80.0
            assert updated["per_mile"] == 4.0
            assert updated["minimum"] == 85.0  # unchanged
            assert updated["call_only"] is False
            assert updated.get("updated_at")

            # Verify GET reflects the update
            lst = requests.get(f"{API}/admin/pricing", headers=auth_headers).json()
            es = next(r for r in lst if r["vehicle_type"] == "Executive Sedan")
            assert es["base"] == 80.0 and es["per_mile"] == 4.0

            # Verify /api/quote reflects new pricing live (SFO -> Pier 39 ~13 mi)
            q = requests.post(
                f"{API}/quote",
                json={"pickup_location": "SFO", "dropoff_location": "Pier 39 San Francisco"},
                timeout=30,
            ).json()
            if not q.get("fallback"):
                miles = q["distance_miles"]
                expected = round(max(80.0 + 4.0 * miles, 85.0), 2)
                es_quote = next(x for x in q["quotes"] if x["vehicle_type"] == "Executive Sedan")
                assert es_quote["price"] == expected
        finally:
            _reset_pricing(auth_headers)

    def test_patch_call_only_toggle(self, auth_headers):
        try:
            r = requests.patch(
                f"{API}/admin/pricing/Luxury SUV",
                json={"call_only": True},
                headers=auth_headers,
                timeout=15,
            )
            assert r.status_code == 200, r.text
            assert r.json()["call_only"] is True

            q = requests.post(
                f"{API}/quote",
                json={"pickup_location": "SFO", "dropoff_location": "Pier 39 San Francisco"},
                timeout=30,
            ).json()
            suv = next(x for x in q["quotes"] if x["vehicle_type"] == "Luxury SUV")
            assert suv["price"] is None
            assert suv["message"] == "Call for quote"

            # Toggle back
            r2 = requests.patch(
                f"{API}/admin/pricing/Luxury SUV",
                json={"call_only": False},
                headers=auth_headers,
                timeout=15,
            )
            assert r2.status_code == 200
            assert r2.json()["call_only"] is False

            q2 = requests.post(
                f"{API}/quote",
                json={"pickup_location": "SFO", "dropoff_location": "Pier 39 San Francisco"},
                timeout=30,
            ).json()
            if not q2.get("fallback"):
                suv2 = next(x for x in q2["quotes"] if x["vehicle_type"] == "Luxury SUV")
                assert suv2["price"] is not None
        finally:
            _reset_pricing(auth_headers)

    def test_patch_unknown_vehicle_type(self, auth_headers):
        r = requests.patch(
            f"{API}/admin/pricing/Foo Bar",
            json={"base": 100},
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 400

    def test_patch_empty_body(self, auth_headers):
        r = requests.patch(
            f"{API}/admin/pricing/Executive Sedan",
            json={},
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 400

    def test_patch_pricing_auth_required(self):
        r = requests.patch(
            f"{API}/admin/pricing/Executive Sedan",
            json={"base": 100},
        )
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
