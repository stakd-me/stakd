"use client";

import { useEffect, useState } from "react";

/**
 * Returns a timestamp (ms) that re-renders the component on a fixed interval.
 * Use for time-sensitive UI (stale-price banners, "X minutes ago" labels) that
 * would otherwise show a stale value when no other props change.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
