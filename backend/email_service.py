"""Resend email helper for TuranEliteLimo. Async-friendly via asyncio.to_thread."""
from __future__ import annotations

import os
import asyncio
import logging
from typing import Optional

import resend

logger = logging.getLogger(__name__)

resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
SUPPORT_EMAIL = os.environ.get("SUPPORT_EMAIL", "support@turanelitelimo.com")
SUPPORT_PHONE = os.environ.get("SUPPORT_PHONE", "(650) 410-0687")
COMPANY_NAME = "TuranEliteLimo"


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


def render_confirmation_email(booking: dict, payment_url: Optional[str], manage_url: Optional[str] = None) -> str:
    """HTML email with branding + ride summary + optional Pay Now button + optional Manage link."""
    cn = booking.get("confirmation_number", "")
    pay_btn = ""
    if payment_url:
        pay_btn = f"""
            <tr><td style="padding: 24px 32px 8px 32px;">
              <a href="{payment_url}" style="display:inline-block;background:#D4AF37;color:#0a0a0a;
                 text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;
                 font-family:Arial,sans-serif;font-size:14px;letter-spacing:0.5px;">
                 Pay & Secure Your Reservation
              </a>
            </td></tr>
            <tr><td style="padding:0 32px 16px 32px;color:#777;font-size:12px;font-family:Arial,sans-serif;">
              Click the button above to complete payment securely via Stripe.
            </td></tr>
        """
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
            Reservation Confirmed
          </div>
          <h1 style="font-size:26px;color:#ffffff;margin:0 0 8px 0;font-weight:600;">
            Hi {booking.get('full_name','').split(' ')[0] or 'there'} — your ride is locked in.
          </h1>
          <p style="color:#aaaaaa;font-size:14px;line-height:1.6;margin:0;">
            Thank you for choosing TuranEliteLimo. Your reservation has been received and confirmed.
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
