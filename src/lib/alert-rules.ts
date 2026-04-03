/**
 * Alert rule definitions and evaluation engine.
 * Rules are stored as JSON in vault.settings.alertRules
 */

import { TrendingUp, ShieldAlert, Wallet } from "lucide-react";

export type AlertRuleType = "take-profit" | "buy-on-fear" | "stablecoin-reserve";

export const ALERT_RULE_TYPE_ICONS: Record<AlertRuleType, typeof TrendingUp> = {
  "take-profit": TrendingUp,
  "buy-on-fear": ShieldAlert,
  "stablecoin-reserve": Wallet,
};

export interface TakeProfitRule {
  id: string;
  type: "take-profit";
  enabled: boolean;
  asset: string; // token symbol, e.g. "BTC"
  thresholdPercent: number; // e.g. 150 means +150%
}

export interface BuyOnFearRule {
  id: string;
  type: "buy-on-fear";
  enabled: boolean;
  thresholdValue: number; // F&G index threshold, e.g. 25
}

export interface StablecoinReserveRule {
  id: string;
  type: "stablecoin-reserve";
  enabled: boolean;
  // No extra config — uses market phase to determine recommended reserve
}

export type AlertRule = TakeProfitRule | BuyOnFearRule | StablecoinReserveRule;

export type AlertSeverity = "info" | "warning" | "critical";

/** i18n-ready message: a translation key + interpolation params */
export interface AlertMessage {
  key: string;
  params: Record<string, string>;
}

export interface ActiveAlert {
  id: string;
  ruleId: string;
  ruleType: AlertRuleType;
  severity: AlertSeverity;
  asset: string | null; // null for non-asset-specific alerts
  headline: AlertMessage;
  explanation: AlertMessage;
  suggestedAction: AlertMessage;
}

// Phase → recommended stablecoin reserve %
export const PHASE_RESERVE_MAP: Record<string, number> = {
  accumulate: 5,
  hold: 10,
  caution: 20,
  danger: 30,
};

export function parseAlertRules(json: string | undefined): AlertRule[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function serializeAlertRules(rules: AlertRule[]): string {
  return JSON.stringify(rules);
}

export interface AlertEvalContext {
  // Holdings P&L data: symbol → unrealizedPLPercent
  holdingsPL: Record<string, { unrealizedPLPercent: number; currentValue: number }>;
  // Fear & Greed index
  fearGreedValue: number | null;
  // Market phase
  marketPhase: string | null; // "accumulate" | "hold" | "caution" | "danger"
  // Current stablecoin allocation %
  stablecoinPercent: number;
  // Total portfolio value
  totalValueUsd: number;
}

export function evaluateAlertRules(
  rules: AlertRule[],
  ctx: AlertEvalContext
): ActiveAlert[] {
  const alerts: ActiveAlert[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    switch (rule.type) {
      case "take-profit": {
        const holding = ctx.holdingsPL[rule.asset.toUpperCase()];
        if (holding && holding.unrealizedPLPercent >= rule.thresholdPercent) {
          const asset = rule.asset.toUpperCase();
          const actualPL = holding.unrealizedPLPercent.toFixed(1);
          const threshold = rule.thresholdPercent.toString();
          alerts.push({
            id: `${rule.id}:${asset}`,
            ruleId: rule.id,
            ruleType: "take-profit",
            severity: holding.unrealizedPLPercent >= rule.thresholdPercent * 1.5 ? "critical" : "warning",
            asset,
            headline: {
              key: "alertEngine.takeProfitHeadline",
              params: { asset, pl: actualPL },
            },
            explanation: {
              key: "alertEngine.takeProfitExplanation",
              params: { asset, pl: actualPL, threshold },
            },
            suggestedAction: {
              key: "alertEngine.takeProfitAction",
              params: { asset },
            },
          });
        }
        break;
      }

      case "buy-on-fear": {
        if (ctx.fearGreedValue !== null && ctx.fearGreedValue <= rule.thresholdValue) {
          const value = ctx.fearGreedValue.toString();
          const threshold = rule.thresholdValue.toString();
          alerts.push({
            id: rule.id,
            ruleId: rule.id,
            ruleType: "buy-on-fear",
            severity: ctx.fearGreedValue <= 15 ? "critical" : "warning",
            asset: null,
            headline: {
              key: "alertEngine.buyOnFearHeadline",
              params: { value },
            },
            explanation: {
              key: "alertEngine.buyOnFearExplanation",
              params: { value, threshold },
            },
            suggestedAction: {
              key: "alertEngine.buyOnFearAction",
              params: {},
            },
          });
        }
        break;
      }

      case "stablecoin-reserve": {
        const phase = ctx.marketPhase ?? "hold"; // fallback to "hold" (10%) when signal unavailable
        const recommended = PHASE_RESERVE_MAP[phase] ?? 10;
        if (ctx.stablecoinPercent < recommended) {
          const deficit = recommended - ctx.stablecoinPercent;
          const isEstimated = !ctx.marketPhase;
          const current = ctx.stablecoinPercent.toFixed(1);
          const target = recommended.toString();
          const gap = deficit.toFixed(1);
          alerts.push({
            id: rule.id,
            ruleId: rule.id,
            ruleType: "stablecoin-reserve",
            severity: deficit > 15 ? "critical" : deficit > 5 ? "warning" : "info",
            asset: null,
            headline: {
              key: "alertEngine.reserveHeadline",
              params: { current, target },
            },
            explanation: {
              key: isEstimated
                ? "alertEngine.reserveExplanationEstimated"
                : "alertEngine.reserveExplanation",
              params: { current, target, phase },
            },
            suggestedAction: {
              key: "alertEngine.reserveAction",
              params: { gap },
            },
          });
        }
        break;
      }
    }
  }

  // Sort by severity: critical > warning > info
  const severityOrder: Record<AlertSeverity, number> = { critical: 3, warning: 2, info: 1 };
  alerts.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);

  return alerts;
}
