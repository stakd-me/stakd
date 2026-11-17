"use client";

import { Eye, EyeOff } from "lucide-react";
import { usePrivacy } from "@/hooks/use-privacy";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

export function PrivacyToggle() {
  const { hidden, toggle } = usePrivacy();
  const { t } = useTranslation();
  const label = hidden ? t("privacy.showValues") : t("privacy.hideValues");

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-control-sm w-control-sm items-center justify-center border border-border-subtle text-text-secondary",
        "transition-colors duration-[120ms] ease-out hover:bg-bg-hover hover:text-text-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page",
        hidden && "border-accent text-accent"
      )}
    >
      {hidden ? (
        <EyeOff className="h-[15px] w-[15px]" aria-hidden="true" />
      ) : (
        <Eye className="h-[15px] w-[15px]" aria-hidden="true" />
      )}
    </button>
  );
}
