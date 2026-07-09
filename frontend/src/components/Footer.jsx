import { Link } from "react-router-dom";
import { Facebook, Instagram, Youtube, MapPin, Phone, MessageCircle } from "lucide-react";
import Logo from "@/components/Logo";
import { trackPhoneCall } from "@/lib/googleAdsEvents";

const SOCIALS = [
  { icon: Facebook, href: "https://www.facebook.com/turanelitelimo", label: "Facebook" },
  { icon: Instagram, href: "https://www.instagram.com/turanelitelimo", label: "Instagram" },
  { icon: Youtube, href: "https://www.youtube.com/@turanelitelimo", label: "YouTube" },
  { icon: MessageCircle, href: "https://wa.me/16504100687", label: "WhatsApp" },
];

const APP_STORE_URL = "https://apps.apple.com/us/app/turanelitelimo/id6771610380";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.turanelitelimo.app";
const APPLE_BADGE = "https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83";
const PLAY_BADGE = "https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png";

export default function Footer() {
  return (
    <footer
      data-testid="site-footer"
      className="border-t border-white/10 bg-[#070707] px-6 md:px-10 pt-20 pb-10"
    >
      <div className="max-w-7xl mx-auto grid md:grid-cols-12 gap-12">
        <div className="md:col-span-4">
          <Logo variant="full" height={72} />
          <p className="mt-5 text-white/55 leading-relaxed max-w-md">
            A private chauffeur service for the Bay Area & Northern California. Sedans, SUVs, stretch limousines and party buses — staffed by chauffeurs who care.
          </p>

          <div className="mt-8 flex gap-3">
            {SOCIALS.map((s) => {
              const Icon = s.icon;
              return (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  data-testid={`social-${s.label.toLowerCase()}`}
                  className="w-10 h-10 rounded-full border border-[#1F1F1F] flex items-center justify-center text-white/60 hover:text-[#D4AF37] hover:border-[#D4AF37]/40 transition-all"
                >
                  <Icon className="w-4 h-4" />
                </a>
              );
            })}
            <a
              href="https://yelp.com/biz/turanelitelimo"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Yelp"
              data-testid="social-yelp"
              className="w-10 h-10 rounded-full border border-[#1F1F1F] flex items-center justify-center text-white/60 hover:text-[#D4AF37] hover:border-[#D4AF37]/40 transition-all"
            >
              <span className="font-serif text-sm font-bold">Y</span>
            </a>
          </div>

          {/* App Store + Play Store badges */}
          <div className="mt-8" data-testid="footer-app-badges">
            <h5 className="text-xs uppercase tracking-[0.3em] text-white/40 mb-3">Get the App</h5>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="footer-appstore-badge"
                className="hover:opacity-90 transition-opacity"
              >
                <img
                  src={APPLE_BADGE}
                  alt="Download on the App Store"
                  className="h-10 w-auto"
                  loading="lazy"
                />
              </a>
              <a
                href={PLAY_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="footer-playstore-badge"
                className="hover:opacity-90 transition-opacity"
              >
                <img
                  src={PLAY_BADGE}
                  alt="Get it on Google Play"
                  className="h-[58px] w-auto -my-2"
                  loading="lazy"
                />
              </a>
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <h5 className="text-xs uppercase tracking-[0.3em] text-white/40">Site</h5>
          <ul className="mt-5 space-y-3 text-sm text-white/70">
            <li><a href="#fleet" className="hover:text-[#D4AF37]">Fleet</a></li>
            <li><a href="#services" className="hover:text-[#D4AF37]">Services</a></li>
            <li><a href="#coverage" className="hover:text-[#D4AF37]">Coverage</a></li>
            <li><a href="#about" className="hover:text-[#D4AF37]">About</a></li>
            <li><a href="#booking" className="hover:text-[#D4AF37]">Reserve</a></li>
          </ul>
        </div>

        <div className="md:col-span-2">
          <h5 className="text-xs uppercase tracking-[0.3em] text-white/40">Service</h5>
          <ul className="mt-5 space-y-3 text-sm text-white/70">
            <li>Airport Transfers</li>
            <li>Weddings</li>
            <li>Corporate</li>
            <li>Hourly Charter</li>
            <li>Wine Tours</li>
          </ul>
        </div>

        <div className="md:col-span-4">
          <h5 className="text-xs uppercase tracking-[0.3em] text-white/40">Headquarters</h5>
          <div className="mt-5 space-y-5 text-sm">
            <div className="flex items-start gap-3" data-testid="footer-address-1">
              <MapPin className="w-4 h-4 text-[#D4AF37] mt-0.5 flex-shrink-0" />
              <div className="text-white/70 leading-relaxed">
                <span className="text-white">TuranEliteLimo</span><br />
                501 Broadway, #251<br />
                Millbrae, CA 94030
              </div>
            </div>
            <div className="flex items-start gap-3 pt-2">
              <Phone className="w-4 h-4 text-[#D4AF37] mt-0.5 flex-shrink-0" />
              <div className="text-white/70">
                <a href="tel:+16504100687" onClick={() => trackPhoneCall({ source: "footer" })} className="hover:text-[#D4AF37]">(650) 410‑0687</a>
                <span className="text-white/40 mx-2">·</span>
                <a href="sms:+16504100687" className="hover:text-[#D4AF37]" data-testid="footer-text-link">
                  Text us
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between gap-4 text-xs text-white/40">
        <span>© {new Date().getFullYear()} TuranEliteLimo. All rights reserved.</span>
        <div className="flex flex-wrap gap-6">
          <Link to="/admin/login" data-testid="footer-admin-link" className="hover:text-[#D4AF37]">
            Admin
          </Link>
          <span>Licensed · Insured · TCP-Compliant</span>
        </div>
      </div>
    </footer>
  );
}
