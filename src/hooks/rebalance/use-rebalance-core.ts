"use client";

import { useMemo, useCallback } from "react";
import { useVaultStore } from "@/lib/store";
import { usePrices } from "@/hooks/use-prices";
import {
  parseConcentrationAlertThresholdPercent,
} from "@/lib/constants/risk";
import { buildStablecoinSymbolSet } from "@/lib/constants/stablecoins";
import { getSymbolValues } from "@/lib/services/portfolio-calculator";
import { lookupPrice } from "@/lib/pricing/price-map";
import { resolveCanonicalCoinGeckoIdBySymbol } from "@/lib/pricing/binance-symbol-resolver";
import { normalizeCoingeckoId } from "@/lib/asset-key";
import type { RebalanceStrategy } from "@/components/rebalance/types";
import type { Suggestion } from "@/components/rebalance/types";

/**
 * Shared foundation for the rebalance hooks: vault + prices, parsed
 * rebalance settings, portfolio symbol values, and symbol → coingecko-id
 * resolution helpers (including trade-quantity formatting).
 */
export function useRebalanceCore() {
  const vault = useVaultStore((s) => s.vault);
  const {
    priceMap,
    updatedAt: pricesUpdatedAt,
    isLoading: pricesLoading,
    ensurePrices,
  } = usePrices();

  // ── Parsed settings ───────────────────────────────────────────

  const settings = vault.settings;
  const rebalanceStrategy = (settings.rebalanceStrategy || "percent-of-portfolio") as RebalanceStrategy;
  const holdZonePercent = parseFloat(settings.holdZonePercent || "5");
  const minTradeUsd = parseFloat(settings.minTradeUsd || "50");
  const buyOnlyMode = settings.buyOnlyMode === "1";
  const newCashUsd = parseFloat(settings.newCashUsd || "0");
  const cashReserveUsd = parseFloat(settings.cashReserveUsd || "0");
  const cashReservePercent = parseFloat(settings.cashReservePercent || "0");
  const dustThresholdUsd = parseFloat(settings.dustThresholdUsd || "1");
  const slippagePercent = parseFloat(settings.slippagePercent || "0.5");
  const tradingFeePercent = parseFloat(settings.tradingFeePercent || "0.1");
  const autoRefreshMinutes = parseFloat(settings.autoRefreshMinutes || "15");
  const concentrationThresholdPercent = parseConcentrationAlertThresholdPercent(
    settings.concentrationThresholdPercent
  );
  const excludeStablecoinsFromConcentration =
    settings.excludeStablecoinsFromConcentration === "1";
  const treatStablecoinsAsCashReserve =
    settings.treatStablecoinsAsCashReserve === "1";
  const concentrationThresholdLabel = Number.isInteger(concentrationThresholdPercent)
    ? concentrationThresholdPercent.toString()
    : concentrationThresholdPercent.toFixed(1);
  const lastRebalanceDate = settings.lastRebalanceDate || null;
  const parsedRiskParityLookbackDays = parseFloat(
    settings.riskParityLookbackDays || "30"
  );
  const riskParityLookbackDays = Number.isFinite(parsedRiskParityLookbackDays)
    ? Math.max(7, Math.min(365, Math.round(parsedRiskParityLookbackDays)))
    : 30;

  // ── Portfolio values + symbol resolution ─────────────────────

  const { symbolValues, totalValue } = useMemo(
    () => getSymbolValues(vault, priceMap),
    [vault, priceMap]
  );
  const stablecoinSymbols = useMemo(
    () => buildStablecoinSymbolSet(vault.tokenCategories),
    [vault.tokenCategories]
  );
  const knownSymbolCoingeckoMap = useMemo(() => {
    const map: Record<string, string> = {};
    const assign = (symbol: string, coingeckoId: string | null | undefined) => {
      const normalizedSymbol = symbol.trim().toUpperCase();
      const normalizedId = normalizeCoingeckoId(coingeckoId);
      if (!normalizedSymbol || !normalizedId || map[normalizedSymbol]) return;
      map[normalizedSymbol] = normalizedId;
    };

    for (const tx of vault.transactions) {
      assign(tx.tokenSymbol, tx.coingeckoId);
    }
    for (const entry of vault.manualEntries) {
      assign(entry.tokenSymbol, entry.coingeckoId);
    }
    for (const target of vault.rebalanceTargets) {
      assign(target.tokenSymbol, target.coingeckoId);
    }

    return map;
  }, [vault.manualEntries, vault.rebalanceTargets, vault.transactions]);

  const groupTargetSymbols = useMemo(
    () =>
      new Set(
        vault.tokenGroups.map((group) => group.name.trim().toUpperCase()).filter(Boolean)
      ),
    [vault.tokenGroups]
  );

  // ── Trade quantity helpers ────────────────────────────────────

  const getSuggestionTradeQuantity = useCallback(
    (suggestion: Suggestion): number | null => {
      if (suggestion.action === "hold" || suggestion.amount <= 0) {
        return null;
      }

      const symbol = suggestion.tokenSymbol.trim().toUpperCase();
      if (groupTargetSymbols.has(symbol)) {
        return null;
      }

      const coingeckoId =
        suggestion.coingeckoId ??
        knownSymbolCoingeckoMap[symbol] ??
        resolveCanonicalCoinGeckoIdBySymbol(symbol);
      if (!coingeckoId) {
        return null;
      }

      const unitPrice = lookupPrice(priceMap, symbol, coingeckoId)?.usd ?? 0;
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return null;
      }

      return suggestion.amount / unitPrice;
    },
    [groupTargetSymbols, knownSymbolCoingeckoMap, priceMap]
  );

  const getRoundedSuggestionTradeQuantity = useCallback(
    (suggestion: Suggestion): number | null => {
      const quantity = getSuggestionTradeQuantity(suggestion);
      if (quantity === null) {
        return null;
      }

      const symbol = suggestion.tokenSymbol.trim().toUpperCase();
      return symbol === "BTC"
        ? Math.round(quantity * 10) / 10
        : Math.round(quantity);
    },
    [getSuggestionTradeQuantity]
  );

  const formatSuggestionTradeQuantity = useCallback(
    (suggestion: Suggestion): string => {
      const roundedQuantity = getRoundedSuggestionTradeQuantity(suggestion);
      if (roundedQuantity === null) {
        return "-";
      }

      const symbol = suggestion.tokenSymbol.trim().toUpperCase();
      return symbol === "BTC"
        ? roundedQuantity.toFixed(1)
        : roundedQuantity.toLocaleString("en-US", {
            maximumFractionDigits: 0,
          });
    },
    [getRoundedSuggestionTradeQuantity]
  );

  const buildTrackableTokens = useCallback(
    (symbols: string[]) => {
      const byCoingeckoId = new Map<string, { coingeckoId: string; symbol: string }>();

      for (const rawSymbol of symbols) {
        const symbol = rawSymbol.trim().toUpperCase();
        if (!symbol) continue;
        const coingeckoId =
          knownSymbolCoingeckoMap[symbol] ??
          resolveCanonicalCoinGeckoIdBySymbol(symbol);
        if (!coingeckoId) continue;
        if (!byCoingeckoId.has(coingeckoId)) {
          byCoingeckoId.set(coingeckoId, { coingeckoId, symbol });
        }
      }

      return Array.from(byCoingeckoId.values());
    },
    [knownSymbolCoingeckoMap]
  );

  return {
    vault,
    priceMap,
    pricesUpdatedAt,
    pricesLoading,
    ensurePrices,
    settings,
    rebalanceStrategy,
    holdZonePercent,
    minTradeUsd,
    buyOnlyMode,
    newCashUsd,
    cashReserveUsd,
    cashReservePercent,
    dustThresholdUsd,
    slippagePercent,
    tradingFeePercent,
    autoRefreshMinutes,
    concentrationThresholdPercent,
    excludeStablecoinsFromConcentration,
    treatStablecoinsAsCashReserve,
    concentrationThresholdLabel,
    lastRebalanceDate,
    riskParityLookbackDays,
    symbolValues,
    totalValue,
    stablecoinSymbols,
    knownSymbolCoingeckoMap,
    groupTargetSymbols,
    getSuggestionTradeQuantity,
    getRoundedSuggestionTradeQuantity,
    formatSuggestionTradeQuantity,
    buildTrackableTokens,
  };
}

export type RebalanceCore = ReturnType<typeof useRebalanceCore>;
