"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useAuthStore, useVaultStore } from "@/lib/store";
import { AuthScreen } from "@/components/auth-screen";
import { Sidebar } from "@/components/layout/sidebar";
import { useTranslation } from "@/hooks/use-translation";
import { useVaultAutosave } from "@/hooks/use-vault-autosave";
import { loadVaultFromServer } from "@/lib/services/vault-sync";
import { hasEncKey } from "@/lib/crypto/key-store";
import { apiFetch } from "@/lib/api-client";

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const setLoading = useAuthStore((s) => s.setLoading);
  const vault = useVaultStore((s) => s.vault);
  const loginRefreshDone = useRef(false);

  // Auto-save vault on changes
  useVaultAutosave();

  // On mount: check if we have a valid session (enc_key in sessionStorage + refresh token)
  useEffect(() => {
    const tryRestore = async () => {
      if (!hasEncKey()) {
        setLoading(false);
        return;
      }

      try {
        // Attempt token refresh
        const res = await fetch("/api/auth/refresh", { method: "POST" });
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = await res.json();
        useAuthStore.getState().setAuth(data.userId, data.accessToken);

        // Load vault
        await loadVaultFromServer();
      } catch {
        // Session expired
      } finally {
        setLoading(false);
      }
    };

    tryRestore();
  }, [setLoading]);

  // Refresh prices once per authenticated session.
  useEffect(() => {
    if (!isAuthenticated) {
      loginRefreshDone.current = false;
      return;
    }
    if (loginRefreshDone.current) return;
    loginRefreshDone.current = true;
    apiFetch("/api/prices/refresh", { method: "POST" }).catch(() => {});
  }, [isAuthenticated]);

  // Keep periodic refresh in sync with current settings.
  useEffect(() => {
    if (!isAuthenticated) return;
    const autoRefreshMinutes = parseInt(vault.settings.autoRefreshMinutes || "15", 10);
    if (!Number.isFinite(autoRefreshMinutes) || autoRefreshMinutes <= 0) return;

    const interval = setInterval(() => {
      apiFetch("/api/prices/refresh", { method: "POST" }).catch(() => {});
    }, autoRefreshMinutes * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated, vault.settings.autoRefreshMinutes]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-page">
        <div className="text-text-subtle">{t("common.loading")}</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <div className="flex min-h-screen bg-bg-page text-text-secondary">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6 pt-16 md:pt-6">{children}</main>
    </div>
  );
}
