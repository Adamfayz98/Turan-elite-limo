import LandingPage from "@/components/LandingPage";

const PARTY_BUS_IMG = "/fleet/party-bus.jpg";
const MOTOR_COACH_IMG = "/fleet/motor-coach.jpg";
const MINI_COACH_IMG = "/fleet/mini-coach.jpg";
const SPRINTER_IMG = "/fleet/sprinter.jpg";
const SUV_IMG = "/fleet/luxury-suv.jpg";

export default function CasinoLanding() {
  return (
    <LandingPage
      testId="casino-landing"
      pageTitle="Bay Area Casino Transportation · Graton, Thunder Valley, Reno & Tahoe Shuttle — TuranEliteLimo"
      metaDescription="Bay Area casino transportation and group shuttle service. Flat-rate rides to Graton, Thunder Valley, Cache Creek, Jackson Rancheria, and Reno/Tahoe casinos. Sprinter, Mini Coach, Motor Coach, and Party Bus options. Round-trip flat rate, professional driver, no surprises."
      eyebrow="Graton · Thunder Valley · Cache Creek · Reno · Tahoe"
      titleA="You handle the tables."
      titleAccent="We handle everything"
      titleB="between them."
      subtitle="Round-trip flat-rate casino charters from anywhere in the Bay Area to Graton, Thunder Valley, Cache Creek, Jackson Rancheria, Red Hawk, and the Reno/Tahoe casino corridor. Sprinter for smaller groups. Mini Coach and Motor Coach for larger charters. Party Bus for celebrations. Driver waits or returns on schedule — you play, we drive."
      ctaLabel="Get My Casino Quote →"
      socialProof="Bay Area's preferred casino charter — poker clubs, birthdays, corporate outings"
      priceFrom="Graton from $650 · Thunder Valley from $850 · Reno/Tahoe from $1,600 (flat, round trip)"
      trustStrip={["Flat Round-Trip Rate", "Driver Waits at Casino", "Groups of 6 to 56", "Overnight Trips Available"]}
      pillarHeading="Why Bay Area players"
      pillarHeadingAccent="charter with us"
      pillars={[
        { eyebrow: "01", title: "Flat Round-Trip Pricing", body: "One number, quoted before you book, includes fuel, tolls, driver wait time at the casino, and return. No metered hourly bills that balloon while you're at the tables. Confirmed in writing before departure." },
        { eyebrow: "02", title: "Driver Waits On Site", body: "Your driver stays at the casino for the agreed time — typically 4 to 8 hours of gambling — and drives you home when you're ready. No calling an Uber at 2 AM from Rohnert Park." },
        { eyebrow: "03", title: "Right-Sized Vehicles", body: "6-pax Sprinter for the intimate poker crew. 24–35 pax Mini Coach for the birthday group. 40–56 pax Motor Coach for the whole company outing. Party Bus if the celebration starts before Blackjack." },
        { eyebrow: "04", title: "Every Bay Area Casino Covered", body: "Graton (Rohnert Park), Thunder Valley (Lincoln), Cache Creek (Brooks), Jackson Rancheria, Red Hawk (Placerville), plus the Reno/Tahoe circuit — Peppermill, Grand Sierra, Atlantis, Harrah's Tahoe, Hard Rock Tahoe, Nugget." },
        { eyebrow: "05", title: "Overnight Trips Available", body: "Reno & Tahoe overnights are our specialty. We coordinate the drive up, the driver's overnight lodging, and the return trip. Perfect for bachelor parties, poker tournaments, and multi-day corporate outings." },
        { eyebrow: "06", title: "No Surprise DUI Risk", body: "Everyone in your group can drink freely, celebrate a win, or nurse a loss — nobody drives home. The safest, cheapest way to run a casino night when you compare it to a DUI, a bad Uber surge, or the cost of a designated-driver getting cranky." },
      ]}
      routesEyebrow="Popular casino runs"
      routesTitleA="From Bay Area to"
      routesTitleAccent="the tables & back"
      routes={[
        { from: "San Francisco", to: "Graton Resort", time: "1 hr each way", from_full: "Rohnert Park · Closest casino" },
        { from: "Bay Area", to: "Thunder Valley", time: "1.5 hrs each way", from_full: "Lincoln · Top revenue casino in CA" },
        { from: "Bay Area", to: "Cache Creek Casino", time: "2 hrs each way", from_full: "Brooks · Yolo County" },
        { from: "Bay Area", to: "Jackson Rancheria", time: "2.5 hrs each way", from_full: "Amador County" },
        { from: "Bay Area", to: "Reno Casino Circuit", time: "3.5-4 hrs each way", from_full: "Peppermill · Grand Sierra · Atlantis" },
        { from: "Bay Area", to: "Lake Tahoe Casinos", time: "3.5-4 hrs each way", from_full: "Harrah's · Hard Rock · Nugget" },
      ]}
      fleetEyebrow="Casino charter fleet"
      fleetTitleA="From intimate poker crew to"
      fleetTitleAccent="whole-company outing"
      fleet={[
        { name: "Executive Sprinter", seats: "8-14 passengers", desc: "The poker-club sweet spot. Captain's chairs, USB, tinted windows. Ideal for Graton, Thunder Valley, Cache Creek day trips.", img: SPRINTER_IMG },
        { name: "Mini Coach", seats: "24-35 passengers", desc: "Birthday groups, corporate outings, church-league players. Reclining seats, AC, luggage bay. Great for Reno/Tahoe overnights.", img: MINI_COACH_IMG },
        { name: "Motor Coach", seats: "40-56 passengers", desc: "Full company casino night or large tournament group. Restroom, PA, luggage bay, reclining seats. Weekly runs by senior clubs.", img: MOTOR_COACH_IMG },
        { name: "Party Bus", seats: "14-30 passengers", desc: "For when the casino run is really a bachelor party or a birthday. LED, dance floor, bar setup. The ride is part of the celebration.", img: PARTY_BUS_IMG },
      ]}
      venuesEyebrow="Casinos we regularly drive to"
      venuesTitleA="Every table in Northern California —"
      venuesTitleAccent="plus the Reno/Tahoe corridor"
      venuesIntro="A starting list of the casinos our guests visit most. Route timing and flat rates below are typical for Bay Area pickup — send us your exact pickup zip and headcount and we'll come back with a firm quote."
      venues={[
        {
          name: "Graton Resort & Casino",
          image: MINI_COACH_IMG,
          blurb: "Rohnert Park · ~1 hour from SF. The closest full-scale casino to the Bay Area. Slots, table games, poker, high-limit rooms. Sprinter round trip from $650, Mini Coach from $1,100.",
          badge: "Closest to SF",
        },
        {
          name: "Thunder Valley Casino",
          image: MOTOR_COACH_IMG,
          blurb: "Lincoln (near Sacramento) · ~1.5 hours from SF. Consistently the top-revenue casino in California. Massive gaming floor, big poker room, well-known steakhouse. Sprinter from $850, Motor Coach from $2,600.",
          badge: "Top CA revenue",
        },
        {
          name: "Cache Creek Casino Resort",
          image: MINI_COACH_IMG,
          blurb: "Brooks (Yolo County) · ~2 hours from SF. Wine-country casino with hotel, golf, and spa. Popular for corporate outings and mid-scale bachelor parties. Sprinter from $950.",
          badge: "Corporate favorite",
        },
        {
          name: "Jackson Rancheria",
          image: SPRINTER_IMG,
          blurb: "Amador County · ~2.5 hours from SF. Historic Gold Country location, hotel + casino combo. Slower pace, good weekend getaway feel. Sprinter from $1,050.",
          badge: "Gold Country",
        },
        {
          name: "Reno Casino Corridor",
          image: MOTOR_COACH_IMG,
          blurb: "Peppermill · Grand Sierra Resort · Atlantis · Silver Legacy · Circus Circus Reno. ~3.5-4 hours from SF. Same-day trip is possible but most groups make it an overnight. Sprinter from $1,600, Motor Coach from $3,800.",
          badge: "Overnight recommended",
        },
        {
          name: "Lake Tahoe Casinos",
          image: MINI_COACH_IMG,
          blurb: "Harrah's Lake Tahoe · Hard Rock Lake Tahoe · Nugget Casino Sparks. ~4 hours from SF. The scenic run — casino + Tahoe lake views. Bachelor/bachelorette favorite. Sprinter from $1,800, Motor Coach from $4,200.",
          badge: "Scenic route",
        },
      ]}
      venuesDisclaimer="Rates shown are typical starting flat rates for round-trip pickup from the immediate Bay Area (SF, Oakland, San Jose). Actual pricing varies by exact pickup zip, day of week, group size, and driver wait duration. All quotes confirmed in writing before booking. We are not affiliated with any casino — we simply drive our guests to them."
      itineraryEyebrow="A typical casino day"
      itineraryTitleA="Sample run —"
      itineraryTitleAccent="SF to Thunder Valley & back"
      itineraryIntro="Most Bay Area day-trip casino runs look like this. Overnight Reno/Tahoe trips add a hotel stay and adjust the timing, but the outbound + return structure is the same."
      itinerary={[
        { time: "10:00 AM", title: "Group pickup · SF or hotel", blurb: "Driver arrives 10 minutes early. Loads the group, cooler in the back if you're bringing snacks, and heads out. Bottled water and phone chargers on board." },
        { time: "11:30 AM", title: "Arrival at Thunder Valley", blurb: "Driver drops you at the main entrance. You're at the tables by 11:45. Driver parks and stays reachable by phone — text him if you want to reposition to the hotel entrance for a lunch break or a bag drop." },
        { time: "12 PM – 6 PM", title: "6 hours at the tables", blurb: "You play. Standard casino run includes 4–8 hours of driver wait — plenty for a full lunch, tournament session, or a comeback attempt. Driver is on-property and ready when you are." },
        { time: "6:30 PM", title: "Regroup at the entrance", blurb: "Driver texts the group 30 minutes before scheduled departure. Roll call at the porte-cochère, load up, head out. If someone's on a hot streak, we can push departure by 30–60 min with a small overage charge — agreed upfront." },
        { time: "8:00 PM", title: "Return to Bay Area", blurb: "Curbside drop-off wherever the group started. Everyone home safe, no DUI risk, no rideshare surge, no arguing about who drives." },
      ]}
      gallery={[MOTOR_COACH_IMG, MINI_COACH_IMG, PARTY_BUS_IMG, SPRINTER_IMG, SUV_IMG]}
      ctaEyebrow="Plan the casino run"
      ctaTitleA="Get your flat-rate casino quote in"
      ctaTitleAccent="under 60 seconds"
      ctaSubtitle="Tell us the casino, date, group size, and pickup zip. We'll send a flat round-trip quote within the hour. Popular Saturdays book 2–3 weeks ahead; Reno/Tahoe overnights we recommend 4–6 weeks."
      faqs={[
        { q: "How does flat-rate casino pricing work?", a: "You get one number in writing before you book — includes pickup, drive out, driver wait time at the casino (typically 4–8 hours), and the return trip. Includes fuel, tolls, and standard parking. Not included: driver gratuity (industry standard 18–20%), overnight lodging for Reno/Tahoe multi-day trips." },
        { q: "How long will the driver wait at the casino?", a: "Standard casino charter includes 4–8 hours of driver on-site wait time depending on the destination. If your group wants to stay longer, we can extend wait time in 1-hour increments — agreed and priced upfront so there are no surprises. Overnight stays are available for Reno & Tahoe." },
        { q: "Can we bring alcohol on the ride?", a: "For adult (21+) private charters, yes — we provide ice bins and cups, you bring your own drinks. All riders must be 21+ with valid ID. No underage drinking, no drugs, no exceptions. Open-container laws in California are respected for the ride." },
        { q: "Which casinos are worth the trip?", a: "For a same-day run: Graton (closest, easiest), Thunder Valley (biggest CA gaming floor), or Cache Creek (calmer, corporate). For overnight: Reno for a full-city casino corridor experience, Tahoe for casino + scenery. Send us your preferences (poker vs slots, hotel vs day trip, budget) and we'll suggest a match." },
        { q: "Can we bring the party bus for a casino run?", a: "Yes, especially for bachelor/bachelorette groups where the ride itself is part of the celebration. Party bus works great for Graton (short drive) and Thunder Valley. For Reno/Tahoe we recommend a Mini Coach or Motor Coach instead — more comfortable for the longer highway drive." },
        { q: "What about Reno/Tahoe overnight trips?", a: "Absolutely — this is our specialty. We coordinate: outbound drive → drop at hotel/casino → driver overnight lodging → next-day return trip (or multiple casino stops). Common for bachelor parties, poker tournaments, corporate outings, and senior clubs. Book 4–6 weeks ahead." },
        { q: "How far in advance should we book?", a: "Weekday casino runs: 1 week is usually fine. Saturday/holiday runs: 2–3 weeks ahead. Reno/Tahoe overnights: 4–6 weeks. Large motor coach charters (40+ pax): 4–8 weeks. NYE / Super Bowl / March Madness weekends fill up months in advance." },
        { q: "Is this cheaper than an Uber or renting a car?", a: "For groups of 4+, almost always. A Graton round trip on Uber Black is $180+ each way per car — a 6-person Sprinter charter is a flat $650 that includes 6 hours of driver wait. Plus no DUI risk, no surge pricing, no cranky designated driver, no coordinating multiple cars. The math favors chartering as soon as you're a group of 4+." },
      ]}
    />
  );
}
