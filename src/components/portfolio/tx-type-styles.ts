import type { PortfolioTxType } from "@/components/portfolio/types";
import type { TranslationKeys } from "@/i18n";

/** The translated name for each transaction type — never show the raw enum. */
export const TX_TYPE_LABEL_KEYS = {
  buy: "portfolio.buy",
  sell: "portfolio.sell",
  receive: "portfolio.receive",
  send: "portfolio.send",
} as const satisfies Record<PortfolioTxType, TranslationKeys>;
