// VehiclePickerDialog.jsx — small admin tool that takes pax + occasion + (optional)
// duration and returns ranked vehicle recommendations with margin bands, so the
// operator doesn't have to keep all the capacity / formality rules in their head.
//
// Pulls data from /lib/pricingReference.js so it stays in sync with the
// Profit Preview Chip and the affiliate-rate documentation. Read-only — no
// API calls, no side effects. Pure decision-support tool.

import { useMemo, useState } from "react";
import { Truck, Users, Calendar, TrendingUp, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { pickVehicles, fmtMoney } from "@/lib/pricingReference";

// Thumbnail map — keys must match AFFILIATE_NET_RATES in /lib/pricingReference.
// We re-use the same fleet shots from /public/fleet (already optimized).
const VEHICLE_THUMB = {
  "executive sedan":      "/fleet/executive-sedan.jpg",
  "first class":          "/fleet/first-class.jpg",
  "luxury suv":           "/fleet/luxury-suv.jpg",
  "sprinter van":         "/fleet/sprinter.jpg",
  "executive sprinter":   "/fleet/sprinter.jpg",
  "jet sprinter":         "/fleet/sprinter.jpg",
  "limo style sprinter":  "/fleet/sprinter.jpg",
  "limo-style sprinter":  "/fleet/sprinter.jpg",
  "stretch limousine":    "/fleet/stretch-limo.jpg",
  "stretch limo":         "/fleet/stretch-limo.jpg",
  "party bus":            "/fleet/party-bus.jpg",
  "limo coach":           "/fleet/party-bus.jpg",
  "mini coach":           "/fleet/sprinter.jpg",
};

// Quick-pick occasion presets so operators don't have to think about formality.
const OCCASIONS = [
  { value: "either",  label: "Any", emoji: "•" },
  { value: "formal",  label: "Wedding", emoji: "💍" },
  { value: "formal",  label: "Airport / Corporate", emoji: "✈️" },
  { value: "formal",  label: "Wine tour (chill)", emoji: "🍇" },
  { value: "party",   label: "Birthday", emoji: "🎂" },
  { value: "party",   label: "Bachelor/ette", emoji: "🥂" },
  { value: "party",   label: "Night out / Club", emoji: "🌃" },
  { value: "party",   label: "Prom", emoji: "🎓" },
];

export function VehiclePickerDialog({ open, onClose }) {
  const [pax, setPax] = useState("");
  const [hours, setHours] = useState("");
  const [formality, setFormality] = useState("either");

  const results = useMemo(() => {
    if (!pax || Number(pax) <= 0) return [];
    return pickVehicles({
      pax: Number(pax),
      formality,
      hours: hours && Number(hours) > 0 ? Number(hours) : null,
    });
  }, [pax, hours, formality]);

  const fitBadge = (fit_score) => {
    if (fit_score >= 4) return { label: "IDEAL", style: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" };
    if (fit_score === 3) return { label: "ROOMY", style: "bg-sky-500/15 text-sky-300 border-sky-500/40" };
    if (fit_score === 2) return { label: "SNUG", style: "bg-amber-500/15 text-amber-300 border-amber-500/40" };
    return { label: "TIGHT", style: "bg-red-500/15 text-red-300 border-red-500/40" };
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        data-testid="vehicle-picker-dialog"
        className="bg-[#0c0c0c] border-[#1f1f1f] text-white max-w-3xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-[#D4AF37]" /> Vehicle Picker
          </DialogTitle>
          <DialogDescription className="text-white/55 leading-relaxed">
            Enter group size + occasion to see ranked vehicle recommendations
            with target retail bands. Powered by your affiliate rate table.
          </DialogDescription>
        </DialogHeader>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 block mb-1.5">
              <Users className="w-3 h-3 inline mr-1" /> Group size
            </label>
            <Input
              data-testid="vp-pax"
              type="number"
              inputMode="numeric"
              min="1"
              placeholder="e.g. 10"
              value={pax}
              onChange={(e) => setPax(e.target.value)}
              className="bg-[#0E0E0E] border-[#27272A] text-white text-lg font-semibold"
              autoFocus
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 block mb-1.5">
              <Calendar className="w-3 h-3 inline mr-1" /> Hours <span className="text-white/35 normal-case tracking-normal">(optional)</span>
            </label>
            <Input
              data-testid="vp-hours"
              type="number"
              inputMode="decimal"
              min="1"
              placeholder="defaults to min"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="bg-[#0E0E0E] border-[#27272A] text-white"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.18em] text-white/45 block mb-1.5">
              Vibe filter
            </label>
            <div className="flex gap-1">
              {[
                { v: "either", label: "Any" },
                { v: "formal", label: "Formal" },
                { v: "party", label: "Party" },
              ].map((f) => (
                <button
                  key={f.v}
                  onClick={() => setFormality(f.v)}
                  data-testid={`vp-formality-${f.v}`}
                  className={`flex-1 text-xs uppercase tracking-wider py-2 rounded border transition ${
                    formality === f.v
                      ? "bg-[#D4AF37] text-black border-[#D4AF37] font-semibold"
                      : "bg-white/[0.03] text-white/55 border-white/10 hover:bg-white/[0.07]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Occasion shortcuts — sets formality based on the picked occasion */}
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 mb-1.5">
            Quick-pick occasion
          </div>
          <div className="flex flex-wrap gap-1.5">
            {OCCASIONS.map((o, i) => (
              <button
                key={i}
                onClick={() => setFormality(o.value)}
                data-testid={`vp-occasion-${o.label.replace(/\s+/g, "-")}`}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                  formality === o.value
                    ? "bg-[#D4AF37]/15 text-[#D4AF37] border-[#D4AF37]/40"
                    : "bg-white/[0.02] text-white/50 border-white/10 hover:bg-white/5"
                }`}
              >
                <span className="mr-1">{o.emoji}</span>{o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="space-y-2 mt-3">
          {!pax ? (
            <div className="text-center py-12 text-white/35 text-sm">
              Enter group size to see recommendations.
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-12 text-white/45 text-sm">
              No vehicles match {pax} pax with the current filter.<br />
              Try changing the vibe filter or check the headcount.
            </div>
          ) : (
            results.map((r, idx) => {
              const badge = fitBadge(r.fit_score);
              const isTop = idx === 0;
              return (
                <div
                  key={r.key}
                  data-testid={`vp-result-${r.key.replace(/\s+/g, "-")}`}
                  className={`rounded-xl border p-3.5 transition ${
                    isTop
                      ? "border-[#D4AF37]/40 bg-gradient-to-r from-[#D4AF37]/[0.07] to-transparent"
                      : "border-white/10 bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-start gap-3 mb-2 flex-wrap">
                    {VEHICLE_THUMB[r.key] && (
                      <img
                        src={VEHICLE_THUMB[r.key]}
                        alt={r.key}
                        loading="lazy"
                        className="w-20 h-16 sm:w-24 sm:h-20 rounded-md object-cover bg-black/40 flex-shrink-0 border border-white/10"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {isTop && <span className="text-[9px] uppercase tracking-wider text-[#D4AF37] font-bold">TOP MATCH</span>}
                        <h4 className="font-semibold text-white capitalize">{r.key}</h4>
                        <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${badge.style}`}>
                          {badge.label}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/55">
                          {r.info.formality === "formal" ? "Formal" : "Party"}
                        </span>
                      </div>
                      <p className="text-xs text-white/55 leading-relaxed">{r.info.description}</p>
                      <p className="text-[11px] text-white/40 mt-1">{r.fit_note} · capacity {r.info.min_pax}–{r.info.max_pax} pax</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mt-2">
                    <div className="rounded-lg bg-white/[0.03] border border-white/10 px-2 py-1.5">
                      <div className="text-[9px] uppercase tracking-wider text-white/40">Net rate</div>
                      <div className="text-sm font-semibold text-white tabular-nums">${r.info.hourly}/hr</div>
                      <div className="text-[9px] text-white/35">{r.billable_hours}h booked</div>
                    </div>
                    <div className="rounded-lg bg-red-500/[0.06] border border-red-500/25 px-2 py-1.5">
                      <div className="text-[9px] uppercase tracking-wider text-red-300/80">Floor 20%</div>
                      <div className="text-sm font-semibold text-red-200 tabular-nums">{fmtMoney(r.floor)}</div>
                    </div>
                    <div className="rounded-lg bg-emerald-500/[0.06] border border-emerald-500/30 px-2 py-1.5">
                      <div className="text-[9px] uppercase tracking-wider text-emerald-300/80">Target 27.5%</div>
                      <div className="text-sm font-semibold text-emerald-200 tabular-nums">{fmtMoney(r.target)}</div>
                    </div>
                    <div className="rounded-lg bg-[#D4AF37]/[0.08] border border-[#D4AF37]/30 px-2 py-1.5">
                      <div className="text-[9px] uppercase tracking-wider text-[#D4AF37]/80">Premium 35%</div>
                      <div className="text-sm font-semibold text-[#D4AF37] tabular-nums">{fmtMoney(r.premium)}</div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer note */}
        <div className="text-[10px] text-white/35 mt-3 leading-relaxed flex items-center gap-2">
          <TrendingUp className="w-3 h-3 text-[#D4AF37]" />
          Rates &amp; capacity sourced from <code className="text-white/55">PRICING_REFERENCE.md</code>. Update it when affiliate rates change so this picker stays accurate.
        </div>

        <div className="flex justify-end mt-2">
          <Button
            onClick={onClose}
            data-testid="vp-close-btn"
            className="bg-white/10 hover:bg-white/15 text-white"
          >
            <X className="w-4 h-4 mr-2" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default VehiclePickerDialog;
