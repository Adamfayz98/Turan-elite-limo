# Twilio A2P 10DLC Campaign Registration — Copy/Paste Texts

> Last updated: Feb 28, 2026 — for TuranEliteLimo Low Volume Standard brand registration.
>
> Submit these EXACTLY as written. Twilio reviewers compare them to your live site at turanelitelimo.com/book and turanelitelimo.com/privacy.

---

## 1. Campaign Use Case
**Select:** `Mixed`

> Reason: We send both transactional (booking confirmations, trip updates) and occasional promotional (offers, seasonal promos) messages. Mixed covers both.

---

## 2. Campaign Description (paste into the long-text field)

> TuranEliteLimo is a chauffeured ground transportation service in the San Francisco Bay Area. We send SMS messages to customers who have explicitly opted in at our website (turanelitelimo.com) when submitting a booking or quote request. Messages include booking confirmations, payment receipts, trip status updates, driver dispatch and pickup notifications, ETA changes, post-trip receipts, custom quote responses to inbound inquiries, and (for separately opted-in users) occasional promotional offers and seasonal promos. We capture express written consent via a non-pre-checked checkbox at the point of phone number collection, including all required disclosures (message types, frequency, msg & data rates, STOP/HELP instructions, and links to our Terms and Privacy Policy).

---

## 3. Message Flow (how customers opt in — paste into "Description of how end users consent")

> End users opt in via a non-pre-checked checkbox on either our booking form (turanelitelimo.com home page) or our quote-request form (turanelitelimo.com home page → "Request a quote" CTA on Sprinter, Party Bus, and Stretch Limo cards). The checkbox is clearly labeled "Yes, text me about my trip" and includes the full SMS program disclosure (message types, frequency 2–5 per booking, msg & data rates apply, Reply STOP/HELP, links to Terms and Privacy Policy). Phone number is captured in a labeled phone-input field directly above the checkbox. Consent is required to submit the form. A second, optional, non-pre-checked checkbox allows opt-in to promotional SMS (up to 4/month). Consent is captured server-side with timestamp and IP for audit. See live form at https://turanelitelimo.com (scroll to booking section) and https://turanelitelimo.com/privacy section 3a for the full SMS program terms.

---

## 4. Sample Messages (provide 2–4 — pick the 2-3 closest to your real messages)

**Sample 1 — Booking Confirmation (transactional)**
> Hi Leticia, your TuranEliteLimo trip is confirmed for Sat Mar 7 at 8:00 PM. Vehicle: Limo-Style Sprinter. Pickup: 123 Main St, Palo Alto. Your driver Adam will text you 30 min before pickup. Manage booking: https://turanelitelimo.com/manage/abc123. Reply STOP to opt out, HELP for help.

**Sample 2 — Driver Dispatch (transactional)**
> Hi Leticia, your TuranEliteLimo driver Adam (Mercedes Sprinter, plate 8XYZ123) is en route. ETA 8 min. Call/text Adam at (650) 208-0491 if needed. Reply STOP to opt out.

**Sample 3 — Custom Quote Response (transactional)**
> Hi Jasmin, your TuranEliteLimo quote: Limo-Style Sprinter, 4 hrs, $1,000 all-in (gratuity, fuel, tolls included). Confirm & pay 25% deposit to lock the date: https://turanelitelimo.com/q/xyz789. Reply STOP to opt out.

**Sample 4 — Promotional (if registering promotional use case)**
> Hi Leticia, here's 10% off your next executive Sedan or SUV trip — perfect for airport runs or date nights. Code: LETICIA10. Valid through Aug 27, 2026. Book at turanelitelimo.com. Reply STOP to opt out.

---

## 5. Opt-In Confirmation Message (sent after customer opts in)

> You're opted in to TuranEliteLimo trip alerts. Expect booking confirmations, status updates, and driver dispatch. Msg & data rates may apply. Reply STOP to opt out, HELP for help.

---

## 6. HELP Reply Message (sent when customer replies HELP)

> TuranEliteLimo support: email support@turanelitelimo.com or call (650) 410-0687. We're open 24/7 for active trips. Reply STOP to unsubscribe. Msg & data rates may apply.

---

## 7. STOP Reply Message (sent when customer replies STOP — Twilio auto-handles, but provide the text)

> You're unsubscribed from TuranEliteLimo SMS. You will no longer receive messages from us. To re-subscribe, reply START or contact support@turanelitelimo.com.

---

## 8. URLs to provide

| Field | URL |
|---|---|
| Website / company URL | https://turanelitelimo.com |
| Privacy Policy URL | https://turanelitelimo.com/privacy |
| Terms of Service URL | https://turanelitelimo.com/terms |
| Opt-in flow screenshot URL | https://turanelitelimo.com (booking form, scroll to SMS checkbox) |

---

## 9. Other campaign fields

| Field | Value |
|---|---|
| Number of messages per day (estimated) | 50-100 |
| Number of message segments per day (peak) | 300-500 |
| Opt-in keyword (if asked) | n/a — we use a web form checkbox, not a keyword |
| Opt-out keywords | STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT |
| Help keywords | HELP, INFO |
| Subscriber opt-in type | Web form |
| Subscriber help command | HELP |
| Direct lending / debt collection / etc. | NO to all sensitive use cases |
| Age-gated content | NO |
| Embedded links | YES (booking management links, payment links) |
| Embedded phone numbers | YES (driver direct line) |

---

## 10. If Twilio asks: "Are URLs publicly accessible?"

✅ YES. https://turanelitelimo.com is live and accessible.
✅ YES. https://turanelitelimo.com/privacy is publicly accessible, includes Section 3a "SMS / text messaging program" with all required disclosures.
✅ YES. https://turanelitelimo.com/terms is publicly accessible, includes Section 9a "SMS / text messaging" clause.

---

## 11. If Twilio asks: "How do you obtain consent?"

> Customers must check a non-pre-checked checkbox at the point of submitting a booking or quote request on our website. The checkbox is labeled "Yes, text me about my trip" and includes the full required disclosures (message description, frequency, msg & data rates, STOP/HELP, Terms/Privacy links). Consent is required to complete the form submission — the submit button is disabled until the box is checked. A separate, optional, non-pre-checked checkbox allows opt-in to promotional SMS. Server-side, we record the timestamp of consent and the user's IP address on the booking/quote record for audit. The phone number field is captured directly above the consent checkbox.

---

## ✅ Pre-submit checklist (verify before you click Submit on Twilio)

- [ ] Live site has non-pre-checked SMS consent checkbox on booking form ✓ (just shipped)
- [ ] Live site has non-pre-checked SMS consent checkbox on quote-request form ✓ (just shipped)
- [ ] Privacy Policy contains SMS program section with carrier opt-out, frequency, HELP/STOP ✓ (Section 3a)
- [ ] Terms of Service mentions SMS ✓ (Section 9a)
- [ ] Backend captures `sms_consent_at` timestamp + IP for audit ✓ (just shipped)
- [ ] Backend rejects submissions without SMS consent ✓ (verified via curl test 2026-02-28)
- [ ] Sample messages match real production messages (they do — verify driver dispatch + confirmation templates)
- [ ] Opt-in confirmation message configured in Twilio messaging service
- [ ] HELP keyword auto-reply configured
- [ ] STOP keyword auto-handled by Twilio (default) — confirm in console

If ALL boxes are checked, you have an ~95%+ approval rate on first submission.
