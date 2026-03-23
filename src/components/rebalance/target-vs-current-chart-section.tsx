"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccessibleChartFrame } from "@/components/ui/accessible-chart-frame";
import { useChartTheme } from "@/hooks/use-chart-theme";
import { useTranslation } from "@/hooks/use-translation";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(BarElement, CategoryScale, LinearScale, ChartTooltip, ChartLegend);

interface TargetVsCurrentDatum {
  name: string;
  Target: number;
  Current: number;
}

interface TargetVsCurrentChartSectionProps {
  chartData: TargetVsCurrentDatum[];
  summary: string;
}

export function TargetVsCurrentChartSection({
  chartData,
  summary,
}: TargetVsCurrentChartSectionProps) {
  const { t } = useTranslation();
  const chartTheme = useChartTheme();

  if (chartData.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("rebalance.targetVsCurrent")}</CardTitle>
      </CardHeader>
      <CardContent>
        <AccessibleChartFrame
          title={t("rebalance.targetVsCurrent")}
          summary={summary}
        >
          <div className="h-80">
            <Bar
              data={{
                labels: chartData.map((datum) => datum.name),
                datasets: [
                  {
                    label: t("rebalance.targetLabel"),
                    data: chartData.map((datum) => datum.Target),
                    backgroundColor: "#3b82f6",
                    borderRadius: 4,
                  },
                  {
                    label: t("rebalance.currentLabel"),
                    data: chartData.map((datum) => datum.Current),
                    backgroundColor: "#8b5cf6",
                    borderRadius: 4,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    labels: { color: chartTheme.tickColor },
                  },
                  tooltip: {
                    backgroundColor: chartTheme.tooltipBg,
                    titleColor: chartTheme.tooltipText,
                    bodyColor: chartTheme.tooltipText,
                    borderColor: chartTheme.tooltipBorder,
                    borderWidth: 1,
                    cornerRadius: 8,
                    callbacks: {
                      label: (item) =>
                        `${item.dataset.label}: ${(item.raw as number).toFixed(1)}%`,
                    },
                  },
                },
                scales: {
                  x: {
                    grid: { color: chartTheme.gridColor },
                    ticks: { color: chartTheme.tickColor, font: { size: 12 } },
                  },
                  y: {
                    grid: { color: chartTheme.gridColor },
                    ticks: {
                      color: chartTheme.tickColor,
                      font: { size: 12 },
                      callback: (value) => `${value}%`,
                    },
                  },
                },
              }}
            />
          </div>
        </AccessibleChartFrame>
      </CardContent>
    </Card>
  );
}
