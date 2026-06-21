import type {
  VaultAllocationSnapshot,
  VaultAllocationSnapshotItem,
  VaultData,
} from "@/lib/crypto/vault-types";
import type { PriceData } from "@/lib/services/portfolio-calculator";
import { getHoldings } from "@/lib/services/portfolio-calculator";

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

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

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

export function formatAllocationUpdateDate(
  snapshot: VaultAllocationSnapshot
): string {
  const updateDate = new Date(snapshot.updatedAt);
  if (!Number.isNaN(updateDate.getTime())) {
    return toUtcDateKey(updateDate);
  }
  return snapshot.weekStart;
}
