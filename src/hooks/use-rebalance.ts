"use client";

import { useState, useCallback } from "react";
import type { ConfirmState } from "@/components/rebalance/types";
import { useRebalanceCore } from "@/hooks/rebalance/use-rebalance-core";
import { useRebalanceSuggestions } from "@/hooks/rebalance/use-rebalance-suggestions";
import { useRebalanceGroups } from "@/hooks/rebalance/use-rebalance-groups";
import { useRebalanceTargets } from "@/hooks/rebalance/use-rebalance-targets";
import { useRebalanceCategories } from "@/hooks/rebalance/use-rebalance-categories";
import { useRebalanceLogs } from "@/hooks/rebalance/use-rebalance-logs";
import { useRebalanceSessions } from "@/hooks/rebalance/use-rebalance-sessions";
import { useRebalancePhases } from "@/hooks/rebalance/use-rebalance-phases";
import type { RebalancePhase } from "@/hooks/rebalance/use-rebalance-phases";
import { useRebalanceExport } from "@/hooks/rebalance/use-rebalance-export";

export type { RebalancePhase } from "@/hooks/rebalance/use-rebalance-phases";

/**
 * Composition root for the rebalance screen. The heavy lifting lives in
 * the focused sub-hooks under `src/hooks/rebalance/` and the pure helpers
 * in `src/lib/services/rebalance-view.ts`; this hook wires them together
 * and exposes the single view-model consumed by the rebalance page.
 */
export function useRebalance() {
  const [activePhase, setActivePhase] = useState<RebalancePhase>("setup");
  const [phaseInitialized, setPhaseInitialized] = useState(false);

  // Delete confirmation
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const core = useRebalanceCore();
  const {
    vault,
    pricesLoading,
    rebalanceStrategy,
    holdZonePercent,
    concentrationThresholdLabel,
    getRoundedSuggestionTradeQuantity,
    formatSuggestionTradeQuantity,
  } = core;

  const {
    strategyContext,
    suggestionsData,
    alertsData,
    allAlerts,
    deviationAlerts,
    concentrationAlerts,
    hasConcentrationRisk,
    targetedSuggestions,
    targetedSuggestionsSorted,
    actionableSuggestions,
    hasActionableSuggestions,
    maxDeviation,
    totalSuggestedVolume,
    untargetedSuggestions,
    suggestionsLoading,
    isPriceStale,
    chartData,
    targetVsCurrentChartSummary,
  } = useRebalanceSuggestions(core);

  const {
    groups,
    groupCreatePending,
    groupUpdatePending,
    groupDeletePending,
    groupTrackPendingId,
    handleCreateGroup,
    handleUpdateGroup,
    handleTrackGroup,
    handleDeleteGroup,
  } = useRebalanceGroups(core);

  const {
    targets,
    setTargets,
    targetExpanded,
    activeAutocompleteIndex,
    setActiveAutocompleteIndex,
    autocompleteQuery,
    setAutocompleteQuery,
    autocompleteData,
    savePending,
    saveError,
    totalPercent,
    stablecoinQuickAdd,
    targetedSymbolsUpper,
    handleToggleTargetExpanded,
    handleSave,
    handleAutoGenerate,
    addTargetFromUntargeted,
    handleAddStablecoinTarget,
  } = useRebalanceTargets(core, strategyContext, groups);

  const {
    categories,
    categoryBreakdown,
    tokenSymbolOptions,
    categorySetPending,
    categoryDeletePending,
    handleSetCategory,
    handleDeleteCategory,
  } = useRebalanceCategories(core, targets);

  const { logs, logPending, handleLogSnapshot } = useRebalanceLogs(
    core,
    strategyContext
  );

  const {
    allSessions,
    activeSessions,
    pastSessions,
    recordingSessionId,
    recordingTrades,
    startSessionPending,
    completeSessionPending,
    deleteSessionPending,
    recordTransactionsPending,
    handleStartSession,
    handleToggleTrade,
    handleCompleteSession,
    handleDeleteSession,
    handleStartRecordingSession,
    handleUpdateRecordingTrade,
    handleSaveRecordedTrades,
    handleCancelRecordingSession,
  } = useRebalanceSessions(
    core,
    suggestionsData,
    setActivePhase,
    setPhaseInitialized
  );

  const {
    showSetupPhase,
    showAnalysisPhase,
    showExecutionPhase,
    phaseOptions,
    phaseSteps,
  } = useRebalancePhases({
    activePhase,
    setActivePhase,
    phaseInitialized,
    setPhaseInitialized,
    targets,
    groups,
    categories,
    logs,
    allAlerts,
    concentrationAlerts,
    targetedSuggestions,
    untargetedSuggestions,
    suggestionsData,
    activeSessions,
    pastSessions,
  });

  const { handleExportReport, handleExportCsv } = useRebalanceExport(
    suggestionsData,
    rebalanceStrategy,
    formatSuggestionTradeQuantity,
    getRoundedSuggestionTradeQuantity
  );

  const handleConfirmDelete = useCallback(() => {
    if (!confirmState) return;
    switch (confirmState.type) {
      case "session":
        handleDeleteSession(confirmState.id);
        break;
      case "group":
        handleDeleteGroup(confirmState.id);
        break;
      case "category":
        handleDeleteCategory(confirmState.id as string);
        break;
    }
    setConfirmState(null);
  }, [confirmState, handleDeleteSession, handleDeleteGroup, handleDeleteCategory]);

  return {
    // State
    targets, setTargets,
    targetExpanded,
    activePhase, setActivePhase,
    phaseInitialized, setPhaseInitialized,
    recordingSessionId,
    recordingTrades,
    confirmState, setConfirmState,
    activeAutocompleteIndex, setActiveAutocompleteIndex,
    autocompleteQuery, setAutocompleteQuery,

    // Pending states
    savePending, saveError,
    logPending,
    groupCreatePending, groupUpdatePending, groupDeletePending,
    groupTrackPendingId,
    categorySetPending, categoryDeletePending,
    startSessionPending, completeSessionPending, deleteSessionPending,
    recordTransactionsPending,

    // Computed
    vault,
    pricesLoading,
    suggestionsData,
    alertsData,
    allAlerts,
    deviationAlerts,
    concentrationAlerts,
    hasConcentrationRisk,
    concentrationThresholdLabel,
    holdZonePercent,
    rebalanceStrategy,
    totalPercent,
    stablecoinQuickAdd,
    groups,
    autocompleteData,
    categories,
    categoryBreakdown,
    tokenSymbolOptions,
    logs,
    allSessions,
    targetedSuggestions,
    targetedSuggestionsSorted,
    actionableSuggestions,
    hasActionableSuggestions,
    maxDeviation,
    totalSuggestedVolume,
    untargetedSuggestions,
    targetedSymbolsUpper,
    suggestionsLoading,
    isPriceStale,
    activeSessions,
    pastSessions,
    chartData,
    targetVsCurrentChartSummary,
    showSetupPhase,
    showAnalysisPhase,
    showExecutionPhase,
    phaseOptions,
    phaseSteps,

    // Handlers
    handleToggleTargetExpanded,
    handleSave,
    handleLogSnapshot,
    handleCreateGroup,
    handleUpdateGroup,
    handleTrackGroup,
    handleDeleteGroup,
    handleSetCategory,
    handleDeleteCategory,
    handleStartSession,
    handleToggleTrade,
    handleCompleteSession,
    handleDeleteSession,
    handleStartRecordingSession,
    handleUpdateRecordingTrade,
    handleSaveRecordedTrades,
    handleCancelRecordingSession,
    handleAutoGenerate,
    handleAddStablecoinTarget,
    addTargetFromUntargeted,
    handleConfirmDelete,
    handleExportReport,
    handleExportCsv,
    formatSuggestionTradeQuantity,
  };
}
