import { describe, expect, it } from "vitest";
import { formatUsd, formatUsdPrice } from "@/lib/utils";

describe("utils currency formatting", () => {
  it("keeps fixed 2 decimals for generic USD values", () => {
    expect(formatUsd(1234.567)).toBe("$1,234.57");
  });

  it("formats large token prices with 2 decimals", () => {
    expect(formatUsdPrice(52341.129)).toBe("$52,341.13");
  });

  it("formats medium token prices with adaptive precision", () => {
    expect(formatUsdPrice(1.234567)).toBe("$1.2346");
    expect(formatUsdPrice(0.1234567)).toBe("$0.123457");
  });

  it("formats small token prices without rounding to zero", () => {
    expect(formatUsdPrice(0.0003456789)).toBe("$0.00034568");
    expect(formatUsdPrice(0.00000123456)).toBe("$0.0000012346");
  });

  it("uses lower-bound indicator for extremely tiny token prices", () => {
    expect(formatUsdPrice(0.00000045)).toBe("<$0.000001");
  });
});
