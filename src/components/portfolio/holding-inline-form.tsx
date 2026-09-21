"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/hooks/use-translation";
import { formatUsd } from "@/lib/utils";
import {
  getTxTypeActionButtonClass,
  getTxTypeToggleClass,
} from "@/components/portfolio/tx-type-styles";
import type {
  BreakdownItem,
  PortfolioTxType,
} from "@/components/portfolio/types";

export interface HoldingInlineFormProps {
  item: BreakdownItem;
  txType: PortfolioTxType;
  quantity: string;
  price: string;
  date: string;
  note: string;
  error: string | null;
  submitting: boolean;
  onTxTypeChange: (type: PortfolioTxType) => void;
  onQuantityChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: (item: BreakdownItem) => void;
}

/**
 * Inline buy/sell/receive/send form shown under an expanded holding row.
 * Memoized so holdings-list re-renders don't recreate it needlessly.
 */
export const HoldingInlineForm = memo(function HoldingInlineForm({
  item,
  txType,
  quantity,
  price,
  date,
  note,
  error,
  submitting,
  onTxTypeChange,
  onQuantityChange,
  onPriceChange,
  onDateChange,
  onNoteChange,
  onCancel,
  onSubmit,
}: HoldingInlineFormProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["buy", "sell", "receive", "send"] as const).map((typ) => (
          <button
            key={typ}
            type="button"
            onClick={() => onTxTypeChange(typ)}
            className={`rounded-md px-2.5 py-0.5 text-caption font-semibold transition-colors ${getTxTypeToggleClass(
              typ,
              txType === typ
            )}`}
          >
            {typ.charAt(0).toUpperCase() + typ.slice(1)}
          </button>
        ))}
        <span className="text-body font-semibold text-text-muted">
          {item.symbol}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className="mb-1 block text-caption text-text-muted">
            {t("portfolio.quantity")} *
          </label>
          <Input
            type="number"
            step="any"
            min="0"
            placeholder="0.00"
            value={quantity}
            onChange={(e) => onQuantityChange(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-caption text-text-muted">
            {t("portfolio.pricePerUnit")}
          </label>
          <Input
            type="number"
            step="any"
            min="0"
            placeholder="0.00"
            value={price}
            onChange={(e) => onPriceChange(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-caption text-text-muted">
            {t("common.date")}
          </label>
          <Input
            type="datetime-local"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-caption text-text-muted">
            {t("common.note") + " (" + t("common.optional") + ")"}
          </label>
          <Input
            placeholder={t("common.note") + "..."}
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
          />
        </div>
      </div>
      {quantity && price && (
        <div className="text-caption text-text-muted">
          {t("common.total") + ":"}{" "}
          {formatUsd(parseFloat(quantity || "0") * parseFloat(price || "0"))}
        </div>
      )}
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
          onClick={() => onSubmit(item)}
          disabled={submitting}
          className={getTxTypeActionButtonClass(txType)}
        >
          {submitting
            ? t("common.saving")
            : `${txType.charAt(0).toUpperCase() + txType.slice(1)} ${item.symbol}`}
        </Button>
      </div>
    </div>
  );
});
