"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { useVaultStore } from "@/lib/store";
import { saveVaultToServer } from "@/lib/services/vault-sync";
import {
  CONCENTRATION_ALERT_THRESHOLD_PERCENT,
  parseConcentrationAlertThresholdPercent,
} from "@/lib/constants/risk";

/**
 * Form state for the rebalance settings section.
 *
 * String fields hold the exact string persisted in `vault.settings`;
 * boolean fields are persisted as "1" / "0".
 */
export interface RebalanceSettingsForm {
  holdZonePercent: string;
  minTradeUsd: string;
  buyOnlyMode: boolean;
  newCashUsd: string;
  cashReserveUsd: string;
  cashReservePercent: string;
  dustThresholdUsd: string;
  slippagePercent: string;
  tradingFeePercent: string;
  autoRefreshMinutes: string;
  concentrationThresholdPercent: string;
  excludeStablecoinsFromConcentration: boolean;
  treatStablecoinsAsCashReserve: boolean;
  rebalanceStrategy: string;
  riskParityLookbackDays: string;
  rebalanceInterval: string;
  portfolioChangeThreshold: string;
  dcaSplitCount: string;
  dcaIntervalDays: string;
}

type StringFieldKey = {
  [K in keyof RebalanceSettingsForm]: RebalanceSettingsForm[K] extends string
    ? K
    : never;
}[keyof RebalanceSettingsForm];
type BooleanFieldKey = Exclude<keyof RebalanceSettingsForm, StringFieldKey>;

interface StringFieldConfig {
  key: StringFieldKey;
  kind: "string";
  defaultValue: string;
  /** Normalize the serialized value right before it is saved to the vault. */
  normalizeOnSave?: (value: string) => string;
  /** Include this key in the saved settings only when the predicate passes. */
  savedWhen?: (form: RebalanceSettingsForm) => boolean;
}

interface BooleanFieldConfig {
  key: BooleanFieldKey;
  kind: "boolean";
  defaultValue: boolean;
  savedWhen?: (form: RebalanceSettingsForm) => boolean;
}

export type RebalanceFieldConfig = StringFieldConfig | BooleanFieldConfig;

/**
 * Single source of truth for every rebalance setting stored in
 * `vault.settings`. Order matters: it is the insertion order of the keys
 * written back to the vault on save.
 *
 * The `key` values are the exact `vault.settings` keys — do not rename them,
 * existing vaults depend on them.
 */
export const REBALANCE_FIELD_CONFIG: readonly RebalanceFieldConfig[] = [
  { key: "holdZonePercent", kind: "string", defaultValue: "5" },
  { key: "minTradeUsd", kind: "string", defaultValue: "50" },
  { key: "buyOnlyMode", kind: "boolean", defaultValue: false },
  { key: "newCashUsd", kind: "string", defaultValue: "0" },
  { key: "cashReserveUsd", kind: "string", defaultValue: "0" },
  { key: "cashReservePercent", kind: "string", defaultValue: "0" },
  { key: "dustThresholdUsd", kind: "string", defaultValue: "1" },
  { key: "slippagePercent", kind: "string", defaultValue: "0.5" },
  { key: "tradingFeePercent", kind: "string", defaultValue: "0.1" },
  { key: "autoRefreshMinutes", kind: "string", defaultValue: "15" },
  {
    key: "concentrationThresholdPercent",
    kind: "string",
    defaultValue: CONCENTRATION_ALERT_THRESHOLD_PERCENT.toString(),
    normalizeOnSave: (value) =>
      parseConcentrationAlertThresholdPercent(value).toString(),
  },
  {
    key: "excludeStablecoinsFromConcentration",
    kind: "boolean",
    defaultValue: false,
  },
  { key: "treatStablecoinsAsCashReserve", kind: "boolean", defaultValue: false },
  { key: "rebalanceStrategy", kind: "string", defaultValue: "percent-of-portfolio" },
  { key: "riskParityLookbackDays", kind: "string", defaultValue: "30" },
  {
    key: "rebalanceInterval",
    kind: "string",
    defaultValue: "monthly",
    savedWhen: (form) => form.rebalanceStrategy === "calendar",
  },
  {
    key: "portfolioChangeThreshold",
    kind: "string",
    defaultValue: "5",
    savedWhen: (form) => form.rebalanceStrategy === "percent-of-portfolio",
  },
  {
    key: "dcaSplitCount",
    kind: "string",
    defaultValue: "4",
    savedWhen: (form) => form.rebalanceStrategy === "dca-weighted",
  },
  {
    key: "dcaIntervalDays",
    kind: "string",
    defaultValue: "7",
    savedWhen: (form) => form.rebalanceStrategy === "dca-weighted",
  },
];

export const REBALANCE_SETTING_KEYS: readonly (keyof RebalanceSettingsForm)[] =
  REBALANCE_FIELD_CONFIG.map((field) => field.key);

/** Settings keys from older app versions, removed from the vault on save. */
const DEPRECATED_REBALANCE_SETTING_KEYS = [
  "priceSourcePrimary",
  "driftThresholdPercent",
] as const;

export function createDefaultRebalanceSettingsForm(): RebalanceSettingsForm {
  const form: Partial<RebalanceSettingsForm> = {};
  for (const field of REBALANCE_FIELD_CONFIG) {
    if (field.kind === "boolean") {
      form[field.key] = field.defaultValue;
    } else {
      form[field.key] = field.defaultValue;
    }
  }
  return form as RebalanceSettingsForm;
}

export function hydrateRebalanceSettingsForm(
  prev: RebalanceSettingsForm,
  vaultSettings: Record<string, string>
): RebalanceSettingsForm {
  const next: RebalanceSettingsForm = { ...prev };
  for (const field of REBALANCE_FIELD_CONFIG) {
    const raw = vaultSettings[field.key];
    if (raw === undefined) continue;
    if (field.kind === "boolean") {
      next[field.key] = raw === "1";
    } else {
      next[field.key] = raw;
    }
  }
  return next;
}

export function serializeRebalanceSettingsForm(
  form: RebalanceSettingsForm
): Record<string, string> {
  const settings: Record<string, string> = {};
  for (const field of REBALANCE_FIELD_CONFIG) {
    if (field.savedWhen && !field.savedWhen(form)) continue;
    if (field.kind === "boolean") {
      settings[field.key] = form[field.key] ? "1" : "0";
    } else {
      const value = form[field.key];
      settings[field.key] = field.normalizeOnSave
        ? field.normalizeOnSave(value)
        : value;
    }
  }
  return settings;
}

export type SetRebalanceField = <K extends keyof RebalanceSettingsForm>(
  key: K,
  value: RebalanceSettingsForm[K]
) => void;

export function useRebalanceSettingsForm() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const vaultSettings = useVaultStore((s) => s.vault.settings);

  const [form, setForm] = useState<RebalanceSettingsForm>(
    createDefaultRebalanceSettingsForm
  );
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasHydratableSettings = REBALANCE_SETTING_KEYS.some(
    (key) => vaultSettings[key] !== undefined
  );

  // Load settings from vault on mount / when vault changes
  useEffect(() => {
    if (loaded || !hasHydratableSettings) return;
    setForm((prev) => hydrateRebalanceSettingsForm(prev, vaultSettings));
    setLoaded(true);
  }, [vaultSettings, loaded, hasHydratableSettings]);

  const setField: SetRebalanceField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const newSettings = serializeRebalanceSettingsForm(form);

      useVaultStore.getState().updateVault((prev) => {
        // Remove deprecated keys from older versions while saving.
        const cleanedSettings: Record<string, string> = { ...prev.settings };
        for (const key of DEPRECATED_REBALANCE_SETTING_KEYS) {
          delete cleanedSettings[key];
        }
        return { ...prev, settings: { ...cleanedSettings, ...newSettings } };
      });

      await saveVaultToServer();
      setField(
        "concentrationThresholdPercent",
        newSettings.concentrationThresholdPercent
      );
      toast(t("settings.rebalanceSaved"), "success");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : t("settings.failedSaveRebalance");
      toast(msg, "error");
    } finally {
      setSaving(false);
    }
  }, [form, setField, t, toast]);

  return { form, setField, save, saving };
}
