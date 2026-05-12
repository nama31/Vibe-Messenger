"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "../types";

export interface AuthState {
  user: User | null;
  access_token: string | null;
  refresh_token: string | null;
  setAuth: (user: User, access_token: string, refresh_token: string) => void;
  updateUser: (patch: Partial<User>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      access_token: null,
      refresh_token: null,
      setAuth: (user, access_token, refresh_token) =>
        set({ user, access_token, refresh_token }),
      updateUser: (patch) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...patch } : state.user,
        })),
      logout: () => set({ user: null, access_token: null, refresh_token: null }),
    }),
    { name: "messenger-auth" },
  ),
);
