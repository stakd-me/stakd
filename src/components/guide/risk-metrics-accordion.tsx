"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/use-translation";

interface Metric {
  titleKey: string;
  descKey: string;
}

const metrics: Metric[] = [
  { titleKey: "guide.metricDeviation", descKey: "guide.metricDeviationDesc" },
  { titleKey: "guide.metricConcentration", descKey: "guide.metricConcentrationDesc" },
  { titleKey: "guide.metricDrift", descKey: "guide.metricDriftDesc" },
  { titleKey: "guide.metricSharpe", descKey: "guide.metricSharpeDesc" },
];

export function RiskMetricsAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const { t } = useTranslation();
  const baseId = useId();

  return (
    <div className="space-y-2">
      {metrics.map((metric, i) => {
        const isOpen = openIndex === i;
        const panelId = `${baseId}-panel-${i}`;
        const buttonId = `${baseId}-button-${i}`;

        return (
          <div key={metric.titleKey} className="border border-border bg-bg-card">
            <button
              id={buttonId}
              type="button"
              className={cn(
                "flex w-full items-center justify-between gap-3 px-4 py-3 text-left",
                "transition-colors duration-[120ms] ease-out hover:bg-bg-hover",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset"
              )}
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
              aria-controls={panelId}
            >
              <span className="text-body font-semibold text-text-primary">
                {t(metric.titleKey as Parameters<typeof t>[0])}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-text-muted transition-transform duration-[120ms] ease-out",
                  isOpen && "rotate-180"
                )}
                aria-hidden="true"
              />
            </button>
            {/* Rendered only when open: the previous version kept the text
                in the DOM under a max-height clamp, which both left it
                readable to screen readers and cut off the longer German
                and Spanish strings. */}
            {isOpen ? (
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                className="border-t border-border-subtle px-4 py-3"
              >
                <p className="text-body text-text-secondary">
                  {t(metric.descKey as Parameters<typeof t>[0])}
                </p>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
