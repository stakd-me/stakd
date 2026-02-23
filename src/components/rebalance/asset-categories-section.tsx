"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tag } from "lucide-react";
import { formatUsd } from "@/lib/utils";
import { useTranslation } from "@/hooks/use-translation";
import { isKnownStablecoinSymbol } from "@/lib/constants/stablecoins";
import type { TokenCategory, CategoryBreakdown } from "./types";
import { VALID_CATEGORIES } from "./types";

interface AssetCategoriesSectionProps {
  categories: TokenCategory[];
  categoryBreakdown: CategoryBreakdown[];
  symbolOptions: string[];
  onSetCategory: (data: { tokenSymbol: string; category: string }) => void;
  setCategoryPending: boolean;
  onConfirmDelete: (tokenSymbol: string, label: string) => void;
  deletePending: boolean;
}

export function AssetCategoriesSection({
  categories,
  categoryBreakdown,
  symbolOptions,
  onSetCategory,
  setCategoryPending,
  onConfirmDelete,
  deletePending,
}: AssetCategoriesSectionProps) {
  const { t } = useTranslation();
  const [categorySymbol, setCategorySymbol] = useState("");
  const [categoryValue, setCategoryValue] = useState("");
  const [showSymbolSuggestions, setShowSymbolSuggestions] = useState(false);

  const maybeSuggestStablecoinCategory = (symbol: string) => {
    if (!isKnownStablecoinSymbol(symbol)) return;
    setCategoryValue((prev) => (prev ? prev : "stablecoin"));
  };

  const filteredSymbolOptions = useMemo(() => {
    const normalizedQuery = categorySymbol.trim().toUpperCase();
    const normalizedOptions = symbolOptions
      .map((symbol) => symbol.trim().toUpperCase())
      .filter((symbol, index, all) => symbol.length > 0 && all.indexOf(symbol) === index);

    if (!normalizedQuery) {
      return normalizedOptions.slice(0, 12);
    }

    const startsWith = normalizedOptions.filter((symbol) =>
      symbol.startsWith(normalizedQuery)
    );
    const includes = normalizedOptions.filter(
      (symbol) =>
        !symbol.startsWith(normalizedQuery) && symbol.includes(normalizedQuery)
    );
    return [...startsWith, ...includes].slice(0, 12);
  }, [categorySymbol, symbolOptions]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tag className="h-5 w-5" />
          {t("rebalance.assetCategories")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-end gap-3">
          <div className="relative">
            <label className="mb-1 block text-xs text-text-subtle">
              {t("rebalance.tokenSymbolLabel")}
            </label>
            <Input
              placeholder={t("rebalance.tokenSymbolCategoryPlaceholder")}
              value={categorySymbol}
              onChange={(e) => {
                const nextSymbol = e.target.value.toUpperCase();
                setCategorySymbol(nextSymbol);
                maybeSuggestStablecoinCategory(nextSymbol);
                setShowSymbolSuggestions(true);
              }}
              onFocus={() => setShowSymbolSuggestions(true)}
              onBlur={() => {
                window.setTimeout(() => setShowSymbolSuggestions(false), 120);
              }}
              className="w-36"
              autoComplete="off"
            />
            {showSymbolSuggestions && filteredSymbolOptions.length > 0 && (
              <div className="absolute left-0 top-full z-20 mt-1 max-h-56 w-36 overflow-y-auto rounded-md border border-border bg-bg-input shadow-lg">
                {filteredSymbolOptions.map((symbol) => (
                  <button
                    key={symbol}
                    type="button"
                    className="w-full px-3 py-2 text-left text-xs text-text-muted hover:bg-bg-hover"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setCategorySymbol(symbol);
                      maybeSuggestStablecoinCategory(symbol);
                      setShowSymbolSuggestions(false);
                    }}
                  >
                    {symbol}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-subtle">
              {t("rebalance.category")}
            </label>
            <Select
              value={categoryValue}
              onChange={(e) => setCategoryValue(e.target.value)}
              className="w-36"
            >
              <option value="">{t("rebalance.selectCategory")}</option>
              {VALID_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <Button
            size="sm"
            onClick={() => {
              if (categorySymbol && categoryValue) {
                onSetCategory({
                  tokenSymbol: categorySymbol,
                  category: categoryValue,
                });
                setCategorySymbol("");
                setCategoryValue("");
              }
            }}
            disabled={
              setCategoryPending || !categorySymbol || !categoryValue
            }
          >
            {setCategoryPending ? t("rebalance.setting") : t("rebalance.setCategory")}
          </Button>
        </div>

        {categoryBreakdown.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 text-sm font-semibold text-text-muted">
              {t("rebalance.categoryBreakdown")}
            </h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {categoryBreakdown.map((cb) => (
                <div
                  key={cb.category}
                  className="rounded-md bg-bg-card px-3 py-2 text-center"
                >
                  <p className="text-xs font-medium text-text-subtle">
                    {cb.category}
                  </p>
                  <p className="text-sm font-bold text-text-primary">
                    {cb.percent.toFixed(1)}%
                  </p>
                  <p className="text-xs text-text-dim">
                    {formatUsd(cb.valueUsd)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {categories.length > 0 && (
          <div className="space-y-1">
            <h4 className="mb-2 text-sm font-semibold text-text-muted">
              {t("rebalance.tokenAssignments")}
            </h4>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <span
                  key={cat.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-bg-muted px-2.5 py-1 text-xs font-medium text-text-tertiary"
                >
                  {cat.tokenSymbol}: {cat.category}
                  <button
                    type="button"
                    className="text-text-subtle hover:text-status-negative"
                    onClick={() =>
                      onConfirmDelete(
                        cat.tokenSymbol,
                        `category for ${cat.tokenSymbol}`
                      )
                    }
                    disabled={deletePending}
                    aria-label={`Remove category for ${cat.tokenSymbol}`}
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {categories.length === 0 && categoryBreakdown.length === 0 && (
          <p className="text-sm text-text-subtle">
            {t("rebalance.noCategories")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
