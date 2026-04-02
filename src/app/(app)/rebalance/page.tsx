"use client";

import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionNavigator, SectionPanel } from "@/components/ui/section-navigator";
import { StatusPill } from "@/components/ui/status-pill";
import { StatusBanner } from "@/components/ui/status-banner";
import { formatUsd, formatTimeAgo } from "@/lib/utils";
import { Clock } from "lucide-react";
import { Skeleton, CardSkeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTranslation } from "@/hooks/use-translation";
import { useRebalance } from "@/hooks/use-rebalance";

// Critical sections - imported directly
import { TargetAllocationSection } from "@/components/rebalance/target-allocation-section";
import { AlertsSection } from "@/components/rebalance/alerts-section";
import { SummarySection } from "@/components/rebalance/summary-section";
import { CurrentVsTargetSection } from "@/components/rebalance/current-vs-target-section";
import { ExecutionPlanSection } from "@/components/rebalance/execution-plan-section";
import { ActiveSessionsSection } from "@/components/rebalance/active-sessions-section";
import { UntargetedTokensSection } from "@/components/rebalance/untargeted-tokens-section";
import { RebalanceConfigurationSection } from "@/components/rebalance/rebalance-configuration-section";

// Non-critical sections - lazy loaded
const WhatIfCalculatorSection = dynamic(
  () => import("@/components/rebalance/what-if-calculator-section").then((m) => ({ default: m.WhatIfCalculatorSection })),
);
const PastSessionsSection = dynamic(
  () => import("@/components/rebalance/past-sessions-section").then((m) => ({ default: m.PastSessionsSection })),
);
const RiskParityTargetsSection = dynamic(
  () => import("@/components/rebalance/risk-parity-targets-section").then((m) => ({ default: m.RiskParityTargetsSection })),
);
const TargetVsCurrentChartSection = dynamic(
  () => import("@/components/rebalance/target-vs-current-chart-section").then((m) => ({ default: m.TargetVsCurrentChartSection })),
  { ssr: false },
);
const DcaScheduleSection = dynamic(
  () => import("@/components/rebalance/dca-schedule-section").then((m) => ({ default: m.DcaScheduleSection })),
);
const RebalanceHistorySection = dynamic(
  () => import("@/components/rebalance/rebalance-history-section").then((m) => ({ default: m.RebalanceHistorySection })),
);

// ── Page Component ──────────────────────────────────────────────

export default function RebalancePage() {
  const phasesBaseId = "rebalance-phases";
  const { t } = useTranslation();
  const rb = useRebalance();

  const severityLabels = {
    high: t("common.severityHigh"),
    medium: t("common.severityMedium"),
    low: t("common.severityLow"),
  } as const;

  // ── Loading / error states ───────────────────────────────────

  if (rb.pricesLoading && rb.vault.rebalanceTargets.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("rebalance.title")}
          description={t("rebalance.subtitle")}
        />
        <CardSkeleton />
        <div className="rounded-lg border border-border bg-bg-card p-6">
          <Skeleton className="mb-4 h-5 w-40" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 1. Header + Log Snapshot ─────────────────────────── */}
      <PageHeader
        title={t("rebalance.title")}
        description={t("rebalance.subtitle")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={rb.handleLogSnapshot}
            disabled={rb.logPending}
            title={t("rebalance.snapshotTooltip")}
          >
            <Clock className="mr-2 h-4 w-4" />
            {rb.logPending ? t("rebalance.logging") : t("rebalance.logSnapshot")}
          </Button>
        }
      />

      {/* ── 2. Info Bar ──────────────────────────────────────── */}
      {rb.suggestionsData && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-subtle">
          {rb.suggestionsData?.buyOnlyMode && (
            <StatusPill tone="info">
              {t("rebalance.buyOnlyMode")}
            </StatusPill>
          )}
          {rb.suggestionsData?.rebalanceStrategy && rb.suggestionsData.rebalanceStrategy !== "threshold" && (
            <StatusPill tone="info">
              {rb.suggestionsData.rebalanceStrategy === "calendar" && t("rebalance.strategyCalendar")}
              {rb.suggestionsData.rebalanceStrategy === "percent-of-portfolio" && t("rebalance.strategyPercentOfPortfolio")}
              {rb.suggestionsData.rebalanceStrategy === "risk-parity" && t("rebalance.strategyRiskParity")}
              {rb.suggestionsData.rebalanceStrategy === "dca-weighted" && t("rebalance.strategyDcaWeighted")}
            </StatusPill>
          )}
          {rb.suggestionsData.lastRebalanceTime && (
            <span>{t("rebalance.lastRebalance")}: {formatTimeAgo(new Date(rb.suggestionsData.lastRebalanceTime))}</span>
          )}
          {rb.suggestionsData.oldestPriceUpdate && rb.isPriceStale && (
            <StatusPill tone="warning">
              {t("rebalance.prices")}: {formatTimeAgo(new Date(rb.suggestionsData.oldestPriceUpdate))}
            </StatusPill>
          )}
        </div>
      )}

      <SectionNavigator
        baseId={phasesBaseId}
        label={t("rebalance.focusView")}
        value={rb.activePhase}
        onChange={(value) => {
          rb.setActivePhase(value);
          rb.setPhaseInitialized(true);
        }}
        options={rb.phaseOptions}
        columnsClassName="grid-cols-2 xl:grid-cols-4"
      />

      <SectionPanel baseId={phasesBaseId} value={rb.activePhase}>
      {/* ── 3. Target Allocation ─────────────────────────────── */}
      {rb.showSetupPhase && (
        <TargetAllocationSection
          targets={rb.targets}
          setTargets={rb.setTargets}
          totalPercent={rb.totalPercent}
          expanded={rb.targetExpanded}
          onToggleExpanded={rb.handleToggleTargetExpanded}
          stablecoinQuickAdd={rb.stablecoinQuickAdd}
          onAddStablecoinTarget={rb.handleAddStablecoinTarget}
          suggestionsData={rb.suggestionsData}
          groups={rb.groups}
          autocompleteData={rb.autocompleteData}
          activeAutocompleteIndex={rb.activeAutocompleteIndex}
          setActiveAutocompleteIndex={rb.setActiveAutocompleteIndex}
          autocompleteQuery={rb.autocompleteQuery}
          setAutocompleteQuery={rb.setAutocompleteQuery}
          onSave={rb.handleSave}
          savePending={rb.savePending}
          saveError={rb.saveError !== null}
          saveErrorMessage={rb.saveError ?? undefined}
          onAutoGenerate={rb.handleAutoGenerate}
        />
      )}

      {/* ── 4. Untargeted Tokens ────────────────────────────── */}
      {rb.showSetupPhase && rb.untargetedSuggestions.length > 0 && (
        <UntargetedTokensSection
          suggestions={rb.untargetedSuggestions}
          isTargeted={(tokenSymbol) =>
            rb.targetedSymbolsUpper.has(tokenSymbol.trim().toUpperCase())
          }
          onAddTarget={rb.addTargetFromUntargeted}
        />
      )}

      {/* ── 5. Configuration Blocks ─────────────────────────── */}
      {rb.showSetupPhase && (
        <RebalanceConfigurationSection
          tokenGroupsProps={{
            groups: rb.groups,
            onCreateGroup: rb.handleCreateGroup,
            onUpdateGroup: rb.handleUpdateGroup,
            onTrackGroup: rb.handleTrackGroup,
            trackPendingGroupId: rb.groupTrackPendingId,
            createPending: rb.groupCreatePending,
            updatePending: rb.groupUpdatePending,
            onConfirmDelete: (id, label) =>
              rb.setConfirmState({ type: "group", id, label }),
            deletePending: rb.groupDeletePending,
          }}
          assetCategoriesProps={{
            categories: rb.categories,
            categoryBreakdown: rb.categoryBreakdown,
            symbolOptions: rb.tokenSymbolOptions,
            onSetCategory: rb.handleSetCategory,
            setCategoryPending: rb.categorySetPending,
            onConfirmDelete: (tokenSymbol, label) =>
              rb.setConfirmState({ type: "category", id: tokenSymbol, label }),
            deletePending: rb.categoryDeletePending,
          }}
        />
      )}

      {/* ── Calendar-Blocked Notice ─────────────────────────── */}
      {rb.showAnalysisPhase && rb.suggestionsData?.calendarBlocked && (
        <StatusBanner
          tone="warning"
          heading={t("rebalance.waitingForNext")}
          icon={<Clock className="h-5 w-5" />}
        >
          <p className="text-sm text-text-subtle">
            {t("rebalance.calendarActive")}{" "}
            <span className="font-medium text-text-primary">
              {rb.suggestionsData.nextRebalanceDate || t("rebalance.notSet")}
            </span>
          </p>
        </StatusBanner>
      )}

      {/* ── Risk-Parity Targets Info ──────────────────────────── */}
      {rb.showAnalysisPhase && rb.suggestionsData?.riskParityTargets && rb.suggestionsData.riskParityTargets.length > 0 && (() => {
        const usesFallback = rb.suggestionsData.riskParityTargets.some(
          (target) => !target.hasVolatilityData
        );
        return (
          <RiskParityTargetsSection
            targets={rb.suggestionsData.riskParityTargets}
            usesFallback={usesFallback}
          />
        );
      })()}

      {rb.showAnalysisPhase && rb.suggestionsData ? (
        <AlertsSection
          alertsError={false}
          concentrationAlerts={rb.concentrationAlerts}
          deviationAlerts={rb.deviationAlerts}
          concentrationThresholdLabel={rb.concentrationThresholdLabel}
          severityLabels={severityLabels}
        />
      ) : null}

      {rb.showAnalysisPhase && rb.suggestionsData?.summary ? (
        <SummarySection
          summary={rb.suggestionsData.summary}
          hasConcentrationRisk={rb.hasConcentrationRisk}
          concentrationThresholdLabel={rb.concentrationThresholdLabel}
          hasTargetedSuggestions={rb.targetedSuggestions.length > 0}
        />
      ) : null}

      {/* ── 5. Chart ─────────────────────────────────────────── */}
      {rb.showAnalysisPhase ? (
        <TargetVsCurrentChartSection
          chartData={rb.chartData}
          summary={rb.targetVsCurrentChartSummary}
        />
      ) : null}

      {/* ── 6. Current vs Target Table ───────────────────────── */}
      {rb.showAnalysisPhase && rb.suggestionsData && rb.targetedSuggestions.length > 0 && !rb.suggestionsData.summary?.isWellBalanced && (
        <CurrentVsTargetSection
          totalValue={rb.suggestionsData.totalValue}
          suggestionsLoading={rb.suggestionsLoading}
          suggestions={rb.targetedSuggestionsSorted}
          onExportReport={rb.handleExportReport}
          onExportCsv={rb.handleExportCsv}
          formatSuggestionTradeQuantity={rb.formatSuggestionTradeQuantity}
        />
      )}

      {/* ── 7. Execution Plan ────────────────────────────────── */}
      {rb.showExecutionPhase && rb.suggestionsData?.executionSteps && rb.suggestionsData.executionSteps.length > 0 && !rb.suggestionsData.summary?.isWellBalanced && (
        <ExecutionPlanSection steps={rb.suggestionsData.executionSteps} />
      )}

      {/* ── DCA Schedule ─────────────────────────────────────── */}
      {rb.showAnalysisPhase &&
      rb.suggestionsData?.dcaChunks &&
      rb.suggestionsData.dcaChunks.length > 0 ? (
        <DcaScheduleSection
          chunks={rb.suggestionsData.dcaChunks}
          totalChunks={rb.suggestionsData.dcaTotalChunks ?? 0}
          intervalDays={rb.suggestionsData.dcaIntervalDays ?? 0}
        />
      ) : null}

      {rb.showExecutionPhase ? (
        <ActiveSessionsSection
          showStartExecutionCallout={
            rb.hasActionableSuggestions &&
            rb.activeSessions.length === 0 &&
            !rb.suggestionsData?.summary?.isWellBalanced
          }
          startSessionPending={rb.startSessionPending}
          activeSessions={rb.activeSessions}
          completeSessionPending={rb.completeSessionPending}
          recordingSessionId={rb.recordingSessionId}
          recordingTrades={rb.recordingTrades}
          recordTransactionsPending={rb.recordTransactionsPending}
          onStartSession={rb.handleStartSession}
          onToggleTrade={rb.handleToggleTrade}
          onCompleteSession={rb.handleCompleteSession}
          onStartRecording={rb.handleStartRecordingSession}
          onUpdateRecordingTrade={rb.handleUpdateRecordingTrade}
          onSaveRecordedTrades={rb.handleSaveRecordedTrades}
          onCancelRecording={rb.handleCancelRecordingSession}
        />
      ) : null}

      {/* ── 9. Past Sessions ─────────────────────────────────── */}
      {rb.showExecutionPhase && (
        <PastSessionsSection
          pastSessions={rb.pastSessions}
          onConfirmDelete={(id, label) =>
            rb.setConfirmState({ type: "session", id, label })
          }
          deletePending={rb.deleteSessionPending}
        />
      )}

      {/* ── 14. What-If Calculator ───────────────────────────── */}
      {rb.showAnalysisPhase && (
        <WhatIfCalculatorSection symbolOptions={rb.tokenSymbolOptions} />
      )}

      {/* ── 15. Rebalance History ────────────────────────────── */}
      {rb.showAnalysisPhase ? <RebalanceHistorySection logs={rb.logs} /> : null}

      {/* ── 16. Empty state ──────────────────────────────────── */}
      {(!rb.suggestionsData || rb.suggestionsData.targets.length === 0) &&
        rb.targets.length === 0 && (
          <EmptyState
            title={t("rebalance.emptyState")}
            description={t("rebalance.emptyStateHelp")}
            action={
              <Button
                size="sm"
                onClick={() => {
                  rb.setActivePhase("setup");
                  rb.setPhaseInitialized(true);
                }}
              >
                {t("rebalance.phaseSetup")}
              </Button>
            }
            className="py-12"
          />
        )}
      </SectionPanel>

      {/* ── Confirm Dialog ───────────────────────────────────── */}
      <ConfirmDialog
        open={rb.confirmState !== null}
        onConfirm={rb.handleConfirmDelete}
        onCancel={() => rb.setConfirmState(null)}
        title={`${t("rebalance.delete")} ${rb.confirmState?.label ?? t("rebalance.item")}?`}
        description={t("rebalance.cannotBeUndone")}
        confirmLabel={t("rebalance.delete")}
        variant="danger"
      />
    </div>
  );
}
