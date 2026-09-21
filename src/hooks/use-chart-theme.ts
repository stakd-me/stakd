"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/**
 * Chart colour comes from the same tokens as everything else.
 *
 * This used to be a table of hex literals branching on `resolvedTheme`,
 * in a blue-slate palette that did not match the app, while the
 * --chart-* custom properties in globals.css sat unread. Now the CSS is
 * the single source and this reads it back for the canvas, which cannot
 * resolve var() itself.
 */

export const SERIES_COUNT = 8;

const SERIES_VARS = Array.from(
  { length: SERIES_COUNT },
  (_, i) => `--chart-series-${i + 1}`
);

// Used for the first paint and on the server. These are the dark values,
// since dark is the default theme; the effect corrects them on mount.
const FALLBACK = {
  gridColor: "#232921",
  tickColor: "#8d978a",
  tooltipBg: "#0e100d",
  tooltipText: "#edf1e9",
  tooltipBorder: "#566052",
  positive: "#4bd07e",
  negative: "#ff7a6e",
  accent: "#7d9bff",
  series: [
    "#7d9bff",
    "#4bd07e",
    "#e9b949",
    "#f0925a",
    "#c08be8",
    "#5bc9d8",
    "#e87fa8",
    "#9aa694",
  ],
} as const;

export interface ChartTheme {
  isDark: boolean;
  gridColor: string;
  tickColor: string;
  tooltipBg: string;
  tooltipText: string;
  tooltipBorder: string;
  positive: string;
  negative: string;
  accent: string;
  /** The ONE categorical ordering. Index 7 is always the Others bucket. */
  series: readonly string[];
}

function readVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function readTheme(isDark: boolean): ChartTheme {
  return {
    isDark,
    gridColor: readVar("--chart-grid", FALLBACK.gridColor),
    tickColor: readVar("--chart-tick", FALLBACK.tickColor),
    tooltipBg: readVar("--chart-tooltip-bg", FALLBACK.tooltipBg),
    tooltipText: readVar("--chart-tooltip-text", FALLBACK.tooltipText),
    tooltipBorder: readVar("--chart-tooltip-border", FALLBACK.tooltipBorder),
    positive: readVar("--status-positive", FALLBACK.positive),
    negative: readVar("--status-negative", FALLBACK.negative),
    accent: readVar("--accent", FALLBACK.accent),
    series: SERIES_VARS.map((name, i) => readVar(name, FALLBACK.series[i])),
  };
}

export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const [theme, setTheme] = useState<ChartTheme>(() => ({
    ...FALLBACK,
    isDark,
    series: [...FALLBACK.series],
  }));

  useEffect(() => {
    // Runs after next-themes has swapped the class on <html>, so the
    // computed values are the ones the page is actually painted with.
    setTheme(readTheme(isDark));
  }, [isDark]);

  return theme;
}

/** Just the categorical scale, for callers that need nothing else. */
export function useChartSeries(): readonly string[] {
  return useChartTheme().series;
}

/**
 * Chart.js needs a concrete colour string, so translucent fills are built
 * from a token rather than written as a second literal that can drift
 * away from the line it sits under.
 */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    const value = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
      .toString(16)
      .padStart(2, "0");
    return `${hex}${value}`;
  }
  // rgb()/oklch() and friends: let the browser do the compositing.
  return `color-mix(in srgb, ${hex} ${Math.round(alpha * 100)}%, transparent)`;
}
