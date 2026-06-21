# TuranEliteLimo — Master QA Test Plan
> **Last updated:** Jun 20, 2026 (consolidates Feb 2026 + iter 36-44)
> **Where to test:** PREVIEW first (`https://limo-experience-1.preview.emergentagent.com`), then PRODUCTION (`https://turanelitelimo.com`)
> **Total time:** ~3 hours if you run everything · ~30 min for the P0 hot path

## 🔑 Credentials
- **Web Admin:** `support@turanelitelimo.com` / `TuronAdmin@2025` (2FA — 6-digit code arrives by email)
- **Mobile rider test:** create a new account with any unique email + 8+ char password
- **Mobile driver test:** `driver.test@turanelitelimo.com` / `DriverPass123!`
- **Stripe test card:** `4242 4242 4242 4242` · any future expiry (e.g., 12/30) · any CVC (e.g., 123) · ZIP 94102

## 📊 Priority key
- 🔴 **P0** = revenue-critical, test every release
- 🟡 **P1** = important, test for new features
- 🟢 **P2** = nice-to-have polish, test once per quarter

---

# ⚡ 30-MINUTE HOT PATH (if time is short, do ONLY these)

| # | What | Time | Priority |
|---|---|---|---|
| 1 | All landing pages load (smoke test) | 3 min | 🔴 |
| 2 | Stripe end-to-end booking (test card) | 10 min | 🔴 |
| 3 | UTM tracking + Attribution tab + Block-by-source | 10 min | 🔴 |
| 4 | Mobile app v1.1.1 launches + vehicle list no white halo | 5 min | 🔴 |
| 5 | Admin login + 2FA + main tabs open | 2 min | 🔴 |

If all 5 pass → ship it. If any fail → ping me with screenshot + which step.

---

# A. SMOKE TESTS (5 min) 🔴 P0

Run these FIRST. If any fail, stop and ping me.

| Test | Where | Expected |
|---|---|---|
| Homepage load | `/` | Hero + fleet + footer in <3s. No red errors in DevTools Console. |
| `/airport` | `/airport` | Eyebrow says "SFO · OAK · SJC". No white halo on vehicle images. |
| `/sjc-airport-transfer` | `/sjc-airport-transfer` | Eyebrow says "San Jose International (SJC)". H1 mentions San Jose Airport. |
| `/sfo-airport-transfer` | `/sfo-airport-transfer` | H1: "SFO Airport limo, meet & greet at the curb." |
| `/oak-airport-transfer` | `/oak-airport-transfer` | H1: "Oakland Airport limo, meet & greet at OAK baggage claim." |
| `/world-cup-2026` | `/world-cup-2026` | H1 mentions Levi's Stadium and World Cup 2026. |
| `/download` | `/download` | Both Apple App Store AND Google Play badges active (no "Coming Soon"). |
| Admin login | `/admin/login` | Login → 2FA email arrives → dashboard loads. |

---

# B. PUBLIC WEBSITE — Landing & Quote 🔴 P0

## B1. Homepage on desktop & mobile
- **Desktop:** Logo top-left, hero serif headline, gold promo banner, "Reserve" button top-right, no DevTools console errors
- **iPhone:** Smart App Banner at top → gold promo banner → navbar logo. None overlap; hero text not cut off

## B2. Each landing page has unique meta
- View source on `/wedding`, `/wine-tour`, `/corporate`, `/airport`, `/sjc-airport-transfer`, `/sfo-airport-transfer`, `/oak-airport-transfer`, `/world-cup-2026`, `/party-bus`
- Each `<title>` and `<meta name="description">` is unique and mentions the specific service/airport

## B3. Floating "Sage" Quote Widget on landing page 🟡 P1
- Bottom-right gold pill: "Get Quote · [N]" with chat icon
- Click → small dark panel slides up
- Type natural-language message — Sage replies within 5-10s
- Send "I want to talk to a human" → chat flags for admin takeover
- Admin → **Sage Chats** tab → red "🔴 Human needed" badge appears

## B4. Google Places autocomplete
- Pickup field, type "SFO" → predictions in <1s, "San Francisco International Airport" first
- Drop-off field, type "Napa" → predictions appear within 1s
- Selecting a prediction fills the input

## B5. Quote widget → booking form prefill
- Pick pickup + dropoff + future date → click "See Live Quote →"
- URL updates with pickup/dropoff/date query params, page scrolls to booking form, fields prefilled

## B6. Vehicle quote rendering
- Submit booking form for an airport transfer with flight # "UA123"
- Vehicle cards appear in 2-3s: Executive Sedan, First Class, Luxury SUV, Sprinter Van, Executive Sprinter, Jet Sprinter (call), Stretch Limo (call), Party Bus (call)
- Each priced vehicle shows flat rate; call-only vehicles show "Quote" + "Call" buttons

## B7. Fleet studio photos — all 6 vehicles render fully
- Each card shows full vehicle (no cropped bumper/wheels/roof)
- Resize browser 1920px → 1280px → 375px (or open on phone) — cars never get cropped tighter

## B8. Live Route Map on booking form 🟡 P1
- Enter pickup "San Francisco International Airport" + dropoff "Stanford University"
- Live map appears showing the route
- Distance + estimated duration displayed

---

# C. AIRPORT LANDING PAGES (URL-aware copy) 🔴 P0

## C1. `/sjc-airport-transfer` — SJC-specific content
- Page title contains "San Jose Airport Limo"
- Eyebrow: "San Jose International (SJC) · Silicon Valley"
- H1: "San Jose Airport limo, meet & greet at SJC baggage claim"
- Pillar #1: "Live SJC Flight Tracking"
- Routes: "SJC Airport → Apple Park", "SJC Airport → Stanford", "SJC Airport → Sand Hill Road"
- FAQ #1: "Where will my chauffeur meet me at SJC..."

## C2. `/sfo-airport-transfer` — SFO-specific content
- Page title: "SFO Airport Limo · San Francisco Airport Chauffeur"
- H1: "SFO Airport limo, meet & greet at the curb"
- Pillars mention SFO explicitly
- Routes: "SFO Airport → Downtown SF / Palo Alto / Napa"

## C3. `/oak-airport-transfer` — OAK-specific content
- Page title: "Oakland Airport Limo · OAK Chauffeur Service"
- H1: "Oakland Airport limo, meet & greet at OAK baggage claim"
- Routes: "OAK Airport → Berkeley / Downtown SF / Napa"

## C4. Default `/airport` — generic Bay Area
- Eyebrow: "SFO · OAK · SJC · Bay Area"
- Hero, pillars, routes mention all 3 airports

## C5. Web fleet shadow fix (NEW) 🟡 P1
- Open each of `/airport`, `/sjc-airport-transfer`, `/sfo-airport-transfer`, `/oak-airport-transfer`, `/world-cup-2026`
- Each vehicle photo has a smooth dark fade at the bottom — **NO white halo** under cars
- Gallery section also has the same dark fade

---

# D. AUTO-APPLY PROMO + STRIKE-THROUGH PRICING 🟡 P1

## D1. Promo banner shows on public site
- Open `/` in incognito
- Thin yellow bar at the top with active promo (e.g., "20% OFF — code WELCOME"). Dismissible

## D2. Strike-through pricing on qualifying quotes
- Get a quote that meets the promo's minimum
- Vehicle card shows: old price (~~$310.00~~) + new price (**$248.00**) + gold badge "Save $62 · WELCOME"

## D3. Selecting vehicle auto-fills promo input
- Click the strike-through card → Promo Code input pre-fills with WELCOME

## D4. Discount carries to Stripe checkout
- Continue to Stripe → checkout total is the discounted price

## D5. No double-apply
- Auto-applied promo chip visible · manual input field is **empty**
- Try typing the SAME code → error "Already applied" — no double discount

## D6. Manual promo overrides auto
- Type a different valid code → auto promo replaced (not stacked)

---

# E. STRIPE BOOKING (END-TO-END) 🔴 P0

## E1. Book Now redirects to Stripe in <2s
- Fill all booking fields → "Book Now → Pay" → Stripe Checkout opens (URL contains `checkout.stripe.com`)

## E2. Stripe payment with test card → /thank-you
- `4242 4242 4242 4242`, 12/30, 123, 94102 → Pay
- Redirected to `/thank-you?session_id=...`
- Confirmation page with checkmark, booking ID, "View My Booking" link
- DevTools → Network tab → see at least one `googleadservices.com/conversion` request fire

## E3. Booking confirmation email
- Inbox receives email from `noreply@turanelitelimo.com` in <60s
- Subject: "Your Booking is Confirmed — Booking #XXXXXX"
- Body has trip details + Manage Booking link

## E4. Manage-link works in incognito
- Open the Manage Booking link in a new incognito window
- Shows trip details, "Cancel" button (if outside 24h window), "Change date/time" option

## E5. Admin sees new booking
- Admin → Bookings → new row at top with yellow "unread" dot, status Confirmed, green Paid badge
- Click row → detail panel opens, unread dot disappears

## E6. Wait-time consent block on quote letter
- Open any `/quote/{token}` magic-link
- Consent text mentions "Stripe as the vault" + "only charged if those things happen"
- "Confirm & Pay" disabled until checkbox checked

## E7. Saved card on file
- Admin → Bookings → open a recent paid booking → scroll to bottom
- "Charge card on file" section with brand + last4
- Try a $0.50 test charge (reason: other, description: test)
- Success toast + customer receives itemized email receipt
- Try $0.30 → rejected "Charge too small (under $0.50 min)"

---

# F. QUOTE REQUEST FLOW (Call-Only Vehicles + Magic-Link) 🟡 P1

## F1. Submit quote request
- On a quote, find Party Bus card → click "Quote" → modal opens
- Fill Name, Email, Phone, Pickup, Drop-off, Date/Time, Passengers, Notes → Submit
- Green toast "Quote request sent!" · Customer receives confirmation email in <60s

## F2. Admin handles quote request
- Admin → Quote Requests → new row with status "New"
- Change status to "Quoted" → enter quoted price → customer receives email with magic link

## F3. Quote magic-link self-service
- Open `/quote/{token}` in incognito
- Page shows trip details + quoted price
- Consent checkbox visible above Pay button
- Check the box → button enables → click Pay → Stripe Checkout loads

## F4. Phone OTP gate (Twilio Verify) on high-value quotes
- Admin → Settings → Safety → "Require phone verification" ON, threshold $1
- Send yourself a quote letter (real phone) ≥ $1
- Magic link → consent → "Confirm & Pay" → **OTP gate appears** (not Stripe redirect)
- Click "Send verification code" → SMS arrives in <30s → enter code → Verify → Stripe loads
- **Cleanup:** set threshold back to $1000

---

# G. UTM TRACKING + ATTRIBUTION TAB (NEW) 🔴 P0

**Why it matters:** Closes the Google Ads attribution loop.

## G1. Capture UTM on first visit
- Open fresh **incognito**
- Visit: `?utm_source=google&utm_campaign=test_party_bus&gclid=test123abc`
- DevTools → Application → Local Storage → key `tel_utm_v1` exists
- Contains `utm_source:"google"`, `utm_campaign:"test_party_bus"`, `gclid:"test123abc"`, `source_bucket:"google_ads"`, `captured_at` timestamp

## G2. First-touch wins (no overwrite)
- Same tab → navigate to `?utm_source=yelp&utm_campaign=different`
- Re-check `tel_utm_v1` → still shows `utm_source:"google"` (Yelp does NOT overwrite)

## G3. UTM attaches to bookings
- Submit a test booking from the incognito tab (with Google UTM stored)
- Admin → Bookings → find your booking
- `utm` field shows `source_bucket: "google_ads"`

## G4. UTM attaches to quote requests
- New incognito → `?utm_source=yelp` → `/booking` → click "Request a quote" → submit
- Admin → Quote Requests → `utm` field shows `source_bucket: "yelp"`

## G5. Admin Attribution tab loads
- Admin → **Attribution** tab (between Sage Chats and Settings)
- Period selector: "Last 30 days"
- 4-KPI grid: Paid bookings · Total revenue · Created · Attribution rate
- Source table lists rows (likely "untracked" dominates until UTM data accumulates)
- Your test bookings should show as "Google Ads" / "Yelp" rows

## G6. Period selector works
- Switch to 7 / 30 / 90 days → numbers update
- Click refresh button → data reloads

## G7. Block-by-source toggle
- Find any non-protected source row → click red **Block** button
- Toast: "Blocked new bookings from yelp"
- Row gets red "BLOCKED" label · red banner appears at top
- Open new incognito → `?utm_source=yelp` → submit quote request → **HTTP 403** with polite "please call us directly" message
- Back in admin → click green **Unblock** → submission with `utm_source=yelp` works again (HTTP 200)
- Confirm "untracked" and "direct" show "protected" instead of Block button

---

# H. WEEKLY PERFORMANCE DIGEST (NEW) 🟡 P1

## H1. Preview the digest
- Admin → **Settings** → scroll to "Weekly performance digest" card
- Click **"Preview last 7 days"** → 4-card KPI grid loads · period range correct

## H2. Send digest email manually
- Click **"Send digest email now"** → toast "Digest sent to support@turanelitelimo.com"
- Inbox receives email in 1-2 min
- Subject: "Weekly Digest · [dates] · [N] bookings · $[N]"
- Body: gold-on-black design with KPIs, Google Ads attribution gap callout, source/vehicle/route breakdowns

## H3. Scheduled job
- Automatic email every Monday 9 AM Pacific (no manual test possible — just trust the schedule)

---

# I. SAFETY / ANTI-FRAUD 🟡 P1

## I1. Risk badges on Quote Requests
- Admin → Quote Requests → rows show green "✓ Clean" / yellow "⚠ Risk N" / red badges

## I2. Safety tab navigation
- Admin → **Safety** → 5 sub-tabs visible: Review queue / Blacklist / IP lookup / Pending OTPs / Quick risk check

## I3. Blacklist add/remove
- Safety → Blacklist → add `kind=email, value=scam@test-bad.com, reason=test`
- Submit a fake quote with that email from incognito → silent-accept on customer side
- Admin → Quote Requests → row has **red badge** + BLACKLIST flag
- Delete the test blacklist entry

## I4. IP Lookup
- Safety → IP lookup → enter `8.8.8.8` → returns Country: US, ISP: Google

## I5. Quick Risk Check
- Safety → Quick risk check
- Test 1: Phone `(415) 518-4873`, Name `Spencer Pahlke`, Amount `2050` → expect GREEN, score ~20
- Test 2: Phone `(555) 123-4567`, Email `junk@mailinator.com`, Name `X Y`, Amount `5000` → expect YELLOW/RED

## I6. Risk scoring on submission
- Submit fake quote: Name `Test123`, Email `whatever@mailinator.com`, fake phone
- Admin sees YELLOW/RED badge + 2-3 flag chips beneath

---

# J. AI LEAD IMPORT (Yelp / Phone / Off-Platform) 🟡 P1

## J1. Yelp lead — full parse
- Admin → Quote Requests → "Import lead" → Source: Yelp → paste:

  > Hamed R. — Party Bus, San Francisco 94103
  > Lead created 6/20/26 · Service date 2026-06-30
  > Hi, we are a party of 14 people that would like to get a limousine service for after a wedding ceremony and would like to book a service to hang around San Francisco for 2-3 hours.

- Click "Parse with AI" (waits ~3-5s)
- Verify extracted:
  - Passengers: **14**
  - Pickup date: **2026-06-30**
  - Vehicle: **Party Bus**
  - Occasion: **Wedding**
  - Notes preserved
  - Green "Clean" risk badge
  - Source tag chip: **[YELP]**

## J2. AI reply draft (Yelp tone — warm + emoji)
- Gold panel below extracted fields:
  - Warm acknowledgment
  - Asks 1-3 missing details (contact, time, exact venue)
  - Mentions "formal quote within 1-2 hours" + "refundable deposit holds the date"
  - Sign-off: "— Turan Elite Limo"
  - 1-2 emoji
- Click "Copy" → toast confirms → paste elsewhere to verify

## J3. Commit to Quote Requests
- Fill Name + Phone → "Create quote request" → modal closes
- New row at top of Quote Requests with all data + blue [YELP] source chip

## J4. Phone Call source — different tone
- Open Import Lead → Source: Phone Call → paste:

  > Lady called, wants a sedan for SFO pickup Tuesday 7am, drop in Mountain View. 2 passengers, name Lisa, no callback number left a voicemail.

- Reply draft is **shorter, more business** · **NO emoji** · asks for callback number · same brand sign-off

## J5. Source tag visibility
- Website-submitted quotes: NO source tag (default)
- Imported leads: blue chip ([YELP], [PHONE_CALL], etc.)

---

# K. REFER-A-FRIEND 🟢 P2

## K1. Customer A signs up + sees referral code
- `/customer/signup` → testA+ts@gmail.com, "Customer A", any phone
- After auto-login → `/refer` page shows code `REF-XXXXXX` + shareable URL `/r/REF-XXXXXX`
- Stats: "0 friends / 0 completed"

## K2. Customer B opens invite link
- Copy `/r/REF-XXXXXX` → open in new incognito
- Dedicated invite page: "[Customer A] invited you — Get $20 off"
- Click "Claim $20" → signup with different email → complete booking with WELCOME20

## K3. Customer A sees credit
- Switch back to Customer A → reload `/refer`
- Stats: "1 friend / 1 completed"
- Earned credits table: new row, code `THANKS-XXXXXX`, $25 Available
- Email "[Customer B] took their first ride — you earned $25"

## K4. Mobile deep-linking (requires app installed)
- Tap a referral link in Messages on a phone WITH app installed → app opens to gold "You're invited" screen
- Phone WITHOUT app → opens web invite page (no broken app store popup)
- Already-signed-in user → invite screen says "You're already signed in" with single "Book a Ride" button

---

# L. CUSTOMER AUTH + PROFILE 🟢 P2

## L1. Login / logout
- Log out Customer A → log back in → JWT re-issued in <1s

## L2. Notification preferences (regression — was 404)
- Profile → Notification Preferences → page loads with defaults (Push: rides ON, promo OFF · Email: rides ON, promo OFF, receipts ON)
- Toggle Email Promotions ON → Save → reload → still ON

## L3. Change password
- Profile → Change Password → old + new → Save → log out + log in with new password works

## L4. Forgot password
- Login → Forgot Password → enter email → "If exists, reset link sent" → email arrives <60s → reset link → new password → login works

## L5. Google sign-in (web)
- `/customer/login` → "Continue with Google" → OAuth popup → after auth, logged in with Google email

## L6. Apple sign-in (iOS app)
- TestFlight app → login screen → "Continue with Apple" → Face ID / Touch ID → app lands on Home tab

## L7. Google sign-in (iOS + Android apps)
- iOS: "Continue with Google" → account sheet → app lands on Home
- Android: native account picker → app lands on Home

---

# M. DRIVER DISPATCH 🟡 P1

## M1. Admin assigns driver
- Admin → Bookings → confirmed booking → "Assign Driver" → pick driver → Save
- Toast "Driver assigned. SMS sent."
- Driver receives SMS in <30s with dispatch URL

## M2. Dispatch URL works in incognito (token-based, no login)
- Copy SMS URL → open in incognito
- Shows trip overview + 3 status buttons (On the way / Arrived / Completed)
- Live Track toggle · Airport bookings also have "Flight Landed" button

## M3. Flight Landed timestamp (airport only)
- Tap "Flight Landed" → button turns gold "Landed at [time]"
- 45-min free-wait counter starts
- After 45 min → "Wait time fee: $X.XX" counter appears

## M4. Admin charges wait time
- Admin → Bookings → "Charge Wait Time" button (visible after grace exceeded) → confirm modal → Stripe charges saved card → success toast

---

# N. ADMIN DASHBOARD — ALL TABS 🟡 P1

## N1. 2FA login
- `/admin/login` → email + password → "Code sent" → 6-digit code email → enter → dashboard loads

## N2. Tab strip wraps without horizontal scroll
- All ~20 tabs visible at once (wrapping to 2-3 rows on smaller screens)
- NO horizontal scroll arrows

## N3. Unread badges
- Gold badge with count on **Bookings** (`is_read !== true && payment_status === "paid"`)
- Gold badge on **Inquiries** (`status === "new"` contacts)
- Gold badge on **Quote Requests** (`status === "new"`)
- Gold badge on **Sage Chats** (red dot if `needs_human` flag is true)
- Badges disappear after viewing

## N4. Bookings tab
- Paginated table · filters (All / Confirmed / Pending / Cancelled / Completed) · search · row → detail panel

## N5. Drivers tab
- "+ Add Driver" → fill form → Save → row appears · phone reformats to `(XXX) XXX-XXXX` · edit + delete work

## N6. Promos tab — both toggles persist
- Edit promo → toggle `auto_apply` OFF then ON → toggle `show_on_banner` OFF then ON → Save → refresh → both still in correct state

## N7. Announcements tab
- New announcement: title, body, active=true, type=banner → public homepage shows banner
- Set type=homepage → appears in "News" section instead

## N8. Push Broadcast tab
- Compose test push → eligible-count > 0 → "Send to me only" → phone (with app + notifications on) receives in <30s
- Admin "Sent History" updates

## N9. Email Broadcast tab
- Compose Promo → subject + HTML → "Preview" iframe → "Send to me" → email in <60s
- "Send to all" gated by confirmation modal

## N10. Surge Events tab
- Create surge event for tomorrow, multiplier 1.5x → tomorrow's quotes show 1.5x prices, today's unchanged

## N11. Zones / Pricing tab
- Edit per-mile rate for Executive Sedan $4.50 → $5.00 → Save → next quote returns higher total

## N12. Settings tab — Service Fee
- Change 10% → 12% → Save → next quote reflects higher fee

## N13. Invoices, Affiliates, Reviews tabs
- All load · existing flows (create invoice, suggest affiliate, view reviews) work as before

---

# O. MOBILE APP — ANDROID v1.1.1 🔴 P0

## O1. Install from Play Store Internal Testing
- Pre-req: you've promoted v1.1.1 (versionCode 27) to Internal Testing AND added yourself as a tester
- Open Play Store on your Android phone → search TuranEliteLimo OR open the tester link
- Install / update

## O2. App launches
- App opens without crashing
- Login screen has gold-accented design + 3 buttons: Apple (iOS only), Google, Email

## O3. Vehicle list — NO white shadow (the bug you reported)
- Navigate to Book → Vehicle selection screen
- **White halo under each vehicle is GONE** (was present on v1.1.0)
- Smooth dark gradient at the bottom of each vehicle image

## O4. End-to-end mobile booking
- Book tab → pickup + dropoff + date → select vehicle → tap "Book Now"
- Stripe Payment Sheet slides up natively (Apple Pay / Google Pay also offered)
- Confirm with test card → "Booking Confirmed" screen
- Booking appears in "Trips" tab
- Push notification arrives in <30s

## O5. Receive a push broadcast
- Admin → Push Broadcast → send test to "All" or your account
- Banner notification appears on lock screen in <30s
- Tap → app opens to news screen

## O6. Promote to Production
- Once verified in Internal Testing → Play Console → **Internal Testing → Promote release → Production**

---

# P. MOBILE APP — iOS v1.1.1 🔴 P0

## P1. Install via TestFlight
- Pre-req: iOS build `af1a7aa8-5ddc-40b7-a19e-15ee2a48812a` must be uploaded to TestFlight
- If not yet uploaded → from your phone browser: appstoreconnect.apple.com → TuranEliteLimo → TestFlight → check for build #50
- If not appearing → EAS build dashboard → Download .ipa → upload manually via App Store Connect (steps in `/app/memory/IOS_BUILD_FIX_v1.1.1.md`)

## P2. App launches + vehicle list shadow fix
- Open TestFlight build → login works
- Vehicle list: **white shadow GONE**, dark gradient instead

## P3. Booking flow
- Make a test booking with `4242 4242 4242 4242` → confirmation flow works

## P4. Apple sign-in
- "Continue with Apple" → Face ID / Touch ID → app lands on Home
- Profile shows Apple-provided email (may be `@privaterelay.appleid.com` if "Hide My Email" chosen)

---

# Q. MOBILE DRIVER APP 🟢 P2

## Q1. Driver login
- Open app → "I'm a driver" toggle → `driver.test@turanelitelimo.com` / `DriverPass123!`
- Driver home screen with assigned trips · location permission prompt (Always allow) · list refreshes

## Q2. Driver completes a trip
- Assigned trip → "On the way" → "Arrived" → "Completed"
- Each status updates in <2s
- Admin booking row reflects status live
- Customer's mobile app receives push at each status change
- After Completed → trip moves from active to History

---

# R. DEEP LINKS + APP DOWNLOAD PAGE 🟢 P2

## R1. App badges on `/download`
- Both Apple App Store AND Google Play badges active links (no "Coming Soon")
- Desktop: 2 QR codes side by side (iPhone + Android)
- Mobile (iOS): top banner "Tap to open in the App Store →"
- Mobile (Android): top banner "Tap to open in Google Play →"
- Both badges link to correct store listings

## R2. Footer badges on every page
- Footer at the bottom of every page also shows both badges as active links

---

# S. EMAIL & SMS NOTIFICATIONS 🟡 P1

## S1. Quote request → admin SMS
- Public quote request submitted → admin receives SMS in <1 min with summary + risk flag

## S2. Quote letter email
- Send quote letter → customer email arrives in <60s with magic link

## S3. Quote payment → confirmation
- Customer completes quote payment → both customer AND admin receive confirmation emails

## S4. Saved card charge → receipt
- Admin charges saved card → customer receives itemized email receipt

## S5. Booking confirmation email
- Stripe payment → customer email in <60s · Subject "Your Booking is Confirmed"

## S6. Abandoned-checkout recovery SMS (auto, 15-min wait)
- Start booking with real phone → reach Stripe checkout → close tab without paying
- Wait 15-20 min → SMS arrives at the booking phone: "Hi {name} — Turan Elite Limo. We saved your reservation..."

## S7. Pre-trip reminder (24h before)
- Cannot easily test on demand; trust the scheduler. Logs show `Pretrip reminder fired for booking X` 24h before each upcoming trip

---

# T. STRIPE RADAR + EXTRAS 🟢 P2

## T1. Radar rules
- Stripe Dashboard → Radar → Rules → all 7 rules show "Enabled" (green)

## T2. Returning customer test
- Make a $200 booking with a card you've used before → passes immediately (Allow rule #6)

---

# U. GOOGLE TRANSLATE CRASH FIX (regression) 🟢 P2

## U1. Android Chrome translate
- Open `https://turanelitelimo.com` on Android Chrome with system language Spanish
- Let Chrome auto-translate → page loads, scroll works, no "Something went wrong"

## U2. iOS Safari translate
- Safari menu → Translate to Spanish → page loads, all interactions work

---

# V. CLEANUP AFTER TESTING

- [ ] Delete all test bookings (filter by your test email)
- [ ] Delete all test blacklist entries
- [ ] Refund all test Stripe charges via Stripe Dashboard
- [ ] Reset Settings to production values (phone verify threshold $1000, service fee 10%, etc.)
- [ ] Unblock any sources you blocked during testing (Attribution → Unblock buttons)

---

# 📊 Section-by-section pass/fail tally

| Section | Tests | Pass | Fail | Notes |
|---|---|---|---|---|
| A. Smoke tests | 8 | / | / | |
| B. Public website | 8 | / | / | |
| C. Airport landings (NEW) | 5 | / | / | |
| D. Auto-apply promos | 6 | / | / | |
| E. Stripe booking | 7 | / | / | |
| F. Quote requests | 4 | / | / | |
| G. UTM + Attribution (NEW) | 7 | / | / | |
| H. Weekly digest (NEW) | 3 | / | / | |
| I. Safety / anti-fraud | 6 | / | / | |
| J. AI lead import | 5 | / | / | |
| K. Refer-a-friend | 4 | / | / | |
| L. Customer auth | 7 | / | / | |
| M. Driver dispatch | 4 | / | / | |
| N. Admin dashboard | 13 | / | / | |
| O. Mobile Android v1.1.1 | 6 | / | / | |
| P. Mobile iOS v1.1.1 | 4 | / | / | |
| Q. Driver mobile app | 2 | / | / | |
| R. Deep links / badges | 2 | / | / | |
| S. Emails / SMS | 7 | / | / | |
| T. Stripe Radar | 2 | / | / | |
| U. Translate regression | 2 | / | / | |
| **TOTAL** | **~115 tests** | | | |

---

# 🚨 If anything fails

Ping me with:
1. **Section letter + test number** (e.g., "G3 failed")
2. **What you actually saw** (screenshot if visual)
3. **Browser DevTools Console** errors if applicable

I'll triage and fix anything urgent before Monday.

---

# 🔥 KNOWN GOTCHAS / OPEN ITEMS

- iOS App Store submit step failed automatically (cert refresh). The .ipa is ready on EAS but needs manual TestFlight upload OR re-submit next session. See `/app/memory/IOS_BUILD_FIX_v1.1.1.md`.
- Android v1.1.1 is in Internal Testing track, not Production yet — must promote via Play Console UI.
- Some pre-existing Yelp reviews are hidden — those reappear gradually over weeks (not a code issue).
- Google Ads conversion tracking might still be broken on the server side (CAI investigating). Until fixed, the new Attribution tab is the source of truth for ad-channel performance.
- World Cup 2026 keywords kept active per the CAI strategy reply (June 11 – July 19, 2026 window).
