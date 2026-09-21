import { useTranslation } from "@/hooks/use-translation";

/**
 * Shown while the session is being restored. The app used to render a
 * bare "Loading…" string here and in src/app/page.tsx, with no branding
 * and nothing to look at.
 */
export function AppSplash() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg-page">
      <div className="text-display-sm uppercase text-text-primary">
        {t("nav.title")}
      </div>
      <div className="h-px w-40 bg-border" />
      <div className="font-mono text-meta uppercase text-text-muted">
        {t("common.loading")}
      </div>
    </div>
  );
}
