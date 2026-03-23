"use client";

import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: ReactNode;
  badge?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  baseId: string;
  label: string;
  value: T;
  options: readonly SegmentedControlOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  columnsClassName?: string;
}

export function getSegmentedControlTabId(baseId: string, value: string): string {
  return `${baseId}-tab-${value}`;
}

export function getSegmentedControlPanelId(baseId: string): string {
  return `${baseId}-panel`;
}

export function SegmentedControl<T extends string>({
  baseId,
  label,
  value,
  options,
  onChange,
  className,
  columnsClassName,
}: SegmentedControlProps<T>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const moveToIndex = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    buttonRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const enabledIndices = options.reduce<number[]>((result, option, optionIndex) => {
      if (!option.disabled) {
        result.push(optionIndex);
      }
      return result;
    }, []);

    if (enabledIndices.length === 0) return;

    const currentEnabledIndex = enabledIndices.indexOf(index);
    if (currentEnabledIndex === -1) return;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveToIndex(enabledIndices[(currentEnabledIndex + 1) % enabledIndices.length]);
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveToIndex(
        enabledIndices[
          (currentEnabledIndex - 1 + enabledIndices.length) % enabledIndices.length
        ]
      );
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      moveToIndex(enabledIndices[0]);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      moveToIndex(enabledIndices[enabledIndices.length - 1]);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("grid gap-2", columnsClassName, className)}
    >
      {options.map((option, index) => {
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            id={getSegmentedControlTabId(baseId, option.value)}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={getSegmentedControlPanelId(baseId)}
            tabIndex={isActive ? 0 : -1}
            disabled={option.disabled}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-card",
              isActive
                ? "border-accent bg-accent/10 text-text-primary"
                : "border-border-subtle bg-bg-card text-text-subtle hover:bg-bg-hover hover:text-text-primary",
              option.description
                ? "block"
                : "flex items-center justify-between gap-3 text-sm",
            )}
          >
            {option.description ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium text-text-primary">
                    {option.label}
                  </span>
                  {option.badge ? (
                    <span className="shrink-0">{option.badge}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-text-dim">
                  {option.description}
                </p>
              </>
            ) : (
              <>
                <span className="min-w-0 truncate font-medium">{option.label}</span>
                {option.badge ? <span className="shrink-0">{option.badge}</span> : null}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
