import type { VaultData, VaultTransaction } from "@/lib/crypto/vault-types";
import type { TokenHolding } from "@/lib/services/portfolio-calculator";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;

export type ReportPeriod = "weekly" | "monthly" | "quarterly" | "yearly";

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
  netFlowUsd: number;
  pnlUsd: number;
  returnPercent: number;
  maxDrawdownPercent: number;
  annualizedVolatilityPercent: number;
}

export interface ReportActivity {
  transactionCount: number;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  receiveVolumeUsd: number;
  sendVolumeUsd: number;
  totalFeesUsd: number;
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
}

export interface ReportLeader {
  symbol: string;
  returnPercent: number;
  unrealizedPLUsd: number;
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

interface WindowComputationResult {
  summary: ReportSummary;
  activity: ReportActivity;
  timeline: ReportPoint[];
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

function getBoundaries(period: ReportPeriod, referenceDate: Date): WindowBoundaries {
  const end = new Date(referenceDate);

  if (period === "weekly") {
    const start = startOfUtcWeek(referenceDate);
    const previousStart = new Date(start.getTime() - WEEK_DAYS * MS_PER_DAY);
    const previousEnd = new Date(start.getTime() - 1);
    return { start, end, previousStart, previousEnd };
  }

  if (period === "monthly") {
    const start = startOfUtcMonth(referenceDate);
    const previousStart = shiftMonths(start, -1);
    const previousEnd = new Date(start.getTime() - 1);
    return { start, end, previousStart, previousEnd };
  }

  if (period === "quarterly") {
    const start = startOfUtcQuarter(referenceDate);
    const previousStart = shiftMonths(start, -3);
    const previousEnd = new Date(start.getTime() - 1);
    return { start, end, previousStart, previousEnd };
  }

  const start = startOfUtcYear(referenceDate);
  const previousStart = toUtcDate(start.getUTCFullYear() - 1, 0, 1);
  const previousEnd = new Date(start.getTime() - 1);
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
      };
    })
    .filter((point): point is SnapshotPoint => point !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function getValueAt(points: SnapshotPoint[], atMs: number, fallback: number): number {
  if (points.length === 0) return fallback;

  let bestBefore: SnapshotPoint | null = null;
  for (const point of points) {
    if (point.timestamp <= atMs) {
      bestBefore = point;
      continue;
    }
    break;
  }

  if (bestBefore) return bestBefore.value;

  const firstAfter = points.find((point) => point.timestamp >= atMs);
  return firstAfter?.value ?? fallback;
}

function getTransactionUsdAmount(tx: VaultTransaction): number {
  const totalCost = toSafeNumber(tx.totalCost);
  if (totalCost > 0) return totalCost;

  const quantity = toSafeNumber(tx.quantity);
  const pricePerUnit = toSafeNumber(tx.pricePerUnit);
  const derived = quantity * pricePerUnit;
  return Number.isFinite(derived) && derived > 0 ? derived : 0;
}

function computeActivity(
  transactions: VaultTransaction[],
  startMs: number,
  endMs: number
): ReportActivity & { netFlowUsd: number } {
  let transactionCount = 0;
  let buyVolumeUsd = 0;
  let sellVolumeUsd = 0;
  let receiveVolumeUsd = 0;
  let sendVolumeUsd = 0;
  let totalFeesUsd = 0;
  let netFlowUsd = 0;

  for (const tx of transactions) {
    const timestamp = new Date(tx.transactedAt).getTime();
    if (!Number.isFinite(timestamp) || timestamp < startMs || timestamp > endMs) {
      continue;
    }

    const feeUsd = Math.max(0, toSafeNumber(tx.fee));
    const amountUsd = Math.max(0, getTransactionUsdAmount(tx));
    transactionCount += 1;
    totalFeesUsd += feeUsd;

    if (tx.type === "buy") {
      buyVolumeUsd += amountUsd;
      netFlowUsd += amountUsd + feeUsd;
      continue;
    }

    if (tx.type === "sell") {
      sellVolumeUsd += amountUsd;
      netFlowUsd -= Math.max(0, amountUsd - feeUsd);
      continue;
    }

    if (tx.type === "receive") {
      receiveVolumeUsd += amountUsd;
      netFlowUsd += amountUsd;
      continue;
    }

    sendVolumeUsd += amountUsd;
    netFlowUsd -= amountUsd;
  }

  return {
    transactionCount,
    buyVolumeUsd: roundTo(buyVolumeUsd, 2),
    sellVolumeUsd: roundTo(sellVolumeUsd, 2),
    receiveVolumeUsd: roundTo(receiveVolumeUsd, 2),
    sendVolumeUsd: roundTo(sendVolumeUsd, 2),
    totalFeesUsd: roundTo(totalFeesUsd, 2),
    netFlowUsd: roundTo(netFlowUsd, 2),
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

function computeWindow(
  snapshots: SnapshotPoint[],
  transactions: VaultTransaction[],
  startMs: number,
  endMs: number,
  fallbackEndValue: number
): WindowComputationResult {
  const startValue = getValueAt(snapshots, startMs, fallbackEndValue);
  const endValue = getValueAt(snapshots, endMs, fallbackEndValue);

  const activityWithFlow = computeActivity(transactions, startMs, endMs);

  const timelineMap = new Map<number, number>();
  addTimelinePoint(timelineMap, startMs, startValue);
  for (const snapshot of snapshots) {
    if (snapshot.timestamp >= startMs && snapshot.timestamp <= endMs) {
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

  const pnlUsd = endValue - startValue - activityWithFlow.netFlowUsd;
  const denominatorBase = startValue + Math.max(activityWithFlow.netFlowUsd, 0);
  const returnPercent =
    denominatorBase > 0 ? (pnlUsd / denominatorBase) * 100 : 0;

  const riskSeries =
    timeline.length > 1
      ? timeline
      : [
          { date: new Date(startMs).toISOString(), value: startValue },
          { date: new Date(endMs).toISOString(), value: endValue },
        ];
  const drawdownVolatility = computeDrawdownAndVolatility(riskSeries);

  return {
    summary: {
      startValueUsd: roundTo(startValue, 2),
      endValueUsd: roundTo(endValue, 2),
      netFlowUsd: activityWithFlow.netFlowUsd,
      pnlUsd: roundTo(pnlUsd, 2),
      returnPercent: roundTo(returnPercent, 2),
      maxDrawdownPercent: drawdownVolatility.maxDrawdownPercent,
      annualizedVolatilityPercent: drawdownVolatility.annualizedVolatilityPercent,
    },
    activity: {
      transactionCount: activityWithFlow.transactionCount,
      buyVolumeUsd: activityWithFlow.buyVolumeUsd,
      sellVolumeUsd: activityWithFlow.sellVolumeUsd,
      receiveVolumeUsd: activityWithFlow.receiveVolumeUsd,
      sendVolumeUsd: activityWithFlow.sendVolumeUsd,
      totalFeesUsd: activityWithFlow.totalFeesUsd,
    },
    timeline,
  };
}

function computeRiskAndLeaders(
  holdings: TokenHolding[],
  currentTotalValueUsd: number
): {
  risk: ReportRisk;
  topHoldings: ReportHoldingRow[];
  bestPerformer: ReportLeader | null;
  worstPerformer: ReportLeader | null;
} {
  const active = holdings
    .filter((holding) => holding.currentQty > 0 && holding.currentValue > 0)
    .map((holding) => {
      const percent =
        currentTotalValueUsd > 0
          ? (holding.currentValue / currentTotalValueUsd) * 100
          : 0;
      return {
        symbol: holding.symbol.toUpperCase(),
        valueUsd: roundTo(holding.currentValue, 2),
        percent: roundTo(percent, 2),
        unrealizedPLUsd: roundTo(holding.unrealizedPL, 2),
        unrealizedPLPercent: roundTo(holding.unrealizedPLPercent, 2),
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

  const rankedByReturn = active
    .filter((row) => Number.isFinite(row.unrealizedPLPercent))
    .sort((a, b) => b.unrealizedPLPercent - a.unrealizedPLPercent);

  const best = rankedByReturn[0] ?? null;
  const worst = rankedByReturn[rankedByReturn.length - 1] ?? null;

  return {
    risk: {
      activeAssets: active.length,
      topConcentrationSymbol: top?.symbol ?? null,
      topConcentrationPercent: roundTo(top?.percent ?? 0, 2),
      herfindahlIndex: roundTo(herfindahlIndex, 4),
      diversificationScore: roundTo(diversificationScore, 2),
    },
    topHoldings: active.slice(0, 10),
    bestPerformer: best
      ? {
          symbol: best.symbol,
          returnPercent: best.unrealizedPLPercent,
          unrealizedPLUsd: best.unrealizedPLUsd,
        }
      : null,
    worstPerformer: worst
      ? {
          symbol: worst.symbol,
          returnPercent: worst.unrealizedPLPercent,
          unrealizedPLUsd: worst.unrealizedPLUsd,
        }
      : null,
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
  const boundaries = getBoundaries(params.period, referenceDate);
  const normalizedSnapshots = normalizeSnapshots(params.vault);

  const currentWindow = computeWindow(
    normalizedSnapshots,
    params.vault.transactions,
    boundaries.start.getTime(),
    boundaries.end.getTime(),
    params.currentTotalValueUsd
  );

  const previousWindow = computeWindow(
    normalizedSnapshots,
    params.vault.transactions,
    boundaries.previousStart.getTime(),
    boundaries.previousEnd.getTime(),
    currentWindow.summary.startValueUsd
  );

  const riskAndLeaders = computeRiskAndLeaders(
    params.holdings,
    params.currentTotalValueUsd
  );

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
    risk: riskAndLeaders.risk,
    topHoldings: riskAndLeaders.topHoldings,
    bestPerformer: riskAndLeaders.bestPerformer,
    worstPerformer: riskAndLeaders.worstPerformer,
    timeline: currentWindow.timeline,
  };
}
