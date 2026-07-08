"""
Iter 54: Round-trip pricing + Places autocomplete strict/loose modes.

Covers:
  1. /api/places/autocomplete: strict=true blocks out-of-area pickups,
     strict=false allows LA/Vegas, Monterey should be inside 250 km radius.
  2. /api/quote: round-trip legs are priced separately, ≈2× one-way.
  3. /api/quote: return_location fallback to pickup_location when empty.
  4. /api/quote: one-way (return_trip=false or omitted) preserves prior behavior.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://limo-experience-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Places autocomplete ----------
class TestPlacesAutocomplete:
    def test_pickup_strict_blocks_LAX(self, session):
        r = session.get(f"{API}/places/autocomplete", params={"input": "Los Angeles LAX", "strict": "true"})
        assert r.status_code == 200, r.text
        data = r.json()
        preds = data.get("predictions", [])
        # Expect ZERO or ZERO_RESULTS — LAX should not fall inside 250km SF radius
        assert len(preds) == 0, f"Expected 0 preds for strict LAX, got {len(preds)}: {[p.get('description') for p in preds]}"

    def test_dropoff_loose_allows_LAX(self, session):
        r = session.get(f"{API}/places/autocomplete", params={"input": "Los Angeles LAX", "strict": "false"})
        assert r.status_code == 200, r.text
        data = r.json()
        preds = data.get("predictions", [])
        assert len(preds) > 0, f"Expected predictions for loose LAX, got 0. status={data.get('status')}"
        # At least one should mention LAX or Los Angeles
        joined = " ".join(p.get("description", "") for p in preds).lower()
        assert "los angeles" in joined or "lax" in joined

    def test_pickup_strict_allows_monterey(self, session):
        # Monterey is ~110mi south of SF — inside the 250km biased radius.
        r = session.get(f"{API}/places/autocomplete", params={"input": "1000 Aguajito Rd Monterey", "strict": "true"})
        assert r.status_code == 200, r.text
        preds = r.json().get("predictions", [])
        assert len(preds) > 0, "Expected Monterey to surface in strict mode (250km radius)"
        joined = " ".join(p.get("description", "") for p in preds).lower()
        assert "monterey" in joined or "aguajito" in joined

    def test_dropoff_loose_allows_bellagio(self, session):
        r = session.get(f"{API}/places/autocomplete", params={"input": "Bellagio Las Vegas", "strict": "false"})
        assert r.status_code == 200, r.text
        preds = r.json().get("predictions", [])
        assert len(preds) > 0, "Expected Vegas predictions in loose mode"
        joined = " ".join(p.get("description", "") for p in preds).lower()
        assert "vegas" in joined or "bellagio" in joined


# ---------- Quote round-trip ----------
class TestQuoteRoundTrip:
    def _base_payload(self):
        return {
            "pickup_location": "SFO Airport, San Francisco, CA",
            "dropoff_location": "1000 Aguajito Rd, Monterey, CA",
            "service_type": "A to B Transfer",
        }

    def test_one_way_baseline(self, session):
        payload = self._base_payload()
        r = session.post(f"{API}/quote", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        # round_trip flag should be false/absent
        assert not data.get("round_trip"), f"Expected round_trip=False for one-way, got {data.get('round_trip')}"
        assert data.get("return_leg_miles") in (None, 0, 0.0)
        assert data.get("distance_miles") and data["distance_miles"] > 50, f"Expected distance>50mi, got {data.get('distance_miles')}"
        # Every priced vehicle should have a price and single-leg message
        quotes = data.get("quotes", [])
        priced = [q for q in quotes if q.get("price")]
        assert len(priced) >= 3, f"Expected >=3 priced quotes, got {len(priced)}"
        for q in priced:
            assert "round trip" not in (q.get("message") or "").lower()
        # Return the Executive Sedan price for comparison in next test
        pytest._one_way_prices = {q["vehicle_type"]: q["price"] for q in priced}

    def test_round_trip_pricing(self, session):
        payload = self._base_payload()
        payload.update({
            "return_trip": True,
            "return_location": "SFO Airport, San Francisco, CA",
            "return_date": "2026-11-15",
            "return_time": "18:00",
        })
        r = session.post(f"{API}/quote", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("round_trip") is True, f"Expected round_trip=True, got {data.get('round_trip')}"
        rl_miles = data.get("return_leg_miles")
        total = data.get("total_round_trip_miles")
        assert rl_miles is not None, "Expected return_leg_miles to be populated"
        # SFO->Monterey haversine ~76 mi (per problem statement); allow 50-100
        assert 50 <= rl_miles <= 100, f"return_leg_miles={rl_miles} not in 50-100"
        assert total and abs(total - (data["distance_miles"] + rl_miles)) < 1, "total_round_trip_miles mismatch"
        # return_leg_resolved should reference SFO
        resolved = (data.get("return_leg_resolved") or "").lower()
        assert "sfo" in resolved or "san francisco" in resolved, f"return_leg_resolved={resolved!r}"
        # Every priced vehicle should be ~2× one-way; message should include round-trip tag
        priced = [q for q in data.get("quotes", []) if q.get("price")]
        assert len(priced) >= 3
        one_way = getattr(pytest, "_one_way_prices", {})
        for q in priced:
            vt = q["vehicle_type"]
            if vt in one_way and one_way[vt]:
                ratio = q["price"] / one_way[vt]
                assert 1.7 <= ratio <= 2.3, (
                    f"{vt}: round-trip price {q['price']} vs one-way {one_way[vt]} "
                    f"ratio={ratio:.2f} not in [1.7, 2.3]"
                )
            msg = (q.get("message") or "").lower()
            assert "round trip" in msg and "2 legs" in msg, (
                f"{vt}: message missing round-trip tag, got: {q.get('message')!r}"
            )

    def test_round_trip_empty_return_location_fallback(self, session):
        payload = self._base_payload()
        payload.update({
            "return_trip": True,
            "return_location": "",   # explicit empty — should default to pickup
        })
        r = session.post(f"{API}/quote", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("round_trip") is True
        d1 = data["distance_miles"]
        d2 = data["return_leg_miles"]
        assert d1 and d2, f"Expected both legs populated, got d1={d1}, d2={d2}"
        # Since return_location defaulted to pickup, the two legs should be
        # roughly equal (allow small haversine rounding delta).
        assert abs(d1 - d2) < 2.0, f"Expected return leg ~= outbound leg, got {d1} vs {d2}"

    def test_one_way_omitted_return_trip(self, session):
        """Omitting return_trip entirely (backward-compat) still yields single-leg quote."""
        payload = self._base_payload()
        # NB: no return_trip key at all
        r = session.post(f"{API}/quote", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert not data.get("round_trip")
        assert data.get("return_leg_miles") in (None, 0, 0.0)
        assert data.get("total_round_trip_miles") in (None, 0, 0.0)
