import LandingPage from "@/components/LandingPage";

const SPRINTER_IMG = "https://customer-assets.emergentagent.com/job_limo-experience-1/artifacts/z9hc1910_IMG_0001.webp";
const SEDAN_IMG = "https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0";
const SUV_IMG = "https://images.unsplash.com/photo-1767749995450-7b63ab7cd4fd?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600&ixlib=rb-4.1.0";

export default function AirportLanding() {
  return (
    <LandingPage
      testId="airport-landing"
      pageTitle="Bay Area Airport Limo · SFO OAK SJC Chauffeur — TuranEliteLimo"
      metaDescription="Private chauffeur to SFO, OAK & SJC airports. Flat-rate flight-tracked transfers, meet & greet at baggage claim, 45-minute free wait. Book online in 60 seconds."
      eyebrow="SFO · OAK · SJC · Bay Area"
      titleA="Flight-tracked transfers."
      titleAccent="Meet & greet"
      titleB="at the curb."
      subtitle="Pre-book a private chauffeur to or from SFO, Oakland, and San Jose airports. We track your flight live, adjust pickup for delays, and meet you with a name sign at baggage claim. Flat rate locked at booking — no surge, no surprises."
      trustStrip={["Flat Rate · No Surge", "45-Min Free Wait", "Live Flight Tracking", "Meet & Greet Included"]}
      pillarHeading="Designed for travelers who"
      pillarHeadingAccent="hate airport stress"
      pillars={[
        { eyebrow: "01", title: "Live Flight Tracking", body: "We pull your flight status in real time. Early arrival, delay, or gate change — your chauffeur is already adjusted before you land." },
        { eyebrow: "02", title: "Meet & Greet at Baggage", body: "Your chauffeur waits inside the terminal with a name sign, helps with luggage, and walks you to the vehicle. No curb-side scramble." },
        { eyebrow: "03", title: "45-Minute Free Wait", body: "Long customs line at international arrivals? Bags delayed? We hold the vehicle complimentary for the first 45 minutes after landing." },
        { eyebrow: "04", title: "Flat Rate · No Surge", body: "Your quoted price is the final price. No peak-hour multipliers, no late-night premiums, gratuity included." },
        { eyebrow: "05", title: "Foreign Cards Welcome", body: "Apple Pay, Visa, Mastercard, Amex, and foreign-issued cards all accepted. Receipts emailed instantly in USD." },
        { eyebrow: "06", title: "Multilingual 24/7", body: "Real humans answer calls and texts around the clock in English, Spanish, Russian, and Turkish." },
      ]}
      routesEyebrow="Popular airport routes"
      routesTitleA="Bay Area airports to"
      routesTitleAccent="anywhere worth going"
      routes={[
        { from: "SFO Airport", to: "Downtown SF", time: "30 min", from_full: "San Francisco International" },
        { from: "SFO Airport", to: "Palo Alto", time: "25 min", from_full: "San Francisco International" },
        { from: "SFO Airport", to: "Napa Valley", time: "1h 30min", from_full: "San Francisco International" },
        { from: "OAK Airport", to: "Downtown SF", time: "30 min", from_full: "Oakland International" },
        { from: "SJC Airport", to: "Silicon Valley", time: "20 min", from_full: "San José International" },
        { from: "SJC Airport", to: "Downtown SF", time: "55 min", from_full: "San José International" },
      ]}
      fleetEyebrow="Your airport fleet"
      fleetTitleA="From solo business travel to"
      fleetTitleAccent="family-of-six arrivals"
      fleet={[
        { name: "Executive Sedan", seats: "1-3 passengers", desc: "Cadillac XTS · Mercedes E-Class. Quiet, smooth, on time. Perfect for the executive arrival.", img: SEDAN_IMG },
        { name: "Luxury SUV", seats: "1-6 passengers", desc: "Cadillac Escalade · GMC Yukon. Captain's chairs, massive trunk for international luggage.", img: SUV_IMG },
        { name: "Executive Sprinter", seats: "8-12 passengers", desc: "Mercedes Sprinter Executive. Captain's chairs + leather. Ideal for hospitality groups & family travel.", img: SPRINTER_IMG },
      ]}
      gallery={[
        "https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?fm=jpg&q=70&w=1200&auto=format&fit=crop&ixlib=rb-4.1.0",
        "https://images.unsplash.com/photo-1767749995450-7b63ab7cd4fd?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200&ixlib=rb-4.1.0",
        SPRINTER_IMG,
        "https://images.unsplash.com/photo-1609521247503-8de40462e427?fm=jpg&q=70&w=1200&auto=format&fit=crop&ixlib=rb-4.1.0",
        "https://images.unsplash.com/photo-1545185105-a81262517cf4?fm=jpg&q=70&w=1200&auto=format&fit=crop&ixlib=rb-4.1.0",
      ]}
      ctaEyebrow="Pre-book for your next flight"
      ctaTitleA="Lock your airport chauffeur in"
      ctaTitleAccent="under 60 seconds"
      ctaSubtitle="Live quote. Flat rate. Instant confirmation by email and SMS. Zero phone tag."
      faqs={[
        { q: "What if my flight is delayed?", a: "We monitor your flight in real time. If your inbound flight is delayed, we automatically push back your pickup. The first 45 minutes of wait time after your scheduled landing is complimentary." },
        { q: "Where will my chauffeur meet me at SFO / OAK / SJC?", a: "By default we offer curbside pickup at the arrivals level. For an upgraded experience, request meet & greet at booking — your chauffeur waits inside the terminal at baggage claim holding a name sign and helps with luggage." },
        { q: "Do you accept foreign credit cards?", a: "Yes. We process payments through Stripe and accept all major international cards (Visa, Mastercard, Amex), Apple Pay, and Google Pay. All charges are in USD; your bank handles conversion at their rate." },
        { q: "Is gratuity included?", a: "Yes. The flat rate you see at booking includes driver gratuity. No mandatory tip is added at the end of the ride. If you wish to tip extra for exceptional service, that's always appreciated but never expected." },
        { q: "Can I book a round trip (airport → hotel → airport)?", a: "Absolutely. Many travelers book a round-trip during checkout — same vehicle, same chauffeur if available, and a discount versus two one-way bookings." },
        { q: "Do you serve international arrivals?", a: "Yes. We meet travelers at all SFO international terminals and adjust for customs/immigration delays. The meet & greet option includes help with luggage and translating signage if needed." },
      ]}
    />
  );
}
