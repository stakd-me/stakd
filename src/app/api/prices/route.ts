import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authError } from "@/lib/auth-guard";
import { getAllPrices } from "@/lib/pricing";

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
