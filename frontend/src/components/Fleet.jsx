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
  "Mini Coach": "lg:col-span-2 lg:row-span-1",
  "Motor Coach": "lg:col-span-3 lg:row-span-1",
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
                className="absolute inset-0 w-full h-full object-cover object-center opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
              />
              {/* Subtle bottom fade only — keeps the vehicle body visible.
                  A deeper fade appears on hover to reveal the detail text. */}
              <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none transition-all duration-500 group-hover:h-2/3 group-hover:from-black group-hover:via-black/70" />

              {/* Always-visible label — compact bar pinned to bottom-left. */}
              <div className="relative h-full flex flex-col justify-end p-4 md:p-5">
                <h3 className="font-serif text-xl md:text-2xl leading-tight">{v.name}</h3>
                <div className="mt-1.5 flex items-center gap-4 text-[11px] text-white/75">
                  <div className="flex items-center gap-1">
                    <Users className="w-3 h-3 text-[#D4AF37]" />
                    <span>{v.pax} pax</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Briefcase className="w-3 h-3 text-[#D4AF37]" />
                    <span>{v.bags} bags</span>
                  </div>
                </div>

                {/* Hover-revealed detail — model + description slide up.
                    Hidden by default so the vehicle stays visible. */}
                <div className="max-h-0 opacity-0 overflow-hidden group-hover:max-h-40 group-hover:opacity-100 group-hover:mt-3 transition-all duration-500">
                  <div className="flex items-center gap-1.5 text-[#D4AF37]/90 text-[10px] mb-1.5">
                    <Sparkles className="w-3 h-3" />
                    <span className="uppercase tracking-[0.18em]">{v.model}</span>
                  </div>
                  <p className="text-xs text-white/70 leading-relaxed max-w-md">{v.note}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
