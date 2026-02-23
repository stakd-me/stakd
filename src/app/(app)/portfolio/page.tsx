"use client";

import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatUsd, formatUsdPrice, formatCrypto, toLocalDatetimeString, formatTimeAgo } from "@/lib/utils";
import { Plus, Search, Trash2, Minus, Pencil, X, Download, Upload, Copy, Package, ChevronDown, ChevronUp } from "lucide-react";
import { TokenListSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { usePortfolio } from "@/hooks/use-portfolio";
import { usePrices } from "@/hooks/use-prices";
import { useVaultStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { withAutoStablecoinCategory } from "@/lib/constants/stablecoins";

interface BreakdownItem {
  holdingKey: string;
  symbol: string;
  tokenName: string;
  coingeckoId: string | null;
  value: number;
  percent: number;
  color: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  realizedPL: number;
  totalFees: number;
  firstBuyDate: string | null;
}

interface Transaction {
  id: string;
  tokenSymbol: string;
  tokenName: string;
  type: string;
  quantity: string;
  pricePerUnit: string;
  totalCost: string;
  fee: string;
  coingeckoId: string | null;
  note: string | null;
  transactedAt: string;
}

interface ManualEntry {
  id: string;
  tokenSymbol: string;
  tokenName: string;
  coingeckoId: string | null;
  quantity: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CoinListItem {
  id: string;
  symbol: string;
  name: string;
  binance: boolean;
}

type TxType = "buy" | "sell" | "receive" | "send";
type CsvRequiredColumn = "date" | "symbol" | "quantity" | "price";

interface ImportPreviewRow {
  rowNumber: number;
  dateIso: string;
  type: TxType;
  symbol: string;
  name: string;
  quantity: number;
  pricePerUnit: number;
  fee: number;
  note: string | null;
  coingeckoId: string | null;
}

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
  const { toast } = useToast();
  const { t } = useTranslation();
  const { ensurePrices } = usePrices();
  const { holdings, breakdown: rawBreakdown, totals, lastPriceUpdate, isLoading: portfolioLoading } = usePortfolio();
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
  const searchInputRef = useRef<HTMLInputElement>(null);
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
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editType, setEditType] = useState<TxType>("buy");
  const [editError, setEditError] = useState<string | null>(null);

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
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

  const isLoading = portfolioLoading;

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
            {
              id: crypto.randomUUID(),
              tokenSymbol: normalizedSymbol,
              tokenName: normalizedName,
              chain: "",
              type: "buy",
              quantity: quantity.toString(),
              pricePerUnit: initialPrice.toString(),
              totalCost: (quantity * initialPrice).toString(),
              fee: "0",
              coingeckoId: normalizedCoingeckoId || null,
              note: data.note.trim() || null,
              transactedAt: nowIso,
              createdAt: nowIso,
            },
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
    setEditingTx(tx);
    setEditType(tx.type as TxType);
    setEditQty(tx.quantity);
    setEditPrice(tx.pricePerUnit);
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
    if (isNaN(price) || price < 0) {
      setEditError(t("portfolio.validationPriceNonNegative"));
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
      const updates = {
        type: editType as TxType,
        quantity: qty.toString(),
        pricePerUnit: price.toString(),
        totalCost: String(qty * price),
        transactedAt: parsedEditDate.toISOString(),
        note: editNote.trim() || null,
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
  }, [editDate, editNote, editPrice, editQty, editType, editingTx, t, toast]);

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
    if (isNaN(price) || price < 0) {
      setInlineError(t("portfolio.validationPriceNonNegative"));
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
        transactions: [...prev.transactions, {
          id,
          tokenSymbol: item.symbol,
          tokenName: item.tokenName || item.symbol,
          chain: "",
          type: txType,
          quantity: qty.toString(),
          pricePerUnit: price.toString(),
          totalCost: String(qty * price),
          fee: "0",
          coingeckoId: item.coingeckoId || null,
          note: inlineNote.trim() || null,
          transactedAt: parsedInlineDate.toISOString(),
          createdAt: nowIso,
        }],
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
          if (!Number.isFinite(pricePerUnit) || pricePerUnit < 0) {
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
      const newTransactions = importPreview.map((row) => ({
        id: crypto.randomUUID(),
        tokenSymbol: row.symbol,
        tokenName: row.name,
        chain: "",
        type: row.type,
        quantity: row.quantity.toString(),
        pricePerUnit: row.pricePerUnit.toString(),
        totalCost: String(row.quantity * row.pricePerUnit),
        fee: row.fee.toString(),
        coingeckoId: row.coingeckoId,
        note: row.note,
        transactedAt: row.dateIso,
        createdAt: new Date().toISOString(),
      }));

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

  const manualEntryQuantityValid =
    Number.isFinite(parseFloat(meQuantity)) && parseFloat(meQuantity) > 0;
  const manualEntryInitialPriceValid =
    meInitialPrice.trim().length === 0 ||
    (Number.isFinite(parseFloat(meInitialPrice)) && parseFloat(meInitialPrice) >= 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("portfolio.title")}</h1>
            <p className="text-text-subtle">{t("portfolio.subtitle")}</p>
          </div>
        </div>
        <TokenListSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("portfolio.title")}</h1>
          <p className="text-text-subtle">
            {t("portfolio.subtitle")}
            {lastPriceUpdate && (
              <span className="ml-2 text-xs">
                · Prices: {formatTimeAgo(new Date(lastPriceUpdate))}
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-text-dim">{t("portfolio.shortcutsHint")}</p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {(breakdown.length > 0 || transactions.length > 0) && (
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

      {/* Quick Add Holdings (Manual Entries) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="flex items-center gap-2"
              onClick={() => setShowManualEntries(!showManualEntries)}
            >
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {t("portfolio.quickAddHoldings")}
              </CardTitle>
              {showManualEntries ? (
                <ChevronUp className="h-5 w-5 text-text-subtle" />
              ) : (
                <ChevronDown className="h-5 w-5 text-text-subtle" />
              )}
            </button>
            {!showManualEntries && manualEntries.length > 0 && (
              <span className="text-xs text-text-dim">
                {t("portfolio.manualEntries", { count: manualEntries.length })}
              </span>
            )}
          </div>
        </CardHeader>
        {showManualEntries && (
          <CardContent>
            <p className="mb-4 text-sm text-text-subtle">
              {t("portfolio.enterHoldings")}
            </p>

            {/* Add entry form */}
            <div className="mb-4 space-y-3 rounded-lg border border-border bg-bg-card p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                <div className="relative">
                  <label className="mb-1 block text-xs text-text-subtle">{t("portfolio.symbol")}</label>
                  <Input
                    placeholder={t("portfolioAdd.tokenSymbolPlaceholder")}
                    value={meSymbol}
                    onChange={(e) => {
                      setMeSymbol(e.target.value.toUpperCase());
                      setShowManualSymbolSuggestions(true);
                    }}
                    onFocus={() => setShowManualSymbolSuggestions(true)}
                    onBlur={() => {
                      window.setTimeout(() => setShowManualSymbolSuggestions(false), 120);
                    }}
                    autoComplete="off"
                  />
                  {showManualSymbolSuggestions &&
                    manualSymbolSuggestions.length > 0 && (
                      <div className="absolute left-0 top-full z-20 mt-1 max-h-52 w-72 overflow-y-auto rounded-md border border-border bg-bg-input shadow-lg">
                        {manualSymbolSuggestions.map((coin) => (
                          <button
                            key={coin.id}
                            type="button"
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-bg-hover"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectManualSymbolSuggestion(coin)}
                          >
                            <div className="flex min-w-0 items-center">
                              <span className="font-semibold text-text-primary">
                                {coin.symbol.toUpperCase()}
                              </span>
                              <span className="ml-2 truncate text-text-subtle">
                                {coin.name}
                              </span>
                            </div>
                            {coin.binance && (
                              <span className="ml-2 shrink-0 rounded bg-status-info-soft px-1.5 py-0.5 text-[10px] text-status-info">
                                Binance
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                </div>
                <div>
                  <label className="mb-1 block text-xs text-text-subtle">{t("portfolio.name")}</label>
                  <Input
                    placeholder={t("portfolioAdd.tokenNamePlaceholder")}
                    value={meName}
                    onChange={(e) => setMeName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-text-subtle">{t("portfolio.coingeckoId")}</label>
                  <Input
                    placeholder={t("portfolioAdd.coingeckoIdPlaceholder")}
                    value={meCoingeckoId}
                    onChange={(e) => setMeCoingeckoId(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-text-subtle">{t("portfolio.quantity")}</label>
                  <Input
                    type="number"
                    placeholder="0.5"
                    min={0}
                    step="any"
                    value={meQuantity}
                    onChange={(e) => setMeQuantity(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-text-subtle">{t("portfolio.manualInitialPrice")}</label>
                  <Input
                    type="number"
                    placeholder={t("portfolio.manualInitialPricePlaceholder")}
                    min={0}
                    step="any"
                    value={meInitialPrice}
                    onChange={(e) => setMeInitialPrice(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-text-subtle">{t("common.note")}</label>
                  <Input
                    placeholder={t("common.optional")}
                    value={meNote}
                    onChange={(e) => setMeNote(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-text-dim">
                {t("portfolio.manualInitialPriceHint")}
              </p>
              <Button
                size="sm"
                onClick={() => {
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
                disabled={
                  addingManualEntry ||
                  !meSymbol.trim() ||
                  !meName.trim() ||
                  !manualEntryQuantityValid ||
                  !manualEntryInitialPriceValid
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                {addingManualEntry ? t("portfolio.adding") : t("portfolio.addManualEntry")}
              </Button>
            </div>

            {/* Existing entries list */}
            {manualEntries.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-text-muted">{t("portfolio.currentManualEntries")}</h4>
                {filteredManualEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-md bg-bg-card px-4 py-2.5"
                  >
                    {editingEntryId === entry.id ? (
                      <div className="flex flex-1 items-center gap-3">
                        <span className="w-16 font-medium text-text-primary">{entry.tokenSymbol}</span>
                        <Input
                          type="number"
                          value={editEntryQty}
                          onChange={(e) => setEditEntryQty(e.target.value)}
                          className="w-32"
                          min={0}
                          step="any"
                        />
                        <Input
                          value={editEntryNote}
                          onChange={(e) => setEditEntryNote(e.target.value)}
                          placeholder={t("common.note")}
                          className="w-40"
                        />
                        <Button
                          size="sm"
                          onClick={() =>
                            handleUpdateManualEntry({
                              id: entry.id,
                              quantity: editEntryQty,
                              note: editEntryNote,
                            })
                          }
                          disabled={
                            updatingManualEntry ||
                            !Number.isFinite(parseFloat(editEntryQty)) ||
                            parseFloat(editEntryQty) <= 0
                          }
                        >
                          {t("common.save")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingEntryId(null)}
                        >
                          {t("common.cancel")}
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-4">
                          <span className="font-medium text-text-primary">{entry.tokenSymbol}</span>
                          <span className="text-sm text-text-muted">{entry.tokenName}</span>
                          <span className="font-mono text-sm text-text-tertiary">
                            {formatCrypto(entry.quantity)}
                          </span>
                          {entry.coingeckoId && (
                            <span className="text-xs text-text-dim">{entry.coingeckoId}</span>
                          )}
                          {entry.note && (
                            <span className="text-xs text-text-dim italic">{entry.note}</span>
                          )}
                          <span className="inline-flex rounded-full bg-status-info-soft px-2 py-0.5 text-xs text-status-info">
                            {t("portfolio.manual")}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-text-subtle hover:text-text-primary"
                            onClick={() => {
                              setEditingEntryId(entry.id);
                              setEditEntryQty(entry.quantity.toString());
                              setEditEntryNote(entry.note || "");
                            }}
                            aria-label={`${t("common.edit")} ${entry.tokenSymbol}`}
                            title={`${t("common.edit")} ${entry.tokenSymbol}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-text-subtle hover:text-status-negative"
                            onClick={() => setDeleteManualTarget(entry)}
                            disabled={deletingManualEntry}
                            aria-label={`${t("common.delete")} ${entry.tokenSymbol}`}
                            title={`${t("common.delete")} ${entry.tokenSymbol}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {search.trim() && filteredManualEntries.length === 0 && (
                  <p className="text-sm text-text-subtle">{t("portfolio.noMatch")}</p>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Holdings Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("portfolio.holdings")}</CardTitle>
        </CardHeader>
        <CardContent>
          {breakdown.length === 0 ? (
            <p className="py-6 text-center text-text-subtle">
              {t("portfolio.noHoldings")}
            </p>
          ) : filteredBreakdown.length === 0 ? (
            <p className="py-6 text-center text-text-subtle">
              {t("portfolio.noMatch")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-text-subtle">
                    <th className="pb-3 pr-4 font-medium">{t("portfolio.token")}</th>
                    <th className="pb-3 pr-4 text-right font-medium">{t("portfolio.qty")}</th>
                    <th className="pb-3 pr-4 text-right font-medium">{t("portfolio.avgCost")}</th>
                    <th className="pb-3 pr-4 text-right font-medium">{t("portfolio.price")}</th>
                    <th className="pb-3 pr-4 text-right font-medium">{t("portfolio.value")}</th>
                    <th className="pb-3 pr-4 text-right font-medium">{t("portfolio.unrealizedPL")}</th>
                    <th className="pb-3 pr-4 text-right font-medium">{t("portfolio.realizedPL")}</th>
                    <th className="pb-3 pr-4 text-right font-medium">{t("portfolio.fees")}</th>
                    <th className="pb-3 pr-4 text-center font-medium">{t("portfolio.held")}</th>
                    <th className="pb-3 text-center font-medium">{t("portfolio.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredBreakdown.map((item) => {
                    const holdingKey = getHoldingKey(item);
                    return (
                    <Fragment key={holdingKey}>
                      <tr className="text-text-tertiary">
                        <td className="py-3 pr-4 font-medium">{item.symbol}</td>
                        <td className="py-3 pr-4 text-right font-mono">
                          {formatCrypto(item.quantity)}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          {formatUsdPrice(item.avgCost)}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          {formatUsdPrice(item.currentPrice)}
                        </td>
                        <td className="py-3 pr-4 text-right font-medium">
                          {formatUsd(item.value)}
                        </td>
                        <td className={`py-3 pr-4 text-right ${item.unrealizedPL >= 0 ? "text-status-positive" : "text-status-negative"}`}>
                          {item.unrealizedPL >= 0 ? "+" : ""}{formatUsd(item.unrealizedPL)}
                          <span className="ml-1 text-xs">
                            ({item.unrealizedPLPercent >= 0 ? "+" : ""}{item.unrealizedPLPercent.toFixed(1)}%)
                          </span>
                        </td>
                        <td className={`py-3 pr-4 text-right ${item.realizedPL >= 0 ? "text-status-positive" : "text-status-negative"}`}>
                          {item.realizedPL >= 0 ? "+" : ""}{formatUsd(item.realizedPL)}
                        </td>
                        <td className="py-3 pr-4 text-right text-status-caution">
                          {item.totalFees > 0 ? formatUsd(item.totalFees) : "-"}
                        </td>
                        <td className="py-3 pr-4 text-center">
                          {(() => {
                            if (!item.firstBuyDate) return "-";
                            const heldDuration = getHeldDuration(item.firstBuyDate);
                            if (!heldDuration) return "-";
                            return (
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${heldDuration.days >= 365 ? "bg-status-positive-soft text-status-positive" : "bg-status-warning-soft text-status-warning"}`}>
                                {heldDuration.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-status-positive hover:text-status-positive hover:bg-status-positive-soft"
                              onClick={() =>
                                expandedHoldingKey === holdingKey && txType === "buy"
                                  ? closeInlineForm()
                                  : openInlineForm(item, "buy")
                              }
                              title={t("portfolio.addBuy")}
                              aria-label={`${t("portfolio.addBuy")} ${item.symbol}`}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-status-negative hover:text-status-negative hover:bg-status-negative-soft"
                              onClick={() =>
                                expandedHoldingKey === holdingKey && txType === "sell"
                                  ? closeInlineForm()
                                  : openInlineForm(item, "sell")
                              }
                              title={t("portfolio.addSell")}
                              aria-label={`${t("portfolio.addSell")} ${item.symbol}`}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-text-subtle hover:text-text-tertiary"
                              onClick={() => handleRepeatLast(item)}
                              title={t("portfolio.repeatLast")}
                              aria-label={`${t("portfolio.repeatLast")} ${item.symbol}`}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>

                      {/* Inline form row */}
                      {expandedHoldingKey === holdingKey && (
                        <tr className="bg-bg-card">
                          <td colSpan={10} className="px-4 py-4">
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
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
                              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                                    autoFocus
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
                                  {t("common.total") + ":"} {formatUsd(parseFloat(inlineQty || "0") * parseFloat(inlinePrice || "0"))}
                                </div>
                              )}
                              {inlineError && (
                                <div className="text-xs text-status-negative">
                                  {inlineError}
                                </div>
                              )}
                              <div className="flex gap-2">
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
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )})}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle>{t("portfolio.transactionHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="py-6 text-center text-text-subtle">
              {t("portfolio.noTransactions")}
            </p>
          ) : filteredTransactions.length === 0 ? (
            <p className="py-6 text-center text-text-subtle">
              {t("portfolio.noTransactionsMatch")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-text-subtle">
                    <th className="pb-3 pr-4 font-medium">{t("common.date")}</th>
                    <th className="pb-3 pr-4 font-medium">{t("portfolio.type")}</th>
                    <th className="pb-3 pr-4 font-medium">{t("portfolio.token")}</th>
                    <th className="pb-3 pr-4 text-right font-medium">{t("portfolio.qty")}</th>
                    <th className="pb-3 pr-4 text-right font-medium">{t("portfolio.price")}</th>
                    <th className="pb-3 pr-4 text-right font-medium">{t("common.total")}</th>
                    <th className="pb-3 text-right font-medium">{t("portfolio.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {paginatedTransactions.map((tx) => (
                    <Fragment key={tx.id}>
                      <tr className="text-text-tertiary">
                        <td className="py-3 pr-4 text-text-subtle">
                          {new Date(tx.transactedAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              tx.type === "buy"
                                ? "bg-status-positive-soft text-status-positive"
                                : tx.type === "sell"
                                  ? "bg-status-negative-soft text-status-negative"
                                  : tx.type === "receive"
                                    ? "bg-status-info-soft text-status-info"
                                    : "bg-status-caution-soft text-status-caution"
                            }`}
                          >
                            {tx.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <p className="font-medium">{tx.tokenSymbol}</p>
                          <p className="text-xs text-text-subtle">{tx.tokenName}</p>
                        </td>
                        <td className="py-3 pr-4 text-right font-mono">
                          {formatCrypto(tx.quantity)}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          {formatUsdPrice(parseFloat(tx.pricePerUnit))}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          {formatUsd(parseFloat(tx.totalCost))}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-text-subtle hover:text-text-tertiary"
                              onClick={() =>
                                editingTx?.id === tx.id
                                  ? setEditingTx(null)
                                  : openEditForm(tx)
                              }
                              title={
                                editingTx?.id === tx.id
                                  ? t("common.close")
                                  : t("portfolio.editTransaction")
                              }
                              aria-label={
                                editingTx?.id === tx.id
                                  ? t("common.close")
                                  : `${t("portfolio.editTransaction")} ${tx.tokenSymbol}`
                              }
                            >
                              {editingTx?.id === tx.id ? (
                                <X className="h-4 w-4" />
                              ) : (
                                <Pencil className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-status-negative hover:text-status-negative"
                              onClick={() => setDeleteTarget(tx)}
                              disabled={deletingTx}
                              title={t("portfolio.deleteTransaction")}
                              aria-label={`${t("portfolio.deleteTransaction")} ${tx.tokenSymbol}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>

                      {/* Inline edit form */}
                      {editingTx?.id === tx.id && (
                        <tr className="bg-bg-card">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="space-y-3">
                              <div className="flex gap-2">
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
                              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                                    autoFocus
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
                                <div className="text-xs text-text-subtle">
                                  {t("common.total") + ":"} {formatUsd(parseFloat(editQty || "0") * parseFloat(editPrice || "0"))}
                                </div>
                              )}
                              {editError && (
                                <div className="text-xs text-status-negative">
                                  {editError}
                                </div>
                              )}
                              <div className="flex gap-2">
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
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-text-subtle">
                  {t("portfolio.transactionRange", {
                    from: transactionRange.from,
                    to: transactionRange.to,
                    total: transactionRange.total,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <label htmlFor="transactions-per-page" className="text-xs text-text-subtle">
                    {t("portfolio.rowsPerPage")}
                  </label>
                  <Select
                    id="transactions-per-page"
                    value={String(transactionsPerPage)}
                    onChange={(e) => setTransactionsPerPage(Number(e.target.value))}
                    className="h-8 w-20 px-2 py-1 text-xs"
                  >
                    {TRANSACTION_PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTransactionsPage((prev) => Math.max(1, prev - 1))}
                    disabled={transactionsPage <= 1}
                  >
                    {t("portfolio.prevPage")}
                  </Button>
                  <span className="text-xs text-text-subtle">
                    {t("portfolio.pageOf", {
                      page: transactionsPage,
                      total: totalTransactionPages,
                    })}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setTransactionsPage((prev) => Math.min(totalTransactionPages, prev + 1))
                    }
                    disabled={transactionsPage >= totalTransactionPages}
                  >
                    {t("portfolio.nextPage")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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

      {/* Import CSV Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="mx-4 w-full max-w-2xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t("portfolio.importTitle")}</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeImportModal}
                  aria-label={t("common.close")}
                  title={t("common.close")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm text-text-subtle">
                    {t("portfolio.importDesc")}
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        parseCsvFile(file);
                      }
                    }}
                    className="block w-full text-sm text-text-subtle file:mr-4 file:rounded-md file:border-0 file:bg-bg-muted file:px-4 file:py-2 file:text-sm file:font-medium file:text-text-tertiary hover:file:bg-bg-hover"
                  />
                </div>
                {importPreview.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm text-text-subtle">
                      {t("portfolio.preview", { count: importPreview.length })}
                    </p>
                    <div className="max-h-48 overflow-auto rounded border border-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border text-text-subtle">
                            <th className="px-2 py-1 text-left">#</th>
                            <th className="px-2 py-1 text-left">{t("common.date")}</th>
                            <th className="px-2 py-1 text-left">{t("portfolio.type")}</th>
                            <th className="px-2 py-1 text-left">{t("portfolio.symbol")}</th>
                            <th className="px-2 py-1 text-left">{t("portfolio.quantity")}</th>
                            <th className="px-2 py-1 text-left">{t("portfolio.price")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.slice(0, 5).map((row, i) => (
                            <tr key={i} className="border-b border-border-subtle">
                              <td className="px-2 py-1 text-text-muted">{row.rowNumber}</td>
                              <td className="px-2 py-1 text-text-muted">{row.dateIso.split("T")[0]}</td>
                              <td className="px-2 py-1 text-text-muted">{row.type}</td>
                              <td className="px-2 py-1 text-text-muted">{row.symbol}</td>
                              <td className="px-2 py-1 text-text-muted">{row.quantity}</td>
                              <td className="px-2 py-1 text-text-muted">{row.pricePerUnit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {importPreview.length > 5 && (
                        <p className="px-2 py-1 text-xs text-text-dim">
                          {t("portfolio.moreRows", { count: importPreview.length - 5 })}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {importError && (
                  <p className="text-sm text-status-negative">{importError}</p>
                )}
                {importValidationErrors.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-xs text-status-negative">
                    {importValidationErrors.slice(0, 5).map((issue, idx) => (
                      <li key={`${issue}-${idx}`}>{issue}</li>
                    ))}
                  </ul>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={closeImportModal}>
                    {t("common.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleImportSubmit}
                    disabled={
                      importing ||
                      importPreview.length === 0 ||
                      importValidationErrors.length > 0
                    }
                  >
                    {importing
                      ? t("portfolio.importing")
                      : t("portfolio.importCount", { count: importPreview.length })}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
