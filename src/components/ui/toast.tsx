"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastContextValue {
  toast: (message: string, type?: Toast["type"]) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t: translate } = useTranslation();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toastItem) => {
          const Icon =
            toastItem.type === "success"
              ? CheckCircle
              : toastItem.type === "error"
                ? AlertCircle
                : Info;
          return (
            <div
              key={toastItem.id}
              role={toastItem.type === "error" ? "alert" : "status"}
              aria-live={toastItem.type === "error" ? "assertive" : "polite"}
              aria-atomic="true"
              className={cn(
                "flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg animate-slide-in-right",
                "min-w-[280px] max-w-[420px]",
                {
                  "border-status-positive-border bg-status-positive-soft text-status-positive":
                    toastItem.type === "success",
                  "border-status-negative-border bg-status-negative-soft text-status-negative":
                    toastItem.type === "error",
                  "border-border bg-bg-input/90 text-text-tertiary":
                    toastItem.type === "info",
                }
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1 text-sm">{toastItem.message}</span>
              <button
                type="button"
                onClick={() => dismiss(toastItem.id)}
                className="shrink-0 rounded p-0.5 hover:bg-white/10"
                aria-label={translate("common.close")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
