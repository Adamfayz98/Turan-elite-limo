import Logo from "@/components/Logo";

const SECTIONS = [
  {
    title: "1. Acceptance of these terms",
    body: <p>By booking a ride with TuranEliteLimo (&quot;we,&quot; &quot;us&quot;) — via our website at <a href="https://www.turanelitelimo.com" className="text-[#D4AF37]">turanelitelimo.com</a> or our mobile app — you agree to these Terms of Service. If you do not agree, please do not use the service.</p>,
  },
  {
    title: "2. Service description",
    body: <p>TuranEliteLimo provides chauffeured ground transportation in the San Francisco Bay Area and Northern California. All vehicles are licensed, insured, and operated by TSA-screened chauffeurs. Service availability depends on fleet capacity and is not guaranteed at all times.</p>,
  },
  {
    title: "3. Booking & confirmation",
    body: (
      <>
        <p>A reservation is created when you submit a booking request and pay the displayed quote. Until payment is captured, the reservation is held but not confirmed. We email and text confirmations on successful payment.</p>
        <p>Quotes shown at booking include base fare, distance, time-of-day surge (if any), and zone surcharges where applicable. The 2% service fee is itemized on the receipt.</p>
      </>
    ),
  },
  {
    title: "4. Cancellation & change policy",
    body: (
      <ul className="list-disc pl-5 space-y-2">
        <li><strong>More than 24 hours before pickup:</strong> Free cancellation, full refund.</li>
        <li><strong>Within 24 hours of pickup:</strong> 50% cancellation fee.</li>
        <li><strong>Within 2 hours of pickup:</strong> Non-refundable.</li>
        <li><strong>No-show:</strong> 100% of the reservation total is charged (see &quot;wait time&quot; below).</li>
        <li>Schedule changes (date, time, pickup, drop-off, vehicle) are free anytime subject to availability. If a change increases the fare, you authorize the difference; if it decreases the fare, we refund the difference.</li>
      </ul>
    ),
  },
  {
    title: "5. Wait time & no-show",
    body: (
      <ul className="list-disc pl-5 space-y-2">
        <li><strong>Airport pickups:</strong> 45-minute grace period after your flight lands.</li>
        <li><strong>All other rides:</strong> 15-minute grace period from the scheduled pickup time.</li>
        <li>Beyond the grace period, a per-minute wait fee applies (rate varies by vehicle class, displayed at booking).</li>
        <li>If we wait 45 minutes beyond the grace period without reaching the rider, the reservation is treated as a no-show and 100% of the total is charged.</li>
      </ul>
    ),
  },
  {
    title: "6. Mid-trip add-stops",
    body: <p>Unplanned stops during a ride may be added at the rider&apos;s request. Each stop incurs the per-mile detour cost plus any wait time over 10 minutes at that stop. The chauffeur logs the stop; charges are itemized on the receipt and processed on the card on file. The rider is notified of each charge by email.</p>,
  },
  {
    title: "7. Vehicle care & damages",
    body: <p>Damage, soiling, or extra cleaning caused by a rider or their party is the rider&apos;s responsibility. Actual repair / professional cleaning cost is charged to the card on file, with itemized documentation (photos + invoice) emailed to the rider. Smoking and consumption of illegal substances are prohibited in all vehicles.</p>,
  },
  {
    title: "8. Conduct",
    body: <p>Drivers reserve the right to refuse or terminate service for: visible intoxication that endangers safety, aggressive or threatening behavior, transporting unsafe items, or any conduct that violates the law. In such cases the full fare is forfeit.</p>,
  },
  {
    title: "9. Payments",
    body: <p>Payments are processed by Stripe. By booking, you authorize TuranEliteLimo (via Stripe) to charge the card on file for the booked fare, plus any documented post-trip charges (wait time, mid-trip stops, damages) per these Terms. Disputed charges are reviewed by our admin within 5 business days.</p>,
  },
  {
    title: "10. Liability",
    body: <p>To the maximum extent permitted by law, TuranEliteLimo&apos;s liability for any claim arising from a ride is limited to the amount paid for that ride. We are not responsible for missed flights, delayed appointments, or indirect/consequential damages caused by traffic, weather, road closures, or other circumstances outside our reasonable control.</p>,
  },
  {
    title: "11. Privacy",
    body: <p>Your privacy matters. See our <a href="/privacy" className="text-[#D4AF37]">Privacy Policy</a> for details on what we collect, how we use it, and your rights.</p>,
  },
  {
    title: "12. Disputes & governing law",
    body: <p>These Terms are governed by the laws of the State of California. Any dispute will be resolved in the courts located in San Mateo County, California. You and TuranEliteLimo waive any right to a jury trial; disputes will be resolved by binding individual arbitration except where prohibited.</p>,
  },
  {
    title: "13. Changes to these terms",
    body: <p>We may update these Terms from time to time. The &quot;Last updated&quot; date below will change. Material changes will be emailed to active users. Continued use after a change indicates acceptance.</p>,
  },
  {
    title: "14. Contact",
    body: (
      <p>
        TuranEliteLimo · Bay Area, California<br />
        Email: <a href="mailto:support@turanelitelimo.com" className="text-[#D4AF37]">support@turanelitelimo.com</a><br />
        Phone: (650) 410-0687
      </p>
    ),
  },
];

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#050505] text-white px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <Logo variant="full" height={56} />
        </div>
        <p className="text-[10px] tracking-[0.25em] text-[#D4AF37] font-semibold mb-3">TERMS OF SERVICE</p>
        <h1 className="text-4xl font-light mb-3">The rules of the road.</h1>
        <p className="text-white/55 text-sm leading-7 mb-2">
          Plain-English terms covering bookings, cancellations, wait time, add-stops, vehicle care, and refunds.
        </p>
        <p className="text-white/40 text-xs mb-12">Last updated: February 20, 2026.</p>

        <div className="space-y-10">
          {SECTIONS.map((sec) => (
            <section key={sec.title} data-testid={`terms-section-${sec.title.toLowerCase().slice(0, 5)}`}>
              <h2 className="text-xl text-[#D4AF37] mb-3">{sec.title}</h2>
              <div className="text-white/75 text-sm leading-7 space-y-3">{sec.body}</div>
            </section>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-white/10 text-white/40 text-xs">
          © {new Date().getFullYear()} TuranEliteLimo · All rights reserved · <a href="/privacy" className="text-[#D4AF37]">Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}
