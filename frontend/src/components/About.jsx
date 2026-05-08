import { Award, ShieldCheck, MapPinned, HeadphonesIcon } from "lucide-react";

const STATS = [
  { v: "1,500+", l: "5-star reviews" },
  { v: "12+", l: "Years on the road" },
  { v: "30+", l: "NorCal cities" },
  { v: "24/7", l: "Live dispatch" },
];

const PILLARS = [
  {
    icon: Award,
    title: "Presentable, professional, courteous",
    text: "Every chauffeur is suited, trained, background-checked, and ready to anticipate your needs — not just react to them.",
  },
  {
    icon: ShieldCheck,
    title: "Fully licensed & insured",
    text: "TCP-compliant, commercially insured fleet. Your safety is the line we never blur.",
  },
  {
    icon: MapPinned,
    title: "Bay Area natives",
    text: "Our chauffeurs know every back road from the Embarcadero to the Napa hills — no GPS guesswork.",
  },
  {
    icon: HeadphonesIcon,
    title: "Real humans, around the clock",
    text: "Reach a live reservationist day or night — no bots, no menus, no hold music.",
  },
];

export default function About() {
  return (
    <section
      id="about"
      data-testid="about-section"
      className="relative py-24 md:py-32 px-6 md:px-10 border-t border-white/5"
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-16 items-start">
          <div className="lg:col-span-5 lg:sticky lg:top-32">
            <span className="text-xs tracking-[0.3em] uppercase text-[#D4AF37]">About Turonlimo</span>
            <h2 className="font-serif text-4xl md:text-5xl mt-6 leading-tight">
              A boutique chauffeur house, <span className="italic">built for the Bay.</span>
            </h2>
            <p className="mt-6 text-white/65 leading-relaxed">
              Turonlimo started with a single black sedan and a simple promise: never make the client wait, never cut a corner, never lose composure. A decade later, that promise still drives every reservation we accept.
            </p>
            <p className="mt-4 text-white/65 leading-relaxed">
              We are not a ride-hailing app. We are not a fleet of strangers. We are a curated team of career chauffeurs, dispatchers and detailers — accountable, present, and proud of every door we open.
            </p>

            <div className="grid grid-cols-2 gap-6 mt-12">
              {STATS.map((s) => (
                <div key={s.l} data-testid={`about-stat-${s.l}`} className="border-l border-[#D4AF37]/40 pl-4">
                  <div className="font-serif text-3xl md:text-4xl gold-text">{s.v}</div>
                  <div className="text-xs uppercase tracking-[0.2em] text-white/50 mt-2">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 grid sm:grid-cols-2 gap-5">
            {PILLARS.map((p, i) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.title}
                  data-testid={`about-pillar-${i}`}
                  className="p-7 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] hover:border-[#D4AF37]/40 transition-all"
                >
                  <Icon className="w-6 h-6 text-[#D4AF37]" />
                  <h3 className="font-serif text-xl mt-5">{p.title}</h3>
                  <p className="text-sm text-white/60 mt-3 leading-relaxed">{p.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
