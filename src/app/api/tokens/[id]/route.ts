import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authError } from "@/lib/auth-guard";
import { getPrice } from "@/lib/pricing/coingecko";
import { fetchBinanceSinglePrice } from "@/lib/pricing/binance";
import { canFetchFromCoinGecko } from "@/lib/pricing/coingecko-fallback";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { resolveBinanceSymbol } from "@/lib/pricing/binance-symbol-resolver";
import { fetchSecondarySinglePrice } from "@/lib/pricing/secondary-exchanges";

/**
 * GET /api/tokens/:coingeckoId?symbol=BTC
 *
 * Fetches the current USD price for a token.
 * If `symbol` query param is provided, tries Binance first, then other CEX public APIs.
 * Falls back to CoinGecko only when CEX providers cannot serve the token price.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth) return authError();

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Token ID is required" }, { status: 400 });
  }

  const symbol = req.nextUrl.searchParams.get("symbol")?.trim().toUpperCase() || "";
  const normalizedId = id.trim().toLowerCase();
  const preferredBinanceSymbol = resolveBinanceSymbol(normalizedId, symbol);

  try {
    async function persistPrice(
      resolvedSymbol: string,
      priceUsd: number,
      change24h: number
    ): Promise<void> {
      const now = new Date();
      await db
        .insert(schema.prices)
        .values({
          coingeckoId: normalizedId,
          symbol: resolvedSymbol,
          priceUsd,
          change24h,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.prices.coingeckoId,
          set: {
            symbol: resolvedSymbol,
            priceUsd,
            change24h,
            updatedAt: now,
          },
        });

      await db.insert(schema.priceHistory).values({
        coingeckoId: normalizedId,
        priceUsd,
      });
    }

    // Try Binance first (mapped CoinGecko ID has priority over raw symbol)
    if (preferredBinanceSymbol) {
      const binanceData = await fetchBinanceSinglePrice(preferredBinanceSymbol);
      if (binanceData) {
        await persistPrice(
          preferredBinanceSymbol,
          binanceData.priceUsd,
          binanceData.change24h
        );

        return NextResponse.json({
          coingeckoId: normalizedId,
          priceUsd: binanceData.priceUsd,
          change24h: binanceData.change24h,
          source: "binance",
        });
      }

      const secondaryData = await fetchSecondarySinglePrice(preferredBinanceSymbol);
      if (secondaryData) {
        await persistPrice(
          preferredBinanceSymbol,
          secondaryData.priceUsd,
          secondaryData.change24h
        );

        return NextResponse.json({
          coingeckoId: normalizedId,
          priceUsd: secondaryData.priceUsd,
          change24h: secondaryData.change24h,
          source: secondaryData.source,
        });
      }
    }

    const [cached] = await db
      .select()
      .from(schema.prices)
      .where(eq(schema.prices.coingeckoId, normalizedId))
      .limit(1);

    const cachedResponse = cached
      ? {
          coingeckoId: normalizedId,
          priceUsd: cached.priceUsd,
          change24h: cached.change24h,
          source: "cache",
        }
      : null;

    if (cachedResponse && cachedResponse.priceUsd > 0) {
      return NextResponse.json(cachedResponse);
    }

    const canFetch = await canFetchFromCoinGecko(normalizedId);
    if (!canFetch) {
      if (cachedResponse) {
        return NextResponse.json(cachedResponse);
      }
      return NextResponse.json(
        { error: "Price fetch is cooling down, try again later" },
        { status: 429 }
      );
    }

    // Fall back to CoinGecko
    const prices = await getPrice([normalizedId]);
    const data = prices[normalizedId];
    if (!data) {
      if (cachedResponse) {
        return NextResponse.json(cachedResponse);
      }
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    const now = new Date();
    await db
      .insert(schema.prices)
      .values({
        coingeckoId: normalizedId,
        symbol:
          preferredBinanceSymbol ||
          symbol ||
          cached?.symbol ||
          normalizedId,
        priceUsd: data.usd,
        change24h: data.usd_24h_change,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.prices.coingeckoId,
        set: {
          symbol:
            preferredBinanceSymbol ||
            symbol ||
            cached?.symbol ||
            normalizedId,
          priceUsd: data.usd,
          change24h: data.usd_24h_change,
          updatedAt: now,
        },
      });

    await db.insert(schema.priceHistory).values({
      coingeckoId: normalizedId,
      priceUsd: data.usd,
    });

    return NextResponse.json({
      coingeckoId: normalizedId,
      priceUsd: data.usd,
      change24h: data.usd_24h_change,
      source: "coingecko",
    });
  } catch (e) {
    console.error(`GET /api/tokens/${id} error:`, e);
    return NextResponse.json(
      { error: "Failed to fetch token price" },
      { status: 500 }
    );
  }
}
