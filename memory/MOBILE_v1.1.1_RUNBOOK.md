# Mobile v1.1.1 Production Push — Status Report

> Updated: Jun 20, 2026 — by E1 agent for Adel
> Replaces the earlier runbook. **All builds + submissions were executed directly by the agent.**

---

## ✅ What was SHIPPED (no action needed from you)

### 1. OTA Update — Published (FREE)
- **Update group:** `dddc4568-8159-4837-a7ad-ba4eccbcde20`
- **Branch:** `production`
- **Platforms:** iOS + Android
- **Runtime version:** `1.1.1`
- **Dashboard:** https://expo.dev/accounts/adamfayz98/projects/turanelitelimo/updates/dddc4568-8159-4837-a7ad-ba4eccbcde20

⚠️ **Important:** Because `runtimeVersion.policy = appVersion`, this OTA only reaches users running native v1.1.1+. Existing v1.1.0 users won't receive it until they install a v1.1.1 build from the store. The OTA is "pre-loaded" — as soon as Android v1.1.1 lands on devices, the OTA fires immediately.

### 2. Android v1.1.1 — Submitted to Google Play (Internal Testing track)
- **Build ID:** `215f96f6-6522-4e9e-b84e-cf99ac25e6b6`
- **Submission ID:** `d54e3341-4429-4743-8e8a-e28fcc09c4ae`
- **Version code:** 27
- **Track:** Internal Testing (was rejected by `production` track — see below)

### 3. iOS v1.1.1 — Build ERRORED (deferred)
- **Build ID:** `77e4e634-70d8-498b-861d-78ff402f111a`
- **Error:** Same recurring pod-install issue. Log content is encrypted/binary-corrupted; can't extract specific failure.
- **Impact:** Existing iOS users still on v1.1.0. **Not blocking** — the OTA above is loaded for when iOS v1.1.1 ships.

---

## 🚨 ACTION REQUIRED FROM YOU (Play Console UI — ~5 minutes)

The Play Store **rejected the direct production track submission** with "Precondition check failed". This means your production track in Play Console isn't fully configured (missing pricing, country availability, release notes, or content rating for production). To get v1.1.1 LIVE for all Android users:

### Option A — Promote from Internal Testing to Production (recommended)
1. Open https://play.google.com/console
2. Select **TuranEliteLimo** app
3. Left sidebar → **Testing → Internal testing**
4. The new v1.1.1 release (version code 27) should be sitting there with status "Available to testers"
5. Click **Promote release → Production**
6. Fill in any missing prerequisites Play asks for (content rating, target audience, etc.)
7. Submit for review — usually approved in 1-3 days

### Option B — Promote directly without internal testing
1. Open Play Console → **Testing → Closed testing → [closed test track]** (where you were before)
2. Promote that release to **Production** (skips needing v1.1.1 in closed testing first)

After Production is configured once, future agent-driven submissions can hit `track: production` directly. I'll update `eas.json` once you confirm.

---

## 🔧 iOS — Two paths forward

### Path 1: Manual iOS build from your phone (Expo Orbit / EAS Build cloud)
Open Expo's mobile-friendly EAS console at https://expo.dev/accounts/adamfayz98/projects/turanelitelimo/builds and tap **Rebuild this build**. Sometimes a fresh attempt clears the pod cache. You can do this from your phone — no laptop required.

### Path 2: Debug the pod-install error
Next session, I can:
- Pull the build worker logs via the EAS GraphQL API (not the encrypted file)
- Identify which pod is failing (likely `@react-native-google-signin/google-signin` or `expo-apple-authentication`)
- Pin/swap versions to fix it

You don't have to babysit this — say the word next session and I'll dig in.

---

## 📊 Summary

| What | Status | Where |
|---|---|---|
| OTA update | ✅ Published | EAS, runtime 1.1.1 |
| Android prod build | ✅ Finished | EAS Cloud |
| Android Play Store submit | ✅ Live in Internal Testing | Play Console |
| Android Production track | ⏳ Needs manual promote in Play Console | YOU, 5 min |
| iOS prod build | ❌ Errored | Pod-install issue, recurring |
| iOS App Store submit | ⏳ Blocked on iOS build | Defer |

**Net result:** Android users get v1.1.1 within 1-3 days of you promoting in Play Console. iOS users stay on v1.1.0 until next session's iOS build fix.
