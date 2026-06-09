import { useEffect, useState } from "react";
import { Gift, Copy, Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

/**
 * "Refer & earn" CTA card. Shown after a customer successfully completes a
 * booking (peak satisfaction moment for asking referrals).
 *
 * Behaviour
 * ---------
 * - If the customer is logged in → fetches their referral code & share URL
 *   and renders the share controls.
 * - If not logged in (guest checkout) → renders a softer prompt that
 *   encourages them to download the app / create an account to unlock
 *   the $25 reward.
 *
 * Silently hides itself on any API failure so it never interferes with the
 * post-payment success page.
 */
export default function ReferralCTA() {
  const [hasToken] = useState(!!localStorage.getItem("customer_token"));
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!hasToken) return;
    let mounted = true;
    api
      .get("/customer/referrals")
      .then((r) => { if (mounted) setData(r.data); })
      .catch(() => { /* silent — never block success UI */ });
    return () => { mounted = false; };
  }, [hasToken]);

  // Guest checkout — softer prompt, no share controls
  if (!hasToken) {
    return (
      <div
        data-testid="referral-cta-guest"
        className="mt-8 max-w-xl mx-auto px-5 py-4 rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-r from-[#1a1305] to-black text-left"
      >
        <div className="flex items-start gap-3">
          <Gift className="w-5 h-5 text-[#D4AF37] mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="text-white">
              Refer a friend and <span className="text-[#D4AF37]">earn $25</span> off your next ride.
            </p>
            <p className="text-white/55 text-xs mt-1">
              Create an account from the app or website to unlock your referral link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Logged-in — render share controls once data arrives
  if (!data?.share_url) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.share_url);
      setCopied(true);
      toast.success("Referral link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — long-press to copy manually");
    }
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Try TuranEliteLimo",
          text: "I use TuranEliteLimo for Bay Area chauffeur rides — here's $20 off your first ride.",
          url: data.share_url,
        });
      } catch {
        // user dismissed share sheet — no-op
      }
    } else {
      copy();
    }
  };

  return (
    <div
      data-testid="referral-cta-card"
      className="mt-10 max-w-xl mx-auto p-6 rounded-2xl border border-[#D4AF37]/30 bg-gradient-to-br from-[#1a1305] to-black"
    >
      <div className="flex items-start gap-3">
        <Gift className="w-6 h-6 text-[#D4AF37] mt-0.5 shrink-0" />
        <div className="text-left flex-1 min-w-0">
          <p className="text-[#D4AF37] text-[10px] tracking-[0.3em] uppercase">Refer & earn</p>
          <h3 className="text-white text-lg mt-1">
            Give <span className="text-[#D4AF37]">$20</span>, get <span className="text-[#D4AF37]">$25</span>
          </h3>
          <p className="text-white/55 text-xs mt-2 leading-relaxed">
            Share with a friend. They get $20 off their first chauffeur ride.
            We email you a $25-off promo the moment they complete it.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col sm:flex-row gap-2">
        <input
          data-testid="referral-cta-link"
          readOnly
          value={data.share_url}
          onFocus={(e) => e.target.select()}
          className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white text-xs font-mono truncate focus:outline-none focus:border-[#D4AF37]/50"
        />
        <button
          type="button"
          data-testid="referral-cta-copy"
          onClick={copy}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#D4AF37] text-black text-sm font-medium hover:opacity-90 transition"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          data-testid="referral-cta-share"
          onClick={nativeShare}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-white/20 text-white text-sm hover:bg-white/5 transition"
        >
          <Share2 className="w-3.5 h-3.5" />
          Share
        </button>
      </div>

      {data.payout_count > 0 ? (
        <p className="text-white/40 text-[11px] mt-4 text-left">
          You&apos;ve earned <span className="text-[#D4AF37]">${data.total_earned_usd ?? 0}</span> from {data.payout_count} successful referral{data.payout_count === 1 ? "" : "s"}.
        </p>
      ) : null}
    </div>
  );
}
