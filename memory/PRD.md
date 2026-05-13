# Turonlimo - Product Requirements Document

## Original Problem Statement
"Build me a full functioning website for my limo business"

## User Choices
- Company name: **Turonlimo**
- Service area: **Northern California, especially the Bay Area**
- All services included (airport, weddings, corporate, hourly, prom, special events, wine tours)
- Admin dashboard required
- Design left to agent → luxurious dark theme with gold accents (Playfair Display + Outfit)

## Architecture
- **Backend**: FastAPI + Motor (async MongoDB) + JWT (PyJWT) + bcrypt
- **Frontend**: React 19 + Tailwind + Shadcn UI + sonner toasts + react-router-dom
- **Database**: MongoDB collections: `bookings`, `contacts`, `admin_users`

## User Personas
1. **Customer** — Books a chauffeured ride or sends inquiry via the public site.
2. **Admin (business owner)** — Logs into `/admin` to manage bookings & inquiries.

## Core Features (Implemented · v1 — Dec 2025)
### Public Marketing Site (`/`)
- Sticky glassmorphism navbar
- Hero section with headline & dual CTAs
- Booking form (full reservation: name, email, phone, service type, date/time picker, pickup/dropoff, vehicle type, passengers, notes)
- Bento-grid Fleet showcase (5 vehicles)
- Services section (6 service cards with icons)
- Coverage area (30+ NorCal cities + 5 major airports)
- Testimonials (3 reviews)
- Contact form (Name, Email, Phone, Subject, Message)
- Footer with admin link

### Admin Dashboard (`/admin`)
- JWT-protected via `/admin/login`
- Stats cards (total / pending / confirmed / completed bookings, inquiries)
- Bookings table with status pill, dropdown actions (confirm / complete / cancel / pending / delete)
- Inquiries table with mark-read & delete actions
- Logout

## Recent Fixes (Feb 2026)

### v2.4 — Driver Dispatch System Phase 1 (Feb 2026)
**New feature**: end-to-end driver dispatch with auto SMS notifications to customer.

**Backend (server.py + sms_service.py):**
- New `Booking` fields: `driver_name, driver_phone, driver_email, driver_plate, driver_token, trip_status, trip_status_updated_at`.
- Status enum: `assigned → en_route → on_location → passenger_onboard → completed` (forward-only, enforced server-side).
- New endpoints:
  - `POST /api/admin/bookings/{id}/assign-driver` — admin assigns driver info, generates `driver_token`, SMSes driver
  - `DELETE /api/admin/bookings/{id}/driver` — unassign + invalidate link
  - `GET /api/driver/{token}` — driver's view (no auth, token IS auth)
  - `POST /api/driver/{token}/status` — driver advances status; auto SMSes customer + admin
- Status `completed` also flips booking.status to "completed" and stamps completed_at.
- Sparse index on `driver_token` for fast lookups.

**Frontend:**
- New `/driver/:token` route (`DriverPortal.jsx`) — mobile-optimized, single-tap status advance, visual progress timeline, all trip details (customer phone tap-to-call, flight #, meet & greet highlighted).
- New `AssignDriverDialog.jsx` component in admin Bookings table — modal with name/phone/email/plate inputs, dispatches SMS, shows copyable driver URL, supports re-assign + unassign.
- New `DriverStatusPill` component shows live trip status in admin bookings table.

**SMS templates** (in `sms_service.py`):
- Driver dispatch: includes confirmation #, customer name, pickup address, dispatch URL
- Customer (en_route): "Driver X is on the way…"
- Customer (on_location): "Driver X has arrived. Look for [vehicle] plate [X]"
- Customer (completed): "Trip complete. Receipt + rate/tip link coming"
- Admin status mirror: brief status alerts for live awareness

**Pricing**: Twilio SMS ~$0.01 each = ~$0.03 per completed trip (3 customer SMS) + driver dispatch + admin mirrors. Negligible at limo-business volume.



### v2.3 — Stripe-First Flow + 1-Tap Admin Confirm (Feb 2026)
**Reverted iter-15's email-only payment flow per user feedback** (looked suspicious / un-premium). Final flow:

1. **Customer fills booking → clicks "Proceed to Payment"** → immediately redirected to Stripe Checkout (familiar premium UX, classic e-commerce)
2. **Stripe payment succeeds** → backend `/api/payments/status` handler:
   - Sets `payment_status="paid"`
   - Generates `confirmation_number` and `manage_token`
   - **Keeps `status="pending"`** (NO auto-confirm — admin still reviews chauffeur availability)
   - Sends Email #1: `render_payment_received_pending_email` — "Payment received, confirming chauffeur within an hour"
3. **Admin opens dashboard** → sees the new **1-tap "Confirm chauffeur"** button (emerald-tinted, only for pending bookings, label changes to "Confirm" if unpaid)
4. **Admin clicks Confirm** → Email #2 sent (existing `render_confirmation_email`):
   - **No pay button** if already paid (subject: "Your chauffeur is confirmed — {cn}")
   - Pay button included if unpaid (subject: "Reservation confirmed — {cn}") — legacy path
5. **(Rare) Admin can't fulfill** → existing refund endpoint refunds via Stripe + email

**Frontend changes**:
- "How it works" banner now reads: "You'll pay now via Stripe to hold your slot. We personally review every booking and send chauffeur confirmation within an hour. If we can't fulfill, instant refund."
- 1-tap quick-confirm button: `data-testid="quick-confirm-{id}"` next to Manage dropdown.
- Submit button restored to "Proceed to Payment · $X" for instant-price vehicles.

**Backend changes**:
- `create_booking` no longer sends email (Stripe redirects immediately, email comes after payment).
- `/api/payments/status` no longer auto-confirms — only marks `payment_status=paid` and sends pending email.
- `/api/admin/bookings/{id}` confirm now omits pay button if `payment_status==paid`.
- New `render_payment_received_pending_email` template in `email_service.py`.



### v2.2 — Two-Stage Email Confirmation Flow (Feb 2026)
**Major behavior change**: customers no longer auto-redirect to Stripe after submitting. The flow is now:

1. **Customer submits booking** → `POST /api/bookings`
   - `manage_token` is generated upfront (was previously generated on admin confirm only)
   - **Email #1 sent immediately**: `render_request_received_email()` — "We've received your request, you'll get a confirmation + payment link within an hour". No Stripe link.
   - Customer stays on booking form, sees success toast, form resets.
2. **Admin reviews in dashboard** → PATCH `/api/admin/bookings/{id}` status=confirmed
   - Confirmation number generated
   - **Email #2 sent**: existing `render_confirmation_email()` with Stripe Pay-Now button
3. **Customer clicks Pay** in Email #2 → `/pay/:id` → Stripe Checkout (unchanged)
4. **Payment success** → existing receipt email (unchanged)

**Frontend additions**:
- New "Two-step confirmation" banner (data-testid=`two-step-notice`) above the cancellation policy chip, sets customer expectations
- Submit button renamed from "Proceed to Payment" → **"Request Reservation"**
- onSubmit no longer calls `/payments/checkout` — just shows toast

**Why this matters**: customers know exactly what to expect, you keep human review in the loop (avoid bad bookings), and you only collect payment for confirmed slots — eliminates refund hassle.



### v2.1 — Radius-Based Zone Surcharges (Feb 2026)
- **Two zone match modes** in the admin Zones tab — choose per zone via dropdown:
  - **`keyword_short` (legacy/default)** — pickup or dropoff address contains a keyword AND trip distance below the threshold → flat surcharge (positioning fee for short rides in distant areas)
  - **`outside_radius` (new)** — pickup OR dropoff is farther than `radius_miles` from HQ (Millbrae 37.5985, -122.3873) → flat surcharge (blanket out-of-area fee)
- Backend: `_select_surcharge_zone` now takes `pickup_coord` + `dropoff_coord` and branches on `match_type`. `_haversine_miles(HQ_LAT, HQ_LON, ...)` used for radius checks.
- Legacy zones automatically backfilled with `match_type=keyword_short` on startup.
- Frontend: ZonesTab refactored into shared `ZoneFields` subcomponent rendering different inputs depending on selected `match_type` (keywords + threshold OR radius miles).
- Verified: Sacramento→Roseville (outside 40mi from HQ) correctly applied $75 radius surcharge; SFO→Burlingame (inside radius) applied none.



### v2.0 — Flight Number + Cancellation Policy + SEO Expansion (Feb 2026)
- **Mandatory Flight Number** for Airport Transfer bookings — new `flight_number` field on `BookingCreate`/`Booking`. Backend returns 400 if missing for Airport Transfer; frontend toast-validates pre-submit. Captured in admin email + manage page so chauffeurs can monitor arrivals via flight-tracker.
- **Cancellation & Change Policy** in three places (industry best-practice triple-disclosure):
  - **Booking form** — collapsible chip just above the "Proceed to Payment" button (compact variant)
  - **Manage page** — always-expanded full policy above the cancel-reason textarea
  - **Confirmation email** — branded policy block with airport-specific section
- **Airport-specific flight-delay protection rules** surface only when service_type=Airport Transfer: monitor flight #, auto-adjust pickup at no charge, full refund if airline cancels, 15-min free grace after landing (45 min international), no-show 30 min past landing = full charge.
- **SEO Expansion**:
  - **Keywords meta** ~3.5x larger: 60+ Bay Area phrases (Peninsula cities, Silicon Valley campuses, wine country, venues like Levi's Stadium, Chase Center, Oracle Park, plus "flight tracking limo", "meet and greet sfo", "MGL limo alternative")
  - **LocalBusiness `areaServed`** expanded from 9 to 26 entries (23 cities + 3 Place entries for SFO/OAK/SJC airports)
  - **New `makesOffer` array** in LocalBusiness schema (6 offers with areaServed)
  - **New FAQPage JSON-LD schema** with 6 Q&A pairs (airport transfer, Meet & Greet, coverage area, cancellation, pricing, wine tours) → enables Google rich snippets
- **CancellationPolicy.jsx** is a reusable component (compact + full variants, optional `airport` prop).


### v1.9 — Meet & Greet + Business Email Swap + z-index hardening (Feb 2026)
- **Meet & Greet (Airport Transfer only)**: New `meet_and_greet` boolean on `BookingCreate`, `Booking`, `QuoteRequest`. When `service_type=Airport Transfer` and `meet_and_greet=True`, a flat fee (configurable per `Settings.meet_greet_fee`, default $25) is added to every priced vehicle quote AFTER zone surcharge and surge multiplier. Call-only vehicles ignore the fee. `_compute_quote_amount` applies the same fee so Stripe charges the right amount.
- **Frontend toggle** in `BookingForm.jsx`: Appears only when service type is `Airport Transfer`. Has an info popover (powered by Shadcn `Popover`) explaining the service ("chauffeur meets you at baggage claim, assists with luggage, escorts you to vehicle"). When toggled on, the fee chip "+$X flat fee" appears and the live quote re-computes.
- **Admin Settings tab** now has a "Meet & Greet flat fee" input (`data-testid="settings-meet-greet-fee"`). Owner can change or set to 0 to disable.
- **Email confirmation**: When `meet_and_greet=True`, confirmation email shows "Meet & Greet: chauffeur will meet you inside the terminal at baggage claim" in the extras list.
- **Business email swap**: `SUPPORT_EMAIL=support@turanelitelimo.com` is now the public-facing inquiry/contact address (Footer, Contact form, ManageBooking, PayBooking, JSON-LD schema). Admin login email remains `turonlimosupport@gmail.com`.
- **Dropdown z-index hardening**: `SelectContent` and `PopoverContent` bumped to `z-[200]`, `PlacesAutocompleteInput` dropdown to `z-[150]`. Fixes Service Type dropdown being visually obscured by the FleetPicker grid (recurrent bug).
- **Meet & Greet fee surfaces in QuoteResponse** as `meet_and_greet_fee` field for the frontend chip.

### v1.8 — Zone Surcharges + Domain Swap + Geocoder Hardening (Feb 2026)
- **Zone Surcharges** — admin can define "long-distance area" zones from a new `Zones` tab. Each zone has a name, comma-separated address keywords, a flat $ surcharge, a `short_distance_threshold_miles` (default 20), and a customer-facing reason. When pickup OR drop-off matches the zone keywords AND trip distance is below threshold, every priced vehicle quote gets the surcharge added and a "Estimated flat rate · long-distance area" tag. Stretch/Sprinter/Party Bus remain "Call for quote". Hourly mode bypasses surcharges by design.
- **Customer-facing surcharge banner** on the booking form (`data-testid="surcharge-banner"`): amber info banner with "Long-distance area fee · +$X (Zone Name)" and the admin-written reason text.
- **Default zones seeded**: "Healdsburg & North Sonoma" ($65, 20mi, covers Healdsburg/Geyserville/Cloverdale/Windsor) and "Calistoga & Upper Napa" ($55, 20mi, covers Calistoga/Angwin/Deer Park/Pope Valley/St. Helena).
- **Stripe checkout snapshots** the surcharged amount via `_compute_quote_amount` so customers actually pay the surcharged price.
- **Geocoder hardening** — `_geocode()` now uses **Google Geocoding API as primary** (was Nominatim only, which rate-limited at ~1 req/sec causing intermittent "phone quote required" errors). Nominatim is now the fallback for the rare case Google fails. Cache TTL preserved.
- **Domain swap** — canonical URL, OG tags, Twitter Card, JSON-LD schema, robots.txt, sitemap.xml all updated to `https://www.turanelitelimo.com/`.
- **Fleet nav anchor fixed** — clicking "Fleet" in navbar now scrolls to the vehicle picker inside the booking form (wrapped in `<div id="fleet">`). Previously linked to a nonexistent section.
- **Tahoe removed** from the Coverage section's service-area list.
- **Stripe LIVE key** is now in preview `/app/backend/.env`. Production env must also be updated via Emergent deployment dashboard for live charges to work.

### Updated Backend APIs (added)
- `GET /api/admin/zones` — list all zones
- `POST /api/admin/zones` — create zone
- `PATCH /api/admin/zones/{zone_id}` — update zone
- `DELETE /api/admin/zones/{zone_id}` — delete zone
- `GET /api/admin/account`, `PATCH /api/admin/account` — (from v1.3, still active)

### v1.7 — 12-Hour Time + Admin Search (Feb 2026)
- **12-hour pickup time** with separate AM/PM selector: split into a wider Time dropdown (1:00–12:45 in 15-min steps) and a small AM/PM dropdown beside it. Wire format saved to MongoDB stays `HH:MM` (24h) for backend stability — frontend converts via `to24h` / `from24h` helpers in `BookingForm.jsx`.
- **`formatTime12h` utility** in `/app/frontend/src/lib/utils.js` — reused in AdminDashboard table + ManageBooking page.
- **Backend email + SMS** now display 12-hour times (`_format_time_12h` in email_service.py, `_fmt_12h` in sms_service.py).
- **Admin bookings search**: new search bar at the top of the bookings tab (`data-testid='bookings-search'`). Client-side filter on already-loaded list — matches confirmation number, name, email, phone, pickup, drop-off (case-insensitive substring). Live "X of Y" count chip + clear button. Empty-state shows "No bookings match \"…\"" when no results.

### v1.6 — Hourly Pricing Engine + Trust Badge (Feb 2026)
- **Hourly pricing per vehicle** now editable from the admin Pricing tab — new `hourly_rate` column saved alongside base/per_mile/min. Defaults: Executive Sedan $95/hr, S-Class $125/hr, Luxury SUV $145/hr; call-only vehicles 0.
- **Live quote engine** now branches: when `service_type=Hourly Chauffeur` AND `hours` provided, returns `hourly_rate × hours` and ignores trip distance. New response fields: `pricing_mode`, `hours`, `included_miles`. Stripe checkout for hourly bookings uses the hourly amount.
- **Minimum 2 hours** enforced on three layers: HTML5 `min={2}`, JS validation (toast), Pydantic `ge=2`, plus an explicit 400 in `create_booking` for the missing-hours case.
- **20 miles included per hour** displayed under the hours input as soon as customer types: e.g. "4 hours · ~80 miles included (20 mi per hour)". Trip summary chip switches to "Hourly chauffeur estimate · 4 hr · 80 miles included".
- **Navbar Google Trust Badge** (`/api/reviews/summary`): renders a "★ rating · count reviews" pill in the navbar when `GOOGLE_PLACE_ID` is set; gracefully hidden when unset.

### v1.5 — Reviews + Self-Service + SMS Stack (Feb 2026)
- **Review-request email scheduler**: APScheduler runs every 30 min, scans for bookings with `status=completed` and `completed_at` >24h, sends a branded "How was your ride?" email with Google + Yelp review buttons, then stamps `review_request_sent_at` so each booking only gets one email. Auto-starts on backend boot ("Review-request scheduler started" in logs).
- **Public reviews aggregator** at `GET /api/reviews`: pulls top reviews from Google Place Details API (uses existing `GOOGLE_MAPS_API_KEY` + new `GOOGLE_PLACE_ID`) and Yelp Fusion (`YELP_API_KEY` + `YELP_BUSINESS_ID`), 6-hour in-memory cache, 4★+ filter, falls back to 3 handpicked testimonials when env keys are blank. Frontend `Testimonials.jsx` auto-uses this (shows "via Google" / "via Yelp" pill on real reviews).
- **Customer self-service `/manage/:token`**: every confirmed/paid booking gets a unique `manage_token` (URL-safe, 22 chars). New page lets customer view full ride details and cancel. **Unpaid → cancelled immediately**. **Paid → cancellation_requested flag** so admin can review + refund manually within 24h. Cancellation reason captured optionally. Manage link is included in the post-confirmation and post-payment emails.
- **Twilio SMS module** (`sms_service.py`): env-gated. If `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM_NUMBER`/`ADMIN_PHONE` are blank → `send_sms()` is a no-op (logs INFO). Once filled in, fires SMS to `ADMIN_PHONE` on (1) every new paid booking and (2) every cancellation/cancellation-request — with confirmation #, customer name + phone, when, vehicle, route, paid amount.
- **Admin dashboard**: bookings table now shows a `⚠ Cancel requested` orange badge for paid bookings the customer has asked to cancel — admin can refund or override status from the same dropdown.

### Updated Backend APIs (added)
- `GET /api/reviews` — public reviews aggregator
- `GET /api/bookings/manage/{token}` — sanitized booking view
- `POST /api/bookings/manage/{token}/cancel` — customer cancel/cancellation-request

### v1.4 — Hourly Chauffeur Input + SEO Foundation (Feb 2026)
- **"How many hours do you need?"** input now appears on the booking form whenever `Service Type = Hourly Chauffeur`. Backend validates 1–24 hours; the field is required and saved on the booking, shown in the admin dashboard table and confirmation emails.
- **SEO foundation** (`/app/frontend/public/index.html`): proper title tag, ~280-char meta description, keyword list, geo meta tags pointing at Millbrae HQ, canonical URL, Open Graph tags, Twitter Card tags, full LocalBusiness/LimousineService JSON-LD schema for Google's rich-results.
- **`robots.txt`** at `/app/frontend/public/robots.txt` — allows Google/Bing, blocks `/admin` + `/pay` + `/api`, blocks GPTBot/ClaudeBot/CCBot scrapers, and points to sitemap.
- **`sitemap.xml`** at `/app/frontend/public/sitemap.xml` — lists all 7 main page anchors with priorities + change-freq.
- Cleaned up duplicate trailing tags in `index.html` from a previous edit.

### v1.3 — Admin Security & UX Polish (Feb 2026)
- **Admin 2FA via email**: every login now requires a 6-digit code emailed to the admin's recovery address (10-min expiry, max 5 attempts). Two-step UI in `AdminLogin.jsx` (credentials → code) with resend button. New endpoints: `POST /api/admin/login` (issues challenge), `POST /api/admin/verify-2fa` (returns JWT). Stored in new `admin_2fa_challenges` collection with 24h TTL auto-purge.
- **Admin self-service account**: new `Account` tab in dashboard lets the owner change sign-in email, password, and recovery email. `current_password` required for any change. Confirmation emails fire to old + new addresses on every change. Endpoints: `GET /api/admin/account`, `PATCH /api/admin/account`.
- **HQ address**: replaced two old NorCal addresses with single `501 Broadway, #251 Millbrae, CA 94030` in Footer + Contact section.
- **Strict email validation** on booking form: `type=email` + regex pattern + JS-side check before submit + helper text "Double-check your email — your confirmation number will be sent here."
- **Stripe colored badge** (`StripeBadge.jsx`): replaced "Secure payment via Stripe…" plain text with a small pill containing a lock icon and the official Stripe wordmark on `#635BFF`.

### v1.2 — UI Polish (Feb 2026)
- z-index bumped to `z-[100]` on Shadcn `SelectContent` and `PopoverContent`, and `z-[90]` on `PlacesAutocompleteInput` dropdown so the Service Type / Pickup Time / Date / address suggestions overlay all in-flow content (fleet picker, vehicle cards) reliably.
- `ContactForm` now console-logs the real error (status + payload) and surfaces a clearer fallback toast that includes the support phone number.
- Verified Google Places autocomplete is working end-to-end through `/api/places/autocomplete` (5 predictions returned for "San Fr").

## Updated Backend APIs
- Public: `POST /api/bookings`, `POST /api/contact`, `POST /api/quote`, `GET /api/options`, `GET /api/places/autocomplete`, `POST /api/payments/checkout`, `GET /api/payments/status/{session_id}`
- Admin auth: `POST /api/admin/login` (challenge), `POST /api/admin/verify-2fa` (JWT)
- Admin self-service: `GET /api/admin/account`, `PATCH /api/admin/account`
- Admin protected: `GET /api/admin/me`, `GET /api/admin/bookings`, `PATCH /api/admin/bookings/{id}`, `DELETE /api/admin/bookings/{id}`, `GET /api/admin/contacts`, `PATCH /api/admin/contacts/{id}`, `DELETE /api/admin/contacts/{id}`, `GET /api/admin/stats`, `GET/PATCH /api/admin/pricing`, `GET/PATCH /api/admin/settings`, `POST /api/admin/payments/{id}/refund`

## Backlog — Confirmed P1 (next session)
- **Review request email**: scheduled task that fires 24h after booking status flips to `completed`, emails customer with Google/Yelp review links
- **Google reviews ingestion**: pull ★★★★★ Google Business reviews via the Place Details API and display them in the Testimonials section alongside hand-picked ones
- **Yelp reviews ingestion**: same idea via Yelp Fusion API (requires API key from yelp.com/developers)
- Customer self-service: review/cancel their booking via tokenized link emailed in confirmation
- Twilio SMS notifications to driver/admin on new paid bookings
- SEO meta tags + sitemap.xml + Google My Business schema
- Google Maps embed showing the Millbrae HQ inside the Coverage section

## Backlog — P2
- Multi-language support (Spanish)
- Driver portal (assign rides, mark completed)
- Loyalty program / promo codes
- Real-time chauffeur location sharing (post-confirmation)

## Test Credentials
See `/app/memory/test_credentials.md` (includes 2FA programmatic bypass recipe for testing).
