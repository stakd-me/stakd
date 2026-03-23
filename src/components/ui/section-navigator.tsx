"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Card } from "@/components/ui/card";
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
  return (
    <Card className={cn("p-4", className)}>
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-text-primary">{label}</p>
          {description ? (
            <p className="text-xs text-text-dim">{description}</p>
          ) : null}
        </div>
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
                <span className="rounded-full bg-bg-muted px-2 py-0.5 text-xs text-text-tertiary">
                  {option.count}
                </span>
              ) : undefined),
          }))}
          columnsClassName={columnsClassName}
        />
      </div>
    </Card>
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
