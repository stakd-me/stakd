"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Save, Shield, Scale, TriangleAlert } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { useAuthStore, useVaultStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";
import {
  deriveMasterKey,
  deriveAuthKey,
  deriveEncKey,
  authKeyToHex,
  encryptVault,
  generateSalt,
} from "@/lib/crypto/client-crypto";
import {
  clearEncKey,
  isEncKeyPersistent,
  storeEncKey,
} from "@/lib/crypto/key-store";
import { saveVaultToServer } from "@/lib/services/vault-sync";
import { createEmptyVault } from "@/lib/crypto/vault-types";
import {
  CONCENTRATION_ALERT_THRESHOLD_PERCENT,
  MAX_CONCENTRATION_ALERT_THRESHOLD_PERCENT,
  MIN_CONCENTRATION_ALERT_THRESHOLD_PERCENT,
  parseConcentrationAlertThresholdPercent,
} from "@/lib/constants/risk";

const REBALANCE_SETTING_KEYS = [
  "holdZonePercent",
  "minTradeUsd",
  "buyOnlyMode",
  "newCashUsd",
  "cashReserveUsd",
  "cashReservePercent",
  "dustThresholdUsd",
  "slippagePercent",
  "tradingFeePercent",
  "autoRefreshMinutes",
  "concentrationThresholdPercent",
  "excludeStablecoinsFromConcentration",
  "treatStablecoinsAsCashReserve",
  "rebalanceStrategy",
  "rebalanceInterval",
  "portfolioChangeThreshold",
  "riskParityLookbackDays",
  "dcaSplitCount",
  "dcaIntervalDays",
] as const;

type DangerAction = "portfolio" | "settings" | "all" | "account";
type SettingsSection =
  | "security"
  | "strategy"
  | "risk"
  | "trading"
  | "refresh"
  | "danger"
  | "about"
  | "all";

const DANGER_CONFIRM_KEYWORD = "DELETE";
const DANGER_CONFIRM_DELAY_SECONDS = 5;

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const offset = i * 2;
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16);
    if (Number.isNaN(value)) return null;
    bytes[i] = value;
  }
  return bytes;
}

// ── Page component ──────────────────────────────────────────────────

export default function SettingsPage() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const requiredLabel = t("common.required");
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const clearVaultStore = useVaultStore((s) => s.clearVault);
  const vault = useVaultStore((s) => s.vault);

  // --- Passphrase Change ---
  const [currentPassphrase, setCurrentPassphrase] = useState("");
  const [newPassphrase, setNewPassphrase] = useState("");
  const [confirmNewPassphrase, setConfirmNewPassphrase] = useState("");
  const [passphraseChanging, setPassphraseChanging] = useState(false);
  const [passphraseError, setPassphraseError] = useState("");
  const [passphraseSuccess, setPassphraseSuccess] = useState(false);

  const handlePassphraseChange = async () => {
    setPassphraseError("");
    setPassphraseSuccess(false);

    if (newPassphrase !== confirmNewPassphrase) return;
    if (newPassphrase.length < 8) return;

    setPassphraseChanging(true);
    try {
      // 1. Get current user's salt from authenticated session
      const saltRes = await apiFetch("/api/auth/salt/me");
      if (!saltRes.ok) throw new Error("Failed to get salt");
      const { salt: saltHex } = await saltRes.json();
      const oldSalt = hexToBytes(typeof saltHex === "string" ? saltHex : "");
      if (!oldSalt) {
        throw new Error(t("settings.failedVerifyPassphrase"));
      }

      // 2. Derive old auth key from current passphrase + old salt
      const oldMasterKey = await deriveMasterKey(currentPassphrase, oldSalt);
      const oldAuthKey = await deriveAuthKey(oldMasterKey);
      const oldAuthKeyHex = authKeyToHex(oldAuthKey);

      // 3. Generate new salt and derive new keys
      const newSalt = generateSalt();
      const newMasterKey = await deriveMasterKey(newPassphrase, newSalt);
      const newAuthKey = await deriveAuthKey(newMasterKey);
      const newEncKey = await deriveEncKey(newMasterKey);
      const newAuthKeyHex = authKeyToHex(newAuthKey);

      // 4. Re-encrypt vault with new enc key
      const { vault } = useVaultStore.getState();
      const { ciphertext, iv } = await encryptVault(vault, newEncKey);

      // 5. Send to server
      const newSaltHex = Array.from(newSalt)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const res = await apiFetch("/api/auth/change-passphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldAuthKeyHex,
          newAuthKeyHex,
          newSalt: newSaltHex,
          encryptedVault: ciphertext,
          iv,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t("settings.failedChangePassword"));
      }

      const data: { vaultVersion?: number } = await res.json();

      // 6. Keep existing key persistence mode after passphrase rotation.
      await storeEncKey(newEncKey, { persist: isEncKeyPersistent() });

      // 7. Sync local vault version to avoid optimistic-lock conflict on next save.
      if (typeof data.vaultVersion === "number") {
        useVaultStore.setState({
          vaultVersion: data.vaultVersion,
          isDirty: false,
        });
      }

      // 8. Clear form
      setCurrentPassphrase("");
      setNewPassphrase("");
      setConfirmNewPassphrase("");
      setPassphraseSuccess(true);
      toast(t("settings.passwordChanged"), "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("settings.failedChangePassword");
      setPassphraseError(msg);
      toast(msg, "error");
    } finally {
      setPassphraseChanging(false);
    }
  };

  // --- Rebalance Settings (from vault) ---
  const vaultSettings = vault.settings;
  const [holdZonePercent, setHoldZonePercent] = useState("5");
  const [minTradeUsd, setMinTradeUsd] = useState("50");
  const [buyOnlyMode, setBuyOnlyMode] = useState(false);
  const [newCashUsd, setNewCashUsd] = useState("0");
  const [cashReserveUsd, setCashReserveUsd] = useState("0");
  const [cashReservePercent, setCashReservePercent] = useState("0");
  const [dustThresholdUsd, setDustThresholdUsd] = useState("1");
  const [slippagePercent, setSlippagePercent] = useState("0.5");
  const [tradingFeePercent, setTradingFeePercent] = useState("0.1");
  const [autoRefreshMinutes, setAutoRefreshMinutes] = useState("15");
  const [concentrationThresholdPercent, setConcentrationThresholdPercent] = useState(
    CONCENTRATION_ALERT_THRESHOLD_PERCENT.toString()
  );
  const [excludeStablecoinsFromConcentration, setExcludeStablecoinsFromConcentration] = useState(false);
  const [treatStablecoinsAsCashReserve, setTreatStablecoinsAsCashReserve] = useState(false);
  const [rebalanceStrategy, setRebalanceStrategy] = useState("percent-of-portfolio");
  const [rebalanceInterval, setRebalanceInterval] = useState("monthly");
  const [portfolioChangeThreshold, setPortfolioChangeThreshold] = useState("5");
  const [riskParityLookbackDays, setRiskParityLookbackDays] = useState("30");
  const [dcaSplitCount, setDcaSplitCount] = useState("4");
  const [dcaIntervalDays, setDcaIntervalDays] = useState("7");
  const [rebalanceSettingsLoaded, setRebalanceSettingsLoaded] = useState(false);
  const [rebalanceSaving, setRebalanceSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>("all");
  const [sessionKeyPersistent, setSessionKeyPersistent] = useState<boolean | null>(null);
  const hasHydratableRebalanceSettings = REBALANCE_SETTING_KEYS.some(
    (key) => vaultSettings[key] !== undefined
  );

  // Load settings from vault on mount / when vault changes
  useEffect(() => {
    if (rebalanceSettingsLoaded || !hasHydratableRebalanceSettings) return;

    if (vaultSettings.holdZonePercent !== undefined) setHoldZonePercent(vaultSettings.holdZonePercent);
    if (vaultSettings.minTradeUsd !== undefined) setMinTradeUsd(vaultSettings.minTradeUsd);
    if (vaultSettings.buyOnlyMode !== undefined) setBuyOnlyMode(vaultSettings.buyOnlyMode === "1");
    if (vaultSettings.newCashUsd !== undefined) setNewCashUsd(vaultSettings.newCashUsd);
    if (vaultSettings.cashReserveUsd !== undefined) setCashReserveUsd(vaultSettings.cashReserveUsd);
    if (vaultSettings.cashReservePercent !== undefined) setCashReservePercent(vaultSettings.cashReservePercent);
    if (vaultSettings.dustThresholdUsd !== undefined) setDustThresholdUsd(vaultSettings.dustThresholdUsd);
    if (vaultSettings.slippagePercent !== undefined) setSlippagePercent(vaultSettings.slippagePercent);
    if (vaultSettings.tradingFeePercent !== undefined) setTradingFeePercent(vaultSettings.tradingFeePercent);
    if (vaultSettings.autoRefreshMinutes !== undefined) setAutoRefreshMinutes(vaultSettings.autoRefreshMinutes);
    if (vaultSettings.concentrationThresholdPercent !== undefined) {
      setConcentrationThresholdPercent(vaultSettings.concentrationThresholdPercent);
    }
    if (vaultSettings.excludeStablecoinsFromConcentration !== undefined) {
      setExcludeStablecoinsFromConcentration(
        vaultSettings.excludeStablecoinsFromConcentration === "1"
      );
    }
    if (vaultSettings.treatStablecoinsAsCashReserve !== undefined) {
      setTreatStablecoinsAsCashReserve(
        vaultSettings.treatStablecoinsAsCashReserve === "1"
      );
    }
    if (vaultSettings.rebalanceStrategy !== undefined) setRebalanceStrategy(vaultSettings.rebalanceStrategy);
    if (vaultSettings.rebalanceInterval !== undefined) setRebalanceInterval(vaultSettings.rebalanceInterval);
    if (vaultSettings.portfolioChangeThreshold !== undefined) setPortfolioChangeThreshold(vaultSettings.portfolioChangeThreshold);
    if (vaultSettings.riskParityLookbackDays !== undefined) setRiskParityLookbackDays(vaultSettings.riskParityLookbackDays);
    if (vaultSettings.dcaSplitCount !== undefined) setDcaSplitCount(vaultSettings.dcaSplitCount);
    if (vaultSettings.dcaIntervalDays !== undefined) setDcaIntervalDays(vaultSettings.dcaIntervalDays);

    setRebalanceSettingsLoaded(true);
  }, [vaultSettings, rebalanceSettingsLoaded, hasHydratableRebalanceSettings]);

  const handleSaveRebalanceSettings = async () => {
    setRebalanceSaving(true);
    try {
      const normalizedConcentrationThresholdPercent = parseConcentrationAlertThresholdPercent(
        concentrationThresholdPercent
      ).toString();
      const newSettings: Record<string, string> = {
        holdZonePercent,
        minTradeUsd,
        buyOnlyMode: buyOnlyMode ? "1" : "0",
        newCashUsd,
        cashReserveUsd,
        cashReservePercent,
        dustThresholdUsd,
        slippagePercent,
        tradingFeePercent,
        autoRefreshMinutes,
        concentrationThresholdPercent: normalizedConcentrationThresholdPercent,
        excludeStablecoinsFromConcentration: excludeStablecoinsFromConcentration ? "1" : "0",
        treatStablecoinsAsCashReserve: treatStablecoinsAsCashReserve ? "1" : "0",
        rebalanceStrategy,
        riskParityLookbackDays,
        ...(rebalanceStrategy === "calendar" ? { rebalanceInterval } : {}),
        ...(rebalanceStrategy === "percent-of-portfolio" ? { portfolioChangeThreshold } : {}),
        ...(rebalanceStrategy === "dca-weighted"
          ? { dcaSplitCount, dcaIntervalDays }
          : {}),
      };

      const deprecatedKeys = [
        "priceSourcePrimary",
        "driftThresholdPercent",
      ] as const;

      useVaultStore.getState().updateVault((prev) => ({
        ...prev,
        // Remove deprecated keys from older versions while saving.
        settings: (() => {
          const cleanedSettings: Record<string, string> = { ...prev.settings };
          for (const key of deprecatedKeys) {
            delete cleanedSettings[key];
          }
          return { ...cleanedSettings, ...newSettings };
        })(),
      }));

      await saveVaultToServer();
      setConcentrationThresholdPercent(normalizedConcentrationThresholdPercent);
      toast(t("settings.rebalanceSaved"), "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("settings.failedSaveRebalance");
      toast(msg, "error");
    } finally {
      setRebalanceSaving(false);
    }
  };

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
    vault.tokenGroups.length +
    vault.tokenCategories.length;
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
  };

  const handleExportVaultBackup = () => {
    try {
      const backupJson = JSON.stringify(vault, null, 2);
      const blob = new Blob([backupJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `vault_backup_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast(t("settings.backupExported"), "success");
    } catch {
      toast(t("settings.backupExportFailed"), "error");
    }
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
      await verifyCurrentPassphrase(dangerPassphrase);

      if (dangerAction === "portfolio") {
        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          transactions: [],
          manualEntries: [],
          rebalanceTargets: [],
          rebalanceSessions: [],
          rebalanceLogs: [],
          portfolioSnapshots: [],
          tokenGroups: [],
          tokenCategories: [],
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
        clearEncKey();
        clearVaultStore();
        clearAuth();
        toast(t("settings.wipeAllSuccess"), "success");
      } else {
        const res = await apiFetch("/api/vault", { method: "DELETE" });
        if (!res.ok) {
          const payload = await res
            .json()
            .catch(() => ({ error: t("settings.wipeFailed") }));
          throw new Error(payload.error || t("settings.wipeFailed"));
        }
        clearEncKey();
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

  const passphrasesMatch = newPassphrase === confirmNewPassphrase;
  const passphraseLongEnough = newPassphrase.length >= 8;

  useEffect(() => {
    setSessionKeyPersistent(isEncKeyPersistent());
  }, []);

  const strategyFieldsCount = useMemo(() => {
    if (rebalanceStrategy === "dca-weighted") return 3;
    if (
      rebalanceStrategy === "calendar" ||
      rebalanceStrategy === "percent-of-portfolio" ||
      rebalanceStrategy === "risk-parity"
    ) {
      return 2;
    }
    return 1;
  }, [rebalanceStrategy]);

  const tradingFieldsCount = buyOnlyMode ? 6 : 5;
  const settingsSectionOptions = useMemo(
    () => [
      {
        value: "security" as const,
        label: t("settings.sectionSecurity"),
        description: t("settings.sessionSecurity"),
        count: 2,
      },
      {
        value: "strategy" as const,
        label: t("settings.sectionStrategy"),
        description: t("settings.rebalanceStrategy"),
        count: strategyFieldsCount,
      },
      {
        value: "risk" as const,
        label: t("settings.sectionRisk"),
        description: t("settings.concentrationThreshold"),
        count: 3,
      },
      {
        value: "trading" as const,
        label: t("settings.sectionTrading"),
        description: t("settings.minTradeSize"),
        count: tradingFieldsCount,
      },
      {
        value: "refresh" as const,
        label: t("settings.sectionRefresh"),
        description: t("settings.autoRefresh"),
        count: 1,
      },
      {
        value: "danger" as const,
        label: t("settings.sectionDanger"),
        description: t("settings.exportBackup"),
        count: 1,
      },
      {
        value: "about" as const,
        label: t("settings.sectionAbout"),
        description: t("settings.about"),
        count: 1,
      },
      {
        value: "all" as const,
        label: t("settings.sectionAll"),
        description: t("settings.subtitle"),
        count:
          2 +
          strategyFieldsCount +
          3 +
          tradingFieldsCount +
          1 +
          1 +
          1,
      },
    ],
    [strategyFieldsCount, t, tradingFieldsCount]
  );

  const showSecuritySection =
    activeSection === "all" || activeSection === "security";
  const showStrategySection =
    activeSection === "all" || activeSection === "strategy";
  const showRiskSection = activeSection === "all" || activeSection === "risk";
  const showTradingSection =
    activeSection === "all" || activeSection === "trading";
  const showRefreshSection =
    activeSection === "all" || activeSection === "refresh";
  const showDangerSection =
    activeSection === "all" || activeSection === "danger";
  const showAboutSection =
    activeSection === "all" || activeSection === "about";
  const showRebalanceSaveAction =
    activeSection === "all" ||
    activeSection === "strategy" ||
    activeSection === "risk" ||
    activeSection === "trading" ||
    activeSection === "refresh";
  const sessionModeText =
    sessionKeyPersistent === null
      ? t("common.loading")
      : sessionKeyPersistent
        ? t("settings.sessionModeRemembered")
        : t("settings.sessionModeSession");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settings.title")}
        description={t("settings.subtitle")}
        actions={
          showRebalanceSaveAction ? (
            <Button
              onClick={handleSaveRebalanceSettings}
              disabled={rebalanceSaving}
              size="sm"
            >
              <Save className="mr-2 h-4 w-4" />
              {rebalanceSaving
                ? t("common.saving")
                : t("settings.saveRebalanceSettings")}
            </Button>
          ) : undefined
        }
      />

      <Card className="p-4">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-text-primary">
              {t("settings.focusView")}
            </p>
            <p className="text-xs text-text-dim">
              {t("settings.subtitle")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            {settingsSectionOptions.map((section) => (
              <button
                key={section.value}
                type="button"
                onClick={() => setActiveSection(section.value)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition-colors",
                  activeSection === section.value
                    ? "border-accent bg-accent/10"
                    : "border-border-subtle bg-bg-card hover:bg-bg-hover"
                )}
                aria-pressed={activeSection === section.value}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-text-primary">
                    {section.label}
                  </span>
                  <span className="rounded-full bg-bg-muted px-2 py-0.5 text-xs text-text-tertiary">
                    {section.count}
                  </span>
                </div>
                <p className="mt-1 text-xs text-text-dim">
                  {section.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {showSecuritySection && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t("settings.changePassword")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="max-w-xl space-y-4">
                <FormField
                  label={t("settings.currentPassword")}
                  htmlFor="settings-current-passphrase"
                  required
                  requiredLabel={requiredLabel}
                >
                  <Input
                    id="settings-current-passphrase"
                    type="password"
                    value={currentPassphrase}
                    onChange={(e) => setCurrentPassphrase(e.target.value)}
                    placeholder={t("settings.currentPasswordPlaceholder")}
                  />
                </FormField>
                <FormField
                  label={t("settings.newPassword")}
                  htmlFor="settings-new-passphrase"
                  required
                  requiredLabel={requiredLabel}
                  error={
                    newPassphrase.length > 0 && !passphraseLongEnough
                      ? t("settings.passwordMinLength")
                      : undefined
                  }
                >
                  <Input
                    id="settings-new-passphrase"
                    type="password"
                    value={newPassphrase}
                    onChange={(e) => setNewPassphrase(e.target.value)}
                    placeholder={t("settings.newPasswordPlaceholder")}
                  />
                </FormField>
                <FormField
                  label={t("settings.confirmNewPassword")}
                  htmlFor="settings-confirm-passphrase"
                  required
                  requiredLabel={requiredLabel}
                  error={
                    confirmNewPassphrase.length > 0 && !passphrasesMatch
                      ? t("settings.passwordsDoNotMatch")
                      : undefined
                  }
                >
                  <Input
                    id="settings-confirm-passphrase"
                    type="password"
                    value={confirmNewPassphrase}
                    onChange={(e) => setConfirmNewPassphrase(e.target.value)}
                    placeholder={t("settings.confirmPasswordPlaceholder")}
                  />
                </FormField>
                <Button
                  onClick={handlePassphraseChange}
                  disabled={
                    passphraseChanging ||
                    !passphrasesMatch ||
                    !passphraseLongEnough ||
                    currentPassphrase.length === 0
                  }
                >
                  {passphraseChanging
                    ? t("settings.changingPassword")
                    : t("settings.changePassword")}
                </Button>

                {passphraseError && (
                  <p className="text-sm text-status-negative">{passphraseError}</p>
                )}
                {passphraseSuccess && (
                  <p className="text-sm text-status-positive">
                    {t("settings.passwordChanged")}
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-border-subtle bg-bg-card p-4">
                  <p className="text-sm font-medium text-text-primary">
                    {t("settings.sessionSecurity")}
                  </p>
                  <p className="mt-2 text-sm text-text-subtle">
                    {t("settings.sessionModeLabel")}{" "}
                    <span className="font-medium text-text-primary">
                      {sessionModeText}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-text-dim">
                    {t("settings.sessionSecurityDesc")}
                  </p>
                </div>

                <div className="rounded-lg border border-status-warning-border bg-status-warning-soft p-4">
                  <p className="text-sm font-medium text-text-primary">
                    {t("settings.rememberDevice")}
                  </p>
                  <p className="mt-1 text-xs text-text-dim">
                    {t("settings.rememberDeviceDesc")}
                  </p>
                  <p className="mt-2 text-xs text-status-warning">
                    {t("settings.rememberDeviceRisk")}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {(showStrategySection ||
        showRiskSection ||
        showTradingSection ||
        showRefreshSection) && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {showStrategySection && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scale className="h-5 w-5" />
                  {t("settings.sectionStrategy")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-text-subtle">
                  {t("settings.rebalanceDesc")}
                </p>

                <FormField
                  label={t("settings.rebalanceStrategy")}
                  htmlFor="settings-rebalance-strategy"
                  hint={
                    <>
                      {rebalanceStrategy === "threshold" &&
                        t("settings.thresholdDesc")}
                      {rebalanceStrategy === "calendar" &&
                        t("settings.calendarDesc")}
                      {rebalanceStrategy === "percent-of-portfolio" &&
                        t("settings.percentDesc")}
                      {rebalanceStrategy === "risk-parity" &&
                        t("settings.riskParityDesc")}
                      {rebalanceStrategy === "dca-weighted" &&
                        t("settings.dcaDesc")}
                    </>
                  }
                >
                  <Select
                    id="settings-rebalance-strategy"
                    value={rebalanceStrategy}
                    onChange={(e) => setRebalanceStrategy(e.target.value)}
                    className="w-full max-w-sm"
                  >
                    <option value="threshold">
                      {t("settings.thresholdBased")}
                    </option>
                    <option value="calendar">
                      {t("settings.calendarBased")}
                    </option>
                    <option value="percent-of-portfolio">
                      {t("settings.percentOfPortfolio")}
                    </option>
                    <option value="risk-parity">
                      {t("settings.riskParity")}
                    </option>
                    <option value="dca-weighted">
                      {t("settings.dcaWeighted")}
                    </option>
                  </Select>
                </FormField>

                {rebalanceStrategy === "calendar" && (
                  <FormField
                    label={t("settings.rebalanceInterval")}
                    htmlFor="settings-rebalance-interval"
                    hint={t("settings.intervalDesc")}
                  >
                    <Select
                      id="settings-rebalance-interval"
                      value={rebalanceInterval}
                      onChange={(e) => setRebalanceInterval(e.target.value)}
                      className="w-full max-w-xs"
                    >
                      <option value="weekly">{t("settings.weekly")}</option>
                      <option value="monthly">{t("settings.monthly")}</option>
                      <option value="quarterly">{t("settings.quarterly")}</option>
                    </Select>
                  </FormField>
                )}

                {rebalanceStrategy === "percent-of-portfolio" && (
                  <FormField
                    label={t("settings.portfolioChangeThreshold")}
                    htmlFor="settings-portfolio-change-threshold"
                    hint={t("settings.portfolioChangeDesc")}
                  >
                    <Input
                      id="settings-portfolio-change-threshold"
                      type="number"
                      min={0.5}
                      max={50}
                      step={0.5}
                      value={portfolioChangeThreshold}
                      onChange={(e) =>
                        setPortfolioChangeThreshold(e.target.value)
                      }
                      placeholder="5"
                      className="w-full max-w-[8rem]"
                    />
                  </FormField>
                )}

                {rebalanceStrategy === "risk-parity" && (
                  <FormField
                    label={t("settings.riskParityLookbackDays")}
                    htmlFor="settings-risk-parity-lookback"
                    hint={t("settings.riskParityLookbackDesc")}
                  >
                    <Input
                      id="settings-risk-parity-lookback"
                      type="number"
                      min={7}
                      max={365}
                      step={1}
                      value={riskParityLookbackDays}
                      onChange={(e) =>
                        setRiskParityLookbackDays(e.target.value)
                      }
                      placeholder="30"
                      className="w-full max-w-[8rem]"
                    />
                  </FormField>
                )}

                {rebalanceStrategy === "dca-weighted" && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      label={t("settings.numberOfChunks")}
                      htmlFor="settings-dca-split-count"
                    >
                      <Input
                        id="settings-dca-split-count"
                        type="number"
                        min={2}
                        max={20}
                        step={1}
                        value={dcaSplitCount}
                        onChange={(e) => setDcaSplitCount(e.target.value)}
                        placeholder="4"
                        className="w-full max-w-[8rem]"
                      />
                    </FormField>
                    <FormField
                      label={t("settings.daysBetweenChunks")}
                      htmlFor="settings-dca-interval-days"
                    >
                      <Input
                        id="settings-dca-interval-days"
                        type="number"
                        min={1}
                        max={30}
                        step={1}
                        value={dcaIntervalDays}
                        onChange={(e) => setDcaIntervalDays(e.target.value)}
                        placeholder="7"
                        className="w-full max-w-[8rem]"
                      />
                    </FormField>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {showRiskSection && (
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.sectionRisk")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    label={t("settings.holdZone")}
                    htmlFor="settings-hold-zone"
                    hint={t("settings.holdZoneDesc")}
                  >
                    <Input
                      id="settings-hold-zone"
                      type="number"
                      min={0}
                      max={50}
                      step={0.5}
                      value={holdZonePercent}
                      onChange={(e) => setHoldZonePercent(e.target.value)}
                      placeholder="5"
                      className="w-full max-w-[8rem]"
                    />
                  </FormField>

                  <FormField
                    label={t("settings.concentrationThreshold")}
                    htmlFor="settings-concentration-threshold"
                    hint={t("settings.concentrationThresholdDesc")}
                  >
                    <Input
                      id="settings-concentration-threshold"
                      type="number"
                      min={MIN_CONCENTRATION_ALERT_THRESHOLD_PERCENT}
                      max={MAX_CONCENTRATION_ALERT_THRESHOLD_PERCENT}
                      step={1}
                      value={concentrationThresholdPercent}
                      onChange={(e) =>
                        setConcentrationThresholdPercent(e.target.value)
                      }
                      placeholder={CONCENTRATION_ALERT_THRESHOLD_PERCENT.toString()}
                      className="w-full max-w-[8rem]"
                    />
                  </FormField>
                </div>

                <label className="flex items-start gap-3 rounded-lg border border-border-subtle bg-bg-card p-4">
                  <input
                    type="checkbox"
                    checked={excludeStablecoinsFromConcentration}
                    onChange={(e) =>
                      setExcludeStablecoinsFromConcentration(e.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 rounded border-border bg-bg-muted text-accent focus:ring-focus-ring"
                  />
                  <span>
                    <span className="text-sm font-medium text-text-primary">
                      {t("settings.excludeStableConcentration")}
                    </span>
                    <p className="mt-1 text-xs text-text-dim">
                      {t("settings.excludeStableConcentrationDesc")}
                    </p>
                  </span>
                </label>
              </CardContent>
            </Card>
          )}

          {showTradingSection && (
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.sectionTrading")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  label={t("settings.minTradeSize")}
                  htmlFor="settings-min-trade-size"
                  hint={t("settings.minTradeDesc")}
                >
                  <Input
                    id="settings-min-trade-size"
                    type="number"
                    min={0}
                    step={10}
                    value={minTradeUsd}
                    onChange={(e) => setMinTradeUsd(e.target.value)}
                    placeholder="50"
                    className="w-full max-w-[8rem]"
                  />
                </FormField>

                <label className="flex items-start gap-3 rounded-lg border border-border-subtle bg-bg-card p-4">
                  <input
                    type="checkbox"
                    checked={buyOnlyMode}
                    onChange={(e) => setBuyOnlyMode(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border bg-bg-muted text-accent focus:ring-focus-ring"
                  />
                  <span>
                    <span className="text-sm font-medium text-text-primary">
                      {t("settings.buyOnlyMode")}
                    </span>
                    <p className="mt-1 text-xs text-text-dim">
                      {t("settings.buyOnlyDesc")}
                    </p>
                  </span>
                </label>

                {buyOnlyMode && (
                  <FormField
                    label={t("settings.newCashToDeploy")}
                    htmlFor="settings-new-cash"
                    hint={t("settings.newCashDesc")}
                  >
                    <Input
                      id="settings-new-cash"
                      type="number"
                      min={0}
                      step={100}
                      value={newCashUsd}
                      onChange={(e) => setNewCashUsd(e.target.value)}
                      placeholder="0"
                      className="w-full max-w-[8rem]"
                    />
                  </FormField>
                )}

                <div className="rounded-lg border border-border-subtle bg-bg-card p-4">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {t("settings.cashReserve")}
                      </p>
                      <p className="mt-1 text-xs text-text-dim">
                        {t("settings.cashReserveDesc")}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField
                        label={t("settings.fixedAmount")}
                        htmlFor="settings-cash-reserve-usd"
                      >
                        <Input
                          id="settings-cash-reserve-usd"
                          type="number"
                          min={0}
                          step={100}
                          value={cashReserveUsd}
                          onChange={(e) => setCashReserveUsd(e.target.value)}
                          placeholder="0"
                          className="w-full max-w-[8rem]"
                        />
                      </FormField>
                      <FormField
                        label={t("settings.percentage")}
                        htmlFor="settings-cash-reserve-percent"
                      >
                        <Input
                          id="settings-cash-reserve-percent"
                          type="number"
                          min={0}
                          max={50}
                          step={1}
                          value={cashReservePercent}
                          onChange={(e) =>
                            setCashReservePercent(e.target.value)
                          }
                          placeholder="0"
                          className="w-full max-w-[8rem]"
                        />
                      </FormField>
                    </div>
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={treatStablecoinsAsCashReserve}
                        onChange={(e) =>
                          setTreatStablecoinsAsCashReserve(e.target.checked)
                        }
                        className="mt-0.5 h-4 w-4 rounded border-border bg-bg-muted text-accent focus:ring-focus-ring"
                      />
                      <span>
                        <span className="text-sm font-medium text-text-primary">
                          {t("settings.treatStableAsCashReserve")}
                        </span>
                        <p className="mt-1 text-xs text-text-dim">
                          {t("settings.treatStableAsCashReserveDesc")}
                        </p>
                      </span>
                    </label>
                  </div>
                </div>

                <FormField
                  label={t("settings.dustThreshold")}
                  htmlFor="settings-dust-threshold"
                  hint={t("settings.dustDesc")}
                >
                  <Input
                    id="settings-dust-threshold"
                    type="number"
                    min={0}
                    step={0.5}
                    value={dustThresholdUsd}
                    onChange={(e) => setDustThresholdUsd(e.target.value)}
                    placeholder="1"
                    className="w-full max-w-[8rem]"
                  />
                </FormField>

                <div className="rounded-lg border border-border-subtle bg-bg-card p-4">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {t("settings.slippageFees")}
                      </p>
                      <p className="mt-1 text-xs text-text-dim">
                        {t("settings.slippageFeesDesc")}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <FormField
                        label={t("settings.slippage")}
                        htmlFor="settings-slippage"
                      >
                        <Input
                          id="settings-slippage"
                          type="number"
                          min={0}
                          max={10}
                          step={0.1}
                          value={slippagePercent}
                          onChange={(e) => setSlippagePercent(e.target.value)}
                          placeholder="0.5"
                          className="w-full max-w-[8rem]"
                        />
                      </FormField>
                      <FormField
                        label={t("settings.tradingFee")}
                        htmlFor="settings-trading-fee"
                      >
                        <Input
                          id="settings-trading-fee"
                          type="number"
                          min={0}
                          max={10}
                          step={0.1}
                          value={tradingFeePercent}
                          onChange={(e) =>
                            setTradingFeePercent(e.target.value)
                          }
                          placeholder="0.1"
                          className="w-full max-w-[8rem]"
                        />
                      </FormField>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {showRefreshSection && (
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.sectionRefresh")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  label={t("settings.autoRefresh")}
                  htmlFor="settings-auto-refresh"
                  hint={t("settings.autoRefreshDesc")}
                >
                  <Input
                    id="settings-auto-refresh"
                    type="number"
                    min={0}
                    max={60}
                    step={1}
                    value={autoRefreshMinutes}
                    onChange={(e) => setAutoRefreshMinutes(e.target.value)}
                    placeholder="15"
                    className="w-full max-w-[8rem]"
                  />
                </FormField>

                <div className="rounded-lg border border-border-subtle bg-bg-card p-4">
                  <p className="text-sm font-medium text-text-primary">
                    {t("settings.rebalanceSettings")}
                  </p>
                  <p className="mt-1 text-xs text-text-dim">
                    {t("settings.rebalanceDesc")}
                  </p>
                </div>

                <Button
                  onClick={handleSaveRebalanceSettings}
                  disabled={rebalanceSaving}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {rebalanceSaving
                    ? t("common.saving")
                    : t("settings.saveRebalanceSettings")}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {showDangerSection && (
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

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportVaultBackup}
              >
                {t("settings.exportBackup")}
              </Button>

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
      )}

      {showAboutSection && (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.about")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-text-subtle">
              <p>
                <strong className="text-text-primary">
                  {t("settings.aboutDesc1")}
                </strong>
              </p>
              <p>{t("settings.aboutDesc2")}</p>
              <p>{t("settings.aboutDesc3")}</p>
              <p className="pt-2 text-xs text-text-dim">
                {t("settings.version")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
