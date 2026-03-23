"use client";

import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineHelpCard } from "@/components/ui/inline-help";
import { useTranslation } from "@/hooks/use-translation";
import { X } from "lucide-react";
import type { ImportPreviewRow } from "@/components/portfolio/types";

interface ImportReviewModalProps {
  open: boolean;
  dialogRef: RefObject<HTMLDivElement | null>;
  importing: boolean;
  importFileName: string;
  importHasReviewState: boolean;
  importReadyCount: number;
  importIssueCount: number;
  importPreview: ImportPreviewRow[];
  importValidationErrors: string[];
  importError: string | null;
  importIsReady: boolean;
  onClose: () => void;
  onFileSelect: (file: File) => void;
  onSubmit: () => void;
}

export function ImportReviewModal({
  open,
  dialogRef,
  importing,
  importFileName,
  importHasReviewState,
  importReadyCount,
  importIssueCount,
  importPreview,
  importValidationErrors,
  importError,
  importIsReady,
  onClose,
  onFileSelect,
  onSubmit,
}: ImportReviewModalProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 px-4 py-6" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center">
        <Card
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="portfolio-import-title"
          aria-describedby="portfolio-import-desc"
          aria-busy={importing}
          tabIndex={-1}
          className="max-h-[90vh] w-full max-w-3xl overflow-y-auto"
          onClick={(event) => event.stopPropagation()}
        >
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle id="portfolio-import-title">
                  {t("portfolio.importTitle")}
                </CardTitle>
                <p id="portfolio-import-desc" className="mt-1 text-sm text-text-subtle">
                  {t("portfolio.importDesc")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label={t("common.close")}
                title={t("common.close")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <InlineHelpCard
                title={t("portfolio.importHelpTitle")}
                description={t("portfolio.importHelpDesc")}
                items={[
                  t("portfolio.importHelpStepUpload"),
                  t("portfolio.importHelpStepReview"),
                  t("portfolio.importHelpStepAlternative"),
                ]}
              />

              <div className="space-y-3 rounded-lg border border-border-subtle bg-bg-card p-4">
                <div>
                  <label
                    htmlFor="portfolio-import-file"
                    className="mb-2 block text-sm font-medium text-text-primary"
                  >
                    {t("portfolio.importFileLabel")}
                  </label>
                  <input
                    id="portfolio-import-file"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        onFileSelect(file);
                      }
                    }}
                    className="block w-full text-sm text-text-subtle file:mr-4 file:rounded-md file:border-0 file:bg-bg-muted file:px-4 file:py-2 file:text-sm file:font-medium file:text-text-tertiary hover:file:bg-bg-hover"
                  />
                </div>
                {importFileName ? (
                  <p className="text-xs text-text-dim">
                    {t("portfolio.importSelectedFile", { name: importFileName })}
                  </p>
                ) : null}
              </div>

              {importHasReviewState ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="status" aria-live="polite">
                  <div className="rounded-lg border border-border-subtle bg-bg-card p-4">
                    <p className="text-xs text-text-subtle">
                      {t("portfolio.importSelectedFileLabel")}
                    </p>
                    <p className="mt-2 truncate text-sm font-medium text-text-primary">
                      {importFileName || t("common.noData")}
                    </p>
                  </div>
                  <div className="rounded-lg border border-status-positive-border bg-status-positive-soft p-4">
                    <p className="text-xs text-status-positive">
                      {t("portfolio.importReadyRows")}
                    </p>
                    <p className="mt-2 text-xl font-semibold text-status-positive">
                      {importReadyCount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-status-warning-border bg-status-warning-soft p-4">
                    <p className="text-xs text-status-warning">
                      {t("portfolio.importIssueCount")}
                    </p>
                    <p className="mt-2 text-xl font-semibold text-status-warning">
                      {importIssueCount}
                    </p>
                  </div>
                </div>
              ) : null}

              {importPreview.length > 0 ? (
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-text-subtle">
                      {t("portfolio.preview", { count: importPreview.length })}
                    </p>
                    <p className="text-xs text-text-dim">
                      {t("portfolio.importPreviewLimit")}
                    </p>
                  </div>
                  <div className="max-h-48 overflow-auto rounded border border-border">
                    <table className="w-full text-xs">
                      <caption className="sr-only">
                        {t("portfolio.preview", { count: importPreview.length })}
                      </caption>
                      <thead>
                        <tr className="border-b border-border text-text-subtle">
                          <th scope="col" className="px-2 py-1 text-left">#</th>
                          <th scope="col" className="px-2 py-1 text-left">{t("common.date")}</th>
                          <th scope="col" className="px-2 py-1 text-left">{t("portfolio.type")}</th>
                          <th scope="col" className="px-2 py-1 text-left">{t("portfolio.symbol")}</th>
                          <th scope="col" className="px-2 py-1 text-left">{t("portfolio.quantity")}</th>
                          <th scope="col" className="px-2 py-1 text-left">{t("portfolio.price")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.slice(0, 5).map((row, index) => (
                          <tr key={`${row.rowNumber}-${index}`} className="border-b border-border-subtle">
                            <th scope="row" className="px-2 py-1 text-left text-text-muted">
                              {row.rowNumber}
                            </th>
                            <td className="px-2 py-1 text-text-muted">
                              {row.dateIso.split("T")[0]}
                            </td>
                            <td className="px-2 py-1 text-text-muted">{row.type}</td>
                            <td className="px-2 py-1 text-text-muted">{row.symbol}</td>
                            <td className="px-2 py-1 text-text-muted">{row.quantity}</td>
                            <td className="px-2 py-1 text-text-muted">{row.pricePerUnit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importPreview.length > 5 ? (
                      <p className="px-2 py-1 text-xs text-text-dim">
                        {t("portfolio.moreRows", { count: importPreview.length - 5 })}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {importError ? (
                <p
                  className="rounded-lg border border-status-negative-border bg-status-negative-soft px-3 py-2 text-sm text-status-negative"
                  role="alert"
                >
                  {importError}
                </p>
              ) : null}

              {importValidationErrors.length > 0 ? (
                <div className="space-y-2" role="alert" aria-live="assertive">
                  <p className="text-sm font-medium text-status-negative">
                    {t("portfolio.importIssuesTitle")}
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-xs text-status-negative">
                    {importValidationErrors.slice(0, 5).map((issue, index) => (
                      <li key={`${issue}-${index}`}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>
                  {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={onSubmit}
                  disabled={importing || !importIsReady}
                  aria-busy={importing}
                >
                  {importing
                    ? t("portfolio.importing")
                    : t("portfolio.importCount", { count: importPreview.length })}
                </Button>
              </div>
              <p className="sr-only" role="status" aria-live="polite">
                {importing ? t("portfolio.importing") : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
