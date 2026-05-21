/**
 * Backend API client for the mobile app.
 * Uses the same endpoints the web app does. Token is persisted in SecureStore (iOS Keychain / Android Keystore).
 */
import axios, { AxiosInstance } from "axios";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  "https://limo-experience-1.preview.emergentagent.com";

let cachedToken: string | null = null;

/* SecureStore is iOS Keychain / Android Keystore. On web it has no implementation,
   so we fall back to localStorage just so the dev preview works. */
const TokenStore = {
  async set(value: string) {
    if (Platform.OS === "web") {
      try { window.localStorage.setItem("auth_token", value); } catch {}
    } else {
      await SecureStore.setItemAsync("auth_token", value);
    }
  },
  async get(): Promise<string | null> {
    if (Platform.OS === "web") {
      try { return window.localStorage.getItem("auth_token"); } catch { return null; }
    }
    return await SecureStore.getItemAsync("auth_token");
  },
  async clear() {
    if (Platform.OS === "web") {
      try { window.localStorage.removeItem("auth_token"); } catch {}
    } else {
      await SecureStore.deleteItemAsync("auth_token");
    }
  },
};

export async function setToken(token: string | null) {
  cachedToken = token;
  if (token) await TokenStore.set(token);
  else await TokenStore.clear();
}

export async function loadToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  cachedToken = await TokenStore.get();
  return cachedToken;
}

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
});

api.interceptors.request.use(async (config) => {
  const t = await loadToken();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

/* ============== Public endpoints ============== */
export async function fetchVehicleTypes() {
  const { data } = await api.get("/api/vehicle-types");
  return data;
}

export async function getQuote(payload: {
  pickup_address: string;
  dropoff_address: string;
  pickup_datetime: string;
  passenger_count: number;
  is_hourly?: boolean;
  hours?: number;
  promo_code?: string;
}) {
  // Adapt to the existing backend QuoteRequest schema.
  const body: any = {
    pickup_location: payload.pickup_address,
    dropoff_location: payload.dropoff_address,
    service_type: payload.is_hourly ? "Hourly Chauffeur" : "Point to Point",
    pickup_date: (payload.pickup_datetime || "").slice(0, 10) || undefined,
  };
  if (payload.is_hourly && payload.hours) body.hours = payload.hours;
  const { data } = await api.post("/api/quote", body);
  return data;
}

/* ============== Auth endpoints ============== */
export async function signupRider(payload: { name: string; email: string; phone?: string; password: string }) {
  const { data } = await api.post("/api/customer/signup", payload);
  if (data?.token) await setToken(data.token);
  return data;
}

export async function loginRider(payload: { email: string; password: string }) {
  const { data } = await api.post("/api/customer/login", payload);
  if (data?.token) await setToken(data.token);
  return data;
}

export async function getMe() {
  const { data } = await api.get("/api/customer/me");
  return data;
}

export async function bookAndPay(payload: {
  pickup_location: string;
  dropoff_location: string;
  pickup_datetime: string;
  vehicle_type: string;
  quote_amount: number;
  passenger_count?: number;
  promo_code?: string;
  notes?: string;
}) {
  const { data } = await api.post("/api/customer/book-and-pay", {
    passenger_count: 1,
    ...payload,
  });
  return data as { booking_id: string; checkout_url: string; session_id: string };
}

export async function fetchMyTrips() {
  const { data } = await api.get("/api/customer/trips");
  return data as Array<{
    id: string;
    confirmation_number?: string;
    pickup_date: string;
    pickup_time: string;
    pickup_location: string;
    dropoff_location: string;
    vehicle_type: string;
    quote_amount?: number;
    status: string;
    payment_status?: string;
    trip_status?: string;
    created_at?: string;
  }>;
}

export async function fetchBookingDetail(bookingId: string) {
  const { data } = await api.get(`/api/customer/bookings/${bookingId}`);
  return data;
}

export async function placesAutocomplete(input: string, sessionToken?: string) {
  const { data } = await api.get("/api/places/autocomplete", {
    params: { input, session: sessionToken },
  });
  return (data?.predictions || []) as Array<{
    place_id: string;
    description: string;
    main_text: string;
    secondary_text: string;
  }>;
}

/* ============== Rider self-service (Profile menu) ============== */
export async function updateMyProfile(payload: { name?: string; phone?: string }) {
  const { data } = await api.patch("/api/customer/me", payload);
  return data;
}

export interface SavedAddress {
  id: string;
  label: string;
  address: string;
  is_default_pickup: boolean;
  is_default_dropoff: boolean;
  created_at: string;
}

export async function listSavedAddresses() {
  const { data } = await api.get<SavedAddress[]>("/api/customer/me/addresses");
  return data;
}

export async function createSavedAddress(payload: { label: string; address: string; is_default_pickup?: boolean; is_default_dropoff?: boolean }) {
  const { data } = await api.post<SavedAddress>("/api/customer/me/addresses", payload);
  return data;
}

export async function deleteSavedAddress(id: string) {
  const { data } = await api.delete(`/api/customer/me/addresses/${id}`);
  return data;
}

export async function listPromoHistory() {
  const { data } = await api.get<Array<{ promo_code: string; discount_amount: number; used_at: string; confirmation_number: string }>>(
    "/api/customer/me/promos"
  );
  return data;
}

export interface NotificationPrefs {
  ride_updates_push: boolean;
  ride_updates_email: boolean;
  promotions_push: boolean;
  promotions_email: boolean;
  receipts_email: boolean;
}

export async function getNotificationPrefs() {
  const { data } = await api.get<NotificationPrefs>("/api/customer/me/notifications");
  return data;
}

export async function updateNotificationPrefs(prefs: NotificationPrefs) {
  const { data } = await api.patch<NotificationPrefs>("/api/customer/me/notifications", prefs);
  return data;
}

export async function changeMyPassword(payload: { current_password: string; new_password: string }) {
  const { data } = await api.post("/api/customer/me/change-password", payload);
  return data;
}

export async function deleteMyAccount() {
  const { data } = await api.delete("/api/customer/me");
  return data;
}

export async function submitHelpRequest(payload: { subject: string; message: string; booking_id?: string }) {
  const { data } = await api.post("/api/customer/me/help", payload);
  return data;
}



/* ============== Driver endpoints ============== */
import { DriverTokenStore } from "@/store/driver";

const driverApi = axios.create({ baseURL: BASE_URL, timeout: 20000 });
driverApi.interceptors.request.use(async (config) => {
  const t = await DriverTokenStore.get();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

export async function driverLogin(payload: { email: string; password: string }) {
  const { data } = await driverApi.post("/api/driver-auth/login", payload);
  return data as { token: string; driver: any };
}

export async function driverSetPassword(payload: { email: string; password: string }) {
  const { data } = await driverApi.post("/api/driver-auth/set-password", payload);
  return data as { token: string; driver: any };
}

export async function driverGetMe() {
  const { data } = await driverApi.get("/api/driver-auth/me");
  return data;
}

export async function driverGetTrips() {
  const { data } = await driverApi.get("/api/driver-auth/trips");
  return data as Array<any>;
}

export async function driverGetStats() {
  const { data } = await driverApi.get("/api/driver-auth/stats");
  return data as { trips_this_week: number; trips_all_time: number; earnings_this_week: number; rating: number };
}

export async function driverPostLocation(payload: {
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  active_booking_id?: string | null;
}) {
  const { data } = await driverApi.post("/api/driver-auth/location", payload);
  return data;
}

export async function customerGetDriverLocation(bookingId: string) {
  const { data } = await api.get(`/api/customer/bookings/${bookingId}/driver-location`);
  return data;
}

export async function customerRateTrip(bookingId: string, rating: number, comment?: string) {
  const { data } = await api.post(`/api/customer/bookings/${bookingId}/rate`, { rating, comment });
  return data;
}

export async function customerCancelBooking(bookingId: string, reason?: string) {
  const { data } = await api.post(`/api/customer/bookings/${bookingId}/cancel`, { reason: reason || "" });
  return data;
}

export async function customerModifyBooking(bookingId: string, changes: {
  pickup_datetime?: string;
  pickup_location?: string;
  dropoff_location?: string;
  vehicle_type?: string;
  passengers?: number;
  notes?: string;
}) {
  const { data } = await api.post(`/api/customer/bookings/${bookingId}/modify`, changes);
  return data;
}

export async function customerForgotPassword(email: string) {
  const { data } = await api.post(`/api/customer/forgot-password`, { email });
  return data;
}

export async function validatePromo(payload: { code: string; amount: number; email?: string; vehicle_type?: string }) {
  const { data } = await api.post(`/api/promos/validate`, payload);
  return data;
}

// JWT-driver trip actions
export async function driverGetBookingDetail(bookingId: string) {
  const { data } = await driverApi.get(`/api/driver-auth/bookings/${bookingId}`);
  return data;
}

export async function driverUpdateBookingStatus(bookingId: string, status: string) {
  const { data } = await driverApi.post(`/api/driver-auth/bookings/${bookingId}/status`, { status });
  return data;
}

export async function driverRecordWaitTime(bookingId: string, minutes: number) {
  const { data } = await driverApi.post(`/api/driver-auth/bookings/${bookingId}/record-wait-time`, { minutes_waited: minutes });
  return data;
}

export async function driverRecordMidTripStop(bookingId: string, payload: { stop_address: string; minutes_at_stop: number }) {
  const { data } = await driverApi.post(`/api/driver-auth/bookings/${bookingId}/record-mid-trip-stop`, payload);
  return data;
}

export async function logout() {
  await setToken(null);
}
