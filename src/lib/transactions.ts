import { normalizeTokenSymbol } from "@/lib/constants/stablecoins";
import type {
  VaultTransaction,
  VaultTransactionSettlement,
  VaultTransactionType,
} from "@/lib/crypto/vault-types";

export interface BalanceImpactTransaction {
  id: string;
  tokenSymbol: string;
  tokenName: string;
  chain: string;
  type: VaultTransactionType;
  quantity: string;
  pricePerUnit: string;
  totalCost: string;
  fee: string;
  coingeckoId: string | null;
  note: string | null;
  transactedAt: string;
  createdAt: string;
  isSettlement: boolean;
  sourceTransactionId: string;
}

export interface CreateVaultTransactionInput {
  id: string;
  tokenSymbol: string;
  tokenName: string;
  chain?: string;
  type: VaultTransactionType;
  quantity: number | string;
  pricePerUnit: number | string;
  fee?: number | string;
  coingeckoId?: string | null;
  note?: string | null;
  transactedAt: string;
  createdAt: string;
  settlement?: VaultTransactionSettlement | null;
}

interface TradeSettlementInput {
  settlement: Pick<
    VaultTransactionSettlement,
    "tokenSymbol" | "tokenName" | "coingeckoId"
  >;
  type: VaultTransactionType;
  totalCost: number;
  fee: number;
  pricePerUnit?: number | string | null;
}

function toFiniteNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeCoingeckoId(value: string | null | undefined): string | null {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeTokenName(
  tokenName: string | null | undefined,
  fallbackSymbol: string
): string {
  const normalized = (tokenName ?? "").trim();
  return normalized.length > 0 ? normalized : fallbackSymbol;
}

function normalizeSettlement(
  settlement: VaultTransactionSettlement | null | undefined
): VaultTransactionSettlement | undefined {
  if (!settlement) return undefined;

  const tokenSymbol = normalizeTokenSymbol(settlement.tokenSymbol);
  if (!tokenSymbol) return undefined;

  const pricePerUnit = Math.max(0, toFiniteNumber(settlement.pricePerUnit));
  const totalCost = Math.max(0, toFiniteNumber(settlement.totalCost));
  let quantity = Math.max(0, toFiniteNumber(settlement.quantity));
  if (quantity <= 0 && pricePerUnit > 0 && totalCost > 0) {
    quantity = totalCost / pricePerUnit;
  }
  if (quantity <= 0 || totalCost <= 0) return undefined;

  return {
    tokenSymbol,
    tokenName: normalizeTokenName(settlement.tokenName, tokenSymbol),
    coingeckoId: normalizeCoingeckoId(settlement.coingeckoId),
    direction: settlement.direction === "in" ? "in" : "out",
    quantity: quantity.toString(),
    pricePerUnit: (pricePerUnit > 0 ? pricePerUnit : totalCost / quantity).toString(),
    totalCost: totalCost.toString(),
  };
}

export function computeSettlementAmountUsd(params: {
  type: VaultTransactionType;
  totalCost: number;
  fee: number;
}): number {
  if (params.type === "buy") {
    return Math.max(0, params.totalCost + Math.max(0, params.fee));
  }
  if (params.type === "sell") {
    return Math.max(0, params.totalCost - Math.max(0, params.fee));
  }
  return 0;
}

export function calculateFeeAmountFromPercent(
  totalCost: number,
  feePercent: number
): number {
  if (!Number.isFinite(totalCost) || totalCost <= 0) return 0;
  if (!Number.isFinite(feePercent) || feePercent <= 0) return 0;
  return (totalCost * feePercent) / 100;
}

export function calculateFeePercentFromAmount(
  totalCost: number,
  feeAmount: number
): number {
  if (!Number.isFinite(totalCost) || totalCost <= 0) return 0;
  if (!Number.isFinite(feeAmount) || feeAmount <= 0) return 0;
  return (feeAmount / totalCost) * 100;
}

export function buildTradeSettlement(
  params: TradeSettlementInput
): VaultTransactionSettlement | undefined {
  if (params.type !== "buy" && params.type !== "sell") {
    return undefined;
  }

  const tokenSymbol = normalizeTokenSymbol(params.settlement.tokenSymbol);
  if (!tokenSymbol) return undefined;

  const pricePerUnit = Math.max(0, toFiniteNumber(params.pricePerUnit));
  const amountUsd = computeSettlementAmountUsd({
    type: params.type,
    totalCost: params.totalCost,
    fee: params.fee,
  });
  if (amountUsd <= 0) return undefined;

  const effectivePrice = pricePerUnit > 0 ? pricePerUnit : 1;
  const quantity = amountUsd / effectivePrice;

  return {
    tokenSymbol,
    tokenName: normalizeTokenName(params.settlement.tokenName, tokenSymbol),
    coingeckoId: normalizeCoingeckoId(params.settlement.coingeckoId),
    direction: params.type === "buy" ? "out" : "in",
    quantity: quantity.toString(),
    pricePerUnit: effectivePrice.toString(),
    totalCost: amountUsd.toString(),
  };
}

export function createVaultTransaction(
  input: CreateVaultTransactionInput
): VaultTransaction {
  const tokenSymbol = normalizeTokenSymbol(input.tokenSymbol);
  const quantity = Math.max(0, toFiniteNumber(input.quantity));
  const pricePerUnit = Math.max(0, toFiniteNumber(input.pricePerUnit));
  const fee = Math.max(0, toFiniteNumber(input.fee));

  return {
    id: input.id,
    tokenSymbol,
    tokenName: normalizeTokenName(input.tokenName, tokenSymbol),
    chain: input.chain ?? "",
    type: input.type,
    quantity: quantity.toString(),
    pricePerUnit: pricePerUnit.toString(),
    totalCost: (quantity * pricePerUnit).toString(),
    fee: fee.toString(),
    coingeckoId: normalizeCoingeckoId(input.coingeckoId),
    note: (input.note ?? "").trim() || null,
    transactedAt: input.transactedAt,
    createdAt: input.createdAt,
    settlement: normalizeSettlement(input.settlement),
  };
}

export function rebuildTradeSettlement(
  tx: {
    type: VaultTransactionType;
    quantity: number | string;
    pricePerUnit: number | string;
    fee: number | string;
  },
  settlement: VaultTransactionSettlement | null | undefined
): VaultTransactionSettlement | undefined {
  if (!settlement) return undefined;

  return buildTradeSettlement({
    settlement,
    type: tx.type,
    totalCost: toFiniteNumber(tx.quantity) * toFiniteNumber(tx.pricePerUnit),
    fee: toFiniteNumber(tx.fee),
    pricePerUnit: settlement.pricePerUnit,
  });
}

export function expandTransactionForBalance(
  tx: VaultTransaction
): BalanceImpactTransaction[] {
  const primary: BalanceImpactTransaction = {
    id: tx.id,
    tokenSymbol: tx.tokenSymbol,
    tokenName: tx.tokenName,
    chain: tx.chain,
    type: tx.type,
    quantity: tx.quantity,
    pricePerUnit: tx.pricePerUnit,
    totalCost: tx.totalCost,
    fee: tx.fee,
    coingeckoId: tx.coingeckoId,
    note: tx.note,
    transactedAt: tx.transactedAt,
    createdAt: tx.createdAt,
    isSettlement: false,
    sourceTransactionId: tx.id,
  };

  const settlement = normalizeSettlement(tx.settlement);
  if (!settlement) {
    return [primary];
  }

  const settlementType: VaultTransactionType =
    settlement.direction === "in" ? "buy" : "sell";

  return [
    primary,
    {
      id: `${tx.id}:settlement`,
      tokenSymbol: settlement.tokenSymbol,
      tokenName: settlement.tokenName,
      chain: tx.chain,
      type: settlementType,
      quantity: settlement.quantity,
      pricePerUnit: settlement.pricePerUnit,
      totalCost: settlement.totalCost,
      fee: "0",
      coingeckoId: settlement.coingeckoId,
      note: tx.note,
      transactedAt: tx.transactedAt,
      createdAt: tx.createdAt,
      isSettlement: true,
      sourceTransactionId: tx.id,
    },
  ];
}
