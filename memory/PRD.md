# TuranEliteLimo — Product Requirements Document (Live)

> Last refreshed: Jun 4, 2026 (Feb 2026 development context)

## Original Problem Statement
Build a fully functioning website + native iOS/Android mobile app for TuranEliteLimo (premium chauffeur service, Bay Area). Stack: React + FastAPI + MongoDB + Expo React Native. Features: dynamic pricing, Stripe checkout, admin dashboard, driver live tracking. Recently expanded to: 2026 FIFA World Cup surge ops, custom invoices for affiliate brokered trips, social logins (Apple + Google).

## Live Production
- **Web:** `https://turanelitelimo.com` (deployed via Emergent)
- **iOS:** Live on App Store. TestFlight `v1.1.0 build 41` submitted Jun 4 with Apple + Google Sign-In.
- **Android:** Closed Testing on Play Console (Build #23).

## Recent Changes (this session)
- ✅ **Apple Sign-In RESTORED on iOS v1.1 build 41** — Jun 4, 2026
  - Deleted stale May 21 Expo iOS credentials configuration
  - Generated fresh Distribution Cert (serial `7DC59EBFAB0644...`, expires Jun 4 2027)
  - Generated fresh Provisioning Profile (`Y9HX9B37FC`) with `com.apple.developer.applesignin` entitlement
  - Revoked old May 21 dist cert (Apple 3-cert limit)
  - Skipped Push Notification re-setup to ship faster — will re-add next build
  - Auto-submitted IPA to App Store Connect via ASC API key

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
- Tech debt: Split `server.py` (>7,200 lines) into modular routers
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
