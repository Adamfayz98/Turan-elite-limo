import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

/**
 * Floating "Get Instant Quote" CTA that sticks to the bottom of the viewport
 * on mobile after the user scrolls past the hero. Desktop hides it.
 *
 * Tap → scrolls smoothly to the #booking section. Designed for ad-driven
 * mobile traffic that's otherwise one screen away from the booking form.
 */
export default function StickyMobileCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      // Show once the user has scrolled past ~60% of one viewport (past the hero)
      setVisible(window.scrollY > window.innerHeight * 0.6);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <a
      href="#booking"
      data-testid="sticky-mobile-cta"
      aria-label="Get an instant quote"
      className={`md:hidden fixed left-4 right-4 bottom-4 z-40 flex items-center justify-center gap-2 px-6 py-4 rounded-full bg-[#D4AF37] text-black font-medium shadow-[0_8px_30px_rgba(212,175,55,0.45)] transition-all duration-300 ${
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      Get Instant Quote
      <ArrowRight className="w-4 h-4" />
    </a>
  );
}
