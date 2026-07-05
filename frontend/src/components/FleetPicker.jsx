import { useState } from "react";
import { Users, Briefcase, Phone as PhoneIcon, Sparkles, Check, MessageSquare } from "lucide-react";

import { FLEET } from "@/lib/fleet";
import { cn } from "@/lib/utils";
import QuoteRequestDialog from "@/components/QuoteRequestDialog";
import PayAfterRideBadge from "@/components/PayAfterRideBadge";
import { trackPhoneCall } from "@/lib/googleAdsEvents";

// Vehicles eligible for the "Book Now · Pay After Ride" (Stripe SetupIntent)
// flow. Keep in sync with backend's PAY_AFTER_ELIGIBLE list in payments.py.
const PAY_AFTER_VEHICLES = new Set(["Executive Sedan", "First Class", "Luxury SUV"]);

/**
 * Fleet grid that doubles as the vehicle selector inside BookingForm.
 * Each card shows live price (from /api/quote) — or, for call-only vehicles,
 * a "Request quote" + "Call" dual-button row so customers can choose how
 * they'd like to reach out (form for desktop / younger riders, phone for
 * mobile / older riders).
 */
export default function FleetPicker({ quote, selected, onSelect, supportPhone = "(650) 410-0687" }) {
  const [quoteFor, setQuoteFor] = useState(null);

  const quoteByVehicle = (quote?.quotes || []).reduce((acc, q) => {
    acc[q.vehicle_type] = q;
    return acc;
  }, {});

  const tel = (supportPhone || "").replace(/[^\d+]/g, "");

  return (
    <>
    <div data-testid="fleet-picker" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {FLEET.map((v) => {
        const q = quoteByVehicle[v.name];
        const isSelected = selected === v.name;
        // Always treat configured call-only vehicles as call-only, even before
        // the user enters pickup/dropoff — Party Bus etc. never get a flat rate.
        const callOnly = !!v.callOnly || (q && q.price == null);
        const hasPrice = !v.callOnly && q && q.price != null;

        // Don't make the whole card a button for call-only vehicles — we want
        // dedicated Request / Call buttons inside instead.
        const Tag = callOnly ? "div" : "button";
        const tagProps = callOnly ? {} : { type: "button", onClick: () => onSelect(v.name) };

        return (
          <Tag
            {...tagProps}
            key={v.name}
            data-testid={`vehicle-card-${v.name}`}
            className={cn(
              "group relative overflow-hidden rounded-2xl border bg-[#0A0A0A] text-left transition-all duration-300 flex flex-col",
              isSelected
                ? "border-[#D4AF37] ring-2 ring-[#D4AF37]/40 shadow-[0_0_30px_rgba(212,175,55,0.15)]"
                : "border-[#1F1F1F] hover:border-[#D4AF37]/40",
              !callOnly && "cursor-pointer",
            )}
          >
            {/* Image half — fixed height, vehicle sits fully visible with a soft
                bottom fade only, no text overlay. */}
            <div className="relative h-40 overflow-hidden bg-black">
              <img
                src={v.img}
                alt={v.name}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover object-center opacity-95 group-hover:scale-105 transition-transform duration-700 pointer-events-none"
              />
              <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
              {/* Pay-After-Ride ribbon — only on eligible instant-price vehicles */}
              {!callOnly && PAY_AFTER_VEHICLES.has(v.name) && !isSelected && (
                <PayAfterRideBadge variant="ribbon" testId={`pay-after-ribbon-${v.name}`} />
              )}
              {isSelected && !callOnly && (
                <div className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full bg-[#D4AF37] text-black text-[10px] font-semibold uppercase tracking-[0.2em] flex items-center gap-1">
                  <Check className="w-3 h-3" /> Selected
                </div>
              )}
              {/* Compact name label overlaid on image (bottom-left) so the card
                  is scannable even before you read the info panel. */}
              <div className="absolute left-4 bottom-3 right-4 z-[1]">
                <h3 className="font-serif text-xl leading-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">{v.name}</h3>
              </div>
            </div>

            {/* Info panel — separate opaque section below the image, all text
                lives here so the vehicle is never obscured. */}
            <div className="relative z-[1] p-4 flex-1 flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 text-[#D4AF37]/90 text-[9px] min-w-0">
                  <Sparkles className="w-3 h-3 flex-shrink-0" />
                  <span className="uppercase tracking-[0.18em] line-clamp-1">{v.model}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-white/60 flex-shrink-0">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3 text-[#D4AF37]" /> {v.pax}
                  </span>
                  <span className="flex items-center gap-1">
                    <Briefcase className="w-3 h-3 text-[#D4AF37]" /> {v.bags}
                  </span>
                </div>
              </div>

              <div className="mt-auto">
                {hasPrice && (
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                        Estimated flat rate
                      </div>
                      {q.original_price != null && q.original_price > q.price ? (
                        <div className="mt-0.5">
                          <div className="flex items-baseline gap-2">
                            <span className="text-white/40 text-sm line-through">
                              ${q.original_price.toFixed(2)}
                            </span>
                            <span className="font-serif text-2xl text-[#D4AF37]">
                              {q.formatted_price}
                            </span>
                          </div>
                          {q.applied_promo?.code && (
                            <div
                              data-testid={`promo-badge-${v.name}`}
                              className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[10px] text-[#D4AF37] uppercase tracking-[0.15em]"
                            >
                              Save ${q.discount_amount?.toFixed(2) || "0"} · {q.applied_promo.code}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="font-serif text-2xl text-white mt-0.5">
                          {q.formatted_price}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-white/40">incl. fare</span>
                  </div>
                )}
                {callOnly && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setQuoteFor(v.name); }}
                      data-testid={`request-quote-${v.name}`}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-[#D4AF37] text-black text-[11px] font-semibold uppercase tracking-[0.15em] hover:bg-[#B3922E] transition-colors"
                    >
                      <MessageSquare className="w-3 h-3" /> Quote
                    </button>
                    <a
                      href={`tel:${tel}`}
                      onClick={(e) => { e.stopPropagation(); trackPhoneCall({ source: `fleet-${v.name}` }); }}
                      data-testid={`call-vehicle-${v.name}`}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-transparent border border-[#D4AF37]/40 text-[#D4AF37] text-[11px] font-semibold uppercase tracking-[0.15em] hover:bg-[#D4AF37]/10 transition-colors"
                    >
                      <PhoneIcon className="w-3 h-3" /> Call
                    </a>
                  </div>
                )}
                {!q && !callOnly && (
                  <div className="text-[11px] text-white/45 italic">
                    Enter pickup & drop-off above for an instant rate
                  </div>
                )}
              </div>
            </div>
          </Tag>
        );
      })}
    </div>
    <QuoteRequestDialog
      open={!!quoteFor}
      onOpenChange={(v) => !v && setQuoteFor(null)}
      vehicleType={quoteFor || ""}
      supportPhone={supportPhone}
    />
    </>
  );
}
