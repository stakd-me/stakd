"use client";

import Link from "next/link";
import { Compass } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";

export default function AppNotFound() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center border border-border bg-bg-card px-6 py-10 text-center">
      <Compass className="h-6 w-6 text-text-muted" aria-hidden="true" />
      <h1 className="mt-3 text-heading text-text-primary">
        {t("nav.notFoundTitle")}
      </h1>
      <p className="mt-1.5 max-w-sm text-body text-text-secondary">
        {t("nav.notFoundBody")}
      </p>
      <Link
        href="/dashboard"
        className="mt-4 inline-flex h-control-md items-center border border-border px-3.5 text-body font-semibold text-text-primary hover:bg-bg-hover"
      >
        {t("nav.backToDashboard")}
      </Link>
    </div>
  );
}
