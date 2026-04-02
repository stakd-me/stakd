"use client";

import { type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

interface AccessibleChartFrameProps {
  title?: string;
  summary: string;
  className?: string;
  children: ReactNode;
}

export function AccessibleChartFrame({
  title,
  summary,
  className,
  children,
}: AccessibleChartFrameProps) {
  const titleId = useId();
  const summaryId = useId();

  return (
    <figure
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={summaryId}
      className={cn("space-y-2", className)}
    >
      {title && (
        <figcaption id={titleId} className="sr-only">
          {title}
        </figcaption>
      )}
      <p id={summaryId} className="sr-only">
        {summary}
      </p>
      <div aria-hidden="true">
        {children}
      </div>
    </figure>
  );
}
