import type { PortfolioTxType } from "@/components/portfolio/types";
import type { TranslationKeys } from "@/i18n";

/** The translated name for each transaction type — never show the raw enum. */
export const TX_TYPE_LABEL_KEYS = {
  buy: "portfolio.buy",
  sell: "portfolio.sell",
  receive: "portfolio.receive",
  send: "portfolio.send",
} as const satisfies Record<PortfolioTxType, TranslationKeys>;

/**
 * A transaction type is a category, not a gain or a loss, so its chip is
 * neutral: pos/neg are reserved for money going up and down.
 */
export function getTransactionTypeBadgeClass(): string {
  return "border border-border-subtle text-text-secondary";
}
