# TuranEliteLimo — Full Test Playbook (Recent Features, Feb 2026)

> Preview URL (test here first): `https://limo-experience-1.preview.emergentagent.com`
> Production (after redeployment): `https://turanelitelimo.com`
> Admin login: `support@turanelitelimo.com` / `TuronAdmin@2025` (2FA email OTP)

This covers **every feature shipped since the safety overhaul** through iter 39. Group by area. Each test = 30 sec to 3 min.

---

## 🔐 1. SAFETY & ANTI-FRAUD (Phase 1 + Phase 2 + IP Tracking)

### 1.1 — Risk badges on Quote Requests
**Do:** Admin → Quote Requests → look at the rows
**Look for:**
- ✅ Green chip "✓ Clean" on safe leads
- ✅ Yellow chip "⚠ Risk N" on suspicious leads
- ✅ Red chip on blacklisted leads
- ❌ FAIL if green never appears

### 1.2 — Safety tab landing
**Do:** Admin → Safety
**Look for:**
- ✅ Review queue, Quick risk check, Blacklist, IP lookup, Pending OTPs sub-tabs
- ✅ Review queue shows recent yellow/red/blacklisted items if any

### 1.3 — Blacklist add/remove
**Do:** Safety → Blacklist
- Add a test email like `scam@example.test` (kind=email, value=scam@example.test, reason="test")
- Then delete it
**Look for:**
- ✅ Added entry appears in table
- ✅ Delete removes it without page reload

### 1.4 — IP Lookup
**Do:** Safety → IP lookup → enter `8.8.8.8` → Run
**Look for:**
- ✅ Returns Country: US, ISP: Google, etc.

### 1.5 — Quick Risk Check (NEW iter 38)
**Do:** Safety → Quick risk check → enter Spencer's data:
- Phone: `(415) 518-4873`, Name: `Spencer Pahlke`, Amount: `2050`
- Click "Run risk check"

**Look for:**
- ✅ Result panel: score ~20, GREEN badge, "Proceed normally..." recommendation
- ✅ Bonus: try `junk@mailinator.com` with name `X Y` amount `5000` → yellow/red

### 1.6 — Twilio Verify OTP gate (real customer flow)
**Do:** Open `/quote/{some_token}` for any high-value pending quote in your inbox (>$1000)
**Look for:**
- ✅ Phone-verification OTP UI appears before "Confirm & pay" button
- ✅ OTP is sent via SMS from Twilio Verify

---

## 💳 2. SAVED CARDS / 1-TAP REBOOKING / OVERAGE CHARGES

### 2.1 — Deposit saves card off-session
**Do:** As a customer, complete a booking through `/booking` → pay deposit via Stripe
**Look for in admin:**
- ✅ Booking shows `stripe_payment_method_id` populated
- ✅ Booking details dialog shows "Card on file" with masked last4

### 2.2 — Admin charges saved card
**Do:** Admin → Bookings → open a booking with card on file → click "Charge card" → enter amount + reason (e.g., $50 for cleaning fee)
**Look for:**
- ✅ Confirmation modal with amount + last4
- ✅ Click Confirm → toast "Charged successfully"
- ✅ New charge appears in Stripe dashboard for that booking

### 2.3 — Wait-time consent on quote offer
**Do:** Open any `/quote/{token}` page
**Look for:**
- ✅ Stripe consent text: "...we may charge this card for wait-time / damages..."
- ✅ Customer must agree before paying

### 2.4 — Customer Abandoned-Checkout Recovery (NEW iter 38)
**Do:** This auto-fires from a 5-min scheduler. To manually verify:
1. Start a new booking on `/booking` with a real phone number you control
2. Get to Stripe checkout — DON'T complete payment, close the tab
3. Wait 15-20 minutes

**Look for:**
- ✅ You receive SMS at the booking phone: "Hi {name} — Turan Elite Limo. We saved your reservation..."
- ✅ Admin receives the existing stuck-checkout SMS
- ✅ Backend logs show "Payment-recovery SMS sent to customer for booking..."

---

## 🎟️ 3. PROMO DOUBLE-APPLY FIX

### 3.1 — Auto-applied promo doesn't double-stack
**Do:** Open `/booking` (or any quote that auto-applies a promo like `WELCOME20`)
**Look for:**
- ✅ Promo banner shows "WELCOME20 auto-applied — $X off"
- ✅ Manual promo input is **empty** (NOT pre-filled with "WELCOME20")
- ✅ If you try entering "WELCOME20" manually in the field → error toast / no double discount

### 3.2 — Manual promo overrides auto promo
**Do:** Type a different valid promo code → click Apply
**Look for:**
- ✅ Auto-applied promo gets replaced (not stacked)
- ✅ Total updates with only the manually-applied promo

---

## 🌐 4. LANDING PAGES (visual polish — iter 36-37)

Visit each of these on the preview URL and confirm they load cleanly with real imagery:

### 4.1 — `/wine-tour`
**Look for:**
- ✅ Hero image of vineyard / chauffeur scene
- ✅ Itinerary section with sample tour
- ✅ Featured wineries / venue carousel
- ✅ "Get Quote" CTA prominent

### 4.2 — `/wedding`
**Look for:**
- ✅ Wedding hero, multiple imagery sections
- ✅ Service packages listed
- ✅ Testimonials / venues

### 4.3 — `/corporate`
**Look for:**
- ✅ Business / executive imagery
- ✅ Service tiers (roadshow, airport transfer, IPO day)

### 4.4 — `/airport`
**Look for:**
- ✅ Airport-specific hero
- ✅ Flat-rate cards by airport (SFO, OAK, SJC)
- ✅ "Flight tracking included" callout

---

## 🛠 5. ADMIN UX (iter 38)

### 5.1 — Tab strip wraps without horizontal scroll
**Do:** Admin → look at the top tab strip (Bookings, Inquiries, Pricing, …, Account)
- Try shrinking the browser window to ~1024px (tablet width)

**Look for:**
- ✅ All ~19 tabs visible at once (wrapping to 2-3 rows)
- ✅ NO horizontal scroll arrow at the edges
- ❌ FAIL if any tab cut off

### 5.2 — Unread badges
**Do:** Look at the tab strip
**Look for:**
- ✅ Bookings shows gold badge with unread count (`b.is_read !== true && b.payment_status === "paid"`)
- ✅ Inquiries shows gold badge with count of `status === "new"` contacts
- ✅ Quote Requests shows gold badge with count of `status === "new"` quote requests
- ✅ Badge disappears when no new items

---

## 🌍 6. GOOGLE TRANSLATE CRASH FIX (iter 36)

**Do:** Open the site on an Android phone, enable Chrome's Google Translate (Settings → Languages → Translate this page → English to Spanish)
**Look for:**
- ✅ Page translates without React `Failed to execute 'removeChild'` crash
- ✅ No white-screen-of-death
- ✅ Toast / banner work normally after translation

This was previously a hard crash on Android mobile. Fixed via `translatePatch.js` patching DOM operations.

---

## 🧠 7. AI LEAD IMPORT + AUTO REPLY DRAFT (NEW iter 39)

### 7.1 — Parse Spencer's Yelp text
**Do:** Admin → Quote Requests → "Import lead" button (top-right, gold border)
1. Source = Yelp
2. Paste:
   *I need a bus for 17 people (8 adults, 9 kids aged 6 to 12) on June 27, 2026. It's a round trip. Pick up is at 1pm at Mayacama in Santa Rosa; destination is 4902 Redwood Road in Napa; departure from 4902 Redwood Road is at 4pm, with dropoff again at Mayacama.*
3. Click "Parse with AI" (waits ~3-5 sec)

**Look for:**
- ✅ Passengers: **17**
- ✅ Pickup date: **2026-06-27**
- ✅ Pickup time: **13:00**
- ✅ Pickup location contains **"Mayacama"**
- ✅ Dropoff contains **"4902 Redwood"**
- ✅ Notes mention **"8 adults, 9 kids"** + **"4pm return"**
- ✅ Green "Clean" risk badge
- ✅ Vehicle type: Party Bus / Mini-Coach
- ✅ Occasion: Family Event / Other

### 7.2 — AI reply draft (Yelp tone — warm + emoji)
**Look for in the gold panel below the extracted fields:**
- ✅ Opens with warm acknowledgment of the trip details
- ✅ Asks 1-3 missing details (e.g., name + contact method)
- ✅ Mentions "formal quote within 1-2 hours"
- ✅ Mentions "refundable deposit holds the date"
- ✅ Closes with "— Turan Elite Limo"
- ✅ 1-2 emoji (Yelp tone)
- ✅ **Click "Copy" button** → toast appears → paste elsewhere to confirm

### 7.3 — Commit to Quote Requests
**Do:** Fill in Name: `Spencer Pahlke`, Phone: `4155184873` → click "Create quote request"
**Look for:**
- ✅ Modal closes, toast "Lead imported into Quote Requests"
- ✅ New row at top of Quote Requests with:
  - Spencer Pahlke
  - Blue **[YELP]** source tag chip
  - Green "Clean" risk badge
  - Vehicle / occasion chips
  - All extracted fields populated

### 7.4 — Channel-aware tone (Phone Call source)
**Do:** Open Import Lead again → source = Phone Call → paste:
*Lady called, wants a sedan for SFO pickup Tuesday 7am, drop in Mountain View. 2 passengers, name Lisa, no callback number left a voicemail.*
**Look for:**
- ✅ Reply draft is **shorter, more business**
- ✅ **NO emoji** (Phone Call source = no emoji)
- ✅ Asks for callback number
- ✅ Same brand sign-off

### 7.5 — Source tag badges on existing rows
**Look for:**
- ✅ Website-submitted quotes: NO source tag (default)
- ✅ Imported leads: Blue source tag chip ([YELP], [PHONE_CALL], [GOOGLE_BUSINESS], etc.)

---

## 📱 8. MOBILE APP (deferred until next EAS build)

### 8.1 — Vehicle picker white-shadow fix (NEW iter 38, awaits rebuild)
**Status:** Code fix shipped via `expo-linear-gradient` overlay. To verify:
1. Trigger a new EAS build (`eas build --platform android` when ready)
2. Install on device
3. Open the app → Book a ride → vehicle picker screen

**Look for:**
- ✅ Car images blend smoothly into the dark card background at the bottom
- ✅ No white halo / shadow visible under each car
- ✅ Existing car images themselves are unchanged (no distortion)

### 8.2 — Mobile referral deep linking
**Do:** From the app, share a ride → tap the share link from outside the app
**Look for:**
- ✅ Opens the app (not browser) on iOS / Android
- ✅ Lands on the correct screen with referral code applied

---

## 🛒 9. END-TO-END SMOKE (do this last, ~10 min)

A complete customer journey, top to bottom:

1. Go to `https://limo-experience-1.preview.emergentagent.com/`
2. Click "Book Now" / Get a Quote
3. Fill in pickup + dropoff (real Bay Area addresses)
4. Select date, time, vehicle, passengers
5. **Look for:** dynamic price updates as you change fields
6. Apply a known promo code if you have one
7. Click "Continue to checkout"
8. Use Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC
9. Complete checkout
10. **Look for:** confirmation page with booking number
11. **Look for:** confirmation email at the address you entered
12. **In admin:** new booking shows up at top with payment_status=paid, all fields correct

---

# 📋 Quick Pass/Fail Checklist

```
SAFETY
[ ] 1.1 Risk badges visible (green/yellow/red)
[ ] 1.2 Safety tab loads with all 5 sub-tabs
[ ] 1.3 Blacklist add/remove works
[ ] 1.4 IP lookup returns geo data
[ ] 1.5 Quick Risk Check → Spencer green
[ ] 1.6 OTP gate on high-value quotes

PAYMENTS
[ ] 2.1 Card saves on deposit
[ ] 2.2 Admin can charge saved card
[ ] 2.3 Consent text on quote offer page
[ ] 2.4 Abandoned-checkout SMS fires (15-min wait)

PROMOS
[ ] 3.1 No double-apply
[ ] 3.2 Manual overrides auto

LANDING PAGES
[ ] 4.1 /wine-tour visually polished
[ ] 4.2 /wedding visually polished
[ ] 4.3 /corporate visually polished
[ ] 4.4 /airport visually polished

ADMIN UX
[ ] 5.1 Tab strip wraps, no horizontal scroll
[ ] 5.2 Gold badges on Bookings/Inquiries/QuoteRequests

GOOGLE TRANSLATE
[ ] 6.0 Android translate doesn't crash

AI LEAD IMPORT
[ ] 7.1 Spencer text → all fields extracted
[ ] 7.2 AI reply draft (Yelp tone) is solid
[ ] 7.3 Commit creates row with [YELP] tag
[ ] 7.4 Phone-call source → no emoji
[ ] 7.5 Existing website quotes have no source tag

MOBILE (deferred)
[ ] 8.1 White shadow gone (after EAS rebuild)
[ ] 8.2 Deep links work

E2E
[ ] 9.0 Full booking flow with Stripe test card
```

---

## 🚨 If anything fails

Hit me back with:
- Test number + a screenshot if visual
- Browser console errors (F12 → Console)
- For backend issues: I'll check `/var/log/supervisor/backend.err.log`

I'm working on the Live Route Map + AI Chat Assistant in parallel.
