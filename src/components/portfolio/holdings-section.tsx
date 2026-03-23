"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/hooks/use-translation";
import { cn, formatCrypto, formatUsd, formatUsdPrice } from "@/lib/utils";
import { Copy, Minus, Package, Plus } from "lucide-react";
import type { BreakdownItem } from "@/components/portfolio/types";

type HoldingActionType = "buy" | "sell";

interface HoldingsSectionProps {
  breakdown: BreakdownItem[];
  filteredBreakdown: BreakdownItem[];
  expandedHoldingKey: string | null;
  txType: string;
  getHoldingKey: (item: { symbol: string; coingeckoId: string | null }) => string;
  getHeldDurationBadge: (firstBuyDate: string | null) => ReactNode;
  renderHoldingInlineForm: (item: BreakdownItem) => ReactNode;
  onOpenInlineForm: (item: BreakdownItem, type: HoldingActionType) => void;
  onCloseInlineForm: () => void;
  onRepeatLast: (item: BreakdownItem) => void;
  onOpenManualSection: () => void;
}

export function HoldingsSection({
  breakdown,
  filteredBreakdown,
  expandedHoldingKey,
  txType,
  getHoldingKey,
  getHeldDurationBadge,
  renderHoldingInlineForm,
  onOpenInlineForm,
  onCloseInlineForm,
  onRepeatLast,
  onOpenManualSection,
}: HoldingsSectionProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("portfolio.holdings")}</CardTitle>
      </CardHeader>
      <CardContent>
        {breakdown.length === 0 ? (
          <div className="space-y-4 py-6 text-center">
            <p className="text-text-subtle">{t("portfolio.noHoldings")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/portfolio/add">
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  {t("portfolio.addTransaction")}
                </Button>
              </Link>
              <Button size="sm" variant="outline" onClick={onOpenManualSection}>
                <Package className="mr-2 h-4 w-4" />
                {t("portfolio.quickAddHoldings")}
              </Button>
            </div>
          </div>
        ) : filteredBreakdown.length === 0 ? (
          <p className="py-6 text-center text-text-subtle">
            {t("portfolio.noMatch")}
          </p>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {filteredBreakdown.map((item) => {
                const holdingKey = getHoldingKey(item);
                const isExpanded = expandedHoldingKey === holdingKey;

                return (
                  <div
                    key={holdingKey}
                    className="rounded-lg border border-border-subtle bg-bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary">{item.symbol}</p>
                        <p className="truncate text-xs text-text-subtle">
                          {item.tokenName}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-text-primary">
                          {formatUsd(item.value)}
                        </p>
                        <p className="text-xs text-text-subtle">
                          {item.percent.toFixed(1)}%
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-text-subtle">{t("portfolio.qty")}</p>
                        <p className="font-mono text-text-primary">
                          {formatCrypto(item.quantity)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-text-subtle">{t("portfolio.avgCost")}</p>
                        <p className="text-text-primary">
                          {formatUsdPrice(item.avgCost)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-text-subtle">{t("portfolio.price")}</p>
                        <p className="text-text-primary">
                          {formatUsdPrice(item.currentPrice)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-text-subtle">{t("portfolio.held")}</p>
                        <div className="pt-1">{getHeldDurationBadge(item.firstBuyDate)}</div>
                      </div>
                      <div>
                        <p className="text-xs text-text-subtle">
                          {t("portfolio.unrealizedPL")}
                        </p>
                        <p
                          className={cn(
                            item.unrealizedPL >= 0
                              ? "text-status-positive"
                              : "text-status-negative"
                          )}
                        >
                          {item.unrealizedPL >= 0 ? "+" : ""}
                          {formatUsd(item.unrealizedPL)}
                          <span className="ml-1 text-xs">
                            ({item.unrealizedPLPercent >= 0 ? "+" : ""}
                            {item.unrealizedPLPercent.toFixed(1)}%)
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-text-subtle">
                          {t("portfolio.realizedPL")}
                        </p>
                        <p
                          className={cn(
                            item.realizedPL >= 0
                              ? "text-status-positive"
                              : "text-status-negative"
                          )}
                        >
                          {item.realizedPL >= 0 ? "+" : ""}
                          {formatUsd(item.realizedPL)}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-text-subtle">{t("portfolio.fees")}</p>
                        <p className="text-status-caution">
                          {item.totalFees > 0 ? formatUsd(item.totalFees) : "-"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-status-positive hover:bg-status-positive-soft hover:text-status-positive"
                        onClick={() =>
                          isExpanded && txType === "buy"
                            ? onCloseInlineForm()
                            : onOpenInlineForm(item, "buy")
                        }
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        {t("portfolio.addBuy")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-status-negative hover:bg-status-negative-soft hover:text-status-negative"
                        onClick={() =>
                          isExpanded && txType === "sell"
                            ? onCloseInlineForm()
                            : onOpenInlineForm(item, "sell")
                        }
                      >
                        <Minus className="mr-2 h-4 w-4" />
                        {t("portfolio.addSell")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRepeatLast(item)}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        {t("portfolio.repeatLast")}
                      </Button>
                    </div>

                    {isExpanded ? (
                      <div className="mt-4 border-t border-border-subtle pt-4">
                        {renderHoldingInlineForm(item)}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">{t("portfolio.holdings")}</caption>
                <thead>
                  <tr className="border-b border-border text-text-subtle">
                    <th scope="col" className="pb-3 pr-4 font-medium">
                      {t("portfolio.token")}
                    </th>
                    <th scope="col" className="pb-3 pr-4 text-right font-medium">
                      {t("portfolio.qty")}
                    </th>
                    <th scope="col" className="pb-3 pr-4 text-right font-medium">
                      {t("portfolio.avgCost")}
                    </th>
                    <th scope="col" className="pb-3 pr-4 text-right font-medium">
                      {t("portfolio.price")}
                    </th>
                    <th scope="col" className="pb-3 pr-4 text-right font-medium">
                      {t("portfolio.value")}
                    </th>
                    <th scope="col" className="pb-3 pr-4 text-right font-medium">
                      {t("portfolio.unrealizedPL")}
                    </th>
                    <th scope="col" className="pb-3 pr-4 text-right font-medium">
                      {t("portfolio.realizedPL")}
                    </th>
                    <th scope="col" className="pb-3 pr-4 text-right font-medium">
                      {t("portfolio.fees")}
                    </th>
                    <th scope="col" className="pb-3 pr-4 text-center font-medium">
                      {t("portfolio.held")}
                    </th>
                    <th scope="col" className="pb-3 text-center font-medium">
                      {t("portfolio.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredBreakdown.map((item) => {
                    const holdingKey = getHoldingKey(item);
                    const isExpanded = expandedHoldingKey === holdingKey;

                    return (
                      <Fragment key={holdingKey}>
                        <tr className="text-text-tertiary">
                          <th scope="row" className="py-3 pr-4 text-left font-medium">
                            {item.symbol}
                          </th>
                          <td className="py-3 pr-4 text-right font-mono">
                            {formatCrypto(item.quantity)}
                          </td>
                          <td className="py-3 pr-4 text-right">
                            {formatUsdPrice(item.avgCost)}
                          </td>
                          <td className="py-3 pr-4 text-right">
                            {formatUsdPrice(item.currentPrice)}
                          </td>
                          <td className="py-3 pr-4 text-right font-medium">
                            {formatUsd(item.value)}
                          </td>
                          <td
                            className={cn(
                              "py-3 pr-4 text-right",
                              item.unrealizedPL >= 0
                                ? "text-status-positive"
                                : "text-status-negative"
                            )}
                          >
                            {item.unrealizedPL >= 0 ? "+" : ""}
                            {formatUsd(item.unrealizedPL)}
                            <span className="ml-1 text-xs">
                              ({item.unrealizedPLPercent >= 0 ? "+" : ""}
                              {item.unrealizedPLPercent.toFixed(1)}%)
                            </span>
                          </td>
                          <td
                            className={cn(
                              "py-3 pr-4 text-right",
                              item.realizedPL >= 0
                                ? "text-status-positive"
                                : "text-status-negative"
                            )}
                          >
                            {item.realizedPL >= 0 ? "+" : ""}
                            {formatUsd(item.realizedPL)}
                          </td>
                          <td className="py-3 pr-4 text-right text-status-caution">
                            {item.totalFees > 0 ? formatUsd(item.totalFees) : "-"}
                          </td>
                          <td className="py-3 pr-4 text-center">
                            {getHeldDurationBadge(item.firstBuyDate)}
                          </td>
                          <td className="py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-status-positive hover:bg-status-positive-soft hover:text-status-positive"
                                onClick={() =>
                                  isExpanded && txType === "buy"
                                    ? onCloseInlineForm()
                                    : onOpenInlineForm(item, "buy")
                                }
                                title={t("portfolio.addBuy")}
                                aria-label={`${t("portfolio.addBuy")} ${item.symbol}`}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-status-negative hover:bg-status-negative-soft hover:text-status-negative"
                                onClick={() =>
                                  isExpanded && txType === "sell"
                                    ? onCloseInlineForm()
                                    : onOpenInlineForm(item, "sell")
                                }
                                title={t("portfolio.addSell")}
                                aria-label={`${t("portfolio.addSell")} ${item.symbol}`}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-text-subtle hover:text-text-tertiary"
                                onClick={() => onRepeatLast(item)}
                                title={t("portfolio.repeatLast")}
                                aria-label={`${t("portfolio.repeatLast")} ${item.symbol}`}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded ? (
                          <tr className="bg-bg-card">
                            <td colSpan={10} className="px-4 py-4">
                              {renderHoldingInlineForm(item)}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
