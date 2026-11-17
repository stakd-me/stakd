"use client";

import { memo, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/hooks/use-translation";
import { formatUsd } from "@/lib/utils";
import { FormField } from "@/components/ui/form-field";
import { TxTypePicker } from "@/components/portfolio/tx-type-picker";
import { TX_TYPE_LABEL_KEYS } from "@/components/portfolio/tx-type-styles";
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
  const id = useId();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <TxTypePicker
          value={txType}
          onChange={onTxTypeChange}
          label={t("portfolioAdd.stepType")}
        />
        <span className="text-body font-semibold text-text-muted">
          {item.symbol}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FormField label={<>{t("portfolio.quantity")} *</>} htmlFor={`${id}-f1`} className="space-y-1">
          <Input
            id={`${id}-f1`}
            type="number"
            step="any"
            min="0"
            placeholder="0.00"
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
            placeholder="0.00"
            value={price}
            onChange={(e) => onPriceChange(e.target.value)}
          />
        </FormField>
        <FormField label={t("common.date")} htmlFor={`${id}-f3`} className="space-y-1">
          <Input
            id={`${id}-f3`}
            type="datetime-local"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
          />
        </FormField>
        <FormField label={t("common.note") + " (" + t("common.optional") + ")"} htmlFor={`${id}-f4`} className="space-y-1">
          <Input
            id={`${id}-f4`}
            placeholder={t("common.note") + "..."}
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
          />
        </FormField>
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
          variant="accent"
          onClick={() => onSubmit(item)}
          disabled={submitting}
        >
          {submitting
            ? t("common.saving")
            : `${t(TX_TYPE_LABEL_KEYS[txType])} ${item.symbol}`}
        </Button>
      </div>
    </div>
  );
});
