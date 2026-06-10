/**
 * Single source of truth for the TuranEliteLimo fleet.
 * Used by both Fleet (homepage showcase) and FleetPicker (inside BookingForm).
 * Keep `name` in sync with backend VEHICLE_TYPES.
 */
export const FLEET = [
  {
    name: "Executive Sedan",
    model: "Cadillac XTS · Lincoln Continental · Mercedes E-Class · BMW 5 Series",
    pax: "1–3",
    bags: "3",
    note: "The standard for daily executive transport. Discreet, smooth, on time.",
    img: "https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0",
  },
  {
    name: "First Class",
    model: "Mercedes S-Class · BMW 7 Series · Audi A8",
    pax: "1–3",
    bags: "3",
    note: "First-class flagship. Hush-quiet cabin, executive rear seating.",
    img: "https://images.unsplash.com/photo-1609521247503-8de40462e427?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0",
  },
  {
    name: "Luxury SUV",
    model: "Cadillac Escalade · GMC Yukon Denali · Lincoln Navigator",
    pax: "1–6",
    bags: "6",
    note: "Captain's chairs, cavernous trunk, redefined comfort.",
    img: "https://images.unsplash.com/photo-1767749995450-7b63ab7cd4fd?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600&ixlib=rb-4.1.0",
  },
  {
    name: "Stretch Limousine",
    model: "Hummer Stretch · Chrysler 300 Stretch",
    pax: "8–14",
    bags: "4",
    callOnly: true,
    note: "Mood lighting, premium bar, the showstopper for weddings & nightlife.",
    img: "https://images.unsplash.com/photo-1676107648535-931375db52e2?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0",
  },
  {
    name: "Sprinter Van",
    model: "Mercedes Sprinter · Passenger Coach",
    pax: "10–14",
    bags: "14",
    callOnly: true,
    note: "Standard group travel. Cloth or leather seating, AC, ample luggage. Best value for airport runs and team transport.",
    img: "https://customer-assets.emergentagent.com/job_limo-experience-1/artifacts/z9hc1910_IMG_0001.webp",
  },
  {
    name: "Executive Sprinter",
    model: "Mercedes Sprinter Executive · Captain's Chairs",
    pax: "8–12",
    bags: "12",
    callOnly: true,
    note: "Captain's chairs, leather, wood trim, partition. Corporate roadshows, executive groups, premium airport transfers.",
    img: "https://customer-assets.emergentagent.com/job_limo-experience-1/artifacts/z9hc1910_IMG_0001.webp",
  },
  {
    name: "Jet Sprinter",
    model: "Mercedes Jet Sprinter · First-Class Limo Van",
    pax: "8–10",
    bags: "10",
    callOnly: true,
    note: "First-class recliners, mood lighting, premium bar, club sound. Weddings, prom, special events, VIP airport.",
    img: "https://customer-assets.emergentagent.com/job_limo-experience-1/artifacts/z9hc1910_IMG_0001.webp",
  },
  {
    name: "Party Bus",
    model: "14–30 Passenger Limo Coach",
    pax: "14–30",
    bags: "8",
    callOnly: true,
    note: "Built for celebrations. LED lighting, premium sound, dance floor, full bar.",
    img: "https://images.unsplash.com/photo-1545185105-a81262517cf4?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0",
  },
];
