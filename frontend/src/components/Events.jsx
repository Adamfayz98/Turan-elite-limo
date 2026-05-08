import { Music, Wine, Trophy, Users2, Heart, Briefcase } from "lucide-react";

const EVENTS = [
  { icon: Music, name: "Outside Lands", sub: "Golden Gate Park · Aug" },
  { icon: Wine, name: "BottleRock Napa", sub: "Napa Valley · May" },
  { icon: Heart, name: "Napa Valley Weddings", sub: "Year-round" },
  { icon: Trophy, name: "Dreamforce", sub: "Moscone Center · Sep" },
  { icon: Users2, name: "TechCrunch Disrupt", sub: "SF · Oct" },
  { icon: Briefcase, name: "JPM Healthcare", sub: "SF · Jan" },
  { icon: Music, name: "Hardly Strictly Bluegrass", sub: "Golden Gate · Oct" },
  { icon: Wine, name: "Sonoma Wine Country", sub: "Year-round" },
];

export default function Events() {
  return (
    <section
      id="events"
      data-testid="events-section"
      className="relative py-24 md:py-32 px-6 md:px-10 border-t border-white/5"
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-12 mb-14">
          <div className="lg:col-span-6">
            <span className="text-xs tracking-[0.3em] uppercase text-[#D4AF37]">Events We Cover</span>
            <h2 className="font-serif text-4xl md:text-5xl mt-6 leading-tight">
              Festivals, conferences,
              <br /> <span className="italic">unforgettable nights.</span>
            </h2>
          </div>
          <p className="lg:col-span-6 text-white/60 leading-relaxed self-end">
            From Silicon Valley keynotes to wine-country weddings, we dispatch chauffeurs for the Bay's most coveted events — with concierge logistics for groups of any size.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {EVENTS.map((e, i) => {
            const Icon = e.icon;
            return (
              <div
                key={e.name}
                data-testid={`event-card-${i}`}
                className="group p-6 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] hover:border-[#D4AF37]/40 hover:-translate-y-1 transition-all"
              >
                <div className="w-10 h-10 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center group-hover:bg-[#D4AF37] transition-all">
                  <Icon className="w-4 h-4 text-[#D4AF37] group-hover:text-black" />
                </div>
                <h4 className="font-serif text-lg mt-5">{e.name}</h4>
                <p className="text-xs text-white/50 mt-1">{e.sub}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
