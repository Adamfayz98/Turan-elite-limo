const ATTRACTIONS = [
  {
    name: "Alcatraz Island",
    img: "https://lirp.cdn-website.com/86a4ef8d/dms3rep/multi/opt/aerial-shot-of-alcatraz-620w.jpg",
    text: "Once the most secure federal prison in the U.S., now an unforgettable ferry-island tour.",
    span: "md:col-span-2 md:row-span-2",
  },
  {
    name: "Golden Gate Bridge",
    img: "https://lirp.cdn-website.com/86a4ef8d/dms3rep/multi/opt/GoldenGateBridge-001-620w.jpg",
    text: "4,200 ft of Art Deco icon, blanketed by fog or bathed in gold.",
    span: "",
  },
  {
    name: "Pier 39",
    img: "https://lirp.cdn-website.com/86a4ef8d/dms3rep/multi/opt/pier-39-620w.jpg",
    text: "Sea lions, sourdough bread bowls, and bay views from the Embarcadero.",
    span: "",
  },
  {
    name: "Cable Cars",
    img: "https://images.unsplash.com/photo-1521747116042-5a810fda9664?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
    text: "Running since 1873 — California Street to Powell-Hyde, a moving postcard.",
    span: "md:col-span-2",
  },
  {
    name: "Napa Valley",
    img: "https://images.unsplash.com/photo-1506377585622-bedcbb027afc?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
    text: "Cult cabernets, Michelin tasting menus, and sunset over the vines — let us drive.",
    span: "",
  },
];

export default function ThingsToDo() {
  return (
    <section
      id="things-to-do"
      data-testid="things-section"
      className="relative py-24 md:py-32 px-6 md:px-10 border-t border-white/5"
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-14">
          <div>
            <span className="text-xs tracking-[0.3em] uppercase text-[#D4AF37]">Things to See & Do</span>
            <h2 className="font-serif text-4xl md:text-5xl mt-6 leading-tight">
              The Bay, <span className="italic">at its finest.</span>
            </h2>
          </div>
          <p className="text-white/60 max-w-md leading-relaxed">
            Build a custom day with your chauffeur. From iconic landmarks to hidden cellars — we handle the wheel.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:auto-rows-[260px]">
          {ATTRACTIONS.map((a, i) => (
            <article
              key={a.name}
              data-testid={`attraction-${i}`}
              className={`group relative overflow-hidden rounded-2xl border border-[#1F1F1F] ${a.span}`}
            >
              <img
                src={a.img}
                alt={a.name}
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
              <div className="relative h-full flex flex-col justify-end p-6">
                <h3 className="font-serif text-2xl">{a.name}</h3>
                <p className="text-sm text-white/70 mt-2 max-w-md">{a.text}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
