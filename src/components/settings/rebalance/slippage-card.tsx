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

export function SlippageCard({ form, setField }: Props) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-label uppercase">{t("settings.slippageFees")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-body text-text-secondary">
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
  );
}
