# Twilio Sidecar — Missed-Call Auto-SMS + Voicemail (BUILD PLAYBOOK)

> Status: DEFERRED until LLC + new EIN + A2P 10DLC approval (est. 3-4 weeks from Feb 16, 2026)
> Owner: Imran (CAI to do the manual carrier/Twilio setup; agent codes the backend wire-up)
> Goal: When a customer calls the Verizon number and Imran doesn't pick up, they get an auto-SMS with a tap-to-quote link within 5 seconds.

## ⏱ Prerequisites (DO IN ORDER)

1. **LLC approved** by CA Secretary of State (Turan Elite Limo LLC)
2. **New EIN obtained** under the LLC name (5 min at irs.gov, free, instant)
3. **A2P 10DLC** brand + campaign approved in Twilio (5-7 business days, $4 brand + $10/mo campaign)
4. **New Twilio local number** purchased (650 area code, ~$1.15/mo)
5. **Verizon `*71` conditional call forwarding** activated on Imran's iPhone, forwarding to the new Twilio number

Only proceed when all 5 are GREEN.

## 🏗 Architecture

```
                    Customer calls Verizon
                            │
                            ▼
                  ┌─────────────────────┐
                  │   Verizon iPhone    │
                  │  Rings 4 times      │
                  └─────────────────────┘
                            │
                       NOT answered
                            │
                            ▼
                  ┌─────────────────────┐
                  │  Verizon *71 FWD    │  ──>  Twilio number
                  └─────────────────────┘
                                                  │
                                                  ▼
                                        ┌────────────────────┐
                                        │  Twilio Studio Flow│
                                        └────────────────────┘
                                                  │
                          ┌───────────────────────┼───────────────────────┐
                          ▼                       ▼                       ▼
                  Play voicemail          Record voicemail        Auto-SMS caller
                    greeting (TTS)        (if they speak)         w/ booking link
                                                  │                       │
                                                  ▼                       ▼
                                        Transcribe + email      POST /api/twilio/missed-call
                                        to support@*            (log + create lead)
```

## 🔧 Backend changes needed when we ship

### New endpoint: `POST /api/twilio/missed-call`
- Twilio webhook fires when a call is forwarded + voicemail recorded
- Payload includes: From (caller phone), To (Twilio sidecar #), RecordingUrl, RecordingSid, TranscriptionText
- Action:
  1. Create row in `missed_calls` collection: `{caller_phone, recording_url, transcription, created_at, status: "new"}`
  2. Send admin SMS to ADMIN_PHONE: "🔔 Missed call from {caller}. Voicemail: '{transcription_first_120}'. Quote link auto-sent. /admin → Missed Calls tab"
  3. Auto-SMS the caller from the Twilio sidecar number (Twilio Studio handles this in the flow, no backend needed)

### New endpoint: `GET /api/admin/missed-calls`
- Lists all missed_calls for the admin "Missed Calls" tab, sorted desc by created_at
- Each row has a "Listen to voicemail" button (opens RecordingUrl in a Twilio-authenticated audio player)
- "Convert to Quote Request" button → opens the Import Lead modal pre-filled with the transcription text

### Webhook signing
- Validate every incoming webhook with Twilio's signature (already pattern in `sms_service.py`)
- Reject unsigned/invalid requests with 403

## 🎨 Frontend changes

### New admin tab: "Missed Calls"
- Sits in the existing Admin → Communications group (next to Promo Emails / Push)
- Same row pattern as Quote Requests
- Each row shows: caller phone (clickable to call back), timestamp, transcription preview, status (new/replied/closed)
- "Mark closed" button per row
- Unread count badge (same pattern as Inquiries / Quote Requests)

## 📞 Twilio Studio Flow JSON template

When we ship, the Studio flow should:

1. **Trigger:** Incoming Call to sidecar number
2. **Say** (TTS, Polly Joanna voice):
   > *"Thank you for calling Turan Elite Limo. Imran is on the road right now. After the tone, leave a message with your name, date, and group size — and we'll text you a booking link in 5 seconds. For an instant quote, visit turan elite limo dot com slash booking. Goodbye."*
3. **Record:** max 60 sec, beep, transcribe = true, transcription callback URL = `/api/twilio/missed-call`
4. **Send SMS** to From number:
   > *"Hi! Sorry we missed your call — Imran from Turan Elite Limo. Get an instant quote in 60 sec: https://turanelitelimo.com/booking — or reply here and I'll text back as soon as I'm off the road."*
5. **End**

## 💰 Cost projection (steady-state, after activation)

| Item | Cost |
|---|---|
| Sidecar number | $1.15/mo |
| A2P 10DLC campaign | $10/mo |
| Outbound SMS (10-30/mo) | ~$0.20/mo |
| Inbound voice (forwarded) | ~$0.0085/min ≈ $1/mo at 100 min |
| Voicemail recording storage | $0.0025/min ≈ $0.10/mo |
| **Total** | **~$13/mo** |

ROI: recover 1 missed lead per month → $300-2000+ vs. $13 cost → 25-150× ROI

## ⚠ Gotchas to watch for at activation time

- **A2P-registered messages MUST match the sample messages submitted at registration.** If we change SMS copy after approval, the auto-block can kick in. Sample messages already submitted by CAI cover: booking confirm + recovery + missed-call template — stay close to those.
- **Verizon `*71` syntax:** dial `*71` + the Twilio number + tap Call. Two beeps confirm activation. To turn off: `*73`. Test by calling Verizon from a different phone and letting it ring.
- **Don't include URLs in SMS without a brand name.** Many carriers block bare URLs. Use "turanelitelimo.com/booking" not "https://bit.ly/xyz".

## 🚀 Estimated build time once prereqs are met

- Backend endpoints: 30 min
- Frontend Missed Calls tab: 25 min
- Twilio Studio flow setup: 10 min (manual in Twilio Console)
- Testing: 10 min
- **Total: 60-75 min focused work**

---

When LLC + EIN + A2P clear, ping the agent with: *"All prereqs done, Twilio sidecar number is {phone}, ready to ship"* → I'll execute this playbook in one session.
