"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="flex h-control-sm w-control-sm items-center justify-center rounded-md border border-border-subtle text-text-secondary transition-colors duration-[120ms] ease-out hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page"
      aria-label={t("theme.toggle")}
      title={t("theme.toggle")}
    >
      {resolvedTheme === "dark" ? (
        <Sun className="h-[15px] w-[15px]" aria-hidden="true" />
      ) : (
        <Moon className="h-[15px] w-[15px]" aria-hidden="true" />
      )}
    </button>
  );
}
