"use client";

import { useMarketSignal, type MarketSignalData } from "@/hooks/use-market-signal";
import { useTranslation } from "@/hooks/use-translation";
import { cn, formatUsd } from "@/lib/utils";
import { Activity, TrendingDown, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";

const PHASE_CONFIG = {
  accumulate: {
    icon: TrendingDown,
    bgClass: "bg-status-positive-soft border-status-positive-border",
    textClass: "text-status-positive",
    badgeClass: "bg-status-positive/20 text-status-positive",
  },
  hold: {
    icon: Activity,
    bgClass: "bg-status-info-soft border-status-info-border",
    textClass: "text-status-info",
    badgeClass: "bg-status-info/20 text-status-info",
  },
  caution: {
    icon: AlertTriangle,
    bgClass: "bg-status-warning-soft border-status-warning-border",
    textClass: "text-status-warning",
    badgeClass: "bg-status-warning/20 text-status-warning",
  },
  danger: {
    icon: TrendingUp,
    bgClass: "bg-status-negative-soft border-status-negative-border",
    textClass: "text-status-negative",
    badgeClass: "bg-status-negative/20 text-status-negative",
  },
} as const;

function SignalMeter({ value, max = 100, className }: { value: number; max?: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn("h-2 w-full rounded-full bg-bg-hover", className)}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(to right, var(--status-positive), var(--status-warning), var(--status-negative))`,
        }}
      />
    </div>
  );
}

function SubSignal({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-text-subtle">{label}</span>
      <span className="text-sm font-semibold text-text-primary">{value}</span>
      {detail && <span className="text-xs text-text-subtle">{detail}</span>}
    </div>
  );
}

export function MarketSignalBanner() {
  const { data, isLoading, isError } = useMarketSignal();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-card px-4 py-3">
        <Loader2 className="h-4 w-4 animate-spin text-text-subtle" />
        <span className="text-sm text-text-subtle">{t("marketSignal.loading")}</span>
      </div>
    );
  }

  if (isError || !data) return null;

  const phase = data.composite.phase;
  const config = PHASE_CONFIG[phase];
  const Icon = config.icon;

  return (
    <div className={cn("rounded-lg border px-4 py-3", config.bgClass)}>
      {/* Header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("flex items-center justify-center rounded-full p-1.5", config.badgeClass)}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={cn("text-sm font-bold uppercase tracking-wide", config.textClass)}>
                {t(`marketSignal.phase.${phase}`)}
              </span>
              <span className="text-xs text-text-subtle">
                {t("marketSignal.score", { score: data.composite.score.toString() })}
              </span>
            </div>
            <p className="text-xs text-text-subtle">{t(`marketSignal.phaseDesc.${phase}`)}</p>
          </div>
        </div>
        <SignalMeter value={data.composite.score} className="w-full sm:w-32" />
      </div>

      {/* Sub-signals */}
      <div className="mt-3 grid grid-cols-3 gap-4 border-t border-border-subtle pt-3">
        {data.fearGreed && (
          <SubSignal
            label={t("marketSignal.fearGreed")}
            value={`${data.fearGreed.value}/100`}
            detail={data.fearGreed.label}
          />
        )}
        {data.btc200wMa && (
          <SubSignal
            label={t("marketSignal.btc200wMa")}
            value={`${((data.btc200wMa.ratio - 1) * 100).toFixed(0)}%`}
            detail={`${t("marketSignal.maValue")}: ${formatUsd(data.btc200wMa.ma)}`}
          />
        )}
        {data.cyclePosition && (
          <SubSignal
            label={t("marketSignal.cyclePosition")}
            value={`${data.cyclePosition.percent.toFixed(0)}%`}
            detail={t("marketSignal.daysSinceHalving", {
              days: data.cyclePosition.daysSinceHalving.toString(),
            })}
          />
        )}
      </div>
    </div>
  );
}
