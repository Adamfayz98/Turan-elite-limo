const CITIES = [
  "San Francisco", "Oakland", "Berkeley", "Palo Alto", "Mountain View",
  "San Jose", "Cupertino", "San Mateo", "Burlingame", "Hillsborough",
  "Atherton", "Menlo Park", "Sausalito", "Mill Valley", "Tiburon",
  "Napa", "Sonoma", "Calistoga", "Healdsburg", "St. Helena",
  "Walnut Creek", "Lafayette", "Livermore", "Pleasanton", "Half Moon Bay",
  "Santa Cruz", "Monterey", "Carmel", "Sacramento",
];

const AIRPORTS = [
  { code: "SFO", name: "San Francisco Intl." },
  { code: "OAK", name: "Oakland Intl." },
  { code: "SJC", name: "San José Mineta" },
  { code: "STS", name: "Santa Rosa / Sonoma" },
  { code: "SMF", name: "Sacramento Intl." },
];

export default function Coverage() {
  return (
    <section
      id="coverage"
      data-testid="coverage-section"
      className="relative py-24 md:py-32 px-6 md:px-10 overflow-hidden"
    >
      {/* Decorative bg */}
      <div className="absolute inset-0 -z-10 opacity-30">
        <img
          src="https://images.unsplash.com/photo-1630603826565-fa64d258b602?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODd8MHwxfHNlYXJjaHwzfHxzYW4lMjBmcmFuY2lzY28lMjBuaWdodCUyMGNpdHl8ZW58MHx8fHwxNzc4MjM0MjkwfDA&ixlib=rb-4.1.0&q=85"
          alt="San Francisco skyline"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050505] via-[#050505]/70 to-[#050505]" />
      </div>

      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5">
            <span className="text-xs tracking-[0.3em] uppercase text-[#D4AF37]">05 — Coverage</span>
            <h2 className="font-serif text-4xl md:text-5xl mt-6 leading-tight">
              All of <span className="gold-text">Northern California.</span>
              <br />
              <span className="italic font-light">Anywhere</span> in the Bay.
            </h2>
            <p className="mt-6 text-white/60 leading-relaxed max-w-md">
              From the foggy hills of Marin to the sunlit valleys of Sonoma, our chauffeurs know every shortcut, every back road, every detail. Curbside to door — across thirty-plus cities.
            </p>

            <div className="mt-10">
              <h4 className="text-xs tracking-[0.3em] uppercase text-white/50 mb-4">Major airports</h4>
              <div className="grid grid-cols-2 gap-3">
                {AIRPORTS.map((a) => (
                  <div
                    key={a.code}
                    data-testid={`airport-${a.code}`}
                    className="flex items-baseline gap-3 p-4 rounded-xl border border-[#1F1F1F] bg-[#0A0A0A]/80"
                  >
                    <span className="font-serif text-2xl gold-text">{a.code}</span>
                    <span className="text-xs text-white/60">{a.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A]/60 backdrop-blur p-8 md:p-10">
              <h4 className="text-xs tracking-[0.3em] uppercase text-white/50">Cities served</h4>
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
                {CITIES.map((c) => (
                  <span
                    key={c}
                    data-testid={`city-${c}`}
                    className="text-white/75 hover:text-[#D4AF37] transition-colors text-sm md:text-base relative pl-4 before:content-[''] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-1 before:h-1 before:rounded-full before:bg-[#D4AF37]/60"
                  >
                    {c}
                  </span>
                ))}
              </div>
              <div className="gold-divider my-8" />
              <p className="text-sm text-white/55 italic">
                Don't see your city? We probably still serve it. Call <span className="text-[#D4AF37]">(650) 672-3520</span>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
