# CAI Next Actions — June 18, 2026 Handoff

Priority order. Tackle top-down. Each item has a clear DONE definition.

---

## 🔥 P0 — DO TODAY (in order)

### 1. Google Ads — Fix the policy-limited ad (~3 min)
- Google Ads → **Ads & assets → Ads**
- Filter by Status = **"Limited"** (yellow warning icon)
- Click the warning → see exact reason
- **Most likely fixes:**
  - Trademark in headline ("Mercedes Sprinter" → "Luxury Sprinter Van")
  - All-caps ("BOOK NOW" → "Book Now")
  - Phone number in headline → move to call extension
  - "Best" / "#1" / "Cheapest" superlatives → soften ("Top-Rated")
- **DONE when:** Ad shows "Eligible" or "Approved" status.

### 2. Google Ads — Cut desktop bid (~1 min)
- Campaign → **Settings → Devices**
- Desktop row → bid adjustment → set to **−50%**
- (Aggressive — desktop has 0 conversions on $104, hard signal it's wasting budget)
- **DONE when:** Saved. Re-evaluate in 14 days.

### 3. Google Ads — Revive Airport ad group (~10 min)
Current state: 1 click / $6.59 = keywords too narrow or bids too low. Airport is core revenue, not optional.
- Campaign → drill into **Airport ad group → Keywords**
- For every keyword:
  - Confirm match type = **Phrase**, not Exact (Exact too narrow for airport intent)
  - Check "First-page bid estimate" column → raise your bid to within $0.50 of estimate
- Add these phrase-match keywords if missing:
  - `"sfo to napa transfer"`, `"sfo to sonoma car"`, `"airport black car bay area"`, `"sjc limo service"`, `"oakland airport sedan"`, `"private sfo pickup"`
- **DONE when:** at least 6 phrase-match keywords active with bids ≥ first-page estimate.

### 4. A2P 10DLC — Register under new LLC EIN (~15 min UI work, then 3-7 day wait)
**Critical**: gates ALL future Twilio SMS features (missed-call auto-text, payment recovery for new bookings via sidecar, chat escalation alerts).
- Twilio Console → **Messaging → Regulatory Compliance → A2P 10DLC**
- **+ New Brand:**
  - Legal name: **Turan Elite Limo LLC**
  - EIN: (the new LLC EIN obtained June 17)
  - Address: 707 Niantic Ave, Daly City, CA 94014
  - Website: `https://turanelitelimo.com`
  - Vertical: **Transportation**
  - Stock symbol: N/A
- Pay **$4 brand fee** → wait 1-2 business days for approval
- After brand approves → **+ New Campaign:**
  - Use case: **"Customer Care"**
  - Sample message 1: *"Your TuranEliteLimo booking #TEL-1234 is confirmed for tomorrow 7am at SFO. Driver Mike will contact you 15 min before pickup."*
  - Sample message 2: *"Hi Sarah — Turan Elite Limo. We saw you started a booking. Finish in 30 sec: https://turanelitelimo.com/manage/abc123"*
  - Sample message 3: *"Sorry we missed your call! Get an instant quote at https://turanelitelimo.com/booking or reply here."*
- Pay **$10/mo campaign fee** → wait 3-7 days for approval
- **DONE when:** brand + campaign both show Status = Approved.

---

## 🟢 P1 — DO TOMORROW (June 18 daylight hours)

### 5. Google Business Profile — Film verification video (~10 min)
Single continuous take, under 2 min, daylight, no editing.
Script (state out loud at each step):
1. Driver's license + business card held together → "I'm Abdulkhafiz Fayzullaev, owner of Turan Elite Limo LLC"
2. Phone showing bizfileonline.sos.ca.gov My Records → "Entity B20260284643, Active status"
3. Vehicle exterior with TCP plate visible → state TCP number out loud
4. Vehicle registration showing business name
5. Phone showing turanelitelimo.com loaded
6. Laptop showing business.google.com dashboard for the profile
- Upload via GBP dashboard → wait 2-5 days for approval
- **DONE when:** GBP shows "Verified" badge.

### 6. Apple Business Connect — Retry Method 2 with LLC EIN (~5 min)
- Wait 24-48 hours from when LLC EIN was obtained (so IRS data syncs to Apple)
- Apple Business Connect → Verify Turan Elite Limo → Method 2 → enter new EIN
- If accepted → click **Send for Review**
- If still rejected → **apply for D-U-N-S Number** at `https://www.dnb.com/duns/get-a-duns-number.html` (free, 5-10 days), then come back and use D-U-N-S as Method 2 instead
- **DONE when:** "Send for Review" button clicked, or D-U-N-S application submitted.

### 7. Buy Twilio sidecar number (~3 min)
So the carrier prereq is done by the time A2P 10DLC approves.
- Twilio Console → **Phone Numbers → Buy a Number**
- Search **650 area code** (closest to Petaluma/SF for local feel)
- Pick one with both **Voice + SMS** capabilities (~$1.15/mo)
- Save the number — Imran needs it for Verizon *71 setup later
- **DONE when:** Number purchased and visible in Twilio Active Numbers.

---

## 🟡 P2 — THIS WEEK (after P0/P1 are done)

### 8. Google Ads — Add sitelinks + callouts (~15 min) — quick CTR win
- Google Ads → Ads & assets → Assets → **+ Sitelink**
- Add 5 sitelinks at account level:
  - "Airport Transfers" → `https://turanelitelimo.com/airport`
  - "Wine Tours" → `https://turanelitelimo.com/wine-tour`
  - "Weddings" → `https://turanelitelimo.com/wedding`
  - "Corporate Service" → `https://turanelitelimo.com/corporate`
  - "Get Instant Quote" → `https://turanelitelimo.com/booking`
- Then **+ Callout** assets (account-level, 25 char max each):
  - "Flat-Rate Pricing", "24/7 Dispatch", "Flight Tracking Included", "Meet & Greet Service", "5★ Bay Area Chauffeurs", "Free Cancel 48h", "Late-Night Service", "Family-Owned"

### 9. Google Ads — Compete with mgllimo.com strategy
They outrank Imran 98.41% of the time — that's not bid difference alone, that's quality score. Two levers:
- **Improve ad copy** — they win on relevance. Re-write the 3 ad groups (Airport / Wine Country / Corporate) with headlines matching exact query intent. Use Google's "ad strength" indicator — push all ads to "Good" or "Excellent."
- **Improve landing pages** — confirm /airport, /wine-tour, /corporate load fast (PageSpeed Insights), have phone number prominent above the fold, and clear "Get Instant Quote" CTA.

### 10. Google Ads — Boost Corporate ad group bids
Corporate has 15.63% CTR (very high intent, lower volume). Means qualified buyers click but you're not capturing all the impressions.
- Raise corporate keyword bids 30-50% to capture more impression share
- Add corporate sitelink + callouts (above)

### 11. DO NOT — switch bidding strategy yet
Only 4 conversions in 30 days. Maximize Conversions / Target CPA needs 15-30 conversion data points minimum. **Stay on Manual CPC until July.** Revisit when conversions hit 20+.

### 12. Branding sweep: replace "AIA Transportation" → "Turan Elite Limo LLC"
Now that LLC is the real legal entity:
- Footer
- Booking confirmation emails
- Stripe descriptor (Stripe Dashboard → Settings → Public details → Statement descriptor)
- Invoices
- About page legal name
**Ping the agent ("Imran's coding partner") to do the codebase sweep in ~15 min.**

---

## 🔵 P3 — WAITING ON (no action this week)

| Item | Status | ETA |
|---|---|---|
| LLC Certificate of Status (mailed) | Requested | 5-7 business days |
| IRS EIN Confirmation CP 575 | Processing | 4-6 weeks |
| A2P 10DLC brand approval | After Action 4 | 1-2 days post-submit |
| A2P 10DLC campaign approval | After brand | 3-7 days post-submit |
| GBP verification | After video | 2-5 days post-submit |
| Apple Business Connect approval | After Method 2 unblocked | 2-5 days post-submit |
| Google Ads 4th of July promo | Pending | 1-2 hrs (likely already approved by now) |
| Twilio sidecar features going live | After A2P approval | ~2 weeks total |

---

## 📋 Quick checklist to track your progress

```
TODAY (P0):
[ ] 1. Fix policy-limited ad
[ ] 2. Desktop bid −50%
[ ] 3. Revive Airport ad group (6+ phrase-match keywords, bids at estimate)
[ ] 4. A2P 10DLC brand registration + $4 paid

TOMORROW (P1):
[ ] 5. GBP video verification filmed + uploaded
[ ] 6. Apple Business Connect Method 2 retry
[ ] 7. Twilio 650 number purchased

THIS WEEK (P2):
[ ] 8. Sitelinks + callouts added
[ ] 9. Ad copy + landing pages reviewed for quality score
[ ] 10. Corporate ad group bids raised
[ ] 11. Stay on Manual CPC (do not switch)
[ ] 12. Ask agent for "AIA Transportation → Turan Elite Limo LLC" sweep
```

---

## 🚨 If anything blocks you

- Apple Business Connect EIN rejected again → apply for D-U-N-S immediately
- A2P 10DLC brand rejected → forward the rejection reason to Imran's agent (it's usually a wording fix in the sample messages)
- GBP verification rejected → DO NOT delete and recreate again. File the appeal at `https://support.google.com/business/contact/profile_appeal` with all LLC docs attached
- Google Ads policy limit reason unclear → forward screenshot to Imran's agent
