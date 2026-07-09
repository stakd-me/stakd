"use client";

import { useState, useMemo, useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { useVaultStore } from "@/lib/store";
import { lookupPrice } from "@/lib/pricing/price-map";
import { resolveCanonicalCoinGeckoIdBySymbol } from "@/lib/pricing/binance-symbol-resolver";
import type { TokenGroup } from "@/components/rebalance/types";
import type { RebalanceCore } from "./use-rebalance-core";

/**
 * Token-group state for the rebalance screen: derived group views with
 * tracking status, plus create/update/track/delete mutations.
 */
export function useRebalanceGroups(core: RebalanceCore) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const {
    vault,
    priceMap,
    symbolValues,
    knownSymbolCoingeckoMap,
    buildTrackableTokens,
    ensurePrices,
  } = core;

  const [groupCreatePending, setGroupCreatePending] = useState(false);
  const [groupUpdatePending, setGroupUpdatePending] = useState(false);
  const [groupDeletePending, setGroupDeletePending] = useState(false);
  const [groupTrackPendingId, setGroupTrackPendingId] = useState<string | number | null>(null);

  const groups = useMemo((): TokenGroup[] => {
    return vault.tokenGroups.map((g) => {
      let groupTotal = 0;
      let trackedCount = 0;
      let requestedCount = 0;
      let untrackedCount = 0;
      const members: TokenGroup["members"] = [];

      for (const rawSymbol of g.symbols) {
        const symbol = rawSymbol.trim().toUpperCase();
        if (!symbol) continue;
        const val = symbolValues[symbol] || 0;
        groupTotal += val;

        const coingeckoId =
          knownSymbolCoingeckoMap[symbol] ??
          resolveCanonicalCoinGeckoIdBySymbol(symbol);
        const trackingStatus = lookupPrice(priceMap, symbol, coingeckoId)
          ? "tracked"
          : coingeckoId
            ? "requested"
            : "untracked";

        if (trackingStatus === "tracked") trackedCount += 1;
        else if (trackingStatus === "requested") requestedCount += 1;
        else untrackedCount += 1;

        members.push({
          symbol,
          valueUsd: val,
          percentInGroup: 0,
          coingeckoId,
          trackingStatus,
        });
      }
      for (const m of members) {
        m.percentInGroup = groupTotal > 0 ? (m.valueUsd / groupTotal) * 100 : 0;
      }

      const totalCount = members.length;
      const status =
        totalCount > 0 && trackedCount === totalCount
          ? "tracked"
          : trackedCount === 0 && requestedCount === 0
            ? "untracked"
            : "partial";

      return {
        id: g.id,
        name: g.name,
        symbols: g.symbols,
        totalValueUsd: groupTotal,
        members,
        tracking: {
          status,
          trackedCount,
          requestedCount,
          untrackedCount,
          totalCount,
        },
      };
    });
  }, [vault.tokenGroups, symbolValues, knownSymbolCoingeckoMap, priceMap]);

  const ensureGroupSymbolsTracked = useCallback(
    async (symbols: string[]) => {
      const tokensToEnsure = buildTrackableTokens(symbols);
      if (tokensToEnsure.length === 0) return 0;
      await ensurePrices(tokensToEnsure);
      return tokensToEnsure.length;
    },
    [buildTrackableTokens, ensurePrices]
  );

  const handleCreateGroup = useCallback(
    async (data: { name: string; symbols: string[] }) => {
      setGroupCreatePending(true);
      try {
        const normalizedName = data.name.trim();
        const normalizedSymbols = Array.from(
          new Set(data.symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))
        );
        if (!normalizedName || normalizedSymbols.length === 0) {
          return;
        }

        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          tokenGroups: [
            ...prev.tokenGroups,
            {
              id: crypto.randomUUID(),
              name: normalizedName,
              symbols: normalizedSymbols,
              createdAt: new Date().toISOString(),
            },
          ],
        }));
        try {
          await ensureGroupSymbolsTracked(normalizedSymbols);
        } catch {
          toast(t("rebalance.groupTrackFailed"), "info");
        }
      } finally {
        setGroupCreatePending(false);
      }
    },
    [ensureGroupSymbolsTracked, t, toast]
  );

  const handleUpdateGroup = useCallback(
    async (id: string | number, data: { name: string; symbols: string[] }) => {
      setGroupUpdatePending(true);
      try {
        const normalizedName = data.name.trim();
        const normalizedSymbols = Array.from(
          new Set(data.symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))
        );
        if (!normalizedName || normalizedSymbols.length === 0) {
          return;
        }

        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          tokenGroups: prev.tokenGroups.map((group) =>
            String(group.id) === String(id)
              ? {
                  ...group,
                  name: normalizedName,
                  symbols: normalizedSymbols,
                }
              : group
          ),
        }));
        try {
          await ensureGroupSymbolsTracked(normalizedSymbols);
        } catch {
          toast(t("rebalance.groupTrackFailed"), "info");
        }
      } finally {
        setGroupUpdatePending(false);
      }
    },
    [ensureGroupSymbolsTracked, t, toast]
  );

  const handleTrackGroup = useCallback(
    async (id: string | number) => {
      const group = vault.tokenGroups.find(
        (item) => String(item.id) === String(id)
      );
      if (!group) return;

      setGroupTrackPendingId(id);
      try {
        const ensuredCount = await ensureGroupSymbolsTracked(group.symbols);
        if (ensuredCount > 0) {
          toast(t("rebalance.groupTrackRequested", { count: ensuredCount }), "success");
        } else {
          toast(t("rebalance.groupTrackUnavailable"), "info");
        }
      } catch {
        toast(t("rebalance.groupTrackFailed"), "error");
      } finally {
        setGroupTrackPendingId(null);
      }
    },
    [ensureGroupSymbolsTracked, t, toast, vault.tokenGroups]
  );

  const handleDeleteGroup = useCallback(
    (id: string | number) => {
      setGroupDeletePending(true);
      try {
        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          tokenGroups: prev.tokenGroups.filter((g) => g.id !== id),
        }));
      } finally {
        setGroupDeletePending(false);
      }
    },
    []
  );

  return {
    groups,
    groupCreatePending,
    groupUpdatePending,
    groupDeletePending,
    groupTrackPendingId,
    handleCreateGroup,
    handleUpdateGroup,
    handleTrackGroup,
    handleDeleteGroup,
  };
}
