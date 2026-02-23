"use client";

import { useState, useRef, useCallback } from "react";
import { usePreferencesStore } from "@/lib/store";
import { useTranslation } from "@/hooks/use-translation";
import { useClickOutside } from "@/hooks/use-click-outside";
import type { Locale } from "@/i18n";

const LANGUAGE_OPTIONS: { code: Locale; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "vi", label: "VI" },
  { code: "es", label: "ES" },
  { code: "de", label: "DE" },
];

export function LanguageToggle() {
  const { locale, setLocale } = usePreferencesStore();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(
    menuRef,
    useCallback(() => setOpen(false), [])
  );

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-md px-2 py-1.5 text-xs font-medium text-text-subtle transition-colors hover:bg-bg-hover hover:text-text-primary"
        aria-label={t("language.toggle")}
        title={t("language.toggle")}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {locale.toUpperCase()}
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-1 min-w-[64px] rounded-md border border-border bg-bg-input py-1 shadow-lg">
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option.code}
              type="button"
              className={`block w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-bg-hover ${
                option.code === locale
                  ? "text-text-primary"
                  : "text-text-subtle"
              }`}
              onClick={() => {
                setLocale(option.code);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
