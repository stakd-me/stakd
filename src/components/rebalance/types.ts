export type RebalanceStrategy = "threshold" | "calendar" | "percent-of-portfolio" | "risk-parity" | "dca-weighted";

export interface TargetRow {
  tokenSymbol: string;
  targetPercent: number;
  coingeckoId: string;
}

export interface Suggestion {
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

export interface ExecutionStep {
  step: number;
  tokenSymbol: string;
  action: "buy" | "sell";
  amount: number;
  estimatedSlippage: number;
  estimatedFee: number;
  runningCashAfter: number;
}

export interface RebalanceSummary {
  tradeCount: number;
  sellCount: number;
  buyCount: number;
  totalVolume: number;
  totalEstimatedFees: number;
  portfolioDrift: number;
  portfolioEfficiency: number;
  maxPostRebalanceDeviation: number;
  isWellBalanced: boolean;
  driftThresholdPercent: number;
}

export interface SuggestionsData {
  totalValue: number;
  targets: Suggestion[];
  holdZonePercent: number;
  minTradeUsd: number;
  buyOnlyMode: boolean;
  newCashUsd: number;
  cashReserveUsd: number;
  cashReservePercent: number;
  dustThresholdUsd: number;
  slippagePercent: number;
  tradingFeePercent: number;
  summary?: RebalanceSummary;
  executionSteps?: ExecutionStep[];
  lastRebalanceTime?: string | null;
  oldestPriceUpdate?: string | null;
  autoRefreshMinutes?: number;
  rebalanceStrategy?: RebalanceStrategy;
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

export interface Alert {
  tokenSymbol: string;
  targetPercent: number;
  currentPercent: number;
  deviation: number;
  severity: "low" | "medium" | "high";
  type: "deviation" | "concentration_token";
}

export interface AutocompleteSuggestion {
  symbol: string;
  name: string;
  coingeckoId: string | null;
  totalBalance: number;
  totalValueUsd: number;
  isGroup?: boolean;
}

export interface TokenGroup {
  id: string | number;
  name: string;
  symbols: string[];
  totalValueUsd?: number;
  members?: { symbol: string; valueUsd: number; percentInGroup: number }[];
}

export interface RebalanceSession {
  id: string | number;
  totalValueUsd: number;
  status: string;
  trades: RebalanceTrade[];
  createdAt: string;
}

export interface RebalanceTrade {
  id: string | number;
  tokenSymbol: string;
  action: string;
  amountUsd: number;
  status: string;
}

export interface WhatIfResult {
  tokenSymbol: string;
  currentPercent: number;
  simulatedPercent: number;
  change: number;
}

export interface WhatIfTrade {
  tokenSymbol: string;
  action: "buy" | "sell";
  amountUsd: string;
}

export interface TokenCategory {
  id: string | number;
  tokenSymbol: string;
  category: string;
}

export interface CategoryBreakdown {
  category: string;
  valueUsd: number;
  percent: number;
}

export interface RebalanceLog {
  id: string | number;
  totalValueUsd: number;
  targetsSnapshot: { tokenSymbol: string; targetPercent: number }[];
  deviationsSnapshot: {
    tokenSymbol: string;
    targetPercent: number;
    currentPercent: number;
    deviation: number;
    currentValue: number;
  }[];
  loggedAt: string;
}

export interface ConfirmState {
  type: "session" | "group" | "category";
  id: number | string;
  label: string;
}

export const VALID_CATEGORIES = [
  "stablecoin",
  "large-cap",
  "defi",
  "staking",
  "meme",
  "l1",
  "l2",
  "gaming",
  "other",
];

export const TEMPLATES = [
  {
    name: "60/40 BTC/ETH",
    allocations: [
      { symbol: "BTC", percent: 60 },
      { symbol: "ETH", percent: 40 },
    ] as { symbol: string; percent: number }[],
  },
  {
    name: "BTC Heavy",
    allocations: [
      { symbol: "BTC", percent: 70 },
      { symbol: "ETH", percent: 20 },
      { symbol: "SOL", percent: 10 },
    ] as { symbol: string; percent: number }[],
  },
  {
    name: "Blue Chip Mix",
    allocations: [
      { symbol: "BTC", percent: 40 },
      { symbol: "ETH", percent: 30 },
      { symbol: "SOL", percent: 15 },
      { symbol: "AVAX", percent: 15 },
    ] as { symbol: string; percent: number }[],
  },
  {
    name: "Equal Weight Top 5",
    allocations: "auto-equal" as const,
  },
];
