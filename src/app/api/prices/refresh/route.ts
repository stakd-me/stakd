import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authError } from "@/lib/auth-guard";
import { refreshAllPrices, getAllPrices } from "@/lib/pricing";
import { debounce } from "@/lib/redis";

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

export async function POST(req: NextRequest) {
  const payload = await authenticateRequest(req);
  if (!payload) return authError();

  try {
    // Debounce: at most once per 60 seconds
    const shouldRefresh = await debounce("prices:refresh", 60);

    if (shouldRefresh) {
      await refreshAllPrices();
    }

    const rawPrices = await getAllPrices();
    const { entries, oldestUpdatedAt } = normalizePrices(rawPrices);
    return NextResponse.json({
      prices: entries,
      updatedAt: oldestUpdatedAt,
      refreshed: shouldRefresh,
    });
  } catch (e) {
    console.error("POST /api/prices/refresh error:", e);
    return NextResponse.json(
      { error: "Failed to refresh prices" },
      { status: 500 }
    );
  }
}
