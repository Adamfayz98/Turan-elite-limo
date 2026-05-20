# TuranEliteLimo — Launch Checklist

This is the runway from "code complete" to "live on the App Store + Google Play."

---

## ✅ Done (code-side)

- [x] App icons (1024×1024 master + adaptive icon foreground for Android)
- [x] Splash screen (2048×2048 with logo on solid black)
- [x] `app.json` configured: bundleIdentifier `com.turanelitelimo.app`, scheme `turanelitelimo`, version `1.0.0`, build `1`
- [x] iOS Info.plist usage descriptions (location for rider tracking + driver background)
- [x] Android permissions + intent filters for universal links
- [x] EAS Build profiles (`eas.json`) — `development` / `preview` / `production`
- [x] Privacy Policy page at https://www.turanelitelimo.com/privacy
- [x] Terms of Service page at https://www.turanelitelimo.com/terms
- [x] Deep link scheme + associated domains for Apple universal links

---

## ⏳ Pending (YOU — accounts + manual steps)

### 1) Apple Developer Account ($99/yr)
- [ ] Status: **applied & under review** (you mentioned)
- After approval: log into App Store Connect and create a new app:
  - Bundle ID: `com.turanelitelimo.app`
  - Name: `TuranEliteLimo`
  - SKU: `turanelitelimo-ios` (anything unique)
  - Once created, you'll get an **App Store Connect App ID** — share it with me; I'll plug it into `eas.json` so submissions go to the right listing.

### 2) Google Play Console ($25 one-time)
- [ ] Status: **purchasing now** (you mentioned)
- After payment, create a new app:
  - Name: `TuranEliteLimo`
  - Package: `com.turanelitelimo.app`
  - Category: `Maps & Navigation` (or `Travel & Local`)

### 3) Expo / EAS Account (free)
- [ ] Create account at https://expo.dev (use the same email you'll use for the App Store)
- [ ] Share your username with me so I can set the `owner` field in `app.json`
- [ ] Once linked, run `eas init` once (I'll guide through it) — this assigns the permanent `projectId` for OTA updates

---

## 🚀 What happens next (my work, in this order)

### Phase A — TestFlight Build (~1 hr once accounts ready)
1. `eas login` → `eas init` (creates the project on Expo's servers)
2. `eas build --platform ios --profile preview` → produces an `.ipa` you can install on your iPhone via TestFlight
3. `eas build --platform android --profile preview` → produces an `.apk` you can install on Android via Internal Testing
4. You test in real-world conditions for 1-3 days. **No more Expo Go tunnel issues.**

### Phase B — Apple/Google submission (~1 hr + 1-3 day review)
1. Generate App Store screenshots (10 images, 5 per device size)
2. Write App Store listing: title, subtitle, description (3000 chars), keywords, support URL
3. Submit to TestFlight beta review first, then to the public App Store
4. Same flow for Google Play

### Phase C — Push notifications (post-launch, optional but recommended)
- Wire up ride status alerts: "Driver assigned", "Driver 5 min away", "Driver arrived", "Trip started", "Trip completed"
- Already added `expo-notifications` + `expo-device` dependencies — just need to wire the backend + permission prompts

---

## 🔄 After launch — how to ship updates

| Type of change | How to ship | Time to user |
|---|---|---|
| Backend, pricing, admin tools | Push to Emergent | Instant |
| Mobile JS bug fix / UI tweak | `eas update --branch production` | ~5 min, no review |
| Mobile new SDK / native module | New `eas build` + store re-submission | 1-3 days |

You can **always** roll back a bad OTA update in 30 seconds (`eas update --branch production --message "rollback"` with the previous JS bundle).

---

## 📋 What I still need to build before TestFlight build

- [ ] Push notification permission flow (~30 min)
- [ ] Update mechanism (`expo-updates` plugin in `app.json` for OTA pickup) — already added
- [ ] Test that production build works (no `process.env.NODE_ENV === "development"` checks blocking things)
- [ ] App Store screenshots from the mobile web preview (or from TestFlight on your phone)

---

## 🆔 Critical IDs to track

| ID | Value | Where used |
|---|---|---|
| iOS Bundle ID | `com.turanelitelimo.app` | App Store Connect, app.json, EAS |
| Android Package | `com.turanelitelimo.app` | Google Play Console, app.json |
| URL Scheme | `turanelitelimo://` | Stripe deep link, password reset |
| Associated Domains | `applinks:turanelitelimo.com` | Universal links from web → app |
| Apple Team ID | _set after dev account approval_ | EAS, certs |
| Expo Project ID | _set after `eas init`_ | OTA update channel |
| App Store App ID | _set after listing created_ | EAS submit config |

---

## ⏱️ Realistic timeline

- **Now → Day 1:** Apple Dev approves your account
- **Day 1:** You create App Store Connect listing + Google Play listing, send me the App ID
- **Day 1-2:** I run EAS builds. You install TestFlight + Android Internal Testing. Test thoroughly.
- **Day 2-3:** Fix anything found in testing (via OTA, no rebuild). Submit to Apple + Google.
- **Day 3-6:** Apple reviews (1-3 days), Google reviews (1-2 days).
- **Day 6-7:** Live on both stores. 🚀
