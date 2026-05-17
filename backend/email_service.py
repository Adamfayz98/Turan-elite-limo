"""Resend email helper for TuranEliteLimo. Async-friendly via asyncio.to_thread."""
from __future__ import annotations

import os
import asyncio
import json
from datetime import datetime, timezone
import logging
from typing import Optional

import resend

logger = logging.getLogger(__name__)

resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
SUPPORT_EMAIL = os.environ.get("SUPPORT_EMAIL", "support@turanelitelimo.com")
SUPPORT_PHONE = os.environ.get("SUPPORT_PHONE", "(650) 410-0687")
ADMIN_SMS_GATEWAY = os.environ.get("ADMIN_SMS_GATEWAY", "").strip()
COMPANY_NAME = "TuranEliteLimo"


async def send_admin_sms(text: str) -> Optional[str]:
    """
    Sends a plain-text SMS to ADMIN_SMS_GATEWAY (carrier email-to-SMS bridge,
    e.g. 4152999587@tmomail.net). Carriers strip HTML and cap at ~160 chars per
    segment, so we keep it short and plain. Fire-and-forget — never raises.
    """
    if not resend.api_key or not ADMIN_SMS_GATEWAY:
        return None
    # Trim to ~300 chars (2 segments of safety) — most carriers concat.
    text = (text or "").strip()
    if len(text) > 300:
        text = text[:297] + "..."
    params = {
        "from": f"TEL <{SENDER_EMAIL}>",
        "to": [ADMIN_SMS_GATEWAY],
        "subject": "",   # empty subject — carriers prepend their own anyway
        "text": text,    # plain text only; carriers strip HTML
    }
    try:
        r = await asyncio.to_thread(resend.Emails.send, params)
        return r.get("id") if isinstance(r, dict) else None
    except Exception as e:
        logger.warning(f"Admin SMS via gateway failed: {e}")
        return None


async def send_email(
    to: str,
    subject: str,
    html: str,
    bcc: Optional[list] = None,
    reply_to: Optional[str] = None,
) -> Optional[str]:
    if not resend.api_key:
        logger.warning("RESEND_API_KEY missing — skipping email send.")
        return None
    params = {
        "from": f"{COMPANY_NAME} <{SENDER_EMAIL}>",
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if bcc:
        params["bcc"] = bcc
    if reply_to:
        params["reply_to"] = reply_to
    try:
        r = await asyncio.to_thread(resend.Emails.send, params)
        return r.get("id") if isinstance(r, dict) else None
    except Exception as e:
        logger.error(f"Resend send failed: {e}")
        return None


def _format_time_12h(time24: str) -> str:
    """'13:30' -> '1:30 PM', '08:00' -> '8:00 AM'. Returns input as-is if unparseable."""
    if not time24 or ":" not in time24:
        return time24 or ""
    try:
        h_str, m_str = time24.split(":")[:2]
        h = int(h_str)
        m = int(m_str)
    except (ValueError, IndexError):
        return time24
    meridiem = "PM" if h >= 12 else "AM"
    h12 = h % 12 or 12
    return f"{h12}:{m:02d} {meridiem}"


def render_cancellation_policy_html(is_airport: bool = False) -> str:
    """Cancellation & change policy block for confirmation emails."""
    airport_block = ""
    if is_airport:
        airport_block = """
        <div style="margin-top:14px;padding-top:14px;border-top:1px dashed #2a2a2a;">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#D4AF37;margin-bottom:8px;">
            Airport Transfer · Flight-Delay Protection
          </div>
          <ul style="color:#aaa;font-size:12px;line-height:1.7;padding-left:18px;margin:0;">
            <li>We monitor your flight number in real time — if your flight is <strong>delayed</strong>, your chauffeur adjusts the pickup automatically at <strong>no extra charge</strong>.</li>
            <li>If your airline <strong>cancels your flight</strong>, you'll receive a full refund or free re-schedule with airline confirmation.</li>
            <li>Free <strong>15-minute grace period</strong> after landing (45 min for international). After that, wait time bills at the vehicle's hourly rate.</li>
            <li>No-show without contact 30 minutes past landing = full charge.</li>
          </ul>
        </div>
        """
    return f"""
    <tr><td style="padding:0 32px 8px 32px;">
      <div style="background:#0a0a0a;border:1px solid #1f1f1f;border-radius:10px;padding:18px 22px;">
        <div style="font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#D4AF37;margin-bottom:10px;">
          Cancellation &amp; change policy
        </div>
        <ul style="color:#aaa;font-size:12px;line-height:1.7;padding-left:18px;margin:0;">
          <li><strong style="color:#fff;">Free cancellation</strong> · 24+ hours before pickup → full refund.</li>
          <li><strong style="color:#fff;">50% refund</strong> · 12–24 hours before pickup.</li>
          <li><strong style="color:#fff;">No refund</strong> · less than 12 hours before pickup, or no-show.</li>
          <li><strong style="color:#fff;">Free changes</strong> (date / time / vehicle / route) · 6+ hours before pickup.</li>
        </ul>
        {airport_block}
        <p style="color:#777;font-size:11px;line-height:1.6;margin:14px 0 0 0;">
          Cancel or change anytime in one click from your <strong style="color:#D4AF37;">Manage Reservation</strong> link above, or call us at {SUPPORT_PHONE}.
        </p>
      </div>
    </td></tr>
    """


def render_request_received_email(booking: dict, manage_url: Optional[str] = None) -> str:
    """Stage-1 acknowledgment email — sent the instant a customer submits a request,
    BEFORE the admin reviews and confirms. No payment link. Sets the expectation:
    "We'll confirm within an hour and send you a payment link."
    """
    first_name = (booking.get('full_name') or '').split(' ')[0] or 'there'
    extras = []
    if booking.get("hours"):
        extras.append(f"Duration: {booking['hours']} hour{'s' if booking['hours'] > 1 else ''} (hourly chauffeur)")
    if booking.get("flight_number"):
        extras.append(f"Flight number: {booking['flight_number']}")
    if booking.get("meet_and_greet"):
        extras.append("Meet & Greet: requested")
    if booking.get("luggage_count"):
        extras.append(f"Luggage: {booking['luggage_count']} bags")
    if booking.get("return_trip"):
        extras.append(f"Round trip → {booking.get('return_location') or 'TBA'}")
    extras_html = "".join(
        f'<tr><td style="padding:4px 0;color:#888;font-family:Arial,sans-serif;font-size:13px;">• {e}</td></tr>'
        for e in extras
    )
    manage_btn = render_manage_link_html(manage_url) if manage_url else ""
    return f"""
<!doctype html>
<html><body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#111111;border-radius:14px;overflow:hidden;border:1px solid #1f1f1f;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;border-bottom:1px solid #1f1f1f;">
          <span style="font-size:24px;color:#ffffff;font-weight:700;letter-spacing:-0.3px;">
            Turan<span style="color:#D4AF37;">EliteLimo</span>
          </span>
        </td></tr>

        <tr><td style="padding:32px 32px 8px 32px;">
          <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#D4AF37;margin-bottom:12px;">
            Request Received
          </div>
          <h1 style="font-size:24px;color:#ffffff;margin:0 0 12px 0;font-weight:600;">
            Hi {first_name} — we've got your request.
          </h1>
          <p style="color:#bbbbbb;font-size:14px;line-height:1.7;margin:0;">
            Thanks for choosing TuranEliteLimo. We're reviewing the details below now and
            will follow up with a <strong style="color:#D4AF37;">confirmation email + secure
            payment link within an hour</strong>. Your reservation is not finalized until
            you receive that second email and complete payment.
          </p>
        </td></tr>

        <tr><td style="padding:20px 32px 4px 32px;">
          <div style="background:#0a0a0a;border:1px dashed #2a2a2a;border-radius:10px;padding:14px 18px;">
            <div style="font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#D4AF37;margin-bottom:6px;">
              What happens next
            </div>
            <ol style="color:#aaa;font-size:13px;line-height:1.7;padding-left:20px;margin:0;">
              <li>We verify availability of your chauffeur &amp; vehicle.</li>
              <li>You receive a <strong style="color:#fff;">confirmation email</strong> with your reservation number and a Stripe payment link.</li>
              <li>Once paid, your slot is locked in — your chauffeur contacts you before pickup.</li>
            </ol>
          </div>
        </td></tr>

        <tr><td style="padding:16px 32px 8px 32px;">
          <table cellpadding="0" cellspacing="0" width="100%" style="margin-top:12px;border-top:1px solid #1f1f1f;">
            <tr><td style="padding-top:16px;color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;">When</td>
                <td style="padding-top:16px;color:#ffffff;font-size:14px;text-align:right;">
                  {booking.get('pickup_date','')} at {_format_time_12h(booking.get('pickup_time',''))}
                </td></tr>
            <tr><td style="padding-top:10px;color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Pickup</td>
                <td style="padding-top:10px;color:#ffffff;font-size:14px;text-align:right;">
                  {booking.get('pickup_location','')}
                </td></tr>
            <tr><td style="padding-top:10px;color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Drop-off</td>
                <td style="padding-top:10px;color:#ffffff;font-size:14px;text-align:right;">
                  {booking.get('dropoff_location','')}
                </td></tr>
            <tr><td style="padding-top:10px;color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Vehicle</td>
                <td style="padding-top:10px;color:#ffffff;font-size:14px;text-align:right;">
                  {booking.get('vehicle_type','')}
                </td></tr>
            <tr><td style="padding-top:10px;color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Service</td>
                <td style="padding-top:10px;color:#ffffff;font-size:14px;text-align:right;">
                  {booking.get('service_type','')}
                </td></tr>
            <tr><td style="padding-top:10px;color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Passengers</td>
                <td style="padding-top:10px;color:#ffffff;font-size:14px;text-align:right;">
                  {booking.get('passengers','')}
                </td></tr>
          </table>
          {f'<table style="margin-top:12px;">{extras_html}</table>' if extras_html else ''}
        </td></tr>

        {manage_btn}

        <tr><td style="padding:24px 32px;border-top:1px solid #1f1f1f;color:#888;font-size:12px;line-height:1.6;">
          Need to change something before we confirm? Reply to this email or call
          <a href="tel:+16504100687" style="color:#D4AF37;text-decoration:none;">{SUPPORT_PHONE}</a>.
          We're here to help.
        </td></tr>
        <tr><td style="padding:16px 32px 24px 32px;color:#555;font-size:11px;">
          TuranEliteLimo · Bay Area & Northern California · Licensed · Insured · TCP-Compliant
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""


def render_confirmation_email(booking: dict, payment_url: Optional[str] = None, manage_url: Optional[str] = None) -> str:
    """HTML email with branding + ride summary + optional Manage link.

    Note: `payment_url` is intentionally ignored. All web bookings are paid upfront via
    Stripe before this confirmation email is ever sent, so there is no longer a
    "Pay & Secure" button. The parameter is kept for backward compatibility.
    """
    cn = booking.get("confirmation_number", "")
    pay_btn = ""
    manage_btn = render_manage_link_html(manage_url) if manage_url else ""
    extras = []
    if booking.get("hours"):
        extras.append(f"Duration: {booking['hours']} hour{'s' if booking['hours'] > 1 else ''} (hourly chauffeur)")
    if booking.get("flight_number"):
        extras.append(f"Flight number: {booking['flight_number']} (your chauffeur will monitor your flight)")
    if booking.get("meet_and_greet"):
        extras.append("Meet & Greet: chauffeur will meet you inside the terminal at baggage claim")
    if booking.get("child_seat"):
        extras.append("Child seat: requested")
    if booking.get("luggage_count"):
        extras.append(f"Luggage: {booking['luggage_count']} bags")
    if booking.get("return_trip"):
        extras.append(f"Round trip → {booking.get('return_location') or 'TBA'}")
    if booking.get("additional_stops"):
        extras.append("Stops: " + ", ".join(booking["additional_stops"]))
    extras_html = "".join(
        f'<tr><td style="padding:4px 0;color:#888;font-family:Arial,sans-serif;font-size:13px;">• {e}</td></tr>'
        for e in extras
    )

    # Schema.org structured data — tells Gmail/Apple Mail to render this as a
    # confirmed limo reservation instead of auto-guessing "train trip canceled".
    pickup_dt_iso = ""
    try:
        pdt = booking.get("pickup_date")
        ptm = booking.get("pickup_time") or "00:00"
        if pdt:
            pickup_dt_iso = f"{pdt}T{ptm}:00-08:00"
    except Exception:
        pickup_dt_iso = ""
    schema = {
        "@context": "http://schema.org",
        "@type": "Reservation",
        "reservationNumber": cn,
        "reservationStatus": "http://schema.org/ReservationConfirmed",
        "underName": {"@type": "Person", "name": booking.get("full_name", "")},
        "reservationFor": {
            "@type": "Taxi",
            "name": f"TuranEliteLimo · {booking.get('vehicle_type','Chauffeur')}",
        },
        "pickupTime": pickup_dt_iso or None,
        "pickupLocation": {
            "@type": "Place",
            "name": booking.get("pickup_location", ""),
            "address": booking.get("pickup_location", ""),
        },
        "dropoffLocation": {
            "@type": "Place",
            "name": booking.get("dropoff_location", ""),
            "address": booking.get("dropoff_location", ""),
        },
        "provider": {
            "@type": "Organization",
            "name": "TuranEliteLimo",
            "url": "https://turanelitelimo.com",
        },
    }
    schema = {k: v for k, v in schema.items() if v is not None}
    schema_block = f'<script type="application/ld+json">{json.dumps(schema)}</script>'

    return f"""
<!doctype html>
<html><head>{schema_block}</head><body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#111111;border-radius:14px;overflow:hidden;border:1px solid #1f1f1f;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;border-bottom:1px solid #1f1f1f;">
          <span style="font-size:24px;color:#ffffff;font-weight:700;letter-spacing:-0.3px;">
            Turan<span style="color:#D4AF37;">EliteLimo</span>
          </span>
        </td></tr>

        <tr><td style="padding:32px 32px 8px 32px;">
          <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#D4AF37;margin-bottom:12px;">
            Reservation Confirmed
          </div>
          <h1 style="font-size:26px;color:#ffffff;margin:0 0 8px 0;font-weight:600;">
            Hi {booking.get('full_name','').split(' ')[0] or 'there'} — your ride is locked in.
          </h1>
          <p style="color:#aaaaaa;font-size:14px;line-height:1.6;margin:0;">
            Thank you for choosing TuranEliteLimo. Your reservation is received and confirmed.
            Save the confirmation number below — your chauffeur will reference it on arrival.
          </p>
        </td></tr>

        <tr><td style="padding:24px 32px 8px 32px;">
          <table cellpadding="0" cellspacing="0" width="100%" style="background:#0a0a0a;border:1px solid #D4AF37;border-radius:10px;">
            <tr><td style="padding:18px 22px;">
              <div style="font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#888;">
                Confirmation Number
              </div>
              <div style="font-size:30px;color:#D4AF37;letter-spacing:3px;font-weight:700;margin-top:6px;font-family:'Courier New',monospace;">
                {cn}
              </div>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:8px 32px;">
          <table cellpadding="0" cellspacing="0" width="100%" style="margin-top:16px;border-top:1px solid #1f1f1f;">
            <tr><td style="padding-top:16px;color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;">When</td>
                <td style="padding-top:16px;color:#ffffff;font-size:14px;text-align:right;">
                  {booking.get('pickup_date','')} at {_format_time_12h(booking.get('pickup_time',''))}
                </td></tr>
            <tr><td style="padding-top:10px;color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Pickup</td>
                <td style="padding-top:10px;color:#ffffff;font-size:14px;text-align:right;">
                  {booking.get('pickup_location','')}
                </td></tr>
            <tr><td style="padding-top:10px;color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Drop-off</td>
                <td style="padding-top:10px;color:#ffffff;font-size:14px;text-align:right;">
                  {booking.get('dropoff_location','')}
                </td></tr>
            <tr><td style="padding-top:10px;color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Vehicle</td>
                <td style="padding-top:10px;color:#ffffff;font-size:14px;text-align:right;">
                  {booking.get('vehicle_type','')}
                </td></tr>
            <tr><td style="padding-top:10px;color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Service</td>
                <td style="padding-top:10px;color:#ffffff;font-size:14px;text-align:right;">
                  {booking.get('service_type','')}
                </td></tr>
            <tr><td style="padding-top:10px;color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Passengers</td>
                <td style="padding-top:10px;color:#ffffff;font-size:14px;text-align:right;">
                  {booking.get('passengers','')}
                </td></tr>
          </table>
          {f'<table style="margin-top:12px;">{extras_html}</table>' if extras_html else ''}
        </td></tr>

        {pay_btn}
        {manage_btn}

        {render_cancellation_policy_html(booking.get('service_type') == 'Airport Transfer')}

        <tr><td style="padding:24px 32px;border-top:1px solid #1f1f1f;color:#888;font-size:12px;line-height:1.6;">
          Questions or changes? Call <a href="tel:+16504100687" style="color:#D4AF37;text-decoration:none;">{SUPPORT_PHONE}</a>
          or email <a href="mailto:{SUPPORT_EMAIL}" style="color:#D4AF37;text-decoration:none;">{SUPPORT_EMAIL}</a>.
        </td></tr>
        <tr><td style="padding:16px 32px 24px 32px;color:#555;font-size:11px;">
          TuranEliteLimo · Bay Area & Northern California · Licensed · Insured · TCP-Compliant
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""


def render_payment_received_pending_email(booking: dict, amount: float, manage_url: Optional[str] = None) -> str:
    """Sent immediately AFTER successful Stripe payment, before admin has reviewed.
    Tells the customer: we've got your money, your slot is held, we're confirming
    chauffeur details and will email final confirmation within an hour.
    """
    cn = booking.get("confirmation_number", "")
    first_name = (booking.get('full_name') or '').split(' ')[0] or 'there'
    manage_btn = render_manage_link_html(manage_url) if manage_url else ""
    return f"""
<!doctype html>
<html><body style="margin:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;color:#fff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#111;border-radius:14px;border:1px solid #1f1f1f;overflow:hidden;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;border-bottom:1px solid #1f1f1f;">
          <span style="font-size:24px;font-weight:700;">
            Turan<span style="color:#D4AF37;">EliteLimo</span>
          </span>
        </td></tr>

        <tr><td style="padding:32px 32px 8px 32px;">
          <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#D4AF37;margin-bottom:12px;">
            Payment Received · Confirming Your Chauffeur
          </div>
          <h1 style="font-size:24px;margin:0 0 12px 0;font-weight:600;">
            Thanks {first_name} — your slot is held.
          </h1>
          <p style="color:#bbb;font-size:14px;line-height:1.7;margin:0;">
            We've received your payment of <strong style="color:#D4AF37;">${amount:,.2f}</strong>.
            Our team is now finalizing your chauffeur and vehicle assignment.
            You'll receive a <strong style="color:#fff;">final confirmation email</strong> with
            your driver's name and contact info <span style="color:#D4AF37;">within an hour</span>.
          </p>
        </td></tr>

        <tr><td style="padding:20px 32px 4px 32px;">
          <table cellpadding="0" cellspacing="0" width="100%" style="background:#0a0a0a;border:1px solid #D4AF37;border-radius:10px;">
            <tr><td style="padding:18px 22px;">
              <div style="font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#888;">
                Confirmation Number
              </div>
              <div style="font-size:30px;color:#D4AF37;letter-spacing:3px;font-weight:700;margin-top:6px;font-family:'Courier New',monospace;">
                {cn}
              </div>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:20px 32px 4px 32px;">
          <div style="background:#0a0a0a;border:1px dashed #2a2a2a;border-radius:10px;padding:14px 18px;">
            <div style="font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#D4AF37;margin-bottom:6px;">
              What happens next
            </div>
            <ol style="color:#aaa;font-size:13px;line-height:1.7;padding-left:20px;margin:0;">
              <li>We verify chauffeur &amp; vehicle availability for your date/time.</li>
              <li>You receive <strong style="color:#fff;">final confirmation</strong> with chauffeur contact info.</li>
              <li><strong style="color:#fff;">Rare case:</strong> if we can't fulfill, you're auto-refunded within 24 hours.</li>
            </ol>
          </div>
        </td></tr>

        {manage_btn}

        <tr><td style="padding:18px 32px;border-top:1px solid #1f1f1f;color:#aaa;font-size:11px;line-height:1.6;">
          <div style="color:#D4AF37;letter-spacing:1.5px;text-transform:uppercase;font-size:10px;margin-bottom:6px;">
            Wait time policy
          </div>
          Airport pickups include <strong style="color:#fff;">45 min free</strong> after your flight lands.
          All other trips include <strong style="color:#fff;">15 min free</strong> after the scheduled pickup time.
          Beyond that, your saved card may be charged the per-minute wait rate for your vehicle class.
          After 45 min of paid wait time without contact, the reservation is treated as a no-show.
        </td></tr>

        <tr><td style="padding:24px 32px;border-top:1px solid #1f1f1f;color:#888;font-size:12px;line-height:1.6;">
          Need to change something? Reply to this email or call
          <a href="tel:+16504100687" style="color:#D4AF37;text-decoration:none;">{SUPPORT_PHONE}</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""


def render_payment_receipt_email(booking: dict, amount: float) -> str:
    cn = booking.get("confirmation_number", "")
    return f"""
<!doctype html>
<html><body style="margin:0;background:#0a0a0a;font-family:Arial,sans-serif;color:#fff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#111;border-radius:14px;border:1px solid #1f1f1f;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;border-bottom:1px solid #1f1f1f;">
          <span style="font-size:24px;font-weight:700;">
            Turan<span style="color:#D4AF37;">EliteLimo</span>
          </span>
        </td></tr>
        <tr><td style="padding:32px;">
          <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#D4AF37;margin-bottom:12px;">Payment Received</div>
          <h2 style="font-size:24px;margin:0 0 12px 0;">Thank you — your payment is confirmed.</h2>
          <p style="color:#aaa;font-size:14px;line-height:1.6;">
            We've received <strong style="color:#D4AF37;">${amount:,.2f}</strong> for confirmation
            <strong style="color:#D4AF37;font-family:'Courier New',monospace;">{cn}</strong>.
            Your chauffeur will be in touch shortly before pickup.
          </p>
        </td></tr>
        <tr><td style="padding:0 32px 24px;color:#888;font-size:12px;">
          Questions? Call <a href="tel:+16504100687" style="color:#D4AF37;">{SUPPORT_PHONE}</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""



def render_cancellation_email(
    booking: dict,
    admin_reason: Optional[str] = None,
    refund_pending: bool = False,
    manage_url: Optional[str] = None,
) -> str:
    """Sent when admin (or customer via manage page) cancels a booking.
    - admin_reason: optional note from the admin shown to the customer.
    - refund_pending: True if booking was paid → mention refund timeline.
    """
    cn = booking.get("confirmation_number") or booking.get("id", "")[:8]
    first_name = (booking.get("full_name") or "").split(" ")[0] or "there"
    when_text = f"{booking.get('pickup_date','')} at {_format_time_12h(booking.get('pickup_time',''))}".strip(" at ")

    reason_html = ""
    if admin_reason:
        reason_html = f"""
        <div style="margin-top:16px;padding:14px 18px;background:#0a0a0a;border-left:3px solid #D4AF37;border-radius:8px;">
          <div style="font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#D4AF37;margin-bottom:6px;">
            Reason
          </div>
          <p style="color:#ddd;font-size:13px;line-height:1.7;margin:0;white-space:pre-wrap;">{admin_reason}</p>
        </div>
        """

    refund_html = ""
    if refund_pending:
        refund_html = """
        <div style="margin-top:16px;padding:14px 18px;background:#0a0a0a;border:1px dashed #2a2a2a;border-radius:8px;">
          <div style="font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#D4AF37;margin-bottom:6px;">
            Refund
          </div>
          <p style="color:#bbb;font-size:13px;line-height:1.7;margin:0;">
            A <strong style="color:#fff;">full refund</strong> has been issued. It typically appears in your
            account in 5–10 business days, depending on your bank.
          </p>
        </div>
        """

    return f"""
<!doctype html>
<html><body style="margin:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;color:#fff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#111;border-radius:14px;border:1px solid #1f1f1f;overflow:hidden;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;border-bottom:1px solid #1f1f1f;">
          <span style="font-size:24px;font-weight:700;">
            Turan<span style="color:#D4AF37;">EliteLimo</span>
          </span>
        </td></tr>

        <tr><td style="padding:32px 32px 8px 32px;">
          <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#D4AF37;margin-bottom:12px;">
            Reservation Cancelled
          </div>
          <h1 style="font-size:24px;margin:0 0 12px 0;font-weight:600;">
            Hi {first_name},
          </h1>
          <p style="color:#bbb;font-size:14px;line-height:1.7;margin:0;">
            We're writing to confirm that your TuranEliteLimo reservation
            (<strong style="color:#D4AF37;">{cn}</strong>) for <strong style="color:#fff;">{when_text or 'your scheduled trip'}</strong>
            has been <strong style="color:#fff;">cancelled</strong>.
          </p>
          {reason_html}
          {refund_html}
        </td></tr>

        <tr><td style="padding:24px 32px 8px 32px;">
          <p style="color:#aaa;font-size:13px;line-height:1.7;margin:0;">
            We're sorry for the inconvenience. We'd love to chauffeur you another time —
            simply book again at any point and we'll make it happen.
          </p>
        </td></tr>

        <tr><td style="padding:24px 32px;border-top:1px solid #1f1f1f;color:#888;font-size:12px;line-height:1.6;">
          Questions? Call <a href="tel:+16504100687" style="color:#D4AF37;text-decoration:none;">{SUPPORT_PHONE}</a>
          or email <a href="mailto:{SUPPORT_EMAIL}" style="color:#D4AF37;text-decoration:none;">{SUPPORT_EMAIL}</a>.
        </td></tr>
        <tr><td style="padding:16px 32px 24px 32px;color:#555;font-size:11px;">
          TuranEliteLimo · Bay Area &amp; Northern California
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""


def render_2fa_code_email(code: str, request_meta: Optional[str] = None) -> str:
    """Branded email containing a 6-digit admin login verification code."""
    meta_html = (
        f'<p style="color:#666;font-size:12px;margin:18px 0 0 0;">{request_meta}</p>'
        if request_meta else ""
    )
    return f"""
<!doctype html>
<html><body style="margin:0;background:#0a0a0a;font-family:Arial,sans-serif;color:#fff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111;border-radius:14px;border:1px solid #1f1f1f;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;border-bottom:1px solid #1f1f1f;">
          <span style="font-size:22px;font-weight:700;">
            Turan<span style="color:#D4AF37;">EliteLimo</span>
          </span>
        </td></tr>
        <tr><td style="padding:32px;">
          <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#D4AF37;margin-bottom:14px;">
            Admin Sign-In · Verification
          </div>
          <h2 style="font-size:22px;margin:0 0 12px 0;">Your one-time login code</h2>
          <p style="color:#aaa;font-size:14px;line-height:1.6;margin:0 0 20px 0;">
            Use the code below to finish signing in to the TuranEliteLimo admin console.
            This code is valid for <strong style="color:#fff;">10 minutes</strong> and can only be used once.
          </p>
          <div style="background:#0a0a0a;border:1px solid #D4AF37;border-radius:10px;padding:22px;text-align:center;">
            <div style="font-family:'Courier New',monospace;font-size:38px;letter-spacing:14px;color:#D4AF37;font-weight:700;">
              {code}
            </div>
          </div>
          <p style="color:#888;font-size:12px;line-height:1.6;margin:22px 0 0 0;">
            If you did <strong style="color:#fff;">not</strong> request this code, you can safely ignore this email
            — your password is required first, so no one can use this code without it.
          </p>
          {meta_html}
        </td></tr>
        <tr><td style="padding:0 32px 24px;color:#555;font-size:11px;">
          TuranEliteLimo · Admin security · Sent automatically. Do not reply.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""



def render_review_request_email(booking: dict, google_url: str, yelp_url: str) -> str:
    cn = booking.get("confirmation_number", "")
    first = (booking.get("full_name") or "").split(" ")[0] or "there"
    return f"""
<!doctype html>
<html><body style="margin:0;background:#0a0a0a;font-family:Arial,sans-serif;color:#fff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#111;border-radius:14px;border:1px solid #1f1f1f;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;border-bottom:1px solid #1f1f1f;">
          <span style="font-size:24px;font-weight:700;">
            Turan<span style="color:#D4AF37;">EliteLimo</span>
          </span>
        </td></tr>
        <tr><td style="padding:32px;">
          <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#D4AF37;margin-bottom:14px;">
            How was your ride?
          </div>
          <h2 style="font-size:24px;margin:0 0 12px 0;">Thanks for riding with us, {first}.</h2>
          <p style="color:#aaa;font-size:14px;line-height:1.7;margin:0 0 18px 0;">
            We hope reservation <strong style="color:#D4AF37;font-family:'Courier New',monospace;">{cn}</strong> was everything you expected. If our chauffeur made your ride memorable, would you take 30 seconds to leave a quick review? It's the single biggest thing that helps us keep doing what we love.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:8px 0 4px 0;">
            <tr>
              <td style="padding-right:10px;">
                <a href="{google_url}" style="display:inline-block;background:#D4AF37;color:#0a0a0a;text-decoration:none;padding:13px 24px;border-radius:999px;font-weight:600;font-size:14px;">
                  Review on Google
                </a>
              </td>
              <td>
                <a href="{yelp_url}" style="display:inline-block;background:#0a0a0a;border:1px solid #D4AF37;color:#D4AF37;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;font-size:14px;">
                  Review on Yelp
                </a>
              </td>
            </tr>
          </table>
          <p style="color:#888;font-size:12px;line-height:1.6;margin:24px 0 0 0;">
            Anything we could've done better? Just reply to this email — a real person reads every word.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;color:#555;font-size:11px;border-top:1px solid #1f1f1f;">
          TuranEliteLimo · 501 Broadway #251, Millbrae CA 94030 · {SUPPORT_PHONE}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""


def render_manage_link_html(manage_url: str) -> str:
    return f"""
    <tr><td style="padding:0 32px 8px 32px;">
      <a href="{manage_url}" style="display:inline-block;background:transparent;border:1px solid #D4AF37;color:#D4AF37;
         text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;
         font-family:Arial,sans-serif;font-size:13px;letter-spacing:0.3px;">
         Manage / Cancel my reservation
      </a>
    </td></tr>
    """



def render_admin_new_request_email(booking: dict, admin_dashboard_url: str = "") -> str:
    """Internal admin notification when a new booking request is created.
    Sent to SUPPORT_EMAIL before Stripe payment. Visually compact + scannable."""
    cn = booking.get("confirmation_number") or "—"
    stops = booking.get("additional_stops") or []
    stops_html = ""
    if stops:
        items = "".join(f"<li style='margin:2px 0;'>{s}</li>" for s in stops)
        stops_html = f"<tr><td style='padding:4px 0;color:#888;'>Stops:</td><td style='padding:4px 0;'><ul style='margin:0;padding-left:18px;'>{items}</ul></td></tr>"

    return_html = ""
    if booking.get("return_trip") and booking.get("return_location"):
        return_html = f"<tr><td style='padding:4px 0;color:#888;'>Return:</td><td style='padding:4px 0;'>{booking['return_location']}</td></tr>"

    flight_html = ""
    if booking.get("flight_number"):
        flight_html = f"<tr><td style='padding:4px 0;color:#888;'>Flight #:</td><td style='padding:4px 0;'><strong>{booking['flight_number']}</strong></td></tr>"

    hours_html = ""
    if booking.get("hours"):
        hours_html = f"<tr><td style='padding:4px 0;color:#888;'>Hours:</td><td style='padding:4px 0;'>{booking['hours']}</td></tr>"

    mg_html = ""
    if booking.get("meet_and_greet"):
        mg_html = "<tr><td style='padding:4px 0;color:#888;'>Add-on:</td><td style='padding:4px 0;'>✨ Meet &amp; Greet at baggage claim</td></tr>"

    notes_html = ""
    if (booking.get("notes") or "").strip():
        notes_html = f"<tr><td style='padding:4px 0;color:#888;vertical-align:top;'>Notes:</td><td style='padding:4px 0;font-style:italic;color:#444;'>{booking['notes']}</td></tr>"

    cta_btn = ""
    if admin_dashboard_url:
        cta_btn = f"""
        <tr><td style="padding:24px 32px 8px 32px;">
          <a href="{admin_dashboard_url}" style="display:inline-block;background:#D4AF37;color:#0a0a0a;
             text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;
             font-family:Arial,sans-serif;font-size:13px;letter-spacing:0.3px;">
             Open admin dashboard →
          </a>
        </td></tr>
        """

    return f"""
<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5;">
        <tr><td style="background:#0a0a0a;padding:20px 32px;color:#fff;">
          <div style="font-size:11px;color:#D4AF37;letter-spacing:2px;text-transform:uppercase;">
            TuranEliteLimo · New booking request
          </div>
          <div style="font-size:22px;font-family:Georgia,serif;margin-top:6px;">
            {booking.get('full_name','Customer')}
          </div>
          <div style="font-size:13px;color:#aaa;margin-top:4px;">
            {booking.get('service_type','—')} · {booking.get('vehicle_type','—')} · #{cn}
          </div>
        </td></tr>
        <tr><td style="padding:22px 32px;color:#222;font-size:14px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:4px 0;color:#888;width:90px;">Pickup:</td><td style="padding:4px 0;"><strong>{booking.get('pickup_date','')}</strong> at <strong>{booking.get('pickup_time','')}</strong></td></tr>
            <tr><td style="padding:4px 0;color:#888;">From:</td><td style="padding:4px 0;">{booking.get('pickup_location','—')}</td></tr>
            <tr><td style="padding:4px 0;color:#888;">To:</td><td style="padding:4px 0;">{booking.get('dropoff_location','—')}</td></tr>
            {stops_html}
            {return_html}
            {flight_html}
            {hours_html}
            {mg_html}
            <tr><td style="padding:4px 0;color:#888;">Passengers:</td><td style="padding:4px 0;">{booking.get('passengers','—')} pax · {booking.get('luggage_count',0)} bags</td></tr>
            {notes_html}
          </table>
        </td></tr>
        <tr><td style="padding:0 32px 4px 32px;border-top:1px solid #eee;">
          <div style="font-size:11px;color:#D4AF37;letter-spacing:2px;text-transform:uppercase;margin-top:18px;">
            Customer contact
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
            <tr><td style="padding:4px 0;color:#888;width:90px;">Email:</td><td style="padding:4px 0;"><a href="mailto:{booking.get('email','')}" style="color:#0a0a0a;">{booking.get('email','—')}</a></td></tr>
            <tr><td style="padding:4px 0;color:#888;">Phone:</td><td style="padding:4px 0;"><a href="tel:{booking.get('phone','')}" style="color:#0a0a0a;">{booking.get('phone','—')}</a></td></tr>
          </table>
        </td></tr>
        {cta_btn}
        <tr><td style="padding:18px 32px;border-top:1px solid #eee;color:#888;font-size:12px;">
          Status: <span style="color:#b6862c;">awaiting Stripe payment</span> — you'll receive a follow-up email when the customer completes checkout.
        </td></tr>
      </table>
      <div style="font-size:11px;color:#999;margin-top:14px;">
        Internal notification · do not reply
      </div>
    </td></tr>
  </table>
</body></html>
"""


def render_wait_time_charge_email(
    booking: dict,
    chargeable_minutes: int,
    rate: float,
    amount: float,
    grace_minutes: int,
) -> str:
    """Receipt email sent immediately after an off-session wait-time charge succeeds."""
    cn = booking.get("confirmation_number") or "—"
    grace_msg = (
        "45 minutes after your flight landed"
        if booking.get("service_type") == "Airport Transfer"
        else "15 minutes after your scheduled pickup"
    )
    driver = booking.get("driver_name") or "Your chauffeur"
    return f"""
<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5;">
        <tr><td style="background:#0a0a0a;padding:24px 32px;color:#fff;text-align:center;">
          <div style="font-size:11px;color:#D4AF37;letter-spacing:2px;text-transform:uppercase;">
            TuranEliteLimo · Wait Time Charge
          </div>
          <div style="font-size:32px;font-family:Georgia,serif;margin-top:10px;color:#D4AF37;">
            ${amount:.2f}
          </div>
          <div style="font-size:12px;color:#aaa;margin-top:4px;">
            Reservation #{cn}
          </div>
        </td></tr>
        <tr><td style="padding:24px 32px;color:#222;font-size:14px;line-height:1.7;">
          <p style="margin:0 0 14px 0;">Hi {booking.get('full_name','').split(' ')[0] or 'there'},</p>
          <p style="margin:0 0 14px 0;">
            We've just charged your card on file <strong>${amount:.2f}</strong> for wait time
            on your recent trip.
          </p>
          <div style="background:#fafafa;border:1px solid #eee;border-radius:8px;padding:16px;margin:16px 0;font-size:13px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:3px 0;color:#888;">Grace period:</td><td style="padding:3px 0;text-align:right;">{grace_minutes} min ({grace_msg})</td></tr>
              <tr><td style="padding:3px 0;color:#888;">Time charged for:</td><td style="padding:3px 0;text-align:right;">{chargeable_minutes} min</td></tr>
              <tr><td style="padding:3px 0;color:#888;">Rate:</td><td style="padding:3px 0;text-align:right;">${rate:.2f}/min</td></tr>
              <tr><td style="padding:8px 0 3px 0;border-top:1px solid #eee;font-weight:bold;">Total charged:</td><td style="padding:8px 0 3px 0;text-align:right;font-weight:bold;border-top:1px solid #eee;">${amount:.2f}</td></tr>
            </table>
          </div>
          <p style="margin:0 0 14px 0;color:#555;font-size:13px;">
            This was authorized at booking under our Wait Time Policy ({driver} waited
            {chargeable_minutes + grace_minutes} minutes total). Charges only apply beyond the
            grace window; on-time pickups never trigger this.
          </p>
          <p style="margin:0;font-size:13px;color:#888;">
            Questions? Reply to this email or call <a href="tel:+16504100687" style="color:#0a0a0a;">(650) 410-0687</a>.
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px;border-top:1px solid #eee;color:#888;font-size:11px;text-align:center;">
          TuranEliteLimo · Millbrae, CA · turanelitelimo.com
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""



def render_damage_charge_email(booking: dict, amount: float, reason: str) -> str:
    """Receipt email sent immediately after an admin-triggered damage / incidental
    off-session charge succeeds."""
    cn = booking.get("confirmation_number") or "—"
    first = booking.get("full_name", "").split(" ")[0] or "there"
    return f"""
<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5;">
        <tr><td style="background:#0a0a0a;padding:24px 32px;color:#fff;text-align:center;">
          <div style="font-size:11px;color:#D4AF37;letter-spacing:2px;text-transform:uppercase;">
            TuranEliteLimo · Incidental Charge
          </div>
          <div style="font-size:32px;font-family:Georgia,serif;margin-top:10px;color:#D4AF37;">
            ${amount:.2f}
          </div>
          <div style="font-size:12px;color:#aaa;margin-top:4px;">
            Reservation #{cn}
          </div>
        </td></tr>
        <tr><td style="padding:24px 32px;color:#222;font-size:14px;line-height:1.7;">
          <p style="margin:0 0 14px 0;">Hi {first},</p>
          <p style="margin:0 0 14px 0;">
            We've charged your card on file <strong>${amount:.2f}</strong> for an
            incidental on your recent trip with us.
          </p>
          <div style="background:#fafafa;border:1px solid #eee;border-radius:8px;padding:16px;margin:16px 0;font-size:13px;">
            <div style="color:#888;margin-bottom:4px;">Reason on file:</div>
            <div style="color:#222;">{reason}</div>
          </div>
          <p style="margin:0 0 14px 0;color:#555;font-size:13px;">
            This was authorized at booking under our wait-time &amp; damages policy.
            If you believe this charge is incorrect, please reply to this email
            within 48 hours and we'll review.
          </p>
          <p style="margin:0;font-size:13px;color:#888;">
            Questions? Reply to this email or call <a href="tel:+16504100687" style="color:#0a0a0a;">(650) 410-0687</a>.
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px;border-top:1px solid #eee;color:#888;font-size:11px;text-align:center;">
          TuranEliteLimo · Millbrae, CA · turanelitelimo.com
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""

def render_mid_trip_stop_charge_email(booking: dict, stop: dict) -> str:
    """Itemized receipt for an admin-triggered mid-trip stop charge."""
    cn = booking.get("confirmation_number") or "—"
    first = booking.get("full_name", "").split(" ")[0] or "there"
    total = float(stop.get("total") or 0)
    detour = float(stop.get("detour_miles") or 0)
    flat = float(stop.get("flat_fee") or 0)
    per_mile = float(stop.get("per_mile_rate") or 0)
    distance_charge = float(stop.get("distance_charge") or 0)
    wait_charge = float(stop.get("wait_charge") or 0)
    wait_overage = int(stop.get("wait_overage_minutes") or 0)
    wait_rate = float(stop.get("wait_minute_rate") or 0)
    service_fee = float(stop.get("service_fee") or 0)
    address = stop.get("address") or stop.get("address_input") or "—"
    return f"""
<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5;">
        <tr><td style="background:#0a0a0a;padding:24px 32px;color:#fff;text-align:center;">
          <div style="font-size:11px;color:#D4AF37;letter-spacing:2px;text-transform:uppercase;">
            TuranEliteLimo · Mid-Trip Stop Charge
          </div>
          <div style="font-size:32px;font-family:Georgia,serif;margin-top:10px;color:#D4AF37;">
            ${total:.2f}
          </div>
          <div style="font-size:12px;color:#aaa;margin-top:4px;">
            Reservation #{cn}
          </div>
        </td></tr>
        <tr><td style="padding:24px 32px;color:#222;font-size:14px;line-height:1.7;">
          <p style="margin:0 0 14px 0;">Hi {first},</p>
          <p style="margin:0 0 14px 0;">
            We've charged your card on file <strong>${total:.2f}</strong> for an unplanned stop your
            chauffeur made during your trip on your request.
          </p>
          <div style="background:#fafafa;border:1px solid #eee;border-radius:8px;padding:16px;margin:16px 0;font-size:13px;">
            <div style="color:#888;margin-bottom:6px;">Stop:</div>
            <div style="color:#222;margin-bottom:12px;">{address}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:3px 0;color:#888;">Flat stop fee:</td><td style="padding:3px 0;text-align:right;">${flat:.2f}</td></tr>
              <tr><td style="padding:3px 0;color:#888;">Detour ({detour:.1f} mi × ${per_mile:.2f}/mi):</td><td style="padding:3px 0;text-align:right;">${distance_charge:.2f}</td></tr>
              {'<tr><td style="padding:3px 0;color:#888;">Wait at stop ('+str(wait_overage)+' min × $'+f"{wait_rate:.2f}"+'/min, after 10-min grace):</td><td style="padding:3px 0;text-align:right;">$'+f"{wait_charge:.2f}"+'</td></tr>' if wait_overage > 0 else ''}
              <tr><td style="padding:3px 0;color:#888;">Service fee:</td><td style="padding:3px 0;text-align:right;">${service_fee:.2f}</td></tr>
              <tr><td style="padding:8px 0 3px 0;border-top:1px solid #eee;font-weight:bold;">Total charged:</td><td style="padding:8px 0 3px 0;text-align:right;font-weight:bold;border-top:1px solid #eee;">${total:.2f}</td></tr>
            </table>
          </div>
          <p style="margin:0 0 14px 0;color:#555;font-size:13px;">
            Authorized at booking under our wait-time &amp; damages consent. Detour distance is computed from
            the deviation from your originally-scheduled route.
          </p>
          <p style="margin:0;font-size:13px;color:#888;">
            Questions? Reply to this email or call <a href="tel:+16504100687" style="color:#0a0a0a;">(650) 410-0687</a>.
          </p>
        </td></tr>
        <tr><td style="padding:18px 32px;border-top:1px solid #eee;color:#888;font-size:11px;text-align:center;">
          TuranEliteLimo · Millbrae, CA · turanelitelimo.com
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""


def render_chauffeur_assigned_email(booking: dict, manage_url: Optional[str] = None) -> str:
    """Notifies customer that a chauffeur has been assigned. Includes name, phone,
    vehicle, plate. Sent the moment admin clicks 'Assign driver'."""
    cn = booking.get("confirmation_number") or "—"
    first = (booking.get("full_name", "") or "there").split(" ")[0] or "there"
    driver_name = booking.get("driver_name") or "Your chauffeur"
    driver_phone = booking.get("driver_phone") or ""
    driver_phone_clean = "".join(ch for ch in driver_phone if ch.isdigit() or ch == "+")
    plate = booking.get("driver_plate") or ""
    vehicle_display = booking.get("driver_vehicle") or booking.get("vehicle_type") or "Premium chauffeur vehicle"
    pickup_date = booking.get("pickup_date", "")
    pickup_time_disp = _format_time_12h(booking.get("pickup_time", ""))
    manage_btn = render_manage_link_html(manage_url) if manage_url else ""

    # Schema.org JSON-LD so Gmail renders this as a confirmed reservation update (not a fresh email guess).
    pickup_dt_iso = ""
    try:
        if pickup_date:
            pickup_dt_iso = f"{pickup_date}T{(booking.get('pickup_time') or '00:00')}:00-08:00"
    except Exception:
        pickup_dt_iso = ""
    schema = {
        "@context": "http://schema.org",
        "@type": "Reservation",
        "reservationNumber": cn,
        "reservationStatus": "http://schema.org/ReservationConfirmed",
        "modifiedTime": datetime.now(timezone.utc).isoformat(),
        "underName": {"@type": "Person", "name": booking.get("full_name", "")},
        "reservationFor": {"@type": "Taxi", "name": f"TuranEliteLimo · {vehicle_display}"},
        "pickupTime": pickup_dt_iso or None,
        "pickupLocation": {"@type": "Place", "name": booking.get("pickup_location", "")},
        "dropoffLocation": {"@type": "Place", "name": booking.get("dropoff_location", "")},
        "provider": {"@type": "Organization", "name": "TuranEliteLimo", "url": "https://turanelitelimo.com"},
    }
    schema = {k: v for k, v in schema.items() if v is not None}
    schema_block = f'<script type="application/ld+json">{json.dumps(schema)}</script>'

    call_btn = (
        f'<a href="tel:{driver_phone_clean}" '
        f'style="display:inline-block;background:#D4AF37;color:#0a0a0a;'
        f'padding:14px 28px;border-radius:999px;text-decoration:none;'
        f'font-weight:700;font-size:14px;letter-spacing:0.5px;margin-right:8px;">'
        f'📞 Call chauffeur</a>'
    ) if driver_phone_clean else ""
    sms_btn = (
        f'<a href="sms:{driver_phone_clean}" '
        f'style="display:inline-block;background:transparent;color:#D4AF37;'
        f'border:1px solid #D4AF37;padding:13px 28px;border-radius:999px;'
        f'text-decoration:none;font-weight:600;font-size:14px;letter-spacing:0.5px;">'
        f'💬 Text chauffeur</a>'
    ) if driver_phone_clean else ""

    return f"""
<!doctype html>
<html><head>{schema_block}</head><body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#111111;border-radius:14px;overflow:hidden;border:1px solid #1f1f1f;">
        <tr><td style="background:#0a0a0a;padding:28px 32px;border-bottom:1px solid #1f1f1f;">
          <span style="font-size:24px;color:#ffffff;font-weight:700;letter-spacing:-0.3px;">
            Turan<span style="color:#D4AF37;">EliteLimo</span>
          </span>
        </td></tr>

        <tr><td style="padding:32px 32px 8px 32px;">
          <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#D4AF37;margin-bottom:12px;">
            Chauffeur Assigned · #{cn}
          </div>
          <h1 style="font-size:24px;color:#ffffff;margin:0 0 10px 0;font-weight:600;">
            Hi {first} — meet your chauffeur.
          </h1>
          <p style="color:#aaaaaa;font-size:14px;line-height:1.6;margin:0;">
            We've matched your reservation with a chauffeur. They'll be in touch close to pickup time, or you can reach out anytime using the buttons below.
          </p>
        </td></tr>

        <tr><td style="padding:24px 32px 0 32px;">
          <table cellpadding="0" cellspacing="0" width="100%" style="background:#0a0a0a;border:1px solid #D4AF37;border-radius:10px;">
            <tr><td style="padding:22px 24px;">
              <div style="font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:#888;">Chauffeur</div>
              <div style="font-size:22px;color:#ffffff;font-weight:600;margin-top:4px;">{driver_name}</div>
              <div style="font-size:13px;color:#D4AF37;margin-top:2px;">{driver_phone or "Contact via dispatch"}</div>

              <table cellpadding="0" cellspacing="0" width="100%" style="margin-top:18px;border-top:1px solid #1f1f1f;">
                <tr><td style="padding-top:14px;color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Vehicle</td>
                    <td style="padding-top:14px;color:#ffffff;font-size:14px;text-align:right;">{vehicle_display}</td></tr>
                {'<tr><td style="padding-top:10px;color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Plate</td><td style="padding-top:10px;color:#ffffff;font-size:14px;text-align:right;font-family:Courier,monospace;letter-spacing:1.5px;">'+plate+'</td></tr>' if plate else ''}
                <tr><td style="padding-top:10px;color:#888;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Pickup</td>
                    <td style="padding-top:10px;color:#ffffff;font-size:14px;text-align:right;">{pickup_date} · {pickup_time_disp}</td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>

        {f'<tr><td style="padding:22px 32px 0 32px;text-align:center;">{call_btn}{sms_btn}</td></tr>' if (call_btn or sms_btn) else ''}

        {manage_btn}

        <tr><td style="padding:30px 32px;color:#666;font-size:12px;line-height:1.6;text-align:center;border-top:1px solid #1f1f1f;">
          Questions? Reply to this email or call <a href="tel:+16504100687" style="color:#D4AF37;text-decoration:none;">(650) 410-0687</a>.<br>
          <span style="color:#444;">TuranEliteLimo · Millbrae, CA</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""


def render_admin_error_alert_email(
    *,
    message: str,
    page_url: str,
    user_agent: str,
    stack: Optional[str] = None,
    context: Optional[dict] = None,
    occurred_at_iso: Optional[str] = None,
) -> str:
    """Lightweight HTML alert for production JS errors. Sent to admin via Resend."""
    when = occurred_at_iso or datetime.now(timezone.utc).isoformat()
    ctx_rows = ""
    if context:
        for k, v in context.items():
            try:
                v_str = json.dumps(v) if not isinstance(v, str) else v
            except Exception:
                v_str = str(v)
            ctx_rows += (
                f'<tr><td style="padding:6px 12px;color:#999;font-size:11px;border-bottom:1px solid #1f1f1f;">{k}</td>'
                f'<td style="padding:6px 12px;color:#eee;font-size:11px;border-bottom:1px solid #1f1f1f;font-family:monospace;">{v_str[:300]}</td></tr>'
            )
    stack_html = ""
    if stack:
        safe = (stack[:4000] or "").replace("<", "&lt;").replace(">", "&gt;")
        stack_html = (
            '<div style="margin-top:18px;background:#0a0a0a;border:1px solid #1f1f1f;border-radius:8px;padding:14px;">'
            '<div style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.2em;margin-bottom:8px;">Stack</div>'
            f'<pre style="margin:0;color:#ccc;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word;font-family:Menlo,Consolas,monospace;">{safe}</pre>'
            '</div>'
        )
    safe_msg = (message[:500] or "(no message)").replace("<", "&lt;").replace(">", "&gt;")
    safe_url = (page_url or "")[:300].replace("<", "&lt;").replace(">", "&gt;")
    safe_ua = (user_agent or "")[:300].replace("<", "&lt;").replace(">", "&gt;")
    return f"""<!doctype html>
<html><body style="margin:0;background:#050505;color:#eee;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
<table cellpadding=0 cellspacing=0 width="100%" style="background:#050505;padding:32px 0;">
  <tr><td align="center">
    <table cellpadding=0 cellspacing=0 width="600" style="background:#111;border:1px solid #1f1f1f;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:24px 28px;background:#1a0e0e;border-bottom:1px solid #3a1f1f;">
        <div style="color:#f87171;font-size:11px;text-transform:uppercase;letter-spacing:.25em;">Production error</div>
        <div style="color:#fff;font-size:18px;margin-top:6px;font-weight:600;">A customer hit a JS error on your site</div>
      </td></tr>
      <tr><td style="padding:24px 28px;">
        <div style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.2em;margin-bottom:6px;">Message</div>
        <div style="color:#fca5a5;font-size:14px;font-family:Menlo,Consolas,monospace;background:#0a0a0a;border:1px solid #2a1a1a;border-radius:6px;padding:10px 12px;">{safe_msg}</div>
        <table cellpadding=0 cellspacing=0 width="100%" style="margin-top:18px;border-collapse:collapse;">
          <tr><td style="padding:6px 12px;color:#999;font-size:11px;border-bottom:1px solid #1f1f1f;width:120px;">When</td><td style="padding:6px 12px;color:#eee;font-size:11px;border-bottom:1px solid #1f1f1f;">{when}</td></tr>
          <tr><td style="padding:6px 12px;color:#999;font-size:11px;border-bottom:1px solid #1f1f1f;">Page</td><td style="padding:6px 12px;color:#D4AF37;font-size:11px;border-bottom:1px solid #1f1f1f;"><a href="{safe_url}" style="color:#D4AF37;text-decoration:none;">{safe_url}</a></td></tr>
          <tr><td style="padding:6px 12px;color:#999;font-size:11px;border-bottom:1px solid #1f1f1f;">Browser</td><td style="padding:6px 12px;color:#eee;font-size:11px;border-bottom:1px solid #1f1f1f;font-family:monospace;">{safe_ua}</td></tr>
          {ctx_rows}
        </table>
        {stack_html}
        <div style="margin-top:24px;color:#666;font-size:11px;line-height:1.6;">
          You'll only get one alert per unique error every 5 minutes. If you receive a flood of these, something's seriously wrong — call your developer.
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""
