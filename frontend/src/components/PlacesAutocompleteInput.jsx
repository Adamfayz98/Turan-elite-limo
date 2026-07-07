import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Address input with live Google Places autocomplete (proxied through our backend
 * to apply Bay Area / NorCal location bias and avoid CORS / referrer-restriction issues).
 * Renders a dark-themed dropdown of suggestions.
 */
export default function PlacesAutocompleteInput({
  label,
  value,
  onChange,
  testId,
  required = false,
  placeholder,
  strict = true,
}) {
  const [internal, setInternal] = useState(value || "");
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const skipFetch = useRef(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    setInternal(value || "");
  }, [value]);

  useEffect(() => {
    if (skipFetch.current) {
      skipFetch.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = (internal || "").trim();
    if (q.length < 2) {
      setPredictions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/places/autocomplete", { params: { input: q, strict } });
        setPredictions(data.predictions || []);
        setOpen((data.predictions || []).length > 0);
        setActiveIdx(-1);
      } catch {
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [internal, strict]);

  // Click outside to close
  useEffect(() => {
    const onDoc = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selectPrediction = (p) => {
    skipFetch.current = true;
    setInternal(p.description);
    onChange(p.description);
    setOpen(false);
    setPredictions([]);
  };

  const onKeyDown = (e) => {
    if (!open || predictions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(predictions.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      selectPrediction(predictions[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      {label && (
        <Label className="text-white/80 text-xs uppercase tracking-wider">{label}</Label>
      )}
      <div className="relative mt-2">
        <Input
          data-testid={testId}
          required={required}
          value={internal}
          onChange={(e) => {
            setInternal(e.target.value);
            onChange(e.target.value);
          }}
          onFocus={() => predictions.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className={cn(
            "bg-[#0E0E0E] border-[#27272A] text-white placeholder:text-white/40 focus-visible:ring-[#D4AF37] focus-visible:border-[#D4AF37] h-11 pr-10",
          )}
        />
        {loading && (
          <Loader2
            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#D4AF37] animate-spin"
            data-testid={`${testId}-loading`}
          />
        )}
      </div>

      {open && predictions.length > 0 && (
        <div
          data-testid={`${testId}-dropdown`}
          className="absolute z-[150] mt-2 w-full bg-[#0A0A0A] border border-[#27272A] rounded-xl overflow-hidden shadow-2xl"
        >
          {predictions.map((p, i) => (
            <button
              type="button"
              key={p.place_id}
              data-testid={`${testId}-pred-${i}`}
              onClick={() => selectPrediction(p)}
              onMouseEnter={() => setActiveIdx(i)}
              className={cn(
                "w-full text-left px-4 py-3 flex items-start gap-3 transition-colors border-b border-[#1F1F1F] last:border-b-0",
                activeIdx === i ? "bg-[#D4AF37]/10" : "hover:bg-white/5",
              )}
            >
              <MapPin className="w-4 h-4 text-[#D4AF37] mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-white text-sm truncate">{p.main_text}</div>
                {p.secondary_text && (
                  <div className="text-white/50 text-xs truncate mt-0.5">
                    {p.secondary_text}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
