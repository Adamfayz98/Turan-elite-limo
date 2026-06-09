import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import Logo from "@/components/Logo";

/**
 * Public landing for referral links: /r/:code
 *
 * - Validates the code against the backend
 * - Persists the code in localStorage so signup/booking flows can apply it
 * - Shows a quick confirmation message + CTA to start booking
 */
export default function ReferralRedirect() {
  const { code } = useParams();
  const [state, setState] = useState({ loading: !!code, valid: false, referrerName: null });

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/referral/check/${encodeURIComponent(code)}`);
        if (cancelled) return;
        if (data?.valid) {
          // Persist so signup/booking flows can pick it up
          localStorage.setItem("ref_code", code.toUpperCase());
          localStorage.setItem("ref_at", String(Date.now()));
          setState({ loading: false, valid: true, referrerName: data.referrer_name || null });
        } else {
          setState({ loading: false, valid: false, referrerName: null });
        }
      } catch (e) {
        if (!cancelled) setState({ loading: false, valid: false, referrerName: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    document.title = "You've been invited — TuranEliteLimo";
  }, []);

  const goBook = () => {
    window.location.href = "/#booking";
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <header className="px-6 py-5 border-b border-white/5">
        <a href="/" className="flex items-center gap-3 w-fit" data-testid="referral-redirect-home">
          <Logo size={36} />
          <span className="tracking-wide text-base">TuranEliteLimo</span>
        </a>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-md text-center" data-testid="referral-redirect-card">
          <p className="text-[#D4AF37] text-xs tracking-[0.35em] uppercase mb-5">
            You&apos;re invited
          </p>

          {state.loading ? (
            <p className="text-white/60 text-base">Checking your invite…</p>
          ) : state.valid ? (
            <>
              <h1 className="text-3xl sm:text-4xl font-light tracking-tight leading-tight">
                {state.referrerName ? (
                  <>
                    <span className="italic text-[#D4AF37]">{state.referrerName}</span> sent you{" "}
                    <span className="italic text-[#D4AF37]">$20 off</span> your first ride
                  </>
                ) : (
                  <>
                    Welcome! <span className="italic text-[#D4AF37]">$20 off</span> your first ride
                  </>
                )}
              </h1>
              <p className="text-white/55 text-sm mt-6 leading-relaxed">
                Promo code <span className="text-[#D4AF37] font-mono">WELCOME20</span> is locked in
                for your account. Book any chauffeur trip and we&apos;ll deduct $20 at checkout.
              </p>
              <button
                data-testid="referral-redirect-book"
                onClick={goBook}
                className="inline-flex items-center gap-2 px-7 py-3.5 mt-10 rounded-full bg-[#D4AF37] text-black font-medium hover:opacity-90 transition shadow-[0_8px_30px_rgba(212,175,55,0.35)]"
              >
                Start Booking →
              </button>
              <p className="text-white/35 text-xs mt-6">
                When you complete your first ride, {state.referrerName ? state.referrerName : "your friend"} earns a $25-off promo too.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-3xl sm:text-4xl font-light tracking-tight leading-tight">
                This invite link <span className="italic text-[#D4AF37]">isn&apos;t valid</span>
              </h1>
              <p className="text-white/55 text-sm mt-6 leading-relaxed">
                It may have expired or the code was mistyped. You can still book a chauffeur ride and use any active promo.
              </p>
              <button
                data-testid="referral-redirect-book-fallback"
                onClick={goBook}
                className="inline-flex items-center gap-2 px-7 py-3.5 mt-10 rounded-full border border-white/20 text-white hover:bg-white/5 transition"
              >
                Continue to Booking →
              </button>
            </>
          )}
        </div>
      </main>

      <footer className="px-6 py-6 border-t border-white/5 text-center text-white/35 text-xs">
        TuranEliteLimo · Bay Area & Northern California
      </footer>
    </div>
  );
}
