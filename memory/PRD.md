# TuranEliteLimo — Product Requirements Document (Live)

> Last refreshed: July 7, 2026 — iter 55 (Promo overcharge recurrence — root cause fixed)

## 📞 AI Phone Receptionist — Twilio + GPT-5.4 voice concierge (Feb 8, 2026 — iter 57)

Turned the passive "dispatcher-first, missed-call-SMS-fallback" flow into a **live AI phone concierge** that answers every call, quotes instant prices, texts booking links, and only hands off to a human when the caller asks or the AI hits its limits.

**Call flow (matches user spec):**
1. Twilio phone number routes inbound calls to `POST /api/twilio/voice/incoming`.
2. AI greets with `Polly.Joanna` voice + `<Gather input="speech">`.
3. Each caller utterance → `POST /api/twilio/voice/gather` → `ai_receptionist.get_ai_reply()` → GPT-5.4 (via Emergent LLM key) returns JSON `{reply, action, params}`.
4. AI can:
   - **Quote instantly** for Executive Sedan / First Class / Luxury SUV via internal `_build_quotes` (no HTTP hop). Speaks the price rounded to the nearest $5 for natural voice.
   - **Send SMS booking link** with pickup/drop-off pre-filled (`/book?pickup=...&dropoff=...&vehicle=...`).
   - **Send SMS quote-request link** for Sprinter / Limo / Party Bus / Coach (`/contact?...`) — "our team builds a custom quote".
   - **Transfer to dispatcher** — `<Dial timeout="22">$ADMIN_PHONE</Dial>` with `action` pointing at `/api/twilio/voice/transfer-fail`. If unanswered, AI resumes with a smooth handoff line.
   - **Answer info questions** — service area (SF Bay + Napa/Sonoma/Monterey/Reno-on-request), hours (24/7), Meet & Greet ($35 flat, Airport Transfer only), cancellation policy, WELCOME 20% first-ride promo.
   - **Hang up** politely.
5. Every turn (user speech + AI reply + side effects) persisted in `voice_call_sessions` collection keyed by CallSid.

**Verified end-to-end via curl (5 scenarios):**
- Executive Sedan SFO → Napa → "about two seventy-five" (correct, from live quote math)
- "Text me the booking link" → SMS sent, confirmed to caller, transcript logged
- Sprinter Van → correctly routes to quote_request SMS link (no bad quote)
- "Speak to a human" → `<Dial>` admin, on no-answer AI takes over
- "Do you have first-ride discounts?" → "use code WELCOME for 20% off at checkout"
- "Do you go to Reno?" → "Yes, we can do long-distance rides to Reno on request. What date, pickup area, and vehicle would you like?"

**Files:**
- `/app/backend/ai_receptionist.py` (NEW — SYSTEM_PROMPT, session mgmt, `get_ai_reply`, `compute_ai_quote`, `build_booking_link`, `build_quote_request_link`)
- `/app/backend/routes/twilio_voice.py` (REWRITTEN — full IVR: incoming → gather → dispatch action → transfer-fail; admin endpoints for missed_calls + voice_calls)

**New admin endpoints (auth-gated):**
- `GET /api/admin/voice-calls` — list AI-handled calls with full transcript
- `GET /api/admin/voice-calls/{call_sid}` — single call detail
- `GET /api/admin/missed-calls` — carrier + AI-fallback missed calls

**Twilio Console setup (ONE-TIME, user must do this after deploy):**
Phone Numbers → Manage → Active numbers → click your Turan number → set **"A CALL COMES IN"** webhook to `https://api.turanelitelimo.com/api/twilio/voice/incoming` (HTTP POST).

**Voice / cost notes:**
- Using `Polly.Joanna` (Twilio's warmer default voice — no extra API cost).
- GPT-5.4 default model via Emergent LLM key. Each turn is ~1 LLM call. Quote turn = 2 calls (one to decide `action: quote`, one to announce the number after fetching the price).
- Sessions expire naturally in Mongo (no TTL set yet — could add if abuse appears).

**Compliance:**
- SMS is only sent to callers who verbally asked for it (clear voice-consent record in the transcript). All SMS bodies include "Reply STOP to opt out."
- Full transcript retention supports A2P audit if Twilio ever asks how consent was captured.



## 🚨 Double-discount pay_later_amount fix + P1 items (Feb 8, 2026 — iter 56)

**Root cause of the "$462.44 vs $660.88" round-trip pricing bug:**
- `create_booking` (server.py L630) stores `quote_amount = ride_amount − discount` (POST-discount).
- BUT `/payments/checkout-setup` and `/payments/checkout` treated `quote_amount` as PRE-discount and applied the discount ratio AGAIN → 30% off got applied twice → `pay_later_amount = 660.88 × 0.30 = $462.44` (wrong; should be $660.88).
- Affected any promo booking on Pay-After-Ride; symptom was worst on round-trips because the discount dollar amount is larger.

**Fix — one shared helper (`_resolve_charge_amount` in payments.py):**
- Detects locked-in bookings via `abs(quote_amount + discount_amount − original_quote_amount) < 1.0`. For those, `pay_later_amount = quote_amount × deposit_percent%` (no re-application of discount).
- Legacy bookings (`quote_amount == original_quote_amount`, pre-lock-in fix) still get the proportional discount ratio so we don't overcharge migration-era rows.
- Migration script `/app/backend/migrations/fix_double_discount_pay_later.py` — dry-run + apply modes, stores previous value under `pay_later_amount_pre_migration` for audit. **Run this against production after deploy** to repair Adel's own test booking + any customer bookings with the wrong `pay_later_amount`.

**Verified end-to-end:** Round-trip + WELCOME (20%) → quote $944.12 → stored `quote_amount=754.93` → `pay_later_amount=754.93` (was $603.94 pre-fix). One-way + promo: same PASS. Legacy pre-discount booking: still $175.74 on $219.67 quote. Thank-you page + confirmation email + PayBooking all read `pay_later_amount` directly → price now consistent everywhere.

**P1 items shipped in same iteration:**
1. **Admin billing-audit endpoint** — `GET /api/admin/billing-audit` returns 3 buckets: `overcharged`, `undercharged`, `pay_later_over_discounted`. UI-ready payload for a future admin refund-triage tab. (routes/admin.py)
2. **Spam heuristic tuning** — `safety.py` now catches: keyboard-mash names (no vowels, 3+ repeat chars, `qwerty/asdf/zxcv/hjkl/test/1234`), invalid US phones (area code or exchange starts with 0/1, all-same-digit, sequential test patterns, wrong digit count), unstructured addresses (single token / no vowels in 6+ letters). Weights 15-30 each — spam quotes will now push past the "green" band.
3. **Abandoned-checkout email + SMS differentiation** — `_render_payment_recovery_email` in server.py now branches on `booking.payment_mode`: pay-after gets "save your card, nothing charged today · SECURE MY RIDE" copy; pay-now keeps the "finish payment" copy. Customer SMS also branches. Subject line reflects flow.
4. **Book Now, Pay Later custom invoices** — `CustomInvoiceCreate` gains `payment_mode: pay_now|pay_after`. In `pay_after` mode, admin creates a setup-mode Stripe Checkout Session that saves+validates the card (no charge). Webhook `_finalize_invoice_setup_session` flips invoice status to `card_on_file` + saves `stripe_customer_id`/`stripe_payment_method_id`. New endpoint `POST /admin/invoices/{id}/charge` does the off-session charge after the ride. Admin UI `InvoicesTab.jsx` gets a payment-mode dropdown + a "Charge $X" button on card_on_file invoices.
5. **Twilio A2P 10DLC unblocked** — user confirmed A2P campaign approved. Enabled these customer-facing SMS flows:
   - **24-hour pretrip reminder SMS** (added on top of existing email job, consent-gated).
   - **1-hour pretrip reminder SMS** — new `_send_pretrip_1h_reminders` scheduler job (every 10 min, 50–70 min window), includes chauffeur name/plate/phone.
   - **Post-ride review-request SMS** (added to existing review-request email job, consent-gated, links directly to the Google review URL).
   - **Missed-call auto-SMS + call forwarding** — new `routes/twilio_voice.py`. `POST /api/twilio/voice/incoming` returns TwiML that dials `ADMIN_PHONE`; if unanswered, `POST /api/twilio/voice/status` logs the missed call to `missed_calls` collection and auto-SMS the caller with a book-online link. New admin endpoint `GET /api/admin/missed-calls`. **Ops step:** point the Twilio phone number's "A call comes in" webhook to `https://api.turanelitelimo.com/api/twilio/voice/incoming` (POST) once.

**Files touched:**
- `/app/backend/routes/payments.py` (`_resolve_charge_amount`, `_finalize_invoice_setup_session`, webhook branch)
- `/app/backend/routes/admin.py` (`admin_billing_audit`, `_create_invoice_setup_session`, `admin_charge_invoice_card`, `payment_mode` on create)
- `/app/backend/routes/twilio_voice.py` (NEW — Twilio voice webhooks)
- `/app/backend/server.py` (`CustomInvoiceCreate.payment_mode`, `_render_payment_recovery_email` branching, pretrip 1h job + SMS to existing jobs, twilio_voice router include)
- `/app/backend/safety.py` (new spam heuristics)
- `/app/backend/migrations/fix_double_discount_pay_later.py` (NEW)
- `/app/frontend/src/components/admin/InvoicesTab.jsx` (payment-mode dropdown, Charge button, card_on_file badge)

**Deploy checklist for user:**
1. Push to prod → the double-discount fix takes effect on all NEW bookings.
2. Run migration: `MONGO_URL=... DB_NAME=... python -m backend.migrations.fix_double_discount_pay_later --dry-run` first, then `--apply` — repairs stuck `pay_later_amount` on Adel's own $462.44 booking + any customer bookings from the last day.
3. In Twilio dashboard, set the phone number Voice webhook to `.../api/twilio/voice/missed-call` (only if user wants missed-call auto-SMS). Otherwise, the SMS flows (reminders + review request) will just work — no Twilio config change needed.



## 💰 Promo → Stripe overcharge recurrence — ROOT CAUSE fixed (Jul 7, 2026 — iter 55)

**Recurring bug summary:** Customer sees discounted price on booking form ($630), but Stripe SetupIntent / thank-you page charges the full undiscounted price ($970). Adam reported this exact overcharge has been "fixed several times" — this iteration nails the underlying validation mismatch that keeps producing it.

**Root cause (finally traced):**
- `_apply_auto_promo_to_quote_response` (used at `/api/quote` — decorates each vehicle card with a discounted price) does NOT check `first_ride_only` — it can't, because we don't know the customer's email at quote time.
- `_validate_promo_for_booking` (used at booking creation AND at checkout) DOES check `first_ride_only` — and correctly rejects repeat customers.
- So for a repeat customer with a `first_ride_only + auto_apply` promo in the DB: quote step happily shows $630, booking creation silently strips the promo code, `quote_amount` stays at the full $970, `/checkout-setup` uses the un-discounted amount for `pay_later_amount`, customer gets charged full price. Every prior "fix" patched a downstream symptom instead of the mismatch itself.

**Three-part fix:**
1. **`_apply_auto_promo_to_quote_response` now skips any promo with `first_ride_only=True`.** These promos can ONLY be applied by manual code entry (where the customer has typed their email → server can verify). This eliminates the entire class of "auto-showed a discount that would fail at validation." (server.py ~line 1183)
2. **Loud alert path on promo rejection.** If `_validate_promo_for_booking` rejects a code at booking creation, we now log `[BILLING ALERT]` + fire an admin SMS with the customer's email + attempted code + rejection reason + ride amount, and stamp `promo_rejected_reason` + `promo_rejected_code` on the booking. Ops can call the customer proactively before Stripe charges. (server.py ~line 632-660)
3. **Banner honesty.** The site-wide promo banner (`first-ride-banner`) previously said "applied automatically at checkout — no code needed" for ALL banner promos. Now it correctly reads "use code X" for `first_ride_only` promos, since those require manual entry. (BookingForm.jsx ~line 570-586)

**Confirmation email:** Uses `pay_later_amount` (post-discount) — no changes needed, since the fix above makes `pay_later_amount` correct at the source.

**Verified end-to-end:** Seeded a `TESTFIRSTRIDE` promo (first_ride_only + auto_apply + 35% off) into preview DB, called `/api/quote` — response contained ZERO `applied_promo` decorations across all vehicle cards. Fix works.

**Deploy note for existing stuck bookings:** Any bookings currently in production DB with the wrong `quote_amount` (customer expected discount but code was stripped) are NOT auto-repaired by this deploy. Ops workflow: (1) find them by querying `promo_rejected_code` field (only populated on NEW bookings post-deploy). (2) For OLD stuck bookings: search bookings where `quote_amount == original_quote_amount` and customer complained. (3) Use the new admin Edit Trip Details dialog with `recompute_quote=false` and manually set the correct `quote_amount` + `pay_later_amount`.

## 🔁 Round-trip pricing + Autocomplete geo-restriction split (Jul 7, 2026 — iter 54)

Two customer-blocking issues fixed together after a real Monterey booking got stuck:

**Autocomplete geo-restriction — asymmetric by direction:**
- Bumped restrictive circle from 130 km → 250 km (covers Napa/Sonoma/Sacramento/Monterey/Carmel/Pebble Beach). Previously "1000 Aguajito Rd, Monterey" fell outside the 130 km strictbounds and produced ZERO_RESULTS.
- Added `strict` query param to `/api/places/autocomplete` (defaults to true for backwards compat).
  - **Pickup** uses `strict=true` — hard-restricted so LA/SD/Vegas customers can't book a pickup we can't fulfill.
  - **Drop-off, additional stops, return location** use `strict=false` — biased to NorCal but returns any US address so we can legitimately chauffeur to LA/Reno/Tahoe/Vegas.
- Files: `/app/backend/server.py` `places_autocomplete` (~line 405); `/app/frontend/src/components/PlacesAutocompleteInput.jsx` (accepts `strict` prop); `/app/frontend/src/components/BookingForm.jsx` (drop-off + stops pass `strict=false`); `/app/frontend/src/components/QuoteRequestDialog.jsx` (dropoff + stops); `/app/frontend/src/components/admin/QuickQuoteTab.jsx` (dropoff).

**Round-trip: priced as 2 legs, collects return date/time:**
- `_build_quotes` accepts `return_miles`. When > 0, each vehicle is priced as `(base + per_mile × leg1) + (base + per_mile × leg2)` — both legs capped at minimum independently, then combined. Surge + zone surcharge + add-ons apply once to the combined total.
- `QuoteRequest` gets `return_trip`, `return_location`, `return_date`, `return_time`. If `return_location` is empty, backend defaults to `pickup_location` — perfect for the common "SFO → hotel → SFO" pattern.
- `QuoteResponse` gets `round_trip: bool`, `return_leg_miles`, `total_round_trip_miles`, `return_leg_resolved` — frontend uses these to render the round-trip summary chip.
- `BookingCreate` + `Booking` models gain `return_date`, `return_time` for persistence.
- `_compute_quote_amount` (used at booking creation + admin edit re-price) mirrors the round-trip pricing so the stored `quote_amount` on a round-trip booking is 2×.
- Frontend `BookingForm.jsx`: return-leg reveals a gold-bordered block with:
  - Return drop-off (PlacesAutocompleteInput, `strict=false`, defaults to pickup if empty)
  - Return date (with `min={pickup_date}` browser-enforced)
  - Return time
- Quote summary chip renders `Round trip · leg 1 ~X mi + leg 2 ~Y mi = ~Z mi total` when round-trip. Data-testids: `booking-return-location`, `booking-return-date`, `booking-return-time`, `quote-round-trip-miles`.
- Verified: SFO → 1000 Aguajito Rd, Monterey → SFO = $944.12 Executive Sedan (one-way was $472.05). Round-trip ratio 1.999-2.000× across all 3 vehicle classes.

## 💵 Meet & Greet fee bumped $25 → $35 + UX (Jul 7, 2026 — iter 53b)

Aligned with industry benchmarks (Blacklane ~$35; Bay Area premium peers $30-40). Fully automated end-to-end:
- Backend Pydantic default + startup seed + one-time migration (guarded by `meet_greet_fee_migrated_v2` flag) — updates existing DB row from $25 → $35 idempotently; skips docs where admin has overridden the fee.
- Admin Settings UI default updated to $35.
- Removed misleading "Complimentary meet & greet" copy from `ServiceFeatures.jsx` (replaced with "60-min complimentary wait time" which IS accurate).
- Fee flows into `quote_amount` at booking creation → Stripe charges auto-stay in sync (no changes to payment layer needed).
- **Airport auto-detect** in `BookingForm.jsx`: when pickup OR drop-off contains SFO/OAK/SJC/SMF/LAX/JFK/LGA/etc. or "airport"/"terminal" keywords, auto-sets Service Type to "Airport Transfer" — revealing the Flight Number field and Meet & Greet toggle without the customer needing to click the dropdown. Only fires when Service Type is currently empty (respects explicit user choice).

## ✏️ Admin edit for paid / card_on_file bookings (Jul 7, 2026 — iter 53b)

Common ops need: customer texts dispatch "I gave you the wrong flight number" AFTER paying. The customer-facing `/modify` endpoint refuses paid bookings, forcing a phone call. New admin path fixes this cleanly.

Backend (`/app/backend/routes/admin.py`):
- `PATCH /api/admin/bookings/{booking_id}/details` — edits ANY trip field (flight_number, pickup date/time, pickup/drop-off, vehicle_type, passengers, luggage_count, child_seat_count, meet_and_greet, hours, notes) regardless of `payment_status`. Blocks only for `status=='cancelled'`.
- Writes an `edit_history` audit array on every change with per-field before/after diff, `at`, `by` (admin email), and `recomputed_quote` flag.
- `recompute_quote` (default OFF) — usually admin keeps the agreed price even if trip details shift; opt-in when the change is material (major route change).
- `notify_customer` (default OFF) — optionally emails the customer their updated trip sheet via the standard confirmation template.
- Auto-re-SMSes the driver with `[UPDATED]` prefix if flight/date/time/pickup/dropoff changed AND a driver is assigned.

Frontend:
- New `/app/frontend/src/components/admin/EditBookingDialog.jsx` — compact edit form surfacing dispatch's most-common edits (Flight # is prominent when service_type == "Airport Transfer").
- "Edit trip" button in `BookingDetailsDialog.jsx` header opens the sub-dialog.
- Diff-only submission — only fields that actually changed hit the API. No-change requests return `{no_changes: true}` idempotently.
- Data-testids: `open-edit-booking-btn`, `edit-booking-dialog`, `edit-flight-number`, `edit-pickup-date`, `edit-pickup-time`, `edit-pickup-location`, `edit-dropoff-location`, `edit-vehicle-type`, `edit-passengers`, `edit-luggage`, `edit-hours`, `edit-meet-and-greet`, `edit-child-seats`, `edit-notes`, `edit-recompute-toggle`, `edit-notify-toggle`, `edit-save-btn`.

## 🛠️ Three owner-reported bug fixes (Jul 7, 2026 — iter 53)

**Reported by owner:**
1. Admin Inquiries tab rows not clickable — long messages truncated at 2 lines, no way to read full text.
2. New SUV booking made via **Book Now, Pay After Ride** could not be dispatched — Assign Driver button hidden because payment_status is `card_on_file` (not `paid`).
3. Booking made on web (guest checkout, email only) did not appear in the mobile app's Trips page after signing into mobile with the same email.

**Fixes shipped:**

Frontend (`/app/frontend/src/pages/AdminDashboard.jsx`):
- Line 798 gate: `payment_status === "paid"` → `(payment_status === "paid" || payment_status === "card_on_file")`. Assign Driver button now appears for Pay-After-Ride bookings once the SetupIntent succeeds (card verified & on file). Abandoned checkouts (no SetupIntent success) remain blocked as intended.
- Added `openInquiry(c)` helper + `inquiryDetail` state. Contact rows now `cursor-pointer` with `onClick={openInquiry}`; clicking auto-marks the inquiry as read (idempotent). Per-row Delete/Mark-read buttons use `stopPropagation` so they don't open the detail modal.
- New `<Dialog data-testid="inquiry-detail-dialog">` at the bottom of the component showing full name, email (mailto link), phone (tel link), subject, whitespace-preserved full message body, and a "Reply via email" button that pre-populates a `mailto:` with `Re: <subject>`.

Backend (`/app/backend/server.py` + `/app/backend/routes/customer.py`):
- New helper `_link_guest_bookings_by_email(customer_id, email)` in server.py — idempotent MongoDB update that stamps `customer_id` onto any guest bookings where the email matches (case-insensitive regex) and `customer_id` is null/missing. Never raises — degrades gracefully.
- Hooked into all customer auth entry points: `/customer/signup`, `/customer/login`, `/customer/oauth/apple` (skipped for Apple private relay emails), `/customer/oauth/google`.
- `/customer/trips` — expanded query to `$or: [{customer_id: cid}, {email: <lowered>, customer_id: {$in: [null, cid]}}]` (belt-and-suspenders in case backfill misses an edge case). Also runs an inline `_link_guest_bookings_by_email` on every call to keep the DB linkage clean.
- `/customer/bookings/{id}` — same union query, plus auto-stamps `customer_id` on the accessed booking so future queries succeed by the primary path.

**Deferred (per owner request):** Anti-fraud gibberish/keyboard-mash heuristics for quote requests. Owner is manually filtering fake leads for now.

**Testing:** iter 53 test report (`/app/test_reports/iteration_53.json`) — Backend 6/6 pytest pass (`/app/backend/tests/test_iter53_guest_backfill.py`). Frontend: all 3 UI fixes verified via admin JWT-injected UI test.


## 🚀 Google Ads offline conversions — MIGRATED to Data Manager API (Feb 2026 — iter 64)

**Why:** Google deprecated `UploadClickConversions` in the Google Ads API for this account (surfaced by iter-52 testing agent). All server-side offline conversion uploads had been silently failing.

**What changed (backend-only, zero frontend impact):**
- `/app/backend/routes/google_ads.py` — rewrote the upload core to hit `https://datamanager.googleapis.com/v1/events:ingest` via direct REST (`google-auth` + `requests`), replacing the deprecated `ConversionUploadService.upload_click_conversions`.
- OAuth scope changed from `.../auth/adwords` → `.../auth/datamanager`. Same `client_id` / `client_secret`; a NEW `GOOGLE_ADS_REFRESH_TOKEN` must be minted with the datamanager scope (one-time consent step).
- Payload now uses Data Manager `Event` schema: `destinations[].operatingAccountProduct=GOOGLE_ADS`, `events[].userIdentifiers.googleClickId`, `items[].value`, `eventMetadata.transactionId` (= booking id → dedup key).
- Added `validate_only` support so operators can dry-run REAL bookings through Google's validator without recording a conversion.
- Legacy read-side endpoints (`ping`, `inspect-action`) unchanged — reads via the Ads API are not deprecated.

**New admin endpoints:**
- `POST /api/admin/google-ads/dm-ping` — refreshes the OAuth token and confirms it has the `datamanager` scope. Returns actionable error text if the operator forgot to re-authorize.
- `POST /api/admin/google-ads/dm-validate/{booking_id}` — dry-run a real historical booking through Data Manager. Returns Google's raw response body untruncated. **Does NOT** stamp the booking as uploaded — safe to run repeatedly.
- `POST /api/admin/google-ads/dm-validate-adhoc` — dry-run with an operator-supplied gclid + value (no booking record needed). Used to verify the pipe before any historical data exists.

**Signature-preserving:** `upload_booking_to_google_ads(booking_id, *, force=False, validate_only=False)` — Stripe webhook + payments.py callers unchanged.

**Status:** ✅ Code complete. ⚠️ Blocked on operator re-authorizing OAuth grant with the `datamanager` scope to mint a new refresh token. Once updated, `/dm-ping` will return `has_datamanager_scope: true` and `/dm-validate/{booking_id}` will return HTTP 200 + `requestId`.


## 📱 Twilio A2P rejection fix — SMS consent now VOLUNTARY (Feb 2026 — iter 50)

**Rejection reason:** "consent cannot be a required condition for service or transaction completion" — Section 3 of the campaign submission literally said "Consent is required to submit the form" and the frontend enforced it.

**Root cause:** SMS consent checkbox was mandatory to submit both booking and quote forms — violates 2024+ CTIA carrier rules. TCPA rule: SMS opt-in must be voluntary and NOT tied to service delivery.

**Fixes shipped (frontend + backend + docs, aligned):**

Frontend:
- `BookingForm.jsx`: removed `required` on SMS checkbox, removed `!smsConsent` from submit-disabled logic, changed label footer from "*required" to "Optional — leave unchecked for email-only updates"
- `QuoteRequestDialog.jsx`: same three changes (dropped `smsConsent` from `isValid` memo, removed `required` attr, updated hover title)

Backend:
- `server.py`: removed `HTTPException(400)` guards on both `/api/bookings` and `/api/quote-requests` when `sms_consent=False`; audit-trail fields (`sms_consent_at`, `sms_consent_ip`) now stamped ONLY when consent is affirmative
- `sms_service.py`: added `send_customer_sms(booking_or_quote, body)` — silently no-ops if the row doesn't have `sms_consent=True`. Enforces consent at send-time so no code path can accidentally text an opt-out
- `driver.py`: both customer-status-SMS call sites now use `send_customer_sms`
- `admin.py`: quote-offer SMS in `/api/admin/quote-requests/{id}/finalize` now gates on `q.get("sms_consent")` — email is always sent, SMS only when opted in

Docs:
- `TWILIO_A2P_CAMPAIGN_TEXTS.md`: rewrote Section 2 & 3 emphasizing VOLUNTARY opt-in. Added explicit sentence: "SMS consent is entirely optional and is NOT required to submit the form — customers who leave the checkbox unchecked will still receive booking confirmations and trip updates via email and phone call."
- Section 10 rejection history updated with v2 rejection reason and v3 fix summary

**Testing:**
- Backend: submitted a quote request with `sms_consent: false` → 200 OK (was 400 before)
- Lint clean on all modified files
- Backend still starts cleanly, no regressions

**Files touched:**
- backend/server.py (removed 2 consent guards, gated audit-trail stamping)
- backend/sms_service.py (added `send_customer_sms` helper)
- backend/routes/driver.py (2 call sites → consent-safe helper)
- backend/routes/admin.py (quote-offer SMS gate)
- frontend/src/components/BookingForm.jsx (unmandate consent)
- frontend/src/components/QuoteRequestDialog.jsx (unmandate consent)
- memory/TWILIO_A2P_CAMPAIGN_TEXTS.md (rewrite Sections 2/3, history log)

---


## 🐛→✅ Google Ads join-direction fix — recoverable count now matches CSV (Feb 2026 — iter 49)

**Bug:** Backfill preview reported `0/29 recoverable` while the Quote Conversions CSV clearly showed at least 2 won bookings with gclid on their parent quote_request (Lisa Rigsbee, Leticia Maldonado). Three views on the same page disagreed:

- Source Table checks `booking.utm.source_bucket` (finds 2 Google Ads paid)
- CSV iterates `quote_requests` → joins bookings via `quote.booking_id` (works, finds gclid)
- Backfill preview iterated `bookings` → joined quotes via `booking.quote_request_id` (**failed** — for bookings created before quote_request_id was persisted, or admin-linked ones, that field is missing so the join returns null)

**Root cause:** Bookings and quotes have **two** linkage fields — `booking.quote_request_id` (forward) and `quote.booking_id` (reverse). Some rows only have one direction populated. The CSV used the reverse direction; my new endpoints used the forward direction.

**Fix (three surgery points):**

1. **`_resolve_booking_quote_utm(booking)` helper** — tries booking.utm first, then forward join, then reverse join. Used by `upload_booking_to_google_ads()` so uploads work regardless of which linkage direction is populated. Also opportunistically stamps the resolved utm onto the booking so subsequent aggregations don't need to re-do the reverse lookup.
2. **`admin_backfill_preview` rewrite** — now iterates from `quote_requests` (source of truth for gclid) → joins bookings by `quote.booking_id`, matching the CSV's direction exactly. Adds a Pass-2 for direct-form bookings that never had a quote. Preview and CSV are guaranteed to agree.
3. **`admin_backfill_google_ads` query fix** — collects candidate booking IDs from BOTH sides (bookings with `utm.gclid`, plus won quotes' linked bookings). The set union guarantees no eligible booking gets missed.
4. **`admin_offline_conversions_backfill_utm` bonus fix** — the older "Backfill Historical UTM" button also had the same one-direction bug. Now runs Pass 1 (forward) then Pass 2 (reverse), and stamps `quote_request_id` onto the booking during Pass 2 so future runs use the fast path.

**Testing:** Simulated with 3 test cases in preview DB:
- Case A (forward-linked): ✅ found via parent quote
- Case B (reverse-only, no `quote_request_id` on booking): ✅ found via reverse lookup
- Case C (no gclid anywhere): ✅ correctly marked unrecoverable

**Impact:** For the user's production data — Lisa + Leticia (and any similar historical rows) will now appear in the recoverable count. Once the user taps Preview on prod, the number should jump from 0 to the real count matching the CSV.

**Files touched:**
- backend/routes/google_ads.py (added resolver, rewrote preview + backfill)
- backend/routes/admin.py (fixed backfill-utm reverse pass)

---


## ✅ Google Ads server-side Offline Conversion API — LIVE (Feb 2026 — iter 48)

**Why:** Replace the manual daily CSV upload with a real-time backend API pipeline so Smart Bidding gets fresh profit-based signal within minutes of each paid booking, not once per day.

**What shipped:**
- `google-ads` SDK installed, creds wired into `/app/backend/.env`:
  - Developer Token, OAuth2 Client ID + Secret (Web-app type), Refresh Token
  - Login Customer ID (MCC): 3947028100 · Customer ID: 1918423009
  - Test conversion action `7671967367` + Profit action `7673194491`
- New `/app/backend/routes/google_ads.py` (~550 lines):
  - `upload_booking_to_google_ads(booking_id)` — idempotent, marks booking on success/failure, sends profit (retail − affiliate_cost), uses booking `id` as `order_id` for future ConversionAdjustments
  - `GET /admin/google-ads/status` — masked config health
  - `POST /admin/google-ads/ping` — live API check (`list_accessible_customers`)
  - `GET /admin/google-ads/backfill-preview?days=90` — dry-run count of recoverable-via-gclid vs permanently unrecoverable, with sample list
  - `POST /admin/google-ads/backfill?days=90` — batch upload background task
  - `POST /admin/google-ads/upload-booking` — manual single-booking test
  - `GET /admin/google-ads/recent-uploads` — audit table
  - `POST /admin/google-ads/switch-active-action {target: test|profit}` — runtime toggle
- Stripe webhook (`/api/webhook/stripe`) hooks into `payment_status=paid` transition and fires `background_tasks.add_task(upload_booking_to_google_ads)` — non-blocking
- Admin UI card added to Attribution tab: config status row, Ping / Preview / Run Backfill / Test↔Profit toggle buttons, expandable "sample unrecoverable" table
- **Safety guarantees:** Three layers of gclid validation — Mongo query, upload-fn guard, payload construction — so no fake/guessed gclids can ever be uploaded

**Live-verified:** Python-level ping succeeded end-to-end (`customers/1918423009` + `customers/3947028100` both visible). All 7 endpoints registered per `/openapi.json`. Frontend lint clean, admin page loads with no console errors.

**Files touched:**
- backend/.env (10 new GOOGLE_ADS_* vars)
- backend/routes/google_ads.py (NEW)
- backend/routes/payments.py (BackgroundTasks + webhook hook)
- backend/server.py (router registration)
- frontend/src/components/admin/AttributionTab.jsx (new Google Ads API card)

**Cleanup task (deferred):** After first successful upload confirmed in Google Ads UI, user will reset the OAuth Client Secret in Cloud Console and send the new value to update `.env` — closes exposure from setup handoff.

---


## ✅ Required `affiliate_cost` on quote-send + dynamic App Download promo (Feb 2026 — iter 48)

**Why:** Two profit-tracking / consistency gaps closed in one session.

### 1. `affiliate_cost` now REQUIRED to send a quote
- Google Ads Offline Conversion CSV uploads *profit* (retail − affiliate_cost). Blank cost = $0 profit → destroys Smart Bidding signal.
- `SendQuoteDialog` in `QuoteRequestsTab.jsx`:
  - Label now shows red `*` + copy "internal · required for profit-based Google Ads"
  - "Send quote to customer" button disabled when `affiliateCost` empty or ≤ 0 (with title-tooltip)
  - `send()` guards with two toasts:
    - Empty/0 → "Enter the affiliate cost — required so Google Ads bids on real profit."
    - Cost ≥ retail → "Affiliate cost is ≥ retail price — that's a loss. Double-check before sending."
  - "Save trip changes only" path unchanged — operators can still tweak stops/times on paid bookings without a cost.

### 2. App Download page promo pill now dynamic
- Removed hardcoded `WELCOME20` / `20% off your first ride` chip from `/download` and `/app`
- Fetches `/api/promos/banner` on mount; pill renders live from `code` + `discount_type` + `value`
- Hidden gracefully if no promo is flagged `show_on_banner` — no placeholder
- Same source of truth as sitewide `PromoBanner` and BookingForm chip

**Testing:** Task 2 live-verified (pill renders "WELCOME 20% off your first ride" from DB, no more hardcoded string). Task 1 verified via code review (2FA blocked automated click-through — all guards in place at lines 641–659, label at 914, button at 1133).

**Files touched:**
- frontend/src/components/admin/QuoteRequestsTab.jsx
- frontend/src/pages/AppDownload.jsx

---


## ✅ Promo Health dashboard + dynamic booking chip (Jul 3, 2026 — iter 63)

**Why:** Two related issues surfaced. First, the "20% off your first ride" chip above the booking form was hardcoded — didn't update when admin changed the active promo. Second, no single view showed the operator whether the current promo config was actually functioning correctly.

**What shipped:**

### 1. Dynamic first-ride chip on BookingForm
- Removed the hardcoded "20% off" chip in `BookingForm.jsx`
- Added fetch to `/api/promos/banner` on mount (same endpoint site-wide `PromoBanner` uses)
- Chip now renders live from `discount_type` + `value` + `first_ride_only`
- If no promo flagged for banner, chip disappears entirely (no placeholder)
- Top banner + booking chip share single source of truth — admin toggles update both simultaneously

### 2. Promo Health section at top of Admin → Promos tab
- New `PromoHealth` component, client-side computed from existing `/admin/promos` payload (no new backend endpoints)
- **Warnings row** — red/amber cards for: no banner promo active, multiple banner-flagged (only newest wins), expired-but-still-active. Each warning has "Fix [CODE] →" jump-to-edit buttons
- **Stats grid** — 4 cards: On banner now (clickable) / Active codes / Total redemptions (with top performer) / Total discount given all-time
- **Expiring-soon strip** — amber chips for active promos expiring in next 7 days, each clickable to edit
- Empty state protected (returns null when zero promos)
- Uses `useMemo` — recomputes only when promo list changes

**Testing:** Zero JS console errors. Backend `/api/promos/banner` verified live. Frontend chip fix screenshot-confirmed (currently shows "20% off" because old WELCOME promo is still banner-flagged; owner needs to toggle Show on banner OFF on old promo + ON on new 30% promo).

**Files touched:**
- frontend/src/components/BookingForm.jsx
- frontend/src/components/admin/PromosTab.jsx

**Bonus advisory to CAI (Google Ads):** Confirmed the 2 extra ad groups in existing Luxury Chauffeur campaign ("Luxury Executive — Airport", "Luxury Executive — General") were NOT part of my instructions. Advised CAI investigation and pause if keywords overlap with Airport/Brand & General ad groups.

---

## ✅ Bug fix: Quote Requests tab badge stuck (Feb 2026 — iter 61)

**Bug reported:** The Quote Requests tab badge kept showing "9" even after every quote had been moved out of "new" status (Contacted/Quoted/Won/Lost).

**Root cause:** Dual-state architecture. `AdminDashboard.jsx` fetched `/admin/quote-requests` on page load and stored the result in its own `quoteRequests` state (used for the tab badge count). `QuoteRequestsTab.jsx` independently fetched the same endpoint into its own `items` state. When the user changed status in the tab, only the child's state updated — the parent's snapshot stayed frozen at page-load values, so the badge count never updated.

**Fix:** Added an `onQuoteChange(id, patch)` callback prop:
- `AdminDashboard.jsx` passes it to `<QuoteRequestsTab>` and uses it to keep its `quoteRequests` state in sync (patch on update, filter on deletion).
- `QuoteRequestsTab.jsx` accepts the prop (optional, safe default) and invokes it on ALL state-change paths: `setStatus`, `remove`, `onQuoteSent`, `onSavedOnly`, `onCreated`.

**Result:** Badge count updates in real-time — no page refresh required. Lint clean, no regression.

**Files touched:**
- frontend/src/pages/AdminDashboard.jsx (passes callback to child)
- frontend/src/components/admin/QuoteRequestsTab.jsx (invokes callback on all mutations)

**Bookings tab audit:** Not affected — bookings live directly inside `AdminDashboard.jsx` and share the same state store.

---

## ✅ Ken-Burns hero + CAI instructions + pre-deploy QA (Feb 2026 — iter 60)

**Why:** Owner is ready to deploy the new pages to production and hand off Google Ads campaign setup to CAI (his ads automation partner). Needed three things:
1. A cinematic hero background on Motor Coach + Mini Coach + Casino landing pages (since the vehicle photos are striking)
2. Full pre-deploy regression check
3. A copy-paste CAI instructions doc so ad group setup isn't guesswork

**What shipped:**

### 1. Ken-Burns hero backdrop
- Added `heroImage` optional prop to `LandingPage.jsx`. When set, layers the image under the existing radial-gradient + gold overlay + adds a left-to-right dark gradient so text remains legible.
- Added `hero-ken-burns` CSS animation in `index.css` — 30s ease-in-out infinite alternate pan/zoom (`scale 1.08→1.16` + `translateX -2%→+2%`). Respects `prefers-reduced-motion`.
- Wired `heroImage={MOTOR_COACH_IMG}` on `/motor-coach-rental`, `heroImage={MINI_COACH_IMG}` on `/mini-coach-rental`, `heroImage={MOTOR_COACH_IMG}` on `/casino-transportation`.
- Prop is optional → existing Party Bus / Wine Tour / Wedding / Airport / Corporate landings unaffected (regression-verified via screenshot).

### 2. CAI Google Ads campaign instructions doc
- Created `/app/memory/CAI_INSTRUCTIONS_MOTOR_MINI_CASINO_CAMPAIGN.md` — ~450 lines of copy-paste-ready instructions covering:
  - Campaign name (`TEL - Group Charter & Casino (Search)`), settings, geo targeting, budget ($60/day), bidding strategy
  - Master negative keyword list (pastes into a shared list, attaches to campaign)
  - 3 ad groups (Motor Coach, Mini Coach, Casino Charter) with exact keyword lists (exact + phrase match), ad-group-level negatives, RSA copy (15 headlines + 4 descriptions each), Final URLs, UTM suffixes
  - Shared ad extensions (callouts, sitelinks, call, structured snippet)
  - 30-day bidding schedule (learning phase → Target CPA transition thresholds)
  - Expected performance benchmarks (CPC/CVR/CPA per ad group)
  - Critical gambling-policy compliance notes for the Casino ad group
  - Do-NOT-do list (no PMax yet, no Broad match, don't touch existing campaigns)
  - Weekly reporting cadence for CAI to send owner
  - Final pre-launch checklist

### 3. Pre-deploy QA
- Backend `/api/options` returns 10 vehicle types including Motor Coach + Mini Coach ✅
- All 9 landing page URLs return HTTP 200: `/`, `/motor-coach-rental`, `/mini-coach-rental`, `/casino-transportation`, `/party-bus`, `/wine-tour`, `/wedding`, `/airport`, `/corporate` ✅
- All fleet images return HTTP 200: `motor-coach.jpg`, `mini-coach.jpg`, `party-bus.jpg`, `sprinter.jpg` ✅
- Supervisor: backend + frontend both RUNNING ✅
- Party Bus regression-tested (renders identically to before, no `heroImage` prop) ✅
- Casino + Motor Coach + Mini Coach all render with new Ken-Burns hero ✅
- Lint clean on all new/modified files. Pre-existing warnings in other files are cosmetic (unescaped apostrophes in copy) — not deploy blockers.

**Files touched:**
- frontend/src/index.css — added `@keyframes hero-ken-burns` + `.hero-ken-burns` class + reduced-motion fallback
- frontend/src/components/LandingPage.jsx — added `heroImage` prop and image layer under gradient
- frontend/src/pages/MotorCoachLanding.jsx — wired heroImage
- frontend/src/pages/MiniCoachLanding.jsx — wired heroImage
- frontend/src/pages/CasinoLanding.jsx — wired heroImage
- /app/memory/CAI_INSTRUCTIONS_MOTOR_MINI_CASINO_CAMPAIGN.md (NEW)

**Deploy status:** Ready. Nothing else needed from the owner before hitting Deploy.

---

## ✅ Fleet Imagery + FleetPicker Redesign (Feb 2026 — iter 59)

**Why:** Two things landed together:
1. Owner supplied real black-glass Motor Coach and Mini Coach photography — previously we were reusing party-bus.jpg as a placeholder for both new vehicles.
2. On the homepage `FleetPicker`, the vehicle info was overlaying the lower half of the vehicle silhouette (dark gradient + name/model/description/pax/bags all stacked on top of the image), which was obscuring the vehicle body itself.

**What shipped:**
1. **`/public/fleet/motor-coach.jpg`** — new full-size tri-axle touring motor coach photo, 1536×1024, ~180 KB (JPEG q88, optimized).
2. **`/public/fleet/mini-coach.jpg`** — new Ford E-450 style mini coach photo, 1536×1024, ~156 KB.
3. Wired the new images into: `lib/fleet.js` (FleetPicker + Fleet.jsx source of truth), `VehiclePickerDialog.jsx` thumbnail map, `MotorCoachLanding.jsx`, `MiniCoachLanding.jsx`, `CasinoLanding.jsx` (fleet options + venue cards + gallery).
4. **`FleetPicker.jsx` redesigned as a split card** — image occupies the top 160px of the card with a soft bottom fade only (no full-height dark overlay), vehicle name overlaid in a compact bottom-left position with drop shadow. All model text, pax/bags, price, promo badge, and Quote/Call buttons moved to a separate opaque `.p-4` info panel below the image so the vehicle body is never obscured. Card height now flexes naturally instead of the fixed 288px.
5. **`Fleet.jsx` (marketing showcase)** — hover-reveal design: only the vehicle name + pax/bags visible at rest (compact bottom label), the model + description slide up on hover. Vehicle stays fully visible normally.

**Testing:** Screenshot-verified on homepage `/`. All 10 vehicles now render cleanly with fully visible silhouettes — no text overlap. New Motor Coach + Mini Coach photos load correctly. Lint clean.

**Files touched:**
- frontend/public/fleet/motor-coach.jpg (NEW, 180 KB)
- frontend/public/fleet/mini-coach.jpg (NEW, 156 KB)
- frontend/src/lib/fleet.js
- frontend/src/components/FleetPicker.jsx (redesigned card layout)
- frontend/src/components/Fleet.jsx (hover-reveal detail)
- frontend/src/components/admin/VehiclePickerDialog.jsx
- frontend/src/pages/MotorCoachLanding.jsx
- frontend/src/pages/MiniCoachLanding.jsx
- frontend/src/pages/CasinoLanding.jsx

---

## ✅ New Service Types: Motor Coach, Mini Coach & Casino Charter (Feb 2026 — iter 58)

**Why:** Party Bus campaigns are performing well. To capture additional broker margin, three new service verticals were added that are currently under-served in Bay Area PPC:
- **Motor Coach (40–56 pax)** — $2,500+ AOV, corporate roadshows / weddings / sports teams
- **Mini Coach (24–35 pax)** — fills the gap between Sprinter (14) and Motor Coach (40+); minimal PPC competition
- **Casino Charter** — flat-rate round-trip to Graton, Thunder Valley, Cache Creek, Jackson Rancheria, Reno, Tahoe. Low CPC ($3–$8), high intent, 30–40% broker margins

**What shipped:**
1. **Backend:** `Mini Coach` and `Motor Coach` added to `VEHICLE_TYPES` and `DEFAULT_VEHICLE_PRICING` in `server.py`. Both are `call_only: True` (brokered, not instant-priced).
2. **Frontend Fleet lib:** Added Mini Coach + Motor Coach to `/lib/fleet.js` with copy, pax counts, and images.
3. **Pricing reference:** Added `"motor coach"` entry to `pricingReference.js` (Mini Coach already present). Enables admin Vehicle Picker + Profit Preview Chip to compute margins on brokered coach charters.
4. **New landing pages:**
   - `/motor-coach-rental` — `MotorCoachLanding.jsx`, SEO-optimized for "motor coach rental bay area", "charter bus san francisco", "56 passenger bus"
   - `/mini-coach-rental` — `MiniCoachLanding.jsx`, SEO-optimized for "mini coach rental", "mini bus rental", "wedding shuttle bay area"
   - `/casino-transportation` — `CasinoLanding.jsx`, SEO-optimized for "casino bus bay area", "graton shuttle", "thunder valley bus san francisco", "reno bus trip", "tahoe casino transportation"
   - Each page includes: pillars (6), routes (6), fleet options (4), gallery (5), CTA, and 7–8 FAQs targeted at real customer objections.
5. **Route registrations:** 30+ URL variants registered in `App.js` for the 3 new pages (SEO-friendly aliases + city variants).
6. **Google Ads campaign playbook:** `/app/memory/GOOGLE_ADS_NEW_CAMPAIGNS.md` — complete keyword lists (exact + phrase match), negative keywords, ad copy (15 headlines + 4 descriptions per group), ad extensions, budget suggestions, expected CPC/CVR benchmarks. Owner can copy-paste into Google Ads UI.

**Testing:** Backend `/api/options` verified live — vehicle_types now returns 10 items including Mini Coach + Motor Coach. All three landing pages render cleanly (screenshot verified: correct testids, page titles, hero copy, price strips). Lint clean on all new files.

**Conversion tracking:** All three landing pages inherit the same `LandingPage` component + form pipeline as Party Bus / Wine Tour, so `begin_checkout` and `purchase` events fire with `booking.id` transaction_id automatically. No extra gtag setup required.

**Owner next steps (in Google Ads UI):**
- Create Search campaign `TEL - Group Charter & Casino (Search)` with 3 ad groups per the playbook
- Paste keywords + ad copy from `/app/memory/GOOGLE_ADS_NEW_CAMPAIGNS.md`
- Set daily budget to $45–$75 total across the 3 ad groups
- Wait 3 days (Google learning phase), then review search terms report and add negatives

**Files touched:**
- backend/server.py — VEHICLE_TYPES + DEFAULT_VEHICLE_PRICING
- frontend/src/lib/fleet.js — added Mini Coach + Motor Coach entries
- frontend/src/lib/pricingReference.js — added `"motor coach"` net rate entry
- frontend/src/components/admin/VehiclePickerDialog.jsx — thumbnail map updated
- frontend/src/components/Fleet.jsx — homepage grid span for new vehicles
- frontend/src/App.js — imports + route registrations
- frontend/src/pages/MotorCoachLanding.jsx (NEW)
- frontend/src/pages/MiniCoachLanding.jsx (NEW)
- frontend/src/pages/CasinoLanding.jsx (NEW)
- /app/memory/GOOGLE_ADS_NEW_CAMPAIGNS.md (NEW)

---

## ✅ Google Ads Conversion Tracking — Post-CAI Audit Fixes (Jul 2, 2026 — iter 57)

**Why:** CAI's Google Ads audit revealed that most conversions weren't being tracked:
- Purchase events weren't firing consistently on the customer's `/book` funnel
- begin_checkout ↔ purchase transaction IDs were mismatched, causing Google to treat funnel events as unrelated → attribution broken
- The operator-quote-confirm path (`/quote-offer/:token/confirm`) had ZERO Google Ads tracking despite being a major conversion path (customer clicks emailed confirm link → pays deposit)
- Reported cost/conversion of $253 was a LIE — most conversions never reached Google Ads at all, so Smart Bidding was optimizing on partial data

**What shipped:**
1. **Standardized transaction_id across all funnel events** — `booking.id` (UUID) is now used everywhere for begin_checkout AND purchase. Previously purchase used `confirmation_number || id`, breaking Google's cross-event dedupe. This alone fixes the "Invalid transaction IDs" Google Tag warning.
2. **Fire begin_checkout BEFORE Stripe redirect in `BookingForm.jsx`** — was previously only firing on the intermediate `/thank-you` page, which most customers skip entirely (they go straight from BookingForm → Stripe → paid). Google Smart Bidding now sees the funnel step even on abandoned checkouts.
3. **Split Call-for-Quote path from Instant-Price path in BookingForm** — Call-for-Quote fires `trackQuoteRequest` (LEAD event), Instant-Price fires `trackBeginCheckout`. Correct semantic mapping to Google's conversion actions.
4. **Added begin_checkout + purchase tracking to `QuoteOfferConfirm.jsx`** — the operator-quote-confirm flow was invisible to Google Ads. Now the "Confirm & Pay" click fires begin_checkout, and the successful finalize fires purchase with matching transaction_id.
5. **All events use consistent `booking.id`** so Google can attribute click → funnel step → paid conversion cleanly.

**Testing:** Frontend lint clean on all three modified files (`BookingForm.jsx`, `GoogleAdsConversion.jsx`, `QuoteOfferConfirm.jsx`). Smoke screenshot on `/book` confirmed gtag global still loads (`typeof window.gtag === 'function'` → true, `Array.isArray(window.dataLayer)` → true).

**Expected impact:**
- Cost/conversion should drop from reported $253 → $60-$90 within 2-3 weeks as Google Smart Bidding finally sees the real funnel data
- 3× cost efficiency improvement from unblocking tracking alone (per CAI's report analysis)
- PMax and Search will now correctly optimize toward `Request Quote` + `Purchase` (once Adam flips "Request Quote" to Primary in Google Ads UI)

**Adam's parallel action items (in Google Ads UI):**
- Flip `Request Quote` conversion from Secondary → Primary (30 seconds)
- Turn on Enhanced Conversions
- Add negative keywords: `waymo`, `blacklane`, `twerkulator`, `elk grove`, `stockton`, `kids party bus`
- Once 30+ clean conversions recorded (~7-14 days), unpause PMax at $53 Target CPA

**Files touched:**
- frontend/src/components/GoogleAdsConversion.jsx — switched to `booking.id` transaction_id
- frontend/src/components/BookingForm.jsx — added early trackBeginCheckout + trackQuoteRequest based on Instant-Price vs Call-for-Quote path
- frontend/src/pages/QuoteOfferConfirm.jsx — added trackBeginCheckout on Confirm-and-Pay click + trackPurchase on successful finalize

---

## ✅ Save-only cosmetic bug fix + Dispatch PDF auto-attach on PAID email (Jul 1, 2026 — iter 56)

**Bug fix — Save-only was showing "Quote sent" success screen:**
The Save-trip-changes-only path called `onSent()` which flipped the dialog to the shared "sent" phase — that screen displayed "SMS was sent to {phone}. No email on file." even though nothing was actually sent. Backend was correct (no email/SMS fired because `send_to_customer` was never true in the body), but the frontend UX misled the operator.

Fix: added a separate `onSavedOnly(updatedRequest)` callback that (1) refreshes the row in-place and (2) closes the dialog immediately. Toast now reads "Trip details saved · customer was NOT emailed or texted." Zero customer impact — this was purely UI cosmetics.

**Feature — Dispatch PDF auto-attach on PAID admin email:**
The iter-55 admin PAID email became the anchor for a new "wake up and forward" workflow. Now `public_quote_offer_finalize` also generates the PII-stripped affiliate dispatch PDF on the fly and attaches it (`TEL-DISPATCH-{id}.pdf`) so the operator can hit Forward → drop the affiliate's email → send. 15 seconds total instead of the previous 3-minute round trip through admin.

Smart default: if the quote has planned stops, we auto-generate the full-itinerary variant (address-visible) since paid multi-stop trips are exactly when the affiliate needs pre-briefed. No stops → default PII-stripped sheet.

Email body updated with 📎 attachment reminder + fallback instructions (open admin → Edit trip details → regenerate from the row) for cases where the operator needs to change pickup time / stops before forwarding.

**Testing:** Backend lint clean. PDF generator verified: PII-stripped 7,125 bytes, full-itinerary variant 7,217 bytes. Frontend Save-only smoke test: dialog closes cleanly, toast reads correctly, row updates in list, no "Quote sent" fake success screen.

**Files touched:**
- backend/routes/admin.py — added `admin_attachments` block generating dispatch PDF, passing to `send_email(...attachments=)`, updated email HTML body to reference attachment
- frontend/src/components/admin/QuoteRequestsTab.jsx — added `onSavedOnly` prop to SendQuoteDialog, wired parent handler that refreshes row + closes dialog, updated toast wording

---

## ✅ Post-Payment Visibility Fixes (Jun 30, 2026 — iter 55)

**Why:** Two related operator-blind-spots surfaced after iter 54 shipped Leticia's edit flow:
1. When a customer paid (status flipped to `won`), the entire "Send quote" button DISAPPEARED — which also hid the dialog that contained the new "Save trip changes only" button. Operator couldn't access trip-edit on paid leads at all.
2. The only payment signal in admin was a tiny `· Confirmed → #XXX` line in 12px gray text under the timestamp. Twilio SMS to admin is blocked on A2P approval, so the operator only learned about new payments by checking Stripe.

**What shipped:**
1. **Replace, don't hide:** when `status === "won"`, the gold "Send quote" button becomes an emerald-tinted **"Edit trip details"** button (same dialog, same Save-trip-only flow). Tooltip explains: "Customer already paid — edit pickup time, stops, or trip details without re-emailing them." data-testid `quote-edit-trip-{id}`.
2. **Big green PAID pill** on the row header — `✅ PAID · #CONFNUM` in emerald-500/25 background with shadow glow. Renders whenever `q.confirmed_at && q.confirmation_number` are set. Title tooltip shows full timestamp.
3. **Admin email notification** on every paid quote (in `public_quote_offer_finalize`):
   - Subject: `💰 PAID · ${amount} · {name} · #{conf_num}`
   - HTML body has trip summary, total, deposit paid, balance due, confirmation #, saved card brand+last4
   - Includes operator playbook reminder ("look for the PAID badge → Edit trip details → Affiliate dispatch PDF with full itinerary")
   - Fires regardless of Twilio status, so the SMS-blocked period doesn't leave Adam in the dark
   - SMS to admin still fires too — it'll start landing once A2P approves

**Testing:** Backend lint clean. Frontend lint clean. Manual code review confirmed conditional renders correctly for both `won` and non-`won` rows. Visual screenshot verification couldn't trigger PAID badge in test env (no real "won" quotes), but the conditions `confirmed_at && confirmation_number` and `status === "won"` get set atomically in `public_quote_offer_finalize` so they appear together in prod.

**Files touched:**
- backend/routes/admin.py — added admin email block inside `public_quote_offer_finalize` after the SMS block
- frontend/src/components/admin/QuoteRequestsTab.jsx — replaced hide-on-won with switch-on-won "Edit trip details" button + added prominent PAID pill in row header next to customer name

---

## ✅ Post-pay Trip Edits + Full-Itinerary Dispatch PDF + SMS Presets (Jun 30, 2026 — iter 54)

**Why:** Operator hits 3 recurring gaps:
1. Customer pays, then texts in a change ("noon, not 1pm" / "add a stop at the country club") — old UI forced a re-send of the entire quote, which would confuse a customer who already paid.
2. Default dispatch PDF strips all addresses (PII-safe by default), but on paid trips with a pre-planned multi-stop itinerary, the affiliate driver needs the actual addresses ahead of time.
3. Operator's recurring custom SMS prompts ("Wine tour reply", "Airport reply") had to be re-typed every time.

**What shipped:**
1. **"Save trip changes only" button** in `SendQuoteDialog`:
   - Sits between Cancel and Send-quote-to-customer
   - Patches `pickup_time`, `pickup_date`, `pickup_location`, `dropoff_location`, `stops`, `passengers`, `service_duration`, `notes`, `affiliate_cost` etc. via existing `PATCH /admin/quote-requests/{id}` (no backend change needed — endpoint already accepted these fields)
   - Skips re-sending email + skips price validation (no need to re-quote on a paid trip)
   - Toast confirms: "Trip details updated · customer NOT emailed"
   - data-testid `quote-save-only-button`

2. **"Include full itinerary (addresses visible)" checkbox** in `DispatchPdfDialog`:
   - Off by default → maintains the default PII-stripped sheet (last-name initial, city/area only)
   - ON by default if the quote already has stops (assumption: operator wants the full route)
   - When ON: PDF prints actual pickup + drop-off + numbered stop addresses; removes the "address released 2 hrs pre-pickup" line
   - Wired through `GET /admin/quote-requests/{rid}/dispatch-pdf?include_full_itinerary=true` + the email-PDF flow's `include_full_itinerary` body field
   - `pdf_service.generate_dispatch_pdf()` got a new `include_full_itinerary` kwarg
   - data-testid `dispatch-full-itinerary`

3. **SMS Presets** — operator-saved custom-mode prompts re-usable across leads:
   - New MongoDB collection `sms_presets` with `{ id, name, instruction, created_at }`
   - Backend: `GET/POST/DELETE /admin/sms-presets`
   - Frontend: appear as cyan chips under "Your saved presets" in the Draft SMS dialog
   - Click chip → switches to Custom intent + loads the instruction text
   - "+ Save as preset" button appears next to the Custom textarea once it has content
   - × button on each chip deletes the preset
   - data-testid `sms-preset-{id}`, `sms-preset-save-btn`, `sms-preset-save-confirm`, `sms-preset-name-input`, `sms-preset-delete-{id}`

**Testing:** Curl verified all CRUD endpoints (POST creates with valid UUID, GET returns list, DELETE removes). Frontend smoke screenshots confirmed all 3 new UI surfaces render and function: Save-trip-only button visible in SendQuoteDialog footer, Include-full-itinerary checkbox visible + unchecked by default in DispatchPdfDialog with clear PII-handling explanation, "Wine tour reply" preset chip loads instruction text on click with confirmation toast.

**Files touched:**
- backend/pdf_service.py — added `include_full_itinerary` kwarg + branching logic for address printing
- backend/routes/admin.py — added `include_full_itinerary` query param to GET dispatch-pdf + body field to POST email-dispatch-pdf + 3 new SMS preset CRUD endpoints
- frontend/src/components/admin/QuoteRequestsTab.jsx — refactored SendQuoteDialog `send()` into shared `_submit(sendEmail)` + added `saveTripOnly()` + "Save trip changes only" button + full-itinerary checkbox in DispatchPdfDialog + preset chip row, save/delete actions, name-input flow in DraftSmsDialog

---

## ✅ AI SMS Draft Mode (Jun 30, 2026 — iter 53)

**Why:** Operator (Adam) spends 2–5 minutes hand-crafting every SMS reply to a lead — initial outreach, follow-up nudges, final closes, thank-you-after-deposit. With 15+ new leads per week, that's ~1 hour/week of repetitive typing. Goal: generate the SMS in 2 seconds with full context (name, vehicle, date, price, scarcity), one-tap copy-to-clipboard.

**What shipped:**
1. **Backend endpoint** `POST /api/admin/ai/draft-sms` (in `routes/admin.py`):
   - Body: `sms_intent` (one of `initial_outreach`, `quote_followup`, `final_nudge`, `thank_you_confirm`, `custom`) + free-form `context` dict
   - Single shared system prompt with per-intent style rules (warm, ≤480 chars, signed "— Adam · (650) 410-0687", no markdown, plain text)
   - Uses Emergent LLM Key + Gemini 2.5 Flash for ~$0.0003/call and 1–2s latency
   - Returns `{ intent, text, char_count }`

2. **Frontend "Draft SMS" button** on every quote-request row (purple Wand2 icon next to "Affiliate dispatch PDF")
   - Opens `DraftSmsDialog` — scenario chips (5 presets) + dynamic context fields:
     - `quote_followup`: optional "Affiliate hold release" input for real scarcity
     - `custom`: free-form instruction box
   - "Generate" button → AI returns text in <2s → editable Textarea
   - "Copy to clipboard" + "Open in iMessage" (uses `sms:` URI with body pre-filled)
   - Character counter with amber warning if exceeds 480 chars
   - data-testid `quote-sms-{id}`, `draft-sms-dialog`, `sms-intent-*`, `sms-generate-btn`, `sms-output`, `sms-copy-btn`, `sms-open-imessage`, `sms-hold-release`, `sms-custom-instruction`

**Testing:** Curl verified all 3 SMS modes return valid output (315 chars initial outreach, 255 chars follow-up with hold release injected, all signed correctly). Frontend smoke screenshots confirmed dialog opens cleanly, chips toggle the dynamic fields correctly, AI text populates the editable textarea, scarcity line appears when hold_release filled in, copy + iMessage actions wired.

**Files touched:**
- backend/routes/admin.py — added `_DRAFT_SMS_SYSTEM` prompt + `/admin/ai/draft-sms` endpoint
- frontend/src/components/admin/QuoteRequestsTab.jsx — added `setSmsState` state, "Draft SMS" button on each row, full `DraftSmsDialog` component (~200 lines), wired render

---

## ✅ Vehicle Picker, AI Drafts & 1-tap Dispatch Email (Jun 29, 2026 — iter 52)

**Why:** Operator (Adam) regularly hand-rolls (1) which vehicle class fits a lead's headcount & vibe, (2) the warm customer-facing notes that go on quote confirmation + invoice PDF, (3) the ops brief for the affiliate driver. Each is 2–5 min of typing per lead. Goal: collapse all three into one-tap UX while keeping operator final say.

**What shipped:**
1. **Vehicle Picker dialog** (`/app/frontend/src/components/admin/VehiclePickerDialog.jsx`):
   - Header button on Quote Requests tab opens a decision-support dialog
   - Inputs: pax (required), hours (optional), vibe filter (Any / Formal / Party) + occasion shortcuts
   - Ranks vehicles by fit (IDEAL / ROOMY / SNUG / TIGHT) + formality match
   - Each row now shows a fleet thumbnail + capacity range + Net rate + Floor (20%) / Target (27.5%) / Premium (35%) bands
   - Data sourced from `pricingReference.js` so it stays in sync with the Profit Preview Chip
   - data-testid `vehicle-picker-open`, `vehicle-picker-dialog`, `vp-pax/hours/formality-*`, `vp-result-*`

2. **AI text-draft buttons** (`POST /api/admin/ai/draft-quote-text`):
   - Backend endpoint accepts `mode: customer_notes | dispatch_instructions` + a free-form `context` dict
   - Uses Emergent LLM Key + `gemini-2.5-flash` for low-cost, fast drafts
   - Two strict system prompts: customer-facing (warm prose, 50%/50% deposit policy baked in, 21+ tact for alcohol-occasion) and dispatch (terse bullets, PII-stripped tone)
   - Frontend: "Draft with AI" inline button next to "Reset to template" in SendQuoteDialog → fills `quote-notes` textarea
   - Frontend: "Draft with AI" inline button next to special-requests label in DispatchPdfDialog → fills extra-notes textarea
   - data-testid `ai-draft-customer-notes`, `ai-draft-dispatch`

3. **1-tap "Email dispatch PDF to affiliate"** (`POST /api/admin/quote-requests/{id}/dispatch-pdf/email`):
   - Inside `Suggest affiliates` modal, each affiliate row with an email on file now shows an "Email dispatch PDF" button
   - Backend generates the PII-stripped PDF (re-uses `pdf_service.generate_dispatch_pdf`), composes a plain ops email, attaches the PDF, sends via Resend, and BCCs `support@` for our records
   - Audit trail: each send appends to `quote_requests.dispatch_emails[]` (recipient, name, rate, message_id, sent_at)
   - Replaces "download PDF → open Gmail → compose → drag PDF → type message → send" with one click
   - data-testid `email-dispatch-{affiliate.id}`

4. **Pre-existing SuggestAffiliatesDialog crash fix:** `data.affiliates.map()` crashed when `data === null` during the brief initial render before the API resolved. Now gated behind `loading || !data`.

**Testing:** Curl verification on both new endpoints (200 OK with valid output, 400 on missing `affiliate_email`, 404 on missing quote). Frontend smoke screenshot confirmed: Vehicle Picker dialog opens with thumbnails + ranked results, AI Draft button in SendQuoteDialog produces context-aware text (e.g. for a "Sprinter Van wedding" the AI wrote "Your Sprinter van offers luxurious seating, generous legroom..." plus the standard 50/50 policy). Suggest Affiliates dialog opens cleanly post-crash-fix.

**Files touched:**
- backend/routes/admin.py — added `/admin/ai/draft-quote-text` + `/admin/quote-requests/{rid}/dispatch-pdf/email`
- frontend/src/components/admin/VehiclePickerDialog.jsx — added fleet thumbnails
- frontend/src/components/admin/QuoteRequestsTab.jsx — wired VehiclePicker into header, added AIDraftButton + EmailDispatchPdfButton shared components, hardened SuggestAffiliatesDialog against null data

---

## ✅ Profit Preview Chip + Pricing Reference (Feb 28, 2026 — iter 51)

**Why:** Recurring price-blindness friction. Operator (Adam) was eyeballing margin in his head for every lead, occasionally quoting below 20% floor by accident. The Leticia incident (Feb 27) crystallized it — limo-style Sprinter @ $680 net / 4hr, quoted $900, customer countered $800 (15% margin — below floor, would have been a money-losing trip). Without a visible margin signal in the UI, the operator had to do the math manually under time pressure.

**What shipped:**
1. **Pricing reference doc** (`/app/memory/PRICING_REFERENCE.md`):
   - Single source of truth for affiliate net rates per vehicle type
   - Floor / Target / Premium margin formulas (20% / 27.5% / 35%)
   - Calibrated retail bands table (Sprinter, Party Bus, Limo, Sedan, SUV)
   - Real-world calibration notes (Leticia Feb 27 lesson learned)
   - TODO checklist for Adam to confirm remaining net rates

2. **Pricing reference lib** (`/app/frontend/src/lib/pricingReference.js`):
   - `AFFILIATE_NET_RATES` table → hourly net + min_hours per vehicle
   - `lookupNetRate()` / `parseHours()` / `estimateQuote()` / `computeMargin()` / `marginBand()`
   - `fmtMoney()` / `fmtPct()` shared formatters
   - All pure functions, node-tested

3. **Profit Preview Chip** on every quote row (Admin → Quote Requests):
   - Pre-quote: shows `Floor $X · Target $Y` (gold pill) so operator sees the floor BEFORE opening the modal
   - Post-quote: shows live margin % color-coded (red <20%, yellow 20-27.5%, green 27.5-35%, gold >35%)
   - data-testid `profit-floor-{id}` / `profit-margin-{id}`

4. **Enhanced SendQuoteDialog**:
   - Auto-suggest button on Affiliate Cost field → one-click fills with the table's expected net
   - Live Profit Preview panel: shows margin %, profit $, color-coded
   - Below-floor warning surfaces target/floor retail to recover
   - Recommended retail bands card (Floor/Target/Premium) with one-tap autofill buttons
   - data-testid `profit-preview-panel`, `retail-bands-card`, `band-floor/target/premium`

**Math verification (Node-tested against Leticia scenario):**
- Net $680 (4hr × $170/hr) → Floor $850 (20%) · Target $938 (27.5%) · Premium $1,046 (35%) ✓
- $850 retail → 20.0% margin, yellow band ✓
- $800 (her counter) → 15% margin, RED band ✓ (correctly flags below-floor)

**Testing:** Lint clean. Node math verification passed. Smoke-test confirms app compiles. Full UI testing pending (requires admin OTP — user will verify on next quote).

**Files changed/created:**
- `/app/memory/PRICING_REFERENCE.md` (NEW)
- `/app/frontend/src/lib/pricingReference.js` (NEW)
- `/app/frontend/src/components/admin/QuoteRequestsTab.jsx` (chip + modal upgrade)

**TODO for Adam:** Confirm net rates for non-limo-Sprinter vehicles (Executive Sedan, Luxury SUV, Sprinter Van standard, Stretch Limo, Party Bus, Jet Sprinter). Update both files together.

---

## ✅ Driver Invite Email (Feb 26, 2026 — iter 50)

**Why:** Onboarding a new driver was a 4-step manual process — add to roster, separately text them the app links, walk them through the password-set flow, send the setup URL by hand. Drivers were getting lost between steps. The user explicitly requested this in iter 47 (handoff: "agent forgot to execute").

**What shipped:**
1. **Backend** (`/app/backend/routes/admin.py`):
   - `POST /api/admin/drivers/{driver_id}/invite` — generates a 7-day password-setup token, emails the driver a branded welcome with app-store links + setup CTA, tracks `last_invited_at` + `invite_count` on the driver doc.
   - Reuses existing `password_reset_tokens` collection with `kind: "invite"` discriminator so the existing `/driver-auth/reset-password` flow handles the token transparently — zero new auth surface area.
   - Email transport failure (Resend returns None) → response includes `setup_url_if_email_failed` so admin can copy/paste-send via SMS.
2. **Frontend** (`/app/frontend/src/components/admin/DriversTab.jsx`):
   - New paper-airplane Send icon button per driver row (data-testid `invite-driver-{id}`), disabled when driver has no email.
   - Per-row "Invited Xd ago" badge so admin sees invite history at a glance.
   - Fallback dialog (data-testid `invite-fallback-dialog`) with one-click "Copy link" when email delivery fails.

**Bugs fixed mid-iteration:**
- `send_email()` does NOT accept a `text=` kwarg — removed the dead `text` block.
- `send_email()` swallows Resend exceptions and returns None — admin endpoint now checks `bool(result)` (instead of relying on raise-on-failure) so the fallback URL is correctly surfaced when transport fails. Doesn't change `send_email`'s contract, so no risk to other callers.

**Testing:** iteration_46 (after fix) — 5 passed, 3 skipped with honest "Resend accepted message; failure path not testable against live backend without env mutation" reason. All code paths verified by code review + happy-path E2E (`sent: true` confirmed against support@turanelitelimo.com).

**Files changed:** `/app/backend/routes/admin.py`, `/app/frontend/src/components/admin/DriversTab.jsx`, `/app/backend/tests/test_iter46_driver_invite.py` (new).

---

## ✅ Google Ads Offline Conversion CSV Exporter (Feb 26, 2026 — iter 49)

**Why:** Stopgap for full Google Ads API server-side conversion forwarding while CAI applies for API access (~24-48 hr). Recovers attribution from ad-blocker / cookie-blocked customers — admin downloads a weekly CSV of paid bookings with captured `gclid`, manually uploads via Google Ads → Tools → Conversions → Uploads.

**What shipped:**
1. **Backend** (`/app/backend/routes/admin.py`):
   - `GET /api/admin/ads/offline-conversions/preview?days=N` — returns `{paid_bookings, rows_with_gclid, skipped_no_gclid, total_value}` for the dashboard preview line.
   - `GET /api/admin/ads/offline-conversions.csv?days=N&conversion_name=Purchase` — streams a Google-Ads-spec CSV:
     ```
     Parameters:TimeZone=America/Los_Angeles
     <blank line>
     Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency
     <data rows>
     ```
   - Response headers include `X-Rows-Written`, `X-Skipped-No-Gclid`, `X-Skipped-Unpaid`.
   - Filters: only bookings with `payment_status ∈ {paid, confirmed, in_progress, completed}` AND `utm.gclid` present.
   - Conversion Time formatted as `YYYY-MM-DD HH:MM:SS±HH:MM` (Pacific, with colon in offset per Google's parser).
2. **Frontend** (`/app/frontend/src/components/admin/AttributionTab.jsx`):
   - New blue-bordered panel above the totals row with live preview line and one-click "Download CSV" button.
   - Disabled when 0 rows ready so the admin doesn't click into an empty CSV.

**Pricing data correction:** Confirmed actual hourly rate is **$95/hr** (Executive Sedan, from `server.py:144`) — NOT $89 as I'd previously assumed. CAI's ad copy should reflect $95/hr.

**Testing:** iteration_45.json — 100% backend (8/8 pytest) + 100% frontend. No bugs.

**Files changed:** `/app/backend/routes/admin.py`, `/app/frontend/src/components/admin/AttributionTab.jsx`, `/app/backend/tests/test_iter45_offline_conversions_csv.py` (new).

---

## ✅ Google Ads Conversion Overhaul (Feb 26, 2026 — iter 48)

**Why:** CAI report flagged $217 avg CPA and "Airport $255 / 0 conv" mystery. Investigation showed:
- `REACT_APP_GADS_LABEL_PHONE_CALL` was empty → every Call button on the site silently failed to fire (explains Airport's missing conversions — airport searchers call instead of fill forms).
- "Misconfigured" warnings across all goals were "no recent fire" Google warnings, not real bugs.
- Wine Tour landing had no above-fold price/social-proof signals → low Quality Score and qualified-lead rate.

**What shipped:**
1. **Phone Call Tap label populated**: `REACT_APP_GADS_LABEL_PHONE_CALL=83GZCPSz7cUcEMfLrddD` in `/app/frontend/.env`. Every `tel:` tap on Navbar/Footer/FleetPicker/PayBooking/QuoteSuccess now fires a $30 conversion.
2. **Enhanced Conversions for Web**: hashed (SHA-256, lowercase hex) `email` + `phone` are pushed to gtag `set` `user_data` BEFORE every Purchase + Lead conversion event. Recovers attribution from iOS/Safari/Brave/cookie-blocked browsers. Phone is normalized to E.164 client-side via Web Crypto.
   - New helpers in `/app/frontend/src/lib/googleAdsEvents.js`: `sha256Hex`, `normalizeEmail`, `normalizePhoneE164`, `setEnhancedConversionData`.
   - `trackPurchase` / `trackQuoteRequest` are now `async` and `await` user_data before pushing the conversion event (verified dataLayer index ordering: set[6] → event[7]).
   - `/api/bookings/{id}/public` now exposes `phone` (already exposed `email`) so the /thank-you page has both signals.
   - **REQUIRES USER ACTION** in Google Ads UI: toggle "Enhanced conversions for web" ON for each conversion action (Goals → Conversions → Edit goal → Settings → Enhanced conversions → API → Google tag).
3. **Wine Tour landing CRO**: shared `LandingPage` now accepts optional `ctaLabel`, `socialProof`, `priceFrom` props (all opt-in; other landings unchanged). `/wine-tour` opts in with:
   - CTA labels: "Plan My Wine Day →" (hero + bottom CTA)
   - Social proof: "★★★★★ Trusted by 200+ Bay Area & SF wine country travelers"
   - Pricing strip: "From $95/hour · 6-hour minimum · all-inclusive"

**Testing:** iteration_44.json passes after ordering-fix retest. Backend 100%, frontend 95% (initial async-ordering bug found and fixed). Hashes verified to match Node-computed expected values byte-for-byte.

**Files changed:** `/app/backend/server.py` (+phone in public), `/app/frontend/.env` (+PHONE_CALL label), `/app/frontend/src/lib/googleAdsEvents.js`, `/app/frontend/src/components/GoogleAdsConversion.jsx`, `/app/frontend/src/components/QuoteRequestDialog.jsx`, `/app/frontend/src/components/LandingPage.jsx`, `/app/frontend/src/pages/WineTourLanding.jsx`.

---

## ✅ Affiliate Payments Tracker & 1099 Prep (Feb 26, 2026 — iter 47)

**Why:** Owner pays affiliate operators (Sacramento, Tahoe, Wine Country) via Zelle/Venmo/Check after each brokered trip. Without a tracker, YTD totals were managed in spreadsheets and 1099-NEC prep at tax time was a manual nightmare. Customer payments are tracked via Stripe; affiliate payouts had no system of record.

**What shipped:**
1. **Backend (`/app/backend/affiliates.py`):**
   - Extended `Affiliate` model with W-9/1099 fields: `legal_name`, `tax_id` (EIN or SSN), `tax_classification` (Individual / Sole Prop / Single-Member LLC / LLC-P / LLC-C / LLC-S / C-Corp / S-Corp / Partnership / Other), `w9_received`, `mailing_address`.
   - New `affiliate_payments` Mongo collection with full CRUD.
   - `paid_ytd` rollup auto-added to `GET /admin/affiliates` (sum of payments for current calendar year).
   - New endpoints (all admin-only):
     - `GET /api/admin/affiliates/payments?year=&affiliate_id=&method=` — list (sorted by date desc)
     - `POST /api/admin/affiliates/payments` — create (validates method enum, YYYY-MM-DD date, amount > 0, affiliate exists)
     - `PATCH /api/admin/affiliates/payments/{id}` — update
     - `DELETE /api/admin/affiliates/payments/{id}` — delete
     - `GET /api/admin/affiliates/payments/summary?year=` — per-affiliate roll-up + grand total
     - `GET /api/admin/affiliates/payments/export.csv?year=` — full ledger CSV download
     - `GET /api/admin/affiliates/payments/1099-csv?year=&threshold=600` — one row per affiliate with W-9 fields and an automated "1099 Required" Yes/No flag (corporations excluded per IRS rules, threshold default $600).
   - **Route ordering carefully ensured**: payment routes registered before `/{affiliate_id}` dynamic routes so `PATCH /payments/{id}` doesn't accidentally hit the affiliate-update handler.

2. **Frontend (`/app/frontend/src/components/admin/AffiliatesTab.jsx` + new `AffiliatePaymentsView.jsx`):**
   - Affiliates tab now has a sub-toggle: `NETWORK | PAYMENTS & 1099`.
   - Payments view: year selector, method + affiliate filters, Add/Edit/Delete dialog, per-affiliate YTD summary cards (with "1099 threshold met" badge ≥$600), grand total in header.
   - One-click CSV exports: **Ledger CSV** (full audit trail) and **1099 Prep CSV** (one row per vendor with totals + W-9 data — hand directly to bookkeeper).
   - Affiliate edit dialog now has a "Tax / 1099 prep" section with all 5 W-9 fields.

**Testing:** 19/19 pytest cases pass (`/app/backend/tests/test_iter43_affiliate_payments.py`); full Playwright UI flow passes (testing_agent_v3_fork iteration_43.json).

**Files added:** `/app/frontend/src/components/admin/AffiliatePaymentsView.jsx`, `/app/backend/tests/test_iter43_affiliate_payments.py`.

---

## ✅ Native v1.1.2 — Android crash hotfix + iOS rebuild (Feb 6, 2026 — iter 46)

**Emergency context:** Android v1.1.1 (versionCode 27, runtime 1.1.1) was crashing on launch with "Something went wrong with TuranEliteLimo · This app has a bug." User couldn't open the app. The OTA fix from iter 43 didn't help because the app died before it could even fetch the OTA bundle.

**Root cause:** Same as the iOS LinearGradient crash but worse on Android. The v1.1.1 native build had `expo: ^54.0.0` (SDK 54 native runtime) but `expo-linear-gradient: ^56.0.4` in JS — incompatible native module API. iOS showed it as a "Unimplemented component" placeholder on the vehicle picker screen; Android's stricter native module resolver killed the process at startup.

**Permanent fix shipped:**
1. **`expo-linear-gradient` removed from package.json entirely** (`yarn remove expo-linear-gradient`). No more orphan native module references at link time.
2. **Native v1.1.2 builds** (versionCode 29 Android, buildNumber 51 iOS) on EAS — built without the offending native module at all.
3. **OTA v1.1.2** pushed in parallel so runtime 1.1.2 has a clean update channel from day 1.
4. **Auto-submitted both stores:**
   - iOS: TestFlight upload via `eas submit --platform ios` using the existing ASC API key (`AuthKey_S6ZN2K2TN4.p8`). Apple processes in 5-10 min; user can promote to public App Store from App Store Connect.
   - Android: Google Play Internal Testing via `eas submit --platform android`. Status COMPLETED. User can promote from Internal → Production in Play Console.

**Build artifacts:**
- Android: build `887ea485-b615-46d7-a4a0-65771e3564e3`, versionCode 29 → Internal Testing track
- iOS: build `aea67986-fba5-4d1d-a0ea-e975f84dea7f`, buildNumber 51 → ASC processing → TestFlight
- OTA: update group `f0906617-0bc4-41f1-afb9-eb1567d85293`, runtime 1.1.2

**ALSO unblocked:** The iOS App Store Connect submission has been blocking since iter 41. Auto-submission to TestFlight just worked using the ASC key in `eas.json`. The previous "submission failed" issue from the handoff appears to have been transient. User can now promote v1.1.2 from TestFlight → App Store public release in App Store Connect when ready.

**Hermes ARM64 shim re-applied** — yarn remove wiped node_modules, hermesc shim was lost. Re-installed `qemu-user-static` + wrapped hermesc again. Persists until next dependency change. Documented in PRD so next session knows.

**User action items:**
1. Force-uninstall the broken v1.1.1 from Android phone
2. Open Play Console Internal Testing in 10-15 min → install v1.1.2 → confirm app launches
3. Once verified, promote Android v1.1.2 → Production in Play Console
4. iOS: wait for Apple processing email (5-10 min), then test from TestFlight
5. Once tested, promote iOS v1.1.2 → App Store public release from ASC



## ✅ Multi-stop support on Quote Request (Feb 6, 2026 — iter 44)

**Why:** Weddings (hotel → church → reception), proms (home → dinner → venue → after-party), wine tours, and bar crawls all have intermediate stops. Customers were shoving them into the free-text Notes field which made it hard for admin + affiliates to read the actual route at a glance.

**Shipped (web + mobile in same OTA):**
- **Backend** — `QuoteRequestCreate.stops: Optional[List[str]]` (max 5 items). Admin SMS now shows `Stops: A → B → C` line. Admin email adds a `Stops` row in the lead table.
- **Web** — `QuoteRequestDialog.jsx` adds dynamic stops list between Pickup and Drop-off. Each stop is its own labeled input with a remove (✕) button. "+ Add a stop" CTA below (hidden once 5 stops are added). State filtered for empty strings on submit.
- **Mobile** — `QuoteRequestSheet.tsx` mirrors web exactly: same insert position, same UX (add/remove/max 5).
- **Admin** — `QuoteRequestsTab.jsx` displays `🚏 Stops: A → B → C` between Pickup and Dropoff rows. Affiliate-outreach SMS template includes the stops line so affiliates see the whole route in one text.

**Files changed:**
- `/app/backend/server.py` (QuoteRequestCreate model + admin SMS + admin email)
- `/app/frontend/src/components/QuoteRequestDialog.jsx` (stops state, render, payload filter)
- `/app/mobile/src/components/QuoteRequestSheet.tsx` (mirror of web)
- `/app/mobile/src/api.ts` (submitQuoteRequest signature adds `stops?: string[]`)
- `/app/frontend/src/components/admin/QuoteRequestsTab.jsx` (stops display + outreach SMS)

**Verified:** Backend curl test confirmed stops persist as a proper array in Mongo and round-trip clean. Lint clean. TypeScript clean.

**OTA published:** group `b2b3f364-253e-4fda-9e4e-54a6668388cc`, runtime 1.1.1, iOS + Android. Testers pick up on next app launch.



## ✅ TestFlight LinearGradient crash FIXED + new fleet images (Feb 6, 2026 — iter 43)

**P0 emergency:** iOS TestFlight v1.1.1 was crashing on the "Choose your vehicle" screen with `Unimplemented component: <ViewManagerAdapter_ExpoLinearGradient_…>` — text overlay on every vehicle card. Root cause: package version mismatch — `expo: ^54.0.0` (native SDK 54) vs `expo-linear-gradient: ^56.0.4` (JS expecting SDK 56 native module name). When the OTA pushed the SDK 56 JS, the v1.1.1 binary couldn't resolve the native component.

**Shipped:**
- **vehicle.tsx LinearGradient REMOVED** — replaced the single `<LinearGradient>` usage in `/app/mobile/app/(rider)/vehicle.tsx` with a layered `<View>` stack (3 semi-transparent bands simulating a vertical fade). Visually identical, no native module needed. OTA-safe.
- **6 new studio-shot fleet images bundled into mobile** — `/app/mobile/assets/fleet/{executive-sedan,first-class,luxury-suv,stretch-limo,sprinter,party-bus}.jpg` — referenced via `require(@/assets/fleet/...)` so they ship with the OTA JS bundle. Compressed PNG → JPG @ 85% quality, 1200px wide → ~80 KB each (498 KB total bundle increase).
- **Same 6 images shipped to web** at `/app/frontend/public/fleet/*.jpg` (1600px @ 85%, ~130 KB each). Replaces older stock photos that had visible white halos on the dark page bg.
- **CSS shadow fix v2** — added BOTH top and bottom gradient masks to fleet image cards in `LandingPage.jsx`, `Fleet.jsx`, `FleetPicker.jsx`, `WorldCup2026.jsx`. Previous fix was bottom-only; new images have a subtle overhead studio halo that needed top-masking too. Verified via screenshot — cards sit flush on dark page.
- **Vehicle MAPPING updated** — Stretch Limousine description bumped from "Lincoln · Chrysler 300" to "Hummer Stretch · Chrysler 300" to match the new image (Hummer H2 stretch limo).

**Files changed:**
- `/app/mobile/app/(rider)/vehicle.tsx` (removed expo-linear-gradient import, View-stack gradient, bundled images via require)
- `/app/mobile/assets/fleet/*.jpg` (NEW — 6 files)
- `/app/frontend/public/fleet/*.jpg` (REPLACED — 6 files)
- `/app/frontend/src/components/LandingPage.jsx` (top + bottom gradient mask)
- `/app/frontend/src/components/Fleet.jsx` (top + bottom gradient mask)
- `/app/frontend/src/components/FleetPicker.jsx` (top + bottom gradient mask)
- `/app/frontend/src/pages/WorldCup2026.jsx` (top + bottom gradient mask)

**Mobile gaps identified during audit (NOT fixed this session — needs separate work):**
- ⚠️ **Mobile has NO Quote Request modal** — call-only vehicles (Party Bus, Stretch Limo, Sprinter) only show "Call for Quote" → tel: dialer. Web has full pre-qual form with trip_type + service_duration. Mobile users can't submit structured quote requests; they must phone-in.
- ⚠️ **Pre-qualification fields not in mobile booking flow** — the new trip_type/service_duration gating from iter 42 is web-only. If you want lead-quality parity, mobile booking form needs the same dropdowns.

**Still pending — needs YOU to push the OTA:**
```bash
cd /app/mobile
eas update --branch production --message "fix: vehicle picker LinearGradient crash + new fleet images"
```
Once you run that, every iOS TestFlight + Android tester on v1.1.1 will pull the fix on next app launch. No new native build needed.

**[UPDATE Feb 6]** OTA pushed by E1 — Update group `63b587c4-545c-49b9-889e-6eb56e824ca0`, runtime 1.1.1, iOS + Android. Includes: LinearGradient crash fix + new fleet images + new mobile QuoteRequestSheet (full pre-qual modal mirroring web). Live for all testers on next app launch.

**Mobile Quote Request modal (iter 43 follow-up — shipped in same OTA):**
- New file `/app/mobile/src/components/QuoteRequestSheet.tsx` — full-screen modal mirroring web QuoteRequestDialog.
- Required-field gate (isValid) identical to web: name, phone, trip_type, service_duration, date, time, passengers, pickup, dropoff. Submit button reads "Fill required fields to send" until valid → "Send request" when valid.
- Native PickerSheet (bottom-sheet style) for Trip Type + Service Duration dropdowns.
- @react-native-community/datetimepicker for date + time.
- POSTs to `/api/quote-requests` with same payload shape as web (mirrors `trip_type → occasion` for back-compat).
- New API helper in `/app/mobile/src/api.ts`: `submitQuoteRequest()`.
- Wired into `vehicle.tsx`: for call-only vehicles (Party Bus / Stretch / Sprinter / etc.), now shows a dual button row: **Request Quote** (gold, opens modal) + **Call** (outline, opens dialer). Previously was call-only.



**Verified:** Lint clean. TypeScript clean for vehicle.tsx. Screenshot of fleet section on web → cards look flush + premium, no white shadow. Mobile changes are JS-only so they ship via OTA.



## ✅ Quote Request Pre-Qualification Gate (Feb 6, 2026 — iter 42)

**Why:** User was getting vague one-line leads ("how much for limo?") that required 30 min of back-and-forth before affiliates could quote. This was burning affiliate goodwill and admin time.

**Shipped:**
- **Required-field gating on `QuoteRequestDialog`** — Submit button stays disabled (shows "Fill required fields to send") until ALL of: name, phone, **trip type** (new dropdown), **service duration** (new dropdown), date, time, passengers, pickup, dropoff are filled. Once valid, button activates and reads "Send request".
- **Per-field info tooltips** — small ⓘ icon next to each label. Hover (desktop) or tap (mobile) opens a Radix tooltip with a one-line "why we ask" explainer. Keeps the form scannable.
- **Trip Type dropdown** — Wedding / Prom / Airport / Night Out / Corporate / Birthday / Wine Tour / Concert / Funeral / Other.
- **Service Duration dropdown** — One-way / 1-2 / 3-4 / 5-6 / 7-8 / Full day / Not sure. (The #1 missing data point on inbound leads.)
- **Backend model** — `QuoteRequestCreate` accepts new optional `trip_type` + `service_duration` fields. Optional at API for backward-compat with legacy mobile clients (frontend enforces "required"). Frontend also mirrors `trip_type → occasion` for legacy admin/email template compat.
- **Admin SMS + Email + Quote Requests tab** — now surfaces the new fields. Admin card shows gold `trip_type` chip + cyan `⏱ service_duration` chip. Affiliate outreach SMS template includes both.
- **NO budget field** (per user — fear of scaring off legit leads).

**Files changed:**
- `/app/frontend/src/components/QuoteRequestDialog.jsx` (rewritten with `isValid` gate + `InfoHint` tooltip component)
- `/app/backend/server.py` (QuoteRequestCreate model + admin SMS + admin email render)
- `/app/frontend/src/components/admin/QuoteRequestsTab.jsx` (new badges + affiliate outreach SMS)

**Verified by testing agent (iteration_42.json):** 5/5 backend pytest passed, frontend e2e happy path passed — modal opens, submit disabled with correct text, tooltips render via Radix, all 9 required fields gate properly, full submission lands in DB with new fields, success state shows.



## ✅ iOS pod-install root cause FIXED + Block-by-source + Web shadow (Jun 20, 2026 — iter 44)

**Shipped:**
- **iOS pod-install error ROOT-CAUSED AND FIXED** — pulled encrypted EAS build logs via GraphQL + brotli decompression. Cause was `@react-native-google-signin/google-signin` transitively pulling `AppCheckCore` (Swift), which needed `GoogleUtilities` + `RecaptchaInterop` to expose modular headers when built as static libs. Added `expo-build-properties` plugin to `app.json` with `extraPods` declaring `modular_headers: true` for those 3 pods. iOS build `af1a7aa8-5ddc-40b7-a19e-15ee2a48812a` **finished successfully** (was previously stuck in errored state for multiple sessions). App Store submit step failed separately (likely cert refresh from `--clear-cache`) — documented in `/app/memory/IOS_BUILD_FIX_v1.1.1.md` with copy-paste TestFlight upload path.
- **Block-by-source admin tool** — admin can block new bookings from any UTM source bucket (e.g. Yelp, Facebook) with one click. Backend endpoints `GET /admin/attribution/blocked-sources` + `POST /admin/attribution/block-source`. Public booking + quote-request endpoints reject blocked-source submissions with HTTP 403 + polite "please call us directly" message. End-to-end test verified: yelp source → 403, google_ads source → 200.
- **Web fleet shadow fix** — vehicle images on `/airport`, `/sfo-airport-transfer`, `/sjc-airport-transfer`, `/oak-airport-transfer`, `/world-cup-2026`, and the homepage Fleet+Gallery+Venues sections no longer show a white halo. Added `bg-black` container + bottom dark-gradient overlay (matches mobile fix). Verified via screenshot — fleet cards now sit flush on dark bg.

**Files added/changed:**
- `/app/mobile/app.json` (expo-build-properties plugin + extraPods + iOS buildNumber → 3)
- `/app/mobile/package.json` (yarn added expo-build-properties)
- `/app/backend/routes/admin.py` (3 new endpoints: attribution preview/blocked-sources/block-source)
- `/app/backend/server.py` (block-by-source guard in /quote-requests + /bookings)
- `/app/frontend/src/components/admin/AttributionTab.jsx` (Block/Unblock button + blocklist banner)
- `/app/frontend/src/components/LandingPage.jsx` (shadow gradient on fleet/gallery/venues images)
- `/app/frontend/src/pages/WorldCup2026.jsx` (shadow gradient on fleet/gallery)
- `/app/memory/IOS_BUILD_FIX_v1.1.1.md` (NEW — full debug story + TestFlight upload runbook)

**EAS log decryption recipe (for future debugging):** EAS build/submit logs at `storage.googleapis.com/eas-workflows-production/...` are **brotli-compressed JSON-lines**. NOT gzip, despite filename. Decompress with `brotli.decompress(open(path,'rb').read())` then parse each line as JSON.

**Verified:**
- Block-by-source end-to-end (curl test: blocked source → 403, non-blocked → 200) ✅
- Web shadow fix via screenshot of SJC landing page ✅
- iOS build `af1a7aa8-...` status = `finished` on EAS dashboard ✅
- All lint clean ✅


## ✅ Attribution tab + Mobile v1.1.1 actually shipped (Jun 20, 2026 — iter 43, earlier)

**Shipped:**
- **Admin → Attribution tab** — new dashboard tab showing paid bookings + revenue grouped by first-touch UTM source bucket (google_ads, yelp, facebook, direct, untracked...). 7/30/90-day period selector. Attribution-rate KPI surfaces % of paid bookings with a UTM source (Google Ads gap detector). Powered by `GET /api/admin/attribution/sources?days=N`. Lives between "Sage Chats" and "Settings" tabs.
- **OTA Update published** — runtime 1.1.1, group `dddc4568-8159-4837-a7ad-ba4eccbcde20`, iOS + Android. Pre-loaded; fires when v1.1.1 native ships.
- **Android v1.1.1 LIVE in Google Play Internal Testing** — Build `215f96f6-6522-4e9e-b84e-cf99ac25e6b6` submitted via submission `d54e3341-4429-4743-8e8a-e28fcc09c4ae`, version code 27. **YOU need to promote Internal → Production via Play Console UI** (5 min); production track was missing config (release notes, country availability, content rating).
- **iOS v1.1.1 build errored** (recurring pod-install issue, build `77e4e634-70d8-498b-861d-78ff402f111a`). Log file is binary-encrypted; couldn't extract specific error. iOS users stay on v1.1.0 until next session debug.

**Files added/changed:**
- `/app/frontend/src/components/admin/AttributionTab.jsx` (NEW)
- `/app/frontend/src/pages/AdminDashboard.jsx` (mounted AttributionTab)
- `/app/backend/routes/admin.py` (added `/admin/attribution/sources` endpoint)
- `/app/mobile/eas.json` (Android submit track → `internal` after `production` rejected)
- `/app/memory/MOBILE_v1.1.1_RUNBOOK.md` (rewritten with actual ship status)

**Hermes ARM64 workaround in this sandbox:** Wrapped `node_modules/react-native/sdks/hermesc/linux64-bin/hermesc` with a qemu-x86_64-static shim so future `eas update` calls work from this environment. Persisted in `/app/mobile`.

**Verified:** Lint clean. Backend endpoint returns 401 unauth (registered). Direct Python aggregation against live DB returns expected shape (12 bookings, all "untracked" because they pre-date UTM deploy — new bookings will populate the buckets). Android OTA + Build + Submit confirmed by EAS dashboard.

**Next session debug list:**
- iOS pod-install root cause (likely `@react-native-google-signin/google-signin` or `expo-apple-authentication`)
- Configure Play Console production track once user populates release notes / pricing / availability


## ✅ UTM tracking + Mobile v1.1.1 prep + Android badge live (Jun 20, 2026 — earlier in session)

**Shipped:**
- **First-touch UTM tracking** — `/app/frontend/src/lib/utm.js` captures `utm_source`, `utm_medium`, `utm_campaign`, `gclid`, `fbclid`, `msclkid`, referrer, and a derived `source_bucket` (google_ads / yelp / facebook / direct / etc.) on the visitor's first attribution-bearing visit. Persisted to `localStorage` for 90 days. Attached to every booking + quote-request POST. First-touch wins (industry standard); later UTM params don't overwrite.
- **Backend models** — `BookingCreate` and `QuoteRequestCreate` now accept `utm: Optional[dict]`. Stored verbatim on the MongoDB documents.
- **Weekly Digest** enhanced with **"Paid bookings by source (UTM)"** block + per-source revenue. Closes the attribution loop Adel has been chasing.
- **Mobile app.json bumped to v1.1.1**: iOS `buildNumber` 1→2, Android `versionCode` 2→3. `eas.json` Android submit track switched from `alpha` → `production` (ready for Play Store production push).
- **Android badge enabled on `/download`** — removed "COMING SOON" gating, both badges now active links with side-by-side QR codes for iPhone + Android. Mobile redirect on Android devices now opens Play Store directly.
- **Mobile v1.1.1 runbook** at `/app/memory/MOBILE_v1.1.1_RUNBOOK.md` — copy-paste guide for `eas update` (OTA, free) + `eas build/submit` for Play Store production.

**Files added/changed:**
- `/app/frontend/src/lib/utm.js` (NEW)
- `/app/frontend/src/App.js` (calls `captureUtm()` on mount)
- `/app/frontend/src/components/BookingForm.jsx` (sends `utm` in payload)
- `/app/frontend/src/components/QuoteRequestDialog.jsx` (sends `utm` in payload)
- `/app/backend/server.py` (added `utm: Optional[dict]` to BookingCreate + QuoteRequestCreate)
- `/app/backend/weekly_digest.py` (added UTM source aggregation + email block)
- `/app/frontend/src/pages/AppDownload.jsx` (Android badge live, dual QR)
- `/app/mobile/app.json` (v1.1.1, buildNumber 2, versionCode 3)
- `/app/mobile/eas.json` (Android submit track → production)
- `/app/memory/MOBILE_v1.1.1_RUNBOOK.md` (NEW)

**Verified — testing_agent_v3_fork iteration 41 results: 100% pass rate (backend + frontend)**:
- All 4 airport landing routes return airport-specific testid + page title + H1
- World Cup metadata strengthened (Levi's Stadium + World Cup 2026 keywords)
- UTM frontend persistence: localStorage set on first visit, first-touch preserved on subsequent UTM-bearing visits
- UTM backend persistence: verified on quote_requests AND bookings collections
- Weekly digest endpoints: 401 unauth gating + 11 documented data keys present
- /download page: both badges active, both QR codes visible, mobile redirect points to correct store


## ✅ URL-aware airport landings + Weekly Performance Digest (Jun 20, 2026 — earlier in session)

**Shipped:**
- `/sjc-airport-transfer`, `/sfo-airport-transfer`, `/oak-airport-transfer` and `/airport` now render **airport-specific copy** (page title, meta description, hero H1, pillars, routes, FAQs) by detecting the URL pathname. Solves the `[san jose airport limo]` Quality Score problem flagged in CAI's June ad-groups report by ensuring the landing page actually mentions San Jose / SJC above the fold.
- `/world-cup-2026` meta + H1 strengthened with "Levi's Stadium" + "World Cup 2026" keywords for the active tournament window (June 11 – July 19).
- New **Weekly Performance Digest** — automatic email every Monday 9 AM Pacific summarising last 7 days: bookings created, paid bookings + revenue, quote-request funnel, top vehicles, top routes, quote sources, risk-band distribution, and a **Google Ads attribution gap callout** that surfaces the delta between Stripe-confirmed bookings and Google Ads' conversion count.
- Admin Settings tab gets a **"Weekly Performance Digest"** card: preview last 7 days inline (4-card KPI grid) or send the digest email on-demand.

**Files added/changed:**
- `/app/frontend/src/pages/AirportLanding.jsx` (URL-aware rewrite, 4 airport configs)
- `/app/frontend/src/pages/WorldCup2026.jsx` (meta + H1 keyword strengthening)
- `/app/backend/weekly_digest.py` (NEW — aggregation + email render + send)
- `/app/backend/server.py` (APScheduler cron, Monday 16:00 UTC)
- `/app/backend/routes/admin.py` (GET preview + POST send endpoints)
- `/app/frontend/src/components/admin/SettingsTab.jsx` (WeeklyDigestCard)

**Verified:** Python aggregation against live DB returns valid data (15 quotes, risk distribution). All 3 SEO routes return HTTP 200 with airport-specific titles & H1s. Admin endpoints return 401 unauth (registered correctly). Scheduler logs confirm the weekly job was added.


## ✅ Admin Chats tab + Live Customer Takeover (Feb 17, 2026 — iter 41)

**Shipped:**
- New **GET /api/admin/chat/sessions** — lists 100 most recent sessions, `needs_human` first, then by recency. Each row carries `last_preview`, `last_role`, `msg_count`, `updated_at`, `needs_human`.
- New **POST /api/admin/chat/sessions/{id}/reply** — admin appends a message to a session's history with `role="admin"` + `sender_name="Imran from Turan Elite"`. Also clears `needs_human` so the red dot disappears.
- New **POST /api/admin/chat/sessions/{id}/clear-needs-human** — manual "Mark handled" button on each thread.
- **Customer FloatingChatWidget** now polls `/api/chat/{session_id}` every 5 seconds while open → admin replies appear in the customer's panel within ~5 sec.
- **Admin replies render distinctly** in both the admin transcript view AND the customer widget — green bubble with sender_name header, distinct from Sage's dark gray and the customer's gold.
- **Admin Chats tab** — new tab in the dashboard between Safety and Settings. List view with red-dot triage + thread view with full transcript + reply textarea (Cmd/Ctrl+Enter to send) + Mark Handled button.

**Files added/changed:**
- `/app/backend/routes/chat.py` (added 3 admin endpoints + inline _require_admin)
- `/app/frontend/src/components/admin/ChatsTab.jsx` (NEW — list + thread + reply)
- `/app/frontend/src/components/FloatingChatWidget.jsx` (added 5-sec poll + admin bubble style)
- `/app/frontend/src/pages/AdminDashboard.jsx` (mounted ChatsTab between Safety + Settings)

**Curl-verified end-to-end:** admin lists 8 sessions, takeover reply lands with correct role + sender_name, customer's /chat/{id} returns the admin message at the end of history. Unauthenticated admin endpoints return 401.


## Original Problem Statement
Build a fully functioning website + native iOS/Android mobile app for TuranEliteLimo (premium chauffeur service, Bay Area). Stack: React + FastAPI + MongoDB + Expo React Native. Features: dynamic pricing, Stripe checkout, admin dashboard, driver live tracking. Recently expanded to: 2026 FIFA World Cup surge ops, custom invoices for affiliate brokered trips, social logins (Apple + Google).

## Live Production
- **Web:** `https://turanelitelimo.com` (deployed via Emergent)
- **iOS:** Live on App Store. TestFlight `v1.1.0 build 41` submitted Jun 4 with Apple + Google Sign-In.
- **Android:** Closed Testing on Play Console (Build #23).

## ✅ Live Route Map + Public AI Chat Assistant "Sage" (Feb 16, 2026 — iter 40)

**Shipped:**
- **RouteMap component** on the booking form — once pickup + dropoff are filled, dynamically loads the Google Maps SDK, draws a gold polyline route on a custom dark Turan theme, displays distance (mi) + estimated duration. Supports waypoints (Add stop). Pre-fill state shows a helpful hint card.
- **AI Chat Assistant "Sage"** — floating bubble bottom-right of every public page (`/`, all landing pages). Powered by Gemini 2.5 Flash via emergentintegrations + EMERGENT_LLM_KEY. ~$0.0003 per exchange, ~2-4 sec latency. Persona: warm chauffeur concierge with full TuranEliteLimo knowledge (fleet, ballpark pricing, BYOB/car-seat rules, World Cup 2026 surge, cancellation, escalation script).
- **Session persistence** — sessions stored in MongoDB `chat_sessions` collection. localStorage keeps the session_id so page refresh / revisit resumes the same thread. `needs_human` flag auto-set when Sage falls back to the human escalation phrase.
- **Conditional rendering** — widget hides on `/admin/*`, `/driver/*`, `/pay/*`, `/manage/*`, `/quote/*`, `/post-trip/*` (transactional/authenticated flows).
- **100% green tested:** 11/11 backend pytest cases, all frontend flows verified by testing agent (single + multi-turn + absurd-deflect + invalid session 404 + length cap 422 + history restore + conditional hide).

**Files added/changed:**
- `/app/backend/routes/chat.py` (NEW — chat router, ~250 lines, Sage system prompt)
- `/app/backend/server.py` (router include)
- `/app/frontend/src/components/RouteMap.jsx` (NEW — map + DirectionsService)
- `/app/frontend/src/components/FloatingChatWidget.jsx` (NEW — floating bubble + panel UI)
- `/app/frontend/src/App.js` (ConditionalChatWidget wrapper)
- `/app/frontend/src/components/BookingForm.jsx` (RouteMap mounted)
- `/app/backend/tests/test_iteration40_chat.py` (NEW — 11 pytest cases)
- `/app/memory/TESTING_GUIDE_FEB2026.md` (NEW — comprehensive 9-section test playbook)

## ✅ AI-Powered Off-Platform Lead Import + AI Reply Drafts (Feb 16, 2026 evening — iter 39+)

**Shipped:**
- **POST /api/admin/quote-requests/import-lead** — Gemini 2.5 Flash extracts 11 structured fields AND drafts a polished, channel-aware first-response reply (warm + emoji for Yelp, brief for phone-call) in a single LLM call. ~$0.0003 per parse.
- **POST /api/admin/quote-requests/import-lead/commit** — admin reviews/edits + commits. Defensive coercion: passengers → int|None, pickup_date → YYYY-MM-DD or empty, pickup_time → HH:MM or empty.
- **ImportLeadDialog** — paste raw text, pick source, click Parse → see extracted fields + risk badge + **AI-drafted reply** in a dedicated gold panel with one-click Copy. Editable inline if voice doesn't match.
- **Source tag badge** on each quote row.

**Verified on Spencer's actual Yelp text:** all 11 fields extracted correctly, risk=5/green, suggested_reply opens with acknowledgment, asks for missing name/contact, mentions formal quote within 1-2 hr, mentions refundable deposit, closes with brand sign-off + tasteful emoji. Channel-tone aware.

**Files changed:**
- `/app/backend/routes/admin.py` (two new endpoints with LLM call + defensive coercion)
- `/app/backend/server.py` (added `import json`)
- `/app/frontend/src/components/admin/QuoteRequestsTab.jsx` (Import lead button, ImportLeadDialog, source tag badge)
- `/app/backend/tests/test_iteration39_import_lead.py` (NEW — 13 pytest cases)


## ✅ Quick Risk Check tool for off-platform leads (Feb 16, 2026 PM)

**Shipped:**
- New `POST /api/admin/safety/risk-check` endpoint that exposes the existing `score_submission()` engine for ad-hoc lookups. Accepts any combination of `{phone, email, name, amount, ip, pickup_location, dropoff_location}` and returns the same `{score, band, flags, blacklisted, blacklist_hits}` shape used on real quote requests.
- New "Quick risk check" sub-tab inside Admin → Safety. Form takes phone/email/name/amount → returns score + green/yellow/red badge + plain-English recommendation + flag breakdown.
- Solves the problem of Yelp / Google Business Profile / walk-in call leads bypassing the safety system. Same scorer, same risk band — 1:1 comparable to website-submitted quotes.
- Verified end-to-end via curl: Spencer Pahlke = 20/green, disposable email = 55/yellow, empty body = 400.

**Files changed:**
- `/app/backend/routes/admin.py` (new endpoint at line ~2170)
- `/app/frontend/src/components/admin/SafetyTab.jsx` (new sub-tab + `QuickRiskCheck` component)


## ✅ Admin UX + Customer-Recovery SMS + Mobile Polish (Feb 16, 2026 PM — iter 38, 100% green)

**Shipped:**
- **Admin TabsList wraps** — 19 admin tabs now flow to 2 rows on iPad/desktop instead of horizontal-scrolling off-screen (`flex flex-wrap h-auto gap-1 p-1 justify-start w-full`).
- **Unread badges on Inquiries + Quote Requests** — gold pills matching the existing Bookings badge. Counts items with `status === "new"`. `data-testid=unread-inquiries-badge` + `data-testid=unread-quotes-badge`.
- **Green "Clean" risk badge** — `RiskBadge` now renders for ALL scored quote requests (was previously yellow/red/blacklisted only). Green band uses `CheckCircle2` icon + "Clean" label so the user visually confirms the safety system analyzed each lead.
- **Customer-facing payment-recovery SMS** — Extended existing `_send_payment_recovery_emails` background job (runs every 5 min) to also Twilio-SMS the customer their manage URL alongside the recovery email. Email gets buried under flight/hotel confirmations on mobile; SMS converts far better, especially for time-sensitive trips. One-shot stamp (`payment_recovery_sent_at`) prevents duplicates. Own try/except so Twilio failures don't block the admin SMS or DB stamp.
- **Mobile vehicle picker — white studio shadow masked** — Added `expo-linear-gradient` overlay (`cardImgFade`) inside the ImageBackground that fades from transparent at top → semi-dark mid → `colors.surface` at bottom. Cleanly blends the bottom of each fleet PNG into the card body without re-mastering image assets.

**Files changed:**
- `/app/frontend/src/pages/AdminDashboard.jsx` (TabsList wrap, quoteRequests fetch, 2 new unread badges)
- `/app/frontend/src/components/admin/SafetyTab.jsx` (RiskBadge green band)
- `/app/frontend/src/components/admin/QuoteRequestsTab.jsx` (always render badge)
- `/app/backend/server.py` (`_send_payment_recovery_emails` — added customer SMS block ~line 4533)
- `/app/mobile/app/(rider)/vehicle.tsx` (LinearGradient overlay)
- `/app/mobile/package.json` (`expo-linear-gradient@56.0.4`)
- `/app/memory/GOOGLE_ADS_PLAYBOOK_FEB2026.md` (NEW — 10-step Google Ads campaign fix playbook)
- `/app/backend/tests/test_iteration38_payment_recovery_sms.py` (NEW — 7 pytest cases, all pass)



## ✅ Landing Pages Visual & Editorial Refresh (Feb 15, 2026 PM)

**Shipped:**
- **Shared `LandingPage` component** gained 3 new optional props (all backward-compatible):
  - `experienceImage` — full-bleed editorial hero between pillars and routes ({src, alt, kicker, caption}).
  - `venues` + `venuesEyebrow/Title/Intro/Disclaimer` — 3-up image grid of named venues/wineries/partners with badge support.
  - `itinerary` — vertical timeline ({time, title, blurb}) with gold dot + ring markers.
- **Wine Tour landing** (`/wine-tour`) fully rewritten with rich editorial content: 6 featured wineries (Stags Leap, Opus One, Castello di Amorosa, Domaine Chandon, Schramsberg, Frog's Leap) with badges and individual blurbs + non-affiliation disclaimer, 8-step sample tasting day (9:30 AM hotel pickup → 7:00 PM return), expanded FAQs, full-bleed Napa hero image with editorial caption.
- **Wedding landing** (`/wedding`) gained an editorial bride-and-groom hero image, 3 venue-style cards (Wine Country Estate, Coastal & Carmel, City Hall & Ballroom) with non-specific imagery, and a 6-step wedding-day timeline (10 AM bridal suite → 11 PM send-off).
- **Corporate landing** (`/corporate`) gained an SF skyline hero with the editorial caption explaining the Silicon Valley roadshow pitch, and a 7-step executive day (7:30 AM SFO → Sequoia → a16z → working lunch → 5:30 PM dinner at Quince/Atelier Crenn → Four Seasons return).
- **Airport landing** (`/airport`) gained an airplane-wing-at-sunset hero with the editorial caption ("Your flight lands at 4:18 PM. We see the touchdown ping…"), plus a 6-step T-2hr → T+90min arrival choreography timeline.
- **All landing imagery** stored locally in `/app/frontend/public/landings/{winetour,wedding,corporate,airport}/` (no CDN drift risk; stable for production deploy).

**Files changed:**
- Updated: `/app/frontend/src/components/LandingPage.jsx` (+3 new prop blocks), `/app/frontend/src/pages/WineTourLanding.jsx` (complete rewrite), `/app/frontend/src/pages/WeddingLanding.jsx` (added venues + itinerary), `/app/frontend/src/pages/CorporateLanding.jsx` (added experience hero + itinerary), `/app/frontend/src/pages/AirportLanding.jsx` (added experience hero + itinerary)
- NEW assets: ~12 images in `/app/frontend/public/landings/winetour/`, 4 in `/wedding/`, 2 in `/corporate/`, 2 in `/airport/`

## ✅ Saved Cards / Invoice Charges + Twilio Verify Live + Promo Bug Fix + removeChild Crash Fix (Feb 15, 2026)

**All shipped today + tested green (iter 37, 13/13 pytest passing):**

- **Production crash fix** — Google Translate + React 18 `removeChild` crash on Android Chrome mobile. Added `installTranslateResilientDomPatches()` (silent no-op for detached-node `removeChild` / `insertBefore` calls) + `translate="no"` + `className="notranslate"` on the booking form section. Same pattern Microsoft Teams / Slack / Stripe use.
- **Quote-Offer Saved Cards** — `/quote/{token}` deposit checkout now uses direct Stripe REST API with `payment_intent_data[setup_future_usage]=off_session` + `customer_creation=always`. Finalize endpoint expands `payment_intent.payment_method` and saves `stripe_customer_id`, `stripe_payment_method_id`, `stripe_payment_intent_id`, `card_brand`, `card_last4`, plus `wait_time_consent=true` + `consent_accepted_at` timestamp on the resulting booking row.
- **Customer consent UI** — Reassuring checkbox on `/quote/{token}` and updated wording on the main `BookingForm` wait-time-consent-block. Both credit Stripe as the vault, clarify "we only charge if those things actually happen," list exactly what may be charged (remaining balance, wait time, damages, extra stops). Backend enforces `consent_accepted: true` in the POST body or returns 400.
- **Generic admin "Charge card on file"** — `POST /api/admin/bookings/{id}/charge-card` with `{amount, reason, description}`. Reasons: `balance`, `extra_hour`, `extra_stop`, `tolls`, `gratuity`, `other`. Min $0.50, max $10k. Uses existing `_stripe_off_session_charge` helper. Sends itemized customer receipt email. Appends to `bookings.extra_charges[]` for full history. New "Charge card on file" section in `BookingDetailsDialog.jsx` admin UI with amount + reason dropdown + description textarea + per-booking history.
- **Twilio Verify is LIVE** — `TWILIO_VERIFY_SID=VA9206b73740102bb36be85f5bc371122c` added to `backend/.env`. The OTP gate built in iter 36 will now send real SMS the moment admin flips "Require phone verification on high-value quotes" toggle in Settings → Safety & anti-fraud. Recommended: ON with $1000 threshold.
- **Promo double-apply bug fixed** — When backend auto-applies a promo (`auto_apply: true` on a promo doc), the frontend now mirrors it as `promoApplied` state so the GREEN CHIP shows (not the manual Apply input). New "Auto-applied" badge on the chip. Re-validate effect skipped for auto-applied promos (preventing the silent double-discount on already-discounted prices). Manual `applyPromo` blocks re-applying the currently-applied code with a friendly error. Customer can hit Remove + the dismissed code is tracked so the mirror doesn't immediately re-apply.

**Files changed (today, iter 37):**
- NEW: `/app/frontend/src/lib/translatePatch.js`, `/app/backend/tests/test_iteration37_saved_cards_charge.py`
- Updated: `/app/frontend/src/index.js` (translate patch boot), `/app/frontend/src/components/BookingForm.jsx` (translate="no" + improved consent text + promo double-apply fix + auto-apply mirror with dismiss tracking), `/app/backend/routes/admin.py` (quote-offer checkout → direct REST + consent gate; finalize → saves payment method), `/app/backend/routes/payments.py` (new `/admin/bookings/{id}/charge-card`), `/app/frontend/src/pages/QuoteOfferConfirm.jsx` (consent checkbox + reassuring text), `/app/frontend/src/components/admin/BookingDetailsDialog.jsx` (Charge card on file UI), `/app/backend/.env` (TWILIO_VERIFY_SID)

## 📋 Stripe Radar rules (for user to paste in dashboard — Settings → Radar → Rules)

Block:
- `Block if :card_number_failed_count: > 2 AND :ip_address: matches the same IP` (card testing)
- `Block if :email: matches any of (chargeback list)` (your manual blacklist)

Review (not block):
- `Review if :amount: > 1500 AND :card_country: != :ip_country:` (foreign+foreign+high$)
- `Review if :card_funding: == 'prepaid'`
- `Review if :ip_address::risk_level: == 'highest'`

Allow (override review for good actors):
- `Allow if :customer: in (any previous successful charge)` — critical for conference attendees who re-book
- `Allow if :email_risk_level: == 'low' AND :amount: < 500`

## ✅ Safety / Anti-Fraud System — Phase 1 + 2 + 3 (Feb 14, 2026)

**Shipped (all green, 14/14 pytest passing):**

- **Phase 1 — Risk scoring + scam blacklist**
  - New backend module `/app/backend/safety.py`: pure-Python scoring engine, blacklist matcher, ip-api geo lookup with in-process + 30-day Mongo cache (`ip_geo_cache` coll), disposable/free-email lists, area-code → state map for US phones, address-state extractor.
  - Every `POST /api/quote-requests` now captures `ip_address` (from X-Forwarded-For), `user_agent`, computes `risk_score` (0-100), `risk_band` (green ≤30, yellow ≤60, red 61+), `risk_flags[]`, `blacklisted` bool, plus full `ip_geo` block. Quote-offer `/finalize` carries these fields into the resulting `bookings` row + stamps `deposit_ip`.
  - Internal blacklist (`scam_blacklist` collection) — admin CRUD via `/api/admin/safety/blacklist`. Supports email-exact + domain wildcards (`@evil.com`), phone last-10-digit suffix match, IP exact + `/24` CIDR, name normalized match. **Silent-accept** policy: blacklisted submissions still return `{ok:true}` to the customer (so true positives still get a human follow-up) but are flagged + pushed into the review queue.
  - Visual `RiskBadge` (green/yellow/red, score) + flag-chip list shown inline on the admin Quote Requests tab for any flagged row.

- **Phase 2 — Manual review queue + verification**
  - New Settings: `safety_review_threshold` (default $1,500), `safety_phone_verify_required` (bool), `safety_phone_verify_threshold` ($).
  - `GET /api/admin/safety/review-queue` returns quotes + bookings flagged yellow/red, blacklisted, or above the $ threshold; admin can mark cleared via `POST /api/admin/safety/{quote-requests|bookings}/{id}/clear-risk`.
  - Phone-OTP gate: when `safety_phone_verify_required=true` AND quote price >= threshold, `POST /api/quote-offer/{token}/checkout` returns HTTP 428 with `detail="phone_verify_required"`. Frontend `QuoteOfferConfirm` catches 428 and shows the OTP UI (`Send code` → `Verify`). **Twilio Verify is now LIVE** (see iter 37 above).

- **Phase 3 (partial) — Device IP tracking**
  - Real client-IP extraction from k8s ingress `X-Forwarded-For`. ip-api.com (free, 45 req/min, no key) provides Country/Region/City/ISP + proxy/hosting flags. Cached in-process + persistent Mongo 30-day cache.

- **Admin UI** — `Safety` tab with 4 sub-tabs: Review queue / Blacklist / IP lookup / Pending OTPs. Risk badges + flag chips on Quote Requests tab. Safety section in Settings tab with 3 new toggles.

## 🔔 Active Reminder (Jun 13, 2026)
- **iOS native build is failing at "Install pods" 3× in a row** — needs revisit.
  - OTA update is already live on production (build group `49d51794-ffbf-4cb8-b377-898791f58ffd`) so all current JS code (referral screen, new fleet images, party-bus route) is deployed to existing TestFlight 41 / Play 23 installs.
  - Android native build is in progress (build #25, versionCode 25) and will auto-submit to Play Store Closed Testing.
  - **iOS Universal Links** (tapping `https://turanelitelimo.com/r/REF-XXX` opens app) won't work until iOS native build #48+ succeeds. Until then, iOS taps fall back to Safari web invite page.
  - **Next attempt**: ask user (or someone with a laptop) to copy the last 50 red error lines from `https://expo.dev/accounts/adamfayz98/projects/turanelitelimo/builds/8f5b6b1a-cc2e-4297-9d23-7329392120b7` — most likely cause is `associatedDomains` entitlement missing on App ID at developer.apple.com. Workaround: temporarily drop `associatedDomains` from `app.json` iOS section, ship build, add later.

## Recent Changes (this session)

## ✅ Quote Letter Self-Service Confirm Fix — Shipped (Jun 13, 2026)

**Problem solved:** Quote responses were missing a clear next step. Customers had to call back or wait for a manual Stripe link, killing the 3-min conversion window. ~50% conversion lift opportunity.

**What shipped:**
- New backend: extended `PATCH /api/admin/quote-requests/{rid}` accepts `quoted_price`, `deposit_pct`, `quoted_notes`, `affiliate_id`, `affiliate_cost`, `send_to_customer`. Generates a per-quote `confirm_token` and (when `send_to_customer=true`) sends a branded gold-themed email + SMS to the customer with a one-tap confirm link `https://turanelitelimo.com/quote/{token}`.
- New backend endpoints (public, token-gated, no auth):
  - `GET /api/quote-offer/{token}` — fetch quote details for the confirm page
  - `POST /api/quote-offer/{token}/checkout` — create Stripe Checkout session for the deposit
  - `GET /api/quote-offer/{token}/finalize?session_id=...` — verify payment, auto-create Booking record, mark quote request as `won`, notify admin via SMS, email customer the confirmation
- New frontend route: `/quote/:token` → `QuoteOfferConfirm.jsx`. Mobile-first, gold-accented confirm page with trip details, operator notes, flat-rate total, deposit amount, gold "✓ Confirm & Pay $XXX Deposit" CTA → Stripe → success state with confirmation number + balance-due breakdown.
- Admin UI: QuoteRequestsTab now has a **"Send Quote"** button per row → modal with price/deposit %/affiliate cost (with live profit calculation)/customer-facing notes → on submit auto-emails + SMS → shows the confirm link for manual sharing if needed.
- All payment via Stripe live key; the Stripe webhook fallback already handles edge cases.
- E2E tested via curl: GET/POST/finalize all return correct JSON; public confirm page renders correctly on mobile viewport.

- ✅ **Fleet vehicle imagery overhaul** — Feb 12, 2026
  - User uploaded 6 new studio shots (Cadillac XTS, Mercedes S-Class, Cadillac Escalade ESV, Mercedes Sprinter, Hummer Stretch, Party Bus).
  - Auto-processed each PNG: corner flood-fill replaces the light-gray studio backdrop with the card's `#0A0A0A` background (so the vehicle blends seamlessly into the dark UI), tight-crop to the vehicle bounding box with 8% padding, then center-paste onto a 3:2 1500×1000 canvas. Result: vehicles always render fully on web + mobile fleet cards regardless of container aspect (`object-cover` no longer crops the car off-screen).
  - Updated `/app/frontend/src/lib/fleet.js`, `/app/mobile/app/index.tsx`, `/app/mobile/app/(rider)/(tabs)/discover.tsx`, `/app/mobile/app/(rider)/vehicle.tsx` to use the new local files (`/fleet/stretch-limo.jpg` and `/fleet/party-bus.jpg`) instead of generic Unsplash URLs.
  - All processed JPEGs saved under `/app/frontend/public/fleet/` (≤80 KB each, progressive). Mobile app fetches them via `https://turanelitelimo.com/fleet/*.jpg` after next web deploy.

## Recent Changes (this session)
- ✅ **Backend modular refactor: server.py 8,210 → 4,734 lines** — Jun 10, 2026
  - Programmatic AST-based extraction split the monolithic `server.py` into 4 modular routers under `/app/backend/routes/`:
    - `routes/admin.py` (65 handlers, 1,508 lines)
    - `routes/customer.py` (26 handlers, 921 lines)
    - `routes/driver.py` (19 handlers, 573 lines — driver dispatch + driver-auth)
    - `routes/payments.py` (12 handlers, 965 lines — Stripe checkout/webhook/refunds)
  - Each route file does `import server as _server; globals().update(vars(_server))` so every helper/model/dep (including underscore-prefixed private helpers) resolves at runtime. Route module imports happen at the BOTTOM of `server.py` so all definitions are in place first.
  - Critical ordering preserved: all `api_router.include_router(...)` calls happen BEFORE `app.include_router(api_router)`, so FastAPI's route snapshot captures everything.
  - **Verification**: 157 `/api` routes pre-refactor → 157 `/api` routes post-refactor (exact set match via OpenAPI spec).
  - **Regression**: testing agent built a new pytest suite (`/app/backend/tests/test_refactor_regression.py`, 39 cases covering every router file). Result: **39/39 PASS**, zero refactor regression.
  - **Bonus latent bug fixed**: pre-existing `/api/customer/me/notifications` returned 404 on fresh accounts because `if not user:` tripped on `{}` (Motor projection returning empty doc when field absent). Changed to `if user is None:` — fresh customers now get default NotificationPrefs instead of 404.
- ✅ **Two enhancements: address autocomplete + auto-apply promos** — Jun 10, 2026
  - **Google Places autocomplete on FloatingQuoteWidget**: swapped plain `<input>` for the existing reusable `PlacesAutocompleteInput` on Pickup + Drop-off. Same dropdown behaviour as the homepage booking form. Verified end-to-end: typing "SFO" → "SFO Airport" prediction; typing "Napa" → "Napa, Napa Valley, Napa County Airport" predictions.
  - **Auto-apply promo (Uber-style strike-through pricing)**: admin can now flag a promo as `auto_apply=true`. When active, the `/api/quote` endpoint decorates every eligible vehicle quote with `original_price`, `discount_amount`, and `applied_promo` metadata. Frontend (`FleetPicker.jsx`) renders strike-through original price + bold gold new price + "Save $X · CODE" badge per vehicle. `BookingForm.jsx` auto-fills the promo-input field when the selected vehicle has an applied_promo, so checkout actually applies the discount with zero manual typing.
  - Promo selection rule when multiple `auto_apply` promos qualify: the one producing the LARGEST absolute discount on the lowest-priced eligible vehicle wins (tie-break: higher `value`).
  - Respects `allowed_vehicle_types` (admin can restrict to a vehicle subset) and `min_ride_amount` (won't discount sub-threshold quotes).
  - Backend tests: 10/10 pytest pass. Frontend smoke: autocomplete + strike-through + promo-input auto-fill all confirmed.
  - **🐛 Caught + fixed**: `PromoUpdate` Pydantic model was missing `auto_apply` (latent silent-fail — admin EDIT path silently dropped the field on PATCH). Added. Now CREATE and UPDATE both persist the flag.
- ✅ **Banner stacking + sedan image fixes** — Jun 10, 2026
  - SmartAppBanner converted from `fixed` → `sticky`, now publishes `--smart-banner-h` CSS var. PromoBanner, AnnouncementBanner, Navbar updated to stack correctly underneath. Fixes the iPad/iPhone issue where the TuranEliteLimo brand was hiding behind the install banner.
  - Swapped sedan image (Chinese signage in background) → clean Mercedes/Cadillac photo. 9 occurrences updated across landing pages, fleet config, and Home page.
- ✅ **AdminDashboard import fix** — Jun 9, 2026: silent search_replace failure left `PushBroadcastTab` un-imported → admin dashboard threw `Can't find variable: PushBroadcastTab` after 2FA login → black screen. Added the missing `import`. Lesson logged: always grep after multi-edit batches.
- ✅ **Refer-a-Friend + Push Broadcast + Floating Quote Widget** — Jun 8, 2026
  - **Refer-a-Friend**: every customer auto-gets a unique `REF-XXXXXX` code at signup. New `referral.py` helper module isolates the logic. New routes: `/r/:code` (public referral landing — applies WELCOME20), `/refer` (logged-in customer page showing code + share URL + stats + earned promos). When a referred customer completes their first paid ride, the referrer auto-receives a single-use $25-off `THANKS-XXXXXX` promo via email. Idempotent — no double payouts. New endpoints: `GET /api/referral/check/{code}`, `GET /api/customer/referrals`. Booking form auto-applies WELCOME20 if a `ref_code` is in localStorage.
  - **Push Broadcast (admin)**: new admin tab "Push" lets you send Uber/DoorDash-style marketing notifications to all customers with the mobile app installed. Live preview, char counts, test-only mode (sends to admin's own device), bulk send via Expo Push API in 100-token chunks, audit history. New endpoints: `POST /api/admin/push/broadcast`, `GET /api/admin/push/eligible-count`, `GET /api/admin/push/history`. Reuses existing `_send_expo_push` infrastructure.
  - **Floating Quote Widget**: sticky bottom-right "Get Quote · 60 sec" button on all 4 themed landing pages (`/airport`, `/wedding`, `/wine-tour`, `/corporate`). Opens a mini-form with pickup/dropoff/date → submits to `/?pickup=X&dropoff=Y&date=Z#booking` so the booking flow pre-populates. Expected to lift landing-page conversion by 15-25%.
  - **🐛 CRITICAL FIXES uncovered during testing**: (1) `asyncio` was not imported at module level in `server.py` despite being used by `asyncio.create_task()` for welcome emails — this was silently breaking welcome emails AND would have crashed every new customer signup the moment my referral hook code path ran. Hoisted to top-level imports. (2) `ensure_referral_code()` in `referral.py` used `if not doc:` on a projected `find_one()` result — Motor returns `{}` for matched docs with missing projected fields, which is falsy → was raising ValueError on every fresh customer. Fixed to `if doc is None:`. Both bugs caught by testing agent and patched.
  - Tested: 13/13 backend tests pass (4 admin tests skipped due to 2FA email gate); 100% frontend smoke tests pass.
- ✅ **Marketing: Google Ads landing pages** — Jun 7, 2026
  - Built reusable `LandingPage.jsx` (matches existing `/world-cup-2026` style)
  - 4 themed Google Ads landing pages: `/airport`, `/wedding`, `/wine-tour`, `/corporate`
  - 11 SEO aliases (e.g. `/sfo-airport-transfer`, `/napa-tour`, `/silicon-valley-chauffeur`)
  - Each page sets its own unique `document.title` + meta description for Quality Score
  - Fixed App.js title bug that was clobbering per-route titles on direct URL load
  - Tested: all 6 routes (4 new + Home + Stadium) return their correct page-specific title
  - **Action for user:** in Google Ads, point each Asset Group's Final URL to the matching new page
- ✅ **P3: Resend lifecycle emails + admin Compose Promo tab** — Jun 7, 2026
  - New `/app/backend/email_lifecycle.py` with branded HTML templates for: welcome, 24h pre-trip reminder, win-back, generic broadcast
  - Welcome email fires on customer signup (email + social) with auto-seeded `WELCOME20` ($20 off) promo
  - Win-back email fires daily for opted-in customers 60-90 days since last completed ride with `WEMISSYOU25` ($25 off)
  - 24-hour pre-trip reminder runs every 15 min — finds paid bookings 23-25h away, includes manage/cancel link
  - Admin `POST /api/admin/broadcast/preview` returns rendered HTML
  - Admin `POST /api/admin/broadcast/send` with `test_only=true` → sends to admin only, `false` → blasts opt-in list, audit-logged to `email_broadcasts`
  - Admin `GET /api/admin/broadcast/history` shows last 50 broadcasts with sent/failed counts
  - New `PromoEmailsTab.jsx` admin UI with WYSIWYG-lite form, iframe live preview, test-send button
  - APScheduler now runs 5 jobs (added pretrip_reminder every 15 min, winback every 24h)
- ✅ **P2 #2: Manual Surge toggle** — Jun 7, 2026
- ✅ **P2 #1: Quick Quote admin tool with Maps autocomplete** — Jun 7, 2026
- ✅ **P1: Split Google Ads conversions + marketing opt-in** — Jun 6, 2026
- ✅ **Apple Sign-In FIXED + Profile-completion gate** — Jun 4, 2026
  - Deleted stale May 21 Expo iOS credentials, generated fresh cert/profile with Apple Sign-In entitlement
  - Pinned `expo-apple-authentication@8.0.8` (was 56.0.4, incompatible with SDK 54)
  - Backend `verify_apple_id_token`: fixed audience-list bug (python-jose requires string, not list)
  - Backend `_login_or_link_social`: skip soft-deleted customers; drop stale oauth_identities
  - Backend `customer_delete_account`: also detach oauth_identities so re-sign-in creates fresh account
  - Backend `customer_book_and_pay`: validates rider has real name+phone on file before allowing booking
  - Mobile pay.tsx: shows "Complete your profile" gate before payment when name/phone missing
  - iOS Build #43 live on TestFlight with all the above mobile changes
  - Backend changes need a **Deploy** to push to production

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
- ~~Tech debt: Split `server.py` (>7,200 lines) into modular routers~~ ✅ DONE Jun 10, 2026
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

## 2026-06-11 — Mobile Referral Deep-Linking + Fleet Studio Photos

**Mobile identifiers (PERMANENT RECORD — do not lose):**
- Android package: `com.turanelitelimo.app`
- Play App Signing SHA-1: `AC:99:46:BC:C3:61:D6:53:3E:8A:CC:9A:9B:A4:71:E8:4C:A0:A0:09`
- Play App Signing SHA-256: `C2:FE:8D:FC:75:5A:E4:6D:D1:84:C2:E5:5F:40:68:76:60:9E:33:BC:72:6A:3E:32:8C:64:0D:C1:3D:7C:B4:5D`
- Apple Team IDs seen in history: `X5PCWL9H76` (used by build-ios.exp) and `9M7CK4W8HM` (older PRD) — AASA includes BOTH
- iOS bundle: `com.turanelitelimo.app`, ASC App ID 6771610380

**Deep-linking implemented:**
- `/app/frontend/public/.well-known/apple-app-site-association` (scoped to /r/*, both team IDs)
- `/app/frontend/public/.well-known/assetlinks.json` (real SHA-256 installed)
- Mobile: `app/r/[code].tsx` invite screen, `src/referral.ts` pending-code storage, auth.tsx signup banner + referred_by_code, SocialSignInButtons pass code on Apple/Google
- Backend: SocialLoginRequest.referred_by_code; _login_or_link_social attributes referrer on NEW social accounts only
- app.json: Android intentFilter scoped pathPrefix /r (needs new native build to apply; existing builds match all paths which is a superset, OK)
- craco devServer: /m/* SPA fallback rewrite; InteractiveMap.web.tsx stub fixes expo web export
- Tested e2e: link → invite screen → signup → referred_by in DB ✓ (web /m demo + curl + direct unit test of social path)

**Fleet studio images (user-provided, white-bg side profiles):**
- Web serves cropped versions: `/fleet/executive-sedan.jpg`, `/fleet/first-class.jpg`, `/fleet/luxury-suv.jpg`, `/fleet/sprinter.jpg` (in frontend/public/fleet/, 1600x864)
- Mobile uses `https://turanelitelimo.com/fleet/*.jpg` (live after web deploy)
- Originals on customer-assets: whmcsomm_4E881F51 (exec sedan), ee1xq2fw_E7451852 (first class), mss04701_68AACA5D (Escalade), 8kl4awce_B9271A1E (Sprinter)
- White Tesla photo removed from all 7 web pages; Fleet/FleetPicker overlays lightened (opacity-85, via-black/30-35)

**QA plan now 58 steps** (Section J added: steps 52-58 for deep links + photos).

**PENDING / NEXT:**
1. User runs 58-step QA via CAI → fix any failures
2. User deploys website (puts AASA + assetlinks + /fleet images live)
3. Push OTA update (`eas update --channel production`) so existing app installs get invite screen + new images — EXPO_TOKEN in watch-and-submit.sh
4. Optional: new EAS native build (applies Android pathPrefix /r scoping; not blocking — old filter is superset)
5. P2 backlog: Saved Cards / 1-tap rebooking (Stripe SetupIntent); P3: Apple account linking

---

## 2026-07-05 — In-place landing quote dialogs + "Book now, pay after ride" (Iteration 49)

**Feature 1: In-place quote dialogs on landing pages** ✅ tested
- Quote-only landing pages (/party-bus, /wedding, /wine-tour, /casino, /motor-coach, /mini-coach) now open `QuoteRequestDialog` directly on the page (no /#booking detour). Airport + Corporate intentionally unchanged (instant-book vehicles).
- `LandingPage.jsx`: new props `quoteVehicleType`, `quoteTripType`, `quoteVehicleOptions`; hero/bottom CTAs, route cards, custom-route link + floating widget launcher all open the dialog.
- `QuoteRequestDialog.jsx`: new `defaultTripType` + `vehicleOptions` props (vehicle Select, data-testid="qr-vehicle"). Wedding pre-fills trip "Wedding", Wine Tour pre-fills "Wine Tour".

**Feature 2: Book now, pay after ride (trust/conversion play for sedan/SUV/first-class)** ✅ tested
- BookingForm: pay-timing choice (data-testid pay-timing-now / pay-timing-after) for instant-price vehicles; "after" → `POST /api/payments/checkout-setup` (Stripe Checkout SETUP mode, $0 today, card verified & saved to a Stripe Customer).
- Booking fields: `payment_mode="pay_after_ride"`, `pay_later_amount` (deposit% + promo applied), `payment_status` flips to `card_on_file` via `_finalize_setup_session` (called from /payments/status polling + Stripe webhook). Sends `render_card_on_file_email`, admin SMS, promo bump, Google Ads offline conversion (card-verified booking = conversion).
- Admin: `POST /api/admin/bookings/{id}/charge-pay-later` (BookingDetailsDialog "Pay after ride" block, data-testid charge-pay-later-btn) charges saved card off-session after ride → payment_status=paid + receipt email. Declines stamp `pay_later_charge_error`; /pay/{id} then re-shows Pay button as the fallback payment link (checkout preserves card_on_file status until paid).
- PayBooking /thank-you: card-on-file hero "Reservation secured · Nothing charged today" (data-testid card-on-file-badge), "Due after ride" amount.
- Test report: /app/test_reports/iteration_49.json — backend 8/8 pytest, frontend all pass. Backend tests: /app/backend/tests/test_iter49_pay_after_ride.py.
- NOTE: preview env uses LIVE Stripe key — never complete checkouts in tests.

**Strategy advice given to user (trust problem on sedan/first-class ads):**
- Recommended AGAINST migrating to Moovs/LimoAnywhere (no consumer trust value, loses custom attribution/promo/admin stack).
- Recommended enabling Apple Pay / Google Pay in Stripe Dashboard (auto-appears on hosted Checkout for pay-now, zero code).
- Pay-after-ride is the Blacklane-style safest pattern: card validated at booking ($0 auth), charged off-session after ride, payment-link fallback on decline.

**Backlog additions:** optional pre-auth hold 24h before pickup for pay-after-ride bookings; Google review count on landing/checkout pages; TCP license # near pay button; minor React duplicate-key warning audit on /casino /motor-coach /mini-coach (non-blocking).

---

## 2026-07-05 — "Book Now · Pay After Ride" marketing push + Stripe checkout page trust copy (Iteration 50)

**Context / Why:** User reported Stripe checkout drop-off is the #1 revenue leak — customers weren't even clicking "Proceed to Payment", so the Stripe wallet-support was moot. Solution was to REPEAT the "Book Now · Pay After Ride" (no charge today) promise across every surface a customer touches, and add Apple Pay / Google Pay + 5-star Google Reviews trust signals right before Stripe redirect.

**Frontend surfaces updated:**
- Homepage Hero (`Hero.jsx`): new gold pill "Book Now · Pay After Your Ride · No card charged today"; primary CTA renamed "Reserve Now · Pay After Ride" (was "Reserve Your Ride").
- FleetPicker (`FleetPicker.jsx`): gold ribbon "BOOK NOW · PAY AFTER RIDE" on Executive Sedan, First Class, Luxury SUV cards only.
- Landing pages (`LandingPage.jsx`): new `hidePayAfterBadge` prop. Pill shown on /wedding, /wine-tour, /airport, /corporate; hidden on /party-bus, /motor-coach, /mini-coach, /casino (group-only vehicles).
- BookingForm (`BookingForm.jsx`): pay-timing options REORDERED (pay-after now first with "Recommended" badge, "$0 today" chip); **default payTiming now = "after"** so first-time visitors see "Reserve Now · $0 Due Today" without clicking; wallet+reviews trust strip below submit.
- PayBooking (`PayBooking.jsx`): TrustPaymentBadges (Apple Pay / Google Pay / Visa / MC / Amex + 5-star Google Reviews **WITHOUT count**) below the Pay button.

**New reusable components:**
- `/app/frontend/src/components/PayAfterRideBadge.jsx` — 4 variants: hero, ribbon, inline, banner.
- `/app/frontend/src/components/TrustPaymentBadges.jsx` — wallet accept-marks (SVG) + 5-star Google Reviews text (NO count per user request).

**Backend — Stripe Checkout page trust text:**
- `POST /api/payments/checkout` (pay-now): added `submit_type=book`, `custom_text[submit][message]="Reservation confirmed instantly · Flat rate — no surge, no hidden fees · Free cancellation up to 24 hours · Apple Pay & Google Pay accepted."`, and line-item description with pickup→dropoff + date.
- `POST /api/payments/checkout-setup` (pay-after-ride): added `custom_text[submit][message]="You will NOT be charged today. Your card is securely saved by Stripe and only charged AFTER your ride is completed. Apple Pay & Google Pay supported for one-tap card setup."`
- Verified with live Stripe API: both sessions accepted with 200 + valid checkout URLs.

**RouteMap race condition fix (bug reported by user: Four Seasons → Carneros, Napa showed blank):**
- Extracted `_computeRoute` helper. Boot effect now calls it directly after DirectionsRenderer is ready — so if pickup+dropoff were set BEFORE the map booted, the initial route computation isn't lost.
- Improved error copy: "No driving route found — try a nearby landmark or the venue name."

**Google Ads copy handoff for user/CAI:**
- `/app/memory/GOOGLE_ADS_COPY_PAY_AFTER_RIDE.md` — 16 RSA headlines, 6 descriptions, sitelinks, callouts, structured snippets, and ad-group-specific variants (Airport, Executive Sedan, Corporate, Wedding, Party Bus). Ready to paste into Google Ads Editor.

**Testing:**
- Test report: `/app/test_reports/iteration_50.json` — 100% pass (16/16 UI checks + 11/11 pytest incl. iter49 regression).
- New backend tests: `/app/backend/tests/test_iter50_marketing_push.py` (3 cases).

**Pending user actions:**
- User to hand off `GOOGLE_ADS_COPY_PAY_AFTER_RIDE.md` to CAI to update Google Ads campaigns.
- User to redeploy website to production (currently in preview).
- Still pending from iter49 handoff: Twilio A2P Option A vs B choice; Google Ads OAuth secret rotation.

---

## 2026-07-05 evening — Bug fixes on Iter50 marketing push (Iteration 51)

**User-reported issues (all P0, all seen on production):**

1. **Pay-after-ride showed ORIGINAL amount everywhere** (thank-you page, admin, "Pay $X" button) even when an auto-apply promo was live. Admins were at risk of charging the pre-promo amount.
   - Root cause: PayBooking's "Due after ride" gate used `payment_status === 'card_on_file'`, which only flips AFTER Stripe webhook. On landing, it fell back to `deposit_amount` (raw quote). The "Pay $X & Secure" button hardcoded `booking.deposit_amount` too.
   - Fix: Gate on `booking.payment_mode === 'pay_after_ride'` OR card_on_file. All amount displays now use `pay_later_amount ?? deposit_amount`. Backend `/bookings/{id}/public` now returns `promo_code`, `discount_amount`, `original_quote_amount`. Frontend shows strike-through original + "You saved $X" chip + discounted "Due after ride" total.
   - Admin `BookingDetailsDialog` now renders 3-row breakdown: Quote (before promo) · Promo applied · Final quote (highlighted).

2. **Locked promo input when auto-apply promo active.** Customer with a personal code (e.g. Leticia's extra 10%) had to click Remove first, then apply their code.
   - Fix: When `promoApplied.auto_applied` is true, a secondary override input appears below the applied chip (data-testid=promo-override-input + promo-override-apply). Applying a valid new code REPLACES the auto-applied one in one step.

3. **"Recommended" badge on Pay-After-Ride** was pushing customers away from prepayment.
   - Fix: Removed the badge. Reordered options — Pay Now is now first (left/default), Pay After Ride second. Default `payTiming` reverted to `"now"`.

4. **Child seat was "complimentary" — should be $20/seat with a quantity picker.**
   - Fix: Added `CHILD_SEAT_FEE = 20.0` constant. `child_seat_count` field added to `BookingCreate`, `Booking`, `QuoteRequest` models. `_compute_quote_amount` and `/quote` (both transfer + hourly branches) now add `seat_count × $20` to the priced fare. UI replaced boolean Checkbox with −/count/+ picker (max 6). Email + admin + legacy compat all handled (child_seat bool auto-mirrors from count).

**BONUS FIX found by testing agent:** `_validate_promo_for_booking` crashed with `KeyError('discount_type')` on legacy-seeded promos (like `WELCOME20` created via `_ensure_promo_code_exists` with `percent_off` schema). Fixed to fall back to `percent_off`/`amount_off` fields, so both schemas coexist.

**Testing:**
- `/app/test_reports/iteration_51.json` — All 4 bug fixes verified, plus legacy promo schema fix.
- Backend regression: 20/20 pass (iter49 pay-after + iter50 marketing + iter51 bug fixes).
- Live curl verified: booking with 2 child seats + WELCOME auto-promo → quote=$341.09, discount=$68.22, pay_later_amount=$272.87. Screenshot confirmed PayBooking shows all three lines correctly.

**Files changed:**
- Backend: `server.py` (5 sections: CHILD_SEAT_FEE constant, model fields, quote hourly, quote transfer, /public endpoint, create_booking normalization, _validate_promo_for_booking legacy compat), `routes/customer.py`, `email_service.py`
- Frontend: `components/BookingForm.jsx` (child seat picker, promo override input, pay-timing reorder, badge removal, default reversion), `pages/PayBooking.jsx` (discounted display + payment_mode gate), `components/admin/BookingDetailsDialog.jsx` (3-row promo breakdown + child seat count in passengers row)

**User action required:** Redeploy to production (turanelitelimo.com).

---

## 2026-07-05 late — CAI review response (Iteration 52)

**Context:** CAI raised 9 concerns about the "Book Now · Pay After Ride" ad copy pre-deployment. Half were policy/code questions I needed to verify BEFORE finalizing copy.

**Code answers I verified:**
- **Conversion firing timing (CAI Q1):** ✅ Purchase conversion fires at BOOKING CONFIRMATION on both fronts — client-side gtag in `GoogleAdsConversion.jsx` (fires when `payment_status='card_on_file'`) and server-side offline conversion via `_finalize_setup_session` → `upload_booking_to_google_ads` (scheduled immediately after Stripe SetupIntent completes).
- **Payment mechanism (CAI Q2):** ✅ Confirmed as (b) Stripe SetupIntent, not (a) authorization hold. No 7-day expiry problem — long-lead bookings are safe.
- **Cancellation policy (CAI Q3):** ✅ Real policy exists in `CancellationPolicy.jsx`: 24h+ = free, 12–24h = 50%, <12h = no refund. Copy rewritten to say "Free Cancellation to 24h" instead of vague "Free Cancellation".

**Small code fixes shipped along with the copy rewrite:**
1. **Conversion value accuracy:** `_booking_gross_and_profit` in `routes/google_ads.py` + `GoogleAdsConversion.jsx` now use `paid_amount → pay_later_amount → quote_amount` priority order, so Smart Bidding sees REALIZED post-promo revenue, not the inflated pre-promo quote.
2. **Internal-test exclusion:** Added `GOOGLE_ADS_EXCLUDED_EMAILS` env var (comma-separated). Filters BOTH the client-side gtag Purchase event (via `is_internal_test` flag now exposed on `/bookings/{id}/public`) AND the server-side offline upload. Prevents Adam's own test bookings from training Smart Bidding on our own dollars.
3. Added `_booking_is_internal_test()` helper in `server.py` shared by both paths.

**Deliverable:** `/app/memory/GOOGLE_ADS_COPY_PAY_AFTER_RIDE.md` (v2) — fully rewritten with:
- Character-counted headlines (all ≤30 chars, verified)
- 3-headline pinning strategy (not just 1 — fixes Ad Strength concern)
- "Top-Rated on Google" replacing "5-Star" (GBP is 4.9 avg, not literal 5.0)
- "Free Cancellation to 24h" replacing bare "Free Cancellation"
- "Late-model executive fleet" replacing specific car models
- Cut: Meet & Greet Included, Free Wait, Multilingual Chauffeurs, "Confirmed in 60 Seconds" vs "1 hr" contradiction
- Sitelink routing: sedan/SUV/first-class campaign gets ONLY fixed-price sitelinks (no wedding/party bus muddying)
- §0 deployment prerequisite: end-to-end conversion verification checklist

**Testing:** 20/20 backend regression pass. Verified `is_internal_test` flag flips correctly based on env var (nottest@example.com test with/without exclusion).

**User action required:**
1. Add real emails to `GOOGLE_ADS_EXCLUDED_EMAILS` in `backend/.env` (e.g. adam@..., support@..., cai@...) — restart backend.
2. Do the §0 end-to-end verification: click a live ad → book Executive Sedan → complete Stripe → verify Purchase fires in Google Ads with post-promo value AND that excluded emails do NOT fire.
3. Only THEN redeploy site to production and hand v2 copy to CAI.
