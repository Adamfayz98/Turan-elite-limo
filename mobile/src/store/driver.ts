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
    const t = await DriverTokenStore.get();
    set({ token: t, hydrated: true });
  },
  setSession: async (token, driver) => {
    await DriverTokenStore.set(token);
    set({ token, driver });
  },
  signOut: async () => {
    await DriverTokenStore.clear();
    set({ token: null, driver: null });
  },
}));

export { DriverTokenStore };
