import { useEffect, useState } from "react";
import { Quote, Star } from "lucide-react";

import { api } from "@/lib/api";

const SOURCE_LABEL = {
  google: "Google",
  yelp: "Yelp",
  handpicked: null,
};

const FALLBACK = [
  {
    text:
      "Booked TuranEliteLimo for our wedding party in Napa. The chauffeur was on time to the second, the limo was immaculate, and the bride cried (happy tears). Worth every penny.",
    author: "Aisha & Jordan",
    context: "Wedding · Calistoga",
    rating: 5,
    source: "handpicked",
  },
  {
    text:
      "I run a roadshow across SF, Palo Alto and SJ every quarter. TuranEliteLimo is the only service I trust to keep our team on schedule. Their dispatchers are unreal.",
    author: "Marcus L.",
    context: "Managing Director · Goldman",
    rating: 5,
    source: "handpicked",
  },
  {
    text:
      "Flight delayed three hours from Heathrow. Driver was still there waiting with a sign and a cold water. Five stars don't cut it.",
    author: "Priya R.",
    context: "Frequent Traveler · SFO",
    rating: 5,
    source: "handpicked",
  },
];

export default function Testimonials() {
  const [reviews, setReviews] = useState(FALLBACK);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/reviews")
      .then((r) => {
        if (cancelled) return;
        const list = (r.data?.reviews || []).slice(0, 3);
        if (list.length) setReviews(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      id="testimonials"
      data-testid="testimonials-section"
      className="relative py-24 md:py-32 px-6 md:px-10 border-t border-white/5"
    >
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <span className="text-xs tracking-[0.3em] uppercase text-[#D4AF37]">06 — Word of Mouth</span>
          <h2 className="font-serif text-4xl md:text-5xl mt-6">
            Loved by clients across the <span className="italic">Bay.</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {reviews.map((r, i) => {
            const sourceLabel = SOURCE_LABEL[r.source];
            return (
              <figure
                key={i}
                data-testid={`review-${i}`}
                className="p-8 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] flex flex-col"
              >
                <div className="flex items-center justify-between">
                  <Quote className="w-8 h-8 text-[#D4AF37]/60" />
                  {sourceLabel && (
                    <span
                      data-testid={`review-source-${i}`}
                      className="text-[10px] uppercase tracking-[0.25em] text-white/40 px-2 py-1 rounded-full border border-white/10"
                    >
                      via {sourceLabel}
                    </span>
                  )}
                </div>
                <blockquote className="mt-6 text-white/85 leading-relaxed flex-1">
                  "{r.text || r.quote}"
                </blockquote>
                <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                  <div>
                    <div className="text-white text-sm font-medium">{r.author || r.name}</div>
                    <div className="text-white/50 text-xs">{r.context || r.role || ""}</div>
                  </div>
                  <div className="flex">
                    {Array.from({ length: r.rating || 5 }).map((_, s) => (
                      <Star key={s} className="w-3.5 h-3.5 fill-[#D4AF37] text-[#D4AF37]" />
                    ))}
                  </div>
                </div>
              </figure>
            );
          })}
        </div>

        {/* Yelp CTA — public page link, no API needed */}
        <div className="mt-12 flex justify-center">
          <a
            href="https://www.yelp.com/biz/turanelitelimo-millbrae"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="yelp-cta-link"
            className="group inline-flex items-center gap-4 px-6 py-4 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/[0.04] transition-all"
          >
            <div className="w-10 h-10 rounded-lg bg-[#D32323] flex items-center justify-center font-bold text-white text-lg shrink-0">
              y
            </div>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <div className="flex">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="w-3.5 h-3.5 fill-[#D32323] text-[#D32323]" />
                  ))}
                </div>
                <span className="text-white/85 text-sm font-medium">on Yelp</span>
              </div>
              <div className="text-white/55 text-xs mt-0.5">
                Read full reviews from our riders →
              </div>
            </div>
            <span className="text-[#D4AF37] text-sm opacity-0 group-hover:opacity-100 transition-opacity">
              ↗
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
