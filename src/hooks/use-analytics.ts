"use client";

import { useMemo } from "react";
import { useVaultStore } from "@/lib/store";
import { usePrices } from "@/hooks/use-prices";
import { getHoldings } from "@/lib/services/portfolio-calculator";
import {
  computePerformanceMetrics,
  type PerformanceMetrics,
} from "@/lib/services/analytics";

export function useAnalytics(): PerformanceMetrics {
  const vault = useVaultStore((s) => s.vault);
  const { priceMap } = usePrices();

  return useMemo(() => {
    const holdings = getHoldings(vault, priceMap);
    return computePerformanceMetrics(holdings);
  }, [vault, priceMap]);
}
