# TuranEliteLimo — Product Requirements Document

## Original Problem Statement
Full-stack web application for a Bay Area luxury chauffeur service (TuranEliteLimo) with:
- Dynamic quoting, direct Stripe checkout
- Admin 2FA dashboard
- Driver dispatch portal
- Resend transactional emails
- SEO, Promo Codes, Wait-Time/Damages Auto-Charging
- Mid-Trip extra stops with detour math
- Tiered refund policies
- Public Announcements/News feature
- Google Ads conversion tracking

**EXTENDED**: Native iOS + Android mobile app via React Native (Expo) with:
- Rider account, booking, live trip tracking
- Driver account, trip queue, location streaming
- Admin live driver map
- Customer post-trip rating

## Current State (Feb 2026)
- **Web app**: PRODUCTION at https://turanelitelimo.com (deployed via Emergent)
- **Mobile app**: PREVIEW only at https://limo-experience-1.preview.emergentagent.com/m/
  - SDK: Expo 54 / RN 0.81.5 / React 19
  - Bundle ID: `com.turanelitelimo.app` (iOS + Android)
  - App name: TuranEliteLimo
  - 4 milestones complete: Auth & role-picker, Booking flow, Stripe + Trips + Driver, Live Tracking
  - Tunnel for Expo Go: `exp://wzy--oe-anonymous-8081.exp.direct` (rotates on restart)


## Changelog — Feb 23 2026 (current session)

### 🔴→✅ FIX: Mobile sign-in / sign-up / forgot-password silently failing
**Symptom:** TestFlight users saw "Something went wrong" on signin/signup and "Couldn't reach the server" on forgot-password despite production backend being fully up.
**Root cause:** OTA JS bundles were silently shipping with the *fallback* preview URL (`limo-experience-1.preview.emergentagent.com`) baked in because `EXPO_PUBLIC_API_URL` wasn't always picked up by `eas update` from the build profile env.
**Fix:**
- Hardcoded production URL `https://turanelitelimo.com` as the safe default in `/app/mobile/src/api.ts` (line 19).
- Created `/app/mobile/.env` with `EXPO_PUBLIC_API_URL=https://turanelitelimo.com` for local + update-time consistency.
- Improved auth error messages in `/app/mobile/app/(rider)/auth.tsx` (line 131-142): distinguishes between server errors, HTTP-status errors, and pure network failures.
- Pushed OTA update group `336897eb-894a-4190-9bb8-71923902e378` to `production` branch.
**Verification:** User confirmed sign-in & sign-up work on TestFlight after force-closing app and reopening.

### ✅ FEATURE VALIDATION: P1 — Live Driver Location Tracking (end-to-end)
**Validated via** `/app/backend/tests/test_driver_location_flow.py` — 14/14 tests pass.
Coverage:
- Driver login → POST `/api/driver-auth/location` upserts driver_locations row.
- When `active_booking_id` supplied, latest fix mirrors onto the booking doc (only if driver_id matches).
- Customer GET `/api/customer/bookings/{id}/driver-location` returns driver coords, pickup_coord (lazy geocoded), dropoff_coord, trip_status.
- Admin GET `/api/admin/drivers/live` returns 200-row list with stale_seconds and is_online flag (<120s).
- No `_id` leak in any response.
- Full trip_status lifecycle propagates: assigned → en_route → on_location → passenger_onboard → completed.

### 📦 Refactoring backlog (acknowledged, not in-scope)

### ✅ DONE: Android Google Play Internal Testing submission
**Root cause (recap):** `support@turanelitelimo.com` is a Google Workspace account with an org policy (`disableServiceAccountKeyCreation`) that the user couldn't edit, so JSON key creation was blocked.
**Workaround:** Created a brand-new Google Cloud project `turanelitelimo-play` under the user's personal Google account `adamfayz98@gmail.com` (no Workspace org → no policy → JSON keys allowed). Created service account `eas-submit@turanelitelimo-play.iam.gserviceaccount.com`, generated JSON key, invited into Play Console with "Manage testing tracks" + "Release apps to testing tracks" + "View app information" permissions.
**Result:** EAS submission `22f640dd-e693-42ed-8907-1bdb7210349a` succeeded. `.aab` build #17 (Android) is now in the Play Internal Testing track for app `com.turanelitelimo.app`.
**Files added:** `/app/mobile/play-service-account.json` (gitignored), eas.json `submit.production.android.serviceAccountKeyPath` configured.

### ✅ DONE: P2 — Apple Pay (Option A)
Verified by user: Stripe Checkout (opened in in-app browser from mobile) already shows Apple Pay button on iOS device — no code changes needed. User has enabled Apple Pay in Stripe Dashboard. Google Pay equivalent will work automatically on Android when the Internal Testing build is installed (same Stripe Checkout flow).


- `server.py` is 6592 lines → recommend splitting (admin, customer, driver, payments, geocoding).
- `/api/driver-auth/location` could 403-reject spoofed `active_booking_id` instead of silent no-op.
- `/api/admin/drivers/live` has no pagination contract — fine until fleet >200.
- Negative-cache TTL for failed geocodes on driver-location polls.



## Changelog — May 21 2026 (this session, continued)

### 🗺️ FIX (TAKE 2): Map "This page can't load Google Maps correctly" — ROOT CAUSE FOUND
**Why the first fix failed:** Changing WebView `baseUrl` to `turanelitelimo.com` did NOT actually change the HTTP Referer header that iOS WebView sends to Google. Per react-native-webview docs, iOS WKWebView does not reliably send the Referer header for HTML content loaded via `source={{ html }}`. The Google Maps JS API was rejecting the request because no/wrong referrer was reaching it.

**Real fix:** Created a NEW unrestricted Google Maps API key (`AIzaSyCDlQDr5_EYzX_qQpFgFqUZe6yQa7p9T7A`) in Google Cloud Console for the TuranEliteLimo project with:
- Application restrictions: **None** (no HTTP referrer restriction — required for WebView)
- API restrictions: Maps JavaScript API, Places API, Geocoding API, Directions API
- Billing now enabled on the project (user just linked billing account)

**Ship:**
- iOS build #13 (`58e45020-0343-4ffb-baa5-1b37ee7112d5`) submitted to TestFlight (submission `fbe2830f`). 
- Android build #7 (`b8e0dc60-b56d-4062-bff2-7a522527bef1`) finished — `.aab` at https://expo.dev/artifacts/eas/oQ7EKwWR492JwB5VSkdnSr.aab — waiting on Google Play service account JSON for auto-submit.
- Mobile web preview at `/m/` rebuilt with new key and verified via curl — server returns `AIzaSyCDl...`, old key removed.

**Verification:** Direct curl tests of Maps JS API, Geocoding API, and Places API with the new key all succeed.

### 🤖 FIX: Android EAS build failing (4 prior errors — root causes resolved)
**Root cause A:** `@react-native-async-storage/async-storage@^3.0.3` has a new Android-side dependency `org.asyncstorage.shared_storage:storage-android:1.0.0` that is not published to public Maven repositories. Gradle could not resolve it; build failed at `:app:mergeReleaseNativeLibs`.

**Root cause B:** Many `expo-*` packages were on version 55.x while the project is on Expo SDK 54 — Kotlin compilation of `expo-updates:compileReleaseKotlin` failed with "`onDidCreateReactHost` overrides nothing" because the 55.x packages expected newer React Native host APIs. iOS tolerated this; Android did not.

**Fix:**
1. Downgraded `@react-native-async-storage/async-storage` from `^3.0.3` → `2.2.0` (Expo SDK 54-compatible).
2. Realigned all expo packages to SDK 54 via `expo install`: `expo-device@~8.0.10`, `expo-haptics@~15.0.8`, `expo-location@~19.0.8`, `expo-notifications@~0.32.17`, `expo-secure-store@~15.0.8`, `expo-updates@~29.0.17`, `expo-web-browser@~15.0.11`, `react-native-webview@13.15.0`, `@react-native-community/datetimepicker@8.4.4`.

**Result:** Android build #6 (`f3046e50-3b45-4f46-8979-bb4b14b8fd70`, versionCode 6) FINISHED — `.aab` available at https://expo.dev/artifacts/eas/w1vDzeuzDETkz5ioKJAT7q.aab. Ready to submit to Google Play Console.

### 🎨 FIX: App icon too small + off-center on iPhone home screen
**Root cause:** Original `icon.png` had the wolf+crescent logo filling only 54% of canvas (Apple ideal: 70-85%) with center offset 70px below true center.

**Fix:** Regenerated all icon assets from `logo-mark-1024.png` (the master logo file):
- `icon.png`: logo now fills 78% of canvas, perfectly centered (511, 512)
- `adaptive-icon.png`: 70% (Android safe zone)
- `splash.png`: 40% (elegant centered on dark)

### 🐞 FIX: Mobile web preview at `/m/` returned a blank white page
**Root cause:** Expo's `expo export --platform web` generates an `index.html` that references `/_expo/...` (root) for JS, but the page is served from `/m/`, so the browser hit 404 silently.

**Fix:** Patched `/app/frontend/public/m/index.html` to use `/m/_expo/...` paths. Verified curl returns new JS bundle with the new API key.

### 🚀 NEW BUILDS shipped
- iOS #13 (`58e45020`) — first build with new API key → submitted to TestFlight
- iOS #14 (`f1f6c60e`) — has new API key + new icons → submitted to TestFlight (submission `1e5615c0`)
- Android #7 (`b8e0dc60`) — first .aab with new key: https://expo.dev/artifacts/eas/oQ7EKwWR492JwB5VSkdnSr.aab
- Android #8 (`eef75758`) — .aab with new key + new icons → ready for Play Console submit once user provides service account JSON

### 🔑 New Google Maps API key created
User created `AIzaSyCDlQDr5_EYzX_qQpFgFqUZe6yQa7p9T7A` under `support@turanelitelimo.com` Cloud account with:
- Application restrictions: None (required for WebView)
- API restrictions: Maps JS, Places, Geocoding, Directions
- Billing linked

### 🔧 ROOT CAUSE FIX: Pins/route never appeared because production `/api/places/geocode` returned 404
**Symptoms from build #17:** Map pans/zooms perfectly, but entering pickup/dropoff produced no pins, no route line.

**Real root cause:** The mobile app's production build calls `https://turanelitelimo.com` (set via `EXPO_PUBLIC_API_URL` in `eas.json` production profile). But the `/api/places/geocode` endpoint added in this session lives ONLY in the preview backend — production hasn't been deployed yet. Confirmed via curl: `curl https://turanelitelimo.com/api/places/geocode?address=...` returns HTTP 404. So `geocode()` in `home.tsx` silently failed, `pickupCoord`/`dropoffCoord` stayed `null`, no pins rendered.

**Fix:**
1. **Bypass backend entirely for geocoding** — `home.tsx` now calls Google Maps Geocoding API directly using `EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`. Works regardless of backend deploy status. Tested via direct curl: Four Seasons → (37.7866, -122.4044), SFO → (37.6191, -122.3816). ✅
2. **Added real road-following Directions API integration** (the "potential improvement" user approved) — gold polyline now traces actual highways via Google Directions `overview_polyline` + custom Polyline decoder. Tested: SF→SFO returns 992-char polyline via US-101 S, 23 min, 14.1 mi. Decoder verified against Google's reference example (38.5,-120.2),(40.7,-120.95),(43.252,-126.453). ✅
3. Removed invalid `onLoad` prop from `<Marker>` (TS rejected it); StableMarker still flips `tracksViewChanges` via the child View's `onLayout`. TypeScript clean (`npx tsc --noEmit` passes).

**Ship:**
- iOS build #18 (`9c2cb5d5-8f3b-4039-b61a-58531b59cfd8`) → submitted to TestFlight (submission `e398d1ab`). Install **1.0.0 (18)**.
- Android build #12 (`fcd86883-7448-4a88-ac6d-3c6b50a97697`) → in progress.

### 🔧 CRITICAL FIX: Map was completely frozen (build #16 follow-up)
**Symptoms:** Map rendered visually but was unresponsive — no pan, no pinch-zoom, and pickup/dropoff entries didn't show pins.

**Root cause:** `<SafeAreaView style={{flex:1}}>` in `home.tsx` covers the entire screen above the bottom form sheet. By default, React Native parent views with `flex:1` **intercept ALL touch events in their bounds**, even when visually empty/transparent. So every drag/pinch in the middle of the screen went to SafeAreaView instead of MapView below it. The map APPEARED frozen because it never received a single touch event.

**Fix:** Added `pointerEvents="box-none"` to the SafeAreaView and KeyboardAvoidingView in home.tsx — this tells RN "don't catch touches in my empty space, let them fall through; my children (top bar, form sheet) handle their own taps". Also added double-retry to InteractiveMap's auto-fit (300ms + 1200ms after coords change) so iOS marker mounting timing can't leave pins off-screen.

**Ship:**
- iOS build #17 (`a84842e7-1a37-43d3-9176-e31671ddf154`) → submitted to TestFlight (submission `6a695031`). Install **1.0.0 (17)**.
- Android build #11 (`114d22a6-ef2d-4efa-b4b9-d251979eac05`) → in progress.

### 🔧 FIX: Native map pins + route line not rendering on iOS (build #15 follow-up)
**Symptoms in build #15:** Map looked stunning (dark/gold luxury, full-screen, no error overlays, exactly like IMG_1850) — but pickup/dropoff pins and the route line didn't appear when both addresses were entered.

**Root causes (3 known react-native-maps iOS gotchas):**
1. **`tracksViewChanges={false}` from the start** → custom `<View>` children inside `<Marker>` render as INVISIBLE on iOS unless tracking starts `true` and is switched to `false` only after `onLoad`/first layout.
2. **`animateToRegion` with multiple points** is unreliable for fitting bounds — `fitToCoordinates` with `edgePadding` is the documented correct API.
3. **No `mapPadding` for the bottom form sheet** → auto-fit zoomed pins behind the sheet (out of visible area).

**Fix:** Rewrote `InteractiveMap.tsx`:
- Introduced `<StableMarker>` wrapper that starts `tracksViewChanges=true` and flips to `false` 500 ms after `onLayout`, so iOS rasterises the custom view.
- Replaced `animateToRegion` with `fitToCoordinates` with `edgePadding: { top: 120, right: 60, bottom: 320, left: 60 }`.
- Added `mapPadding={{ top: 80, bottom: 280 }}` so the logical center sits above the bottom form sheet.
- Larger, higher-contrast pins (gold A pin 32px + black tail, dark B pin 28px + gold ring).
- Solid gold polyline (5px) pickup→dropoff; dashed driver→pickup for active trips.

**Ship:**
- iOS build #16 (`ba55b81b-fadf-41ca-8ea6-b8d95c8098fb`) → submitted to TestFlight (submission `b2bd028b`). User should install **1.0.0 (16)**.
- Android build #10 (`ec52f75c-7802-486d-99d2-3f008e081e30`) → in progress.

### 🗺️ MAJOR REFACTOR: WebView Maps → Native Google Maps SDK (react-native-maps)
**Why:** User's previous build (#14) still showed "Can't load Google Maps correctly" error in iOS with web chrome (Keyboard shortcuts/Terms footer). Root cause is fundamental — iOS WKWebView and HTTP-referrer restrictions are not compatible. The whole WebView approach was the wrong tool for the job.

**Refactor:**
1. Installed `react-native-maps@1.20.1` (the library Uber/Lyft use).
2. Rewrote `/app/mobile/src/components/InteractiveMap.tsx` from a WebView-based component to a native `MapView` using `PROVIDER_GOOGLE`. Dark/gold luxury style applied via `customMapStyle` prop. Custom gold pickup pin, dark dropoff pin, gold polyline. Auto-fits to all visible points with 60% padding.
3. Fixed `/app/mobile/app/(rider)/(tabs)/home.tsx` — InteractiveMap now passed `height="100%"` so it actually fills the screen (was defaulting to 320px, causing the "half black, half map" layout bug).
4. Added native API key configuration in `app.json`:
   - `ios.config.googleMapsApiKey`
   - `android.config.googleMaps.apiKey`
5. User enabled Maps SDK for iOS + Maps SDK for Android in Google Cloud and added them to the existing key restrictions.

**Ship:**
- iOS build #15 (`c53199a3-a19a-42bc-9c91-b9cac62d04b9`) — submitted to TestFlight (submission `b3cf864a`). Processing on Apple's side.
- Android build #9 (`8577f9dc-4ff0-4d3a-8972-093706cf4aec`) — in progress.


## Changelog — Feb 21 2026 (this session)

### 🍎🚀 iOS APP UPLOADED TO TESTFLIGHT
**Milestone:** First production iOS build successfully submitted to App Store Connect.

- Apple Developer App ID created: `com.turanelitelimo.app`
- App Store Connect listing created: App ID `6771610380`
- Expo project provisioned: `@adamfayz98/turanelitelimo` (Project ID `f7293fd3-fd4a-4b43-815c-07c410b601e9`)
- iOS Distribution Certificate + Provisioning Profile auto-generated by EAS
- Apple Push Notifications service key auto-created
- iOS build 1.0 (build #9) finished in 6 min, uploaded to TestFlight in 2 min
- IPA URL: https://expo.dev/artifacts/eas/9SVJkUy95WYb7bGj3rDPYj.ipa
- TestFlight URL: https://appstoreconnect.apple.com/apps/6771610380/testflight/ios

**EAS submit profile config** (`/app/mobile/eas.json`):
```json
{
  "ascAppId": "6771610380",
  "appleTeamId": "9M7CK4W8HM"
}
```

### 🤖 Android build BLOCKED (Gradle error)
- Two attempts both failed at "Run gradlew" phase with
  `EAS_BUILD_UNKNOWN_GRADLE_ERROR`
- Logs are zstd-encoded and not viewable from container shell
- **Resolution path:** debug on a desktop with `cd mobile && eas build --platform android --profile preview --local` to see full gradle output, OR view logs in browser at
  https://expo.dev/accounts/adamfayz98/projects/turanelitelimo/builds/2400c49c-6886-4600-8989-f27916777c68
- Most likely cause: `expo-updates` was just added and may need Android-side gradle plugin config



### 🔴 P0 Fix: "Something went wrong" on Stripe checkout (the Krista root cause)
**Problem:** Customer Krista (and the user himself, reproduced on Chrome desktop)
hit `/payments/checkout` → got "Something went wrong" toast → never reached
Stripe → frustrated → cancelled the booking. Root cause was that
`window.location.href = stripeUrl` silently fails in several scenarios:
iOS Safari ITP, popup blockers, network blips between booking creation and
checkout response (booking + Stripe session got written to DB but the
client-side redirect never ran).

**Four-layer fix shipped:**
1. **Visible checkout overlay** (`CheckoutRedirectOverlay.jsx`) — replaces silent
   `window.location.href` with a full-screen "Opening secure checkout…" modal
   that triggers the redirect AND, after 2.5s of being still on the page,
   reveals a big yellow "Open secure checkout →" button with the real Stripe
   URL. Works on iOS Safari because the manual click is user-initiated.
2. **15-minute payment-recovery email** (`_send_payment_recovery_emails`) —
   APScheduler job runs every 5 min, finds any booking stuck in
   `payment_status=pending` for >15 min, sends customer a polite "looks like
   checkout got interrupted, here's a direct link" email AND texts the admin
   so they can phone the customer immediately. One-shot per booking
   (`payment_recovery_sent_at`).
3. **Server-side checkout failure tracking** — `_record_checkout_failure`
   catches Stripe timeouts/network errors/non-200s. Increments
   `checkout_failures` on the booking, logs to `checkout_failures` collection,
   AND fires an admin SMS *"⚠️ CHECKOUT FAILED · CALL THIS CUSTOMER NOW"*.
4. **Client-side telemetry** — `POST /api/payments/checkout-telemetry` logs
   redirect_blocked / manual_fallback_clicked events with user-agent so we can
   spot patterns (e.g. iOS 17 Safari blocking the redirect 30% of the time).

**Admin UI:** Bookings table now shows two extra badges in the Payment column:
- 🔵 `⏳ Nx attempt` — customer reached Stripe N times but hasn't paid
- 🟠 `⚠ N fails` — Stripe call failed N times (hover for error detail)

**Tests:** 5 backend tests all pass — telemetry endpoint, recovery job at 15min,
recovery skips <15min bookings, recovery skips cancellation-requested bookings,
real Stripe checkout creates session + stamps counters.

**Files:**
- `/app/backend/server.py` — Booking model + `/payments/checkout` hardening +
  recovery job + telemetry endpoint + admin SMS on every checkout failure
- `/app/frontend/src/components/CheckoutRedirectOverlay.jsx` — NEW
- `/app/frontend/src/components/BookingForm.jsx` — uses overlay
- `/app/frontend/src/pages/PayBooking.jsx` — uses overlay
- `/app/frontend/src/pages/AdminDashboard.jsx` — attempt/failure badges

### 🟢 Cancellation provenance + retroactive backfill (shipped earlier today)
- `cancellation_source` stamped on every cancel path
  (`admin` / `customer_web` / `mobile_app` / `auto_abandoned`)
- Admin UI badges: 🤖 / 👤 / 🧑‍💼 / ⚪ on every cancelled booking
- Forensic timestamps (`cancelled_at`, `cancelled_by_admin_email`,
  `auto_cancelled_at`, `payment_reminder_sent_at`) in BookingDetailsDialog
- `_sweep_abandoned_checkouts` background job — 72h cutoff (was 24h inline),
  with 23h "your reservation needs payment" reminder email
- `POST /admin/bookings/backfill-cancellation-source` — one-shot endpoint
  + admin UI button to retro-stamp historical cancellations


## Tech Stack
- Frontend (web): React, Tailwind, Shadcn UI
- Mobile: React Native, Expo Router, Expo SecureStore, Zustand, Axios
- Backend: FastAPI, MongoDB (Motor async)
- Integrations: Stripe Checkout, Google Maps (Places + Distance Matrix + Static Maps),
  Resend (emails + SMS gateway via @vtext.com), Google Ads gtag, Emergent LLM key

## Mobile Architecture
```
/app/mobile/
├── app/                          # Expo Router routes
│   ├── _layout.tsx               # Root stack + auth hydration
│   ├── index.tsx                 # Role picker (Rider / Driver)
│   ├── (rider)/
│   │   ├── _layout.tsx
│   │   ├── auth.tsx              # Email/password signup+login
│   │   ├── vehicle.tsx           # Fleet picker with live quotes
│   │   ├── pay.tsx               # Review → opens Stripe Checkout
│   │   ├── thank-you.tsx         # Deep-link return from Stripe
│   │   ├── active.tsx            # Live tracking — polls every 5s
│   │   ├── rate.tsx              # Post-trip 5-star rating
│   │   └── (tabs)/
│   │       ├── _layout.tsx       # Bottom tabs
│   │       ├── home.tsx          # Booking form (map BG)
│   │       ├── trips.tsx         # Trip history
│   │       └── profile.tsx       # Settings menu
│   └── (driver)/
│       ├── auth.tsx              # Sign in + First-time set password
│       ├── driver-trips.tsx      # Queue + stats
│       └── active-trip.tsx       # Streams GPS, Navigate/Call/Message
├── src/
│   ├── theme.ts                  # Single source of truth for tokens
│   ├── api.ts                    # Backend HTTP client + endpoint wrappers
│   ├── components/               # Button, Input, AddressPicker, DateTimeModal
│   ├── hooks/useDriverLocationStream.ts  # 15s GPS push loop
│   └── store/                    # Zustand: auth, driver, booking
└── web-build/                    # Exported to /app/frontend/public/m/
```

## New Backend Endpoints (mobile-only)
| Method | Path | Purpose |
|---|---|---|
| POST | /api/customer/signup | Create rider account, returns JWT (30d) |
| POST | /api/customer/login | Email + password, returns JWT |
| GET  | /api/customer/me | Current rider profile |
| POST | /api/customer/book-and-pay | One-call: create booking + Stripe Checkout |
| GET  | /api/customer/trips | Trip history |
| GET  | /api/customer/bookings/{id} | Trip detail + auto-sync Stripe paid status |
| GET  | /api/customer/bookings/{id}/driver-location | Live driver GPS |
| POST | /api/customer/bookings/{id}/rate | 5-star rating, aggregates driver avg |
| GET  | /api/places/autocomplete | Google Places proxy (existing) |
| POST | /api/driver-auth/login | Driver email + password → JWT |
| POST | /api/driver-auth/set-password | First-time setup (driver pre-created by admin) |
| GET  | /api/driver-auth/me | Driver profile |
| GET  | /api/driver-auth/trips | Trips assigned to this driver |
| GET  | /api/driver-auth/stats | Week trips, earnings, rating |
| POST | /api/driver-auth/location | Push GPS fix (every ~15s) |
| GET  | /api/admin/drivers/live | All driver positions (admin) |
| POST | /api/admin/bookings/assign-driver | Alt assignment endpoint |
| GET  | /api/vehicle-types | Public fleet info |

The existing admin `assign-driver` endpoint now **auto-links** the driver record by
matching phone number, so admin-assigned trips show up in the mobile driver app.

## New DB Collections / Fields
- `customers`: id, name, email (lower), phone, password_hash (bcrypt), created_at
- `driver_locations`: driver_id, latitude, longitude, heading, speed, accuracy,
  active_booking_id, updated_at, updated_at_ts
- `bookings`: + `customer_id`, `source` (`mobile_app`), `driver_id` (linked),
  `driver_latitude`/`_longitude`/`_heading`/`_location_updated_at`,
  `rating`, `rating_comment`, `rated_at`
- `drivers`: + `password_hash`, `avg_rating`, `ratings_count`

## Mobile Milestone Status

### ✅ Milestone 1 — Foundation (DONE)
- Expo project, theming, role picker, rider auth, driver auth shells
- Logo placement on launch / auth / active / profile

### ✅ Milestone 2 — Rider Booking Flow (DONE)
- Bottom-tab navigation (Book / Trips / Profile)
- Personalized greeting ("Where to, Sarah?")
- Live quote screen with real fleet photos
- Vehicle picker
- Review & Pay screen layout

### ✅ Milestone 3 — Stripe + Driver App + Trip History (DONE)
- Real Stripe Checkout from mobile (deep-link return)
- Native "Booking Confirmed" thank-you screen with Stripe payment sync
- Trip history hooked to backend, status badges, refresh control
- Driver login (Sign In / First Time tabs)
- Driver trip queue with "Good morning, Marcus · X trips today"
- Driver stat cards (week trips, earnings, rating)

### ✅ Milestone 4 — Live Tracking + Address Autocomplete (DONE)
- Google Places autocomplete in full-screen modal (no keyboard collision)
- Driver location streaming (expo-location, 15s interval)
- Rider live-trip screen with polling, dark-theme Google Static Map, live driver dot
- Driver active-trip screen with Navigate/Call/Message + arrived/end CTAs
- Admin Live Map tab on /admin (refreshes every 5s, gold pins for online drivers)

### ✅ Polish round — All M4 bugs reported by user (DONE)
- ✅ Date/time picker working with quick chips + native picker
- ✅ "Call for Quote" gold button on Stretch/Sprinter/Party Bus cards
- ✅ All 7 profile menu rows tap to friendly placeholder alerts
- ✅ Settings gear → Profile tab
- ✅ Post-trip 5-star rating screen with backend aggregation
- ✅ Admin-assigned drivers now auto-link to mobile chauffeur app via phone

## Backlog — Upcoming Milestones

### P0 — Milestone 5: App Store Prep (NEXT SESSION)
- Driver profile screen w/ photo upload (Expo ImagePicker)
- Push notifications via Expo Notifications (new trip assigned / driver en route)
- App icons (1024×1024 + adaptive icon variants)
- Splash screen
- Privacy policy URL (host on website)
- Apple Developer ($99/yr) + Google Play ($25) account setup
- EAS Build configuration for iOS .ipa + Android .aab
- App Store listing: name, subtitle, description, keywords, 6 screenshots
- Demo account credentials for Apple reviewer

### P1 — Live Tracking Demo (NEXT SESSION, easy)
- Walk through assigning test driver to a real booking from admin
- Two-phone test (driver moves → rider sees it move → admin sees both)

### P2 — Future polish
- Apple Pay / Google Pay native (currently web Stripe Checkout)
- In-app Settings (currently sends to Profile)
- Saved Addresses (favorites)
- Promo Code field on Pay screen (currently placeholder)
- Background location for driver app (requires EAS dev build, not Expo Go)
- Driver photo upload to a Customers tab in admin
- Customer accounts list in admin (`/admin → Customers`)

## Production Reminder
User has DEPLOYED production at https://turanelitelimo.com. The mobile app is in
preview only. Mobile-related backend endpoints WILL go to production on the next
"Redeploy" click from the user since they live in the same FastAPI app.

## Google Ads Setup Status
- ✅ Site-wide gtag (`AW-18168374727`) on every page
- ✅ Conversion event firing on `/thank-you` with label `Vs8xCO62za8cEMfLrddD`
- ✅ Verified in preview — captured network request to /pagead/1p-conversion/...
- ⚠️ User needs to add these env vars to PRODUCTION + Redeploy:
  - `REACT_APP_GADS_CONVERSION_ID=AW-18168374727`
  - `REACT_APP_GADS_CONVERSION_LABEL=Vs8xCO62za8cEMfLrddD`

## Credits Usage Estimate
- Web app foundation: ~300–500 (built across previous sessions)
- Mobile M1–M4 + polish: ~380–450 this session
- Estimated remaining: ~150–250 to reach App Store submission
- **Running total against 500–700 mobile budget: ~380–450 used, on track**

## Files of Reference
- `/app/mobile/app/(rider)/(tabs)/home.tsx` — Booking screen
- `/app/mobile/app/(rider)/vehicle.tsx` — Fleet picker w/ Call for Quote
- `/app/mobile/app/(rider)/pay.tsx` — Stripe checkout launcher
- `/app/mobile/app/(rider)/thank-you.tsx` — Deep-link return screen
- `/app/mobile/app/(rider)/active.tsx` — Live tracking (rider side)
- `/app/mobile/app/(rider)/rate.tsx` — 5-star rating
- `/app/mobile/app/(driver)/active-trip.tsx` — Driver location streaming
- `/app/mobile/src/components/AddressPicker.tsx` — Google Places modal
- `/app/mobile/src/components/DateTimeModal.tsx` — When-picker
- `/app/mobile/src/hooks/useDriverLocationStream.ts` — 15s GPS loop
- `/app/backend/server.py` — All mobile endpoints (search for `# Customer auth`, `# Driver auth`, `# Live driver location`)
- `/app/frontend/src/components/admin/LiveDriversTab.jsx` — Admin live map

## Session — Feb 20, 2026 (fork) — continued
**P0 Batch — Maps + Forgot Password + Promo + Driver Portal:**

Backend (`server.py`):
- NEW: `POST /api/customer/forgot-password` — Resend-sent reset email, always returns 200 to prevent user enumeration. 2-hour token.
- NEW: `POST /api/customer/reset-password` — consumes one-time token, updates password hash.
- NEW: `GET /api/driver-auth/bookings/{id}` — JWT-driver trip detail with ownership check.
- NEW: `POST /api/driver-auth/bookings/{id}/status` — JWT-driver status progression (TRIP_STATUS_ORDER guard).
- NEW: `POST /api/driver-auth/bookings/{id}/record-wait-time` — delegates to shared `_record_wait_time_for_booking`.
- NEW: `POST /api/driver-auth/bookings/{id}/record-mid-trip-stop` — delegates to shared `_record_mid_trip_stop_for_booking`.
- REFACTOR: Token-based wait-time + mid-trip-stop endpoints now also call the shared helpers (no behavior change, just DRY).

Web (`frontend/src`):
- NEW: `/reset-password` route + page (`pages/ResetPassword.jsx`).
- REWRITE: `components/admin/LiveDriversTab.jsx` now uses interactive Google Maps JS API:
  - Dark luxury theme, pan/zoom enabled, gold car icon marker
  - Click any driver row → map pans+zooms to that driver
  - "Reset view" button to clear focus and auto-fit all drivers

Mobile (`mobile/app`):
- NEW: `/(rider)/forgot.tsx` — forgot-password screen with success confirmation.
- WIRED: `auth.tsx` "Forgot password?" link now navigates to `/(rider)/forgot`.
- WIRED: `pay.tsx` promo input — calls `/api/promos/validate`, shows discount preview, sends promo on bookAndPay.
- REWRITE: `(driver)/active-trip.tsx` — full feature parity with web DriverPortal:
  - Status progression (assigned → en_route → on_location → passenger_onboard → completed)
  - Record wait time modal (minutes input → admin reviews)
  - Add mid-trip stop modal (address + minutes → detour calc, admin reviews)
  - One-tap navigate via Google Maps deep link
  - Live GPS streaming indicator
- NEW: `src/components/InteractiveMap.tsx` — cross-platform interactive Google Map (WebView on native, iframe on web), animated gold car marker.
- WIRED: Rider active-trip screen now uses InteractiveMap (replaces blurry static image).
- NEW: API helpers — customerForgotPassword, validatePromo, driverGetBookingDetail, driverUpdateBookingStatus, driverRecordWaitTime, driverRecordMidTripStop.

**Testing:**
- iteration_27.json — 20/20 passed, 2 CRITICAL bugs found in mid-trip-stop endpoint.
- iteration_28.json — 24/24 passed, all critical bugs fixed and verified. 2 minor non-blocking issues (pre-existing in token endpoints too): re-geocoding on each call (cost concern); admin dashboard field naming.

## Session — Feb 20, 2026 (fork) — continued (3rd batch)
**P0 Fixes — Admin map / Consent / Cancel trip / Stripe redirect / Pickup pin:**

Backend (`server.py`):
- NEW: `POST /api/customer/bookings/{booking_id}/cancel` (JWT-customer auth) — same business rules as the token-based endpoint; unpaid = immediate cancel, paid = `cancellation_requested` flag + admin SMS.
- FIXED: `/api/customer/book-and-pay` success_url detection — now uses User-Agent (was incorrectly checking `notes` field which mobile never sends). Browsers get the `/m/` https fallback; native apps get the `turanelitelimo://thank-you` deep link.
- ENHANCED: `/api/customer/bookings/{id}/driver-location` now lazily geocodes + caches `pickup_coord` and `dropoff_coord` on the booking, returned in the response — enables route polyline + pickup pin on the rider live-tracking map.

Web (`frontend/src`):
- FIXED: `components/admin/LiveDriversTab.jsx` — robust loading/error states (was showing blank dark canvas when Maps JS hadn't loaded). Now shows a "Loading map…" spinner, a yellow error banner if the API key is missing or restricted, and a "No drivers yet" empty-state overlay when no drivers have shared GPS.

Mobile (`mobile/app`):
- WIRED: `(rider)/(tabs)/trips.tsx` — each non-completed trip card now has a red Cancel button with a confirmation alert (different copy for paid vs unpaid).
- NEW: `(rider)/pay.tsx` — 3 mandatory consent checkboxes (wait-time, vehicle care, cancellation tier) BEFORE the Pay button activates. Pay button label flips to "Agree to policies to continue" when checkboxes are unchecked.
- ENHANCED: `(rider)/active.tsx` — rider's live-tracking map now shows the **pickup pin** (gold "A" marker) + a **dashed gold polyline** between the driver and pickup (Uber-style "driver is N min away" visualization).
- ENHANCED: `src/components/InteractiveMap.tsx` — added `showRoute` prop that draws a dashed gold polyline from driver → pickup.
- NEW: API helper `customerCancelBooking`.

**Known infrastructure issue (not a code bug):**
- Expo Go tunnel keeps failing in this container due to `ENOSPC: inotify watch limit (12288 in container, can't raise without root)`. The container's metro file watcher exhausts watches on `node_modules`. This is a platform limitation, not the app. **User can still test via web preview at /m/.** When deploying to production, this is not an issue since native bundles are built once via EAS, not watched.

**Testing:**
- iteration_29.json — 17/17 backend tests passed. 0 critical. 3 minor polish suggestions (non-blocking, deferred).

## Session — Feb 20, 2026 (fork) — 4th batch (Modify Trip)

**Backend:**
- NEW: `POST /api/customer/bookings/{id}/modify` (JWT customer). Customer can change pickup time, pickup/dropoff address, vehicle type, passenger count, or notes on UNPAID reservations. Paid bookings return 409 with "call dispatch" message.
- NEW: `CustomerModifyBookingRequest` model (all fields optional).
- Re-quotes the trip automatically when pickup/dropoff/vehicle/time changes (fixed: must `pop('quote_amount')` from merged doc or `_compute_quote_amount` short-circuits).
- Clears `pickup_coord`/`dropoff_coord` geocode cache when address changes.

**Mobile:**
- NEW: `/(rider)/modify.tsx` — full modify trip screen with AddressPicker + DateTimeModal + vehicle/passenger/notes fields. Read-only for paid trips (shows call-dispatch CTA).
- WIRED: trip cards in `(rider)/(tabs)/trips.tsx` now show **Modify** button (only for unpaid non-completed trips) next to the Cancel button.

**Testing:**
- iteration_30.json — 18 tests, 1 CRITICAL bug found (quote short-circuit).
- iteration_31.json — 23/23 passed after one-line fix. Zero critical issues. 4 minor items deferred (notes diff check, quote_recompute_failed flag, modification lead-time guard, response field naming).

## Session — Feb 20, 2026 (fork) — 5th batch (Launch Prep Phase 1)

**iOS / Android launch prep — code-side complete:**
- App icons generated from wolf logo: `icon.png` (1024 master), `adaptive-icon.png` (Android adaptive foreground), `splash.png` (2048×2048), `favicon.png`, `notification-icon.png` — all in `/app/mobile/assets/`.
- `app.json` rewritten for production:
  - Bundle id / package: `com.turanelitelimo.app`
  - Scheme: `turanelitelimo` (matches existing Stripe deep links)
  - iOS Info.plist usage descriptions for foreground + background location, camera, photo library, ITSAppUsesNonExemptEncryption=false
  - Android permissions + universal-link intent filter
  - expo-location + expo-notifications plugins configured
  - Runtime version policy: `appVersion` (enables OTA updates per-version)
- `eas.json` created — development / preview / production build profiles, internal distribution for TestFlight + Android internal testing, app-bundle output for Play Store.
- Added `expo-notifications` + `expo-device` deps (for upcoming push notifications work).

**Public legal pages (Apple/Google both require these URLs before approving the app):**
- NEW: `/privacy` — Privacy Policy page (`PrivacyPolicy.jsx`)
- NEW: `/terms` — Terms of Service page (`TermsOfService.jsx`)
- Both rendered, linked from each other, follow CCPA / GDPR essentials, name every third-party vendor (Stripe, Google Maps, Resend, SMS provider, Apple/Firebase push).

**Documentation:**
- NEW: `/app/memory/LAUNCH_CHECKLIST.md` — step-by-step launch runway, all critical IDs to track, realistic timeline (Day 1 → Day 7 live on stores).

**Status of accounts (user-side, pending):**
- Apple Developer: APPLIED, under Apple review (~24-48h typical).
- Google Play Console: PURCHASING.
- Expo/EAS account: NOT YET CREATED.

**Next step after accounts approved:** I will run `eas init` (assigns permanent projectId), then `eas build --platform ios --profile preview` and `--platform android --profile preview` to produce TestFlight + Internal Testing builds.

## Recurrence/Known Issues
- None as of this session.
- The Expo tunnel URL (`exp://...exp.direct`) rotates whenever the Metro server restarts. Next session must restart tunnel and provide a fresh QR.

## Session — Feb 20, 2026 (fork)
**Fixed:**
- Compile-error overlay bug ("X" popup) — `LiveDriversTab.jsx` `api` import fixed.
- Fleet images: Stretch Limo, Sprinter Van, Party Bus (web + mobile).
- Admin Live Map tab orphaned — added to TabsList.

**Mobile pre-auth welcome screen v2 (`/app/mobile/app/index.tsx`):**
- Hero with logo, phone button, "Sign In" pill (top-right)
- Hero CTAs: "See pricing — no sign-up needed" (primary) + "Already have an account? Sign in" (secondary)
- Replaced "Six vehicles. One standard." → **"A class for every journey"** with network-implying subtitle
- Fleet horizontal carousel (6 vehicle types)
- Services grid (Airport / Corporate / Weddings / Hourly / Wine / Nightlife)
- Coverage (3 airports + 12 cities)
- 3 testimonial reviews
- **Policies & Trust section (NEW)** — collapsible cards: Cancellation, Wait Time & Damages, Privacy, Terms
- Footer with **website link (turanelitelimo.com)** + phone + Driver sign-in
- **Sticky bottom "Book a Ride" CTA bar** (always visible during scroll)
- Auth-aware: logged-in users skip welcome and go to `/home`

**Guest browsing flow (NEW):**
- `(tabs)/_layout.tsx` no longer redirects unauth users — guests can browse the home tab and get live quotes.
- `pay.tsx` shows a "One more step — sign in to confirm" gate for guests.
- `trips.tsx` and `profile.tsx` show "Sign in to see your X" prompts for guests.

**Logo replaced (web + mobile):**
- New logo: gold ring + howling wolf + constellation stars, with "TuranEliteLimo" wordmark.
- `/app/frontend/public/logo-mark.png` — clean 512x512 wolf-in-ring icon (cropped from user's full lockup, no wordmark spillover).
- `/app/frontend/public/logo-full.png` — full lockup (icon + wordmark).
- `/app/frontend/public/logo-mark-1024.png` — high-res variant for App Store icon prep.
- Mobile `theme.ts` `assets.logoMark/logoFull` now point to the preview URLs with cache-busting (`?v=3`).

**Confirmed (no code change needed):**
- Mobile app ↔ Admin pricing: fully connected via `/api/customer/quote` → MongoDB `PRICING_CONFIG`. Admin Pricing tab writes propagate live to mobile.

**Pending user verification:**
- Test on Expo Go (or web preview at `/m/`): new welcome screen, guest booking flow, logo correctness on real device.
