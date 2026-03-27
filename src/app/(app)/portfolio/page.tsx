"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HoldingsSection } from "@/components/portfolio/holdings-section";
import { ImportReviewModal } from "@/components/portfolio/import-review-modal";
import { ManualEntriesSection } from "@/components/portfolio/manual-entries-section";
import { TransactionsSection } from "@/components/portfolio/transactions-section";
import type {
  BreakdownItem,
  ImportPreviewRow,
  ManualEntry,
  PortfolioCoinListItem as CoinListItem,
  PortfolioTransaction as Transaction,
  PortfolioTxType,
} from "@/components/portfolio/types";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionNavigator, SectionPanel } from "@/components/ui/section-navigator";
import { cn, formatUsd, toLocalDatetimeString, formatTimeAgo } from "@/lib/utils";
import { Plus, Search, Download, Upload, Package, RefreshCw } from "lucide-react";
import { TokenListSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { usePortfolio } from "@/hooks/use-portfolio";
import { usePrices } from "@/hooks/use-prices";
import { useVaultStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { withAutoStablecoinCategory } from "@/lib/constants/stablecoins";
import {
  calculateFeeAmountFromPercent,
  calculateFeePercentFromAmount,
  createVaultTransaction,
  rebuildTradeSettlement,
} from "@/lib/transactions";

type TxType = PortfolioTxType;
type CsvRequiredColumn = "date" | "symbol" | "quantity" | "price";
type PortfolioSection = "holdings" | "transactions" | "manual" | "all";

const CSV_HEADER_ALIASES: Record<string, string[]> = {
  date: ["date", "transactedat", "timestamp", "datetime"],
  type: ["type", "txtype", "transactiontype"],
  symbol: ["symbol", "tokensymbol", "token"],
  name: ["name", "tokenname"],
  quantity: ["quantity", "qty", "amount"],
  price: ["price", "priceperunit", "unitprice", "priceusd"],
  fee: ["fee", "fees"],
  note: ["note", "notes"],
  coingeckoId: ["coingeckoid", "coingecko"],
};

const REQUIRED_CSV_COLUMNS: CsvRequiredColumn[] = ["date", "symbol", "quantity", "price"];
const TRANSACTION_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function normalizeCsvHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsvMatrix(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      const next = content[i + 1];
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && content[i + 1] === "\n") {
        i++;
      }
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += ch;
  }

  if (inQuotes) {
    throw new Error("CSV_UNCLOSED_QUOTES");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim().length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function getCsvField(row: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const normalizedAlias = normalizeCsvHeader(alias);
    if (row[normalizedAlias] !== undefined) {
      return row[normalizedAlias].trim();
    }
  }
  return "";
}

function getTxTypeToggleClass(type: TxType, isActive: boolean): string {
  if (!isActive) {
    return "border border-border bg-bg-muted text-text-subtle hover:bg-bg-hover";
  }

  if (type === "buy") {
    return "border border-status-positive-border bg-status-positive-soft text-status-positive";
  }
  if (type === "sell") {
    return "border border-status-negative-border bg-status-negative-soft text-status-negative";
  }
  if (type === "receive") {
    return "border border-status-info-border bg-status-info-soft text-status-info";
  }
  return "border border-status-caution-border bg-status-caution-soft text-status-caution";
}

function getTxTypeActionButtonClass(type: TxType): string {
  if (type === "buy") {
    return "bg-status-positive text-bg-page hover:opacity-90";
  }
  if (type === "sell") {
    return "bg-status-negative text-bg-page hover:opacity-90";
  }
  if (type === "receive") {
    return "bg-status-info text-bg-page hover:opacity-90";
  }
  return "bg-status-caution text-bg-page hover:opacity-90";
}

function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function getHeldDuration(
  firstBuyDate: string
): { days: number; label: string } | null {
  const parsed = parseDateInput(firstBuyDate);
  if (!parsed) return null;
  const msPerDay = 1000 * 60 * 60 * 24;
  const days = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / msPerDay));
  const label =
    days >= 365
      ? `${Math.floor(days / 365)}y`
      : days >= 30
        ? `${Math.floor(days / 30)}m`
        : `${days}d`;
  return { days, label };
}

export default function PortfolioPage() {
  const sectionsBaseId = "portfolio-sections";
  const { toast } = useToast();
  const { t } = useTranslation();
  const { ensurePrices } = usePrices();
  const { holdings, breakdown: rawBreakdown, totals, lastPriceUpdate, isLoading: portfolioLoading, refreshPrices } = usePortfolio();
  const { data: coinList } = useQuery<CoinListItem[]>({
    queryKey: ["coins-list"],
    queryFn: async () => {
      const res = await fetch("/coins-list.json");
      if (!res.ok) throw new Error("Failed to load coin list");
      return res.json();
    },
    staleTime: Infinity,
  });

  const vaultTransactions = useVaultStore((s) => s.vault.transactions);
  const vaultManualEntries = useVaultStore((s) => s.vault.manualEntries);

  const [search, setSearch] = useState("");
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const importDialogRef = useRef<HTMLDivElement>(null);
  const previousImportFocusRef = useRef<HTMLElement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transaction | null>(null);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [transactionsPerPage, setTransactionsPerPage] = useState<number>(
    TRANSACTION_PAGE_SIZE_OPTIONS[1]
  );

  // Inline +/- form state
  const [expandedHoldingKey, setExpandedHoldingKey] = useState<string | null>(null);
  const [txType, setTxType] = useState<TxType>("buy");
  const [inlineQty, setInlineQty] = useState("");
  const [inlinePrice, setInlinePrice] = useState("");
  const [inlineDate, setInlineDate] = useState(
    toLocalDatetimeString()
  );
  const [inlineNote, setInlineNote] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Edit transaction state
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editFeePercent, setEditFeePercent] = useState("0.1");
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editType, setEditType] = useState<TxType>("buy");
  const [editError, setEditError] = useState<string | null>(null);

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
  const [importValidationErrors, setImportValidationErrors] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Manual entries state
  const [showManualEntries, setShowManualEntries] = useState(false);
  const [showManualSymbolSuggestions, setShowManualSymbolSuggestions] = useState(false);
  const [meSymbol, setMeSymbol] = useState("");
  const [meName, setMeName] = useState("");
  const [meCoingeckoId, setMeCoingeckoId] = useState("");
  const [meQuantity, setMeQuantity] = useState("");
  const [meInitialPrice, setMeInitialPrice] = useState("");
  const [meNote, setMeNote] = useState("");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editEntryQty, setEditEntryQty] = useState("");
  const [editEntryNote, setEditEntryNote] = useState("");
  const [deleteManualTarget, setDeleteManualTarget] = useState<ManualEntry | null>(null);

  // Mutation-in-progress states (to replicate isPending for UI disable)
  const [addingManualEntry, setAddingManualEntry] = useState(false);
  const [updatingManualEntry, setUpdatingManualEntry] = useState(false);
  const [deletingManualEntry, setDeletingManualEntry] = useState(false);
  const [deletingTx, setDeletingTx] = useState(false);
  const [submittingInline, setSubmittingInline] = useState(false);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const getHoldingKey = (value: { symbol: string; coingeckoId: string | null }) =>
    `${value.symbol.toUpperCase()}:${value.coingeckoId ?? ""}`;

  // --- Enrich breakdown with tokenName, coingeckoId, totalFees, firstBuyDate ---
  const breakdown: BreakdownItem[] = useMemo(() => {
    const holdingsByKey = new Map<string, (typeof holdings)[number]>();
    for (const holding of holdings) {
      holdingsByKey.set(
        `${holding.symbol.toUpperCase()}:${holding.coingeckoId ?? ""}`,
        holding
      );
    }

    const firstBuyDateByKey = new Map<string, string>();
    for (const tx of vaultTransactions) {
      if (tx.type !== "buy" && tx.type !== "receive") {
        continue;
      }
      const key = `${tx.tokenSymbol.toUpperCase()}:${tx.coingeckoId ?? ""}`;
      const prev = firstBuyDateByKey.get(key);
      if (!prev || tx.transactedAt < prev) {
        firstBuyDateByKey.set(key, tx.transactedAt);
      }
    }

    return rawBreakdown.map((b) => {
      const key = `${b.symbol.toUpperCase()}:${b.coingeckoId ?? ""}`;
      const holding = holdingsByKey.get(key);
      return {
        holdingKey: b.holdingKey,
        symbol: b.symbol,
        tokenName: b.tokenName || holding?.tokenName || b.symbol,
        coingeckoId: b.coingeckoId,
        value: b.value,
        percent: b.percent,
        color: b.color,
        quantity: b.quantity,
        avgCost: b.avgCost,
        currentPrice: b.currentPrice,
        unrealizedPL: b.unrealizedPL,
        unrealizedPLPercent: b.unrealizedPLPercent,
        realizedPL: b.realizedPL,
        totalFees: holding?.totalFees ?? 0,
        firstBuyDate: firstBuyDateByKey.get(key) ?? null,
      };
    });
  }, [rawBreakdown, holdings, vaultTransactions]);

  // --- Transactions from vault (sorted descending by date) ---
  const transactions: Transaction[] = useMemo(() => {
    return [...vaultTransactions]
      .sort((a, b) => b.transactedAt.localeCompare(a.transactedAt))
      .map((tx) => ({
        id: tx.id,
        tokenSymbol: tx.tokenSymbol,
        tokenName: tx.tokenName,
        type: tx.type,
        quantity: tx.quantity,
        pricePerUnit: tx.pricePerUnit,
        totalCost: tx.totalCost,
        fee: tx.fee,
        coingeckoId: tx.coingeckoId,
        note: tx.note,
        transactedAt: tx.transactedAt,
        settlement: tx.settlement,
      }));
  }, [vaultTransactions]);

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

  const [activeSection, setActiveSection] = useState<PortfolioSection>(() => {
    if (rawBreakdown.length > 0) return "holdings";
    if (vaultTransactions.length > 0) return "transactions";
    if (vaultManualEntries.length > 0) return "manual";
    return "all";
  });
  const isLoading = portfolioLoading;
  const sectionOptions = useMemo(
    () => [
      {
        value: "holdings" as const,
        label: t("portfolio.holdings"),
        count: breakdown.length,
      },
      {
        value: "transactions" as const,
        label: t("portfolio.transactionHistory"),
        count: transactions.length,
      },
      {
        value: "manual" as const,
        label: t("portfolio.quickAddHoldings"),
        count: manualEntries.length,
      },
      {
        value: "all" as const,
        label: t("portfolio.viewAll"),
        count: breakdown.length + transactions.length + manualEntries.length,
      },
    ],
    [breakdown.length, manualEntries.length, t, transactions.length]
  );

  const handleRefreshPrices = useCallback(async () => {
    setRefreshingPrices(true);
    try {
      await refreshPrices();
      toast(t("dashboard.pricesRefreshed"), "success");
    } catch {
      toast(t("dashboard.failedToRefresh"), "error");
    } finally {
      setRefreshingPrices(false);
    }
  }, [refreshPrices, t, toast]);

  // --- Manual entry CRUD ---
  const handleAddManualEntry = useCallback(async (data: { tokenSymbol: string; tokenName: string; coingeckoId: string; quantity: string; initialPrice: string; note: string }) => {
    setAddingManualEntry(true);
    try {
      const quantity = parseFloat(data.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(t("portfolio.validationQuantityPositive"));
      }

      const normalizedSymbol = data.tokenSymbol.trim().toUpperCase();
      const normalizedName = data.tokenName.trim();
      const normalizedCoingeckoId = data.coingeckoId.trim();
      const initialPriceRaw = data.initialPrice.trim();
      const initialPrice = initialPriceRaw.length > 0 ? parseFloat(initialPriceRaw) : null;

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
              note: data.note,
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
            note: data.note.trim() || null,
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
  }, [toast, t, ensurePrices]);

  const selectManualSymbolSuggestion = useCallback((coin: CoinListItem) => {
    setMeSymbol(coin.symbol.toUpperCase());
    setMeName(coin.name);
    setMeCoingeckoId(coin.id);
    setShowManualSymbolSuggestions(false);
  }, []);

  const handleUpdateManualEntry = useCallback(async ({ id, quantity, note }: { id: string; quantity: string; note: string }) => {
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
  }, [toast, t]);

  const handleDeleteManualEntry = useCallback((id: string) => {
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
  }, [toast, t]);

  // --- Transaction CRUD ---
  const handleDeleteTransaction = useCallback((id: string) => {
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
  }, [toast, t]);

  const openEditForm = (tx: Transaction) => {
    const totalCost =
      Number.parseFloat(tx.quantity) * Number.parseFloat(tx.pricePerUnit);
    setEditingTx(tx);
    setEditType(tx.type as TxType);
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
  };

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
        type: editType as TxType,
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
      setEditError(err instanceof Error ? err.message : t("portfolio.failedUpdate"));
    } finally {
      setSubmittingEdit(false);
    }
  }, [editDate, editFeePercent, editNote, editPrice, editQty, editType, editingTx, t, toast]);

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      handleDeleteTransaction(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const openInlineForm = (item: BreakdownItem, type: TxType) => {
    setExpandedHoldingKey(getHoldingKey(item));
    setTxType(type);
    setInlineQty("");
    setInlinePrice(item.currentPrice > 0 ? item.currentPrice.toString() : "");
    setInlineDate(toLocalDatetimeString());
    setInlineNote("");
    setInlineError(null);
  };

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
      setInlineError(err instanceof Error ? err.message : t("portfolio.failedUpdate"));
    } finally {
      setSubmittingInline(false);
    }
  }, [
    closeInlineForm,
    ensurePrices,
    inlineDate,
    inlineNote,
    inlinePrice,
    inlineQty,
    t,
    toast,
    txType,
  ]);

  const handleRepeatLast = (item: BreakdownItem) => {
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
    setTxType(lastTx.type as TxType);
    setInlineQty(lastTx.quantity);
    setInlinePrice(item.currentPrice > 0 ? item.currentPrice.toString() : lastTx.pricePerUnit);
    setInlineDate(toLocalDatetimeString());
    setInlineNote(lastTx.note || "");
    setInlineError(null);
  };

  const handleExportCsv = () => {
    try {
      const headers = [
        "Date",
        "Type",
        "Symbol",
        "Name",
        "Quantity",
        "Price",
        "Total",
        "Fee",
        "Note",
        "CoinGecko ID",
      ];

      const rows = transactions.map((tx) => [
        tx.transactedAt,
        tx.type,
        tx.tokenSymbol,
        tx.tokenName,
        tx.quantity,
        tx.pricePerUnit,
        tx.totalCost,
        tx.fee,
        tx.note || "",
        tx.coingeckoId || "",
      ]);

      const csv =
        headers.map(escapeCsvField).join(",") +
        "\n" +
        rows.map((row) => row.map(escapeCsvField).join(",")).join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transactions_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast(t("portfolio.csvExported"), "success");
    } catch {
      toast(t("portfolio.failedExport"), "error");
    }
  };

  const resetImportState = useCallback(() => {
    setImportFileName("");
    setImportPreview([]);
    setImportValidationErrors([]);
    setImportError(null);
  }, []);

  const openImportModal = useCallback((resetState = false) => {
    if (resetState) {
      resetImportState();
    }
    setShowImportModal(true);
  }, [resetImportState]);

  const closeImportModal = useCallback(() => {
    setShowImportModal(false);
  }, []);

  const parseCsvFile = (file: File) => {
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result ?? "");
        const matrix = parseCsvMatrix(text);
        if (matrix.length < 2) {
          setImportPreview([]);
          setImportValidationErrors([]);
          setImportError(t("portfolio.csvError"));
          return;
        }

        const normalizedHeaders = matrix[0].map((header) =>
          normalizeCsvHeader(header)
        );

        const missingColumns = REQUIRED_CSV_COLUMNS.filter((required) => {
          const aliases = CSV_HEADER_ALIASES[required];
          return !normalizedHeaders.some((header) => aliases.includes(header));
        });

        if (missingColumns.length > 0) {
          const missingLabels = missingColumns
            .map((col) => {
              if (col === "date") return t("common.date");
              if (col === "symbol") return t("portfolio.symbol");
              if (col === "quantity") return t("portfolio.quantity");
              return t("portfolio.price");
            })
            .join(", ");
          setImportPreview([]);
          setImportValidationErrors([]);
          setImportError(t("portfolio.csvMissingHeaders", { headers: missingLabels }));
          return;
        }

        const rows: ImportPreviewRow[] = [];
        const issues: string[] = [];

        for (let i = 1; i < matrix.length; i++) {
          const rowNumber = i + 1;
          const values = matrix[i];
          const rowMap: Record<string, string> = {};
          normalizedHeaders.forEach((header, idx) => {
            if (!header) return;
            rowMap[header] = values[idx] ?? "";
          });

          const symbol = getCsvField(rowMap, CSV_HEADER_ALIASES.symbol).toUpperCase();
          if (!symbol) {
            issues.push(
              t("portfolio.csvRowIssue", {
                row: rowNumber,
                message: t("portfolio.csvIssueSymbolRequired"),
              })
            );
            continue;
          }

          const rawType = getCsvField(rowMap, CSV_HEADER_ALIASES.type).toLowerCase() || "buy";
          if (!["buy", "sell", "receive", "send"].includes(rawType)) {
            issues.push(
              t("portfolio.csvRowIssue", {
                row: rowNumber,
                message: t("portfolio.csvIssueTypeInvalid"),
              })
            );
            continue;
          }

          const quantity = parseFloat(getCsvField(rowMap, CSV_HEADER_ALIASES.quantity));
          if (!Number.isFinite(quantity) || quantity <= 0) {
            issues.push(
              t("portfolio.csvRowIssue", {
                row: rowNumber,
                message: t("portfolio.csvIssueQuantityInvalid"),
              })
            );
            continue;
          }

          const pricePerUnit = parseFloat(getCsvField(rowMap, CSV_HEADER_ALIASES.price));
          if (!Number.isFinite(pricePerUnit) || pricePerUnit <= 0) {
            issues.push(
              t("portfolio.csvRowIssue", {
                row: rowNumber,
                message: t("portfolio.csvIssuePriceInvalid"),
              })
            );
            continue;
          }

          const rawDate = getCsvField(rowMap, CSV_HEADER_ALIASES.date);
          const date = new Date(rawDate);
          if (!rawDate || Number.isNaN(date.getTime())) {
            issues.push(
              t("portfolio.csvRowIssue", {
                row: rowNumber,
                message: t("portfolio.csvIssueDateInvalid"),
              })
            );
            continue;
          }

          const feeRaw = getCsvField(rowMap, CSV_HEADER_ALIASES.fee);
          const fee = feeRaw.length > 0 ? parseFloat(feeRaw) : 0;
          if (!Number.isFinite(fee) || fee < 0) {
            issues.push(
              t("portfolio.csvRowIssue", {
                row: rowNumber,
                message: t("portfolio.csvIssueFeeInvalid"),
              })
            );
            continue;
          }

          rows.push({
            rowNumber,
            dateIso: date.toISOString(),
            type: rawType as TxType,
            symbol,
            name: getCsvField(rowMap, CSV_HEADER_ALIASES.name) || symbol,
            quantity,
            pricePerUnit,
            fee,
            note: getCsvField(rowMap, CSV_HEADER_ALIASES.note) || null,
            coingeckoId: getCsvField(rowMap, CSV_HEADER_ALIASES.coingeckoId) || null,
          });
        }

        if (issues.length > 0) {
          setImportPreview([]);
          setImportValidationErrors(issues);
          setImportError(
            t("portfolio.csvInvalidRows", {
              count: issues.length,
              details: issues.slice(0, 3).join(" | "),
            })
          );
          return;
        }

        setImportPreview(rows);
        setImportValidationErrors([]);
        setImportError(null);
      } catch (err) {
        const message = err instanceof Error && err.message === "CSV_UNCLOSED_QUOTES"
          ? t("portfolio.csvUnclosedQuotes")
          : t("portfolio.failedImport");
        setImportPreview([]);
        setImportValidationErrors([]);
        setImportError(message);
      }
    };
    reader.readAsText(file);
  };

  const handleImportSubmit = useCallback(async () => {
    if (importPreview.length === 0 || importValidationErrors.length > 0) return;
    setImporting(true);
    setImportError(null);
    try {
      const createdAtIso = new Date().toISOString();
      const newTransactions = importPreview.map((row) =>
        createVaultTransaction({
          id: crypto.randomUUID(),
          tokenSymbol: row.symbol,
          tokenName: row.name,
          chain: "",
          type: row.type,
          quantity: row.quantity,
          pricePerUnit: row.pricePerUnit,
          fee: row.fee,
          coingeckoId: row.coingeckoId,
          note: row.note,
          transactedAt: row.dateIso,
          createdAt: createdAtIso,
        })
      );

      useVaultStore.getState().updateVault((prev) => {
        const nowIso = new Date().toISOString();
        let nextTokenCategories = prev.tokenCategories;

        for (const tx of newTransactions) {
          nextTokenCategories = withAutoStablecoinCategory(
            nextTokenCategories,
            tx.tokenSymbol,
            nowIso
          );
        }

        return {
          ...prev,
          transactions: [...prev.transactions, ...newTransactions],
          tokenCategories: nextTokenCategories,
        };
      });

      // Ensure prices for any tokens with coingeckoIds
      const tokensToPrice = newTransactions
        .filter((tx) => tx.coingeckoId)
        .reduce((acc, tx) => {
          if (!acc.find((t) => t.coingeckoId === tx.coingeckoId)) {
            acc.push({ coingeckoId: tx.coingeckoId!, symbol: tx.tokenSymbol });
          }
          return acc;
        }, [] as { coingeckoId: string; symbol: string }[]);

      if (tokensToPrice.length > 0) {
        await ensurePrices(tokensToPrice);
      }

      toast(t("portfolio.importedCount", { count: newTransactions.length }), "success");
      closeImportModal();
      resetImportState();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t("portfolio.failedImport"));
    } finally {
      setImporting(false);
    }
  }, [
    closeImportModal,
    ensurePrices,
    importPreview,
    importValidationErrors.length,
    resetImportState,
    t,
    toast,
  ]);

  // Filter by search
  const filteredBreakdown = useMemo(() => {
    if (!search.trim()) return breakdown;
    const q = search.toLowerCase();
    return breakdown.filter(
      (b) =>
        b.symbol.toLowerCase().includes(q) ||
        b.tokenName.toLowerCase().includes(q) ||
        (b.coingeckoId ?? "").toLowerCase().includes(q)
    );
  }, [breakdown, search]);

  const filteredTransactions = useMemo(() => {
    if (!search.trim()) return transactions;
    const q = search.toLowerCase();
    return transactions.filter(
      (t) =>
        t.tokenSymbol.toLowerCase().includes(q) ||
        t.tokenName.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q) ||
        (t.note ?? "").toLowerCase().includes(q) ||
        new Date(t.transactedAt).toLocaleDateString().toLowerCase().includes(q)
    );
  }, [transactions, search]);

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
    const results: CoinListItem[] = [];
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

  const activeInlineItem = useMemo(() => {
    if (!expandedHoldingKey) return null;
    return (
      breakdown.find(
        (item) => getHoldingKey(item) === expandedHoldingKey
      ) ?? null
    );
  }, [breakdown, expandedHoldingKey]);

  const totalTransactionPages = useMemo(
    () => Math.max(1, Math.ceil(filteredTransactions.length / transactionsPerPage)),
    [filteredTransactions.length, transactionsPerPage]
  );

  const paginatedTransactions = useMemo(() => {
    const start = (transactionsPage - 1) * transactionsPerPage;
    return filteredTransactions.slice(start, start + transactionsPerPage);
  }, [filteredTransactions, transactionsPage, transactionsPerPage]);

  const transactionRange = useMemo(() => {
    if (filteredTransactions.length === 0) {
      return { from: 0, to: 0, total: 0 };
    }
    const from = (transactionsPage - 1) * transactionsPerPage + 1;
    const to = Math.min(
      transactionsPage * transactionsPerPage,
      filteredTransactions.length
    );
    return { from, to, total: filteredTransactions.length };
  }, [filteredTransactions.length, transactionsPage, transactionsPerPage]);

  useEffect(() => {
    setTransactionsPage(1);
  }, [search, transactionsPerPage]);

  useEffect(() => {
    setTransactionsPage((prev) => Math.min(prev, totalTransactionPages));
  }, [totalTransactionPages]);

  useEffect(() => {
    const handleGlobalKeydown = (event: KeyboardEvent) => {
      const isMetaOrCtrl = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const typing = isTypingTarget(event.target);

      if (!typing && key === "/" && !isMetaOrCtrl && !event.altKey) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (isMetaOrCtrl && key === "i" && !event.shiftKey && !event.altKey) {
        if (typing || showImportModal) return;
        event.preventDefault();
        openImportModal(true);
        return;
      }

      if (event.key === "Escape") {
        if (showImportModal) {
          event.preventDefault();
          closeImportModal();
          return;
        }
        if (deleteTarget) {
          event.preventDefault();
          setDeleteTarget(null);
          return;
        }
        if (deleteManualTarget) {
          event.preventDefault();
          setDeleteManualTarget(null);
          return;
        }
        if (editingTx) {
          event.preventDefault();
          setEditingTx(null);
          setEditError(null);
          return;
        }
        if (expandedHoldingKey) {
          event.preventDefault();
          closeInlineForm();
          return;
        }
        if (editingEntryId) {
          event.preventDefault();
          setEditingEntryId(null);
        }
        return;
      }

      if (!isMetaOrCtrl || key !== "enter") return;

      if (
        showImportModal &&
        !importing &&
        importPreview.length > 0 &&
        importValidationErrors.length === 0
      ) {
        event.preventDefault();
        void handleImportSubmit();
        return;
      }

      if (editingTx && !submittingEdit) {
        event.preventDefault();
        void handleEditSubmit();
        return;
      }

      if (activeInlineItem && !submittingInline) {
        event.preventDefault();
        void handleInlineSubmit(activeInlineItem);
      }
    };

    window.addEventListener("keydown", handleGlobalKeydown);
    return () => window.removeEventListener("keydown", handleGlobalKeydown);
  }, [
    activeInlineItem,
    closeInlineForm,
    closeImportModal,
    deleteManualTarget,
    deleteTarget,
    editingEntryId,
    editingTx,
    expandedHoldingKey,
    handleEditSubmit,
    handleInlineSubmit,
    handleImportSubmit,
    importPreview.length,
    importValidationErrors.length,
    importing,
    openImportModal,
    showImportModal,
    submittingEdit,
    submittingInline,
  ]);

  useEffect(() => {
    if (!showImportModal) return;

    previousImportFocusRef.current = document.activeElement as HTMLElement;

    const handleImportModalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !importDialogRef.current) return;

      const focusable = importDialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleImportModalKeyDown);
    requestAnimationFrame(() => {
      const focusable = importDialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable && focusable.length > 0) {
        focusable[0].focus();
      } else {
        importDialogRef.current?.focus();
      }
    });

    return () => {
      document.removeEventListener("keydown", handleImportModalKeyDown);
      previousImportFocusRef.current?.focus();
    };
  }, [showImportModal]);

  const manualEntryQuantityValid =
    Number.isFinite(parseFloat(meQuantity)) && parseFloat(meQuantity) > 0;
  const manualEntryInitialPriceValid =
    meInitialPrice.trim().length === 0 ||
    (Number.isFinite(parseFloat(meInitialPrice)) && parseFloat(meInitialPrice) >= 0);
  const showHoldingsSection =
    activeSection === "all" || activeSection === "holdings";
  const showTransactionsSection =
    activeSection === "all" || activeSection === "transactions";
  const showManualSection =
    activeSection === "all" || activeSection === "manual";
  const manualSectionExpanded =
    activeSection === "manual" || showManualEntries;
  const canSearchCurrentSection = (() => {
    if (activeSection === "holdings") return breakdown.length > 0;
    if (activeSection === "transactions") return transactions.length > 0;
    if (activeSection === "manual") return manualEntries.length > 0;
    return breakdown.length > 0 || transactions.length > 0 || manualEntries.length > 0;
  })();
  const importReadyCount = importPreview.length;
  const importIssueCount = importValidationErrors.length;
  const importHasReviewState =
    importFileName.length > 0 ||
    importReadyCount > 0 ||
    importIssueCount > 0 ||
    importError !== null;
  const importIsReady =
    importReadyCount > 0 && importIssueCount === 0 && importError === null;

  const getHeldDurationBadge = (firstBuyDate: string | null) => {
    if (!firstBuyDate) return "-";
    const heldDuration = getHeldDuration(firstBuyDate);
    if (!heldDuration) return "-";

    return (
      <span
        className={cn(
          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
          heldDuration.days >= 365
            ? "bg-status-positive-soft text-status-positive"
            : "bg-status-warning-soft text-status-warning"
        )}
      >
        {heldDuration.label}
      </span>
    );
  };

  const getTransactionTypeBadgeClass = (type: string) => {
    if (type === "buy") {
      return "bg-status-positive-soft text-status-positive";
    }
    if (type === "sell") {
      return "bg-status-negative-soft text-status-negative";
    }
    if (type === "receive") {
      return "bg-status-info-soft text-status-info";
    }
    return "bg-status-caution-soft text-status-caution";
  };

  const renderHoldingInlineForm = (item: BreakdownItem) => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["buy", "sell", "receive", "send"] as const).map((typ) => (
          <button
            key={typ}
            type="button"
            onClick={() => setTxType(typ)}
            className={`rounded-md px-2.5 py-0.5 text-xs font-semibold transition-colors ${getTxTypeToggleClass(
              typ,
              txType === typ
            )}`}
          >
            {typ.charAt(0).toUpperCase() + typ.slice(1)}
          </button>
        ))}
        <span className="text-sm font-medium text-text-muted">
          {item.symbol}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs text-text-subtle">
            {t("portfolio.quantity")} *
          </label>
          <Input
            type="number"
            step="any"
            min="0"
            placeholder="0.00"
            value={inlineQty}
            onChange={(e) => setInlineQty(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-subtle">
            {t("portfolio.pricePerUnit")}
          </label>
          <Input
            type="number"
            step="any"
            min="0"
            placeholder="0.00"
            value={inlinePrice}
            onChange={(e) => setInlinePrice(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-subtle">
            {t("common.date")}
          </label>
          <Input
            type="datetime-local"
            value={inlineDate}
            onChange={(e) => setInlineDate(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-subtle">
            {t("common.note") + " (" + t("common.optional") + ")"}
          </label>
          <Input
            placeholder={t("common.note") + "..."}
            value={inlineNote}
            onChange={(e) => setInlineNote(e.target.value)}
          />
        </div>
      </div>
      {inlineQty && inlinePrice && (
        <div className="text-xs text-text-subtle">
          {t("common.total") + ":"}{" "}
          {formatUsd(parseFloat(inlineQty || "0") * parseFloat(inlinePrice || "0"))}
        </div>
      )}
      {inlineError && (
        <div className="text-xs text-status-negative" role="alert" aria-live="assertive">
          {inlineError}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={closeInlineForm}
        >
          {t("common.cancel")}
        </Button>
        <Button
          size="sm"
          onClick={() => handleInlineSubmit(item)}
          disabled={submittingInline}
          className={getTxTypeActionButtonClass(txType)}
        >
          {submittingInline
            ? t("common.saving")
            : `${txType.charAt(0).toUpperCase() + txType.slice(1)} ${item.symbol}`}
        </Button>
      </div>
    </div>
  );

  const renderTransactionEditForm = (tx: Transaction) => {
    const editTotalCost =
      Number.parseFloat(editQty || "0") * Number.parseFloat(editPrice || "0");
    const editFeeAmountUsd =
      editType === "buy" || editType === "sell"
        ? calculateFeeAmountFromPercent(
            editTotalCost,
            Number.parseFloat(editFeePercent || "0")
          )
        : 0;
    const settlementPreview =
      tx.settlement && (editType === "buy" || editType === "sell")
        ? rebuildTradeSettlement(
            {
              type: editType,
              quantity: editQty || tx.quantity,
              pricePerUnit: editPrice || tx.pricePerUnit,
              fee: editFeeAmountUsd,
            },
            tx.settlement
          )
        : undefined;

    return (
      <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(["buy", "sell", "receive", "send"] as const).map((typ) => (
          <button
            key={typ}
            type="button"
            onClick={() => setEditType(typ)}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${getTxTypeToggleClass(
              typ,
              editType === typ
            )}`}
          >
            {typ.charAt(0).toUpperCase() + typ.slice(1)}
          </button>
        ))}
        <span className="ml-1 self-center text-sm font-medium text-text-muted">
          {tx.tokenSymbol}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div>
          <label className="mb-1 block text-xs text-text-subtle">
            {t("portfolio.quantity")} *
          </label>
          <Input
            type="number"
            step="any"
            min="0"
            value={editQty}
            onChange={(e) => setEditQty(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-subtle">
            {t("portfolio.pricePerUnit")}
          </label>
          <Input
            type="number"
            step="any"
            min="0"
            value={editPrice}
            onChange={(e) => setEditPrice(e.target.value)}
          />
        </div>
        {editType === "buy" || editType === "sell" ? (
          <div>
            <label className="mb-1 block text-xs text-text-subtle">
              {t("portfolio.feePercent")}
            </label>
            <Input
              type="number"
              step="any"
              min="0"
              value={editFeePercent}
              onChange={(e) => setEditFeePercent(e.target.value)}
            />
          </div>
        ) : (
          <div />
        )}
        <div>
          <label className="mb-1 block text-xs text-text-subtle">
            {t("common.date")}
          </label>
          <Input
            type="datetime-local"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-subtle">
            {t("common.note") + " (" + t("common.optional") + ")"}
          </label>
          <Input
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            placeholder={t("common.note") + "..."}
          />
        </div>
      </div>
      {editQty && editPrice && (
        <div className="space-y-1 text-xs text-text-subtle">
          <div>
          {t("common.total") + ":"}{" "}
          {formatUsd(editTotalCost)}
          </div>
          {editType === "buy" || editType === "sell" ? (
            <div>
              {t("portfolio.estimatedFee")}: {formatUsd(editFeeAmountUsd)}
            </div>
          ) : null}
        </div>
      )}
      {settlementPreview ? (
        <div className="text-xs text-text-subtle">
          {t("portfolio.transactionSettlementSummary", {
            token: settlementPreview.tokenSymbol,
            direction:
              settlementPreview.direction === "out"
                ? t("portfolio.transactionSettlementOut")
                : t("portfolio.transactionSettlementIn"),
            amount: formatUsd(Number.parseFloat(settlementPreview.totalCost)),
          })}{" "}
          {t("portfolio.transactionSettlementWillRecalculate")}
        </div>
      ) : tx.settlement ? (
        <div className="text-xs text-text-subtle">
          {t("portfolio.transactionSettlementRemoved")}
        </div>
      ) : null}
      {editError && (
        <div className="text-xs text-status-negative" role="alert" aria-live="assertive">
          {editError}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditingTx(null)}
        >
          {t("common.cancel")}
        </Button>
        <Button
          size="sm"
          onClick={handleEditSubmit}
          disabled={submittingEdit}
        >
          {submittingEdit ? t("common.saving") : t("portfolio.saveChanges")}
        </Button>
      </div>
    </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("portfolio.title")}
          description={t("portfolio.subtitle")}
        />
        <TokenListSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("portfolio.title")}
        description={
          <>
            <p>
              {t("portfolio.subtitle")}
              {lastPriceUpdate && (
                <span className="ml-2 text-xs">
                  · {t("dashboard.prices", { time: formatTimeAgo(new Date(lastPriceUpdate)) })}
                </span>
              )}
            </p>
            <p className="text-xs text-text-dim">{t("portfolio.shortcutsHint")}</p>
          </>
        }
        actions={
          <>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefreshPrices}
            disabled={refreshingPrices}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshingPrices ? "animate-spin" : ""}`} />
            {t("dashboard.refresh")}
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportCsv}>
            <Download className="mr-2 h-4 w-4" />
            {t("common.export")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openImportModal(true)}
            title="Ctrl/Cmd + I"
          >
            <Upload className="mr-2 h-4 w-4" />
            {t("common.import")}
          </Button>
          <Link href="/portfolio/add">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              {t("portfolio.addTransaction")}
            </Button>
          </Link>
          </>
        }
      />

      <SectionNavigator
        baseId={sectionsBaseId}
        label={t("portfolio.focusView")}
        description={t("portfolio.subtitle")}
        value={activeSection}
        onChange={setActiveSection}
        options={sectionOptions}
        columnsClassName="grid-cols-2 xl:grid-cols-4"
      />

      <Card className="p-4">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-text-primary">
              {t("portfolio.actionCenter")}
            </p>
            <p className="text-xs text-text-dim">
              {t("portfolio.actionCenterDesc")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Link
              href="/portfolio/add"
              className="rounded-xl border border-border-subtle bg-bg-card p-4 transition-colors hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page"
            >
              <div className="mb-3 inline-flex rounded-lg bg-status-positive-soft p-2 text-status-positive">
                <Plus className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold text-text-primary">
                {t("portfolio.actionAddTitle")}
              </p>
              <p className="mt-1 text-sm text-text-subtle">
                {t("portfolio.actionAddDesc")}
              </p>
            </Link>

            <button
              type="button"
              onClick={() => openImportModal(true)}
              className="rounded-xl border border-border-subtle bg-bg-card p-4 text-left transition-colors hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page"
            >
              <div className="mb-3 inline-flex rounded-lg bg-status-info-soft p-2 text-status-info">
                <Upload className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold text-text-primary">
                {t("portfolio.actionImportTitle")}
              </p>
              <p className="mt-1 text-sm text-text-subtle">
                {t("portfolio.actionImportDesc")}
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSection("manual");
                setShowManualEntries(true);
              }}
              className="rounded-xl border border-border-subtle bg-bg-card p-4 text-left transition-colors hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page"
            >
              <div className="mb-3 inline-flex rounded-lg bg-status-caution-soft p-2 text-status-caution">
                <Package className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold text-text-primary">
                {t("portfolio.actionQuickAddTitle")}
              </p>
              <p className="mt-1 text-sm text-text-subtle">
                {t("portfolio.actionQuickAddDesc")}
              </p>
            </button>
          </div>

          <p className="text-xs text-text-dim">
            {t("portfolio.actionCenterHint")}
          </p>
        </div>
      </Card>

      <SectionPanel baseId={sectionsBaseId} value={activeSection}>

      {canSearchCurrentSection && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" />
          <Input
            ref={searchInputRef}
            placeholder={t("portfolio.searchByToken")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            aria-label={t("portfolio.searchByToken")}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-text-subtle">{t("dashboard.totalValue")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-text-primary">
              {formatUsd(totals.totalValue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-text-subtle">{t("dashboard.totalPL")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${totals.totalUnrealizedPL >= 0 ? "text-status-positive" : "text-status-negative"}`}>
              {totals.totalUnrealizedPL >= 0 ? "+" : ""}
              {formatUsd(totals.totalUnrealizedPL)}
            </p>
            <p className="mt-1 text-xs text-text-dim">{t("portfolio.unrealizedPL")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-text-subtle">{t("portfolio.realizedPL")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${totals.totalRealizedPL >= 0 ? "text-status-positive" : "text-status-negative"}`}>
              {totals.totalRealizedPL >= 0 ? "+" : ""}
              {formatUsd(totals.totalRealizedPL)}
            </p>
            <p className="mt-1 text-xs text-text-dim">{t("portfolio.realizedPL")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-text-subtle">{t("portfolio.change24h")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${totals.change24h >= 0 ? "text-status-positive" : "text-status-negative"}`}>
              {totals.change24h >= 0 ? "+" : ""}
              {totals.change24h.toFixed(2)}%
            </p>
            <p className="mt-1 text-xs text-text-dim">{t("portfolio.weightedChangeDesc")}</p>
          </CardContent>
        </Card>
      </div>
      {showManualSection && (
        <ManualEntriesSection
          isAllSectionsView={activeSection === "all"}
          manualSectionExpanded={manualSectionExpanded}
          manualEntriesCount={manualEntries.length}
          manualEntries={manualEntries}
          filteredManualEntries={filteredManualEntries}
          search={search}
          meSymbol={meSymbol}
          meName={meName}
          meCoingeckoId={meCoingeckoId}
          meQuantity={meQuantity}
          meInitialPrice={meInitialPrice}
          meNote={meNote}
          showManualSymbolSuggestions={showManualSymbolSuggestions}
          manualSymbolSuggestions={manualSymbolSuggestions}
          manualEntryQuantityValid={manualEntryQuantityValid}
          manualEntryInitialPriceValid={manualEntryInitialPriceValid}
          addingManualEntry={addingManualEntry}
          editingEntryId={editingEntryId}
          editEntryQty={editEntryQty}
          editEntryNote={editEntryNote}
          updatingManualEntry={updatingManualEntry}
          deletingManualEntry={deletingManualEntry}
          onToggleExpanded={() => setShowManualEntries((value) => !value)}
          onSetMeSymbol={setMeSymbol}
          onSetShowManualSymbolSuggestions={setShowManualSymbolSuggestions}
          onSelectManualSymbolSuggestion={selectManualSymbolSuggestion}
          onSetMeName={setMeName}
          onSetMeCoingeckoId={setMeCoingeckoId}
          onSetMeQuantity={setMeQuantity}
          onSetMeInitialPrice={setMeInitialPrice}
          onSetMeNote={setMeNote}
          onAddEntry={() => {
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
            handleAddManualEntry({
              tokenSymbol: meSymbol,
              tokenName: meName,
              coingeckoId: meCoingeckoId,
              quantity: meQuantity,
              initialPrice: meInitialPrice,
              note: meNote,
            });
          }}
          onStartEditEntry={(entry) => {
            setEditingEntryId(entry.id);
            setEditEntryQty(entry.quantity.toString());
            setEditEntryNote(entry.note || "");
          }}
          onSetEditEntryQty={setEditEntryQty}
          onSetEditEntryNote={setEditEntryNote}
          onSaveEditEntry={(entry) =>
            handleUpdateManualEntry({
              id: entry.id,
              quantity: editEntryQty,
              note: editEntryNote,
            })
          }
          onCancelEditEntry={() => setEditingEntryId(null)}
          onDeleteEntry={(entry) => setDeleteManualTarget(entry)}
        />
      )}

      {showHoldingsSection && (
        <HoldingsSection
          breakdown={breakdown}
          filteredBreakdown={filteredBreakdown}
          expandedHoldingKey={expandedHoldingKey}
          txType={txType}
          getHoldingKey={getHoldingKey}
          getHeldDurationBadge={getHeldDurationBadge}
          renderHoldingInlineForm={renderHoldingInlineForm}
          onOpenInlineForm={openInlineForm}
          onCloseInlineForm={closeInlineForm}
          onRepeatLast={handleRepeatLast}
          onOpenManualSection={() => {
            setActiveSection("manual");
            setShowManualEntries(true);
          }}
        />
      )}

      {showTransactionsSection && (
        <TransactionsSection
          transactions={transactions}
          filteredTransactions={filteredTransactions}
          paginatedTransactions={paginatedTransactions}
          editingTransactionId={editingTx?.id ?? null}
          deletingTransaction={deletingTx}
          transactionsPerPage={transactionsPerPage}
          transactionsPage={transactionsPage}
          totalTransactionPages={totalTransactionPages}
          transactionRange={transactionRange}
          renderTransactionEditForm={renderTransactionEditForm}
          getTransactionTypeBadgeClass={getTransactionTypeBadgeClass}
          onToggleEdit={(tx) => {
            if (editingTx?.id === tx.id) {
              setEditingTx(null);
              return;
            }
            openEditForm(tx);
          }}
          onDelete={(tx) => setDeleteTarget(tx)}
          onSetTransactionsPerPage={setTransactionsPerPage}
          onPreviousPage={() =>
            setTransactionsPage((prev) => Math.max(1, prev - 1))
          }
          onNextPage={() =>
            setTransactionsPage((prev) => Math.min(totalTransactionPages, prev + 1))
          }
          onOpenImportModal={() => openImportModal(true)}
          pageSizeOptions={TRANSACTION_PAGE_SIZE_OPTIONS}
        />
      )}

      </SectionPanel>

      <ConfirmDialog
        open={deleteTarget !== null}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        title={t("portfolio.deleteTransactionTitle")}
        description={t("portfolio.deleteTransactionDesc", { type: deleteTarget?.type ?? "", symbol: deleteTarget?.tokenSymbol ?? "" })}
        confirmLabel={t("common.delete")}
        variant="danger"
      />

      <ConfirmDialog
        open={deleteManualTarget !== null}
        onConfirm={() => {
          if (!deleteManualTarget) return;
          handleDeleteManualEntry(deleteManualTarget.id);
          setDeleteManualTarget(null);
        }}
        onCancel={() => setDeleteManualTarget(null)}
        title={t("portfolio.deleteManualEntryTitle")}
        description={t("portfolio.deleteManualEntryDesc", {
          symbol: deleteManualTarget?.tokenSymbol ?? "",
        })}
        confirmLabel={t("common.delete")}
        variant="danger"
      />

      <ImportReviewModal
        open={showImportModal}
        dialogRef={importDialogRef}
        importing={importing}
        importFileName={importFileName}
        importHasReviewState={importHasReviewState}
        importReadyCount={importReadyCount}
        importIssueCount={importIssueCount}
        importPreview={importPreview}
        importValidationErrors={importValidationErrors}
        importError={importError}
        importIsReady={importIsReady}
        onClose={closeImportModal}
        onFileSelect={parseCsvFile}
        onSubmit={handleImportSubmit}
      />
    </div>
  );
}
