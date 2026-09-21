"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useTranslation } from "@/hooks/use-translation";

interface StrategyRow {
  name: string;
  complexity: string;
  frequency: string;
  cost: string;
  bestFor: string;
}

export function StrategyComparisonTable() {
  const { t } = useTranslation();

  const strategies: StrategyRow[] = [
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

  // "Best for" is the column a person actually reads, so on a phone it
  // stays as prose under the card rather than being squeezed into the
  // three-up grid or dropped.
  const columns: DataTableColumn<StrategyRow>[] = [
    {
      key: "name",
      header: t("guide.strategies"),
      align: "left",
      mobile: "identity",
      cell: (row) => row.name,
    },
    {
      key: "complexity",
      header: t("guide.compComplexity"),
      align: "left",
      mobile: "meta",
      cell: (row) => row.complexity,
    },
    {
      key: "frequency",
      header: t("guide.compTradingFreq"),
      align: "left",
      mobile: "meta",
      cell: (row) => row.frequency,
    },
    {
      key: "cost",
      header: t("guide.compCostEfficiency"),
      align: "left",
      mobile: "meta",
      cell: (row) => row.cost,
    },
    {
      key: "bestFor",
      header: t("guide.compBestFor"),
      align: "left",
      mobile: "note",
      className: "font-sans text-body",
      cell: (row) => row.bestFor,
    },
  ];

  return (
    <DataTable
      caption={t("guide.comparison")}
      columns={columns}
      rows={strategies}
      rowKey={(row) => row.name}
    />
  );
}
