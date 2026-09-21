"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore, useVaultStore } from "@/lib/store";
import {
  LayoutDashboard,
  Coins,
  Scale,
  Settings,
  LogOut,
  Menu,
  X,
  BookOpen,
  ChartNoAxesCombined,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "@/hooks/use-translation";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { clearEncKey } from "@/lib/crypto/key-store";
import { usePrices } from "@/hooks/use-prices";
import { getRebalanceAlertTokenCount } from "@/lib/services/rebalance-alerts";
import { isNavigationPathActive } from "@/lib/navigation";

const navKeys = [
  { href: "/dashboard", labelKey: "nav.dashboard" as const, icon: LayoutDashboard },
  { href: "/portfolio", labelKey: "nav.portfolio" as const, icon: Coins },
  { href: "/rebalance", labelKey: "nav.rebalance" as const, icon: Scale },
  { href: "/analytics", labelKey: "nav.analytics" as const, icon: ChartNoAxesCombined },
  { href: "/settings", labelKey: "nav.settings" as const, icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const clearVault = useVaultStore((s) => s.clearVault);
  const vault = useVaultStore((s) => s.vault);
  const { priceMap } = usePrices();
  const [mobileOpenPath, setMobileOpenPath] = useState<string | null>(null);
  const mobileOpen = mobileOpenPath === pathname;
  const { t } = useTranslation();

  // Keep the sidebar badge aligned with the dashboard/rebalance alert logic.
  const alertCount = useMemo(() => {
    return getRebalanceAlertTokenCount(vault, priceMap);
  }, [vault, priceMap]);


  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Logout endpoint may fail if session already expired
    }
    await clearEncKey();
    clearVault();
    clearAuth();
  };

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between p-4">
        <h1 className="text-lg font-bold text-text-primary">{t("nav.title")}</h1>
        <button
          onClick={() => setMobileOpenPath(null)}
          className="rounded-md p-1 text-text-subtle hover:bg-bg-hover hover:text-text-primary md:hidden"
          aria-label={t("nav.closeMenu")}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-2">
        {navKeys.map(({ href, labelKey, icon: Icon }) => (
          <div key={href}>
            <Link
              href={href}
              onClick={() => setMobileOpenPath(null)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isNavigationPathActive(pathname, href)
                  ? "bg-bg-hover text-text-primary"
                  : "text-text-subtle hover:bg-bg-hover hover:text-text-primary"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{t(labelKey)}</span>
              {href === "/rebalance" && alertCount > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full border border-status-negative-border bg-status-negative-soft px-1.5 text-xs font-bold text-status-negative">
                  {alertCount}
                </span>
              )}
            </Link>
          </div>
        ))}
      </nav>

      <div className="border-t border-border-subtle p-2">
        <Link
          href={pathname.startsWith("/rebalance") ? "/rebalance/guide" : "/guide"}
          onClick={() => setMobileOpenPath(null)}
          className="mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-subtle transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <BookOpen className="h-4 w-4" />
          {t("nav.guide")}
        </Link>
        <div className="flex items-center gap-1">
          <button
            onClick={handleLogout}
            className="flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text-subtle transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <LogOut className="h-4 w-4" />
            {t("common.logout")}
          </button>
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpenPath(pathname)}
        className="fixed left-4 top-4 z-40 rounded-md border border-border bg-bg-sidebar p-2 text-text-muted shadow-lg hover:bg-bg-hover md:hidden"
        aria-label={t("nav.openMenu")}
        aria-expanded={mobileOpen}
        aria-controls="mobile-sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-overlay-scrim md:hidden"
          onClick={() => setMobileOpenPath(null)}
        />
      )}

      <aside
        id="mobile-sidebar"
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.title")}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-border-subtle bg-bg-sidebar transition-transform duration-200 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>

      <aside className="hidden h-screen w-56 shrink-0 flex-col border-r border-border-subtle bg-bg-sidebar md:flex">
        {sidebarContent}
      </aside>
    </>
  );
}
