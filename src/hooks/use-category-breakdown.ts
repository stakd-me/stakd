"use client";

import { useMemo } from "react";
import type { VaultData } from "@/lib/crypto/vault-types";

export interface CategorySlice {
  category: string;
  valueUsd: number;
  percent: number;
}

/** Portfolio value grouped by the user's token categories, largest first. */
export function useCategoryBreakdown(
  tokenCategories: VaultData["tokenCategories"],
  breakdown: { symbol: string; value: number }[],
  totalValue: number
): CategorySlice[] {
  return useMemo(() => {
    const categories = tokenCategories;
    if (categories.length === 0 || totalValue === 0) return [];

    // Build symbol -> value map from breakdown
    const symbolValueMap: Record<string, number> = {};
    for (const item of breakdown) {
      const sym = item.symbol.toUpperCase();
      symbolValueMap[sym] = (symbolValueMap[sym] || 0) + item.value;
    }

    // Aggregate by category
    const catValueMap: Record<string, number> = {};
    for (const cat of categories) {
      const sym = cat.tokenSymbol.toUpperCase();
      const value = symbolValueMap[sym] ?? 0;
      catValueMap[cat.category] = (catValueMap[cat.category] || 0) + value;
    }

    return Object.entries(catValueMap)
      .filter(([, valueUsd]) => valueUsd > 0)
      .map(([category, valueUsd]) => ({
        category,
        valueUsd,
        percent: (valueUsd / totalValue) * 100,
      }))
      .sort((a, b) => b.valueUsd - a.valueUsd);
  }, [tokenCategories, totalValue, breakdown]);
}
