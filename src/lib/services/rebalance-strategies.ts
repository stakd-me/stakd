import { getSymbolValues, type PriceData } from "@/lib/services/portfolio-calculator";
import type { VaultData } from "@/lib/crypto/vault-types";
import type { RebalanceStrategy } from "@/components/rebalance/types";

export type VolatilityMap = Record<string, { volatility: number }>;

// ── Types ────────────────────────────────────────────────────────

export interface StrategyContext {
  targets: { tokenSymbol: string; targetPercent: number; coingeckoId: string | null }[];
  symbolValues: Record<string, number>;
  totalValue: number;
  effectiveTotal: number;
  investableTotal: number;
  effectiveCashReserve: number;
  holdZonePercent: number;
  minTradeUsd: number;
  buyOnlyMode: boolean;
  newCashUsd: number;
  cashReserveUsd: number;
  cashReservePercent: number;
  dustThresholdUsd: number;
  slippagePercent: number;
  tradingFeePercent: number;
  symbolToGroup: Record<string, string>;
  groupValues: Record<string, number>;
  groupNameUpperToName: Record<string, string>;
  groupMembers: Record<string, string[]>;
  symbolCoingeckoMap: Record<string, string>;
}

export interface SuggestionResult {
  tokenSymbol: string;
  coingeckoId: string | null;
  targetPercent: number;
  currentPercent: number;
  currentValue: number;
  targetValue: number;
  deviation: number;
  action: "buy" | "sell" | "hold";
  amount: number;
  estimatedSlippage: number;
  estimatedFee: number;
  netAmount: number;
  isUntargeted: boolean;
  isDust: boolean;
}

export interface StrategyOutput {
  suggestions: SuggestionResult[];
  calendarBlocked?: boolean;
  nextRebalanceDate?: string | null;
  riskParityTargets?: {
    tokenSymbol: string;
    volatility: number;
    computedTargetPercent: number;
    hasVolatilityData: boolean;
  }[];
  dcaChunks?: { chunkIndex: number; scheduledDate: string; trades: { tokenSymbol: string; action: string; amount: number }[] }[];
  dcaTotalChunks?: number;
  dcaIntervalDays?: number;
}

// ── Helpers ──────────────────────────────────────────────────────

function getNumericSetting(settings: Record<string, string>, key: string, defaultValue: number): number {
  const val = settings[key];
  if (!val) return defaultValue;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getStringSetting(settings: Record<string, string>, key: string, defaultValue: string): string {
  return settings[key] ?? defaultValue;
}

function mergeTargetsBySymbol(
  targets: { tokenSymbol: string; targetPercent: number; coingeckoId: string | null }[]
): { tokenSymbol: string; targetPercent: number; coingeckoId: string | null }[] {
  const merged = new Map<string, { tokenSymbol: string; targetPercent: number; coingeckoId: string | null }>();

  for (const target of targets) {
    const symbol = target.tokenSymbol.trim().toUpperCase();
    if (!symbol) continue;
    const existing = merged.get(symbol);
    if (existing) {
      existing.targetPercent += target.targetPercent;
      if (!existing.coingeckoId && target.coingeckoId) {
        existing.coingeckoId = target.coingeckoId;
      }
    } else {
      merged.set(symbol, {
        tokenSymbol: symbol,
        targetPercent: target.targetPercent,
        coingeckoId: target.coingeckoId || null,
      });
    }
  }

  return Array.from(merged.values()).map((target) => ({
    ...target,
    targetPercent: roundToTwo(target.targetPercent),
  }));
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function allocateRoundedPercents(weights: number[], totalPercent: number): number[] {
  if (weights.length === 0 || totalPercent <= 0) {
    return weights.map(() => 0);
  }

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
    return weights.map(() => 0);
  }

  const raw = weights.map((weight) => (weight / totalWeight) * totalPercent);
  const rounded = raw.map((value) => roundToTwo(value));
  const roundedSum = rounded.reduce((sum, value) => sum + value, 0);
  const adjustment = roundToTwo(totalPercent - roundedSum);

  if (Math.abs(adjustment) >= 0.01) {
    const maxIndex = raw.reduce((bestIndex, value, index) => {
      return value > raw[bestIndex] ? index : bestIndex;
    }, 0);
    rounded[maxIndex] = roundToTwo(Math.max(0, rounded[maxIndex] + adjustment));
  }

  return rounded;
}

// ── Context Builder ──────────────────────────────────────────────

export function buildStrategyContext(
  vault: VaultData,
  priceMap: Record<string, PriceData>
): StrategyContext {
  const targets = mergeTargetsBySymbol(vault.rebalanceTargets);
  const settings = vault.settings;

  const holdZonePercent = getNumericSetting(settings, "holdZonePercent", 5);
  const minTradeUsd = getNumericSetting(settings, "minTradeUsd", 50);
  const buyOnlyMode = getNumericSetting(settings, "buyOnlyMode", 0) === 1;
  const newCashUsd = getNumericSetting(settings, "newCashUsd", 0);
  const cashReserveUsd = getNumericSetting(settings, "cashReserveUsd", 0);
  const cashReservePercent = getNumericSetting(settings, "cashReservePercent", 0);
  const dustThresholdUsd = getNumericSetting(settings, "dustThresholdUsd", 1);
  const slippagePercent = getNumericSetting(settings, "slippagePercent", 0.5);
  const tradingFeePercent = getNumericSetting(settings, "tradingFeePercent", 0.1);

  const { symbolValues, totalValue } = getSymbolValues(vault, priceMap);
  const effectiveTotal = buyOnlyMode ? totalValue + newCashUsd : totalValue;
  const cashReserveFromPercent = effectiveTotal * (cashReservePercent / 100);
  const effectiveCashReserve = Math.max(cashReserveUsd, cashReserveFromPercent);
  const investableTotal = Math.max(0, effectiveTotal - effectiveCashReserve);

  // Token groups
  const symbolToGroup: Record<string, string> = {};
  const groupValues: Record<string, number> = {};
  const groupNameUpperToName: Record<string, string> = {};
  const groupMembers: Record<string, string[]> = {};
  for (const g of vault.tokenGroups) {
    let groupTotal = 0;
    const upperSyms: string[] = [];
    for (const s of g.symbols) {
      const upper = s.toUpperCase();
      symbolToGroup[upper] = g.name;
      groupTotal += symbolValues[upper] || 0;
      upperSyms.push(upper);
    }
    groupValues[g.name] = groupTotal;
    groupNameUpperToName[g.name.toUpperCase()] = g.name;
    groupMembers[g.name.toUpperCase()] = upperSyms;
  }

  // CoinGecko ID map from transactions
  const symbolCoingeckoMap: Record<string, string> = {};
  for (const tx of vault.transactions) {
    if (tx.coingeckoId && !symbolCoingeckoMap[tx.tokenSymbol.toUpperCase()]) {
      symbolCoingeckoMap[tx.tokenSymbol.toUpperCase()] = tx.coingeckoId;
    }
  }
  for (const entry of vault.manualEntries) {
    if (entry.coingeckoId && !symbolCoingeckoMap[entry.tokenSymbol.toUpperCase()]) {
      symbolCoingeckoMap[entry.tokenSymbol.toUpperCase()] = entry.coingeckoId;
    }
  }
  for (const target of targets) {
    if (target.coingeckoId && !symbolCoingeckoMap[target.tokenSymbol.toUpperCase()]) {
      symbolCoingeckoMap[target.tokenSymbol.toUpperCase()] = target.coingeckoId;
    }
  }

  return {
    targets: targets.map((t) => ({
      tokenSymbol: t.tokenSymbol,
      targetPercent: t.targetPercent,
      coingeckoId: t.coingeckoId || null,
    })),
    symbolValues,
    totalValue,
    effectiveTotal,
    investableTotal,
    effectiveCashReserve,
    holdZonePercent,
    minTradeUsd,
    buyOnlyMode,
    newCashUsd,
    cashReserveUsd,
    cashReservePercent,
    dustThresholdUsd,
    slippagePercent,
    tradingFeePercent,
    symbolToGroup,
    groupValues,
    groupNameUpperToName,
    groupMembers,
    symbolCoingeckoMap,
  };
}

// ── Shared suggestion computation ────────────────────────────────

function resolveCurrentValue(symbol: string, ctx: StrategyContext): number {
  // A target should resolve to group value only when the target key is the group name.
  const directGroupName = ctx.groupNameUpperToName[symbol];
  if (directGroupName !== undefined) {
    return ctx.groupValues[directGroupName] ?? 0;
  }
  return ctx.symbolValues[symbol] || 0;
}

function computeSuggestion(
  symbol: string,
  targetPercent: number,
  coingeckoId: string | null,
  ctx: StrategyContext,
  overrideHoldZone?: number
): SuggestionResult {
  const holdZone = overrideHoldZone ?? ctx.holdZonePercent;
  const currentValue = resolveCurrentValue(symbol, ctx);
  const currentPercent =
    ctx.effectiveTotal > 0 ? (currentValue / ctx.effectiveTotal) * 100 : 0;
  const targetValue =
    ctx.investableTotal > 0 ? (targetPercent / 100) * ctx.investableTotal : 0;
  const deviation = currentPercent - targetPercent;
  const tradeAmount = Math.abs(targetValue - currentValue);

  let action: "buy" | "sell" | "hold" = "hold";
  if (Math.abs(deviation) > holdZone && tradeAmount >= ctx.minTradeUsd) {
    action = deviation < 0 ? "buy" : "sell";
  }
  if (ctx.buyOnlyMode && action === "sell") {
    action = "hold";
  }

  let estimatedSlippage = 0;
  let estimatedFee = 0;
  let netAmount = tradeAmount;
  if (action === "buy" || action === "sell") {
    estimatedSlippage = (tradeAmount * ctx.slippagePercent) / 100;
    estimatedFee = (tradeAmount * ctx.tradingFeePercent) / 100;
    netAmount =
      action === "buy"
        ? tradeAmount + estimatedSlippage + estimatedFee
        : tradeAmount - estimatedSlippage - estimatedFee;
  }

  return {
    tokenSymbol: symbol,
    coingeckoId: coingeckoId || ctx.symbolCoingeckoMap[symbol] || null,
    targetPercent,
    currentPercent: Math.round(currentPercent * 100) / 100,
    currentValue: Math.round(currentValue * 100) / 100,
    targetValue: Math.round(targetValue * 100) / 100,
    deviation: Math.round(deviation * 100) / 100,
    action,
    amount: Math.round(tradeAmount * 100) / 100,
    estimatedSlippage: Math.round(estimatedSlippage * 100) / 100,
    estimatedFee: Math.round(estimatedFee * 100) / 100,
    netAmount: Math.round(netAmount * 100) / 100,
    isUntargeted: false,
    isDust: currentValue < ctx.dustThresholdUsd && currentValue > 0,
  };
}

// ── Strategy: Threshold ──────────────────────────────────────────

export function computeThresholdSuggestions(ctx: StrategyContext): StrategyOutput {
  const suggestions = ctx.targets.map((t) =>
    computeSuggestion(t.tokenSymbol.toUpperCase(), t.targetPercent, t.coingeckoId, ctx)
  );
  return { suggestions };
}

// ── Strategy: Calendar ──────────────────────────────────────────

export function computeCalendarSuggestions(
  ctx: StrategyContext,
  settings: Record<string, string>
): StrategyOutput {
  const interval = getStringSetting(settings, "rebalanceInterval", "monthly");
  const lastDateStr = getStringSetting(settings, "lastRebalanceDate", "");

  let nextRebalanceDate: string | null = null;
  let calendarBlocked = false;

  if (lastDateStr) {
    const last = new Date(lastDateStr);
    if (!Number.isNaN(last.getTime())) {
      const next = new Date(last);
      switch (interval) {
        case "weekly": next.setDate(next.getDate() + 7); break;
        case "quarterly": next.setMonth(next.getMonth() + 3); break;
        case "monthly":
        default: next.setMonth(next.getMonth() + 1); break;
      }
      nextRebalanceDate = next.toISOString().split("T")[0];
      if (new Date() < next) calendarBlocked = true;
    }
  }

  if (calendarBlocked) {
    const suggestions = ctx.targets.map((t) => {
      const symbol = t.tokenSymbol.toUpperCase();
      const currentValue = resolveCurrentValue(symbol, ctx);
      const currentPercent = ctx.effectiveTotal > 0 ? (currentValue / ctx.effectiveTotal) * 100 : 0;
      const targetValue = ctx.investableTotal > 0 ? (t.targetPercent / 100) * ctx.investableTotal : 0;
      const deviation = currentPercent - t.targetPercent;
      return {
        tokenSymbol: symbol,
        coingeckoId: t.coingeckoId || ctx.symbolCoingeckoMap[symbol] || null,
        targetPercent: t.targetPercent,
        currentPercent: Math.round(currentPercent * 100) / 100,
        currentValue: Math.round(currentValue * 100) / 100,
        targetValue: Math.round(targetValue * 100) / 100,
        deviation: Math.round(deviation * 100) / 100,
        action: "hold" as const,
        amount: 0, estimatedSlippage: 0, estimatedFee: 0, netAmount: 0,
        isUntargeted: false,
        isDust: currentValue < ctx.dustThresholdUsd && currentValue > 0,
      };
    });
    return { suggestions, calendarBlocked: true, nextRebalanceDate };
  }

  const suggestions = ctx.targets.map((t) =>
    computeSuggestion(t.tokenSymbol.toUpperCase(), t.targetPercent, t.coingeckoId, ctx, 0)
  );
  return { suggestions, calendarBlocked: false, nextRebalanceDate };
}

// ── Strategy: Percent-of-Portfolio ──────────────────────────────

export function computePercentOfPortfolioSuggestions(
  ctx: StrategyContext,
  settings: Record<string, string>
): StrategyOutput {
  const portfolioChangeThreshold = getNumericSetting(settings, "portfolioChangeThreshold", 5);

  const suggestions = ctx.targets.map((t) => {
    const symbol = t.tokenSymbol.toUpperCase();
    const currentValue = resolveCurrentValue(symbol, ctx);
    const currentPercent = ctx.effectiveTotal > 0 ? (currentValue / ctx.effectiveTotal) * 100 : 0;
    const targetValue = ctx.investableTotal > 0 ? (t.targetPercent / 100) * ctx.investableTotal : 0;
    const deviation = currentPercent - t.targetPercent;
    const tradeAmount = Math.abs(targetValue - currentValue);
    const portfolioImpact = ctx.effectiveTotal > 0
      ? (Math.abs(currentValue - targetValue) / ctx.effectiveTotal) * 100
      : 0;

    let action: "buy" | "sell" | "hold" = "hold";
    if (portfolioImpact >= portfolioChangeThreshold && tradeAmount >= ctx.minTradeUsd) {
      action = deviation < 0 ? "buy" : "sell";
    }
    if (ctx.buyOnlyMode && action === "sell") action = "hold";

    let estimatedSlippage = 0, estimatedFee = 0, netAmount = tradeAmount;
    if (action === "buy" || action === "sell") {
      estimatedSlippage = (tradeAmount * ctx.slippagePercent) / 100;
      estimatedFee = (tradeAmount * ctx.tradingFeePercent) / 100;
      netAmount = action === "buy"
        ? tradeAmount + estimatedSlippage + estimatedFee
        : tradeAmount - estimatedSlippage - estimatedFee;
    }

    return {
      tokenSymbol: symbol,
      coingeckoId: t.coingeckoId || ctx.symbolCoingeckoMap[symbol] || null,
      targetPercent: t.targetPercent,
      currentPercent: Math.round(currentPercent * 100) / 100,
      currentValue: Math.round(currentValue * 100) / 100,
      targetValue: Math.round(targetValue * 100) / 100,
      deviation: Math.round(deviation * 100) / 100,
      action, amount: Math.round(tradeAmount * 100) / 100,
      estimatedSlippage: Math.round(estimatedSlippage * 100) / 100,
      estimatedFee: Math.round(estimatedFee * 100) / 100,
      netAmount: Math.round(netAmount * 100) / 100,
      isUntargeted: false,
      isDust: currentValue < ctx.dustThresholdUsd && currentValue > 0,
    };
  });

  return { suggestions };
}

// ── Strategy: Risk-Parity ───────────────────────────────────────

export function computeRiskParitySuggestions(
  ctx: StrategyContext,
  _settings: Record<string, string>,
  volatilities: VolatilityMap = {}
): StrategyOutput {
  const targetVols: {
    symbol: string;
    coingeckoId: string | null;
    vol: number;
    originalTargetPercent: number;
  }[] = [];

  let totalTargetPercent = 0;
  for (const t of ctx.targets) {
    const symbol = t.tokenSymbol.toUpperCase();
    const coingeckoId = t.coingeckoId || ctx.symbolCoingeckoMap[symbol] || null;
    let vol = 0;
    if (coingeckoId && volatilities[coingeckoId]) {
      vol = volatilities[coingeckoId].volatility;
    }
    totalTargetPercent += Math.max(0, t.targetPercent);
    targetVols.push({
      symbol,
      coingeckoId,
      vol,
      originalTargetPercent: Math.max(0, t.targetPercent),
    });
  }

  const hasCompleteVolatility =
    targetVols.length > 0 &&
    targetVols.every((target) => Number.isFinite(target.vol) && target.vol > 0);

  const normalizedTargetTotal = roundToTwo(totalTargetPercent);

  let computedTargets: {
    symbol: string;
    coingeckoId: string | null;
    targetPercent: number;
    vol: number;
    hasVolatilityData: boolean;
  }[];

  if (!hasCompleteVolatility) {
    // Fallback to user-defined targets whenever volatility coverage is incomplete.
    computedTargets = targetVols.map((target) => ({
      symbol: target.symbol,
      coingeckoId: target.coingeckoId,
      targetPercent: roundToTwo(target.originalTargetPercent),
      vol: target.vol,
      hasVolatilityData: target.vol > 0,
    }));
  } else {
    const inverseVolWeights = targetVols.map((target) => 1 / target.vol);
    const allocatedTargets = allocateRoundedPercents(
      inverseVolWeights,
      normalizedTargetTotal
    );

    computedTargets = targetVols.map((target, index) => {
      return {
        symbol: target.symbol,
        coingeckoId: target.coingeckoId,
        targetPercent: allocatedTargets[index] ?? 0,
        vol: target.vol,
        hasVolatilityData: true,
      };
    });
  }

  const suggestions = computedTargets.map((ct) =>
    computeSuggestion(ct.symbol, ct.targetPercent, ct.coingeckoId, ctx)
  );

  const riskParityTargets = computedTargets.map((ct) => ({
    tokenSymbol: ct.symbol,
    volatility: roundToTwo(ct.vol * 100),
    computedTargetPercent: ct.targetPercent,
    hasVolatilityData: ct.hasVolatilityData,
  }));

  return { suggestions, riskParityTargets };
}

// ── Strategy: DCA-Weighted ──────────────────────────────────────

export function computeDcaSuggestions(
  ctx: StrategyContext,
  settings: Record<string, string>
): StrategyOutput {
  const dcaSplitCount = Math.max(
    1,
    Math.round(getNumericSetting(settings, "dcaSplitCount", 4))
  );
  const dcaIntervalDays = Math.max(
    1,
    Math.round(getNumericSetting(settings, "dcaIntervalDays", 7))
  );

  const fullSuggestions = ctx.targets.map((t) =>
    computeSuggestion(t.tokenSymbol.toUpperCase(), t.targetPercent, t.coingeckoId, ctx)
  );

  const suggestions = fullSuggestions.map((s) => {
    if (s.action === "hold") return s;
    const chunkAmount = Math.round((s.amount / dcaSplitCount) * 100) / 100;
    const estimatedSlippage = Math.round(((chunkAmount * ctx.slippagePercent) / 100) * 100) / 100;
    const estimatedFee = Math.round(((chunkAmount * ctx.tradingFeePercent) / 100) * 100) / 100;
    const netAmount = s.action === "buy"
      ? chunkAmount + estimatedSlippage + estimatedFee
      : chunkAmount - estimatedSlippage - estimatedFee;
    return {
      ...s, amount: chunkAmount, estimatedSlippage, estimatedFee,
      netAmount: Math.round(netAmount * 100) / 100,
    };
  });

  const now = new Date();
  const dcaChunks: StrategyOutput["dcaChunks"] = [];

  for (let i = 0; i < dcaSplitCount; i++) {
    const chunkDate = new Date(now);
    chunkDate.setDate(chunkDate.getDate() + i * dcaIntervalDays);
    const trades = fullSuggestions
      .filter((s) => s.action !== "hold")
      .map((s) => ({
        tokenSymbol: s.tokenSymbol,
        action: s.action,
        amount: Math.round((s.amount / dcaSplitCount) * 100) / 100,
      }));
    if (trades.length > 0) {
      dcaChunks.push({ chunkIndex: i + 1, scheduledDate: chunkDate.toISOString().split("T")[0], trades });
    }
  }

  return { suggestions, dcaChunks, dcaTotalChunks: dcaSplitCount, dcaIntervalDays };
}

// ── Dispatch ─────────────────────────────────────────────────────

export function dispatchStrategy(
  strategy: RebalanceStrategy,
  ctx: StrategyContext,
  settings: Record<string, string>,
  volatilities?: VolatilityMap
): StrategyOutput {
  switch (strategy) {
    case "calendar":
      return computeCalendarSuggestions(ctx, settings);
    case "percent-of-portfolio":
      return computePercentOfPortfolioSuggestions(ctx, settings);
    case "risk-parity":
      return computeRiskParitySuggestions(ctx, settings, volatilities);
    case "dca-weighted":
      return computeDcaSuggestions(ctx, settings);
    case "threshold":
    default:
      return computeThresholdSuggestions(ctx);
  }
}
