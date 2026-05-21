/**
 * CheckoutRedirectOverlay — the "Krista fix".
 *
 * Why this exists: window.location.href = stripeUrl silently fails on iOS
 * Safari (ITP), strict popup blockers, and some corporate proxies. The user
 * sees nothing happen, gets a generic "something went wrong" toast, gives
 * up, and cancels. This overlay:
 *   1. Shows the user a clear "Opening secure checkout..." spinner
 *   2. Triggers the real redirect
 *   3. After 2.5s, if we're still on the page, surfaces a manual button
 *      with the actual Stripe URL so they can click through themselves
 *   4. Pings the backend telemetry endpoint when the redirect was blocked
 *
 * Used by BookingForm (after creating a booking) and PayBooking (retry flow).
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, ExternalLink, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export default function CheckoutRedirectOverlay({ stripeUrl, bookingId, sessionId, onClose }) {
  const [stage, setStage] = useState("redirecting"); // redirecting | needs_manual_click
  const triggeredRef = useRef(false);
  const telemetryRef = useRef(false);

  // Kick off the actual redirect once, immediately.
  useEffect(() => {
    if (!stripeUrl || triggeredRef.current) return;
    triggeredRef.current = true;
    try {
      window.location.href = stripeUrl;
    } catch (e) {
      // Hard failure on the redirect itself — flip to manual button right away.
      setStage("needs_manual_click");
    }
  }, [stripeUrl]);

  // If after 2.5s we're STILL on this page (the redirect was silently blocked),
  // show the manual fallback and log a telemetry event so we can spot patterns.
  useEffect(() => {
    if (!stripeUrl) return;
    const t = setTimeout(() => {
      if (document.visibilityState === "visible" && !telemetryRef.current) {
        telemetryRef.current = true;
        setStage("needs_manual_click");
        try {
          api.post("/payments/checkout-telemetry", {
            booking_id: bookingId,
            session_id: sessionId,
            kind: "redirect_blocked",
            user_agent: navigator.userAgent,
            detail: `visibilityState=visible after 2.5s on ${window.location.href}`,
          }).catch(() => {});
        } catch (_) {}
      }
    }, 2500);
    return () => clearTimeout(t);
  }, [stripeUrl, bookingId, sessionId]);

  const handleManualClick = () => {
    try {
      api.post("/payments/checkout-telemetry", {
        booking_id: bookingId,
        session_id: sessionId,
        kind: "manual_fallback_clicked",
        user_agent: navigator.userAgent,
      }).catch(() => {});
    } catch (_) {}
    // Use a real anchor in the DOM so iOS treats it as a user-initiated nav.
    const a = document.createElement("a");
    a.href = stripeUrl;
    a.target = "_self";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div
      data-testid="checkout-redirect-overlay"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm px-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-8 text-center shadow-2xl">
        {stage === "redirecting" ? (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#D4AF37]/10 ring-1 ring-[#D4AF37]/30">
              <Loader2 className="h-7 w-7 animate-spin text-[#D4AF37]" />
            </div>
            <h3 className="font-serif text-2xl text-white">Opening secure checkout…</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              Redirecting you to Stripe to complete your reservation. This takes just a moment.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.25em] text-[#D4AF37]/80">
              <ShieldCheck className="h-3.5 w-3.5" /> 256-bit encrypted · powered by Stripe
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 ring-1 ring-amber-400/30">
              <AlertTriangle className="h-7 w-7 text-amber-300" />
            </div>
            <h3 className="font-serif text-2xl text-white">Your browser blocked the redirect</h3>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              No worries — your reservation is saved. Tap the button below to finish payment in a secure Stripe page.
            </p>
            <Button
              data-testid="checkout-manual-fallback-btn"
              onClick={handleManualClick}
              className="mt-6 w-full h-12 bg-[#D4AF37] hover:bg-[#C49B2A] text-black font-semibold tracking-wide"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open secure checkout
            </Button>
            <button
              type="button"
              data-testid="checkout-overlay-dismiss"
              onClick={onClose}
              className="mt-4 text-xs uppercase tracking-[0.25em] text-white/40 hover:text-white/70 transition"
            >
              Cancel — finish later
            </button>
            <p className="mt-5 text-[11px] leading-relaxed text-white/40">
              We also just emailed you a direct payment link in case you'd rather complete it on another device.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
