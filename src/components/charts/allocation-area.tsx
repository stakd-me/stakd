"use client";

import { memo, useMemo } from "react";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { useChartTheme } from "@/hooks/use-chart-theme";
import { useTranslation } from "@/hooks/use-translation";
import type { AllocationTrend } from "@/lib/services/allocation-history";

ChartJS.register(
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
);

// Categorical palettes validated with the six-checks script (light on #ffffff,
// dark on #172339): fixed assignment order, never cycled — series beyond the
// palette fold into "others" upstream. Amber/green/cyan use darker steps in
// dark mode to stay inside the lightness band.
const SERIES_COLORS_LIGHT = [
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#10b981",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
];
const SERIES_COLORS_DARK = [
  "#3b82f6",
  "#d97706",
  "#8b5cf6",
  "#059669",
  "#ef4444",
  "#0891b2",
  "#ec4899",
];
const OTHERS_COLOR = "#6b7280";
const FILL_ALPHA = "59"; // ~35% — fills overlap-stack, borders carry identity

interface AllocationAreaChartProps {
  trend: AllocationTrend;
  othersLabel: string;
}

export const AllocationAreaChart = memo(function AllocationAreaChart({
  trend,
  othersLabel,
}: AllocationAreaChartProps) {
  const chartTheme = useChartTheme();
  const { formatDate } = useTranslation();

  const labels = useMemo(
    () =>
      trend.weeks.map((week) =>
        formatDate(new Date(`${week}T00:00:00Z`), {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        })
      ),
    [trend.weeks, formatDate]
  );

  const datasets = useMemo(() => {
    const palette = chartTheme.isDark ? SERIES_COLORS_DARK : SERIES_COLORS_LIGHT;
    return trend.series.map((series, index) => {
      const color = series.isOthers
        ? OTHERS_COLOR
        : palette[index % palette.length];
      return {
        label: series.isOthers ? othersLabel : series.symbol,
        data: series.percents,
        borderColor: color,
        backgroundColor: `${color}${FILL_ALPHA}`,
        borderWidth: 2,
        // Fill only the band between this cumulative line and the previous
        // one so translucent fills never overlap and muddy each other.
        fill: index === 0 ? "origin" : "-1",
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHitRadius: 10,
        pointBackgroundColor: color,
      };
    });
  }, [trend.series, othersLabel, chartTheme.isDark]);

  return (
    <div className="h-72">
      <Line
        data={{ labels, datasets }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: {
              display: true,
              position: "bottom",
              labels: {
                color: chartTheme.tickColor,
                usePointStyle: true,
                pointStyle: "circle",
                boxWidth: 8,
                boxHeight: 8,
                font: { size: 12 },
              },
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
                label: (item) =>
                  `${item.dataset.label}: ${(item.raw as number).toFixed(2)}%`,
              },
            },
          },
          scales: {
            x: {
              grid: { color: chartTheme.gridColor },
              ticks: {
                color: chartTheme.tickColor,
                font: { size: 12 },
                maxTicksLimit: 10,
              },
            },
            y: {
              stacked: true,
              min: 0,
              suggestedMax: 100,
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
  );
});
