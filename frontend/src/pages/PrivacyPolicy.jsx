import Logo from "@/components/Logo";

const SECTIONS = [
  {
    title: "1. Who we are",
    body: (
      <>
        <p>TuranEliteLimo (&quot;we,&quot; &quot;us,&quot; &quot;our&quot;) is a premium chauffeur transportation service operating in the San Francisco Bay Area and Northern California. This Privacy Policy explains how we collect, use, share, and protect information when you use our website (<a href="https://www.turanelitelimo.com" className="text-[#D4AF37]">turanelitelimo.com</a>) and our mobile application (TuranEliteLimo for iOS and Android).</p>
        <p>Last updated: February 20, 2026.</p>
      </>
    ),
  },
  {
    title: "2. Information we collect",
    body: (
      <ul className="list-disc pl-5 space-y-2">
        <li><strong>Account information:</strong> Name, email, phone number, password (stored hashed using bcrypt).</li>
        <li><strong>Booking information:</strong> Pickup address, drop-off address, date/time, passenger count, vehicle type, special notes.</li>
        <li><strong>Payment information:</strong> Processed exclusively by Stripe. We do <em>not</em> store full card numbers — we only store a tokenized reference returned by Stripe.</li>
        <li><strong>Location (riders, optional):</strong> Only while you have an active trip and only to display pickup points and live driver position.</li>
        <li><strong>Location (drivers):</strong> Background GPS during accepted trips, so the rider and dispatcher can see live ETA. Drivers can revoke this permission at any time from device settings.</li>
        <li><strong>Device data:</strong> Standard logs (IP, device type, OS, app version) for diagnostics, fraud prevention, and abuse mitigation.</li>
      </ul>
    ),
  },
  {
    title: "3. How we use information",
    body: (
      <ul className="list-disc pl-5 space-y-2">
        <li>To confirm, schedule, dispatch, and complete your reservation.</li>
        <li>To send transactional confirmations, status updates, and receipts (email via Resend; SMS via our messaging provider).</li>
        <li>To process payments via Stripe (including authorized incidental charges for documented wait time, mid-trip add-stops, or vehicle damage as described at booking time).</li>
        <li>To improve route accuracy and pricing fairness using Google Maps Distance Matrix and Geocoding APIs.</li>
        <li>To prevent fraud, enforce our Terms of Service, and respond to legal requests.</li>
      </ul>
    ),
  },
  {
    title: "3a. SMS / text messaging program",
    body: (
      <>
        <p>By providing your mobile number and checking the SMS consent box at booking or quote request, you expressly consent to receive text messages (SMS) from TuranEliteLimo. We use two SMS message categories:</p>
        <ul className="list-disc pl-5 mt-3 space-y-2">
          <li><strong>Transactional (required to use the service):</strong> Booking confirmations, payment receipts, trip status updates, driver dispatch and pickup notifications, ETA changes, post-trip receipts, and quote responses.</li>
          <li><strong>Promotional (optional, separate opt-in):</strong> Occasional offers, seasonal promos, event packages. No more than 4 messages per calendar month.</li>
        </ul>
        <p className="mt-3"><strong>Message frequency:</strong> typically 2–5 messages per booking for transactional, up to 4 per month for promotional. Total monthly volume depends on your booking activity.</p>
        <p className="mt-3"><strong>Message &amp; data rates:</strong> Standard message and data rates from your wireless carrier may apply. TuranEliteLimo does not charge for SMS.</p>
        <p className="mt-3"><strong>Opt-out:</strong> Reply <strong>STOP</strong> to any TuranEliteLimo SMS at any time to unsubscribe from that message category. You will receive a final confirmation message and no further SMS in that category. Opting out of transactional SMS does not cancel your trip — please call (650) 410-0687 to manage active bookings.</p>
        <p className="mt-3"><strong>Help:</strong> Reply <strong>HELP</strong> to any TuranEliteLimo SMS for support information, or email <a href="mailto:support@turanelitelimo.com" className="text-[#D4AF37]">support@turanelitelimo.com</a>.</p>
        <p className="mt-3"><strong>Carrier disclaimer:</strong> Carriers (AT&amp;T, T-Mobile, Verizon, etc.) are not liable for delayed or undelivered messages.</p>
        <p className="mt-3"><strong>Privacy of SMS data:</strong> Mobile information collected for SMS will not be shared with third parties or affiliates for marketing or promotional purposes. Information sharing is limited to the SMS service providers (e.g., Twilio) strictly necessary to deliver the messages you&apos;ve requested.</p>
      </>
    ),
  },
  {
    title: "4. Who we share with",
    body: (
      <>
        <p>We share only the minimum necessary data with the following vendors, and only to deliver our service:</p>
        <ul className="list-disc pl-5 mt-3 space-y-1">
          <li><strong>Stripe</strong> — payment processing.</li>
          <li><strong>Google (Maps, Places, Distance Matrix)</strong> — address autocomplete, route calculations, mapping.</li>
          <li><strong>Resend</strong> — transactional email delivery.</li>
          <li><strong>SMS provider</strong> — booking confirmations and driver status alerts.</li>
          <li><strong>Apple Push / Google Firebase</strong> — push notifications (only for users who opt in).</li>
          <li><strong>Your chauffeur</strong> — your name, phone, pickup &amp; drop-off, passenger count, and notes are shared with the assigned driver so they can complete your ride.</li>
        </ul>
        <p className="mt-3"><strong>We never sell your personal information.</strong></p>
      </>
    ),
  },
  {
    title: "5. Your rights",
    body: (
      <>
        <p>You have the right to:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Access the personal information we hold about you.</li>
          <li>Correct any inaccurate information.</li>
          <li>Delete your account and associated data (subject to required tax / financial record retention).</li>
          <li>Revoke marketing email consent at any time from any email&apos;s unsubscribe link.</li>
          <li>Disable location sharing from device settings.</li>
        </ul>
        <p className="mt-3">Email <a href="mailto:support@turanelitelimo.com" className="text-[#D4AF37]">support@turanelitelimo.com</a> to exercise any of these rights. We&apos;ll respond within 30 days.</p>
      </>
    ),
  },
  {
    title: "6. Data retention",
    body: (
      <p>We retain booking and payment records for 7 years (US tax requirement). Marketing preferences are honored immediately. Account profile data can be deleted on request, except for records we&apos;re legally required to keep. Location pings from active trips are deleted within 30 days.</p>
    ),
  },
  {
    title: "7. Children",
    body: <p>TuranEliteLimo is not directed at children under 13. We do not knowingly collect personal information from anyone under 13. If you believe we have, contact us and we will delete it.</p>,
  },
  {
    title: "8. Security",
    body: <p>Passwords are stored using bcrypt. Payment details are tokenized by Stripe. All traffic uses HTTPS (TLS 1.2+). No method is 100% secure, but we follow industry best practices and continuously monitor for vulnerabilities.</p>,
  },
  {
    title: "9. Changes to this policy",
    body: <p>We may update this policy from time to time. The &quot;Last updated&quot; date at the top will change, and material changes will be emailed to active users.</p>,
  },
  {
    title: "10. Contact",
    body: (
      <p>
        TuranEliteLimo · Bay Area, California, USA<br />
        Email: <a href="mailto:support@turanelitelimo.com" className="text-[#D4AF37]">support@turanelitelimo.com</a><br />
        Phone: (650) 410-0687
      </p>
    ),
  },
];

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#050505] text-white px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <Logo variant="full" height={56} />
        </div>
        <p className="text-[10px] tracking-[0.25em] text-[#D4AF37] font-semibold mb-3">PRIVACY POLICY</p>
        <h1 className="text-4xl font-light mb-3">How we handle your data.</h1>
        <p className="text-white/55 text-sm leading-7 mb-12">
          We collect only what&apos;s needed to confirm and fulfill your ride, never sell your data, and protect everything we store. This page explains exactly what, why, and with whom.
        </p>

        <div className="space-y-10">
          {SECTIONS.map((sec) => (
            <section key={sec.title} data-testid={`privacy-section-${sec.title.toLowerCase().slice(0, 5)}`}>
              <h2 className="text-xl text-[#D4AF37] mb-3">{sec.title}</h2>
              <div className="text-white/75 text-sm leading-7 space-y-3">{sec.body}</div>
            </section>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-white/10 text-white/40 text-xs">
          © {new Date().getFullYear()} TuranEliteLimo · All rights reserved · <a href="/terms" className="text-[#D4AF37]">Terms of Service</a>
        </div>
      </div>
    </div>
  );
}
