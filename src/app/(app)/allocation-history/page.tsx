"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { useTranslation } from "@/hooks/use-translation";
import { useVaultStore } from "@/lib/store";
import {
  ALLOCATION_HISTORY_ROWS_PER_PAGE,
  formatAllocationUpdateDate,
  getAllocationHistorySymbols,
  getAllocationPercentMap,
  sortAllocationSnapshotsDesc,
} from "@/lib/services/allocation-history";

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return `${value.toFixed(2)}%`;
}

export default function AllocationHistoryPage() {
  const { t } = useTranslation();
  const snapshots = useVaultStore((state) => state.vault.allocationSnapshots);
  const [page, setPage] = useState(1);

  const sortedSnapshots = useMemo(
    () => sortAllocationSnapshotsDesc(snapshots),
    [snapshots]
  );
  const symbols = useMemo(
    () => getAllocationHistorySymbols(sortedSnapshots),
    [sortedSnapshots]
  );
  const totalPages = useMemo(
    () =>
      Math.max(
        1,
        Math.ceil(sortedSnapshots.length / ALLOCATION_HISTORY_ROWS_PER_PAGE)
      ),
    [sortedSnapshots.length]
  );
  const currentPage = Math.min(page, totalPages);
  const paginatedSnapshots = useMemo(() => {
    const start = (currentPage - 1) * ALLOCATION_HISTORY_ROWS_PER_PAGE;
    return sortedSnapshots.slice(start, start + ALLOCATION_HISTORY_ROWS_PER_PAGE);
  }, [currentPage, sortedSnapshots]);
  const range = useMemo(() => {
    if (sortedSnapshots.length === 0) {
      return { from: 0, to: 0, total: 0 };
    }

    const from = (currentPage - 1) * ALLOCATION_HISTORY_ROWS_PER_PAGE + 1;
    const to = Math.min(
      currentPage * ALLOCATION_HISTORY_ROWS_PER_PAGE,
      sortedSnapshots.length
    );
    return { from, to, total: sortedSnapshots.length };
  }, [currentPage, sortedSnapshots.length]);

  const latestSnapshot = sortedSnapshots[0] ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("allocationHistory.title")}
        description={t("allocationHistory.subtitle")}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          label={t("allocationHistory.totalUpdates")}
          value={sortedSnapshots.length}
          valueSize="2xl"
        />
        <KpiCard
          label={t("allocationHistory.trackedCoins")}
          value={symbols.length}
          valueSize="2xl"
        />
        <KpiCard
          label={t("allocationHistory.latestUpdate")}
          value={
            latestSnapshot ? formatAllocationUpdateDate(latestSnapshot) : "-"
          }
          valueSize="2xl"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("allocationHistory.tableTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedSnapshots.length === 0 ? (
            <EmptyState
              title={t("allocationHistory.emptyTitle")}
              description={t("allocationHistory.emptyDescription")}
              action={
                <Link href="/portfolio">
                  <Button size="sm" variant="outline">
                    {t("nav.portfolio")}
                  </Button>
                </Link>
              }
              className="py-8"
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table
                  id="allocation-history-table"
                  className="w-full min-w-max text-left text-sm"
                >
                  <caption className="sr-only">
                    {t("allocationHistory.tableTitle")}
                  </caption>
                  <thead>
                    <tr className="border-b border-border text-text-subtle">
                      <th
                        scope="col"
                        className="sticky left-0 z-10 bg-bg-card pb-3 pr-6 font-medium"
                      >
                        {t("allocationHistory.update")}
                      </th>
                      {symbols.map((symbol) => (
                        <th
                          key={symbol}
                          scope="col"
                          className="pb-3 px-4 text-right font-medium"
                        >
                          {symbol}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedSnapshots.map((snapshot) => {
                      const percentMap = getAllocationPercentMap(snapshot);

                      return (
                        <tr
                          key={snapshot.id}
                          className="border-b border-border-subtle last:border-0"
                        >
                          <td className="sticky left-0 z-10 whitespace-nowrap bg-bg-card py-3 pr-6 font-medium text-text-primary">
                            {formatAllocationUpdateDate(snapshot)}
                          </td>
                          {symbols.map((symbol) => (
                            <td
                              key={symbol}
                              className="whitespace-nowrap px-4 py-3 text-right font-mono text-text-secondary"
                            >
                              {formatPercent(percentMap[symbol])}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p
                  className="text-xs text-text-subtle"
                  role="status"
                  aria-live="polite"
                >
                  {t("allocationHistory.range", {
                    from: range.from,
                    to: range.to,
                    total: range.total,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={currentPage <= 1}
                    aria-controls="allocation-history-table"
                    aria-label={t("portfolio.prevPage")}
                  >
                    {t("portfolio.prevPage")}
                  </Button>
                  <span
                    className="text-xs text-text-subtle"
                    role="status"
                    aria-live="polite"
                  >
                    {t("portfolio.pageOf", {
                      page: currentPage,
                      total: totalPages,
                    })}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setPage((current) => Math.min(totalPages, current + 1))
                    }
                    disabled={currentPage >= totalPages}
                    aria-controls="allocation-history-table"
                    aria-label={t("portfolio.nextPage")}
                  >
                    {t("portfolio.nextPage")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
