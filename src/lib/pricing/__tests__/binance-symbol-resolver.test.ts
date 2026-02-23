import { describe, expect, it } from "vitest";
import { resolveBinanceSymbol } from "@/lib/pricing/binance-symbol-resolver";

describe("resolveBinanceSymbol", () => {
  it("prefers curated coingeckoId mapping over fallback symbol", () => {
    expect(resolveBinanceSymbol("bitcoin", "BTC2")).toBe("BTC");
    expect(resolveBinanceSymbol("the-open-network", "TONCOIN")).toBe("TON");
  });

  it("falls back to sanitized symbol for unknown ids", () => {
    expect(resolveBinanceSymbol("my-custom-token", "abc")).toBe("ABC");
    expect(resolveBinanceSymbol("my-custom-token", "  1inch  ")).toBe("1INCH");
  });

  it("returns null for invalid ids or symbols", () => {
    expect(resolveBinanceSymbol("", "BTC")).toBeNull();
    expect(resolveBinanceSymbol("unknown-token", "")).toBeNull();
    expect(resolveBinanceSymbol("unknown-token", "eth/usdt")).toBeNull();
  });
});
