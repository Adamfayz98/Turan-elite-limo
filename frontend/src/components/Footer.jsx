import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer
      data-testid="site-footer"
      className="border-t border-white/10 bg-[#070707] px-6 md:px-10 pt-20 pb-10"
    >
      <div className="max-w-7xl mx-auto grid md:grid-cols-12 gap-12">
        <div className="md:col-span-5">
          <div className="font-serif text-3xl">
            Turon<span className="gold-text">limo</span>
          </div>
          <p className="mt-5 text-white/55 leading-relaxed max-w-md">
            A private chauffeur service for the Bay Area & Northern California. Sedans, SUVs, stretch limousines and party buses — staffed by chauffeurs who care.
          </p>
        </div>

        <div className="md:col-span-2">
          <h5 className="text-xs uppercase tracking-[0.3em] text-white/40">Site</h5>
          <ul className="mt-5 space-y-3 text-sm text-white/70">
            <li><a href="#fleet" className="hover:text-[#D4AF37]">Fleet</a></li>
            <li><a href="#services" className="hover:text-[#D4AF37]">Services</a></li>
            <li><a href="#coverage" className="hover:text-[#D4AF37]">Coverage</a></li>
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
          </ul>
        </div>

        <div className="md:col-span-3">
          <h5 className="text-xs uppercase tracking-[0.3em] text-white/40">Contact</h5>
          <ul className="mt-5 space-y-3 text-sm text-white/70">
            <li>
              <a href="tel:+15555555555" className="hover:text-[#D4AF37]">(555) 555‑5555</a>
            </li>
            <li>
              <a href="mailto:reservations@turonlimo.com" className="hover:text-[#D4AF37]">
                reservations@turonlimo.com
              </a>
            </li>
            <li>San Francisco · Bay Area · NorCal</li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between gap-4 text-xs text-white/40">
        <span>© {new Date().getFullYear()} Turonlimo. All rights reserved.</span>
        <div className="flex gap-6">
          <Link to="/admin/login" data-testid="footer-admin-link" className="hover:text-[#D4AF37]">
            Admin
          </Link>
          <span>Licensed · Insured · TCP-Compliant</span>
        </div>
      </div>
    </footer>
  );
}
