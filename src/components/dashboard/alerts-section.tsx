"use client";

import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";
import type { ActiveAlert, AlertMessage, AlertSeverity } from "@/lib/alert-rules";
import { ALERT_RULE_TYPE_ICONS } from "@/lib/alert-rules";
import type { TranslationKeys } from "@/i18n";
import { X, XCircle, Bell } from "lucide-react";
import Link from "next/link";

const SEVERITY_STYLES: Record<AlertSeverity, { card: string; icon: string; badge: string }> = {
  critical: {
    card: "border-status-negative-border bg-status-negative-soft",
    icon: "text-status-negative",
    badge: "bg-status-negative/20 text-status-negative",
  },
  warning: {
    card: "border-status-warning-border bg-status-warning-soft",
    icon: "text-status-warning",
    badge: "bg-status-warning/20 text-status-warning",
  },
  info: {
    card: "border-status-info-border bg-status-info-soft",
    icon: "text-status-info",
    badge: "bg-status-info/20 text-status-info",
  },
};

function useAlertMessage(msg: AlertMessage): string {
  const { t } = useTranslation();
  // Translate phase names if present in params
  const params = { ...msg.params };
  if (params.phase) {
    const phaseKey = `marketSignal.phase.${params.phase}` as TranslationKeys;
    params.phase = t(phaseKey);
  }
  return t(msg.key as TranslationKeys, params);
}

function AlertCard({
  alert,
  onDismiss,
}: {
  alert: ActiveAlert;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const styles = SEVERITY_STYLES[alert.severity];
  const Icon = ALERT_RULE_TYPE_ICONS[alert.ruleType];
  const headline = useAlertMessage(alert.headline);
  const explanation = useAlertMessage(alert.explanation);
  const suggestedAction = useAlertMessage(alert.suggestedAction);

  return (
    <div className={cn("rounded-lg border p-4", styles.card)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={cn("mt-0.5 flex-shrink-0 rounded-full p-1", styles.badge)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={cn("text-sm font-bold", styles.icon)}>
                {headline}
              </span>
              <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[10px] font-medium text-text-subtle">
                {t(`alertRules.type.${alert.ruleType}`)}
              </span>
            </div>
            <p className="text-sm text-text-secondary">{explanation}</p>
            <p className="text-xs font-medium text-text-primary">
              {suggestedAction}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 rounded p-1 text-text-dim hover:bg-bg-hover hover:text-text-secondary"
          aria-label={t("alertRules.dismiss")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

interface AlertsSectionProps {
  alerts: ActiveAlert[];
  totalAlertCount: number;
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
}

export function AlertsSection({
  alerts,
  totalAlertCount,
  onDismiss,
  onDismissAll,
}: AlertsSectionProps) {
  const { t } = useTranslation();

  if (totalAlertCount === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-text-subtle" />
          <h3 className="text-sm font-semibold text-text-primary">
            {t("alertRules.activeAlerts")}
          </h3>
          {totalAlertCount > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-status-negative-soft px-1.5 text-xs font-bold text-status-negative">
              {totalAlertCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {alerts.length > 1 && (
            <button
              type="button"
              onClick={onDismissAll}
              className="flex items-center gap-1 text-xs text-text-dim hover:text-text-secondary"
            >
              <XCircle className="h-3.5 w-3.5" />
              {t("alertRules.dismissAll")}
            </button>
          )}
          <Link href="/settings" className="text-xs text-text-dim hover:text-text-secondary">
            {t("alertRules.configureRules")}
          </Link>
        </div>
      </div>

      {alerts.length > 0 ? (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onDismiss={() => onDismiss(alert.id)}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-dim">{t("alertRules.allDismissed")}</p>
      )}
    </div>
  );
}
