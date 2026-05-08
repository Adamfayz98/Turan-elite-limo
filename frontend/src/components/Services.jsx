import { Plane, Heart, Briefcase, Clock, Music4, Wine } from "lucide-react";

const SERVICES = [
  {
    icon: Plane,
    title: "Airport Transfers",
    text: "SFO, OAK, SJC and private FBOs. Flight tracking and meet-and-greet at no charge.",
  },
  {
    icon: Heart,
    title: "Weddings",
    text: "Choreographed timing, ribbon-ready vehicles, champagne on arrival.",
  },
  {
    icon: Briefcase,
    title: "Corporate & Executive",
    text: "Roadshows, board meetings, and same-day round trips for global teams.",
  },
  {
    icon: Clock,
    title: "Hourly Chauffeur",
    text: "City explorations, day-trips and as-directed bookings, billed by the hour.",
  },
  {
    icon: Music4,
    title: "Prom & Nightlife",
    text: "Stretch limousines and party buses for unforgettable nights, safely.",
  },
  {
    icon: Wine,
    title: "Napa & Wine Tours",
    text: "Curated routes through Napa, Sonoma & Livermore with concierge logistics.",
  },
];

export default function Services() {
  return (
    <section
      id="services"
      data-testid="services-section"
      className="relative py-24 md:py-32 px-6 md:px-10 border-t border-white/5"
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-10 mb-16">
          <div className="lg:col-span-5">
            <span className="text-xs tracking-[0.3em] uppercase text-[#D4AF37]">04 — Services</span>
            <h2 className="font-serif text-4xl md:text-5xl mt-6 leading-tight">
              Six ways we keep you <span className="italic">moving.</span>
            </h2>
          </div>
          <p className="lg:col-span-6 lg:col-start-7 text-white/60 leading-relaxed self-end">
            Whether it's a quiet ride to a 6:00 AM flight or a full procession on your wedding day, we adjust the experience to the moment — never the other way around.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {SERVICES.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                data-testid={`service-card-${i}`}
                className="group p-8 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] hover:border-[#D4AF37]/40 transition-all duration-500"
              >
                <div className="w-12 h-12 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/20 flex items-center justify-center group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
                  <Icon className="w-5 h-5 text-[#D4AF37] group-hover:text-black" />
                </div>
                <h3 className="font-serif text-2xl mt-6">{s.title}</h3>
                <p className="text-sm text-white/60 mt-3 leading-relaxed">{s.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
