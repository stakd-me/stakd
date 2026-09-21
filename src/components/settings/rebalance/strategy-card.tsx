"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Scale } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import type {
  RebalanceSettingsForm,
  SetRebalanceField,
} from "@/components/settings/rebalance-settings-form";

interface Props {
  form: RebalanceSettingsForm;
  setField: SetRebalanceField;
}

export function StrategyCard({ form, setField }: Props) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-label uppercase">
          <Scale className="h-4 w-4" aria-hidden="true" />
          {t("settings.sectionStrategy")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-body text-text-secondary">
          {t("settings.rebalanceDesc")}
        </p>

        <FormField
          label={t("settings.rebalanceStrategy")}
          htmlFor="settings-rebalance-strategy"
          hint={
            <>
              {form.rebalanceStrategy === "threshold" &&
                t("settings.thresholdDesc")}
              {form.rebalanceStrategy === "calendar" &&
                t("settings.calendarDesc")}
              {form.rebalanceStrategy === "percent-of-portfolio" &&
                t("settings.percentDesc")}
              {form.rebalanceStrategy === "risk-parity" &&
                t("settings.riskParityDesc")}
              {form.rebalanceStrategy === "dca-weighted" &&
                t("settings.dcaDesc")}
            </>
          }
        >
          <Select
            id="settings-rebalance-strategy"
            value={form.rebalanceStrategy}
            onChange={(e) => setField("rebalanceStrategy", e.target.value)}
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

        {form.rebalanceStrategy === "calendar" && (
          <FormField
            label={t("settings.rebalanceInterval")}
            htmlFor="settings-rebalance-interval"
            hint={t("settings.intervalDesc")}
          >
            <Select
              id="settings-rebalance-interval"
              value={form.rebalanceInterval}
              onChange={(e) => setField("rebalanceInterval", e.target.value)}
              className="w-full max-w-xs"
            >
              <option value="weekly">{t("settings.weekly")}</option>
              <option value="monthly">{t("settings.monthly")}</option>
              <option value="quarterly">{t("settings.quarterly")}</option>
            </Select>
          </FormField>
        )}

        {form.rebalanceStrategy === "percent-of-portfolio" && (
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
              value={form.portfolioChangeThreshold}
              onChange={(e) =>
                setField("portfolioChangeThreshold", e.target.value)
              }
              placeholder="5"
              className="w-full max-w-[8rem]"
            />
          </FormField>
        )}

        {form.rebalanceStrategy === "risk-parity" && (
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
              value={form.riskParityLookbackDays}
              onChange={(e) =>
                setField("riskParityLookbackDays", e.target.value)
              }
              placeholder="30"
              className="w-full max-w-[8rem]"
            />
          </FormField>
        )}

        {form.rebalanceStrategy === "dca-weighted" && (
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
                value={form.dcaSplitCount}
                onChange={(e) => setField("dcaSplitCount", e.target.value)}
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
                value={form.dcaIntervalDays}
                onChange={(e) => setField("dcaIntervalDays", e.target.value)}
                placeholder="7"
                className="w-full max-w-[8rem]"
              />
            </FormField>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
