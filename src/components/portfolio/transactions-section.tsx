"use client";

import { Fragment, memo, type ReactNode } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useTranslation } from "@/hooks/use-translation";
import { formatCrypto, formatUsd, formatUsdPrice } from "@/lib/utils";
import { Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import type { PortfolioTransaction } from "@/components/portfolio/types";
import { usePrivacy } from "@/hooks/use-privacy";
import { TX_TYPE_LABEL_KEYS } from "@/components/portfolio/tx-type-styles";
import { TxTypeChip } from "@/components/portfolio/tx-type-chip";
import { cn } from "@/lib/utils";
import { toggleChipVariants } from "@/components/ui/toggle-chip";

export type TxTypeFilter = "all" | PortfolioTransaction["type"];

const TX_TYPE_FILTERS: readonly TxTypeFilter[] = ["all", "buy", "sell", "receive", "send"];

interface TransactionRange {
  from: number;
  to: number;
  total: number;
}

interface TransactionsSectionProps {
  transactions: PortfolioTransaction[];
  filteredTransactions: PortfolioTransaction[];
  paginatedTransactions: PortfolioTransaction[];
  editingTransactionId: string | null;
  deletingTransaction: boolean;
  transactionsPerPage: number;
  transactionsPage: number;
  totalTransactionPages: number;
  transactionRange: TransactionRange;
  renderTransactionEditForm: (tx: PortfolioTransaction) => ReactNode;
  typeFilter: TxTypeFilter;
  /** Rows each chip would show, given the current text search. */
  typeCounts: Record<TxTypeFilter, number>;
  searchActive: boolean;
  onTypeFilterChange: (filter: TxTypeFilter) => void;
  onClearFilters: () => void;
  onToggleEdit: (tx: PortfolioTransaction) => void;
  onDelete: (tx: PortfolioTransaction) => void;
  onSetTransactionsPerPage: (value: number) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onOpenImportModal: () => void;
  pageSizeOptions: readonly number[];
}

/**
 * Memoised: transactions do not depend on live prices, so a price tick that
 * re-renders the portfolio page must not re-render this list.
 */
export const TransactionsSection = memo(function TransactionsSection({
  transactions,
  filteredTransactions,
  paginatedTransactions,
  editingTransactionId,
  deletingTransaction,
  transactionsPerPage,
  transactionsPage,
  totalTransactionPages,
  transactionRange,
  renderTransactionEditForm,
  typeFilter,
  typeCounts,
  searchActive,
  onTypeFilterChange,
  onClearFilters,
  onToggleEdit,
  onDelete,
  onSetTransactionsPerPage,
  onPreviousPage,
  onNextPage,
  onOpenImportModal,
  pageSizeOptions,
}: TransactionsSectionProps) {
  const { mask } = usePrivacy();
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3">
          <CardTitle>{t("portfolio.transactionHistory")}</CardTitle>
          {transactions.length > 0 ? (
            <div
              role="group"
              aria-label={t("portfolio.filterByType")}
              className="flex flex-wrap gap-1.5"
            >
              {TX_TYPE_FILTERS.map((filter) => {
                const active = typeFilter === filter;
                const count = typeCounts[filter];
                return (
                  <button
                    key={filter}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onTypeFilterChange(filter)}
                    className={toggleChipVariants({ active, size: "compact" })}
                  >
                    {filter === "all" ? t("portfolio.typeAll") : t(TX_TYPE_LABEL_KEYS[filter])}
                    {/* Read as "Buy, 3 transactions", not "Buy3". */}
                    <span className="sr-only">, {t("portfolio.typeFilterCount", { count })}</span>
                    <span
                      aria-hidden="true"
                      className={cn("font-mono tabular", count === 0 ? "text-text-dim" : "text-text-muted")}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="space-y-4 py-6 text-center">
            <p className="text-text-muted">{t("portfolio.noTransactions")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/portfolio/add" className={buttonVariants({ size: "sm" })}>
                <Plus className="mr-2 h-4 w-4" />
                {t("portfolio.addTransaction")}
              </Link>
              <Button size="sm" variant="outline" onClick={onOpenImportModal}>
                <Upload className="mr-2 h-4 w-4" />
                {t("common.import")}
              </Button>
            </div>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-text-muted" role="status">
              {typeFilter === "all"
                ? t("portfolio.noTransactionsMatch")
                : t(searchActive ? "portfolio.noTransactionsMatchFilters" : "portfolio.noTransactionsOfType", {
                    type: t(TX_TYPE_LABEL_KEYS[typeFilter]),
                  })}
            </p>
            <Button size="sm" variant="outline" onClick={onClearFilters}>
              <X className="h-4 w-4" aria-hidden="true" />
              {t("portfolio.clearFilters")}
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {paginatedTransactions.map((tx) => {
                const isEditing = editingTransactionId === tx.id;

                return (
                  <div
                    key={tx.id}
                    className="rounded-lg border border-border-subtle bg-bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-body text-text-muted">
                          {new Date(tx.transactedAt).toLocaleDateString()}
                        </p>
                        <p className="font-medium text-text-primary">{tx.tokenSymbol}</p>
                        <p className="truncate text-caption text-text-muted">
                          {tx.tokenName}
                        </p>
                      </div>
                      <div className="text-right">
                        <TxTypeChip type={tx.type} />
                        <p className="mt-2 font-mono font-semibold tabular text-text-primary">
                          {mask(formatUsd(Number.parseFloat(tx.totalCost)))}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-body">
                      <div>
                        <p className="text-caption text-text-muted">{t("portfolio.qty")}</p>
                        <p className="font-mono tabular text-text-primary">
                          {mask(formatCrypto(tx.quantity))}
                        </p>
                      </div>
                      <div>
                        <p className="text-caption text-text-muted">{t("portfolio.price")}</p>
                        <p className="font-mono tabular text-text-primary">
                          {formatUsdPrice(Number.parseFloat(tx.pricePerUnit))}
                        </p>
                      </div>
                      {tx.note ? (
                        <div className="col-span-2">
                          <p className="text-caption text-text-muted">{t("common.note")}</p>
                          <p className="text-text-primary">{tx.note}</p>
                        </div>
                      ) : null}
                      {tx.settlement ? (
                        <div className="col-span-2">
                          <p className="text-caption text-text-muted">
                            {t("portfolio.transactionSettlement")}
                          </p>
                          <p className="text-text-primary">
                            {t("portfolio.transactionSettlementSummary", {
                              token: tx.settlement.tokenSymbol,
                              direction:
                                tx.settlement.direction === "out"
                                  ? t("portfolio.transactionSettlementOut")
                                  : t("portfolio.transactionSettlementIn"),
                              amount: mask(formatUsd(
                                Number.parseFloat(tx.settlement.totalCost)
                              )),
                            })}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => onToggleEdit(tx)}>
                        {isEditing ? (
                          <X className="mr-2 h-4 w-4" />
                        ) : (
                          <Pencil className="mr-2 h-4 w-4" />
                        )}
                        {isEditing ? t("common.close") : t("common.edit")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-status-negative hover:bg-status-negative-soft hover:text-status-negative"
                        onClick={() => onDelete(tx)}
                        disabled={deletingTransaction}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t("common.delete")}
                      </Button>
                    </div>

                    {isEditing ? (
                      <div className="mt-4 border-t border-border-subtle pt-4">
                        {renderTransactionEditForm(tx)}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table id="portfolio-transactions-table" className="w-full text-left text-body">
                <caption className="sr-only">{t("portfolio.transactionHistory")}</caption>
                <thead>
                  <tr className="border-b border-border text-text-muted">
                    <th scope="col" className="pb-2 pr-4 font-mono text-meta font-normal uppercase">
                      {t("common.date")}
                    </th>
                    <th scope="col" className="pb-2 pr-4 font-mono text-meta font-normal uppercase">
                      {t("portfolio.type")}
                    </th>
                    <th scope="col" className="pb-2 pr-4 font-mono text-meta font-normal uppercase">
                      {t("portfolio.token")}
                    </th>
                    <th scope="col" className="pb-2 pr-4 text-right font-mono text-meta font-normal uppercase">
                      {t("portfolio.qty")}
                    </th>
                    <th scope="col" className="pb-2 pr-4 text-right font-mono text-meta font-normal uppercase">
                      {t("portfolio.price")}
                    </th>
                    <th scope="col" className="pb-2 pr-4 text-right font-mono text-meta font-normal uppercase">
                      {t("common.total")}
                    </th>
                    <th scope="col" className="pb-2 text-right font-mono text-meta font-normal uppercase">
                      {t("portfolio.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-faint font-mono text-num-md tabular">
                  {paginatedTransactions.map((tx) => {
                    const isEditing = editingTransactionId === tx.id;

                    return (
                      <Fragment key={tx.id}>
                        <tr className="text-text-secondary">
                          <td className="py-3 pr-4 text-text-muted">
                            {new Date(tx.transactedAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 pr-4">
                            <TxTypeChip type={tx.type} />
                          </td>
                          <th scope="row" className="py-3 pr-4 text-left font-sans text-body">
                            <p className="font-medium">{tx.tokenSymbol}</p>
                            <p className="text-caption text-text-muted">{tx.tokenName}</p>
                            {tx.settlement ? (
                              <p className="mt-1 text-caption text-text-muted">
                                {t("portfolio.transactionSettlementSummary", {
                                  token: tx.settlement.tokenSymbol,
                                  direction:
                                    tx.settlement.direction === "out"
                                      ? t("portfolio.transactionSettlementOut")
                                      : t("portfolio.transactionSettlementIn"),
                                  amount: mask(formatUsd(
                                    Number.parseFloat(tx.settlement.totalCost)
                                  )),
                                })}
                              </p>
                            ) : null}
                          </th>
                          <td className="py-3 pr-4 text-right font-mono">
                            {mask(formatCrypto(tx.quantity))}
                          </td>
                          <td className="py-3 pr-4 text-right">
                            {formatUsdPrice(Number.parseFloat(tx.pricePerUnit))}
                          </td>
                          <td className="py-3 pr-4 text-right">
                            {mask(formatUsd(Number.parseFloat(tx.totalCost)))}
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-text-muted hover:text-text-primary"
                                onClick={() => onToggleEdit(tx)}
                                title={
                                  isEditing
                                    ? t("common.close")
                                    : t("portfolio.editTransaction")
                                }
                                aria-label={
                                  isEditing
                                    ? t("common.close")
                                    : `${t("portfolio.editTransaction")} ${tx.tokenSymbol}`
                                }
                              >
                                {isEditing ? (
                                  <X className="h-4 w-4" />
                                ) : (
                                  <Pencil className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-status-negative hover:text-status-negative"
                                onClick={() => onDelete(tx)}
                                disabled={deletingTransaction}
                                title={t("portfolio.deleteTransaction")}
                                aria-label={`${t("portfolio.deleteTransaction")} ${tx.tokenSymbol}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>

                        {isEditing ? (
                          <tr className="bg-bg-card">
                            <td colSpan={7} className="px-4 py-4">
                              {renderTransactionEditForm(tx)}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-caption text-text-muted" role="status" aria-live="polite">
                {t("portfolio.transactionRange", {
                  from: transactionRange.from,
                  to: transactionRange.to,
                  total: transactionRange.total,
                })}
              </p>
              <div className="flex items-center gap-2">
                <label htmlFor="transactions-per-page" className="text-caption text-text-muted">
                  {t("portfolio.rowsPerPage")}
                </label>
                <Select
                  id="transactions-per-page"
                  value={String(transactionsPerPage)}
                  onChange={(event) => onSetTransactionsPerPage(Number(event.target.value))}
                  className="h-8 w-20 px-2 py-1 text-caption"
                  aria-label={t("portfolio.rowsPerPage")}
                  aria-controls="portfolio-transactions-table"
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onPreviousPage}
                  disabled={transactionsPage <= 1}
                  aria-controls="portfolio-transactions-table"
                  aria-label={t("portfolio.prevPage")}
                >
                  {t("portfolio.prevPage")}
                </Button>
                <span className="text-caption text-text-muted" role="status" aria-live="polite">
                  {t("portfolio.pageOf", {
                    page: transactionsPage,
                    total: totalTransactionPages,
                  })}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onNextPage}
                  disabled={transactionsPage >= totalTransactionPages}
                  aria-controls="portfolio-transactions-table"
                  aria-label={t("portfolio.nextPage")}
                >
                  {t("portfolio.nextPage")}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
});
