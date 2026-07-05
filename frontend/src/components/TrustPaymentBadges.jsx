import { ShieldCheck, Star } from "lucide-react";

/**
 * Trust signals row shown at every high-friction moment (pre-Stripe redirect,
 * pay page, booking form submit area). Combines:
 *   1. Wallet accept-marks (Apple Pay, Google Pay, Visa, Mastercard, Amex)
 *      — so customers know they can one-tap pay without typing a card
 *   2. "5-star Google Reviews" text badge WITHOUT any review count
 *      — legally-safe social proof that doesn't reveal our current low count
 *   3. Stripe SSL lock signal
 *
 * Kept as a horizontal, understated strip on purpose — trust signals work
 * best when they feel implied, not bragged about.
 */
export default function TrustPaymentBadges({ compact = false, className = "", testId }) {
  return (
    <div
      data-testid={testId || "trust-payment-badges"}
      className={`flex flex-col items-center gap-2 ${className}`}
    >
      {/* Wallet accept marks — SVG so they render crisp at any size */}
      <div className="flex items-center gap-2.5 flex-wrap justify-center" data-testid="wallet-badges">
        <ApplePayMark compact={compact} />
        <GooglePayMark compact={compact} />
        <VisaMark compact={compact} />
        <MastercardMark compact={compact} />
        <AmexMark compact={compact} />
      </div>

      {/* Social proof + security line */}
      <div className="flex items-center gap-3 text-[10px] text-white/55">
        <span className="flex items-center gap-1" data-testid="google-review-badge">
          <span className="flex" aria-label="5-star rating">
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} className="w-3 h-3 fill-[#D4AF37] text-[#D4AF37]" />
            ))}
          </span>
          <span className="uppercase tracking-[0.15em]">5-Star Google Reviews</span>
        </span>
        <span className="text-white/25">·</span>
        <span className="flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-[#D4AF37]" />
          <span className="uppercase tracking-[0.15em]">Stripe · SSL Secured</span>
        </span>
      </div>
    </div>
  );
}

/* ---------- Wallet marks (SVG, minimal, brand-neutral) ---------- */

const BADGE_BASE =
  "inline-flex items-center justify-center rounded-md border border-white/15 bg-white/[0.06] backdrop-blur-sm select-none";

function ApplePayMark({ compact }) {
  const size = compact ? "h-6 w-11" : "h-7 w-12";
  return (
    <span className={`${BADGE_BASE} ${size}`} title="Apple Pay">
      <svg viewBox="0 0 40 16" className="w-8 h-4 fill-white" xmlns="http://www.w3.org/2000/svg" aria-label="Apple Pay">
        <path d="M5.05 3.4c.3-.4.55-1 .48-1.6-.5.02-1.1.32-1.42.72-.28.35-.55 1-.47 1.55.55.05 1.1-.28 1.4-.67zm.66.7c-.83-.05-1.53.47-1.92.47-.4 0-1.01-.45-1.67-.44-.86.01-1.66.5-2.1 1.28-.9 1.55-.23 3.86.64 5.12.42.62.93 1.32 1.6 1.3.63-.02.87-.41 1.64-.41s.98.41 1.66.4c.68-.01 1.11-.63 1.52-1.26.48-.72.68-1.42.69-1.46-.01-.01-1.33-.51-1.35-2.02-.01-1.26 1.03-1.86 1.08-1.9-.59-.87-1.51-.97-1.79-1zm5.53-1.87v9.29h1.44v-3.17h1.99c1.82 0 3.1-1.25 3.1-3.07s-1.26-3.05-3.06-3.05h-3.47zm1.44 1.22h1.66c1.24 0 1.95.66 1.95 1.84 0 1.17-.71 1.85-1.96 1.85h-1.65V3.44zm7.66 8.14c.9 0 1.74-.46 2.12-1.19h.03v1.12h1.34V7.4c0-1.35-1.08-2.22-2.75-2.22-1.54 0-2.68.88-2.72 2.1h1.3c.11-.58.65-.96 1.38-.96.9 0 1.4.42 1.4 1.19v.52l-1.8.11c-1.68.1-2.59.79-2.59 1.98 0 1.2.93 2 2.29 2zm.39-1.11c-.79 0-1.29-.38-1.29-.96 0-.6.48-.95 1.4-1l1.6-.1v.53c0 .89-.75 1.53-1.71 1.53zm5.09 3.63c1.4 0 2.06-.53 2.63-2.15l2.53-7.09h-1.46l-1.7 5.48h-.03l-1.7-5.48h-1.5l2.44 6.77-.13.4c-.22.7-.58.97-1.22.97-.11 0-.34-.01-.42-.03v1.11c.08.02.44.02.56.02z" />
      </svg>
    </span>
  );
}

function GooglePayMark({ compact }) {
  const size = compact ? "h-6 w-11" : "h-7 w-12";
  return (
    <span className={`${BADGE_BASE} ${size}`} title="Google Pay">
      <svg viewBox="0 0 40 16" className="w-8 h-4" xmlns="http://www.w3.org/2000/svg" aria-label="Google Pay">
        <path fill="#4285F4" d="M6.7 8.13v2.83H5.8V4.02h2.36c.6 0 1.11.2 1.53.6.42.4.63.9.63 1.47 0 .58-.21 1.07-.63 1.47-.41.38-.92.57-1.53.57H6.7zm0-3.25v2.4h1.48c.35 0 .65-.12.88-.35a1.15 1.15 0 0 0 .01-1.7 1.2 1.2 0 0 0-.89-.35H6.7z" />
        <path fill="#EA4335" d="M12.32 6.08c.66 0 1.19.17 1.57.53.39.35.58.83.58 1.44v2.91h-.85v-.66h-.04a1.7 1.7 0 0 1-1.47.81c-.5 0-.91-.15-1.24-.44a1.42 1.42 0 0 1-.5-1.11c0-.47.18-.85.53-1.12.35-.29.83-.42 1.42-.42.5 0 .92.09 1.25.28v-.2c0-.3-.12-.56-.36-.77a1.24 1.24 0 0 0-.85-.31c-.49 0-.88.2-1.16.62l-.78-.5c.42-.6 1.05-.9 1.9-.9zm-1.15 3.45c0 .22.1.4.28.55.19.15.42.22.68.22.37 0 .7-.14.99-.42.29-.28.44-.6.44-.98a1.7 1.7 0 0 0-1.11-.32c-.36 0-.66.09-.9.27-.25.17-.38.4-.38.68z" />
        <path fill="#FBBC04" d="M19.7 6.24l-2.97 6.83h-.93l1.1-2.4-1.94-4.43h.98l1.4 3.4h.03l1.37-3.4h.96z" />
        <path fill="#34A853" d="M24.55 7.6c0-.28-.02-.55-.07-.8h-3.83v1.51h2.19a1.9 1.9 0 0 1-.81 1.24v1.02h1.32c.77-.71 1.2-1.75 1.2-2.97z" />
        <path fill="#EA4335" d="M20.65 11.6c1.1 0 2.02-.36 2.7-.99l-1.32-1.02c-.36.24-.83.39-1.38.39-1.06 0-1.96-.71-2.28-1.68h-1.35v1.05a4.07 4.07 0 0 0 3.63 2.25z" />
        <path fill="#FBBC04" d="M18.37 8.3a2.44 2.44 0 0 1 0-1.55V5.7h-1.35a4.07 4.07 0 0 0 0 3.66l1.35-1.06z" />
        <path fill="#4285F4" d="M20.65 4.9c.6 0 1.13.2 1.55.6l1.16-1.15A4.06 4.06 0 0 0 17 5.7l1.35 1.05a2.44 2.44 0 0 1 2.29-1.85z" />
      </svg>
    </span>
  );
}

function VisaMark({ compact }) {
  const size = compact ? "h-6 w-10" : "h-7 w-11";
  return (
    <span className={`${BADGE_BASE} ${size}`} title="Visa">
      <svg viewBox="0 0 40 16" className="w-7 h-4" xmlns="http://www.w3.org/2000/svg" aria-label="Visa">
        <text x="20" y="11.5" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="900" fontStyle="italic" fill="#1a1f71">VISA</text>
      </svg>
    </span>
  );
}

function MastercardMark({ compact }) {
  const size = compact ? "h-6 w-10" : "h-7 w-11";
  return (
    <span className={`${BADGE_BASE} ${size}`} title="Mastercard">
      <svg viewBox="0 0 40 24" className="w-6 h-4" xmlns="http://www.w3.org/2000/svg" aria-label="Mastercard">
        <circle cx="16" cy="12" r="7" fill="#EB001B" />
        <circle cx="24" cy="12" r="7" fill="#F79E1B" />
        <path d="M20 6.6a7 7 0 0 1 0 10.8 7 7 0 0 1 0-10.8z" fill="#FF5F00" />
      </svg>
    </span>
  );
}

function AmexMark({ compact }) {
  const size = compact ? "h-6 w-10" : "h-7 w-11";
  return (
    <span className={`${BADGE_BASE} ${size}`} title="American Express">
      <svg viewBox="0 0 40 16" className="w-7 h-4" xmlns="http://www.w3.org/2000/svg" aria-label="American Express">
        <rect width="40" height="16" fill="#006FCF" />
        <text x="20" y="11" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="5" fontWeight="900" fill="white">AMEX</text>
      </svg>
    </span>
  );
}
