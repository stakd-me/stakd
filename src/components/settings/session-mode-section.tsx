"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineHelpCard } from "@/components/ui/inline-help";
import { Shield } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { apiFetch } from "@/lib/api-client";
import {
  isEncKeyPersistent,
  loadEncKey,
  storeEncKey,
} from "@/lib/crypto/key-store";

export function SessionModeSection() {
  const { toast } = useToast();
  const { t } = useTranslation();

  const [sessionKeyPersistent, setSessionKeyPersistent] = useState<boolean | null>(null);
  const [sessionModeSaving, setSessionModeSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isEncKeyPersistent().then((persistent) => {
      if (!cancelled) setSessionKeyPersistent(persistent);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSessionModeChange = async (persist: boolean) => {
    if (sessionKeyPersistent === null || sessionKeyPersistent === persist || sessionModeSaving) {
      return;
    }

    setSessionModeSaving(true);
    try {
      const encKey = await loadEncKey();
      if (!encKey) {
        throw new Error(t("settings.sessionModeNoKey"));
      }

      const previousPersist = await isEncKeyPersistent();
      await storeEncKey(encKey, { persist });

      const res = await apiFetch("/api/auth/refresh/mode", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rememberMe: persist }),
      });

      if (!res.ok) {
        await storeEncKey(encKey, { persist: previousPersist });
        const payload = await res
          .json()
          .catch(() => ({ error: t("settings.sessionModeUpdateFailed") }));
        throw new Error(payload.error || t("settings.sessionModeUpdateFailed"));
      }

      setSessionKeyPersistent(persist);
      toast(
        persist
          ? t("settings.sessionRememberEnabled")
          : t("settings.sessionRememberDisabled"),
        "success"
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : t("settings.sessionModeUpdateFailed");
      toast(msg, "error");
    } finally {
      setSessionModeSaving(false);
    }
  };

  const sessionModeText =
    sessionKeyPersistent === null
      ? t("common.loading")
      : sessionKeyPersistent
        ? t("settings.sessionModeRemembered")
        : t("settings.sessionModeSession");

  return (
    <div className="space-y-4">
      <div className="border border-border-subtle bg-bg-inset p-4">
        <p className="text-body font-semibold text-text-primary">
          {t("settings.sessionSecurity")}
        </p>
        <p className="mt-2 text-body text-text-secondary">
          {t("settings.sessionModeLabel")}{" "}
          <span className="font-medium text-text-primary">
            {sessionModeText}
          </span>
        </p>
        <p className="mt-1 text-caption text-text-muted">
          {t("settings.sessionSecurityDesc")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={
              sessionKeyPersistent === false ? "default" : "outline"
            }
            onClick={() => handleSessionModeChange(false)}
            disabled={sessionModeSaving || sessionKeyPersistent === null}
          >
            {t("settings.sessionModeSession")}
          </Button>
          <Button
            size="sm"
            variant={
              sessionKeyPersistent === true ? "default" : "outline"
            }
            onClick={() => handleSessionModeChange(true)}
            disabled={sessionModeSaving || sessionKeyPersistent === null}
          >
            {t("settings.rememberDevice")}
          </Button>
        </div>
        <p className="mt-2 text-caption text-text-muted" role="status" aria-live="polite">
          {sessionModeSaving
            ? t("settings.updatingSessionMode")
            : t("settings.sessionModeChangeHint")}
        </p>
      </div>

      <InlineHelpCard
        tone={sessionKeyPersistent ? "warning" : "info"}
        icon={<Shield className="h-4 w-4" />}
        title={t("settings.rememberDevice")}
        description={t("settings.rememberDeviceDesc")}
        items={[
          t("settings.rememberDeviceRisk"),
          t("settings.logoutClearsLocalKey"),
        ]}
      />
    </div>
  );
}
