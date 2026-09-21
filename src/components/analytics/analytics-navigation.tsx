"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartNoAxesCombined, Clock3, Table2 } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

const items = [
  {
    href: "/analytics",
    labelKey: "reports.tabSummary" as const,
    icon: ChartNoAxesCombined,
  },
  {
    href: "/analytics/history",
    labelKey: "history.title" as const,
    icon: Clock3,
  },
  {
    href: "/analytics/allocation",
    labelKey: "allocationHistory.title" as const,
    icon: Table2,
  },
];

export function AnalyticsNavigation() {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <nav aria-label={t("nav.analytics")} className="flex gap-5 overflow-x-auto border-b border-border">
      {items.map(({ href, labelKey, icon: Icon }) => {
        const active =
          href === "/analytics" ? pathname === href : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-2.5 text-body font-semibold",
              "transition-colors duration-[120ms] ease-out",
              active
                ? "border-accent text-text-primary"
                : "border-transparent text-text-muted hover:text-text-primary"
            )}
          >
            <Icon className="h-4 w-4" />
            {t(labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
