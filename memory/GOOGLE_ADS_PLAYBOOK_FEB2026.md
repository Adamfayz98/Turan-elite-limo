# Google Ads — Step-by-Step Fix Playbook (Feb 2026)

> Print this or keep it open while you work. Do steps 1-5 tonight (stop the bleed). Steps 6-10 over the week. Total time: 60-90 min.

---

## ⛔ STEP 1 — Cap the budget (2 min)
1. Google Ads → **Campaigns** (left rail)
2. Click your Search campaign name
3. **Settings** tab → **Budget** → pencil icon
4. Change to **$15/day** → Save
> Caps damage while we fix structure. Raise it back in week 2.

---

## ⛔ STEP 2 — Switch Broad → Phrase match (10 min)
1. Campaign → **Keywords** tab
2. Sort by **Match type** column
3. For every "Broad match" row: check box → **Edit → Change match types → Phrase match** → Save
> Phrase match `"sfo limo service"` only triggers when those words appear together. Cuts wasted spend 40-60%.

---

## ⛔ STEP 3 — Fix conflicting negatives (10 min)
1. **Tools** (wrench icon) → **Negative keyword lists**
2. **REMOVE** if present: `limo`, `luxury`, `airport`, `chauffeur`, `black car`, `sprinter`, `executive`, `sedan`
3. **KEEP**: `cheap`, `free`, `rental`, `for sale`, `job`, `jobs`, `hiring`, `uber`, `lyft`, `taxi`, `cab`, `prom`, `school`, `funeral`, `hearse`, `dealership`, `lease`, `used`

---

## ⛔ STEP 4 — Tighten geo-targeting (3 min)
1. Campaign → **Settings** → **Locations** → pencil
2. Set to **"People in your targeted locations"** (NOT "interested in")
3. Keep only: SF, San Mateo, Santa Clara, Alameda, Marin, Napa, Sonoma, Contra Costa counties
4. Delete everything else → Save

---

## ⛔ STEP 5 — Verify conversion tracking is alive (5 min) ⭐ MOST IMPORTANT
1. **Tools** → **Conversions**
2. Confirm these 3 show "Recording conversions" (green) AND have activity in last 7 days:
   - `quote_request_submitted`
   - `booking_completed`
   - `phone_call_clicked`
3. If any are inactive → **screenshot and send to me**. That's a code-side fix.

---

## 🔍 STEP 6 — Audit Search Terms report (15 min) — THE BIG SAVER
1. Campaign → **Insights & reports** → **Search terms**
2. Date: last 30 days. Sort by **Cost** descending.
3. For every irrelevant query (e.g., "limo for sale", "driver job", "school bus"):
   - Check box → **Add as negative keyword**
4. Expect to add 20-50 negatives. Single biggest efficiency lever.

---

## 🔍 STEP 7 — Pause dead keywords (5 min)
1. Campaign → **Keywords** → sort by **Cost** descending
2. Any keyword with > $30 spent AND 0 conversions in last 30 days:
   - Check box → **Status → Pause**
3. Don't delete — pause.

---

## 🔍 STEP 8 — Restructure into 3 Ad Groups (20 min)

### Ad Group A — Airport Transfers
Keywords (all Phrase):
- `"sfo limo service"`, `"sfo car service"`, `"sfo black car"`
- `"oakland airport limo"`, `"sjc limo service"`, `"sfo to napa transfer"`

Sample headlines:
- "SFO Black Car · Flat Rate Quoted Upfront"
- "Luxury SFO Pickup · 5★ Bay Area Chauffeurs"

### Ad Group B — Wine Country
Keywords:
- `"napa wine tour limo"`, `"sonoma wine tour transportation"`
- `"napa chauffeur service"`, `"wine country wedding transportation"`

Sample headlines:
- "Napa Wine Tour Chauffeur · All-Day Charter"
- "Private Wine Tour Limo · 6 Wineries, 1 Driver"

### Ad Group C — Events / Corporate
Keywords:
- `"chase center limo service"`, `"executive black car bay area"`
- `"corporate chauffeur san francisco"`, `"wedding limo service sf"`, `"party bus bay area"`

Sample headlines:
- "Chase Center Black Car · Group Sprinter"
- "Executive Chauffeur · Roadshows & Investor Days"

---

## 🚀 STEP 9 — Switch to Maximize Conversions (after 15+ conversions in 14 days)
1. Campaign → **Settings → Bidding**
2. Change from "Manual CPC" → **Maximize conversions** (no Target CPA cap yet)
3. Save. Let it run 14 days untouched.

---

## 🚀 STEP 10 — Switch to Target CPA (~2 weeks later)
1. Once you have 30+ conversions in 30 days:
2. Bidding → **Target CPA**
3. Set Target = avg booking value × 0.40 (e.g., $300 × 0.4 = **$120 Target CPA**)
4. Don't go lower — Google will stop spending.

---

## 📋 Ongoing habit
- **Daily (2 min):** Glance at Search terms → add 1-3 negatives
- **Weekly (5 min):** Pause new keywords with >$20 spend + 0 conv. Confirm conversions still firing.
