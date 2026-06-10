import { useState } from "react";
import { MessageSquare, X } from "lucide-react";
import PlacesAutocompleteInput from "@/components/PlacesAutocompleteInput";

/**
 * Floating, sticky "Get a Quote in 60 seconds" widget for Google Ads landing
 * pages. Sits bottom-right. Click → expands to mini form. Submit → navigates
 * to /?pickup=X&dropoff=Y&date=Z#booking so the homepage booking form
 * pre-populates and scrolls into view.
 *
 * Purely additive. Does not interfere with any existing CTA on the page.
 */
export default function FloatingQuoteWidget({ testId = "floating-quote" }) {
  const [open, setOpen] = useState(false);
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [date, setDate] = useState("");

  const submit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (pickup.trim()) params.set("pickup", pickup.trim());
    if (dropoff.trim()) params.set("dropoff", dropoff.trim());
    if (date) params.set("date", date);
    const qs = params.toString();
    window.location.href = `/${qs ? `?${qs}` : ""}#booking`;
  };

  // Date minimum: today (YYYY-MM-DD)
  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  if (!open) {
    return (
      <button
        type="button"
        data-testid={`${testId}-launcher`}
        onClick={() => setOpen(true)}
        aria-label="Open quick quote"
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 px-5 py-3.5 rounded-full bg-[#D4AF37] text-black font-medium shadow-[0_10px_40px_rgba(212,175,55,0.45)] hover:opacity-90 hover:scale-[1.03] active:scale-95 transition"
      >
        <MessageSquare className="w-4 h-4" />
        <span className="text-sm">Get Quote · 60 sec</span>
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick quote"
      data-testid={`${testId}-panel`}
      className="fixed bottom-6 right-6 z-40 w-[calc(100vw-3rem)] max-w-sm bg-[#0E0E0E] border border-[#D4AF37]/30 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div>
          <p className="text-[#D4AF37] text-[10px] tracking-[0.3em] uppercase">Quick Quote</p>
          <p className="text-white text-sm mt-0.5">Tell us your trip</p>
        </div>
        <button
          type="button"
          data-testid={`${testId}-close`}
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="text-white/40 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={submit} className="p-5 space-y-3">
        <div>
          <PlacesAutocompleteInput
            label="Pickup"
            value={pickup}
            onChange={setPickup}
            testId={`${testId}-pickup`}
            placeholder="SFO Airport, 1 Hotel SF, etc."
            required
          />
        </div>

        <div>
          <PlacesAutocompleteInput
            label="Drop-off"
            value={dropoff}
            onChange={setDropoff}
            testId={`${testId}-dropoff`}
            placeholder="Napa, Stadium, Office address…"
            required
          />
        </div>

        <div>
          <label className="block text-white/50 text-[10px] tracking-[0.25em] uppercase mb-1.5">
            Date <span className="text-white/30 normal-case tracking-normal">(optional)</span>
          </label>
          <input
            type="date"
            data-testid={`${testId}-date`}
            value={date}
            min={minDate}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#D4AF37]/50 transition"
            style={{ colorScheme: "dark" }}
          />
        </div>

        <button
          type="submit"
          data-testid={`${testId}-submit`}
          className="w-full mt-2 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-[#D4AF37] text-black font-medium hover:opacity-90 transition shadow-[0_8px_30px_rgba(212,175,55,0.35)]"
        >
          See Live Quote →
        </button>

        <p className="text-center text-white/40 text-[11px] mt-2">
          Live flat-rate quote · No surprises · Pay later
        </p>
      </form>
    </div>
  );
}
