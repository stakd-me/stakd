"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { useVaultStore } from "@/lib/store";
import { toLocalDatetimeString } from "@/lib/utils";
import { withAutoStablecoinCategory } from "@/lib/constants/stablecoins";
import {
  buildTradeSettlement,
  calculateFeeAmountFromPercent,
  calculateFeePercentFromAmount,
  createVaultTransaction,
  rebuildTradeSettlement,
} from "@/lib/transactions";
import type {
  BreakdownItem,
  PortfolioTransaction,
  PortfolioTxType,
} from "@/components/portfolio/types";

export function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function getHoldingKey(value: {
  symbol: string;
  coingeckoId: string | null;
}): string {
  return `${value.symbol.toUpperCase()}:${value.coingeckoId ?? ""}`;
}

export interface DefaultSettlementToken {
  symbol: string;
  name: string;
  coingeckoId: string | null;
}

interface UseTransactionMutationsArgs {
  /** Vault transactions sorted descending by date (page-level memo). */
  transactions: PortfolioTransaction[];
  stablecoinSymbols: Set<string>;
  defaultSettlement: DefaultSettlementToken;
  ensurePrices: (
    tokens: { coingeckoId: string; symbol: string }[]
  ) => Promise<void>;
}

/**
 * Vault-mutation logic for the portfolio page: add (inline +/- form),
 * edit, and delete transactions, plus the "edit holding info" save.
 * Owns the inline-form and edit-form state so the page component only wires
 * props. All toasts / i18n messages are unchanged from the original page.
 */
export function useTransactionMutations({
  transactions,
  stablecoinSymbols,
  defaultSettlement,
  ensurePrices,
}: UseTransactionMutationsArgs) {
  const { toast } = useToast();
  const { t } = useTranslation();

  // Delete transaction state
  const [deleteTarget, setDeleteTarget] = useState<PortfolioTransaction | null>(
    null
  );
  const [deletingTx, setDeletingTx] = useState(false);

  // Inline +/- form state
  const [expandedHoldingKey, setExpandedHoldingKey] = useState<string | null>(
    null
  );
  const [txType, setTxType] = useState<PortfolioTxType>("buy");
  const [inlineQty, setInlineQty] = useState("");
  const [inlinePrice, setInlinePrice] = useState("");
  const [inlineDate, setInlineDate] = useState(toLocalDatetimeString());
  const [inlineNote, setInlineNote] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [submittingInline, setSubmittingInline] = useState(false);

  // Edit transaction state
  const [editingTx, setEditingTx] = useState<PortfolioTransaction | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editFeePercent, setEditFeePercent] = useState("0.1");
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editType, setEditType] = useState<PortfolioTxType>("buy");
  const [editError, setEditError] = useState<string | null>(null);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Edit holding info state
  const [editingHolding, setEditingHolding] = useState<BreakdownItem | null>(
    null
  );

  // --- Transaction delete ---
  const handleDeleteTransaction = useCallback(
    (id: string) => {
      setDeletingTx(true);
      try {
        useVaultStore.getState().updateVault((prev) => ({
          ...prev,
          transactions: prev.transactions.filter((tx) => tx.id !== id),
        }));
        toast(t("portfolio.transactionDeleted"), "success");
      } catch {
        toast(t("portfolio.failedDelete"), "error");
      } finally {
        setDeletingTx(false);
      }
    },
    [toast, t]
  );

  const handleDeleteConfirm = useCallback(() => {
    if (deleteTarget) {
      handleDeleteTransaction(deleteTarget.id);
      setDeleteTarget(null);
    }
  }, [deleteTarget, handleDeleteTransaction]);

  const cancelDeleteTransaction = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  // --- Edit transaction ---
  const openEditForm = useCallback((tx: PortfolioTransaction) => {
    const totalCost =
      Number.parseFloat(tx.quantity) * Number.parseFloat(tx.pricePerUnit);
    setEditingTx(tx);
    setEditType(tx.type);
    setEditQty(tx.quantity);
    setEditPrice(tx.pricePerUnit);
    setEditFeePercent(
      tx.type === "buy" || tx.type === "sell"
        ? calculateFeePercentFromAmount(
            totalCost,
            Number.parseFloat(tx.fee)
          ).toString()
        : "0"
    );
    setEditDate(toLocalDatetimeString(new Date(tx.transactedAt)));
    setEditNote(tx.note || "");
    setEditError(null);
  }, []);

  const toggleEditForm = useCallback(
    (tx: PortfolioTransaction) => {
      if (editingTx?.id === tx.id) {
        setEditingTx(null);
        return;
      }
      openEditForm(tx);
    },
    [editingTx, openEditForm]
  );

  const cancelEditForm = useCallback(() => {
    setEditingTx(null);
  }, []);

  // Escape-key dismissal also clears the inline error (original page behavior).
  const dismissEditForm = useCallback(() => {
    setEditingTx(null);
    setEditError(null);
  }, []);

  const handleEditSubmit = useCallback(async () => {
    if (!editingTx) return;
    setEditError(null);

    const qty = parseFloat(editQty);
    if (isNaN(qty) || qty <= 0) {
      setEditError(t("portfolio.validationQuantityPositive"));
      return;
    }
    const price = parseFloat(editPrice);
    if (isNaN(price) || price <= 0) {
      setEditError(t("portfolio.validationPricePositive"));
      return;
    }
    const feePercent =
      editType === "buy" || editType === "sell"
        ? parseFloat(editFeePercent)
        : 0;
    if (!Number.isFinite(feePercent) || feePercent < 0) {
      setEditError(t("portfolio.validationFeeNonNegative"));
      return;
    }
    if (!editDate) {
      setEditError(t("portfolio.validationDateRequired"));
      return;
    }
    const parsedEditDate = parseDateInput(editDate);
    if (!parsedEditDate) {
      setEditError(t("portfolio.validationDateRequired"));
      return;
    }
    if (parsedEditDate.getTime() > Date.now()) {
      setEditError(t("portfolio.validationDateNotFuture"));
      return;
    }

    setSubmittingEdit(true);
    try {
      const feeUsd = calculateFeeAmountFromPercent(qty * price, feePercent);
      const nextSettlement =
        editType === "buy" || editType === "sell"
          ? rebuildTradeSettlement(
              {
                type: editType,
                quantity: qty,
                pricePerUnit: price,
                fee: feeUsd,
              },
              editingTx.settlement
            )
          : undefined;
      const updates = {
        type: editType,
        quantity: qty.toString(),
        pricePerUnit: price.toString(),
        totalCost: String(qty * price),
        fee: String(feeUsd),
        transactedAt: parsedEditDate.toISOString(),
        note: editNote.trim() || null,
        settlement: nextSettlement,
      };
      useVaultStore.getState().updateVault((prev) => ({
        ...prev,
        transactions: prev.transactions.map((tx) =>
          tx.id === editingTx.id ? { ...tx, ...updates } : tx
        ),
      }));
      toast(t("portfolio.transactionUpdated"), "success");
      setEditingTx(null);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : t("portfolio.failedUpdate")
      );
    } finally {
      setSubmittingEdit(false);
    }
  }, [editDate, editFeePercent, editNote, editPrice, editQty, editType, editingTx, t, toast]);

  // --- Inline +/- form ---
  const openInlineForm = useCallback(
    (item: BreakdownItem, type: PortfolioTxType) => {
      setExpandedHoldingKey(getHoldingKey(item));
      setTxType(type);
      setInlineQty("");
      setInlinePrice(item.currentPrice > 0 ? item.currentPrice.toString() : "");
      setInlineDate(toLocalDatetimeString());
      setInlineNote("");
      setInlineError(null);
    },
    []
  );

  const closeInlineForm = useCallback(() => {
    setExpandedHoldingKey(null);
    setInlineError(null);
  }, []);

  const handleInlineSubmit = useCallback(async (item: BreakdownItem) => {
    setInlineError(null);

    const qty = parseFloat(inlineQty);
    if (isNaN(qty) || qty <= 0) {
      setInlineError(t("portfolio.validationQuantityPositive"));
      return;
    }
    const price = parseFloat(inlinePrice);
    if (isNaN(price) || price <= 0) {
      setInlineError(t("portfolio.validationPricePositive"));
      return;
    }
    if (!inlineDate) {
      setInlineError(t("portfolio.validationDateRequired"));
      return;
    }
    const parsedInlineDate = parseDateInput(inlineDate);
    if (!parsedInlineDate) {
      setInlineError(t("portfolio.validationDateRequired"));
      return;
    }
    if (parsedInlineDate.getTime() > Date.now()) {
      setInlineError(t("portfolio.validationDateNotFuture"));
      return;
    }

    setSubmittingInline(true);
    try {
      const id = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const isStable = stablecoinSymbols.has(item.symbol.toUpperCase());
      const settlement =
        !isStable && (txType === "buy" || txType === "sell")
          ? buildTradeSettlement({
              settlement: {
                tokenSymbol: defaultSettlement.symbol,
                tokenName: defaultSettlement.name,
                coingeckoId: defaultSettlement.coingeckoId,
              },
              type: txType,
              totalCost: qty * price,
              fee: 0,
              pricePerUnit: 1,
            })
          : undefined;
      useVaultStore.getState().updateVault((prev) => ({
        ...prev,
        transactions: [...prev.transactions, createVaultTransaction({
          id,
          tokenSymbol: item.symbol,
          tokenName: item.tokenName || item.symbol,
          chain: "",
          type: txType,
          quantity: qty,
          pricePerUnit: price,
          fee: 0,
          coingeckoId: item.coingeckoId || null,
          note: inlineNote,
          transactedAt: parsedInlineDate.toISOString(),
          createdAt: nowIso,
          settlement,
        })],
        tokenCategories: withAutoStablecoinCategory(
          prev.tokenCategories,
          item.symbol,
          nowIso
        ),
      }));
      if (item.coingeckoId) {
        await ensurePrices([{ coingeckoId: item.coingeckoId, symbol: item.symbol }]);
      }
      const txTypeLabel = {
        buy: t("portfolio.buy"),
        sell: t("portfolio.sell"),
        receive: t("portfolio.receive"),
        send: t("portfolio.send"),
      }[txType];
      toast(t("portfolio.transactionAdded", { type: txTypeLabel }), "success");
      closeInlineForm();
    } catch (err) {
      setInlineError(
        err instanceof Error ? err.message : t("portfolio.failedUpdate")
      );
    } finally {
      setSubmittingInline(false);
    }
  }, [
    closeInlineForm,
    defaultSettlement,
    ensurePrices,
    inlineDate,
    inlineNote,
    inlinePrice,
    inlineQty,
    stablecoinSymbols,
    t,
    toast,
    txType,
  ]);

  const handleRepeatLast = useCallback(
    (item: BreakdownItem) => {
      // Find most recent transaction for this symbol
      let symbolTxs = transactions.filter(
        (tx) => tx.tokenSymbol.toUpperCase() === item.symbol.toUpperCase()
      );
      symbolTxs = symbolTxs.filter(
        (tx) => (tx.coingeckoId ?? "") === (item.coingeckoId ?? "")
      );

      // Fallback to symbol-only match for legacy transactions without coingeckoId
      if (symbolTxs.length === 0) {
        symbolTxs = transactions.filter(
          (tx) => tx.tokenSymbol.toUpperCase() === item.symbol.toUpperCase()
        );
      }

      if (symbolTxs.length === 0) {
        toast(t("portfolio.noPreviousTx"), "error");
        return;
      }
      const lastTx = symbolTxs[0]; // already sorted desc by date
      setExpandedHoldingKey(getHoldingKey(item));
      setTxType(lastTx.type);
      setInlineQty(lastTx.quantity);
      setInlinePrice(
        item.currentPrice > 0 ? item.currentPrice.toString() : lastTx.pricePerUnit
      );
      setInlineDate(toLocalDatetimeString());
      setInlineNote(lastTx.note || "");
      setInlineError(null);
    },
    [transactions, t, toast]
  );

  // --- Edit holding info ---
  const handleEditHoldingSave = useCallback(
    async (data: {
      coingeckoId: string;
      firstBuyDate: string | null;
      avgCostUsd: number | null;
    }) => {
      if (!editingHolding) return;
      const symbol = editingHolding.symbol.toUpperCase();
      const oldCoingeckoId = editingHolding.coingeckoId;

      try {
        useVaultStore.getState().updateVault((prev) => {
          const newCoingeckoId = data.coingeckoId || null;
          const nowIso = new Date().toISOString();
          const costBasisOverrides = prev.costBasisOverrides ?? [];
          const sameHolding = (
            value: { tokenSymbol: string; coingeckoId: string | null },
            coingeckoId: string | null
          ) =>
            value.tokenSymbol.toUpperCase() === symbol &&
            (value.coingeckoId ?? null) === coingeckoId;

          // Update coingeckoId across all matching transactions
          const updatedTransactions = prev.transactions.map((tx) => {
            if (
              tx.tokenSymbol.toUpperCase() !== symbol ||
              tx.coingeckoId !== oldCoingeckoId
            ) {
              return tx;
            }
            return { ...tx, coingeckoId: newCoingeckoId };
          });

          // Update coingeckoId across all matching manual entries
          const updatedManualEntries = prev.manualEntries.map((e) => {
            if (
              e.tokenSymbol.toUpperCase() !== symbol ||
              e.coingeckoId !== oldCoingeckoId
            ) {
              return e;
            }
            return { ...e, coingeckoId: newCoingeckoId, updatedAt: nowIso };
          });

          const existingOverride = costBasisOverrides.find(
            (override) =>
              sameHolding(override, oldCoingeckoId) ||
              sameHolding(override, newCoingeckoId)
          );
          const updatedCostBasisOverrides = costBasisOverrides.filter(
            (override) =>
              !sameHolding(override, oldCoingeckoId) &&
              !sameHolding(override, newCoingeckoId)
          );

          if (data.avgCostUsd !== null) {
            updatedCostBasisOverrides.push({
              id: existingOverride?.id ?? crypto.randomUUID(),
              tokenSymbol: symbol,
              coingeckoId: newCoingeckoId,
              avgCostUsd: data.avgCostUsd,
              updatedAt: nowIso,
            });
          }

          // Update first buy date: find the earliest transaction and adjust it
          if (data.firstBuyDate) {
            const newDate = new Date(data.firstBuyDate);
            if (!Number.isNaN(newDate.getTime())) {
              const matchingTxs = updatedTransactions
                .map((tx, idx) => ({ tx, idx }))
                .filter(
                  ({ tx }) =>
                    tx.tokenSymbol.toUpperCase() === symbol &&
                    tx.coingeckoId === newCoingeckoId
                );

              if (matchingTxs.length > 0) {
                // Find the earliest transaction
                const earliest = matchingTxs.reduce((min, cur) =>
                  new Date(cur.tx.transactedAt) < new Date(min.tx.transactedAt) ? cur : min
                );
                updatedTransactions[earliest.idx] = {
                  ...updatedTransactions[earliest.idx],
                  transactedAt: newDate.toISOString(),
                };
              }
            }
          }

          return {
            ...prev,
            transactions: updatedTransactions,
            manualEntries: updatedManualEntries,
            costBasisOverrides: updatedCostBasisOverrides,
          };
        });

        // Ensure prices are fetched for the new coingeckoId
        if (data.coingeckoId && data.coingeckoId !== oldCoingeckoId) {
          await ensurePrices([{ coingeckoId: data.coingeckoId, symbol }]);
        }

        toast(t("portfolio.holdingUpdated", { symbol }), "success");
      } catch {
        toast(t("portfolio.failedUpdateHolding"), "error");
      } finally {
        setEditingHolding(null);
      }
    },
    [editingHolding, toast, t, ensurePrices]
  );

  return {
    // Delete
    deleteTarget,
    setDeleteTarget,
    deletingTx,
    handleDeleteConfirm,
    cancelDeleteTransaction,

    // Inline +/- form
    expandedHoldingKey,
    txType,
    setTxType,
    inlineQty,
    setInlineQty,
    inlinePrice,
    setInlinePrice,
    inlineDate,
    setInlineDate,
    inlineNote,
    setInlineNote,
    inlineError,
    submittingInline,
    openInlineForm,
    closeInlineForm,
    handleInlineSubmit,
    handleRepeatLast,

    // Edit form
    editingTx,
    setEditingTx,
    editType,
    setEditType,
    editQty,
    setEditQty,
    editPrice,
    setEditPrice,
    editFeePercent,
    setEditFeePercent,
    editDate,
    setEditDate,
    editNote,
    setEditNote,
    editError,
    setEditError,
    submittingEdit,
    openEditForm,
    toggleEditForm,
    cancelEditForm,
    dismissEditForm,
    handleEditSubmit,

    // Edit holding info
    editingHolding,
    setEditingHolding,
    handleEditHoldingSave,
  };
}
