import LandingPage from "@/components/LandingPage";

const SUV_IMG = "https://images.unsplash.com/photo-1767749995450-7b63ab7cd4fd?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600&ixlib=rb-4.1.0";
const SPRINTER_IMG = "https://customer-assets.emergentagent.com/job_limo-experience-1/artifacts/z9hc1910_IMG_0001.webp";
const SEDAN_IMG = "https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0";

export default function WineTourLanding() {
  return (
    <LandingPage
      testId="wine-tour-landing"
      pageTitle="Napa & Sonoma Wine Tour Chauffeur · Private Driver — TuranEliteLimo"
      metaDescription="Private chauffeur for Napa & Sonoma wine tours. Custom 3–5 winery itineraries, hotel pickup, multilingual chauffeurs, Sprinter vans for groups. Book your tasting day."
      eyebrow="Napa · Sonoma · Carneros · Russian River"
      titleA="The car waits."
      titleAccent="You taste."
      titleB="Worry about nothing."
      subtitle="A private chauffeur picks you up at your hotel, drives you to 3–5 wineries of your choosing, and waits while you taste. We handle parking, reservations, and routing — you handle the wine. Sprinter vans for groups of 6 to 12."
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
      gallery={[
        SUV_IMG, SPRINTER_IMG, SEDAN_IMG,
        "https://images.unsplash.com/photo-1545185105-a81262517cf4?fm=jpg&q=70&w=1200&auto=format&fit=crop&ixlib=rb-4.1.0",
        "https://images.unsplash.com/photo-1609521247503-8de40462e427?fm=jpg&q=70&w=1200&auto=format&fit=crop&ixlib=rb-4.1.0",
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
