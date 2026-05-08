import { Clock3, Car, Crown } from "lucide-react";

const STEPS = [
  {
    icon: Clock3,
    n: "01",
    title: "Choose Your Time",
    text: "Select the date, hour and pickup that fits your schedule — book in under 60 seconds.",
  },
  {
    icon: Car,
    n: "02",
    title: "Select a Vehicle",
    text: "Pick from sedans, SUVs, stretch limos and party buses — every vehicle fully detailed.",
  },
  {
    icon: Crown,
    n: "03",
    title: "Ride in Luxury",
    text: "Sit back. A vetted chauffeur arrives early, opens the door, and gets you there with grace.",
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      data-testid="how-it-works-section"
      className="relative py-24 md:py-32 px-6 md:px-10 border-t border-white/5"
    >
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <span className="text-xs tracking-[0.3em] uppercase text-[#D4AF37]">How it works</span>
          <h2 className="font-serif text-4xl md:text-5xl mt-6">
            Three steps. <span className="italic">No surprises.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-12 left-[16.66%] right-[16.66%] h-px bg-gradient-to-r from-transparent via-[#D4AF37]/40 to-transparent" />

          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.n}
                data-testid={`how-step-${i}`}
                className="relative text-center"
              >
                <div className="relative w-24 h-24 mx-auto rounded-full bg-[#0A0A0A] border border-[#D4AF37]/30 flex items-center justify-center group hover:border-[#D4AF37] transition-all">
                  <Icon className="w-8 h-8 text-[#D4AF37]" />
                  <span className="absolute -top-2 -right-2 w-9 h-9 rounded-full bg-[#D4AF37] text-black flex items-center justify-center text-xs font-semibold">
                    {s.n}
                  </span>
                </div>
                <h3 className="font-serif text-2xl mt-8">{s.title}</h3>
                <p className="text-white/60 text-sm mt-3 max-w-xs mx-auto leading-relaxed">
                  {s.text}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
