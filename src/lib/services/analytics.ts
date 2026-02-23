import type { TokenHolding } from "@/lib/services/portfolio-calculator";

export interface PerformanceMetrics {
  totalInvested: number;
  totalValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  bestPerformer: { symbol: string; returnPercent: number } | null;
  worstPerformer: { symbol: string; returnPercent: number } | null;
  winRate: number;
  avgHoldingValue: number;
  numberOfTokens: number;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computePerformanceMetrics(
  holdings: TokenHolding[]
): PerformanceMetrics {
  const activeHoldings = holdings.filter((holding) => holding.currentQty > 0);
  const positions = holdings.filter(
    (holding) =>
      holding.totalBuyCost > 0 ||
      holding.totalSellRevenue > 0 ||
      holding.currentQty > 0
  );

  let totalInvested = 0;
  let totalValue = 0;
  let totalReturn = 0;
  let winners = 0;
  let positionsWithCost = 0;

  let best: { symbol: string; returnPercent: number } | null = null;
  let worst: { symbol: string; returnPercent: number } | null = null;

  for (const holding of positions) {
    totalInvested += holding.totalBuyCost;
    totalValue += holding.currentValue;

    const holdingReturn = holding.realizedPL + holding.unrealizedPL;
    totalReturn += holdingReturn;

    if (holding.totalBuyCost > 0) {
      positionsWithCost += 1;
      if (holdingReturn > 0) {
        winners += 1;
      }

      const returnPercent = (holdingReturn / holding.totalBuyCost) * 100;
      if (!best || returnPercent > best.returnPercent) {
        best = {
          symbol: holding.symbol,
          returnPercent,
        };
      }
      if (!worst || returnPercent < worst.returnPercent) {
        worst = {
          symbol: holding.symbol,
          returnPercent,
        };
      }
    }
  }

  const totalReturnPercent =
    totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;
  const winRate =
    positionsWithCost > 0 ? (winners / positionsWithCost) * 100 : 0;
  const avgHoldingValue =
    activeHoldings.length > 0 ? totalValue / activeHoldings.length : 0;

  return {
    totalInvested: roundToTwo(totalInvested),
    totalValue: roundToTwo(totalValue),
    totalReturn: roundToTwo(totalReturn),
    totalReturnPercent: roundToTwo(totalReturnPercent),
    bestPerformer: best
      ? {
          symbol: best.symbol,
          returnPercent: roundToTwo(best.returnPercent),
        }
      : null,
    worstPerformer: worst
      ? {
          symbol: worst.symbol,
          returnPercent: roundToTwo(worst.returnPercent),
        }
      : null,
    winRate: roundToTwo(winRate),
    avgHoldingValue: roundToTwo(avgHoldingValue),
    numberOfTokens: activeHoldings.length,
  };
}
