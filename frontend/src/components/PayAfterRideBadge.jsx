import { ShieldCheck } from "lucide-react";

/**
 * Reusable "Book Now · Pay After Ride" trust pill.
 * Used across hero, landing pages, fleet cards, and booking form so the
 * promise is repeated at every decision point in the funnel — this is the
 * single strongest reason customers choose us over competitors right now
 * (per checkout drop-off analysis), so we surface it aggressively.
 *
 * Variants:
 *  - "hero"    — large gold pill for landing hero sections
 *  - "ribbon"  — tiny top-right corner ribbon for vehicle cards
 *  - "inline"  — inline chip for CTAs / trust strips
 *  - "banner"  — full-width strip for landing pages
 */
export default function PayAfterRideBadge({ variant = "inline", className = "", testId }) {
  if (variant === "ribbon") {
    return (
      <span
        data-testid={testId || "pay-after-ride-ribbon"}
        className={`absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full bg-[#D4AF37] text-black text-[9px] font-semibold uppercase tracking-[0.18em] flex items-center gap-1 shadow-[0_2px_8px_rgba(212,175,55,0.4)] ${className}`}
      >
        <ShieldCheck className="w-3 h-3" /> Book Now · Pay After Ride
      </span>
    );
  }

  if (variant === "hero") {
    return (
      <div
        data-testid={testId || "pay-after-ride-hero"}
        className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#D4AF37]/12 border border-[#D4AF37]/45 backdrop-blur-sm ${className}`}
      >
        <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
        <span className="text-[11px] sm:text-xs tracking-[0.18em] uppercase text-[#D4AF37] font-medium">
          Book Now · Pay After Your Ride
        </span>
        <span className="hidden sm:inline text-[10px] text-white/55 tracking-wide">
          No card charged today
        </span>
      </div>
    );
  }

  if (variant === "banner") {
    return (
      <div
        data-testid={testId || "pay-after-ride-banner"}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#D4AF37]/10 via-[#D4AF37]/20 to-[#D4AF37]/10 border-y border-[#D4AF37]/30 ${className}`}
      >
        <ShieldCheck className="w-4 h-4 text-[#D4AF37] flex-shrink-0" />
        <span className="text-xs sm:text-sm text-white/90 text-center">
          <span className="text-[#D4AF37] font-medium">Book now — pay after your ride.</span>
          <span className="text-white/60 ml-1.5">No card charged today · Apple Pay & Google Pay ready.</span>
        </span>
      </div>
    );
  }

  // inline
  return (
    <span
      data-testid={testId || "pay-after-ride-inline"}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#D4AF37]/12 border border-[#D4AF37]/40 text-[#D4AF37] text-[10px] font-semibold uppercase tracking-[0.15em] ${className}`}
    >
      <ShieldCheck className="w-3 h-3" /> Pay After Ride
    </span>
  );
}
