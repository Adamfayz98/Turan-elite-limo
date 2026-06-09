import { useEffect, useState } from "react";
import { Copy, Check, Share2, Gift } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/button";

/**
 * /refer — Logged-in customer's referral page.
 *
 * Shows their unique code, share URL, friend list, total earned, and recent
 * payout promos. If not logged in, prompts them to sign in.
 */
export default function MyReferrals() {
  const [authed, setAuthed] = useState(!!localStorage.getItem("customer_token"));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    document.title = "Refer a Friend — TuranEliteLimo";
  }, []);

  useEffect(() => {
    if (!authed) return;
    let mounted = true;
    setLoading(true);
    api
      .get("/customer/referrals")
      .then((r) => { if (mounted) setData(r.data); })
      .catch(() => { if (mounted) toast.error("Could not load your referral page. Please try again."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [authed]);

  const shareUrl = data?.share_url || "";
  const code = data?.referral_code || "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Referral link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — please long-press the link to copy");
    }
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Try TuranEliteLimo",
          text: "I use TuranEliteLimo for my Bay Area chauffeur rides — here's $20 off your first ride.",
          url: shareUrl,
        });
      } catch {
        // user cancelled, no-op
      }
    } else {
      copy();
    }
  };

  if (!authed) {
    return (
      <Shell>
        <div className="max-w-md mx-auto text-center py-24">
          <Gift className="w-10 h-10 text-[#D4AF37] mx-auto mb-6" />
          <h1 className="text-3xl font-light tracking-tight">
            Sign in to start <span className="italic text-[#D4AF37]">earning $25</span> per friend
          </h1>
          <p className="text-white/55 text-sm mt-5 leading-relaxed">
            Refer a friend. They get $20 off their first ride. You get a $25-off promo when they complete it.
          </p>
          <a
            href="/#booking"
            data-testid="my-referrals-signin"
            className="inline-flex items-center gap-2 px-7 py-3.5 mt-10 rounded-full bg-[#D4AF37] text-black font-medium hover:opacity-90 transition"
          >
            Sign In or Book →
          </a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="max-w-3xl mx-auto py-12">
        <p className="text-[#D4AF37] text-xs tracking-[0.35em] uppercase mb-3">Refer & earn</p>
        <h1 className="text-3xl sm:text-5xl font-light tracking-tight leading-tight">
          Give <span className="italic text-[#D4AF37]">$20</span>, get <span className="italic text-[#D4AF37]">$25</span>
        </h1>
        <p className="text-white/55 text-sm mt-5 max-w-2xl leading-relaxed">
          Share your unique link. Your friend gets $20 off their first ride. When they complete their first trip,
          we email you a $25-off promo. No limit on referrals.
        </p>

        {/* Share card */}
        <div className="mt-12 p-6 sm:p-8 rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-br from-[#1a1305] to-black" data-testid="my-referrals-share-card">
          <p className="text-white/50 text-[10px] tracking-[0.3em] uppercase mb-3">Your referral link</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              data-testid="my-referrals-link-input"
              readOnly
              value={shareUrl}
              onFocus={(e) => e.target.select()}
              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white text-sm font-mono truncate focus:outline-none focus:border-[#D4AF37]/50"
            />
            <Button
              data-testid="my-referrals-copy"
              onClick={copy}
              className="bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-black gap-2 px-5"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              data-testid="my-referrals-share"
              onClick={nativeShare}
              variant="outline"
              className="border-white/20 text-white hover:bg-white/5 gap-2 px-5"
            >
              <Share2 className="w-4 h-4" />
              Share
            </Button>
          </div>
          <p className="text-white/40 text-xs mt-4">
            Code: <span className="text-[#D4AF37] font-mono">{code}</span>
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mt-10" data-testid="my-referrals-stats">
          <Stat label="Friends signed up" value={data?.friend_signups ?? 0} loading={loading} />
          <Stat label="Completed first ride" value={data?.completed_first_rides ?? 0} loading={loading} />
          <Stat label="Earned" value={`$${data?.total_earned_usd ?? 0}`} loading={loading} />
        </div>

        {/* Recent payouts */}
        {data?.recent_payouts?.length > 0 && (
          <div className="mt-12" data-testid="my-referrals-payouts">
            <h2 className="text-xl text-white">Your promo codes</h2>
            <p className="text-white/45 text-xs mt-1">Use these at checkout. Each is single-use.</p>
            <div className="mt-5 space-y-2">
              {data.recent_payouts.map((p, i) => (
                <div
                  key={p.promo_code || i}
                  className="flex items-center justify-between px-5 py-4 rounded-xl border border-white/10 bg-white/[0.03]"
                >
                  <div>
                    <p className="text-[#D4AF37] font-mono text-sm">{p.promo_code}</p>
                    <p className="text-white/40 text-xs mt-1">
                      Earned {p.issued_at ? new Date(p.issued_at).toLocaleDateString() : "—"}
                    </p>
                  </div>
                  <p className="text-white text-base">${p.amount} off</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Friends list */}
        {data?.friends?.length > 0 && (
          <div className="mt-12" data-testid="my-referrals-friends">
            <h2 className="text-xl text-white">Friends you&apos;ve referred</h2>
            <div className="mt-5 grid sm:grid-cols-2 gap-2">
              {data.friends.map((f, i) => (
                <div
                  key={i}
                  className="px-4 py-3 rounded-lg border border-white/10 bg-white/[0.02] text-sm text-white/70"
                >
                  {f.name}{" "}
                  <span className="text-white/30 text-xs ml-1">
                    {f.joined_at ? new Date(f.joined_at).toLocaleDateString() : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Stat({ label, value, loading }) {
  return (
    <div className="p-5 rounded-xl border border-white/10 bg-white/[0.02]">
      <p className="text-white/45 text-[10px] tracking-[0.25em] uppercase mb-2">{label}</p>
      <p className="text-2xl sm:text-3xl text-white font-light">
        {loading ? "…" : value}
      </p>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="px-6 py-5 border-b border-white/5">
        <a href="/" className="flex items-center gap-3 w-fit" data-testid="my-referrals-home">
          <Logo size={36} />
          <span className="tracking-wide text-base">TuranEliteLimo</span>
        </a>
      </header>
      <main className="px-6">{children}</main>
      <footer className="border-t border-white/5 px-6 py-6 text-center text-white/35 text-xs mt-10">
        TuranEliteLimo · Refer & Earn
      </footer>
    </div>
  );
}
