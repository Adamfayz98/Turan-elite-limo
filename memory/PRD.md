# TuranEliteLimo — Product Requirements (PRD)

## Original problem statement
Full-stack web app + native mobile apps (iOS/Android) for a Bay Area chauffeur service with admin, live quotes, Stripe payments, Google Places, custom zones, driver dispatch, and live GPS tracking.

## Business
- Sole proprietor: Abdulkhafiz Fayzullaev (DBA TuranEliteLimo)
- Address: 501 Broadway #251, Millbrae CA 94030
- Phone: +1 650-410-0687 / Email: support@turanelitelimo.com
- Apple Developer: Individual; Copyright "2026 Abdulkhafiz Fayzullaev"

## Architecture
- Web: React + Tailwind + Shadcn → FastAPI → MongoDB
- Mobile: Expo SDK 54 (EAS builds + OTA updates)
- Integrations: Stripe, Resend, Twilio, Google Maps/Places, Expo Push, Google Ads (AW-18168374727)

## What's Live / Done (2026-05-25 → 31)

### Landing page conversion upgrades (2026-05-31)
- **TrustBanner**: 4-badge bar under hero — 5-Star Rated, Licensed & Insured (TCP), Live Driver Tracking, Free Cancellation 24h+ (`/app/frontend/src/components/TrustBanner.jsx`)
- **StickyMobileCTA**: floating "Get Instant Quote" button on mobile after hero scroll (`/app/frontend/src/components/StickyMobileCTA.jsx`)
- **Hero eyebrow**: rewritten to "Northern California · Bay Area · SFO · OAK · SJC" for high-intent ad-keyword visibility
- **Status**: shipped to preview, needs Deploy to push to production
- **Why**: 120 ad clicks → 0 attributed conversions in 15 days; landing page funnel was the bottleneck

### Google Ads — Account fixed (2026-05-31)
- **Final URL expansion**: turned BACK ON (had been off → impressions dropped 99% May 28)
- **Bid strategy**: switched from "Maximize Conv Value + 150% ROAS" → "Maximize Conversions" (no ROAS target until 30+ data points)
- **Conversion tracking verified**: code is correct and deployed; "Inactive" status due to zero ad-attributed paid bookings (clicks weren't completing payment)


### iOS App
- **🎉 LIVE ON THE APP STORE (2026-05-29):** https://apps.apple.com/us/app/turanelitelimo/id6771610380
- iOS Build #26 — Approved 2026-05-28, released manually 2026-05-29 02:58 PT
- Pricing: Free, US only; Age rating 12+
- 12 phone screenshots + 5 metadata blocks live

### Android App
- Build #22 (versionCode 22) built and submitted to Play Console Internal Testing
- `ACCESS_BACKGROUND_LOCATION` permission **removed** → bypassed Google's prominent-disclosure / video requirement
- Closed Test track set up — needs 12 Gmail testers, 14-day clock starts on approval
- Production form filled: privacy, ads, content rating (12+), target audience 18+, data safety, financial features, government/health = N/A
- Store listing: name, descriptions (75 / ~2,180 chars), keywords, app icon 512×512, feature graphic 1024×500, 4 phone screenshots + 4 tablet shots uploaded

### Stripe checkout
- **Bug fixed (2026-05-25)**: Mobile `/api/customer/book-and-pay` was charging full quote + 3.5% fee without applying promo discount → fixed; now mirrors web flow exactly. Mobile UI also fetches `/api/settings/public` for real service-fee % (was hardcoded to 2%).
- Receipt fields persisted: `original_quote_amount`, `discount_amount`, `quote_amount` (post-discount), `promo_code`

### Fleet — Sprinter trims
- Split single "Sprinter Van" → **Sprinter Van / Executive Sprinter / Jet Sprinter** on web (`/app/frontend/src/lib/fleet.js`) and mobile (`vehicle.tsx`, `discover.tsx`, `index.tsx`)
- Backend `VEHICLE_TYPES` + `DEFAULT_VEHICLE_PRICING` updated → auto-seeded to MongoDB on restart
- **TODO**: replace shared photo with 3 distinct fleet photos when available

### Google Ads
- Google site tag (`GoogleSiteTag` component) loaded via env var on every page
- Conversion tracking (`GoogleAdsConversion` component) fires `gtag('event', 'conversion')` on `/thank-you` with real `value` and `transaction_id`
- Env: `REACT_APP_GADS_CONVERSION_ID=AW-18168374727`, `REACT_APP_GADS_CONVERSION_LABEL=JFulCI61t64cEMfLrddD`
- Negative keyword list (29 keywords) applied to campaign
- Bidding: Maximize Conversion Value, Target ROAS 300%

### Mobile bug fixes (OTAs shipped)
- Driver auto-logout on app background → root layout now calls `useDriverAuth.hydrate()`, driver profile persisted to SecureStore
- iPhone map zoom-out → `InteractiveMap` only auto-fits on `fitPoints` signature change (3-decimal rounding), not every GPS tick

## Pending / Roadmap
### P0
- Wait for Apple App Store review (submitted 2026-05-24, ~2-4 days)
- Once approved → click "Release This Version"
- Google Ads conversion label snippet wired but waiting for production deploy to fully validate
- **FIFA 2026 prep (June 11 – July 6)**: customer-acquisition +30%, +Spanish/Russian/Mandarin, +Levi's Stadium location, FIFA headlines + negatives, call extension

### P1
- Collect 12 Gmail testers for Play Console closed test → ✅ submitted 2026-05-30, **11/13 opted in as of 2026-05-31** (need just 1 more — add a 14th tester for safety buffer)
- Apply for Google Play Production access after 14 days of closed testing
- Android rebuild with corrected app icon padding (P2 backlog)
- Pause duplicate "Purchase (2)" Google Ads conversion action

### Mobile Auth Overhaul — CREDENTIALS WIRED IN (2026-06-01)
**Status**: Backend verifying real Apple/Google tokens ✅. Mobile config has all 3 Client IDs ✅. Ready for EAS native rebuild.

**Credentials gathered (all under `adamfayz98@gmail.com` / `TuranEliteLimo-Play` Google Cloud project)**:
- Apple bundle ID: `com.turanelitelimo.app` (Sign In with Apple enabled in Apple Developer Console)
- Apple Team ID: `9M7CK4W8HM`
- Google Web Client ID: `189018951603-q3v12pt0s3a4gutk4vbfbfk87sdljqve.apps.googleusercontent.com`
- Google iOS Client ID: `189018951603-igffflan53r4ftnpnu5pj680k29kofgv.apps.googleusercontent.com`
- Google Android Client ID: `189018951603-rk97c100e37uobml9nvauo4mjq2rpbgd.apps.googleusercontent.com`
- Android SHA-1: `AC:99:46:BC:C3:61:D6:53:3E:8A:CC:9A:9B:A4:71:E8:4C:A0:A0:09`
- Google OAuth consent screen status: **TESTING** mode (must publish to Production before live launch)

**Where credentials live**:
- `/app/backend/.env`: `APPLE_BUNDLE_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_WEB_CLIENT_ID`
- `/app/mobile/app.json`: `extra.googleSignIn.{iosClientId, androidClientId, webClientId}` + Google plugin `iosUrlScheme` reversed
- `/app/mobile/src/auth/googleSignIn.ts`: reads from `Constants.expoConfig.extra.googleSignIn`

**Backend smoke test (2026-06-01)**: both `/api/customer/oauth/google` and `/api/customer/oauth/apple` now correctly reject fake tokens with provider-specific JWKS errors (not "not configured") — verification chain is live.

**Remaining steps**:
1. Publish Google OAuth consent screen → Production (1 click in Google Cloud Console)
2. `eas build -p ios --profile production` (bump version to 1.1.0)
3. `eas build -p android --profile production` (versionCode 23)
4. Test dev clients on real devices: Apple sign-in (iOS), Google sign-in (iOS+Android), email/password fallback
5. Submit iOS v1.1 → App Store re-review (~2-4 days)
6. Promote Android closed test → production (after 14-day window completes)
7. Ship both together


### Saved Addresses — ALREADY BUILT ✅
- Backend: `/api/customer/me/addresses` (GET/POST/DELETE) — `server.py` line 4824+
- Mobile screen: `/app/mobile/app/(rider)/addresses.tsx`
- Already integrated into booking home flow (`home.tsx` uses saved addresses)
- No further work needed

### P3
- Saved Addresses (Home/Work) for one-tap rebooking
- Mobile UX polish: rename "Book" tab → "Home", swap icon, add back button on booking page
- In-app Settings (notifications, change password, delete account)
- Tech debt: split `server.py` (>6900 lines) into modular routers
- Replace shared Sprinter photo with 3 unique fleet photos
- Add "prominent disclosure" screen + reinstate `ACCESS_BACKGROUND_LOCATION` for proper Android background GPS (v1.1)
- Refer-a-Friend $25 credit flow (P1 post-launch for viral growth)

## Health
- Broken: None
- Mocked: None

## Credentials
- Admin: support@turanelitelimo.com / TuronAdmin@2025
- Test Driver: driver.test@turanelitelimo.com / DriverPass123!
- Test Rider: rider.test@turanelitelimo.com / RiderPass123!
- Expo: adamfayz98
