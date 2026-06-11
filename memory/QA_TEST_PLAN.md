# TuranEliteLimo — 51-Step Manual QA Test Plan

> **Updated:** Jun 10, 2026 — after backend refactor (server.py → 4 modular routers), Places autocomplete on FloatingQuoteWidget, auto-apply promos with strike-through pricing, Refer-a-Friend, Push Broadcast, 4 themed landing pages, SmartAppBanner stacking fix, sedan image swap.
>
> **Environment to test:** PREVIEW (the Emergent preview URL). Do NOT click Deploy until this QA passes.
>
> **Credentials**
> - Web Admin: `support@turanelitelimo.com` / `TuronAdmin@2025` (2FA via email)
> - Mobile rider test: create a new account with any unique email + 8+ char password
> - Mobile driver test: `driver.test@turanelitelimo.com` / `DriverPass123!`
> - Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC

---

## A. Public Website — Landing & Quote (Steps 1–10)

| # | Test | Expected |
|---|------|----------|
| 1 | Open homepage `/` on desktop Chrome | Loads under 3s, hero visible, Navbar shows TuranEliteLimo logo, no console errors, sedan image is NOT the old Chinese-signage photo |
| 2 | Open homepage on iPhone (Safari) | Smart App Banner appears at TOP, then PromoBanner, then Navbar — none overlap or hide the logo |
| 3 | Open `/airport` landing page | Page-specific title "Airport Transfer …" in browser tab, hero loads, Floating Quote Widget visible bottom-right |
| 4 | Open `/wedding`, `/wine-tour`, `/corporate` | Each has its own unique title + meta description (View Source → `<title>`) |
| 5 | On `/airport`, click **Floating Quote Widget** | Pickup/Drop-off inputs open, both are autocomplete-enabled |
| 6 | Type "SFO" in pickup field | Google Places dropdown appears with "San Francisco International Airport" |
| 7 | Select prediction, type "Napa" in drop-off | Drop-off predictions appear; select one |
| 8 | Set a future date+time, click "Get Quote" | Redirects to `/?pickup=...&dropoff=...&date=...#booking` and scrolls to booking form with fields pre-filled |
| 9 | On homepage booking form, fill all required fields for Executive Sedan, Airport Transfer, 2 pax, valid future date | "Get Instant Quote" returns vehicle cards with prices |
| 10 | Verify quote response shape | Each vehicle card shows: vehicle name, price, vehicle image (sedan = new clean photo) |

---

## B. Auto-Apply Promo + Strike-Through Pricing (Steps 11–15)

| # | Test | Expected |
|---|------|----------|
| 11 | Admin → Promos tab → confirm at least one promo has `auto_apply=true` and is active (e.g., WELCOME20) | Toggle visible, can be flipped on/off |
| 12 | On public booking form, get a quote that should qualify for the auto-apply promo | At least one vehicle card shows strike-through original price + bold gold new price + "Save $X · CODE" badge |
| 13 | Click that vehicle to select it | Booking form's Promo Code input auto-populates with the promo code |
| 14 | Proceed to checkout | Final total reflects the discount; Stripe checkout opens at the discounted amount |
| 15 | Admin → Promos → toggle off auto_apply → public form again | Strike-through gone; promo code input NOT auto-populated |

---

## C. Booking + Stripe Checkout (Steps 16–20)

| # | Test | Expected |
|---|------|----------|
| 16 | Complete booking form with valid data, click "Book Now → Pay" | Redirects to Stripe Checkout in <2s |
| 17 | Pay with Stripe test card `4242 4242 4242 4242` | Redirects to `/thank-you?session_id=...` showing confirmation + Google Ads conversion fires (check DevTools Network → `googleadservices.com`) |
| 18 | Check inbox of the email used | Receives booking confirmation email from `noreply@turanelitelimo.com` with manage-link |
| 19 | Open manage-link in incognito window | Shows booking details, allows cancel (within window) |
| 20 | Admin → Bookings tab → new booking appears with unread highlight | Click → mark-as-read works; status shows "Confirmed" with paid badge |

---

## D. Refer-a-Friend (Steps 21–25)

| # | Test | Expected |
|---|------|----------|
| 21 | Sign up new customer A on `/customer/signup` | Account created, JWT set, redirected to dashboard or home |
| 22 | Visit `/refer` as customer A | Page shows unique `REF-XXXXXX` code, share URL `/r/REF-XXXXXX`, stats (0/0), empty earned-promos table |
| 23 | Copy `/r/REF-XXXXXX` URL → open in NEW incognito window | Lands on home with WELCOME20 auto-applied (toast or banner confirms); `ref_code` saved to localStorage |
| 24 | In that incognito, sign up customer B and complete a paid booking | Booking succeeds with WELCOME20 discount applied |
| 25 | Back as customer A on `/refer` | Stats update: 1 referred / 1 completed. Earned promos table shows new `THANKS-XXXXXX` ($25 off) credit. Customer A also receives an email about the reward |

---

## E. Customer Auth + Profile (Steps 26–30)

| # | Test | Expected |
|---|------|----------|
| 26 | Logout, then login with customer A's credentials | JWT issued, profile page accessible |
| 27 | Profile → Notification Prefs | Loads with defaults (push: ride_updates=on, promotions=off; email: ride_updates=on, promotions=off, receipts=on). **Does NOT 404 on fresh accounts** ← this is the bug we just fixed |
| 28 | Edit notification prefs → toggle promotions off → Save | Saves successfully; reload confirms persistence |
| 29 | Change password → enter old + new → Save | Success toast; logout + login with new password works |
| 30 | "Forgot password" flow on login page | Email arrives with reset link; reset works |

---

## F. Driver Dispatch URL (Steps 31–34)

| # | Test | Expected |
|---|------|----------|
| 31 | Admin → Bookings → pick a confirmed booking → Assign Driver (use a real driver from roster) | Driver receives SMS with dispatch URL; admin sees green "Assigned to {name}" badge |
| 32 | Open driver dispatch URL (`/driver/{token}`) in incognito | Trip details visible; status buttons (On the way / Arrived / Completed) work |
| 33 | Click "Flight Landed" (if Airport Transfer) | Records timestamp; wait-time counter starts after grace period |
| 34 | Record wait-time / mid-trip stop → check admin can see + charge | Admin → Booking → "Charge Wait Time" creates Stripe charge using saved card |

---

## G. Admin Dashboard — All Tabs (Steps 35–45)

| # | Test | Expected |
|---|------|----------|
| 35 | Admin login → email arrives with 6-digit 2FA code → enter | Lands on dashboard, no black screen, all tabs visible |
| 36 | **Bookings** tab | Lists bookings; filters work; unread highlight works |
| 37 | **Drivers** tab | Roster CRUD works; phone formatting normalized |
| 38 | **Promos** tab | CRUD works; `auto_apply` toggle persists on PATCH (this was a silent-fail bug we fixed) |
| 39 | **Announcements** tab | Can create banner + homepage announcement; appears live on public site |
| 40 | **Push Broadcast** tab | Eligible-count loads; preview renders; "Send to me only" (test mode) sends a push to admin's mobile app; history table updates |
| 41 | **Email Broadcast (Compose Promo)** tab | Preview iframe renders; test send works; full send is gated |
| 42 | **Quote Requests** tab | Call-only vehicle requests (Stretch, Party Bus, Sprinter) listed; status updates |
| 43 | **Surge Events** tab | Create/edit surge multiplier for date range; affects public quotes during window |
| 44 | **Zones / Pricing** tab | Edit per-mile or hourly rate → immediately reflected in next public quote |
| 45 | **Settings** tab | Edit deposit %, service fee %, meet-greet fee → saves and applies to next quote |

---

## H. Mobile Rider App (Steps 46–49)

> Test on Expo Go via the rotating tunnel URL OR on TestFlight build 41 (iOS) / Closed Testing build 23 (Android).

| # | Test | Expected |
|---|------|----------|
| 46 | Open app → splash → login screen | Apple Sign-In (iOS) + Google Sign-In + email/password all visible |
| 47 | Sign up new rider via email | Account created; lands on Home tab; profile completion gate if name/phone missing |
| 48 | Book a ride end-to-end: pick vehicle → pay with test card → confirmation | Booking shows in My Trips; push token registered |
| 49 | Receive a Push Broadcast (trigger from admin in test mode targeting your account) | Notification arrives within 30s on the device |

---

## I. Mobile Driver App (Steps 50–51)

| # | Test | Expected |
|---|------|----------|
| 50 | Login as `driver.test@turanelitelimo.com` / `DriverPass123!` | Sees assigned trips list; live location prompt appears |
| 51 | Open an assigned trip → tap "On the way" → "Arrived" → "Completed" | Status syncs to admin dashboard; customer receives status push; trip moves to history |

---

## Sign-off

- [ ] All 51 tests pass on PREVIEW
- [ ] No console errors on web pages
- [ ] No `ERROR` lines in `/var/log/supervisor/backend.err.log` during the test run
- [ ] Stripe test charges visible in Stripe test dashboard
- [ ] Push notifications received on mobile device
- [ ] Emails received (booking confirmation, referral reward, broadcast)

**If everything passes → click Deploy in Emergent platform.**
**If anything fails → tell me the step # + what you saw, I'll fix it. We can always Rollback after deploy if needed.**
