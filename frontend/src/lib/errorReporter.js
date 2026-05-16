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
];

function isNoise(message) {
  if (!message) return true;
  return NOISE.some((n) => message.includes(n));
}

// Client-side dedupe — same message within 5 min isn't re-reported even if backend allows it
const seen = new Map(); // fingerprint -> timestamp
const CLIENT_DEDUPE_MS = 5 * 60 * 1000;

function report(payload) {
  if (SUPPRESS_LOCALHOST) return; // never alert from dev/preview without a backend URL
  if (isNoise(payload.message)) return;

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
