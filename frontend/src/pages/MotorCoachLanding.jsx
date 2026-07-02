import LandingPage from "@/components/LandingPage";

const PARTY_BUS_IMG = "/fleet/party-bus.jpg";
const SPRINTER_IMG = "/fleet/sprinter.jpg";
const SUV_IMG = "/fleet/luxury-suv.jpg";

export default function MotorCoachLanding() {
  return (
    <LandingPage
      testId="motor-coach-landing"
      pageTitle="Bay Area Motor Coach Rental · 40–56 Passenger Charter Bus — TuranEliteLimo"
      metaDescription="San Francisco Bay Area motor coach and charter bus rental. 40, 45, 50, and 56 passenger coaches for corporate roadshows, weddings, sports teams, church groups, and tours. Reclining seats, restroom, PA system, WiFi option. Flat rate, professional driver, TCP licensed."
      eyebrow="San Francisco · Bay Area · Sacramento · Monterey · Santa Cruz"
      titleA="Move the whole group"
      titleAccent="in one clean sweep"
      titleB="— no caravan required."
      subtitle="Our 40–56 passenger motor coaches carry your entire team, wedding party, or tour group in one vehicle. Reclining seats, onboard restroom, PA system, luggage bay, professional CDL driver. Corporate roadshows, sports teams, weddings, church groups, day tours to Napa or Monterey — one coach, one price, one driver, zero logistics headaches."
      ctaLabel="Get My Charter Bus Quote →"
      socialProof="Trusted by Bay Area corporate teams, wedding planners & tour operators"
      priceFrom="From $2,200 flat-day · 5-hour minimum · all-inclusive"
      trustStrip={["40–56 Passengers", "Onboard Restroom", "Reclining Seats · PA System", "CDL Professional Driver"]}
      pillarHeading="Why groups book"
      pillarHeadingAccent="a motor coach with us"
      pillars={[
        { eyebrow: "01", title: "One Vehicle, Whole Group", body: "Stop coordinating six Sprinters and eight Ubers. One coach picks everyone up at the hotel or office and delivers them together. Nobody gets lost, nobody's late, nobody misses the ceremony." },
        { eyebrow: "02", title: "Real Coach Comfort", body: "Reclining high-back seats, tinted windows, individual reading lights, overhead storage, climate control, onboard restroom. Full-size cabin — this isn't a bus you dread, it's a bus that makes the drive part of the trip." },
        { eyebrow: "03", title: "40, 45, 50, or 56 Passenger", body: "Right-size the coach to your headcount. 40-pax for tight corporate groups, 56-pax when the whole wedding party plus in-laws are riding. We'll match the seating capacity to your list — not oversell you a bigger bus." },
        { eyebrow: "04", title: "CDL Licensed Driver", body: "Every motor coach driver is CDL Passenger + Air Brakes licensed, DOT-certified, and drug-tested. Suited, punctual, DOT hours-of-service compliant. No last-minute driver swaps, no cutting corners on qualifications." },
        { eyebrow: "05", title: "Luggage Bay + PA System", body: "Full-length underfloor luggage bays fit checked bags, cases, sports gear, wedding décor. Overhead compartments for carry-ons. PA microphone for wedding coordinators, tour guides, and corporate MCs." },
        { eyebrow: "06", title: "Flat Day Rate · No Surprises", body: "Confirmed all-in pricing before the trip. Includes fuel, tolls, driver, gratuity option, and standard wait time. No per-mile fees, no surprise overtime — additional hours confirmed in writing only." },
      ]}
      routesEyebrow="Popular motor coach trips"
      routesTitleA="Corporate roadshows, weddings &"
      routesTitleAccent="whole-group Bay Area transfers"
      routes={[
        { from: "SF Hotel Block", to: "Wedding Venue + Return", time: "6-8 hr", from_full: "Wedding Guest Shuttle" },
        { from: "SFO / OAK / SJC", to: "Corporate Retreat", time: "Full day", from_full: "Airport Group Transfer" },
        { from: "Silicon Valley", to: "Napa / Sonoma", time: "Full day", from_full: "Corporate Wine Tour" },
        { from: "SF Office", to: "Multi-City Roadshow", time: "Multi-day", from_full: "Executive Roadshow" },
        { from: "Bay Area", to: "Monterey / Carmel", time: "Full day", from_full: "Team Offsite" },
        { from: "Church / Community", to: "Group Charter", time: "Custom", from_full: "Church & Nonprofit Groups" },
      ]}
      fleetEyebrow="Motor coach options"
      fleetTitleA="From 40-seat mid-size to"
      fleetTitleAccent="56-seat full touring coach"
      fleet={[
        { name: "Motor Coach 56", seats: "50-56 passengers", desc: "The flagship. Reclining seats, restroom, PA system, luggage bay, WiFi option, panoramic windows. Corporate roadshows, large weddings, tours.", img: PARTY_BUS_IMG },
        { name: "Motor Coach 45", seats: "40-45 passengers", desc: "Mid-size touring coach. Same amenities as the 56 in a slightly smaller footprint. Great for corporate groups & wedding parties.", img: PARTY_BUS_IMG },
        { name: "Mini Coach", seats: "24-35 passengers", desc: "The step-down when 56 is overkill. High-back seats, AC, luggage bay. See our dedicated Mini Coach page.", img: SPRINTER_IMG },
        { name: "Chase SUV", seats: "1-6 passengers", desc: "Cadillac Escalade or Yukon for the VIP party — bride & groom, executives, keynote speaker — while the coach carries the group.", img: SUV_IMG },
      ]}
      gallery={[PARTY_BUS_IMG, SPRINTER_IMG, SUV_IMG, PARTY_BUS_IMG, SPRINTER_IMG]}
      ctaEyebrow="Plan the group transport"
      ctaTitleA="Get your motor coach quote in"
      ctaTitleAccent="under 60 seconds"
      ctaSubtitle="Tell us the date, headcount, pickup, and route. We'll come back with a flat all-in price within an hour. Popular Saturdays (wedding season, tech conferences) book out 6–8 weeks — don't wait."
      faqs={[
        { q: "How many passengers can a motor coach hold?", a: "Our motor coaches seat 40 to 56 passengers depending on the model. 40 and 45-passenger coaches are common for corporate roadshows and wedding parties. The 56-passenger touring coach is the largest and includes onboard restroom, luggage bay, and PA system. Tell us your headcount and we'll match you to the right size." },
        { q: "Does the motor coach have a restroom?", a: "Yes, all our 45+ passenger motor coaches include an onboard restroom. For 40-passenger and mini-coach models, we plan restroom stops into longer routes." },
        { q: "Can we take a motor coach to Napa, Monterey, or Tahoe?", a: "Absolutely. Motor coaches are ideal for full-day and multi-day trips — Napa & Sonoma wine tours, Monterey/Carmel offsites, Tahoe ski trips, Yosemite tours. DOT hours-of-service rules apply for the driver, so we plan the schedule carefully; for very long routes we may pair drivers." },
        { q: "Is a chaperone or DJ setup available?", a: "The motor coach includes a PA microphone that connects to the sound system — perfect for wedding coordinators, tour guides, or corporate MCs. Bluetooth audio streaming is standard. We do not provide a DJ, but you're welcome to route audio from your device." },
        { q: "What's included in the flat rate?", a: "Fuel, tolls, standard parking, CDL driver, and standard 15-minute grace wait time on each pickup. Not included: driver gratuity (industry standard is 18-20%), any casino/hotel driver stay for multi-day trips, and overnight lodging on multi-day charters. All spelled out in your written quote." },
        { q: "How far in advance should we book?", a: "Motor coaches book faster than most vehicles. Saturday wedding season (May–October) and tech conference season should be reserved 8–12 weeks ahead. Corporate roadshows we can often turn around in 1–2 weeks. Sports team charters we recommend 3–4 weeks minimum." },
        { q: "Do you carry commercial insurance and CDL drivers?", a: "Yes. All motor coach charters are operated under TCP licensing with $5M commercial insurance and CDL Passenger + Air Brakes certified drivers who are DOT drug-tested and hours-of-service compliant. We'll send certificates of insurance on request for venue/corporate contracts." },
        { q: "Can we bring alcohol on the motor coach?", a: "For private wedding charters, corporate events, or bachelor/bachelorette groups (21+), yes — with ice and cups provided by us. For sports teams with minors, community/church groups, and school-affiliated trips, no alcohol. All open-container rules apply. We can decline service if underage drinking occurs." },
      ]}
    />
  );
}
