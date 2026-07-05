import LandingPage from "@/components/LandingPage";

const MINI_COACH_IMG = "/fleet/mini-coach.jpg";
const MOTOR_COACH_IMG = "/fleet/motor-coach.jpg";
const SPRINTER_IMG = "/fleet/sprinter.jpg";
const SUV_IMG = "/fleet/luxury-suv.jpg";

export default function MiniCoachLanding() {
  return (
    <LandingPage
      testId="mini-coach-landing"
      hidePayAfterBadge={true}
      quoteVehicleType="Mini Coach"
      quoteVehicleOptions={["Mini Coach", "Motor Coach", "Executive Sprinter"]}
      pageTitle="Bay Area Mini Coach Rental · 24–35 Passenger Mini Bus — TuranEliteLimo"
      metaDescription="San Francisco Bay Area mini coach and mini bus rental for 24, 28, and 35 passenger groups. The right-size charter for wedding guest shuttles, corporate teams, sports groups, and mid-size events. Reclining seats, AC, luggage bay, professional driver. Flat rate, TCP licensed."
      heroImage={MINI_COACH_IMG}
      eyebrow="San Francisco · Bay Area · Sacramento · Monterey"
      titleA="Between a Sprinter"
      titleAccent="and a full-size coach —"
      titleB="the mid-size fits perfectly."
      subtitle="Our 24–35 passenger mini coaches solve the gap between a 14-seat Sprinter and a 56-seat motor coach. Right-size the vehicle to your headcount so you're not overpaying for empty seats or squeezing everyone into two Sprinters. High-back reclining seats, AC, luggage bay, professional driver, flat rate."
      ctaLabel="Get My Mini Coach Quote →"
      socialProof="The mid-size charter Bay Area planners keep coming back to"
      priceFrom="From $1,400 flat-day · 4-hour minimum · all-inclusive"
      trustStrip={["24–35 Passengers", "High-Back Reclining Seats", "Luggage Bay", "Professional Driver"]}
      pillarHeading="Why a mini coach beats"
      pillarHeadingAccent="two Sprinters or one motor coach"
      pillars={[
        { eyebrow: "01", title: "Right-Sized for 24–35 People", body: "Sprinter tops out at 14. Motor coach starts at 40. If your group is between, a mini coach is the answer — no one crammed onto a jump seat, no half-empty motor coach eating your budget." },
        { eyebrow: "02", title: "Actually Comfortable", body: "High-back reclining seats with individual reading lights and USB. Full climate control. Tinted windows. This isn't a school bus — it's a proper mid-size touring coach with the amenities of a full motor coach in a smaller footprint." },
        { eyebrow: "03", title: "Luggage Bay Onboard", body: "Underfloor luggage compartments fit checked bags, sports equipment, wedding décor, catering trays. Overhead racks handle carry-ons. Plenty of cargo space — no roof rack, no trailer, no chase car needed." },
        { eyebrow: "04", title: "One Vehicle, One Driver", body: "Save the two-Sprinter coordination headache. One pickup point, one manifest, one arrival time. Wedding coordinators and corporate event planners love how this simplifies the day." },
        { eyebrow: "05", title: "Great for Multi-Stop Routes", body: "Napa winery hops, San Francisco city tours, corporate offsites with multiple venues — the mini coach handles tight vineyard driveways and city streets better than a full motor coach, without giving up group capacity." },
        { eyebrow: "06", title: "Flat Rate · Written Quote", body: "Locked-in pricing before the trip. Fuel, tolls, standard parking, and driver included. No per-mile fees, no mystery overtime. Overage hours confirmed in writing only." },
      ]}
      routesEyebrow="Popular mini coach trips"
      routesTitleA="The 24–35 pax sweet spot for"
      routesTitleAccent="Bay Area group transport"
      routes={[
        { from: "SF Hotel Block", to: "Wedding Venue + Return", time: "5-7 hr", from_full: "Wedding Guest Shuttle" },
        { from: "SFO / OAK / SJC", to: "Corporate Offsite", time: "Full day", from_full: "Team Airport Transfer" },
        { from: "Palo Alto", to: "Napa / Sonoma Wine Tour", time: "Full day", from_full: "Corporate Wine Day" },
        { from: "Silicon Valley", to: "Monterey / Carmel", time: "Full day", from_full: "Team Retreat" },
        { from: "SF", to: "Nightlife + Restaurant Tour", time: "Evening", from_full: "Corporate Group Dinner" },
        { from: "Bay Area", to: "Sports Game Charter", time: "Custom", from_full: "Sports Team Transport" },
      ]}
      fleetEyebrow="Mini coach options"
      fleetTitleA="Sized from 24 to 35 —"
      fleetTitleAccent="pick the right seat count"
      fleet={[
        { name: "Mini Coach 35", seats: "30-35 passengers", desc: "The largest mini coach. Reclining high-back seats, AC, luggage bay, tinted windows. Perfect for full wedding parties and mid-size corporate teams.", img: MINI_COACH_IMG },
        { name: "Mini Coach 28", seats: "24-28 passengers", desc: "The versatile mid-size. Fits most weddings, corporate offsites, and Napa wine tours where a Sprinter is too small and a motor coach is too much.", img: MINI_COACH_IMG },
        { name: "Executive Sprinter", seats: "8-14 passengers", desc: "The step-down when your headcount is under 15. Captain leather chairs, wood trim, USB. Corporate roadshows and airport groups.", img: SPRINTER_IMG },
        { name: "Chase SUV", seats: "1-6 passengers", desc: "Cadillac Escalade for the VIP party — bride & groom, keynote speaker — while the mini coach carries the group.", img: SUV_IMG },
      ]}
      gallery={[MINI_COACH_IMG, MOTOR_COACH_IMG, SPRINTER_IMG, SUV_IMG, MINI_COACH_IMG]}
      ctaEyebrow="Plan the group ride"
      ctaTitleA="Get your mini coach quote in"
      ctaTitleAccent="under 60 seconds"
      ctaSubtitle="Tell us the date, headcount, pickup and route. We'll come back with a flat all-in price within an hour. Saturday wedding season fills 6–8 weeks in advance — book early."
      faqs={[
        { q: "How many passengers does a mini coach hold?", a: "Our mini coaches seat 24 to 35 passengers depending on the model. It's the mid-size option between a 14-seat Sprinter and a 40+ seat motor coach — ideal for wedding parties, corporate offsites, and team transport in that headcount range." },
        { q: "Does the mini coach have a restroom?", a: "Most mini coaches do NOT have an onboard restroom (that's typically motor-coach-only). For trips over 2 hours we plan restroom stops. If restroom onboard is essential, we'll recommend upgrading to a motor coach." },
        { q: "Can we bring luggage or sports equipment?", a: "Yes. Every mini coach includes an underfloor luggage bay for checked bags, sports gear, wedding décor, or catering. Overhead racks handle carry-ons. Full-size cargo capacity without a trailer." },
        { q: "What's the price difference vs. two Sprinters?", a: "A single mini coach is typically 15–25% cheaper than booking two Sprinters for the same headcount, because you pay one driver, one fuel bill, and one vehicle base rate instead of two. Send us your route and we'll price both options side-by-side." },
        { q: "Can a mini coach do a Napa wine tour?", a: "Yes — mini coaches are actually easier than full motor coaches in Napa because they fit tight vineyard driveways and small tasting-room parking lots. Popular route: SF hotel pickup → 4 wineries → return, 8–10 hours." },
        { q: "How far in advance should we book?", a: "Saturday wedding season (May–October) books 6–8 weeks out. Weekday corporate trips can often be arranged with 1–2 weeks notice. Sports teams and NYE we recommend 4+ weeks ahead." },
        { q: "Is alcohol allowed onboard?", a: "For private adult (21+) charters — weddings, corporate events, bachelor/bachelorette groups — yes, with ice and cups. Not allowed for youth sports, school-affiliated, or minor-adjacent trips. Open container rules apply." },
        { q: "Do you provide a CDL driver and commercial insurance?", a: "Yes. All mini coach charters are operated under TCP licensing with $5M commercial insurance and CDL-licensed drivers who are DOT drug-tested. Certificates of insurance available on request for corporate and venue contracts." },
      ]}
    />
  );
}
