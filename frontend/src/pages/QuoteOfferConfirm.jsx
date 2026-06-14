import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, MapPin, Users, CalendarDays, Sparkles, ShieldCheck, Phone } from "lucide-react";

import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const fmtMoney = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n || 0));

export default function QuoteOfferConfirm() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");

  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const [otpState, setOtpState] = useState(null); // null | "needs_send" | "code_sent"
  const [otpCode, setOtpCode] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpPhoneLast4, setOtpPhoneLast4] = useState("");

  // 1) Load quote
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data } = await api.get(`/quote-offer/${token}`);
        if (!active) return;
        if (data.already_confirmed) {
          setConfirmed({
            booking_id: data.booking_id,
            confirmation_number: null,
            total: data.quoted_price,
            paid_already: true,
          });
          setQuote(data);
        } else {
          setQuote(data);
        }
      } catch (err) {
        setError(formatApiErrorDetail(err.response?.data?.detail) || "This quote link is no longer valid.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [token]);

  // 2) If Stripe redirected back with session_id → finalize
  useEffect(() => {
    if (!sessionId || !token || confirmed) return;
    let active = true;
    const finalize = async () => {
      setFinalizing(true);
      try {
        const { data } = await api.get(`/quote-offer/${token}/finalize`, { params: { session_id: sessionId } });
        if (!active) return;
        if (data.ok && data.paid !== false) {
          setConfirmed({
            booking_id: data.booking_id,
            confirmation_number: data.confirmation_number,
            paid: data.amount_paid,
            total: data.total,
          });
        } else {
          setError("Payment didn't go through. Please try again or contact us.");
        }
      } catch (err) {
        setError(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't verify your payment. Please contact us.");
      } finally {
        if (active) setFinalizing(false);
      }
    };
    finalize();
    return () => { active = false; };
  }, [sessionId, token, confirmed]);

  const handlePay = async () => {
    setPaying(true);
    try {
      const { data } = await api.post(`/quote-offer/${token}/checkout`, {
        origin_url: window.location.origin,
      });
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err) {
      // 428 = phone-verify gate (RFC 6585 "Precondition Required")
      if (err.response?.status === 428) {
        setOtpState("needs_send");
        setPaying(false);
        return;
      }
      setError(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't start payment. Please try again.");
      setPaying(false);
    }
  };

  const sendOtp = async () => {
    setOtpSending(true);
    try {
      const { data } = await api.post(`/quote-offer/${token}/send-otp`);
      setOtpPhoneLast4(data.phone_last4 || "");
      setOtpState("code_sent");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || "Couldn't send verification code.");
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtp = async () => {
    if (!otpCode || otpCode.length < 4) return;
    setOtpSending(true);
    try {
      await api.post(`/quote-offer/${token}/verify-otp`, { code: otpCode });
      // Verified — immediately retry checkout
      setOtpState(null);
      setOtpCode("");
      await handlePay();
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || "Invalid or expired code.");
      setOtpSending(false);
    }
  };

  // Inline (no useMemo) to keep lint happy — recomputes on every render but
  // the math is trivial.
  let validityNote = "";
  if (quote?.quoted_at) {
    const quotedAt = new Date(quote.quoted_at);
    const expiresAt = new Date(quotedAt.getTime() + 48 * 60 * 60 * 1000);
    const hoursLeft = Math.max(0, Math.round((expiresAt - new Date()) / (1000 * 60 * 60)));
    if (hoursLeft <= 0) validityNote = "This quote has expired — please contact us for a new one.";
    else if (hoursLeft <= 12) validityNote = `⏳ Hold expires in ~${hoursLeft}h. Confirm soon to lock your vehicle.`;
  }

  // ----- RENDER STATES -----

  if (loading || finalizing) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-24 text-white/60" data-testid="quote-confirm-loading">
          <Loader2 className="w-7 h-7 text-[#D4AF37] animate-spin" />
          <div className="mt-4 text-sm">{finalizing ? "Confirming your payment..." : "Loading your quote..."}</div>
        </div>
      </Shell>
    );
  }

  if (error && !confirmed) {
    return (
      <Shell>
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center" data-testid="quote-confirm-error">
          <div className="text-red-300 font-medium">{error}</div>
          <a href="tel:+16504100687" className="inline-block mt-6 text-[#D4AF37] underline text-sm">Call us · (650) 410-0687</a>
        </div>
      </Shell>
    );
  }

  if (confirmed) {
    return (
      <Shell>
        <div className="text-center py-6" data-testid="quote-confirmed">
          <div className="inline-flex w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 items-center justify-center mb-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="font-serif text-3xl text-white mb-2">You&apos;re booked.</h1>
          {confirmed.confirmation_number && (
            <div className="text-[#D4AF37] text-sm tracking-[0.2em] uppercase font-medium">
              Confirmation #{confirmed.confirmation_number}
            </div>
          )}
          {confirmed.paid_already ? (
            <div className="text-white/55 text-sm mt-5">This quote was already confirmed. Check your email for the receipt.</div>
          ) : (
            <>
              <div className="text-white/60 text-sm mt-5 leading-relaxed max-w-md mx-auto">
                We&apos;ve sent a confirmation email with your trip details. The remaining balance will be charged the day before service. Our team will text you 24 hours ahead with your chauffeur&apos;s info.
              </div>
              <div className="mt-8 grid grid-cols-2 gap-3 max-w-xs mx-auto text-sm">
                <div className="rounded-xl bg-white/[0.03] border border-white/5 p-4 text-left">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">Paid today</div>
                  <div className="text-emerald-400 font-semibold mt-1">{fmtMoney(confirmed.paid)}</div>
                </div>
                <div className="rounded-xl bg-white/[0.03] border border-white/5 p-4 text-left">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">Balance due</div>
                  <div className="text-white/85 font-semibold mt-1">{fmtMoney((confirmed.total || 0) - (confirmed.paid || 0))}</div>
                </div>
              </div>
            </>
          )}
          <a
            href="https://turanelitelimo.com"
            className="inline-block mt-10 text-sm text-white/55 hover:text-white"
          >
            ← Back to TuranEliteLimo
          </a>
        </div>
      </Shell>
    );
  }

  if (!quote) return null;

  return (
    <Shell>
      <div className="px-1" data-testid="quote-confirm-page">
        {/* Hero */}
        <div className="mb-7">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#D4AF37] font-semibold">Your quote · {quote.vehicle_type}</div>
          <h1 className="font-serif text-3xl sm:text-4xl text-white mt-3 leading-tight">
            Lock in your ride, {(quote.full_name || "").split(" ")[0]}.
          </h1>
          <p className="text-white/55 text-sm mt-3 leading-relaxed">
            Confirm with a {(quote.deposit_pct || 50).toFixed(0)}% deposit. Remaining balance charged the day before service. Free cancellation up to 7 days out.
          </p>
        </div>

        {/* Trip details */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 mb-5 space-y-5">
          <Row icon={<Sparkles className="w-4 h-4 text-[#D4AF37]" />} label="Vehicle" value={quote.vehicle_type} />
          {(quote.pickup_date || quote.pickup_time) && (
            <Row icon={<CalendarDays className="w-4 h-4 text-[#D4AF37]" />} label="Date" value={`${quote.pickup_date || ""} ${quote.pickup_time || ""}`.trim()} />
          )}
          {quote.pickup_location && (
            <Row icon={<MapPin className="w-4 h-4 text-[#D4AF37]" />} label="Pickup" value={quote.pickup_location} />
          )}
          {quote.dropoff_location && (
            <Row icon={<MapPin className="w-4 h-4 text-[#D4AF37]/60" />} label="Drop-off" value={quote.dropoff_location} />
          )}
          {quote.passengers && (
            <Row icon={<Users className="w-4 h-4 text-[#D4AF37]" />} label="Passengers" value={`${quote.passengers}`} />
          )}
        </div>

        {/* Notes from operator */}
        {quote.quoted_notes && (
          <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/[0.05] p-5 mb-5 text-[#e8d9a6] text-sm leading-relaxed whitespace-pre-line">
            {quote.quoted_notes}
          </div>
        )}

        {/* Price block */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#1a1410] to-[#0c0c0c] p-6 mb-5">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/50">Flat-rate total</div>
              <div className="text-white/40 text-[11px] mt-1">All-inclusive · gratuity not included</div>
            </div>
            <div className="text-[#D4AF37] text-3xl font-semibold">{fmtMoney(quote.quoted_price)}</div>
          </div>
          <div className="mt-5 pt-5 border-t border-white/10 flex items-baseline justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/50">Deposit due today</div>
              <div className="text-white/40 text-[11px] mt-1">{(quote.deposit_pct || 50).toFixed(0)}% · refundable per policy</div>
            </div>
            <div className="text-white text-2xl font-semibold">{fmtMoney(quote.deposit_amount)}</div>
          </div>
        </div>

        {validityNote && (
          <div className="text-[#D4AF37] text-xs text-center mb-4">{validityNote}</div>
        )}

        {/* Phone OTP gate (only when backend signals required) */}
        {otpState && (
          <div className="rounded-2xl border border-[#D4AF37]/30 bg-[#D4AF37]/[0.06] p-5 mb-5" data-testid="otp-gate">
            <div className="flex items-start gap-3">
              <Phone className="w-4 h-4 text-[#D4AF37] mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium">Verify your phone first</div>
                <div className="text-white/55 text-xs mt-1">
                  For your protection on this booking, we need to confirm a one-time code sent to your phone {otpPhoneLast4 ? <>ending in <span className="text-white">{otpPhoneLast4}</span></> : null}.
                </div>
                {otpState === "needs_send" ? (
                  <Button
                    onClick={sendOtp}
                    disabled={otpSending}
                    data-testid="otp-send-btn"
                    className="mt-4 bg-[#D4AF37] text-black hover:bg-[#B3922E] h-10 rounded-full px-5 text-sm font-semibold"
                  >
                    {otpSending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</> : "Send verification code"}
                  </Button>
                ) : (
                  <div className="mt-4 space-y-3">
                    <Input
                      data-testid="otp-code-input"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6-digit code"
                      inputMode="numeric"
                      maxLength={6}
                      className="bg-[#0E0E0E] border-[#27272A] text-white text-center text-lg tracking-[0.4em] font-mono h-12"
                    />
                    <Button
                      onClick={verifyOtp}
                      disabled={otpSending || otpCode.length < 4}
                      data-testid="otp-verify-btn"
                      className="w-full bg-[#D4AF37] text-black hover:bg-[#B3922E] h-11 rounded-full text-sm font-semibold"
                    >
                      {otpSending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying…</> : "Verify & continue"}
                    </Button>
                    <button
                      type="button"
                      onClick={sendOtp}
                      className="text-xs text-white/45 hover:text-white/75 underline w-full text-center"
                    >
                      Didn't get it? Resend
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CTA */}
        <Button
          data-testid="quote-confirm-pay-button"
          onClick={handlePay}
          disabled={paying}
          className="w-full bg-[#D4AF37] text-black hover:bg-[#B3922E] disabled:opacity-60 h-14 rounded-full text-base font-bold tracking-wide shadow-lg shadow-[#D4AF37]/10"
        >
          {paying ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Opening secure checkout…</>
          ) : (
            <>✓ Confirm &amp; Pay {fmtMoney(quote.deposit_amount)} Deposit</>
          )}
        </Button>

        {/* Trust strip */}
        <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-white/40">
          <ShieldCheck className="w-3.5 h-3.5" />
          Secured by Stripe · Or call <a href="tel:+16504100687" className="text-[#D4AF37] ml-1">(650) 410-0687</a>
        </div>

        <div className="mt-10 text-[11px] text-white/35 text-center leading-relaxed">
          Cancellation: Free 7+ days out · 50% fee inside 7 days · Non-refundable inside 48 hrs.<br />
          By confirming, you agree to TuranEliteLimo&apos;s <a href="/terms" className="underline">Terms</a>.
        </div>
      </div>
    </Shell>
  );
}

// ----- shared layout & row helpers -----

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-[#050505] text-white py-12 px-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-8">
          <a href="https://turanelitelimo.com" className="text-[#D4AF37] font-serif text-xl tracking-wide">
            TuranEliteLimo
          </a>
          <span className="text-[10px] uppercase tracking-[0.3em] text-white/35">Secure quote</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Row({ icon, label, value }) {
  return (
    <div className="flex items-start gap-4">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
        <div className="text-white text-sm mt-1 break-words">{value}</div>
      </div>
    </div>
  );
}
