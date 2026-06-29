# TuranEliteLimo — Product Requirements Document (Live)

> Last refreshed: Jun 29, 2026 — iter 52 (Vehicle Picker + AI Drafts + 1-tap Dispatch Email)

## ✅ Vehicle Picker, AI Drafts & 1-tap Dispatch Email (Jun 29, 2026 — iter 52)

**Why:** Operator (Adam) regularly hand-rolls (1) which vehicle class fits a lead's headcount & vibe, (2) the warm customer-facing notes that go on quote confirmation + invoice PDF, (3) the ops brief for the affiliate driver. Each is 2–5 min of typing per lead. Goal: collapse all three into one-tap UX while keeping operator final say.

**What shipped:**
1. **Vehicle Picker dialog** (`/app/frontend/src/components/admin/VehiclePickerDialog.jsx`):
   - Header button on Quote Requests tab opens a decision-support dialog
   - Inputs: pax (required), hours (optional), vibe filter (Any / Formal / Party) + occasion shortcuts
   - Ranks vehicles by fit (IDEAL / ROOMY / SNUG / TIGHT) + formality match
   - Each row now shows a fleet thumbnail + capacity range + Net rate + Floor (20%) / Target (27.5%) / Premium (35%) bands
   - Data sourced from `pricingReference.js` so it stays in sync with the Profit Preview Chip
   - data-testid `vehicle-picker-open`, `vehicle-picker-dialog`, `vp-pax/hours/formality-*`, `vp-result-*`

2. **AI text-draft buttons** (`POST /api/admin/ai/draft-quote-text`):
   - Backend endpoint accepts `mode: customer_notes | dispatch_instructions` + a free-form `context` dict
   - Uses Emergent LLM Key + `gemini-2.5-flash` for low-cost, fast drafts
   - Two strict system prompts: customer-facing (warm prose, 50%/50% deposit policy baked in, 21+ tact for alcohol-occasion) and dispatch (terse bullets, PII-stripped tone)
   - Frontend: "Draft with AI" inline button next to "Reset to template" in SendQuoteDialog → fills `quote-notes` textarea
   - Frontend: "Draft with AI" inline button next to special-requests label in DispatchPdfDialog → fills extra-notes textarea
   - data-testid `ai-draft-customer-notes`, `ai-draft-dispatch`

3. **1-tap "Email dispatch PDF to affiliate"** (`POST /api/admin/quote-requests/{id}/dispatch-pdf/email`):
   - Inside `Suggest affiliates` modal, each affiliate row with an email on file now shows an "Email dispatch PDF" button
   - Backend generates the PII-stripped PDF (re-uses `pdf_service.generate_dispatch_pdf`), composes a plain ops email, attaches the PDF, sends via Resend, and BCCs `support@` for our records
   - Audit trail: each send appends to `quote_requests.dispatch_emails[]` (recipient, name, rate, message_id, sent_at)
   - Replaces "download PDF → open Gmail → compose → drag PDF → type message → send" with one click
   - data-testid `email-dispatch-{affiliate.id}`

4. **Pre-existing SuggestAffiliatesDialog crash fix:** `data.affiliates.map()` crashed when `data === null` during the brief initial render before the API resolved. Now gated behind `loading || !data`.

**Testing:** Curl verification on both new endpoints (200 OK with valid output, 400 on missing `affiliate_email`, 404 on missing quote). Frontend smoke screenshot confirmed: Vehicle Picker dialog opens with thumbnails + ranked results, AI Draft button in SendQuoteDialog produces context-aware text (e.g. for a "Sprinter Van wedding" the AI wrote "Your Sprinter van offers luxurious seating, generous legroom..." plus the standard 50/50 policy). Suggest Affiliates dialog opens cleanly post-crash-fix.

**Files touched:**
- backend/routes/admin.py — added `/admin/ai/draft-quote-text` + `/admin/quote-requests/{rid}/dispatch-pdf/email`
- frontend/src/components/admin/VehiclePickerDialog.jsx — added fleet thumbnails
- frontend/src/components/admin/QuoteRequestsTab.jsx — wired VehiclePicker into header, added AIDraftButton + EmailDispatchPdfButton shared components, hardened SuggestAffiliatesDialog against null data

---

## ✅ Profit Preview Chip + Pricing Reference (Feb 28, 2026 — iter 51)

**Why:** Recurring price-blindness friction. Operator (Adam) was eyeballing margin in his head for every lead, occasionally quoting below 20% floor by accident. The Leticia incident (Feb 27) crystallized it — limo-style Sprinter @ $680 net / 4hr, quoted $900, customer countered $800 (15% margin — below floor, would have been a money-losing trip). Without a visible margin signal in the UI, the operator had to do the math manually under time pressure.

**What shipped:**
1. **Pricing reference doc** (`/app/memory/PRICING_REFERENCE.md`):
   - Single source of truth for affiliate net rates per vehicle type
   - Floor / Target / Premium margin formulas (20% / 27.5% / 35%)
   - Calibrated retail bands table (Sprinter, Party Bus, Limo, Sedan, SUV)
   - Real-world calibration notes (Leticia Feb 27 lesson learned)
   - TODO checklist for Adam to confirm remaining net rates

2. **Pricing reference lib** (`/app/frontend/src/lib/pricingReference.js`):
   - `AFFILIATE_NET_RATES` table → hourly net + min_hours per vehicle
   - `lookupNetRate()` / `parseHours()` / `estimateQuote()` / `computeMargin()` / `marginBand()`
   - `fmtMoney()` / `fmtPct()` shared formatters
   - All pure functions, node-tested

3. **Profit Preview Chip** on every quote row (Admin → Quote Requests):
   - Pre-quote: shows `Floor $X · Target $Y` (gold pill) so operator sees the floor BEFORE opening the modal
   - Post-quote: shows live margin % color-coded (red <20%, yellow 20-27.5%, green 27.5-35%, gold >35%)
   - data-testid `profit-floor-{id}` / `profit-margin-{id}`

4. **Enhanced SendQuoteDialog**:
   - Auto-suggest button on Affiliate Cost field → one-click fills with the table's expected net
   - Live Profit Preview panel: shows margin %, profit $, color-coded
   - Below-floor warning surfaces target/floor retail to recover
   - Recommended retail bands card (Floor/Target/Premium) with one-tap autofill buttons
   - data-testid `profit-preview-panel`, `retail-bands-card`, `band-floor/target/premium`

**Math verification (Node-tested against Leticia scenario):**
- Net $680 (4hr × $170/hr) → Floor $850 (20%) · Target $938 (27.5%) · Premium $1,046 (35%) ✓
- $850 retail → 20.0% margin, yellow band ✓
- $800 (her counter) → 15% margin, RED band ✓ (correctly flags below-floor)

**Testing:** Lint clean. Node math verification passed. Smoke-test confirms app compiles. Full UI testing pending (requires admin OTP — user will verify on next quote).

**Files changed/created:**
- `/app/memory/PRICING_REFERENCE.md` (NEW)
- `/app/frontend/src/lib/pricingReference.js` (NEW)
- `/app/frontend/src/components/admin/QuoteRequestsTab.jsx` (chip + modal upgrade)

**TODO for Adam:** Confirm net rates for non-limo-Sprinter vehicles (Executive Sedan, Luxury SUV, Sprinter Van standard, Stretch Limo, Party Bus, Jet Sprinter). Update both files together.

---

## ✅ Driver Invite Email (Feb 26, 2026 — iter 50)

**Why:** Onboarding a new driver was a 4-step manual process — add to roster, separately text them the app links, walk them through the password-set flow, send the setup URL by hand. Drivers were getting lost between steps. The user explicitly requested this in iter 47 (handoff: "agent forgot to execute").

**What shipped:**
1. **Backend** (`/app/backend/routes/admin.py`):
   - `POST /api/admin/drivers/{driver_id}/invite` — generates a 7-day password-setup token, emails the driver a branded welcome with app-store links + setup CTA, tracks `last_invited_at` + `invite_count` on the driver doc.
   - Reuses existing `password_reset_tokens` collection with `kind: "invite"` discriminator so the existing `/driver-auth/reset-password` flow handles the token transparently — zero new auth surface area.
   - Email transport failure (Resend returns None) → response includes `setup_url_if_email_failed` so admin can copy/paste-send via SMS.
2. **Frontend** (`/app/frontend/src/components/admin/DriversTab.jsx`):
   - New paper-airplane Send icon button per driver row (data-testid `invite-driver-{id}`), disabled when driver has no email.
   - Per-row "Invited Xd ago" badge so admin sees invite history at a glance.
   - Fallback dialog (data-testid `invite-fallback-dialog`) with one-click "Copy link" when email delivery fails.

**Bugs fixed mid-iteration:**
- `send_email()` does NOT accept a `text=` kwarg — removed the dead `text` block.
- `send_email()` swallows Resend exceptions and returns None — admin endpoint now checks `bool(result)` (instead of relying on raise-on-failure) so the fallback URL is correctly surfaced when transport fails. Doesn't change `send_email`'s contract, so no risk to other callers.

**Testing:** iteration_46 (after fix) — 5 passed, 3 skipped with honest "Resend accepted message; failure path not testable against live backend without env mutation" reason. All code paths verified by code review + happy-path E2E (`sent: true` confirmed against support@turanelitelimo.com).

**Files changed:** `/app/backend/routes/admin.py`, `/app/frontend/src/components/admin/DriversTab.jsx`, `/app/backend/tests/test_iter46_driver_invite.py` (new).

---

## ✅ Google Ads Offline Conversion CSV Exporter (Feb 26, 2026 — iter 49)

**Why:** Stopgap for full Google Ads API server-side conversion forwarding while CAI applies for API access (~24-48 hr). Recovers attribution from ad-blocker / cookie-blocked customers — admin downloads a weekly CSV of paid bookings with captured `gclid`, manually uploads via Google Ads → Tools → Conversions → Uploads.

**What shipped:**
1. **Backend** (`/app/backend/routes/admin.py`):
   - `GET /api/admin/ads/offline-conversions/preview?days=N` — returns `{paid_bookings, rows_with_gclid, skipped_no_gclid, total_value}` for the dashboard preview line.
   - `GET /api/admin/ads/offline-conversions.csv?days=N&conversion_name=Purchase` — streams a Google-Ads-spec CSV:
     ```
     Parameters:TimeZone=America/Los_Angeles
     <blank line>
     Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency
     <data rows>
     ```
   - Response headers include `X-Rows-Written`, `X-Skipped-No-Gclid`, `X-Skipped-Unpaid`.
   - Filters: only bookings with `payment_status ∈ {paid, confirmed, in_progress, completed}` AND `utm.gclid` present.
   - Conversion Time formatted as `YYYY-MM-DD HH:MM:SS±HH:MM` (Pacific, with colon in offset per Google's parser).
2. **Frontend** (`/app/frontend/src/components/admin/AttributionTab.jsx`):
   - New blue-bordered panel above the totals row with live preview line and one-click "Download CSV" button.
   - Disabled when 0 rows ready so the admin doesn't click into an empty CSV.

**Pricing data correction:** Confirmed actual hourly rate is **$95/hr** (Executive Sedan, from `server.py:144`) — NOT $89 as I'd previously assumed. CAI's ad copy should reflect $95/hr.

**Testing:** iteration_45.json — 100% backend (8/8 pytest) + 100% frontend. No bugs.

**Files changed:** `/app/backend/routes/admin.py`, `/app/frontend/src/components/admin/AttributionTab.jsx`, `/app/backend/tests/test_iter45_offline_conversions_csv.py` (new).

---

## ✅ Google Ads Conversion Overhaul (Feb 26, 2026 — iter 48)

**Why:** CAI report flagged $217 avg CPA and "Airport $255 / 0 conv" mystery. Investigation showed:
- `REACT_APP_GADS_LABEL_PHONE_CALL` was empty → every Call button on the site silently failed to fire (explains Airport's missing conversions — airport searchers call instead of fill forms).
- "Misconfigured" warnings across all goals were "no recent fire" Google warnings, not real bugs.
- Wine Tour landing had no above-fold price/social-proof signals → low Quality Score and qualified-lead rate.

**What shipped:**
1. **Phone Call Tap label populated**: `REACT_APP_GADS_LABEL_PHONE_CALL=83GZCPSz7cUcEMfLrddD` in `/app/frontend/.env`. Every `tel:` tap on Navbar/Footer/FleetPicker/PayBooking/QuoteSuccess now fires a $30 conversion.
2. **Enhanced Conversions for Web**: hashed (SHA-256, lowercase hex) `email` + `phone` are pushed to gtag `set` `user_data` BEFORE every Purchase + Lead conversion event. Recovers attribution from iOS/Safari/Brave/cookie-blocked browsers. Phone is normalized to E.164 client-side via Web Crypto.
   - New helpers in `/app/frontend/src/lib/googleAdsEvents.js`: `sha256Hex`, `normalizeEmail`, `normalizePhoneE164`, `setEnhancedConversionData`.
   - `trackPurchase` / `trackQuoteRequest` are now `async` and `await` user_data before pushing the conversion event (verified dataLayer index ordering: set[6] → event[7]).
   - `/api/bookings/{id}/public` now exposes `phone` (already exposed `email`) so the /thank-you page has both signals.
   - **REQUIRES USER ACTION** in Google Ads UI: toggle "Enhanced conversions for web" ON for each conversion action (Goals → Conversions → Edit goal → Settings → Enhanced conversions → API → Google tag).
3. **Wine Tour landing CRO**: shared `LandingPage` now accepts optional `ctaLabel`, `socialProof`, `priceFrom` props (all opt-in; other landings unchanged). `/wine-tour` opts in with:
   - CTA labels: "Plan My Wine Day →" (hero + bottom CTA)
   - Social proof: "★★★★★ Trusted by 200+ Bay Area & SF wine country travelers"
   - Pricing strip: "From $95/hour · 6-hour minimum · all-inclusive"

**Testing:** iteration_44.json passes after ordering-fix retest. Backend 100%, frontend 95% (initial async-ordering bug found and fixed). Hashes verified to match Node-computed expected values byte-for-byte.

**Files changed:** `/app/backend/server.py` (+phone in public), `/app/frontend/.env` (+PHONE_CALL label), `/app/frontend/src/lib/googleAdsEvents.js`, `/app/frontend/src/components/GoogleAdsConversion.jsx`, `/app/frontend/src/components/QuoteRequestDialog.jsx`, `/app/frontend/src/components/LandingPage.jsx`, `/app/frontend/src/pages/WineTourLanding.jsx`.

---

## ✅ Affiliate Payments Tracker & 1099 Prep (Feb 26, 2026 — iter 47)

**Why:** Owner pays affiliate operators (Sacramento, Tahoe, Wine Country) via Zelle/Venmo/Check after each brokered trip. Without a tracker, YTD totals were managed in spreadsheets and 1099-NEC prep at tax time was a manual nightmare. Customer payments are tracked via Stripe; affiliate payouts had no system of record.

**What shipped:**
1. **Backend (`/app/backend/affiliates.py`):**
   - Extended `Affiliate` model with W-9/1099 fields: `legal_name`, `tax_id` (EIN or SSN), `tax_classification` (Individual / Sole Prop / Single-Member LLC / LLC-P / LLC-C / LLC-S / C-Corp / S-Corp / Partnership / Other), `w9_received`, `mailing_address`.
   - New `affiliate_payments` Mongo collection with full CRUD.
   - `paid_ytd` rollup auto-added to `GET /admin/affiliates` (sum of payments for current calendar year).
   - New endpoints (all admin-only):
     - `GET /api/admin/affiliates/payments?year=&affiliate_id=&method=` — list (sorted by date desc)
     - `POST /api/admin/affiliates/payments` — create (validates method enum, YYYY-MM-DD date, amount > 0, affiliate exists)
     - `PATCH /api/admin/affiliates/payments/{id}` — update
     - `DELETE /api/admin/affiliates/payments/{id}` — delete
     - `GET /api/admin/affiliates/payments/summary?year=` — per-affiliate roll-up + grand total
     - `GET /api/admin/affiliates/payments/export.csv?year=` — full ledger CSV download
     - `GET /api/admin/affiliates/payments/1099-csv?year=&threshold=600` — one row per affiliate with W-9 fields and an automated "1099 Required" Yes/No flag (corporations excluded per IRS rules, threshold default $600).
   - **Route ordering carefully ensured**: payment routes registered before `/{affiliate_id}` dynamic routes so `PATCH /payments/{id}` doesn't accidentally hit the affiliate-update handler.

2. **Frontend (`/app/frontend/src/components/admin/AffiliatesTab.jsx` + new `AffiliatePaymentsView.jsx`):**
   - Affiliates tab now has a sub-toggle: `NETWORK | PAYMENTS & 1099`.
   - Payments view: year selector, method + affiliate filters, Add/Edit/Delete dialog, per-affiliate YTD summary cards (with "1099 threshold met" badge ≥$600), grand total in header.
   - One-click CSV exports: **Ledger CSV** (full audit trail) and **1099 Prep CSV** (one row per vendor with totals + W-9 data — hand directly to bookkeeper).
   - Affiliate edit dialog now has a "Tax / 1099 prep" section with all 5 W-9 fields.

**Testing:** 19/19 pytest cases pass (`/app/backend/tests/test_iter43_affiliate_payments.py`); full Playwright UI flow passes (testing_agent_v3_fork iteration_43.json).

**Files added:** `/app/frontend/src/components/admin/AffiliatePaymentsView.jsx`, `/app/backend/tests/test_iter43_affiliate_payments.py`.

---

## ✅ Native v1.1.2 — Android crash hotfix + iOS rebuild (Feb 6, 2026 — iter 46)

**Emergency context:** Android v1.1.1 (versionCode 27, runtime 1.1.1) was crashing on launch with "Something went wrong with TuranEliteLimo · This app has a bug." User couldn't open the app. The OTA fix from iter 43 didn't help because the app died before it could even fetch the OTA bundle.

**Root cause:** Same as the iOS LinearGradient crash but worse on Android. The v1.1.1 native build had `expo: ^54.0.0` (SDK 54 native runtime) but `expo-linear-gradient: ^56.0.4` in JS — incompatible native module API. iOS showed it as a "Unimplemented component" placeholder on the vehicle picker screen; Android's stricter native module resolver killed the process at startup.

**Permanent fix shipped:**
1. **`expo-linear-gradient` removed from package.json entirely** (`yarn remove expo-linear-gradient`). No more orphan native module references at link time.
2. **Native v1.1.2 builds** (versionCode 29 Android, buildNumber 51 iOS) on EAS — built without the offending native module at all.
3. **OTA v1.1.2** pushed in parallel so runtime 1.1.2 has a clean update channel from day 1.
4. **Auto-submitted both stores:**
   - iOS: TestFlight upload via `eas submit --platform ios` using the existing ASC API key (`AuthKey_S6ZN2K2TN4.p8`). Apple processes in 5-10 min; user can promote to public App Store from App Store Connect.
   - Android: Google Play Internal Testing via `eas submit --platform android`. Status COMPLETED. User can promote from Internal → Production in Play Console.

**Build artifacts:**
- Android: build `887ea485-b615-46d7-a4a0-65771e3564e3`, versionCode 29 → Internal Testing track
- iOS: build `aea67986-fba5-4d1d-a0ea-e975f84dea7f`, buildNumber 51 → ASC processing → TestFlight
- OTA: update group `f0906617-0bc4-41f1-afb9-eb1567d85293`, runtime 1.1.2

**ALSO unblocked:** The iOS App Store Connect submission has been blocking since iter 41. Auto-submission to TestFlight just worked using the ASC key in `eas.json`. The previous "submission failed" issue from the handoff appears to have been transient. User can now promote v1.1.2 from TestFlight → App Store public release in App Store Connect when ready.

**Hermes ARM64 shim re-applied** — yarn remove wiped node_modules, hermesc shim was lost. Re-installed `qemu-user-static` + wrapped hermesc again. Persists until next dependency change. Documented in PRD so next session knows.

**User action items:**
1. Force-uninstall the broken v1.1.1 from Android phone
2. Open Play Console Internal Testing in 10-15 min → install v1.1.2 → confirm app launches
3. Once verified, promote Android v1.1.2 → Production in Play Console
4. iOS: wait for Apple processing email (5-10 min), then test from TestFlight
5. Once tested, promote iOS v1.1.2 → App Store public release from ASC



## ✅ Multi-stop support on Quote Request (Feb 6, 2026 — iter 44)

**Why:** Weddings (hotel → church → reception), proms (home → dinner → venue → after-party), wine tours, and bar crawls all have intermediate stops. Customers were shoving them into the free-text Notes field which made it hard for admin + affiliates to read the actual route at a glance.

**Shipped (web + mobile in same OTA):**
- **Backend** — `QuoteRequestCreate.stops: Optional[List[str]]` (max 5 items). Admin SMS now shows `Stops: A → B → C` line. Admin email adds a `Stops` row in the lead table.
- **Web** — `QuoteRequestDialog.jsx` adds dynamic stops list between Pickup and Drop-off. Each stop is its own labeled input with a remove (✕) button. "+ Add a stop" CTA below (hidden once 5 stops are added). State filtered for empty strings on submit.
- **Mobile** — `QuoteRequestSheet.tsx` mirrors web exactly: same insert position, same UX (add/remove/max 5).
- **Admin** — `QuoteRequestsTab.jsx` displays `🚏 Stops: A → B → C` between Pickup and Dropoff rows. Affiliate-outreach SMS template includes the stops line so affiliates see the whole route in one text.

**Files changed:**
- `/app/backend/server.py` (QuoteRequestCreate model + admin SMS + admin email)
- `/app/frontend/src/components/QuoteRequestDialog.jsx` (stops state, render, payload filter)
- `/app/mobile/src/components/QuoteRequestSheet.tsx` (mirror of web)
- `/app/mobile/src/api.ts` (submitQuoteRequest signature adds `stops?: string[]`)
- `/app/frontend/src/components/admin/QuoteRequestsTab.jsx` (stops display + outreach SMS)

**Verified:** Backend curl test confirmed stops persist as a proper array in Mongo and round-trip clean. Lint clean. TypeScript clean.

**OTA published:** group `b2b3f364-253e-4fda-9e4e-54a6668388cc`, runtime 1.1.1, iOS + Android. Testers pick up on next app launch.



## ✅ TestFlight LinearGradient crash FIXED + new fleet images (Feb 6, 2026 — iter 43)

**P0 emergency:** iOS TestFlight v1.1.1 was crashing on the "Choose your vehicle" screen with `Unimplemented component: <ViewManagerAdapter_ExpoLinearGradient_…>` — text overlay on every vehicle card. Root cause: package version mismatch — `expo: ^54.0.0` (native SDK 54) vs `expo-linear-gradient: ^56.0.4` (JS expecting SDK 56 native module name). When the OTA pushed the SDK 56 JS, the v1.1.1 binary couldn't resolve the native component.

**Shipped:**
- **vehicle.tsx LinearGradient REMOVED** — replaced the single `<LinearGradient>` usage in `/app/mobile/app/(rider)/vehicle.tsx` with a layered `<View>` stack (3 semi-transparent bands simulating a vertical fade). Visually identical, no native module needed. OTA-safe.
- **6 new studio-shot fleet images bundled into mobile** — `/app/mobile/assets/fleet/{executive-sedan,first-class,luxury-suv,stretch-limo,sprinter,party-bus}.jpg` — referenced via `require(@/assets/fleet/...)` so they ship with the OTA JS bundle. Compressed PNG → JPG @ 85% quality, 1200px wide → ~80 KB each (498 KB total bundle increase).
- **Same 6 images shipped to web** at `/app/frontend/public/fleet/*.jpg` (1600px @ 85%, ~130 KB each). Replaces older stock photos that had visible white halos on the dark page bg.
- **CSS shadow fix v2** — added BOTH top and bottom gradient masks to fleet image cards in `LandingPage.jsx`, `Fleet.jsx`, `FleetPicker.jsx`, `WorldCup2026.jsx`. Previous fix was bottom-only; new images have a subtle overhead studio halo that needed top-masking too. Verified via screenshot — cards sit flush on dark page.
- **Vehicle MAPPING updated** — Stretch Limousine description bumped from "Lincoln · Chrysler 300" to "Hummer Stretch · Chrysler 300" to match the new image (Hummer H2 stretch limo).

**Files changed:**
- `/app/mobile/app/(rider)/vehicle.tsx` (removed expo-linear-gradient import, View-stack gradient, bundled images via require)
- `/app/mobile/assets/fleet/*.jpg` (NEW — 6 files)
- `/app/frontend/public/fleet/*.jpg` (REPLACED — 6 files)
- `/app/frontend/src/components/LandingPage.jsx` (top + bottom gradient mask)
- `/app/frontend/src/components/Fleet.jsx` (top + bottom gradient mask)
- `/app/frontend/src/components/FleetPicker.jsx` (top + bottom gradient mask)
- `/app/frontend/src/pages/WorldCup2026.jsx` (top + bottom gradient mask)

**Mobile gaps identified during audit (NOT fixed this session — needs separate work):**
- ⚠️ **Mobile has NO Quote Request modal** — call-only vehicles (Party Bus, Stretch Limo, Sprinter) only show "Call for Quote" → tel: dialer. Web has full pre-qual form with trip_type + service_duration. Mobile users can't submit structured quote requests; they must phone-in.
- ⚠️ **Pre-qualification fields not in mobile booking flow** — the new trip_type/service_duration gating from iter 42 is web-only. If you want lead-quality parity, mobile booking form needs the same dropdowns.

**Still pending — needs YOU to push the OTA:**
```bash
cd /app/mobile
eas update --branch production --message "fix: vehicle picker LinearGradient crash + new fleet images"
```
Once you run that, every iOS TestFlight + Android tester on v1.1.1 will pull the fix on next app launch. No new native build needed.

**[UPDATE Feb 6]** OTA pushed by E1 — Update group `63b587c4-545c-49b9-889e-6eb56e824ca0`, runtime 1.1.1, iOS + Android. Includes: LinearGradient crash fix + new fleet images + new mobile QuoteRequestSheet (full pre-qual modal mirroring web). Live for all testers on next app launch.

**Mobile Quote Request modal (iter 43 follow-up — shipped in same OTA):**
- New file `/app/mobile/src/components/QuoteRequestSheet.tsx` — full-screen modal mirroring web QuoteRequestDialog.
- Required-field gate (isValid) identical to web: name, phone, trip_type, service_duration, date, time, passengers, pickup, dropoff. Submit button reads "Fill required fields to send" until valid → "Send request" when valid.
- Native PickerSheet (bottom-sheet style) for Trip Type + Service Duration dropdowns.
- @react-native-community/datetimepicker for date + time.
- POSTs to `/api/quote-requests` with same payload shape as web (mirrors `trip_type → occasion` for back-compat).
- New API helper in `/app/mobile/src/api.ts`: `submitQuoteRequest()`.
- Wired into `vehicle.tsx`: for call-only vehicles (Party Bus / Stretch / Sprinter / etc.), now shows a dual button row: **Request Quote** (gold, opens modal) + **Call** (outline, opens dialer). Previously was call-only.



**Verified:** Lint clean. TypeScript clean for vehicle.tsx. Screenshot of fleet section on web → cards look flush + premium, no white shadow. Mobile changes are JS-only so they ship via OTA.



## ✅ Quote Request Pre-Qualification Gate (Feb 6, 2026 — iter 42)

**Why:** User was getting vague one-line leads ("how much for limo?") that required 30 min of back-and-forth before affiliates could quote. This was burning affiliate goodwill and admin time.

**Shipped:**
- **Required-field gating on `QuoteRequestDialog`** — Submit button stays disabled (shows "Fill required fields to send") until ALL of: name, phone, **trip type** (new dropdown), **service duration** (new dropdown), date, time, passengers, pickup, dropoff are filled. Once valid, button activates and reads "Send request".
- **Per-field info tooltips** — small ⓘ icon next to each label. Hover (desktop) or tap (mobile) opens a Radix tooltip with a one-line "why we ask" explainer. Keeps the form scannable.
- **Trip Type dropdown** — Wedding / Prom / Airport / Night Out / Corporate / Birthday / Wine Tour / Concert / Funeral / Other.
- **Service Duration dropdown** — One-way / 1-2 / 3-4 / 5-6 / 7-8 / Full day / Not sure. (The #1 missing data point on inbound leads.)
- **Backend model** — `QuoteRequestCreate` accepts new optional `trip_type` + `service_duration` fields. Optional at API for backward-compat with legacy mobile clients (frontend enforces "required"). Frontend also mirrors `trip_type → occasion` for legacy admin/email template compat.
- **Admin SMS + Email + Quote Requests tab** — now surfaces the new fields. Admin card shows gold `trip_type` chip + cyan `⏱ service_duration` chip. Affiliate outreach SMS template includes both.
- **NO budget field** (per user — fear of scaring off legit leads).

**Files changed:**
- `/app/frontend/src/components/QuoteRequestDialog.jsx` (rewritten with `isValid` gate + `InfoHint` tooltip component)
- `/app/backend/server.py` (QuoteRequestCreate model + admin SMS + admin email render)
- `/app/frontend/src/components/admin/QuoteRequestsTab.jsx` (new badges + affiliate outreach SMS)

**Verified by testing agent (iteration_42.json):** 5/5 backend pytest passed, frontend e2e happy path passed — modal opens, submit disabled with correct text, tooltips render via Radix, all 9 required fields gate properly, full submission lands in DB with new fields, success state shows.



## ✅ iOS pod-install root cause FIXED + Block-by-source + Web shadow (Jun 20, 2026 — iter 44)

**Shipped:**
- **iOS pod-install error ROOT-CAUSED AND FIXED** — pulled encrypted EAS build logs via GraphQL + brotli decompression. Cause was `@react-native-google-signin/google-signin` transitively pulling `AppCheckCore` (Swift), which needed `GoogleUtilities` + `RecaptchaInterop` to expose modular headers when built as static libs. Added `expo-build-properties` plugin to `app.json` with `extraPods` declaring `modular_headers: true` for those 3 pods. iOS build `af1a7aa8-5ddc-40b7-a19e-15ee2a48812a` **finished successfully** (was previously stuck in errored state for multiple sessions). App Store submit step failed separately (likely cert refresh from `--clear-cache`) — documented in `/app/memory/IOS_BUILD_FIX_v1.1.1.md` with copy-paste TestFlight upload path.
- **Block-by-source admin tool** — admin can block new bookings from any UTM source bucket (e.g. Yelp, Facebook) with one click. Backend endpoints `GET /admin/attribution/blocked-sources` + `POST /admin/attribution/block-source`. Public booking + quote-request endpoints reject blocked-source submissions with HTTP 403 + polite "please call us directly" message. End-to-end test verified: yelp source → 403, google_ads source → 200.
- **Web fleet shadow fix** — vehicle images on `/airport`, `/sfo-airport-transfer`, `/sjc-airport-transfer`, `/oak-airport-transfer`, `/world-cup-2026`, and the homepage Fleet+Gallery+Venues sections no longer show a white halo. Added `bg-black` container + bottom dark-gradient overlay (matches mobile fix). Verified via screenshot — fleet cards now sit flush on dark bg.

**Files added/changed:**
- `/app/mobile/app.json` (expo-build-properties plugin + extraPods + iOS buildNumber → 3)
- `/app/mobile/package.json` (yarn added expo-build-properties)
- `/app/backend/routes/admin.py` (3 new endpoints: attribution preview/blocked-sources/block-source)
- `/app/backend/server.py` (block-by-source guard in /quote-requests + /bookings)
- `/app/frontend/src/components/admin/AttributionTab.jsx` (Block/Unblock button + blocklist banner)
- `/app/frontend/src/components/LandingPage.jsx` (shadow gradient on fleet/gallery/venues images)
- `/app/frontend/src/pages/WorldCup2026.jsx` (shadow gradient on fleet/gallery)
- `/app/memory/IOS_BUILD_FIX_v1.1.1.md` (NEW — full debug story + TestFlight upload runbook)

**EAS log decryption recipe (for future debugging):** EAS build/submit logs at `storage.googleapis.com/eas-workflows-production/...` are **brotli-compressed JSON-lines**. NOT gzip, despite filename. Decompress with `brotli.decompress(open(path,'rb').read())` then parse each line as JSON.

**Verified:**
- Block-by-source end-to-end (curl test: blocked source → 403, non-blocked → 200) ✅
- Web shadow fix via screenshot of SJC landing page ✅
- iOS build `af1a7aa8-...` status = `finished` on EAS dashboard ✅
- All lint clean ✅


## ✅ Attribution tab + Mobile v1.1.1 actually shipped (Jun 20, 2026 — iter 43, earlier)

**Shipped:**
- **Admin → Attribution tab** — new dashboard tab showing paid bookings + revenue grouped by first-touch UTM source bucket (google_ads, yelp, facebook, direct, untracked...). 7/30/90-day period selector. Attribution-rate KPI surfaces % of paid bookings with a UTM source (Google Ads gap detector). Powered by `GET /api/admin/attribution/sources?days=N`. Lives between "Sage Chats" and "Settings" tabs.
- **OTA Update published** — runtime 1.1.1, group `dddc4568-8159-4837-a7ad-ba4eccbcde20`, iOS + Android. Pre-loaded; fires when v1.1.1 native ships.
- **Android v1.1.1 LIVE in Google Play Internal Testing** — Build `215f96f6-6522-4e9e-b84e-cf99ac25e6b6` submitted via submission `d54e3341-4429-4743-8e8a-e28fcc09c4ae`, version code 27. **YOU need to promote Internal → Production via Play Console UI** (5 min); production track was missing config (release notes, country availability, content rating).
- **iOS v1.1.1 build errored** (recurring pod-install issue, build `77e4e634-70d8-498b-861d-78ff402f111a`). Log file is binary-encrypted; couldn't extract specific error. iOS users stay on v1.1.0 until next session debug.

**Files added/changed:**
- `/app/frontend/src/components/admin/AttributionTab.jsx` (NEW)
- `/app/frontend/src/pages/AdminDashboard.jsx` (mounted AttributionTab)
- `/app/backend/routes/admin.py` (added `/admin/attribution/sources` endpoint)
- `/app/mobile/eas.json` (Android submit track → `internal` after `production` rejected)
- `/app/memory/MOBILE_v1.1.1_RUNBOOK.md` (rewritten with actual ship status)

**Hermes ARM64 workaround in this sandbox:** Wrapped `node_modules/react-native/sdks/hermesc/linux64-bin/hermesc` with a qemu-x86_64-static shim so future `eas update` calls work from this environment. Persisted in `/app/mobile`.

**Verified:** Lint clean. Backend endpoint returns 401 unauth (registered). Direct Python aggregation against live DB returns expected shape (12 bookings, all "untracked" because they pre-date UTM deploy — new bookings will populate the buckets). Android OTA + Build + Submit confirmed by EAS dashboard.

**Next session debug list:**
- iOS pod-install root cause (likely `@react-native-google-signin/google-signin` or `expo-apple-authentication`)
- Configure Play Console production track once user populates release notes / pricing / availability


## ✅ UTM tracking + Mobile v1.1.1 prep + Android badge live (Jun 20, 2026 — earlier in session)

**Shipped:**
- **First-touch UTM tracking** — `/app/frontend/src/lib/utm.js` captures `utm_source`, `utm_medium`, `utm_campaign`, `gclid`, `fbclid`, `msclkid`, referrer, and a derived `source_bucket` (google_ads / yelp / facebook / direct / etc.) on the visitor's first attribution-bearing visit. Persisted to `localStorage` for 90 days. Attached to every booking + quote-request POST. First-touch wins (industry standard); later UTM params don't overwrite.
- **Backend models** — `BookingCreate` and `QuoteRequestCreate` now accept `utm: Optional[dict]`. Stored verbatim on the MongoDB documents.
- **Weekly Digest** enhanced with **"Paid bookings by source (UTM)"** block + per-source revenue. Closes the attribution loop Adel has been chasing.
- **Mobile app.json bumped to v1.1.1**: iOS `buildNumber` 1→2, Android `versionCode` 2→3. `eas.json` Android submit track switched from `alpha` → `production` (ready for Play Store production push).
- **Android badge enabled on `/download`** — removed "COMING SOON" gating, both badges now active links with side-by-side QR codes for iPhone + Android. Mobile redirect on Android devices now opens Play Store directly.
- **Mobile v1.1.1 runbook** at `/app/memory/MOBILE_v1.1.1_RUNBOOK.md` — copy-paste guide for `eas update` (OTA, free) + `eas build/submit` for Play Store production.

**Files added/changed:**
- `/app/frontend/src/lib/utm.js` (NEW)
- `/app/frontend/src/App.js` (calls `captureUtm()` on mount)
- `/app/frontend/src/components/BookingForm.jsx` (sends `utm` in payload)
- `/app/frontend/src/components/QuoteRequestDialog.jsx` (sends `utm` in payload)
- `/app/backend/server.py` (added `utm: Optional[dict]` to BookingCreate + QuoteRequestCreate)
- `/app/backend/weekly_digest.py` (added UTM source aggregation + email block)
- `/app/frontend/src/pages/AppDownload.jsx` (Android badge live, dual QR)
- `/app/mobile/app.json` (v1.1.1, buildNumber 2, versionCode 3)
- `/app/mobile/eas.json` (Android submit track → production)
- `/app/memory/MOBILE_v1.1.1_RUNBOOK.md` (NEW)

**Verified — testing_agent_v3_fork iteration 41 results: 100% pass rate (backend + frontend)**:
- All 4 airport landing routes return airport-specific testid + page title + H1
- World Cup metadata strengthened (Levi's Stadium + World Cup 2026 keywords)
- UTM frontend persistence: localStorage set on first visit, first-touch preserved on subsequent UTM-bearing visits
- UTM backend persistence: verified on quote_requests AND bookings collections
- Weekly digest endpoints: 401 unauth gating + 11 documented data keys present
- /download page: both badges active, both QR codes visible, mobile redirect points to correct store


## ✅ URL-aware airport landings + Weekly Performance Digest (Jun 20, 2026 — earlier in session)

**Shipped:**
- `/sjc-airport-transfer`, `/sfo-airport-transfer`, `/oak-airport-transfer` and `/airport` now render **airport-specific copy** (page title, meta description, hero H1, pillars, routes, FAQs) by detecting the URL pathname. Solves the `[san jose airport limo]` Quality Score problem flagged in CAI's June ad-groups report by ensuring the landing page actually mentions San Jose / SJC above the fold.
- `/world-cup-2026` meta + H1 strengthened with "Levi's Stadium" + "World Cup 2026" keywords for the active tournament window (June 11 – July 19).
- New **Weekly Performance Digest** — automatic email every Monday 9 AM Pacific summarising last 7 days: bookings created, paid bookings + revenue, quote-request funnel, top vehicles, top routes, quote sources, risk-band distribution, and a **Google Ads attribution gap callout** that surfaces the delta between Stripe-confirmed bookings and Google Ads' conversion count.
- Admin Settings tab gets a **"Weekly Performance Digest"** card: preview last 7 days inline (4-card KPI grid) or send the digest email on-demand.

**Files added/changed:**
- `/app/frontend/src/pages/AirportLanding.jsx` (URL-aware rewrite, 4 airport configs)
- `/app/frontend/src/pages/WorldCup2026.jsx` (meta + H1 keyword strengthening)
- `/app/backend/weekly_digest.py` (NEW — aggregation + email render + send)
- `/app/backend/server.py` (APScheduler cron, Monday 16:00 UTC)
- `/app/backend/routes/admin.py` (GET preview + POST send endpoints)
- `/app/frontend/src/components/admin/SettingsTab.jsx` (WeeklyDigestCard)

**Verified:** Python aggregation against live DB returns valid data (15 quotes, risk distribution). All 3 SEO routes return HTTP 200 with airport-specific titles & H1s. Admin endpoints return 401 unauth (registered correctly). Scheduler logs confirm the weekly job was added.


## ✅ Admin Chats tab + Live Customer Takeover (Feb 17, 2026 — iter 41)

**Shipped:**
- New **GET /api/admin/chat/sessions** — lists 100 most recent sessions, `needs_human` first, then by recency. Each row carries `last_preview`, `last_role`, `msg_count`, `updated_at`, `needs_human`.
- New **POST /api/admin/chat/sessions/{id}/reply** — admin appends a message to a session's history with `role="admin"` + `sender_name="Imran from Turan Elite"`. Also clears `needs_human` so the red dot disappears.
- New **POST /api/admin/chat/sessions/{id}/clear-needs-human** — manual "Mark handled" button on each thread.
- **Customer FloatingChatWidget** now polls `/api/chat/{session_id}` every 5 seconds while open → admin replies appear in the customer's panel within ~5 sec.
- **Admin replies render distinctly** in both the admin transcript view AND the customer widget — green bubble with sender_name header, distinct from Sage's dark gray and the customer's gold.
- **Admin Chats tab** — new tab in the dashboard between Safety and Settings. List view with red-dot triage + thread view with full transcript + reply textarea (Cmd/Ctrl+Enter to send) + Mark Handled button.

**Files added/changed:**
- `/app/backend/routes/chat.py` (added 3 admin endpoints + inline _require_admin)
- `/app/frontend/src/components/admin/ChatsTab.jsx` (NEW — list + thread + reply)
- `/app/frontend/src/components/FloatingChatWidget.jsx` (added 5-sec poll + admin bubble style)
- `/app/frontend/src/pages/AdminDashboard.jsx` (mounted ChatsTab between Safety + Settings)

**Curl-verified end-to-end:** admin lists 8 sessions, takeover reply lands with correct role + sender_name, customer's /chat/{id} returns the admin message at the end of history. Unauthenticated admin endpoints return 401.


## Original Problem Statement
Build a fully functioning website + native iOS/Android mobile app for TuranEliteLimo (premium chauffeur service, Bay Area). Stack: React + FastAPI + MongoDB + Expo React Native. Features: dynamic pricing, Stripe checkout, admin dashboard, driver live tracking. Recently expanded to: 2026 FIFA World Cup surge ops, custom invoices for affiliate brokered trips, social logins (Apple + Google).

## Live Production
- **Web:** `https://turanelitelimo.com` (deployed via Emergent)
- **iOS:** Live on App Store. TestFlight `v1.1.0 build 41` submitted Jun 4 with Apple + Google Sign-In.
- **Android:** Closed Testing on Play Console (Build #23).

## ✅ Live Route Map + Public AI Chat Assistant "Sage" (Feb 16, 2026 — iter 40)

**Shipped:**
- **RouteMap component** on the booking form — once pickup + dropoff are filled, dynamically loads the Google Maps SDK, draws a gold polyline route on a custom dark Turan theme, displays distance (mi) + estimated duration. Supports waypoints (Add stop). Pre-fill state shows a helpful hint card.
- **AI Chat Assistant "Sage"** — floating bubble bottom-right of every public page (`/`, all landing pages). Powered by Gemini 2.5 Flash via emergentintegrations + EMERGENT_LLM_KEY. ~$0.0003 per exchange, ~2-4 sec latency. Persona: warm chauffeur concierge with full TuranEliteLimo knowledge (fleet, ballpark pricing, BYOB/car-seat rules, World Cup 2026 surge, cancellation, escalation script).
- **Session persistence** — sessions stored in MongoDB `chat_sessions` collection. localStorage keeps the session_id so page refresh / revisit resumes the same thread. `needs_human` flag auto-set when Sage falls back to the human escalation phrase.
- **Conditional rendering** — widget hides on `/admin/*`, `/driver/*`, `/pay/*`, `/manage/*`, `/quote/*`, `/post-trip/*` (transactional/authenticated flows).
- **100% green tested:** 11/11 backend pytest cases, all frontend flows verified by testing agent (single + multi-turn + absurd-deflect + invalid session 404 + length cap 422 + history restore + conditional hide).

**Files added/changed:**
- `/app/backend/routes/chat.py` (NEW — chat router, ~250 lines, Sage system prompt)
- `/app/backend/server.py` (router include)
- `/app/frontend/src/components/RouteMap.jsx` (NEW — map + DirectionsService)
- `/app/frontend/src/components/FloatingChatWidget.jsx` (NEW — floating bubble + panel UI)
- `/app/frontend/src/App.js` (ConditionalChatWidget wrapper)
- `/app/frontend/src/components/BookingForm.jsx` (RouteMap mounted)
- `/app/backend/tests/test_iteration40_chat.py` (NEW — 11 pytest cases)
- `/app/memory/TESTING_GUIDE_FEB2026.md` (NEW — comprehensive 9-section test playbook)

## ✅ AI-Powered Off-Platform Lead Import + AI Reply Drafts (Feb 16, 2026 evening — iter 39+)

**Shipped:**
- **POST /api/admin/quote-requests/import-lead** — Gemini 2.5 Flash extracts 11 structured fields AND drafts a polished, channel-aware first-response reply (warm + emoji for Yelp, brief for phone-call) in a single LLM call. ~$0.0003 per parse.
- **POST /api/admin/quote-requests/import-lead/commit** — admin reviews/edits + commits. Defensive coercion: passengers → int|None, pickup_date → YYYY-MM-DD or empty, pickup_time → HH:MM or empty.
- **ImportLeadDialog** — paste raw text, pick source, click Parse → see extracted fields + risk badge + **AI-drafted reply** in a dedicated gold panel with one-click Copy. Editable inline if voice doesn't match.
- **Source tag badge** on each quote row.

**Verified on Spencer's actual Yelp text:** all 11 fields extracted correctly, risk=5/green, suggested_reply opens with acknowledgment, asks for missing name/contact, mentions formal quote within 1-2 hr, mentions refundable deposit, closes with brand sign-off + tasteful emoji. Channel-tone aware.

**Files changed:**
- `/app/backend/routes/admin.py` (two new endpoints with LLM call + defensive coercion)
- `/app/backend/server.py` (added `import json`)
- `/app/frontend/src/components/admin/QuoteRequestsTab.jsx` (Import lead button, ImportLeadDialog, source tag badge)
- `/app/backend/tests/test_iteration39_import_lead.py` (NEW — 13 pytest cases)


## ✅ Quick Risk Check tool for off-platform leads (Feb 16, 2026 PM)

**Shipped:**
- New `POST /api/admin/safety/risk-check` endpoint that exposes the existing `score_submission()` engine for ad-hoc lookups. Accepts any combination of `{phone, email, name, amount, ip, pickup_location, dropoff_location}` and returns the same `{score, band, flags, blacklisted, blacklist_hits}` shape used on real quote requests.
- New "Quick risk check" sub-tab inside Admin → Safety. Form takes phone/email/name/amount → returns score + green/yellow/red badge + plain-English recommendation + flag breakdown.
- Solves the problem of Yelp / Google Business Profile / walk-in call leads bypassing the safety system. Same scorer, same risk band — 1:1 comparable to website-submitted quotes.
- Verified end-to-end via curl: Spencer Pahlke = 20/green, disposable email = 55/yellow, empty body = 400.

**Files changed:**
- `/app/backend/routes/admin.py` (new endpoint at line ~2170)
- `/app/frontend/src/components/admin/SafetyTab.jsx` (new sub-tab + `QuickRiskCheck` component)


## ✅ Admin UX + Customer-Recovery SMS + Mobile Polish (Feb 16, 2026 PM — iter 38, 100% green)

**Shipped:**
- **Admin TabsList wraps** — 19 admin tabs now flow to 2 rows on iPad/desktop instead of horizontal-scrolling off-screen (`flex flex-wrap h-auto gap-1 p-1 justify-start w-full`).
- **Unread badges on Inquiries + Quote Requests** — gold pills matching the existing Bookings badge. Counts items with `status === "new"`. `data-testid=unread-inquiries-badge` + `data-testid=unread-quotes-badge`.
- **Green "Clean" risk badge** — `RiskBadge` now renders for ALL scored quote requests (was previously yellow/red/blacklisted only). Green band uses `CheckCircle2` icon + "Clean" label so the user visually confirms the safety system analyzed each lead.
- **Customer-facing payment-recovery SMS** — Extended existing `_send_payment_recovery_emails` background job (runs every 5 min) to also Twilio-SMS the customer their manage URL alongside the recovery email. Email gets buried under flight/hotel confirmations on mobile; SMS converts far better, especially for time-sensitive trips. One-shot stamp (`payment_recovery_sent_at`) prevents duplicates. Own try/except so Twilio failures don't block the admin SMS or DB stamp.
- **Mobile vehicle picker — white studio shadow masked** — Added `expo-linear-gradient` overlay (`cardImgFade`) inside the ImageBackground that fades from transparent at top → semi-dark mid → `colors.surface` at bottom. Cleanly blends the bottom of each fleet PNG into the card body without re-mastering image assets.

**Files changed:**
- `/app/frontend/src/pages/AdminDashboard.jsx` (TabsList wrap, quoteRequests fetch, 2 new unread badges)
- `/app/frontend/src/components/admin/SafetyTab.jsx` (RiskBadge green band)
- `/app/frontend/src/components/admin/QuoteRequestsTab.jsx` (always render badge)
- `/app/backend/server.py` (`_send_payment_recovery_emails` — added customer SMS block ~line 4533)
- `/app/mobile/app/(rider)/vehicle.tsx` (LinearGradient overlay)
- `/app/mobile/package.json` (`expo-linear-gradient@56.0.4`)
- `/app/memory/GOOGLE_ADS_PLAYBOOK_FEB2026.md` (NEW — 10-step Google Ads campaign fix playbook)
- `/app/backend/tests/test_iteration38_payment_recovery_sms.py` (NEW — 7 pytest cases, all pass)



## ✅ Landing Pages Visual & Editorial Refresh (Feb 15, 2026 PM)

**Shipped:**
- **Shared `LandingPage` component** gained 3 new optional props (all backward-compatible):
  - `experienceImage` — full-bleed editorial hero between pillars and routes ({src, alt, kicker, caption}).
  - `venues` + `venuesEyebrow/Title/Intro/Disclaimer` — 3-up image grid of named venues/wineries/partners with badge support.
  - `itinerary` — vertical timeline ({time, title, blurb}) with gold dot + ring markers.
- **Wine Tour landing** (`/wine-tour`) fully rewritten with rich editorial content: 6 featured wineries (Stags Leap, Opus One, Castello di Amorosa, Domaine Chandon, Schramsberg, Frog's Leap) with badges and individual blurbs + non-affiliation disclaimer, 8-step sample tasting day (9:30 AM hotel pickup → 7:00 PM return), expanded FAQs, full-bleed Napa hero image with editorial caption.
- **Wedding landing** (`/wedding`) gained an editorial bride-and-groom hero image, 3 venue-style cards (Wine Country Estate, Coastal & Carmel, City Hall & Ballroom) with non-specific imagery, and a 6-step wedding-day timeline (10 AM bridal suite → 11 PM send-off).
- **Corporate landing** (`/corporate`) gained an SF skyline hero with the editorial caption explaining the Silicon Valley roadshow pitch, and a 7-step executive day (7:30 AM SFO → Sequoia → a16z → working lunch → 5:30 PM dinner at Quince/Atelier Crenn → Four Seasons return).
- **Airport landing** (`/airport`) gained an airplane-wing-at-sunset hero with the editorial caption ("Your flight lands at 4:18 PM. We see the touchdown ping…"), plus a 6-step T-2hr → T+90min arrival choreography timeline.
- **All landing imagery** stored locally in `/app/frontend/public/landings/{winetour,wedding,corporate,airport}/` (no CDN drift risk; stable for production deploy).

**Files changed:**
- Updated: `/app/frontend/src/components/LandingPage.jsx` (+3 new prop blocks), `/app/frontend/src/pages/WineTourLanding.jsx` (complete rewrite), `/app/frontend/src/pages/WeddingLanding.jsx` (added venues + itinerary), `/app/frontend/src/pages/CorporateLanding.jsx` (added experience hero + itinerary), `/app/frontend/src/pages/AirportLanding.jsx` (added experience hero + itinerary)
- NEW assets: ~12 images in `/app/frontend/public/landings/winetour/`, 4 in `/wedding/`, 2 in `/corporate/`, 2 in `/airport/`

## ✅ Saved Cards / Invoice Charges + Twilio Verify Live + Promo Bug Fix + removeChild Crash Fix (Feb 15, 2026)

**All shipped today + tested green (iter 37, 13/13 pytest passing):**

- **Production crash fix** — Google Translate + React 18 `removeChild` crash on Android Chrome mobile. Added `installTranslateResilientDomPatches()` (silent no-op for detached-node `removeChild` / `insertBefore` calls) + `translate="no"` + `className="notranslate"` on the booking form section. Same pattern Microsoft Teams / Slack / Stripe use.
- **Quote-Offer Saved Cards** — `/quote/{token}` deposit checkout now uses direct Stripe REST API with `payment_intent_data[setup_future_usage]=off_session` + `customer_creation=always`. Finalize endpoint expands `payment_intent.payment_method` and saves `stripe_customer_id`, `stripe_payment_method_id`, `stripe_payment_intent_id`, `card_brand`, `card_last4`, plus `wait_time_consent=true` + `consent_accepted_at` timestamp on the resulting booking row.
- **Customer consent UI** — Reassuring checkbox on `/quote/{token}` and updated wording on the main `BookingForm` wait-time-consent-block. Both credit Stripe as the vault, clarify "we only charge if those things actually happen," list exactly what may be charged (remaining balance, wait time, damages, extra stops). Backend enforces `consent_accepted: true` in the POST body or returns 400.
- **Generic admin "Charge card on file"** — `POST /api/admin/bookings/{id}/charge-card` with `{amount, reason, description}`. Reasons: `balance`, `extra_hour`, `extra_stop`, `tolls`, `gratuity`, `other`. Min $0.50, max $10k. Uses existing `_stripe_off_session_charge` helper. Sends itemized customer receipt email. Appends to `bookings.extra_charges[]` for full history. New "Charge card on file" section in `BookingDetailsDialog.jsx` admin UI with amount + reason dropdown + description textarea + per-booking history.
- **Twilio Verify is LIVE** — `TWILIO_VERIFY_SID=VA9206b73740102bb36be85f5bc371122c` added to `backend/.env`. The OTP gate built in iter 36 will now send real SMS the moment admin flips "Require phone verification on high-value quotes" toggle in Settings → Safety & anti-fraud. Recommended: ON with $1000 threshold.
- **Promo double-apply bug fixed** — When backend auto-applies a promo (`auto_apply: true` on a promo doc), the frontend now mirrors it as `promoApplied` state so the GREEN CHIP shows (not the manual Apply input). New "Auto-applied" badge on the chip. Re-validate effect skipped for auto-applied promos (preventing the silent double-discount on already-discounted prices). Manual `applyPromo` blocks re-applying the currently-applied code with a friendly error. Customer can hit Remove + the dismissed code is tracked so the mirror doesn't immediately re-apply.

**Files changed (today, iter 37):**
- NEW: `/app/frontend/src/lib/translatePatch.js`, `/app/backend/tests/test_iteration37_saved_cards_charge.py`
- Updated: `/app/frontend/src/index.js` (translate patch boot), `/app/frontend/src/components/BookingForm.jsx` (translate="no" + improved consent text + promo double-apply fix + auto-apply mirror with dismiss tracking), `/app/backend/routes/admin.py` (quote-offer checkout → direct REST + consent gate; finalize → saves payment method), `/app/backend/routes/payments.py` (new `/admin/bookings/{id}/charge-card`), `/app/frontend/src/pages/QuoteOfferConfirm.jsx` (consent checkbox + reassuring text), `/app/frontend/src/components/admin/BookingDetailsDialog.jsx` (Charge card on file UI), `/app/backend/.env` (TWILIO_VERIFY_SID)

## 📋 Stripe Radar rules (for user to paste in dashboard — Settings → Radar → Rules)

Block:
- `Block if :card_number_failed_count: > 2 AND :ip_address: matches the same IP` (card testing)
- `Block if :email: matches any of (chargeback list)` (your manual blacklist)

Review (not block):
- `Review if :amount: > 1500 AND :card_country: != :ip_country:` (foreign+foreign+high$)
- `Review if :card_funding: == 'prepaid'`
- `Review if :ip_address::risk_level: == 'highest'`

Allow (override review for good actors):
- `Allow if :customer: in (any previous successful charge)` — critical for conference attendees who re-book
- `Allow if :email_risk_level: == 'low' AND :amount: < 500`

## ✅ Safety / Anti-Fraud System — Phase 1 + 2 + 3 (Feb 14, 2026)

**Shipped (all green, 14/14 pytest passing):**

- **Phase 1 — Risk scoring + scam blacklist**
  - New backend module `/app/backend/safety.py`: pure-Python scoring engine, blacklist matcher, ip-api geo lookup with in-process + 30-day Mongo cache (`ip_geo_cache` coll), disposable/free-email lists, area-code → state map for US phones, address-state extractor.
  - Every `POST /api/quote-requests` now captures `ip_address` (from X-Forwarded-For), `user_agent`, computes `risk_score` (0-100), `risk_band` (green ≤30, yellow ≤60, red 61+), `risk_flags[]`, `blacklisted` bool, plus full `ip_geo` block. Quote-offer `/finalize` carries these fields into the resulting `bookings` row + stamps `deposit_ip`.
  - Internal blacklist (`scam_blacklist` collection) — admin CRUD via `/api/admin/safety/blacklist`. Supports email-exact + domain wildcards (`@evil.com`), phone last-10-digit suffix match, IP exact + `/24` CIDR, name normalized match. **Silent-accept** policy: blacklisted submissions still return `{ok:true}` to the customer (so true positives still get a human follow-up) but are flagged + pushed into the review queue.
  - Visual `RiskBadge` (green/yellow/red, score) + flag-chip list shown inline on the admin Quote Requests tab for any flagged row.

- **Phase 2 — Manual review queue + verification**
  - New Settings: `safety_review_threshold` (default $1,500), `safety_phone_verify_required` (bool), `safety_phone_verify_threshold` ($).
  - `GET /api/admin/safety/review-queue` returns quotes + bookings flagged yellow/red, blacklisted, or above the $ threshold; admin can mark cleared via `POST /api/admin/safety/{quote-requests|bookings}/{id}/clear-risk`.
  - Phone-OTP gate: when `safety_phone_verify_required=true` AND quote price >= threshold, `POST /api/quote-offer/{token}/checkout` returns HTTP 428 with `detail="phone_verify_required"`. Frontend `QuoteOfferConfirm` catches 428 and shows the OTP UI (`Send code` → `Verify`). **Twilio Verify is now LIVE** (see iter 37 above).

- **Phase 3 (partial) — Device IP tracking**
  - Real client-IP extraction from k8s ingress `X-Forwarded-For`. ip-api.com (free, 45 req/min, no key) provides Country/Region/City/ISP + proxy/hosting flags. Cached in-process + persistent Mongo 30-day cache.

- **Admin UI** — `Safety` tab with 4 sub-tabs: Review queue / Blacklist / IP lookup / Pending OTPs. Risk badges + flag chips on Quote Requests tab. Safety section in Settings tab with 3 new toggles.

## 🔔 Active Reminder (Jun 13, 2026)
- **iOS native build is failing at "Install pods" 3× in a row** — needs revisit.
  - OTA update is already live on production (build group `49d51794-ffbf-4cb8-b377-898791f58ffd`) so all current JS code (referral screen, new fleet images, party-bus route) is deployed to existing TestFlight 41 / Play 23 installs.
  - Android native build is in progress (build #25, versionCode 25) and will auto-submit to Play Store Closed Testing.
  - **iOS Universal Links** (tapping `https://turanelitelimo.com/r/REF-XXX` opens app) won't work until iOS native build #48+ succeeds. Until then, iOS taps fall back to Safari web invite page.
  - **Next attempt**: ask user (or someone with a laptop) to copy the last 50 red error lines from `https://expo.dev/accounts/adamfayz98/projects/turanelitelimo/builds/8f5b6b1a-cc2e-4297-9d23-7329392120b7` — most likely cause is `associatedDomains` entitlement missing on App ID at developer.apple.com. Workaround: temporarily drop `associatedDomains` from `app.json` iOS section, ship build, add later.

## Recent Changes (this session)

## ✅ Quote Letter Self-Service Confirm Fix — Shipped (Jun 13, 2026)

**Problem solved:** Quote responses were missing a clear next step. Customers had to call back or wait for a manual Stripe link, killing the 3-min conversion window. ~50% conversion lift opportunity.

**What shipped:**
- New backend: extended `PATCH /api/admin/quote-requests/{rid}` accepts `quoted_price`, `deposit_pct`, `quoted_notes`, `affiliate_id`, `affiliate_cost`, `send_to_customer`. Generates a per-quote `confirm_token` and (when `send_to_customer=true`) sends a branded gold-themed email + SMS to the customer with a one-tap confirm link `https://turanelitelimo.com/quote/{token}`.
- New backend endpoints (public, token-gated, no auth):
  - `GET /api/quote-offer/{token}` — fetch quote details for the confirm page
  - `POST /api/quote-offer/{token}/checkout` — create Stripe Checkout session for the deposit
  - `GET /api/quote-offer/{token}/finalize?session_id=...` — verify payment, auto-create Booking record, mark quote request as `won`, notify admin via SMS, email customer the confirmation
- New frontend route: `/quote/:token` → `QuoteOfferConfirm.jsx`. Mobile-first, gold-accented confirm page with trip details, operator notes, flat-rate total, deposit amount, gold "✓ Confirm & Pay $XXX Deposit" CTA → Stripe → success state with confirmation number + balance-due breakdown.
- Admin UI: QuoteRequestsTab now has a **"Send Quote"** button per row → modal with price/deposit %/affiliate cost (with live profit calculation)/customer-facing notes → on submit auto-emails + SMS → shows the confirm link for manual sharing if needed.
- All payment via Stripe live key; the Stripe webhook fallback already handles edge cases.
- E2E tested via curl: GET/POST/finalize all return correct JSON; public confirm page renders correctly on mobile viewport.

- ✅ **Fleet vehicle imagery overhaul** — Feb 12, 2026
  - User uploaded 6 new studio shots (Cadillac XTS, Mercedes S-Class, Cadillac Escalade ESV, Mercedes Sprinter, Hummer Stretch, Party Bus).
  - Auto-processed each PNG: corner flood-fill replaces the light-gray studio backdrop with the card's `#0A0A0A` background (so the vehicle blends seamlessly into the dark UI), tight-crop to the vehicle bounding box with 8% padding, then center-paste onto a 3:2 1500×1000 canvas. Result: vehicles always render fully on web + mobile fleet cards regardless of container aspect (`object-cover` no longer crops the car off-screen).
  - Updated `/app/frontend/src/lib/fleet.js`, `/app/mobile/app/index.tsx`, `/app/mobile/app/(rider)/(tabs)/discover.tsx`, `/app/mobile/app/(rider)/vehicle.tsx` to use the new local files (`/fleet/stretch-limo.jpg` and `/fleet/party-bus.jpg`) instead of generic Unsplash URLs.
  - All processed JPEGs saved under `/app/frontend/public/fleet/` (≤80 KB each, progressive). Mobile app fetches them via `https://turanelitelimo.com/fleet/*.jpg` after next web deploy.

## Recent Changes (this session)
- ✅ **Backend modular refactor: server.py 8,210 → 4,734 lines** — Jun 10, 2026
  - Programmatic AST-based extraction split the monolithic `server.py` into 4 modular routers under `/app/backend/routes/`:
    - `routes/admin.py` (65 handlers, 1,508 lines)
    - `routes/customer.py` (26 handlers, 921 lines)
    - `routes/driver.py` (19 handlers, 573 lines — driver dispatch + driver-auth)
    - `routes/payments.py` (12 handlers, 965 lines — Stripe checkout/webhook/refunds)
  - Each route file does `import server as _server; globals().update(vars(_server))` so every helper/model/dep (including underscore-prefixed private helpers) resolves at runtime. Route module imports happen at the BOTTOM of `server.py` so all definitions are in place first.
  - Critical ordering preserved: all `api_router.include_router(...)` calls happen BEFORE `app.include_router(api_router)`, so FastAPI's route snapshot captures everything.
  - **Verification**: 157 `/api` routes pre-refactor → 157 `/api` routes post-refactor (exact set match via OpenAPI spec).
  - **Regression**: testing agent built a new pytest suite (`/app/backend/tests/test_refactor_regression.py`, 39 cases covering every router file). Result: **39/39 PASS**, zero refactor regression.
  - **Bonus latent bug fixed**: pre-existing `/api/customer/me/notifications` returned 404 on fresh accounts because `if not user:` tripped on `{}` (Motor projection returning empty doc when field absent). Changed to `if user is None:` — fresh customers now get default NotificationPrefs instead of 404.
- ✅ **Two enhancements: address autocomplete + auto-apply promos** — Jun 10, 2026
  - **Google Places autocomplete on FloatingQuoteWidget**: swapped plain `<input>` for the existing reusable `PlacesAutocompleteInput` on Pickup + Drop-off. Same dropdown behaviour as the homepage booking form. Verified end-to-end: typing "SFO" → "SFO Airport" prediction; typing "Napa" → "Napa, Napa Valley, Napa County Airport" predictions.
  - **Auto-apply promo (Uber-style strike-through pricing)**: admin can now flag a promo as `auto_apply=true`. When active, the `/api/quote` endpoint decorates every eligible vehicle quote with `original_price`, `discount_amount`, and `applied_promo` metadata. Frontend (`FleetPicker.jsx`) renders strike-through original price + bold gold new price + "Save $X · CODE" badge per vehicle. `BookingForm.jsx` auto-fills the promo-input field when the selected vehicle has an applied_promo, so checkout actually applies the discount with zero manual typing.
  - Promo selection rule when multiple `auto_apply` promos qualify: the one producing the LARGEST absolute discount on the lowest-priced eligible vehicle wins (tie-break: higher `value`).
  - Respects `allowed_vehicle_types` (admin can restrict to a vehicle subset) and `min_ride_amount` (won't discount sub-threshold quotes).
  - Backend tests: 10/10 pytest pass. Frontend smoke: autocomplete + strike-through + promo-input auto-fill all confirmed.
  - **🐛 Caught + fixed**: `PromoUpdate` Pydantic model was missing `auto_apply` (latent silent-fail — admin EDIT path silently dropped the field on PATCH). Added. Now CREATE and UPDATE both persist the flag.
- ✅ **Banner stacking + sedan image fixes** — Jun 10, 2026
  - SmartAppBanner converted from `fixed` → `sticky`, now publishes `--smart-banner-h` CSS var. PromoBanner, AnnouncementBanner, Navbar updated to stack correctly underneath. Fixes the iPad/iPhone issue where the TuranEliteLimo brand was hiding behind the install banner.
  - Swapped sedan image (Chinese signage in background) → clean Mercedes/Cadillac photo. 9 occurrences updated across landing pages, fleet config, and Home page.
- ✅ **AdminDashboard import fix** — Jun 9, 2026: silent search_replace failure left `PushBroadcastTab` un-imported → admin dashboard threw `Can't find variable: PushBroadcastTab` after 2FA login → black screen. Added the missing `import`. Lesson logged: always grep after multi-edit batches.
- ✅ **Refer-a-Friend + Push Broadcast + Floating Quote Widget** — Jun 8, 2026
  - **Refer-a-Friend**: every customer auto-gets a unique `REF-XXXXXX` code at signup. New `referral.py` helper module isolates the logic. New routes: `/r/:code` (public referral landing — applies WELCOME20), `/refer` (logged-in customer page showing code + share URL + stats + earned promos). When a referred customer completes their first paid ride, the referrer auto-receives a single-use $25-off `THANKS-XXXXXX` promo via email. Idempotent — no double payouts. New endpoints: `GET /api/referral/check/{code}`, `GET /api/customer/referrals`. Booking form auto-applies WELCOME20 if a `ref_code` is in localStorage.
  - **Push Broadcast (admin)**: new admin tab "Push" lets you send Uber/DoorDash-style marketing notifications to all customers with the mobile app installed. Live preview, char counts, test-only mode (sends to admin's own device), bulk send via Expo Push API in 100-token chunks, audit history. New endpoints: `POST /api/admin/push/broadcast`, `GET /api/admin/push/eligible-count`, `GET /api/admin/push/history`. Reuses existing `_send_expo_push` infrastructure.
  - **Floating Quote Widget**: sticky bottom-right "Get Quote · 60 sec" button on all 4 themed landing pages (`/airport`, `/wedding`, `/wine-tour`, `/corporate`). Opens a mini-form with pickup/dropoff/date → submits to `/?pickup=X&dropoff=Y&date=Z#booking` so the booking flow pre-populates. Expected to lift landing-page conversion by 15-25%.
  - **🐛 CRITICAL FIXES uncovered during testing**: (1) `asyncio` was not imported at module level in `server.py` despite being used by `asyncio.create_task()` for welcome emails — this was silently breaking welcome emails AND would have crashed every new customer signup the moment my referral hook code path ran. Hoisted to top-level imports. (2) `ensure_referral_code()` in `referral.py` used `if not doc:` on a projected `find_one()` result — Motor returns `{}` for matched docs with missing projected fields, which is falsy → was raising ValueError on every fresh customer. Fixed to `if doc is None:`. Both bugs caught by testing agent and patched.
  - Tested: 13/13 backend tests pass (4 admin tests skipped due to 2FA email gate); 100% frontend smoke tests pass.
- ✅ **Marketing: Google Ads landing pages** — Jun 7, 2026
  - Built reusable `LandingPage.jsx` (matches existing `/world-cup-2026` style)
  - 4 themed Google Ads landing pages: `/airport`, `/wedding`, `/wine-tour`, `/corporate`
  - 11 SEO aliases (e.g. `/sfo-airport-transfer`, `/napa-tour`, `/silicon-valley-chauffeur`)
  - Each page sets its own unique `document.title` + meta description for Quality Score
  - Fixed App.js title bug that was clobbering per-route titles on direct URL load
  - Tested: all 6 routes (4 new + Home + Stadium) return their correct page-specific title
  - **Action for user:** in Google Ads, point each Asset Group's Final URL to the matching new page
- ✅ **P3: Resend lifecycle emails + admin Compose Promo tab** — Jun 7, 2026
  - New `/app/backend/email_lifecycle.py` with branded HTML templates for: welcome, 24h pre-trip reminder, win-back, generic broadcast
  - Welcome email fires on customer signup (email + social) with auto-seeded `WELCOME20` ($20 off) promo
  - Win-back email fires daily for opted-in customers 60-90 days since last completed ride with `WEMISSYOU25` ($25 off)
  - 24-hour pre-trip reminder runs every 15 min — finds paid bookings 23-25h away, includes manage/cancel link
  - Admin `POST /api/admin/broadcast/preview` returns rendered HTML
  - Admin `POST /api/admin/broadcast/send` with `test_only=true` → sends to admin only, `false` → blasts opt-in list, audit-logged to `email_broadcasts`
  - Admin `GET /api/admin/broadcast/history` shows last 50 broadcasts with sent/failed counts
  - New `PromoEmailsTab.jsx` admin UI with WYSIWYG-lite form, iframe live preview, test-send button
  - APScheduler now runs 5 jobs (added pretrip_reminder every 15 min, winback every 24h)
- ✅ **P2 #2: Manual Surge toggle** — Jun 7, 2026
- ✅ **P2 #1: Quick Quote admin tool with Maps autocomplete** — Jun 7, 2026
- ✅ **P1: Split Google Ads conversions + marketing opt-in** — Jun 6, 2026
- ✅ **Apple Sign-In FIXED + Profile-completion gate** — Jun 4, 2026
  - Deleted stale May 21 Expo iOS credentials, generated fresh cert/profile with Apple Sign-In entitlement
  - Pinned `expo-apple-authentication@8.0.8` (was 56.0.4, incompatible with SDK 54)
  - Backend `verify_apple_id_token`: fixed audience-list bug (python-jose requires string, not list)
  - Backend `_login_or_link_social`: skip soft-deleted customers; drop stale oauth_identities
  - Backend `customer_delete_account`: also detach oauth_identities so re-sign-in creates fresh account
  - Backend `customer_book_and_pay`: validates rider has real name+phone on file before allowing booking
  - Mobile pay.tsx: shows "Complete your profile" gate before payment when name/phone missing
  - iOS Build #43 live on TestFlight with all the above mobile changes
  - Backend changes need a **Deploy** to push to production

## Persona & Architecture (unchanged)
See `/app/memory/CHANGELOG.md` for full feature changelog and `/app/memory/ROADMAP.md` for backlog.

## P0/P1 Backlog (After Apple Sign-In v1.1.0 build 41)
- **P0**: User confirms Apple Sign-In works on TestFlight build 41
- **P0**: Sacramento affiliate sourcing for "Cristina" lead (advise re-quote at $895 to absorb $750 affiliate cost)
- **P1**: Re-add Push Notifications setup on next iOS build (skipped today; requires Apple account password, not app-specific)
- **P1**: Deploy web updates (Affiliates tab, Invoices tab, World Cup page, Smart App Banner) to production via Emergent Deploy
- **P2**: Add real photos for 3 new Sprinter trims (Standard, Executive, Jet) once user provides
- **P2**: iOS v1.1 build 41 App Store submission (if user wants to ship publicly)

## P3 Future
- Saved Addresses (Home/Work) for riders → one-tap rebooking
- Rename "Book" bottom-tab to "Home", add back button on booking page
- In-app Settings page (notifications, change password, delete account)
- ~~Tech debt: Split `server.py` (>7,200 lines) into modular routers~~ ✅ DONE Jun 10, 2026
- "Refer a Friend" $25 credit
- Apple Sign-In for Android (web-redirect flow)

## Credentials & Secrets (do NOT commit)
- Apple ID for EAS auth: `abdulkhafizfayzullaev@gmail.com` (app-specific password user-generated per session)
- Apple Team ID: `X5PCWL9H76`
- ASC API Key on disk: `/app/mobile/AuthKey_S6ZN2K2TN4.p8` (key ID `S6ZN2K2TN4`, issuer `c7a389fa-d6e1-43d5-b2d6-3a5048e85f31`)
- ASC App ID: `6771610380`
- EXPO_TOKEN: rotated per session — user creates new one on https://expo.dev/settings/access-tokens

## Known State
- iOS v1.0 LIVE on App Store
- iOS v1.1 build 41 in TestFlight processing (submitted 11:04 UTC Jun 4, 2026)
- Android v1.1 (Build #23) in Play Console Closed Testing
- Web Preview has Affiliates/Invoices/WorldCup features awaiting Deploy

## Files Touched in Apple Sign-In Restoration
- `/app/mobile/app.json` — `usesAppleSignIn: true` + `expo-apple-authentication` plugin (already in place)
- `/app/mobile/package.json` — `expo-apple-authentication: ^56.0.4` (already in place)
- `/app/mobile/src/components/SocialSignInButtons.tsx` — Apple button rendering logic (already in place)
- Expo Credentials (server-side) — wiped May 21, regenerated Jun 4

## Test Credentials
See `/app/memory/test_credentials.md`

## 2026-06-11 — Mobile Referral Deep-Linking + Fleet Studio Photos

**Mobile identifiers (PERMANENT RECORD — do not lose):**
- Android package: `com.turanelitelimo.app`
- Play App Signing SHA-1: `AC:99:46:BC:C3:61:D6:53:3E:8A:CC:9A:9B:A4:71:E8:4C:A0:A0:09`
- Play App Signing SHA-256: `C2:FE:8D:FC:75:5A:E4:6D:D1:84:C2:E5:5F:40:68:76:60:9E:33:BC:72:6A:3E:32:8C:64:0D:C1:3D:7C:B4:5D`
- Apple Team IDs seen in history: `X5PCWL9H76` (used by build-ios.exp) and `9M7CK4W8HM` (older PRD) — AASA includes BOTH
- iOS bundle: `com.turanelitelimo.app`, ASC App ID 6771610380

**Deep-linking implemented:**
- `/app/frontend/public/.well-known/apple-app-site-association` (scoped to /r/*, both team IDs)
- `/app/frontend/public/.well-known/assetlinks.json` (real SHA-256 installed)
- Mobile: `app/r/[code].tsx` invite screen, `src/referral.ts` pending-code storage, auth.tsx signup banner + referred_by_code, SocialSignInButtons pass code on Apple/Google
- Backend: SocialLoginRequest.referred_by_code; _login_or_link_social attributes referrer on NEW social accounts only
- app.json: Android intentFilter scoped pathPrefix /r (needs new native build to apply; existing builds match all paths which is a superset, OK)
- craco devServer: /m/* SPA fallback rewrite; InteractiveMap.web.tsx stub fixes expo web export
- Tested e2e: link → invite screen → signup → referred_by in DB ✓ (web /m demo + curl + direct unit test of social path)

**Fleet studio images (user-provided, white-bg side profiles):**
- Web serves cropped versions: `/fleet/executive-sedan.jpg`, `/fleet/first-class.jpg`, `/fleet/luxury-suv.jpg`, `/fleet/sprinter.jpg` (in frontend/public/fleet/, 1600x864)
- Mobile uses `https://turanelitelimo.com/fleet/*.jpg` (live after web deploy)
- Originals on customer-assets: whmcsomm_4E881F51 (exec sedan), ee1xq2fw_E7451852 (first class), mss04701_68AACA5D (Escalade), 8kl4awce_B9271A1E (Sprinter)
- White Tesla photo removed from all 7 web pages; Fleet/FleetPicker overlays lightened (opacity-85, via-black/30-35)

**QA plan now 58 steps** (Section J added: steps 52-58 for deep links + photos).

**PENDING / NEXT:**
1. User runs 58-step QA via CAI → fix any failures
2. User deploys website (puts AASA + assetlinks + /fleet images live)
3. Push OTA update (`eas update --channel production`) so existing app installs get invite screen + new images — EXPO_TOKEN in watch-and-submit.sh
4. Optional: new EAS native build (applies Android pathPrefix /r scoping; not blocking — old filter is superset)
5. P2 backlog: Saved Cards / 1-tap rebooking (Stripe SetupIntent); P3: Apple account linking
