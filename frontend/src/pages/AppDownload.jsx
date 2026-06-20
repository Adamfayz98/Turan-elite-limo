import { useEffect, useState } from "react";
import Logo from "@/components/Logo";

// Apple's official badge SVG (black, English). Hot-linked from Apple's CDN
// is permitted under the App Store Marketing Guidelines for download promotion.
const APPLE_BADGE = "https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83";
const PLAY_BADGE = "https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png";

// QR code via free API — encodes the App Store URL on the fly.
const APP_STORE_URL = "https://apps.apple.com/us/app/turanelitelimo/id6771610380";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.turanelitelimo.app";
const QR = (url) => `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}&color=D4AF37&bgcolor=050505&qzone=2`;

export default function AppDownload() {
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    setIsIOS(/iPhone|iPad|iPod/.test(ua));
    setIsAndroid(/Android/.test(ua));
  }, []);

  return (
    <div className="min-h-screen bg-black text-white" data-testid="app-download-page">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1305] via-black to-black opacity-90" />
        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">
          <div className="flex items-center gap-3 mb-12 opacity-90">
            <Logo size={44} />
            <span className="text-lg tracking-wide">TuranEliteLimo</span>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-[#D4AF37] text-xs tracking-[0.3em] mb-4 uppercase">Now on iPhone & Android</p>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light tracking-tight leading-[1.05]">
                Premium Bay Area
                <br />
                chauffeurs, <span className="italic text-[#D4AF37]">in your pocket.</span>
              </h1>
              <p className="text-white/60 text-base mt-6 max-w-lg leading-relaxed">
                Book a sedan, SUV, Sprinter, or limo in under sixty seconds. Live up-front pricing, real-time tracking,
                Apple Pay & Google Pay at checkout. SFO · OAK · SJC. 24/7 dispatch.
              </p>

              {/* Badges */}
              <div className="flex flex-wrap items-center gap-4 mt-10">
                <a
                  data-testid="app-download-appstore-link"
                  href={APP_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-80 transition"
                >
                  <img src={APPLE_BADGE} alt="Download on the App Store" className="h-14" />
                </a>
                <a
                  data-testid="app-download-playstore-link"
                  href={PLAY_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-80 transition"
                >
                  <img src={PLAY_BADGE} alt="Get it on Google Play" className="h-14" />
                </a>
              </div>

              {/* Promo */}
              <div className="mt-10 inline-flex items-center gap-3 px-5 py-3 rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/5">
                <span className="text-[#D4AF37] tracking-widest text-xs">WELCOME20</span>
                <span className="text-white/70 text-sm">20% off your first ride</span>
              </div>
            </div>

            {/* QR codes — desktop priority. Show iOS + Android side by side. */}
            <div className="hidden lg:flex justify-end gap-4">
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-sm">
                <p className="text-white/50 text-xs tracking-[0.3em] uppercase mb-4 text-center">iPhone</p>
                <div className="bg-black p-3 rounded-xl mb-3">
                  <img src={QR(APP_STORE_URL)} alt="App Store QR" className="w-40 h-40" />
                </div>
                <p className="text-center text-white/60 text-[11px]">Camera → Scan</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-sm">
                <p className="text-white/50 text-xs tracking-[0.3em] uppercase mb-4 text-center">Android</p>
                <div className="bg-black p-3 rounded-xl mb-3">
                  <img src={QR(PLAY_STORE_URL)} alt="Google Play QR" className="w-40 h-40" />
                </div>
                <p className="text-center text-white/60 text-[11px]">Camera → Scan</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile-only auto-redirect prompt */}
      {(isIOS || isAndroid) && (
        <div className="bg-[#D4AF37] text-black py-4 px-6 text-center sticky top-0 z-20">
          <a
            data-testid="app-download-mobile-cta"
            href={isIOS ? APP_STORE_URL : PLAY_STORE_URL}
            className="font-medium text-sm"
          >
            {isIOS ? "Tap to open in the App Store →" : "Tap to open in Google Play →"}
          </a>
        </div>
      )}

      {/* Feature strip */}
      <section className="max-w-6xl mx-auto px-6 py-20 grid sm:grid-cols-3 gap-10 border-t border-white/5">
        {[
          { h: "Live quotes", b: "See every charge before you confirm. No surge. No surprises." },
          { h: "Real-time tracking", b: "Watch your chauffeur arrive on a live map. ETA always visible." },
          { h: "24/7 dispatch", b: "Text or call (650) 410-0687 anytime. Real humans, real fast." },
        ].map((f) => (
          <div key={f.h} className="space-y-2">
            <h3 className="text-[#D4AF37] text-lg">{f.h}</h3>
            <p className="text-white/55 text-sm leading-relaxed">{f.b}</p>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10 px-6 text-center">
        <a href="/" className="text-white/50 text-sm hover:text-[#D4AF37]">← Back to home</a>
      </footer>
    </div>
  );
}
