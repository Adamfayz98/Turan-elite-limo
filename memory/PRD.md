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
