/**
 * First-touch UTM / referrer capture for attribution.
 *
 * Why first-touch? A customer might click a Google Ad today, leave, and book
 * 3 weeks later via a bookmark or direct visit. The Google Ad is the
 * acquisition source — not the eventual direct visit. We persist the first
 * UTM bundle in localStorage for 90 days and read it on form submit.
 *
 * The cookie is keyed by `tel_utm_v1` so future schema changes can bump the
 * version without polluting old data.
 */

const STORAGE_KEY = "tel_utm_v1";
const TTL_DAYS = 90;

const TRACKED_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",   // Google Ads click id (auto-tagging)
  "fbclid",  // Meta/Facebook click id
  "msclkid", // Microsoft/Bing click id
  "yclid",   // Yandex click id (rare but cheap to capture)
];

function _now() {
  return Date.now();
}

function _expired(stored) {
  if (!stored || !stored.captured_at) return true;
  const ageMs = _now() - stored.captured_at;
  return ageMs > TTL_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Reads UTM / click-id params from the CURRENT URL. Returns null if nothing
 * useful was found (e.g. someone visiting directly from a bookmark).
 */
function _readFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const found = {};
    TRACKED_PARAMS.forEach((k) => {
      const v = params.get(k);
      if (v) found[k] = v.slice(0, 200); // hard cap on length
    });
    if (Object.keys(found).length === 0) return null;
    return found;
  } catch {
    return null;
  }
}

/**
 * Determine a coarse-grained "source bucket" we can show in the admin and the
 * weekly digest. This is what makes the data readable at a glance.
 */
function _bucketSource(utm, referrer) {
  if (utm.gclid || (utm.utm_source || "").toLowerCase().includes("google")) return "google_ads";
  if (utm.fbclid || (utm.utm_source || "").toLowerCase().includes("facebook")) return "facebook";
  if (utm.msclkid || (utm.utm_source || "").toLowerCase().includes("bing")) return "bing_ads";
  if ((utm.utm_source || "").toLowerCase().includes("yelp")) return "yelp";
  if ((utm.utm_source || "").toLowerCase().includes("instagram")) return "instagram";
  if ((utm.utm_source || "").toLowerCase().includes("tiktok")) return "tiktok";
  if (utm.utm_source) return utm.utm_source.toLowerCase();
  if (referrer) {
    const r = referrer.toLowerCase();
    if (r.includes("google.")) return "google_organic";
    if (r.includes("bing.")) return "bing_organic";
    if (r.includes("yelp.")) return "yelp";
    if (r.includes("facebook.") || r.includes("instagram.")) return "social_organic";
    if (r.includes("duckduckgo")) return "duckduckgo";
    return "referrer";
  }
  return "direct";
}

/**
 * Run this once when the app mounts. Captures UTM params from the URL the
 * very first time the visitor lands with attribution info, then leaves it
 * alone for 90 days. Subsequent visits with NEW UTM params do NOT overwrite
 * — first-touch wins (industry standard for attribution).
 */
export function captureUtm() {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : null;
    if (stored && !_expired(stored)) return; // first-touch already captured & valid

    const fromUrl = _readFromUrl();
    const referrer = document.referrer || "";
    // Only persist if we actually have attribution signal — don't store a
    // bare "direct" record when someone just lands on the homepage with no
    // params. We want the FIRST meaningful touch.
    if (!fromUrl && !referrer) return;

    const utm = fromUrl || {};
    const bucket = _bucketSource(utm, referrer);
    const payload = {
      ...utm,
      referrer: referrer.slice(0, 300),
      landing_path: (window.location.pathname || "").slice(0, 200),
      source_bucket: bucket,
      captured_at: _now(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore — never let attribution capture break the page
  }
}

/**
 * Read the persisted first-touch UTM block. Returns null if nothing stored
 * or if storage is unavailable. Forms call this before submitting and pass
 * the result as `utm` in the POST payload.
 */
export function getStoredUtm() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw);
    if (_expired(stored)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}
