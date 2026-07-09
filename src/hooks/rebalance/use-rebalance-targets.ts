"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { useVaultStore } from "@/lib/store";
import { computeAutocompleteSuggestions } from "@/lib/services/rebalance-view";
import type { StrategyContext } from "@/lib/services/rebalance-strategies";
import type { TargetRow, Suggestion, TokenGroup } from "@/components/rebalance/types";
import type { RebalanceCore } from "./use-rebalance-core";

const TARGET_EXPANDED_STORAGE_KEY = "rebalance:target-allocation-expanded";

/**
 * Target-allocation state for the rebalance screen: editable target rows,
 * persistence (handleSave), auto-generation, quick-add helpers, the
 * collapsible-section preference, and the target-row autocomplete.
 */
export function useRebalanceTargets(
  core: RebalanceCore,
  strategyContext: StrategyContext | null,
  groups: TokenGroup[],
) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const {
    vault,
    symbolValues,
    totalValue,
    dustThresholdUsd,
    stablecoinSymbols,
    treatStablecoinsAsCashReserve,
  } = core;

  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [isSeeded, setIsSeeded] = useState(false);

  // Autocomplete state
  const [activeAutocompleteIndex, setActiveAutocompleteIndex] = useState<
    number | null
  >(null);
  const [autocompleteQuery, setAutocompleteQuery] = useState("");

  // Collapsible sections
  const [targetExpanded, setTargetExpanded] = useState(false);
  const [targetExpandedPref, setTargetExpandedPref] = useState<boolean | null>(null);

  // Mutation pending states
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const savedTargets = useMemo((): TargetRow[] => {
    return vault.rebalanceTargets.map((t) => ({
      tokenSymbol: t.tokenSymbol,
      targetPercent: t.targetPercent,
      coingeckoId: t.coingeckoId || "",
    }));
  }, [vault.rebalanceTargets]);

  useEffect(() => {
    if (savedTargets.length > 0 && !isSeeded) {
      setTargets(savedTargets);
      setIsSeeded(true);
    }
  }, [savedTargets, isSeeded]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(TARGET_EXPANDED_STORAGE_KEY);
    const pref = raw === "1" ? true : raw === "0" ? false : null;
    setTargetExpandedPref(pref);
    if (pref !== null) {
      setTargetExpanded(pref);
    }
  }, []);

  useEffect(() => {
    if (targets.length === 0) {
      setTargetExpanded(true);
      return;
    }
    if (targetExpandedPref !== null) {
      setTargetExpanded(targetExpandedPref);
    }
  }, [targets.length, targetExpandedPref]);

  const handleToggleTargetExpanded = useCallback(() => {
    setTargetExpanded((prev) => {
      const next = !prev;
      if (targets.length > 0 && typeof window !== "undefined") {
        window.localStorage.setItem(
          TARGET_EXPANDED_STORAGE_KEY,
          next ? "1" : "0"
        );
        setTargetExpandedPref(next);
      }
      return next;
    });
  }, [targets.length]);

  // ── Computed: autocomplete ────────────────────────────────────

  const autocompleteData = useMemo(() => {
    if (activeAutocompleteIndex === null || autocompleteQuery.length === 0) {
      return { suggestions: [] };
    }
    return {
      suggestions: computeAutocompleteSuggestions(
        autocompleteQuery,
        symbolValues,
        groups,
      ),
    };
  }, [activeAutocompleteIndex, autocompleteQuery, symbolValues, groups]);

  // ── Mutations (vault updates) ─────────────────────────────────

  const handleSave = useCallback(() => {
    setSavePending(true);
    setSaveError(null);
    try {
      const validTargets = targets.filter(
        (t) => t.tokenSymbol.trim().length > 0 && t.targetPercent > 0
      );
      const mergedTargets = new Map<string, TargetRow>();
      for (const target of validTargets) {
        const symbol = target.tokenSymbol.trim().toUpperCase();
        const coingeckoId = target.coingeckoId.trim();
        const existing = mergedTargets.get(symbol);
        if (existing) {
          existing.targetPercent =
            Math.round((existing.targetPercent + target.targetPercent) * 100) / 100;
          if (!existing.coingeckoId && coingeckoId.length > 0) {
            existing.coingeckoId = coingeckoId;
          }
        } else {
          mergedTargets.set(symbol, {
            tokenSymbol: symbol,
            targetPercent: Math.round(target.targetPercent * 100) / 100,
            coingeckoId,
          });
        }
      }

      const normalizedTargets = Array.from(mergedTargets.values());
      useVaultStore.getState().updateVault((prev) => ({
        ...prev,
        rebalanceTargets: normalizedTargets.map((t) => ({
          id: prev.rebalanceTargets.find(
            (r) => r.tokenSymbol.toUpperCase() === t.tokenSymbol.toUpperCase()
          )?.id || crypto.randomUUID(),
          tokenSymbol: t.tokenSymbol,
          targetPercent: t.targetPercent,
          coingeckoId: t.coingeckoId || null,
          updatedAt: new Date().toISOString(),
        })),
      }));
      toast(t("rebalance.targetsSaved"), "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("rebalance.failedSaveTargets");
      setSaveError(message);
      toast(message, "error");
    } finally {
      setSavePending(false);
    }
  }, [targets, toast, t]);

  const handleAutoGenerate = useCallback(
    (mode: "equal" | "market-cap") => {
      const symbols = Object.entries(symbolValues)
        .filter(([, val]) => val > dustThresholdUsd)
        .sort((a, b) => b[1] - a[1]);

      if (symbols.length === 0) {
        toast(t("rebalance.failedGenerateTargets"), "error");
        return;
      }

      if (mode === "equal") {
        const equalPercent = Math.round((100 / symbols.length) * 100) / 100;
        setTargets(
          symbols.map(([sym]) => ({
            tokenSymbol: sym,
            targetPercent: equalPercent,
            coingeckoId: "",
          }))
        );
      } else {
        setTargets(
          symbols.map(([sym, val]) => ({
            tokenSymbol: sym,
            targetPercent: Math.round((val / totalValue) * 10000) / 100,
            coingeckoId: "",
          }))
        );
      }
      toast(t("rebalance.targetsGenerated"), "success");
    },
    [symbolValues, totalValue, dustThresholdUsd, toast, t]
  );

  // ── Target row handlers ──────────────────────────────────────

  const totalPercent = targets.reduce(
    (s, t) => s + (t.targetPercent || 0),
    0
  );

  const stablecoinQuickAdd = useMemo(() => {
    if (treatStablecoinsAsCashReserve) return null;

    const targetSymbolSet = new Set(
      targets.map((target) => target.tokenSymbol.trim().toUpperCase())
    );

    const candidates = Object.entries(symbolValues)
      .map(([symbol, value]) => ({
        symbol: symbol.toUpperCase(),
        value,
      }))
      .filter(
        (candidate) =>
          candidate.value > dustThresholdUsd &&
          stablecoinSymbols.has(candidate.symbol) &&
          !targetSymbolSet.has(candidate.symbol)
      )
      .sort((a, b) => b.value - a.value);

    const top = candidates[0];
    if (!top || totalValue <= 0) return null;

    const percent = Math.round((top.value / totalValue) * 10000) / 100;
    if (!Number.isFinite(percent) || percent <= 0) return null;

    return {
      symbol: top.symbol,
      percent,
      coingeckoId: strategyContext?.symbolCoingeckoMap[top.symbol] ?? null,
    };
  }, [
    dustThresholdUsd,
    stablecoinSymbols,
    strategyContext,
    symbolValues,
    targets,
    totalValue,
    treatStablecoinsAsCashReserve,
  ]);

  const addTargetFromUntargeted = useCallback((s: Suggestion) => {
    const alreadyExists = targets.some(
      (t) => t.tokenSymbol.toUpperCase() === s.tokenSymbol.toUpperCase()
    );
    if (alreadyExists) return;
    setTargets([
      ...targets,
      {
        tokenSymbol: s.tokenSymbol,
        targetPercent: Math.round(s.currentPercent),
        coingeckoId: s.coingeckoId || "",
      },
    ]);
  }, [targets]);

  const handleAddStablecoinTarget = useCallback(() => {
    if (!stablecoinQuickAdd) return;

    const alreadyExists = targets.some(
      (target) =>
        target.tokenSymbol.trim().toUpperCase() === stablecoinQuickAdd.symbol
    );
    if (alreadyExists) return;

    setTargets([
      ...targets,
      {
        tokenSymbol: stablecoinQuickAdd.symbol,
        targetPercent: stablecoinQuickAdd.percent,
        coingeckoId: stablecoinQuickAdd.coingeckoId || "",
      },
    ]);
  }, [stablecoinQuickAdd, targets]);

  const targetedSymbolsUpper = useMemo(
    () =>
      new Set(targets.map((target) => target.tokenSymbol.trim().toUpperCase())),
    [targets]
  );

  return {
    targets,
    setTargets,
    targetExpanded,
    activeAutocompleteIndex,
    setActiveAutocompleteIndex,
    autocompleteQuery,
    setAutocompleteQuery,
    autocompleteData,
    savePending,
    saveError,
    totalPercent,
    stablecoinQuickAdd,
    targetedSymbolsUpper,
    handleToggleTargetExpanded,
    handleSave,
    handleAutoGenerate,
    addTargetFromUntargeted,
    handleAddStablecoinTarget,
  };
}
