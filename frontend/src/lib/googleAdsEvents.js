/**
 * Google Ads conversion event helpers.
 *
 * One Google Ads conversion ID, multiple labels for different conversion
 * actions. Configure these in /app/frontend/.env:
 *
 *   REACT_APP_GADS_CONVERSION_ID            (e.g. "AW-1816837472")
 *   REACT_APP_GADS_LABEL_PURCHASE           (after Stripe payment)
 *   REACT_APP_GADS_LABEL_LEAD               (quote form submission)
 *   REACT_APP_GADS_LABEL_PHONE_CALL         (tel: link tap)
 *   REACT_APP_GADS_LABEL_BEGIN_CHECKOUT     (reached pay page)
 *
 * Each label must be created separately inside Google Ads
 * (Goals → Conversions → "+ New conversion action") and assigned a value.
 */

const CONV_ID = process.env.REACT_APP_GADS_CONVERSION_ID;

// ---- Enhanced Conversions helpers --------------------------------------
// Google needs SHA-256 (lowercase hex) of normalized email + E.164 phone.
// Hash happens client-side via Web Crypto so raw PII never leaves the browser
// in plain text. Once `gtag('set', 'user_data', {...})` is called, every
// subsequent `gtag('event', 'conversion', ...)` in the session is automatically
// enriched with these hashed identifiers — recovering attribution for
// iOS/Safari/Brave users where cookies are blocked.

const _ENHANCED_KEY = "_gads_eu_data";

async function sha256Hex(s) {
  if (!s) return null;
  try {
    const buf = new TextEncoder().encode(s);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

function normalizeEmail(raw) {
  if (!raw) return null;
  const e = String(raw).trim().toLowerCase();
  // Tiny guard against blatantly bad input
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

function normalizePhoneE164(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits; // already E.164
  digits = digits.replace(/\D/g, "");
  if (!digits) return null;
  // US-default since the business operates in the Bay Area
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // Unknown country — only send if caller already provided "+XX..."
  return null;
}

/**
 * Hash + register Enhanced Conversion identifiers BEFORE firing a conversion.
 * Safe to call multiple times; idempotent within a session.
 *
 * Requires "Enhanced Conversions for Web" to be toggled ON in Google Ads UI:
 *   Goals → Conversions → click action → Settings → "Enhanced conversions"
 *   → API → "Turn on enhanced conversions" → method "Google tag".
 */
export async function setEnhancedConversionData({ email, phone } = {}) {
  if (typeof window === "undefined") return;
  if (!CONV_ID) return;
  const e = normalizeEmail(email);
  const p = normalizePhoneE164(phone);
  if (!e && !p) return;
  // De-dupe within a session
  const fingerprint = `${e || ""}|${p || ""}`;
  try {
    if (sessionStorage.getItem(_ENHANCED_KEY) === fingerprint) return;
    sessionStorage.setItem(_ENHANCED_KEY, fingerprint);
  } catch {
    /* sessionStorage unavailable — proceed anyway */
  }
  const [sha_email, sha_phone] = await Promise.all([sha256Hex(e), sha256Hex(p)]);
  const userData = {};
  if (sha_email) userData.sha256_email_address = sha_email;
  if (sha_phone) userData.sha256_phone_number = sha_phone;
  if (Object.keys(userData).length === 0) return;
  if (!ensureGtag()) return;
  window.gtag("set", "user_data", userData);
}


function ensureGtag() {
  if (typeof window === "undefined") return false;
  if (!CONV_ID) return false;
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;
  // Lazily inject the gtag.js library if it hasn't been added yet
  // (GoogleSiteTag mounts at app root, but this is a defensive fallback).
  if (!document.querySelector(`script[data-gads-loaded="${CONV_ID}"]`)) {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${CONV_ID}`;
    s.setAttribute("data-gads-loaded", CONV_ID);
    document.head.appendChild(s);
    window.gtag("js", new Date());
    window.gtag("config", CONV_ID);
  }
  return true;
}

function fireOnce(stashKey, sendTo, payload) {
  if (!ensureGtag()) return;
  try {
    if (sessionStorage.getItem(stashKey)) return;
    sessionStorage.setItem(stashKey, "1");
  } catch {
    /* sessionStorage unavailable — fire anyway */
  }
  window.gtag("event", "conversion", { send_to: sendTo, ...payload });
}

/** Quote form submitted — counts as a "lead". Estimated value $20. */
export async function trackQuoteRequest({ requestId, vehicleType, email, phone } = {}) {
  const label = process.env.REACT_APP_GADS_LABEL_LEAD;
  if (!label) return;
  const txnId = requestId || `lead-${Date.now()}`;
  // Enhanced Conversions: hash + register identifiers BEFORE the event fires
  // so Google enriches THIS event (not just subsequent ones in the session).
  try { await setEnhancedConversionData({ email, phone }); } catch { /* ignore */ }
  fireOnce(`_gads_lead_${txnId}`, `${CONV_ID}/${label}`, {
    value: 20,
    currency: "USD",
    transaction_id: txnId,
    vehicle_type: vehicleType || undefined,
  });
}

/** User tapped a tel: link on mobile. Estimated value $30. */
export function trackPhoneCall({ source } = {}) {
  const label = process.env.REACT_APP_GADS_LABEL_PHONE_CALL;
  if (!label) return;
  // Throttle to once per 60s per source so accidental double-taps don't double-count
  const slot = Math.floor(Date.now() / 60000);
  const txnId = `call-${source || "anon"}-${slot}`;
  fireOnce(`_gads_call_${txnId}`, `${CONV_ID}/${label}`, {
    value: 30,
    currency: "USD",
    transaction_id: txnId,
    source: source || undefined,
  });
}

/** Customer reached the Pay page with a quote in hand. Estimated value $50. */
export function trackBeginCheckout({ bookingId, amount } = {}) {
  const label = process.env.REACT_APP_GADS_LABEL_BEGIN_CHECKOUT;
  if (!label) return;
  const txnId = bookingId || `checkout-${Date.now()}`;
  fireOnce(`_gads_chk_${txnId}`, `${CONV_ID}/${label}`, {
    value: amount && amount > 0 ? Number(amount) : 50,
    currency: "USD",
    transaction_id: txnId,
  });
}

/** Stripe payment succeeded — the real money conversion. */
export async function trackPurchase({ bookingId, amount, email, phone } = {}) {
  // Fall back to the legacy single-label env so existing purchase tracking
  // keeps working before the new "PURCHASE" label is created in Google Ads.
  const label =
    process.env.REACT_APP_GADS_LABEL_PURCHASE ||
    process.env.REACT_APP_GADS_CONVERSION_LABEL;
  if (!label) return;
  const txnId = bookingId;
  if (!txnId) return;
  // Enhanced Conversions: hash + register identifiers BEFORE the event fires
  // so Google enriches THIS event (not just subsequent ones in the session).
  try { await setEnhancedConversionData({ email, phone }); } catch { /* ignore */ }
  fireOnce(`_gads_purchase_${txnId}`, `${CONV_ID}/${label}`, {
    value: Number(amount || 0),
    currency: "USD",
    transaction_id: txnId,
  });
}
