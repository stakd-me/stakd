"use client";

import { formatUsd } from "@/lib/utils";

interface CurrencyConfig {
  format: (value: number) => string;
}

export function useCurrency(): CurrencyConfig {
  const format = (value: number): string => {
    return formatUsd(value);
  };

  return { format };
}
