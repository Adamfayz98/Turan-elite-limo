// pricingReference.js — single source of truth for affiliate net rates &
// recommended margin bands. Powers the Profit Preview Chip in
// Admin → Quote Requests. Edit alongside /app/memory/PRICING_REFERENCE.md
// when rates change.
//
// Margin targets (industry-standard for affiliate brokerage):
//   FLOOR    20%   — walk away below this, or pivot to a cheaper vehicle
//   TARGET   27.5% — recommended quote (sweet spot)
//   PREMIUM  35%   — top of market, use when customer isn't price-shopping

export const MARGIN_FLOOR = 0.20;
export const MARGIN_TARGET = 0.275;
export const MARGIN_PREMIUM = 0.35;

// Net rates ($/hr) keyed by lowercased vehicle_type. Add or update entries
// when you confirm new affiliate rates — and update the Markdown doc.
//
// `min_hours` = minimum billable hours from the affiliate.
// `flat_rate_capable` = vehicle commonly does flat-rate transfers (sedan/SUV).
// Last-rate-confirmed dates help us spot stale numbers.
export const AFFILIATE_NET_RATES = {
  "executive sedan":         { hourly: 75,  min_hours: 1, flat_rate_capable: true,  confirmed: null },
  "first class":             { hourly: 95,  min_hours: 1, flat_rate_capable: true,  confirmed: null },
  "luxury suv":              { hourly: 95,  min_hours: 1, flat_rate_capable: true,  confirmed: null },
  "sprinter van":            { hourly: 110, min_hours: 3, flat_rate_capable: false, confirmed: null },
  "executive sprinter":      { hourly: 125, min_hours: 3, flat_rate_capable: false, confirmed: null },
  "jet sprinter":            { hourly: 145, min_hours: 3, flat_rate_capable: false, confirmed: null },
  "limo style sprinter":     { hourly: 170, min_hours: 4, flat_rate_capable: false, confirmed: "2026-02-27" },
  "limo-style sprinter":     { hourly: 170, min_hours: 4, flat_rate_capable: false, confirmed: "2026-02-27" },
  "stretch limousine":       { hourly: 135, min_hours: 3, flat_rate_capable: false, confirmed: null },
  "stretch limo":            { hourly: 135, min_hours: 3, flat_rate_capable: false, confirmed: null },
  "party bus":               { hourly: 200, min_hours: 4, flat_rate_capable: false, confirmed: null },
};

// Look up the net rate for a vehicle. Returns null if we don't have data.
export function lookupNetRate(vehicleType) {
  if (!vehicleType) return null;
  const key = String(vehicleType).toLowerCase().trim();
  return AFFILIATE_NET_RATES[key] || null;
}

// Best-effort parser for the `service_duration` string we store on quotes.
// Customers write things like "4 hours", "4 hrs", "all day", "3.5 hrs",
// "4hr min". Returns null if we can't extract a number.
export function parseHours(serviceDuration) {
  if (!serviceDuration) return null;
  const s = String(serviceDuration).toLowerCase();
  // Handle obvious all-day phrases
  if (/(all\s*day|full\s*day)/.test(s)) return 8;
  const match = s.match(/(\d+(\.\d+)?)/);
  if (!match) return null;
  const n = parseFloat(match[1]);
  if (!isFinite(n) || n <= 0 || n > 24) return null;
  return n;
}

// Given a vehicle + duration (optional), compute the suggested retail bands
// and the suggested affiliate net cost. Falls back to min_hours when the
// customer hasn't specified duration. Returns null when we don't have rate
// data for that vehicle.
export function estimateQuote({ vehicleType, hours }) {
  const rate = lookupNetRate(vehicleType);
  if (!rate) return null;
  const billableHours = Math.max(hours || rate.min_hours, rate.min_hours);
  const net = rate.hourly * billableHours;
  return {
    net,
    billable_hours: billableHours,
    min_hours: rate.min_hours,
    hourly: rate.hourly,
    floor: Math.round(net / (1 - MARGIN_FLOOR)),
    target: Math.round(net / (1 - MARGIN_TARGET)),
    premium: Math.round(net / (1 - MARGIN_PREMIUM)),
    confirmed: rate.confirmed,
  };
}

// Compute live margin for a given retail/net pair. Returns null if either
// is missing/zero. Margin can be negative — caller decides how to display.
export function computeMargin(retail, net) {
  const r = Number(retail);
  const n = Number(net);
  if (!isFinite(r) || !isFinite(n) || r <= 0) return null;
  return {
    profit: r - n,
    margin_pct: (r - n) / r,
  };
}

// Bucket a margin % into a color-coded band for UI signaling.
// red    : < 20% (below floor)
// yellow : 20–27.5% (acceptable)
// green  : 27.5–35% (target)
// gold   : > 35% (premium)
export function marginBand(marginPct) {
  if (marginPct == null || !isFinite(marginPct)) return "neutral";
  if (marginPct < MARGIN_FLOOR) return "red";
  if (marginPct < MARGIN_TARGET) return "yellow";
  if (marginPct < MARGIN_PREMIUM) return "green";
  return "gold";
}

// Currency formatter shared across pricing UI.
export const fmtMoney = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n || 0));

export const fmtPct = (n) => {
  if (n == null || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
};
