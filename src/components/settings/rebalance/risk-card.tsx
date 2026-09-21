"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/hooks/use-translation";
import {
  CONCENTRATION_ALERT_THRESHOLD_PERCENT,
  MAX_CONCENTRATION_ALERT_THRESHOLD_PERCENT,
  MIN_CONCENTRATION_ALERT_THRESHOLD_PERCENT,
} from "@/lib/constants/risk";
import type {
  RebalanceSettingsForm,
  SetRebalanceField,
} from "@/components/settings/rebalance-settings-form";

interface Props {
  form: RebalanceSettingsForm;
  setField: SetRebalanceField;
}

export function RiskCard({ form, setField }: Props) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-label uppercase">{t("settings.sectionRisk")}</CardTitle>
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
              value={form.holdZonePercent}
              onChange={(e) => setField("holdZonePercent", e.target.value)}
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
              value={form.concentrationThresholdPercent}
              onChange={(e) =>
                setField("concentrationThresholdPercent", e.target.value)
              }
              placeholder={CONCENTRATION_ALERT_THRESHOLD_PERCENT.toString()}
              className="w-full max-w-[8rem]"
            />
          </FormField>
        </div>

        <label className="flex items-start gap-3 border border-border-subtle bg-bg-inset p-4">
          <input
            type="checkbox"
            checked={form.excludeStablecoinsFromConcentration}
            onChange={(e) =>
              setField("excludeStablecoinsFromConcentration", e.target.checked)
            }
            className="mt-0.5 h-4 w-4 rounded-md border-border bg-bg-muted text-accent focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-card"
          />
          <span>
            <span className="text-body font-semibold text-text-primary">
              {t("settings.excludeStableConcentration")}
            </span>
            <p className="mt-1 text-caption text-text-muted">
              {t("settings.excludeStableConcentrationDesc")}
            </p>
          </span>
        </label>
      </CardContent>
    </Card>
  );
}
