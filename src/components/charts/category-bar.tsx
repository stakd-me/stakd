"use client";

import { memo } from "react";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { useChartTheme } from "@/hooks/use-chart-theme";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

interface CategoryData {
  category: string;
  percent: number;
}

export const CategoryBarChart = memo(function CategoryBarChart({
  data,
  allocationLabel,
}: {
  data: CategoryData[];
  allocationLabel: string;
}) {
  const chartTheme = useChartTheme();

  return (
    <div className="h-64">
      <Bar
        data={{
          labels: data.map((cb) => cb.category),
          datasets: [
            {
              label: allocationLabel,
              data: data.map((cb) => cb.percent),
              backgroundColor: [
                "#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444",
                "#ec4899", "#06b6d4", "#84cc16", "#f97316",
              ],
              borderRadius: 4,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: "y",
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: chartTheme.tooltipBg,
              titleColor: chartTheme.tooltipText,
              bodyColor: chartTheme.tooltipText,
              borderColor: chartTheme.tooltipBorder,
              borderWidth: 1,
              callbacks: {
                label: (item) => `${(item.raw as number).toFixed(1)}%`,
              },
            },
          },
          scales: {
            x: {
              grid: { color: chartTheme.gridColor },
              ticks: {
                color: chartTheme.tickColor,
                callback: (v) => `${v}%`,
              },
            },
            y: {
              grid: { display: false },
              ticks: { color: chartTheme.tickColor, font: { size: 12 } },
            },
          },
        }}
      />
    </div>
  );
});
