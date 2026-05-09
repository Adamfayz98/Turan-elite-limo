import { Users, Briefcase, Phone as PhoneIcon, Sparkles, Check } from "lucide-react";

import { FLEET } from "@/lib/fleet";
import { cn } from "@/lib/utils";

/**
 * Fleet grid that doubles as the vehicle selector inside BookingForm.
 * Each card shows live price (from /api/quote) — or "Call for quote",
 * or "Enter trip for price" if pickup/dropoff aren't filled yet.
 */
export default function FleetPicker({ quote, selected, onSelect }) {
  const quoteByVehicle = (quote?.quotes || []).reduce((acc, q) => {
    acc[q.vehicle_type] = q;
    return acc;
  }, {});

  return (
    <div data-testid="fleet-picker" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {FLEET.map((v) => {
        const q = quoteByVehicle[v.name];
        const isSelected = selected === v.name;
        const callOnly = q && q.price == null;
        const hasPrice = q && q.price != null;

        return (
          <button
            type="button"
            key={v.name}
            data-testid={`vehicle-card-${v.name}`}
            onClick={() => onSelect(v.name)}
            className={cn(
              "group relative overflow-hidden rounded-2xl border bg-[#0A0A0A] text-left transition-all duration-300",
              "h-72 flex flex-col justify-end",
              isSelected
                ? "border-[#D4AF37] ring-2 ring-[#D4AF37]/40 shadow-[0_0_30px_rgba(212,175,55,0.15)]"
                : "border-[#1F1F1F] hover:border-[#D4AF37]/40"
            )}
          >
            {/* Image */}
            <img
              src={v.img}
              alt={v.name}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover opacity-65 group-hover:opacity-85 group-hover:scale-105 transition-all duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/10" />

            {/* Selected ribbon */}
            {isSelected && (
              <div className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full bg-[#D4AF37] text-black text-[10px] font-semibold uppercase tracking-[0.2em] flex items-center gap-1">
                <Check className="w-3 h-3" /> Selected
              </div>
            )}

            {/* Content */}
            <div className="relative z-[1] p-5">
              <div className="flex items-center gap-2 text-[#D4AF37]/90 text-[10px]">
                <Sparkles className="w-3 h-3" />
                <span className="uppercase tracking-[0.25em]">{v.model}</span>
              </div>
              <h3 className="font-serif text-2xl mt-1.5 leading-tight">{v.name}</h3>
              <p className="text-xs text-white/60 mt-1.5 line-clamp-2">{v.note}</p>

              <div className="mt-3 flex items-center gap-4 text-[11px] text-white/70">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3 h-3 text-[#D4AF37]" /> {v.pax}
                </span>
                <span className="flex items-center gap-1.5">
                  <Briefcase className="w-3 h-3 text-[#D4AF37]" /> {v.bags}
                </span>
              </div>

              {/* Price chip */}
              <div className="mt-3 pt-3 border-t border-white/10">
                {hasPrice && (
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-white/50">
                        Estimated flat rate
                      </div>
                      <div className="font-serif text-2xl text-white mt-0.5">
                        {q.formatted_price}
                      </div>
                    </div>
                    <span className="text-[10px] text-white/40">incl. fare</span>
                  </div>
                )}
                {callOnly && (
                  <div className="flex items-center gap-2 text-[#D4AF37]">
                    <PhoneIcon className="w-4 h-4" />
                    <span className="font-serif text-lg gold-text">Call for quote</span>
                  </div>
                )}
                {!q && (
                  <div className="text-[11px] text-white/45 italic">
                    Enter pickup & drop-off above for an instant rate
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
