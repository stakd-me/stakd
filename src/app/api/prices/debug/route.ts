import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authError } from "@/lib/auth-guard";
import { getBinanceWsManager } from "@/lib/pricing/binance-ws";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const payload = await authenticateRequest(req);
  if (!payload) return authError();

  const manager = getBinanceWsManager();

  // Check BTC specifically
  const btcDb = await db
    .select()
    .from(schema.prices)
    .where(eq(schema.prices.coingeckoId, "bitcoin"))
    .limit(1);

  const btcExchange = await db
    .select()
    .from(schema.exchangeCache)
    .where(eq(schema.exchangeCache.coingeckoId, "bitcoin"))
    .limit(1);

  const memPrices = manager?.getPrices();
  const btcMem = memPrices?.get("bitcoin");

  return NextResponse.json({
    wsManager: manager ? "running" : "not started",
    wsMemoryPriceCount: memPrices?.size ?? 0,
    btc: {
      db: btcDb[0] ?? null,
      exchangeCache: btcExchange[0] ?? null,
      memory: btcMem
        ? { priceUsd: btcMem.priceUsd, change24h: btcMem.change24h, updatedAt: new Date(btcMem.updatedAt).toISOString() }
        : null,
    },
  });
}
