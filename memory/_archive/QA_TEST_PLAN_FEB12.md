# TuranEliteLimo — Detailed 62-Step Manual QA Test Plan

> **Updated:** Feb 12, 2026 — every step now includes detailed "What you should see" so a non-technical tester (or CAI) can verify pass/fail without ambiguity.
>
> **Environment to test:** PREVIEW first (https://limo-experience-1.preview.emergentagent.com), then production (https://turanelitelimo.com) after deploy.
>
> **Credentials**
> - Web Admin: `support@turanelitelimo.com` / `TuronAdmin@2025` (a 6-digit code emails on login)
> - Mobile rider test: create a new account with any unique email + 8+ char password
> - Mobile driver test: `driver.test@turanelitelimo.com` / `DriverPass123!`
> - Stripe test card: `4242 4242 4242 4242`, any future expiry, any CVC (e.g., 12/30, 123)

---

## A. Public Website — Landing & Quote (Steps 1–10)

### Step 1 — Homepage loads on desktop
- **Do:** Open `https://turanelitelimo.com/` in Chrome (incognito) on a laptop.
- **What you should see:**
  - Page loads in under 3 seconds.
  - Gold "TuranEliteLimo" logo in the top-left navbar with a stylized horse/crown mark.
  - Hero section with large serif text reading *"Driven by**poise**, designed for the**details.**"* (or similar — the brand line).
  - Top yellow promo banner showing the active code (e.g., "20% OFF — code: WELCOME").
  - "Reserve" gold button top-right.
  - No red errors in browser DevTools Console (F12 → Console tab).

### Step 2 — Homepage loads on iPhone
- **Do:** Open `https://turanelitelimo.com/` in Safari on an iPhone.
- **What you should see:**
  - At the very top: a small "TuranEliteLimo — Open in App" Smart App Banner.
  - Below it: the gold promo banner.
  - Below that: the Navbar with the logo.
  - None of these three overlap; the logo is fully visible and tappable.
  - Hero text doesn't get cut off by the banners.

### Step 3 — Airport landing page
- **Do:** Open `https://turanelitelimo.com/airport`.
- **What you should see:**
  - Browser tab title reads "Airport Transfer · SFO · OAK · SJC — TuranEliteLimo" (or similar — airport-specific).
  - Hero text: *"Flight-tracked transfers. Meet & greet at the curb."*
  - Bottom-right: a floating gold pill button "Get Quote · 60 sec" with a chat icon.

### Step 4 — Each landing page has unique meta
- **Do:** Open `/wedding`, `/wine-tour`, `/corporate`, `/worldcup2026`, `/party-bus` in separate tabs. Right-click → View Page Source on each.
- **What you should see:** Each `<title>` tag and `<meta name="description">` is different and specific to that service. E.g., wedding title contains "Wedding"; party bus title contains "Party Bus · 14–30 Passenger".

### Step 5 — Floating Quote Widget on landing page
- **Do:** On `/airport`, click the bottom-right "Get Quote · 60 sec" button.
- **What you should see:**
  - A small dark panel slides up from the bottom-right with the header "QUICK QUOTE / Tell us your trip".
  - Three fields: **Pickup**, **Drop-off**, **Date** (date is optional).
  - A gold "See Live Quote →" button at the bottom.

### Step 6 — Google Places autocomplete works
- **Do:** Click the **Pickup** field. Type "SFO" slowly.
- **What you should see:**
  - After ~1 second of typing, a dark dropdown appears below the field.
  - First prediction: "San Francisco International Airport / San Francisco, CA, USA" with a gold pin icon.
  - 3–5 total predictions (SFO Domestic Garage, Rental Car Center, etc.).
  - Hovering / tapping a prediction highlights it gold; tapping fills the input.

### Step 7 — Drop-off autocomplete also works
- **Do:** After selecting an SFO pickup, click **Drop-off** field and type "Napa".
- **What you should see:** Predictions for "Napa, CA, USA", "Napa Valley", "Napa County Airport", etc., appear within ~1 second.

### Step 8 — Submit Quote widget → redirects to homepage with prefilled form
- **Do:** Pick a future date (any), then click "See Live Quote →".
- **What you should see:**
  - URL changes to something like `https://turanelitelimo.com/?pickup=San+Francisco+International+Airport...&dropoff=Napa+CA+USA&date=2026-07-15#booking`
  - Page scrolls automatically down to the "Reserve Your Ride" booking form.
  - The Pickup, Drop-off, and Date fields are already filled with the values you entered.

### Step 9 — Get a quote from the booking form
- **Do:** On the booking form (where it scrolled to), confirm Pickup/Drop-off, set Date+Time to any future slot, select Service Type "Airport Transfer", Passengers: 2, type a flight number like "UA123" (the form requires it for airport).
- **What you should see:** Below the form, vehicle cards appear within 2–3 seconds showing prices.

### Step 10 — Vehicle cards display correctly
- **Do:** Examine the vehicle cards that appeared.
- **What you should see:**
  - At least 5 vehicles shown: Executive Sedan, First Class, Luxury SUV, Sprinter Van, Executive Sprinter, Jet Sprinter (call-only), Stretch Limousine (call-only), Party Bus (call-only).
  - Each priced vehicle has a clear flat-rate price (e.g., "$285.00").
  - Each vehicle image shows the **full vehicle** (no zoom-in cropping the front or back of the car) on a clean dark background.
  - Call-only vehicles show "Quote" + "Call" buttons instead of a price.

---

## B. Fleet Studio Photos — All 6 Vehicles Render Fully (Steps 11–14)

### Step 11 — All vehicles fully visible on desktop fleet section
- **Do:** On homepage (`/`), click "Fleet" in the navbar.
- **What you should see:**
  - All 8 vehicle cards display in a grid.
  - **Each vehicle is fully visible in its card** — you should be able to clearly identify:
    - Executive Sedan = black Cadillac XTS sedan with all 4 wheels visible
    - First Class = black Mercedes S-Class sedan
    - Luxury SUV = black Cadillac Escalade ESV (longer than a regular Escalade)
    - Sprinter Van / Executive Sprinter / Jet Sprinter = black Mercedes Sprinter
    - Stretch Limousine = black Hummer H2 Stretch with spare tire on back
    - Party Bus = black box-truck-style party bus with multiple windows
  - No vehicle has its front bumper, wheels, or roof cut off by the card edge.

### Step 12 — Vehicle images stay full at all screen sizes
- **Do:** Resize the browser window from full (1920px wide) → smaller (1280px) → mobile (375px). On phone, just open the site directly.
- **What you should see:** At every width, vehicles remain fully visible. Cards reflow (3-column on desktop → 1-column on mobile) but cars never get cropped tighter.

### Step 13 — Landing pages use the new studio shots
- **Do:** Visit `/airport`, `/wedding`, `/wine-tour`, `/corporate`, `/worldcup2026`, `/party-bus`. Scroll to the "Fleet" section on each.
- **What you should see:** All vehicle imagery uses the new clean studio shots (black cars on dark backgrounds) — NO generic Unsplash stock photos of white limos or random party buses.

### Step 14 — Mobile app shows the same studio shots
- **Do:** Open the TuranEliteLimo app on your phone → Home tab → scroll to the "Fleet" carousel.
- **What you should see:** Same vehicles, same studio look. Tap any vehicle card → vehicle detail screen also shows the studio shot at the top.

---

## C. Auto-Apply Promo + Strike-Through Pricing (Steps 15–19)

### Step 15 — Confirm at least one active auto-apply promo exists
- **Do:** Login as admin → "Promos" tab.
- **What you should see:** At least one promo row (e.g., `WELCOME20`) with the `auto_apply` toggle ON, `show_on_banner` toggle ON, and `active` ON.

### Step 16 — Promo banner shows on public site
- **Do:** Open homepage in a new incognito tab.
- **What you should see:** A thin yellow bar at the top of the page reading something like *"20% OFF your ride · Use code WELCOME at checkout · Book now →"*. Tappable. Can be dismissed with the × on the right.

### Step 17 — Strike-through pricing on qualifying quotes
- **Do:** Get a quote on the homepage booking form for a trip that meets the promo's minimum (default: any ride $50+).
- **What you should see:** At least one vehicle card shows:
  - The **old price** with a line through it (e.g., ~~$310.00~~) in faded white
  - The **new price** in bold gold (e.g., $248.00)
  - A small gold badge below: *"Save $62.00 · WELCOME"*

### Step 18 — Selecting that vehicle auto-fills the promo input
- **Do:** Click the vehicle card with the strike-through price.
- **What you should see:** The "Promo Code" input field in the booking form is now pre-filled with `WELCOME` (or whatever the auto-promo code is). No need to type it manually.

### Step 19 — Discount carries to Stripe checkout
- **Do:** Continue to checkout with that vehicle selected.
- **What you should see:** The Stripe checkout page shows the **discounted total** (e.g., $248.00, not $310.00).

---

## D. Booking + Stripe Checkout (Steps 20–24)

### Step 20 — Book Now redirects to Stripe in <2s
- **Do:** Fill all required booking form fields (pickup, drop-off, date, time, service type, passengers, name, email, phone). Click "Book Now → Pay".
- **What you should see:** Within 2 seconds, the page navigates to a Stripe-hosted checkout page (URL contains `checkout.stripe.com`) showing the trip total, your email, and credit card fields.

### Step 21 — Stripe payment with test card → /thank-you
- **Do:** Enter card `4242 4242 4242 4242`, expiry `12/30`, CVC `123`, ZIP `94102`. Click "Pay".
- **What you should see:**
  - 3–5 seconds of Stripe processing animation
  - Redirect to `https://turanelitelimo.com/thank-you?session_id=cs_test_...`
  - Confirmation page with checkmark icon, "Booking Confirmed" heading, booking ID, trip details, and a "View My Booking" link
  - In browser DevTools → Network tab → filter for `googleadservices.com` — you should see at least one `conversion?random=...` request fire (the Google Ads conversion event).

### Step 22 — Booking confirmation email
- **Do:** Check the inbox of the email you used for the booking.
- **What you should see:** Within 60 seconds, an email from `noreply@turanelitelimo.com` arrives. Subject: "Your Booking is Confirmed — Booking #XXXXXX". Body includes trip details, total paid, and a "Manage Booking" link.

### Step 23 — Manage-link works in incognito
- **Do:** Copy the "Manage Booking" link from the email. Open in a new incognito window.
- **What you should see:** A page showing the booking with all details (date, vehicle, pickup/drop-off, status), a "Cancel" button (if outside the 24h cancellation window), and a "Change date/time" option.

### Step 24 — Admin sees new booking
- **Do:** Login to admin → "Bookings" tab.
- **What you should see:**
  - The new booking appears at the top with a yellow dot/highlight indicating "unread".
  - Status: "Confirmed" with a green "Paid" badge.
  - Clicking the booking row opens detail view; the yellow dot disappears (marked as read).

---

## E. Quote Requests (Call-Only Vehicles) (Steps 25–27)

### Step 25 — Click "Quote" button on a call-only vehicle
- **Do:** On a booking quote page, find the Party Bus card. Click the gold "Quote" button (not "Call").
- **What you should see:** A modal dialog opens with the title "Request a Quote — Party Bus". Form fields: Name, Email, Phone, Pickup, Drop-off, Date/Time, Passengers, Notes.

### Step 26 — Submit a quote request
- **Do:** Fill all fields and submit.
- **What you should see:**
  - A green toast notification appears: "Quote request sent! We'll get back to you within 1 hour."
  - Modal closes.
  - Within 60 seconds, you receive an email confirming "We received your quote request" with a reference number.

### Step 27 — Admin sees the quote request
- **Do:** Admin → "Quote Requests" tab.
- **What you should see:** New row with status "New", showing vehicle (Party Bus), name, email, and trip details. Status dropdown lets admin change to "Quoted", "Won", "Lost". Changing to "Quoted" triggers an automated email to the customer.

---

## F. Refer-a-Friend (Web) (Steps 28–32)

### Step 28 — Sign up customer A
- **Do:** Go to `/customer/signup`. Use email `testA+{timestamp}@gmail.com`, password `Test1234!`, name "Customer A", phone any valid US number.
- **What you should see:** Success → automatically logged in → redirected to homepage or dashboard. JWT stored (check DevTools → Application → Local Storage for `turon_customer_token`).

### Step 29 — `/refer` page shows referral code
- **Do:** Navigate to `/refer` while logged in as Customer A.
- **What you should see:**
  - A unique code prominently displayed (e.g., `REF-AB12CD`)
  - A shareable URL: `https://turanelitelimo.com/r/REF-AB12CD`
  - Stats row: "0 friends invited / 0 completed rides"
  - An empty "Earned credits" table

### Step 30 — Open referral link in incognito
- **Do:** Copy the `/r/REF-AB12CD` URL. Open in a NEW incognito window.
- **What you should see:**
  - A dedicated invite page with a gold accent, reading something like *"You're invited by Customer A — Get $20 off your first ride."*
  - A "Claim $20 & Sign Up" button.
  - In DevTools → Application → Local Storage, a key `referral_code` set to the code.

### Step 31 — Customer B signs up + books with referral
- **Do:** In that incognito window, click "Claim $20", sign up as Customer B (different email), then complete a paid booking using the auto-applied WELCOME20.
- **What you should see:** Booking succeeds with WELCOME20 discount visible on the Stripe checkout total.

### Step 32 — Customer A sees credit
- **Do:** Switch back to Customer A's window → reload `/refer`.
- **What you should see:**
  - Stats updated: "1 friend invited / 1 completed ride"
  - Earned credits table shows a new row: code `THANKS-XXXXXX`, value `$25`, status "Available"
  - Customer A also receives an email: *"Customer B just took their first ride — you earned $25 credit!"*

---

## G. Customer Auth + Profile (Steps 33–37)

### Step 33 — Logout / Login
- **Do:** Log out Customer A. Log back in with the same credentials.
- **What you should see:** Login succeeds within 1 second, JWT re-issued, profile page accessible.

### Step 34 — Notification prefs load (regression test for the 404 bug)
- **Do:** Navigate to Profile → Notification Preferences.
- **What you should see:** Page loads with default toggles:
  - **Push:** Ride updates ON, Promotions OFF
  - **Email:** Ride updates ON, Promotions OFF, Receipts ON
  - **NO 404 error**, no spinner stuck loading.

### Step 35 — Edit and save prefs
- **Do:** Toggle "Email Promotions" ON. Click Save.
- **What you should see:** Green toast "Preferences saved". Reload the page — toggle should still be ON (persisted).

### Step 36 — Change password
- **Do:** Profile → Change Password → enter old + new password (`Test1234!` → `NewPass5678!`). Save.
- **What you should see:** Green toast "Password updated". Log out and log in with the new password — should succeed.

### Step 37 — Forgot password flow
- **Do:** Logout. On login page, click "Forgot Password". Enter the test email. Submit.
- **What you should see:** Toast: "If that email exists, a reset link has been sent." Email arrives within 60s with a reset link. Click → enter new password → save. Login with new password works.

---

## H. Social Login — Google + Apple (Steps 38–41)

### Step 38 — Google sign-in on web
- **Do:** `/customer/login` → click "Continue with Google".
- **What you should see:** Google account picker / OAuth popup. After authorization, the popup closes and you're logged into TuranEliteLimo with your Google email. Profile page accessible.

### Step 39 — Apple sign-in on iOS app
- **Do:** Open TestFlight build of TuranEliteLimo. On the login screen, tap "Continue with Apple".
- **What you should see:** Apple's Face ID / Touch ID prompt appears. After authorization, app lands on the Home tab. Profile shows the name and email Apple provided (which may be a `@privaterelay.appleid.com` address if user chose "Hide My Email").

### Step 40 — Google sign-in on iOS app
- **Do:** Open the app → login screen → tap "Continue with Google".
- **What you should see:** Google account sheet slides up. After picking an account and confirming, app lands on Home tab.

### Step 41 — Google sign-in on Android app
- **Do:** Open Closed Testing build on Android → login screen → "Continue with Google".
- **What you should see:** Native Android account picker. After selecting, app lands on Home tab without errors.

---

## I. Driver Dispatch URL (Steps 42–45)

### Step 42 — Admin assigns driver to a booking
- **Do:** Admin → Bookings → click a confirmed booking → "Assign Driver" → pick a driver from the dropdown → Save.
- **What you should see:**
  - Confirmation toast: "Driver assigned. SMS sent."
  - A green badge appears on the booking row: "Assigned to [Driver Name]"
  - The assigned driver receives an SMS on their phone within 30 seconds with a unique dispatch URL.

### Step 43 — Driver dispatch URL works in incognito
- **Do:** Copy the dispatch URL from the SMS. Open in incognito (NO login needed — token-based).
- **What you should see:** A dedicated driver page showing:
  - Trip overview (pickup, drop-off, time, passenger name, phone)
  - Three status buttons: "On the way" / "Arrived" / "Completed"
  - A "Live Track" toggle (background location)
  - For airport trips: also a "Flight Landed" button

### Step 44 — Flight Landed timestamp (airport only)
- **Do:** On an airport booking, tap "Flight Landed" on the dispatch page.
- **What you should see:**
  - Button turns gold and reads "Landed at [time]"
  - A 45-minute "free wait" counter begins
  - After 45 minutes elapsed, the page starts showing a "Wait time fee: $X.XX" counter incrementing.

### Step 45 — Admin can charge wait time
- **Do:** Admin → Bookings → that booking → "Charge Wait Time" button (visible after grace period exceeded).
- **What you should see:** A confirmation modal showing the wait fee amount → Confirm → Stripe charges the saved card → success toast.

---

## J. Admin Dashboard — All Tabs (Steps 46–56)

### Step 46 — Admin 2FA login
- **Do:** Go to `/admin/login`. Enter `support@turanelitelimo.com` + `TuronAdmin@2025`.
- **What you should see:**
  - "Code sent to your email" message
  - Inbox receives a 6-digit code from `noreply@turanelitelimo.com`
  - Enter the code → lands on `/admin` dashboard
  - Sidebar shows tabs: Bookings, Quote Requests, Drivers, Promos, Announcements, Push Broadcast, Email Broadcast, Quick Quote, Surge Events, Zones/Pricing, Settings

### Step 47 — Bookings tab
- **Do:** Click "Bookings".
- **What you should see:** Paginated table of all bookings. Filter buttons: "All / Confirmed / Pending / Cancelled / Completed". Search bar works. Clicking a row opens detail panel.

### Step 48 — Drivers tab
- **Do:** Click "Drivers" → "+ Add Driver" → fill form (name, email, phone, vehicle) → Save.
- **What you should see:** New driver row appears. Phone number reformats to `(XXX) XXX-XXXX`. Edit + delete buttons work.

### Step 49 — Promos tab — both toggles persist
- **Do:** Edit an existing promo. Toggle `auto_apply` OFF, then back ON. Toggle `show_on_banner` OFF, then back ON. Save. Refresh.
- **What you should see:** Both toggles retain their state after refresh (this was a silent-fail bug — now fixed).

### Step 50 — Announcements tab
- **Do:** Create a new announcement with title "Test Announcement", body text, active=true, type "banner".
- **What you should see:** Public homepage now shows that announcement banner at the top. Set type to "homepage" → appears in the "News" section of the homepage instead.

### Step 51 — Push Broadcast tab
- **Do:** Compose a test push. Eligible-count should show a number > 0. Click "Send to me only" (test mode).
- **What you should see:** Within 30 seconds, your phone (if app installed with notifications enabled) receives the push notification. Admin "Sent History" table updates with the new broadcast.

### Step 52 — Email Broadcast tab
- **Do:** "Compose Promo" → enter subject and HTML body → click "Preview".
- **What you should see:** A preview iframe renders the email. Click "Send to me" → email arrives in your inbox within 60s. The "Send to all" button is gated behind a confirmation modal.

### Step 53 — Quote Requests tab
- **Do:** Open the quote requests tab. Pick the row from Step 26.
- **What you should see:** The request opens with all submitted info. Change status from "New" → "Quoted" → enter a quoted price → customer receives email with that price.

### Step 54 — Surge Events tab
- **Do:** Create surge event for tomorrow's date, multiplier 1.5x.
- **What you should see:** Public quote requests for tomorrow now show prices 1.5× higher than today. Today's quotes unaffected.

### Step 55 — Zones / Pricing tab
- **Do:** Edit per-mile rate for Executive Sedan from current value (e.g., $4.50) to $5.00. Save.
- **What you should see:** Immediately, the next quote request on the public site for Executive Sedan returns a slightly higher total.

### Step 56 — Settings tab
- **Do:** Change "Service Fee" from 10% to 12%. Save.
- **What you should see:** Next public quote reflects the higher fee in the total breakdown.

---

## K. Mobile Rider App (Steps 57–60)

### Step 57 — Login screen
- **Do:** Open TuranEliteLimo on iPhone (TestFlight) or Android (Closed Testing). Tap "Sign in" / launch screen.
- **What you should see:**
  - Dark gold-accented login screen with the TuranEliteLimo logo at top
  - Buttons: "Continue with Apple" (iOS only), "Continue with Google", "Continue with Email"
  - All three buttons are clearly visible and tappable

### Step 58 — Email signup on mobile
- **Do:** Tap "Continue with Email" → "Create Account" → enter email, password, name, phone.
- **What you should see:**
  - Account created → lands on Home tab
  - If name or phone is missing, a "Complete your profile" screen appears first
  - Bottom tab bar shows: Home · Book · Trips · Profile

### Step 59 — End-to-end mobile booking
- **Do:** Book tab → enter pickup, drop-off, date → select vehicle → tap "Book Now" → enter test card → confirm.
- **What you should see:**
  - Quote screen shows live prices
  - Stripe Payment Sheet slides up natively (Apple Pay / Google Pay also offered)
  - After payment, app navigates to "Booking Confirmed" screen
  - Booking appears in "Trips" tab
  - Push notification arrives within 30s confirming booking

### Step 60 — Receive a push broadcast
- **Do:** Admin → Push Broadcast → target "All" or your specific account → send test.
- **What you should see:** Within 30 seconds, banner notification appears on your lock screen. Tapping it opens the app to the announcements/news screen.

---

## L. Mobile Driver App (Steps 61–62)

### Step 61 — Driver login + assigned trips
- **Do:** Open the app → tap "I'm a driver" toggle → login with `driver.test@turanelitelimo.com` / `DriverPass123!`.
- **What you should see:**
  - Driver-specific home screen with a list of assigned trips
  - Location permission prompt appears on first login
  - "Always allow" should be tappable; the trip list refreshes once granted

### Step 62 — Driver completes a trip
- **Do:** Tap an assigned trip → "On the way" → wait → "Arrived" → wait → "Completed".
- **What you should see:**
  - Each status tap updates within 2 seconds
  - Admin dashboard's booking row reflects the status change live
  - Customer's mobile app receives a push notification at each status change ("Your driver is on the way", "Your driver has arrived")
  - Trip moves from the active list to the "History" list after Completed

---

## M. Mobile Referral Deep-Linking (Optional Bonus — requires OTA update + website deployed)

### Step D1 — Open invite link with app installed
- **Do:** With the app installed on your phone, tap a referral link `https://turanelitelimo.com/r/REF-XXXXXX` from Messages or WhatsApp.
- **What you should see:** Instead of opening the browser, the TuranEliteLimo app opens directly to a gold "You're invited" screen showing the referrer's first name and "$20 off your first ride".

### Step D2 — Tap "Claim $20"
- **Do:** On that invite screen, tap "Claim $20 & Create Account".
- **What you should see:** Lands on the signup tab with a gold banner at the top reading *"[Referrer Name]'s invite is active — $20 off your first ride."*

### Step D3 — Complete signup
- **Do:** Sign up with email or Google/Apple.
- **What you should see:** Account created. Referrer's `/refer` page (on web or in their app) → "Friends signed up" count +1.

### Step D4 — Open invite link without app installed
- **Do:** On a phone WITHOUT the app installed, tap the same `/r/REF-XXXXXX` link.
- **What you should see:** Opens the web invite page (Step 30 behavior) — no broken screen, no app store popup.

### Step D5 — Already signed-in user opens invite link
- **Do:** Already logged into the app, tap a referral link.
- **What you should see:** Invite screen appears with a note "You're already signed in" and a single "Book a Ride" button that takes you to Home (no double-account creation).

---

## Sign-off Checklist

- [ ] All 62 tests pass (with M bonus where applicable)
- [ ] No console errors (red text) in browser DevTools on any page
- [ ] No `ERROR` lines in backend logs during the test run
- [ ] Stripe test charges all show up in Stripe's test dashboard
- [ ] At least one push notification successfully received on a physical device
- [ ] All transactional emails arrived: booking confirmation, password reset, quote request reply, referral reward

**If ALL pass → already deployed; just run a final sanity check on production.**
**If any fail → tell me the step # + what you saw and we'll fix it.**
