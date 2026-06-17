"""
Public-facing AI chat assistant for TuranEliteLimo.

Powers the floating chat widget at the bottom-right of every page. Customers
can ask anything — ballpark pricing, vehicle fit, BYOB rules, kid seats,
cancellation policy, World Cup surge, etc. The LLM is given a tight
TuranEliteLimo persona + an escape hatch when it can't help: it tells the
customer the team will follow up and the conversation gets a 'needs_human'
flag the admin can spot in the chat sessions tab later.

We use Gemini 2.5 Flash via emergentintegrations for low cost (~$0.0003 per
exchange) and quick latency (~1-2 sec). Conversation history persists in
MongoDB so refreshes / revisits resume the thread.

Endpoints:
    POST /api/chat/start        — start a new session (returns session_id + opening msg)
    POST /api/chat/message      — send a customer message; returns assistant reply
    GET  /api/chat/{session_id} — fetch the full history (used by the widget to restore)
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter()

# --- Mongo handle (lazy so this module imports cleanly under pytest) ---
_client: Optional[AsyncIOMotorClient] = None
_db = None


def _get_db():
    global _client, _db
    if _db is None:
        _client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        _db = _client[os.environ["DB_NAME"]]
    return _db


CHAT_SYSTEM_PROMPT = """You are Sage, the AI concierge for TuranEliteLimo —
a premium Bay Area chauffeur company (premium sedans, SUVs, Sprinters, mini-coaches,
and party buses). You answer in a warm, calm, knowledgeable tone — never salesy,
never over-eager. You're a real human's helpful right hand, not a chatbot stuffing
the customer with offers.

YOUR JOB
- Answer common questions accurately and concisely.
- Give honest BALLPARK pricing when asked, then steer the customer toward the
  formal quote at /booking for an exact number with refundable deposit.
- Help size the right vehicle to their group / occasion.
- Gracefully escalate to the human team for anything you can't confidently handle.

WHAT YOU KNOW (use this naturally — never recite as a bullet list)
- Service area: full Bay Area + Wine Country (Napa, Sonoma), Lake Tahoe, Monterey.
- Vehicles:
  - Executive Sedan (Cadillac XTS / Mercedes E): up to 3 pax + 2 bags
  - First-Class Sedan: 3 pax, premium
  - Luxury SUV (Cadillac Escalade / GMC Yukon): up to 6 pax with luggage (captain's chairs)
  - Suburban with bench: tighter 7 pax
  - Sprinter Van (executive): 14 pax (regular seating)
  - Sprinter Limo (party-style): 8-10 pax leather club seating + party lighting
  - Mini-coach (24-26 pax): some with onboard restroom
  - Party Bus (28-32 pax): LED party lighting, premium sound, NO onboard restroom
- Ballpark pricing (chauffeur included, fuel & tolls included; 18% gratuity standard):
  - Sedan: ~$95-130/h, 2h minimum
  - SUV: ~$120-160/h, 2h minimum
  - Sprinter (regular or limo): ~$145-180/h, 5h minimum for North Bay / weekend
  - Mini-coach: ~$210-240/h, 5h minimum
  - Party Bus: ~$260-300/h, 5h minimum
- Airport flat rates (popular): SFO ↔ SF downtown ~$110-150 sedan, ~$170 SUV;
  SFO ↔ Napa Carmel ~$300-500 depending on vehicle.
- All trips include licensed/insured chauffeur, flight tracking (for airport),
  fuel surcharge, gratuity, tolls, and standard parking.
- Cancellation: free up to 48 hours before pickup; 35% deposit holds the date.
- Stadium/concert events at Chase Center, Levi's Stadium, Oracle Park, SAP Center
  include venue parking in the all-inclusive flat rate.
- Wine tour day rates: 6-8 hours typical, $1,200-1,800 depending on vehicle.
- World Cup 2026 (June-July 2026): surge pricing applies — book early, deposits
  hold rates from increasing.
- BYOB welcome in Sprinters / party buses / mini-coaches; not allowed in sedans.
- Car seats: NOT required by California law (CVC 27360) for charter buses /
  taxis / limos, but boosters can be brought on request.
- Mobile app: iOS App Store + Google Play, "Turan Elite Limo" — install for
  push notifications, in-app booking, driver tracking.

WHAT YOU DO NOT KNOW (DEFLECT)
- Exact pricing for the customer's specific trip (always say: I can give a
  ballpark; for an exact price our quoting system at /booking gives you a
  final all-inclusive number in 30 seconds).
- Whether a specific vehicle is available on a specific date (defer to the
  /booking form or the team).
- Driver names / availability / schedules.
- Specific Mercedes / Cadillac model years.

HARD RULES
- Replies are SHORT (2-5 sentences typically). Customers on mobile.
- Never invent guarantees ("Yes we have 50 Bentleys ready" -> NO).
- Never quote a precise dollar amount — only ranges. Push to /booking for exact.
- If the customer says they want to book, say great and direct them to
  https://turanelitelimo.com/booking — that page does dynamic pricing and
  Stripe deposit in one flow.
- If the customer asks something you genuinely cannot answer (custom routes,
  group >40 pax, special vehicles, complaint, refund question, World Cup hotel
  packages, anything legally sensitive), say briefly: "Let me get our team
  involved — text or call us at (650) 410-0687 and we'll lock it in." Do NOT
  pretend to know.
- Match the customer's tone. Casual = casual. Formal = formal.
- One emoji max per reply, and only if it fits naturally. Never two.
- NO markdown formatting (no headings, no bullet points, no bold). Plain prose.
"""


# --- Pydantic models ---
class ChatStartRequest(BaseModel):
    user_agent: Optional[str] = None
    referrer: Optional[str] = None


class ChatMessageRequest(BaseModel):
    session_id: str
    message: str = Field(min_length=1, max_length=2000)


class ChatTurn(BaseModel):
    role: str  # "user" | "assistant" | "system"
    content: str
    ts: str


# --- Helpers ---
async def _llm_reply(history: list[dict]) -> str:
    """Call Gemini 2.5 Flash with the running conversation. History is
    a list of {role, content} dicts. The first system turn is injected
    once per session.
    """
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    emergent_key = os.environ.get("EMERGENT_LLM_KEY")
    if not emergent_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured.")

    # We keep the session_id LLM-local (not the public one) so the persona is
    # consistent inside emergentintegrations' own session store. Each request
    # rebuilds the chat from our persisted history so multi-turn works even
    # across server restarts.
    chat = LlmChat(
        api_key=emergent_key,
        session_id=f"chat-{uuid.uuid4()}",
        system_message=CHAT_SYSTEM_PROMPT,
    ).with_model("gemini", "gemini-2.5-flash")

    # Stitch prior turns into one composite prompt so the model has context
    # without us needing to also POST every prior turn separately to the SDK
    # (the SDK's session memory is per-process and we restart often).
    if len(history) > 1:
        prior = []
        for h in history[:-1]:
            if h["role"] == "user":
                prior.append(f"Customer: {h['content']}")
            elif h["role"] == "assistant":
                prior.append(f"Sage: {h['content']}")
        latest = history[-1]["content"]
        prompt = (
            "Conversation so far:\n"
            + "\n".join(prior)
            + f"\n\nCustomer just said: {latest}\n\nRespond as Sage."
        )
    else:
        prompt = history[-1]["content"]

    try:
        reply = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logger.warning(f"Chat LLM call failed: {e}")
        raise HTTPException(status_code=502, detail=f"LLM call failed: {e}")
    return (reply or "").strip()


# --- Routes ---
@router.post("/chat/start")
async def chat_start(req: ChatStartRequest, request: Request):
    """Open a fresh chat session and return the assistant's opening line."""
    db = _get_db()
    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    opener = (
        "Hi! I'm Sage, the concierge for Turan Elite Limo. Happy to help with "
        "pricing, vehicle questions, airport runs, weddings — anything chauffeur-related. "
        "What's the trip you're planning?"
    )

    # Capture intake metadata so we can audit / re-target later. Never stores PII
    # at this stage — that comes through the booking form, not the chat widget.
    doc = {
        "session_id": session_id,
        "created_at": now,
        "updated_at": now,
        "ip": (request.client.host if request.client else "") or "",
        "user_agent": (req.user_agent or "")[:300],
        "referrer": (req.referrer or "")[:300],
        "needs_human": False,
        "history": [
            {"role": "assistant", "content": opener, "ts": now},
        ],
    }
    await db.chat_sessions.insert_one(doc)
    return {"session_id": session_id, "opener": opener}


@router.post("/chat/message")
async def chat_message(req: ChatMessageRequest):
    """Append a customer message + generate the next assistant reply."""
    db = _get_db()
    session = await db.chat_sessions.find_one({"session_id": req.session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found.")

    # Soft cap to keep contexts short and prevent abuse loops. Older customers
    # who want to keep going can just refresh and start over — rare.
    history = session.get("history", [])
    if len(history) >= 60:
        raise HTTPException(
            status_code=429,
            detail="Conversation length limit reached. Please refresh to start a new session.",
        )

    now = datetime.now(timezone.utc).isoformat()
    history.append({"role": "user", "content": req.message[:2000], "ts": now})

    reply_text = await _llm_reply(history)
    history.append({"role": "assistant", "content": reply_text, "ts": now})

    # If the assistant promised escalation, flag the session so admin sees it.
    # Parentheses are explicit so the conjunction (which Python binds tighter
    # than `or`) doesn't accidentally rope in the phone-number branch.
    reply_lower = reply_text.lower()
    needs_human = ("(650) 410-0687" in reply_text) or (
        ("team" in reply_lower) and ("get" in reply_lower)
    )

    await db.chat_sessions.update_one(
        {"session_id": req.session_id},
        {
            "$set": {
                "history": history,
                "updated_at": now,
                "needs_human": session.get("needs_human") or needs_human,
            },
        },
    )

    return {
        "session_id": req.session_id,
        "reply": reply_text,
        "needs_human": needs_human,
    }


@router.get("/chat/{session_id}")
async def chat_history(session_id: str):
    """Return the full conversation so the widget can restore on refresh."""
    db = _get_db()
    session = await db.chat_sessions.find_one(
        {"session_id": session_id},
        {"_id": 0, "session_id": 1, "history": 1, "needs_human": 1, "updated_at": 1},
    )
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    return session
