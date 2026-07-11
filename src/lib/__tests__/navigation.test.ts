import { isNavigationPathActive } from "@/lib/navigation";

describe("isNavigationPathActive", () => {
  it("groups legacy reporting routes under analytics", () => {
    expect(isNavigationPathActive("/reports", "/analytics")).toBe(true);
    expect(isNavigationPathActive("/history", "/analytics")).toBe(true);
    expect(isNavigationPathActive("/allocation-history", "/analytics")).toBe(true);
  });

  it("does not activate analytics for unrelated routes", () => {
    expect(isNavigationPathActive("/portfolio", "/analytics")).toBe(false);
  });

  it("matches regular navigation routes and descendants", () => {
    expect(isNavigationPathActive("/rebalance/guide", "/rebalance")).toBe(true);
    expect(isNavigationPathActive("/settings", "/portfolio")).toBe(false);
  });
});
