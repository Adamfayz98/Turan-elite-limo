import LandingPage from "@/components/LandingPage";

const SEDAN_IMG = "https://images.unsplash.com/photo-1657980928345-2c89a303a695?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0";
const SUV_IMG = "https://images.unsplash.com/photo-1767749995450-7b63ab7cd4fd?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600&ixlib=rb-4.1.0";
const SPRINTER_IMG = "https://customer-assets.emergentagent.com/job_limo-experience-1/artifacts/z9hc1910_IMG_0001.webp";
const LIMO_IMG = "https://images.unsplash.com/photo-1676107648535-931375db52e2?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0";

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
      gallery={[
        LIMO_IMG, SEDAN_IMG, SPRINTER_IMG, SUV_IMG,
        "https://images.unsplash.com/photo-1545185105-a81262517cf4?fm=jpg&q=70&w=1200&auto=format&fit=crop&ixlib=rb-4.1.0",
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
