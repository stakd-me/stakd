import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/i18n";
import type { VaultData } from "@/lib/crypto/vault-types";
import { createEmptyVault } from "@/lib/crypto/vault-types";

// ── Auth Store ───────────────────────────────────────────────────────

interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  accessToken: string | null;
  isLoading: boolean;
  setAuth: (userId: string, accessToken: string) => void;
  clearAuth: () => void;
  setAccessToken: (token: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  userId: null,
  accessToken: null,
  isLoading: true,
  setAuth: (userId, accessToken) =>
    set({ isAuthenticated: true, userId, accessToken }),
  clearAuth: () =>
    set({ isAuthenticated: false, userId: null, accessToken: null }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setLoading: (isLoading) => set({ isLoading }),
}));

// ── Vault Store ──────────────────────────────────────────────────────

interface VaultState {
  vault: VaultData;
  vaultVersion: number;
  isDirty: boolean;
  setVault: (vault: VaultData, version: number) => void;
  updateVault: (fn: (prev: VaultData) => VaultData) => void;
  markClean: () => void;
  clearVault: () => void;
}

export const useVaultStore = create<VaultState>((set) => ({
  vault: createEmptyVault(),
  vaultVersion: 0,
  isDirty: false,
  setVault: (vault, vaultVersion) =>
    set({ vault, vaultVersion, isDirty: false }),
  updateVault: (fn) =>
    set((state) => ({ vault: fn(state.vault), isDirty: true })),
  markClean: () => set({ isDirty: false }),
  clearVault: () =>
    set({ vault: createEmptyVault(), vaultVersion: 0, isDirty: false }),
}));

// ── Preferences Store ────────────────────────────────────────────────

interface PreferencesState {
  locale: Locale;
  theme: string;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: string) => void;
  setPreferences: (prefs: Partial<PreferencesState>) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      locale: "en",
      theme: "dark",
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      setPreferences: (prefs) => set(prefs),
    }),
    { name: "portfolio-preferences" }
  )
);

// ── Backward Compat ──────────────────────────────────────────────────
// For components that still use useAppStore pattern
export const useAppStore = create<{
  isUnlocked: boolean;
  isSetup: boolean;
  isLoading: boolean;
  setAuth: (isUnlocked: boolean, isSetup: boolean) => void;
  setLoading: (loading: boolean) => void;
}>((set) => ({
  isUnlocked: false,
  isSetup: false,
  isLoading: true,
  setAuth: (isUnlocked, isSetup) => set({ isUnlocked, isSetup }),
  setLoading: (isLoading) => set({ isLoading }),
}));
