"use client";

import { useCallback } from "react";
import { usePreferencesStore } from "@/lib/store";

/** Fixed width, so a masked figure leaks nothing about its magnitude. */
export const MASKED_VALUE = "••••••";

/**
 * Privacy mode: hides what the user owns (balances, quantities, P&L in
 * money) while leaving public market data and percentages visible.
 * Wrap a formatted string with `mask()` at the point it is rendered.
 * Forms the user is typing into and exports are deliberately not masked.
 */
export function usePrivacy() {
  const hidden = usePreferencesStore((s) => s.hideValues);
  const setHideValues = usePreferencesStore((s) => s.setHideValues);

  const mask = useCallback(
    (formatted: string) => (hidden ? MASKED_VALUE : formatted),
    [hidden]
  );
  const toggle = useCallback(() => setHideValues(!hidden), [hidden, setHideValues]);

  return { hidden, mask, toggle };
}
