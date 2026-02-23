"use client";

import { useTheme } from "next-themes";

export function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return {
    gridColor: isDark ? "#314563" : "#c7d3e5",
    tickColor: isDark ? "#9cb0cd" : "#445978",
    tooltipBg: isDark ? "#0b1220" : "#0f172a",
    tooltipText: "#f8fafc",
    tooltipBorder: isDark ? "#4b6388" : "#334155",
  };
}
