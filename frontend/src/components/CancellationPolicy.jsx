import { useState } from "react";
import { ChevronDown, ShieldCheck, Plane } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cancellation & change policy.
 * Two variants:
 *   - compact (default): collapsible chip for the booking form near submit
 *   - full: always-expanded section for the Manage page / standalone use
 *
 * Pass `airport={true}` to surface the airport-specific flight-delay rules.
 */
export default function CancellationPolicy({ airport = false, variant = "compact" }) {
  const [open, setOpen] = useState(variant === "full");

  return (
    <div
      data-testid="cancellation-policy"
      className={cn(
        "rounded-xl border border-[#27272A] bg-[#0E0E0E]",
        variant === "compact" ? "text-xs" : "text-sm"
      )}
    >
      <button
        type="button"
        onClick={() => variant === "compact" && setOpen((o) => !o)}
        disabled={variant === "full"}
        data-testid="cancellation-policy-toggle"
        className={cn(
          "w-full flex items-center justify-between gap-3 px-4 py-3 text-left",
          variant === "compact" && "cursor-pointer hover:bg-white/[0.02]"
        )}
      >
        <span className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#D4AF37] flex-shrink-0" />
          <span>
            <span className="text-white font-medium">Cancellation &amp; change policy</span>
            <span className="block text-[11px] text-white/55 mt-0.5">
              Free cancellation 24+ hrs before pickup{airport ? " · Flight-delay protection included" : ""}
            </span>
          </span>
        </span>
        {variant === "compact" && (
          <ChevronDown
            className={cn(
              "w-4 h-4 text-white/45 flex-shrink-0 transition-transform",
              open && "rotate-180"
            )}
          />
        )}
      </button>

      {open && (
        <div
          data-testid="cancellation-policy-body"
          className="px-4 pb-4 pt-1 space-y-3 border-t border-[#1F1F1F]"
        >
          <ul className="space-y-1.5 text-white/75 leading-relaxed pl-1">
            <li>
              <span className="text-white font-medium">Free cancellation</span> · 24+ hours before pickup (full refund)
            </li>
            <li>
              <span className="text-white font-medium">50% refund</span> · 12–24 hours before pickup
            </li>
            <li>
              <span className="text-white font-medium">No refund</span> · less than 12 hours before pickup, or no-show
            </li>
            <li>
              <span className="text-white font-medium">Free changes</span> (date / time / vehicle / route) · 6+ hours before pickup
            </li>
          </ul>

          {airport && (
            <div className="pt-3 mt-3 border-t border-dashed border-[#27272A]">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-[#D4AF37] mb-2">
                <Plane className="w-3 h-3" />
                Flight-delay protection
              </div>
              <ul className="space-y-1.5 text-white/70 leading-relaxed pl-1 text-[12px]">
                <li>
                  We <span className="text-white">monitor your flight number</span> in real time — delays auto-adjust your pickup at no extra charge.
                </li>
                <li>
                  Airline <span className="text-white">cancels your flight?</span> Full refund or free re-schedule with proof.
                </li>
                <li>
                  <span className="text-white">15-min free grace</span> after landing (45 min international). Wait time bills at the vehicle's hourly rate after.
                </li>
                <li>
                  No-show 30 min past landing without contact = full charge.
                </li>
              </ul>
            </div>
          )}

          <p className="text-[11px] text-white/45 pt-1">
            Manage or cancel in one click from your confirmation email, or call <span className="text-[#D4AF37]">(650) 410-0687</span>.
          </p>
        </div>
      )}
    </div>
  );
}
