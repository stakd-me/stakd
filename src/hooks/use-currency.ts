"use client";

import { formatUsd } from "@/lib/utils";

interface CurrencyConfig {
  format: (value: number) => string;
}

/**
 * Kept for existing call sites. It is now the same as `formatUsd`, which
 * follows the UI locale on its own (see `setNumberLocale` in lib/utils).
 */
export function useCurrency(): CurrencyConfig {
  return { format: formatUsd };
}
