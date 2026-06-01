import { Star, ShieldCheck, MapPin, Undo2 } from "lucide-react";

/**
 * Trust badge banner shown directly under the hero. Designed to reassure
 * first-time visitors (especially ad-driven traffic) with the four trust
 * signals most likely to overcome booking hesitation.
 */
const BADGES = [
  { icon: Star, label: "5-Star Rated", testid: "trust-badge-rating" },
  { icon: ShieldCheck, label: "Licensed & Insured (TCP)", testid: "trust-badge-licensed" },
  { icon: MapPin, label: "Live Driver Tracking", testid: "trust-badge-tracking" },
  { icon: Undo2, label: "Free Cancellation 24h+", testid: "trust-badge-cancel" },
];

export default function TrustBanner() {
  return (
    <section
      data-testid="trust-banner"
      className="bg-[#0a0a0a] border-y border-white/10"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-6">
        <ul className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
          {BADGES.map(({ icon: Icon, label, testid }) => (
            <li
              key={label}
              data-testid={testid}
              className="flex items-center gap-3 text-white/85"
            >
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 shrink-0">
                <Icon className="w-4 h-4 text-[#D4AF37]" />
              </span>
              <span className="text-sm leading-tight">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
