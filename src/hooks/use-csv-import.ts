"use client";

import { useState, useCallback } from "react";
import { useTranslation } from "@/hooks/use-translation";
import {
  CSV_HEADER_ALIASES,
  REQUIRED_CSV_COLUMNS,
  normalizeCsvHeader,
  parseCsvMatrix,
  getCsvField,
} from "@/lib/portfolio/csv-parser";
import type { ImportPreviewRow, PortfolioTxType } from "@/components/portfolio/types";

/**
 * Hook for CSV import flow (Improvement #1 refactor - Phase 0).
 *
 * Current responsibilities (after PR 3):
 * - Owns all import modal state
 * - Provides derived readiness flags
 * - Provides open/reset/close controls
 * - Owns `parseCsvFile` (the FileReader + validation + preview builder)
 *
 * Future slices will move `handleImportSubmit` (the actual vault mutation part).
 *
 * See plan.md §9 for the approved extraction roadmap.
 */
export function useCsvImport() {
  const { t } = useTranslation();

  // --- State ---
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
  const [importValidationErrors, setImportValidationErrors] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // --- Derived readiness (used by modal + keyboard handlers) ---
  const importReadyCount = importPreview.length;
  const importIssueCount = importValidationErrors.length;
  const importHasReviewState =
    importFileName.length > 0 ||
    importReadyCount > 0 ||
    importIssueCount > 0 ||
    importError !== null;
  const importIsReady =
    importReadyCount > 0 && importIssueCount === 0 && importError === null;

  // --- Control functions ---
  const resetImportState = useCallback(() => {
    setImportFileName("");
    setImportPreview([]);
    setImportValidationErrors([]);
    setImportError(null);
  }, []);

  const openImportModal = useCallback(
    (resetState = false) => {
      if (resetState) {
        resetImportState();
      }
      setShowImportModal(true);
    },
    [resetImportState]
  );

  const closeImportModal = useCallback(() => {
    setShowImportModal(false);
  }, []);

  // --- parseCsvFile (moved into hook in PR 3) ---
  const parseCsvFile = useCallback(
    (file: File) => {
      setImportFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = String(e.target?.result ?? "");
          const matrix = parseCsvMatrix(text);
          if (matrix.length < 2) {
            setImportPreview([]);
            setImportValidationErrors([]);
            setImportError(t("portfolio.csvError"));
            return;
          }

          const normalizedHeaders = matrix[0].map((header) =>
            normalizeCsvHeader(header)
          );

          const missingColumns = REQUIRED_CSV_COLUMNS.filter((required) => {
            const aliases = CSV_HEADER_ALIASES[required];
            return !normalizedHeaders.some((header) => aliases.includes(header));
          });

          if (missingColumns.length > 0) {
            const missingLabels = missingColumns
              .map((col) => {
                if (col === "date") return t("common.date");
                if (col === "symbol") return t("portfolio.symbol");
                if (col === "quantity") return t("portfolio.quantity");
                return t("portfolio.price");
              })
              .join(", ");
            setImportPreview([]);
            setImportValidationErrors([]);
            setImportError(t("portfolio.csvMissingHeaders", { headers: missingLabels }));
            return;
          }

          const rows: ImportPreviewRow[] = [];
          const issues: string[] = [];

          for (let i = 1; i < matrix.length; i++) {
            const rowNumber = i + 1;
            const values = matrix[i];
            const rowMap: Record<string, string> = {};
            normalizedHeaders.forEach((header, idx) => {
              if (!header) return;
              rowMap[header] = values[idx] ?? "";
            });

            const symbol = getCsvField(rowMap, CSV_HEADER_ALIASES.symbol).toUpperCase();
            if (!symbol) {
              issues.push(
                t("portfolio.csvRowIssue", {
                  row: rowNumber,
                  message: t("portfolio.csvIssueSymbolRequired"),
                })
              );
              continue;
            }

            const rawType = getCsvField(rowMap, CSV_HEADER_ALIASES.type).toLowerCase() || "buy";
            if (!["buy", "sell", "receive", "send"].includes(rawType)) {
              issues.push(
                t("portfolio.csvRowIssue", {
                  row: rowNumber,
                  message: t("portfolio.csvIssueTypeInvalid"),
                })
              );
              continue;
            }

            const quantity = parseFloat(getCsvField(rowMap, CSV_HEADER_ALIASES.quantity));
            if (!Number.isFinite(quantity) || quantity <= 0) {
              issues.push(
                t("portfolio.csvRowIssue", {
                  row: rowNumber,
                  message: t("portfolio.csvIssueQuantityInvalid"),
                })
              );
              continue;
            }

            const pricePerUnit = parseFloat(getCsvField(rowMap, CSV_HEADER_ALIASES.price));
            if (!Number.isFinite(pricePerUnit) || pricePerUnit <= 0) {
              issues.push(
                t("portfolio.csvRowIssue", {
                  row: rowNumber,
                  message: t("portfolio.csvIssuePriceInvalid"),
                })
              );
              continue;
            }

            const rawDate = getCsvField(rowMap, CSV_HEADER_ALIASES.date);
            const date = new Date(rawDate);
            if (!rawDate || Number.isNaN(date.getTime())) {
              issues.push(
                t("portfolio.csvRowIssue", {
                  row: rowNumber,
                  message: t("portfolio.csvIssueDateInvalid"),
                })
              );
              continue;
            }

            const feeRaw = getCsvField(rowMap, CSV_HEADER_ALIASES.fee);
            const fee = feeRaw.length > 0 ? parseFloat(feeRaw) : 0;
            if (!Number.isFinite(fee) || fee < 0) {
              issues.push(
                t("portfolio.csvRowIssue", {
                  row: rowNumber,
                  message: t("portfolio.csvIssueFeeInvalid"),
                })
              );
              continue;
            }

            rows.push({
              rowNumber,
              dateIso: date.toISOString(),
              type: rawType as PortfolioTxType,
              symbol,
              name: getCsvField(rowMap, CSV_HEADER_ALIASES.name) || symbol,
              quantity,
              pricePerUnit,
              fee,
              note: getCsvField(rowMap, CSV_HEADER_ALIASES.note) || null,
              coingeckoId: getCsvField(rowMap, CSV_HEADER_ALIASES.coingeckoId) || null,
            });
          }

          if (issues.length > 0) {
            setImportPreview([]);
            setImportValidationErrors(issues);
            setImportError(
              t("portfolio.csvInvalidRows", {
                count: issues.length,
                details: issues.slice(0, 3).join(" | "),
              })
            );
            return;
          }

          setImportPreview(rows);
          setImportValidationErrors([]);
          setImportError(null);
        } catch (err) {
          const message =
            err instanceof Error && err.message === "CSV_UNCLOSED_QUOTES"
              ? t("portfolio.csvUnclosedQuotes")
              : t("portfolio.failedImport");
          setImportPreview([]);
          setImportValidationErrors([]);
          setImportError(message);
        }
      };
      reader.readAsText(file);
    },
    [t]
  );

  return {
    // State
    showImportModal,
    importFileName,
    importPreview,
    importValidationErrors,
    importError,
    importing,

    // Derived
    importReadyCount,
    importIssueCount,
    importHasReviewState,
    importIsReady,

    // Controls + actions
    setImportFileName,
    setImportPreview,
    setImportValidationErrors,
    setImportError,
    setImporting,
    resetImportState,
    openImportModal,
    closeImportModal,
    parseCsvFile,
  };
}