import { create } from "zustand";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export interface DriverProfile {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  plate?: string;
  vehicle?: string;
}

const KEY = "driver_token";
const PROFILE_KEY = "driver_profile";

const DriverTokenStore = {
  async set(v: string) {
    if (Platform.OS === "web") { try { window.localStorage.setItem(KEY, v); } catch {} }
    else await SecureStore.setItemAsync(KEY, v);
  },
  async get(): Promise<string | null> {
    if (Platform.OS === "web") { try { return window.localStorage.getItem(KEY); } catch { return null; } }
    return await SecureStore.getItemAsync(KEY);
  },
  async clear() {
    if (Platform.OS === "web") { try { window.localStorage.removeItem(KEY); } catch {} }
    else await SecureStore.deleteItemAsync(KEY);
  },
};

const DriverProfileStore = {
  async set(p: DriverProfile) {
    const v = JSON.stringify(p);
    if (Platform.OS === "web") { try { window.localStorage.setItem(PROFILE_KEY, v); } catch {} }
    else await SecureStore.setItemAsync(PROFILE_KEY, v);
  },
  async get(): Promise<DriverProfile | null> {
    try {
      const raw = Platform.OS === "web"
        ? (typeof window !== "undefined" ? window.localStorage.getItem(PROFILE_KEY) : null)
        : await SecureStore.getItemAsync(PROFILE_KEY);
      return raw ? (JSON.parse(raw) as DriverProfile) : null;
    } catch { return null; }
  },
  async clear() {
    if (Platform.OS === "web") { try { window.localStorage.removeItem(PROFILE_KEY); } catch {} }
    else await SecureStore.deleteItemAsync(PROFILE_KEY);
  },
};

interface DriverState {
  driver: DriverProfile | null;
  token: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (token: string, driver: DriverProfile) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useDriverAuth = create<DriverState>((set) => ({
  driver: null,
  token: null,
  hydrated: false,
  hydrate: async () => {
    const [t, p] = await Promise.all([DriverTokenStore.get(), DriverProfileStore.get()]);
    set({ token: t, driver: p, hydrated: true });
  },
  setSession: async (token, driver) => {
    await Promise.all([DriverTokenStore.set(token), DriverProfileStore.set(driver)]);
    set({ token, driver });
  },
  signOut: async () => {
    await Promise.all([DriverTokenStore.clear(), DriverProfileStore.clear()]);
    set({ token: null, driver: null });
  },
}));

export { DriverTokenStore };
