"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Shield, Scale, TriangleAlert } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { useAuthStore, useVaultStore } from "@/lib/store";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
        <p className="text-text-subtle">{t("settings.subtitle")}</p>
      </div>

      {/* Change Passphrase */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("settings.changePassword")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-md space-y-4">
            <div>
              <label className="mb-1.5 block text-sm text-text-subtle">
                {t("settings.currentPassword")}
              </label>
              <Input
                type="password"
                value={currentPassphrase}
                onChange={(e) => setCurrentPassphrase(e.target.value)}
                placeholder={t("settings.currentPasswordPlaceholder")}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-text-subtle">
                {t("settings.newPassword")}
              </label>
              <Input
                type="password"
                value={newPassphrase}
                onChange={(e) => setNewPassphrase(e.target.value)}
                placeholder={t("settings.newPasswordPlaceholder")}
              />
              {newPassphrase.length > 0 && !passphraseLongEnough && (
                <p className="mt-1 text-xs text-status-negative">
                  {t("settings.passwordMinLength")}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-text-subtle">
                {t("settings.confirmNewPassword")}
              </label>
              <Input
                type="password"
                value={confirmNewPassphrase}
                onChange={(e) => setConfirmNewPassphrase(e.target.value)}
                placeholder={t("settings.confirmPasswordPlaceholder")}
              />
              {confirmNewPassphrase.length > 0 && !passphrasesMatch && (
                <p className="mt-1 text-xs text-status-negative">
                  {t("settings.passwordsDoNotMatch")}
                </p>
              )}
            </div>
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
              <p className="text-sm text-status-negative">
                {passphraseError}
              </p>
            )}
            {passphraseSuccess && (
              <p className="text-sm text-status-positive">
                {t("settings.passwordChanged")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Rebalance Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            {t("settings.rebalanceSettings")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-md space-y-4">
            <p className="text-sm text-text-subtle">
              {t("settings.rebalanceDesc")}
            </p>

            {/* Strategy Selector */}
            <div className="border-b border-border pb-4">
              <label className="mb-1.5 block text-sm text-text-subtle">
                {t("settings.rebalanceStrategy")}
              </label>
              <select
                value={rebalanceStrategy}
                onChange={(e) => setRebalanceStrategy(e.target.value)}
                className="w-64 rounded-md border border-border bg-bg-input px-3 py-2 text-sm text-text-primary"
              >
                <option value="threshold">{t("settings.thresholdBased")}</option>
                <option value="calendar">{t("settings.calendarBased")}</option>
                <option value="percent-of-portfolio">{t("settings.percentOfPortfolio")}</option>
                <option value="risk-parity">{t("settings.riskParity")}</option>
                <option value="dca-weighted">{t("settings.dcaWeighted")}</option>
              </select>
              <p className="mt-1 text-xs text-text-dim">
                {rebalanceStrategy === "threshold" && t("settings.thresholdDesc")}
                {rebalanceStrategy === "calendar" && t("settings.calendarDesc")}
                {rebalanceStrategy === "percent-of-portfolio" && t("settings.percentDesc")}
                {rebalanceStrategy === "risk-parity" && t("settings.riskParityDesc")}
                {rebalanceStrategy === "dca-weighted" && t("settings.dcaDesc")}
              </p>

              {/* Calendar-specific settings */}
              {rebalanceStrategy === "calendar" && (
                <div className="mt-3">
                  <label className="mb-1.5 block text-sm text-text-subtle">
                    {t("settings.rebalanceInterval")}
                  </label>
                  <select
                    value={rebalanceInterval}
                    onChange={(e) => setRebalanceInterval(e.target.value)}
                    className="w-48 rounded-md border border-border bg-bg-input px-3 py-2 text-sm text-text-primary"
                  >
                    <option value="weekly">{t("settings.weekly")}</option>
                    <option value="monthly">{t("settings.monthly")}</option>
                    <option value="quarterly">{t("settings.quarterly")}</option>
                  </select>
                  <p className="mt-1 text-xs text-text-dim">
                    {t("settings.intervalDesc")}
                  </p>
                </div>
              )}

              {/* Percent-of-Portfolio settings */}
              {rebalanceStrategy === "percent-of-portfolio" && (
                <div className="mt-3">
                  <label className="mb-1.5 block text-sm text-text-subtle">
                    {t("settings.portfolioChangeThreshold")}
                  </label>
                  <Input
                    type="number"
                    min={0.5}
                    max={50}
                    step={0.5}
                    value={portfolioChangeThreshold}
                    onChange={(e) => setPortfolioChangeThreshold(e.target.value)}
                    placeholder="5"
                    className="w-32"
                  />
                  <p className="mt-1 text-xs text-text-dim">
                    {t("settings.portfolioChangeDesc")}
                  </p>
                </div>
              )}

              {/* Risk-Parity settings */}
              {rebalanceStrategy === "risk-parity" && (
                <div className="mt-3">
                  <label className="mb-1.5 block text-sm text-text-subtle">
                    {t("settings.riskParityLookbackDays")}
                  </label>
                  <Input
                    type="number"
                    min={7}
                    max={365}
                    step={1}
                    value={riskParityLookbackDays}
                    onChange={(e) => setRiskParityLookbackDays(e.target.value)}
                    placeholder="30"
                    className="w-32"
                  />
                  <p className="mt-1 text-xs text-text-dim">
                    {t("settings.riskParityLookbackDesc")}
                  </p>
                </div>
              )}

              {/* DCA-Weighted settings */}
              {rebalanceStrategy === "dca-weighted" && (
                <div className="mt-3 flex gap-4">
                  <div>
                    <label className="mb-1.5 block text-sm text-text-subtle">
                      {t("settings.numberOfChunks")}
                    </label>
                    <Input
                      type="number"
                      min={2}
                      max={20}
                      step={1}
                      value={dcaSplitCount}
                      onChange={(e) => setDcaSplitCount(e.target.value)}
                      placeholder="4"
                      className="w-32"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm text-text-subtle">
                      {t("settings.daysBetweenChunks")}
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      step={1}
                      value={dcaIntervalDays}
                      onChange={(e) => setDcaIntervalDays(e.target.value)}
                      placeholder="7"
                      className="w-32"
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-text-subtle">
                {t("settings.holdZone")}
              </label>
              <Input
                type="number"
                min={0}
                max={50}
                step={0.5}
                value={holdZonePercent}
                onChange={(e) => setHoldZonePercent(e.target.value)}
                placeholder="5"
                className="w-32"
              />
              <p className="mt-1 text-xs text-text-dim">
                {t("settings.holdZoneDesc")}
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-text-subtle">
                {t("settings.concentrationThreshold")}
              </label>
              <Input
                type="number"
                min={MIN_CONCENTRATION_ALERT_THRESHOLD_PERCENT}
                max={MAX_CONCENTRATION_ALERT_THRESHOLD_PERCENT}
                step={1}
                value={concentrationThresholdPercent}
                onChange={(e) => setConcentrationThresholdPercent(e.target.value)}
                placeholder={CONCENTRATION_ALERT_THRESHOLD_PERCENT.toString()}
                className="w-32"
              />
              <p className="mt-1 text-xs text-text-dim">
                {t("settings.concentrationThresholdDesc")}
              </p>
              <label className="mt-3 flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={excludeStablecoinsFromConcentration}
                  onChange={(e) =>
                    setExcludeStablecoinsFromConcentration(e.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 rounded border-border bg-bg-muted text-accent focus:ring-focus-ring"
                />
                <span>
                  <span className="text-sm text-text-muted">
                    {t("settings.excludeStableConcentration")}
                  </span>
                  <p className="text-xs text-text-dim">
                    {t("settings.excludeStableConcentrationDesc")}
                  </p>
                </span>
              </label>
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-text-subtle">
                {t("settings.minTradeSize")}
              </label>
              <Input
                type="number"
                min={0}
                step={10}
                value={minTradeUsd}
                onChange={(e) => setMinTradeUsd(e.target.value)}
                placeholder="50"
                className="w-32"
              />
              <p className="mt-1 text-xs text-text-dim">
                {t("settings.minTradeDesc")}
              </p>
            </div>

            {/* Buy-Only Mode */}
            <div className="border-t border-border pt-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={buyOnlyMode}
                  onChange={(e) => setBuyOnlyMode(e.target.checked)}
                  className="h-4 w-4 rounded border-border bg-bg-muted text-accent focus:ring-focus-ring"
                />
                <span className="text-sm text-text-muted">{t("settings.buyOnlyMode")}</span>
              </label>
              <p className="mt-1 text-xs text-text-dim">
                {t("settings.buyOnlyDesc")}
              </p>
              {buyOnlyMode && (
                <div className="mt-3">
                  <label className="mb-1.5 block text-sm text-text-subtle">
                    {t("settings.newCashToDeploy")}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={100}
                    value={newCashUsd}
                    onChange={(e) => setNewCashUsd(e.target.value)}
                    placeholder="0"
                    className="w-32"
                  />
                  <p className="mt-1 text-xs text-text-dim">
                    {t("settings.newCashDesc")}
                  </p>
                </div>
              )}
            </div>

            {/* Cash Reserve */}
            <div className="border-t border-border pt-4">
              <h4 className="mb-2 text-sm font-medium text-text-muted">{t("settings.cashReserve")}</h4>
              <p className="mb-3 text-xs text-text-dim">
                {t("settings.cashReserveDesc")}
              </p>
              <div className="flex gap-4">
                <div>
                  <label className="mb-1.5 block text-sm text-text-subtle">
                    {t("settings.fixedAmount")}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={100}
                    value={cashReserveUsd}
                    onChange={(e) => setCashReserveUsd(e.target.value)}
                    placeholder="0"
                    className="w-32"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-text-subtle">
                    {t("settings.percentage")}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    step={1}
                    value={cashReservePercent}
                    onChange={(e) => setCashReservePercent(e.target.value)}
                    placeholder="0"
                    className="w-32"
                  />
                </div>
              </div>
              <label className="mt-3 flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={treatStablecoinsAsCashReserve}
                  onChange={(e) =>
                    setTreatStablecoinsAsCashReserve(e.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 rounded border-border bg-bg-muted text-accent focus:ring-focus-ring"
                />
                <span>
                  <span className="text-sm text-text-muted">
                    {t("settings.treatStableAsCashReserve")}
                  </span>
                  <p className="text-xs text-text-dim">
                    {t("settings.treatStableAsCashReserveDesc")}
                  </p>
                </span>
              </label>
            </div>

            {/* Dust Threshold */}
            <div className="border-t border-border pt-4">
              <label className="mb-1.5 block text-sm text-text-subtle">
                {t("settings.dustThreshold")}
              </label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={dustThresholdUsd}
                onChange={(e) => setDustThresholdUsd(e.target.value)}
                placeholder="1"
                className="w-32"
              />
              <p className="mt-1 text-xs text-text-dim">
                {t("settings.dustDesc")}
              </p>
            </div>

            {/* Slippage & Fees */}
            <div className="border-t border-border pt-4">
              <h4 className="mb-2 text-sm font-medium text-text-muted">{t("settings.slippageFees")}</h4>
              <p className="mb-3 text-xs text-text-dim">
                {t("settings.slippageFeesDesc")}
              </p>
              <div className="flex gap-4">
                <div>
                  <label className="mb-1.5 block text-sm text-text-subtle">
                    {t("settings.slippage")}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={slippagePercent}
                    onChange={(e) => setSlippagePercent(e.target.value)}
                    placeholder="0.5"
                    className="w-32"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-text-subtle">
                    {t("settings.tradingFee")}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={tradingFeePercent}
                    onChange={(e) => setTradingFeePercent(e.target.value)}
                    placeholder="0.1"
                    className="w-32"
                  />
                </div>
              </div>
            </div>

            {/* Monitoring */}
            <div className="border-t border-border pt-4">
              <label className="mb-1.5 block text-sm text-text-subtle">
                {t("settings.autoRefresh")}
              </label>
              <Input
                type="number"
                min={0}
                max={60}
                step={1}
                value={autoRefreshMinutes}
                onChange={(e) => setAutoRefreshMinutes(e.target.value)}
                placeholder="15"
                className="w-32"
              />
              <p className="mt-1 text-xs text-text-dim">
                {t("settings.autoRefreshDesc")}
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
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-status-negative-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-status-negative">
            <TriangleAlert className="h-5 w-5" />
            {t("settings.dangerZone")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-w-md space-y-4">
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

            <div>
              <label className="mb-1.5 block text-sm text-text-subtle">
                {t("settings.dangerAction")}
              </label>
              <select
                value={dangerAction}
                onChange={(e) => setDangerAction(e.target.value as DangerAction)}
                className="w-full rounded-md border border-border bg-bg-input px-3 py-2 text-sm text-text-primary"
              >
                <option value="portfolio">{t("settings.dangerActionPortfolio")}</option>
                <option value="settings">{t("settings.dangerActionSettings")}</option>
                <option value="all">{t("settings.dangerActionAll")}</option>
                <option value="account">{t("settings.dangerActionAccount")}</option>
              </select>
              <p className="mt-1 text-xs text-text-dim">
                {dangerAction === "portfolio" && t("settings.dangerActionDescPortfolio")}
                {dangerAction === "settings" && t("settings.dangerActionDescSettings")}
                {dangerAction === "all" && t("settings.dangerActionDescAll")}
                {dangerAction === "account" && t("settings.dangerActionDescAccount")}
              </p>
              <p className="mt-1 text-xs text-status-warning">
                {t("settings.recordsToDelete", { count: selectedDangerCount })}
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-text-subtle">
                {t("settings.currentPassword")}
              </label>
              <Input
                type="password"
                value={dangerPassphrase}
                onChange={(e) => setDangerPassphrase(e.target.value)}
                placeholder={t("settings.currentPasswordPlaceholder")}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-text-subtle">
                {t("settings.confirmKeyword")}
              </label>
              <Input
                value={dangerKeyword}
                onChange={(e) => setDangerKeyword(e.target.value)}
                placeholder={t("settings.confirmKeywordPlaceholder")}
                autoComplete="off"
              />
            </div>

            {dangerCountdown > 0 && (
              <p className="text-xs text-status-warning">
                {t("settings.waitBeforeDelete", { seconds: dangerCountdown })}
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
              {dangerRunning ? t("settings.deletingData") : t("settings.executeDelete")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.about")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-text-subtle">
            <p>
              <strong className="text-text-primary">{t("settings.aboutDesc1")}</strong>
            </p>
            <p>
              {t("settings.aboutDesc2")}
            </p>
            <p>
              {t("settings.aboutDesc3")}
            </p>
            <p className="pt-2 text-xs text-text-dim">
              {t("settings.version")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
