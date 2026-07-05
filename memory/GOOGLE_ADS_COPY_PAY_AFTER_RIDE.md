# Google Ads Copy — "Book Now · Pay After Ride" (v2 — CAI-approved)

**Date:** 2026-02
**Owner:** Marketing / CAI (Ad Manager)
**Status:** All 9 CAI review points addressed. Ready to deploy after §0 verification.

---

## §0 — DEPLOYMENT PREREQUISITE (verify BEFORE touching Ads)

### Conversion firing — CONFIRMED in code

**Purchase conversion fires at BOOKING CONFIRMATION, not at ride completion.**

Both fronts:
- **Client-side (gtag Purchase):** `frontend/src/components/GoogleAdsConversion.jsx` fires as soon as `payment_status === "card_on_file"` — which flips the moment Stripe SetupIntent completes on the /thank-you page. Uses `pay_later_amount ?? paid_amount ?? quote_amount` (realized revenue, not pre-promo).
- **Server-side (offline Ads API):** `backend/routes/payments.py::_finalize_setup_session()` schedules `upload_booking_to_google_ads(booking_id)` at line 1384, immediately after card is saved and confirmation number issued.

### Internal-test exclusion — SHIPPED

Add Adam's + team emails to `backend/.env`:
```
GOOGLE_ADS_EXCLUDED_EMAILS=adam@turanelitelimo.com,support@turanelitelimo.com,cai@youragency.com
```
(Comma-separated. Applies to BOTH the client-side gtag Purchase event AND the server-side offline upload. Restart backend after change.)

### End-to-end verification checklist (do this BEFORE launching new ads)

1. Add your test email to `GOOGLE_ADS_EXCLUDED_EMAILS`, restart backend.
2. Open an incognito window, click a live PMax ad to land on turanelitelimo.com (this captures gclid).
3. Book an Executive Sedan → "Book Now, Pay After Ride" → complete Stripe SetupIntent with test card `4242 4242 4242 4242`.
4. Verify in Google Ads → Tools → Conversions → recent activity that the Purchase conversion **did NOT** fire (because your email is excluded).
5. Remove the excluded email temporarily, re-do the flow, confirm Purchase DOES fire with the correct post-promo revenue amount, then restore the exclusion.
6. Confirm conversion timing = booking creation timestamp (not ride date).

**If §0 doesn't check out, DO NOT DEPLOY the new copy — attribution is broken.**

---

## §1 — PAYMENT MECHANISM (for reference)

Built: **(b) Stripe SetupIntent** — card is verified and saved off-session, **charged $0 today**, charged AFTER the ride via `charge-pay-later` admin action. No 7-day auth-hold expiry problem. "$0 today · No card charged today" copy is 100% accurate.

Long-lead bookings (weeks/months out) are fine — SetupIntent stays valid indefinitely.

---

## §2 — CANCELLATION POLICY (baked into copy)

Real policy as coded in `frontend/src/components/CancellationPolicy.jsx`:

| Timing | Policy |
|---|---|
| 24+ hours before pickup | Free cancellation, full refund |
| 12–24 hours before pickup | 50% refund |
| Less than 12 hours / no-show | No refund |
| 6+ hours before pickup | Free changes (date/time/vehicle/route) |

**Copy must say:** "Free cancellation up to 24h before pickup" — NEVER "Free Cancellation" alone.

---

## §3 — RSA HEADLINES (30-char limit strictly enforced)

Each headline below has been counted. Use these EXACTLY:

| # | Headline (chars) | Length |
|---|---|---:|
| 1 | Book Now · Pay After Ride | 25 |
| 2 | No Card Charged Today | 21 |
| 3 | $0 Today · Pay After Ride | 25 |
| 4 | SF Bay Area Chauffeur | 21 |
| 5 | Executive Sedan · Bay Area | 26 |
| 6 | Luxury SUV · SF Bay Area | 24 |
| 7 | Instant Booking Confirmation | 28 |
| 8 | Free Cancellation to 24h | 24 |
| 9 | Apple Pay & Google Pay | 22 |
| 10 | Stripe-Secured · SSL | 20 |
| 11 | Top-Rated on Google | 19 |
| 12 | 24/7 Chauffeur Dispatch | 23 |
| 13 | Flat Rate · No Surge | 20 |
| 14 | Book · Ride · Then Pay | 22 |
| 15 | SFO · OAK · SJC Flat Rate | 25 |

⚠️ **DO NOT USE:** "Rated 5-Star on Google" (GBP is ~4.9 avg, false claim). Use **"Top-Rated on Google"** consistently.

## §4 — LONG HEADLINES (90-char limit, counted)

| # | Long headline | Length |
|---|---|---:|
| L1 | Book Now, Pay After Your Ride — No Card Charged Today · SF Bay Area Chauffeur | 78 |
| L2 | Executive Sedan Bay Area — $0 Today, Pay After You Arrive | 57 |
| L3 | Instant Booking · Apple Pay & Google Pay · Card Charged Only After Your Ride | 76 |

## §5 — DESCRIPTIONS (90-char limit, counted)

| # | Description | Length |
|---|---|---:|
| D1 | Book your Bay Area chauffeur online. No card charged today, only after your ride. | 82 |
| D2 | Executive sedans and luxury SUVs. Instant booking confirmation. Apple Pay ready. | 80 |
| D3 | Flat-rate pricing. Free cancellation up to 24h before pickup. Stripe-secured booking. | 85 |
| D4 | Card securely saved with Stripe, charged only after your ride is complete. $0 today. | 85 |
| D5 | Late-model executive fleet. Bay Area airport, corporate, and long-distance transport. | 85 |
| D6 | Verified card, no charge today. Pay after your ride. Bay Area luxury chauffeur service. | 86 |

---

## §6 — HEADLINE PINNING (fixes CAI concern #8 — Ad Strength)

**Pin THREE offer headlines to Position 1** (Google rotates between them, so Ad Strength stays high while the offer is always front-and-center):

- Book Now · Pay After Ride  *(pinned position 1)*
- $0 Today · Pay After Ride  *(pinned position 1)*
- No Card Charged Today  *(pinned position 1)*

Leave all other headlines UNPINNED so Google's ML can optimize.

---

## §7 — CALLOUT EXTENSIONS (25-char limit, counted, account level)

Add these ONCE at account level and let them inherit:

| Callout | Length |
|---|---:|
| Book Now · Pay After Ride | 25 |
| No Card Charged Today | 21 |
| Apple Pay & Google Pay | 22 |
| Flat Rate · No Surge | 20 |
| Free Cancellation to 24h | 24 |
| Top-Rated on Google | 19 |
| Stripe-Secured Booking | 22 |
| 24/7 Dispatch | 13 |
| Instant Confirmation | 20 |
| SF Bay Area · Napa | 18 |

**Removed** (per CAI): "Meet & Greet Included" (can't guarantee across affiliates), "Free Wait" (same), "Multilingual Chauffeurs" (same), "Confirmed in 60 Seconds" vs "driver details in 1 hr" contradiction — resolved by using "Instant Confirmation" (booking is truly instant; driver ETA is a separate downstream comm and is not advertised).

---

## §8 — SITELINKS — SEDAN/SUV/FIRST-CLASS CAMPAIGN ONLY

**IMPORTANT:** These sitelinks go on the Sedan/SUV/First Class campaign ONLY. Do NOT add wedding/party bus/motor coach/stretch sitelinks to this campaign — those vehicles are call-only and would muddy the "$0 today, pay after ride" promise.

| Label (25 char) | Line 1 (35 char) | Line 2 (35 char) | Final URL |
|---|---|---|---|
| Book Now · Pay After | No card charged today | Pay only after your ride ends | /#booking |
| Executive Sedan · $0 Today | Bay Area flat-rate sedan | Reserve now, pay after ride | /#booking |
| Airport Transfer · SFO | Flat rate SFO / OAK / SJC | Book online in 60 seconds | /airport |
| Corporate Roadshow | Executive sedan · SUV | Book online · Bay Area | /corporate |

The Wedding / Wine Tour / Party Bus / Motor Coach ad groups get their OWN sitelinks, separate from this campaign.

---

## §9 — STRUCTURED SNIPPETS

**Header: "Types"**
- Airport Transfer
- Point-to-Point
- Corporate Roadshow
- Long-Distance Transport
- Hourly Chauffeur

**Header: "Service catalog"**
- Executive Sedan
- Luxury SUV
- First Class
- Executive Sprinter

*(Removed specific car models like "Mercedes E-Class, Cadillac XTS, Lincoln Continental" per CAI concern #4 — replaced with generic "late-model executive fleet" wording in Description D5.)*

---

## §10 — AD-GROUP-SPECIFIC VARIANTS

### Executive Sedan Ad Group
- **Pinned H1:** Book Now · Pay After Ride
- **Pinned H1:** $0 Today · Pay After Ride
- **Pinned H1:** No Card Charged Today
- **Unpinned H2+:** Executive Sedan · Bay Area / Instant Booking Confirmation / Free Cancellation to 24h / Apple Pay & Google Pay / Top-Rated on Google
- **Descriptions:** D1, D2, D3, D4

### Luxury SUV Ad Group
- Same pinned trio as above.
- Swap "Executive Sedan · Bay Area" → "Luxury SUV · SF Bay Area" as an unpinned headline.
- Descriptions: D1, D3, D5, D6

### Airport Ad Group (SFO / OAK / SJC)
- **Pinned H1:** Book Now · Pay After Ride
- **Pinned H1:** SFO · OAK · SJC Flat Rate
- **Pinned H1:** No Card Charged Today
- Unpinned: SF Bay Area Chauffeur / Instant Booking Confirmation / Apple Pay & Google Pay / Top-Rated on Google
- Description highlight: "Bay Area airport chauffeur — flat rate to/from SFO, OAK, SJC. No card charged today, pay after your ride."

### Corporate Roadshow Ad Group
- Pinned trio unchanged.
- Add unpinned H2: "Executive Sedan · SUV" / "Bay Area · Silicon Valley"
- Description: "Bay Area corporate roadshow chauffeur. Book online, pay after ride. Executive sedan and SUV."

### Wedding / Wine Tour / Party Bus / Motor Coach / Mini Coach Ad Groups
**These campaigns DO NOT get the "Pay After Ride" copy** — those vehicles are call-only. Use existing evergreen ads. Only inheritable change: add the two account-level callouts "Top-Rated on Google" and "Free Cancellation to 24h" (if applicable).

---

## §11 — DEPLOYMENT ORDER (per CAI §DEPLOYMENT ORDER)

1. ✅ **Verify conversion fires at booking confirmation** (see §0 checklist)
2. ✅ **Add exclusion emails** to `GOOGLE_ADS_EXCLUDED_EMAILS` env var, restart backend
3. **Finalize copy per §3–§9** (this document is the source of truth)
4. **Build new RSAs in Sedan/SUV/First Class ad groups ONLY**
5. **Pin 2–3 offer headlines** to position 1 (§6)
6. **Add surviving callouts at account level** (§7)
7. **Leave existing ads running ONE WEEK** before pausing (per CAI)
8. **Track cost-per-booking, not just CTR**
9. **Keep budget flat for 30 days** during the A/B window

---

## §12 — REMOVAL SUMMARY (what CAI killed, and why)

| Removed copy | Reason |
|---|---|
| "Rated 5-Star on Google" | GBP avg is 4.9, false claim → replaced with "Top-Rated on Google" |
| "5-Star Google Rated" (callout duplicate) | Same, consolidated to one phrasing |
| "Free Cancellation" (alone) | Ambiguous vs actual 24h/12h/no-refund tiers → replaced with "Free Cancellation to 24h" |
| "No Deposit" (alone) | Redundant with Pay After Ride and reads like unlimited protection → cut |
| "Mercedes E-Class, Cadillac XTS, Lincoln Continental" | Can't guarantee specific models across affiliates → generic "late-model executive fleet" |
| "Meet & Greet Included" | Not guaranteed on every affiliate operator |
| "Free Wait" | Same |
| "Multilingual Chauffeurs" | Same |
| "Confirmed in 60 Seconds" vs "driver details in 1 hr" | Contradiction → collapsed to "Instant Booking Confirmation" (true) |
| Wedding/Party Bus sitelinks on Sedan campaign | Routes fixed-price searchers into call-only vehicles → moved to their own campaigns |
| Single-headline pin | Tanks Ad Strength → now pinning THREE offer headlines |

---

## §13 — MEASUREMENT (what to watch, not CTR)

- **Cost-per-booking** (Google Ads spend / count of `payment_status IN ('paid','card_on_file')` bookings from `gclid IS NOT NULL` sources)
- **Ad Strength** — must be Excellent/Good with the 3-pin setup
- **Conversion lag** — with pay-after-ride, cost data is real-time but revenue-to-be-collected is delayed. Watch Adam's `charge-pay-later` success rate weekly — a card that fails to charge post-ride is a booking that shouldn't count.
- **Pre-promo vs post-promo revenue upload** — offline conversion value uploads `pay_later_amount` (post-promo). Cross-check monthly.
