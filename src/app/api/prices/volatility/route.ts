import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authError } from "@/lib/auth-guard";
import { computeTokenVolatilities } from "@/lib/pricing";

const DEFAULT_LOOKBACK_DAYS = 30;
const MIN_LOOKBACK_DAYS = 7;
const MAX_LOOKBACK_DAYS = 365;

function parseLookbackDays(raw: string | null): number {
  if (!raw) return DEFAULT_LOOKBACK_DAYS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LOOKBACK_DAYS;
  return Math.max(MIN_LOOKBACK_DAYS, Math.min(MAX_LOOKBACK_DAYS, parsed));
}

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
}

export async function GET(req: NextRequest) {
  const payload = await authenticateRequest(req);
  if (!payload) return authError();

  try {
    const { searchParams } = new URL(req.url);
    const lookbackDays = parseLookbackDays(searchParams.get("lookbackDays"));
    const ids = parseIds(searchParams.get("ids"));

    const volatilities = await computeTokenVolatilities(
      lookbackDays,
      ids.length > 0 ? ids : undefined
    );

    return NextResponse.json({
      lookbackDays,
      tokenCount: Object.keys(volatilities).length,
      volatilities,
    });
  } catch (error) {
    console.error("GET /api/prices/volatility error:", error);
    return NextResponse.json(
      { error: "Failed to compute volatilities" },
      { status: 500 }
    );
  }
}
