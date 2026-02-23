"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import { AuthScreen } from "@/components/auth-screen";
import { useTranslation } from "@/hooks/use-translation";
import { hasEncKey } from "@/lib/crypto/key-store";
import { loadVaultFromServer } from "@/lib/services/vault-sync";

export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const setLoading = useAuthStore((s) => s.setLoading);

  useEffect(() => {
    const tryRestore = async () => {
      if (isAuthenticated) {
        router.replace("/dashboard");
        return;
      }

      if (!hasEncKey()) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/auth/refresh", { method: "POST" });
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = await res.json();
        useAuthStore.getState().setAuth(data.userId, data.accessToken);
        await loadVaultFromServer();
        router.replace("/dashboard");
      } catch {
        setLoading(false);
      }
    };

    tryRestore();
  }, [router, isAuthenticated, setLoading]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-text-subtle">{t("common.loading")}</div>
      </div>
    );
  }

  if (isAuthenticated) return null;

  return <AuthScreen />;
}
