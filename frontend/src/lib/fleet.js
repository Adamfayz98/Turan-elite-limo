/**
 * Single source of truth for the TuranEliteLimo fleet.
 * Used by the FleetPicker (inside BookingForm) — keep `name` in sync with backend VEHICLE_TYPES.
 */
export const FLEET = [
  {
    name: "Executive Sedan",
    model: "Cadillac XTS",
    pax: "1–3",
    bags: "3",
    note: "The standard for daily executive transport. Discreet, smooth, on time.",
    img: "https://images.unsplash.com/photo-1657980928345-2c89a303a695?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0",
  },
  {
    name: "S-Class",
    model: "Mercedes-Benz S-Class",
    pax: "1–3",
    bags: "3",
    note: "First-class flagship. Hush-quiet cabin, executive rear seating.",
    img: "https://images.unsplash.com/photo-1609521247503-8de40462e427?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0",
  },
  {
    name: "Luxury SUV",
    model: "Cadillac Escalade",
    pax: "1–6",
    bags: "6",
    note: "Captain's chairs, cavernous trunk, redefined comfort.",
    img: "https://images.unsplash.com/photo-1767749995450-7b63ab7cd4fd?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600&ixlib=rb-4.1.0",
  },
  {
    name: "Stretch Limousine",
    model: "Hummer Stretch",
    pax: "12–14",
    bags: "4",
    note: "Mood lighting, premium bar, the showstopper for weddings & nightlife.",
    img: "https://images.unsplash.com/photo-1742794147227-b3df1a5ae19c?fm=jpg&q=70&w=2000&auto=format&fit=crop&ixlib=rb-4.1.0",
  },
  {
    name: "Sprinter Van",
    model: "Mercedes Jet Sprinter",
    pax: "10–14",
    bags: "14",
    note: "Group travel without sacrifice. Wi-Fi, USB, leather lounge seating.",
    img: "https://customer-assets.emergentagent.com/job_limo-experience-1/artifacts/z9hc1910_IMG_0001.webp",
  },
];
