import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchSecondaryExchangePrices,
  fetchSecondarySinglePrice,
} from "@/lib/pricing/secondary-exchanges";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("secondary-exchanges", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("merges all exchanges with configured priority", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("okx.com/api/v5/market/tickers")) {
        return jsonResponse({
          code: "0",
          data: [
            { instId: "SOL-USDT", last: "100", open24h: "95" },
            { instId: "BTC-USDT", last: "50000", open24h: "48000" },
          ],
        });
      }

      if (url.includes("api.bybit.com/v5/market/tickers?category=spot")) {
        return jsonResponse({
          retCode: 0,
          result: {
            list: [
              { symbol: "SOLUSDT", lastPrice: "102", prevPrice24h: "100" },
              { symbol: "ETHUSDT", lastPrice: "3000", prevPrice24h: "2900" },
            ],
          },
        });
      }

      if (url.includes("api.mexc.com/api/v3/ticker/24hr")) {
        return jsonResponse([
          { symbol: "DOGEUSDT", lastPrice: "0.2", openPrice: "0.18" },
          { symbol: "SOLUSDT", lastPrice: "103", openPrice: "100" },
        ]);
      }

      if (url.includes("gateio.ws/api/v4/spot/tickers")) {
        return jsonResponse([
          { currency_pair: "XRP_USDT", last: "0.6", change_percentage: "5.5" },
          { currency_pair: "SOL_USDT", last: "104", change_percentage: "4.2" },
        ]);
      }

      return jsonResponse({}, 404);
    });

    const prices = await fetchSecondaryExchangePrices();

    expect(prices.SOL.source).toBe("okx");
    expect(prices.SOL.priceUsd).toBe(100);
    expect(prices.BTC.source).toBe("okx");
    expect(prices.ETH.source).toBe("bybit");
    expect(prices.DOGE.source).toBe("mexc");
    expect(prices.XRP.source).toBe("gate");
  });

  it("returns single price with priority order okx -> bybit -> mexc -> gate", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: URL | RequestInfo) => {
      const url = String(input);

      if (url.includes("okx.com/api/v5/market/ticker")) {
        return jsonResponse({
          code: "0",
          data: [{ instId: "ADA-USDT", last: "0.8", open24h: "0.75" }],
        });
      }

      if (url.includes("api.bybit.com/v5/market/tickers?category=spot&symbol=ADAUSDT")) {
        return jsonResponse({
          retCode: 0,
          result: { list: [{ symbol: "ADAUSDT", lastPrice: "0.79", prevPrice24h: "0.74" }] },
        });
      }

      if (url.includes("api.mexc.com/api/v3/ticker/24hr?symbol=ADAUSDT")) {
        return jsonResponse({
          symbol: "ADAUSDT",
          lastPrice: "0.78",
          openPrice: "0.73",
        });
      }

      if (url.includes("gateio.ws/api/v4/spot/tickers?currency_pair=ADA_USDT")) {
        return jsonResponse([
          { currency_pair: "ADA_USDT", last: "0.77", change_percentage: "1.0" },
        ]);
      }

      return jsonResponse({}, 404);
    });

    const result = await fetchSecondarySinglePrice("ada");
    expect(result).not.toBeNull();
    expect(result?.source).toBe("okx");
    expect(result?.priceUsd).toBe(0.8);
  });
});
