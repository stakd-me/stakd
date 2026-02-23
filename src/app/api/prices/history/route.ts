import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { authenticateRequest, authError } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
  const payload = await authenticateRequest(req);
  if (!payload) return authError();

  try {
    const { searchParams } = new URL(req.url);
    const coingeckoId = searchParams.get("coingeckoId");

    if (!coingeckoId) {
      return NextResponse.json(
        { error: "coingeckoId query parameter is required" },
        { status: 400 }
      );
    }

    const rows = await db
      .select()
      .from(schema.priceHistory)
      .where(eq(schema.priceHistory.coingeckoId, coingeckoId))
      .orderBy(desc(schema.priceHistory.recordedAt))
      .limit(500);

    return NextResponse.json({ history: rows.reverse() });
  } catch (e) {
    console.error("GET /api/prices/history error:", e);
    return NextResponse.json(
      { error: "Failed to get price history" },
      { status: 500 }
    );
  }
}
