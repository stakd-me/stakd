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

export interface ActiveAlert {
  id: string;
  ruleId: string;
  ruleType: AlertRuleType;
  severity: AlertSeverity;
  asset: string | null; // null for non-asset-specific alerts
  headline: string;
  explanation: string;
  suggestedAction: string;
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
          const actualPL = holding.unrealizedPLPercent.toFixed(1);
          alerts.push({
            id: `${rule.id}:${rule.asset}`,
            ruleId: rule.id,
            ruleType: "take-profit",
            severity: holding.unrealizedPLPercent >= rule.thresholdPercent * 1.5 ? "critical" : "warning",
            asset: rule.asset.toUpperCase(),
            headline: `${rule.asset.toUpperCase()} +${actualPL}%`,
            explanation: `${rule.asset.toUpperCase()} is up ${actualPL}% from your average buy price, exceeding your ${rule.thresholdPercent}% take-profit threshold.`,
            suggestedAction: `Consider taking partial profit (e.g. sell 20-30% of your ${rule.asset.toUpperCase()} position).`,
          });
        }
        break;
      }

      case "buy-on-fear": {
        if (ctx.fearGreedValue !== null && ctx.fearGreedValue <= rule.thresholdValue) {
          alerts.push({
            id: rule.id,
            ruleId: rule.id,
            ruleType: "buy-on-fear",
            severity: ctx.fearGreedValue <= 15 ? "critical" : "warning",
            asset: null,
            headline: `Fear & Greed: ${ctx.fearGreedValue}`,
            explanation: `Fear & Greed index is at ${ctx.fearGreedValue}, below your threshold of ${rule.thresholdValue}. Market conditions may favor accumulation.`,
            suggestedAction: "Conditions favor accumulation per your rule. Consider deploying capital into your target assets.",
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
          alerts.push({
            id: rule.id,
            ruleId: rule.id,
            ruleType: "stablecoin-reserve",
            severity: deficit > 15 ? "critical" : deficit > 5 ? "warning" : "info",
            asset: null,
            headline: `Reserve: ${ctx.stablecoinPercent.toFixed(1)}% / ${recommended}%`,
            explanation: isEstimated
              ? `Market signal unavailable. Using default "${phase}" reserve (${recommended}%). Your stablecoins (${ctx.stablecoinPercent.toFixed(1)}%) are below this level.`
              : `Your stablecoin reserve (${ctx.stablecoinPercent.toFixed(1)}%) is below the recommended ${recommended}% for "${phase}" market conditions.`,
            suggestedAction: `Consider increasing your stablecoin allocation by ~${deficit.toFixed(1)}% to match the recommended reserve level.`,
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
