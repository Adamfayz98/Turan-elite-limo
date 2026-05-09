import { Link } from "react-router-dom";
import { Facebook, Instagram, Youtube, MapPin, Phone } from "lucide-react";
import Logo from "@/components/Logo";

const SOCIALS = [
  { icon: Facebook, href: "https://facebook.com", label: "Facebook" },
  { icon: Instagram, href: "https://instagram.com", label: "Instagram" },
  { icon: Youtube, href: "https://youtube.com", label: "YouTube" },
];

export default function Footer() {
  return (
    <footer
      data-testid="site-footer"
      className="border-t border-white/10 bg-[#070707] px-6 md:px-10 pt-20 pb-10"
    >
      <div className="max-w-7xl mx-auto grid md:grid-cols-12 gap-12">
        <div className="md:col-span-4">
          <div className="flex items-center gap-3">
            <Logo size={48} className="text-[#D4AF37]" />
            <div className="font-serif text-3xl">
              Turan<span className="gold-text">EliteLimo</span>
            </div>
          </div>
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
              href="https://yelp.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Yelp"
              data-testid="social-yelp"
              className="w-10 h-10 rounded-full border border-[#1F1F1F] flex items-center justify-center text-white/60 hover:text-[#D4AF37] hover:border-[#D4AF37]/40 transition-all"
            >
              <span className="font-serif text-sm font-bold">Y</span>
            </a>
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
          <h5 className="text-xs uppercase tracking-[0.3em] text-white/40">Locations</h5>
          <div className="mt-5 space-y-5 text-sm">
            <div className="flex items-start gap-3" data-testid="footer-address-1">
              <MapPin className="w-4 h-4 text-[#D4AF37] mt-0.5 flex-shrink-0" />
              <div className="text-white/70 leading-relaxed">
                <span className="text-white">San Francisco</span><br />
                Bayshore Hwy<br />
                Burlingame, CA 94010
              </div>
            </div>
            <div className="flex items-start gap-3" data-testid="footer-address-2">
              <MapPin className="w-4 h-4 text-[#D4AF37] mt-0.5 flex-shrink-0" />
              <div className="text-white/70 leading-relaxed">
                <span className="text-white">East Bay</span><br />
                San Ramon Valley Blvd<br />
                San Ramon, CA 94583
              </div>
            </div>
            <div className="flex items-start gap-3 pt-2">
              <Phone className="w-4 h-4 text-[#D4AF37] mt-0.5 flex-shrink-0" />
              <div className="text-white/70">
                <a href="tel:+16504100687" className="hover:text-[#D4AF37]">(650) 410‑0687</a>
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
