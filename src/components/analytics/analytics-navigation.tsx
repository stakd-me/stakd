"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartNoAxesCombined, Clock3, Table2 } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

const items = [
  {
    href: "/analytics",
    legacyPath: "/reports",
    labelKey: "reports.sectionOverview" as const,
    icon: ChartNoAxesCombined,
  },
  {
    href: "/analytics/history",
    legacyPath: "/history",
    labelKey: "history.title" as const,
    icon: Clock3,
  },
  {
    href: "/analytics/allocation",
    legacyPath: "/allocation-history",
    labelKey: "allocationHistory.title" as const,
    icon: Table2,
  },
];

export function AnalyticsNavigation() {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <nav aria-label={t("nav.analytics")} className="flex gap-1 overflow-x-auto border-b border-border-subtle">
      {items.map(({ href, legacyPath, labelKey, icon: Icon }) => {
        const active =
          pathname === href ||
          pathname === legacyPath ||
          (href !== "/analytics" && pathname.startsWith(`${href}/`));

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-accent text-text-primary"
                : "border-transparent text-text-subtle hover:text-text-primary"
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
