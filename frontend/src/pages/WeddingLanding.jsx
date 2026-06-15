import LandingPage from "@/components/LandingPage";

const SEDAN_IMG = "/fleet/executive-sedan.jpg";
const SUV_IMG = "/fleet/luxury-suv.jpg";
const SPRINTER_IMG = "/fleet/sprinter.jpg";
const LIMO_IMG = "https://images.unsplash.com/photo-1676107648535-931375db52e2?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0";

const WEDDING_HERO = "/landings/wedding/hero.jpg";
const VENUE_VINEYARD = "/landings/wedding/venue-vineyard.jpg";
const VENUE_COASTAL = "/landings/wedding/venue-coastal.jpg";
const VENUE_BALLROOM = "/landings/wedding/venue-ballroom.jpg";

export default function WeddingLanding() {
  return (
    <LandingPage
      testId="wedding-landing"
      pageTitle="Bay Area Wedding Limo · Bridal Chauffeur Service — TuranEliteLimo"
      metaDescription="Bay Area wedding chauffeur & limo service. Bride/groom transfers, bridal party shuttles, guest hotel runs. White-glove service, decorated arrival, professional chauffeurs."
      eyebrow="Bay Area · Napa · Sonoma · Carmel"
      titleA="The arrival sets the tone."
      titleAccent="Wedding chauffeur"
      titleB="service done right."
      subtitle="From a discreet bride-and-groom Mercedes to a 14-passenger Stretch for the bridal party, we handle every vehicle, every guest shuttle, and every hotel transfer on the most important day of your life. Professional chauffeurs in tuxedo attire. White-glove service. Zero surprises."
      trustStrip={["Tuxedo Chauffeur", "Decorated on Request", "Multi-Vehicle Caravans", "On-Site Coordinator"]}
      pillarHeading="Why Bay Area couples book us"
      pillarHeadingAccent="6 months before the date"
      pillars={[
        { eyebrow: "01", title: "Single Point of Contact", body: "One dedicated coordinator handles every vehicle, every chauffeur, every timing question — from rehearsal dinner through the send-off." },
        { eyebrow: "02", title: "Tuxedo Chauffeurs", body: "Our drivers wear black tie for weddings. Doors opened, umbrellas held, hand offered to the bride. Photo-ready every minute." },
        { eyebrow: "03", title: "Vehicle Caravans", body: "Need 1 sedan + 1 SUV + 2 Sprinters for the bridal party + a 14-passenger stretch for guests? We coordinate the entire fleet under one booking." },
        { eyebrow: "04", title: "Decoration Welcome", body: "Bring your own ribbons, flowers, or signage — we'll decorate the lead vehicle on arrival. Just clear it with us 48 hours in advance." },
        { eyebrow: "05", title: "Guest Hotel Shuttles", body: "Pre-scheduled loops between the hotel block, ceremony, and reception keep out-of-town guests on time and rideshare-free." },
        { eyebrow: "06", title: "Flat Rate · No Surprises", body: "Quoted prices are guaranteed. No overtime mystery fees, no late-night surcharges. If the reception runs long, you approve the additional hours in writing." },
      ]}
      routesEyebrow="Popular wedding routes"
      routesTitleA="From"
      routesTitleAccent="Bay Area chapels to Wine Country estates"
      routes={[
        { from: "SF Hotels", to: "Napa Vineyard", time: "1h 30min", from_full: "San Francisco" },
        { from: "Palo Alto", to: "Carmel Coast", time: "2h", from_full: "Peninsula" },
        { from: "SFO Airport", to: "Sonoma Resort", time: "1h 45min", from_full: "Out-of-Town Guest Transfer" },
        { from: "City Hall SF", to: "Reception Venue", time: "Custom", from_full: "Ceremony to Reception" },
        { from: "Marin", to: "Napa Vineyard", time: "1h 15min", from_full: "Wine Country Wedding" },
        { from: "Hotel Block", to: "Venue & Back", time: "Loops", from_full: "Guest Shuttle Service" },
      ]}
      fleetEyebrow="Wedding fleet"
      fleetTitleA="The right vehicle for"
      fleetTitleAccent="every part of the day"
      fleet={[
        { name: "Executive Sedan", seats: "1-3 passengers", desc: "Cadillac XTS · Mercedes E-Class. The discreet getaway car. Photo-ready, climate controlled, intimate.", img: SEDAN_IMG },
        { name: "Luxury SUV", seats: "1-6 passengers", desc: "Cadillac Escalade · GMC Yukon. The parents' & officiant's vehicle. Captain's chairs, dignified arrival.", img: SUV_IMG },
        { name: "Executive Sprinter", seats: "8-12 passengers", desc: "Mercedes Sprinter Executive. The bridal party's choice. Captain's chairs, leather, vanity space, USB charging.", img: SPRINTER_IMG },
        { name: "Stretch Limousine", seats: "8-14 passengers", desc: "Hummer & Chrysler 300 Stretch. Mood lighting, premium bar, room to celebrate. The reception send-off vehicle.", img: LIMO_IMG },
      ]}
      experienceImage={{
        src: WEDDING_HERO,
        alt: "Bride and groom walking hand in hand",
        kicker: "From the first 'I do' to the send-off",
        caption: "The bride's first step into the car. The flower girl who can't find her shoe. The grandparents waving from the curb. We hold the timing so you only have to feel the moment.",
      }}
      venuesEyebrow="Bay Area wedding venues we know well"
      venuesTitleA="From wine-country estates to"
      venuesTitleAccent="coastal chapels"
      venuesIntro="We've driven brides, grooms, parents, and bridal parties to every kind of Bay Area venue. Here are the styles our couples book most often — tell us your venue and we'll plan the day around its quirks."
      venues={[
        {
          name: "Wine Country Estate",
          image: VENUE_VINEYARD,
          blurb: "Napa, Sonoma, Carneros vineyard weddings. Long uphill driveways, gravel paths — we send the SUV, not the sedan. Sunset photo backdrop included.",
          badge: "Napa · Sonoma",
        },
        {
          name: "Coastal & Carmel Ceremonies",
          image: VENUE_COASTAL,
          blurb: "Carmel, Big Sur, Half Moon Bay. Coastal fog timing matters — we'll move the bridal party by 20 min to catch the golden window, no scrambling.",
          badge: "Pacific Coast",
        },
        {
          name: "City Hall & Ballroom",
          image: VENUE_BALLROOM,
          blurb: "SF City Hall, Palace Hotel, Fairmont. Urban venues, valet etiquette, double-park strategy. We've done hundreds. Photo-ready arrival every time.",
          badge: "SF · Peninsula",
        },
      ]}
      venuesDisclaimer="Not your venue type? We've driven to nearly every major Bay Area wedding location. Tell us where, we'll route the day."
      itineraryEyebrow="A sample wedding day"
      itineraryTitleA="The day, hour by hour —"
      itineraryTitleAccent="held together by your chauffeur"
      itineraryIntro="Every wedding is different, but this is the rhythm of a typical Bay Area Saturday. Yours will be customized down to the minute."
      itinerary={[
        {
          time: "10:00 AM",
          title: "Bridal suite arrival · Sedan to salon",
          blurb: "The bride and one bridesmaid to the hair appointment, with garment bag, sneakers, and a calm chauffeur. Coffee on board, photos discouraged.",
        },
        {
          time: "1:00 PM",
          title: "Parents & grandparents · SUV pickup",
          blurb: "Climate-controlled SUV to the hotel, then to the venue. Captain's chairs so dad's tux doesn't crease. Plenty of room for the mother-of-the-bride's hat.",
        },
        {
          time: "2:30 PM",
          title: "Bridal party · Sprinter to ceremony",
          blurb: "8 bridesmaids + bouquets + a champagne toast en route. We bring the chilled bottle if you want it. Doors held at the venue, train fluffed, breath taken.",
        },
        {
          time: "3:00 PM",
          title: "Bride & father · The first arrival",
          blurb: "Final pickup. 5 minutes of silence in the back. The chauffeur opens the door at the venue entrance, hand extended. The walk down the aisle starts here.",
        },
        {
          time: "5:30 PM",
          title: "Ceremony → Reception · Sedan with bouquet",
          blurb: "Newlyweds in the lead car, photographer in the SUV behind. 20-minute scenic route if you want photos en route. Champagne in the cabin, custom playlist on.",
        },
        {
          time: "11:00 PM",
          title: "Send-off · The decorated stretch",
          blurb: "Ribbons on the back bumper, sparkler tunnel out front. We pull up at the exact moment the planner signals. You wave goodbye, fall in, drive into the night.",
        },
      ]}
      gallery={[
        LIMO_IMG, SEDAN_IMG, SPRINTER_IMG, SUV_IMG,
        VENUE_VINEYARD,
      ]}
      ctaEyebrow="The most important day"
      ctaTitleA="Reserve your wedding fleet in"
      ctaTitleAccent="one phone call"
      ctaSubtitle="Tell us your venue and guest count. We'll send a custom multi-vehicle quote within 24 hours. No deposit required to hold the date."
      faqs={[
        { q: "How far in advance should we book?", a: "We recommend booking 4–6 months out for spring and summer Bay Area weddings, especially May–October. Peak Saturdays sell out fastest. For elopements or short-notice ceremonies, we still try to accommodate — call us." },
        { q: "Can we decorate the vehicle ourselves?", a: "Yes. You're welcome to bring ribbons, flowers, magnetic signs, or a 'Just Married' banner. Let us know 48 hours in advance and we'll arrive 15 minutes early so the chauffeur can help decorate. We don't allow paint, adhesives, or anything that damages the vehicle finish." },
        { q: "Do you coordinate multi-vehicle weddings?", a: "Absolutely. Many of our weddings involve 3–5 vehicles running on a coordinated schedule (bridal party, parents, VIPs, guest shuttle loops). One dedicated coordinator owns the day and stays in touch with your wedding planner via WhatsApp." },
        { q: "What's your overtime policy?", a: "Each vehicle is booked for a confirmed window. If the reception runs long, your coordinator confirms additional time in writing before any meter starts. No surprise charges, ever." },
        { q: "Do you provide guest shuttle service?", a: "Yes. Sprinter and stretch limousines run on pre-scheduled loops between your hotel block and the venue — typically every 30 or 45 minutes. Out-of-town guests love it because they don't have to coordinate rideshare or parking." },
        { q: "Can your chauffeurs help with luggage and dresses?", a: "Yes. Our wedding chauffeurs are trained in handling formalwear — they'll hold the dress while the bride steps in, manage train arrangement, and offer water and tissues during transfers. Every detail is part of the service." },
      ]}
    />
  );
}
