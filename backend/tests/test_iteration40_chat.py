"""
Iteration 40 backend tests: Public AI Chat Assistant 'Sage'.

Covers:
- POST /api/chat/start    (public, no auth)
- POST /api/chat/message  (single + multi-turn + absurd + invalid session + length cap)
- GET  /api/chat/{id}     (history restore)
"""
import os
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://limo-experience-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def started_session(session):
    """Open a real chat session and reuse it across context-dependent tests."""
    r = session.post(
        f"{API}/chat/start",
        json={"user_agent": "TEST_pytest/iter40", "referrer": "https://test.local/"},
        timeout=30,
    )
    assert r.status_code == 200, f"chat/start failed: {r.status_code} {r.text}"
    data = r.json()
    assert "session_id" in data and "opener" in data
    return data


# --- /chat/start ---
class TestChatStart:
    def test_start_returns_session_id_and_opener(self, session):
        r = session.post(
            f"{API}/chat/start",
            json={"user_agent": "TEST_ua", "referrer": "https://t.test/"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("session_id"), str) and len(data["session_id"]) > 10
        opener = data.get("opener", "")
        assert isinstance(opener, str) and len(opener) > 10
        # Opener mentions Sage + Turan Elite Limo + asks a question
        assert "Sage" in opener
        assert "Turan Elite Limo" in opener
        assert "?" in opener, f"Opener should ask a question: {opener!r}"

    def test_start_public_no_auth_required(self, session):
        # Same call but explicitly stripped — public endpoint
        r = requests.post(
            f"{API}/chat/start",
            json={"user_agent": "anon", "referrer": ""},
            timeout=30,
        )
        assert r.status_code == 200, r.text

    def test_start_works_with_empty_body(self, session):
        r = session.post(f"{API}/chat/start", json={}, timeout=30)
        assert r.status_code == 200, r.text


# --- /chat/message ---
class TestChatMessage:
    def test_pricing_question_returns_coherent_reply(self, session, started_session):
        sid = started_session["session_id"]
        r = session.post(
            f"{API}/chat/message",
            json={
                "session_id": sid,
                "message": "How much for SFO to Carmel for 4 people in a Tahoe?",
            },
            timeout=45,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        reply = data.get("reply", "")
        assert isinstance(reply, str) and len(reply) > 20, f"reply too short: {reply!r}"
        # Should include a ballpark price ($ sign) and steer to /booking
        assert "$" in reply, f"Expected $ price range in reply: {reply!r}"
        assert "/booking" in reply.lower() or "booking" in reply.lower(), (
            f"Expected steer to /booking in reply: {reply!r}"
        )
        # Needs_human should be false for a normal pricing question
        assert data.get("needs_human") is False, (
            f"needs_human should be False for routine pricing q, got True. reply={reply!r}"
        )

    def test_multiturn_context_remembered(self, session, started_session):
        sid = started_session["session_id"]
        # Ask a follow-up that ONLY makes sense if context is preserved
        r = session.post(
            f"{API}/chat/message",
            json={"session_id": sid, "message": "And what about for 8 people?"},
            timeout=45,
        )
        assert r.status_code == 200, r.text
        reply = r.json().get("reply", "").lower()
        assert len(reply) > 20
        # Should reference larger vehicle (sprinter/suv/escalade/van) OR price range
        keywords = ["sprinter", "suv", "escalade", "van", "$", "8", "eight", "larger", "limo"]
        assert any(k in reply for k in keywords), (
            f"Follow-up reply doesn't reflect 8-pax context: {reply!r}"
        )

    def test_absurd_request_deflects_gracefully(self, session, started_session):
        sid = started_session["session_id"]
        r = session.post(
            f"{API}/chat/message",
            json={
                "session_id": sid,
                "message": "Do you have a 50-passenger Bentley with a hot tub?",
            },
            timeout=45,
        )
        assert r.status_code == 200, r.text
        reply = r.json().get("reply", "").lower()
        assert len(reply) > 20
        # Should NOT claim to have a Bentley with a hot tub (no false promises)
        bad_phrases = ["yes we have", "we do have a 50-passenger bentley", "bentley with a hot tub is available"]
        assert not any(p in reply for p in bad_phrases), f"Hallucinated affirmation: {reply!r}"
        # Should propose real alternatives or escalate
        good_signals = [
            "party bus", "mini-coach", "sprinter", "team", "650", "alternative",
            "don't have", "do not have", "unfortunately", "not part of our fleet",
        ]
        assert any(s in reply for s in good_signals), (
            f"Absurd-request reply lacks graceful alternative/escalation: {reply!r}"
        )

    def test_invalid_session_returns_404(self, session):
        r = session.post(
            f"{API}/chat/message",
            json={"session_id": "TEST_does-not-exist-zzz", "message": "Hi"},
            timeout=30,
        )
        assert r.status_code == 404, f"Expected 404, got {r.status_code} {r.text}"

    def test_message_over_2000_chars_rejected_422(self, session, started_session):
        sid = started_session["session_id"]
        big = "A" * 2001
        r = session.post(
            f"{API}/chat/message",
            json={"session_id": sid, "message": big},
            timeout=30,
        )
        assert r.status_code == 422, f"Expected 422 for >2000 chars, got {r.status_code} {r.text}"

    def test_empty_message_rejected(self, session, started_session):
        sid = started_session["session_id"]
        r = session.post(
            f"{API}/chat/message",
            json={"session_id": sid, "message": ""},
            timeout=30,
        )
        assert r.status_code == 422, f"Expected 422 for empty msg, got {r.status_code}"


# --- /chat/{session_id} ---
class TestChatHistory:
    def test_history_returns_all_prior_messages(self, session, started_session):
        sid = started_session["session_id"]
        r = session.get(f"{API}/chat/{sid}", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("session_id") == sid
        history = data.get("history", [])
        # By now: opener + 3 user msgs + 3 assistant replies = 7 turns
        assert isinstance(history, list)
        assert len(history) >= 5, f"Expected >=5 turns, got {len(history)}: {history}"
        roles = [h.get("role") for h in history]
        assert roles[0] == "assistant"  # opener
        assert "user" in roles
        # No mongo _id leaked
        assert "_id" not in data

    def test_history_unknown_session_returns_404(self, session):
        r = session.get(f"{API}/chat/TEST_not-a-real-session-id", timeout=30)
        assert r.status_code == 404
