import type {
  VaultData,
  VaultTransaction,
} from "@/lib/crypto/vault-types";

export interface ExecutedTradeInput {
  tokenSymbol: string;
  action: string;
  amountUsd: number;
  quantity: string;
}

interface TokenMetadata {
  tokenName: string;
  coingeckoId: string | null;
}

interface BuildTransactionsResult {
  transactions: VaultTransaction[];
  tokensToEnsure: { coingeckoId: string; symbol: string }[];
}

function buildTokenMetadata(vault: VaultData): Record<string, TokenMetadata> {
  const metadata: Record<string, TokenMetadata> = {};

  const updateMetadata = (
    rawSymbol: string,
    tokenName: string,
    coingeckoId: string | null
  ) => {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!symbol) return;

    const existing = metadata[symbol];
    if (!existing) {
      metadata[symbol] = {
        tokenName: tokenName.trim() || symbol,
        coingeckoId: coingeckoId ?? null,
      };
      return;
    }

    if (!existing.coingeckoId && coingeckoId) {
      existing.coingeckoId = coingeckoId;
    }
    if (
      (!existing.tokenName || existing.tokenName === symbol) &&
      tokenName.trim().length > 0
    ) {
      existing.tokenName = tokenName.trim();
    }
  };

  for (const tx of vault.transactions) {
    updateMetadata(tx.tokenSymbol, tx.tokenName, tx.coingeckoId);
  }

  for (const entry of vault.manualEntries) {
    updateMetadata(entry.tokenSymbol, entry.tokenName, entry.coingeckoId);
  }

  for (const target of vault.rebalanceTargets) {
    updateMetadata(target.tokenSymbol, target.tokenSymbol, target.coingeckoId);
  }

  return metadata;
}

export function buildTransactionsFromExecutedTrades(
  vault: VaultData,
  trades: ExecutedTradeInput[],
  recordedAtIso: string,
  note: string
): BuildTransactionsResult {
  const metadata = buildTokenMetadata(vault);
  const tokenEnsureMap = new Map<string, string>();
  const transactions: VaultTransaction[] = [];

  for (const trade of trades) {
    const symbol = trade.tokenSymbol.trim().toUpperCase();
    const amountUsd = Number.parseFloat(String(trade.amountUsd));
    const quantity = Number.parseFloat(trade.quantity);

    if (!symbol || !Number.isFinite(amountUsd) || amountUsd <= 0) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const action = trade.action === "buy" ? "buy" : "sell";
    const tokenMeta = metadata[symbol];
    const coingeckoId = tokenMeta?.coingeckoId ?? null;
    const tokenName = tokenMeta?.tokenName || symbol;

    if (coingeckoId) {
      tokenEnsureMap.set(coingeckoId, symbol);
    }

    transactions.push({
      id: crypto.randomUUID(),
      tokenSymbol: symbol,
      tokenName,
      chain: "",
      type: action,
      quantity: quantity.toString(),
      pricePerUnit: (amountUsd / quantity).toString(),
      totalCost: amountUsd.toString(),
      fee: "0",
      coingeckoId,
      note,
      transactedAt: recordedAtIso,
      createdAt: recordedAtIso,
    });
  }

  return {
    transactions,
    tokensToEnsure: Array.from(tokenEnsureMap.entries()).map(
      ([coingeckoId, symbol]) => ({
        coingeckoId,
        symbol,
      })
    ),
  };
}
