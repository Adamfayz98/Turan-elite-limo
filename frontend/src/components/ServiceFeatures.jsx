import { Briefcase, Plane, Heart, Clock, Check } from "lucide-react";

const COLUMNS = [
  {
    icon: Clock,
    title: "Hourly Transportation",
    items: [
      "Flight tracking included",
      "Complimentary meet & greet",
      "24/7 live dispatch",
      "Easy account setup & payment",
      "Email confirmation for every reservation",
    ],
  },
  {
    icon: Briefcase,
    title: "Corporate Travel",
    items: [
      "Affordable transportation managed by specialists",
      "Competitive corporate rates",
      "Fully licensed and insured service",
      "Efficient scheduling for smooth events",
      "Hourly services for tours and conferences",
    ],
  },
  {
    icon: Plane,
    title: "Airport Pickup + Drop-off",
    items: [
      "Real-time flight tracking",
      "Meet & Greet service available",
      "60-min complimentary wait time",
      "24/7 live dispatch",
      "Email confirmation for every reservation",
    ],
  },
  {
    icon: Heart,
    title: "Weddings & Group Transportation",
    items: [
      "Personalized itineraries for your special day",
      "Pristine limousines, SUVs, shuttles & buses",
      "Coordinators ensure seamless guest transport",
      "Available packages and discounts",
      "Email confirmation for every reservation",
    ],
  },
];

export default function ServiceFeatures() {
  return (
    <section
      data-testid="service-features"
      className="relative py-24 md:py-32 px-6 md:px-10 border-t border-white/5 bg-[#070707]"
    >
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs tracking-[0.3em] uppercase text-[#D4AF37]">What's Included</span>
          <h2 className="font-serif text-4xl md:text-5xl mt-6">
            Every ride. <span className="italic">Every detail.</span>
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {COLUMNS.map((c, i) => {
            const Icon = c.icon;
            return (
              <div
                key={c.title}
                data-testid={`feature-col-${i}`}
                className="p-7 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] hover:border-[#D4AF37]/40 transition-all"
              >
                <div className="w-11 h-11 rounded-full border border-[#D4AF37]/30 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-[#D4AF37]" />
                </div>
                <h3 className="font-serif text-xl mt-5 leading-tight">{c.title}</h3>
                <ul className="mt-5 space-y-3">
                  {c.items.map((it) => (
                    <li key={it} className="flex items-start gap-2 text-sm text-white/70 leading-relaxed">
                      <Check className="w-4 h-4 text-[#D4AF37] mt-0.5 flex-shrink-0" />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
