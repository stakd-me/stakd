import type { RebalanceStrategy } from "@/components/rebalance/types";
import type { VaultData } from "@/lib/crypto/vault-types";
import {
  parseConcentrationAlertThresholdPercent,
} from "@/lib/constants/risk";
import { buildStablecoinSymbolSet } from "@/lib/constants/stablecoins";
import { getPortfolioSummary, type PriceData } from "@/lib/services/portfolio-calculator";
import {
  buildStrategyContext,
  dispatchStrategy,
} from "@/lib/services/rebalance-strategies";

export function getRebalanceAlertTokenCount(
  vault: VaultData,
  priceMap: Record<string, PriceData>
): number {
  const alertSymbols = new Set<string>();

  if (vault.rebalanceTargets.length > 0 && Object.keys(priceMap).length > 0) {
    try {
      const strategyContext = buildStrategyContext(vault, priceMap);
      const rebalanceStrategy = (vault.settings.rebalanceStrategy || "percent-of-portfolio") as RebalanceStrategy;
      const strategyOutput = dispatchStrategy(rebalanceStrategy, strategyContext, vault.settings);

      for (const suggestion of strategyOutput.suggestions) {
        if (suggestion.action !== "hold") {
          alertSymbols.add(suggestion.tokenSymbol.toUpperCase());
        }
      }
    } catch {
      // Ignore strategy failures and keep concentration alerts available.
    }
  }

  const summary = getPortfolioSummary(vault, priceMap);
  if (summary.totalValueUsd === 0) {
    return alertSymbols.size;
  }

  const concentrationThresholdPercent = parseConcentrationAlertThresholdPercent(
    vault.settings.concentrationThresholdPercent
  );
  const excludeStablecoinsFromConcentration =
    vault.settings.excludeStablecoinsFromConcentration === "1";
  const stablecoinSymbols = buildStablecoinSymbolSet(vault.tokenCategories);

  for (const allocation of summary.tokenAllocations) {
    const symbol = allocation.symbol.toUpperCase();
    if (
      excludeStablecoinsFromConcentration &&
      stablecoinSymbols.has(symbol)
    ) {
      continue;
    }

    if (allocation.percent > concentrationThresholdPercent) {
      alertSymbols.add(symbol);
    }
  }

  return alertSymbols.size;
}
