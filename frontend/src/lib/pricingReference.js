// pricingReference.js — single source of truth for affiliate net rates &
// recommended margin bands. Powers the Profit Preview Chip in
// Admin → Quote Requests AND the Vehicle Picker. Edit alongside
// /app/memory/PRICING_REFERENCE.md when rates change.
//
// Each vehicle entry also carries pax + formality data so the Vehicle Picker
// can match a customer's needs to the right offering.

export const MARGIN_FLOOR = 0.20;
export const MARGIN_TARGET = 0.275;
export const MARGIN_PREMIUM = 0.35;

// Net rates ($/hr) keyed by lowercased vehicle_type. Each entry includes:
//   • hourly: affiliate's per-hour net cost
//   • min_hours: minimum billable hours from the affiliate
//   • min_pax / max_pax: comfortable seating range
//   • formality: "formal" | "party" | "both" (drives Vehicle Picker filter)
//   • tier: "sedan" | "suv" | "sprinter" | "limo" | "coach" | "bus"
//   • description: short pitch line used in the picker output
export const AFFILIATE_NET_RATES = {
  "executive sedan":         { hourly: 75,  min_hours: 1, min_pax: 1,  max_pax: 4,  formality: "formal", tier: "sedan",    description: "Cadillac XTS / Lincoln-class executive sedan. Airport, point-to-point, corporate.", flat_rate_capable: true,  confirmed: null },
  "first class":             { hourly: 95,  min_hours: 1, min_pax: 1,  max_pax: 4,  formality: "formal", tier: "sedan",    description: "Mercedes S-Class / BMW 7-Series. VIP & C-level executive.",                       flat_rate_capable: true,  confirmed: null },
  "luxury suv":              { hourly: 95,  min_hours: 1, min_pax: 1,  max_pax: 7,  formality: "formal", tier: "suv",      description: "Cadillac Escalade / Suburban / Yukon. Group airport, family, ski trips.",         flat_rate_capable: true,  confirmed: null },
  "sprinter van":            { hourly: 110, min_hours: 3, min_pax: 8,  max_pax: 15, formality: "formal", tier: "sprinter", description: "Standard Mercedes Sprinter, captain seating. Budget group transport.",            flat_rate_capable: false, confirmed: null },
  "executive sprinter":      { hourly: 125, min_hours: 3, min_pax: 8,  max_pax: 14, formality: "formal", tier: "sprinter", description: "Premium captain leather, climate, USB. Weddings, corporate, wine tours.",        flat_rate_capable: false, confirmed: null },
  "jet sprinter":            { hourly: 145, min_hours: 3, min_pax: 6,  max_pax: 10, formality: "formal", tier: "sprinter", description: "First-class recliners, conference table. Long-distance executive trips.",       flat_rate_capable: false, confirmed: null },
  "limo style sprinter":     { hourly: 170, min_hours: 4, min_pax: 8,  max_pax: 14, formality: "party",  tier: "sprinter", description: "Leather wraparound, club LED, mini-bar, premium sound. Birthdays, bachelorettes.", flat_rate_capable: false, confirmed: "2026-02-27" },
  "limo-style sprinter":     { hourly: 170, min_hours: 4, min_pax: 8,  max_pax: 14, formality: "party",  tier: "sprinter", description: "Leather wraparound, club LED, mini-bar, premium sound. Birthdays, bachelorettes.", flat_rate_capable: false, confirmed: "2026-02-27" },
  "stretch limousine":       { hourly: 135, min_hours: 3, min_pax: 6,  max_pax: 10, formality: "party",  tier: "limo",     description: "Classic stretch with bar + mood lighting. Prom, traditional wedding getaway.",   flat_rate_capable: false, confirmed: null },
  "stretch limo":            { hourly: 135, min_hours: 3, min_pax: 6,  max_pax: 10, formality: "party",  tier: "limo",     description: "Classic stretch with bar + mood lighting. Prom, traditional wedding getaway.",   flat_rate_capable: false, confirmed: null },
  "party bus":               { hourly: 200, min_hours: 4, min_pax: 14, max_pax: 30, formality: "party",  tier: "bus",      description: "Dance floor, full bar, club lighting, sound. Bachelor/ette, big celebrations.",  flat_rate_capable: false, confirmed: null },
  "limo coach":              { hourly: 220, min_hours: 4, min_pax: 14, max_pax: 20, formality: "party",  tier: "bus",      description: "Lounge-style seating, premium bar, club lighting. Upscale weddings, premium parties.", flat_rate_capable: false, confirmed: null },
  "mini coach":              { hourly: 165, min_hours: 3, min_pax: 14, max_pax: 28, formality: "formal", tier: "coach",    description: "High-back coach seats, AC. Wedding guest shuttles, corporate events.",            flat_rate_capable: false, confirmed: null },
  "motor coach":             { hourly: 220, min_hours: 5, min_pax: 25, max_pax: 56, formality: "formal", tier: "coach",    description: "Full-size 40–56 passenger charter bus. Reclining seats, restroom, PA, luggage bay. Corporate roadshows, weddings, tours.", flat_rate_capable: true, confirmed: null },
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

// ----------------------------------------------------------------------
// Vehicle Picker — given pax + formality preference, returns ranked matches.
// Used by the in-admin Vehicle Picker tool so the operator doesn't have to
// keep all the capacity/formality mapping in their head.
//
// Inputs:
//   pax          - integer headcount
//   formality    - "formal" (wedding/corporate) | "party" (birthday/bachelorette) | "either"
//   hours        - optional, used for margin math preview
// Returns array sorted by best fit (snug-not-cramped, formality match):
//   [{ key, info, retail_floor, retail_target, retail_premium, fit_note }]
// ----------------------------------------------------------------------
export function pickVehicles({ pax, formality = "either", hours = null }) {
  const numPax = Number(pax) || 0;
  if (!numPax) return [];

  const results = [];
  // De-dupe synonym keys (limo style / limo-style) by tracking already-seen vehicle descriptions
  const seenDesc = new Set();

  for (const [key, info] of Object.entries(AFFILIATE_NET_RATES)) {
    if (seenDesc.has(info.description)) continue;
    seenDesc.add(info.description);

    // Capacity filter — vehicle must fit pax, with up to 2 over (tight) flagged
    if (numPax > info.max_pax + 2) continue;       // Far too small
    if (numPax < info.min_pax) continue;            // Far too large (overkill)

    // Formality filter (relaxed: "either" picks both formal+party)
    if (formality !== "either" && info.formality !== formality && info.formality !== "both") {
      continue;
    }

    // Compute retail bands (using min_hours as the default duration if not supplied)
    const billable = Math.max(Number(hours) || info.min_hours, info.min_hours);
    const net = info.hourly * billable;
    const floor = Math.round(net / (1 - MARGIN_FLOOR));
    const target = Math.round(net / (1 - MARGIN_TARGET));
    const premium = Math.round(net / (1 - MARGIN_PREMIUM));

    // Fit note — tells operator if vehicle is snug, ideal, or roomy
    let fit_note = "";
    let fit_score = 0;
    if (numPax > info.max_pax) {
      fit_note = `Tight — ${numPax} pax in ${info.max_pax}-seat. Consider an upgrade.`;
      fit_score = 1;
    } else if (numPax === info.max_pax) {
      fit_note = `Snug fit · ${numPax} pax in ${info.max_pax}-seat`;
      fit_score = 2;
    } else if (numPax >= info.max_pax - 2) {
      fit_note = `Ideal fit · ${numPax} pax in ${info.max_pax}-seat (room to stretch)`;
      fit_score = 4;
    } else if (numPax >= info.min_pax) {
      fit_note = `Roomy · ${info.max_pax}-seat with ${numPax} pax (lots of space)`;
      fit_score = 3;
    }

    // Formality fit (exact match scores higher)
    const formality_match = formality === info.formality ? 2 : 1;

    results.push({
      key,
      info,
      billable_hours: billable,
      net,
      floor,
      target,
      premium,
      fit_note,
      fit_score,
      formality_match,
      // Combined score for ranking — fit dominates, formality is the tiebreaker
      _score: fit_score * 10 + formality_match,
    });
  }

  return results.sort((a, b) => b._score - a._score);
}
