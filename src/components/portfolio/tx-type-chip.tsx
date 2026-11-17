import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";
import { TX_TYPE_LABEL_KEYS } from "@/components/portfolio/tx-type-styles";
import type { PortfolioTxType } from "@/components/portfolio/types";

/** Buy and receive bring the asset in; sell and send take it out. */
export const TX_TYPE_DIRECTION: Record<PortfolioTxType, "in" | "out"> = {
  buy: "in",
  receive: "in",
  sell: "out",
  send: "out",
};

/**
 * A transaction type, told apart by a direction glyph rather than by
 * colour: pos/neg tints are reserved for money going up and down, and
 * buying is not a gain.
 */
export function TxTypeChip({ type, className }: { type: PortfolioTxType; className?: string }) {
  const { t } = useTranslation();
  const Icon = TX_TYPE_DIRECTION[type] === "in" ? ArrowDownLeft : ArrowUpRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border border-border-subtle px-2 py-0.5 text-caption font-semibold text-text-secondary",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
      {t(TX_TYPE_LABEL_KEYS[type])}
    </span>
  );
}
