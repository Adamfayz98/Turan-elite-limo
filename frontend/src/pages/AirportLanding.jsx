import { useLocation } from "react-router-dom";
import LandingPage from "@/components/LandingPage";

/**
 * /airport (Bay Area generic) · /sfo-airport-transfer · /oak-airport-transfer · /sjc-airport-transfer
 *
 * URL-aware Google Ads landing page. The same component dynamically swaps in
 * SFO-, OAK-, or SJC-specific hero copy, routes, pillars, and FAQs depending
 * on which slug the user landed on. This dramatically improves Quality Score
 * for narrow-intent airport keywords (e.g. [san jose airport limo],
 * [oakland airport limo]) by guaranteeing the landing page actually mentions
 * the specific airport above the fold instead of treating all three as one.
 */

const SPRINTER_IMG = "/fleet/sprinter.jpg";
const SEDAN_IMG = "/fleet/executive-sedan.jpg";
const SUV_IMG = "/fleet/luxury-suv.jpg";

const AIRPORT_HERO = "/landings/airport/hero.jpg";
const CHAUFFEUR_SIGN = "/landings/airport/chauffeur-sign.jpg";

// Shared fleet + gallery + trust strip across all airport variants.
const SHARED_FLEET = [
  { name: "Executive Sedan", seats: "1-3 passengers", desc: "Cadillac XTS · Mercedes E-Class. Quiet, smooth, on time. Perfect for the executive arrival.", img: SEDAN_IMG },
  { name: "Luxury SUV", seats: "1-6 passengers", desc: "Cadillac Escalade · GMC Yukon. Captain's chairs, massive trunk for international luggage.", img: SUV_IMG },
  { name: "Executive Sprinter", seats: "8-12 passengers", desc: "Mercedes Sprinter Executive. Captain's chairs + leather. Ideal for hospitality groups & family travel.", img: SPRINTER_IMG },
];

const SHARED_GALLERY = [
  "/fleet/executive-sedan.jpg",
  "/fleet/luxury-suv.jpg",
  SPRINTER_IMG,
  "/fleet/first-class.jpg",
  CHAUFFEUR_SIGN,
];

const SHARED_TRUST = ["Flat Rate · No Surge", "45-Min Free Wait", "Live Flight Tracking", "Meet & Greet Included"];

// ---------- AIRPORT-SPECIFIC CONFIG ----------

const SJC_CONFIG = {
  pageTitle: "San Jose Airport Limo · SJC Chauffeur Service — TuranEliteLimo",
  metaDescription: "Private chauffeur to and from San Jose International Airport (SJC). Flat-rate flight-tracked transfers, meet & greet at baggage claim, 45-minute free wait. Silicon Valley executives book in 60 seconds.",
  eyebrow: "San Jose International (SJC) · Silicon Valley",
  titleA: "San Jose Airport limo,",
  titleAccent: "meet & greet",
  titleB: "at SJC baggage claim.",
  subtitle: "Pre-book a private chauffeur to or from San Jose International Airport (SJC). Live flight tracking, meet & greet inside the terminal, 45-minute complimentary wait — and direct connection to Santa Clara, Palo Alto, Cupertino, Sunnyvale, San Francisco, and Napa. Flat rate locked at booking.",
  pillarHeading: "Designed for Silicon Valley executives who",
  pillarHeadingAccent: "fly in and out of SJC weekly",
  pillars: [
    { eyebrow: "01", title: "Live SJC Flight Tracking", body: "We pull your SJC arrival in real time. Early flight, delay, or gate change — your chauffeur is already adjusted before you land at San Jose International." },
    { eyebrow: "02", title: "Meet & Greet at SJC Baggage", body: "Your chauffeur meets you inside Terminal A or Terminal B with a name sign, helps with luggage, and walks you to the vehicle parked curbside. No rideshare scramble." },
    { eyebrow: "03", title: "45-Minute Free Wait at SJC", body: "Bags delayed at SJC? International arrivals at the international terminal? We hold the vehicle complimentary for the first 45 minutes after landing." },
    { eyebrow: "04", title: "Direct to Silicon Valley", body: "San Jose Airport is 5 minutes from Santana Row, 15 minutes from Apple Park, 20 minutes from Stanford. We know every campus, hotel, and back road." },
    { eyebrow: "05", title: "Flat Rate · No Surge", body: "Your quoted price is the final price. No peak-hour multipliers, no late-night premiums, gratuity included on every SJC transfer." },
    { eyebrow: "06", title: "Foreign Cards Welcome", body: "Apple Pay, Visa, Mastercard, Amex, and foreign-issued cards all accepted. Receipts emailed instantly in USD — ideal for international Silicon Valley business travelers." },
  ],
  routesEyebrow: "Popular SJC airport routes",
  routesTitleA: "San Jose Airport to",
  routesTitleAccent: "anywhere in Silicon Valley & the Bay",
  routes: [
    { from: "SJC Airport", to: "Apple Park · Cupertino", time: "15 min", from_full: "San José International" },
    { from: "SJC Airport", to: "Stanford · Palo Alto", time: "20 min", from_full: "San José International" },
    { from: "SJC Airport", to: "Santana Row · San Jose", time: "8 min", from_full: "San José International" },
    { from: "SJC Airport", to: "Sand Hill Road · Menlo Park", time: "25 min", from_full: "San José International" },
    { from: "SJC Airport", to: "Downtown San Francisco", time: "55 min", from_full: "San José International" },
    { from: "SJC Airport", to: "Napa Valley", time: "1h 50min", from_full: "San José International" },
  ],
  experienceImage: {
    src: AIRPORT_HERO,
    alt: "San Jose International Airport at dusk",
    kicker: "From wheels-down at SJC to in the car",
    caption: "Your flight lands at San Jose International at 4:18 PM. We see the touchdown ping. By the time you've grabbed your carry-on and walked past TSA, our chauffeur is at SJC baggage claim with a discreet name sign — phone off, charger ready, water in the cup holder.",
  },
  itineraryTitleA: "The 30 minutes after you land at SJC —",
  ctaTitleA: "Lock your San Jose Airport chauffeur",
  faqs: [
    { q: "Where will my chauffeur meet me at SJC (San Jose International Airport)?", a: "By default we offer curbside pickup at the SJC arrivals level (Terminal A and Terminal B both supported). For an upgraded experience, request meet & greet at booking — your chauffeur waits inside the SJC terminal at baggage claim holding a name sign and helps with luggage." },
    { q: "How long does it take to get from SJC to Apple Park / Stanford / downtown SF?", a: "From San Jose International: Apple Park (Cupertino) is ~15 minutes, Stanford / Palo Alto ~20 minutes, downtown San Jose ~8 minutes, Sand Hill Road (Menlo Park) ~25 minutes, and downtown San Francisco ~55 minutes in light traffic. We monitor 101 and 280 live to pick the faster route." },
    { q: "What if my SJC flight is delayed?", a: "We monitor your flight in real time using your inbound flight number. If your San Jose Airport arrival slips, we automatically push back the pickup. The first 45 minutes of wait time after your scheduled landing is complimentary." },
    { q: "Do you offer round trips from SJC?", a: "Yes. Many Silicon Valley travelers book SJC → hotel/office → SJC round trips during checkout. Same vehicle, same chauffeur if available, and a discount versus two one-way bookings." },
    { q: "Is gratuity included on SJC transfers?", a: "Yes. The flat rate you see at booking includes driver gratuity on every San Jose Airport transfer. No mandatory tip is added at the end of the ride." },
    { q: "Do you accept foreign credit cards for SJC bookings?", a: "Yes. We process payments through Stripe and accept all major international cards (Visa, Mastercard, Amex), Apple Pay, and Google Pay. All charges are in USD; your bank handles conversion at their rate." },
  ],
};

const SFO_CONFIG = {
  pageTitle: "SFO Airport Limo · San Francisco Airport Chauffeur — TuranEliteLimo",
  metaDescription: "Private chauffeur to and from San Francisco International Airport (SFO). Flat-rate flight-tracked transfers, meet & greet at baggage claim, 45-minute free wait. Book in 60 seconds.",
  eyebrow: "San Francisco International (SFO) · Bay Area",
  titleA: "SFO Airport limo,",
  titleAccent: "meet & greet",
  titleB: "at the curb.",
  subtitle: "Pre-book a private chauffeur to or from San Francisco International Airport (SFO). We track your flight live, adjust pickup for delays, and meet you with a name sign at SFO baggage claim. Flat rate locked at booking — no surge, no surprises.",
  pillarHeading: "Designed for SFO travelers who",
  pillarHeadingAccent: "hate airport stress",
  pillars: [
    { eyebrow: "01", title: "Live SFO Flight Tracking", body: "We pull your SFO arrival in real time. Early arrival, delay, or gate change — your chauffeur is already adjusted before you land at San Francisco International." },
    { eyebrow: "02", title: "Meet & Greet at SFO", body: "Your chauffeur waits inside the SFO terminal (domestic or international) with a name sign, helps with luggage, and walks you to the vehicle. No curb-side scramble." },
    { eyebrow: "03", title: "45-Minute Free Wait at SFO", body: "Long customs line at SFO international arrivals? Bags delayed? We hold the vehicle complimentary for the first 45 minutes after landing." },
    { eyebrow: "04", title: "Direct to Downtown SF or the Valley", body: "SFO sits 14 miles south of downtown San Francisco and 30 miles north of Palo Alto — we know every terminal, every garage exit, every shortcut." },
    { eyebrow: "05", title: "Flat Rate · No Surge", body: "Your quoted SFO price is the final price. No peak-hour multipliers, no late-night premiums, gratuity included." },
    { eyebrow: "06", title: "Foreign Cards Welcome", body: "Apple Pay, Visa, Mastercard, Amex, and foreign-issued cards all accepted. Receipts emailed instantly in USD." },
  ],
  routesEyebrow: "Popular SFO airport routes",
  routesTitleA: "SFO to",
  routesTitleAccent: "anywhere worth going",
  routes: [
    { from: "SFO Airport", to: "Downtown San Francisco", time: "30 min", from_full: "San Francisco International" },
    { from: "SFO Airport", to: "Palo Alto · Stanford", time: "25 min", from_full: "San Francisco International" },
    { from: "SFO Airport", to: "Napa Valley", time: "1h 30min", from_full: "San Francisco International" },
    { from: "SFO Airport", to: "San Jose · Silicon Valley", time: "40 min", from_full: "San Francisco International" },
    { from: "SFO Airport", to: "Berkeley · Oakland", time: "30 min", from_full: "San Francisco International" },
    { from: "SFO Airport", to: "Sonoma · Healdsburg", time: "1h 45min", from_full: "San Francisco International" },
  ],
  experienceImage: {
    src: AIRPORT_HERO,
    alt: "San Francisco International Airport at dusk",
    kicker: "From wheels-down at SFO to in the car",
    caption: "Your flight lands at SFO at 4:18 PM. We see the touchdown ping. By the time you've cleared customs at the international terminal and grabbed your bag, our chauffeur is at SFO baggage claim with a discreet name sign — phone off, charger ready, water in the cup holder.",
  },
  itineraryTitleA: "The 30 minutes after you land at SFO —",
  ctaTitleA: "Lock your SFO airport chauffeur",
  faqs: [
    { q: "Where will my chauffeur meet me at SFO (San Francisco International Airport)?", a: "By default we offer curbside pickup at the SFO arrivals level. For an upgraded experience, request meet & greet at booking — your chauffeur waits inside the SFO terminal at baggage claim holding a name sign and helps with luggage. We support all SFO domestic and international terminals." },
    { q: "What if my SFO flight is delayed?", a: "We monitor your flight in real time. If your inbound SFO flight is delayed, we automatically push back your pickup. The first 45 minutes of wait time after your scheduled landing is complimentary." },
    { q: "How long is SFO to downtown San Francisco / Palo Alto / Napa?", a: "From SFO: downtown SF is ~30 minutes in light traffic, Palo Alto ~25 minutes, San Jose ~40 minutes, Napa Valley ~1h 30min, Sonoma/Healdsburg ~1h 45min." },
    { q: "Do you accept foreign credit cards for SFO bookings?", a: "Yes. We process payments through Stripe and accept all major international cards (Visa, Mastercard, Amex), Apple Pay, and Google Pay. All charges are in USD; your bank handles conversion at their rate." },
    { q: "Is gratuity included on SFO transfers?", a: "Yes. The flat rate you see at booking includes driver gratuity on every SFO airport transfer. No mandatory tip is added at the end of the ride." },
    { q: "Can I book a round trip (SFO → hotel → SFO)?", a: "Absolutely. Many travelers book a round-trip SFO transfer during checkout — same vehicle, same chauffeur if available, and a discount versus two one-way bookings." },
  ],
};

const OAK_CONFIG = {
  pageTitle: "Oakland Airport Limo · OAK Chauffeur Service — TuranEliteLimo",
  metaDescription: "Private chauffeur to and from Oakland International Airport (OAK). Flat-rate flight-tracked transfers, meet & greet at baggage claim, 45-minute free wait. Book in 60 seconds.",
  eyebrow: "Oakland International (OAK) · East Bay",
  titleA: "Oakland Airport limo,",
  titleAccent: "meet & greet",
  titleB: "at OAK baggage claim.",
  subtitle: "Pre-book a private chauffeur to or from Oakland International Airport (OAK). We track your flight live, adjust pickup for delays, and meet you with a name sign at OAK baggage claim. Direct connections to Berkeley, downtown SF, Napa, and Silicon Valley — flat rate, no surge.",
  pillarHeading: "Designed for OAK travelers who",
  pillarHeadingAccent: "skip the SFO chaos",
  pillars: [
    { eyebrow: "01", title: "Live OAK Flight Tracking", body: "We pull your Oakland Airport arrival in real time. Delay, gate change, or early landing — your chauffeur is already adjusted before you walk off the plane at OAK." },
    { eyebrow: "02", title: "Meet & Greet at OAK", body: "Your chauffeur waits inside Terminal 1 or Terminal 2 with a name sign, helps with luggage, and walks you to the vehicle. No curbside scramble." },
    { eyebrow: "03", title: "45-Minute Free Wait at OAK", body: "Bags delayed at Oakland International? We hold the vehicle complimentary for the first 45 minutes after landing." },
    { eyebrow: "04", title: "Direct East Bay & Across the Bridge", body: "OAK sits 12 minutes from downtown Oakland, 25 minutes from Berkeley, 30 minutes from downtown SF via the Bay Bridge. We know every shortcut." },
    { eyebrow: "05", title: "Flat Rate · No Surge", body: "Your quoted OAK price is the final price. No peak-hour multipliers, no late-night premiums, gratuity included." },
    { eyebrow: "06", title: "Foreign Cards Welcome", body: "Apple Pay, Visa, Mastercard, Amex, and foreign-issued cards all accepted. Receipts emailed instantly in USD." },
  ],
  routesEyebrow: "Popular OAK airport routes",
  routesTitleA: "Oakland Airport to",
  routesTitleAccent: "anywhere across the Bay",
  routes: [
    { from: "OAK Airport", to: "Downtown San Francisco", time: "30 min", from_full: "Oakland International" },
    { from: "OAK Airport", to: "Berkeley", time: "25 min", from_full: "Oakland International" },
    { from: "OAK Airport", to: "Downtown Oakland", time: "12 min", from_full: "Oakland International" },
    { from: "OAK Airport", to: "Palo Alto", time: "45 min", from_full: "Oakland International" },
    { from: "OAK Airport", to: "Napa Valley", time: "1h 15min", from_full: "Oakland International" },
    { from: "OAK Airport", to: "San Jose · Silicon Valley", time: "55 min", from_full: "Oakland International" },
  ],
  experienceImage: {
    src: AIRPORT_HERO,
    alt: "Oakland International Airport at dusk",
    kicker: "From wheels-down at OAK to in the car",
    caption: "Your flight lands at Oakland International at 4:18 PM. We see the touchdown ping. By the time you've walked through the OAK terminal and grabbed your bag, our chauffeur is at baggage claim with a discreet name sign — phone off, charger ready, water in the cup holder.",
  },
  itineraryTitleA: "The 30 minutes after you land at OAK —",
  ctaTitleA: "Lock your Oakland Airport chauffeur",
  faqs: [
    { q: "Where will my chauffeur meet me at OAK (Oakland International Airport)?", a: "By default we offer curbside pickup at the OAK arrivals level (Terminal 1 and Terminal 2 both supported). For an upgraded experience, request meet & greet at booking — your chauffeur waits inside the OAK terminal at baggage claim holding a name sign." },
    { q: "How long is OAK to downtown SF / Berkeley / Silicon Valley?", a: "From Oakland International: downtown San Francisco is ~30 minutes via the Bay Bridge, Berkeley ~25 minutes, downtown Oakland ~12 minutes, Palo Alto ~45 minutes, San Jose ~55 minutes, Napa Valley ~1h 15min." },
    { q: "What if my OAK flight is delayed?", a: "We monitor your flight in real time. If your inbound Oakland Airport flight is delayed, we automatically push back your pickup. The first 45 minutes of wait time after your scheduled landing is complimentary." },
    { q: "Do you accept foreign credit cards for OAK bookings?", a: "Yes. We process payments through Stripe and accept all major international cards (Visa, Mastercard, Amex), Apple Pay, and Google Pay. All charges are in USD; your bank handles conversion at their rate." },
    { q: "Is gratuity included on OAK transfers?", a: "Yes. The flat rate you see at booking includes driver gratuity on every Oakland Airport transfer." },
    { q: "Can I book a round trip (OAK → hotel → OAK)?", a: "Absolutely. Many travelers book a round-trip OAK transfer during checkout — same vehicle, same chauffeur if available, and a discount versus two one-way bookings." },
  ],
};

const BAY_CONFIG = {
  pageTitle: "Bay Area Airport Limo · SFO OAK SJC Chauffeur — TuranEliteLimo",
  metaDescription: "Private chauffeur to SFO, OAK & SJC airports. Flat-rate flight-tracked transfers, meet & greet at baggage claim, 45-minute free wait. Book online in 60 seconds.",
  eyebrow: "SFO · OAK · SJC · Bay Area",
  titleA: "Flight-tracked transfers.",
  titleAccent: "Meet & greet",
  titleB: "at the curb.",
  subtitle: "Pre-book a private chauffeur to or from San Francisco (SFO), Oakland (OAK), and San Jose (SJC) International Airports. We track your flight live, adjust pickup for delays, and meet you with a name sign at baggage claim. Flat rate locked at booking — no surge, no surprises.",
  pillarHeading: "Designed for travelers who",
  pillarHeadingAccent: "hate airport stress",
  pillars: [
    { eyebrow: "01", title: "Live Flight Tracking", body: "We pull your flight status in real time. Early arrival, delay, or gate change — your chauffeur is already adjusted before you land." },
    { eyebrow: "02", title: "Meet & Greet at Baggage", body: "Your chauffeur waits inside the terminal with a name sign, helps with luggage, and walks you to the vehicle. No curb-side scramble." },
    { eyebrow: "03", title: "45-Minute Free Wait", body: "Long customs line at international arrivals? Bags delayed? We hold the vehicle complimentary for the first 45 minutes after landing." },
    { eyebrow: "04", title: "Flat Rate · No Surge", body: "Your quoted price is the final price. No peak-hour multipliers, no late-night premiums, gratuity included." },
    { eyebrow: "05", title: "Foreign Cards Welcome", body: "Apple Pay, Visa, Mastercard, Amex, and foreign-issued cards all accepted. Receipts emailed instantly in USD." },
    { eyebrow: "06", title: "Multilingual 24/7", body: "Real humans answer calls and texts around the clock in English, Spanish, Russian, and Turkish." },
  ],
  routesEyebrow: "Popular airport routes",
  routesTitleA: "Bay Area airports to",
  routesTitleAccent: "anywhere worth going",
  routes: [
    { from: "SFO Airport", to: "Downtown SF", time: "30 min", from_full: "San Francisco International" },
    { from: "SFO Airport", to: "Palo Alto", time: "25 min", from_full: "San Francisco International" },
    { from: "SFO Airport", to: "Napa Valley", time: "1h 30min", from_full: "San Francisco International" },
    { from: "OAK Airport", to: "Downtown SF", time: "30 min", from_full: "Oakland International" },
    { from: "SJC Airport", to: "Silicon Valley", time: "20 min", from_full: "San José International" },
    { from: "SJC Airport", to: "Downtown SF", time: "55 min", from_full: "San José International" },
  ],
  experienceImage: {
    src: AIRPORT_HERO,
    alt: "Airport runway at dusk",
    kicker: "From wheels-down to in the car",
    caption: "Your flight lands at 4:18 PM. We see the touchdown ping. By the time you've cleared customs and grabbed your bag, our chauffeur is at baggage claim with a discreet name sign — phone off, charger ready, water in the cup holder.",
  },
  itineraryTitleA: "The 30 minutes after you land —",
  ctaTitleA: "Lock your airport chauffeur in",
  faqs: [
    { q: "What if my flight is delayed?", a: "We monitor your flight in real time. If your inbound flight is delayed, we automatically push back your pickup. The first 45 minutes of wait time after your scheduled landing is complimentary." },
    { q: "Where will my chauffeur meet me at SFO / OAK / SJC?", a: "By default we offer curbside pickup at the arrivals level. For an upgraded experience, request meet & greet at booking — your chauffeur waits inside the terminal at baggage claim holding a name sign and helps with luggage." },
    { q: "Do you accept foreign credit cards?", a: "Yes. We process payments through Stripe and accept all major international cards (Visa, Mastercard, Amex), Apple Pay, and Google Pay. All charges are in USD; your bank handles conversion at their rate." },
    { q: "Is gratuity included?", a: "Yes. The flat rate you see at booking includes driver gratuity. No mandatory tip is added at the end of the ride. If you wish to tip extra for exceptional service, that's always appreciated but never expected." },
    { q: "Can I book a round trip (airport → hotel → airport)?", a: "Absolutely. Many travelers book a round-trip during checkout — same vehicle, same chauffeur if available, and a discount versus two one-way bookings." },
    { q: "Do you serve international arrivals?", a: "Yes. We meet travelers at all SFO international terminals and adjust for customs/immigration delays. The meet & greet option includes help with luggage and translating signage if needed." },
  ],
};

// Map URL slug → config.
function getAirportConfig(pathname) {
  const p = (pathname || "").toLowerCase();
  if (p.includes("sjc")) return { ...BAY_CONFIG, ...SJC_CONFIG, testId: "sjc-airport-landing" };
  if (p.includes("sfo")) return { ...BAY_CONFIG, ...SFO_CONFIG, testId: "sfo-airport-landing" };
  if (p.includes("oak")) return { ...BAY_CONFIG, ...OAK_CONFIG, testId: "oak-airport-landing" };
  return { ...BAY_CONFIG, testId: "airport-landing" };
}

// Itinerary stays identical across all airports — it's purely choreography.
const ITINERARY = [
  { time: "T-2 hours", title: "Flight tracking begins", blurb: "We pull your flight number against FlightAware. Delay alerts route to the chauffeur in real time — you don't have to text us if your flight slips. The fee structure adjusts automatically." },
  { time: "T-30 min", title: "Chauffeur arrives at the airport", blurb: "Vehicle parks in the cell-phone lot for domestic, or the official meet-and-greet zone for international. The chauffeur walks to baggage claim or the customs exit with your sign." },
  { time: "T+0 (touchdown)", title: "Wheels down · Notification sent", blurb: "You get a text the moment your plane lands: 'Welcome — your chauffeur is at baggage carousel with a sign.' No fumbling with apps or trying to find a meeting spot." },
  { time: "T+15 min", title: "Meet at baggage claim", blurb: "Chauffeur in dark suit, holding a discreet card with your name. Greets you, takes the luggage, walks to the vehicle. Doors held. Water and a hot towel inside." },
  { time: "T+25 min", title: "Curbside to vehicle to highway", blurb: "Cabin climate to your preference (saved from prior rides if you're a returning client). Wi-Fi on. Phone charger out. Music or silence — your call. Off to the hotel." },
  { time: "T+90 min", title: "Hotel lobby drop-off", blurb: "Bellhop already alerted (if it's the Four Seasons or St. Regis). Luggage transferred. You walk in already checked in. The chauffeur waves and disappears." },
];

export default function AirportLanding() {
  const location = useLocation();
  const cfg = getAirportConfig(location.pathname);

  return (
    <LandingPage
      testId={cfg.testId}
      pageTitle={cfg.pageTitle}
      metaDescription={cfg.metaDescription}
      eyebrow={cfg.eyebrow}
      titleA={cfg.titleA}
      titleAccent={cfg.titleAccent}
      titleB={cfg.titleB}
      subtitle={cfg.subtitle}
      trustStrip={SHARED_TRUST}
      pillarHeading={cfg.pillarHeading}
      pillarHeadingAccent={cfg.pillarHeadingAccent}
      pillars={cfg.pillars}
      routesEyebrow={cfg.routesEyebrow}
      routesTitleA={cfg.routesTitleA}
      routesTitleAccent={cfg.routesTitleAccent}
      routes={cfg.routes}
      fleetEyebrow="Your airport fleet"
      fleetTitleA="From solo business travel to"
      fleetTitleAccent="family-of-six arrivals"
      fleet={SHARED_FLEET}
      experienceImage={cfg.experienceImage}
      itineraryEyebrow="What an arrival actually feels like"
      itineraryTitleA={cfg.itineraryTitleA}
      itineraryTitleAccent="handled"
      itineraryIntro="Every airport transfer follows the same choreography. Here's exactly what happens, minute by minute."
      itinerary={ITINERARY}
      gallery={SHARED_GALLERY}
      ctaEyebrow="Pre-book for your next flight"
      ctaTitleA={cfg.ctaTitleA}
      ctaTitleAccent="under 60 seconds"
      ctaSubtitle="Live quote. Flat rate. Instant confirmation by email and SMS. Zero phone tag."
      faqs={cfg.faqs}
    />
  );
}
