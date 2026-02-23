export const CONCENTRATION_ALERT_THRESHOLD_PERCENT = 30;
export const MIN_CONCENTRATION_ALERT_THRESHOLD_PERCENT = 10;
export const MAX_CONCENTRATION_ALERT_THRESHOLD_PERCENT = 95;

export function parseConcentrationAlertThresholdPercent(rawValue?: string): number {
  const parsed = Number.parseFloat(rawValue ?? "");
  if (!Number.isFinite(parsed)) {
    return CONCENTRATION_ALERT_THRESHOLD_PERCENT;
  }

  return Math.min(
    MAX_CONCENTRATION_ALERT_THRESHOLD_PERCENT,
    Math.max(MIN_CONCENTRATION_ALERT_THRESHOLD_PERCENT, parsed)
  );
}

export function getHighConcentrationThresholdPercent(
  concentrationThresholdPercent: number
): number {
  return Math.min(100, concentrationThresholdPercent + 20);
}
