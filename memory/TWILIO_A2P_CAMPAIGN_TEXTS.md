# Twilio A2P 10DLC Campaign Registration — Copy/Paste Texts

> Last updated: Feb 28, 2026 — **v2 (post Error 30893 rejection fix)**
>
> Submit these EXACTLY as written. Twilio reviewers compare them to your live site at turanelitelimo.com/book and turanelitelimo.com/privacy. **Keep all `[bracketed]` fields as brackets — do NOT replace them with real values. Brackets signal "this is a template" to the reviewer.**

---

## 1. Campaign Use Case
**Select:** `Mixed`

---

## 2. Campaign Description (paste exactly)

> TuranEliteLimo is a chauffeured ground transportation company serving the San Francisco Bay Area. Through our Mixed-use campaign, we send two categories of SMS to customers who have explicitly opted in via a non-pre-checked checkbox on our booking and quote-request forms at turanelitelimo.com:
>
> (1) Transactional: booking confirmations, payment receipts, driver dispatch and ETA notifications, pickup reminders, post-trip receipts, and custom quote responses to inbound inquiries. Frequency: typically 2–5 messages per booking.
>
> (2) Promotional (separate optional opt-in): occasional discount offers, seasonal promos, and event packages. Frequency: up to 4 messages per calendar month.
>
> Consent is captured at the point of phone collection with all required disclosures (message types, frequency, msg & data rates, STOP/HELP, links to Terms and Privacy Policy). Server-side timestamp + IP recorded for audit. See live form: turanelitelimo.com/book — and SMS program details in our Privacy Policy section 3a: turanelitelimo.com/privacy.

---

## 3. Message Flow / Consent (paste into "How end users opt in")

> End users opt in via a non-pre-checked checkbox on the booking form (turanelitelimo.com/book) or quote-request form (turanelitelimo.com/quote). The checkbox is labeled "Yes, text me about my trip" and includes the full SMS program disclosure (message types, frequency 2–5 per booking, msg & data rates apply, Reply STOP/HELP, links to Terms and Privacy Policy). Phone number is captured in a labeled phone-input field directly above the checkbox. Consent is required to submit the form. A second, optional, non-pre-checked checkbox allows opt-in to promotional SMS (up to 4/month). Consent is captured server-side with timestamp and IP for audit. Live form: https://turanelitelimo.com/book. Privacy program details: https://turanelitelimo.com/privacy section 3a.

---

## 4. Sample Messages — VERSION 2 (fixed for Error 30893)

> **CRITICAL:** Keep all `[bracketed]` fields. Do NOT substitute real names or values. Twilio uses the brackets to verify these are reusable templates, not one-off messages.

### Sample 1 — Booking Confirmation (transactional)
> Hi [Customer First Name], your TuranEliteLimo trip is confirmed for [Pickup Date] at [Pickup Time]. Vehicle: [Vehicle Type]. Pickup: [Pickup Address]. Your driver [Driver First Name] will text 30 min before pickup. Manage booking: [Manage URL]. Msg & data rates may apply. Reply STOP to opt out, HELP for help.

### Sample 2 — Driver Dispatch / ETA Update (transactional)
> Hi [Customer First Name], this is TuranEliteLimo. Your driver [Driver First Name] ([Vehicle Make/Model], plate [Plate Number]) is en route. ETA [ETA Minutes] min. Call/text driver at [Driver Phone] if needed. Msg & data rates may apply. Reply STOP to unsubscribe.

### Sample 3 — Custom Quote Response (transactional)
> Hi [Customer First Name], your TuranEliteLimo quote: [Vehicle Type], [Service Duration], [Quote Total] all-in (gratuity, fuel, tolls included). Confirm & pay 25% deposit: [Confirm URL]. Quote valid 48 hrs. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.

### Sample 4 — Promotional Offer (promotional)
> [Customer First Name], TuranEliteLimo here — enjoy [Discount %] off your next executive Sedan or SUV trip with code [Promo Code], valid through [Expiry Date]. Perfect for airport runs or date nights. Book: turanelitelimo.com. Up to 4 promotional messages per month. Msg & data rates may apply. Reply STOP to unsubscribe, HELP for help.

---

## 5. Opt-In Confirmation Message
> Welcome to TuranEliteLimo SMS alerts. You're opted in for booking confirmations, trip updates & driver dispatch. Up to 5 msgs per booking. Msg & data rates may apply. Reply STOP to opt out, HELP for help.

## 6. HELP Reply Message
> TuranEliteLimo support: support@turanelitelimo.com or (650) 410-0687, 24/7 for active trips. Reply STOP to unsubscribe. Msg & data rates may apply.

## 7. STOP Reply Message
> You've been unsubscribed from TuranEliteLimo SMS. You will receive no further messages. Reply START to resubscribe.

---

## 8. URLs to provide

| Field | URL |
|---|---|
| Website / company URL | https://turanelitelimo.com |
| Privacy Policy URL | https://turanelitelimo.com/privacy |
| Terms of Service URL | https://turanelitelimo.com/terms |
| Booking page (consent capture) | https://turanelitelimo.com/book |
| Quote page (consent capture) | https://turanelitelimo.com/quote |

---

## 9. Other campaign fields

| Field | Value |
|---|---|
| Number of messages per day (estimated) | 50-100 |
| Number of message segments per day (peak) | 300-500 |
| Subscriber opt-in type | Web form |
| Subscriber help command | HELP |
| Opt-out keywords | STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT |
| Help keywords | HELP, INFO |
| Direct lending / debt collection / etc. | NO to all sensitive use cases |
| Age-gated content | NO |
| Embedded links | YES (booking management links, payment links) |
| Embedded phone numbers | YES (driver direct line) |

---

## 10. Resubmission History

| Date | Campaign SID | Result | Reason |
|---|---|---|---|
| 2026-06-28 21:44 UTC | CM1a555e4fa0a1b4c63413845b3324b191 | ❌ Rejected | Error 30893 — samples used real names/values instead of bracketed placeholders, conditional language on promotional sample |
| (next submission) | (pending) | — | v2 templates with brackets, no conditionals, full STOP/HELP in every sample |
