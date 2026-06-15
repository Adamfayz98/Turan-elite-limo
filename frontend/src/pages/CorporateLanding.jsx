import LandingPage from "@/components/LandingPage";

const SEDAN_IMG = "/fleet/executive-sedan.jpg";
const SUV_IMG = "/fleet/luxury-suv.jpg";
const SPRINTER_IMG = "/fleet/sprinter.jpg";

const CORPORATE_HERO = "/landings/corporate/hero.jpg";
const SF_SKYLINE = "/landings/corporate/sf-skyline.jpg";

export default function CorporateLanding() {
  return (
    <LandingPage
      testId="corporate-landing"
      pageTitle="Silicon Valley Corporate Chauffeur · Executive Transfers — TuranEliteLimo"
      metaDescription="Corporate chauffeur service for the Bay Area & Silicon Valley. Executive sedan & SUV roadshows, board transfers, multi-stop investor meetings, monthly billing for firms."
      eyebrow="Silicon Valley · Bay Area · Peninsula"
      titleA="On time, on brand,"
      titleAccent="on schedule"
      titleB="every single ride."
      subtitle="A professional chauffeur for executive transfers, investor roadshows, board meetings, and conference logistics. SFO meet-and-greet, hourly chauffeur, multi-stop itineraries. Monthly invoicing available for firms with recurring travel."
      trustStrip={["Discreet · Suited Chauffeurs", "Monthly Invoicing", "Multi-Stop Roadshows", "24/7 Executive Dispatch"]}
      pillarHeading="What Bay Area firms expect from"
      pillarHeadingAccent="executive ground transport"
      pillars={[
        { eyebrow: "01", title: "Suited, Briefed Chauffeurs", body: "Our drivers arrive in suit-and-tie attire, briefed on your itinerary, destinations, and any contact preferences. Bottled water, phone chargers, climate ready." },
        { eyebrow: "02", title: "Multi-Stop Roadshows", body: "Investor meetings across Sand Hill Road, Palo Alto, and San Francisco? One chauffeur, one vehicle, one fixed price — built around your calendar." },
        { eyebrow: "03", title: "SFO Meet & Greet", body: "International or out-of-town executives arrive to a name sign at baggage claim. Luggage handled. Vehicle waiting. Zero curbside confusion." },
        { eyebrow: "04", title: "Monthly Invoicing", body: "Firms with recurring travel get consolidated monthly invoices, ride-level reporting (employee name, cost center, project code), and no friction at year-end audit." },
        { eyebrow: "05", title: "Discretion by Default", body: "Our chauffeurs sign NDAs. Conversation is initiated by the passenger only. Vehicle privacy partitions available on request." },
        { eyebrow: "06", title: "24/7 Dispatch", body: "Real humans on the phone every hour of every day. Last-minute schedule change at 11 PM? Same-day vehicle from Palo Alto? Call dispatch — done." },
      ]}
      routesEyebrow="Common corporate routes"
      routesTitleA="From Silicon Valley HQs to"
      routesTitleAccent="anywhere your team needs to be"
      routes={[
        { from: "SFO Airport", to: "Sand Hill Road", time: "30 min", from_full: "Inbound Executive Pickup" },
        { from: "Cupertino", to: "Downtown SF", time: "50 min", from_full: "Apple Park / 1 Infinite Loop" },
        { from: "Mountain View", to: "SFO Airport", time: "30 min", from_full: "Google HQ" },
        { from: "Menlo Park", to: "Hotel Loop", time: "Hourly", from_full: "Meta HQ Roadshow" },
        { from: "Palo Alto", to: "Sand Hill Road", time: "10 min", from_full: "Stanford / Investor Meetings" },
        { from: "San Jose", to: "SFO Airport", time: "1h", from_full: "South Bay Corporate Travel" },
      ]}
      fleetEyebrow="Executive fleet"
      fleetTitleA="The right vehicle for"
      fleetTitleAccent="every level of executive"
      fleet={[
        { name: "Executive Sedan", seats: "1-3 passengers", desc: "Cadillac XTS · Mercedes E-Class. The classic executive ride. Smooth, quiet, professional — Wi-Fi & charger included.", img: SEDAN_IMG },
        { name: "Luxury SUV", seats: "1-6 passengers", desc: "Cadillac Escalade · GMC Yukon. Board member transport, partner roadshows, room for laptops & roller bags.", img: SUV_IMG },
        { name: "Executive Sprinter", seats: "8-12 passengers", desc: "Mercedes Sprinter Executive. Mobile boardroom — conference seating, Wi-Fi, screens, tables. The roadshow vehicle.", img: SPRINTER_IMG },
      ]}
      experienceImage={{
        src: CORPORATE_HERO,
        alt: "San Francisco skyline at dusk",
        kicker: "Built for Silicon Valley schedules",
        caption: "Your investor lands at 7:42 AM. Your board meeting is at 9. The roadshow has six stops between Sand Hill Road and the Financial District. We've already mapped the chauffeur rotation.",
      }}
      itineraryEyebrow="A sample executive day"
      itineraryTitleA="Roadshow rhythm —"
      itineraryTitleAccent="6 meetings, 1 chauffeur, zero stress"
      itineraryIntro="Most of our corporate clients book recurring weekly rides or full-day roadshows. Here's how a typical 'Sand Hill day' looks for a CEO doing an investor tour."
      itinerary={[
        {
          time: "7:30 AM",
          title: "Airport arrival · SFO terminal pickup",
          blurb: "Chauffeur tracks the inbound flight, meets at baggage claim with a discreet sign. Coffee on board (your usual order is on file). Wi-Fi powered on, no small talk unless invited.",
        },
        {
          time: "9:00 AM",
          title: "Sand Hill Road · Sequoia",
          blurb: "30-min meeting. Chauffeur circles or parks at the lot, ready in 25 min. You walk out, door already open, next presentation pulled up on the cabin screen.",
        },
        {
          time: "10:30 AM",
          title: "Menlo Park · Andreessen Horowitz",
          blurb: "Second stop. The chauffeur has already routed for traffic, called ahead to the receptionist with your arrival time. You arrive 2 minutes before scheduled.",
        },
        {
          time: "12:30 PM",
          title: "Working lunch · Cabin or Madera",
          blurb: "Either eat in the SUV between stops (full table service, hot food, no spills on the suit) or we drop at Rosewood's Madera. Your choice; we accommodate either.",
        },
        {
          time: "2:00 PM",
          title: "Palo Alto → SF · Two more partners",
          blurb: "The afternoon arc up to the city. Chauffeur takes 280 N if you're tight on time, or 101 if you want one last call window. You decide between meetings.",
        },
        {
          time: "5:30 PM",
          title: "Dinner reservation · Quince or Atelier Crenn",
          blurb: "We drop you at the restaurant. Vehicle and chauffeur stand by — or released for the night with a return pickup at 9 PM. Your call, in writing 1 hour before.",
        },
        {
          time: "10:00 PM",
          title: "Return to hotel · Four Seasons or St. Regis",
          blurb: "Quiet ride back. Cabin lights dimmed, climate to your preference (on file). Tomorrow's schedule emailed before the chauffeur signs off.",
        },
      ]}
      gallery={[
        SEDAN_IMG, SUV_IMG, SPRINTER_IMG,
        SF_SKYLINE,
        "/fleet/first-class.jpg",
      ]}
      ctaEyebrow="Set up a corporate account"
      ctaTitleA="Recurring executive travel,"
      ctaTitleAccent="one monthly invoice"
      ctaSubtitle="Tell us your firm and approximate volume. We'll set up a corporate account with cost-center reporting, NET-30 billing, and a dedicated dispatch line."
      faqs={[
        { q: "Do you offer corporate accounts?", a: "Yes. Firms with recurring travel get a corporate account, dedicated dispatch line, NET-30 monthly invoicing, and ride-level reporting (passenger name, cost center, project code) for finance reconciliation." },
        { q: "Can chauffeurs sign NDAs?", a: "Yes. We're happy to execute your standard NDA before any booking. Our chauffeurs are vetted, trained, and instructed to maintain confidentiality on all conversations, materials, and destinations." },
        { q: "Do you handle multi-leg investor roadshows?", a: "Constantly. Sand Hill Road, Palo Alto, downtown SF, Mountain View — we route entire investor days with one chauffeur and one fixed quote. Most clients add a 30-minute buffer between stops so meetings never feel rushed." },
        { q: "What's your cancellation policy for corporate?", a: "Cancellations more than 12 hours before pickup are free. Inside 12 hours, we charge 50% of the booked fare. Same-day cancellations are billed in full because the chauffeur has been blocked out for that window." },
        { q: "Can the chauffeur use my company's preferred parking / building access?", a: "Yes. Many of our regular clients pre-issue parking passes or building access codes. Provide these at booking and we'll brief the chauffeur. For visitor security, our drivers carry company-issued badges and are happy to follow your protocol." },
        { q: "Do you accept corporate cards / wire transfers?", a: "Yes. We accept all major credit cards (Visa, Mastercard, Amex), corporate procurement cards, and wire transfers for accounts on NET-30 terms. Direct ACH is also available." },
      ]}
    />
  );
}
