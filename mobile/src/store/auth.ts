import { create } from "zustand";
import { loadToken, setToken, getMe } from "@/api";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

interface AuthState {
  user: UserProfile | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setUser: (u: UserProfile | null) => void;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  hydrated: false,
  hydrate: async () => {
    const t = await loadToken();
    if (t) {
      try {
        const me = await getMe();
        set({ user: me, hydrated: true });
        return;
      } catch {
        await setToken(null);
      }
    }
    set({ hydrated: true });
  },
  setUser: (u) => set({ user: u }),
  signOut: async () => {
    await setToken(null);
    set({ user: null });
  },
}));
