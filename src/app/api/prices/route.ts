import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authError } from "@/lib/auth-guard";
import { getAllPrices } from "@/lib/pricing";
import { getBinanceWsManager } from "@/lib/pricing/binance-ws";
import { COINGECKO_TO_BINANCE_SYMBOL } from "@/lib/pricing/binance-symbol-resolver";

function normalizePrices(
  rawPrices: Awaited<ReturnType<typeof getAllPrices>>
) {
  const entries = Object.entries(rawPrices)
    .map(([coingeckoId, data]) => ({
      coingeckoId,
      symbol: data.symbol,
      priceUsd: data.usd,
      change24h: data.change24h,
      updatedAt: data.updatedAt.toISOString(),
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  const oldestUpdatedAt =
    entries.length > 0
      ? entries.reduce((oldest, p) =>
          p.updatedAt < oldest ? p.updatedAt : oldest
        , entries[0].updatedAt)
      : null;

  return { entries, oldestUpdatedAt };
}

export async function GET(req: NextRequest) {
  const payload = await authenticateRequest(req);
  if (!payload) return authError();

  try {
    // Prefer in-memory cache from WS manager (real-time) over DB (10s stale)
    const manager = getBinanceWsManager();
    if (manager) {
      const memPrices = manager.getPrices();
      if (memPrices.size > 0) {
        const entries = Array.from(memPrices.entries())
          .map(([coingeckoId, p]) => ({
            coingeckoId,
            symbol: COINGECKO_TO_BINANCE_SYMBOL[coingeckoId] ?? coingeckoId,
            priceUsd: p.priceUsd,
            change24h: p.change24h,
            updatedAt: new Date(p.updatedAt).toISOString(),
          }))
          .sort((a, b) => a.coingeckoId.localeCompare(b.coingeckoId));

        const oldestUpdatedAt =
          entries.length > 0
            ? entries.reduce(
                (oldest, p) => (p.updatedAt < oldest ? p.updatedAt : oldest),
                entries[0].updatedAt
              )
            : null;

        return NextResponse.json({ prices: entries, updatedAt: oldestUpdatedAt });
      }
    }

    // Fallback to DB when WS manager is not available (cold start)
    const rawPrices = await getAllPrices();
    const { entries, oldestUpdatedAt } = normalizePrices(rawPrices);
    return NextResponse.json({
      prices: entries,
      updatedAt: oldestUpdatedAt,
    });
  } catch (e) {
    console.error("GET /api/prices error:", e);
    return NextResponse.json(
      { error: "Failed to get prices" },
      { status: 500 }
    );
  }
}
