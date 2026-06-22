import { Users, Sparkles, Briefcase } from "lucide-react";
import { FLEET as SHARED_FLEET } from "@/lib/fleet";

// Homepage showcase uses the shared fleet list but applies a custom mosaic
// span layout per card so the grid stays editorial-looking.
const SPAN_BY_NAME = {
  "Executive Sedan": "lg:col-span-2 lg:row-span-2",
  "First Class": "lg:col-span-1 lg:row-span-1",
  "Luxury SUV": "lg:col-span-1 lg:row-span-1",
  "Stretch Limousine": "lg:col-span-2 lg:row-span-1",
  "Sprinter Van": "lg:col-span-1 lg:row-span-1",
  "Party Bus": "lg:col-span-3 lg:row-span-1",
};
const FLEET = SHARED_FLEET.map((v) => ({ ...v, span: SPAN_BY_NAME[v.name] || "" }));

export default function Fleet() {
  return (
    <section id="fleet" data-testid="fleet-section" className="relative py-24 md:py-32 px-6 md:px-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8 mb-16">
          <div>
            <span className="text-xs tracking-[0.3em] uppercase text-[#D4AF37]">03 — The Fleet</span>
            <h2 className="font-serif text-4xl md:text-5xl mt-6 leading-tight max-w-2xl">
              Hand-picked, hand-detailed,
              <br /> <span className="italic">never</span> compromised.
            </h2>
          </div>
          <p className="text-white/60 max-w-md leading-relaxed">
            Every vehicle in our fleet is under three years old, fully insured, and detailed before each ride. From a Cadillac XTS for the suit, to a Hummer Stretch for the night you'll never forget.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:auto-rows-[260px]">
          {FLEET.map((v, i) => (
            <article
              key={v.name}
              data-testid={`fleet-card-${i}`}
              className={`group relative overflow-hidden rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] fleet-card-hover transition-all duration-500 ${v.span}`}
            >
              <img
                src={v.img}
                alt={v.name}
                className="absolute inset-0 w-full h-full object-cover opacity-85 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
              />
              {/* Top + bottom gradient: kills the studio halo on the new fleet shots
                  so the card sits flush on the dark page background. */}
              <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black/70 via-black/25 to-transparent pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
              <div className="relative h-full flex flex-col justify-end p-6 md:p-7">
                <div className="flex items-center gap-2 text-[#D4AF37]/90 text-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="uppercase tracking-[0.2em]">{v.model}</span>
                </div>
                <h3 className="font-serif text-2xl md:text-3xl mt-2">{v.name}</h3>
                <p className="text-sm text-white/65 mt-2 leading-relaxed max-w-md">{v.note}</p>
                <div className="mt-4 flex items-center gap-5 text-xs text-white/70">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>{v.pax} pax</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>{v.bags} bags</span>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
