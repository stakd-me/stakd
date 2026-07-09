"use client";

import { useCallback, useMemo, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { useVaultStore } from "@/lib/store";
import { withAutoStablecoinCategory } from "@/lib/constants/stablecoins";
import { BINANCE_SYMBOL_TO_COINGECKO_ID } from "@/lib/pricing/binance-symbol-resolver";
import { createVaultTransaction } from "@/lib/transactions";
import type {
  ManualEntry,
  PortfolioCoinListItem,
} from "@/components/portfolio/types";

interface UseManualEntriesArgs {
  coinList: PortfolioCoinListItem[] | undefined;
  search: string;
  ensurePrices: (
    tokens: { coingeckoId: string; symbol: string }[]
  ) => Promise<void>;
}

/**
 * Manual-entry (quick add holdings) CRUD for the portfolio page: form state,
 * symbol suggestions, add/update/delete vault mutations, and the
 * delete-confirm target. All toasts / i18n messages are unchanged from the
 * original page.
 */
export function useManualEntries({
  coinList,
  search,
  ensurePrices,
}: UseManualEntriesArgs) {
  const { toast } = useToast();
  const { t } = useTranslation();

  const vaultManualEntries = useVaultStore((s) => s.vault.manualEntries);

  // Add form state
  const [showManualSymbolSuggestions, setShowManualSymbolSuggestions] =
    useState(false);
  const [meSymbol, setMeSymbol] = useState("");
  const [meName, setMeName] = useState("");
  const [meCoingeckoId, setMeCoingeckoId] = useState("");
  const [meQuantity, setMeQuantity] = useState("");
  const [meInitialPrice, setMeInitialPrice] = useState("");
  const [meNote, setMeNote] = useState("");

  // Edit / delete state
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editEntryQty, setEditEntryQty] = useState("");
  const [editEntryNote, setEditEntryNote] = useState("");
  const [deleteManualTarget, setDeleteManualTarget] =
    useState<ManualEntry | null>(null);

  // Mutation-in-progress states (to replicate isPending for UI disable)
  const [addingManualEntry, setAddingManualEntry] = useState(false);
  const [updatingManualEntry, setUpdatingManualEntry] = useState(false);
  const [deletingManualEntry, setDeletingManualEntry] = useState(false);

  // --- Manual entries from vault ---
  const manualEntries: ManualEntry[] = useMemo(() => {
    return vaultManualEntries.map((e) => ({
      id: e.id,
      tokenSymbol: e.tokenSymbol,
      tokenName: e.tokenName,
      coingeckoId: e.coingeckoId,
      quantity: e.quantity,
      note: e.note,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));
  }, [vaultManualEntries]);

  const filteredManualEntries = useMemo(() => {
    if (!search.trim()) return manualEntries;
    const q = search.toLowerCase();
    return manualEntries.filter((entry) =>
      entry.tokenSymbol.toLowerCase().includes(q) ||
      entry.tokenName.toLowerCase().includes(q) ||
      (entry.coingeckoId ?? "").toLowerCase().includes(q) ||
      (entry.note ?? "").toLowerCase().includes(q)
    );
  }, [manualEntries, search]);

  const manualSymbolSuggestions = useMemo(() => {
    if (!coinList || meSymbol.trim().length === 0) return [];
    const q = meSymbol.trim().toLowerCase();
    const results: PortfolioCoinListItem[] = [];
    for (const coin of coinList) {
      if (
        coin.symbol.toLowerCase().includes(q) ||
        coin.name.toLowerCase().includes(q) ||
        coin.id.toLowerCase().includes(q)
      ) {
        results.push(coin);
        if (results.length >= 30) break;
      }
    }
    results.sort((a, b) => {
      if (a.binance !== b.binance) return a.binance ? -1 : 1;
      return 0;
    });
    return results.slice(0, 10);
  }, [coinList, meSymbol]);

  const manualEntryQuantityValid =
    Number.isFinite(parseFloat(meQuantity)) && parseFloat(meQuantity) > 0;
  const manualEntryInitialPriceValid =
    meInitialPrice.trim().length === 0 ||
    (Number.isFinite(parseFloat(meInitialPrice)) &&
      parseFloat(meInitialPrice) >= 0);

  const selectManualSymbolSuggestion = useCallback(
    (coin: PortfolioCoinListItem) => {
      setMeSymbol(coin.symbol.toUpperCase());
      setMeName(coin.name);
      setMeCoingeckoId(coin.id);
      setShowManualSymbolSuggestions(false);
    },
    []
  );

  // --- Add entry ---
  const addEntry = useCallback(async () => {
    setAddingManualEntry(true);
    try {
      const quantity = parseFloat(meQuantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(t("portfolio.validationQuantityPositive"));
      }

      const normalizedSymbol = meSymbol.trim().toUpperCase();
      const normalizedName = meName.trim();
      const normalizedCoingeckoId = meCoingeckoId.trim()
        || BINANCE_SYMBOL_TO_COINGECKO_ID[normalizedSymbol]
        || "";
      const initialPriceRaw = meInitialPrice.trim();
      const initialPrice =
        initialPriceRaw.length > 0 ? parseFloat(initialPriceRaw) : null;

      if (initialPrice !== null && (!Number.isFinite(initialPrice) || initialPrice < 0)) {
        throw new Error(t("portfolio.validationPriceNonNegative"));
      }

      if (initialPrice !== null && initialPrice > 0) {
        const nowIso = new Date().toISOString();
        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          transactions: [
            ...prev.transactions,
            createVaultTransaction({
              id: crypto.randomUUID(),
              tokenSymbol: normalizedSymbol,
              tokenName: normalizedName,
              chain: "",
              type: "buy",
              quantity,
              pricePerUnit: initialPrice,
              fee: 0,
              coingeckoId: normalizedCoingeckoId || null,
              note: meNote,
              transactedAt: nowIso,
              createdAt: nowIso,
            }),
          ],
          tokenCategories: withAutoStablecoinCategory(
            prev.tokenCategories,
            normalizedSymbol,
            nowIso
          ),
        }));
        toast(t("portfolio.transactionAdded", { type: t("portfolio.buy") }), "success");
      } else {
        const nowIso = new Date().toISOString();
        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          manualEntries: [...prev.manualEntries, {
            id: crypto.randomUUID(),
            tokenSymbol: normalizedSymbol,
            tokenName: normalizedName,
            coingeckoId: normalizedCoingeckoId || null,
            quantity,
            note: meNote.trim() || null,
            createdAt: nowIso,
            updatedAt: nowIso,
          }],
          tokenCategories: withAutoStablecoinCategory(
            prev.tokenCategories,
            normalizedSymbol,
            nowIso
          ),
        }));
        toast(t("portfolio.manualEntryUpdated"), "success");
      }

      if (normalizedCoingeckoId) {
        await ensurePrices([{ coingeckoId: normalizedCoingeckoId, symbol: normalizedSymbol }]);
      }

      setMeSymbol("");
      setMeName("");
      setMeCoingeckoId("");
      setMeQuantity("");
      setMeInitialPrice("");
      setMeNote("");
      setShowManualSymbolSuggestions(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : t("portfolio.failedManualEntry"), "error");
    } finally {
      setAddingManualEntry(false);
    }
  }, [meCoingeckoId, meInitialPrice, meName, meNote, meQuantity, meSymbol, toast, t, ensurePrices]);

  const submitNewEntry = useCallback(() => {
    if (!meSymbol || !meName || !meQuantity) {
      toast(t("portfolio.requiredFields"), "error");
      return;
    }
    if (!manualEntryQuantityValid) {
      toast(t("portfolio.validationQuantityPositive"), "error");
      return;
    }
    if (!manualEntryInitialPriceValid) {
      toast(t("portfolio.validationPriceNonNegative"), "error");
      return;
    }
    void addEntry();
  }, [
    addEntry,
    manualEntryInitialPriceValid,
    manualEntryQuantityValid,
    meName,
    meQuantity,
    meSymbol,
    t,
    toast,
  ]);

  // --- Update entry ---
  const updateEntry = useCallback(
    async ({ id, quantity, note }: { id: string; quantity: string; note: string }) => {
      setUpdatingManualEntry(true);
      try {
        const parsedQuantity = parseFloat(quantity);
        if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
          throw new Error(t("portfolio.validationQuantityPositive"));
        }

        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          manualEntries: prev.manualEntries.map((e) =>
            e.id === id
              ? { ...e, quantity: parsedQuantity, note: note || null, updatedAt: new Date().toISOString() }
              : e
          ),
        }));
        toast(t("portfolio.manualEntryUpdated"), "success");
        setEditingEntryId(null);
      } catch (err) {
        toast(err instanceof Error ? err.message : t("portfolio.failedUpdateEntry"), "error");
      } finally {
        setUpdatingManualEntry(false);
      }
    },
    [toast, t]
  );

  const startEditEntry = useCallback((entry: ManualEntry) => {
    setEditingEntryId(entry.id);
    setEditEntryQty(entry.quantity.toString());
    setEditEntryNote(entry.note || "");
  }, []);

  const saveEditEntry = useCallback(
    (entry: ManualEntry) => {
      void updateEntry({
        id: entry.id,
        quantity: editEntryQty,
        note: editEntryNote,
      });
    },
    [editEntryNote, editEntryQty, updateEntry]
  );

  const cancelEditEntry = useCallback(() => {
    setEditingEntryId(null);
  }, []);

  // --- Delete entry ---
  const deleteEntry = useCallback(
    (id: string) => {
      setDeletingManualEntry(true);
      try {
        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          manualEntries: prev.manualEntries.filter((e) => e.id !== id),
        }));
        toast(t("portfolio.manualEntryDeleted"), "success");
      } catch {
        toast(t("portfolio.failedDeleteEntry"), "error");
      } finally {
        setDeletingManualEntry(false);
      }
    },
    [toast, t]
  );

  const confirmDeleteEntry = useCallback(() => {
    if (!deleteManualTarget) return;
    deleteEntry(deleteManualTarget.id);
    setDeleteManualTarget(null);
  }, [deleteEntry, deleteManualTarget]);

  const cancelDeleteEntry = useCallback(() => {
    setDeleteManualTarget(null);
  }, []);

  return {
    // Data
    manualEntries,
    filteredManualEntries,
    manualSymbolSuggestions,

    // Add form state
    meSymbol,
    setMeSymbol,
    meName,
    setMeName,
    meQuantity,
    setMeQuantity,
    meInitialPrice,
    setMeInitialPrice,
    meNote,
    setMeNote,
    showManualSymbolSuggestions,
    setShowManualSymbolSuggestions,
    manualEntryQuantityValid,
    manualEntryInitialPriceValid,

    // Edit / delete state
    editingEntryId,
    editEntryQty,
    setEditEntryQty,
    editEntryNote,
    setEditEntryNote,
    deleteManualTarget,
    setDeleteManualTarget,

    // Pending flags
    addingManualEntry,
    updatingManualEntry,
    deletingManualEntry,

    // Actions
    selectManualSymbolSuggestion,
    submitNewEntry,
    startEditEntry,
    saveEditEntry,
    cancelEditEntry,
    confirmDeleteEntry,
    cancelDeleteEntry,
  };
}

export type ManualEntriesController = ReturnType<typeof useManualEntries>;
