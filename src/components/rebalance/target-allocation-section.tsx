"use client";

import { useState, useRef, useCallback, useId } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MenuButton } from "@/components/ui/menu-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { cn, formatUsd } from "@/lib/utils";
import { useTranslation } from "@/hooks/use-translation";
import { useClickOutside } from "@/hooks/use-click-outside";
import type {
  TargetRow,
  AutocompleteSuggestion,
  SuggestionsData,
  TokenGroup,
} from "./types";
import { TEMPLATES } from "./types";
import { usePrivacy } from "@/hooks/use-privacy";

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

let rowKeySeed = 0;
/** A React key for a target row; only ever compared, never stored. */
function newRowKey(): number {
  rowKeySeed += 1;
  return rowKeySeed;
}

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
  const { mask } = usePrivacy();
  const { t } = useTranslation();
  const [sortMode, setSortMode] = useState<DeviationSortMode>("absolute");
  const [pendingReplace, setPendingReplace] = useState<(() => void) | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const listboxBaseId = useId();

  // Rows have no id of their own, and keying by index made a removed row's
  // input (focus, open suggestions) jump to its neighbour. Keep a parallel
  // list of keys that follows adds, removes and sorts.
  const [rowKeys, setRowKeys] = useState<number[]>(() => targets.map(newRowKey));
  if (rowKeys.length !== targets.length) {
    // Replaced from outside (template, auto-generate, load): new identities.
    setRowKeys(targets.map(newRowKey));
  }

  useClickOutside(
    autocompleteRef,
    useCallback(() => setActiveAutocompleteIndex(null), [setActiveAutocompleteIndex])
  );

  /** Run a whole-list replacement, asking first if it would discard targets. */
  const confirmReplace = (apply: () => void) => {
    if (targets.some((row) => row.tokenSymbol.trim() || row.targetPercent > 0)) {
      setPendingReplace(() => apply);
    } else {
      apply();
    }
  };

  const addRow = () => {
    setRowKeys([...rowKeys, newRowKey()]);
    setTargets([
      ...targets,
      { tokenSymbol: "", targetPercent: 0, coingeckoId: "" },
    ]);
  };

  const removeRow = (index: number) => {
    setActiveAutocompleteIndex(null);
    setRowKeys(rowKeys.filter((_, i) => i !== index));
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
      setHighlighted(0);
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
    confirmReplace(() => onAutoGenerate(mode));
  };

  const handleApplyTemplate = (template: (typeof TEMPLATES)[number]) => {
    const { allocations } = template;
    confirmReplace(() => {
      if (allocations === "auto-equal") {
        onAutoGenerate("equal");
        return;
      }
      setTargets(
        allocations.map((a) => ({
          tokenSymbol: a.symbol,
          targetPercent: a.percent,
          coingeckoId: "",
        }))
      );
    });
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
      ;

    setSortMode(mode);
    setRowKeys(sorted.map((item) => rowKeys[item.idx]));
    setTargets(sorted.map((item) => item.row));
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
          : "text-text-muted";
  const progressBarClass =
    totalPercent > 100
      ? "bg-status-negative"
      : totalPercent === 100
        ? "bg-status-positive"
        : totalPercent > 0
          ? "bg-status-warning"
          : "bg-text-dim";

  const getDeviationClass = (diff: number | null): string => {
    if (diff === null) return "text-text-muted";
    const abs = Math.abs(diff);
    if (abs <= 1) return "text-text-muted";
    if (diff > 0) {
      if (abs <= 5) return "text-status-warning";
      return "text-status-negative";
    }
    return "text-status-info";
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
              <span className="rounded-sm bg-bg-muted px-2 py-0.5 text-caption text-text-muted">
                {targets.length}
              </span>
            )}
            <span className="ml-auto">
              {expanded ? (
                <ChevronUp className="h-5 w-5 text-text-muted" />
              ) : (
                <ChevronDown className="h-5 w-5 text-text-muted" />
              )}
            </span>
          </button>
          <span
            className={`whitespace-nowrap text-body font-semibold ${totalStatusClass}`}
          >
            {t("rebalance.total", { percent: totalPercent.toFixed(1) })}
            {totalPercent > 100 && ` — ${t("rebalance.exceeds100")}`}
            {totalPercent > 0 &&
              totalPercent < 100 &&
              ` — ${t("rebalance.unallocated", { percent: (100 - totalPercent).toFixed(1) })}`}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden bg-bg-muted">
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
          <MenuButton
            label={
              <>
                <Wand2 className="h-4 w-4" aria-hidden="true" />
                {t("rebalance.autoGenerate")}
              </>
            }
            items={[
              { key: "equal", label: t("rebalance.equalWeight"), onSelect: () => handleAutoGenerate("equal") },
              {
                key: "market-cap",
                label: t("rebalance.currentAllocation"),
                onSelect: () => handleAutoGenerate("market-cap"),
              },
            ]}
          />
          <MenuButton
            label={
              <>
                <LayoutTemplate className="h-4 w-4" aria-hidden="true" />
                {t("rebalance.templates")}
              </>
            }
            menuClassName="min-w-52"
            items={TEMPLATES.map((tpl) => ({
              key: tpl.name,
              label: tpl.labelKey ? t(tpl.labelKey) : tpl.name,
              onSelect: () => handleApplyTemplate(tpl),
            }))}
          />
          <MenuButton
            disabled={targets.length < 2}
            label={
              <>
                <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                {t("rebalance.sortByDeviation")}
                <span className="text-caption text-text-muted">
                  {sortMode === "absolute"
                    ? t("rebalance.sortDeviationAbsoluteShort")
                    : t("rebalance.sortDeviationSignedShort")}
                </span>
              </>
            }
            menuClassName="min-w-52"
            items={[
              {
                key: "absolute",
                label: t("rebalance.sortDeviationAbsolute"),
                onSelect: () => sortTargetsByDeviation("absolute"),
              },
              {
                key: "signed",
                label: t("rebalance.sortDeviationSigned"),
                onSelect: () => sortTargetsByDeviation("signed"),
              },
            ]}
          />
          <Button size="sm" onClick={onSave} disabled={!canSaveTargets}>
            <Save className="mr-2 h-4 w-4" />
            {savePending ? t("common.saving") : t("rebalance.saveTargets")}
          </Button>
        </div>
      </CardHeader>
      {!expanded && (
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-bg-card px-3 py-2">
            <p className="text-body text-text-muted">
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
            {targets.length > 0 && (
              <div className="hidden items-center gap-3 text-caption text-text-muted md:flex">
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
              const options = autocompleteData?.suggestions ?? [];
              const listOpen =
                activeAutocompleteIndex === index &&
                autocompleteQuery.length > 0 &&
                options.length > 0;
              const listboxId = `${listboxBaseId}-list-${index}`;

              return (
                <div
                  key={rowKeys[index] ?? `pending-${index}`}
                  className="relative border border-border-subtle p-3"
                >
                  <div className="flex flex-wrap items-start gap-2 md:flex-nowrap md:items-center md:gap-3">
                    <div className="relative w-full md:w-44">
                      <Input
                        role="combobox"
                        aria-label={t("rebalance.tokenInputLabel", { n: index + 1 })}
                        aria-autocomplete="list"
                        aria-expanded={listOpen}
                        aria-controls={listOpen ? listboxId : undefined}
                        aria-activedescendant={
                          listOpen ? `${listboxId}-opt-${highlighted}` : undefined
                        }
                        placeholder={t("rebalance.tokenPlaceholder")}
                        value={row.tokenSymbol}
                        onChange={(e) =>
                          updateRow(index, "tokenSymbol", e.target.value)
                        }
                        onFocus={() => {
                          setActiveAutocompleteIndex(index);
                          setAutocompleteQuery(row.tokenSymbol);
                          setHighlighted(0);
                        }}
                        onKeyDown={(e) => {
                          if (!listOpen) return;
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setHighlighted((h) => (h + 1) % options.length);
                          } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setHighlighted((h) => (h - 1 + options.length) % options.length);
                          } else if (e.key === "Enter") {
                            e.preventDefault();
                            const choice = options[highlighted];
                            if (choice) selectAutocomplete(index, choice);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setActiveAutocompleteIndex(null);
                          }
                        }}
                        className="w-full"
                        autoComplete="off"
                      />
                      {listOpen && (
                        <ul
                          id={listboxId}
                          role="listbox"
                          aria-label={t("rebalance.tokenSuggestions")}
                          className="absolute left-0 top-full z-50 mt-1 max-h-48 min-w-[18rem] w-full overflow-y-auto rounded-overlay border border-border bg-bg-input shadow-overlay"
                        >
                          {options.map((s, optionIndex) => (
                            <li
                              key={s.symbol}
                              id={`${listboxId}-opt-${optionIndex}`}
                              role="option"
                              aria-selected={optionIndex === highlighted}
                              className={cn(
                                "flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-body hover:bg-bg-hover",
                                optionIndex === highlighted && "bg-bg-hover"
                              )}
                              // mousedown, not click: keep focus in the input.
                              onMouseDown={(e) => {
                                e.preventDefault();
                                selectAutocomplete(index, s);
                              }}
                              onMouseMove={() => setHighlighted(optionIndex)}
                            >
                              <span className="flex items-center">
                                {s.isGroup && (
                                  <Layers className="mr-1.5 h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                                )}
                                <span className="font-medium text-text-primary">{s.symbol}</span>
                                <span className="ml-2 text-text-muted">{s.name}</span>
                              </span>
                              <span className="font-mono text-caption tabular text-text-muted">
                                {mask(formatUsd(s.totalValueUsd))}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <Input
                      type="number"
                      aria-label={t("rebalance.percentInputLabel", {
                        symbol: row.tokenSymbol || t("rebalance.thisToken"),
                      })}
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
                      className="w-[calc(25%-0.25rem)] text-right font-mono text-caption tabular text-text-muted md:w-20 md:text-body"
                      title={
                        currentPercent === null
                          ? t("common.noData")
                          : `${t("rebalance.current")}: ${currentPercent.toFixed(1)}%`
                      }
                    >
                      {currentPercent === null ? "—" : `${currentPercent.toFixed(1)}%`}
                    </span>
                    <span
                      className={`w-[calc(25%-0.25rem)] text-right font-mono text-caption tabular md:w-24 md:text-body ${getDeviationClass(diff)}`}
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
                      className="h-8 w-8 text-text-muted hover:text-status-negative"
                      aria-label={t("rebalance.removeTargetLabel", { symbol: row.tokenSymbol || t("rebalance.thisToken") })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {groups.some(
                    (g) =>
                      g.name.toUpperCase() === row.tokenSymbol.toUpperCase()
                  ) && (
                    <div className="mt-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-status-info-soft px-1.5 py-0.5 text-caption text-status-info">
                        <Layers className="h-3 w-3" />
                        {t("rebalance.group")}
                      </span>
                    </div>
                  )}

                </div>
              );
            })}

            {!hasValidTargets && (
              <p className="text-caption text-text-muted">
                {t("rebalance.noValidTargets")}
              </p>
            )}

            {saveError && (
              <p className="text-body text-status-negative" role="alert" aria-live="assertive">
                {saveErrorMessage || t("rebalance.failedSave")}
              </p>
            )}

            <div className="sticky bottom-0 z-10 -mx-6 border-t border-border-subtle bg-bg-card/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-bg-card/80">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={`text-body font-semibold ${totalStatusClass}`}>
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
      <ConfirmDialog
        open={pendingReplace !== null}
        title={t("rebalance.replaceTargetsTitle")}
        description={t("rebalance.replaceTargetsBody", { count: targets.length })}
        confirmLabel={t("rebalance.replaceTargetsConfirm")}
        onCancel={() => setPendingReplace(null)}
        onConfirm={() => {
          pendingReplace?.();
          setPendingReplace(null);
        }}
      />
    </Card>
  );
}
