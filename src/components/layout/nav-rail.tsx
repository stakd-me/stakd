"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Lock } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useVaultStore } from "@/lib/store";
import { usePrices } from "@/hooks/use-prices";
import { useTranslation } from "@/hooks/use-translation";
import { getRebalanceAlertTokenCount } from "@/lib/services/rebalance-alerts";
import { isNavigationPathActive } from "@/lib/navigation";
import { NAV_ITEMS } from "@/components/layout/nav-items";

/**
 * The desktop navigation rail: a fixed 220px column, five destinations,
 * the active one filled with ink. Not collapsible — at five items there
 * is nothing to gain from hiding the labels.
 */
export function NavRail() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const vault = useVaultStore((s) => s.vault);
  const { priceMap } = usePrices();

  const alertCount = useMemo(
    () => getRebalanceAlertTokenCount(vault, priceMap),
    [vault, priceMap]
  );

  return (
    <aside className="hidden h-screen w-rail shrink-0 flex-col border-r border-border bg-bg-sidebar md:flex">
      <div className="border-b border-border-subtle px-5 py-4">
        <div className="text-heading font-extrabold uppercase tracking-tight text-text-primary">
          {t("nav.title")}
        </div>
        <div className="mt-0.5 font-mono text-meta uppercase text-text-muted">
          {t("nav.localVault")}
        </div>
      </div>

      <nav aria-label={t("nav.title")} className="flex flex-col gap-0.5 p-3">
        {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
          const active = isNavigationPathActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 text-body transition-colors duration-[120ms] ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset",
                active
                  ? "bg-ink font-semibold text-text-inverse"
                  : "font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary"
              )}
            >
              <Icon className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
              <span className="grow truncate">{t(labelKey)}</span>
              {href === "/rebalance" && alertCount > 0 ? (
                <span
                  className={cn(
                    "shrink-0 rounded-sm border px-1.5 font-mono text-[11px] leading-4",
                    active
                      ? "border-transparent bg-bg-page text-status-warning"
                      : "border-status-warning-border bg-status-warning-soft text-status-warning"
                  )}
                >
                  {alertCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="grow" />

      <div className="border-t border-border-subtle px-5 py-4">
        <div className="font-mono text-meta uppercase text-text-muted">
          {t("nav.status")}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-status-positive" aria-hidden="true" />
          <span className="font-mono text-num-sm text-text-secondary">
            {t("nav.vaultEncrypted")}
          </span>
        </div>
        <Link
          href={pathname.startsWith("/rebalance") ? "/rebalance/guide" : "/guide"}
          className="mt-3 inline-flex items-center gap-2 text-caption text-accent hover:underline"
        >
          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
          {t("nav.guide")}
        </Link>
      </div>
    </aside>
  );
}
