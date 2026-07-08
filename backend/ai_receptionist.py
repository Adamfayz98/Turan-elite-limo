"""AI phone receptionist — handles inbound Twilio voice calls with GPT.

Flow:
  1. Caller dials Twilio number → `routes/twilio_voice.py::twilio_voice_incoming`
     greets in AI voice + `<Gather>` speech.
  2. Twilio transcribes → hits `twilio_voice_gather` with `SpeechResult`.
  3. We call `get_ai_reply()` here → LLM (gpt-5.4) produces JSON:
       { reply: "...", action: "speak_and_gather" | "send_sms_link" | "transfer" | "hangup",
         params: {...} }
  4. `twilio_voice.py` translates that back into TwiML and executes any action.
Conversation history is persisted in the `voice_call_sessions` Mongo collection,
keyed by Twilio CallSid.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ---------- Company knowledge base (baked into the system prompt) ----------

SYSTEM_PROMPT = """You are the AI concierge for **Turan Elite Limo**, a luxury chauffeur service in the San Francisco Bay Area. You are answering an INBOUND PHONE CALL that our human dispatcher just couldn't pick up (they're on another line). The caller has ALREADY heard our team ring for 20 seconds — do NOT offer to transfer them again unless they explicitly ask, since we already tried. Instead, offer to take a callback request or handle everything yourself via SMS.

Speak concisely and warmly — every response you write will be spoken out loud by Twilio, so keep each reply to 1–2 short sentences (under 40 words). Never read out long addresses or dollar amounts with cents unless asked.

# Business facts
- Service area: San Francisco Bay Area + Napa/Sonoma/Monterey/Sacramento (Northern California). We can also drive to LA/Tahoe/Reno/Vegas on request.
- Airports: SFO, OAK, SJC, plus regional (STS, MRY, SMF). Meet & Greet at baggage claim is available on Airport Transfers ($35 flat fee).
- Hours: 24/7 dispatch. Chauffeurs available around the clock; last-minute bookings (< 4 hr notice) are best confirmed by phone.
- Cancellation: free up to 24 hours before pickup for standard rides; airport transfers have a same-day soft cancellation window.
- We accept all major credit cards through Stripe. "Book Now, Pay After Ride" is available — the customer's card is saved and only charged after the trip.

# Fleet + instant-quotable vehicles
You may quote prices ONLY for these three vehicles using the `quote` action:
  - "Executive Sedan" (up to 3 passengers, 2 bags)
  - "First Class" (up to 3 passengers, 3 bags — premium sedan)
  - "Luxury SUV" (up to 6 passengers, 5 bags)

For ANY OTHER vehicle — Stretch Limousine, Sprinter Van, Executive Sprinter, Jet Sprinter, Party Bus, Mini Coach, Motor Coach — DO NOT quote a number. Instead say: "For the [vehicle], our team builds a custom quote since pricing depends on the route and duration. I'll text you a link to fill in a quick request." Then use action `send_sms_link` with `link_type: "quote_request"`.

# Current promotions (mention proactively only if the caller is a NEW customer or asks about discounts)
- **First-time riders**: 20% off with code **WELCOME**. Say "if this is your first ride with us, use code WELCOME for 20% off at checkout." This CANNOT be applied automatically over the phone — the customer applies it when booking online.

# What you CAN do
- Answer questions about fleet, service area, airports, meet-and-greet, cancellation, pricing.
- Instant-quote Sedan / First Class / Luxury SUV rides (use `quote` action).
- Text the caller a booking link, pre-filled with their pickup + drop-off (use `send_sms_link` action, `link_type: "book"`).
- Text the caller a custom quote-request link for non-quotable vehicles (`send_sms_link` action, `link_type: "quote_request"`).
- Offer a callback from the human dispatcher (use `send_sms_link` action with `link_type: "book"` AND acknowledge the callback in your reply — the transcript already captures the caller's number so ops will follow up).
- Take a voicemail-style message if they don't want to interact (`hangup` action after a warm goodbye).

# What you CANNOT do
- Book the trip yourself over the phone (always send the SMS link).
- Modify existing reservations (ask them to reply to their confirmation email or hit the manage link).
- Quote for Stretch Limo / Sprinter / Party Bus / Coach (always route to quote_request SMS link).
- Take payment info by voice.
- Re-transfer to the dispatcher unless the caller EXPLICITLY says something like "I really need a human" — we already tried and dispatch didn't answer. If they insist, use `transfer` action; otherwise handle it yourself.

# Response format — CRITICAL
You MUST respond with ONLY a JSON object, no prose outside the JSON. Schema:
{
  "reply": "<the exact text you want spoken to the caller — 1-2 short sentences>",
  "action": "speak_and_gather" | "quote" | "send_sms_link" | "transfer" | "hangup",
  "params": { ...action-specific params... }
}

Actions:
- `speak_and_gather` — just say `reply` and listen for the next thing (default). params: {} (empty)
- `quote` — you're about to compute a price. params: {"pickup":"...", "dropoff":"...", "vehicle":"Executive Sedan|First Class|Luxury SUV"}. The system will run the quote, then feed the result back into the next turn as a system message so you can announce the price.
- `send_sms_link` — text the caller a booking or quote-request link. params: {"link_type":"book|quote_request", "pickup":"...", "dropoff":"...", "vehicle":"...", "notes":"..."}. All params optional. After sending, briefly confirm and hand off.
- `transfer` — the caller has explicitly demanded a human despite already being told dispatch is unavailable. params: {} (empty). Use SPARINGLY.
- `hangup` — end the call. Use only after saying goodbye. params: {}

# Tone
Warm, unhurried, concierge-professional. Never say "Sure!" or "Awesome!" or "Great!" — that's a chatbot tell. Instead: "Of course.", "Absolutely.", "Understood.", "Right away.". Use the caller's first name only if they gave it. Never mention you're an AI unless directly asked. If asked, say "I'm the Turan Elite AI concierge — filling in while our team is on another line."
"""


# ---------- Session persistence ----------

async def _get_session(db, call_sid: str) -> dict:
    doc = await db.voice_call_sessions.find_one({"call_sid": call_sid}, {"_id": 0})
    return doc or {"call_sid": call_sid, "history": [], "created_at": datetime.now(timezone.utc).isoformat()}


async def _save_session(db, session: dict) -> None:
    session["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.voice_call_sessions.update_one(
        {"call_sid": session["call_sid"]},
        {"$set": session},
        upsert=True,
    )


# ---------- LLM call ----------

async def _run_llm(system_prompt: str, history: list[dict], user_text: str) -> str:
    """Call gpt-5.4 with the running history + the caller's latest turn.
    Returns the raw model output (expected to be JSON)."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")

    # Session id includes the CallSid so the emergentintegrations library can
    # dedupe / cache if it wants. History is passed explicitly via
    # concatenation below because the wrapper is stateless from our POV.
    session_id = f"voice-{history[0].get('call_sid') if history else 'new'}-{len(history)}"

    # Fold history into the system prompt for stateless calls.
    convo_dump = ""
    for turn in history[-12:]:  # keep last ~12 turns to stay under context
        role = turn.get("role", "user")
        content = turn.get("content", "")
        convo_dump += f"\n\n[{role.upper()}]: {content}"
    full_system = system_prompt + (
        f"\n\n# Conversation so far{convo_dump}" if convo_dump else ""
    )

    chat = LlmChat(
        api_key=key,
        session_id=session_id,
        system_message=full_system,
    ).with_model("openai", "gpt-5.4")

    try:
        reply = await chat.send_message(UserMessage(text=user_text or ""))
    except Exception as e:
        logger.warning(f"AI receptionist LLM call failed: {e}")
        return json.dumps({
            "reply": "I'm having trouble hearing you. Let me connect you with our dispatcher.",
            "action": "transfer",
            "params": {},
        })
    return (reply or "").strip()


def _parse_llm_json(raw: str) -> dict:
    """Extract the JSON block from the model output. Fall back to a safe reply."""
    txt = raw.strip()
    # Strip markdown fences if the model wrapped it
    if txt.startswith("```"):
        txt = txt.strip("`")
        if txt.lower().startswith("json"):
            txt = txt[4:].lstrip()
    # Trim to the outermost braces
    try:
        first = txt.index("{")
        last = txt.rindex("}")
        txt = txt[first : last + 1]
    except ValueError:
        pass
    try:
        obj = json.loads(txt)
    except Exception:
        logger.warning(f"AI receptionist: could not parse JSON, raw={raw[:200]!r}")
        return {
            "reply": "I didn't quite catch that. Could you say it once more?",
            "action": "speak_and_gather",
            "params": {},
        }
    obj.setdefault("reply", "One moment please.")
    obj.setdefault("action", "speak_and_gather")
    obj.setdefault("params", {})
    return obj


# ---------- Public API ----------

async def get_ai_reply(
    db,
    call_sid: str,
    caller_number: str,
    user_speech: str,
    extra_context: Optional[str] = None,
) -> dict:
    """Advance the conversation by one turn.

    Args:
      db: Motor db handle
      call_sid: Twilio CallSid — persists conversation history
      caller_number: E.164 caller ID (for SMS + logging)
      user_speech: what Twilio transcribed the caller as saying
      extra_context: optional system-injected fact (e.g. quote result) that
        the AI should factor into its reply

    Returns: dict with keys reply, action, params.
    """
    session = await _get_session(db, call_sid)
    if not session.get("caller_number"):
        session["caller_number"] = caller_number
    if not session.get("history"):
        session["history"] = []

    turn_input = user_speech or ""
    if extra_context:
        # System-injected context (e.g. "The quote for SFO→Napa Luxury SUV
        # came back as $340"). Feed it as a synthetic user turn labelled so
        # the model treats it as ground truth.
        turn_input = f"[system fact: {extra_context}]\n\n{turn_input}".strip()

    raw = await _run_llm(SYSTEM_PROMPT, session["history"], turn_input)
    parsed = _parse_llm_json(raw)

    # Record both sides of the turn in the running transcript.
    session["history"].append({"role": "user", "content": user_speech or "", "ts": datetime.now(timezone.utc).isoformat()})
    if extra_context:
        session["history"].append({"role": "system_fact", "content": extra_context, "ts": datetime.now(timezone.utc).isoformat()})
    session["history"].append({
        "role": "assistant",
        "content": parsed.get("reply", ""),
        "action": parsed.get("action"),
        "params": parsed.get("params") or {},
        "ts": datetime.now(timezone.utc).isoformat(),
    })
    await _save_session(db, session)
    return parsed


async def append_turn(db, call_sid: str, role: str, content: str, meta: Optional[dict] = None) -> None:
    """Append an off-band turn to the transcript (e.g. 'transferred to human',
    'sent booking SMS')."""
    session = await _get_session(db, call_sid)
    session.setdefault("history", []).append({
        "role": role,
        "content": content,
        "ts": datetime.now(timezone.utc).isoformat(),
        **(meta or {}),
    })
    await _save_session(db, session)


# ---------- Quote helper (limited to safely-priced vehicles) ----------

QUOTABLE_VEHICLES = {"Executive Sedan", "First Class", "Luxury SUV"}


async def compute_ai_quote(db, pickup: str, dropoff: str, vehicle: str) -> dict:
    """Return {price, spoken} for the AI. Uses the same math as /api/quote
    but bypasses the HTTP layer for speed. Falls back gracefully."""
    if vehicle not in QUOTABLE_VEHICLES:
        return {
            "ok": False,
            "reason": "not_quotable",
            "spoken": f"For the {vehicle}, our team builds a custom quote.",
        }
    try:
        # Lazy import to avoid circulars — server.py owns these helpers.
        from server import _load_pricing_map, _geocode, _haversine_miles, _load_settings, _build_quotes
    except Exception as e:
        logger.warning(f"AI quote imports failed: {e}")
        return {"ok": False, "reason": "import_error"}
    try:
        pricing_map = await _load_pricing_map()
        pk = await _geocode(pickup)
        dp = await _geocode(dropoff)
        if not pk or not dp:
            return {
                "ok": False,
                "reason": "geocode_failed",
                "spoken": "I couldn't map one of those addresses — could you say the city or landmark instead?",
            }
        miles = _haversine_miles(pk["lat"], pk["lon"], dp["lat"], dp["lon"])
        settings = await _load_settings()
        quotes = _build_quotes(miles, pricing_map)
        matching = next((q for q in quotes if q.vehicle_type == vehicle and q.price is not None), None)
        if not matching:
            return {"ok": False, "reason": "no_match", "spoken": "I couldn't produce that quote right now."}
        base = float(matching.price)
        fee_pct = float(settings.service_fee_percent or 0)
        with_fee = round(base + base * fee_pct / 100.0, 2) if fee_pct > 0 else base
        # Speak the rounded-to-the-nearest-$5 number so voice sounds natural.
        friendly = int(round(with_fee / 5.0) * 5)
        spoken = f"around ${friendly} for the {vehicle}"
        return {"ok": True, "price": with_fee, "friendly_price": friendly, "spoken": spoken, "miles": round(miles, 1)}
    except Exception as e:
        logger.warning(f"AI quote compute failed: {e}")
        return {"ok": False, "reason": "compute_error"}


# ---------- SMS link helper ----------

def build_booking_link(origin: str, params: dict) -> str:
    """Build a /book URL with pre-filled pickup / dropoff / vehicle so the
    caller lands on the form with fields already populated."""
    from urllib.parse import urlencode
    q = {}
    if params.get("pickup"):
        q["pickup"] = params["pickup"]
    if params.get("dropoff"):
        q["dropoff"] = params["dropoff"]
    if params.get("vehicle"):
        q["vehicle"] = params["vehicle"]
    q["utm_source"] = "ai_receptionist"
    q["utm_medium"] = "voice_sms"
    return f"{origin.rstrip('/')}/book" + ("?" + urlencode(q) if q else "")


def build_quote_request_link(origin: str, params: dict) -> str:
    """Build a /quote-request URL (or /contact) with pre-filled context."""
    from urllib.parse import urlencode
    q = {}
    for key in ("pickup", "dropoff", "vehicle", "notes"):
        if params.get(key):
            q[key] = params[key]
    q["utm_source"] = "ai_receptionist"
    q["utm_medium"] = "voice_sms"
    return f"{origin.rstrip('/')}/contact" + ("?" + urlencode(q) if q else "")


# Placeholder for future extension (e.g. persist ai_receptionist call metrics)
_ = Any  # noqa: F841
