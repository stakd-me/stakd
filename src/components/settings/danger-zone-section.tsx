"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TriangleAlert } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { useAuthStore, useVaultStore } from "@/lib/store";
import { apiFetch } from "@/lib/api-client";
import {
  deriveMasterKey,
  deriveAuthKey,
  authKeyToHex,
} from "@/lib/crypto/client-crypto";
import { clearEncKey } from "@/lib/crypto/key-store";
import { saveVaultToServer } from "@/lib/services/vault-sync";
import { createEmptyVault } from "@/lib/crypto/vault-types";
import { hexToBytes } from "./hex";
import { BackupSection } from "./backup-section";

type DangerAction = "portfolio" | "settings" | "all" | "account";

const DANGER_CONFIRM_KEYWORD = "DELETE";
const DANGER_CONFIRM_DELAY_SECONDS = 5;

export function DangerZoneSection() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const clearVaultStore = useVaultStore((s) => s.clearVault);
  const vault = useVaultStore((s) => s.vault);

  const [dangerAction, setDangerAction] = useState<DangerAction>("portfolio");
  const [dangerPassphrase, setDangerPassphrase] = useState("");
  const [dangerKeyword, setDangerKeyword] = useState("");
  const [dangerError, setDangerError] = useState("");
  const [dangerRunning, setDangerRunning] = useState(false);
  const [dangerCountdown, setDangerCountdown] = useState(DANGER_CONFIRM_DELAY_SECONDS);

  const portfolioRecordsCount =
    vault.transactions.length +
    vault.manualEntries.length +
    vault.rebalanceTargets.length +
    vault.rebalanceSessions.length +
    vault.rebalanceLogs.length +
    vault.portfolioSnapshots.length +
    vault.allocationSnapshots.length +
    vault.tokenGroups.length +
    vault.tokenCategories.length +
    vault.costBasisOverrides.length;
  const settingsRecordsCount = Object.keys(vault.settings).length;
  const selectedDangerCount =
    dangerAction === "portfolio"
      ? portfolioRecordsCount
      : dangerAction === "settings"
        ? settingsRecordsCount
        : portfolioRecordsCount + settingsRecordsCount;

  const dangerKeywordValid =
    dangerKeyword.trim().toUpperCase() === DANGER_CONFIRM_KEYWORD;
  const dangerCanExecute =
    dangerPassphrase.trim().length > 0 &&
    dangerKeywordValid &&
    dangerCountdown === 0 &&
    !dangerRunning;

  useEffect(() => {
    setDangerCountdown(DANGER_CONFIRM_DELAY_SECONDS);
  }, [dangerAction]);

  useEffect(() => {
    if (dangerCountdown <= 0) return;
    const timer = window.setTimeout(() => {
      setDangerCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [dangerCountdown]);

  const verifyCurrentPassphrase = async (passphrase: string) => {
    const saltRes = await apiFetch("/api/auth/salt/me");
    if (!saltRes.ok) {
      throw new Error(t("settings.failedVerifyPassphrase"));
    }
    const saltPayload: { salt?: string } = await saltRes.json();
    const saltHex = typeof saltPayload.salt === "string" ? saltPayload.salt : "";
    const salt = hexToBytes(saltHex);
    if (!salt) {
      throw new Error(t("settings.failedVerifyPassphrase"));
    }

    const masterKey = await deriveMasterKey(passphrase, salt);
    const authKey = await deriveAuthKey(masterKey);
    const authKeyHex = authKeyToHex(authKey);

    const verifyRes = await apiFetch("/api/auth/verify-passphrase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authKeyHex }),
    });

    if (!verifyRes.ok) {
      const payload = await verifyRes
        .json()
        .catch(() => ({ error: t("settings.failedVerifyPassphrase") }));
      throw new Error(payload.error || t("settings.failedVerifyPassphrase"));
    }

    return authKeyHex;
  };

  const handleDangerAction = async () => {
    setDangerError("");

    if (!dangerKeywordValid) {
      setDangerError(t("settings.confirmKeywordInvalid"));
      return;
    }

    if (dangerCountdown > 0) {
      setDangerError(t("settings.waitBeforeDelete", { seconds: dangerCountdown }));
      return;
    }

    setDangerRunning(true);
    try {
      const authKeyHex = await verifyCurrentPassphrase(dangerPassphrase);

      if (dangerAction === "portfolio") {
        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          transactions: [],
          manualEntries: [],
          rebalanceTargets: [],
          rebalanceSessions: [],
          rebalanceLogs: [],
          portfolioSnapshots: [],
          allocationSnapshots: [],
          tokenGroups: [],
          tokenCategories: [],
          costBasisOverrides: [],
        }));
        await saveVaultToServer();
        toast(t("settings.wipePortfolioSuccess"), "success");
      } else if (dangerAction === "settings") {
        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          settings: {},
        }));
        await saveVaultToServer();
        toast(t("settings.wipeSettingsSuccess"), "success");
      } else if (dangerAction === "all") {
        useVaultStore.getState().updateVault(() => createEmptyVault());
        await saveVaultToServer();
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        await clearEncKey();
        clearVaultStore();
        clearAuth();
        toast(t("settings.wipeAllSuccess"), "success");
      } else {
        const res = await apiFetch("/api/vault", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authKeyHex }),
        });
        if (!res.ok) {
          const payload = await res
            .json()
            .catch(() => ({ error: t("settings.wipeFailed") }));
          throw new Error(payload.error || t("settings.wipeFailed"));
        }
        await clearEncKey();
        clearVaultStore();
        clearAuth();
        toast(t("settings.deleteAccountSuccess"), "success");
      }

      setDangerPassphrase("");
      setDangerKeyword("");
      setDangerCountdown(DANGER_CONFIRM_DELAY_SECONDS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("settings.wipeFailed");
      setDangerError(msg);
      toast(msg, "error");
    } finally {
      setDangerRunning(false);
    }
  };

  return (
    <Card className="border-status-negative-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-status-negative">
          <TriangleAlert className="h-5 w-5" />
          {t("settings.dangerZone")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-w-xl space-y-4">
          <p className="text-sm text-text-subtle">
            {t("settings.dangerDesc")}
          </p>

          <BackupSection />

          <FormField
            label={t("settings.dangerAction")}
            htmlFor="settings-danger-action"
            hint={
              <>
                {dangerAction === "portfolio" &&
                  t("settings.dangerActionDescPortfolio")}
                {dangerAction === "settings" &&
                  t("settings.dangerActionDescSettings")}
                {dangerAction === "all" &&
                  t("settings.dangerActionDescAll")}
                {dangerAction === "account" &&
                  t("settings.dangerActionDescAccount")}
              </>
            }
          >
            <Select
              id="settings-danger-action"
              value={dangerAction}
              onChange={(e) =>
                setDangerAction(e.target.value as DangerAction)
              }
              className="w-full max-w-md"
            >
              <option value="portfolio">
                {t("settings.dangerActionPortfolio")}
              </option>
              <option value="settings">
                {t("settings.dangerActionSettings")}
              </option>
              <option value="all">
                {t("settings.dangerActionAll")}
              </option>
              <option value="account">
                {t("settings.dangerActionAccount")}
              </option>
            </Select>
            <p className="mt-1 text-xs text-status-warning">
              {t("settings.recordsToDelete", { count: selectedDangerCount })}
            </p>
          </FormField>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FormField
              label={t("settings.currentPassword")}
              htmlFor="settings-danger-passphrase"
            >
              <Input
                id="settings-danger-passphrase"
                type="password"
                value={dangerPassphrase}
                onChange={(e) => setDangerPassphrase(e.target.value)}
                placeholder={t("settings.currentPasswordPlaceholder")}
              />
            </FormField>

            <FormField
              label={t("settings.confirmKeyword")}
              htmlFor="settings-danger-keyword"
            >
              <Input
                id="settings-danger-keyword"
                value={dangerKeyword}
                onChange={(e) => setDangerKeyword(e.target.value)}
                placeholder={t("settings.confirmKeywordPlaceholder")}
                autoComplete="off"
              />
            </FormField>
          </div>

          {dangerCountdown > 0 && (
            <p className="text-xs text-status-warning">
              {t("settings.waitBeforeDelete", {
                seconds: dangerCountdown,
              })}
            </p>
          )}

          {dangerError && (
            <p className="text-sm text-status-negative">{dangerError}</p>
          )}

          <Button
            onClick={handleDangerAction}
            disabled={!dangerCanExecute}
            className="bg-status-negative text-bg-page hover:opacity-90"
          >
            {dangerRunning
              ? t("settings.deletingData")
              : t("settings.executeDelete")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
