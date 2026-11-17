"use client";

import { useCallback } from "react";
import { useVaultStore } from "@/lib/store";
import { usePriceSelector } from "@/hooks/use-prices";
import { getRebalanceAlertTokenCount } from "@/lib/services/rebalance-alerts";
import type { PriceMap } from "@/hooks/use-prices";

/**
 * The rebalance badge count, shared by the rail and the bottom tabs. Derived
 * through a query selector, so the nav re-renders when the *count* changes
 * rather than on every price tick.
 */
export function useRebalanceAlertCount(): number {
  const vault = useVaultStore((s) => s.vault);
  const select = useCallback(
    (data: { priceMap: PriceMap }) => getRebalanceAlertTokenCount(vault, data.priceMap),
    [vault]
  );
  return usePriceSelector(select) ?? 0;
}
