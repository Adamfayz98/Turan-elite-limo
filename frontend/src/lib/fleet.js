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
    img: "https://images.unsplash.com/photo-1657980928345-2c89a303a695?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0",
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
    img: "https://images.unsplash.com/photo-1742794147227-b3df1a5ae19c?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0",
  },
  {
    name: "Sprinter Van",
    model: "Mercedes Jet Sprinter · Executive Coach",
    pax: "10–14",
    bags: "14",
    callOnly: true,
    note: "Group travel without sacrifice. Wi-Fi, USB, leather lounge seating.",
    img: "https://customer-assets.emergentagent.com/job_limo-experience-1/artifacts/z9hc1910_IMG_0001.webp",
  },
  {
    name: "Party Bus",
    model: "14–30 Passenger Limo Coach",
    pax: "14–30",
    bags: "8",
    callOnly: true,
    note: "Built for celebrations. LED lighting, premium sound, dance floor, full bar.",
    img: "https://images.unsplash.com/photo-1610641818989-c2051b5e2cfd?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0",
  },
];
