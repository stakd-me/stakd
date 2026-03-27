import type { VaultData, VaultTransaction } from "@/lib/crypto/vault-types";
import type { TokenHolding } from "@/lib/services/portfolio-calculator";
import { expandTransactionForBalance } from "@/lib/transactions";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;

export type ReportPeriod = "weekly" | "monthly" | "quarterly" | "yearly" | "all-time";

export interface ReportWindow {
  startIso: string;
  endIso: string;
  previousStartIso: string;
  previousEndIso: string;
  label: string;
}

export interface ReportSummary {
  startValueUsd: number;
  endValueUsd: number;
  capitalNetFlowUsd: number;
  externalNetFlowUsd: number;
  tradingTurnoverUsd: number;
  netFlowUsd: number;
  pnlUsd: number;
  returnPercent: number;
  simpleReturnPercent: number;
  reconciliationGapUsd: number;
  maxDrawdownPercent: number;
  annualizedVolatilityPercent: number;
}

export interface ReportActivity {
  transactionCount: number;
  estimatedAmountTransactionCount: number;
  unknownAmountTransactionCount: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  receiveVolumeUsd: number;
  sendVolumeUsd: number;
  totalFeesUsd: number;
}

export type ReportDataQualityLevel = "exact" | "estimated" | "incomplete";

export interface ReportDataQuality {
  level: ReportDataQualityLevel;
  estimatedTransactionCount: number;
  unknownTransactionCount: number;
  notes: string[];
}

export interface ReportRisk {
  activeAssets: number;
  topConcentrationSymbol: string | null;
  topConcentrationPercent: number;
  herfindahlIndex: number;
  diversificationScore: number;
}

export interface ReportHoldingRow {
  symbol: string;
  valueUsd: number;
  percent: number;
  unrealizedPLUsd: number;
  unrealizedPLPercent: number;
  heldDays: number;
  unrealizedPnlPerHeldDayUsd: number;
}

export interface ReportLeader {
  symbol: string;
  returnPercent: number;
  pnlUsd: number;
  heldDays: number;
  pnlPerHeldDayUsd: number;
  annualizedReturnPercent: number;
}

export interface ReportPoint {
  date: string;
  value: number;
}

export interface PortfolioPeriodReport {
  period: ReportPeriod;
  generatedAt: string;
  window: ReportWindow;
  summary: ReportSummary;
  previousSummary: ReportSummary;
  activity: ReportActivity;
  dataQuality: ReportDataQuality;
  risk: ReportRisk;
  topHoldings: ReportHoldingRow[];
  bestPerformer: ReportLeader | null;
  worstPerformer: ReportLeader | null;
  timeline: ReportPoint[];
}

interface SnapshotPoint {
  timestamp: number;
  date: string;
  value: number;
  breakdownValues: Record<string, number>;
}

interface WindowBoundaries {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
}

interface DrawdownVolatility {
  maxDrawdownPercent: number;
  annualizedVolatilityPercent: number;
}

interface CashFlowEvent {
  timestamp: number;
  amountUsd: number;
}

interface WindowComputationResult {
  summary: ReportSummary;
  activity: ReportActivity;
  timeline: ReportPoint[];
  effectiveStartMs: number;
  amountQuality: AmountQualityCounts;
  startValueSource: StartValueSource;
}

interface AmountQualityCounts {
  exact: number;
  estimated: number;
  unknown: number;
}

interface WindowComputationOptions {
  startValueOverrideUsd?: number;
  disableFirstInWindowSnapshotAnchor?: boolean;
  includeStartBoundaryInActivity?: boolean;
  startValueSourceOverride?: StartValueSource;
}

type StartValueSource = "snapshot" | "override" | "estimated" | "backsolved";

interface RiskSnapshotResult {
  risk: ReportRisk;
  topHoldings: ReportHoldingRow[];
}

interface EstimatedAssetValueAtResult {
  valueByAsset: Record<string, number>;
  estimatedAssetCount: number;
  unknownAssetCount: number;
}

interface OpeningCapitalResult {
  valueUsd: number;
  exactTransactionCount: number;
  estimatedTransactionCount: number;
  unknownTransactionCount: number;
  confidence: number;
}

interface HistoricalPricePoint {
  timestamp: number;
  price: number;
}

type HistoricalPriceSeriesByAsset = Record<string, HistoricalPricePoint[]>;

type AmountResolutionSource = "exact" | "historical" | "unknown";

interface TransactionAmountResolution {
  amountUsd: number | null;
  source: AmountResolutionSource;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toSafeNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeSymbol(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeCoingeckoId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function makeAssetKey(symbol: unknown, coingeckoId: unknown): string {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedId = normalizeCoingeckoId(coingeckoId);
  if (!normalizedSymbol) return "";
  return `${normalizedSymbol}:${normalizedId}`;
}

function parseSnapshotBreakdown(raw: string): Record<string, number> {
  if (!raw || raw.trim().length === 0) return {};

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return {};

    const byAsset: Record<string, number> = {};

    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const key = makeAssetKey(
        (item as { symbol?: unknown }).symbol,
        (item as { coingeckoId?: unknown }).coingeckoId
      );
      if (!key) continue;

      const valueUsd = toSafeNumber((item as { valueUsd?: unknown }).valueUsd);
      if (!Number.isFinite(valueUsd)) continue;
      byAsset[key] = (byAsset[key] ?? 0) + valueUsd;
    }

    return byAsset;
  } catch {
    return {};
  }
}

function splitAssetKey(assetKey: string): { symbol: string; coingeckoId: string } {
  const [symbolRaw = "", coingeckoIdRaw = ""] = assetKey.split(":");
  return {
    symbol: normalizeSymbol(symbolRaw),
    coingeckoId: normalizeCoingeckoId(coingeckoIdRaw),
  };
}

function computeHeldDaysByAsset(
  transactions: VaultTransaction[],
  endMs: number
): Record<string, number> {
  const firstAcquireMsByAsset: Record<string, number> = {};

  for (const tx of transactions.flatMap(expandTransactionForBalance)) {
    const timestamp = new Date(tx.transactedAt).getTime();
    if (!Number.isFinite(timestamp) || timestamp > endMs) continue;
    if (tx.type !== "buy" && tx.type !== "receive") continue;
    if (toSafeNumber(tx.quantity) <= 0) continue;

    const key = makeAssetKey(tx.tokenSymbol, tx.coingeckoId);
    if (!key) continue;

    if (!(key in firstAcquireMsByAsset) || timestamp < firstAcquireMsByAsset[key]) {
      firstAcquireMsByAsset[key] = timestamp;
    }
  }

  const heldDaysByAsset: Record<string, number> = {};
  for (const [assetKey, firstAcquireMs] of Object.entries(firstAcquireMsByAsset)) {
    const deltaDays = (endMs - firstAcquireMs) / MS_PER_DAY;
    heldDaysByAsset[assetKey] = Math.max(1, Math.ceil(deltaDays));
  }

  return heldDaysByAsset;
}

function annualizeReturnPercent(returnPercent: number, heldDays: number): number {
  if (!Number.isFinite(returnPercent) || heldDays <= 0) return 0;
  const base = 1 + returnPercent / 100;
  if (base <= 0) return -100;
  const annualized = (base ** (365 / heldDays) - 1) * 100;
  if (!Number.isFinite(annualized)) return 0;
  return annualized;
}

function toUtcDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0
): Date {
  return new Date(
    Date.UTC(year, month, day, hour, minute, second, millisecond)
  );
}

function startOfUtcDay(date: Date): Date {
  return toUtcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function startOfUtcWeek(date: Date): Date {
  const dayStart = startOfUtcDay(date);
  const dayIndex = (dayStart.getUTCDay() + 6) % WEEK_DAYS; // Monday = 0
  return new Date(dayStart.getTime() - dayIndex * MS_PER_DAY);
}

function startOfUtcMonth(date: Date): Date {
  return toUtcDate(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function startOfUtcQuarter(date: Date): Date {
  const month = date.getUTCMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;
  return toUtcDate(date.getUTCFullYear(), quarterStartMonth, 1);
}

function startOfUtcYear(date: Date): Date {
  return toUtcDate(date.getUTCFullYear(), 0, 1);
}

function shiftMonths(date: Date, delta: number): Date {
  return toUtcDate(date.getUTCFullYear(), date.getUTCMonth() + delta, 1);
}

function getIsoWeekNumber(date: Date): number {
  const utcDate = startOfUtcDay(date);
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / MS_PER_DAY) + 1) / 7);
}

function formatWindowLabel(period: ReportPeriod, start: Date): string {
  if (period === "all-time") {
    return "All-time";
  }

  const year = start.getUTCFullYear();

  if (period === "weekly") {
    const week = getIsoWeekNumber(start);
    return `W${week} ${year}`;
  }
  if (period === "monthly") {
    const month = start.toLocaleString("en-US", {
      month: "short",
      timeZone: "UTC",
    });
    return `${month} ${year}`;
  }
  if (period === "quarterly") {
    const quarter = Math.floor(start.getUTCMonth() / 3) + 1;
    return `Q${quarter} ${year}`;
  }
  return String(year);
}

function findAllTimeStart(vault: VaultData, referenceDate: Date): Date {
  const endMs = referenceDate.getTime();
  const flowCandidates: number[] = [];

  for (const tx of vault.transactions) {
    const timestamp = new Date(tx.transactedAt).getTime();
    if (Number.isFinite(timestamp) && timestamp <= endMs) {
      flowCandidates.push(timestamp);
    }
  }

  for (const entry of vault.manualEntries) {
    const timestamp = new Date(entry.createdAt).getTime();
    if (Number.isFinite(timestamp) && timestamp <= endMs) {
      flowCandidates.push(timestamp);
    }
  }

  if (flowCandidates.length > 0) {
    return new Date(Math.min(...flowCandidates));
  }

  const snapshotCandidates = vault.portfolioSnapshots
    .map((snapshot) => new Date(snapshot.snapshotAt).getTime())
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp <= endMs);

  if (snapshotCandidates.length > 0) {
    return new Date(Math.min(...snapshotCandidates));
  }

  return referenceDate;
}

function getBoundaries(
  period: ReportPeriod,
  referenceDate: Date,
  vault: VaultData
): WindowBoundaries {
  const end = new Date(referenceDate);

  if (period === "all-time") {
    const start = findAllTimeStart(vault, referenceDate);
    return { start, end, previousStart: start, previousEnd: start };
  }

  if (period === "weekly") {
    const start = startOfUtcWeek(referenceDate);
    const previousStart = new Date(start.getTime() - WEEK_DAYS * MS_PER_DAY);
    const elapsedMs = Math.max(0, end.getTime() - start.getTime());
    const previousPeriodEnd = new Date(start.getTime() - 1);
    const previousEndCandidate = new Date(previousStart.getTime() + elapsedMs);
    const previousEnd =
      previousEndCandidate.getTime() > previousPeriodEnd.getTime()
        ? previousPeriodEnd
        : previousEndCandidate;
    return { start, end, previousStart, previousEnd };
  }

  if (period === "monthly") {
    const start = startOfUtcMonth(referenceDate);
    const previousStart = shiftMonths(start, -1);
    const elapsedMs = Math.max(0, end.getTime() - start.getTime());
    const previousPeriodEnd = new Date(start.getTime() - 1);
    const previousEndCandidate = new Date(previousStart.getTime() + elapsedMs);
    const previousEnd =
      previousEndCandidate.getTime() > previousPeriodEnd.getTime()
        ? previousPeriodEnd
        : previousEndCandidate;
    return { start, end, previousStart, previousEnd };
  }

  if (period === "quarterly") {
    const start = startOfUtcQuarter(referenceDate);
    const previousStart = shiftMonths(start, -3);
    const elapsedMs = Math.max(0, end.getTime() - start.getTime());
    const previousPeriodEnd = new Date(start.getTime() - 1);
    const previousEndCandidate = new Date(previousStart.getTime() + elapsedMs);
    const previousEnd =
      previousEndCandidate.getTime() > previousPeriodEnd.getTime()
        ? previousPeriodEnd
        : previousEndCandidate;
    return { start, end, previousStart, previousEnd };
  }

  const start = startOfUtcYear(referenceDate);
  const previousStart = toUtcDate(start.getUTCFullYear() - 1, 0, 1);
  const elapsedMs = Math.max(0, end.getTime() - start.getTime());
  const previousPeriodEnd = new Date(start.getTime() - 1);
  const previousEndCandidate = new Date(previousStart.getTime() + elapsedMs);
  const previousEnd =
    previousEndCandidate.getTime() > previousPeriodEnd.getTime()
      ? previousPeriodEnd
      : previousEndCandidate;
  return { start, end, previousStart, previousEnd };
}

function normalizeSnapshots(vault: VaultData): SnapshotPoint[] {
  return vault.portfolioSnapshots
    .map((snapshot) => {
      const timestamp = new Date(snapshot.snapshotAt).getTime();
      const value = toSafeNumber(snapshot.totalValueUsd);
      if (!Number.isFinite(timestamp) || !Number.isFinite(value)) return null;
      return {
        timestamp,
        date: new Date(timestamp).toISOString(),
        value,
        breakdownValues: parseSnapshotBreakdown(snapshot.breakdown),
      };
    })
    .filter((point): point is SnapshotPoint => point !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function getPointAtOrBefore(points: SnapshotPoint[], atMs: number): SnapshotPoint | null {
  if (points.length === 0) return null;

  let bestBefore: SnapshotPoint | null = null;
  for (const point of points) {
    if (point.timestamp > atMs) break;
    bestBefore = point;
  }

  return bestBefore;
}

function getValueAtOrBefore(points: SnapshotPoint[], atMs: number): number | null {
  const point = getPointAtOrBefore(points, atMs);
  return point ? point.value : null;
}

function buildCurrentAssetValueMap(holdings: TokenHolding[]): Record<string, number> {
  const byAsset: Record<string, number> = {};

  for (const holding of holdings) {
    if (holding.currentValue <= 0) continue;
    const key = makeAssetKey(holding.symbol, holding.coingeckoId);
    if (!key) continue;
    byAsset[key] = (byAsset[key] ?? 0) + holding.currentValue;
  }

  return byAsset;
}

function getExactTransactionUsdAmount(tx: VaultTransaction): number | null {
  const totalCost = toSafeNumber(tx.totalCost);
  if (totalCost > 0) return totalCost;

  const quantity = toSafeNumber(tx.quantity);
  const pricePerUnit = toSafeNumber(tx.pricePerUnit);
  const derived = quantity * pricePerUnit;
  if (Number.isFinite(derived) && derived > 0) return derived;

  return null;
}

function addHistoricalPricePoint(
  byAsset: HistoricalPriceSeriesByAsset,
  assetKey: string,
  timestamp: number,
  price: number
): void {
  if (!assetKey || !Number.isFinite(timestamp) || !Number.isFinite(price) || price <= 0) {
    return;
  }
  byAsset[assetKey] ??= [];
  byAsset[assetKey].push({ timestamp, price });
}

function buildHistoricalPriceSeriesByAsset(params: {
  transactions: VaultTransaction[];
  snapshots: SnapshotPoint[];
  manualEntries: VaultData["manualEntries"];
  endMs: number;
}): HistoricalPriceSeriesByAsset {
  const byAsset: HistoricalPriceSeriesByAsset = {};
  const txSorted = params.transactions.flatMap(expandTransactionForBalance).sort(
    (a, b) => new Date(a.transactedAt).getTime() - new Date(b.transactedAt).getTime()
  );

  for (const tx of txSorted) {
    const timestamp = new Date(tx.transactedAt).getTime();
    if (!Number.isFinite(timestamp) || timestamp > params.endMs) continue;

    const qty = Math.max(0, toSafeNumber(tx.quantity));
    if (qty <= 0) continue;
    const amount = getExactTransactionUsdAmount(tx);
    if (amount === null || amount <= 0) continue;

    const assetKey = makeAssetKey(tx.tokenSymbol, tx.coingeckoId);
    if (!assetKey) continue;
    addHistoricalPricePoint(byAsset, assetKey, timestamp, amount / qty);
  }

  const manualEntryAssets = new Set(
    params.manualEntries
      .map((entry) => makeAssetKey(entry.tokenSymbol, entry.coingeckoId))
      .filter((key) => key.length > 0)
  );

  const qtyByAsset: Record<string, number> = {};
  let txIndex = 0;
  for (const snapshot of params.snapshots) {
    if (snapshot.timestamp > params.endMs) break;
    while (txIndex < txSorted.length) {
      const tx = txSorted[txIndex];
      const timestamp = new Date(tx.transactedAt).getTime();
      if (!Number.isFinite(timestamp) || timestamp > snapshot.timestamp) break;
      const assetKey = makeAssetKey(tx.tokenSymbol, tx.coingeckoId);
      if (assetKey) {
        const qty = Math.max(0, toSafeNumber(tx.quantity));
        if (qty > 0) {
          if (tx.type === "buy" || tx.type === "receive") {
            qtyByAsset[assetKey] = (qtyByAsset[assetKey] ?? 0) + qty;
          } else {
            qtyByAsset[assetKey] = (qtyByAsset[assetKey] ?? 0) - qty;
          }
        }
      }
      txIndex += 1;
    }

    for (const [assetKey, valueUsd] of Object.entries(snapshot.breakdownValues)) {
      if (manualEntryAssets.has(assetKey)) continue;
      const qty = qtyByAsset[assetKey] ?? 0;
      if (qty <= 0 || valueUsd <= 0) continue;
      addHistoricalPricePoint(byAsset, assetKey, snapshot.timestamp, valueUsd / qty);
    }
  }

  for (const points of Object.values(byAsset)) {
    points.sort((a, b) => a.timestamp - b.timestamp);
  }
  return byAsset;
}

function findHistoricalPriceNearTimestamp(
  points: HistoricalPricePoint[] | undefined,
  atMs: number
): number | null {
  if (!points || points.length === 0) return null;
  const maxLookbackMs = 180 * MS_PER_DAY;
  const maxLookaheadMs = 45 * MS_PER_DAY;

  let before: HistoricalPricePoint | null = null;
  let after: HistoricalPricePoint | null = null;
  for (const point of points) {
    if (point.timestamp <= atMs) {
      before = point;
      continue;
    }
    after = point;
    break;
  }

  const beforeDistance = before ? atMs - before.timestamp : Number.POSITIVE_INFINITY;
  const afterDistance = after ? after.timestamp - atMs : Number.POSITIVE_INFINITY;
  const beforeAllowed = beforeDistance <= maxLookbackMs;
  const afterAllowed = afterDistance <= maxLookaheadMs;

  if (beforeAllowed && afterAllowed) {
    return beforeDistance <= afterDistance ? before!.price : after!.price;
  }
  if (beforeAllowed) return before!.price;
  if (afterAllowed) return after!.price;
  return null;
}

function resolveTransactionUsdAmount(params: {
  tx: VaultTransaction;
  historicalPriceByAsset: HistoricalPriceSeriesByAsset;
}): TransactionAmountResolution {
  const exact = getExactTransactionUsdAmount(params.tx);
  if (exact !== null) {
    return { amountUsd: exact, source: "exact" };
  }

  const qty = Math.max(0, toSafeNumber(params.tx.quantity));
  const assetKey = makeAssetKey(params.tx.tokenSymbol, params.tx.coingeckoId);
  if (!assetKey || qty <= 0) {
    return { amountUsd: null, source: "unknown" };
  }
  const timestamp = new Date(params.tx.transactedAt).getTime();
  if (!Number.isFinite(timestamp)) {
    return { amountUsd: null, source: "unknown" };
  }
  const historicalPrice = findHistoricalPriceNearTimestamp(
    params.historicalPriceByAsset[assetKey],
    timestamp
  );
  if (historicalPrice === null) {
    return { amountUsd: null, source: "unknown" };
  }
  return { amountUsd: qty * historicalPrice, source: "historical" };
}

function computeEstimatedAssetValueByAssetAt(params: {
  transactions: VaultTransaction[];
  atMs: number;
  historicalPriceByAsset: HistoricalPriceSeriesByAsset;
}): EstimatedAssetValueAtResult {
  const qtyByAsset: Record<string, number> = {};

  for (const tx of params.transactions.flatMap(expandTransactionForBalance)) {
    const timestamp = new Date(tx.transactedAt).getTime();
    if (!Number.isFinite(timestamp) || timestamp > params.atMs) continue;

    const key = makeAssetKey(tx.tokenSymbol, tx.coingeckoId);
    if (!key) continue;

    const qty = Math.max(0, toSafeNumber(tx.quantity));
    if (qty <= 0) continue;

    if (tx.type === "buy" || tx.type === "receive") {
      qtyByAsset[key] = (qtyByAsset[key] ?? 0) + qty;
    } else {
      qtyByAsset[key] = (qtyByAsset[key] ?? 0) - qty;
    }
  }

  const valueByAsset: Record<string, number> = {};
  let estimatedAssetCount = 0;
  let unknownAssetCount = 0;
  for (const [assetKey, qty] of Object.entries(qtyByAsset)) {
    if (qty <= 0) continue;
    const estimatedPrice = findHistoricalPriceNearTimestamp(
      params.historicalPriceByAsset[assetKey],
      params.atMs
    );
    if (estimatedPrice === null || estimatedPrice <= 0) {
      unknownAssetCount += 1;
      continue;
    }
    estimatedAssetCount += 1;
    valueByAsset[assetKey] = qty * estimatedPrice;
  }

  return {
    valueByAsset,
    estimatedAssetCount,
    unknownAssetCount,
  };
}

function computeEstimatedPortfolioValueAt(params: {
  transactions: VaultTransaction[];
  atMs: number;
  historicalPriceByAsset: HistoricalPriceSeriesByAsset;
}): EstimatedAssetValueAtResult & { valueUsd: number } {
  const valueByAsset = computeEstimatedAssetValueByAssetAt(params);
  return {
    ...valueByAsset,
    valueUsd: Object.values(valueByAsset.valueByAsset).reduce(
      (sum, value) => sum + value,
      0
    ),
  };
}

function computeOpeningCapitalAt(params: {
  transactions: VaultTransaction[];
  atMs: number;
  historicalPriceByAsset: HistoricalPriceSeriesByAsset;
}): OpeningCapitalResult {
  const pools: Record<string, { qty: number; costUsd: number }> = {};
  let exactTransactionCount = 0;
  let estimatedTransactionCount = 0;
  let unknownTransactionCount = 0;
  const sortedTransactions = params.transactions.flatMap(expandTransactionForBalance).sort(
    (a, b) => new Date(a.transactedAt).getTime() - new Date(b.transactedAt).getTime()
  );

  for (const tx of sortedTransactions) {
    const timestamp = new Date(tx.transactedAt).getTime();
    if (!Number.isFinite(timestamp) || timestamp > params.atMs) continue;

    const assetKey = makeAssetKey(tx.tokenSymbol, tx.coingeckoId);
    if (!assetKey) continue;

    const qty = Math.max(0, toSafeNumber(tx.quantity));
    if (qty <= 0) continue;

    if (!pools[assetKey]) {
      pools[assetKey] = { qty: 0, costUsd: 0 };
    }

    const resolved = resolveTransactionUsdAmount({
      tx,
      historicalPriceByAsset: params.historicalPriceByAsset,
    });
    const amountUsd = resolved.amountUsd === null ? null : Math.max(0, resolved.amountUsd);
    const feeUsd = Math.max(0, toSafeNumber(tx.fee));
    const pool = pools[assetKey];

    if (tx.type === "buy") {
      pool.qty += qty;
      if (amountUsd !== null) {
        pool.costUsd += amountUsd + feeUsd;
        if (resolved.source === "exact") {
          exactTransactionCount += 1;
        } else {
          estimatedTransactionCount += 1;
        }
      } else {
        unknownTransactionCount += 1;
      }
      continue;
    }

    if (tx.type === "receive") {
      pool.qty += qty;
      if (amountUsd !== null) {
        pool.costUsd += amountUsd;
        if (resolved.source === "exact") {
          exactTransactionCount += 1;
        } else {
          estimatedTransactionCount += 1;
        }
      } else {
        unknownTransactionCount += 1;
      }
      continue;
    }

    if (pool.qty <= 0) continue;
    const reduceQty = Math.min(qty, pool.qty);
    const avgCost = pool.costUsd / pool.qty;
    pool.qty -= reduceQty;
    pool.costUsd = Math.max(0, pool.costUsd - avgCost * reduceQty);
  }

  const valueUsd = Object.values(pools).reduce((sum, pool) => sum + pool.costUsd, 0);
  const total = exactTransactionCount + estimatedTransactionCount + unknownTransactionCount;
  const confidence = total > 0 ? (exactTransactionCount + estimatedTransactionCount) / total : 0;

  return {
    valueUsd,
    exactTransactionCount,
    estimatedTransactionCount,
    unknownTransactionCount,
    confidence,
  };
}

function computeNetFlowByAsset(
  transactions: VaultTransaction[],
  startMs: number,
  endMs: number,
  historicalPriceByAsset: HistoricalPriceSeriesByAsset,
  includeStartBoundary = true
): Record<string, number> {
  const netFlowByAsset: Record<string, number> = {};

  for (const tx of transactions.flatMap(expandTransactionForBalance)) {
    const timestamp = new Date(tx.transactedAt).getTime();
    const isBeforeStart = includeStartBoundary ? timestamp < startMs : timestamp <= startMs;
    if (!Number.isFinite(timestamp) || isBeforeStart || timestamp > endMs) {
      continue;
    }

    const key = makeAssetKey(tx.tokenSymbol, tx.coingeckoId);
    if (!key) continue;

    const feeUsd = Math.max(0, toSafeNumber(tx.fee));
    const resolved = resolveTransactionUsdAmount({ tx, historicalPriceByAsset });
    if (resolved.amountUsd === null) {
      continue;
    }
    const amountUsd = Math.max(0, resolved.amountUsd);

    let flowUsd = 0;
    if (tx.type === "buy") {
      flowUsd = amountUsd + feeUsd;
    } else if (tx.type === "sell") {
      flowUsd = -Math.max(0, amountUsd - feeUsd);
    } else if (tx.type === "receive") {
      flowUsd = amountUsd;
    } else {
      flowUsd = -amountUsd;
    }

    netFlowByAsset[key] = (netFlowByAsset[key] ?? 0) + flowUsd;
  }

  return netFlowByAsset;
}

function computeActivity(
  transactions: VaultTransaction[],
  startMs: number,
  endMs: number,
  historicalPriceByAsset: HistoricalPriceSeriesByAsset,
  includeStartBoundary = true
): ReportActivity & {
  capitalNetFlowUsd: number;
  externalNetFlowUsd: number;
  tradingTurnoverUsd: number;
  flowEvents: CashFlowEvent[];
  amountQuality: AmountQualityCounts;
} {
  let transactionCount = 0;
  let estimatedAmountTransactionCount = 0;
  let unknownAmountTransactionCount = 0;
  let buyVolumeUsd = 0;
  let sellVolumeUsd = 0;
  let receiveVolumeUsd = 0;
  let sendVolumeUsd = 0;
  let totalFeesUsd = 0;
  let capitalNetFlowUsd = 0;
  let externalNetFlowUsd = 0;
  let tradingTurnoverUsd = 0;
  const flowEvents: CashFlowEvent[] = [];

  for (const tx of transactions) {
    const timestamp = new Date(tx.transactedAt).getTime();
    const isBeforeStart = includeStartBoundary ? timestamp < startMs : timestamp <= startMs;
    if (!Number.isFinite(timestamp) || isBeforeStart || timestamp > endMs) {
      continue;
    }

    const feeUsd = Math.max(0, toSafeNumber(tx.fee));
    transactionCount += 1;
    totalFeesUsd += feeUsd;

    const resolved = resolveTransactionUsdAmount({ tx, historicalPriceByAsset });
    if (resolved.source === "historical") {
      estimatedAmountTransactionCount += 1;
    }
    if (resolved.source === "unknown" || resolved.amountUsd === null) {
      unknownAmountTransactionCount += 1;
      continue;
    }
    const amountUsd = Math.max(0, resolved.amountUsd);

    if (tx.type === "buy") {
      buyVolumeUsd += amountUsd;
      tradingTurnoverUsd += amountUsd;
      const flow = amountUsd + feeUsd;
      capitalNetFlowUsd += flow;
      flowEvents.push({ timestamp, amountUsd: flow });
      continue;
    }

    if (tx.type === "sell") {
      sellVolumeUsd += amountUsd;
      tradingTurnoverUsd += amountUsd;
      const flow = -Math.max(0, amountUsd - feeUsd);
      capitalNetFlowUsd += flow;
      flowEvents.push({ timestamp, amountUsd: flow });
      continue;
    }

    if (tx.type === "receive") {
      receiveVolumeUsd += amountUsd;
      capitalNetFlowUsd += amountUsd;
      externalNetFlowUsd += amountUsd;
      flowEvents.push({ timestamp, amountUsd });
      continue;
    }

    sendVolumeUsd += amountUsd;
    capitalNetFlowUsd -= amountUsd;
    externalNetFlowUsd -= amountUsd;
    flowEvents.push({ timestamp, amountUsd: -amountUsd });
  }

  return {
    transactionCount,
    estimatedAmountTransactionCount,
    unknownAmountTransactionCount,
    buyVolumeUsd: roundTo(buyVolumeUsd, 2),
    sellVolumeUsd: roundTo(sellVolumeUsd, 2),
    receiveVolumeUsd: roundTo(receiveVolumeUsd, 2),
    sendVolumeUsd: roundTo(sendVolumeUsd, 2),
    totalFeesUsd: roundTo(totalFeesUsd, 2),
    capitalNetFlowUsd: roundTo(capitalNetFlowUsd, 2),
    externalNetFlowUsd: roundTo(externalNetFlowUsd, 2),
    tradingTurnoverUsd: roundTo(tradingTurnoverUsd, 2),
    flowEvents,
    amountQuality: {
      exact: Math.max(
        0,
        transactionCount - estimatedAmountTransactionCount - unknownAmountTransactionCount
      ),
      estimated: estimatedAmountTransactionCount,
      unknown: unknownAmountTransactionCount,
    },
  };
}

function addTimelinePoint(map: Map<number, number>, timestamp: number, value: number): void {
  if (!Number.isFinite(timestamp) || !Number.isFinite(value)) return;
  map.set(timestamp, value);
}

function computeDrawdownAndVolatility(points: ReportPoint[]): DrawdownVolatility {
  if (points.length < 2) {
    return {
      maxDrawdownPercent: 0,
      annualizedVolatilityPercent: 0,
    };
  }

  let peak = points[0].value;
  let maxDrawdown = 0;
  const returns: number[] = [];
  const stepDays: number[] = [];

  for (let i = 1; i < points.length; i++) {
    const current = points[i];
    const previous = points[i - 1];

    peak = Math.max(peak, current.value);
    if (peak > 0) {
      const drawdown = ((peak - current.value) / peak) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    if (previous.value > 0) {
      returns.push((current.value - previous.value) / previous.value);
      const step = (new Date(current.date).getTime() - new Date(previous.date).getTime()) / MS_PER_DAY;
      if (step > 0) stepDays.push(step);
    }
  }

  if (returns.length < 2 || stepDays.length === 0) {
    return {
      maxDrawdownPercent: roundTo(maxDrawdown, 2),
      annualizedVolatilityPercent: 0,
    };
  }

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(Math.max(variance, 0));

  const avgStepDays = stepDays.reduce((sum, value) => sum + value, 0) / stepDays.length;
  const annualizationFactor = avgStepDays > 0 ? Math.sqrt(365 / avgStepDays) : 0;
  const annualizedVolatilityPercent = stdDev * annualizationFactor * 100;

  return {
    maxDrawdownPercent: roundTo(maxDrawdown, 2),
    annualizedVolatilityPercent: roundTo(annualizedVolatilityPercent, 2),
  };
}

function computeModifiedDietzReturnPercent(params: {
  startValueUsd: number;
  pnlUsd: number;
  flowEvents: CashFlowEvent[];
  startMs: number;
  endMs: number;
}): number {
  const periodMs = params.endMs - params.startMs;
  if (!Number.isFinite(periodMs) || periodMs <= 0) return 0;

  const weightedFlows = params.flowEvents.reduce((sum, event) => {
    const clampedTimestamp = Math.max(params.startMs, Math.min(params.endMs, event.timestamp));
    const weight = (params.endMs - clampedTimestamp) / periodMs;
    return sum + event.amountUsd * weight;
  }, 0);

  const denominator = params.startValueUsd + weightedFlows;
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-9) {
    return 0;
  }
  return (params.pnlUsd / denominator) * 100;
}

function computeWindow(
  snapshots: SnapshotPoint[],
  transactions: VaultTransaction[],
  startMs: number,
  endMs: number,
  fallbackEndValue: number,
  historicalPriceByAsset: HistoricalPriceSeriesByAsset,
  options: WindowComputationOptions = {}
): WindowComputationResult {
  const endValue = getValueAtOrBefore(snapshots, endMs) ?? fallbackEndValue;
  const startPointAtOrBefore = getPointAtOrBefore(snapshots, startMs);
  const firstSnapshotInWindow = options.disableFirstInWindowSnapshotAnchor
    ? null
    : snapshots.find(
        (snapshot) => snapshot.timestamp >= startMs && snapshot.timestamp <= endMs
      ) ?? null;

  let effectiveStartMs = startMs;
  let startValue = 0;
  let startValueSource: StartValueSource = "snapshot";

  if (Number.isFinite(options.startValueOverrideUsd)) {
    startValue = options.startValueOverrideUsd ?? 0;
    startValueSource = options.startValueSourceOverride ?? "override";
  } else if (startPointAtOrBefore) {
    startValue = startPointAtOrBefore.value;
    startValueSource = "snapshot";
  } else if (firstSnapshotInWindow) {
    effectiveStartMs = firstSnapshotInWindow.timestamp;
    startValue = firstSnapshotInWindow.value;
    startValueSource = "snapshot";
  } else {
    const estimatedStartValue = computeEstimatedPortfolioValueAt({
      transactions,
      atMs: startMs,
      historicalPriceByAsset,
    });

    if (estimatedStartValue.valueUsd > 0) {
      startValue = estimatedStartValue.valueUsd;
      startValueSource = "estimated";
    } else {
      const provisionalActivity = computeActivity(
        transactions,
        startMs,
        endMs,
        historicalPriceByAsset,
        options.includeStartBoundaryInActivity ?? true
      );
      startValue = Math.max(0, endValue - provisionalActivity.capitalNetFlowUsd);
      startValueSource = "backsolved";
    }
  }

  const activityWithFlow = computeActivity(
    transactions,
    effectiveStartMs,
    endMs,
    historicalPriceByAsset,
    options.includeStartBoundaryInActivity ?? true
  );

  const timelineMap = new Map<number, number>();
  addTimelinePoint(timelineMap, effectiveStartMs, startValue);
  for (const snapshot of snapshots) {
    if (snapshot.timestamp >= effectiveStartMs && snapshot.timestamp <= endMs) {
      addTimelinePoint(timelineMap, snapshot.timestamp, snapshot.value);
    }
  }
  addTimelinePoint(timelineMap, endMs, endValue);

  const timeline = [...timelineMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([timestamp, value]) => ({
      date: new Date(timestamp).toISOString(),
      value: roundTo(value, 2),
    }));

  const pnlUsd = endValue - startValue - activityWithFlow.capitalNetFlowUsd;
  const simpleReturnDenominatorBase =
    startValue + Math.max(activityWithFlow.capitalNetFlowUsd, 0);
  const simpleReturnPercent =
    simpleReturnDenominatorBase > 0
      ? (pnlUsd / simpleReturnDenominatorBase) * 100
      : 0;
  const returnPercent = computeModifiedDietzReturnPercent({
    startValueUsd: startValue,
    pnlUsd,
    flowEvents: activityWithFlow.flowEvents,
    startMs: effectiveStartMs,
    endMs,
  });
  const reconciliationGapUsd =
    endValue - (startValue + activityWithFlow.capitalNetFlowUsd + pnlUsd);
  const roundedPnlUsd = roundTo(pnlUsd, 2);
  const roundedReturnPercent = roundTo(returnPercent, 2);
  const roundedSimpleReturnPercent = roundTo(simpleReturnPercent, 2);
  const roundedCapitalNetFlowUsd = roundTo(activityWithFlow.capitalNetFlowUsd, 2);
  const roundedExternalNetFlowUsd = roundTo(activityWithFlow.externalNetFlowUsd, 2);
  const roundedTradingTurnoverUsd = roundTo(activityWithFlow.tradingTurnoverUsd, 2);
  const roundedReconciliationGapUsd = roundTo(reconciliationGapUsd, 2);

  const riskSeries =
    timeline.length > 1
      ? timeline
      : [
          { date: new Date(effectiveStartMs).toISOString(), value: startValue },
          { date: new Date(endMs).toISOString(), value: endValue },
        ];
  const drawdownVolatility = computeDrawdownAndVolatility(riskSeries);

  return {
    summary: {
      startValueUsd: roundTo(startValue, 2),
      endValueUsd: roundTo(endValue, 2),
      capitalNetFlowUsd: roundedCapitalNetFlowUsd,
      externalNetFlowUsd: roundedExternalNetFlowUsd,
      tradingTurnoverUsd: roundedTradingTurnoverUsd,
      netFlowUsd: roundedCapitalNetFlowUsd,
      pnlUsd: roundedPnlUsd,
      returnPercent: roundedReturnPercent,
      simpleReturnPercent: roundedSimpleReturnPercent,
      reconciliationGapUsd: roundedReconciliationGapUsd,
      maxDrawdownPercent: drawdownVolatility.maxDrawdownPercent,
      annualizedVolatilityPercent: drawdownVolatility.annualizedVolatilityPercent,
    },
    activity: {
      transactionCount: activityWithFlow.transactionCount,
      estimatedAmountTransactionCount: activityWithFlow.estimatedAmountTransactionCount,
      unknownAmountTransactionCount: activityWithFlow.unknownAmountTransactionCount,
      buyVolumeUsd: activityWithFlow.buyVolumeUsd,
      sellVolumeUsd: activityWithFlow.sellVolumeUsd,
      receiveVolumeUsd: activityWithFlow.receiveVolumeUsd,
      sendVolumeUsd: activityWithFlow.sendVolumeUsd,
      totalFeesUsd: activityWithFlow.totalFeesUsd,
    },
    timeline,
    effectiveStartMs,
    amountQuality: activityWithFlow.amountQuality,
    startValueSource,
  };
}

function computeRiskSnapshot(
  holdings: TokenHolding[],
  currentTotalValueUsd: number,
  heldDaysByAsset: Record<string, number>
): RiskSnapshotResult {
  const active = holdings
    .filter((holding) => holding.currentQty > 0 && holding.currentValue > 0)
    .map((holding) => {
      const percent =
        currentTotalValueUsd > 0
          ? (holding.currentValue / currentTotalValueUsd) * 100
          : 0;
      const assetKey = makeAssetKey(holding.symbol, holding.coingeckoId);
      const heldDays = heldDaysByAsset[assetKey] ?? 0;
      const unrealizedPnlPerHeldDayUsd =
        heldDays > 0 ? holding.unrealizedPL / heldDays : holding.unrealizedPL;

      return {
        symbol: holding.symbol.toUpperCase(),
        valueUsd: roundTo(holding.currentValue, 2),
        percent: roundTo(percent, 2),
        unrealizedPLUsd: roundTo(holding.unrealizedPL, 2),
        unrealizedPLPercent: roundTo(holding.unrealizedPLPercent, 2),
        heldDays,
        unrealizedPnlPerHeldDayUsd: roundTo(unrealizedPnlPerHeldDayUsd, 2),
      };
    })
    .sort((a, b) => b.valueUsd - a.valueUsd);

  const top = active[0] ?? null;
  const herfindahlIndex = active.reduce(
    (sum, row) => sum + (row.percent / 100) ** 2,
    0
  );
  const diversificationScore =
    herfindahlIndex > 0 ? 1 / herfindahlIndex : active.length;

  return {
    risk: {
      activeAssets: active.length,
      topConcentrationSymbol: top?.symbol ?? null,
      topConcentrationPercent: roundTo(top?.percent ?? 0, 2),
      herfindahlIndex: roundTo(herfindahlIndex, 4),
      diversificationScore: roundTo(diversificationScore, 2),
    },
    topHoldings: active.slice(0, 10),
  };
}

function computePeriodLeaders(params: {
  holdings: TokenHolding[];
  snapshots: SnapshotPoint[];
  transactions: VaultTransaction[];
  heldDaysByAsset: Record<string, number>;
  historicalPriceByAsset: HistoricalPriceSeriesByAsset;
  startMs: number;
  endMs: number;
  includeStartBoundaryInFlow?: boolean;
}): {
  bestPerformer: ReportLeader | null;
  worstPerformer: ReportLeader | null;
} {
  const startSnapshot =
    getPointAtOrBefore(params.snapshots, params.startMs) ??
    params.snapshots.find(
      (snapshot) => snapshot.timestamp >= params.startMs && snapshot.timestamp <= params.endMs
    ) ??
    null;
  const endSnapshot = getPointAtOrBefore(params.snapshots, params.endMs);
  const endFallbackValues = buildCurrentAssetValueMap(params.holdings);
  const estimatedStartValues = computeEstimatedAssetValueByAssetAt({
    transactions: params.transactions,
    atMs: params.startMs,
    historicalPriceByAsset: params.historicalPriceByAsset,
  });
  const startValues = startSnapshot?.breakdownValues ?? estimatedStartValues.valueByAsset;
  const endValues = endSnapshot?.breakdownValues ?? endFallbackValues;
  const netFlowByAsset = computeNetFlowByAsset(
    params.transactions,
    params.startMs,
    params.endMs,
    params.historicalPriceByAsset,
    params.includeStartBoundaryInFlow ?? true
  );

  const keys = new Set([
    ...Object.keys(startValues),
    ...Object.keys(endValues),
    ...Object.keys(netFlowByAsset),
  ]);

  const ranked = [...keys]
    .map((assetKey) => {
      const startValue = startValues[assetKey] ?? 0;
      const endValue = endValues[assetKey] ?? 0;
      const netFlowUsd = netFlowByAsset[assetKey] ?? 0;
      const pnlUsd = endValue - startValue - netFlowUsd;
      const denominator = startValue + Math.max(netFlowUsd, 0);
      const returnPercent = denominator > 0 ? (pnlUsd / denominator) * 100 : 0;
      const heldDays = params.heldDaysByAsset[assetKey] ?? 0;
      const pnlPerHeldDayUsd = heldDays > 0 ? pnlUsd / heldDays : pnlUsd;
      const annualizedReturnPercent = annualizeReturnPercent(returnPercent, heldDays);
      const { symbol } = splitAssetKey(assetKey);

      return {
        symbol,
        pnlUsd,
        returnPercent,
        heldDays,
        pnlPerHeldDayUsd,
        annualizedReturnPercent,
        hasMeaningfulData: startValue > 0 || endValue > 0 || netFlowUsd !== 0,
      };
    })
    .filter((row) => row.symbol.length > 0 && row.hasMeaningfulData)
    .sort((a, b) => {
      if (b.returnPercent !== a.returnPercent) {
        return b.returnPercent - a.returnPercent;
      }
      return b.pnlUsd - a.pnlUsd;
    });

  const best = ranked[0] ?? null;
  const worst = ranked[ranked.length - 1] ?? null;

  return {
    bestPerformer: best
      ? {
          symbol: best.symbol,
          returnPercent: roundTo(best.returnPercent, 2),
          pnlUsd: roundTo(best.pnlUsd, 2),
          heldDays: best.heldDays,
          pnlPerHeldDayUsd: roundTo(best.pnlPerHeldDayUsd, 2),
          annualizedReturnPercent: roundTo(best.annualizedReturnPercent, 2),
        }
      : null,
    worstPerformer: worst
      ? {
          symbol: worst.symbol,
          returnPercent: roundTo(worst.returnPercent, 2),
          pnlUsd: roundTo(worst.pnlUsd, 2),
          heldDays: worst.heldDays,
          pnlPerHeldDayUsd: roundTo(worst.pnlPerHeldDayUsd, 2),
          annualizedReturnPercent: roundTo(worst.annualizedReturnPercent, 2),
        }
      : null,
  };
}

function determineDataQuality(params: {
  currentWindow: WindowComputationResult;
  additionalEstimatedCount: number;
  additionalUnknownCount: number;
  notes: string[];
}): ReportDataQuality {
  const estimatedTransactionCount =
    params.currentWindow.amountQuality.estimated + params.additionalEstimatedCount;
  const unknownTransactionCount =
    params.currentWindow.amountQuality.unknown + params.additionalUnknownCount;

  let level: ReportDataQualityLevel = "exact";
  if (
    unknownTransactionCount > 0 ||
    params.currentWindow.startValueSource === "backsolved"
  ) {
    level = "incomplete";
  } else if (
    estimatedTransactionCount > 0 ||
    params.currentWindow.startValueSource === "estimated"
  ) {
    level = "estimated";
  }

  return {
    level,
    estimatedTransactionCount,
    unknownTransactionCount,
    notes: params.notes,
  };
}

export function computePortfolioReport(params: {
  vault: VaultData;
  holdings: TokenHolding[];
  currentTotalValueUsd: number;
  period: ReportPeriod;
  referenceDate?: Date;
}): PortfolioPeriodReport {
  const referenceDate = params.referenceDate ?? new Date();
  const boundaries = getBoundaries(params.period, referenceDate, params.vault);
  const normalizedSnapshots = normalizeSnapshots(params.vault);
  const historicalPriceByAsset = buildHistoricalPriceSeriesByAsset({
    transactions: params.vault.transactions,
    snapshots: normalizedSnapshots,
    manualEntries: params.vault.manualEntries,
    endMs: boundaries.end.getTime(),
  });
  const isAllTime = params.period === "all-time";
  const qualityNotes: string[] = [];

  let allTimeOpeningCapital: OpeningCapitalResult | null = null;
  let currentWindowOptions: WindowComputationOptions | undefined;
  if (isAllTime) {
    allTimeOpeningCapital = computeOpeningCapitalAt({
      transactions: params.vault.transactions,
      atMs: boundaries.start.getTime(),
      historicalPriceByAsset,
    });
    const inceptionSnapshot = normalizedSnapshots.find(
      (snapshot) =>
        snapshot.timestamp >= boundaries.start.getTime() &&
        snapshot.timestamp <= boundaries.start.getTime() + 30 * MS_PER_DAY
    );

    if (allTimeOpeningCapital.valueUsd > 0 && allTimeOpeningCapital.confidence >= 0.9) {
      currentWindowOptions = {
        startValueOverrideUsd: allTimeOpeningCapital.valueUsd,
        disableFirstInWindowSnapshotAnchor: true,
        includeStartBoundaryInActivity: false,
        startValueSourceOverride:
          allTimeOpeningCapital.estimatedTransactionCount > 0 ? "estimated" : "override",
      };
      if (allTimeOpeningCapital.estimatedTransactionCount > 0) {
        qualityNotes.push(
          `All-time start value estimated from ${allTimeOpeningCapital.estimatedTransactionCount} historical-priced transaction(s).`
        );
      }
    } else if (inceptionSnapshot) {
      currentWindowOptions = undefined;
      if (allTimeOpeningCapital.unknownTransactionCount > 0) {
        qualityNotes.push(
          `All-time start anchored to inception snapshot due ${allTimeOpeningCapital.unknownTransactionCount} transaction(s) without reliable USD amount.`
        );
      } else {
        qualityNotes.push("All-time start anchored to inception snapshot.");
      }
    } else if (allTimeOpeningCapital.valueUsd > 0) {
      currentWindowOptions = {
        startValueOverrideUsd: allTimeOpeningCapital.valueUsd,
        disableFirstInWindowSnapshotAnchor: true,
        includeStartBoundaryInActivity: false,
        startValueSourceOverride: "estimated",
      };
      qualityNotes.push(
        "All-time start value estimated with limited confidence (missing inception snapshot)."
      );
    } else {
      qualityNotes.push(
        "All-time start value could not be reconstructed reliably; report backsolved from available data."
      );
    }
  }

  const currentWindow = computeWindow(
    normalizedSnapshots,
    params.vault.transactions,
    boundaries.start.getTime(),
    boundaries.end.getTime(),
    params.currentTotalValueUsd,
    historicalPriceByAsset,
    currentWindowOptions
  );

  const previousWindow =
    params.period === "all-time"
      ? {
          summary: {
            startValueUsd: 0,
            endValueUsd: 0,
            capitalNetFlowUsd: 0,
            externalNetFlowUsd: 0,
            tradingTurnoverUsd: 0,
            netFlowUsd: 0,
            pnlUsd: 0,
            returnPercent: 0,
            simpleReturnPercent: 0,
            reconciliationGapUsd: 0,
            maxDrawdownPercent: 0,
            annualizedVolatilityPercent: 0,
          },
          activity: {
            transactionCount: 0,
            estimatedAmountTransactionCount: 0,
            unknownAmountTransactionCount: 0,
            buyVolumeUsd: 0,
            sellVolumeUsd: 0,
            receiveVolumeUsd: 0,
            sendVolumeUsd: 0,
            totalFeesUsd: 0,
          },
          timeline: [],
          effectiveStartMs: boundaries.start.getTime(),
          amountQuality: { exact: 0, estimated: 0, unknown: 0 },
          startValueSource: "snapshot" as StartValueSource,
        }
      : computeWindow(
          normalizedSnapshots,
          params.vault.transactions,
          boundaries.previousStart.getTime(),
          boundaries.previousEnd.getTime(),
          currentWindow.summary.startValueUsd,
          historicalPriceByAsset
        );

  const heldDaysByAsset = computeHeldDaysByAsset(
    params.vault.transactions,
    boundaries.end.getTime()
  );

  const riskSnapshot = computeRiskSnapshot(
    params.holdings,
    params.currentTotalValueUsd,
    heldDaysByAsset
  );
  const periodLeaders = computePeriodLeaders({
    holdings: params.holdings,
    snapshots: normalizedSnapshots,
    transactions: params.vault.transactions,
    heldDaysByAsset,
    historicalPriceByAsset,
    startMs: currentWindow.effectiveStartMs,
    endMs: boundaries.end.getTime(),
    includeStartBoundaryInFlow:
      currentWindowOptions?.includeStartBoundaryInActivity ?? true,
  });

  const dataQuality = determineDataQuality({
    currentWindow,
    additionalEstimatedCount: allTimeOpeningCapital?.estimatedTransactionCount ?? 0,
    additionalUnknownCount: allTimeOpeningCapital?.unknownTransactionCount ?? 0,
    notes: qualityNotes,
  });

  return {
    period: params.period,
    generatedAt: referenceDate.toISOString(),
    window: {
      startIso: boundaries.start.toISOString(),
      endIso: boundaries.end.toISOString(),
      previousStartIso: boundaries.previousStart.toISOString(),
      previousEndIso: boundaries.previousEnd.toISOString(),
      label: formatWindowLabel(params.period, boundaries.start),
    },
    summary: currentWindow.summary,
    previousSummary: previousWindow.summary,
    activity: currentWindow.activity,
    dataQuality,
    risk: riskSnapshot.risk,
    topHoldings: riskSnapshot.topHoldings,
    bestPerformer: periodLeaders.bestPerformer,
    worstPerformer: periodLeaders.worstPerformer,
    timeline: currentWindow.timeline,
  };
}
