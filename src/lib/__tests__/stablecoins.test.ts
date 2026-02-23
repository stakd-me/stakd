import { describe, expect, it } from "vitest";
import {
  buildStablecoinSymbolSet,
  isKnownStablecoinSymbol,
  withAutoStablecoinCategory,
} from "@/lib/constants/stablecoins";

describe("stablecoin helpers", () => {
  it("recognizes common stablecoin symbols", () => {
    expect(isKnownStablecoinSymbol("USDT")).toBe(true);
    expect(isKnownStablecoinSymbol("usdc")).toBe(true);
    expect(isKnownStablecoinSymbol("dai")).toBe(true);
    expect(isKnownStablecoinSymbol("FDUSD")).toBe(true);
    expect(isKnownStablecoinSymbol("TUSD")).toBe(true);
    expect(isKnownStablecoinSymbol("BTC")).toBe(false);
  });

  it("includes stablecoin categories and known symbols in the final set", () => {
    const symbols = buildStablecoinSymbolSet([
      { tokenSymbol: "susd", category: "stablecoin" },
      { tokenSymbol: "weth", category: "l1" },
    ]);

    expect(symbols.has("USDT")).toBe(true);
    expect(symbols.has("USDC")).toBe(true);
    expect(symbols.has("SUSD")).toBe(true);
    expect(symbols.has("WETH")).toBe(false);
  });

  it("auto-assigns stablecoin category for known stablecoin symbols", () => {
    const updated = withAutoStablecoinCategory([], "usdt", "2026-01-01T00:00:00.000Z");

    expect(updated).toHaveLength(1);
    expect(updated[0].tokenSymbol).toBe("USDT");
    expect(updated[0].category).toBe("stablecoin");
    expect(updated[0].updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("does not overwrite existing category assignment", () => {
    const existing = [
      {
        id: "1",
        tokenSymbol: "USDT",
        category: "cash",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const updated = withAutoStablecoinCategory(existing, "USDT");

    expect(updated).toEqual(existing);
  });
});
