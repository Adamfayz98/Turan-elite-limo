# TuranEliteLimo — Pricing Reference

**Single source of truth for affiliate net rates, recommended margins, and minimum retail prices.**

Last updated: Feb 28, 2026
Used by: `/app/frontend/src/lib/pricingReference.js` → drives Profit Preview Chip in Admin → Quote Requests.

---

## How margins work

- **Net cost** = what we pay the affiliate
- **Retail** = what we charge the customer
- **Margin %** = (retail − net) / retail
- **Floor** = 20% margin (below this, walk away or pivot to cheaper vehicle)
- **Target** = 25–30% margin (sweet spot)
- **Premium** = 30%+ margin (use when customer is not price-shopping)

---

## Affiliate net rates (Bay Area, Feb 2026)

> If your affiliate quotes differently, update this table AND `pricingReference.js`.

| Vehicle | Net rate ($/hr) | Min hours | Notes |
|---|---|---|---|
| Executive Sedan | $75 | 1 (flat-rate transfers usually) | Cadillac XTS / S-Class |
| First Class Sedan (S-Class) | $95 | 1 | Mercedes S-Class |
| Luxury SUV (Escalade/Yukon) | $95 | 1 | Up to 6 pax |
| Sprinter Van (standard) | $110 | 3 | Up to 14 pax |
| Executive Sprinter (captain chairs) | $125 | 3 | Up to 12 pax |
| Jet Sprinter (first-class recliners) | $145 | 3 | Up to 10 pax |
| Limo-Style Sprinter (club lighting/bar) | $170 | 4 | Up to 14 pax, party setup. **Confirmed Feb 27 — Leticia/Jasmin trips.** |
| Stretch Limousine | $135 | 3 | Up to 8 pax |
| Party Bus (14–30 pax) | $200 | 4 | Limo coach with dance floor |

**TODO — confirm with Adam:**
- [ ] Executive Sedan: confirm $75/hr or update
- [ ] First Class Sedan: confirm $95/hr or update
- [ ] Luxury SUV: confirm $95/hr or update
- [ ] Sprinter Van standard: confirm $110/hr or update
- [ ] Jet Sprinter: confirm $145/hr or update
- [ ] Stretch Limo: confirm $135/hr or update
- [ ] Party Bus: confirm $200/hr or update

---

## Recommended retail bands (Bay Area, Feb 2026)

Formula: `floor = net / (1 - 0.20)` · `target = net / (1 - 0.275)` · `premium = net / (1 - 0.35)`

| Vehicle | Hours | Net | Floor (20%) | Target (27.5%) | Premium (35%) |
|---|---|---|---|---|---|
| Limo-Style Sprinter | 4 (min) | $680 | $850 | $938 | $1,046 |
| Limo-Style Sprinter | 5 | $850 | $1,063 | $1,172 | $1,308 |
| Limo-Style Sprinter | 6 | $1,020 | $1,275 | $1,407 | $1,569 |
| Executive Sprinter | 3 (min) | $375 | $469 | $517 | $577 |
| Executive Sprinter | 4 | $500 | $625 | $690 | $769 |
| Sprinter Van | 3 (min) | $330 | $413 | $455 | $508 |
| Sprinter Van | 4 | $440 | $550 | $607 | $677 |
| Party Bus | 4 (min) | $800 | $1,000 | $1,103 | $1,231 |
| Party Bus | 5 | $1,000 | $1,250 | $1,379 | $1,538 |
| Stretch Limo | 3 (min) | $405 | $506 | $559 | $623 |
| Luxury SUV (hourly) | 1 | $95 | $119 | $131 | $146 |
| Executive Sedan (transfer) | 1 (flat) | $75 | $94 | $103 | $115 |

---

## Real-world calibration notes

### Feb 27, 2026 — Leticia (Limo-Style Sprinter, 4 hrs)
- Affiliate net: $680 ($170/hr × 4)
- Quoted: $900 → countered to $850 (floor)
- Customer anchor: $625–$825 (from website estimator — needs to be raised!)
- **Lesson:** Website estimator was showing $625–$825 for limo-style Sprinter. That's BELOW floor. Customer remembered the number and pushed back. **Update the estimator to match the table above.**

### Feb 27, 2026 — Jasmin (Sprinter, birthday, 4 hrs)
- Locked at $170/hr (likely limo-style after upsell)
- Pending: customer confirmation

---

## Promo code reserve

For closing price-sensitive customers without dropping below floor:
- **10% off future Sedan/SUV trip** — costs ~$10–20 on a future $100–200 booking (mostly pure-margin)
- **Free chilled water + champagne setup** — ~$5 real cost, perceived value ~$30
- **Extra 30 min added to trip** — works if affiliate is flexible (no real cost to us if they're under their cap)

Standard promo codes (set up in Admin → Promos):
- `RETURN10` — 10% off, sedan/SUV only, 6 months
- `BIRTHDAY10` — same restrictions, marketing
- `WELCOME10` — first-time customers

---

## Where this is used

- `/app/frontend/src/lib/pricingReference.js` — JS export of the rate table
- `/app/frontend/src/components/admin/QuoteRequestsTab.jsx` — Profit Preview Chip
- `/app/frontend/src/components/admin/QuickQuoteTab.jsx` — _(TODO: integrate)_
- `/app/frontend/src/components/QuoteRequestDialog.jsx` — _(TODO: sync customer-facing estimator with floor prices)_

**Rule:** when you change rates here, update `pricingReference.js` in the same commit. Otherwise the chip shows stale numbers.
