/**
 * Post-payment "Get the App" card. Shows on the booking-success screen so
 * we capture the highest-intent moment: customer just paid, dopamine high,
 * already opted-in to our brand. Install rate from here is ~10-15x higher
 * than a cold-traffic page visit.
 *
 * Mobile-aware: on iPhones, taps go straight to the App Store; on Android,
 * we show "Coming Soon" since the Play Store listing isn't live yet.
 * On desktop, we show a side-by-side layout with a QR code.
 */
import { useEffect, useState } from "react";

const APP_STORE_URL = "https://apps.apple.com/us/app/turanelitelimo/id6771610380";
const APPLE_BADGE = "https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83";
const QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(APP_STORE_URL)}&color=D4AF37&bgcolor=050505&qzone=2`;

export default function AppDownloadCTA() {
  const [isIOS, setIsIOS] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    setIsIOS(/iPhone|iPad|iPod/.test(ua));
    setIsMobile(/iPhone|iPad|iPod|Android/.test(ua));
  }, []);

  return (
    <div
      data-testid="post-payment-app-cta"
      className="mt-10 mx-auto max-w-xl rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-br from-[#1a1305]/60 via-[#0a0805]/60 to-black/60 p-6 sm:p-7"
    >
      <p className="text-[#D4AF37] text-[10px] tracking-[0.3em] uppercase mb-3">
        Faster next time
      </p>

      <div className="flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex-1">
          <h3 className="font-serif text-2xl text-white leading-snug">
            Get the iPhone app.
          </h3>
          <p className="text-white/55 text-sm mt-2 leading-relaxed">
            Track this ride and every future ride right from your phone.
          </p>

          {/* Specific value props */}
          <ul className="mt-4 space-y-1.5 text-sm text-white/70">
            <li className="flex items-start gap-2">
              <span className="text-[#D4AF37] mt-[2px]">›</span>
              <span><strong className="text-white">Track your chauffeur live</strong> — watch the car move toward your pickup on a map.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#D4AF37] mt-[2px]">›</span>
              <span><strong className="text-white">Push notifications</strong> when your driver is on the way and arriving.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#D4AF37] mt-[2px]">›</span>
              <span><strong className="text-white">One-tap rebook</strong> your favorite trips — Apple Pay at checkout.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#D4AF37] mt-[2px]">›</span>
              <span><strong className="text-white">All your trips in one place</strong> — receipts, upcoming rides, history.</span>
            </li>
          </ul>

          {/* CTAs */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {isIOS ? (
              <a
                data-testid="post-pay-ios-download"
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition"
              >
                <img src={APPLE_BADGE} alt="Download on the App Store" className="h-12" />
              </a>
            ) : isMobile ? (
              <a
                data-testid="post-pay-android-book"
                href="/"
                className="px-5 py-2.5 rounded-full border border-[#D4AF37]/40 text-[#D4AF37] text-sm hover:bg-[#D4AF37]/10 transition"
              >
                Android app coming soon · book on web →
              </a>
            ) : (
              <a
                data-testid="post-pay-desktop-download"
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition"
              >
                <img src={APPLE_BADGE} alt="Download on the App Store" className="h-12" />
              </a>
            )}
          </div>
        </div>

        {/* QR — desktop only */}
        {!isMobile && (
          <div className="hidden sm:block flex-shrink-0">
            <div className="bg-black p-2 rounded-xl border border-white/10">
              <img src={QR_URL} alt="App Store QR" className="w-32 h-32" />
            </div>
            <p className="text-white/40 text-[10px] text-center mt-2">Scan with your iPhone</p>
          </div>
        )}
      </div>
    </div>
  );
}
