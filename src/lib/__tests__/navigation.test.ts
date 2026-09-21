import { isNavigationPathActive } from "@/lib/navigation";

describe("isNavigationPathActive", () => {
  it("matches a route and its descendants", () => {
    expect(isNavigationPathActive("/analytics", "/analytics")).toBe(true);
    expect(isNavigationPathActive("/analytics/history", "/analytics")).toBe(true);
    expect(isNavigationPathActive("/rebalance/guide", "/rebalance")).toBe(true);
  });

  it("does not match unrelated routes", () => {
    expect(isNavigationPathActive("/portfolio", "/analytics")).toBe(false);
    expect(isNavigationPathActive("/settings", "/portfolio")).toBe(false);
  });

  it("does not match a route that merely shares a prefix", () => {
    expect(isNavigationPathActive("/portfolio-archive", "/portfolio")).toBe(false);
  });
});
