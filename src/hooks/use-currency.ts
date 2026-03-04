"use client";

import { usePreferencesStore } from "@/lib/store";

interface CurrencyConfig {
  format: (value: number) => string;
}

const LOCALE_CODE_MAP = {
  en: "en-US",
  vi: "vi-VN",
  es: "es-ES",
  de: "de-DE",
} as const;

export function useCurrency(): CurrencyConfig {
  const locale = usePreferencesStore((s) => s.locale);

  const format = (value: number): string => {
    return new Intl.NumberFormat(LOCALE_CODE_MAP[locale] ?? LOCALE_CODE_MAP.en, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return { format };
}
