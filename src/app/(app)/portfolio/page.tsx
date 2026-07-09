"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { HoldingsSection } from "@/components/portfolio/holdings-section";
import { EditHoldingDialog } from "@/components/portfolio/edit-holding-dialog";
import { ImportReviewModal } from "@/components/portfolio/import-review-modal";
import { ManualEntriesPanel } from "@/components/portfolio/manual-entries-panel";
import { TransactionsSection } from "@/components/portfolio/transactions-section";
import { HoldingInlineForm } from "@/components/portfolio/holding-inline-form";
import { TransactionEditForm } from "@/components/portfolio/transaction-edit-form";
import { getTransactionTypeBadgeClass } from "@/components/portfolio/tx-type-styles";
import type {
  BreakdownItem,
  PortfolioCoinListItem as CoinListItem,
  PortfolioTransaction as Transaction,
} from "@/components/portfolio/types";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SectionNavigator, SectionPanel } from "@/components/ui/section-navigator";
import { cn, formatTimeAgo } from "@/lib/utils";
import { Plus, Search, Download, Upload } from "lucide-react";
import { TokenListSkeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/hooks/use-translation";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useNow } from "@/hooks/use-now";
import { usePortfolio } from "@/hooks/use-portfolio";
import { usePrices } from "@/hooks/use-prices";
import { useCsvImport } from "@/hooks/use-csv-import";
import { useCsvExport } from "@/hooks/use-csv-export";
import { useManualEntries } from "@/hooks/use-manual-entries";
import { usePortfolioShortcuts } from "@/hooks/use-portfolio-shortcuts";
import { enrichBreakdown } from "@/components/portfolio/enrich-breakdown";
import {
  getHoldingKey,
  parseDateInput,
  useTransactionMutations,
} from "@/hooks/use-transaction-mutations";
import { useVaultStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { buildStablecoinSymbolSet } from "@/lib/constants/stablecoins";

type PortfolioSection = "holdings" | "transactions" | "manual" | "all";
const TRANSACTION_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

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

function getHeldDurationBadge(firstBuyDate: string | null) {
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
}

export default function PortfolioPage() {
  const sectionsBaseId = "portfolio-sections";
  const { t } = useTranslation();
  const { ensurePrices } = usePrices();
  const { holdings, breakdown: rawBreakdown, lastPriceUpdate, isLoading: portfolioLoading } = usePortfolio();
  const now = useNow(30_000);
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
  const vaultTokenCategories = useVaultStore((s) => s.vault.tokenCategories);

  const stablecoinSymbols = useMemo(
    () => buildStablecoinSymbolSet(vaultTokenCategories),
    [vaultTokenCategories]
  );

  // Default settlement stablecoin: highest-qty stablecoin in holdings, or USDT
  const defaultSettlement = useMemo(() => {
    const stableHoldings = holdings
      .filter((h) => stablecoinSymbols.has(h.symbol.toUpperCase()) && h.currentQty > 0)
      .sort((a, b) => b.currentValue - a.currentValue);
    const best = stableHoldings[0];
    return best
      ? { symbol: best.symbol, name: best.tokenName, coingeckoId: best.coingeckoId }
      : { symbol: "USDT", name: "Tether", coingeckoId: "tether" };
  }, [holdings, stablecoinSymbols]);

  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [transactionsPerPage, setTransactionsPerPage] = useState<number>(
    TRANSACTION_PAGE_SIZE_OPTIONS[1]
  );
  const [showManualEntries, setShowManualEntries] = useState(false);

  // Import modal state + controls (incl. the vault-mutating submitImport)
  const {
    showImportModal,
    importFileName,
    importPreview,
    importValidationErrors,
    importError,
    importing,
    importReadyCount,
    importIssueCount,
    importHasReviewState,
    importIsReady,
    openImportModal,
    closeImportModal,
    parseCsvFile,
    submitImport,
  } = useCsvImport({ ensurePrices });

  const importDialogRef = useFocusTrap<HTMLDivElement>(
    showImportModal,
    closeImportModal
  );

  // --- Enrich breakdown with tokenName, coingeckoId, totalFees, firstBuyDate ---
  const breakdown: BreakdownItem[] = useMemo(
    () => enrichBreakdown(rawBreakdown, holdings, vaultTransactions),
    [rawBreakdown, holdings, vaultTransactions]
  );

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

  // --- Manual entries (state + vault CRUD) ---
  const manual = useManualEntries({ coinList, search, ensurePrices });

  // --- Transaction mutations (inline add, edit, delete, holding edit) ---
  const {
    deleteTarget,
    setDeleteTarget,
    deletingTx,
    handleDeleteConfirm,
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
    editingTx,
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
    submittingEdit,
    toggleEditForm,
    cancelEditForm,
    handleEditSubmit,
    editingHolding,
    setEditingHolding,
    handleEditHoldingSave,
  } = useTransactionMutations({
    transactions,
    stablecoinSymbols,
    defaultSettlement,
    ensurePrices,
  });

  const { exportCsv } = useCsvExport(transactions);

  const [activeSection, setActiveSection] = useState<PortfolioSection>(() => {
    if (rawBreakdown.length > 0) return "holdings";
    if (transactions.length > 0) return "transactions";
    if (manual.manualEntries.length > 0) return "manual";
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
        count: manual.manualEntries.length,
      },
      {
        value: "all" as const,
        label: t("portfolio.viewAll"),
        count: breakdown.length + transactions.length + manual.manualEntries.length,
      },
    ],
    [breakdown.length, manual.manualEntries.length, t, transactions.length]
  );

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

  // Reset to page 1 whenever the search query or the page size changes
  // (previously an effect; done in the event handlers to avoid extra renders).
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setTransactionsPage(1);
  }, []);

  const handleTransactionsPerPageChange = useCallback((value: number) => {
    setTransactionsPerPage(value);
    setTransactionsPage(1);
  }, []);

  // Clamp the page when the list shrinks (render-adjust pattern).
  if (transactionsPage > totalTransactionPages) {
    setTransactionsPage(totalTransactionPages);
  }

  const cancelDeleteTransaction = useCallback(
    () => setDeleteTarget(null),
    [setDeleteTarget]
  );

  usePortfolioShortcuts({
    searchInputRef,
    showImportModal,
    importing,
    importSubmittable:
      importPreview.length > 0 && importValidationErrors.length === 0,
    openImportModal,
    closeImportModal,
    submitImport,
    hasDeleteTarget: deleteTarget !== null,
    cancelDeleteTransaction,
    hasManualDeleteTarget: manual.deleteManualTarget !== null,
    cancelManualDelete: manual.cancelDeleteEntry,
    isEditingTransaction: editingTx !== null,
    dismissEditForm: cancelEditForm,
    hasExpandedHolding: expandedHoldingKey !== null,
    closeInlineForm,
    isEditingManualEntry: manual.editingEntryId !== null,
    cancelManualEdit: manual.cancelEditEntry,
    submittingEdit,
    handleEditSubmit,
    activeInlineItem,
    submittingInline,
    handleInlineSubmit,
  });

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
    if (activeSection === "manual") return manual.manualEntries.length > 0;
    return (
      breakdown.length > 0 ||
      transactions.length > 0 ||
      manual.manualEntries.length > 0
    );
  })();

  const renderHoldingInlineForm = useCallback(
    (item: BreakdownItem) => (
      <HoldingInlineForm
        item={item}
        txType={txType}
        quantity={inlineQty}
        price={inlinePrice}
        date={inlineDate}
        note={inlineNote}
        error={inlineError}
        submitting={submittingInline}
        onTxTypeChange={setTxType}
        onQuantityChange={setInlineQty}
        onPriceChange={setInlinePrice}
        onDateChange={setInlineDate}
        onNoteChange={setInlineNote}
        onCancel={closeInlineForm}
        onSubmit={handleInlineSubmit}
      />
    ),
    [
      closeInlineForm,
      handleInlineSubmit,
      inlineDate,
      inlineError,
      inlineNote,
      inlinePrice,
      inlineQty,
      setInlineDate,
      setInlineNote,
      setInlinePrice,
      setInlineQty,
      setTxType,
      submittingInline,
      txType,
    ]
  );

  const renderTransactionEditForm = useCallback(
    (tx: Transaction) => (
      <TransactionEditForm
        tx={tx}
        type={editType}
        quantity={editQty}
        price={editPrice}
        feePercent={editFeePercent}
        date={editDate}
        note={editNote}
        error={editError}
        submitting={submittingEdit}
        onTypeChange={setEditType}
        onQuantityChange={setEditQty}
        onPriceChange={setEditPrice}
        onFeePercentChange={setEditFeePercent}
        onDateChange={setEditDate}
        onNoteChange={setEditNote}
        onCancel={cancelEditForm}
        onSubmit={handleEditSubmit}
      />
    ),
    [
      cancelEditForm,
      editDate,
      editError,
      editFeePercent,
      editNote,
      editPrice,
      editQty,
      editType,
      handleEditSubmit,
      setEditDate,
      setEditFeePercent,
      setEditNote,
      setEditPrice,
      setEditQty,
      setEditType,
      submittingEdit,
    ]
  );

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
              {lastPriceUpdate && now - new Date(lastPriceUpdate).getTime() > 60_000 && (
                <span className="ml-2 text-xs text-status-warning">
                  · {t("dashboard.prices", { time: formatTimeAgo(new Date(lastPriceUpdate)) })}
                </span>
              )}
            </p>
            <p className="text-xs text-text-dim">{t("portfolio.shortcutsHint")}</p>
          </>
        }
        actions={
          <>
          <Button size="sm" variant="outline" onClick={exportCsv}>
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

      <SectionPanel baseId={sectionsBaseId} value={activeSection}>

      {canSearchCurrentSection && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" />
          <Input
            ref={searchInputRef}
            placeholder={t("portfolio.searchByToken")}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
            aria-label={t("portfolio.searchByToken")}
          />
        </div>
      )}

      {showManualSection && (
        <ManualEntriesPanel
          manual={manual}
          search={search}
          isAllSectionsView={activeSection === "all"}
          manualSectionExpanded={manualSectionExpanded}
          onToggleExpanded={() => setShowManualEntries((value) => !value)}
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
          onEditHolding={setEditingHolding}
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
          onToggleEdit={toggleEditForm}
          onDelete={setDeleteTarget}
          onSetTransactionsPerPage={handleTransactionsPerPageChange}
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
        open={manual.deleteManualTarget !== null}
        onConfirm={manual.confirmDeleteEntry}
        onCancel={manual.cancelDeleteEntry}
        title={t("portfolio.deleteManualEntryTitle")}
        description={t("portfolio.deleteManualEntryDesc", {
          symbol: manual.deleteManualTarget?.tokenSymbol ?? "",
        })}
        confirmLabel={t("common.delete")}
        variant="danger"
      />

      {editingHolding && (
        <EditHoldingDialog
          open={editingHolding !== null}
          item={editingHolding}
          onSave={handleEditHoldingSave}
          onCancel={() => setEditingHolding(null)}
        />
      )}

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
        onSubmit={submitImport}
      />
    </div>
  );
}
