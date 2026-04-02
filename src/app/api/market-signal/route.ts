import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authError } from "@/lib/auth-guard";

// BTC halving dates (used to estimate cycle position)
const HALVING_DATES = [
  new Date("2012-11-28"),
  new Date("2016-07-09"),
  new Date("2020-05-11"),
  new Date("2024-04-19"),
];
const AVG_CYCLE_DAYS = 1460; // ~4 years

interface MarketSignalData {
  fearGreed: { value: number; label: string } | null;
  btc200wMa: { price: number; ma: number; ratio: number } | null;
  cyclePosition: { daysSinceHalving: number; percent: number } | null;
  composite: {
    phase: "accumulate" | "hold" | "caution" | "danger";
    score: number; // 0-100
  };
  fetchedAt: string;
}

// In-memory cache (shared across requests within the same process)
let cachedSignal: MarketSignalData | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

async function fetchFearGreed(): Promise<{ value: number; label: string } | null> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const entry = json?.data?.[0];
    if (!entry) return null;
    return {
      value: parseInt(entry.value, 10),
      label: entry.value_classification,
    };
  } catch {
    return null;
  }
}

async function fetchBtc200wMa(): Promise<{
  price: number;
  ma: number;
  ratio: number;
} | null> {
  try {
    // Fetch BTC weekly closes for last ~210 weeks from CoinGecko (free, no key needed)
    // 200 weeks = 1400 days, fetch a bit more for safety
    const res = await fetch(
      "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1500&interval=daily",
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const prices: [number, number][] = json?.prices;
    if (!prices || prices.length < 200) return null;

    // Sample weekly closes (every 7th data point)
    const weeklyCloses: number[] = [];
    for (let i = 0; i < prices.length; i += 7) {
      weeklyCloses.push(prices[i][1]);
    }

    // Current price is the latest data point
    const currentPrice = prices[prices.length - 1][1];

    // 200-week MA = average of last 200 weekly closes
    const last200 = weeklyCloses.slice(-200);
    if (last200.length < 50) return null; // not enough data

    const ma = last200.reduce((sum, p) => sum + p, 0) / last200.length;
    const ratio = currentPrice / ma;

    return { price: currentPrice, ma, ratio };
  } catch {
    return null;
  }
}

function getCyclePosition(): { daysSinceHalving: number; percent: number } {
  const now = Date.now();
  // Find the most recent halving
  let lastHalving = HALVING_DATES[0];
  for (const h of HALVING_DATES) {
    if (h.getTime() <= now) lastHalving = h;
  }
  const daysSince = Math.floor(
    (now - lastHalving.getTime()) / (24 * 60 * 60 * 1000)
  );
  const percent = Math.min(100, (daysSince / AVG_CYCLE_DAYS) * 100);
  return { daysSinceHalving: daysSince, percent };
}

function computeComposite(
  fg: { value: number } | null,
  btcMa: { ratio: number } | null,
  cycle: { percent: number }
): { phase: "accumulate" | "hold" | "caution" | "danger"; score: number } {
  // Score 0 = max fear/undervalued, 100 = max greed/overvalued
  // Simple average of available factors (each normalized to 0-100)
  let score = 0;
  let factors = 0;

  // Fear & Greed: 0-100 maps directly
  if (fg) {
    score += fg.value;
    factors++;
  }

  // BTC/200W MA ratio:
  // ratio ~1.0 = at MA (score ~25), ratio ~2.0 = 100% above (score ~75), ratio ~3.0+ = danger (score ~100)
  if (btcMa) {
    const maScore = Math.min(100, Math.max(0, (btcMa.ratio - 0.5) * 50));
    score += maScore;
    factors++;
  }

  // Cycle position: early = low score, late = high score
  score += cycle.percent;
  factors++;

  score = factors > 0 ? score / factors : 50;

  // Map score to phase
  let phase: "accumulate" | "hold" | "caution" | "danger";
  if (score <= 30) phase = "accumulate";
  else if (score <= 55) phase = "hold";
  else if (score <= 75) phase = "caution";
  else phase = "danger";

  return { phase, score: Math.round(score) };
}

async function getMarketSignal(): Promise<MarketSignalData> {
  const now = Date.now();
  if (cachedSignal && now - cachedAt < CACHE_TTL_MS) {
    return cachedSignal;
  }

  const [fg, btcMa] = await Promise.all([
    fetchFearGreed(),
    fetchBtc200wMa(),
  ]);
  const cycle = getCyclePosition();
  const composite = computeComposite(fg, btcMa, cycle);

  const signal: MarketSignalData = {
    fearGreed: fg,
    btc200wMa: btcMa,
    cyclePosition: cycle,
    composite,
    fetchedAt: new Date().toISOString(),
  };

  cachedSignal = signal;
  cachedAt = now;
  return signal;
}

export async function GET(req: NextRequest) {
  const payload = await authenticateRequest(req);
  if (!payload) return authError();

  try {
    const signal = await getMarketSignal();
    return NextResponse.json(signal);
  } catch (e) {
    console.error("GET /api/market-signal error:", e);
    return NextResponse.json(
      { error: "Failed to fetch market signal" },
      { status: 500 }
    );
  }
}
