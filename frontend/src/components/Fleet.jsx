import { Users, Sparkles, Briefcase } from "lucide-react";

const FLEET = [
  {
    name: "Executive Sedan",
    model: "Cadillac XTS",
    pax: "1–3",
    bags: "3",
    note: "The standard for daily executive transport. Discreet, smooth, on time.",
    img: "https://images.unsplash.com/photo-1571007667516-62962d19bebf?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0",
    span: "lg:col-span-2 lg:row-span-2",
  },
  {
    name: "Luxury Sedan",
    model: "Mercedes-Benz S-Class",
    pax: "1–3",
    bags: "3",
    note: "First-class flagship. Hush-quiet cabin, executive rear seating.",
    img: "https://images.unsplash.com/photo-1772990914622-4ee26e085381?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600&ixlib=rb-4.1.0",
    span: "lg:col-span-1 lg:row-span-1",
  },
  {
    name: "Luxury SUV",
    model: "Cadillac Escalade",
    pax: "1–6",
    bags: "6",
    note: "Captain's chairs, cavernous trunk, redefined comfort.",
    img: "https://images.unsplash.com/photo-1767749995450-7b63ab7cd4fd?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600&ixlib=rb-4.1.0",
    span: "lg:col-span-1 lg:row-span-1",
  },
  {
    name: "Stretch Limousine",
    model: "Hummer Stretch",
    pax: "12–14",
    bags: "4",
    note: "Mood lighting, premium bar, the showstopper for weddings & nightlife.",
    img: "https://images.unsplash.com/photo-1742794147227-b3df1a5ae19c?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0",
    span: "lg:col-span-2 lg:row-span-1",
  },
  {
    name: "Sprinter Van",
    model: "Mercedes Jet Sprinter",
    pax: "10–14",
    bags: "14",
    note: "Group travel without sacrifice. Wi-Fi, USB, leather lounge seating.",
    img: "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600&ixlib=rb-4.1.0",
    span: "lg:col-span-1 lg:row-span-1",
  },
];

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
                className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-105 transition-all duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
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
