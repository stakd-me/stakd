"use client";

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { formatUsd } from "@/lib/utils";
import { useChartTheme } from "@/hooks/use-chart-theme";

ChartJS.register(ArcElement, Tooltip, Legend);

interface AllocationData {
  symbol: string;
  value: number;
  percent: number;
  color: string;
}

export function AllocationPieChart({ data }: { data: AllocationData[] }) {
  const chartTheme = useChartTheme();

  return (
    <div>
      <div className="mx-auto h-56 w-56">
        <Doughnut
          data={{
            labels: data.map((d) => d.symbol),
            datasets: [
              {
                data: data.map((d) => d.value),
                backgroundColor: data.map((d) => d.color),
                borderWidth: 0,
                hoverOffset: 6,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            cutout: "65%",
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: chartTheme.tooltipBg,
                titleColor: chartTheme.tooltipText,
                bodyColor: chartTheme.tooltipText,
                borderColor: chartTheme.tooltipBorder,
                borderWidth: 1,
                cornerRadius: 8,
                padding: 10,
                callbacks: {
                  label: (item) => {
                    const entry = data[item.dataIndex];
                    return `${entry.symbol}: ${formatUsd(entry.value)} (${entry.percent.toFixed(1)}%)`;
                  },
                },
              },
            },
          }}
        />
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {data.map((item) => (
          <div key={item.symbol} className="flex items-center gap-1.5 text-xs">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-text-muted">
              {item.symbol} ({item.percent.toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
