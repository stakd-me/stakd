"use client";

import { useState, useCallback, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PriceFlashProps {
  value: number;
  children: ReactNode;
  className?: string;
}

type Flash = "up" | "down" | null;

export function PriceFlash({ value, children, className }: PriceFlashProps) {
  const [prev, setPrev] = useState(value);
  const [flash, setFlash] = useState<Flash>(null);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  if (prev !== value) {
    setPrev(value);
    setFlash(value > prev ? "up" : "down");

    if (timer) clearTimeout(timer);
    setTimer(
      setTimeout(() => {
        setFlash(null);
        setTimer(null);
      }, 800)
    );
  }

  // Allow parent className to override flash color when flash is inactive
  const flashClass = useCallback(() => {
    if (flash === "up") return "text-status-positive";
    if (flash === "down") return "text-status-negative";
    return undefined;
  }, [flash]);

  return (
    <span
      className={cn(
        "transition-colors duration-700",
        flashClass(),
        className,
      )}
    >
      {children}
    </span>
  );
}
