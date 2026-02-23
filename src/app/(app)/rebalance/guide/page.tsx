"use client";

import { useTranslation } from "@/hooks/use-translation";
import { Card, CardContent } from "@/components/ui/card";
import { GuideTOC } from "@/components/guide/guide-toc";
import { GuideSection } from "@/components/guide/guide-section";
import { StrategyComparisonTable } from "@/components/guide/strategy-comparison-table";
import { RiskMetricsAccordion } from "@/components/guide/risk-metrics-accordion";
import { StrategyPickerQuiz } from "@/components/guide/strategy-picker-quiz";
import {
  Target,
  Calendar,
  BarChart3,
  Activity,
  Layers,
  Clock,
  TrendingUp,
  DollarSign,
  GitBranch,
} from "lucide-react";

export default function RebalanceGuidePage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("guide.title")}</h1>
        <p className="text-text-subtle">{t("guide.subtitle")}</p>
      </div>

      <div className="flex gap-8">
        {/* Sticky TOC sidebar */}
        <div className="hidden w-52 shrink-0 lg:block">
          <div className="sticky top-6">
            <GuideTOC />
          </div>
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1 space-y-10">
          {/* Section 1: What is Rebalancing? */}
          <GuideSection id="what-is" title={t("guide.whatIs")}>
            <Card>
              <CardContent className="space-y-3 pt-6">
                <p className="text-text-muted">{t("guide.whatIsDesc")}</p>
                <div className="rounded-lg border border-border bg-bg-card p-4">
                  <p className="text-sm text-text-subtle">{t("guide.whatIsExample")}</p>
                </div>
              </CardContent>
            </Card>
          </GuideSection>

          {/* Section 2: Why Rebalance? */}
          <GuideSection id="why-rebalance" title={t("guide.whyRebalance")}>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { icon: Target, titleKey: "guide.whyRisk" as const, descKey: "guide.whyRiskDesc" as const },
                { icon: TrendingUp, titleKey: "guide.whyDiscipline" as const, descKey: "guide.whyDisciplineDesc" as const },
                { icon: BarChart3, titleKey: "guide.whyTarget" as const, descKey: "guide.whyTargetDesc" as const },
              ].map(({ icon: Icon, titleKey, descKey }) => (
                <Card key={titleKey}>
                  <CardContent className="pt-6">
                    <Icon className="mb-2 h-6 w-6 text-status-info" />
                    <h3 className="mb-1 font-semibold text-text-primary">{t(titleKey)}</h3>
                    <p className="text-sm text-text-muted">{t(descKey)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </GuideSection>

          {/* Section 3: Strategies */}
          <GuideSection id="strategies" title={t("guide.strategies")}>
            <div className="space-y-4">
              {[
                { icon: Target, nameKey: "guide.stratThreshold" as const, descKey: "guide.stratThresholdDesc" as const },
                { icon: Calendar, nameKey: "guide.stratCalendar" as const, descKey: "guide.stratCalendarDesc" as const },
                { icon: BarChart3, nameKey: "guide.stratPercentPortfolio" as const, descKey: "guide.stratPercentPortfolioDesc" as const },
                { icon: Activity, nameKey: "guide.stratRiskParity" as const, descKey: "guide.stratRiskParityDesc" as const },
                { icon: Layers, nameKey: "guide.stratDCA" as const, descKey: "guide.stratDCADesc" as const },
              ].map(({ icon: Icon, nameKey, descKey }) => (
                <Card key={nameKey}>
                  <CardContent className="flex gap-4 pt-6">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-status-info" />
                    <div>
                      <h3 className="mb-1 font-semibold text-text-primary">{t(nameKey)}</h3>
                      <p className="text-sm text-text-muted">{t(descKey)}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </GuideSection>

          {/* Section 4: Comparison Table */}
          <GuideSection id="comparison" title={t("guide.comparison")}>
            <Card>
              <CardContent className="pt-6">
                <StrategyComparisonTable />
              </CardContent>
            </Card>
          </GuideSection>

          {/* Section 5: Risk Metrics */}
          <GuideSection id="risk-metrics" title={t("guide.riskMetrics")}>
            <RiskMetricsAccordion />
          </GuideSection>

          {/* Section 6: Crypto vs Traditional */}
          <GuideSection id="crypto-vs-trad" title={t("guide.cryptoVsTrad")}>
            <Card>
              <CardContent className="space-y-4 pt-6">
                <p className="text-text-muted">{t("guide.cryptoVsTradDesc")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { icon: Clock, titleKey: "guide.crypto247" as const, descKey: "guide.crypto247Desc" as const },
                    { icon: TrendingUp, titleKey: "guide.cryptoVolatility" as const, descKey: "guide.cryptoVolatilityDesc" as const },
                    { icon: DollarSign, titleKey: "guide.cryptoFees" as const, descKey: "guide.cryptoFeesDesc" as const },
                    { icon: GitBranch, titleKey: "guide.cryptoCorrelation" as const, descKey: "guide.cryptoCorrelationDesc" as const },
                  ].map(({ icon: Icon, titleKey, descKey }) => (
                    <div key={titleKey} className="rounded-lg border border-border bg-bg-card p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <Icon className="h-4 w-4 text-text-subtle" />
                        <h4 className="font-medium text-text-primary">{t(titleKey)}</h4>
                      </div>
                      <p className="text-sm text-text-muted">{t(descKey)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </GuideSection>

          {/* Section 7: Strategy Picker Quiz */}
          <GuideSection id="find-strategy" title={t("guide.findStrategy")}>
            <p className="mb-4 text-text-muted">{t("guide.findStrategyDesc")}</p>
            <StrategyPickerQuiz />
          </GuideSection>
        </div>
      </div>
    </div>
  );
}
