# TuranEliteLimo — General Test Plan (Feb 2026 ship)

> Covers all features shipped in the Feb 14–15 development push.
> Run on **production** (https://www.turanelitelimo.com) after the deploy completes.
> Mark each test as PASS / FAIL / NOTE. Anything not PASS — screenshot & report.

**Test accounts:**
- Admin: `support@turanelitelimo.com` / `TuronAdmin@2025`
- Real Stripe test (you can use a $5 promo code to make any booking effectively free)
- Mobile phone for OTP test

---

## A. Production Crash Fix (Google Translate)

**A1.** On Android Chrome, open https://www.turanelitelimo.com on your phone with the system language set to Spanish or another non-English language. Let Chrome auto-translate.
- ✅ EXPECT: page loads, scroll works, no "Something went wrong" message, no console errors.
- ❌ FAIL: page crashes with a white screen or React error.

**A2.** Same test on iOS Safari (translate via Safari menu → Translate to Spanish).
- ✅ EXPECT: page loads, all interactions work.

---

## B. Landing Pages (Visual Refresh)

For each: `/wine-tour`, `/wedding`, `/corporate`, `/airport`, `/party-bus`:

**B1.** Page loads in under 3 seconds.

**B2.** Hero section displays correctly (title + subtitle + CTA buttons + trust strip).

**B3.** New **experience hero image** (full-bleed photo with editorial caption) is visible between Pillars and Routes. Image is not broken / blank.

**B4.** New **venues / itinerary sections** render with images + titles + descriptions (Wine Tour, Wedding only — Corporate & Airport only have itinerary).

**B5.** Itinerary timeline (vertical gold dots) shows correctly on mobile (not crammed, readable).

**B6.** Gallery section at bottom has 5 images, all loaded.

**B7.** "Get Instant Quote" CTA button scrolls to booking form OR opens booking modal.

**B8.** FAQs section expands/collapses on click.

**B9.** Mobile: page is fully readable, no horizontal scroll, text doesn't overflow.

---

## C. Booking Form & Promo Codes

**C1.** From homepage, scroll to booking section. Fill in:
- Pickup: SFO Airport, San Francisco, CA
- Dropoff: Four Seasons San Francisco, CA
- Date: 7 days from today
- Time: 2:00 PM
- Service: Airport Transfer
- ✅ EXPECT: Quote loads, vehicles listed with prices.

**C2.** Confirm WELCOME20 (or whichever auto-apply promo) shows a **green chip with the AUTO-APPLIED badge** under the selected vehicle.
- ✅ EXPECT: green chip, "Saved $X · New total $Y", "AUTO-APPLIED" pill in gold.
- ❌ FAIL: see "Have a promo code?" input pre-filled with the promo (this is the OLD bug, must not happen).

**C3.** Click "Remove" on the auto-applied promo chip.
- ✅ EXPECT: chip disappears, "Have a promo code?" input appears EMPTY (not pre-filled).

**C4.** Type the SAME code in the input + click Apply.
- ✅ EXPECT: error message "This code is already applied to your quote" (or similar). Promo does NOT double-apply.

**C5.** Try a fake code like ABC123 + Apply.
- ✅ EXPECT: friendly error "Invalid code" or similar.

**C6.** Complete the booking form (fill name, email, phone, all fields).

**C7.** Scroll to the **wait-time consent block** (only appears for certain vehicles).
- ✅ EXPECT: reassuring copy mentioning **Stripe** as the card vault + clear language about charging only if wait time / damages / extra stops actually happen.
- ✅ EXPECT: consent checkbox is required, "Continue to Payment" button is disabled until checked.

**C8.** Check the consent box, click "Continue to Payment".
- ✅ EXPECT: redirect to Stripe Checkout page.
- DON'T COMPLETE the payment — just verify the Stripe page loads correctly with the right amount.

---

## D. Quote Letter Self-Service (Magic-Link Flow)

**D1.** As admin, go to **Quote Requests** tab. Click on an existing quote OR submit a fresh one (via the public form with a fake email).

**D2.** Click **"Send Quote"** on the request. Enter quoted price (e.g. $300), deposit % (e.g. 50%).
- ✅ EXPECT: email sent to the customer with a `/quote/{token}` magic link.

**D3.** Open the magic link in an incognito/private browser tab.
- ✅ EXPECT: page loads with quote details, vehicle, price.

**D4.** Verify the **new consent checkbox** is visible above the Pay button.
- ✅ EXPECT: text mentions "Stripe as the vault" + "only charged if those things actually happen."
- ✅ EXPECT: "Confirm & Pay" button is **disabled** until checkbox is checked.

**D5.** Check the box → button enables → click Pay → redirect to Stripe.
- ✅ EXPECT: clean redirect to Stripe Checkout with the right deposit amount.

**D6.** Complete a real $5 payment (use a $5 quote so it's cheap to test).
- ✅ EXPECT: redirected back to `/quote/{token}?session_id=...`
- ✅ EXPECT: success screen showing confirmation number.

**D7.** As admin, open the new booking in the Bookings tab.
- ✅ EXPECT: booking exists with `stripe_payment_method_id`, `card_brand`, `card_last4` populated.
- ✅ EXPECT: `wait_time_consent: true` flag visible.

---

## E. Safety / Anti-Fraud System

**E1.** Admin → **Safety** tab (new tab). Confirm 4 sub-tabs visible: **Review queue / Blacklist / IP lookup / Pending OTPs**.

**E2.** **Blacklist test:** Add a blacklist entry: kind=email, value=`@test-bad-domain.com`, reason="Automated test".
- ✅ EXPECT: entry appears in the list.

**E3.** Open `https://www.turanelitelimo.com/get-quote` (or wherever your quote form lives) in incognito. Submit a fake quote with email `someone@test-bad-domain.com`.
- ✅ EXPECT: submission succeeds (silent-accept — no error shown to customer).
- ✅ EXPECT: admin → Quote Requests tab shows this request with a **RED risk badge** and "BLACKLIST" flag.

**E4.** **Risk scoring test:** Submit another fake quote with:
- Name: `Test123` (contains digits — risk signal)
- Email: `whatever@mailinator.com` (disposable email — risk signal)
- Phone: any number
- ✅ EXPECT: appears in Quote Requests with **YELLOW or RED risk badge** + 2-3 flag chips beneath.

**E5.** **Review queue test:** Admin → Safety → Review queue.
- ✅ EXPECT: shows both fake quotes from E3 + E4.
- ✅ EXPECT: each has a "Mark safe" button. Click it on one → it disappears from the queue.

**E6.** **IP lookup test:** Safety → IP lookup tab → enter `8.8.8.8` → click Look up.
- ✅ EXPECT: result panel shows Country: United States, ISP: Google, etc.

**E7.** **Cleanup:** Delete the test blacklist entry + delete the fake quote requests.

---

## F. Phone OTP (Twilio Verify)

**F1.** Admin → Settings → Safety section → toggle "Require phone verification" ON, threshold $1.

**F2.** Send yourself a quote letter (use your real phone number) with a price ≥ $1.

**F3.** Open the magic link → check consent → click "Confirm & Pay".
- ✅ EXPECT: OTP gate appears (data-testid `otp-gate`), NOT a Stripe redirect.

**F4.** Click "Send verification code".
- ✅ EXPECT: text message arrives on your phone within 30 seconds with a 6-digit code.

**F5.** Enter the code → click Verify & continue.
- ✅ EXPECT: redirect to Stripe Checkout.

**F6.** **Cleanup:** Set threshold back to **$1000** in Admin Settings.

---

## G. Saved Cards / Charge Card on File

**G1.** Find a recent paid booking in admin Bookings tab. Click to open BookingDetailsDialog.

**G2.** Scroll to the bottom.
- ✅ EXPECT: a new section **"Charge card on file"** visible with the card brand + last 4 digits.

**G3.** Fill in a small test charge: amount=$0.50, reason=other, description="Test charge".

**G4.** Click "Charge $0.50".
- ✅ EXPECT: confirmation dialog → confirm.
- ✅ EXPECT: success toast.
- ✅ EXPECT: customer receives an email receipt with the description.
- ✅ EXPECT: the booking's `extra_charges` history shows the new entry.

**G5.** Try the other reasons: balance, extra_hour, extra_stop, tolls, gratuity — each should work.

**G6.** Try a $0.30 amount.
- ✅ EXPECT: rejected with "Charge too small (under $0.50 minimum)".

---

## H. Stripe Radar Rules (After You Paste Them)

**H1.** Stripe Dashboard → Radar → Rules. Confirm all 7 rules show "Enabled" green status.

**H2.** **Returning customer test:** Make a $200 booking with a card you've used before.
- ✅ EXPECT: passes immediately (Allow rule #6).

**H3.** **Card testing simulation:** This is hard to test without actual fraud — skip unless you suspect an attack.

---

## I. Mobile App (iOS + Android)

**I1.** Open TuranEliteLimo iOS app (TestFlight build 41).

**I2.** Browse the app — referral screen works, fleet images load, no crashes.

**I3.** Note: native iOS build with new linkings is **deferred** (pod install failing). Existing TestFlight 41 has the OTA update from earlier.

**I4.** Same for Android Closed Testing build.

---

## J. Admin Dashboard (Existing Flows — Regression)

**J1.** All admin tabs load without error: Bookings, Quote Requests, Invoices, Affiliates, Promos, Reviews, Drivers, Settings, Safety, Account.

**J2.** Booking creation from admin: works as before.

**J3.** Invoice creation: works as before.

**J4.** Affiliate suggestion (Regional Affiliate System): works as before.

**J5.** Settings: every existing field saves properly. New safety fields save properly.

---

## K. Email & SMS Notifications

**K1.** Submit a quote request via the public form.
- ✅ EXPECT: admin gets an SMS within 1 min summarizing the request + any risk flag.

**K2.** Send a quote letter to a customer.
- ✅ EXPECT: customer gets the magic-link email.

**K3.** Complete a quote payment.
- ✅ EXPECT: admin + customer both get confirmation emails.

**K4.** Charge a saved card.
- ✅ EXPECT: customer gets an itemized receipt email.

---

## L. Cleanup After Testing

- [ ] Delete all test bookings (filter by your test email)
- [ ] Delete all test blacklist entries
- [ ] Reset settings to production values (phone verify threshold $1000, etc.)
- [ ] Confirm all test charges are refunded via Stripe Dashboard

---

## Summary Sheet

| Section | Tests | Pass | Fail | Notes |
|---|---|---|---|---|
| A. Crash Fix | 2 | | | |
| B. Landing Pages | 9 × 5 pages | | | |
| C. Booking Form | 8 | | | |
| D. Quote Letter | 7 | | | |
| E. Safety System | 7 | | | |
| F. Phone OTP | 6 | | | |
| G. Saved Cards | 6 | | | |
| H. Radar Rules | 3 | | | |
| I. Mobile App | 4 | | | |
| J. Admin Regression | 5 | | | |
| K. Notifications | 4 | | | |

**Total: ~115 individual checks**

If anything fails, screenshot + describe what you did + send to dev. Most failures are fixable in <30 min.
