# TuranEliteLimo — Product Requirements Document (Live)

> Last refreshed: Jun 4, 2026 (Feb 2026 development context)

## Original Problem Statement
Build a fully functioning website + native iOS/Android mobile app for TuranEliteLimo (premium chauffeur service, Bay Area). Stack: React + FastAPI + MongoDB + Expo React Native. Features: dynamic pricing, Stripe checkout, admin dashboard, driver live tracking. Recently expanded to: 2026 FIFA World Cup surge ops, custom invoices for affiliate brokered trips, social logins (Apple + Google).

## Live Production
- **Web:** `https://turanelitelimo.com` (deployed via Emergent)
- **iOS:** Live on App Store. TestFlight `v1.1.0 build 41` submitted Jun 4 with Apple + Google Sign-In.
- **Android:** Closed Testing on Play Console (Build #23).



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
