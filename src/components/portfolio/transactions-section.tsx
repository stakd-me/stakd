"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useTranslation } from "@/hooks/use-translation";
import { formatCrypto, formatUsd, formatUsdPrice } from "@/lib/utils";
import { Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import type { PortfolioTransaction } from "@/components/portfolio/types";

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
  getTransactionTypeBadgeClass: (type: string) => string;
  onToggleEdit: (tx: PortfolioTransaction) => void;
  onDelete: (tx: PortfolioTransaction) => void;
  onSetTransactionsPerPage: (value: number) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onOpenImportModal: () => void;
  pageSizeOptions: readonly number[];
}

export function TransactionsSection({
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
  getTransactionTypeBadgeClass,
  onToggleEdit,
  onDelete,
  onSetTransactionsPerPage,
  onPreviousPage,
  onNextPage,
  onOpenImportModal,
  pageSizeOptions,
}: TransactionsSectionProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("portfolio.transactionHistory")}</CardTitle>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="space-y-4 py-6 text-center">
            <p className="text-text-subtle">{t("portfolio.noTransactions")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/portfolio/add">
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  {t("portfolio.addTransaction")}
                </Button>
              </Link>
              <Button size="sm" variant="outline" onClick={onOpenImportModal}>
                <Upload className="mr-2 h-4 w-4" />
                {t("common.import")}
              </Button>
            </div>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <p className="py-6 text-center text-text-subtle">
            {t("portfolio.noTransactionsMatch")}
          </p>
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
                        <p className="text-sm text-text-subtle">
                          {new Date(tx.transactedAt).toLocaleDateString()}
                        </p>
                        <p className="font-medium text-text-primary">{tx.tokenSymbol}</p>
                        <p className="truncate text-xs text-text-subtle">
                          {tx.tokenName}
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getTransactionTypeBadgeClass(
                            tx.type
                          )}`}
                        >
                          {tx.type.toUpperCase()}
                        </span>
                        <p className="mt-2 font-semibold text-text-primary">
                          {formatUsd(Number.parseFloat(tx.totalCost))}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-text-subtle">{t("portfolio.qty")}</p>
                        <p className="font-mono text-text-primary">
                          {formatCrypto(tx.quantity)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-text-subtle">{t("portfolio.price")}</p>
                        <p className="text-text-primary">
                          {formatUsdPrice(Number.parseFloat(tx.pricePerUnit))}
                        </p>
                      </div>
                      {tx.note ? (
                        <div className="col-span-2">
                          <p className="text-xs text-text-subtle">{t("common.note")}</p>
                          <p className="text-text-primary">{tx.note}</p>
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
              <table id="portfolio-transactions-table" className="w-full text-left text-sm">
                <caption className="sr-only">{t("portfolio.transactionHistory")}</caption>
                <thead>
                  <tr className="border-b border-border text-text-subtle">
                    <th scope="col" className="pb-3 pr-4 font-medium">
                      {t("common.date")}
                    </th>
                    <th scope="col" className="pb-3 pr-4 font-medium">
                      {t("portfolio.type")}
                    </th>
                    <th scope="col" className="pb-3 pr-4 font-medium">
                      {t("portfolio.token")}
                    </th>
                    <th scope="col" className="pb-3 pr-4 text-right font-medium">
                      {t("portfolio.qty")}
                    </th>
                    <th scope="col" className="pb-3 pr-4 text-right font-medium">
                      {t("portfolio.price")}
                    </th>
                    <th scope="col" className="pb-3 pr-4 text-right font-medium">
                      {t("common.total")}
                    </th>
                    <th scope="col" className="pb-3 text-right font-medium">
                      {t("portfolio.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {paginatedTransactions.map((tx) => {
                    const isEditing = editingTransactionId === tx.id;

                    return (
                      <Fragment key={tx.id}>
                        <tr className="text-text-tertiary">
                          <td className="py-3 pr-4 text-text-subtle">
                            {new Date(tx.transactedAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getTransactionTypeBadgeClass(
                                tx.type
                              )}`}
                            >
                              {tx.type.toUpperCase()}
                            </span>
                          </td>
                          <th scope="row" className="py-3 pr-4 text-left">
                            <p className="font-medium">{tx.tokenSymbol}</p>
                            <p className="text-xs text-text-subtle">{tx.tokenName}</p>
                          </th>
                          <td className="py-3 pr-4 text-right font-mono">
                            {formatCrypto(tx.quantity)}
                          </td>
                          <td className="py-3 pr-4 text-right">
                            {formatUsdPrice(Number.parseFloat(tx.pricePerUnit))}
                          </td>
                          <td className="py-3 pr-4 text-right">
                            {formatUsd(Number.parseFloat(tx.totalCost))}
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-text-subtle hover:text-text-tertiary"
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
              <p className="text-xs text-text-subtle" role="status" aria-live="polite">
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
                  onChange={(event) => onSetTransactionsPerPage(Number(event.target.value))}
                  className="h-8 w-20 px-2 py-1 text-xs"
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
                <span className="text-xs text-text-subtle" role="status" aria-live="polite">
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
}
