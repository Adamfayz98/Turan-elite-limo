import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { Loader2, Star, CheckCircle2, Heart, ExternalLink, MapPin, Calendar, Car } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Logo from "@/components/Logo";
import { api, formatApiErrorDetail } from "@/lib/api";

const TIP_PRESETS = [10, 20, 30];

export default function PostTrip() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const tipSessionId = params.get("tip_session_id");

  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tipSelection, setTipSelection] = useState(20);
  const [customTip, setCustomTip] = useState(null); // null=preset mode, string=custom mode
  const [tippingNow, setTippingNow] = useState(false);

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);

  const tipConfirmedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/post-trip/${token}`);
      setTrip(data);
      if (data.rating) setRating(data.rating);
    } catch (err) {
      toast.error(
        formatApiErrorDetail(err.response?.data?.detail) || "Trip not found",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Confirm tip after Stripe redirect
  useEffect(() => {
    if (!tipSessionId || tipConfirmedRef.current) return;
    tipConfirmedRef.current = true;
    let attempts = 0;
    const tick = async () => {
      try {
        const { data } = await api.get(
          `/post-trip/${token}/confirm-tip?session_id=${tipSessionId}`,
        );
        if (data.paid) {
          toast.success(`Tip of $${data.tip_amount?.toFixed(2)} sent. Thank you!`);
          await load();
          return;
        }
      } catch (e) {
        console.warn("[PostTrip] tip status poll error, will retry:", e);
      }
      attempts += 1;
      if (attempts < 10) setTimeout(tick, 1500);
    };
    tick();
  }, [tipSessionId, token, load]);

  const tipAmount = customTip !== null ? parseFloat(customTip || 0) : tipSelection;

  const onTip = async () => {
    const amount = tipAmount;
    if (!amount || isNaN(amount) || amount < 1) {
      toast.error("Enter a tip of $1 or more");
      return;
    }
    setTippingNow(true);
    try {
      const { data } = await api.post(`/post-trip/${token}/tip-checkout`, {
        amount,
        origin_url: window.location.origin,
      });
      window.location.href = data.url;
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not start tip checkout");
      setTippingNow(false);
    }
  };

  const onSubmitRating = async () => {
    if (rating < 1) {
      toast.error("Pick a star rating first");
      return;
    }
    setSubmittingRating(true);
    try {
      await api.post(`/post-trip/${token}/rate`, {
        rating,
        feedback: feedback.trim() || null,
      });
      toast.success("Thanks for your feedback!");
      await load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Could not submit rating");
    } finally {
      setSubmittingRating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" />
      </div>
    );
  }
  if (!trip) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white">
        <div className="text-center">
          <h1 className="font-serif text-3xl">Trip not found</h1>
          <Link to="/" className="text-[#D4AF37] mt-4 inline-block">
            ← Back to TuranEliteLimo
          </Link>
        </div>
      </div>
    );
  }

  const tipPaid = !!trip.tip_paid_at;
  const rated = !!trip.rated_at;
  const showHighStarCTA = rated && rating >= 4;
  const showLowStarThanks = rated && rating < 4;

  return (
    <main data-testid="post-trip-page" className="min-h-screen bg-[#050505] text-white">
      <header className="px-6 md:px-10 h-20 flex items-center border-b border-white/10">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo size={32} className="text-[#D4AF37]" />
          <span className="font-serif text-2xl">
            Turan<span className="gold-text">EliteLimo</span>
          </span>
        </Link>
      </header>

      <div className="max-w-2xl mx-auto px-5 md:px-6 py-10 md:py-14">
        {/* Hero */}
        <div className="text-center mb-10">
          <span className="text-xs tracking-[0.3em] uppercase text-[#D4AF37]">
            Trip complete
          </span>
          <h1 className="font-serif text-4xl md:text-5xl mt-3">
            Thanks for riding, {trip.full_name?.split(" ")[0] || "friend"}.
          </h1>
          {trip.driver_name && (
            <p className="text-white/55 mt-3">
              Your chauffeur <span className="text-[#D4AF37]">{trip.driver_name}</span> hopes you had a smooth ride.
            </p>
          )}
        </div>

        {/* Trip summary */}
        <div className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-6 md:p-7 mb-8">
          <div className="flex items-center gap-2 text-[#D4AF37] text-[10px] tracking-[0.25em] uppercase mb-4">
            <span>Trip summary</span>
            {trip.confirmation_number && (
              <span className="ml-auto font-mono text-white/65">{trip.confirmation_number}</span>
            )}
          </div>
          <Row icon={Calendar} value={`${trip.pickup_date} · ${trip.pickup_time}`} />
          <Row icon={MapPin} value={trip.pickup_location} />
          <Row icon={MapPin} value={`→ ${trip.dropoff_location}`} />
          <Row icon={Car} value={trip.vehicle_type} />
        </div>

        {/* Tip Section */}
        <section
          data-testid="tip-section"
          className="rounded-2xl border border-[#D4AF37]/30 bg-gradient-to-b from-[#D4AF37]/[0.04] to-[#0A0A0A] p-6 md:p-8 mb-8"
        >
          {tipPaid ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3">
                <Heart className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="font-serif text-2xl">
                ${trip.tip_amount?.toFixed(2)} tip sent · Thank you
              </div>
              <p className="text-white/55 text-sm mt-2">
                Your chauffeur will receive this directly.
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <Heart className="w-7 h-7 text-[#D4AF37] mx-auto mb-2" />
                <h2 className="font-serif text-2xl md:text-3xl">Tip your chauffeur</h2>
                <p className="text-white/55 text-sm mt-2 max-w-md mx-auto">
                  100% goes directly to {trip.driver_name?.split(" ")[0] || "your driver"} — no fees taken.
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2 md:gap-3 mb-4">
                {TIP_PRESETS.map((amt) => {
                  const active = tipSelection === amt && customTip === null;
                  return (
                    <button
                      key={amt}
                      type="button"
                      data-testid={`tip-preset-${amt}`}
                      onClick={() => { setTipSelection(amt); setCustomTip(null); }}
                      className={`h-16 rounded-xl border transition-all font-serif text-xl md:text-2xl ${
                        active
                          ? "border-[#D4AF37] bg-[#D4AF37]/15 text-[#D4AF37] shadow-[0_0_0_3px_rgba(212,175,55,0.12)]"
                          : "border-white/15 bg-white/[0.02] hover:bg-white/[0.05] text-white/85"
                      }`}
                    >
                      ${amt}
                    </button>
                  );
                })}
                <button
                  type="button"
                  data-testid="tip-preset-custom"
                  onClick={() => { setTipSelection(0); setCustomTip(customTip ?? ""); }}
                  className={`h-16 rounded-xl border transition-all font-medium text-sm md:text-base ${
                    customTip !== null
                      ? "border-[#D4AF37] bg-[#D4AF37]/15 text-[#D4AF37] shadow-[0_0_0_3px_rgba(212,175,55,0.12)]"
                      : "border-white/15 bg-white/[0.02] hover:bg-white/[0.05] text-white/85"
                  }`}
                >
                  Custom
                </button>
              </div>
              {customTip !== null && (
                <div className="mb-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#D4AF37] text-lg font-serif">$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      autoFocus
                      data-testid="tip-custom-input"
                      placeholder="Enter amount"
                      value={customTip}
                      onChange={(e) => setCustomTip(e.target.value)}
                      className="w-full h-14 pl-10 pr-4 rounded-xl bg-[#0E0E0E] border border-[#D4AF37]/40 text-white text-xl placeholder:text-white/35 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]"
                      min="1"
                      max="2000"
                      step="1"
                    />
                  </div>
                </div>
              )}
              <Button
                onClick={onTip}
                disabled={tippingNow || !tipAmount || tipAmount < 1}
                data-testid="tip-submit-button"
                className="w-full bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full h-12 mt-1 font-medium text-base disabled:opacity-50"
              >
                {tippingNow ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Redirecting to Stripe…</>
                ) : tipAmount && tipAmount >= 1 ? (
                  `Send $${tipAmount} tip`
                ) : (
                  "Enter tip amount"
                )}
              </Button>
              <p className="text-center text-[10px] text-white/40 mt-3">
                Secured by Stripe · SSL encrypted
              </p>
            </>
          )}
        </section>

        {/* Rating Section */}
        <section
          data-testid="rating-section"
          className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] p-6 md:p-8"
        >
          {rated ? (
            <>
              <div className="text-center">
                <CheckCircle2 className="w-9 h-9 text-emerald-400 mx-auto mb-2" />
                <div className="font-serif text-2xl">Thanks for rating us!</div>
                <div className="flex justify-center mt-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-5 h-5 ${i < trip.rating ? "fill-[#D4AF37] text-[#D4AF37]" : "text-white/15"}`}
                    />
                  ))}
                </div>
              </div>

              {showHighStarCTA && (trip.yelp_url || trip.google_url) && (
                <div className="mt-6 pt-6 border-t border-white/5">
                  <p className="text-center text-white/75 text-sm mb-4">
                    Loved the ride? A public review helps more people find us.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    {trip.yelp_url && (
                      <a
                        href={trip.yelp_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="post-trip-yelp-link"
                        className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[#D32323] hover:bg-[#B81E1E] text-white font-medium transition-colors"
                      >
                        Review on Yelp <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {trip.google_url && (
                      <a
                        href={trip.google_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="post-trip-google-link"
                        className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-white text-black hover:bg-white/90 font-medium transition-colors"
                      >
                        Review on Google <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {showLowStarThanks && (
                <p className="text-center text-white/55 text-sm mt-5">
                  We've noted your feedback — our owner will personally reach out shortly to make it right.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="text-center mb-5">
                <h2 className="font-serif text-2xl md:text-3xl">How was your ride?</h2>
                <p className="text-white/55 text-sm mt-2">Tap a star</p>
              </div>
              <div
                className="flex justify-center gap-2 mb-5"
                onMouseLeave={() => setHoverRating(0)}
              >
                {[1, 2, 3, 4, 5].map((n) => {
                  const filled = (hoverRating || rating) >= n;
                  return (
                    <button
                      key={n}
                      type="button"
                      data-testid={`star-${n}`}
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHoverRating(n)}
                      className="p-1.5 transition-transform hover:scale-110 active:scale-95"
                    >
                      <Star
                        className={`w-10 h-10 transition-all ${
                          filled
                            ? "fill-[#D4AF37] text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.45)]"
                            : "text-white/15"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
              {rating > 0 && rating < 4 && (
                <Textarea
                  data-testid="rating-feedback"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Sorry we missed the mark — what could we have done better? (Owner reads every note personally.)"
                  rows={4}
                  maxLength={2000}
                  className="bg-[#0E0E0E] border-[#27272A] text-white placeholder:text-white/40 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] mb-4"
                />
              )}
              <Button
                onClick={onSubmitRating}
                disabled={submittingRating || rating < 1}
                data-testid="submit-rating-button"
                className="w-full bg-white text-black hover:bg-white/90 rounded-full h-11 font-medium"
              >
                {submittingRating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit rating"}
              </Button>
            </>
          )}
        </section>

        <p className="text-center text-xs text-white/40 mt-10">
          Questions? Call{" "}
          <a href="tel:+16504100687" className="text-[#D4AF37]">(650) 410‑0687</a>
          {" or email "}
          <a href="mailto:support@turanelitelimo.com" className="text-[#D4AF37]">
            support@turanelitelimo.com
          </a>
        </p>
      </div>
    </main>
  );
}

function Row({ icon: Icon, value }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-t border-white/5 first-of-type:border-t-0">
      <Icon className="w-4 h-4 text-[#D4AF37] mt-0.5 flex-shrink-0" />
      <div className="text-white/90 text-sm">{value}</div>
    </div>
  );
}
