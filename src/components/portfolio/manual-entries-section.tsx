"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineHelpCard } from "@/components/ui/inline-help";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/hooks/use-translation";
import { formatCrypto } from "@/lib/utils";
import { ChevronDown, ChevronUp, Package, Pencil, Plus, Trash2 } from "lucide-react";
import type { ManualEntry, PortfolioCoinListItem } from "@/components/portfolio/types";
import { cn } from "@/lib/utils";

interface ManualEntriesSectionProps {
  isAllSectionsView: boolean;
  manualSectionExpanded: boolean;
  manualEntriesCount: number;
  manualEntries: ManualEntry[];
  filteredManualEntries: ManualEntry[];
  search: string;
  meSymbol: string;
  meName: string;
  meCoingeckoId: string;
  meQuantity: string;
  meInitialPrice: string;
  meNote: string;
  showManualSymbolSuggestions: boolean;
  manualSymbolSuggestions: PortfolioCoinListItem[];
  manualEntryQuantityValid: boolean;
  manualEntryInitialPriceValid: boolean;
  addingManualEntry: boolean;
  editingEntryId: string | null;
  editEntryQty: string;
  editEntryNote: string;
  updatingManualEntry: boolean;
  deletingManualEntry: boolean;
  onToggleExpanded: () => void;
  onSetMeSymbol: (value: string) => void;
  onSetShowManualSymbolSuggestions: (value: boolean) => void;
  onSelectManualSymbolSuggestion: (coin: PortfolioCoinListItem) => void;
  onSetMeName: (value: string) => void;
  onSetMeCoingeckoId: (value: string) => void;
  onSetMeQuantity: (value: string) => void;
  onSetMeInitialPrice: (value: string) => void;
  onSetMeNote: (value: string) => void;
  onAddEntry: () => void;
  onStartEditEntry: (entry: ManualEntry) => void;
  onSetEditEntryQty: (value: string) => void;
  onSetEditEntryNote: (value: string) => void;
  onSaveEditEntry: (entry: ManualEntry) => void;
  onCancelEditEntry: () => void;
  onDeleteEntry: (entry: ManualEntry) => void;
}

export function ManualEntriesSection({
  isAllSectionsView,
  manualSectionExpanded,
  manualEntriesCount,
  manualEntries,
  filteredManualEntries,
  search,
  meSymbol,
  meName,
  meCoingeckoId,
  meQuantity,
  meInitialPrice,
  meNote,
  showManualSymbolSuggestions,
  manualSymbolSuggestions,
  manualEntryQuantityValid,
  manualEntryInitialPriceValid,
  addingManualEntry,
  editingEntryId,
  editEntryQty,
  editEntryNote,
  updatingManualEntry,
  deletingManualEntry,
  onToggleExpanded,
  onSetMeSymbol,
  onSetShowManualSymbolSuggestions,
  onSelectManualSymbolSuggestion,
  onSetMeName,
  onSetMeCoingeckoId,
  onSetMeQuantity,
  onSetMeInitialPrice,
  onSetMeNote,
  onAddEntry,
  onStartEditEntry,
  onSetEditEntryQty,
  onSetEditEntryNote,
  onSaveEditEntry,
  onCancelEditEntry,
  onDeleteEntry,
}: ManualEntriesSectionProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <button
            type="button"
            className={cn(
              "flex items-center gap-2",
              !isAllSectionsView && "cursor-default"
            )}
            onClick={() => {
              if (isAllSectionsView) {
                onToggleExpanded();
              }
            }}
          >
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {t("portfolio.quickAddHoldings")}
            </CardTitle>
            {isAllSectionsView ? (
              manualSectionExpanded ? (
                <ChevronUp className="h-5 w-5 text-text-subtle" />
              ) : (
                <ChevronDown className="h-5 w-5 text-text-subtle" />
              )
            ) : null}
          </button>
          {!manualSectionExpanded && manualEntriesCount > 0 ? (
            <span className="text-xs text-text-dim">
              {t("portfolio.manualEntries", { count: manualEntriesCount })}
            </span>
          ) : null}
        </div>
      </CardHeader>

      {manualSectionExpanded ? (
        <CardContent>
          <div className="mb-4 space-y-4">
            <InlineHelpCard
              title={t("portfolio.quickAddHelpTitle")}
              description={t("portfolio.quickAddHelpDesc")}
              items={[
                t("portfolio.quickAddHelpPointBalances"),
                t("portfolio.quickAddHelpPointHistory"),
              ]}
            />
            <p className="text-sm text-text-subtle">{t("portfolio.enterHoldings")}</p>
          </div>

          <div className="mb-4 space-y-3 rounded-lg border border-border bg-bg-card p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <div className="relative">
                <label className="mb-1 block text-xs text-text-subtle">
                  {t("portfolio.symbol")}
                </label>
                <Input
                  placeholder={t("portfolioAdd.tokenSymbolPlaceholder")}
                  value={meSymbol}
                  onChange={(event) => {
                    onSetMeSymbol(event.target.value.toUpperCase());
                    onSetShowManualSymbolSuggestions(true);
                  }}
                  onFocus={() => onSetShowManualSymbolSuggestions(true)}
                  onBlur={() => {
                    window.setTimeout(() => onSetShowManualSymbolSuggestions(false), 120);
                  }}
                  autoComplete="off"
                />
                {showManualSymbolSuggestions && manualSymbolSuggestions.length > 0 ? (
                  <div className="absolute left-0 top-full z-20 mt-1 max-h-52 w-72 overflow-y-auto rounded-md border border-border bg-bg-input shadow-lg">
                    {manualSymbolSuggestions.map((coin) => (
                      <button
                        key={coin.id}
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-bg-hover"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => onSelectManualSymbolSuggestion(coin)}
                      >
                        <div className="flex min-w-0 items-center">
                          <span className="font-semibold text-text-primary">
                            {coin.symbol.toUpperCase()}
                          </span>
                          <span className="ml-2 truncate text-text-subtle">
                            {coin.name}
                          </span>
                        </div>
                        {coin.binance ? (
                          <span className="ml-2 shrink-0 rounded bg-status-info-soft px-1.5 py-0.5 text-[10px] text-status-info">
                            Binance
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-subtle">
                  {t("portfolio.name")}
                </label>
                <Input
                  placeholder={t("portfolioAdd.tokenNamePlaceholder")}
                  value={meName}
                  onChange={(event) => onSetMeName(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-subtle">
                  {t("portfolio.coingeckoId")}
                </label>
                <Input
                  placeholder={t("portfolioAdd.coingeckoIdPlaceholder")}
                  value={meCoingeckoId}
                  onChange={(event) => onSetMeCoingeckoId(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-subtle">
                  {t("portfolio.quantity")}
                </label>
                <Input
                  type="number"
                  placeholder="0.5"
                  min={0}
                  step="any"
                  value={meQuantity}
                  onChange={(event) => onSetMeQuantity(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-subtle">
                  {t("portfolio.manualInitialPrice")}
                </label>
                <Input
                  type="number"
                  placeholder={t("portfolio.manualInitialPricePlaceholder")}
                  min={0}
                  step="any"
                  value={meInitialPrice}
                  onChange={(event) => onSetMeInitialPrice(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-subtle">
                  {t("common.note")}
                </label>
                <Input
                  placeholder={t("common.optional")}
                  value={meNote}
                  onChange={(event) => onSetMeNote(event.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-text-dim">
              {t("portfolio.manualInitialPriceHint")}
            </p>
            <Button
              size="sm"
              onClick={onAddEntry}
              disabled={
                addingManualEntry ||
                !meSymbol.trim() ||
                !meName.trim() ||
                !manualEntryQuantityValid ||
                !manualEntryInitialPriceValid
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              {addingManualEntry ? t("portfolio.adding") : t("portfolio.addManualEntry")}
            </Button>
          </div>

          {manualEntries.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-text-muted">
                {t("portfolio.currentManualEntries")}
              </h4>
              {filteredManualEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-md bg-bg-card px-4 py-2.5"
                >
                  {editingEntryId === entry.id ? (
                    <div className="flex flex-1 items-center gap-3">
                      <span className="w-16 font-medium text-text-primary">
                        {entry.tokenSymbol}
                      </span>
                      <Input
                        type="number"
                        value={editEntryQty}
                        onChange={(event) => onSetEditEntryQty(event.target.value)}
                        className="w-32"
                        min={0}
                        step="any"
                      />
                      <Input
                        value={editEntryNote}
                        onChange={(event) => onSetEditEntryNote(event.target.value)}
                        placeholder={t("common.note")}
                        className="w-40"
                      />
                      <Button
                        size="sm"
                        onClick={() => onSaveEditEntry(entry)}
                        disabled={
                          updatingManualEntry ||
                          !Number.isFinite(Number.parseFloat(editEntryQty)) ||
                          Number.parseFloat(editEntryQty) <= 0
                        }
                      >
                        {t("common.save")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={onCancelEditEntry}>
                        {t("common.cancel")}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-4">
                        <span className="font-medium text-text-primary">
                          {entry.tokenSymbol}
                        </span>
                        <span className="text-sm text-text-muted">{entry.tokenName}</span>
                        <span className="font-mono text-sm text-text-tertiary">
                          {formatCrypto(entry.quantity)}
                        </span>
                        {entry.coingeckoId ? (
                          <span className="text-xs text-text-dim">
                            {entry.coingeckoId}
                          </span>
                        ) : null}
                        {entry.note ? (
                          <span className="text-xs italic text-text-dim">
                            {entry.note}
                          </span>
                        ) : null}
                        <span className="inline-flex rounded-full bg-status-info-soft px-2 py-0.5 text-xs text-status-info">
                          {t("portfolio.manual")}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-text-subtle hover:text-text-primary"
                          onClick={() => onStartEditEntry(entry)}
                          aria-label={`${t("common.edit")} ${entry.tokenSymbol}`}
                          title={`${t("common.edit")} ${entry.tokenSymbol}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-text-subtle hover:text-status-negative"
                          onClick={() => onDeleteEntry(entry)}
                          disabled={deletingManualEntry}
                          aria-label={`${t("common.delete")} ${entry.tokenSymbol}`}
                          title={`${t("common.delete")} ${entry.tokenSymbol}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}

              {search.trim() && filteredManualEntries.length === 0 ? (
                <p className="text-sm text-text-subtle">{t("portfolio.noMatch")}</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
