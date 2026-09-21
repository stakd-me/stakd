import {
  ChartNoAxesCombined,
  Coins,
  LayoutDashboard,
  Scale,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { TranslationKeys } from "@/i18n";

export interface NavItem {
  href: string;
  labelKey: TranslationKeys;
  icon: LucideIcon;
}

/** One definition, read by the desktop rail and the phone tab bar. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/portfolio", labelKey: "nav.portfolio", icon: Coins },
  { href: "/rebalance", labelKey: "nav.rebalance", icon: Scale },
  { href: "/analytics", labelKey: "nav.analytics", icon: ChartNoAxesCombined },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
];
