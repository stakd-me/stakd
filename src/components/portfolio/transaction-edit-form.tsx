"use client";

import { memo, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/hooks/use-translation";
import { formatUsd } from "@/lib/utils";
import {
  calculateFeeAmountFromPercent,
  rebuildTradeSettlement,
} from "@/lib/transactions";
import { FormField } from "@/components/ui/form-field";
import { TxTypePicker } from "@/components/portfolio/tx-type-picker";
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
  const id = useId();

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
      <div className="flex flex-wrap items-center gap-2">
        <TxTypePicker
          value={type}
          onChange={onTypeChange}
          label={t("portfolioAdd.stepType")}
        />
        <span className="ml-1 self-center text-body font-semibold text-text-muted">
          {tx.tokenSymbol}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <FormField label={<>{t("portfolio.quantity")} *</>} htmlFor={`${id}-f1`} className="space-y-1">
          <Input
            id={`${id}-f1`}
            type="number"
            step="any"
            min="0"
            value={quantity}
            onChange={(e) => onQuantityChange(e.target.value)}
          />
        </FormField>
        <FormField label={t("portfolio.pricePerUnit")} htmlFor={`${id}-f2`} className="space-y-1">
          <Input
            id={`${id}-f2`}
            type="number"
            step="any"
            min="0"
            value={price}
            onChange={(e) => onPriceChange(e.target.value)}
          />
        </FormField>
        {type === "buy" || type === "sell" ? (
          <FormField label={t("portfolio.feePercent")} htmlFor={`${id}-f3`} className="space-y-1">
            <Input
              id={`${id}-f3`}
              type="number"
              step="any"
              min="0"
              value={feePercent}
              onChange={(e) => onFeePercentChange(e.target.value)}
            />
          </FormField>
        ) : (
          <div />
        )}
        <FormField label={t("common.date")} htmlFor={`${id}-f4`} className="space-y-1">
          <Input
            id={`${id}-f4`}
            type="datetime-local"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
          />
        </FormField>
        <FormField label={t("common.note") + " (" + t("common.optional") + ")"} htmlFor={`${id}-f5`} className="space-y-1">
          <Input
            id={`${id}-f5`}
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder={t("common.note") + "..."}
          />
        </FormField>
      </div>
      {quantity && price && (
        <div className="space-y-1 text-caption text-text-muted">
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
        <div className="text-caption text-text-muted">
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
        <div className="text-caption text-text-muted">
          {t("portfolio.transactionSettlementRemoved")}
        </div>
      ) : null}
      {error && (
        <div className="text-caption text-status-negative" role="alert" aria-live="assertive">
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
