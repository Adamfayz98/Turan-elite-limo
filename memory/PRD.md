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

## What's Live / Done (2026-05-25 → 26)
### iOS App
- iOS Build #26 submitted to App Store Connect — **Waiting for Review** (Submission ID: a1b938eb-38ec-4432-87ec-e637885c3d78)
- Pricing: Free, US only; Manual release; Age rating 12+

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
- Collect 12 Gmail testers for Play Console closed test → 14-day clock starts on approval
- Apply for Google Play Production access after 14 days of closed testing
- Android rebuild with corrected app icon padding (P2 backlog)
- Pause duplicate "Purchase (2)" Google Ads conversion action

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
