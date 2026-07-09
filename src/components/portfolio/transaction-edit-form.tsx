"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/hooks/use-translation";
import { formatUsd } from "@/lib/utils";
import {
  calculateFeeAmountFromPercent,
  rebuildTradeSettlement,
} from "@/lib/transactions";
import { getTxTypeToggleClass } from "@/components/portfolio/tx-type-styles";
import type {
  PortfolioTransaction,
  PortfolioTxType,
} from "@/components/portfolio/types";

export interface TransactionEditFormProps {
  tx: PortfolioTransaction;
  type: PortfolioTxType;
  quantity: string;
  price: string;
  feePercent: string;
  date: string;
  note: string;
  error: string | null;
  submitting: boolean;
  onTypeChange: (type: PortfolioTxType) => void;
  onQuantityChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onFeePercentChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

/**
 * Inline edit form shown under a transaction row.
 * Memoized so transaction-list re-renders don't recreate it needlessly.
 */
export const TransactionEditForm = memo(function TransactionEditForm({
  tx,
  type,
  quantity,
  price,
  feePercent,
  date,
  note,
  error,
  submitting,
  onTypeChange,
  onQuantityChange,
  onPriceChange,
  onFeePercentChange,
  onDateChange,
  onNoteChange,
  onCancel,
  onSubmit,
}: TransactionEditFormProps) {
  const { t } = useTranslation();

  const editTotalCost =
    Number.parseFloat(quantity || "0") * Number.parseFloat(price || "0");
  const editFeeAmountUsd =
    type === "buy" || type === "sell"
      ? calculateFeeAmountFromPercent(
          editTotalCost,
          Number.parseFloat(feePercent || "0")
        )
      : 0;
  const settlementPreview =
    tx.settlement && (type === "buy" || type === "sell")
      ? rebuildTradeSettlement(
          {
            type,
            quantity: quantity || tx.quantity,
            pricePerUnit: price || tx.pricePerUnit,
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
            onClick={() => onTypeChange(typ)}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${getTxTypeToggleClass(
              typ,
              type === typ
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
            value={quantity}
            onChange={(e) => onQuantityChange(e.target.value)}
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
            value={price}
            onChange={(e) => onPriceChange(e.target.value)}
          />
        </div>
        {type === "buy" || type === "sell" ? (
          <div>
            <label className="mb-1 block text-xs text-text-subtle">
              {t("portfolio.feePercent")}
            </label>
            <Input
              type="number"
              step="any"
              min="0"
              value={feePercent}
              onChange={(e) => onFeePercentChange(e.target.value)}
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
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-text-subtle">
            {t("common.note") + " (" + t("common.optional") + ")"}
          </label>
          <Input
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder={t("common.note") + "..."}
          />
        </div>
      </div>
      {quantity && price && (
        <div className="space-y-1 text-xs text-text-subtle">
          <div>
          {t("common.total") + ":"}{" "}
          {formatUsd(editTotalCost)}
          </div>
          {type === "buy" || type === "sell" ? (
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
      {error && (
        <div className="text-xs text-status-negative" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
        >
          {t("common.cancel")}
        </Button>
        <Button
          size="sm"
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? t("common.saving") : t("portfolio.saveChanges")}
        </Button>
      </div>
    </div>
  );
});
