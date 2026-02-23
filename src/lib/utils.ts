import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function formatUsdWithPrecision(
  value: number,
  minimumFractionDigits: number,
  maximumFractionDigits: number
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

export function formatUsd(value: number): string {
  return formatUsdWithPrecision(value, 2, 2);
}

/**
 * Adaptive USD formatter for token unit prices.
 * Keeps precision for tiny prices while avoiding noisy decimals for larger ones.
 */
export function formatUsdPrice(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";

  const abs = Math.abs(value);
  if (abs === 0) return "$0.00";
  if (abs >= 1_000) return formatUsdWithPrecision(value, 2, 2);
  if (abs >= 1) return formatUsdWithPrecision(value, 2, 4);
  if (abs >= 0.01) return formatUsdWithPrecision(value, 2, 6);
  if (abs >= 0.0001) return formatUsdWithPrecision(value, 4, 8);
  if (abs >= 0.000001) return formatUsdWithPrecision(value, 6, 10);

  return value < 0 ? "-<$0.000001" : "<$0.000001";
}

export function formatCompactUsd(value: number): string {
  if (value === 0) return "$0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (abs >= 1) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(2)}`;
}

export function formatCrypto(value: number | string, decimals = 6): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num === 0) return "0";
  if (num < 0.000001) return "<0.000001";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/** Returns current local datetime as a string suitable for datetime-local inputs (YYYY-MM-DDTHH:mm) */
export function toLocalDatetimeString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

/** Format a relative time string like "5 min ago", "2 hours ago" */
export function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatCurrency(value: number): string {
  return formatUsd(value);
}

export async function downloadFile(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(blobUrl);
}
