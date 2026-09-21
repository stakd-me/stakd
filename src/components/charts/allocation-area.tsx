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

// The categorical scale is the design system's single ordering, read from
// the --chart-series-* tokens. Assignment is fixed, never cycled: series
// beyond the scale fold into "others" upstream, which always takes the
// last slot.
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
    const palette = chartTheme.series;
    return trend.series.map((series, index) => {
      const color = series.isOthers
        ? palette[palette.length - 1]
        : palette[index % (palette.length - 1)];
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
  }, [trend.series, othersLabel, chartTheme.series]);

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
