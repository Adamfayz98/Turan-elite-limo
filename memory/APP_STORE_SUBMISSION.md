# 🍎 TuranEliteLimo — App Store Submission Content

All text content you need for App Store Connect. Each section is ready to copy/paste.

---

## App Information

| Field | Value | Notes |
|---|---|---|
| Bundle ID | `com.turanelitelimo.app` | Pre-filled, don't change |
| App Name | `TuranEliteLimo` | Already set |
| Subtitle | `Bay Area Chauffeur Service` | 26 chars — under the 30-char limit |
| Primary Category | `Travel` |  |
| Secondary Category | `Lifestyle` |  |
| Content Rights | NO (you don't own any third-party content) |  |
| Age Rating | 4+ | Answer all questionnaire items "None" |

---

## Privacy

| Field | Value |
|---|---|
| Privacy Policy URL | `https://turanelitelimo.com/privacy` |
| Privacy Choices URL | Leave blank |

### App Privacy Data Declarations

When Apple's data collection wizard asks "Do you collect data from this app?" → **YES**.

Then for each data type, mark as follows. **For every line, "Used for Tracking" is NO.**

| Data Type | Collected | Linked to user identity | Purpose |
|---|---|---|---|
| Contact Info → Email Address | YES | YES | App Functionality, Account Management |
| Contact Info → Phone Number | YES | YES | App Functionality, Account Management |
| Contact Info → Name | YES | YES | App Functionality, Customer Support |
| Location → Precise Location | YES | YES | App Functionality (driver tracking, pickup pin) |
| Identifiers → User ID | YES | YES | App Functionality, Analytics (optional) |
| Identifiers → Device ID | YES | YES | App Functionality (push notifications) |
| User Content → Customer Support | YES | YES | App Functionality, Customer Support |
| Purchases → Purchase History | YES | YES | App Functionality (your booking history) |
| Diagnostics → Crash Data | YES | NO | App Functionality |
| Diagnostics → Performance Data | YES | NO | App Functionality |

**Do NOT declare**: Financial Info / Payment Info. Stripe handles all payment data — your servers never see the card number.

---

## Pricing & Availability

- **Price**: Free
- **Available in**: United States
- (You can expand later — only US for v1.0.0)

---

## Version 1.0.0 — Submission Content

### Promotional Text (170 chars max, editable anytime)
```
New riders save 20% on your first ride with code WELCOME20. Real-time tracking, Apple Pay, 24/7 dispatch — premium chauffeur service across the Bay Area.
```

### Description (4000 chars max — paste this exactly)
```
TuranEliteLimo brings the discreet luxury of a private chauffeur service to your phone. From an executive sedan to SFO, a Sprinter for a wedding party, or a stretch limo for the night — book in under sixty seconds with a quote you can trust.

WHY RIDERS CHOOSE TURANELITELIMO

• Live up-front pricing — see every charge before you confirm. No surge surprises.
• A fleet for every occasion — Cadillac XTS and Mercedes E-Class sedans, S-Class first-class, Cadillac Escalade and Yukon Denali luxury SUVs, Hummer and Chrysler 300 stretch limos, Mercedes Jet Sprinters, and 14-30 passenger party buses.
• Real-time tracking — once your chauffeur is assigned, watch the car move toward your pickup on a live map.
• Apple Pay at checkout — secure, one-tap payment processed by Stripe.
• 24/7 dispatch — text or call (650) 410-0687 anytime.
• Fully insured, TSA-screened chauffeurs.

SERVICES

• Airport Transfers — SFO, OAK, SJC with flight tracking
• Corporate Travel — executive black-car service
• Weddings — choreographed timing, champagne, day-of coordination
• Wine Tours — Napa, Sonoma, Livermore
• Hourly Chauffeur — as-directed service for events
• Nightlife & Prom — celebrate in style, get home safely

COVERAGE

San Francisco, Oakland, Palo Alto, San Jose, Napa, Sonoma, Berkeley, Sausalito, Half Moon Bay, Monterey, Sacramento, Livermore, and 30+ Northern California cities.

HOW IT WORKS

1. Open the app and enter your pickup, drop-off, and date.
2. Choose your vehicle class and review the quote.
3. Confirm with Apple Pay or any major card.
4. Watch your driver arrive on a live map.

TRANSPARENT POLICIES

• Free cancellation up to 24 hours before pickup
• 45-minute grace period for airport pickups (15 minutes for all other trips)
• Saved card on file is only charged for the ride, plus wait time or damages you agree to in advance
• Never any hidden fees

PRIVACY & SECURITY

Your card number never touches our servers — every payment is processed by Stripe with bank-grade encryption. Location is only shared during your active trip. We never sell your data.

Questions? Reach us at support@turanelitelimo.com or call (650) 410-0687.
```

### Keywords (100 chars max total — paste exactly)
```
limo,chauffeur,SFO,airport,blackcar,SJC,OAK,bayarea,sprinter,limousine,ride
```

(Comma-separated, no spaces between. Currently 79 chars — under limit.)

### Support URL
```
https://turanelitelimo.com
```
(Or `https://turanelitelimo.com/support` if you have a dedicated support page — homepage works too.)

### Marketing URL (optional but recommended)
```
https://turanelitelimo.com
```

### Copyright
```
2026 TuranEliteLimo LLC
```
(Adjust if your legal entity is different.)

### What's New In This Version (for v1.0.0)
```
Welcome to TuranEliteLimo. Premium chauffeur service for the Bay Area — book sedans, SUVs, stretch limos, and Sprinters with real-time tracking, Apple Pay, and 24/7 dispatch.
```

---

## App Review Information (CRITICAL — required so reviewer can sign in)

| Field | Value |
|---|---|
| Sign-in Required? | YES |
| User Name | `rider.test@turanelitelimo.com` |
| Password | `RiderPass123!` |
| Contact First Name | (your first name) |
| Contact Last Name | (your last name) |
| Contact Phone | (your real phone) |
| Contact Email | `support@turanelitelimo.com` |

### Notes for the Reviewer (paste exactly)
```
TuranEliteLimo is a chauffeur booking app for the San Francisco Bay Area.

DEMO ACCOUNT (rider):
Email: rider.test@turanelitelimo.com
Password: RiderPass123!

HOW TO TEST:
1. Sign in with the credentials above on the "Sign In" screen.
2. From the Home tab, tap "Book a ride" (or the Book tab at the bottom).
3. Enter any pickup address in the SF Bay Area (e.g. "1 Hacker Way, Menlo Park, CA") and any drop-off (e.g. "SFO Airport"). The Google Places autocomplete will help.
4. Pick a date/time and continue to see live quotes from our fleet.
5. Select a vehicle, mark the consent checkboxes, and tap Pay.
6. Stripe Checkout opens — payments for this account are in TEST mode. Use the test card 4242 4242 4242 4242, any future expiry, any CVC. No real charges occur.
7. After payment, view the booking under the Trips tab.

DRIVER FLOW (optional):
The driver portal is accessed from "I'm a driver — sign in" at the bottom of the Home tab. Driver test credentials are provided on request.

LOCATION USAGE:
Precise location is only requested when a driver is actively on a trip (for live GPS tracking that the customer sees). Riders are not required to grant location access — they can type in addresses manually.

NO IN-APP PURCHASES:
This app does NOT use Apple In-App Purchase. We charge for physical chauffeur service (a real-world good and service), which Apple guidelines (3.1.5) permit using third-party payment processors. Payments are processed by Stripe.

Thank you for reviewing.
```

---

## Build Selection

When the page asks "Select a build before you submit your app":
- Wait for the iOS build I just kicked off to complete (~20-25 min).
- It will appear in TestFlight first, then in the App Store Connect build picker after Apple finishes processing (another ~10 min after TestFlight shows it).
- Then you pick that specific build (look at the build number, should be the highest one).

---

## Screenshots (the time-consuming part)

You'll need to take these on your iPhone. Apple requires:

### iPhone 6.7" / 6.9" Display (REQUIRED — iPhone 14 Pro Max / 15 Pro Max / 16 Pro Max)
- Resolution: **1320 x 2868** pixels
- Minimum 3, maximum 10

If you have an iPhone 15/16 Pro Max → take screenshots directly. Otherwise, I can help you generate from any iPhone screenshot using a free tool.

### Suggested 5-Screenshot Lineup

| # | Screen to capture | Caption to add in App Store Connect |
|---|---|---|
| 1 | Home tab — hero with "Arrive in unspoken luxury" + WELCOME20 banner visible | "Premium chauffeurs at your fingertips." |
| 2 | Booking screen — addresses entered, date set, vehicle picker showing Sedan/SUV/Limo with prices | "Live quotes. No surge. No surprises." |
| 3 | Live tracking screen — driver pin on map, pickup pin, drop-off pin, "5 min" ETA visible | "Watch your chauffeur arrive — in real time." |
| 4 | Stripe Checkout with Apple Pay button on top | "One-tap Apple Pay. Bank-grade security." |
| 5 | Trips tab with at least 2 booking cards | "Your rides, organized." |

### How to take screenshots
1. Open the TuranEliteLimo app on your iPhone Pro Max.
2. Navigate to each screen.
3. Press **Side button + Volume Up** simultaneously → flash → screenshot saved to Photos.
4. Open Photos → select all 5 → Share → AirDrop to your Mac → upload to App Store Connect.

---

## Age Rating Questionnaire (click through quickly)

Answer ALL with **None** / **No** / **None**:
- Cartoon or Fantasy Violence: None
- Realistic Violence: None
- Sexual Content or Nudity: None
- Profanity or Crude Humor: None
- Alcohol, Tobacco, or Drug Use: **Infrequent/Mild** (because Wine Tours appears in description)
- Mature/Suggestive Themes: None
- Horror/Fear Themes: None
- Medical/Treatment Info: None
- Gambling: None
- Contests: None
- Unrestricted Web Access: NO
- Gambling and Contests: None

Final rating shown: **4+**

---

## Export Compliance

When Apple asks "Does your app use encryption?":
- Answer: **YES** (your app uses HTTPS).
- Then click "**Yes, but it's exempt**" because you only use standard system encryption (HTTPS/TLS via Apple's built-in URLSession). No custom crypto.
- Tick the exemption checkbox.

---

## Final Checklist Before Hitting Submit

- [ ] All metadata fields filled
- [ ] Privacy declarations completed
- [ ] Age rating questionnaire done
- [ ] Export compliance confirmed
- [ ] Demo account credentials in reviewer notes
- [ ] Build selected (the new one finishing in 20-25 min)
- [ ] 5 screenshots uploaded
- [ ] Description, keywords, support URL, marketing URL all set

Then tap **"Add for Review"** → **"Submit"** at the top right.

Status will go: **Waiting for Review (1-3 days)** → **In Review (12-48 hours)** → **Ready for Sale**.

---

## Common Rejection Reasons & Pre-emptive Mitigations

| Risk | Mitigation already in place |
|---|---|
| "We can't sign in" | Demo credentials in notes; manually verified working |
| "Sign in with Apple required" | Per Apple's Guidelines 4.8, only required if app uses other social logins. We use email/password only → exempt |
| "App seems incomplete" | All flows work end-to-end |
| "Uses webview wrapper" | We use native React Native + native maps + native push — no webview shell |
| "Payment must use IAP" | Per Guidelines 3.1.5, chauffeur service is a real-world good. We use Stripe, which Apple permits for this category |
| "Missing privacy policy" | URL provided |
| "Permissions not justified" | Location is only requested when a trip is active. Notification permission requested on launch with a clear purpose |

---

## After Approval

You can either:
- **Manual release**: Apple holds the app and you press "Release this version" when ready (good if coordinating PR/marketing).
- **Automatic release**: Goes live immediately on approval.

For your first release, I recommend **manual** so you can test once more on the live build before the public sees it.
