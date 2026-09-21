"use client";

import { RiskCard } from "@/components/settings/rebalance/risk-card";
import { SlippageCard } from "@/components/settings/rebalance/slippage-card";
import { StrategyCard } from "@/components/settings/rebalance/strategy-card";
import { TradingCard } from "@/components/settings/rebalance/trading-card";
import type {
  RebalanceSettingsForm,
  SetRebalanceField,
} from "./rebalance-settings-form";

interface RebalanceSettingsSectionProps {
  form: RebalanceSettingsForm;
  setField: SetRebalanceField;
}

/**
 * The strategy tab of Settings: four independent cards over one form
 * object. It used to be a single 461-line component gated by three
 * booleans that every caller set to the same value.
 */
export function RebalanceSettingsSection({
  form,
  setField,
}: RebalanceSettingsSectionProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <StrategyCard form={form} setField={setField} />
      <RiskCard form={form} setField={setField} />
      <TradingCard form={form} setField={setField} />
      <SlippageCard form={form} setField={setField} />
    </div>
  );
}
