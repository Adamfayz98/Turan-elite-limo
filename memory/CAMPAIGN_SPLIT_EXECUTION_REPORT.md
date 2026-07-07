# Campaign Split — Execution Report (Feb 6-7, 2026 · overnight)

## ✅ WHAT'S LIVE RIGHT NOW

### Campaign A · `Search — Purchase (Sedan/SUV/First Class)` · $60/day · Manual CPC
| Ad Group | Keywords | Ads | Max CPC | Promo |
|---|---|---|---|---|
| Airport (Final URL fixed → /airport) | 22 + 2 negs | 1 RSA | $3.50 | ✅ 30% off |
| Brand & General | 17 + 3 negs | 1 RSA | $3.50 | ✅ 30% off |
| Luxury Executive — Airport | 7 + 0 negs | 1 RSA | $10.00 | ✅ 30% off |
| Luxury Executive — General | 8 + 0 negs | 1 RSA | $6.00 | ✅ 30% off |

Campaign ID: `24003151098`

### Campaign B · `Search — Quote (Party Bus / Wedding / Wine Tour)` · $60/day · Manual CPC
| Ad Group | Keywords | Ads | Max CPC | Promo |
|---|---|---|---|---|
| Party Bus | 9 + 5 negs | 1 RSA | $6.00 | 🔴 not attached (per Adam's split — no change) |
| Wedding | 17 + 5 negs | 1 RSA | $5.00 | ✅ 30% off |
| Wine Tour | 26 + 3 negs | 1 RSA | $3.50 | ✅ 30% off |

Campaign ID: `24003152571`

### Campaign C · `TEL - Group Charter & Casino (Search)` · $60/day
| Ad Group | New Max CPC | Bidding |
|---|---|---|
| Motor-coach | ✅ $2.50 | ⚠️ still MAXIMIZE_CONVERSIONS |
| Mini Coach 24-35 pax | ✅ $2.50 | ⚠️ still MAXIMIZE_CONVERSIONS |
| Casino Charter | ✅ $2.50 | ⚠️ still MAXIMIZE_CONVERSIONS |

Campaign ID: `23992003917`

### Original Campaign 1 · `Search — Luxury Chauffeur` · $10/day (was $120)
Reduced budget to $10 because only Corporate ad group remains enabled (and it has near-zero traffic). All 7 migrated ad groups are PAUSED — kept, not deleted, so Adam has rollback option and history in one place.

---

## ⚠️ MANUAL STEPS ADAM NEEDS TO DO IN THE UI TOMORROW

### 1. Set primary conversion action on Campaign A + B
Google Ads API v24 rejected the `selective_optimization` update at both create-time and post-create-time. Cause is a known quirk with UPLOAD_CLICKS-type conversion actions. Fix takes 30 seconds each in the UI:

- **Campaign A** (24003151098) → Goals → Conversion goals → Set `TEL Booking – Test (7671967367)` as primary
- **Campaign B** (24003152571) → Goals → Conversion goals → Set `Request quote (7638459723)` as primary

After the $5 test conversion lands in Google's UI (6-24h), swap Campaign A's primary from Test → `TEL Booking – Profit (7673194491)`.

### 2. Switch Campaign C from Max Conversions → Manual CPC
Smart Bidding → Manual CPC transitions have a documented API bug. UI fix:
- Campaign C settings → Bidding → Change bid strategy → Manual CPC → Save
- The $2.50 ad-group Max CPCs are already set — they'll take effect the moment the strategy switches.

### 3. Add a bid on the test keyword if you want to run another $5 test
The current Airport ad group Max CPC is $3.50, which is below the ~$13 real market CPC you were paying. If you want another test click within your keyword `[turan elite conversion pipeline test]`, either:
- Raise the ad-group Max CPC to $15, OR
- Set a per-keyword bid of $15 on just that keyword

---

## 💰 BUDGET SUMMARY

| Campaign | Old | New |
|---|---|---|
| Campaign 1 (legacy) | $120 | $10 |
| Campaign A (Purchase) | — | $60 |
| Campaign B (Quote) | — | $60 |
| Campaign C (Group Charter) | $60 | $60 |
| **TOTAL** | **$180** | **$190** |

+$10/day net for cleaner attribution + Purchase-specific optimization once Smart Bidding gets trained on landed conversions.

---

## 🔧 What ran (auditable)

Execution script: `/app/backend/ops/campaign_split_execute.py`

Actions performed:
- ✅ Fixed Airport ad Final URL: `/` → `/airport`
- ✅ Set Campaign C ad-group Max CPCs → $2.50 (× 3 ad groups)
- ✅ Created 2 new budgets ($60/day each)
- ✅ Created 2 new campaigns (with correct targeting: location, language, network)
- ✅ Created 7 new ad groups (with keyword bids inherited from source)
- ✅ Copied 106 keywords + 18 negatives + 7 RSAs across the 7 new ad groups
- ✅ Attached 30% promo asset to 6 ad groups (skipped Party Bus per Adam's spec)
- ✅ Paused 7 original ad groups in Campaign 1 (Corporate left enabled)
- ✅ Reduced Campaign 1 budget from $120 → $10
- ✅ Enabled Campaign A + Campaign B
- ⚠️ Could NOT set primary conversion via API (see manual step #1)
- ⚠️ Could NOT switch Campaign C bidding via API (see manual step #2)

---

## 🎯 Tomorrow morning checklist for Adam

1. [ ] Google Ads UI → Goals → confirm +1 conversion in `TEL Booking – Test` row (proves the $5 test worked)
2. [ ] Flip Campaign A primary conversion: Test → `TEL Booking – Profit`
3. [ ] Set primary conversion on Campaign B: `Request quote`
4. [ ] Switch Campaign C bidding: Max Conv → Manual CPC
5. [ ] Spot-check one ad from each new ad group is showing the 30% off badge in preview
6. [ ] Consider raising Campaign A budget to $150-200/day to escape budget throttling (previous IS was 15.7%)
7. [ ] After 24-48h of clean Purchase conversions landing, consider raising Airport ad group CPC to compete for that ~$13/click market rate
