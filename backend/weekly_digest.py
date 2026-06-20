"""
Weekly Bookings & Ads Performance Digest.

A weekly Monday-morning summary emailed to SUPPORT_EMAIL with:
  * Bookings created and revenue (Stripe-confirmed) over the last 7 days
  * Quote requests funnel (received → quoted → won)
  * Source breakdown (yelp, off_platform, online, quote_offer, etc.)
  * Vehicle class popularity
  * Top routes (pickup → dropoff city)
  * Risk band distribution (CLEAN / MEDIUM / HIGH)
  * Google Ads attribution gap callout — surfaces the delta between
    Stripe-confirmed bookings and the conversion count Adel sees in
    Google Ads. If this gap > 0, conversion tracking is leaking.

The job is scheduled in server.py (Monday 08:00 America/Los_Angeles =
~15:00–16:00 UTC depending on DST) via APScheduler. It can also be
triggered manually by an admin from the dashboard.
"""
from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

logger = logging.getLogger(__name__)


# ---------- Aggregation ----------

async def build_weekly_digest_data(db) -> dict[str, Any]:
    """Aggregate the metrics for the last 7 calendar days."""
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    week_ago_iso = week_ago.isoformat()

    # --- Bookings (any booking created in the last 7 days) ---
    bookings_cursor = db.bookings.find(
        {"created_at": {"$gte": week_ago_iso}},
        {"_id": 0},
    )
    bookings = await bookings_cursor.to_list(length=5000)

    # Paid / confirmed bookings = real conversions. We treat anything with
    # status in {paid, confirmed, in_progress, completed} as a "won" booking
    # for revenue counting purposes.
    PAID_STATUSES = {"paid", "confirmed", "in_progress", "completed"}
    paid_bookings = [b for b in bookings if (b.get("status") or "").lower() in PAID_STATUSES]

    def _booking_revenue(b: dict) -> float:
        # Prefer the final charged amount; fall back to quoted price.
        for k in ("total_amount", "amount_paid", "total_price", "price", "quoted_price"):
            v = b.get(k)
            if isinstance(v, (int, float)) and v > 0:
                return float(v)
        return 0.0

    total_revenue = sum(_booking_revenue(b) for b in paid_bookings)

    # UTM source attribution — group paid bookings by their first-touch
    # source_bucket (google_ads, yelp, facebook, direct, etc.). When this
    # column is meaningfully populated (i.e. once new bookings flow in with
    # UTM tracking enabled), Adel can see attribution at a glance and stop
    # relying on the Google Ads dashboard's potentially-broken conversion tag.
    utm_source_counter: Counter = Counter()
    utm_revenue_by_source: dict[str, float] = {}
    for b in paid_bookings:
        bucket = ((b.get("utm") or {}).get("source_bucket") or "untracked").lower()
        utm_source_counter[bucket] += 1
        utm_revenue_by_source[bucket] = round(utm_revenue_by_source.get(bucket, 0.0) + _booking_revenue(b), 2)
    top_sources = utm_source_counter.most_common(8)

    # Vehicle class popularity (top 5)
    vehicle_counter: Counter = Counter()
    for b in paid_bookings:
        v = (b.get("vehicle_class") or b.get("vehicle_type") or b.get("vehicle") or "Unknown")
        vehicle_counter[str(v)] += 1
    top_vehicles = vehicle_counter.most_common(5)

    # Top routes (pickup city → dropoff city). Cities are pulled from the
    # pickup/dropoff address strings via a crude last-comma heuristic.
    def _city(addr: str | None) -> str:
        if not addr:
            return "—"
        parts = [p.strip() for p in str(addr).split(",") if p.strip()]
        # "1 Apple Park Way, Cupertino, CA 95014, USA" → "Cupertino"
        if len(parts) >= 3:
            return parts[-3]
        if len(parts) >= 2:
            return parts[-2]
        return parts[0]

    route_counter: Counter = Counter()
    for b in paid_bookings:
        a = _city(b.get("pickup_location") or b.get("pickup_address"))
        d = _city(b.get("dropoff_location") or b.get("dropoff_address"))
        route_counter[f"{a} → {d}"] += 1
    top_routes = route_counter.most_common(5)

    # --- Quote requests funnel ---
    quotes_cursor = db.quote_requests.find(
        {"created_at": {"$gte": week_ago_iso}},
        {"_id": 0},
    )
    quotes = await quotes_cursor.to_list(length=5000)

    quote_status_counter: Counter = Counter()
    quote_source_counter: Counter = Counter()
    quote_risk_counter: Counter = Counter()
    for q in quotes:
        quote_status_counter[(q.get("status") or "unknown").lower()] += 1
        quote_source_counter[(q.get("source") or "online").lower()] += 1
        rb = (q.get("risk_band") or "UNKNOWN").upper()
        quote_risk_counter[rb] += 1

    quotes_received = len(quotes)
    quotes_quoted = quote_status_counter.get("quoted", 0) + quote_status_counter.get("won", 0)
    quotes_won = quote_status_counter.get("won", 0) + quote_status_counter.get("confirmed", 0)
    quote_to_win_rate = round(100.0 * quotes_won / quotes_received, 1) if quotes_received else 0.0

    return {
        "period_start": week_ago.strftime("%b %d"),
        "period_end": now.strftime("%b %d, %Y"),
        "bookings_created": len(bookings),
        "bookings_paid": len(paid_bookings),
        "total_revenue": round(total_revenue, 2),
        "top_vehicles": top_vehicles,
        "top_routes": top_routes,
        "top_sources": top_sources,
        "revenue_by_source": utm_revenue_by_source,
        "quotes_received": quotes_received,
        "quotes_quoted": quotes_quoted,
        "quotes_won": quotes_won,
        "quote_to_win_rate": quote_to_win_rate,
        "quote_sources": quote_source_counter.most_common(8),
        "risk_distribution": dict(quote_risk_counter),
        "generated_at": now.isoformat(),
    }


# ---------- Rendering ----------

def render_weekly_digest_html(d: dict[str, Any]) -> str:
    """Render the digest as a minimal dark-mode HTML email."""
    def _kv_row(label: str, value: str, accent: bool = False) -> str:
        color = "#D4AF37" if accent else "#ffffff"
        return (
            f'<tr><td style="padding:8px 0;color:#888;font-size:13px;">{label}</td>'
            f'<td style="padding:8px 0;color:{color};font-size:14px;text-align:right;font-weight:500;">{value}</td></tr>'
        )

    def _list_block(items: list[tuple[str, int]], label_color: str = "#fff") -> str:
        if not items:
            return '<p style="color:#666;font-size:13px;margin:0;">No data this period.</p>'
        rows = ""
        for name, count in items:
            rows += (
                f'<tr><td style="padding:6px 0;color:{label_color};font-size:13px;">{name}</td>'
                f'<td style="padding:6px 0;color:#D4AF37;font-size:13px;text-align:right;">{count}</td></tr>'
            )
        return f'<table width="100%" cellpadding="0" cellspacing="0" border="0">{rows}</table>'

    # Risk distribution colored
    risk = d.get("risk_distribution", {}) or {}
    risk_rows = ""
    band_colors = (
        ("GREEN", "#22c55e", "Clean"),
        ("CLEAN", "#22c55e", "Clean"),
        ("LOW", "#22c55e", "Low risk"),
        ("YELLOW", "#eab308", "Medium risk"),
        ("MEDIUM", "#eab308", "Medium risk"),
        ("RED", "#ef4444", "High risk"),
        ("HIGH", "#ef4444", "High risk"),
        ("CRITICAL", "#ef4444", "Critical"),
        ("UNKNOWN", "#888", "Unscored"),
    )
    for band, color, label in band_colors:
        count = risk.get(band, 0)
        if count:
            risk_rows += (
                f'<tr><td style="padding:6px 0;color:{color};font-size:13px;font-weight:500;">{label} ({band})</td>'
                f'<td style="padding:6px 0;color:#fff;font-size:13px;text-align:right;">{count}</td></tr>'
            )
    if not risk_rows:
        risk_rows = '<tr><td style="padding:6px 0;color:#666;font-size:13px;">No quote requests this period.</td></tr>'

    revenue_fmt = f"${d['total_revenue']:,.0f}"
    won_color = "#22c55e" if d["quotes_won"] > 0 else "#ef4444"

    return f"""
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#050505;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050505;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;border:1px solid #1f1f1f;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:32px 32px 0 32px;">
          <p style="margin:0 0 8px 0;color:#D4AF37;font-size:11px;letter-spacing:3px;text-transform:uppercase;">Weekly Performance Digest</p>
          <h1 style="margin:0;color:#fff;font-size:24px;font-weight:300;letter-spacing:-0.5px;">
            {d['period_start']} → {d['period_end']}
          </h1>
        </td></tr>

        <!-- Headline KPIs -->
        <tr><td style="padding:28px 32px 0 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#111;border:1px solid #1f1f1f;border-radius:8px;padding:20px;">
            {_kv_row("Bookings created", str(d["bookings_created"]))}
            {_kv_row("Bookings paid / confirmed", str(d["bookings_paid"]), accent=True)}
            {_kv_row("Revenue (paid)", revenue_fmt, accent=True)}
            {_kv_row("Quote requests received", str(d["quotes_received"]))}
            {_kv_row("Quotes won", f"{d['quotes_won']} ({d['quote_to_win_rate']}%)")}
          </table>
        </td></tr>

        <!-- Google Ads attribution callout -->
        <tr><td style="padding:24px 32px 0 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a1305;border:1px solid #D4AF3733;border-radius:8px;padding:18px;">
            <tr><td>
              <p style="margin:0 0 8px 0;color:#D4AF37;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Google Ads attribution check</p>
              <p style="margin:0;color:#fff;font-size:13px;line-height:1.6;">
                We confirmed <strong style="color:{won_color};">{d['bookings_paid']}</strong> paid bookings this week.
                Open your Google Ads dashboard → Conversions → last 7 days and compare. If Google Ads shows fewer than <strong>{d['bookings_paid']}</strong>, your conversion tag is leaking — bookings are happening but not being attributed back. That's why your CPA looks high.
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Booking attribution by source (UTM) -->
        <tr><td style="padding:24px 32px 0 32px;">
          <p style="margin:0 0 12px 0;color:#D4AF37;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Paid bookings by source (UTM)</p>
          {_list_block(d.get('top_sources', []))}
          <p style="margin:10px 0 0 0;color:#666;font-size:11px;line-height:1.5;">
            Source bucket comes from <code style="color:#D4AF37;">utm_source</code> / <code style="color:#D4AF37;">gclid</code> captured on the visitor's first touch and persisted for 90 days. &quot;untracked&quot; = booked before UTM tracking shipped or visitor cleared cookies.
          </p>
        </td></tr>

        <!-- Vehicles -->
        <tr><td style="padding:24px 32px 0 32px;">
          <p style="margin:0 0 12px 0;color:#D4AF37;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Top vehicle classes booked</p>
          {_list_block(d['top_vehicles'])}
        </td></tr>

        <!-- Routes -->
        <tr><td style="padding:24px 32px 0 32px;">
          <p style="margin:0 0 12px 0;color:#D4AF37;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Top routes (pickup → dropoff)</p>
          {_list_block(d['top_routes'])}
        </td></tr>

        <!-- Quote sources -->
        <tr><td style="padding:24px 32px 0 32px;">
          <p style="margin:0 0 12px 0;color:#D4AF37;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Quote request sources</p>
          {_list_block(d['quote_sources'])}
        </td></tr>

        <!-- Risk -->
        <tr><td style="padding:24px 32px 32px 32px;">
          <p style="margin:0 0 12px 0;color:#D4AF37;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Quote request risk distribution</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0">{risk_rows}</table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:0 32px 32px 32px;border-top:1px solid #1f1f1f;">
          <p style="margin:16px 0 0 0;color:#555;font-size:11px;line-height:1.6;">
            Generated automatically every Monday morning. Open the admin dashboard for live data.
            <br/>TuranEliteLimo · Weekly Digest
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
""".strip()


# ---------- Send ----------

async def send_weekly_digest_now(db) -> dict[str, Any]:
    """Build + email the weekly digest. Returns the data dict (for logging /
    admin response). Safe to call manually or on a schedule."""
    from email_service import send_email, SUPPORT_EMAIL  # local import to avoid cycles
    data = await build_weekly_digest_data(db)
    html = render_weekly_digest_html(data)
    subject = f"Weekly Digest · {data['period_start']} → {data['period_end']} · {data['bookings_paid']} bookings · ${data['total_revenue']:,.0f}"
    sent_id = None
    if SUPPORT_EMAIL:
        try:
            sent_id = await send_email(to=SUPPORT_EMAIL, subject=subject, html=html)
            logger.info(f"Weekly digest emailed to {SUPPORT_EMAIL} (resend_id={sent_id})")
        except Exception as e:
            logger.warning(f"Weekly digest send failed: {e}")
    return {"sent_to": SUPPORT_EMAIL, "resend_id": sent_id, "subject": subject, "data": data}
