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

export async function logout() {
  await setToken(null);
}
