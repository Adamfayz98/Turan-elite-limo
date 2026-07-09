import { useEffect, useState } from "react";
import { Menu, X, Phone, MessageCircle, Star } from "lucide-react";
import Logo from "@/components/Logo";

import { api } from "@/lib/api";
import { trackPhoneCall } from "@/lib/googleAdsEvents";

const NAV_LINKS = [
  { label: "Fleet", href: "#fleet" },
  { label: "Services", href: "#services" },
  { label: "App", href: "/app" },
  { label: "Coverage", href: "#coverage" },
  { label: "Reviews", href: "#testimonials" },
  { label: "Contact", href: "#contact" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [trust, setTrust] = useState(null); // { rating, count, url } from Google

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/reviews/summary")
      .then((r) => {
        if (cancelled) return;
        const g = r.data?.google;
        if (g && g.rating && g.count) setTrust(g);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <nav
      data-testid="main-navbar"
      style={{ top: "var(--top-banners-h, calc(var(--smart-banner-h, 0px) + var(--promo-banner-h, 0px)))" }}
      className={`fixed left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "glass-nav border-b border-white/10" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-10 h-20 flex items-center justify-between">
        <a href="#top" data-testid="logo-link" className="flex items-center group">
          <Logo variant="full" height={64} />
        </a>

        <div className="hidden lg:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              data-testid={`nav-link-${l.label.toLowerCase()}`}
              className="text-sm text-white/70 hover:text-[#D4AF37] transition-colors tracking-wide"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden lg:flex items-center gap-3">
          {trust && (
            <a
              href={trust.url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="nav-google-trust"
              title={`${trust.rating} stars from ${trust.count.toLocaleString()} Google reviews`}
              className="flex items-center gap-2 pl-3 pr-3.5 py-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 hover:border-[#D4AF37]/40 transition-all"
            >
              <Star className="w-3.5 h-3.5 fill-[#D4AF37] text-[#D4AF37]" />
              <span className="text-sm text-white/90 font-medium tabular-nums">
                {trust.rating}
              </span>
              <span className="text-xs text-white/50">
                · {trust.count.toLocaleString()} reviews
              </span>
            </a>
          )}
          <a
            href="sms:+16506723520"
            data-testid="nav-text-button"
            className="flex items-center gap-2 px-4 py-2.5 border border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-all rounded-full text-sm font-medium"
            title="Text us for fast response"
          >
            <MessageCircle className="w-4 h-4" />
            Text
          </a>
          <a
            href="tel:+16506723520"
            onClick={() => trackPhoneCall({ source: "navbar" })}
            data-testid="nav-phone"
            className="flex items-center gap-2 text-sm text-white/80 hover:text-white"
          >
            <Phone className="w-4 h-4 text-[#D4AF37]" />
            (650) 672‑3520
          </a>
          <a
            href="#booking"
            data-testid="nav-book-button"
            className="px-5 py-2.5 bg-[#D4AF37] text-black hover:bg-[#B3922E] transition-all rounded-full text-sm font-medium"
          >
            Reserve
          </a>
        </div>

        <button
          data-testid="mobile-menu-toggle"
          className="lg:hidden text-white"
          onClick={() => setOpen((s) => !s)}
          aria-label="Toggle menu"
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden border-t border-white/10 bg-black/90 backdrop-blur-xl">
          <div className="px-6 py-6 flex flex-col gap-5">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                data-testid={`mobile-nav-${l.label.toLowerCase()}`}
                className="text-white/80 hover:text-[#D4AF37]"
              >
                {l.label}
              </a>
            ))}
            <div className="flex gap-3 pt-2">
              <a
                href="sms:+16506723520"
                onClick={() => setOpen(false)}
                data-testid="mobile-nav-text"
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-[#D4AF37]/30 text-[#D4AF37] rounded-full text-sm font-medium"
              >
                <MessageCircle className="w-4 h-4" />
                Text
              </a>
              <a
                href="#booking"
                onClick={() => setOpen(false)}
                data-testid="mobile-nav-book"
                className="flex-1 inline-flex items-center justify-center px-5 py-2.5 bg-[#D4AF37] text-black rounded-full text-sm font-medium"
              >
                Reserve
              </a>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
