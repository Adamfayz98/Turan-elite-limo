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

## Recurrence/Known Issues
- None as of this session.
- The Expo tunnel URL (`exp://...exp.direct`) rotates whenever the Metro server restarts. Next session must restart tunnel and provide a fresh QR.

## Session — Feb 20, 2026 (fork)
**Fixed:**
- Compile-error overlay bug ("X" popup that wouldn't dismiss) — root cause: `LiveDriversTab.jsx` imported `api` as default but module only has named exports. Switched to `import { api } from "@/lib/api"`.
- Fleet images replaced — Stretch Limousine (white limo, web+mobile), Party Bus (LED interior, web+mobile, the palm-trees photo was egregious), Sprinter Van (mobile now matches web's user-uploaded photo).
- Admin Live Map tab was orphaned — TabsTrigger never added. Now visible.

**Added — Mobile pre-auth marketing welcome screen (`/app/mobile/app/index.tsx`):**
- Hero ("Arrive in unspoken luxury") with rating, 24/7, insurance stats
- Fleet horizontal carousel (6 vehicles)
- Services grid (Airport / Corporate / Weddings / Hourly / Wine / Nightlife)
- Coverage section (3 airports + 12 cities)
- 3 testimonial reviews
- Final CTA → Sign in / Book + small Driver link
- Auth-aware: redirects to `/home` if user already logged in
- Rationale: cold app-store downloaders see what TuranEliteLimo offers before hitting a login wall

**Pending user verification (mobile, M4 fixes from previous session):**
- Date/Time picker modal
- Settings menu wiring
- Rating screen after trip
- Call for Quote on call-only vehicles
