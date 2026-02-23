/**
 * VaultData: the complete user data structure stored as an encrypted blob.
 * All user-specific data lives here. Server never sees the plaintext.
 */

export interface VaultTransaction {
  id: string; // client-generated UUID
  tokenSymbol: string;
  tokenName: string;
  chain: string;
  type: "buy" | "sell" | "receive" | "send";
  quantity: string;
  pricePerUnit: string;
  totalCost: string;
  fee: string;
  coingeckoId: string | null;
  note: string | null;
  transactedAt: string; // ISO string
  createdAt: string;    // ISO string
}

export interface VaultManualEntry {
  id: string;
  tokenSymbol: string;
  tokenName: string;
  coingeckoId: string | null;
  quantity: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VaultRebalanceTarget {
  id: string;
  tokenSymbol: string;
  targetPercent: number;
  coingeckoId: string | null;
  updatedAt: string;
}

export interface VaultRebalanceSession {
  id: string;
  totalValueUsd: number;
  targetsSnapshot: string; // JSON
  status: "in_progress" | "completed" | "cancelled";
  trades: VaultRebalanceTrade[];
  createdAt: string;
  completedAt: string | null;
}

export interface VaultRebalanceTrade {
  id: string;
  tokenSymbol: string;
  action: "buy" | "sell";
  amountUsd: number;
  status: "pending" | "completed";
  completedAt: string | null;
}

export interface VaultRebalanceLog {
  id: string;
  totalValueUsd: number;
  targetsSnapshot: string; // JSON
  deviationsSnapshot: string; // JSON
  loggedAt: string;
}

export interface VaultPortfolioSnapshot {
  id: string;
  totalValueUsd: number;
  breakdown: string; // JSON string of per-token values
  snapshotAt: string;
}

export interface VaultTokenGroup {
  id: string;
  name: string;
  symbols: string[]; // parsed array
  createdAt: string;
}

export interface VaultTokenCategory {
  id: string;
  tokenSymbol: string;
  category: string;
  updatedAt: string;
}

export interface VaultData {
  version: 1;
  transactions: VaultTransaction[];
  manualEntries: VaultManualEntry[];
  rebalanceTargets: VaultRebalanceTarget[];
  rebalanceSessions: VaultRebalanceSession[];
  rebalanceLogs: VaultRebalanceLog[];
  portfolioSnapshots: VaultPortfolioSnapshot[];
  tokenGroups: VaultTokenGroup[];
  tokenCategories: VaultTokenCategory[];
  settings: Record<string, string>;
}

export function createEmptyVault(): VaultData {
  return {
    version: 1,
    transactions: [],
    manualEntries: [],
    rebalanceTargets: [],
    rebalanceSessions: [],
    rebalanceLogs: [],
    portfolioSnapshots: [],
    tokenGroups: [],
    tokenCategories: [],
    settings: {
      rebalanceStrategy: "percent-of-portfolio",
      autoRefreshMinutes: "15",
      concentrationThresholdPercent: "30",
      excludeStablecoinsFromConcentration: "0",
      treatStablecoinsAsCashReserve: "0",
    },
  };
}
