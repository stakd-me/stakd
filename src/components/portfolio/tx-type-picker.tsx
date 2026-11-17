"use client";

import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";
import { toggleChipVariants } from "@/components/ui/toggle-chip";
import { TX_TYPE_LABEL_KEYS } from "@/components/portfolio/tx-type-styles";
import type { PortfolioTxType } from "@/components/portfolio/types";

const TX_TYPES = ["buy", "sell", "receive", "send"] as const;

interface TxTypePickerProps {
  value: PortfolioTxType;
  onChange: (type: PortfolioTxType) => void;
  /** Accessible name for the group, e.g. "Transaction type". */
  label: string;
  /** `lg` fills a grid at control-lg; `compact` sits inline in a row form. */
  size?: "lg" | "compact";
  className?: string;
}

/**
 * The one transaction-type picker. The selected type is `accent` — "selected"
 * is what accent means — not pos/neg: buying is not money going up.
 */
export function TxTypePicker({
  value,
  onChange,
  label,
  size = "compact",
  className,
}: TxTypePickerProps) {
  const { t } = useTranslation();

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        size === "lg" ? "grid grid-cols-2 gap-2 sm:grid-cols-4" : "flex flex-wrap gap-2",
        className
      )}
    >
      {TX_TYPES.map((type) => {
        const active = value === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            aria-pressed={active}
            className={toggleChipVariants({ active, size })}
          >
            {t(TX_TYPE_LABEL_KEYS[type])}
          </button>
        );
      })}
    </div>
  );
}
