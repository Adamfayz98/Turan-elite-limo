# TuranEliteLimo Pre-Launch Test Checklist

Use this to verify EVERYTHING works on preview before we ship to production + App Store.

- **Preview web:** https://limo-experience-1.preview.emergentagent.com
- **Preview admin:** https://limo-experience-1.preview.emergentagent.com/admin
- **Mobile app:** Already installed via TestFlight, points at preview backend automatically
- **Admin login:** `support@turanelitelimo.com` / `TuronAdmin@2025`
- **Test driver login:** `driver.test@turanelitelimo.com` / `DriverPass123!`

Mark each item with ✅ pass, ❌ fail, or ⏸️ skipped. Tell me about every ❌.

---

## 📱 1. Mobile App (TestFlight) — Rider Flow

- [ ] App opens to Welcome screen (logo + marketing copy)
- [ ] "Sign Up" creates a new rider account
- [ ] "Log In" works for existing rider
- [ ] "Continue as Guest" shows the booking form
- [ ] Pickup location autocomplete suggests Bay Area addresses
- [ ] Dropoff location autocomplete works
- [ ] Date / time picker works
- [ ] Vehicle selection shows prices (Executive Sedan, Luxury SUV, etc.)
- [ ] Promo code field — entering a valid code shows discount
- [ ] Promo code field — invalid code shows error message
- [ ] Consent checkboxes are required before continuing
- [ ] "Book Now" creates the booking
- [ ] Stripe checkout overlay shows "Opening secure checkout…"
- [ ] Stripe page actually opens (web or in-app browser)
- [ ] Test card `4242 4242 4242 4242` completes payment
- [ ] Thank-you page appears after payment
- [ ] My Trips tab shows the new booking
- [ ] Tap the booking → details screen shows pickup, dropoff, price, status
- [ ] **Verify:** Booking appears in preview admin at `/admin/dashboard`

## 📱 2. Mobile App — Modify / Cancel Flow

- [ ] My Trips → tap booking → tap "Modify Trip" → change pickup time → save
- [ ] Verify in preview admin: pickup time updated
- [ ] My Trips → tap booking → tap "Cancel Trip" → confirm
- [ ] Verify in preview admin: booking shows 👤 **Customer** badge

## 📱 3. Mobile App — Forgot Password

- [ ] Log out
- [ ] Tap "Forgot Password" → enter email
- [ ] Check inbox — Resend email arrives with reset link
- [ ] Tap link → opens web reset page → set new password
- [ ] Log in with new password works

## 📱 4. Mobile App — Driver Portal

- [ ] Driver login screen accepts `driver.test@turanelitelimo.com` / `DriverPass123!`
- [ ] Driver sees assigned trips (assign one to test-driver in admin first if empty)
- [ ] Tap trip → "Start Trip" → status updates to in-progress
- [ ] Interactive Google Map shows pickup pin + driver location
- [ ] "Record Wait Time" → enter minutes → saves
- [ ] "Add Mid-Trip Stop" → adds address → saves
- [ ] "Complete Trip" → status → completed
- [ ] Verify in preview admin: all changes reflected

## 🌐 5. Preview Website — Customer Flow

- [ ] Homepage loads with new transparent wolf logo
- [ ] Booking form on homepage works
- [ ] **NEW:** Stripe checkout overlay appears ("Opening secure checkout…")
- [ ] If redirect blocked, manual "Open secure checkout →" button appears after 2.5s
- [ ] Test card completes payment
- [ ] Thank-you page renders
- [ ] Email confirmation arrives via Resend
- [ ] My Reservation (manage link) opens, shows correct details
- [ ] Cancel from manage link → badge shows 👤 **Customer** in admin

## 🌐 6. Preview Website — Admin Dashboard

- [ ] Admin login works (no 2FA bypass since you're whitelisted)
- [ ] **Dashboard loads — NO "Something went wrong" toast**
- [ ] Bookings tab shows all bookings (NOT 0)
- [ ] Stats tab shows numbers
- [ ] Contacts tab loads
- [ ] **Refresh page 5 times — every refresh works**
- [ ] Cancel a booking from admin → badge shows 🧑‍💼 **Admin**
- [ ] **NEW:** Click "Backfill cancel sources" button → toast shows counts
- [ ] Cancelled bookings now show correct badges (🤖 / 👤 / 🧑‍💼)
- [ ] Bookings table — payment column shows new badges:
  - 🔵 `⏳ Nx attempt` for pending bookings
  - 🟠 `⚠ N fails` for failed Stripe calls (only if any)

## 🌐 7. Preview Website — Live Map + Tracking

- [ ] Admin → Live Map tab → drivers show pins
- [ ] As customer, when driver is on the way, "Track Driver" link shows live map
- [ ] Driver location updates every ~10s

## 🌐 8. Preview Website — Other Pages

- [ ] `/privacy-policy` loads
- [ ] `/terms-of-service` loads
- [ ] `/contact` form sends inquiry → appears in admin
- [ ] Fleet page shows vehicles
- [ ] Pricing displays correctly per zone

## 🔔 9. Notifications (Email + SMS)

- [ ] Customer email — booking confirmation arrives
- [ ] Customer email — cancellation confirmation
- [ ] Admin SMS — new booking notification
- [ ] **NEW:** Admin SMS — "⚠️ CHECKOUT FAILED" (force by giving an invalid Stripe key temporarily — skip if too much trouble)
- [ ] **NEW:** 15-min stuck-checkout recovery email (let one booking sit 15+ min unpaid)

## 💳 10. Stripe + Payment Edge Cases

- [ ] Pay with valid card → confirmation
- [ ] Pay with declined card `4000 0000 0000 0002` → graceful error
- [ ] Open Stripe page, close it without paying, return to thank-you URL → status updates correctly
- [ ] Cancel button on Stripe page → returns to booking page

---

## When all items pass

Reply to me: **"Ship it"** — and I'll:
1. Build production iOS app (`--profile production`, points at turanelitelimo.com)
2. Submit to Apple App Store review
3. Redeploy production website with today's fixes
4. Tell you when each step completes

---

## If you find a bug

Just tell me:
- Which checklist item broke
- What happened (screenshot if visual, error text if it's a message)
- Whether you can reproduce it 100% or it's intermittent

I fix on preview, you re-test. We loop until it's flawless.
