"use client";

import { useCallback } from "react";
import { usePreferencesStore } from "@/lib/store";
import { translations, type Locale, type TranslationKeys } from "@/i18n";

const LOCALE_CODE_MAP: Record<Locale, string> = {
  en: "en-US",
  vi: "vi-VN",
  es: "es-ES",
  de: "de-DE",
};

export function useTranslation() {
  const locale = usePreferencesStore((s) => s.locale);
  const dict = translations[locale] ?? translations.en;

  const t = useCallback(
    (key: TranslationKeys, replacements?: Record<string, string | number>) => {
      let value = dict[key] ?? key;
      if (replacements) {
        for (const [k, v] of Object.entries(replacements)) {
          value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return value;
    },
    [dict]
  );

  const formatNumber = useCallback(
    (n: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(LOCALE_CODE_MAP[locale] ?? LOCALE_CODE_MAP.en, options).format(n),
    [locale]
  );

  const formatDate = useCallback(
    (date: Date, options?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(LOCALE_CODE_MAP[locale] ?? LOCALE_CODE_MAP.en, options).format(date),
    [locale]
  );

  return { t, locale, formatNumber, formatDate };
}
