"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/hooks/use-translation";
import type {
  RebalanceSettingsForm,
  SetRebalanceField,
} from "@/components/settings/rebalance-settings-form";

interface Props {
  form: RebalanceSettingsForm;
  setField: SetRebalanceField;
}

export function TradingCard({ form, setField }: Props) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-label uppercase">{t("settings.sectionTrading")}</CardTitle>
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

        <label className="flex items-start gap-3 border border-border-subtle bg-bg-inset p-4">
          <input
            type="checkbox"
            checked={form.buyOnlyMode}
            onChange={(e) => setField("buyOnlyMode", e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded-md border-border bg-bg-muted text-accent focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-card"
          />
          <span>
            <span className="text-body font-semibold text-text-primary">
              {t("settings.buyOnlyMode")}
            </span>
            <p className="mt-1 text-caption text-text-muted">
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

        <div className="border border-border-subtle bg-bg-inset p-4">
          <div className="space-y-4">
            <div>
              <p className="text-body font-semibold text-text-primary">
                {t("settings.cashReserve")}
              </p>
              <p className="mt-1 text-caption text-text-muted">
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
                className="mt-0.5 h-4 w-4 rounded-md border-border bg-bg-muted text-accent focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-card"
              />
              <span>
                <span className="text-body font-semibold text-text-primary">
                  {t("settings.treatStableAsCashReserve")}
                </span>
                <p className="mt-1 text-caption text-text-muted">
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
  );
}
