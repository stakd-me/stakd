"use client";

import { useState, useRef, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Trash2,
  Save,
  ChevronDown,
  ChevronUp,
  Wand2,
  LayoutTemplate,
  Layers,
  ArrowUpDown,
} from "lucide-react";
import { formatUsd } from "@/lib/utils";
import { useTranslation } from "@/hooks/use-translation";
import { useClickOutside } from "@/hooks/use-click-outside";
import type {
  TargetRow,
  AutocompleteSuggestion,
  SuggestionsData,
  TokenGroup,
} from "./types";
import { TEMPLATES } from "./types";

interface TargetAllocationSectionProps {
  targets: TargetRow[];
  setTargets: (targets: TargetRow[]) => void;
  totalPercent: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  stablecoinQuickAdd: { symbol: string; percent: number } | null;
  onAddStablecoinTarget: () => void;
  suggestionsData: SuggestionsData | undefined;
  groups: TokenGroup[];
  autocompleteData: { suggestions: AutocompleteSuggestion[] } | undefined;
  activeAutocompleteIndex: number | null;
  setActiveAutocompleteIndex: (idx: number | null) => void;
  autocompleteQuery: string;
  setAutocompleteQuery: (q: string) => void;
  onSave: () => void;
  savePending: boolean;
  saveError: boolean;
  saveErrorMessage: string | undefined;
  onAutoGenerate: (mode: "equal" | "market-cap") => void;
}

type DeviationSortMode = "absolute" | "signed";

export function TargetAllocationSection({
  targets,
  setTargets,
  totalPercent,
  expanded,
  onToggleExpanded,
  stablecoinQuickAdd,
  onAddStablecoinTarget,
  suggestionsData,
  groups,
  autocompleteData,
  activeAutocompleteIndex,
  setActiveAutocompleteIndex,
  autocompleteQuery,
  setAutocompleteQuery,
  onSave,
  savePending,
  saveError,
  saveErrorMessage,
  onAutoGenerate,
}: TargetAllocationSectionProps) {
  const { t } = useTranslation();
  const [showAutoGenMenu, setShowAutoGenMenu] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortMode, setSortMode] = useState<DeviationSortMode>("absolute");
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const autoGenRef = useRef<HTMLDivElement>(null);
  const templateRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  useClickOutside(
    autocompleteRef,
    useCallback(() => setActiveAutocompleteIndex(null), [setActiveAutocompleteIndex])
  );
  useClickOutside(
    autoGenRef,
    useCallback(() => setShowAutoGenMenu(false), [])
  );
  useClickOutside(
    templateRef,
    useCallback(() => setShowTemplateMenu(false), [])
  );
  useClickOutside(
    sortRef,
    useCallback(() => setShowSortMenu(false), [])
  );

  const addRow = () => {
    setTargets([
      ...targets,
      { tokenSymbol: "", targetPercent: 0, coingeckoId: "" },
    ]);
  };

  const removeRow = (index: number) => {
    setTargets(targets.filter((_, i) => i !== index));
  };

  const updateRow = (
    index: number,
    field: keyof TargetRow,
    value: string | number
  ) => {
    const updated = [...targets];
    if (field === "targetPercent") {
      updated[index] = { ...updated[index], [field]: Number(value) || 0 };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setTargets(updated);

    if (field === "tokenSymbol") {
      setActiveAutocompleteIndex(index);
      setAutocompleteQuery(String(value));
    }
  };

  const selectAutocomplete = useCallback(
    (index: number, suggestion: AutocompleteSuggestion) => {
      const updated = [...targets];
      updated[index] = {
        ...updated[index],
        tokenSymbol: suggestion.symbol,
        coingeckoId: suggestion.isGroup ? "" : suggestion.coingeckoId || "",
      };
      setTargets(updated);
      setActiveAutocompleteIndex(null);
      setAutocompleteQuery("");
    },
    [targets, setTargets, setActiveAutocompleteIndex, setAutocompleteQuery]
  );

  const handleAutoGenerate = (mode: "equal" | "market-cap") => {
    setShowAutoGenMenu(false);
    onAutoGenerate(mode);
  };

  const handleApplyTemplate = (template: (typeof TEMPLATES)[number]) => {
    setShowTemplateMenu(false);
    if (template.allocations === "auto-equal") {
      onAutoGenerate("equal");
      return;
    }
    setTargets(
      template.allocations.map((a) => ({
        tokenSymbol: a.symbol,
        targetPercent: a.percent,
        coingeckoId: "",
      }))
    );
  };

  const sortTargetsByDeviation = (mode: DeviationSortMode) => {
    const currentPercentMap: Record<string, number> = {};
    for (const suggestion of suggestionsData?.targets ?? []) {
      currentPercentMap[suggestion.tokenSymbol.toUpperCase()] = suggestion.currentPercent;
    }

    const sorted = targets
      .map((row, idx) => {
        const currentPercent = currentPercentMap[row.tokenSymbol.trim().toUpperCase()];
        const diff = Number.isFinite(currentPercent)
          ? (currentPercent as number) - row.targetPercent
          : null;
        return { row, idx, diff };
      })
      .sort((a, b) => {
        if (a.diff === null && b.diff !== null) return 1;
        if (a.diff !== null && b.diff === null) return -1;
        if (a.diff === null && b.diff === null) return a.idx - b.idx;

        const diffA = a.diff as number;
        const diffB = b.diff as number;
        const scoreA = mode === "absolute" ? Math.abs(diffA) : diffA;
        const scoreB = mode === "absolute" ? Math.abs(diffB) : diffB;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return a.idx - b.idx;
      })
      .map((item) => item.row);

    setSortMode(mode);
    setShowSortMenu(false);
    setTargets(sorted);
  };

  const hasValidTargets = targets.some(
    (target) => target.tokenSymbol.trim().length > 0 && target.targetPercent > 0
  );
  const canSaveTargets = !savePending && totalPercent <= 100 && hasValidTargets;
  const clampedTotalPercent = Math.min(Math.max(totalPercent, 0), 100);
  const totalStatusClass =
    totalPercent > 100
      ? "text-status-negative"
      : totalPercent === 100
        ? "text-status-positive"
        : totalPercent > 0
          ? "text-status-warning"
          : "text-text-subtle";
  const progressBarClass =
    totalPercent > 100
      ? "bg-status-negative"
      : totalPercent === 100
        ? "bg-status-positive"
        : totalPercent > 0
          ? "bg-status-warning"
          : "bg-text-dim";

  const getDeviationClass = (diff: number | null): string => {
    if (diff === null) return "text-text-dim";
    if (Math.abs(diff) <= 1) return "text-status-positive";
    if (Math.abs(diff) <= 5) return "text-status-warning";
    return "text-status-negative";
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={onToggleExpanded}
            aria-expanded={expanded}
          >
            <CardTitle>{t("rebalance.targetAllocation")}</CardTitle>
            {!expanded && targets.length > 0 && (
              <span className="rounded-full bg-bg-muted px-2 py-0.5 text-xs text-text-subtle">
                {targets.length}
              </span>
            )}
            <span className="ml-auto">
              {expanded ? (
                <ChevronUp className="h-5 w-5 text-text-subtle" />
              ) : (
                <ChevronDown className="h-5 w-5 text-text-subtle" />
              )}
            </span>
          </button>
          <span
            className={`whitespace-nowrap text-sm font-medium ${totalStatusClass}`}
          >
            {t("rebalance.total", { percent: totalPercent.toFixed(1) })}
            {totalPercent > 100 && ` — ${t("rebalance.exceeds100")}`}
            {totalPercent > 0 &&
              totalPercent < 100 &&
              ` — ${t("rebalance.unallocated", { percent: (100 - totalPercent).toFixed(1) })}`}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-muted">
          <div
            className={`h-full transition-all ${progressBarClass}`}
            style={{ width: `${clampedTotalPercent}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="mr-2 h-4 w-4" />
            {t("rebalance.addToken")}
          </Button>
          {stablecoinQuickAdd && (
            <Button variant="outline" size="sm" onClick={onAddStablecoinTarget}>
              <Plus className="mr-2 h-4 w-4" />
              {t("rebalance.addStablecoinTarget", {
                symbol: stablecoinQuickAdd.symbol,
                percent: stablecoinQuickAdd.percent.toFixed(1),
              })}
            </Button>
          )}
          <div className="relative" ref={autoGenRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAutoGenMenu(!showAutoGenMenu)}
              aria-haspopup="true"
              aria-expanded={showAutoGenMenu}
            >
              <Wand2 className="mr-2 h-4 w-4" />
              {t("rebalance.autoGenerate")}
            </Button>
            {showAutoGenMenu && (
              <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-md border border-border bg-bg-input shadow-lg">
                <button
                  type="button"
                  className="w-full px-4 py-2 text-left text-sm text-text-tertiary hover:bg-bg-hover"
                  onClick={() => handleAutoGenerate("equal")}
                >
                  {t("rebalance.equalWeight")}
                </button>
                <button
                  type="button"
                  className="w-full px-4 py-2 text-left text-sm text-text-tertiary hover:bg-bg-hover"
                  onClick={() => handleAutoGenerate("market-cap")}
                >
                  {t("rebalance.currentAllocation")}
                </button>
              </div>
            )}
          </div>
          <div className="relative" ref={templateRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTemplateMenu(!showTemplateMenu)}
              aria-haspopup="true"
              aria-expanded={showTemplateMenu}
            >
              <LayoutTemplate className="mr-2 h-4 w-4" />
              {t("rebalance.templates")}
            </Button>
            {showTemplateMenu && (
              <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-md border border-border bg-bg-input shadow-lg">
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.name}
                    type="button"
                    className="w-full px-4 py-2 text-left text-sm text-text-tertiary hover:bg-bg-hover"
                    onClick={() => handleApplyTemplate(tpl)}
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAdvancedFields((prev) => !prev)}
          >
            {showAdvancedFields
              ? t("rebalance.hideAdvanced")
              : t("rebalance.showAdvanced")}
          </Button>
          <div className="relative" ref={sortRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSortMenu(!showSortMenu)}
              disabled={targets.length < 2}
              aria-haspopup="true"
              aria-expanded={showSortMenu}
            >
              <ArrowUpDown className="mr-2 h-4 w-4" />
              {t("rebalance.sortByDeviation")}
              <span className="ml-1 text-xs text-text-dim">
                {sortMode === "absolute"
                  ? t("rebalance.sortDeviationAbsoluteShort")
                  : t("rebalance.sortDeviationSignedShort")}
              </span>
            </Button>
            {showSortMenu && (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-52 rounded-md border border-border bg-bg-input shadow-lg">
                <button
                  type="button"
                  className="w-full px-4 py-2 text-left text-sm text-text-tertiary hover:bg-bg-hover"
                  onClick={() => sortTargetsByDeviation("absolute")}
                >
                  {t("rebalance.sortDeviationAbsolute")}
                </button>
                <button
                  type="button"
                  className="w-full px-4 py-2 text-left text-sm text-text-tertiary hover:bg-bg-hover"
                  onClick={() => sortTargetsByDeviation("signed")}
                >
                  {t("rebalance.sortDeviationSigned")}
                </button>
              </div>
            )}
          </div>
          <Button size="sm" onClick={onSave} disabled={!canSaveTargets}>
            <Save className="mr-2 h-4 w-4" />
            {savePending ? t("common.saving") : t("rebalance.saveTargets")}
          </Button>
        </div>
      </CardHeader>
      {!expanded && (
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-bg-card px-3 py-2">
            <p className="text-sm text-text-subtle">
              {targets.length} {t("rebalance.token")} • {t("rebalance.total", { percent: totalPercent.toFixed(1) })}
              {totalPercent > 100 && ` • ${t("rebalance.exceeds100")}`}
              {totalPercent > 0 &&
                totalPercent < 100 &&
                ` • ${t("rebalance.unallocated", { percent: (100 - totalPercent).toFixed(1) })}`}
            </p>
            <Button size="sm" onClick={onToggleExpanded}>
              {t("common.edit")} {t("rebalance.targetAllocation")}
            </Button>
          </div>
        </CardContent>
      )}
      {expanded && (
        <CardContent>
          <div className="space-y-3" ref={autocompleteRef}>
            {showAdvancedFields && (
              <p className="text-xs text-text-dim">
                {t("rebalance.advancedFieldsHint")}
              </p>
            )}
            {targets.length > 0 && (
              <div className="hidden items-center gap-3 text-xs text-text-dim md:flex">
                <span className="w-44">{t("rebalance.tokenHeader")}</span>
                <span className="w-24">{t("rebalance.targetPercent")}</span>
                <span className="w-20 text-right">{t("rebalance.current")}</span>
                <span className="w-24 text-right">{t("rebalance.deviation")}</span>
                <span className="w-9"></span>
              </div>
            )}
            {targets.map((row, index) => {
              const match = (suggestionsData?.targets ?? []).find(
                (s) =>
                  s.tokenSymbol.toUpperCase() === row.tokenSymbol.toUpperCase()
              );
              const currentPercent =
                match && row.tokenSymbol.trim().length > 0
                  ? match.currentPercent
                  : null;
              const diff =
                currentPercent === null
                  ? null
                  : currentPercent - row.targetPercent;

              return (
                <div
                  key={index}
                  className="relative rounded-md border border-border-subtle p-3"
                >
                  <div className="flex flex-wrap items-start gap-2 md:flex-nowrap md:items-center md:gap-3">
                    <div className="relative w-full md:w-44">
                      <Input
                        placeholder={t("rebalance.tokenPlaceholder")}
                        value={row.tokenSymbol}
                        onChange={(e) =>
                          updateRow(index, "tokenSymbol", e.target.value)
                        }
                        onFocus={() => {
                          setActiveAutocompleteIndex(index);
                          setAutocompleteQuery(row.tokenSymbol);
                        }}
                        className="w-full"
                        autoComplete="off"
                      />
                      {activeAutocompleteIndex === index &&
                        autocompleteQuery.length > 0 &&
                        (autocompleteData?.suggestions ?? []).length > 0 && (
                          <div className="absolute left-0 top-full z-50 mt-1 max-h-48 min-w-[18rem] w-full overflow-y-auto rounded-md border border-border bg-bg-input shadow-lg">
                            {autocompleteData!.suggestions.map((s) => (
                              <button
                                key={s.symbol}
                                type="button"
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-bg-hover"
                                onClick={() => selectAutocomplete(index, s)}
                              >
                                <div className="flex items-center">
                                  {s.isGroup && (
                                    <Layers className="mr-1.5 h-3.5 w-3.5 text-status-info" />
                                  )}
                                  <span className="font-medium text-text-primary">
                                    {s.symbol}
                                  </span>
                                  <span className="ml-2 text-text-subtle">
                                    {s.name}
                                  </span>
                                </div>
                                <span className="text-xs text-text-dim">
                                  {formatUsd(s.totalValueUsd)}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                    </div>

                    <Input
                      type="number"
                      placeholder={t("rebalance.targetPlaceholder")}
                      min={0}
                      max={100}
                      step={0.1}
                      value={row.targetPercent || ""}
                      onChange={(e) =>
                        updateRow(index, "targetPercent", e.target.value)
                      }
                      className="w-[calc(50%-0.25rem)] md:w-24"
                    />

                    <span
                      className="w-[calc(25%-0.25rem)] text-right text-xs tabular-nums text-text-muted md:w-20 md:text-sm"
                      title={
                        currentPercent === null
                          ? t("common.noData")
                          : `${t("rebalance.current")}: ${currentPercent.toFixed(1)}%`
                      }
                    >
                      {currentPercent === null ? "—" : `${currentPercent.toFixed(1)}%`}
                    </span>
                    <span
                      className={`w-[calc(25%-0.25rem)] text-right text-xs tabular-nums md:w-24 md:text-sm ${getDeviationClass(diff)}`}
                      title={
                        diff === null
                          ? t("common.noData")
                          : `${t("rebalance.deviation")}: ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`
                      }
                    >
                      {diff === null ? "—" : `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`}
                    </span>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(index)}
                      className="h-8 w-8 text-text-subtle hover:text-status-negative"
                      aria-label={`Remove ${row.tokenSymbol || "token"} target`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {groups.some(
                    (g) =>
                      g.name.toUpperCase() === row.tokenSymbol.toUpperCase()
                  ) && (
                    <div className="mt-2">
                      <span className="inline-flex items-center gap-1 rounded bg-status-info-soft px-1.5 py-0.5 text-xs text-status-info">
                        <Layers className="h-3 w-3" />
                        {t("rebalance.group")}
                      </span>
                    </div>
                  )}

                  {showAdvancedFields && (
                    <div className="mt-3 border-t border-border-subtle pt-3">
                      <label className="mb-1 block text-xs text-text-subtle">
                        {t("rebalance.coingeckoIdLabel")}
                      </label>
                      <Input
                        placeholder={t("rebalance.coingeckoPlaceholder")}
                        value={row.coingeckoId}
                        onChange={(e) =>
                          updateRow(index, "coingeckoId", e.target.value)
                        }
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {!hasValidTargets && (
              <p className="text-xs text-text-dim">
                {t("rebalance.noValidTargets")}
              </p>
            )}

            {saveError && (
              <p className="text-sm text-status-negative">
                {saveErrorMessage || t("rebalance.failedSave")}
              </p>
            )}

            <div className="sticky bottom-0 z-10 -mx-6 border-t border-border-subtle bg-bg-card/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-bg-card/80">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={`text-sm font-medium ${totalStatusClass}`}>
                  {t("rebalance.total", { percent: totalPercent.toFixed(1) })}
                  {totalPercent > 100 && ` — ${t("rebalance.exceeds100")}`}
                  {totalPercent > 0 &&
                    totalPercent < 100 &&
                    ` — ${t("rebalance.unallocated", { percent: (100 - totalPercent).toFixed(1) })}`}
                </p>
                <Button size="sm" onClick={onSave} disabled={!canSaveTargets}>
                  <Save className="mr-2 h-4 w-4" />
                  {savePending ? t("common.saving") : t("rebalance.saveTargets")}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
