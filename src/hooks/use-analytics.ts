"use client";

import { useMemo } from "react";
import { useVaultStore } from "@/lib/store";
import { usePrices } from "@/hooks/use-prices";
import { getHoldings, type TokenHolding } from "@/lib/services/portfolio-calculator";
import {
  computePerformanceMetrics,
  type PerformanceMetrics,
} from "@/lib/services/analytics";

export function useAnalytics(precomputedHoldings?: TokenHolding[]): PerformanceMetrics {
  const vault = useVaultStore((s) => s.vault);
  const { priceMap } = usePrices();

  return useMemo(() => {
    const holdings = precomputedHoldings ?? getHoldings(vault, priceMap);
    return computePerformanceMetrics(holdings);
  }, [vault, priceMap, precomputedHoldings]);
}
