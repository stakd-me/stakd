"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Calculator,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { useVaultStore } from "@/lib/store";
import { usePrices } from "@/hooks/use-prices";
import { getSymbolValues } from "@/lib/services/portfolio-calculator";
import type { WhatIfTrade, WhatIfResult } from "./types";

interface WhatIfCalculatorSectionProps {
  symbolOptions: string[];
}

export function WhatIfCalculatorSection({
  symbolOptions,
}: WhatIfCalculatorSectionProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [showWhatIf, setShowWhatIf] = useState(false);
  const [whatIfTrades, setWhatIfTrades] = useState<WhatIfTrade[]>([
    { tokenSymbol: "", action: "buy", amountUsd: "" },
  ]);
  const [whatIfResults, setWhatIfResults] = useState<WhatIfResult[] | null>(
    null
  );
  const [whatIfLoading, setWhatIfLoading] = useState(false);

  const vault = useVaultStore((s) => s.vault);
  const { priceMap } = usePrices();

  const handleSimulate = () => {
    setWhatIfLoading(true);
    try {
      const trades = whatIfTrades
        .filter((tr) => tr.tokenSymbol && parseFloat(tr.amountUsd) > 0)
        .map((tr) => ({
          tokenSymbol: tr.tokenSymbol.toUpperCase(),
          action: tr.action,
          amountUsd: parseFloat(tr.amountUsd),
        }));

      if (trades.length === 0) {
        toast(t("rebalance.simulationFailed"), "error");
        return;
      }

      const { symbolValues, totalValue } = getSymbolValues(vault, priceMap);

      // Compute simulated values
      const simulatedValues = { ...symbolValues };
      let simulatedTotal = totalValue;

      for (const trade of trades) {
        const current = simulatedValues[trade.tokenSymbol] || 0;
        if (trade.action === "buy") {
          simulatedValues[trade.tokenSymbol] = current + trade.amountUsd;
          simulatedTotal += trade.amountUsd;
        } else {
          const executedSell = Math.min(current, trade.amountUsd);
          simulatedValues[trade.tokenSymbol] = Math.max(0, current - executedSell);
          simulatedTotal = Math.max(0, simulatedTotal - executedSell);
        }
      }

      // Build comparison for all symbols that appear in either current or simulated
      const allSymbols = new Set([
        ...Object.keys(symbolValues),
        ...Object.keys(simulatedValues),
      ]);

      const comparison: WhatIfResult[] = [];
      for (const symbol of allSymbols) {
        const currentVal = symbolValues[symbol] || 0;
        const simVal = simulatedValues[symbol] || 0;
        if (currentVal === 0 && simVal === 0) continue;

        const currentPercent = totalValue > 0 ? (currentVal / totalValue) * 100 : 0;
        const simulatedPercent = simulatedTotal > 0 ? (simVal / simulatedTotal) * 100 : 0;
        const change = simulatedPercent - currentPercent;

        comparison.push({
          tokenSymbol: symbol,
          currentPercent: Math.round(currentPercent * 100) / 100,
          simulatedPercent: Math.round(simulatedPercent * 100) / 100,
          change: Math.round(change * 100) / 100,
        });
      }

      // Sort by absolute change descending
      comparison.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

      setWhatIfResults(comparison);
    } catch {
      toast(t("rebalance.simulationFailed"), "error");
    } finally {
      setWhatIfLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          className="flex w-full items-center gap-2"
          onClick={() => setShowWhatIf(!showWhatIf)}
          aria-expanded={showWhatIf}
        >
          <Calculator className="h-5 w-5 text-status-info" />
          <CardTitle>{t("rebalance.whatIfCalc")}</CardTitle>
          <span className="ml-auto">
            {showWhatIf ? (
              <ChevronUp className="h-5 w-5 text-text-subtle" />
            ) : (
              <ChevronDown className="h-5 w-5 text-text-subtle" />
            )}
          </span>
        </button>
      </CardHeader>
      {showWhatIf && (
        <CardContent>
          <div className="space-y-3">
            {whatIfTrades.map((trade, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2 sm:flex-nowrap"
              >
                <Select
                  value={trade.action}
                  onChange={(e) => {
                    const updated = [...whatIfTrades];
                    updated[i] = {
                      ...updated[i],
                      action: e.target.value as "buy" | "sell",
                    };
                    setWhatIfTrades(updated);
                  }}
                  className="w-full sm:w-24"
                >
                  <option value="buy">{t("portfolio.buy")}</option>
                  <option value="sell">{t("portfolio.sell")}</option>
                </Select>
                <Input
                  placeholder={t("rebalance.tokenPlaceholder")}
                  value={trade.tokenSymbol}
                  onChange={(e) => {
                    const updated = [...whatIfTrades];
                    updated[i] = {
                      ...updated[i],
                      tokenSymbol: e.target.value.toUpperCase(),
                    };
                    setWhatIfTrades(updated);
                  }}
                  className="flex-1 sm:w-32"
                  list="rebalance-whatif-symbol-options"
                  autoComplete="off"
                />
                <Input
                  type="number"
                  placeholder="Amount USD"
                  value={trade.amountUsd}
                  onChange={(e) => {
                    const updated = [...whatIfTrades];
                    updated[i] = {
                      ...updated[i],
                      amountUsd: e.target.value,
                    };
                    setWhatIfTrades(updated);
                  }}
                  className="flex-1 sm:w-36"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setWhatIfTrades(whatIfTrades.filter((_, j) => j !== i))
                  }
                  className="text-text-subtle hover:text-status-negative"
                  disabled={whatIfTrades.length <= 1}
                  aria-label={t("rebalance.removeTrade")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setWhatIfTrades([
                    ...whatIfTrades,
                    { tokenSymbol: "", action: "buy", amountUsd: "" },
                  ])
                }
              >
                <Plus className="mr-1 h-3 w-3" />
                {t("rebalance.addTrade")}
              </Button>
              <Button
                size="sm"
                onClick={handleSimulate}
                disabled={whatIfLoading}
              >
                {whatIfLoading ? t("rebalance.simulating") : t("rebalance.simulate")}
              </Button>
            </div>

            {symbolOptions.length > 0 && (
              <datalist id="rebalance-whatif-symbol-options">
                {symbolOptions.map((symbol) => (
                  <option key={symbol} value={symbol} />
                ))}
              </datalist>
            )}

            {whatIfResults && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-text-subtle">
                      <th className="pb-2 pr-4">{t("rebalance.tokenCol")}</th>
                      <th className="pb-2 pr-4 text-right">{t("rebalance.currentPercent")}</th>
                      <th className="pb-2 pr-4 text-right">{t("rebalance.simulatedPercent")}</th>
                      <th className="pb-2 text-right">{t("rebalance.change")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {whatIfResults.map((r) => (
                      <tr
                        key={r.tokenSymbol}
                        className="border-b border-border-subtle"
                      >
                        <td className="py-2 pr-4 font-medium text-text-primary">
                          {r.tokenSymbol}
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {r.currentPercent.toFixed(1)}%
                        </td>
                        <td className="py-2 pr-4 text-right">
                          {r.simulatedPercent.toFixed(1)}%
                        </td>
                        <td
                          className={`py-2 text-right font-medium ${r.change > 0 ? "text-status-positive" : r.change < 0 ? "text-status-negative" : "text-text-subtle"}`}
                        >
                          {r.change >= 0 ? "+" : ""}
                          {r.change.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
