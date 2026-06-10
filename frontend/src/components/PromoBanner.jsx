import { useEffect, useRef, useState } from "react";
import { Gift, X } from "lucide-react";

import { api } from "@/lib/api";

/**
 * Sitewide promo banner — appears at the very top of the page when there's
 * an active promo flagged `show_on_banner` from the admin Promos tab.
 *
 * Publishes its own rendered height as a CSS variable `--promo-banner-h` on
 * the document root so the fixed Navbar can offset itself by that amount.
 *
 * Dismissed state is remembered in sessionStorage so it doesn't bug the user
 * on every page navigation; it comes back next session.
 */
export default function PromoBanner() {
  const [promo, setPromo] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const sessionKey = "promo_banner_dismissed";
    if (sessionStorage.getItem(sessionKey)) {
      setDismissed(true);
    }
    (async () => {
      try {
        const { data } = await api.get("/promos/banner");
        if (data?.code) setPromo(data);
      } catch {
        /* silent — banner is optional */
      }
    })();
  }, []);

  // Publish the banner's rendered height as a CSS variable so the fixed
  // Navbar can sit just under it. Re-measures on resize.
  useEffect(() => {
    if (!promo || dismissed) {
      document.documentElement.style.setProperty("--promo-banner-h", "0px");
      return;
    }
    const update = () => {
      const h = ref.current?.offsetHeight ?? 0;
      document.documentElement.style.setProperty("--promo-banner-h", `${h}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      ro.disconnect();
      document.documentElement.style.setProperty("--promo-banner-h", "0px");
    };
  }, [promo, dismissed]);

  if (!promo || dismissed) return null;

  const discountLabel =
    promo.discount_type === "percent"
      ? `${promo.value}% OFF`
      : `$${promo.value} OFF`;

  const headline = promo.first_ride_only
    ? `New riders: ${discountLabel} your first ride`
    : `${discountLabel} your ride`;

  const scrollToBooking = (e) => {
    // If we're on the homepage, smooth-scroll. Otherwise let the anchor navigate.
    if (window.location.pathname === "/") {
      e.preventDefault();
      document.querySelector("#booking")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div
      ref={ref}
      data-testid="promo-banner"
      role="region"
      aria-label="Promotional offer"
      className="sticky z-[60] bg-gradient-to-r from-[#D4AF37] via-[#E5C24A] to-[#D4AF37] text-black"
      style={{ top: "var(--smart-banner-h, 0px)" }}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-2.5 flex items-center justify-center gap-3 text-sm md:text-[15px] font-medium">
        <Gift className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">{headline}</span>
        <span className="sm:hidden">{discountLabel}</span>
        <span className="text-black/70 hidden md:inline">·</span>
        <span className="hidden md:inline text-black/85">
          Use code{" "}
          <span className="font-mono font-bold tracking-wider px-1.5 py-0.5 rounded bg-black/15">
            {promo.code}
          </span>
          {" "}at checkout
        </span>
        <a
          href="/#booking"
          onClick={scrollToBooking}
          data-testid="promo-banner-cta"
          className="ml-1 underline underline-offset-4 hover:no-underline font-semibold whitespace-nowrap"
        >
          Book now →
        </a>
      </div>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          sessionStorage.setItem("promo_banner_dismissed", "1");
        }}
        aria-label="Dismiss promo banner"
        data-testid="promo-banner-dismiss"
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-black/10 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
