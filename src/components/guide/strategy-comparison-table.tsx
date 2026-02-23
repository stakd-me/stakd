"use client";

import { useTranslation } from "@/hooks/use-translation";

export function StrategyComparisonTable() {
  const { t } = useTranslation();

  const strategies = [
    {
      name: t("guide.stratThreshold"),
      complexity: t("guide.compLow"),
      frequency: t("guide.compVaries"),
      cost: t("guide.compHigh"),
      bestFor: t("guide.compThresholdBest"),
    },
    {
      name: t("guide.stratCalendar"),
      complexity: t("guide.compLow"),
      frequency: t("guide.compLow"),
      cost: t("guide.compHigh"),
      bestFor: t("guide.compCalendarBest"),
    },
    {
      name: t("guide.stratPercentPortfolio"),
      complexity: t("guide.compMedium"),
      frequency: t("guide.compLow"),
      cost: t("guide.compHigh"),
      bestFor: t("guide.compPercentBest"),
    },
    {
      name: t("guide.stratRiskParity"),
      complexity: t("guide.compHigh"),
      frequency: t("guide.compMedium"),
      cost: t("guide.compMedium"),
      bestFor: t("guide.compRiskBest"),
    },
    {
      name: t("guide.stratDCA"),
      complexity: t("guide.compMedium"),
      frequency: t("guide.compHigh"),
      cost: t("guide.compMedium"),
      bestFor: t("guide.compDCABest"),
    },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-subtle">
            <th className="pb-3 pr-4 font-medium">{t("guide.strategies")}</th>
            <th className="pb-3 pr-4 font-medium">{t("guide.compComplexity")}</th>
            <th className="pb-3 pr-4 font-medium">{t("guide.compTradingFreq")}</th>
            <th className="pb-3 pr-4 font-medium">{t("guide.compCostEfficiency")}</th>
            <th className="pb-3 font-medium">{t("guide.compBestFor")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {strategies.map((s) => (
            <tr key={s.name} className="text-text-tertiary">
              <td className="py-3 pr-4 font-medium text-text-primary">{s.name}</td>
              <td className="py-3 pr-4">{s.complexity}</td>
              <td className="py-3 pr-4">{s.frequency}</td>
              <td className="py-3 pr-4">{s.cost}</td>
              <td className="py-3">{s.bestFor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
