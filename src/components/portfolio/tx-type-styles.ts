import type { PortfolioTxType } from "@/components/portfolio/types";
import type { TranslationKeys } from "@/i18n";

/** The translated name for each transaction type — never show the raw enum. */
export const TX_TYPE_LABEL_KEYS = {
  buy: "portfolio.buy",
  sell: "portfolio.sell",
  receive: "portfolio.receive",
  send: "portfolio.send",
} as const satisfies Record<PortfolioTxType, TranslationKeys>;

export function getTxTypeToggleClass(
  type: PortfolioTxType,
  isActive: boolean
): string {
  if (!isActive) {
    return "border border-border bg-bg-muted text-text-subtle hover:bg-bg-hover";
  }

  if (type === "buy") {
    return "border border-status-positive-border bg-status-positive-soft text-status-positive";
  }
  if (type === "sell") {
    return "border border-status-negative-border bg-status-negative-soft text-status-negative";
  }
  if (type === "receive") {
    return "border border-status-info-border bg-status-info-soft text-status-info";
  }
  return "border border-status-caution-border bg-status-caution-soft text-status-caution";
}

export function getTxTypeActionButtonClass(type: PortfolioTxType): string {
  if (type === "buy") {
    return "bg-status-positive text-bg-page hover:opacity-90";
  }
  if (type === "sell") {
    return "bg-status-negative text-bg-page hover:opacity-90";
  }
  if (type === "receive") {
    return "bg-status-info text-bg-page hover:opacity-90";
  }
  return "bg-status-caution text-bg-page hover:opacity-90";
}

export function getTransactionTypeBadgeClass(type: string): string {
  if (type === "buy") {
    return "bg-status-positive-soft text-status-positive";
  }
  if (type === "sell") {
    return "bg-status-negative-soft text-status-negative";
  }
  if (type === "receive") {
    return "bg-status-info-soft text-status-info";
  }
  return "bg-status-caution-soft text-status-caution";
}
