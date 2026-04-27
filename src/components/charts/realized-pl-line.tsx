"use client";

import { memo } from "react";
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
import { useChartTheme } from "@/hooks/use-chart-theme";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

export interface RealizedPlPoint {
  date: string;
  cumulativePL: number;
  symbol: string;
  pl: number;
}

interface Props {
  timeline: RealizedPlPoint[];
  totalRealizedPL: number;
  cumulativeLabel: string;
}

export const RealizedPlLineChart = memo(function RealizedPlLineChart({
  timeline,
  totalRealizedPL,
  cumulativeLabel,
}: Props) {
  const chartTheme = useChartTheme();
  const isPositive = totalRealizedPL >= 0;
  const lineColor = isPositive ? "#22c55e" : "#ef4444";
  const fillColor = isPositive ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)";

  return (
    <div className="h-64">
      <Line
        data={{
          labels: timeline.map((p) => {
            const d = new Date(p.date);
            return `${d.getMonth() + 1}/${d.getDate()}`;
          }),
          datasets: [
            {
              data: timeline.map((p) => p.cumulativePL),
              borderColor: lineColor,
              borderWidth: 2,
              fill: true,
              backgroundColor: fillColor,
              tension: 0.3,
              pointRadius: 0,
              pointHitRadius: 10,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              backgroundColor: chartTheme.tooltipBg,
              titleColor: chartTheme.tooltipText,
              bodyColor: chartTheme.tooltipText,
              borderColor: chartTheme.tooltipBorder,
              borderWidth: 1,
              cornerRadius: 8,
              callbacks: {
                title: (items) => {
                  const idx = items[0].dataIndex;
                  const point = timeline[idx];
                  if (!point) return "";
                  return `${new Date(point.date).toLocaleDateString()} — ${point.symbol}`;
                },
                label: (item) => `${cumulativeLabel}: ${formatUsd(item.raw as number)}`,
              },
            },
          },
          scales: {
            x: {
              grid: { color: chartTheme.gridColor },
              ticks: {
                color: chartTheme.tickColor,
                font: { size: 12 },
                maxTicksLimit: 8,
              },
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
