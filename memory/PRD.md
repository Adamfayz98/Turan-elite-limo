# TuranEliteLimo — Product Requirements (PRD)

## Original problem statement
Build a fully functioning website and a native mobile application (iOS/Android) for a limo business (TuranEliteLimo) operating in the Bay Area. Includes admin page, live price quotes, direct-to-Stripe payment flow, Google Places autocomplete, custom zone surcharges, driver dispatch, and real-time driver location tracking.

## Personas
- **Rider**: Books rides, pays via Stripe (Apple Pay supported), tracks driver live.
- **Driver**: Receives dispatch, navigates to pickup, shares GPS during trip.
- **Admin**: Manages bookings, pricing, drivers, promos, refunds.

## Core architecture
- **Web**: React + Tailwind + Shadcn (frontend) → FastAPI backend → MongoDB.
- **Mobile**: Expo SDK 54 React Native, native maps, EAS builds & OTA updates.
- **Integrations**: Stripe (payments), Resend (email), Twilio (SMS), Google Maps / Places, Expo Push.

## Legal/Business entity
- Operating as a **sole proprietor** under personal EIN: **Abdulkhafiz Fayzullaev**
- Trade name (DBA): TuranEliteLimo
- Apple Developer enrollment: Individual (Abdulkhafiz Fayzullaev)
- Copyright: `2026 Abdulkhafiz Fayzullaev`
- Apple DSA Trader info submitted with sole-prop details

## Implemented (Done)
- Full web app (turanelitelimo.com) with admin 2FA dashboard
- Mobile app: Rider + Driver modes
- Stripe Checkout with `setup_future_usage=off_session` (card saved for Phase 2 charges)
- Google Maps native, Apple Pay button, Promo code engine (WELCOME20 20% off)
- Live GPS driver tracking with polling fallback
- Driver "Forgot Password" flow (web + mobile)
- iOS map z-indexing fixed, SafeAreaInsets patched
- Android Stripe redirect fixed (OTA polling)
- Android app built + submitted to Google Play Internal Testing
- iOS Build #26 submitted to App Store Connect
- **iOS App Store submission — Waiting for Review (submitted 2026-05-24)**
  - Submission ID: a1b938eb-38ec-4432-87ec-e637885c3d78
  - DSA Trader info submitted under personal legal name
  - All metadata (description, keywords, screenshots, demo credentials) populated
  - Pricing: Free tier, US only
  - Manual release enabled

## Pending / Roadmap
### P0
- **Wait for Apple App Store review** (~2–4 days, holiday weekend factor)
- Once approved → click "Release This Version" in App Store Connect

### P1
- Google Play Console "Set up your app" checklist (App access, Privacy policy, Data safety, Content rating)
- Android rebuild with corrected app icon padding (`eas build --platform android`)

### P3
- Saved Addresses (Home/Work) for riders → one-tap rebooking
- Mobile UX polish: rename "Book" tab to "Home", swap icon, add back button on booking page
- In-app Settings (notifications, change password, delete account)
- Tech debt: split `server.py` (>6800 lines) into modular routers
- **[Web DONE 2026-05-25] Sprinter trim split: Standard / Executive / Jet Sprinter cards** — *Reminder:* Replicate in mobile app `/app/mobile/src/lib/fleet.ts` (if exists) or the equivalent vehicle list. JS-only OTA-able change.

### P4
- "Refer a Friend" $25 credit flow (bumped consideration to P1 post-launch for viral growth)
- Add `403` validation for spoofed `active_booking_id` in driver location POST

## Health check
- Broken: None
- Mocked: None
- All production flows tested working

## Key credentials
- Admin: support@turanelitelimo.com / TuronAdmin@2025
- Test Driver: driver.test@turanelitelimo.com / DriverPass123!
- Test Rider: rider.test@turanelitelimo.com / RiderPass123!
