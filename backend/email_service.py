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
SUPPORT_EMAIL = os.environ.get("SUPPORT_EMAIL", "turonlimosupport@gmail.com")
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


def render_confirmation_email(booking: dict, payment_url: Optional[str]) -> str:
    """HTML email with branding + ride summary + optional Pay Now button."""
    cn = booking.get("confirmation_number", "")
    pay_btn = ""
    if payment_url:
        pay_btn = f"""
            <tr><td style="padding: 24px 32px 8px 32px;">
              <a href="{payment_url}" style="display:inline-block;background:#D4AF37;color:#0a0a0a;
                 text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;
                 font-family:Arial,sans-serif;font-size:14px;letter-spacing:0.5px;">
                 Pay & Secure Your Reservation →
              </a>
            </td></tr>
            <tr><td style="padding:0 32px 16px 32px;color:#777;font-size:12px;font-family:Arial,sans-serif;">
              Click the button above to complete payment securely via Stripe.
            </td></tr>
        """
    extras = []
    if booking.get("hours"):
        extras.append(f"Duration: {booking['hours']} hour{'s' if booking['hours'] > 1 else ''} (hourly chauffeur)")
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
                  {booking.get('pickup_date','')} at {booking.get('pickup_time','')}
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
