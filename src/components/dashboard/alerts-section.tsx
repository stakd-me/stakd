"use client";

import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";
import type { ActiveAlert, AlertMessage, AlertSeverity } from "@/lib/alert-rules";
import { ALERT_RULE_TYPE_ICONS } from "@/lib/alert-rules";
import type { TranslationKeys } from "@/i18n";
import { X, XCircle, Bell } from "lucide-react";
import Link from "next/link";

const SEVERITY_STYLES: Record<AlertSeverity, { card: string; icon: string }> = {
  critical: {
    card: "border-status-negative-border bg-status-negative-soft",
    icon: "text-status-negative",
  },
  warning: {
    card: "border-status-warning-border bg-status-warning-soft",
    icon: "text-status-warning",
  },
  info: {
    card: "border-status-info-border bg-status-info-soft",
    icon: "text-status-info",
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
    <div className={cn("rounded-md border p-4", styles.card)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={cn("mt-0.5 shrink-0", styles.icon)}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-body font-semibold text-text-primary">
                {headline}
              </span>
              <span className="rounded-sm border border-border-subtle bg-bg-input px-1.5 font-mono text-[11px] leading-4 text-text-muted">
                {t(`alertRules.type.${alert.ruleType}`)}
              </span>
            </div>
            <p className="text-body text-text-secondary">{explanation}</p>
            <p className="text-caption font-semibold text-text-primary">
              {suggestedAction}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-sm p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
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
          <Bell className="h-4 w-4 text-text-muted" />
          <h3 className="text-label uppercase text-text-primary">
            {t("alertRules.activeAlerts")}
          </h3>
          {totalAlertCount > 0 && (
            <span className="rounded-sm border border-status-negative-border bg-status-negative-soft px-1.5 font-mono text-[11px] leading-4 text-status-negative">
              {totalAlertCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {alerts.length > 1 && (
            <button
              type="button"
              onClick={onDismissAll}
              className="flex items-center gap-1 text-caption text-text-muted hover:text-text-primary"
            >
              <XCircle className="h-3.5 w-3.5" />
              {t("alertRules.dismissAll")}
            </button>
          )}
          <Link href="/settings" className="text-caption text-text-muted hover:text-text-primary">
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
        <p className="text-caption text-text-muted">{t("alertRules.allDismissed")}</p>
      )}
    </div>
  );
}
