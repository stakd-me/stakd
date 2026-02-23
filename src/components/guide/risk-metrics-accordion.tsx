"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
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

  return (
    <div className="space-y-2">
      {metrics.map((metric, i) => (
        <div
          key={metric.titleKey}
          className="rounded-lg border border-border bg-bg-card"
        >
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left"
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            aria-expanded={openIndex === i}
          >
            <span className="font-medium text-text-primary">
              {t(metric.titleKey as Parameters<typeof t>[0])}
            </span>
            {openIndex === i ? (
              <ChevronUp className="h-4 w-4 text-text-subtle" />
            ) : (
              <ChevronDown className="h-4 w-4 text-text-subtle" />
            )}
          </button>
          <div
            className={cn(
              "overflow-hidden transition-all",
              openIndex === i ? "max-h-40 pb-4" : "max-h-0"
            )}
          >
            <p className="px-4 text-sm text-text-muted">
              {t(metric.descKey as Parameters<typeof t>[0])}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
