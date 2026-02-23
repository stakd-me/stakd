"use client";

import { useRef, useEffect } from "react";
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

interface HistoryData {
  date: string;
  value: number;
}

export function PortfolioLineChart({ data }: { data: HistoryData[] }) {
  const chartTheme = useChartTheme();
  const chartRef = useRef<ChartJS<"line">>(null);
  const compactSeries = data.length <= 2;

  // Force gradient update when data changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const ctx = chart.ctx;
    const area = chart.chartArea;
    if (!area) return;
    const gradient = ctx.createLinearGradient(0, area.top, 0, area.bottom);
    gradient.addColorStop(0, "rgba(59, 130, 246, 0.3)");
    gradient.addColorStop(1, "rgba(59, 130, 246, 0)");
    chart.data.datasets[0].backgroundColor = gradient;
    chart.update("none");
  }, [data]);

  const labels = data.map((d) => {
    const date = new Date(d.date);
    const now = new Date();
    const sameYear = date.getFullYear() === now.getFullYear();
    return sameYear
      ? `${date.getMonth() + 1}/${date.getDate()}`
      : `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(2)}`;
  });

  return (
    <div className="h-64">
      <Line
        ref={chartRef}
        data={{
          labels,
          datasets: [
            {
              data: data.map((d) => d.value),
              borderColor: "#3b82f6",
              borderWidth: 2,
              fill: true,
              backgroundColor: "rgba(59, 130, 246, 0.1)",
              tension: 0.3,
              pointRadius: compactSeries ? 4 : 0,
              pointHoverRadius: compactSeries ? 6 : 4,
              pointBackgroundColor: "#3b82f6",
              pointBorderColor: "#3b82f6",
              pointBorderWidth: 1,
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
              padding: 10,
              callbacks: {
                title: (items) => {
                  const idx = items[0].dataIndex;
                  const d = new Date(data[idx].date);
                  return d.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });
                },
                label: (item) => `Value: ${formatUsd(item.raw as number)}`,
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
}
