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

export async function logout() {
  await setToken(null);
}
