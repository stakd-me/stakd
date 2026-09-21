"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import {
  SegmentedControl,
  type SegmentedControlOption,
  getSegmentedControlPanelId,
  getSegmentedControlTabId,
} from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

export interface SectionNavigatorOption<T extends string>
  extends Omit<SegmentedControlOption<T>, "badge"> {
  badge?: ReactNode;
  count?: ReactNode;
}

interface SectionNavigatorProps<T extends string> {
  baseId: string;
  label: string;
  description?: ReactNode;
  value: T;
  options: readonly SectionNavigatorOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  columnsClassName?: string;
}

interface SectionPanelProps<T extends string>
  extends ComponentPropsWithoutRef<"div"> {
  baseId: string;
  value: T;
}

export function SectionNavigator<T extends string>({
  baseId,
  label,
  description,
  value,
  options,
  onChange,
  className,
  columnsClassName,
}: SectionNavigatorProps<T>) {
  const activeDescription =
    options.find((option) => option.value === value)?.description ?? description;

  return (
    <div className={cn("space-y-2", className)}>
      <SegmentedControl
        baseId={baseId}
        label={label}
        value={value}
        onChange={onChange}
        options={options.map((option) => ({
          ...option,
          badge:
            option.badge ??
            (option.count !== undefined ? (
              <span className="rounded-sm border border-border-subtle bg-bg-input px-1.5 font-mono text-[11px] leading-4 text-text-muted">
                {option.count}
              </span>
            ) : undefined),
        }))}
        columnsClassName={columnsClassName}
      />
      {activeDescription ? (
        <p className="text-caption text-text-muted">{activeDescription}</p>
      ) : null}
    </div>
  );
}

export function SectionPanel<T extends string>({
  baseId,
  value,
  className,
  ...props
}: SectionPanelProps<T>) {
  return (
    <div
      id={getSegmentedControlPanelId(baseId)}
      role="tabpanel"
      aria-labelledby={getSegmentedControlTabId(baseId, value)}
      className={cn("space-y-6", className)}
      {...props}
    />
  );
}
