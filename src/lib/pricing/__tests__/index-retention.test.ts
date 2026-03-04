import { parsePriceHistoryRetentionDays } from "@/lib/pricing";

describe("parsePriceHistoryRetentionDays", () => {
  it("uses default when missing/invalid", () => {
    expect(parsePriceHistoryRetentionDays(undefined)).toBe(365);
    expect(parsePriceHistoryRetentionDays("abc")).toBe(365);
  });

  it("allows disabling with zero or negative values", () => {
    expect(parsePriceHistoryRetentionDays("0")).toBe(0);
    expect(parsePriceHistoryRetentionDays("-5")).toBe(0);
  });

  it("clamps retention to configured bounds", () => {
    expect(parsePriceHistoryRetentionDays("1")).toBe(7);
    expect(parsePriceHistoryRetentionDays("30")).toBe(30);
    expect(parsePriceHistoryRetentionDays("9000")).toBe(3650);
  });
});
