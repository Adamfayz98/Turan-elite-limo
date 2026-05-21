import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import {
  Loader2,
  CheckCircle2,
  Phone as PhoneIcon,
  ShieldCheck,
  CreditCard,
  CalendarDays,
  MapPin,
  Car,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import GoogleAdsConversion from "@/components/GoogleAdsConversion";
import CheckoutRedirectOverlay from "@/components/CheckoutRedirectOverlay";
import { api, formatApiErrorDetail } from "@/lib/api";

export default function PayBooking() {
  const { bookingId: bookingIdParam } = useParams();
  const [params] = useSearchParams();
  // Support both /pay/:bookingId and /thank-you?bid=... (stable post-payment URL)
  const bookingId = bookingIdParam || params.get("bid");
  const sessionId = params.get("session_id");

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [pollMsg, setPollMsg] = useState(null);
  const [checkoutOverlay, setCheckoutOverlay] = useState(null);
  const polledRef = useRef(false);

  const load = useCallback(async () => {
    if (!bookingId) {
      // No booking ID in URL — likely a direct visit to /thank-you with no
      // params (Google Ads URL probe, bookmark, etc.). Skip the API call and
      // let the page render the friendly empty state without a noisy toast.
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get(`/bookings/${bookingId}/public`);
      setBooking(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Booking not found");
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll BOTH /payments/status and /bookings/{id}/public — whichever reports
  // paid first wins. The booking endpoint is also updated by the Stripe webhook,
  // so this works even if /payments/status hangs/fails.
  const pollStatus = useCallback(
    async (sid, attempts = 0) => {
      const max = 15; // ~30 seconds — shorter so customer isn't stuck staring at spinner
      if (attempts >= max) {
        // Final fallback: reload the booking once more, then show a calm receipt-style page
        try { await load(); } catch (e) { console.warn("[PayBooking] final load failed:", e); }
        setPollMsg("timeout");
        return;
      }
      // 1) Refresh the booking — webhook may have already marked it paid
      try {
        const { data: fresh } = await api.get(`/bookings/${bookingId}/public`);
        if (fresh?.payment_status === "paid") {
          setBooking(fresh);
          setPollMsg("paid");
          return;
        }
      } catch (e) {
        console.warn("[PayBooking] booking refresh failed, falling back to /payments/status:", e);
      }
      // 2) Probe Stripe directly via /payments/status (force-updates DB if needed)
      try {
        const { data } = await api.get(`/payments/status/${sid}`);
        if (data.payment_status === "paid") {
          setPollMsg("paid");
          await load();
          return;
        }
        if (data.payment_status === "expired") {
          setPollMsg("expired");
          return;
        }
      } catch (e) {
        console.warn("[PayBooking] /payments/status transient error, will retry:", e);
      }
      setPollMsg("processing");
      setTimeout(() => pollStatus(sid, attempts + 1), 2000);
    },
    [bookingId, load],
  );

  useEffect(() => {
    if (sessionId && !polledRef.current) {
      polledRef.current = true;
      setPollMsg("processing");
      pollStatus(sessionId);
    }
  }, [sessionId, pollStatus]);

  const onPay = async () => {
    if (!booking) return;
    setPaying(true);
    try {
      const { data } = await api.post("/payments/checkout", {
        booking_id: booking.id,
        origin_url: window.location.origin,
      });
      setCheckoutOverlay({
        url: data.url,
        bookingId: booking.id,
        sessionId: data.session_id,
      });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not start payment");
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" />
      </div>
    );
  }

  if (!booking) {
    // Differentiate between "no booking ID at all" (direct visit to /thank-you)
    // vs "booking ID was provided but not found".
    const directVisit = !bookingId;
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white px-6">
        <div className="text-center max-w-md">
          <h1 className="font-serif text-3xl">
            {directVisit ? "Looking for your reservation?" : "Booking not found"}
          </h1>
          <p className="text-white/55 text-sm mt-3 leading-relaxed">
            {directVisit
              ? "This page is shown right after a successful payment. Head back to the main site to make a reservation or manage an existing one."
              : "We couldn't find that reservation. The link may have expired or been mistyped."}
          </p>
          <Link to="/" className="text-[#D4AF37] mt-6 inline-block hover:underline">
            ← Back to TuranEliteLimo
          </Link>
        </div>
      </div>
    );
  }

  const isPaid = booking.payment_status === "paid";
  const isConfirmed = booking.status === "confirmed";
  const hasDriver = !!booking.driver_name;
  const callOnly = booking.quote_amount == null;
  // If user just returned from Stripe, treat as a payment-in-flight: never show
  // the Pay button (prevents the "pay again" loop if polling is slow/fails).
  const returnedFromStripe = !!sessionId;
  const showPayButton = !isPaid && !callOnly && !returnedFromStripe;

  return (
    <main data-testid="pay-page" className="min-h-screen bg-[#050505] text-white">
      {checkoutOverlay && (
        <CheckoutRedirectOverlay
          stripeUrl={checkoutOverlay.url}
          bookingId={checkoutOverlay.bookingId}
          sessionId={checkoutOverlay.sessionId}
          onClose={() => { setCheckoutOverlay(null); setPaying(false); }}
        />
      )}
      <GoogleAdsConversion booking={booking} />
      <header className="px-6 md:px-10 h-20 flex items-center border-b border-white/10">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo size={32} className="text-[#D4AF37]" />
          <span className="font-serif text-2xl">
            Turan<span className="gold-text">EliteLimo</span>
          </span>
        </Link>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Status hero */}
        <div className="text-center mb-10">
          {isPaid ? (
            <>
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <span className="text-xs tracking-[0.3em] uppercase text-emerald-400">
                Payment received
              </span>
              <h1 className="font-serif text-4xl md:text-5xl mt-4">
                Thank you, {booking.full_name?.split(" ")[0] || "friend"}.
              </h1>
              {hasDriver && isConfirmed ? (
                <p className="text-white/60 mt-3 leading-relaxed max-w-xl mx-auto">
                  Your chauffeur <span className="text-[#D4AF37]">{booking.driver_name}</span> is confirmed and will be in touch shortly before pickup.
                </p>
              ) : (
                <p className="text-white/60 mt-3 leading-relaxed max-w-xl mx-auto">
                  Our team is now reviewing your booking and assigning your chauffeur. You'll receive a <span className="text-[#D4AF37]">final confirmation email with driver details within an hour</span>. In the rare case we can't fulfill your request, you'll be auto-refunded.
                </p>
              )}
              <div className="mt-5 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs text-white/65">
                Confirmation
                <span className="text-[#D4AF37] font-mono">{booking.confirmation_number}</span>
              </div>
            </>
          ) : pollMsg === "processing" || (returnedFromStripe && !isPaid && pollMsg !== "timeout") ? (
            <>
              <Loader2 className="w-12 h-12 animate-spin text-[#D4AF37] mx-auto mb-5" />
              <h1 className="font-serif text-3xl">Processing your payment…</h1>
              <p className="text-white/55 mt-3 text-sm max-w-md mx-auto">
                Stripe is confirming your payment with us. This usually takes a few seconds.
                Please don't close this window.
              </p>
            </>
          ) : pollMsg === "timeout" && returnedFromStripe ? (
            <>
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <span className="text-xs tracking-[0.3em] uppercase text-emerald-400">
                Payment received
              </span>
              <h1 className="font-serif text-4xl md:text-5xl mt-4">
                Thank you, {booking.full_name?.split(" ")[0] || "friend"}.
              </h1>
              <p className="text-white/60 mt-3 leading-relaxed max-w-xl mx-auto">
                Your card was charged successfully. Our system is still syncing the receipt —
                you'll receive a <span className="text-[#D4AF37]">final confirmation email with driver details within an hour</span>.
                If you don't hear back, just reply to that email or call us.
              </p>
              {booking.confirmation_number && (
                <div className="mt-5 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs text-white/65">
                  Confirmation
                  <span className="text-[#D4AF37] font-mono">{booking.confirmation_number}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <span className="text-xs tracking-[0.3em] uppercase text-[#D4AF37]">Reservation Confirmed</span>
              <h1 className="font-serif text-4xl md:text-5xl mt-4">
                Secure your ride.
              </h1>
              <p className="text-white/55 mt-3">
                Reservation <span className="text-[#D4AF37] font-mono">{booking.confirmation_number}</span> is locked in.
                Complete payment below to finalize.
              </p>
            </>
          )}
        </div>

        {/* Summary card */}
        <div
          data-testid="pay-summary-card"
          className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-7 md:p-9"
        >
          <div className="flex items-center gap-2 text-[#D4AF37] text-xs tracking-[0.25em] uppercase">
            <Sparkles className="w-3.5 h-3.5" /> Reservation summary
          </div>

          <Row icon={CalendarDays} label="When" value={`${booking.pickup_date} at ${booking.pickup_time}`} />
          <Row icon={MapPin} label="Pickup" value={booking.pickup_location} />
          <Row icon={MapPin} label="Drop-off" value={booking.dropoff_location} />
          {booking.return_trip && (
            <Row icon={MapPin} label="Return" value={booking.return_location || "Same as pickup"} />
          )}
          <Row icon={Car} label="Vehicle" value={booking.vehicle_type} />
          <Row icon={CreditCard} label="Service" value={booking.service_type} />

          <div className="mt-6 pt-6 border-t border-white/10">
            {callOnly ? (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-white/50">Total</div>
                  <div className="font-serif text-2xl gold-text mt-1">Call for quote</div>
                </div>
                <a
                  href="tel:+16504100687"
                  className="inline-flex items-center gap-2 px-5 py-2.5 border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-full text-sm"
                >
                  <PhoneIcon className="w-4 h-4" /> (650) 410‑0687
                </a>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/50">Total quoted</div>
                  <div className="font-serif text-2xl text-white">
                    ${booking.quote_amount?.toFixed(2)}
                  </div>
                </div>
                {booking.deposit_percent < 100 && (
                  <div className="flex items-center justify-between mt-2 text-sm">
                    <div className="text-white/55">Deposit ({booking.deposit_percent}% due now)</div>
                    <div className="text-white">${booking.deposit_amount?.toFixed(2)}</div>
                  </div>
                )}
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                  <div className="text-xs uppercase tracking-[0.2em] text-[#D4AF37]">
                    {isPaid ? "Paid in full" : "Due now"}
                  </div>
                  <div className="font-serif text-3xl gold-text">
                    ${(isPaid ? booking.paid_amount : booking.deposit_amount)?.toFixed(2)}
                  </div>
                </div>
              </>
            )}
          </div>

          {showPayButton && (
            <div className="mt-7">
              <Button
                onClick={onPay}
                disabled={paying || pollMsg === "processing"}
                data-testid="pay-now-button"
                className="w-full bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-12 font-medium text-base"
              >
                {paying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Redirecting to Stripe…
                  </>
                ) : (
                  <>
                    Pay ${booking.deposit_amount?.toFixed(2)} & Secure
                  </>
                )}
              </Button>
              <div className="flex items-center justify-center gap-2 mt-4 text-xs text-white/45">
                <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Secured by Stripe · SSL encrypted</span>
              </div>
            </div>
          )}

          {isPaid && (
            <div className="mt-7 flex flex-col gap-3">
              <Link
                to="/"
                data-testid="return-home-button"
                className="w-full inline-flex items-center justify-center bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-12 font-medium text-base transition-colors"
              >
                Return to home
              </Link>
              {booking.manage_token && (
                <Link
                  to={`/manage/${booking.manage_token}`}
                  className="w-full inline-flex items-center justify-center border border-white/20 text-white/85 hover:bg-white/[0.04] rounded-full h-11 text-sm transition-colors"
                >
                  Manage my reservation
                </Link>
              )}
            </div>
          )}

          {pollMsg === "expired" && (
            <p className="text-xs text-red-400 text-center mt-4">
              Checkout session expired. Click Pay above to start a fresh session.
            </p>
          )}
        </div>

        <p className="text-center text-xs text-white/40 mt-8">
          Questions? Call <a href="tel:+16504100687" className="text-[#D4AF37]">(650) 410‑0687</a>{" "}
          or email <a href="mailto:support@turanelitelimo.com" className="text-[#D4AF37]">support@turanelitelimo.com</a>
        </p>
      </div>
    </main>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 mt-5 pt-5 border-t border-white/5 first-of-type:border-t-0 first-of-type:pt-6">
      <Icon className="w-4 h-4 text-[#D4AF37] mt-1 flex-shrink-0" />
      <div className="flex-1">
        <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">{label}</div>
        <div className="text-white text-sm mt-1">{value}</div>
      </div>
    </div>
  );
}
