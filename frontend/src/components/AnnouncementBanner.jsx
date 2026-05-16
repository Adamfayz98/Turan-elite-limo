import { useEffect, useRef, useState } from "react";
import { Megaphone, X } from "lucide-react";

import { api } from "@/lib/api";

/**
 * Sitewide announcement banner — appears just below the PromoBanner.
 * Reads the most recent active announcement flagged `show_in_banner`.
 *
 * Publishes its rendered height as `--announcement-banner-h`. The Navbar
 * already stacks under `--promo-banner-h` so we add ours on top of that via
 * the combined `--top-banners-h` variable maintained here.
 */
export default function AnnouncementBanner() {
  const [item, setItem] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const k = "announcement_banner_dismissed";
    (async () => {
      try {
        const { data } = await api.get("/announcements");
        const top = (data?.banner || [])[0];
        if (top) {
          // Don't show if the user dismissed THIS exact announcement this session
          const dismissedId = sessionStorage.getItem(k);
          if (dismissedId === top.id) {
            setDismissed(true);
          }
          setItem(top);
        }
      } catch {
        /* banner is optional */
      }
    })();
  }, []);

  // Maintain --announcement-banner-h and combined --top-banners-h
  useEffect(() => {
    const root = document.documentElement;
    const recompute = () => {
      const h = !item || dismissed ? 0 : ref.current?.offsetHeight ?? 0;
      root.style.setProperty("--announcement-banner-h", `${h}px`);
      const promoH = parseFloat(getComputedStyle(root).getPropertyValue("--promo-banner-h") || "0") || 0;
      root.style.setProperty("--top-banners-h", `${promoH + h}px`);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener("resize", recompute);
    // Re-measure when the promo banner above us toggles (its var changes).
    const interval = setInterval(recompute, 500);
    return () => {
      window.removeEventListener("resize", recompute);
      ro.disconnect();
      clearInterval(interval);
      root.style.setProperty("--announcement-banner-h", "0px");
    };
  }, [item, dismissed]);

  if (!item || dismissed) return null;

  const href = item.cta_url || `/news/${item.slug}`;

  return (
    <div
      ref={ref}
      data-testid="announcement-banner"
      role="region"
      aria-label="Announcement"
      className="relative z-[59] bg-[#0a0a0a] border-b border-[#D4AF37]/30 text-white"
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-2 flex items-center justify-center gap-3 text-[13px] md:text-sm">
        <Megaphone className="w-3.5 h-3.5 flex-shrink-0 text-[#D4AF37]" aria-hidden="true" />
        <span className="text-white/85 truncate">{item.title}</span>
        <a
          href={href}
          data-testid="announcement-banner-cta"
          className="text-[#D4AF37] hover:underline underline-offset-4 font-medium whitespace-nowrap"
        >
          {item.cta_label || "Read more"} →
        </a>
      </div>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          sessionStorage.setItem("announcement_banner_dismissed", item.id);
        }}
        aria-label="Dismiss announcement"
        data-testid="announcement-banner-dismiss"
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-white/10 transition-colors text-white/55"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
