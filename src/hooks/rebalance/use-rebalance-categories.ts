"use client";

import { useState, useMemo, useCallback } from "react";
import { useVaultStore } from "@/lib/store";
import { computeCategoryBreakdown } from "@/lib/services/rebalance-view";
import type {
  TargetRow,
  TokenCategory,
  CategoryBreakdown,
} from "@/components/rebalance/types";
import type { RebalanceCore } from "./use-rebalance-core";

/**
 * Token-category state for the rebalance screen: category list, per-category
 * value breakdown, symbol options for the category form, and set/delete
 * mutations.
 */
export function useRebalanceCategories(core: RebalanceCore, targets: TargetRow[]) {
  const { vault, symbolValues, totalValue } = core;

  const [categorySetPending, setCategorySetPending] = useState(false);
  const [categoryDeletePending, setCategoryDeletePending] = useState(false);

  const categories = useMemo((): TokenCategory[] => {
    return vault.tokenCategories.map((c) => ({
      id: c.id,
      tokenSymbol: c.tokenSymbol,
      category: c.category,
    }));
  }, [vault.tokenCategories]);

  const categoryBreakdown = useMemo((): CategoryBreakdown[] => {
    return computeCategoryBreakdown(categories, symbolValues, totalValue);
  }, [categories, symbolValues, totalValue]);

  const tokenSymbolOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const symbol of Object.keys(symbolValues)) {
      const normalized = symbol.trim().toUpperCase();
      if (normalized) unique.add(normalized);
    }
    for (const target of targets) {
      const normalized = target.tokenSymbol.trim().toUpperCase();
      if (normalized) unique.add(normalized);
    }
    for (const category of categories) {
      const normalized = category.tokenSymbol.trim().toUpperCase();
      if (normalized) unique.add(normalized);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [symbolValues, targets, categories]);

  const handleSetCategory = useCallback(
    (data: { tokenSymbol: string; category: string }) => {
      setCategorySetPending(true);
      try {
        useVaultStore.getState().updateVault((prev) => {
          const existing = prev.tokenCategories.findIndex(
            (c) => c.tokenSymbol.toUpperCase() === data.tokenSymbol.toUpperCase()
          );
          const updated = [...prev.tokenCategories];
          if (existing >= 0) {
            updated[existing] = {
              ...updated[existing],
              category: data.category,
              updatedAt: new Date().toISOString(),
            };
          } else {
            updated.push({
              id: crypto.randomUUID(),
              tokenSymbol: data.tokenSymbol.toUpperCase(),
              category: data.category,
              updatedAt: new Date().toISOString(),
            });
          }
          return { ...prev, tokenCategories: updated };
        });
      } finally {
        setCategorySetPending(false);
      }
    },
    []
  );

  const handleDeleteCategory = useCallback(
    (tokenSymbol: string) => {
      setCategoryDeletePending(true);
      try {
        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          tokenCategories: prev.tokenCategories.filter(
            (c) => c.tokenSymbol.toUpperCase() !== tokenSymbol.toUpperCase()
          ),
        }));
      } finally {
        setCategoryDeletePending(false);
      }
    },
    []
  );

  return {
    categories,
    categoryBreakdown,
    tokenSymbolOptions,
    categorySetPending,
    categoryDeletePending,
    handleSetCategory,
    handleDeleteCategory,
  };
}
