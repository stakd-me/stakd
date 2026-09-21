"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useAuthStore } from "@/lib/store";
import { AuthScreen } from "@/components/auth-screen";
import { AppBar } from "@/components/layout/app-bar";
import { AppSplash } from "@/components/layout/app-splash";
import { BottomTabs } from "@/components/layout/bottom-tabs";
import { NavRail } from "@/components/layout/nav-rail";
import { useTranslation } from "@/hooks/use-translation";
import { useVaultAutosave } from "@/hooks/use-vault-autosave";
import { WeeklyAllocationSnapshotRecorder } from "@/hooks/use-weekly-allocation-snapshots";
import { PortfolioSnapshotRecorder } from "@/hooks/use-portfolio-snapshots";
import { loadVaultFromServer } from "@/lib/services/vault-sync";
import { hasEncKey } from "@/lib/crypto/key-store";
import { apiFetch } from "@/lib/api-client";

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const setLoading = useAuthStore((s) => s.setLoading);
  const loginRefreshDone = useRef(false);

  // Auto-save vault on changes
  useVaultAutosave();

  // On mount: check if we have a valid session (encryption key in session/local storage + refresh token)
  useEffect(() => {
    const tryRestore = async () => {
      if (!(await hasEncKey())) {
        setLoading(false);
        return;
      }

      try {
        // Attempt token refresh
        const res = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
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

  if (isLoading) {
    return <AppSplash />;
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <div className="flex min-h-screen bg-bg-page text-text-secondary">
      <WeeklyAllocationSnapshotRecorder />
      <PortfolioSnapshotRecorder />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:border focus:border-border focus:bg-bg-card focus:px-3 focus:py-2 focus:text-body focus:text-text-primary"
      >
        {t("nav.skipToContent")}
      </a>
      <NavRail />
      <div className="flex min-w-0 grow flex-col">
        <AppBar />
        <main id="main" className="grow overflow-auto p-4 md:p-6">
          <div className="mx-auto w-full max-w-content">{children}</div>
        </main>
        <BottomTabs />
      </div>
    </div>
  );
}
