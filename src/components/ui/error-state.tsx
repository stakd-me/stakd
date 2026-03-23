"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  actionLabel?: string;
}

export function ErrorState({
  title = "Failed to load data",
  message = "Something went wrong. Please try again.",
  onRetry,
  actionLabel = "Try Again",
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-status-negative-soft">
        <AlertCircle className="h-6 w-6 text-status-negative" />
      </div>
      <p className="mb-2 text-lg font-medium text-text-muted">{title}</p>
      <p className="mb-6 max-w-md text-sm text-text-subtle">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
