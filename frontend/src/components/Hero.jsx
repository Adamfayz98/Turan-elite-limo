import { ArrowRight, Star } from "lucide-react";
import PayAfterRideBadge from "@/components/PayAfterRideBadge";

export default function Hero() {
  return (
    <section
      id="top"
      data-testid="hero-section"
      className="relative min-h-[100vh] w-full overflow-hidden"
    >
      {/* Background */}
      <div className="absolute inset-0">
        <img
          src="https://images.pexels.com/photos/15774577/pexels-photo-15774577.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=1080&w=1920"
          alt="Luxury chauffeur car"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-10 pt-40 md:pt-48 pb-24 min-h-[100vh] flex flex-col justify-center">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 mb-8 animate-fade-up">
            <div className="h-px w-10 bg-[#D4AF37]" />
            <span
              className="text-xs tracking-[0.3em] uppercase text-[#D4AF37] font-medium"
              data-testid="hero-eyebrow"
            >
              Northern California · Bay Area · SFO · OAK · SJC
            </span>
          </div>

          <h1
            data-testid="hero-headline"
            className="font-serif text-5xl sm:text-6xl lg:text-7xl xl:text-8xl leading-[0.95] text-white animate-fade-up"
            style={{ animationDelay: "100ms", animationFillMode: "both" }}
          >
            Arrive in
            <br />
            <span className="italic font-light">unspoken</span>{" "}
            <span className="gold-text">luxury.</span>
          </h1>

          <p
            data-testid="hero-subtext"
            className="mt-8 text-lg md:text-xl text-white/70 max-w-xl leading-relaxed animate-fade-up"
            style={{ animationDelay: "250ms", animationFillMode: "both" }}
          >
            TuranEliteLimo is a private chauffeur service for those who measure travel by composure. Black-car sedans, luxury SUVs and stretch limousines across San Francisco, Silicon Valley, Napa & beyond.
          </p>

          {/* Book Now · Pay After Ride — hero-level trust pill. This is the
              single strongest reason customers convert to Stripe checkout,
              so we put it directly under the value prop, above the CTA. */}
          <div
            className="mt-7 animate-fade-up"
            style={{ animationDelay: "325ms", animationFillMode: "both" }}
          >
            <PayAfterRideBadge variant="hero" testId="hero-pay-after-badge" />
          </div>

          <div
            className="mt-10 flex flex-wrap items-center gap-4 animate-fade-up"
            style={{ animationDelay: "400ms", animationFillMode: "both" }}
          >
            <a
              href="#booking"
              data-testid="hero-cta-book"
              className="group inline-flex items-center gap-3 px-8 py-4 bg-[#D4AF37] text-black hover:bg-[#B3922E] rounded-full font-medium transition-all"
            >
              Reserve Now · Pay After Ride
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </a>
            <a
              href="#fleet"
              data-testid="hero-cta-fleet"
              className="inline-flex items-center gap-3 px-8 py-4 border border-white/20 text-white hover:bg-white/10 rounded-full transition-all"
            >
              View Fleet
            </a>
          </div>

          {/* Trust line */}
          <div
            className="mt-14 flex flex-wrap items-center gap-x-8 gap-y-4 animate-fade-up"
            style={{ animationDelay: "550ms", animationFillMode: "both" }}
          >
            <div className="flex items-center gap-2" data-testid="hero-rating">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="w-4 h-4 fill-[#D4AF37] text-[#D4AF37]" />
                ))}
              </div>
              <span className="text-sm text-white/70">5.0 · 1,200+ rides</span>
            </div>
            <div className="h-4 w-px bg-white/20" />
            <span className="text-sm text-white/70">24/7 dispatch</span>
            <div className="h-4 w-px bg-white/20" />
            <span className="text-sm text-white/70">Flat-rate airport service</span>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 hidden md:flex flex-col items-center gap-2 text-white/40 text-xs tracking-[0.3em] uppercase">
        <span>Scroll</span>
        <div className="w-px h-10 bg-gradient-to-b from-white/40 to-transparent" />
      </div>
    </section>
  );
}
