import type {
  VaultAllocationSnapshot,
  VaultAllocationSnapshotItem,
  VaultData,
} from "@/lib/crypto/vault-types";
import type { PriceData } from "@/lib/services/portfolio-calculator";
import { getHoldings } from "@/lib/services/portfolio-calculator";
import { normalizeSymbol } from "@/lib/asset-key";
import { roundToTwo } from "@/lib/num";

export const ALLOCATION_HISTORY_ROWS_PER_PAGE = 52;
export const MAX_ALLOCATION_SNAPSHOTS = 1040;

const SNAPSHOT_UTC_HOUR = 0;
const SNAPSHOT_UTC_MINUTE = 1;

export interface AllocationPriceToken {
  coingeckoId: string;
  symbol: string;
}

export function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getUtcWeekStart(date: Date): Date {
  const weekStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const daysSinceMonday = (weekStart.getUTCDay() + 6) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
  weekStart.setUTCHours(0, 0, 0, 0);
  return weekStart;
}

export function getWeeklyAllocationUpdateTime(now: Date): Date {
  const updateTime = getUtcWeekStart(now);
  updateTime.setUTCHours(SNAPSHOT_UTC_HOUR, SNAPSHOT_UTC_MINUTE, 0, 0);
  return updateTime;
}

export function isWeeklyAllocationUpdateDue(now: Date): boolean {
  return now.getTime() >= getWeeklyAllocationUpdateTime(now).getTime();
}

export function getWeeklyAllocationWeekStartKey(now: Date): string {
  return toUtcDateKey(getUtcWeekStart(now));
}

const roundMoney = roundToTwo;
const roundPercent = roundToTwo;

export function getMissingAllocationPriceTokens(
  vault: VaultData,
  priceMap: Record<string, PriceData>
): AllocationPriceToken[] {
  const seen = new Set<string>();
  const missing: AllocationPriceToken[] = [];

  for (const holding of getHoldings(vault, priceMap)) {
    if (holding.currentQty <= 0 || holding.currentPrice > 0) {
      continue;
    }

    const symbol = normalizeSymbol(holding.symbol);
    const coingeckoId = holding.coingeckoId ?? symbol.toLowerCase();
    const key = `${symbol}:${coingeckoId}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    missing.push({ coingeckoId, symbol });
  }

  return missing;
}

export function hasAllocationSnapshotForWeek(
  snapshots: VaultAllocationSnapshot[],
  weekStart: string
): boolean {
  return snapshots.some((snapshot) => snapshot.weekStart === weekStart);
}

export function createWeeklyAllocationSnapshot(
  vault: VaultData,
  priceMap: Record<string, PriceData>,
  now: Date,
  createId: () => string
): VaultAllocationSnapshot | null {
  if (!isWeeklyAllocationUpdateDue(now)) {
    return null;
  }

  const holdings = getHoldings(vault, priceMap).filter(
    (holding) => holding.currentQty > 0
  );
  const totalValueUsd = holdings.reduce(
    (total, holding) => total + holding.currentValue,
    0
  );

  if (totalValueUsd <= 0) {
    return null;
  }

  const allocations: VaultAllocationSnapshotItem[] = holdings
    .filter((holding) => holding.currentValue > 0)
    .map((holding) => ({
      symbol: normalizeSymbol(holding.symbol),
      tokenName: holding.tokenName,
      coingeckoId: holding.coingeckoId,
      valueUsd: roundMoney(holding.currentValue),
      percent: roundPercent((holding.currentValue / totalValueUsd) * 100),
    }));

  if (allocations.length === 0) {
    return null;
  }

  const updateTime = getWeeklyAllocationUpdateTime(now);

  return {
    id: createId(),
    weekStart: getWeeklyAllocationWeekStartKey(now),
    updatedAt: updateTime.toISOString(),
    capturedAt: now.toISOString(),
    totalValueUsd: roundMoney(totalValueUsd),
    allocations,
  };
}

export function upsertAllocationSnapshot(
  snapshots: VaultAllocationSnapshot[],
  snapshot: VaultAllocationSnapshot
): VaultAllocationSnapshot[] {
  const next = snapshots
    .filter((item) => item.weekStart !== snapshot.weekStart)
    .concat(snapshot)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

  return next.slice(-MAX_ALLOCATION_SNAPSHOTS);
}

export function sortAllocationSnapshotsDesc(
  snapshots: VaultAllocationSnapshot[]
): VaultAllocationSnapshot[] {
  return [...snapshots].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getAllocationHistorySymbols(
  snapshots: VaultAllocationSnapshot[]
): string[] {
  const symbols: string[] = [];
  const seen = new Set<string>();

  for (const snapshot of sortAllocationSnapshotsDesc(snapshots)) {
    for (const allocation of snapshot.allocations) {
      const symbol = normalizeSymbol(allocation.symbol);
      if (seen.has(symbol)) {
        continue;
      }
      seen.add(symbol);
      symbols.push(symbol);
    }
  }

  return symbols;
}

export function getAllocationPercentMap(
  snapshot: VaultAllocationSnapshot
): Record<string, number> {
  const map: Record<string, number> = {};

  for (const allocation of snapshot.allocations) {
    map[normalizeSymbol(allocation.symbol)] = allocation.percent;
  }

  return map;
}

export const ALLOCATION_TREND_MAX_SERIES = 7;

export interface AllocationTrendSeries {
  /** Uppercase token symbol; "" for the aggregated "others" bucket. */
  symbol: string;
  isOthers: boolean;
  /** Percent per week, aligned with AllocationTrend.weeks (0 when absent). */
  percents: number[];
}

export interface AllocationTrend {
  /** Week-start keys (YYYY-MM-DD), oldest first. */
  weeks: string[];
  /** Top series by average percent, largest first; "others" (if any) last. */
  series: AllocationTrendSeries[];
}

/**
 * Chronological per-token allocation series for the stacked-area trend chart.
 * Tokens beyond maxSeries fold into a single "others" series — categorical
 * hues are assigned in fixed order and never cycled.
 */
export function buildAllocationTrend(
  snapshots: VaultAllocationSnapshot[],
  maxSeries: number = ALLOCATION_TREND_MAX_SERIES
): AllocationTrend {
  const sorted = [...snapshots].sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart)
  );
  const weeks = sorted.map((snapshot) => snapshot.weekStart);
  const percentMaps = sorted.map((snapshot) =>
    getAllocationPercentMap(snapshot)
  );

  const totals = new Map<string, number>();
  for (const percentMap of percentMaps) {
    for (const [symbol, percent] of Object.entries(percentMap)) {
      if (!symbol || !Number.isFinite(percent)) continue;
      totals.set(symbol, (totals.get(symbol) ?? 0) + percent);
    }
  }

  const ranked = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([symbol]) => symbol);
  const top = ranked.slice(0, maxSeries);
  const topSet = new Set(top);

  const series: AllocationTrendSeries[] = top.map((symbol) => ({
    symbol,
    isOthers: false,
    percents: percentMaps.map((percentMap) => {
      const percent = percentMap[symbol];
      return Number.isFinite(percent) ? roundToTwo(percent) : 0;
    }),
  }));

  if (ranked.length > top.length) {
    const others = percentMaps.map((percentMap) =>
      roundToTwo(
        Object.entries(percentMap).reduce(
          (sum, [symbol, percent]) =>
            !topSet.has(symbol) && Number.isFinite(percent)
              ? sum + percent
              : sum,
          0
        )
      )
    );
    series.push({ symbol: "", isOthers: true, percents: others });
  }

  return { weeks, series };
}

export function getAllocationPercentChange(
  currentSnapshot: VaultAllocationSnapshot,
  previousSnapshot: VaultAllocationSnapshot | null | undefined,
  symbol: string
): number | null {
  if (!previousSnapshot) {
    return null;
  }

  const normalizedSymbol = normalizeSymbol(symbol);
  const currentPercent = getAllocationPercentMap(currentSnapshot)[
    normalizedSymbol
  ];
  if (typeof currentPercent !== "number" || !Number.isFinite(currentPercent)) {
    return null;
  }

  const previousPercent =
    getAllocationPercentMap(previousSnapshot)[normalizedSymbol] ?? 0;
  if (!Number.isFinite(previousPercent)) {
    return null;
  }

  return roundPercent(currentPercent - previousPercent);
}

export function formatAllocationUpdateDate(
  snapshot: VaultAllocationSnapshot
): string {
  const updateDate = new Date(snapshot.updatedAt);
  if (!Number.isNaN(updateDate.getTime())) {
    return toUtcDateKey(updateDate);
  }
  return snapshot.weekStart;
}
