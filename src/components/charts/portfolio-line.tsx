"use client";

import { useRef, useEffect, useMemo, memo } from "react";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { formatUsd, formatCompactUsd } from "@/lib/utils";
import { useChartTheme, withAlpha } from "@/hooks/use-chart-theme";
import { useTranslation } from "@/hooks/use-translation";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

interface HistoryData {
  date: string;
  value: number;
}

export const PortfolioLineChart = memo(function PortfolioLineChart({ data }: { data: HistoryData[] }) {
  const chartTheme = useChartTheme();
  const { t, formatDate } = useTranslation();
  const chartRef = useRef<ChartJS<"line">>(null);
  const sanitizedData = useMemo(
    () =>
      data.filter(
        (point) =>
          typeof point.date === "string" &&
          point.date.length > 0 &&
          Number.isFinite(point.value)
      ),
    [data]
  );
  const compactSeries = sanitizedData.length <= 2;

  // Force gradient update when data changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const ctx = chart.ctx;
    const area = chart.chartArea;
    if (!area) return;
    const gradient = ctx.createLinearGradient(0, area.top, 0, area.bottom);
    gradient.addColorStop(0, withAlpha(chartTheme.accent, 0.3));
    gradient.addColorStop(1, withAlpha(chartTheme.accent, 0));
    chart.data.datasets[0].backgroundColor = gradient;
    chart.update("none");
  }, [sanitizedData, chartTheme.accent]);

  const labels = useMemo(
    () =>
      sanitizedData.map((d) => {
        const date = new Date(d.date);
        const sameYear = date.getFullYear() === new Date().getFullYear();
        return formatDate(
          date,
          sameYear
            ? { month: "numeric", day: "numeric" }
            : { month: "numeric", day: "numeric", year: "2-digit" }
        );
      }),
    [sanitizedData, formatDate]
  );

  return (
    <div className="h-64">
      <Line
        ref={chartRef}
        data={{
          labels,
          datasets: [
            {
              label: t("charts.portfolioValue"),
              data: sanitizedData.map((d) => d.value),
              borderColor: chartTheme.accent,
              borderWidth: 2,
              fill: true,
              backgroundColor: withAlpha(chartTheme.accent, 0.1),
              tension: 0.3,
              pointRadius: compactSeries ? 4 : 0,
              pointHoverRadius: compactSeries ? 6 : 4,
              pointBackgroundColor: chartTheme.accent,
              pointBorderColor: chartTheme.accent,
              pointBorderWidth: 1,
              pointHitRadius: 10,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              backgroundColor: chartTheme.tooltipBg,
              titleColor: chartTheme.tooltipText,
              bodyColor: chartTheme.tooltipText,
              borderColor: chartTheme.tooltipBorder,
              borderWidth: 1,
              cornerRadius: 8,
              padding: 10,
              callbacks: {
                title: (items) => {
                  if (items.length === 0) return "";
                  const idx = items[0].dataIndex;
                  const point = sanitizedData[idx];
                  if (!point) return "";
                  return formatDate(new Date(point.date), {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });
                },
                label: (item) =>
                  `${t("charts.value")}: ${formatUsd(item.raw as number)}`,
              },
            },
          },
          scales: {
            x: {
              grid: { color: chartTheme.gridColor },
              ticks: { color: chartTheme.tickColor, font: { size: 12 }, maxTicksLimit: 8 },
            },
            y: {
              grid: { color: chartTheme.gridColor },
              ticks: {
                color: chartTheme.tickColor,
                font: { size: 12 },
                callback: (value) => formatCompactUsd(value as number),
              },
            },
          },
        }}
      />
    </div>
  );
});
