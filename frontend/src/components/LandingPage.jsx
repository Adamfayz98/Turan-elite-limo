import { useEffect } from "react";
import Logo from "@/components/Logo";
import FloatingQuoteWidget from "@/components/FloatingQuoteWidget";

/**
 * Reusable Google Ads landing page. Used by /airport, /wedding, /wine-tour,
 * /corporate. Mirrors the style of /world-cup-2026.
 *
 * Props:
 *  - testId, eyebrow, titleA, titleAccent, titleB, subtitle
 *  - pageTitle, metaDescription (head)
 *  - pillars: [{eyebrow,title,body}]
 *  - routesEyebrow, routesTitleA, routesTitleAccent, routes [{from,to,time,from_full}]
 *  - fleet: [{name,seats,desc,img}]
 *  - gallery: [imgUrl]
 *  - faqs: [{q,a}]
 *  - ctaTitleA, ctaTitleAccent, ctaSubtitle
 *  - sectionEyebrow, fleetEyebrow, fleetTitleA, fleetTitleAccent
 */

const BOOK_URL = "/#booking";
const PHONE = "(650) 410-0687";
const TEL = "tel:+16504100687";

export default function LandingPage({
  testId,
  eyebrow,
  titleA,
  titleAccent,
  titleB,
  subtitle,
  pageTitle,
  metaDescription,
  trustStrip = ["Flat Rate · No Surge", "Free Wait Time", "Live Driver Tracking", "Multilingual 24/7"],
  pillarHeading,
  pillarHeadingAccent,
  pillars,
  routesEyebrow = "Popular routes",
  routesTitleA,
  routesTitleAccent,
  routes,
  fleetEyebrow = "Your fleet",
  fleetTitleA,
  fleetTitleAccent,
  fleet,
  gallery,
  // ---- New optional sections (all silently skipped if not provided) ----
  // Full-bleed editorial image breaking up the page after pillars.
  experienceImage, // { src, alt, caption?, kicker? }
  // Grid of named venues / wineries / partners.
  venuesEyebrow,
  venuesTitleA,
  venuesTitleAccent,
  venuesIntro,
  venues, // [{ name, image, blurb, badge? }]
  venuesDisclaimer, // small italic line under the grid (e.g. "Tours customized to your preference")
  // Timeline / sample day.
  itineraryEyebrow,
  itineraryTitleA,
  itineraryTitleAccent,
  itineraryIntro,
  itinerary, // [{ time, title, blurb }]
  ctaEyebrow = "Book in 60 seconds",
  ctaTitleA,
  ctaTitleAccent,
  ctaSubtitle,
  faqs,
}) {
  useEffect(() => {
    if (pageTitle) document.title = pageTitle;
    if (metaDescription) {
      const md = document.querySelector('meta[name="description"]');
      if (md) md.setAttribute("content", metaDescription);
      else {
        const m = document.createElement("meta");
        m.setAttribute("name", "description");
        m.setAttribute("content", metaDescription);
        document.head.appendChild(m);
      }
    }
  }, [pageTitle, metaDescription]);

  return (
    <div className="min-h-screen bg-black text-white" data-testid={testId}>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(212,175,55,0.12),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1305] via-black to-black opacity-95" />
        <div className="relative max-w-6xl mx-auto px-6 pt-12 pb-20 sm:pt-16 sm:pb-28">
          <a href="/" className="flex items-center gap-3 mb-14 opacity-90 hover:opacity-100 transition w-fit" data-testid={`${testId}-logo-home`}>
            <Logo size={40} />
            <span className="text-lg tracking-wide">TuranEliteLimo</span>
          </a>

          <p className="text-[#D4AF37] text-xs tracking-[0.35em] mb-5 uppercase">{eyebrow}</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light tracking-tight leading-[1.05] max-w-4xl">
            {titleA}
            <br />
            <span className="italic text-[#D4AF37]">{titleAccent}</span> {titleB}
          </h1>
          <p className="text-white/65 text-base sm:text-lg mt-7 max-w-2xl leading-relaxed">{subtitle}</p>

          <div className="flex flex-wrap items-center gap-4 mt-10">
            <a data-testid={`${testId}-book-cta`} href={BOOK_URL}
              className="inline-flex items-center gap-2 px-7 py-4 rounded-full bg-[#D4AF37] text-black font-medium hover:opacity-90 transition shadow-[0_8px_30px_rgba(212,175,55,0.35)]">
              Get Instant Quote →
            </a>
            <a data-testid={`${testId}-call-cta`} href={TEL}
              className="inline-flex items-center gap-2 px-7 py-4 rounded-full border border-white/20 text-white hover:bg-white/5 transition">
              Call {PHONE}
            </a>
          </div>

          <ul className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 max-w-3xl">
            {trustStrip.map((b) => (
              <li key={b} className="flex items-center gap-2 text-white/70 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]" /> {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Pillars */}
      <section className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
        <p className="text-[#D4AF37] text-xs tracking-[0.35em] uppercase mb-4">Why riders choose us</p>
        <h2 className="text-2xl sm:text-4xl font-light tracking-tight leading-tight max-w-2xl">
          {pillarHeading} <span className="italic text-[#D4AF37]">{pillarHeadingAccent}</span>.
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12 mt-14">
          {pillars.map((p) => (
            <div key={p.title} data-testid={`${testId}-pillar-${p.eyebrow}`} className="space-y-3">
              <p className="text-[#D4AF37]/60 text-xs tracking-[0.3em]">{p.eyebrow}</p>
              <h3 className="text-xl text-white">{p.title}</h3>
              <p className="text-white/55 text-sm leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Experience editorial image — full-bleed, breaks up the text */}
      {experienceImage?.src && (
        <section className="relative border-y border-white/5">
          <div className="relative h-[420px] sm:h-[560px] overflow-hidden">
            <img
              src={experienceImage.src}
              alt={experienceImage.alt || "Experience"}
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/85" />
            <div className="relative max-w-4xl mx-auto h-full flex flex-col justify-end px-6 pb-14 sm:pb-20">
              {experienceImage.kicker && (
                <p className="text-[#D4AF37] text-xs tracking-[0.35em] uppercase mb-3">
                  {experienceImage.kicker}
                </p>
              )}
              {experienceImage.caption && (
                <p className="text-white text-2xl sm:text-4xl font-light leading-[1.15] max-w-3xl">
                  {experienceImage.caption}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Routes */}
      {routes && routes.length > 0 && (
        <section className="border-t border-white/5 bg-[#0a0a0a]">
          <div className="max-w-6xl mx-auto px-6 py-20 sm:py-24">
            <p className="text-[#D4AF37] text-xs tracking-[0.35em] uppercase mb-4">{routesEyebrow}</p>
            <h2 className="text-2xl sm:text-4xl font-light tracking-tight leading-tight max-w-2xl">
              {routesTitleA} <span className="italic text-[#D4AF37]">{routesTitleAccent}</span>.
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-12">
              {routes.map((r) => (
                <a key={`${r.from}-${r.to}`} href={BOOK_URL}
                  data-testid={`${testId}-route-${r.from.toLowerCase().replace(/\s+/g, "-")}`}
                  className="group block p-6 rounded-2xl border border-white/10 bg-white/[0.02] hover:border-[#D4AF37]/40 hover:bg-white/[0.04] transition">
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
              Don&apos;t see your route? We service all of Northern California.{" "}
              <a href={BOOK_URL} className="text-[#D4AF37] hover:underline" data-testid={`${testId}-custom-route`}>Request a custom quote</a>.
            </p>
          </div>
        </section>
      )}

      {/* Fleet */}
      <section className="max-w-6xl mx-auto px-6 py-20 sm:py-28">
        <p className="text-[#D4AF37] text-xs tracking-[0.35em] uppercase mb-4">{fleetEyebrow}</p>
        <h2 className="text-2xl sm:text-4xl font-light tracking-tight leading-tight max-w-2xl">
          {fleetTitleA} <span className="italic text-[#D4AF37]">{fleetTitleAccent}</span>.
        </h2>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-12 mt-12">
          {fleet.map((f) => (
            <div key={f.name} data-testid={`${testId}-fleet-${f.name.toLowerCase().replace(/\s+/g, "-")}`} className="group">
              <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 bg-black mb-5 relative">
                <img src={f.img} alt={`${f.name} chauffeur service`} loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                {/* Bottom gradient masks the white-sky halo on stock vehicle photos so they sit flush on the dark page bg */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black via-black/60 to-transparent" />
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

      {/* Featured venues / wineries / partners */}
      {venues && venues.length > 0 && (
        <section className="border-t border-white/5 bg-[#0a0a0a]">
          <div className="max-w-6xl mx-auto px-6 py-20 sm:py-24">
            {venuesEyebrow && (
              <p className="text-[#D4AF37] text-xs tracking-[0.35em] uppercase mb-4">{venuesEyebrow}</p>
            )}
            {(venuesTitleA || venuesTitleAccent) && (
              <h2 className="text-2xl sm:text-4xl font-light tracking-tight leading-tight max-w-3xl">
                {venuesTitleA} <span className="italic text-[#D4AF37]">{venuesTitleAccent}</span>.
              </h2>
            )}
            {venuesIntro && (
              <p className="text-white/55 mt-4 max-w-2xl leading-relaxed">{venuesIntro}</p>
            )}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-12" data-testid={`${testId}-venues`}>
              {venues.map((v) => (
                <div
                  key={v.name}
                  data-testid={`${testId}-venue-${v.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  className="group rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02] hover:border-[#D4AF37]/40 transition"
                >
                  <div className="aspect-[4/3] overflow-hidden relative bg-black">
                    <img
                      src={v.image}
                      alt={v.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-700"
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black via-black/60 to-transparent" />
                    {v.badge && (
                      <span className="absolute top-3 left-3 text-[10px] tracking-[0.18em] uppercase bg-[#D4AF37]/95 text-black px-2.5 py-1 rounded-full font-medium">
                        {v.badge}
                      </span>
                    )}
                  </div>
                  <div className="p-5 border-t border-white/5">
                    <h3 className="text-white text-base font-medium">{v.name}</h3>
                    <p className="text-white/55 text-sm mt-2 leading-relaxed">{v.blurb}</p>
                  </div>
                </div>
              ))}
            </div>
            {venuesDisclaimer && (
              <p className="text-white/35 text-xs italic mt-8 max-w-2xl">{venuesDisclaimer}</p>
            )}
          </div>
        </section>
      )}

      {/* Sample itinerary — timeline */}
      {itinerary && itinerary.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 py-20 sm:py-28">
          {itineraryEyebrow && (
            <p className="text-[#D4AF37] text-xs tracking-[0.35em] uppercase mb-4">{itineraryEyebrow}</p>
          )}
          {(itineraryTitleA || itineraryTitleAccent) && (
            <h2 className="text-2xl sm:text-4xl font-light tracking-tight leading-tight max-w-2xl">
              {itineraryTitleA} <span className="italic text-[#D4AF37]">{itineraryTitleAccent}</span>.
            </h2>
          )}
          {itineraryIntro && (
            <p className="text-white/55 mt-4 max-w-2xl leading-relaxed">{itineraryIntro}</p>
          )}
          <ol className="relative mt-14 border-l border-[#D4AF37]/25 ml-3" data-testid={`${testId}-itinerary`}>
            {itinerary.map((step, idx) => (
              <li
                key={`${step.time}-${idx}`}
                data-testid={`${testId}-itinerary-step-${idx}`}
                className="relative pl-8 pb-10 last:pb-0"
              >
                <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-[#D4AF37] ring-4 ring-black" />
                <p className="text-[#D4AF37] text-[11px] tracking-[0.25em] uppercase font-mono">{step.time}</p>
                <h3 className="text-white text-lg mt-1.5">{step.title}</h3>
                {step.blurb && (
                  <p className="text-white/55 text-sm mt-2 leading-relaxed max-w-xl">{step.blurb}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Gallery */}
      {gallery && gallery.length > 0 && (
        <section className="border-t border-white/5 bg-[#0a0a0a]">
          <div className="max-w-6xl mx-auto px-6 py-16">
            <p className="text-[#D4AF37] text-xs tracking-[0.35em] uppercase mb-6 text-center">The TuranEliteLimo Experience</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid={`${testId}-gallery`}>
              {gallery.map((src, i) => (
                <div key={src} className="aspect-square rounded-xl overflow-hidden border border-white/10 bg-black relative">
                  <img src={src} alt={`TuranEliteLimo photo ${i + 1}`} loading="lazy"
                    className="w-full h-full object-cover hover:scale-105 transition duration-500" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/60 to-transparent" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA banner */}
      <section className="bg-gradient-to-br from-[#1a1305] via-black to-black border-y border-[#D4AF37]/15">
        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <p className="text-[#D4AF37] text-xs tracking-[0.35em] uppercase mb-4">{ctaEyebrow}</p>
          <h2 className="text-3xl sm:text-5xl font-light tracking-tight leading-tight">
            {ctaTitleA} <span className="italic text-[#D4AF37]">{ctaTitleAccent}</span>.
          </h2>
          <p className="text-white/60 mt-6 max-w-xl mx-auto">{ctaSubtitle}</p>
          <div className="flex flex-wrap justify-center gap-4 mt-10">
            <a data-testid={`${testId}-cta-bottom`} href={BOOK_URL}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#D4AF37] text-black font-medium hover:opacity-90 transition shadow-[0_8px_30px_rgba(212,175,55,0.35)]">
              Get Instant Quote →
            </a>
            <a data-testid={`${testId}-call-bottom`} href={TEL}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full border border-white/20 text-white hover:bg-white/5 transition">
              Call {PHONE}
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-4xl mx-auto px-6 py-20 sm:py-28">
        <p className="text-[#D4AF37] text-xs tracking-[0.35em] uppercase mb-4">Common questions</p>
        <h2 className="text-2xl sm:text-4xl font-light tracking-tight leading-tight">
          Everything riders ask <span className="italic text-[#D4AF37]">before they book</span>.
        </h2>
        <div className="mt-12 space-y-8">
          {faqs.map((f, i) => (
            <details key={f.q} data-testid={`${testId}-faq-${i}`} className="group border-b border-white/10 pb-6 cursor-pointer">
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
          <a href="/" className="text-white/50 text-sm hover:text-[#D4AF37]" data-testid={`${testId}-footer-home`}>
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

      <FloatingQuoteWidget testId={`${testId}-fq`} />
    </div>
  );
}
