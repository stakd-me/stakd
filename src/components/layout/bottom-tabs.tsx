"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useRebalanceAlertCount } from "@/hooks/use-rebalance-alert-count";
import { useTranslation } from "@/hooks/use-translation";
import { isNavigationPathActive } from "@/lib/navigation";
import { NAV_ITEMS } from "@/components/layout/nav-items";

/**
 * Phone navigation. Replaces the off-canvas drawer: five destinations,
 * always visible, each a 56px-tall target well past the 44px minimum.
 */
export function BottomTabs() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const alertCount = useRebalanceAlertCount();

  return (
    <nav
      aria-label={t("nav.title")}
      className="sticky bottom-0 z-30 grid grid-cols-5 border-t border-border bg-bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
        const active = isNavigationPathActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative -mt-px flex h-14 flex-col items-center justify-center gap-1 border-t-2",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset",
              active
                ? "border-accent text-text-primary"
                : "border-transparent text-text-muted"
            )}
          >
            <Icon className="h-[19px] w-[19px]" aria-hidden="true" />
            <span
              className={cn(
                "max-w-full truncate px-1 text-[10px] leading-3",
                active && "font-semibold"
              )}
            >
              {t(labelKey)}
            </span>
            {href === "/rebalance" && alertCount > 0 ? (
              <>
                <span
                  aria-hidden="true"
                  className="absolute right-3 top-2 rounded-sm border border-status-warning-border bg-status-warning-soft px-1 font-mono text-[10px] leading-4 text-status-warning"
                >
                  {alertCount}
                </span>
                <span className="sr-only">{t("nav.alertCount", { count: alertCount })}</span>
              </>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
