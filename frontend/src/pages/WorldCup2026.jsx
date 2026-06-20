import { useEffect } from "react";
import Logo from "@/components/Logo";

/**
 * /world-cup-2026  ·  /worldcup  ·  /levis-stadium-transportation
 *
 * Dedicated Google Ads landing page for FIFA World Cup 2026 traffic.
 * Optimized for:
 *  - High Quality Score on PMax (specific intent match → cheaper CPC)
 *  - International travelers searching "Levi's Stadium pickup", "SFO to Santa Clara",
 *    "World Cup Bay Area transportation", etc.
 *  - Direct booking via the homepage booking form (anchored CTA).
 *
 * Note: We avoid the exact phrase "FIFA World Cup" in marketing copy below the
 * fold to stay clear of FIFA trademark issues — the URL & meta tags use the
 * descriptive term, on-page copy uses "Match Day", "Stadium 2026", "Bay Area
 * Tournament" wording per Google Ads & FIFA guideline best practice.
 */

const BOOK_URL = "/#booking";
const PHONE = "(650) 410-0687";
const TEL = "tel:+16504100687";

const PILLARS = [
  {
    eyebrow: "01",
    title: "Skip Match-Day Surge",
    body: "Lock in a flat rate the moment you book. No surge multipliers when 70,000 fans pour out of Levi's Stadium. Your price never changes.",
  },
  {
    eyebrow: "02",
    title: "Pre-Assigned Pickup Zone",
    body: "Your chauffeur waits at a designated VIP pickup zone outside the stadium gates. Skip the rideshare chaos. Walk straight to your car.",
  },
  {
    eyebrow: "03",
    title: "60-Minute Free Wait Time",
    body: "Flights delayed at SFO? Match goes into extra time? We hold the vehicle complimentary for the first 60 minutes after your scheduled time.",
  },
  {
    eyebrow: "04",
    title: "Live Driver Tracking",
    body: "Watch your chauffeur approach in real time, share live ETA with your group on WhatsApp, and never wonder where your ride is.",
  },
  {
    eyebrow: "05",
    title: "Multilingual 24/7 Dispatch",
    body: "Real humans answer calls and texts around the clock in English, Spanish, Russian, and Turkish. Booking confirmations in your language.",
  },
  {
    eyebrow: "06",
    title: "Apple Pay & Card Welcome",
    body: "Pay how you want — Apple Pay, Visa, Mastercard, Amex. Foreign cards accepted. Receipts emailed instantly in USD.",
  },
];

const ROUTES = [
  { from: "SFO Airport", to: "Levi's Stadium", time: "45 min", from_full: "San Francisco International" },
  { from: "OAK Airport", to: "Levi's Stadium", time: "55 min", from_full: "Oakland International" },
  { from: "SJC Airport", to: "Levi's Stadium", time: "15 min", from_full: "San José International" },
  { from: "Union Square SF", to: "Levi's Stadium", time: "50 min", from_full: "Downtown San Francisco" },
  { from: "Palo Alto", to: "Levi's Stadium", time: "25 min", from_full: "Stanford & Palo Alto Hotels" },
  { from: "Napa Valley", to: "Levi's Stadium", time: "1h 40min", from_full: "Wine Country Hotels" },
];

const FLEET = [
  {
    name: "Executive Sedan",
    seats: "1-3 passengers",
    desc: "Cadillac XTS · Mercedes E-Class. Discreet, smooth, on time. Perfect for solo travelers or couples.",
    img: "/fleet/executive-sedan.jpg",
  },
  {
    name: "Luxury SUV",
    seats: "1-6 passengers",
    desc: "Cadillac Escalade · GMC Yukon Denali. Captain's chairs, cavernous trunk for fans + gear.",
    img: "/fleet/luxury-suv.jpg",
  },
  {
    name: "Executive Sprinter",
    seats: "8-12 passengers",
    desc: "Mercedes Sprinter Executive. Captain's chairs + leather. Ideal for hospitality groups & VIP airport transfers.",
    img: "/fleet/sprinter.jpg",
  },
  {
    name: "Stretch Limousine",
    seats: "8-14 passengers",
    desc: "Hummer & Chrysler 300 Stretch. Mood lighting, premium bar. The post-match celebration vehicle.",
    img: "https://images.unsplash.com/photo-1676107648535-931375db52e2?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0",
  },
];

const GALLERY = [
  "/fleet/executive-sedan.jpg",
  "/fleet/first-class.jpg",
  "/fleet/luxury-suv.jpg",
  "https://images.unsplash.com/photo-1676107648535-931375db52e2?fm=jpg&q=70&w=1200&auto=format&fit=crop&ixlib=rb-4.1.0",
  "https://images.unsplash.com/photo-1545185105-a81262517cf4?fm=jpg&q=70&w=1200&auto=format&fit=crop&ixlib=rb-4.1.0",
];

const FAQS = [
  {
    q: "How early should I book transportation for Bay Area Stadium 2026 matches?",
    a: "We recommend booking at least 7 days before your match day. Match-day demand spikes 5–8× and our fleet sells out for premium time slots. Booking early also locks in the flat rate before any seasonal pricing.",
  },
  {
    q: "Will you be there if my flight is delayed?",
    a: "Yes. We monitor your flight in real time using your inbound flight number. If your plane is delayed, we automatically adjust the pickup time. The first 60 minutes of wait time after your scheduled pickup is complimentary.",
  },
  {
    q: "Can I book a one-way pickup from the stadium back to my hotel?",
    a: "Absolutely. Many fans book a round-trip (hotel → stadium → hotel) but one-way bookings are equally welcome. We have a dedicated pickup zone outside the stadium gates so you skip the rideshare line entirely.",
  },
  {
    q: "Do you accept foreign credit cards?",
    a: "Yes. We process payments through Stripe and accept all major international cards including Visa, Mastercard, American Express, and Apple Pay. All charges shown and processed in USD with the exchange rate set by your bank.",
  },
  {
    q: "Is there a surge charge during match days like with rideshare apps?",
    a: "No. The flat rate you see at booking is the flat rate you pay. No match-day multipliers, no late-night surcharges, no surprise gratuity. Tip is included in the quoted price.",
  },
  {
    q: "Can a group of 8+ travel together in one vehicle?",
    a: "Yes. Our Executive Sprinters comfortably seat up to 12 passengers with leather captain's chairs, in-vehicle WiFi, USB charging, and bottled water. Ideal for friend groups, corporate hospitality, or family travel.",
  },
];

export default function WorldCup2026() {
  useEffect(() => {
    document.title = "Levi's Stadium Limo · Bay Area World Cup 2026 Transportation — TuranEliteLimo";
    // Set the meta description to win the Google Ads quality score lottery
    const md = document.querySelector('meta[name="description"]');
    const text = "Pre-book a private chauffeur for Levi's Stadium match days during the Bay Area's World Cup 2026 tournament window. SFO/OAK/SJC airport pickups, hotel transfers, VIP exit zone. Flat rates · no surge · live tracking · 24/7 multilingual dispatch.";
    if (md) md.setAttribute("content", text);
    else {
      const m = document.createElement("meta");
      m.setAttribute("name", "description");
      m.setAttribute("content", text);
      document.head.appendChild(m);
    }
  }, []);

  return (
    <div className="min-h-screen bg-black text-white" data-testid="world-cup-page">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(212,175,55,0.12),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1305] via-black to-black opacity-95" />
        <div className="relative max-w-6xl mx-auto px-6 pt-12 pb-20 sm:pt-16 sm:pb-28">
          <a href="/" className="flex items-center gap-3 mb-14 opacity-90 hover:opacity-100 transition w-fit" data-testid="world-cup-logo-home">
            <Logo size={40} />
            <span className="text-lg tracking-wide">TuranEliteLimo</span>
          </a>

          <p className="text-[#D4AF37] text-xs tracking-[0.35em] mb-5 uppercase">Bay Area World Cup 2026 · Levi&apos;s Stadium · June 13 — July 19, 2026</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light tracking-tight leading-[1.05] max-w-4xl">
            Skip the surge. Skip the line.
            <br />
            <span className="italic text-[#D4AF37]">Levi&apos;s Stadium match-day chauffeurs</span> for World Cup 2026.
          </h1>
          <p className="text-white/65 text-base sm:text-lg mt-7 max-w-2xl leading-relaxed">
            Pre-book a private chauffeur for the 2026 World Cup matches at Levi&apos;s Stadium in Santa Clara. Airport pickup from
            SFO, OAK, or SJC. Hotel transfers. Pre-assigned VIP exit zone. Flat rate locked at booking — no match-day
            multipliers, ever.
          </p>

          <div className="flex flex-wrap items-center gap-4 mt-10">
            <a
              data-testid="world-cup-book-cta"
              href={BOOK_URL}
              className="inline-flex items-center gap-2 px-7 py-4 rounded-full bg-[#D4AF37] text-black font-medium hover:opacity-90 transition shadow-[0_8px_30px_rgba(212,175,55,0.35)]"
            >
              Get Instant Quote →
            </a>
            <a
              data-testid="world-cup-call-cta"
              href={TEL}
              className="inline-flex items-center gap-2 px-7 py-4 rounded-full border border-white/20 text-white hover:bg-white/5 transition"
            >
              Call {PHONE}
            </a>
          </div>

          {/* Trust strip */}
          <ul className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 max-w-3xl">
            {["Flat Rate · No Surge", "60-Min Free Wait", "Live Driver Tracking", "Multilingual 24/7"].map((b) => (
              <li key={b} className="flex items-center gap-2 text-white/70 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]" /> {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Six Pillars */}
      <section className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
        <p className="text-[#D4AF37] text-xs tracking-[0.35em] uppercase mb-4">Why pre-book with us</p>
        <h2 className="text-2xl sm:text-4xl font-light tracking-tight leading-tight max-w-2xl">
          Six reasons fans pre-book us <span className="italic text-[#D4AF37]">months before kickoff</span>.
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12 mt-14">
          {PILLARS.map((p) => (
            <div key={p.title} data-testid={`pillar-${p.eyebrow}`} className="space-y-3">
              <p className="text-[#D4AF37]/60 text-xs tracking-[0.3em]">{p.eyebrow}</p>
              <h3 className="text-xl text-white">{p.title}</h3>
              <p className="text-white/55 text-sm leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Routes */}
      <section className="border-t border-white/5 bg-[#0a0a0a]">
        <div className="max-w-6xl mx-auto px-6 py-20 sm:py-24">
          <p className="text-[#D4AF37] text-xs tracking-[0.35em] uppercase mb-4">Popular match-day routes</p>
          <h2 className="text-2xl sm:text-4xl font-light tracking-tight leading-tight max-w-2xl">
            Pre-booked from anywhere in the <span className="italic text-[#D4AF37]">Bay Area & Wine Country</span>.
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-12">
            {ROUTES.map((r) => (
              <a
                key={`${r.from}-${r.to}`}
                href={BOOK_URL}
                data-testid={`route-${r.from.toLowerCase().replace(/\s+/g, "-")}`}
                className="group block p-6 rounded-2xl border border-white/10 bg-white/[0.02] hover:border-[#D4AF37]/40 hover:bg-white/[0.04] transition"
              >
                <p className="text-white/40 text-[10px] tracking-[0.25em] uppercase mb-2">{r.from_full}</p>
                <p className="text-white text-lg">
                  {r.from} <span className="text-white/40">→</span> {r.to}
                </p>
                <p className="text-[#D4AF37] text-xs tracking-widest mt-3 group-hover:translate-x-1 transition-transform">
                  ~{r.time} · Pre-book →
                </p>
              </a>
            ))}
          </div>
          <p className="text-white/45 text-sm mt-8 max-w-2xl">
            Don&apos;t see your route? We service all of Northern California — from Sacramento and Monterey to Sonoma and
            Half Moon Bay. <a href={BOOK_URL} className="text-[#D4AF37] hover:underline" data-testid="world-cup-custom-route">Request a custom quote</a>.
          </p>
        </div>
      </section>

      {/* Fleet */}
      <section className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
        <p className="text-[#D4AF37] text-xs tracking-[0.35em] uppercase mb-4">Your fleet · Match day ready</p>
        <h2 className="text-2xl sm:text-4xl font-light tracking-tight leading-tight max-w-2xl">
          From solo arrivals to <span className="italic text-[#D4AF37]">12-person hospitality groups</span>.
        </h2>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-12 mt-12">
          {FLEET.map((f) => (
            <div key={f.name} data-testid={`fleet-${f.name.toLowerCase().replace(/\s+/g, "-")}`} className="group">
              <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02] mb-5">
                <img
                  src={f.img}
                  alt={`${f.name} for Levi's Stadium transportation`}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                />
              </div>
              <div className="border-l-2 border-[#D4AF37]/40 pl-5">
                <h3 className="text-white text-xl">{f.name}</h3>
                <p className="text-[#D4AF37]/80 text-xs tracking-widest mt-1">{f.seats.toUpperCase()}</p>
                <p className="text-white/55 text-sm mt-3 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Gallery */}
      <section className="border-t border-white/5 bg-[#0a0a0a]">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <p className="text-[#D4AF37] text-xs tracking-[0.35em] uppercase mb-6 text-center">The TuranEliteLimo Experience</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="world-cup-gallery">
            {GALLERY.map((src, i) => (
              <div key={src} className="aspect-square rounded-xl overflow-hidden border border-white/10">
                <img
                  src={src}
                  alt={`TuranEliteLimo fleet photo ${i + 1}`}
                  loading="lazy"
                  className="w-full h-full object-cover hover:scale-105 transition duration-500"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="bg-gradient-to-br from-[#1a1305] via-black to-black border-y border-[#D4AF37]/15">
        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <p className="text-[#D4AF37] text-xs tracking-[0.35em] uppercase mb-4">Match days fill fast</p>
          <h2 className="text-3xl sm:text-5xl font-light tracking-tight leading-tight">
            Lock your chauffeur in <span className="italic text-[#D4AF37]">under 60 seconds</span>.
          </h2>
          <p className="text-white/60 mt-6 max-w-xl mx-auto">
            Live quote. Flat rate. Instant confirmation by email and SMS. Zero phone tag.
          </p>
          <div className="flex flex-wrap justify-center gap-4 mt-10">
            <a
              data-testid="world-cup-cta-bottom"
              href={BOOK_URL}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#D4AF37] text-black font-medium hover:opacity-90 transition shadow-[0_8px_30px_rgba(212,175,55,0.35)]"
            >
              Get Instant Quote →
            </a>
            <a
              data-testid="world-cup-call-bottom"
              href={TEL}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full border border-white/20 text-white hover:bg-white/5 transition"
            >
              Call {PHONE}
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-4xl mx-auto px-6 py-20 sm:py-28">
        <p className="text-[#D4AF37] text-xs tracking-[0.35em] uppercase mb-4">Common questions</p>
        <h2 className="text-2xl sm:text-4xl font-light tracking-tight leading-tight">
          Everything fans ask <span className="italic text-[#D4AF37]">before they book</span>.
        </h2>
        <div className="mt-12 space-y-8">
          {FAQS.map((f, i) => (
            <details
              key={f.q}
              data-testid={`world-cup-faq-${i}`}
              className="group border-b border-white/10 pb-6 cursor-pointer"
            >
              <summary className="flex justify-between items-start gap-6 list-none">
                <span className="text-white text-base sm:text-lg">{f.q}</span>
                <span className="text-[#D4AF37] text-2xl leading-none group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="text-white/55 text-sm mt-4 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <a href="/" className="text-white/50 text-sm hover:text-[#D4AF37]" data-testid="world-cup-footer-home">
            ← Back to home
          </a>
          <p className="text-white/35 text-xs text-center">
            TuranEliteLimo · TCP-licensed · Insured · Serving the Bay Area & Northern California
          </p>
          <a href={TEL} className="text-white/50 text-sm hover:text-[#D4AF37]">
            {PHONE}
          </a>
        </div>
      </footer>
    </div>
  );
}
