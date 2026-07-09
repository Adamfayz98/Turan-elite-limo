"""Twilio Voice webhooks — AI phone receptionist + missed-call fallback.

Call flow (per user spec, iter 56):
  1. Incoming call → AI greets + `<Gather>` speech.
  2. AI decides: answer info, quote, send SMS link, transfer to human, or hangup.
  3. On `transfer`: `<Dial>` ADMIN_PHONE with a 22-sec timeout. If unanswered,
     Twilio hits `/twilio/voice/transfer-fail` and the AI takes over again.
  4. Every call is persisted in `voice_call_sessions` for admin review.
  5. Genuinely missed calls (no admin, no AI activity, e.g. hangup during
     greeting) still get logged to `missed_calls` for follow-up.

Twilio Console setup (customer must do this ONCE):
  Phone Numbers → Manage → Active numbers → select the TEL number →
    "A CALL COMES IN" webhook → HTTP POST →
    https://api.turanelitelimo.com/api/twilio/voice/incoming
"""
# ruff: noqa: F821, F405
from __future__ import annotations

import logging

from fastapi import APIRouter, Form, Request
from fastapi.responses import Response

import server as _server  # noqa: E402
globals().update({k: v for k, v in vars(_server).items() if not k.startswith("__")})

import ai_receptionist  # noqa: E402

router = APIRouter()
logger = logging.getLogger(__name__)

_XML = "application/xml"

# Twilio's default voice — good enough for MVP, easy to upgrade later.
AI_VOICE = "Polly.Joanna"  # neural-ish, warmer than "alice"
AI_LANG = "en-US"

# --- TwiML helpers -----------------------------------------------------------

def _twiml(body: str) -> Response:
    return Response(
        content=f'<?xml version="1.0" encoding="UTF-8"?>\n{body}',
        media_type=_XML,
    )


def _say(text: str) -> str:
    # Escape XML-unsafe chars in the reply so the model can't break TwiML.
    safe = (
        (text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    return f'<Say voice="{AI_VOICE}" language="{AI_LANG}">{safe}</Say>'


def _gather(action_url: str, prompt_text: str | None = None, hints: str = "") -> str:
    """`<Gather>` block with sensible speech-recognition defaults.

    - `enhanced=true` + `speechModel=phone_call` = the best telephony-line
      accuracy Twilio offers.
    - `hints` = comma-separated phrases we expect to hear. Massive accuracy
      boost for proper nouns like vehicle names ("Luxury SUV",
      "Executive Sedan") that the acoustic model would otherwise transcribe
      as "luxury as you be" or "luxury issue" — which is why the user had
      to repeat "Luxury SUV" three times on the first real call.
    - `timeout=8` — silence window before we hang up on a caller (up from 5).
      Elderly / hesitant callers commonly need a beat to think.
    """
    inner = _say(prompt_text) if prompt_text else ""
    hints_attr = f' hints="{hints}"' if hints else ""
    return (
        f'<Gather input="speech" action="{action_url}" method="POST" '
        f'timeout="8" speechTimeout="auto"{hints_attr} '
        f'language="{AI_LANG}" enhanced="true" speechModel="phone_call">'
        f"{inner}"
        f"</Gather>"
    )


# Central speech-hints vocabulary — every Gather uses this so the acoustic
# model biases toward our domain (vehicle names, airport codes, Napa proper
# nouns, action verbs like "text me the link"). Twilio caps hints at ~500
# characters.
_SPEECH_HINTS = (
    "Executive Sedan, First Class, Luxury SUV, Sprinter, Party Bus, "
    "Mini Coach, Sedan, SUV, "
    "SFO, OAK, SJC, Napa, Sonoma, Monterey, Big Sur, Tahoe, Reno, Las Vegas, "
    "airport, hotel, winery, downtown, "
    "quote, price, book, booking, text me, link, "
    "yes please, no thanks, hang up, speak to a person, human, dispatcher"
)


def _fallback_no_input() -> str:
    """Played if Twilio's `<Gather>` gets no speech at all. First silence
    triggers a nudge (via /gather with empty SpeechResult); this fallback
    is the SECOND-time-lucky path — offer a text alternative before we
    hang up, so we don't lose the lead."""
    return (
        _say(
            "Still there? If it's easier, I can text you a booking link — "
            "just say text me the link, or call back any time. Goodbye."
        )
        + "<Hangup/>"
    )


# --- Route helpers -----------------------------------------------------------

def _action_url(request: Request, path: str) -> str:
    """Absolute URL Twilio needs for action / callback."""
    origin = _public_origin()
    return f"{origin.rstrip('/')}/api{path}"


# ============================================================================
# 1) Incoming call — AI greets + first Gather
# ============================================================================

@router.post("/twilio/voice/incoming")
async def twilio_voice_incoming(
    request: Request,
    From: str = Form(""),                    # noqa: N803
    To: str = Form(""),                      # noqa: N803
    CallSid: str = Form(""),                 # noqa: N803
):
    """FLOW (iter 57.1): Ring the human dispatcher FIRST for the "premium
    hand-picked" feel. Only if the dispatcher doesn't pick up within ~20 sec
    does the AI take over — so the AI only ever catches calls we'd otherwise
    miss. If no ADMIN_PHONE is configured we skip straight to the AI."""
    # Seed the session so subsequent turns have context.
    try:
        await db.voice_call_sessions.update_one(
            {"call_sid": CallSid},
            {"$setOnInsert": {
                "call_sid": CallSid,
                "from": From,
                "to": To,
                "history": [],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
    except Exception as e:
        logger.warning(f"voice session seed failed: {e}")

    admin = sms_service.admin_phone()
    if not admin:
        # No dispatcher number configured — go straight to AI so the caller
        # isn't left listening to silence.
        try:
            await ai_receptionist.append_turn(
                db, CallSid, "system",
                "no ADMIN_PHONE configured — AI answered directly",
            )
        except Exception:
            pass
        greeting = (
            "Thanks for calling Turan Elite Limo. I'm your AI concierge — "
            "I can quote a ride, book you in, or take a message. How can I help?"
        )
        gather_url = _action_url(request, "/twilio/voice/gather")
        return _twiml(
            "<Response>"
            + _gather(gather_url, greeting, _SPEECH_HINTS)
            + _fallback_no_input()
            + "</Response>"
        )

    # Human-first: ring dispatcher for ~20 sec, then hand off to
    # /twilio/voice/dispatcher-unavailable which spins up the AI.
    transfer_action = _action_url(request, "/twilio/voice/dispatcher-unavailable")
    return _twiml(
        "<Response>"
        f'<Dial timeout="20" action="{transfer_action}" method="POST" '
        f'answerOnBridge="true">{admin}</Dial>'
        "</Response>"
    )


@router.post("/twilio/voice/dispatcher-unavailable")
async def twilio_voice_dispatcher_unavailable(
    request: Request,
    From: str = Form(""),                    # noqa: N803
    CallSid: str = Form(""),                 # noqa: N803
    DialCallStatus: str = Form(""),          # noqa: N803
    DialCallDuration: str = Form(""),        # noqa: N803
):
    """Twilio fires this after our initial <Dial> to the dispatcher completes.
    - completed & long enough → dispatcher answered, we're done.
    - anything else (no-answer, busy, failed, canceled) → AI takes over."""
    try:
        duration = int(DialCallDuration or "0")
    except (TypeError, ValueError):
        duration = 0

    logger.info(
        f"voice dispatcher-unavailable: call_sid={CallSid} status={DialCallStatus!r} duration={duration}"
    )

    if DialCallStatus == "completed" and duration >= 5:
        # Successful live pickup — nothing else to do.
        try:
            await ai_receptionist.append_turn(
                db, CallSid, "system",
                f"dispatcher answered live ({duration}s) — no AI involvement",
            )
        except Exception:
            pass
        return _twiml("<Response><Hangup/></Response>")

    # Dispatcher couldn't take it — log the missed call so ops can call back.
    try:
        await db.missed_calls.insert_one({
            "from": From,
            "call_sid": CallSid,
            "dial_status": DialCallStatus,
            "reason": "dispatcher_unavailable_ai_took_over",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await ai_receptionist.append_turn(
            db, CallSid, "system",
            f"dispatcher unavailable ({DialCallStatus}) — AI answering",
        )
    except Exception as e:
        logger.warning(f"dispatcher-unavailable logging failed: {e}")

    # AI takes over with the exact tone the user asked for.
    ai_greeting = (
        "Thanks for calling Turan Elite Limo. Our team is assisting other "
        "clients right now, but I'm your AI concierge — I can get you an "
        "instant quote, text you a booking link, or take a message. "
        "How can I help?"
    )
    gather_url = _action_url(request, "/twilio/voice/gather")
    return _twiml(
        "<Response>"
        + _gather(gather_url, ai_greeting, _SPEECH_HINTS)
        + _fallback_no_input()
        + "</Response>"
    )


# ============================================================================
# 2) Gather callback — feed speech to AI, act on the reply
# ============================================================================

@router.post("/twilio/voice/gather")
async def twilio_voice_gather(
    request: Request,
    From: str = Form(""),                    # noqa: N803
    CallSid: str = Form(""),                 # noqa: N803
    SpeechResult: str = Form(""),            # noqa: N803
    Confidence: str = Form(""),              # noqa: N803
):
    """Called each time Twilio has a speech transcript to hand us."""
    speech = (SpeechResult or "").strip()
    if not speech:
        # Caller stayed silent. Track how many times in a row this has
        # happened via a counter on the session doc. First silence → nudge.
        # Second silence → offer text alternative + hang up (via
        # `_fallback_no_input`). Prior code hung up on the FIRST silence,
        # which felt abrupt (user complaint from the first real call).
        try:
            await db.voice_call_sessions.update_one(
                {"call_sid": CallSid},
                {"$inc": {"silence_count": 1}},
                upsert=True,
            )
            sess = await db.voice_call_sessions.find_one(
                {"call_sid": CallSid}, {"_id": 0, "silence_count": 1},
            )
            silence_count = int((sess or {}).get("silence_count") or 1)
        except Exception:
            silence_count = 1
        gather_url = _action_url(request, "/twilio/voice/gather")
        if silence_count <= 1:
            # First silence — polite retry, no hangup yet.
            return _twiml(
                "<Response>"
                + _gather(
                    gather_url,
                    "Are you still there? I can quote a ride, text you a booking link, "
                    "or take a message — just let me know.",
                    _SPEECH_HINTS,
                )
                + _fallback_no_input()
                + "</Response>"
            )
        # Second silence — try once more with a text-us offer, then hang up.
        return _twiml(
            "<Response>"
            + _gather(
                gather_url,
                "One more try — if you'd rather text us, just say text me and I'll send a booking link. "
                "Otherwise I'll say goodbye.",
                _SPEECH_HINTS,
            )
            + _fallback_no_input()
            + "</Response>"
        )
    # Reset silence counter on a real utterance.
    try:
        await db.voice_call_sessions.update_one(
            {"call_sid": CallSid}, {"$set": {"silence_count": 0}}, upsert=True,
        )
    except Exception:
        pass
    parsed = await ai_receptionist.get_ai_reply(
        db, call_sid=CallSid, caller_number=From, user_speech=speech,
    )
    # SAFETY NET (Feb 9, 2026): If the caller clearly said YES to a text-link
    # offer and the LLM STILL emitted anything other than send_sms_link (the
    # confirmation-loop bug the user hit on the Feb 9 test call), override
    # here so the SMS actually goes out. We use the LAST quote's params so
    # pickup/dropoff/vehicle are preserved.
    parsed = await _force_sms_if_affirmative_missed(CallSid, speech, parsed)
    return await _dispatch_action(request, CallSid, From, parsed)


# Bare affirmatives that mean "yes send me the text" — matched
# case-insensitively against the WHOLE caller utterance (after strip/punct).
_AFFIRMATIVES = {
    "yes", "yeah", "yep", "yup", "sure", "please", "okay", "ok", "k",
    "yes please", "yeah please", "please do", "please yes", "yes yes",
    "yes send it", "send it", "send", "send me", "send me it",
    "text me", "text me the link", "text me it", "text it", "text it to me",
    "text please", "yes text me", "yeah text me", "go ahead", "sounds good",
    "sure thing", "yes send", "send the link", "yes send the link",
    "yes text", "yes text me the link", "affirmative", "correct", "right",
    "definitely", "absolutely", "of course", "for sure",
}

# Phrases in the PRIOR assistant reply that mean "I just offered a text link".
_TEXT_OFFER_MARKERS = (
    "text you the link", "text the link", "text you a booking",
    "text you a link", "text you a quote", "text a booking link",
    "text you a", "send you a link", "send you the link",
    "would you like me to text", "should i text", "shall i text",
    "text me", "book link", "reservation link", "booking link",
    "would you like me to send", "want me to text",
)


def _looks_affirmative(text: str) -> bool:
    t = (text or "").lower().strip().rstrip(".!?,")
    if not t:
        return False
    if t in _AFFIRMATIVES:
        return True
    # Also match short "yes/yeah/sure/ok" as a prefix followed by anything
    # short (e.g. "yes please send", "yeah go ahead").
    for stem in ("yes ", "yeah ", "yep ", "sure ", "okay ", "ok ", "please "):
        if t.startswith(stem) and len(t) <= 40:
            return True
    return False


async def _force_sms_if_affirmative_missed(call_sid: str, speech: str, parsed: dict) -> dict:
    """If the LLM ignored a clear 'yes send me the link', rewrite its
    decision to `send_sms_link` using the last quote's params."""
    if (parsed.get("action") or "").lower() == "send_sms_link":
        return parsed  # LLM did the right thing
    if not _looks_affirmative(speech):
        return parsed
    try:
        sess = await db.voice_call_sessions.find_one(
            {"call_sid": call_sid}, {"_id": 0, "history": 1},
        ) or {}
        history = sess.get("history") or []
    except Exception:
        return parsed
    # `get_ai_reply` already appended the current turn's assistant reply as
    # the LAST assistant entry. We want the one BEFORE it — the offer.
    prior_assistant_content = ""
    seen = 0
    for turn in reversed(history):
        if turn.get("role") == "assistant":
            seen += 1
            if seen == 2:
                prior_assistant_content = (turn.get("content") or "").lower()
                break
    if not any(marker in prior_assistant_content for marker in _TEXT_OFFER_MARKERS):
        return parsed  # AI wasn't just offering a text — leave alone
    # Pull the most recent quote's params so we know what to pre-fill on the
    # booking link.
    quote_params = {}
    for turn in reversed(history):
        if turn.get("role") == "assistant" and (turn.get("action") or "").lower() == "quote":
            quote_params = turn.get("params") or {}
            break
    logger.info(
        f"[AI safety-net] Forcing send_sms_link for call_sid={call_sid} "
        f"— caller said {speech!r} after text offer, LLM emitted "
        f"{parsed.get('action')!r}"
    )
    try:
        await ai_receptionist.append_turn(
            db, call_sid, "system",
            "safety-net: caller affirmed text offer but LLM did not emit send_sms_link — forcing it",
            meta={"original_action": parsed.get("action")},
        )
    except Exception:
        pass
    return {
        "reply": "Sending that link now — anything else I can help with?",
        "action": "send_sms_link",
        "params": {
            "link_type": "book",
            "pickup": quote_params.get("pickup", ""),
            "dropoff": quote_params.get("dropoff", ""),
            "vehicle": quote_params.get("vehicle", ""),
        },
    }


async def _dispatch_action(request: Request, call_sid: str, caller: str, parsed: dict) -> Response:
    """Translate the AI's JSON decision into TwiML + side effects."""
    action = (parsed.get("action") or "speak_and_gather").lower()
    reply = parsed.get("reply") or ""
    params = parsed.get("params") or {}
    gather_url = _action_url(request, "/twilio/voice/gather")

    if action == "hangup":
        return _twiml("<Response>" + _say(reply or "Goodbye.") + "<Hangup/></Response>")

    if action == "transfer":
        admin = sms_service.admin_phone()
        if not admin:
            # No number configured — fall through to sending an SMS link instead.
            await ai_receptionist.append_turn(
                db, call_sid, "system",
                "transfer requested but no ADMIN_PHONE configured — degraded to SMS",
            )
            return _twiml(
                "<Response>"
                + _say("Our dispatcher isn't available right this second. Let me text you a booking link instead.")
                + _gather(gather_url, "Anything else I can help with?", _SPEECH_HINTS)
                + "</Response>"
            )
        transfer_action = _action_url(request, "/twilio/voice/transfer-fail")
        return _twiml(
            "<Response>"
            + _say(reply or "Connecting you to our dispatcher now, one moment.")
            + f'<Dial timeout="22" action="{transfer_action}" method="POST" answerOnBridge="true">{admin}</Dial>'
            + "</Response>"
        )

    if action == "quote":
        # Fetch the price, then run ONE more LLM turn feeding the result as context
        # so the AI announces the number naturally.
        pickup = params.get("pickup") or ""
        dropoff = params.get("dropoff") or ""
        vehicle = params.get("vehicle") or ""
        q = await ai_receptionist.compute_ai_quote(db, pickup, dropoff, vehicle)
        if q.get("ok"):
            # `spoken` is already the fully-formatted natural line built by
            # compute_ai_quote — it contains price + discount phrasing but
            # NEVER a promo code. We tell the AI to use it verbatim so we
            # don't accidentally leak "WELCOME30" or ask the caller to "use
            # a code at checkout" (Feb 9 user callout).
            context_fact = (
                f"Quote result for {vehicle} from {pickup} to {dropoff}: "
                f"{q.get('miles')} miles one-way. Announce this line verbatim: "
                f"\"{q.get('spoken')}.\" Then add the estimate framing "
                f"(\"that's our estimate; the final price locks in when you "
                f"book online\") and IMMEDIATELY offer to text a booking link. "
                f"DO NOT say any promo code out loud. DO NOT tell the caller "
                f"to enter a code at checkout — the discount is already baked "
                f"into the price."
            )
        else:
            context_fact = (
                f"Quote failed ({q.get('reason')}). Apologize briefly and offer to "
                f"text a quote-request link instead."
            )
        followup = await ai_receptionist.get_ai_reply(
            db, call_sid=call_sid, caller_number=caller,
            user_speech="", extra_context=context_fact,
        )
        return await _dispatch_action(request, call_sid, caller, followup)

    if action == "send_sms_link":
        link_type = (params.get("link_type") or "book").lower()
        origin = _public_origin()
        if link_type == "quote_request":
            url = ai_receptionist.build_quote_request_link(origin, params)
            sms_body = (
                "Turan Elite Limo: Here's your custom quote-request link — fill in "
                f"the details and our team replies within the hour: {url} "
                "Reply STOP to opt out."
            )
        else:
            url = ai_receptionist.build_booking_link(origin, params)
            sms_body = (
                "Turan Elite Limo: Here's your instant booking link — pickup and "
                f"drop-off are pre-filled: {url} "
                "Reply STOP to opt out."
            )
        # Actually send + verify it left Twilio. `send_sms` returns None on any
        # config problem (missing auth token, unregistered from-number, etc.)
        # so we MUST branch on the SID — otherwise the AI cheerily tells the
        # caller "I sent it" while nothing left the building (Feb 9 bug).
        sms_sid = None
        try:
            sms_sid = await sms_service.send_sms(caller, sms_body)
        except Exception as e:
            logger.warning(f"AI receptionist SMS raised for {caller}: {e}")
        try:
            await ai_receptionist.append_turn(
                db, call_sid, "system",
                f"sent SMS ({link_type}) to {caller} — sid={sms_sid or 'FAILED'}",
                meta={"sms_link": url, "sms_sid": sms_sid, "delivered": bool(sms_sid)},
            )
        except Exception:
            pass

        if sms_sid:
            confirmation = reply or "The link is on its way — should arrive in a few seconds. Anything else I can help with?"
        else:
            # Be HONEST: SMS didn't leave Twilio. Read the link out loud is
            # useless on a phone call, so pivot to spelling out what to do.
            confirmation = (
                "Hmm — I couldn't get that text out just now, sorry about that. "
                "Please head to turanelitelimo.com to book, or hold on and I'll "
                "have our dispatcher call you right back. Anything else in the meantime?"
            )
            logger.warning(
                f"[AI honesty] SMS to {caller} for call_sid={call_sid} DID NOT SEND "
                f"— telling caller the truth instead of claiming success"
            )

        # Speak the confirmation, then keep listening + fallback so a silent
        # caller doesn't get a dead line.
        return _twiml(
            "<Response>"
            + _say(confirmation)
            + _gather(gather_url, "Anything else I can help with?", _SPEECH_HINTS)
            + _fallback_no_input()
            + "</Response>"
        )

    # Default: speak_and_gather (or unknown action)
    return _twiml(
        "<Response>"
        + _gather(gather_url, reply or "How else can I help?", _SPEECH_HINTS)
        + _fallback_no_input()
        + "</Response>"
    )


# ============================================================================
# 3) Transfer-fail — dispatcher didn't pick up, AI resumes
# ============================================================================

@router.post("/twilio/voice/transfer-fail")
async def twilio_voice_transfer_fail(
    request: Request,
    From: str = Form(""),                    # noqa: N803
    CallSid: str = Form(""),                 # noqa: N803
    DialCallStatus: str = Form(""),          # noqa: N803
    DialCallDuration: str = Form(""),        # noqa: N803
):
    """Twilio fires this after our <Dial> attempt to the dispatcher completes.
    - completed & long enough → nothing to do, TwiML hangup.
    - otherwise → AI takes over again with a smooth handoff line."""
    try:
        duration = int(DialCallDuration or "0")
    except (TypeError, ValueError):
        duration = 0

    logger.info(
        f"voice transfer-fail: call_sid={CallSid} status={DialCallStatus!r} duration={duration}"
    )

    if DialCallStatus == "completed" and duration >= 5:
        # Successful transfer that ended normally.
        try:
            await ai_receptionist.append_turn(
                db, CallSid, "system", f"live transfer completed ({duration}s)",
            )
        except Exception:
            pass
        return _twiml("<Response><Hangup/></Response>")

    # Log the missed transfer for follow-up.
    try:
        await db.missed_calls.insert_one({
            "from": From,
            "call_sid": CallSid,
            "dial_status": DialCallStatus,
            "reason": "dispatcher_unavailable",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await ai_receptionist.append_turn(
            db, CallSid, "system", f"transfer failed ({DialCallStatus}) — AI resumed",
        )
    except Exception as e:
        logger.warning(f"transfer-fail logging failed: {e}")

    # AI resumes.
    gather_url = _action_url(request, "/twilio/voice/gather")
    handoff = (
        "Looks like our dispatcher is on another call. "
        "I can still help — would you like me to text you a booking link, or answer a quick question?"
    )
    return _twiml(
        "<Response>"
        + _gather(gather_url, handoff, _SPEECH_HINTS)
        + _fallback_no_input()
        + "</Response>"
    )


# ============================================================================
# Admin endpoints
# ============================================================================

@router.get("/admin/missed-calls")
async def admin_list_missed_calls(_: dict = Depends(require_admin)):
    """Admin view: recent missed calls (dispatcher unavailable, AI-only, silent hangup)."""
    cursor = db.missed_calls.find({}, {"_id": 0}).sort("created_at", -1).limit(200)
    calls = await cursor.to_list(200)
    return {"missed_calls": calls}


@router.get("/admin/voice-calls")
async def admin_list_voice_calls(_: dict = Depends(require_admin)):
    """Admin view: all AI-receptionist conversations with transcripts."""
    cursor = db.voice_call_sessions.find({}, {"_id": 0}).sort("created_at", -1).limit(200)
    sessions = await cursor.to_list(200)
    return {"voice_calls": sessions}


@router.get("/admin/voice-calls/{call_sid}")
async def admin_get_voice_call(call_sid: str, _: dict = Depends(require_admin)):
    sess = await db.voice_call_sessions.find_one({"call_sid": call_sid}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="Call not found")
    return sess
