"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { GuideSection } from "@/components/guide/guide-section";
import { useTranslation } from "@/hooks/use-translation";
import { ArrowRight } from "lucide-react";

export default function AppGuidePage() {
  const { t } = useTranslation();
  const tocItems = [
    { id: "quick-start", label: t("appGuide.quickStart") },
    { id: "daily-ops", label: t("appGuide.dailyOperations") },
    { id: "reports", label: t("appGuide.reports") },
    { id: "manual-execution", label: t("appGuide.manualExecution") },
    { id: "reconciliation", label: t("appGuide.reconciliation") },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("appGuide.title")}
        description={t("appGuide.subtitle")}
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <div className="overflow-x-auto lg:hidden">
          <div className="flex min-w-max gap-2">
            {tocItems.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="rounded-full border border-border-subtle bg-bg-card px-3 py-1.5 text-sm text-text-subtle transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <div className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-6 space-y-1 rounded-lg border border-border-subtle bg-bg-card p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-dim">
              {t("appGuide.toc")}
            </p>
            {tocItems.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="block rounded-md px-2 py-1.5 text-sm text-text-subtle transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-10">
          <GuideSection id="quick-start" title={t("appGuide.quickStart")}>
            <Card>
              <CardContent className="space-y-2 pt-6 text-sm text-text-muted">
                <p>{t("appGuide.quickStartStep1")}</p>
                <p>{t("appGuide.quickStartStep2")}</p>
                <p>{t("appGuide.quickStartStep3")}</p>
                <p>{t("appGuide.quickStartStep4")}</p>
              </CardContent>
            </Card>
          </GuideSection>

          <GuideSection id="daily-ops" title={t("appGuide.dailyOperations")}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("appGuide.dailyChecklist")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-text-muted">
                <p>{t("appGuide.dailyStep1")}</p>
                <p>{t("appGuide.dailyStep2")}</p>
                <p>{t("appGuide.dailyStep3")}</p>
                <p>{t("appGuide.dailyStep4")}</p>
              </CardContent>
            </Card>
          </GuideSection>

          <GuideSection
            id="reports"
            title={t("appGuide.reports")}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("appGuide.reportsHowTo")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-text-muted">
                <p>{t("appGuide.reportsStep1")}</p>
                <p>{t("appGuide.reportsStep2")}</p>
                <p>{t("appGuide.reportsStep3")}</p>
                <p>{t("appGuide.reportsStep4")}</p>
                <p>{t("appGuide.reportsStep5")}</p>
                <p>{t("appGuide.reportsStep6")}</p>
                <p>{t("appGuide.reportsStep7")}</p>
                <div className="pt-1">
                  <Link href="/reports">
                    <Button variant="outline" size="sm">
                      {t("appGuide.openReports")}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </GuideSection>

          <GuideSection id="manual-execution" title={t("appGuide.manualExecution")}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("appGuide.important")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-text-muted">
                <p>{t("appGuide.manualExecutionIntro")}</p>
                <p>{t("appGuide.manualStep1")}</p>
                <p>{t("appGuide.manualStep2")}</p>
                <p>{t("appGuide.manualStep3")}</p>
                <p>{t("appGuide.manualStep4")}</p>
              </CardContent>
            </Card>
          </GuideSection>

          <GuideSection id="reconciliation" title={t("appGuide.reconciliation")}>
            <Card>
              <CardContent className="space-y-2 pt-6 text-sm text-text-muted">
                <p>{t("appGuide.reconciliationStep1")}</p>
                <p>{t("appGuide.reconciliationStep2")}</p>
                <p>{t("appGuide.reconciliationStep3")}</p>
                <p>{t("appGuide.reconciliationStep4")}</p>
              </CardContent>
            </Card>
          </GuideSection>
        </div>
      </div>
    </div>
  );
}
