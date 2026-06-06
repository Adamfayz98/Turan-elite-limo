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
export function trackQuoteRequest({ requestId, vehicleType } = {}) {
  const label = process.env.REACT_APP_GADS_LABEL_LEAD;
  if (!label) return;
  const txnId = requestId || `lead-${Date.now()}`;
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
export function trackPurchase({ bookingId, amount } = {}) {
  // Fall back to the legacy single-label env so existing purchase tracking
  // keeps working before the new "PURCHASE" label is created in Google Ads.
  const label =
    process.env.REACT_APP_GADS_LABEL_PURCHASE ||
    process.env.REACT_APP_GADS_CONVERSION_LABEL;
  if (!label) return;
  const txnId = bookingId;
  if (!txnId) return;
  fireOnce(`_gads_purchase_${txnId}`, `${CONV_ID}/${label}`, {
    value: Number(amount || 0),
    currency: "USD",
    transaction_id: txnId,
  });
}
