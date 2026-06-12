import LandingPage from "@/components/LandingPage";

const PARTY_BUS_IMG = "/fleet/party-bus.jpg";
const STRETCH_IMG = "/fleet/stretch-limo.jpg";
const SPRINTER_IMG = "/fleet/sprinter.jpg";
const SUV_IMG = "/fleet/luxury-suv.jpg";

export default function PartyBusLanding() {
  return (
    <LandingPage
      testId="party-bus-landing"
      pageTitle="Bay Area Party Bus Rental · 14–30 Passenger Limo Coach — TuranEliteLimo"
      metaDescription="San Francisco & Bay Area party bus rental for birthdays, bachelorette parties, prom, weddings, corporate events. 14–30 passenger limo coach with LED lighting, premium sound, dance floor, full bar. Professional chauffeurs, flat rate, no surprises."
      eyebrow="San Francisco · Bay Area · Napa · Wine Country"
      titleA="The party doesn't"
      titleAccent="wait at red lights"
      titleB="anymore."
      subtitle="Our 14–30 passenger limo coaches turn the ride into part of the night. LED ceiling, premium club sound, dance floor, full bar, professional chauffeur. Birthdays, bachelor & bachelorette parties, prom, winery hops, wedding send-offs — anywhere the celebration needs to keep going between stops."
      trustStrip={["Up to 30 Passengers", "Full Bar Onboard", "Premium Sound · LED", "Professional Chauffeur"]}
      pillarHeading="What makes our party bus"
      pillarHeadingAccent="actually fun"
      pillars={[
        { eyebrow: "01", title: "Designed to Move", body: "Wraparound leather seating, real dance floor, LED ceiling with color sync, premium club-grade speakers. Plug in your Spotify or aux — the chauffeur handles the rest." },
        { eyebrow: "02", title: "Full Bar Onboard", body: "Stocked ice bins, glassware, cup holders, and bottle storage. Bring your own drinks (we'll provide the chill). Riders 21+ only with valid ID — no exceptions." },
        { eyebrow: "03", title: "14–30 Passengers", body: "Plenty of room for the whole group. Real seatbelts on every seat, climate control front and rear, privacy curtains optional." },
        { eyebrow: "04", title: "Multi-Stop Routes", body: "Winery hop in Napa, bar crawl in SF, restaurant → club → after-party — we plan and time the entire route so nobody waits, nobody Ubers, nobody loses the group." },
        { eyebrow: "05", title: "Professional Chauffeur", body: "Suited, sober, and silent (or talkative — your call). Trained in event logistics, with backup contact info for every venue on your itinerary." },
        { eyebrow: "06", title: "Flat Rate · No Surprises", body: "Confirmed pricing before the night starts. No mid-route fee changes, no surprise overtime — additional hours approved in writing only." },
      ]}
      routesEyebrow="Popular party bus routes"
      routesTitleA="Birthdays, bachelorettes &"
      routesTitleAccent="wine-country celebrations"
      routes={[
        { from: "SF Hotel", to: "Napa Wineries", time: "Full day", from_full: "Wine Country Tour" },
        { from: "San Jose", to: "SF Nightlife", time: "Evening", from_full: "Bar & Club Crawl" },
        { from: "Peninsula", to: "Sonoma Vineyards", time: "Full day", from_full: "Bachelorette Tour" },
        { from: "Hotel Block", to: "Reception Venue", time: "Send-off", from_full: "Wedding After-Party" },
        { from: "Oakland", to: "SF + Marin", time: "Evening", from_full: "Birthday Bash" },
        { from: "Palo Alto", to: "Half Moon Bay", time: "Custom", from_full: "Corporate Group Outing" },
      ]}
      fleetEyebrow="Party fleet options"
      fleetTitleA="From intimate stretch limo to"
      fleetTitleAccent="full party bus coach"
      fleet={[
        { name: "Party Bus", seats: "14-30 passengers", desc: "The flagship. LED ceiling, dance floor, full bar, premium sound, wraparound leather. Built for groups that want the ride to be the event.", img: PARTY_BUS_IMG },
        { name: "Stretch Limousine", seats: "8-14 passengers", desc: "Hummer & Chrysler 300 Stretch. Mood lighting, mirror ceiling, bar service, classic limo experience for smaller groups.", img: STRETCH_IMG },
        { name: "Jet Sprinter", seats: "8-10 passengers", desc: "First-class recliners, club sound, mood lighting, bar. The luxury alternative when you want premium over volume.", img: SPRINTER_IMG },
        { name: "Luxury SUV", seats: "1-6 passengers", desc: "Cadillac Escalade · GMC Yukon. Best for the VIP/birthday-person + closest friends, or as a chase vehicle for larger groups.", img: SUV_IMG },
      ]}
      gallery={[PARTY_BUS_IMG, STRETCH_IMG, SPRINTER_IMG, SUV_IMG, PARTY_BUS_IMG]}
      ctaEyebrow="Plan the night"
      ctaTitleA="Lock in your party bus with"
      ctaTitleAccent="one quick call"
      ctaSubtitle="Tell us the night, the stops, the headcount. We'll send a custom flat-rate quote within an hour. Popular Saturdays book out 4–6 weeks ahead — don't wait."
      faqs={[
        { q: "How far in advance should we book a party bus?", a: "Friday and Saturday nights, especially May through October, fill up 4–6 weeks ahead. For prom, NYE, and major holidays we recommend booking 2–3 months out. Weeknights and shorter-notice trips we'll do our best to accommodate — call us directly." },
        { q: "Is alcohol allowed onboard?", a: "Yes, for guests 21+ only with valid ID, in a vehicle booked for celebration purposes. We provide ice, cups, and storage. We do not sell or supply alcohol — bring your own. Open containers must stay inside the vehicle. Underage drinking ends the trip immediately with no refund." },
        { q: "What does the party bus include?", a: "LED ceiling lighting with color sync, premium sound system with Bluetooth + aux, dance floor space, wraparound leather seating, climate control, ice bins, cup holders, privacy curtains. Bring your own playlist and drinks — we provide everything else." },
        { q: "Can we make multiple stops?", a: "Absolutely. Multi-stop routes are our specialty — winery hops, bar crawls, dinner-to-club-to-after-party itineraries. Just send us the planned stops 48 hours in advance and we'll build the route and timing." },
        { q: "What's the cancellation policy?", a: "Free cancellation up to 7 days before the event for full refund. Inside 7 days a 50% fee applies. Inside 48 hours the reservation is non-refundable. We're flexible on rescheduling — just call us as early as possible." },
        { q: "How is the price calculated?", a: "Flat rate based on hours, route, group size, and date. No per-mile fees, no mystery overtime — the quote you confirm is what you pay. Common nights (4–6 hours) typically run $700–$1,400 plus gratuity. Holidays and peak Saturdays priced higher." },
        { q: "Do you provide a chauffeur?", a: "Yes, every booking includes a professional, suited, sober chauffeur trained in event logistics. They handle routing, timing, parking, and venue coordination so your group can focus on the night." },
      ]}
    />
  );
}
