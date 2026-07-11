const ANALYTICS_PATHS = [
  "/analytics",
  "/reports",
  "/history",
  "/allocation-history",
] as const;

export function isNavigationPathActive(pathname: string, href: string): boolean {
  if (href === "/analytics") {
    return ANALYTICS_PATHS.some((path) => pathname.startsWith(path));
  }

  return pathname.startsWith(href);
}
