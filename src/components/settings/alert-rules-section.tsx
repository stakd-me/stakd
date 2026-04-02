"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { useVaultStore } from "@/lib/store";
import { saveVaultToServer } from "@/lib/services/vault-sync";
import { Bell, Plus, Trash2, Save } from "lucide-react";
import {
  type AlertRule,
  type AlertRuleType,
  ALERT_RULE_TYPE_ICONS,
  PHASE_RESERVE_MAP,
  parseAlertRules,
  serializeAlertRules,
} from "@/lib/alert-rules";
import { cn } from "@/lib/utils";

interface AlertRulesSectionProps {
  holdingSymbols?: string[]; // uppercase symbols of current holdings
}

export function AlertRulesSection({ holdingSymbols = [] }: AlertRulesSectionProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const vault = useVaultStore((s) => s.vault);

  const [rules, setRules] = useState<AlertRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load from vault
  useEffect(() => {
    setRules(parseAlertRules(vault.settings.alertRules));
  }, [vault.settings.alertRules]);

  const updateRule = useCallback((id: string, patch: Partial<AlertRule>) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } as AlertRule : r))
    );
    setDirty(true);
  }, []);

  const removeRule = useCallback((id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
    setDirty(true);
  }, []);

  const addRule = useCallback((type: AlertRuleType) => {
    const id = crypto.randomUUID();
    let newRule: AlertRule;

    switch (type) {
      case "take-profit":
        newRule = { id, type, enabled: true, asset: "", thresholdPercent: 100 };
        break;
      case "buy-on-fear":
        newRule = { id, type, enabled: true, thresholdValue: 25 };
        break;
      case "stablecoin-reserve":
        newRule = { id, type, enabled: true };
        break;
    }

    setRules((prev) => [...prev, newRule]);
    setDirty(true);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      useVaultStore.getState().updateVault((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          alertRules: serializeAlertRules(rules),
        },
      }));
      await saveVaultToServer();
      setDirty(false);
      toast(t("alertRules.saved"), "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : t("alertRules.saveFailed"),
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  const hasStablecoinReserve = rules.some((r) => r.type === "stablecoin-reserve");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {t("alertRules.title")}
          </CardTitle>
          <div className="flex items-center gap-2">
            {dirty && (
              <Button onClick={handleSave} disabled={saving} size="sm">
                <Save className="mr-2 h-4 w-4" />
                {saving ? t("common.saving") : t("common.save")}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-text-subtle">{t("alertRules.description")}</p>

        {/* Existing rules */}
        {rules.length === 0 && (
          <p className="py-4 text-center text-sm text-text-dim">
            {t("alertRules.noRules")}
          </p>
        )}

        {rules.map((rule) => {
          const Icon = ALERT_RULE_TYPE_ICONS[rule.type];
          return (
            <div
              key={rule.id}
              className={cn(
                "rounded-lg border border-border-subtle bg-bg-input p-4",
                !rule.enabled && "opacity-50"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-text-subtle" />
                  <span className="text-sm font-medium text-text-primary">
                    {t(`alertRules.type.${rule.type}`)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-text-subtle">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(e) =>
                        updateRule(rule.id, { enabled: e.target.checked })
                      }
                      className="rounded"
                    />
                    {t("alertRules.enabled")}
                  </label>
                  <button
                    type="button"
                    onClick={() => removeRule(rule.id)}
                    className="rounded p-1 text-text-dim hover:bg-bg-hover hover:text-status-negative"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-3">
                {rule.type === "take-profit" && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <FormField
                      label={t("alertRules.asset")}
                      htmlFor={`rule-asset-${rule.id}`}
                      hint={
                        rule.asset &&
                        holdingSymbols.length > 0 &&
                        !holdingSymbols.includes(rule.asset.toUpperCase())
                          ? t("alertRules.assetNotInHoldings")
                          : undefined
                      }
                      className="flex-1"
                    >
                      <Input
                        id={`rule-asset-${rule.id}`}
                        value={rule.asset}
                        onChange={(e) =>
                          updateRule(rule.id, {
                            asset: e.target.value.toUpperCase(),
                          })
                        }
                        placeholder="BTC"
                        className="uppercase"
                      />
                    </FormField>
                    <FormField
                      label={t("alertRules.profitThreshold")}
                      htmlFor={`rule-threshold-${rule.id}`}
                      hint={t("alertRules.profitThresholdHint")}
                      className="flex-1"
                    >
                      <div className="flex items-center gap-1">
                        <Input
                          id={`rule-threshold-${rule.id}`}
                          type="number"
                          min={1}
                          value={rule.thresholdPercent}
                          onChange={(e) =>
                            updateRule(rule.id, {
                              thresholdPercent: Number(e.target.value),
                            })
                          }
                        />
                        <span className="text-sm text-text-subtle">%</span>
                      </div>
                    </FormField>
                  </div>
                )}

                {rule.type === "buy-on-fear" && (
                  <FormField
                    label={t("alertRules.fearThreshold")}
                    htmlFor={`rule-fear-${rule.id}`}
                    hint={t("alertRules.fearThresholdHint")}
                    className="max-w-xs"
                  >
                    <div className="flex items-center gap-1">
                      <Input
                        id={`rule-fear-${rule.id}`}
                        type="number"
                        min={1}
                        max={100}
                        value={rule.thresholdValue}
                        onChange={(e) =>
                          updateRule(rule.id, {
                            thresholdValue: Number(e.target.value),
                          })
                        }
                      />
                      <span className="text-sm text-text-subtle">/ 100</span>
                    </div>
                  </FormField>
                )}

                {rule.type === "stablecoin-reserve" && (
                  <div className="text-xs text-text-subtle">
                    <p>{t("alertRules.reserveAutoDesc")}</p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {Object.entries(PHASE_RESERVE_MAP).map(([phase, pct]) => (
                        <span key={phase} className="rounded bg-bg-hover px-2 py-0.5">
                          {t(`marketSignal.phase.${phase}`)}: {pct}%
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Add rule buttons */}
        <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-4">
          <Button
            size="sm"
            variant="outline"
            onClick={() => addRule("take-profit")}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t("alertRules.addTakeProfit")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => addRule("buy-on-fear")}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t("alertRules.addBuyOnFear")}
          </Button>
          {!hasStablecoinReserve && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => addRule("stablecoin-reserve")}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t("alertRules.addStablecoinReserve")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
