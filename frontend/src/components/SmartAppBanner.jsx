import { useEffect, useState } from "react";
import { X, Smartphone } from "lucide-react";

/**
 * SmartAppBanner — a polite, dismissible banner that appears on mobile web
 * encouraging visitors to continue inside the native TuranEliteLimo app for
 * live driver tracking, push notifications, saved addresses, and faster
 * checkout.
 *
 * Behaviour:
 *  - Hidden on desktop (>=768px).
 *  - Hidden when launched inside the in-app browser, Expo Go, or any RN
 *    WebView (avoids recursion).
 *  - Auto-detects iOS vs Android and routes to the correct store.
 *  - Deep-links into the app first via `turanelitelimo://` scheme. If the app
 *    is not installed, falls back to the App Store / Play Store after 1.5s.
 *  - Dismissed banner stays hidden for 7 days via localStorage.
 *  - Appears 1.5s after page load so it doesn't slam users on first paint.
 */

const APP_STORE_URL = "https://apps.apple.com/us/app/turanelitelimo/id6771610380";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.turanelitelimo.app";
const APP_SCHEME = "turanelitelimo://";
const DISMISS_KEY = "tel_smart_banner_dismissed_v1";
const DISMISS_DAYS = 7;

function detectPlatform() {
  if (typeof window === "undefined") return null;
  const ua = window.navigator.userAgent || "";
  if (/iPhone|iPod/.test(ua)) return "ios";
  // iPad on iPadOS 13+ reports as Macintosh — detect via touch
  if (/iPad/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document)) return "ios";
  if (/android/i.test(ua)) return "android";
  return null;
}

function isInsideWebView() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  return (
    /FBAN|FBAV|Instagram|expo|TuranEliteLimo/i.test(ua) ||
    Boolean(window.ReactNativeWebView)
  );
}

function isDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
}

function setDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage blocked — fine */
  }
}

export default function SmartAppBanner() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState(null);

  useEffect(() => {
    const p = detectPlatform();
    if (!p) return;
    if (isInsideWebView()) return;
    if (isDismissed()) return;
    setPlatform(p);
    const t = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const handleOpen = () => {
    if (!platform) return;
    const fallback = platform === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
    // Attempt deep link first
    const start = Date.now();
    window.location.href = APP_SCHEME;
    // If the user is still here after 1.5s, the app isn't installed — go to store.
    setTimeout(() => {
      if (Date.now() - start < 2500 && document.visibilityState === "visible") {
        window.location.href = fallback;
      }
    }, 1500);
  };

  const handleDismiss = () => {
    setDismissed();
    setVisible(false);
  };

  if (!platform) return null;

  return (
    <div
      data-testid="smart-app-banner"
      role="region"
      aria-label="Open in TuranEliteLimo mobile app"
      className={`md:hidden fixed top-0 inset-x-0 z-50 transition-transform duration-300 ${
        visible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className="bg-[#0a0a0a]/95 backdrop-blur-md border-b border-[#D4AF37]/30 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={handleDismiss}
            data-testid="smart-banner-dismiss"
            aria-label="Dismiss"
            className="text-white/45 hover:text-white/80 p-1 -m-1"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#D4AF37]/20 to-[#D4AF37]/5 border border-[#D4AF37]/30 shrink-0">
            <Smartphone className="w-5 h-5 text-[#D4AF37]" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium leading-tight truncate">TuranEliteLimo</p>
            <p className="text-white/55 text-[11px] leading-tight mt-0.5 truncate">
              Live driver tracking · Faster checkout
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpen}
            data-testid="smart-banner-open"
            className="shrink-0 px-4 py-2 rounded-full bg-[#D4AF37] text-black text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}
