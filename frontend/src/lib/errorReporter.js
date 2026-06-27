/**
 * Sentry-lite error reporter — POSTs unhandled JS errors to /api/errors/report
 * so the admin gets an email within seconds when a customer hits a real bug.
 *
 * Wired once from src/index.js. Fire-and-forget — never throws, never blocks the
 * page, and the backend dedupes/rate-limits so a runaway error can't spam the inbox.
 */

const BACKEND = process.env.REACT_APP_BACKEND_URL;
const SUPPRESS_LOCALHOST = !BACKEND || /localhost|127\.0\.0\.1/.test(BACKEND);

// Ignore common noisy false positives that aren't real bugs.
const NOISE = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
  "Non-Error promise rejection captured",
  "Script error.",
  "Failed to fetch", // user navigated away mid-request — harmless
  "NetworkError when attempting to fetch resource",
  "Load failed",
  // ---- Browser-extension noise ---------------------------------------
  // These come from password managers / coupon extensions / etc. running
  // in the customer's browser, NOT from our code. Common culprits: LastPass,
  // 1Password, Honey, Capital One Shopping, Bitwarden, Grammarly, Rakuten,
  // Avast/Norton, etc.
  "No Listener:",                       // LastPass / 1Password content<->bg messaging
  "tabs:outgoing.message",              // ditto, different framing
  "The message port closed before a response was received",  // Chrome extension classic
  "Could not establish connection",     // ditto
  "Extension context invalidated",      // extension reloaded while tab open
  "WebKit encountered an internal error",
  "ChunkLoadError",                     // CDN flake on user side; not our bug
  "Loading chunk",
  "Loading CSS chunk",
];

// Stack-trace prefixes that ALWAYS belong to browser extensions. If ANY frame
// in the stack points to one of these schemes, the error happened inside
// extension code, not in our app — drop it.
const EXTENSION_STACK_MARKERS = [
  "webkit-masked-url://hidden",  // Safari masks extension scripts here
  "chrome-extension://",          // Chrome / Edge / Brave
  "moz-extension://",             // Firefox
  "safari-web-extension://",      // Safari Web Extensions
  "safari-extension://",          // Safari (legacy)
];

function isNoise(message, stack) {
  if (!message && !stack) return true;
  if (message && NOISE.some((n) => message.includes(n))) return true;
  if (stack && EXTENSION_STACK_MARKERS.some((m) => stack.includes(m))) return true;
  return false;
}

// Client-side dedupe — same message within 5 min isn't re-reported even if backend allows it
const seen = new Map(); // fingerprint -> timestamp
const CLIENT_DEDUPE_MS = 5 * 60 * 1000;

function report(payload) {
  if (SUPPRESS_LOCALHOST) return; // never alert from dev/preview without a backend URL
  if (isNoise(payload.message, payload.stack)) return;

  const fp = `${(payload.message || "").slice(0, 120)}|${(payload.page_url || "").split("?")[0]}`;
  const last = seen.get(fp);
  if (last && Date.now() - last < CLIENT_DEDUPE_MS) return;
  seen.set(fp, Date.now());

  // Keep map size sane
  if (seen.size > 100) seen.clear();

  try {
    // Use Beacon API when available so the report flushes even on page unload.
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon(`${BACKEND}/api/errors/report`, blob);
      return;
    }
    fetch(`${BACKEND}/api/errors/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => { /* fire-and-forget */ });
  } catch {
    /* reporter must never throw */
  }
}

function buildPayload(message, stack, context) {
  return {
    message: String(message || "").slice(0, 2000),
    page_url: typeof window !== "undefined" ? window.location.href : "",
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    stack: stack ? String(stack).slice(0, 8000) : null,
    context: context || null,
  };
}

let installed = false;

export function installErrorReporter() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    const err = event?.error;
    report(buildPayload(
      err?.message || event?.message || "Unknown error",
      err?.stack || null,
      { type: "window.error", filename: event?.filename, lineno: event?.lineno },
    ));
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    const message = reason?.message || (typeof reason === "string" ? reason : "Unhandled promise rejection");
    report(buildPayload(message, reason?.stack || null, { type: "unhandledrejection" }));
  });
}

/**
 * Manual report from try/catch blocks where you want to know it happened.
 *   import { reportError } from "@/lib/errorReporter";
 *   try { ... } catch (e) { reportError(e, { route: "PayBooking" }); }
 */
export function reportError(error, context) {
  const message = error?.message || String(error || "Unknown error");
  report(buildPayload(message, error?.stack || null, { type: "manual", ...(context || {}) }));
}
