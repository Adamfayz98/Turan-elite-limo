# TuranEliteLimo — 62-Step Manual QA Test Plan

> **Updated:** Feb 12, 2026 — adds full 6-vehicle studio-shot regression (Cadillac XTS, Mercedes S-Class, Escalade, Sprinter, Hummer Stretch, Party Bus), quote-request flow for call-only vehicles, and Apple/Google Sign-In end-to-end.
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
| 1 | Open homepage `/` on desktop Chrome | Loads under 3s, hero visible, Navbar shows TuranEliteLimo logo, no console errors |
| 2 | Open homepage on iPhone (Safari) | Smart App Banner appears at TOP, then PromoBanner, then Navbar — none overlap or hide the logo |
| 3 | Open `/airport` landing page | Page-specific title "Airport Transfer …" in browser tab, hero loads, Floating Quote Widget visible bottom-right |
| 4 | Open `/wedding`, `/wine-tour`, `/corporate`, `/worldcup2026` | Each has its own unique title + meta description (View Source → `<title>`) |
| 5 | On `/airport`, click **Floating Quote Widget** | Pickup/Drop-off inputs open, BOTH are Google Places autocomplete-enabled |
| 6 | Type "SFO" in pickup field | Dropdown appears with "San Francisco International Airport" |
| 7 | Select prediction, type "Napa" in drop-off | Drop-off predictions appear; select one |
| 8 | Set a future date+time, click "Get Quote" | Redirects to `/?pickup=...&dropoff=...&date=...#booking` and scrolls to booking form with fields pre-filled |
| 9 | On homepage booking form, fill all required fields for Executive Sedan, Airport Transfer, 2 pax, valid future date | "Get Instant Quote" returns vehicle cards with prices |
| 10 | Verify quote response shape | Each priced vehicle shows: vehicle name, price, vehicle image (no broken / zoomed-in photos) |

---

## B. Fleet Studio Photos — All 6 Vehicles Render Fully (Steps 11–14) **NEW**

> Critical visual regression. The user-supplied 1500×1000 studio shots on dark background should fill the card without being cropped/zoomed-in.

| # | Test | Expected |
|---|------|----------|
| 11 | Web: open the Fleet section (homepage → "Fleet" nav) | All 8 cards render. Vehicles visible: **Cadillac XTS** (Executive Sedan), **Mercedes S-Class** (First Class), **Cadillac Escalade ESV** (Luxury SUV), **Mercedes Sprinter** (Sprinter/Executive Sprinter/Jet Sprinter), **Hummer Stretch** (Stretch Limousine), **Black Party Bus** (Party Bus). Each car is FULLY visible — no front bumper, roof or wheels cut off. |
| 12 | Web: resize browser window from 1920px → 1280px → 768px (mobile) | Vehicles stay fully visible at every breakpoint; cards reflow but cars never get cropped |
| 13 | Web: open `/airport`, `/wedding`, `/wine-tour`, `/corporate`, `/worldcup2026` | Any vehicle imagery on these pages uses the new studio shots (no generic Unsplash limo/party-bus) |
| 14 | Mobile app (after website deploy): open Home + Vehicle picker | Same 6 studio shots load via `https://turanelitelimo.com/fleet/*.jpg`. Background blends with the dark app — no light-gray studio backdrop bleed |

---

## C. Auto-Apply Promo + Strike-Through Pricing (Steps 15–19)

| # | Test | Expected |
|---|------|----------|
| 15 | Admin → Promos tab → confirm at least one promo has `auto_apply=true` AND `show_on_banner=true` AND is active (e.g., WELCOME20) | Both toggles visible, persist on PATCH |
| 16 | Public homepage: top yellow promo banner displays the WELCOME code and discount | Banner readable on desktop + mobile; dismissable |
| 17 | On public booking form, get a quote that should qualify for the auto-apply promo | At least one vehicle card shows strike-through original price + bold gold new price + "Save $X · CODE" badge |
| 18 | Click that vehicle to select it | Booking form's Promo Code input auto-populates with the promo code |
| 19 | Proceed to checkout | Final total reflects the discount; Stripe checkout opens at the discounted amount |

---

## D. Booking + Stripe Checkout (Steps 20–24)

| # | Test | Expected |
|---|------|----------|
| 20 | Complete booking form with valid data, click "Book Now → Pay" | Redirects to Stripe Checkout in <2s |
| 21 | Pay with Stripe test card `4242 4242 4242 4242` | Redirects to `/thank-you?session_id=...` showing confirmation + Google Ads conversion fires (check DevTools Network → `googleadservices.com`) |
| 22 | Check inbox of the email used | Receives booking confirmation email from `noreply@turanelitelimo.com` with manage-link |
| 23 | Open manage-link in incognito window | Shows booking details, allows cancel (within window) |
| 24 | Admin → Bookings tab → new booking appears with unread highlight | Click → mark-as-read works; status shows "Confirmed" with paid badge |

---

## E. Quote Requests (Call-Only Vehicles) (Steps 25–27) **NEW**

> Stretch Limousine, Executive Sprinter, Jet Sprinter, Party Bus = call-only. They show "Quote" + "Call" buttons instead of a flat-rate price.

| # | Test | Expected |
|---|------|----------|
| 25 | On booking form, click "Quote" on the Party Bus card | Quote-request modal opens with vehicle pre-selected. Form: name, email, phone, pickup, drop-off, date/time, pax, notes |
| 26 | Submit a quote request | Success toast; user receives email confirmation "We received your quote request"; admin gets notification email |
| 27 | Admin → Quote Requests tab | New row appears with status "New". Update status → user receives an email if you reply with a price |

---

## F. Refer-a-Friend (Web) (Steps 28–32)

| # | Test | Expected |
|---|------|----------|
| 28 | Sign up new customer A on `/customer/signup` | Account created, JWT set, redirected to dashboard or home |
| 29 | Visit `/refer` as customer A | Page shows unique `REF-XXXXXX` code, share URL `/r/REF-XXXXXX`, stats (0/0), empty earned-promos table |
| 30 | Copy `/r/REF-XXXXXX` URL → open in NEW incognito window | Lands on `/r/REF-XXXXXX` invite page with referrer first name + "$20 off"; WELCOME20 saved to localStorage |
| 31 | In that incognito, sign up customer B and complete a paid booking with WELCOME20 | Booking succeeds with WELCOME20 discount applied |
| 32 | Back as customer A on `/refer` | Stats update: 1 referred / 1 completed. Earned promos table shows new `THANKS-XXXXXX` ($25 off) credit. Customer A also receives a referral-reward email |

---

## G. Customer Auth + Profile (Steps 33–37)

| # | Test | Expected |
|---|------|----------|
| 33 | Logout, then login with customer A's credentials | JWT issued, profile page accessible |
| 34 | Profile → Notification Prefs | Loads with defaults (push: ride_updates=on, promotions=off; email: ride_updates=on, promotions=off, receipts=on). **Does NOT 404 on fresh accounts** |
| 35 | Edit notification prefs → toggle promotions off → Save | Saves successfully; reload confirms persistence |
| 36 | Change password → enter old + new → Save | Success toast; logout + login with new password works |
| 37 | "Forgot password" flow on login page | Email arrives with reset link; reset works |

---

## H. Social Login — Google + Apple (Steps 38–41) **NEW**

| # | Test | Expected |
|---|------|----------|
| 38 | Web: `/customer/login` → "Continue with Google" | Google one-tap or popup opens; on success, account is created/linked and lands on home or `/refer` |
| 39 | iOS app: TestFlight build → Sign in screen → "Continue with Apple" | Apple Face/Touch ID prompt; on success, lands on Home tab; profile shows Apple-provided name (or "Hide My Email" relay address) |
| 40 | iOS app: "Continue with Google" | Google sheet opens; on success, lands on Home tab |
| 41 | Android app: Closed Testing build → "Continue with Google" | Google account picker → success → Home tab |

---

## I. Driver Dispatch URL (Steps 42–45)

| # | Test | Expected |
|---|------|----------|
| 42 | Admin → Bookings → pick a confirmed booking → Assign Driver (use a real driver from roster) | Driver receives SMS with dispatch URL; admin sees green "Assigned to {name}" badge |
| 43 | Open driver dispatch URL (`/driver/{token}`) in incognito | Trip details visible; status buttons (On the way / Arrived / Completed) work |
| 44 | Click "Flight Landed" (if Airport Transfer) | Records timestamp; wait-time counter starts after grace period |
| 45 | Record wait-time / mid-trip stop → check admin can see + charge | Admin → Booking → "Charge Wait Time" creates Stripe charge using saved card |

---

## J. Admin Dashboard — All Tabs (Steps 46–56)

| # | Test | Expected |
|---|------|----------|
| 46 | Admin login → email arrives with 6-digit 2FA code → enter | Lands on dashboard, no black screen, all tabs visible |
| 47 | **Bookings** tab | Lists bookings; filters work; unread highlight works |
| 48 | **Drivers** tab | Roster CRUD works; phone formatting normalized |
| 49 | **Promos** tab | CRUD works; `auto_apply` AND `show_on_banner` toggles persist on PATCH |
| 50 | **Announcements** tab | Can create banner + homepage announcement; appears live on public site |
| 51 | **Push Broadcast** tab | Eligible-count loads; preview renders; "Send to me only" (test mode) sends a push to admin's mobile app; history table updates |
| 52 | **Email Broadcast (Compose Promo)** tab | Preview iframe renders; test send works; full send is gated |
| 53 | **Quote Requests** tab | Call-only vehicle requests (Stretch, Party Bus, Sprinters) listed; status updates trigger email replies |
| 54 | **Surge Events** tab | Create/edit surge multiplier for date range; affects public quotes during window |
| 55 | **Zones / Pricing** tab | Edit per-mile or hourly rate → immediately reflected in next public quote |
| 56 | **Settings** tab | Edit deposit %, service fee %, meet-greet fee → saves and applies to next quote |

---

## K. Mobile Rider App (Steps 57–60)

> Test on Expo Go via the rotating tunnel URL OR on TestFlight build 41 (iOS) / Closed Testing build 23 (Android).

| # | Test | Expected |
|---|------|----------|
| 57 | Open app → splash → login screen | Apple Sign-In (iOS) + Google Sign-In + email/password all visible |
| 58 | Sign up new rider via email | Account created; lands on Home tab; profile completion gate if name/phone missing |
| 59 | Book a ride end-to-end: pick vehicle → pay with test card → confirmation | Booking shows in My Trips; push token registered |
| 60 | Receive a Push Broadcast (trigger from admin in test mode targeting your account) | Notification arrives within 30s on the device |

---

## L. Mobile Driver App (Steps 61–62)

| # | Test | Expected |
|---|------|----------|
| 61 | Login as `driver.test@turanelitelimo.com` / `DriverPass123!` | Sees assigned trips list; live location prompt appears |
| 62 | Open an assigned trip → tap "On the way" → "Arrived" → "Completed" | Status syncs to admin dashboard; customer receives status push; trip moves to history |

---

## M. Mobile Referral Deep-Linking (Bonus, requires OTA + website deploy)

| # | Test | Expected |
|---|------|----------|
| D1 | Phone WITH app installed: tap a referral link `https://turanelitelimo.com/r/REF-XXXXXX` from Messages/WhatsApp | Opens the APP directly on a gold "You're invited" screen showing referrer's name and "$20 off your first ride" |
| D2 | On that invite screen, tap "Claim $20 & Create Account" | Lands on signup tab with gold banner "_Name_'s invite is active — $20 off your first ride" |
| D3 | Complete signup (email/password OR Google/Apple) | Account created; referrer's `/refer` page → "Friends signed up" count +1 |
| D4 | Phone WITHOUT app installed: tap same referral link | Falls back to the WEB invite page — no broken screen |
| D5 | As signed-in app user, tap a referral link | Invite screen shows "You're already signed in" note + "Book a Ride" button → goes to Home |

---

## Sign-off

- [ ] All 62 tests pass on PREVIEW
- [ ] No console errors on web pages
- [ ] No `ERROR` lines in `/var/log/supervisor/backend.err.log` during the test run
- [ ] Stripe test charges visible in Stripe test dashboard
- [ ] Push notifications received on mobile device
- [ ] Emails received (booking confirmation, referral reward, broadcast, quote request reply)

**If everything passes → click Deploy in Emergent platform.**
**If anything fails → tell me the step # + what you saw, I'll fix it. We can always Rollback after deploy if needed.**
