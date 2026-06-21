# TuranEliteLimo — Weekend Test Plan
> Updated: Jun 20, 2026 · Run on https://turanelitelimo.com (production) OR the preview environment
> **Total time: ~90 minutes** if you do all sections. Skip any that aren't relevant to your priorities.

---

## 🟢 QUICK SMOKE TESTS (5 min) — Do these FIRST

If any of these fail, stop and ping me — they indicate something broke.

| # | Test | Where | Expected |
|---|---|---|---|
| Q1 | Load homepage | `/` | Hero, fleet, footer visible. No console errors. |
| Q2 | Load `/airport` | `/airport` | Eyebrow says "SFO · OAK · SJC". Fleet images have NO white halo. |
| Q3 | Load `/sjc-airport-transfer` | `/sjc-airport-transfer` | Eyebrow says "San Jose International (SJC) · Silicon Valley". H1 says "San Jose Airport limo". |
| Q4 | Load `/world-cup-2026` | `/world-cup-2026` | H1 mentions Levi's Stadium and World Cup 2026. |
| Q5 | Load `/download` | `/download` | Both iOS App Store AND Google Play badges visible (no "Coming Soon"). |
| Q6 | Admin login | `/admin/login` | Login works, 2FA email arrives, dashboard loads. |

---

## 1. 🛬 URL-AWARE AIRPORT LANDING PAGES (10 min)

**Why it matters:** Google Ads Quality Score on airport keywords. Each landing should mention its specific airport above the fold.

### Test SJC (`/sjc-airport-transfer`)
- [ ] Page title contains "San Jose Airport Limo"
- [ ] Hero eyebrow says "San Jose International (SJC) · Silicon Valley"
- [ ] H1 contains "San Jose Airport limo, meet & greet at SJC baggage claim"
- [ ] Pillar #1 reads "Live SJC Flight Tracking"
- [ ] Pillar #2 reads "Meet & Greet at SJC Baggage"
- [ ] Routes section shows "SJC Airport → Apple Park", "SJC Airport → Stanford", etc.
- [ ] FAQ #1 starts with "Where will my chauffeur meet me at SJC"
- [ ] Fleet images have a smooth dark fade at the bottom — no white halo

### Test SFO (`/sfo-airport-transfer`)
- [ ] Page title contains "SFO Airport Limo"
- [ ] H1 contains "SFO Airport limo, meet & greet at the curb"
- [ ] Pillars mention SFO explicitly
- [ ] Routes show "SFO Airport → Downtown SF / Palo Alto / Napa"
- [ ] FAQ mentions SFO international terminals

### Test OAK (`/oak-airport-transfer`)
- [ ] Page title contains "Oakland Airport Limo"
- [ ] H1 contains "Oakland Airport limo, meet & greet at OAK baggage claim"
- [ ] Routes show "OAK Airport → Berkeley / Downtown SF / Napa"

### Test default `/airport`
- [ ] Eyebrow says "SFO · OAK · SJC · Bay Area" (generic version)
- [ ] Hero pillars + routes mention all 3 airports

---

## 2. 🏟️ WORLD CUP 2026 PAGE (3 min)

- [ ] Visit `/world-cup-2026`
- [ ] Page title: "Levi's Stadium Limo · Bay Area World Cup 2026 Transportation"
- [ ] H1 mentions Levi's Stadium and World Cup 2026
- [ ] Fleet section: no white halo on vehicle images
- [ ] Gallery section: 5 square photos, smooth fade at bottom
- [ ] CTA banner at the bottom is visible and clickable

---

## 3. 🚐 WEB FLEET SHADOW FIX (5 min)

Walk through these pages and confirm vehicle photos blend into the dark background. If you spot a white halo on any image, screenshot it.

- [ ] `/` (homepage) — fleet section (you said you didn't see issues here, double-check)
- [ ] `/airport` — fleet section
- [ ] `/sjc-airport-transfer` — fleet section + gallery
- [ ] `/sfo-airport-transfer` — fleet section + gallery
- [ ] `/oak-airport-transfer` — fleet section + gallery
- [ ] `/world-cup-2026` — fleet section + gallery
- [ ] Any other landing page you remember having shadow issues

---

## 4. 📊 UTM TRACKING + ATTRIBUTION (15 min) — Hands-on test

**Why it matters:** This closes the Google Ads attribution loop CAI is debugging.

### Step A — Capture UTM on first visit
1. Open a fresh **incognito window**
2. Go to: `https://turanelitelimo.com/?utm_source=google&utm_campaign=test_party_bus&gclid=test123abc`
3. Open DevTools → Application → Local Storage → look for `tel_utm_v1`
   - [ ] Key exists
   - [ ] Value contains `"utm_source":"google"`, `"utm_campaign":"test_party_bus"`, `"gclid":"test123abc"`, `"source_bucket":"google_ads"`, and a `captured_at` timestamp

### Step B — Verify first-touch wins
1. In the SAME tab, navigate to: `https://turanelitelimo.com/?utm_source=yelp&utm_campaign=different_campaign`
2. Re-check `localStorage.tel_utm_v1`
   - [ ] STILL shows `"utm_source":"google"` (first-touch preserved, Yelp does NOT overwrite)

### Step C — Submit a booking & verify UTM is attached
1. Still in incognito (with the Google UTM stored), navigate to `/booking`
2. Fill out a test booking (use your own info — you can cancel after)
3. Submit
4. Open admin → **Bookings** tab → find your booking
5. (Need to inspect via database or admin booking detail)
   - [ ] Booking's `utm` field is populated with `source_bucket: "google_ads"`

### Step D — Submit a quote request & verify
1. New incognito tab → `https://turanelitelimo.com/?utm_source=yelp`
2. Go to `/booking`, click "Request a quote" instead of completing the booking
3. Submit a quote request
4. Open admin → **Quote Requests** tab → find your test request
   - [ ] UTM field stored with `source_bucket: "yelp"`

### Step E — Verify the Admin Attribution tab
1. Open admin → **Attribution** tab (between Sage Chats and Settings)
2. Select "Last 30 days"
   - [ ] Loads without error
   - [ ] Stats grid shows: Paid bookings, Total revenue, Created, Attribution rate
   - [ ] Source table lists rows (likely "untracked" dominates for now since UTM tracking is brand new)
   - [ ] If your test bookings above flowed through, you should see "Google Ads" and "Yelp" rows with `bookings_created: 1` each
3. Switch period dropdown to "Last 7 days" then "Last 90 days"
   - [ ] Numbers update appropriately
4. Click the refresh button (top right)
   - [ ] Data reloads

---

## 5. 🚫 BLOCK-BY-SOURCE FEATURE (10 min)

**Why it matters:** Pause traffic from a bad-quality channel without touching Google Ads / Yelp.

1. Admin → Attribution tab
2. Find any source row (e.g., "Yelp" or "Google Ads" — pick one that's NOT untracked/direct)
3. Click the red **"Block"** button on that row
   - [ ] Toast appears: "Blocked new bookings from yelp" (or whichever source)
   - [ ] Row gets a red "BLOCKED" label
   - [ ] A red banner appears at the top: "Active blocklist: New bookings are being rejected from \"yelp\""
4. Open a fresh incognito window: `https://turanelitelimo.com/?utm_source=yelp`
5. Try to submit a quote request
   - [ ] Get HTTP 403 with message "We're not currently accepting new bookings through this channel..."
6. Back in admin Attribution tab, click the green **"Unblock"** button
   - [ ] Toast: "Unblocked yelp"
   - [ ] Red banner disappears
7. Retry the quote-request submission with `utm_source=yelp`
   - [ ] Now succeeds (HTTP 200)
8. Verify you cannot block "untracked" or "direct"
   - [ ] Those rows show "protected" instead of a block button (they would kill all organic + bookmark traffic)

---

## 6. 📧 WEEKLY PERFORMANCE DIGEST (5 min)

1. Admin → **Settings** tab → scroll to bottom
2. You should see "Weekly performance digest" card
3. Click **"Preview last 7 days"**
   - [ ] Loads a 4-card KPI grid (Bookings, Paid, Revenue, Quote-to-win rate)
   - [ ] Period range shown is correct
4. Click **"Send digest email now"**
   - [ ] Toast: "Digest sent to support@turanelitelimo.com"
   - [ ] Check the support@turanelitelimo.com inbox in 1-2 min
   - [ ] Email arrives with subject "Weekly Digest · [dates] · [N] bookings · $[N]"
   - [ ] Email body: gold-on-black design, headline KPIs, Google Ads attribution callout, source/vehicle/route breakdowns

---

## 7. 💬 SAGE AI CHAT WIDGET (5 min)

1. Open `/` in a fresh tab (any public page)
2. Bottom-right corner: gold floating chat button labeled "Get Quote · [N]"
3. Click it
4. Send a message: *"How much for a Party Bus from SF to Napa for 14 people, 5 hours?"*
   - [ ] Sage responds within 5-10 sec with a relevant answer (price range, ask for date, etc.)
5. Send: *"I want to talk to a human"*
   - [ ] Sage responds politely and flags the chat for human takeover
6. Open admin → **Sage Chats** tab
   - [ ] Your chat appears in the list with a red "🔴 Human needed" badge
7. Click into the chat
   - [ ] You can see the full conversation
   - [ ] You can type a reply as admin — customer sees it in real-time

---

## 8. 📥 IMPORT LEAD (Yelp / Phone) (5 min)

1. Admin → **Quote Requests** tab
2. Click **"Import lead"** button (top right)
3. Paste a Yelp-style lead like this:
   ```
   Hamed R. — Party Bus, San Francisco 94103
   Lead created 6/20/26
   Service date 2026-06-30
   Hi, we are a party of 14 people that would like to get a limousine
   service for after a wedding ceremony and would like to book a
   service to hang around San Francisco for 2-3 hours.
   ```
4. Click **"Import"**
   - [ ] AI parses and creates a Quote Request with name "Hamed R.", vehicle "Party Bus", date 2026-06-30, passengers 14, notes preserved
   - [ ] Risk band shown (likely CLEAN)
   - [ ] Source shows "off_platform" or "yelp"

---

## 9. 🛡️ SAFETY / RISK SCORING (5 min)

1. Admin → **Safety** tab
2. Scroll to "Quick Risk Check" tool
3. Enter a test phone like `+1 415 555 1234` and email `test@example.com`, IP `8.8.8.8`
4. Click **"Score"**
   - [ ] Returns a risk band (GREEN/YELLOW/RED) + reasoning
5. Try an obviously bad combo: phone `+1 555 123 4567` and email `test@mailinator.com`
   - [ ] Risk should be elevated (YELLOW or RED)

---

## 10. 🗺️ LIVE ROUTE MAP ON BOOKING FORM (3 min)

1. Open `/booking` in a new tab
2. Fill in:
   - Pickup: "San Francisco International Airport"
   - Dropoff: "Stanford University"
3. As you type, Google Maps autocomplete should suggest addresses
4. After both are filled:
   - [ ] A live route map appears showing the path between the two points
   - [ ] Distance + estimated duration is displayed

---

## 11. 📱 MOBILE APP — ANDROID v1.1.1 (Play Console Internal — 10 min)

**Pre-req:** You should have received a Play Console invite for the Internal Testing track. If you don't see the v1.1.1 build (versionCode 27) yet, ping me.

1. Open Play Store app on your Android phone
2. Navigate to your test account's internal testing link (Play Console → Internal Testing → Tester link)
3. Install / update TuranEliteLimo
4. Open the app
   - [ ] App launches without crashing
   - [ ] Login / signup works
5. Navigate to the vehicle selection screen
   - [ ] **White shadow under each vehicle is GONE** (this was the bug you reported)
   - [ ] Vehicle cards have a smooth dark gradient at the bottom of the image
6. Try to make a test booking
   - [ ] Booking flow completes (test card 4242 4242 4242 4242)

⚠️ **Promote to Production:** Once verified in Internal Testing, go to Play Console → **Internal Testing → Promote release → Production** to push to all Android users.

---

## 12. 📱 MOBILE APP — iOS v1.1.1 (TestFlight — 10 min)

**Pre-req:** iOS build `af1a7aa8-5ddc-40b7-a19e-15ee2a48812a` finished on EAS — needs to be in TestFlight. May require a manual TestFlight upload from your phone (see `/app/memory/IOS_BUILD_FIX_v1.1.1.md`).

1. Open TestFlight app on your iPhone
2. Look for TuranEliteLimo v1.1.1 build 50
3. Install / update
4. Open the app
   - [ ] App launches
   - [ ] Login works
   - [ ] Vehicle list: **white shadow GONE**, dark gradient instead
   - [ ] Make a test booking → confirm flow

---

## 13. 🔗 DEEP LINKS + APP BADGES (3 min)

1. From your phone (mobile browser), visit `https://turanelitelimo.com/download`
2. At the top of the page you should see a banner:
   - [ ] iPhone: "Tap to open in the App Store →"
   - [ ] Android: "Tap to open in Google Play →"
3. Click both App Store and Google Play badges below
   - [ ] App Store badge opens the App Store listing
   - [ ] Play Store badge opens the Play Store listing (NOT "Coming Soon" anymore)

---

## 14. 💳 STRIPE BOOKING FLOW (10 min) — End-to-end revenue test

**Critical:** This is the actual money-maker. Make sure it works.

1. Open `/booking` in fresh incognito
2. Add UTM: `?utm_source=test_weekend_qa`
3. Fill out a full booking with test card **4242 4242 4242 4242**, exp 12/30, CVV any 3 digits
4. Submit
   - [ ] Stripe Checkout page loads
   - [ ] Payment processes
   - [ ] Redirected to confirmation page
   - [ ] Confirmation email received
5. Admin → Bookings → find the booking
   - [ ] Status: "Paid" or "Confirmed"
   - [ ] UTM field: `source_bucket: "test_weekend_qa"` or similar
6. Admin → Attribution → "Last 7 days"
   - [ ] Your test booking appears under the `test_weekend_qa` source (or "untracked" if UTM didn't flow — would indicate a bug)

---

## 15. 📞 SMS + EMAIL OTP (Twilio + Resend) (5 min)

1. On `/booking`, when you submit a booking the system asks for SMS OTP
   - [ ] SMS arrives within 30 sec
   - [ ] Code accepts and proceeds
2. After booking, you should receive:
   - [ ] Booking confirmation email
   - [ ] Pre-trip reminder email (24 hours before — may not test this weekend)

---

## 16. 🛠️ ADMIN BADGE COUNTS + UNREAD INDICATORS (3 min)

1. Admin dashboard top bar — tab list should be wrapped (no horizontal scroll), 2 rows on smaller screens
2. **Inquiries**, **Quote Requests**, **Sage Chats** tabs should show a count badge if there are unread items
   - [ ] Counts are accurate
   - [ ] Badges disappear after you view the tab

---

## 🔥 KNOWN ISSUES / GOTCHAS

- iOS App Store submit step failed automatically (likely cert refresh). The .ipa is ready on EAS but needs manual TestFlight upload OR re-submit next session.
- Android v1.1.1 is in Internal Testing track (not Production yet) — you need to promote it via Play Console UI before all Android users get it.
- Conversion tracking on Google Ads may still be broken on the server side (CAI working on this). Until fixed, your "0 conversions" in Google Ads will keep showing — the new UTM tracking in our Attribution tab is the source of truth.
- Some pre-existing Yelp reviews are still hidden — those reappear gradually over weeks. Not a code issue.

---

## ✅ Report back

When done, ping me with:
1. **What passed** ✅
2. **What failed** ❌ + screenshot if visual
3. **What was confusing** 🤔 — even if it "worked"

I'll triage and fix anything failing before the weekend is over.
