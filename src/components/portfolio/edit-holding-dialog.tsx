"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/hooks/use-translation";
import { toLocalDatetimeString } from "@/lib/utils";
import { BINANCE_SYMBOL_TO_COINGECKO_ID } from "@/lib/pricing/binance-symbol-resolver";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { BreakdownItem } from "@/components/portfolio/types";

interface EditHoldingDialogProps {
  open: boolean;
  item: BreakdownItem;
  onSave: (data: { coingeckoId: string; firstBuyDate: string | null }) => void;
  onCancel: () => void;
}

export function EditHoldingDialog({
  open,
  item,
  onSave,
  onCancel,
}: EditHoldingDialogProps) {
  const { t } = useTranslation();
  const suggestedId = BINANCE_SYMBOL_TO_COINGECKO_ID[item.symbol.trim().toUpperCase()] ?? null;
  const effectiveId = item.coingeckoId ?? suggestedId ?? "";
  const [coingeckoId, setCoingeckoId] = useState(effectiveId);
  const [firstBuyDate, setFirstBuyDate] = useState(
    item.firstBuyDate ? toLocalDatetimeString(new Date(item.firstBuyDate)) : ""
  );
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
    setShowAdvanced(false);
  }

  if (!open) return null;

  const handleSave = () => {
    onSave({
      coingeckoId: coingeckoId.trim(),
      firstBuyDate: firstBuyDate || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative mx-4 w-full max-w-md rounded-lg border border-border bg-bg-sidebar p-6 shadow-xl animate-fade-in-scale"
      >
        <h3 className="text-lg font-semibold text-text-primary">
          {t("portfolio.editHoldingTitle")}
        </h3>
        <p className="mt-1 text-sm text-text-subtle">
          {t("portfolio.editHoldingDesc", { symbol: item.symbol })}
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-subtle">
              {t("portfolio.editFirstBuyDate")}
            </label>
            <Input
              type="datetime-local"
              value={firstBuyDate}
              onChange={(e) => setFirstBuyDate(e.target.value)}
            />
            <p className="mt-1 text-xs text-text-dim">
              {t("portfolio.editFirstBuyDateHint")}
            </p>
          </div>

          <div>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-text-subtle hover:text-text-primary"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {t("portfolio.editCoingeckoId")}
              {coingeckoId && (
                <span className="ml-1 text-text-dim">({coingeckoId})</span>
              )}
            </button>
            {showAdvanced && (
              <div className="mt-2">
                <Input
                  value={coingeckoId}
                  onChange={(e) => setCoingeckoId(e.target.value)}
                  placeholder="e.g. bitcoin, ethereum"
                />
                <p className="mt-1 text-xs text-text-dim">
                  {t("portfolio.editCoingeckoIdHint")}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" onClick={handleSave}>
            {t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
