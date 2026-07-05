import LandingPage from "@/components/LandingPage";

const SUV_IMG = "/fleet/luxury-suv.jpg";
const SPRINTER_IMG = "/fleet/sprinter.jpg";
const SEDAN_IMG = "/fleet/executive-sedan.jpg";

// Editorial imagery — stored locally in /public/landings/winetour/ for
// stability (no CDN drift, no broken images). All royalty-free Pexels.
const NAPA_HERO = "/landings/winetour/napa-hero.jpg";
const VINEYARD_ROWS = "/landings/winetour/vineyard-rows.jpg";
const WINE_GLASSES = "/landings/winetour/wine-glasses.jpg";
const BARRELS = "/landings/winetour/barrels.jpg";
const NAPA_HILLS = "/landings/winetour/napa-hills.jpg";
const TASTING_BAR = "/landings/winetour/tasting-bar.jpg";

// Featured wineries — these are publicly-known iconic Napa destinations. We
// don't claim any formal partnership; the disclaimer below makes that clear.
// Images are evocative of the winery's character, not exact site photos.
const STAGS_LEAP = "/landings/winetour/stags-leap.jpg";
const OPUS_ONE = "/landings/winetour/opus-one.jpg";
const CASTELLO = "/landings/winetour/castello.jpg";
const DOMAINE = "/landings/winetour/domaine.jpg";
const SCHRAMSBERG = "/landings/winetour/schramsberg.jpg";
const FROGS_LEAP = "/landings/winetour/frogs-leap.jpg";

export default function WineTourLanding() {
  return (
    <LandingPage
      testId="wine-tour-landing"
      quoteVehicleType="Executive Sprinter"
      quoteTripType="Wine Tour"
      quoteVehicleOptions={["Executive Sprinter", "Luxury SUV", "Executive Sedan", "Party Bus"]}
      pageTitle="Napa Valley Chauffeur · Wine Country Private Driver — TuranEliteLimo"
      metaDescription="Private chauffeur for Napa, Sonoma & Carneros day trips. Hotel pickup, custom 3–5 stop itineraries, professional Mercedes-Benz Sprinter, multilingual driver. Designated driver for groups of 6 to 12. TCP licensed · $5M insured."
      eyebrow="Napa · Sonoma · Carneros · Russian River"
      titleA="The car waits."
      titleAccent="You taste."
      titleB="Worry about nothing."
      subtitle="A private chauffeur picks you up at your hotel, drives you to 3–5 hand-picked wineries, and waits while you taste. We handle parking, reservations, and routing — you handle the wine. Sprinter vans for groups of 6 to 12."
      ctaLabel="Plan My Wine Day →"
      socialProof="Trusted by 200+ Bay Area & SF wine country travelers"
      priceFrom="$95/hour · 6-hour minimum · all-inclusive"
      trustStrip={["Custom Itinerary", "Hotel Pickup Included", "All-Day Hourly Rate", "Multilingual Chauffeurs"]}
      pillarHeading="Why Bay Area & SF travelers"
      pillarHeadingAccent="book wine country with us"
      pillars={[
        { eyebrow: "01", title: "We Plan Your Itinerary", body: "Tell us what you like — bold reds, sparkling, organic, food pairing — and we'll suggest a 3–5 winery route, book your tastings, and route the day so you're never rushed." },
        { eyebrow: "02", title: "Hotel & Airport Pickup", body: "We pick up at your SF hotel, Napa lodging, or directly from SFO/OAK. End the day where you started. No parking, no driving, no breathalyzer worry." },
        { eyebrow: "03", title: "All-Day Hourly Rate", body: "Book the chauffeur for the full day at a flat hourly rate. No per-stop pricing. The vehicle waits while you taste, lunch, and explore." },
        { eyebrow: "04", title: "Sprinter Group Comfort", body: "For groups of 6–12, our Mercedes Sprinters have leather captain's chairs, in-vehicle climate control, USB charging, and a cooler with bottled water." },
        { eyebrow: "05", title: "Multilingual Hosts", body: "Our chauffeurs speak English, Spanish, Russian, and Turkish. Many know the wineries personally and can share tasting tips between stops." },
        { eyebrow: "06", title: "Safe Ride Home", body: "After the last tasting, sit back in the captain's chair, recline, and let us return you to SF, Palo Alto, or the airport. No DUI risk. No rideshare scramble." },
      ]}
      experienceImage={{
        src: NAPA_HERO,
        alt: "Golden-hour view across Napa Valley vineyards",
        kicker: "What a day in Napa feels like",
        caption: "Sunlight catches the Cabernet vines just past noon. By 3 PM you've tasted six varietals you couldn't pronounce a week ago — and our chauffeur is already plotting the scenic route to your fourth winery.",
      }}
      routesEyebrow="Popular wine country trips"
      routesTitleA="From Bay Area to"
      routesTitleAccent="vineyard country"
      routes={[
        { from: "Downtown SF", to: "Napa Valley", time: "1h 30min", from_full: "San Francisco" },
        { from: "Downtown SF", to: "Sonoma Valley", time: "1h 15min", from_full: "San Francisco" },
        { from: "SFO Airport", to: "Napa Hotels", time: "1h 30min", from_full: "Direct from Arrival" },
        { from: "Palo Alto", to: "Napa Valley", time: "1h 45min", from_full: "Peninsula" },
        { from: "Marin", to: "Russian River", time: "1h", from_full: "Marin County" },
        { from: "Napa Hotel", to: "5-Winery Loop", time: "All Day", from_full: "Full-Day Tour" },
      ]}
      fleetEyebrow="Wine tour fleet"
      fleetTitleA="Right-sized for"
      fleetTitleAccent="couples or groups of twelve"
      fleet={[
        { name: "Executive Sedan", seats: "1-3 passengers", desc: "Cadillac XTS · Mercedes E-Class. The intimate tasting day. Quiet ride, smooth suspension on winding vineyard roads.", img: SEDAN_IMG },
        { name: "Luxury SUV", seats: "1-6 passengers", desc: "Cadillac Escalade · GMC Yukon. Captain's chairs, panoramic windows, climate-controlled cabin for couples & small groups.", img: SUV_IMG },
        { name: "Executive Sprinter", seats: "8-12 passengers", desc: "Mercedes Sprinter Executive. The group tasting choice. Conference-style seating, in-vehicle cooler, plenty of trunk space for case purchases.", img: SPRINTER_IMG },
      ]}
      venuesEyebrow="Wineries our guests love"
      venuesTitleA="Tour the icons —"
      venuesTitleAccent="or discover a hidden gem"
      venuesIntro="A starting list of guest favorites. We've driven to all of these dozens of times and know the tasting room hosts by name. Tell us your style — bold reds, biodynamic, sparkling, family-run — and we'll build the day around it."
      venues={[
        {
          name: "Stags Leap Wine Cellars",
          image: STAGS_LEAP,
          blurb: "The Cabernet that beat France in the 1976 Judgment of Paris. Hillside estate, FAY and SLV vineyard tastings, by appointment.",
          badge: "Iconic Cabernet",
        },
        {
          name: "Opus One",
          image: OPUS_ONE,
          blurb: "The Mondavi-Rothschild collaboration. A single-vintage Bordeaux blend in a sweeping architectural temple. The crown of Oakville.",
          badge: "Reserve in advance",
        },
        {
          name: "Castello di Amorosa",
          image: CASTELLO,
          blurb: "An authentic 13th-century Tuscan castle replica. 121 rooms, dungeon, drawbridge — and excellent Sangiovese. Great for groups who want spectacle.",
          badge: "Most photogenic",
        },
        {
          name: "Domaine Chandon",
          image: DOMAINE,
          blurb: "California's first French-owned méthode champenoise sparkling house. Garden tastings under the oaks. The perfect opener for a tasting day.",
          badge: "Sparkling start",
        },
        {
          name: "Schramsberg Vineyards",
          image: SCHRAMSBERG,
          blurb: "Hand-riddled sparkling wines aged in 19th-century hillside caves. Tour the candle-lit tunnels, then taste 4 cuvées including the J. Schram.",
          badge: "Cave tour",
        },
        {
          name: "Frog's Leap",
          image: FROGS_LEAP,
          blurb: "Organic, dry-farmed, solar-powered. A red barn winery with a vegetable garden, bocce court, and an irreverent sense of humor. Family-friendly.",
          badge: "Organic",
        },
      ]}
      venuesDisclaimer="Tours are fully customized to your preferences. We have no formal affiliation with the wineries listed above; we'd just enthusiastically drive you there. Tasting fees, reservations, and lunch arrangements are coordinated separately and at your discretion."
      itineraryEyebrow="A typical tasting day"
      itineraryTitleA="Sample itinerary —"
      itineraryTitleAccent="8 hours, 4 wineries, 1 long lunch"
      itineraryIntro="Most guests book an 8-hour day. Here's how a typical Saturday in Napa looks. Yours will be customized, but this is the rhythm we recommend."
      itinerary={[
        {
          time: "9:30 AM",
          title: "Hotel pickup · Coffee in the cabin",
          blurb: "Chauffeur greets you at your SF or Napa hotel lobby with the day's printed itinerary. Bottled water, espresso pods, and ginger candy on board. Wheels up for Napa.",
        },
        {
          time: "10:45 AM",
          title: "First winery · Domaine Chandon",
          blurb: "Garden tasting of 4 sparkling cuvées under the oaks. A bright, low-tannin start that wakes up the palate. ~75 minutes including a slow walk through the gardens.",
        },
        {
          time: "12:30 PM",
          title: "Lunch · Farmstead at Long Meadow Ranch (or your pick)",
          blurb: "A real sit-down lunch on the patio. Local farm produce, wood-fired meats. We'll have made the reservation. Chauffeur waits or steps out for their own meal.",
        },
        {
          time: "2:30 PM",
          title: "Second winery · Stags Leap Wine Cellars",
          blurb: "Hillside Cab tasting — the FAY and SLV side-by-side flight. Bold tannins, structured fruit. Ride the cab up the hill in the SUV; the views are the second show.",
        },
        {
          time: "4:15 PM",
          title: "Third winery · Castello di Amorosa (or Frog's Leap)",
          blurb: "Castle tour + tasting if you want spectacle, Frog's Leap if you want a quiet barn and a bocce game. We'll set it up before you arrive.",
        },
        {
          time: "5:45 PM",
          title: "Optional final stop · Sunset at a hillside winery",
          blurb: "By now everyone is loose, the light is gold, and you'll want one more glass. We have favorites with western-facing terraces. Or skip it and head home a little softer.",
        },
        {
          time: "7:00 PM",
          title: "Return to SF · Hotel curbside drop-off",
          blurb: "Captain's chairs reclined, cabin lights dimmed, water on hand. You're back at the hotel before the city dinner rush. Tomorrow morning you'll thank yourself.",
        },
      ]}
      gallery={[
        VINEYARD_ROWS,
        WINE_GLASSES,
        BARRELS,
        NAPA_HILLS,
        TASTING_BAR,
      ]}
      ctaEyebrow="Tomorrow's tasting day"
      ctaTitleA="Lock in your private chauffeur in"
      ctaTitleAccent="under 60 seconds"
      ctaSubtitle="Tell us your group size, hotel, and the wineries you're considering. We'll come back with a custom itinerary and a flat all-day price."
      faqs={[
        { q: "How many wineries can we visit in a day?", a: "Most guests visit 3–5 wineries over 6–8 hours. We recommend 4 — enough variety, with a real lunch in the middle, without feeling rushed. We can do more for power-tasters or fewer for a relaxed pace." },
        { q: "Do you book the tasting reservations?", a: "Yes, we're happy to. Many Napa wineries are now appointment-only. Tell us your style preferences and target wineries; we'll handle the calls and confirmations 5–7 days in advance." },
        { q: "How does the all-day hourly rate work?", a: "Wine country bookings are quoted as a flat hourly rate × the booked hours, all-inclusive (gratuity, gas, parking). Most trips are 6, 8, or 10 hours. If the day runs short, you only pay the minimum hour block; if longer, your chauffeur confirms in writing before overage starts." },
        { q: "Can you accommodate dietary restrictions for lunch?", a: "We don't run the restaurants, but we know them. Let us know if your group has restrictions — kosher, halal, vegan, gluten-free — and we'll route lunch to a winery or restaurant that accommodates." },
        { q: "What if someone in our group gets sick from too much tasting?", a: "Our Sprinters and SUVs have water, wet wipes, and motion-sickness bags on board. If anyone needs to return to the hotel mid-day, the chauffeur will run them back and rejoin the rest of the group. No drama, no extra charge." },
        { q: "Do you bring back the wine cases we buy?", a: "Yes. Sprinters and SUVs have ample cargo for full cases. Some guests bring coolers; others ship from the winery. Either way, we have you covered." },
      ]}
    />
  );
}
