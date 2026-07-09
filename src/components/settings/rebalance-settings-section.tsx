"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Scale } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import {
  CONCENTRATION_ALERT_THRESHOLD_PERCENT,
  MAX_CONCENTRATION_ALERT_THRESHOLD_PERCENT,
  MIN_CONCENTRATION_ALERT_THRESHOLD_PERCENT,
} from "@/lib/constants/risk";
import type {
  RebalanceSettingsForm,
  SetRebalanceField,
} from "./rebalance-settings-form";

interface RebalanceSettingsSectionProps {
  form: RebalanceSettingsForm;
  setField: SetRebalanceField;
  showStrategy: boolean;
  showRisk: boolean;
  showTrading: boolean;
}

export function RebalanceSettingsSection({
  form,
  setField,
  showStrategy,
  showRisk,
  showTrading,
}: RebalanceSettingsSectionProps) {
  const { t } = useTranslation();

  if (!showStrategy && !showRisk && !showTrading) return null;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {showStrategy && (
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
      )}

      {showRisk && (
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

            <label className="flex items-start gap-3 rounded-lg border border-border-subtle bg-bg-card p-4">
              <input
                type="checkbox"
                checked={form.excludeStablecoinsFromConcentration}
                onChange={(e) =>
                  setField("excludeStablecoinsFromConcentration", e.target.checked)
                }
                className="mt-0.5 h-4 w-4 rounded border-border bg-bg-muted text-accent focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-card"
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

      {showTrading && (
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
                value={form.minTradeUsd}
                onChange={(e) => setField("minTradeUsd", e.target.value)}
                placeholder="50"
                className="w-full max-w-[8rem]"
              />
            </FormField>

            <label className="flex items-start gap-3 rounded-lg border border-border-subtle bg-bg-card p-4">
              <input
                type="checkbox"
                checked={form.buyOnlyMode}
                onChange={(e) => setField("buyOnlyMode", e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border bg-bg-muted text-accent focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-card"
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

            {form.buyOnlyMode && (
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
                  value={form.newCashUsd}
                  onChange={(e) => setField("newCashUsd", e.target.value)}
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
                      value={form.cashReserveUsd}
                      onChange={(e) => setField("cashReserveUsd", e.target.value)}
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
                      value={form.cashReservePercent}
                      onChange={(e) =>
                        setField("cashReservePercent", e.target.value)
                      }
                      placeholder="0"
                      className="w-full max-w-[8rem]"
                    />
                  </FormField>
                </div>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.treatStablecoinsAsCashReserve}
                    onChange={(e) =>
                      setField("treatStablecoinsAsCashReserve", e.target.checked)
                    }
                    className="mt-0.5 h-4 w-4 rounded border-border bg-bg-muted text-accent focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-card"
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
                value={form.dustThresholdUsd}
                onChange={(e) => setField("dustThresholdUsd", e.target.value)}
                placeholder="1"
                className="w-full max-w-[8rem]"
              />
            </FormField>
          </CardContent>
        </Card>
      )}

      {showTrading && (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.slippageFees")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-text-subtle">
              {t("settings.slippageFeesDesc")}
            </p>
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
                  value={form.slippagePercent}
                  onChange={(e) => setField("slippagePercent", e.target.value)}
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
                  value={form.tradingFeePercent}
                  onChange={(e) =>
                    setField("tradingFeePercent", e.target.value)
                  }
                  placeholder="0.1"
                  className="w-full max-w-[8rem]"
                />
              </FormField>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
