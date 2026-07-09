"""
pdf_service.py — generates branded PDFs for TuranEliteLimo.

Two public entrypoints:
  • generate_invoice_pdf(quote, custom_notes, deposit_pct)   -> bytes
  • generate_dispatch_pdf(quote, affiliate_name, affiliate_rate) -> bytes

Both use ReportLab platypus (flowables) so the layout reflows automatically when
content grows. Returns raw PDF bytes; caller is responsible for delivery
(email attachment / HTTP download).

Design choices:
  * No external assets (logo, fonts) — reportlab built-ins only. Keeps the
    service portable and the install footprint small.
  * Brand color = TuranEliteLimo gold #D4AF37, charcoal #0E0E0E.
  * Customer invoice ALWAYS includes the 10 standard policies — operator's
    `custom_notes` is treated as trip-specific add-ons, not a replacement.
  * Dispatch PDF is PII-stripped (last-name initial, no phone/email/full
    address) so it's safe to forward to any affiliate or driver.
"""
from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
    PageBreak,
)


# ---------- brand tokens ----------
GOLD = colors.HexColor("#D4AF37")
GOLD_LIGHT = colors.HexColor("#F2E2A8")
INK = colors.HexColor("#0E0E0E")
DIM = colors.HexColor("#6B6B6B")
LINE = colors.HexColor("#D9D9D9")
PAPER = colors.HexColor("#FAFAFA")


# ---------- shared paragraph styles ----------
def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "Title", parent=base["Title"], fontName="Helvetica-Bold",
            fontSize=22, leading=26, textColor=INK, spaceAfter=4, alignment=TA_LEFT,
        ),
        "kicker": ParagraphStyle(
            "Kicker", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=8, leading=10, textColor=GOLD, spaceAfter=2,
            letterSpacing=2, alignment=TA_LEFT,
        ),
        "h2": ParagraphStyle(
            "H2", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=11, leading=14, textColor=INK, spaceBefore=10, spaceAfter=4,
        ),
        "label": ParagraphStyle(
            "Label", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=8, leading=10, textColor=DIM, spaceAfter=1,
        ),
        "body": ParagraphStyle(
            "Body", parent=base["Normal"], fontName="Helvetica",
            fontSize=9.5, leading=13, textColor=INK,
        ),
        "policy": ParagraphStyle(
            "Policy", parent=base["Normal"], fontName="Helvetica",
            fontSize=8.5, leading=11, textColor=INK, spaceAfter=4,
        ),
        "small": ParagraphStyle(
            "Small", parent=base["Normal"], fontName="Helvetica",
            fontSize=7.5, leading=10, textColor=DIM,
        ),
        "totalLabel": ParagraphStyle(
            "TotalLabel", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=10, leading=13, textColor=INK, alignment=2,  # right
        ),
        "totalAmount": ParagraphStyle(
            "TotalAmount", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=14, leading=18, textColor=INK, alignment=2,
        ),
    }


# ---------- formatting helpers ----------
def _money(n) -> str:
    try:
        return f"${float(n):,.2f}"
    except (TypeError, ValueError):
        return "$0.00"


def _safe(v, dash: str = "—") -> str:
    s = ("" if v is None else str(v)).strip()
    return s if s else dash


def _date_human(date_str: Optional[str]) -> str:
    if not date_str:
        return "—"
    try:
        d = datetime.fromisoformat(date_str.replace("Z", "+00:00").split("T")[0])
        return d.strftime("%A, %B %-d, %Y")
    except Exception:
        return str(date_str)


def _time_human(t: Optional[str]) -> str:
    if not t or ":" not in str(t):
        return _safe(t)
    try:
        h, m = str(t).split(":")[:2]
        h, m = int(h), int(m)
        am_pm = "PM" if h >= 12 else "AM"
        h12 = h % 12 or 12
        return f"{h12}:{m:02d} {am_pm}"
    except Exception:
        return str(t)


def _last_name_initial(full_name: str) -> str:
    parts = (full_name or "").strip().split()
    if len(parts) < 2:
        return parts[0] if parts else "—"
    return f"{parts[0]} {parts[-1][0]}."


def _build_doc(buf: BytesIO, title: str) -> SimpleDocTemplate:
    return SimpleDocTemplate(
        buf,
        pagesize=LETTER,
        leftMargin=0.55 * inch,
        rightMargin=0.55 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.55 * inch,
        title=title,
        author="TuranEliteLimo",
        subject=title,
    )


# ---------- shared header ----------
def _header_block(styles: dict, doc_kicker: str, doc_title: str, doc_id: str) -> list:
    # Two-column header: left = brand, right = doc meta
    brand_cell = [
        Paragraph("TURANELITELIMO", ParagraphStyle(
            "BrandWordmark", fontName="Helvetica-Bold", fontSize=15,
            leading=17, textColor=INK, alignment=TA_LEFT,
        )),
        Paragraph(
            "Luxury Chauffeur · San Francisco Bay Area",
            ParagraphStyle("BrandTag", fontName="Helvetica", fontSize=8,
                           leading=10, textColor=DIM),
        ),
        Spacer(1, 2),
        Paragraph("turanelitelimo.com  ·  (650) 410-0687  ·  support@turanelitelimo.com",
                  ParagraphStyle("BrandCt", fontName="Helvetica", fontSize=7.5,
                                 leading=10, textColor=DIM)),
    ]
    meta_cell = [
        Paragraph(doc_kicker, styles["kicker"]),
        Paragraph(doc_title, ParagraphStyle(
            "DocTitle", fontName="Helvetica-Bold", fontSize=16, leading=20,
            textColor=INK, alignment=2,  # right
        )),
        Spacer(1, 2),
        Paragraph(f"<b>ID:</b> {doc_id}", ParagraphStyle(
            "DocId", fontName="Helvetica", fontSize=8, leading=11,
            textColor=DIM, alignment=2,
        )),
        Paragraph(f"<b>Issued:</b> {datetime.now(timezone.utc).strftime('%b %d, %Y')}",
                  ParagraphStyle("DocDate", fontName="Helvetica", fontSize=8,
                                 leading=11, textColor=DIM, alignment=2)),
    ]
    header = Table([[brand_cell, meta_cell]], colWidths=[3.7 * inch, 3.5 * inch])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [
        header,
        Spacer(1, 6),
        HRFlowable(width="100%", thickness=2, color=GOLD, spaceBefore=2, spaceAfter=10),
    ]


# ---------- detail-row helper used by both PDFs ----------
def _details_table(styles: dict, rows: list, col1=1.3, col2=2.1, col3=1.3, col4=2.1) -> Table:
    """Two-column key/value grid. `rows` is list of [(label, value), (label, value)] tuples."""
    data = []
    for left, right in rows:
        lk, lv = left if left else ("", "")
        rk, rv = right if right else ("", "")
        data.append([
            Paragraph(lk, styles["label"]) if lk else "",
            Paragraph(_safe(lv), styles["body"]) if lk else "",
            Paragraph(rk, styles["label"]) if rk else "",
            Paragraph(_safe(rv), styles["body"]) if rk else "",
        ])
    t = Table(data, colWidths=[col1 * inch, col2 * inch, col3 * inch, col4 * inch])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


# ==============================================================
# 1) CUSTOMER INVOICE PDF
# ==============================================================
def generate_invoice_pdf(
    quote: dict,
    custom_notes: str = "",
    deposit_pct: float = 25.0,
) -> bytes:
    """
    Returns invoice/booking confirmation PDF as bytes.

    The 10 standard policies are baked in (cancellation, wait time, overtime,
    add-stops, damage, alcohol, prohibited conduct, change-of-booking,
    insurance/liability). `custom_notes` is rendered ABOVE the policies in a
    "Trip-specific notes" section — meant for one-off details the operator
    wants the customer to see (e.g. "Pickup at hotel lobby door 5").
    """
    styles = _styles()
    buf = BytesIO()
    doc = _build_doc(buf, f"Invoice {quote.get('id', '')[:8]}")
    story: list = []

    invoice_id = f"TEL-{(quote.get('id') or '')[:8].upper()}"
    total = float(quote.get("quoted_price") or 0)
    deposit = round(total * (float(deposit_pct) / 100.0), 2)
    balance = round(total - deposit, 2)

    # ---- Header
    story.extend(_header_block(styles, "BOOKING INVOICE", "Reservation Confirmation", invoice_id))

    # ---- Customer block
    story.append(Paragraph("BILL TO", styles["label"]))
    story.append(Paragraph(_safe(quote.get("full_name")), ParagraphStyle(
        "CustomerName", fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=INK,
    )))
    contact_bits = [b for b in [quote.get("email"), quote.get("phone")] if b]
    if contact_bits:
        story.append(Paragraph(" · ".join(contact_bits), styles["small"]))
    story.append(Spacer(1, 10))

    # ---- Trip details (4-column key/value grid)
    story.append(Paragraph("TRIP DETAILS", styles["label"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=2, spaceAfter=6))
    trip_rows = [
        (("Service Date", _date_human(quote.get("pickup_date"))),
         ("Pickup Time", _time_human(quote.get("pickup_time")))),
        (("Duration", _safe(quote.get("service_duration"))),
         ("Trip Type", _safe(quote.get("trip_type") or quote.get("occasion")))),
        (("Vehicle", _safe(quote.get("vehicle_type"))),
         ("Passengers", _safe(quote.get("passengers")))),
        (("Pickup Location", _safe(quote.get("pickup_location"))),
         ("Drop-off Location", _safe(quote.get("dropoff_location")))),
    ]
    story.append(_details_table(styles, trip_rows))

    stops = [s for s in (quote.get("stops") or []) if s]
    if stops:
        story.append(Spacer(1, 4))
        story.append(Paragraph("ADDITIONAL STOPS", styles["label"]))
        for i, s in enumerate(stops, 1):
            story.append(Paragraph(f"{i}. {s}", styles["body"]))

    # ---- Trip-specific notes (operator's free text — appears prominently)
    if custom_notes and custom_notes.strip():
        story.append(Spacer(1, 8))
        story.append(Paragraph("TRIP-SPECIFIC NOTES", styles["label"]))
        story.append(HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=2, spaceAfter=4))
        # Preserve operator's line breaks
        for line in custom_notes.split("\n"):
            line = line.strip()
            if line:
                story.append(Paragraph(line, styles["body"]))
            else:
                story.append(Spacer(1, 4))

    # ---- Pricing summary
    story.append(Spacer(1, 12))
    story.append(Paragraph("PRICING", styles["label"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=2, spaceAfter=4))

    pricing_data = [
        [
            Paragraph(f"{_safe(quote.get('vehicle_type'))} · {_safe(quote.get('service_duration'))} · all-inclusive",
                      styles["body"]),
            Paragraph(_money(total), ParagraphStyle(
                "PriceRight", fontName="Helvetica", fontSize=9.5, leading=12,
                textColor=INK, alignment=2,
            )),
        ],
        [
            Paragraph("Includes: gratuity, fuel, tolls",
                      ParagraphStyle("Inc", fontName="Helvetica-Oblique",
                                     fontSize=8, leading=10, textColor=DIM)),
            "",
        ],
    ]
    pt = Table(pricing_data, colWidths=[5.5 * inch, 1.8 * inch])
    pt.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(pt)

    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=6, spaceAfter=6))

    totals_data = [
        [Paragraph("TOTAL", styles["totalLabel"]),
         Paragraph(_money(total), styles["totalAmount"])],
        [Paragraph(f"Deposit due now ({deposit_pct:g}%)", ParagraphStyle(
            "DepLabel", fontName="Helvetica", fontSize=9, leading=12,
            textColor=DIM, alignment=2,
         )),
         Paragraph(_money(deposit), ParagraphStyle(
            "DepAmt", fontName="Helvetica-Bold", fontSize=11, leading=14,
            textColor=GOLD, alignment=2,
         ))],
        [Paragraph("Balance due 48 hrs before trip", ParagraphStyle(
            "BalLabel", fontName="Helvetica", fontSize=9, leading=12,
            textColor=DIM, alignment=2,
         )),
         Paragraph(_money(balance), ParagraphStyle(
            "BalAmt", fontName="Helvetica", fontSize=10, leading=13,
            textColor=INK, alignment=2,
         ))],
    ]
    tt = Table(totals_data, colWidths=[5.5 * inch, 1.8 * inch])
    tt.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LINEABOVE", (0, 0), (-1, 0), 1.2, INK),
    ]))
    story.append(tt)

    # ---- Page break before policies so they're always on their own page(s)
    story.append(PageBreak())

    # ---- Standard policies (always baked in)
    story.append(Paragraph("TERMS & POLICIES", styles["kicker"]))
    story.append(Paragraph("Conditions of Reservation", styles["title"]))
    story.append(HRFlowable(width="100%", thickness=1.5, color=GOLD, spaceBefore=4, spaceAfter=10))

    policies = [
        ("1. Deposit & Payment",
         f"A {deposit_pct:g}% non-refundable deposit is required to confirm this booking. "
         "The remaining balance is due 48 hours before the scheduled pickup. "
         "Payments are processed securely via Stripe."),
        ("2. Cancellation Policy",
         "14+ days before trip: full refund of any amount paid above the deposit; deposit is non-refundable. "
         "7–13 days before trip: 50% of total non-refundable. "
         "Within 7 days of trip: 100% non-refundable."),
        ("3. Wait Time",
         "The first 15 minutes of wait time at pickup are complimentary. "
         "After 15 minutes, wait time is billed at $1.50 per minute and charged to the card on file after the trip."),
        ("4. Overtime",
         f"The booked duration is {_safe(quote.get('service_duration'))}. Any time beyond the booked duration is billed at $215/hr, "
         "prorated in 30-minute increments. Overtime is confirmed verbally with the driver and charged to the card on file."),
        ("5. Additional Stops",
         "The booked route includes the pickup and drop-off locations as listed above. "
         "Additional stops not on the original route may incur a $25–$50 add-stop fee depending on distance, "
         "at the driver's discretion and subject to time availability."),
        ("6. Damage & Cleanup",
         "The customer is liable for any damage to the vehicle interior, including spills requiring professional cleaning, "
         "vomit cleanup ($350 minimum), broken fixtures, or other interior damage. "
         "Damage charges are assessed post-trip and applied to the card on file."),
        ("7. Alcohol Policy",
         "All passengers consuming alcohol must be 21 years of age or older. The customer is responsible for ensuring legal "
         "consumption by their group. TuranEliteLimo does not provide or sell alcohol. Underage consumption may result in "
         "immediate trip termination without refund."),
        ("8. Prohibited Conduct",
         "Smoking of any kind (cigarettes, vape, marijuana) is strictly prohibited inside the vehicle. Illegal substances "
         "are not permitted. Standing through the sunroof or hanging out of windows is prohibited for safety reasons."),
        ("9. Changes to Booking",
         "Pickup time, location, or vehicle preference changes must be requested at least 48 hours before the trip via "
         "SMS or email. Changes within 48 hours are subject to availability and may incur a change fee."),
        ("10. Insurance & Liability",
         "TuranEliteLimo is fully TCP-licensed and insured up to $5,000,000 in commercial liability coverage. Maximum "
         "liability is limited to the total trip cost paid."),
    ]
    for title, body in policies:
        story.append(Paragraph(f"<b>{title}.</b>  {body}", styles["policy"]))

    # ---- Acceptance + footer
    story.append(Spacer(1, 14))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "By submitting the deposit payment, the customer acknowledges and agrees to all terms outlined above.",
        ParagraphStyle("Accept", fontName="Helvetica-Oblique", fontSize=8.5,
                       leading=11, textColor=DIM),
    ))
    story.append(Spacer(1, 24))
    sig_table = Table([
        [Paragraph("Customer Signature", styles["label"]),
         Paragraph("Date", styles["label"])],
        [HRFlowable(width="100%", thickness=0.6, color=INK),
         HRFlowable(width="100%", thickness=0.6, color=INK)],
    ], colWidths=[4.5 * inch, 2.5 * inch])
    sig_table.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(sig_table)

    # ---- Footer
    story.append(Spacer(1, 18))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GOLD, spaceAfter=4))
    story.append(Paragraph(
        "Thank you for choosing TuranEliteLimo · turanelitelimo.com · (650) 410-0687 · support@turanelitelimo.com",
        ParagraphStyle("Footer", fontName="Helvetica", fontSize=7.5,
                       leading=10, textColor=DIM, alignment=TA_CENTER),
    ))

    doc.build(story)
    return buf.getvalue()


# ==============================================================
# 2) AFFILIATE DISPATCH PDF (PII-stripped)
# ==============================================================
def generate_dispatch_pdf(
    quote: dict,
    affiliate_name: str = "",
    affiliate_rate: Optional[float] = None,
    vehicle_features: Optional[list] = None,
    extra_notes: str = "",
    include_full_itinerary: bool = False,
) -> bytes:
    """
    Returns the dispatch sheet PDF as bytes. Strips customer PII:
      • Last-name initial only ("Leticia H.")
      • No phone number printed (released to driver 2 hrs pre-pickup)
      • No email
      • Pickup city + cross-streets only (not full street address)

    Driver/affiliate operational policies are baked in: vehicle standards,
    driver attire, communication protocol, damage reporting, payment terms,
    confidentiality.

    `include_full_itinerary=True` opts-in to printing the FULL pickup +
    drop-off addresses and the actual stop addresses. Use only when the
    customer's trip has a pre-planned multi-stop itinerary the affiliate
    needs ahead of time (e.g. wine-country day trips, weddings with
    multiple venues). Off by default to preserve PII.
    """
    styles = _styles()
    buf = BytesIO()
    doc = _build_doc(buf, f"Dispatch {quote.get('id', '')[:8]}")
    story: list = []

    dispatch_id = f"TEL-DISPATCH-{(quote.get('id') or '')[:8].upper()}"

    # ---- Header
    story.extend(_header_block(styles, "AFFILIATE DISPATCH SHEET", "Trip Operations Brief", dispatch_id))

    # ---- Confidentiality strip
    confid = Table([[Paragraph(
        "<b>CONFIDENTIAL</b> &nbsp;·&nbsp; For named affiliate and assigned driver only. Do not copy, "
        "forward, or share beyond authorized parties.",
        ParagraphStyle("ConfidBody", fontName="Helvetica", fontSize=8,
                       leading=11, textColor=INK),
    )]], colWidths=[7.3 * inch])
    confid.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GOLD_LIGHT),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 0), (-1, -1), 1, GOLD),
    ]))
    story.append(confid)
    story.append(Spacer(1, 10))

    # ---- Operator + affiliate strip
    op_rows = [
        (("Dispatched by", "TuranEliteLimo  ·  Adam"),
         ("Affiliate Operator", _safe(affiliate_name) or "[NAME PENDING]")),
        (("Dispatch Date", datetime.now(timezone.utc).strftime("%b %d, %Y")),
         ("Dispatch ID", dispatch_id)),
    ]
    story.append(_details_table(styles, op_rows))
    story.append(Spacer(1, 8))

    # ---- Trip block
    story.append(Paragraph("TRIP", styles["label"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=2, spaceAfter=4))
    trip_rows = [
        (("Service Date", _date_human(quote.get("pickup_date"))),
         ("Pickup Time", _time_human(quote.get("pickup_time")))),
        (("Duration", _safe(quote.get("service_duration"))),
         ("Service Type", "Hourly charter — " + _safe(quote.get("trip_type") or quote.get("occasion"), dash="Private trip"))),
    ]
    story.append(_details_table(styles, trip_rows))
    story.append(Spacer(1, 8))

    # ---- Vehicle block
    story.append(Paragraph("VEHICLE", styles["label"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=2, spaceAfter=4))
    story.append(Paragraph(f"<b>{_safe(quote.get('vehicle_type'))}</b>", styles["body"]))
    features = vehicle_features or _default_vehicle_features(quote.get("vehicle_type") or "")
    if features:
        story.append(Spacer(1, 2))
        for feat in features:
            story.append(Paragraph(f"·&nbsp;&nbsp;{feat}", styles["body"]))
    story.append(Spacer(1, 8))

    # ---- Passenger block (PII-STRIPPED)
    story.append(Paragraph("PASSENGER", styles["label"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=2, spaceAfter=4))
    pax_rows = [
        (("Lead Passenger", _last_name_initial(quote.get("full_name") or "")),
         ("Group Size", _safe(quote.get("passengers")))),
        (("Occasion", _safe(quote.get("trip_type") or quote.get("occasion"))),
         ("Lead Pax Phone", "Released to driver 2 hrs before pickup")),
    ]
    story.append(_details_table(styles, pax_rows))
    story.append(Spacer(1, 8))

    # ---- Location  (PII default = city+cross-street; opt-in = full address)
    story.append(Paragraph("PICKUP & ROUTING", styles["label"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=2, spaceAfter=4))
    if include_full_itinerary:
        loc_rows = [
            (("Pickup Address", _safe(quote.get("pickup_location"))),
             ("Drop-off Address", _safe(quote.get("dropoff_location")))),
        ]
    else:
        loc_rows = [
            (("Pickup Area", _strip_to_city(quote.get("pickup_location") or "")),
             ("Drop-off Area", _strip_to_city(quote.get("dropoff_location") or ""))),
        ]
    story.append(_details_table(styles, loc_rows))
    if not include_full_itinerary:
        story.append(Paragraph(
            "Full pickup address released to assigned driver 2 hours before scheduled pickup time.",
            styles["small"],
        ))
    stops = [s for s in (quote.get("stops") or []) if s]
    if stops:
        story.append(Spacer(1, 4))
        if include_full_itinerary:
            story.append(Paragraph(f"<b>Itinerary — {len(stops)} planned stop{'s' if len(stops) != 1 else ''}:</b>", styles["body"]))
            for i, s in enumerate(stops, 1):
                story.append(Paragraph(f"&nbsp;&nbsp;{i}.&nbsp;&nbsp;{_safe(s)}", styles["body"]))
        else:
            story.append(Paragraph(f"<b>Multi-stop route ({len(stops)} stops planned)</b> · "
                                   "specific stops directed by lead passenger during trip.", styles["small"]))
    story.append(Spacer(1, 8))

    # ---- Special requests / notes
    if extra_notes and extra_notes.strip():
        story.append(Paragraph("SPECIAL REQUESTS", styles["label"]))
        story.append(HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=2, spaceAfter=4))
        for line in extra_notes.split("\n"):
            line = line.strip()
            if line:
                story.append(Paragraph(f"·&nbsp;&nbsp;{line}", styles["body"]))
        story.append(Spacer(1, 8))

    # ---- Payment block
    story.append(Paragraph("PAYMENT TERMS", styles["label"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=2, spaceAfter=4))
    rate_str = _money(affiliate_rate) if affiliate_rate else "Per existing affiliate agreement"
    pay_rows = [
        (("Agreed Rate", rate_str),
         ("Terms", "Net 7 from trip completion")),
        (("Invoice To", "support@turanelitelimo.com"),
         ("Reference", dispatch_id)),
    ]
    story.append(_details_table(styles, pay_rows))
    story.append(Spacer(1, 8))

    # ---- Contact escalation
    story.append(Paragraph("DISPATCH CONTACT", styles["label"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=2, spaceAfter=4))
    story.append(Paragraph(
        "<b>Primary:</b> Adam · (650) 410-0687 · call or text · available 24/7 for active trips.&nbsp;&nbsp; "
        "<b>Email:</b> support@turanelitelimo.com.",
        styles["body"],
    ))
    story.append(Paragraph(
        "Trip issues, late arrivals, vehicle problems, customer escalations — <b>call dispatch immediately</b>. "
        "Do not contact the client directly without dispatch approval.",
        styles["body"],
    ))

    # ---- Page break before operational standards
    story.append(PageBreak())

    # ---- Operational standards (the "affiliate-side policies")
    story.append(Paragraph("OPERATIONAL STANDARDS", styles["kicker"]))
    story.append(Paragraph("Driver & Vehicle Requirements", styles["title"]))
    story.append(HRFlowable(width="100%", thickness=1.5, color=GOLD, spaceBefore=4, spaceAfter=10))

    standards = [
        ("1. Vehicle Standards",
         "Vehicle must arrive freshly cleaned (interior and exterior), fuel topped off, all interior features tested "
         "and functional. Any non-functional feature (lights, sound, climate, mini-bar) must be reported to dispatch "
         "before pickup so an alternate vehicle can be assigned."),
        ("2. Driver Attire & Conduct",
         "Professional black attire (suit or full chauffeur uniform). No jeans, sneakers, or visible logos other than "
         "TuranEliteLimo-approved. Driver must be well-groomed, courteous, and silent unless addressed by the client. "
         "No phone calls or personal conversations in the vehicle."),
        ("3. Punctuality",
         "Arrive on-site at the pickup location 5–10 minutes BEFORE scheduled pickup time. Text dispatch upon arrival. "
         "Any anticipated delay must be reported to dispatch at least 30 minutes before pickup time."),
        ("4. Communication Protocol",
         "All client communication is routed through TuranEliteLimo dispatch. Driver may communicate directly with the "
         "lead passenger ONLY for active trip coordination (e.g. confirming arrival, asking for direction during a "
         "multi-stop route). Driver must not solicit, exchange contact information with, or attempt to retain clients "
         "outside this trip."),
        ("5. Damage & Incident Reporting",
         "Any damage, spill, vomit, or interior issue must be photographed and reported to dispatch (Adam · 650-410-0687) "
         "within 1 hour of trip completion. Damage charges are processed via TuranEliteLimo's card-on-file and remitted "
         "to the affiliate per the existing affiliate agreement."),
        ("6. Confidentiality & Data Handling",
         "This dispatch sheet, the client's identity, and all trip details are strictly confidential. The affiliate and "
         "driver may not store, share, copy, or use client information for any purpose other than completing this trip. "
         "Client recontact, marketing, or solicitation by the affiliate is prohibited and grounds for immediate "
         "termination of the affiliate relationship."),
        ("7. Cancellation Handling",
         "If TuranEliteLimo cancels the trip ≥48 hrs before pickup: no fee. Within 48 hrs: agreed-upon cancellation fee per "
         "affiliate agreement. If the affiliate is unable to fulfill the trip for any reason, dispatch must be notified "
         "immediately and the affiliate is responsible for sourcing an equivalent replacement vehicle/driver at no "
         "additional cost to TuranEliteLimo."),
        ("8. Quality Standards",
         "Driver provides bottled water for all passengers. Phone chargers (USB-C + Lightning) available on request. "
         "Vehicle climate set to a comfortable level before pickup. Sound system pre-paired with Bluetooth and ready "
         "for client device pairing on arrival."),
        ("9. Insurance & Licensing",
         "Affiliate confirms that the assigned vehicle and driver hold all required commercial licensing (TCP for "
         "California), DOT compliance where applicable, and active commercial liability insurance with minimum "
         "$1,500,000 coverage. Proof must be available on request."),
        ("10. Post-Trip Report",
         "Driver submits a brief post-trip report to dispatch within 2 hours of trip completion: actual start/end "
         "times, any deviations from the planned route, any incidents or notable observations, and any client "
         "feedback received during the trip."),
    ]
    for title, body in standards:
        story.append(Paragraph(f"<b>{title}.</b>  {body}", styles["policy"]))

    # ---- Checklists
    story.append(Spacer(1, 14))
    story.append(Paragraph("PRE-TRIP CHECKLIST", styles["label"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=2, spaceAfter=4))
    for item in [
        "Vehicle cleaned inside + out",
        "Mini-bar / cooler stocked with ice + bottled water",
        "All interior features tested (lights, sound, climate, USB chargers)",
        "Fuel topped off",
        "Driver in professional black attire",
        "Pickup time + cross-streets confirmed with dispatch 24 hrs prior",
        "ETA at pickup location: 5–10 min EARLY",
        "Text Adam (650-410-0687) on arrival at pickup location",
    ]:
        story.append(Paragraph(f"☐ &nbsp;&nbsp;{item}", styles["body"]))

    story.append(Spacer(1, 10))
    story.append(Paragraph("POST-TRIP CHECKLIST", styles["label"]))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=2, spaceAfter=4))
    for item in [
        "Inspect vehicle for damage or excessive cleanup needs",
        "Photograph any damage; send to dispatch within 1 hr",
        "Submit post-trip report (actual start/end times, incidents, feedback)",
        "Invoice issued within 24 hrs of trip completion",
    ]:
        story.append(Paragraph(f"☐ &nbsp;&nbsp;{item}", styles["body"]))

    # ---- Footer
    story.append(Spacer(1, 18))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GOLD, spaceAfter=4))
    story.append(Paragraph(
        f"Dispatch ID {dispatch_id} · TuranEliteLimo · turanelitelimo.com · (650) 410-0687",
        ParagraphStyle("Footer", fontName="Helvetica", fontSize=7.5,
                       leading=10, textColor=DIM, alignment=TA_CENTER),
    ))

    doc.build(story)
    return buf.getvalue()


# ---------- helpers used only by the dispatch PDF ----------
def _default_vehicle_features(vehicle_type: str) -> list:
    """Best-guess feature list per vehicle so the dispatch sheet documents what
    the operator expects to receive. Override by passing `vehicle_features=`."""
    vt = (vehicle_type or "").lower()
    if "limo" in vt and "sprinter" in vt:
        return [
            "Leather wraparound seating",
            "Club LED lighting",
            "Premium Bluetooth sound system",
            "Mini-bar / chilled cooler",
            "Tinted privacy windows",
        ]
    if "sprinter" in vt:
        return [
            "Executive captain-chair seating",
            "Climate control",
            "USB-C + Lightning charging",
            "Tinted privacy windows",
        ]
    if "party bus" in vt or "coach" in vt:
        return [
            "Club LED lighting + dance floor",
            "Premium bar setup",
            "High-output sound system",
            "Lounge-style perimeter seating",
        ]
    if "stretch" in vt or "limousine" in vt:
        return [
            "Stretch limousine cabin",
            "Premium bar setup",
            "LED accent lighting",
            "Climate control",
        ]
    if "sedan" in vt:
        return [
            "Executive sedan",
            "Leather interior",
            "Climate control",
            "Bottled water provided",
        ]
    if "suv" in vt:
        return [
            "Luxury full-size SUV (Escalade / Suburban class)",
            "Leather interior, 3 rows",
            "Climate control",
            "Bottled water provided",
        ]
    return []


def _strip_to_city(location: str) -> str:
    """Best-effort PII strip: takes 'Address 123 Main St, Palo Alto, CA 94301'
    and returns 'Palo Alto, CA'. If we can't extract city+state, returns
    the input verbatim (operator should review before sending)."""
    if not location:
        return "—"
    parts = [p.strip() for p in location.split(",") if p.strip()]
    if len(parts) >= 2:
        # Last 2 parts are usually 'City' + 'State Zip' or 'City State'
        return ", ".join(parts[-2:])
    return location
