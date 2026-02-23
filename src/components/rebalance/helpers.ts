export function getDeviationColor(deviation: number) {
  const abs = Math.abs(deviation);
  if (abs <= 1) return "text-text-subtle";
  if (deviation > 0) {
    if (abs <= 5) return "text-status-warning";
    return "text-status-negative";
  }
  return "text-status-info";
}

export function getDeviationBg(deviation: number) {
  const abs = Math.abs(deviation);
  if (abs <= 1) return "bg-bg-card/40";
  if (deviation > 0) {
    if (abs <= 5) return "bg-status-warning-soft";
    return "bg-status-negative-soft";
  }
  return "bg-status-info-soft";
}

export function getActionBadge(action: string) {
  switch (action) {
    case "buy":
      return "bg-status-positive-soft text-status-positive border-status-positive-border";
    case "sell":
      return "bg-status-negative-soft text-status-negative border-status-negative-border";
    default:
      return "bg-bg-muted/20 text-text-subtle border-border/30";
  }
}

export function getSeverityBadge(severity: string) {
  switch (severity) {
    case "high":
      return "bg-status-negative-soft text-status-negative border-status-negative-border";
    case "medium":
      return "bg-status-warning-soft text-status-warning border-status-warning-border";
    default:
      return "bg-status-info-soft text-status-info border-status-info-border";
  }
}

export function getAlertTypeLabel(type: string) {
  switch (type) {
    case "concentration_token":
      return "Token Concentration";
    default:
      return "Deviation";
  }
}
