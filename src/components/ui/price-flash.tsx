"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PriceFlashProps {
  value: number;
  children: ReactNode;
  className?: string;
}

type Flash = "up" | "down" | null;

const FLASH_MS = 800;

export function PriceFlash({ value, children, className }: PriceFlashProps) {
  const [prev, setPrev] = useState(value);
  const [flash, setFlash] = useState<Flash>(null);

  // Deriving the flash from a changed prop during render is fine; starting
  // a timer here is not — that belongs in the effect below.
  if (prev !== value) {
    setPrev(value);
    setFlash(value > prev ? "up" : "down");
  }

  // Keyed on `prev` so every new value restarts the fade-out, and the
  // cleanup cancels the timer on unmount or a newer tick.
  useEffect(() => {
    if (flash === null) return;
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash, prev]);

  return (
    <span
      className={cn(
        "transition-colors duration-700",
        flash === "up" && "text-status-positive",
        flash === "down" && "text-status-negative",
        className
      )}
    >
      {children}
    </span>
  );
}
