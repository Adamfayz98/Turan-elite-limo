# Mobile v1.1.1 Production Push — Runbook

> Updated: Jun 20, 2026 — by E1 agent for Adel
> All code prep is DONE. This file is your copy-paste guide.

---

## ✅ What's already prepared (no action from you)

- `app.json` bumped to **v1.1.1**
  - iOS `buildNumber`: `1` → `2`
  - Android `versionCode`: `2` → `3`
- `eas.json` Android submit track flipped: `alpha` → `production`
- White-shadow fleet list fix, admin dashboard improvements, all JS bug fixes already merged

---

## 🚀 Recommended sequence (cheapest → safest first)

Run these from your local machine (not from this preview env). All commands assume you're logged into Expo CLI (`eas login` once).

### Step 1 — Ship JS-only fixes to existing users via OTA (FREE, ~3 minutes)

This pushes the white-shadow fix + any other JS changes to **every existing iOS & Android user** without a store re-submission. No native rebuild required.

```bash
cd /app/mobile
eas update --branch production --message "v1.1.1 OTA: fleet list shadow fix + admin improvements"
```

That's it. Within 10-30 minutes, every user who opens the app sees the update applied automatically.

> ⚠️ If `eas update` errors with `runtime version mismatch`, it means a native change snuck into the build. In that case, skip to Step 2 (full native rebuild).

---

### Step 2 — Android production build & submit (~$1, ~12 minutes)

Now graduate Android from Closed Testing to **Play Store production**.

```bash
cd /app/mobile
eas build --platform android --profile production --non-interactive
# When complete, Expo gives you a build URL. Once it shows "finished":
eas submit --platform android --latest --profile production
```

Play Store will accept the .aab and start the production rollout. Typical Play Console review = 1-3 days.

**Release notes for Play Console** (paste into the "What's new" field):
```
v1.1.1 — Performance, polish, and reliability
• Fixed dark-mode shadow on fleet list
• Faster admin booking flows
• Live route map on the booking form
• Improved chauffeur dispatch alerts
• Many smaller bug fixes and improvements
```

---

### Step 3 — iOS production build & submit (~$1, ~15 minutes)

⚠️ **iOS pod-install previously failed on builds.** Try this with `--clear-cache`:

```bash
cd /app/mobile
eas build --platform ios --profile production --non-interactive --clear-cache
```

**If pod-install fails again:** SKIP. The OTA update from Step 1 already shipped the visible fix to existing iOS users. A new native iOS build can wait until you add a feature that actually needs native code (e.g., new push-notification customization, Apple Pay sheets).

**If pod-install succeeds:**
```bash
eas submit --platform ios --latest --profile production
```

App Store review = 1-3 days, slightly faster than Play.

---

## 🛡 Safety checks before you run

1. Confirm you're on the right Expo account: `eas whoami` should show `adamfayz98`.
2. Confirm the EAS project ID hasn't changed: should be `f7293fd3-fd4a-4b43-815c-07c410b601e9`.
3. App Store Connect API key is in `./AuthKey_S6ZN2K2TN4.p8` — already wired in `eas.json`.
4. Play Console service account is in `./play-service-account.json` — already wired.

---

## 🆘 If something breaks

- **Android build fails on resources:** Likely an icon/splash asset issue. Check `/app/mobile/assets/` exists. Worst case, revert versionCode in `app.json` to 2 and try again with the previous build cache.
- **iOS pod-install fails (the recurring issue):** Try removing the `@react-native-google-signin/google-signin` plugin temporarily from `app.json` and rebuild. If that succeeds, the plugin needs an Expo SDK update.
- **`eas update` says "no compatible runtime":** Means a native dependency changed between v1.1.0 and v1.1.1. In that case you can't OTA — must do a full native rebuild via Step 2/3.

---

## 📋 After the rollout

Once you confirm Play Store and App Store production listings show v1.1.1:

1. Update `/app/memory/PRD.md` mobile section to reflect the new live versions
2. Bump `eas.json` `runtimeVersion.policy` consideration if you keep adding JS-only updates (already set to `appVersion` so OTA works per-version automatically)
3. **Most important:** Watch crash analytics in App Store Connect + Play Console for 48 hours after rollout. If crash rate spikes, halt the staged rollout in Play Console / pull the iOS submission.
