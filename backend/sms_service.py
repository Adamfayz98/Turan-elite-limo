"""Twilio SMS helper for TuranEliteLimo. Async-friendly via asyncio.to_thread.

Fully env-gated: if TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, or
ADMIN_PHONE are missing/empty, every send_sms() call becomes a no-op (logs a
warning) so the rest of the app keeps working until the keys are filled in.
"""
from __future__ import annotations

import os
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def _client():
    sid = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
    token = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
    if not sid or not token:
        return None
    try:
        from twilio.rest import Client
        return Client(sid, token)
    except Exception as e:
        logger.warning(f"Twilio client init failed: {e}")
        return None


def _from_number() -> str:
    return os.environ.get("TWILIO_FROM_NUMBER", "").strip()


def admin_phone() -> str:
    """Return the admin/driver phone number that gets new-booking SMS alerts."""
    return os.environ.get("ADMIN_PHONE", "").strip()


def is_configured() -> bool:
    return bool(_client() and _from_number() and admin_phone())


async def send_sms(to: str, body: str) -> Optional[str]:
    """Send a single SMS. Returns Twilio SID on success, None on no-op/failure."""
    cli = _client()
    frm = _from_number()
    if not cli or not frm:
        logger.info(f"[SMS skipped — Twilio not configured] to={to} body={body[:60]!r}")
        return None
    if not to:
        logger.info("[SMS skipped — empty recipient]")
        return None
    try:
        msg = await asyncio.to_thread(
            cli.messages.create, to=to, from_=frm, body=body[:1500]
        )
        return getattr(msg, "sid", None)
    except Exception as e:
        logger.warning(f"Twilio send failed: {e}")
        return None


def _fmt_12h(time24: str) -> str:
    if not time24 or ":" not in time24:
        return time24 or ""
    try:
        h, m = time24.split(":")[:2]
        h = int(h); m = int(m)
    except Exception:
        return time24
    meridiem = "PM" if h >= 12 else "AM"
    h12 = h % 12 or 12
    return f"{h12}:{m:02d} {meridiem}"


def render_new_paid_booking_sms(booking: dict) -> str:
    cn = booking.get("confirmation_number") or booking.get("id", "")[:8]
    name = booking.get("full_name") or "Customer"
    when = f"{booking.get('pickup_date','')} {_fmt_12h(booking.get('pickup_time',''))}".strip()
    pickup = (booking.get("pickup_location") or "")[:60]
    dropoff = (booking.get("dropoff_location") or "")[:60]
    vehicle = booking.get("vehicle_type") or ""
    paid = booking.get("paid_amount")
    paid_str = f"${paid:,.2f}" if paid is not None else ""
    phone = booking.get("phone") or ""
    return (
        f"TuranEliteLimo · NEW PAID BOOKING\n"
        f"#{cn}\n"
        f"{name} — {phone}\n"
        f"{when} · {vehicle}\n"
        f"{pickup} → {dropoff}\n"
        f"Paid: {paid_str}"
    )


def render_cancellation_sms(booking: dict, requested: bool = False) -> str:
    cn = booking.get("confirmation_number") or booking.get("id", "")[:8]
    name = booking.get("full_name") or "Customer"
    when = f"{booking.get('pickup_date','')} {_fmt_12h(booking.get('pickup_time',''))}".strip()
    label = "CANCELLATION REQUESTED (paid — review refund)" if requested else "CUSTOMER CANCELLED"
    return (
        f"TuranEliteLimo · {label}\n"
        f"#{cn}\n"
        f"{name}\n"
        f"{when}"
    )
