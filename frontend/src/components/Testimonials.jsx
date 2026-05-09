import { Quote, Star } from "lucide-react";

const REVIEWS = [
  {
    quote:
      "Booked TuranEliteLimo for our wedding party in Napa. The chauffeur was on time to the second, the limo was immaculate, and the bride cried (happy tears). Worth every penny.",
    name: "Aisha & Jordan",
    role: "Wedding · Calistoga",
  },
  {
    quote:
      "I run a roadshow across SF, Palo Alto and SJ every quarter. TuranEliteLimo is the only service I trust to keep our team on schedule. Their dispatchers are unreal.",
    name: "Marcus L.",
    role: "Managing Director · Goldman",
  },
  {
    quote:
      "Flight delayed three hours from Heathrow. Driver was still there waiting with a sign and a cold water. Five stars don't cut it.",
    name: "Priya R.",
    role: "Frequent Traveler · SFO",
  },
];

export default function Testimonials() {
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
          {REVIEWS.map((r, i) => (
            <figure
              key={i}
              data-testid={`review-${i}`}
              className="p-8 rounded-2xl border border-[#1F1F1F] bg-[#0A0A0A] flex flex-col"
            >
              <Quote className="w-8 h-8 text-[#D4AF37]/60" />
              <blockquote className="mt-6 text-white/85 leading-relaxed flex-1">
                "{r.quote}"
              </blockquote>
              <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                <div>
                  <div className="text-white text-sm font-medium">{r.name}</div>
                  <div className="text-white/50 text-xs">{r.role}</div>
                </div>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className="w-3.5 h-3.5 fill-[#D4AF37] text-[#D4AF37]" />
                  ))}
                </div>
              </div>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
