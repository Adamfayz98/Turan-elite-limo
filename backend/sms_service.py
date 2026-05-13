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


def _normalize_us_phone(raw: str) -> str:
    """Best-effort normalize a phone number into Twilio-friendly E.164 format.
    - Strips spaces, parens, dashes, dots.
    - If already starts with '+', returns as-is.
    - 10 digits → prefixes '+1'.
    - 11 digits starting with '1' → prefixes '+'.
    - Otherwise returns the cleaned string (Twilio will likely reject; logged).
    """
    if not raw:
        return ""
    s = "".join(ch for ch in raw if ch.isdigit() or ch == "+")
    if s.startswith("+"):
        return s
    if len(s) == 10:
        return f"+1{s}"
    if len(s) == 11 and s.startswith("1"):
        return f"+{s}"
    return s


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
    normalized = _normalize_us_phone(to)
    if not normalized.startswith("+"):
        logger.warning(
            f"[SMS skipped — invalid recipient format] raw={to!r} normalized={normalized!r}"
        )
        return None
    try:
        msg = await asyncio.to_thread(
            cli.messages.create, to=normalized, from_=frm, body=body[:1500]
        )
        return getattr(msg, "sid", None)
    except Exception as e:
        logger.warning(f"Twilio send failed for to={normalized!r}: {e}")
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


def render_driver_dispatch_sms(booking: dict, driver_url: str) -> str:
    """SMS sent to driver when admin assigns them to a booking."""
    cn = booking.get("confirmation_number") or booking.get("id", "")[:8]
    name = booking.get("full_name") or "Customer"
    when = f"{booking.get('pickup_date','')} {_fmt_12h(booking.get('pickup_time',''))}".strip()
    pickup = (booking.get("pickup_location") or "")[:60]
    return (
        f"TuranEliteLimo dispatch · #{cn}\n"
        f"{when}\n"
        f"{name}\n"
        f"Pickup: {pickup}\n"
        f"Open trip: {driver_url}"
    )


def render_customer_status_sms(booking: dict, status: str, post_trip_url: Optional[str] = None) -> str:
    """SMS sent to customer when driver updates trip status. Returns None if status
    should not trigger a customer notification."""
    driver_name = (booking.get("driver_name") or "Your chauffeur").split(" ")[0]
    driver_phone = booking.get("driver_phone") or ""
    plate = booking.get("driver_plate") or ""
    vehicle = booking.get("vehicle_type") or "vehicle"
    if status == "en_route":
        eta = "shortly"
        return (
            f"TuranEliteLimo: {driver_name} is on the way to your pickup. "
            f"Arriving {eta}. Call/text {driver_phone} if needed."
        )
    if status == "on_location":
        plate_str = f" (plate {plate})" if plate else ""
        return (
            f"TuranEliteLimo: {driver_name} has arrived. Look for the {vehicle}{plate_str}. "
            f"Driver: {driver_phone}"
        )
    if status == "completed":
        link = f"\nTip & rate your trip: {post_trip_url}" if post_trip_url else ""
        return (
            f"TuranEliteLimo: Trip complete. Thanks for riding with us!"
            f"{link}"
        )
    return None  # passenger_onboard etc. — no customer notification


def render_admin_status_sms(booking: dict, status: str) -> str:
    """SMS sent to admin when driver updates trip status."""
    cn = booking.get("confirmation_number") or booking.get("id", "")[:8]
    name = booking.get("full_name") or "Customer"
    label = {
        "en_route": "EN ROUTE",
        "on_location": "ON LOCATION",
        "passenger_onboard": "PASSENGER ONBOARD",
        "completed": "TRIP COMPLETED",
    }.get(status, status.upper())
    return f"TuranEliteLimo · #{cn} · {label}\n{name}"
