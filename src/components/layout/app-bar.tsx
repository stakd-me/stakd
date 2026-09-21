"use client";

import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuthStore, useVaultStore } from "@/lib/store";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useNow } from "@/hooks/use-now";
import { useTranslation } from "@/hooks/use-translation";
import { useCurrency } from "@/hooks/use-currency";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { isNavigationPathActive } from "@/lib/navigation";
import { clearEncKey } from "@/lib/crypto/key-store";
import { cn } from "@/lib/utils";

const FRESH_MS = 2 * 60 * 1000;
const STALE_MS = 15 * 60 * 1000;

function formatAge(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

/**
 * The bar the app never had: which screen you are on, what the portfolio
 * is worth, and how old the prices are — on every page, so those three
 * facts stop being re-stated by each one.
 */
export function AppBar() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { format: formatCurrency } = useCurrency();
  const { totals, lastPriceUpdate } = usePortfolio();
  const now = useNow(15_000);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const clearVault = useVaultStore((s) => s.clearVault);

  const current = NAV_ITEMS.find((item) =>
    isNavigationPathActive(pathname, item.href)
  );

  const age = lastPriceUpdate ? now - new Date(lastPriceUpdate).getTime() : null;
  const dotClass =
    age === null
      ? "bg-text-dim"
      : age < FRESH_MS
        ? "bg-status-positive"
        : age < STALE_MS
          ? "bg-status-warning"
          : "bg-status-negative";

  const change = totals.change24h;

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      // The session may already be gone; the local key still must go.
    }
    await clearEncKey();
    clearVault();
    clearAuth();
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg-page px-4 md:px-6">
      {current ? (
        <span className="hidden font-mono text-meta uppercase text-text-muted sm:inline">
          {t(current.labelKey)}
        </span>
      ) : null}
      <span className="hidden h-4 w-px bg-border-subtle sm:block" />

      <span className="font-mono text-num-lg tabular text-text-primary">
        {formatCurrency(totals.totalValue)}
      </span>
      {typeof change === "number" && change !== 0 ? (
        <span
          className={cn(
            "font-mono text-num-sm tabular",
            change > 0 ? "text-status-positive" : "text-status-negative"
          )}
        >
          {change > 0 ? "+" : ""}
          {change.toFixed(2)}%
        </span>
      ) : null}

      <span className="grow" />

      <span className="hidden items-center gap-2 sm:inline-flex">
        <span className={cn("h-[7px] w-[7px] rounded-full", dotClass)} aria-hidden="true" />
        <span className="font-mono text-meta uppercase text-text-muted">
          {age === null ? t("common.noData") : formatAge(age)}
        </span>
      </span>

      <LanguageToggle />
      <ThemeToggle />
      <button
        type="button"
        onClick={handleLogout}
        aria-label={t("common.logout")}
        className={cn(
          "flex h-control-sm w-control-sm items-center justify-center border border-border-subtle text-text-secondary",
          "transition-colors duration-[120ms] ease-out hover:bg-bg-hover hover:text-text-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page"
        )}
      >
        <LogOut className="h-[15px] w-[15px]" aria-hidden="true" />
      </button>
    </header>
  );
}
