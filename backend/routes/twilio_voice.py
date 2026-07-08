"""Twilio Voice webhook — missed-call auto-SMS responder.

When a customer calls the Twilio number:
  1. `/twilio/voice/incoming` returns TwiML that tries to forward the call
     to the admin/dispatch phone (ADMIN_PHONE env var).
  2. If the admin doesn't pick up (no-answer / busy / failed / canceled),
     Twilio POSTs to `/twilio/voice/status` with `DialCallStatus`, and we
     fire an auto-SMS back to the caller so the lead isn't lost.

Twilio dashboard config (customer must do this ONCE):
  Phone Numbers → Manage → Active numbers → click the number →
    "A CALL COMES IN" webhook → HTTP POST →
    https://api.turanelitelimo.com/api/twilio/voice/incoming

All routes are public (no admin auth) because Twilio calls them directly.
Signature validation via TWILIO_AUTH_TOKEN can be added if abuse ever appears.
"""
# ruff: noqa: F821, F405
from __future__ import annotations

import logging
import os
from urllib.parse import quote

from fastapi import APIRouter, Form, Request
from fastapi.responses import Response

import server as _server  # noqa: E402
globals().update({k: v for k, v in vars(_server).items() if not k.startswith("__")})

router = APIRouter()
logger = logging.getLogger(__name__)

_XML = "application/xml"


def _twiml(body: str) -> Response:
    return Response(content=f'<?xml version="1.0" encoding="UTF-8"?>\n{body}', media_type=_XML)


@router.post("/twilio/voice/incoming")
async def twilio_voice_incoming(request: Request):
    """Forward the incoming call to the admin/dispatch number. If unanswered,
    Twilio will hit /twilio/voice/status and we'll auto-SMS the caller."""
    admin = sms_service.admin_phone()  # +1... required
    if not admin:
        # No admin number configured — send caller to voicemail via <Say>.
        return _twiml(
            "<Response>"
            "<Say voice=\"alice\">You have reached Turan Elite Limo. "
            "We are unable to take your call at this moment. Please leave a message after the tone "
            "or text this number for a fast response.</Say>"
            "<Record maxLength=\"60\" playBeep=\"true\" />"
            "</Response>"
        )
    # Twilio expects the action URL to be reachable via HTTPS (public origin).
    origin = _public_origin()
    action_url = f"{origin}/api/twilio/voice/status"
    # Dial timeout 22s (~4 rings) — long enough for a human to grab the phone,
    # short enough that the caller doesn't hang up before we can auto-SMS.
    return _twiml(
        "<Response>"
        f"<Dial timeout=\"22\" action=\"{action_url}\" method=\"POST\" answerOnBridge=\"true\">"
        f"{admin}"
        "</Dial>"
        "</Response>"
    )


@router.post("/twilio/voice/status")
async def twilio_voice_status(
    request: Request,
    From: str = Form(""),                    # noqa: N803 (Twilio param)
    To: str = Form(""),                      # noqa: N803
    CallSid: str = Form(""),                 # noqa: N803
    DialCallStatus: str = Form(""),          # noqa: N803
    DialCallDuration: str = Form(""),        # noqa: N803
):
    """Twilio fires this after <Dial> completes.
    DialCallStatus: completed | busy | no-answer | canceled | failed
    """
    caller = (From or "").strip()
    logger.info(
        f"twilio voice status callback: from={caller!r} sid={CallSid!r} "
        f"status={DialCallStatus!r} duration={DialCallDuration!r}"
    )

    # If the admin picked up, nothing to do — Twilio already hung up on the caller.
    if DialCallStatus == "completed" and int(DialCallDuration or "0") >= 5:
        return _twiml("<Response><Hangup/></Response>")

    # Record a missed-call log so admin can call back.
    try:
        await db.missed_calls.insert_one({
            "from": caller,
            "to": To,
            "call_sid": CallSid,
            "dial_status": DialCallStatus,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.warning(f"missed_call insert failed: {e}")

    # Auto-SMS the caller with a fast booking link so we don't lose the lead.
    if caller and caller.startswith("+"):
        try:
            origin = _public_origin()
            sms_body = (
                "Turan Elite Limo: Sorry we missed your call. "
                f"Get an instant quote & book online: {origin}/book "
                "Or reply here with your pickup + drop-off and we'll price it for you. "
                "Reply STOP to opt out."
            )
            await sms_service.send_sms(caller, sms_body)
        except Exception as e:
            logger.warning(f"missed-call auto-SMS failed for {caller}: {e}")

    # Play a graceful message + hang up.
    return _twiml(
        "<Response>"
        "<Say voice=\"alice\">Thanks for calling Turan Elite Limo. "
        "We just texted you a link to book online. "
        "You can also reply to that text with your trip details.</Say>"
        "<Hangup/>"
        "</Response>"
    )


@router.get("/admin/missed-calls")
async def admin_list_missed_calls(_: dict = Depends(require_admin)):
    """Admin view: recent missed calls so the team can follow up."""
    cursor = db.missed_calls.find({}, {"_id": 0}).sort("created_at", -1).limit(200)
    calls = await cursor.to_list(200)
    return {"missed_calls": calls}


# Silence unused import warning — quote is available for future use.
_ = quote
