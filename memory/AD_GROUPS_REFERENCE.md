# Ad Groups Reference — Turan Elite Limo · Google Ads Account
**Living document.** Update this whenever an ad group is added, paused, renamed, or restructured.
**Owner:** Adam (Abdulkhafiz Fayzullaev)
**Last updated:** July 3, 2026

---

## Purpose of this document

The Google Ads account has grown to multiple campaigns and 10+ ad groups. When CAI (or any future ad manager) audits the account, they need to understand **why each ad group exists** — otherwise well-meaning "cleanup" audits accidentally pause deliberate structural choices.

If you're a fresh set of eyes on this account, **read this doc before pausing or consolidating any ad group**.

---

## Campaign 1: `Search — Luxury Chauffeur`

Original 6-ad-group structure, plus 2 deliberately added later. Total: **8 ad groups**.

### 1.1 Airport
**Purpose:** Capture general airport-transfer searches from leisure travelers, families, and one-off business travelers.
**Target keywords (representative):** "airport limo sfo", "sfo car service", "san jose airport limo", "oakland airport transfer"
**Landing page:** `/airport`
**Do NOT consolidate with:** `Luxury Executive — Airport` (different customer segment — see §1.7)

### 1.2 Corporate
**Purpose:** Capture searches from corporate customers looking for hourly / roadshow chauffeur service.
**Target keywords:** "corporate chauffeur bay area", "executive transportation san francisco", "corporate roadshow chauffeur"
**Landing page:** `/corporate`

### 1.3 Wine Tour
**Purpose:** Napa/Sonoma wine tour searches.
**Target keywords:** "napa wine tour limo", "sonoma wine tour transportation", "private wine tour sf"
**Landing page:** `/wine-tour`

### 1.4 Wedding
**Purpose:** Wedding transportation searches.
**Target keywords:** "wedding limo bay area", "wedding guest shuttle sf", "wedding car service napa"
**Landing page:** `/wedding`

### 1.5 Brand & General
**Purpose:** Brand searches ("turan elite limo") + generic limo searches ("limo service san francisco", "black car san francisco").
**Target keywords:** "turan elite limo", "turanelitelimo", "limo service sf", "black car san francisco", "chauffeur service bay area"
**Landing page:** homepage (`/`)
**Do NOT consolidate with:** `Luxury Executive — General` (§1.8 — different intent/audience)

### 1.6 Party Bus
**Purpose:** Party bus searches — bachelor/ette, birthday, prom, celebration.
**Target keywords:** "party bus san francisco", "party bus rental bay area", "bachelorette party bus"
**Landing page:** `/party-bus`
**Performance note:** This is the account's top-converting ad group. Google's Smart Bidding tends to over-allocate budget here, which is why we created §1.7 and §1.8.

---

### 1.7 Luxury Executive — Airport
**Purpose:** Target the **executive/corporate airport-transfer** segment separately from general airport searches (§1.1).

**Why this ad group exists (background):**
When we audited why Sedan/SUV/First Class weren't generating bookings while Party Bus was thriving, the root cause was **Google's Smart Bidding starving the corporate/executive keywords** — Party Bus converts at 6-10%, corporate airport transfers convert at 1-2%, so Google's algorithm silently reallocated budget to Party Bus. To protect corporate/executive traffic, we carved them into their own ad groups so they'd have their own conversion signal and their own budget lane.

**Target audience:**
- Business travelers booking their own rides
- Executive assistants booking on behalf of executives
- Corporate travel managers setting up recurring vendor relationships
- These customers **wouldn't search for "airport limo"** — they search for "executive car service", "corporate black car", "premium chauffeur"

**Target keywords (do NOT overlap with §1.1):**
- "executive airport service bay area"
- "corporate airport chauffeur sfo"
- "premium airport transfer san francisco"
- "executive car service to sfo"
- "corporate black car sfo"
- "silicon valley executive airport service"

**Landing page:** Whatever landing page CAI has this pointing to — verify. Ideally should route to a corporate/executive-positioning landing page OR to `/airport` with pre-loaded corporate messaging via UTM.

**How to distinguish from §1.1 (Airport):**
| Airport (§1.1) | Luxury Executive — Airport (§1.7) |
|---|---|
| Generic keywords: "airport limo", "sfo car" | Segment-specific: "executive car", "corporate chauffeur" |
| Leisure travelers, families, tourists | Business travelers, corporate accounts |
| Price-sensitive (compete with Uber Black) | Value-sensitive (compete with Blacklane, Carey) |
| Convert at 1-2% | Higher AOV, potentially higher CVR when properly segmented |

**Do NOT:**
- Merge §1.7 into §1.1 — you'll re-create the budget-starving problem
- Add generic keywords like "airport limo" to §1.7 — that belongs in §1.1
- Pause without verifying it's actually cannibalizing (send owner keyword-overlap report first)

---

### 1.8 Luxury Executive — General
**Purpose:** Target the **executive/premium** segment for non-airport hourly, corporate roadshow, and general premium chauffeur searches.

**Why this ad group exists (background):**
Same rationale as §1.7 — protect corporate/executive keywords from being starved by Party Bus conversion signal. Complementary to §1.7 but broader (not airport-specific).

**Target audience:**
- Same as §1.7 but for non-airport contexts
- Corporate managers booking multi-hour chauffeur service
- Executives needing a full-day driver
- High-net-worth individuals booking premium chauffeur service

**Target keywords (do NOT overlap with §1.2 Corporate or §1.5 Brand & General):**
- "executive car service bay area"
- "premium chauffeur san francisco"
- "luxury car service silicon valley"
- "high-end chauffeur bay area"
- "executive transportation san jose"
- "premium black car service sf"

**Landing page:** Verify with CAI — should route to a corporate/executive-positioning page.

**How to distinguish from §1.2 (Corporate) and §1.5 (Brand & General):**
| Corporate (§1.2) | Brand & General (§1.5) | Luxury Executive — General (§1.8) |
|---|---|---|
| "corporate chauffeur", "roadshow chauffeur" | "turan elite limo", "limo service sf" | "executive car service", "premium chauffeur" |
| Explicit corporate wording | Brand + generic limo | Premium/executive positioning |
| Mid-to-high AOV | Mixed AOV | High AOV |

**Do NOT:**
- Merge §1.8 into §1.2 — you'll dilute the executive positioning
- Merge §1.8 into §1.5 — you'll re-create the budget starvation
- Assume it's a duplicate ad group — the intent is deliberately different

---

## Campaign 2: `TEL - Group Charter & Casino (Search)`

Created Feb 2026 for large-group and casino transportation verticals. **3 ad groups total.**

### 2.1 Motor Coach - 40-56 pax
**Purpose:** Full-size touring coach searches.
**Target keywords:** "motor coach rental bay area", "charter bus san francisco", "56 passenger charter bus"
**Landing page:** `/motor-coach-rental`
**Broker margin:** Thin (~15-25%). Do NOT apply the 30% first-ride promo — will eat entire margin.

### 2.2 Mini Coach - 24-35 pax
**Purpose:** Mid-size charter bus searches.
**Target keywords:** "mini coach rental bay area", "24 passenger bus rental", "wedding shuttle bay area"
**Landing page:** `/mini-coach-rental`
**Broker margin:** Thin. Do NOT apply the 30% first-ride promo.

### 2.3 Casino Charter - Bay Area to Graton, Reno, Tahoe
**Purpose:** Flat-rate casino transportation.
**Target keywords:** "casino bus bay area", "graton shuttle", "reno bus trip san francisco", "tahoe casino transportation"
**Landing page:** `/casino-transportation`
**Broker margin:** Medium. Do NOT apply the 30% first-ride promo. Extra care needed — Google Ads has strict gambling policies; only run pre-approved policy-compliant copy.

---

## Global rules

1. **Promotion asset (30% first-ride, ends Sept 30, 2026)** applies at campaign level to: `Search — Luxury Chauffeur` ONLY. Do NOT apply to `TEL - Group Charter & Casino` — broker margins can't absorb 30% off.

2. **Location targeting** (all campaigns): SF-Oakland-San Jose Metro, Sacramento-Stockton-Modesto Metro, Monterey-Salinas Metro. Location targeting mode = "Presence" (NOT "Presence or Interest").

3. **Match types** (all ad groups): Exact + Phrase only. NO broad match unless approved by owner.

4. **AI Max**: OFF at campaign level and OFF at all ad group levels. Verify at each audit.

5. **Auto-suggestions from Google Ads "Optimizations" tab**: DO NOT accept without owner approval. Google's suggestions frequently create duplicate ad groups that cannibalize existing ones (this is how "Luxury Executive" ad groups could have been mistakenly attributed to auto-generation during CAI's initial audit — they are NOT auto-generated, they were deliberately created).

---

## Change log

| Date | Change | Reason |
|---|---|---|
| July 2, 2026 | Created Campaign 2 (`TEL - Group Charter & Casino (Search)`) with 3 new ad groups | Added Motor Coach, Mini Coach, and Casino Charter as new service verticals |
| Prior (session before July 2) | Added §1.7 `Luxury Executive — Airport` and §1.8 `Luxury Executive — General` to Campaign 1 | Owner reported no sedan/SUV bookings coming in. Root cause: Party Bus conversion signal was starving corporate/executive keywords via Smart Bidding. Solution: dedicated ad groups for executive/corporate segment. |
| Original account setup | Campaign 1 (`Search — Luxury Chauffeur`) built with §1.1-§1.6 | Base 6 ad groups covering the main service verticals |

---

## For anyone auditing this account

If you see something that looks like "duplicate ad group" or "possible keyword cannibalization" — **check this doc first**. If the ad group is documented above with a clear purpose, the "duplication" is deliberate. If it's NOT documented, ask the owner before pausing.
