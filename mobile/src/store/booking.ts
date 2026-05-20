import { create } from "zustand";

export interface Trip {
  pickup: string;
  pickupCoords?: { lat: number; lng: number };
  dropoff: string;
  dropoffCoords?: { lat: number; lng: number };
  datetime: string;        // ISO
  passengerCount: number;
  vehicleType?: string;
  quoteAmount?: number;
  promoCode?: string;
}

interface BookingState {
  trip: Trip;
  setTrip: (partial: Partial<Trip>) => void;
  resetTrip: () => void;
}

const blank: Trip = {
  pickup: "",
  dropoff: "",
  datetime: "",
  passengerCount: 1,
};

export const useBooking = create<BookingState>((set) => ({
  trip: blank,
  setTrip: (partial) => set((s) => ({ trip: { ...s.trip, ...partial } })),
  resetTrip: () => set({ trip: blank }),
}));
