"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { useTranslation } from "@/hooks/use-translation";
import { toLocalDatetimeString } from "@/lib/utils";
import { BINANCE_SYMBOL_TO_COINGECKO_ID } from "@/lib/pricing/binance-symbol-resolver";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { BreakdownItem } from "@/components/portfolio/types";

interface EditHoldingDialogProps {
  open: boolean;
  item: BreakdownItem;
  onSave: (data: {
    coingeckoId: string;
    firstBuyDate: string | null;
    avgCostUsd: number | null;
  }) => void;
  onCancel: () => void;
}

function getAvgCostOverrideInput(item: BreakdownItem): string {
  return item.avgCostOverride !== null ? item.avgCostOverride.toString() : "";
}

export function EditHoldingDialog({
  open,
  item,
  onSave,
  onCancel,
}: EditHoldingDialogProps) {
  const { t } = useTranslation();
  const fieldId = useId();
  const suggestedId = BINANCE_SYMBOL_TO_COINGECKO_ID[item.symbol.trim().toUpperCase()] ?? null;
  const effectiveId = item.coingeckoId ?? suggestedId ?? "";
  const [coingeckoId, setCoingeckoId] = useState(effectiveId);
  const [firstBuyDate, setFirstBuyDate] = useState(
    item.firstBuyDate ? toLocalDatetimeString(new Date(item.firstBuyDate)) : ""
  );
  const [avgCost, setAvgCost] = useState(getAvgCostOverrideInput(item));
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Reset state when item changes
  const [prevKey, setPrevKey] = useState(item.holdingKey);
  if (prevKey !== item.holdingKey) {
    setPrevKey(item.holdingKey);
    const newSuggested = BINANCE_SYMBOL_TO_COINGECKO_ID[item.symbol.trim().toUpperCase()] ?? null;
    setCoingeckoId(item.coingeckoId ?? newSuggested ?? "");
    setFirstBuyDate(
      item.firstBuyDate ? toLocalDatetimeString(new Date(item.firstBuyDate)) : ""
    );
    setAvgCost(getAvgCostOverrideInput(item));
    setError(null);
    setShowAdvanced(false);
  }

  if (!open) return null;

  const handleSave = () => {
    const normalizedAvgCost = avgCost.trim();
    let avgCostUsd: number | null = null;

    if (normalizedAvgCost.length > 0) {
      const parsedAvgCost = Number.parseFloat(normalizedAvgCost);
      if (!Number.isFinite(parsedAvgCost) || parsedAvgCost < 0) {
        setError(t("portfolio.validationPriceNonNegative"));
        return;
      }
      avgCostUsd = parsedAvgCost;
    }

    onSave({
      coingeckoId: coingeckoId.trim(),
      firstBuyDate: firstBuyDate || null,
      avgCostUsd,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={t("portfolio.editHoldingTitle")}
      description={t("portfolio.editHoldingDesc", { symbol: item.symbol })}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" onClick={handleSave}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField
          label={t("portfolio.editFirstBuyDate")}
          htmlFor={`${fieldId}-date`}
          hint={t("portfolio.editFirstBuyDateHint")}
          className="space-y-1"
        >
          <Input
            id={`${fieldId}-date`}
            type="datetime-local"
            value={firstBuyDate}
            onChange={(e) => setFirstBuyDate(e.target.value)}
          />
        </FormField>

        <FormField
          label={t("portfolio.editAvgCost")}
          htmlFor={`${fieldId}-avg`}
          hint={t("portfolio.editAvgCostHint")}
          className="space-y-1"
        >
          <Input
            id={`${fieldId}-avg`}
            type="number"
            min="0"
            step="any"
            value={avgCost}
            onChange={(event) => {
              setAvgCost(event.target.value);
              setError(null);
            }}
            placeholder={item.avgCost > 0 ? item.avgCost.toString() : "0.00"}
          />
        </FormField>

        <div>
          <button
            type="button"
            aria-expanded={showAdvanced}
            aria-controls={`${fieldId}-advanced`}
            className="flex items-center gap-1 text-caption text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? (
              <ChevronUp className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            )}
            {t("portfolio.editCoingeckoId")}
            {coingeckoId && <span className="ml-1 text-text-muted">({coingeckoId})</span>}
          </button>
          {showAdvanced && (
            <div id={`${fieldId}-advanced`} className="mt-2">
              <FormField
                label={t("portfolio.editCoingeckoId")}
                htmlFor={`${fieldId}-cg`}
                hint={t("portfolio.editCoingeckoIdHint")}
                className="space-y-1"
              >
                <Input
                  id={`${fieldId}-cg`}
                  value={coingeckoId}
                  onChange={(e) => setCoingeckoId(e.target.value)}
                  placeholder="bitcoin, ethereum"
                />
              </FormField>
            </div>
          )}
        </div>

        {error ? (
          <p className="text-caption text-status-negative" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
