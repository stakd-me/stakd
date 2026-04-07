import type {
  VaultTransactionSettlement,
  VaultTransactionType,
} from "@/lib/crypto/vault-types";

export interface BreakdownItem {
  holdingKey: string;
  symbol: string;
  tokenName: string;
  coingeckoId: string | null;
  value: number;
  percent: number;
  color: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  change24h: number | null;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  realizedPL: number;
  totalFees: number;
  firstBuyDate: string | null;
}

export interface PortfolioTransaction {
  id: string;
  tokenSymbol: string;
  tokenName: string;
  type: VaultTransactionType;
  quantity: string;
  pricePerUnit: string;
  totalCost: string;
  fee: string;
  coingeckoId: string | null;
  note: string | null;
  transactedAt: string;
  settlement?: VaultTransactionSettlement;
}

export interface ManualEntry {
  id: string;
  tokenSymbol: string;
  tokenName: string;
  coingeckoId: string | null;
  quantity: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioCoinListItem {
  id: string;
  symbol: string;
  name: string;
  binance: boolean;
}

export type PortfolioTxType = VaultTransactionType;

export interface ImportPreviewRow {
  rowNumber: number;
  dateIso: string;
  type: PortfolioTxType;
  symbol: string;
  name: string;
  quantity: number;
  pricePerUnit: number;
  fee: number;
  note: string | null;
  coingeckoId: string | null;
}
