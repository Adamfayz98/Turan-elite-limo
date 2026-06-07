"""
Lifecycle email templates added in P3:
  - Welcome email on signup (with first-ride promo code)
  - 24-hour pre-trip reminder
  - Win-back email after 60 days of inactivity
  - Generic broadcast wrapper used by the admin Compose Promo tab

All use the same brand wrapper used elsewhere in email_service.py.
"""
from __future__ import annotations

from typing import Optional

# Re-use config from sibling module
from email_service import SUPPORT_PHONE  # noqa: E402  (must come after this file's docstring)


def _brand_shell(title_kicker: str, headline: str, body_html: str, cta_html: str = "") -> str:
    """Wraps inner HTML in our standard branded shell — dark theme, gold accents."""
    return f"""<!doctype html>
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
            {title_kicker}
          </div>
          <h2 style="font-size:24px;margin:0 0 14px 0;line-height:1.25;">{headline}</h2>
          <div style="color:#aaa;font-size:14px;line-height:1.7;">{body_html}</div>
          {cta_html}
        </td></tr>
        <tr><td style="padding:18px 32px 22px;color:#666;font-size:11px;line-height:1.5;border-top:1px solid #1f1f1f;">
          TuranEliteLimo · 501 Broadway #251, Millbrae CA 94030 · {SUPPORT_PHONE}<br/>
          <span style="color:#444;">You're receiving this because you booked a ride or opted in for occasional updates.
          <a href="{{unsubscribe_url}}" style="color:#888;text-decoration:underline;">Unsubscribe</a></span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def render_welcome_email(name: str, promo_code: str = "WELCOME20", site_url: str = "https://turanelitelimo.com") -> str:
    first = (name or "").split(" ")[0] or "there"
    body = (
        f"Welcome aboard, {first}. You're now part of TuranEliteLimo — the premium chauffeur network "
        "trusted across the Bay Area for SFO transfers, weddings, corporate travel, and special occasions. "
        "<br/><br/>To welcome you, here's <strong style='color:#D4AF37;'>$20 off</strong> your first ride. "
        f"Use code <strong style='color:#D4AF37;font-family:Courier New, monospace;'>{promo_code}</strong> at checkout — "
        "valid for 30 days."
    )
    cta = f"""
    <table cellpadding="0" cellspacing="0" style="margin:22px 0 4px 0;">
      <tr>
        <td>
          <a href="{site_url}" style="display:inline-block;background:#D4AF37;color:#0a0a0a;text-decoration:none;padding:13px 26px;border-radius:999px;font-weight:600;font-size:14px;">
            Book your first ride
          </a>
        </td>
      </tr>
    </table>
    <p style="color:#888;font-size:12px;line-height:1.6;margin:18px 0 0 0;">
      Questions? Reply to this email — a real human reads every word.
    </p>
    """
    return _brand_shell("Welcome aboard", "Your first $20 off awaits.", body, cta)


def render_pretrip_reminder_email(booking: dict, manage_url: Optional[str] = None) -> str:
    first = (booking.get("full_name") or "").split(" ")[0] or "there"
    cn = booking.get("confirmation_number", "")
    pickup = booking.get("pickup_location", "")
    dropoff = booking.get("dropoff_location", "")
    pickup_date = booking.get("pickup_date", "")
    pickup_time = booking.get("pickup_time", "")
    vehicle = booking.get("vehicle_type", "")
    body = (
        f"Quick reminder, {first} — your chauffeured ride is tomorrow. We'll be ready, polished, and on time.<br/><br/>"
        "<table cellpadding='0' cellspacing='0' style='background:#0a0a0a;border:1px solid #1f1f1f;border-radius:10px;padding:14px;margin:8px 0 4px 0;width:100%;'>"
        "<tr><td style='padding:6px 14px;'>"
        f"<div style='font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#666;margin-bottom:6px;'>Reservation</div>"
        f"<div style='color:#D4AF37;font-family:Courier New,monospace;font-size:14px;margin-bottom:14px;'>{cn}</div>"
        f"<div style='color:#fff;font-size:14px;margin-bottom:4px;'><strong>{vehicle}</strong></div>"
        f"<div style='color:#aaa;font-size:13px;'>{pickup} → {dropoff}</div>"
        f"<div style='color:#aaa;font-size:13px;margin-top:6px;'>{pickup_date} · {pickup_time}</div>"
        "</td></tr></table>"
        "<br/>Your chauffeur's name and license plate will be texted to you 30 minutes before pickup. "
        "If your plans change, you can update or cancel below."
    )
    cta = ""
    if manage_url:
        cta = f"""
        <table cellpadding="0" cellspacing="0" style="margin:18px 0 4px 0;">
          <tr>
            <td>
              <a href="{manage_url}" style="display:inline-block;background:transparent;border:1px solid #D4AF37;color:#D4AF37;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:13px;">
                Manage / Cancel reservation
              </a>
            </td>
          </tr>
        </table>"""
    return _brand_shell("24 hours until pickup", "Your ride is tomorrow.", body, cta)


def render_winback_email(name: str, promo_code: str = "WEMISSYOU25", site_url: str = "https://turanelitelimo.com") -> str:
    first = (name or "").split(" ")[0] or "there"
    body = (
        f"It's been a minute, {first} — and we noticed. <br/><br/>"
        "Whether you've been busy, traveling, or just driving yourself for once, we'd love to have you back in the back seat. "
        "Here's <strong style='color:#D4AF37;'>$25 off</strong> your next ride — our way of saying you matter to us.<br/><br/>"
        f"Use code <strong style='color:#D4AF37;font-family:Courier New, monospace;'>{promo_code}</strong> at checkout. "
        "Valid for 30 days. SFO transfers, evenings out, weekend getaways, anything — you choose."
    )
    cta = f"""
    <table cellpadding="0" cellspacing="0" style="margin:22px 0 4px 0;">
      <tr>
        <td>
          <a href="{site_url}" style="display:inline-block;background:#D4AF37;color:#0a0a0a;text-decoration:none;padding:13px 26px;border-radius:999px;font-weight:600;font-size:14px;">
            Book your next ride
          </a>
        </td>
      </tr>
    </table>
    """
    return _brand_shell("We've missed you", "Come back for $25 off.", body, cta)


def render_broadcast_email(subject_kicker: str, headline: str, body_html: str, cta_url: Optional[str] = None, cta_label: Optional[str] = None) -> str:
    """Used by the admin Compose Promo tab. HTML body is allowed (admin authors it)."""
    cta = ""
    if cta_url and cta_label:
        cta = f"""
        <table cellpadding="0" cellspacing="0" style="margin:22px 0 4px 0;">
          <tr>
            <td>
              <a href="{cta_url}" style="display:inline-block;background:#D4AF37;color:#0a0a0a;text-decoration:none;padding:13px 26px;border-radius:999px;font-weight:600;font-size:14px;">
                {cta_label}
              </a>
            </td>
          </tr>
        </table>
        """
    return _brand_shell(subject_kicker, headline, body_html, cta)
