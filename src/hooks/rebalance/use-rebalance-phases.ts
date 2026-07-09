"use client";

import { useEffect, useMemo } from "react";
import { useTranslation } from "@/hooks/use-translation";
import type {
  Alert,
  RebalanceLog,
  RebalanceSession,
  Suggestion,
  SuggestionsData,
  TargetRow,
  TokenCategory,
  TokenGroup,
} from "@/components/rebalance/types";

export type RebalancePhase = "setup" | "analysis" | "execution" | "all";

interface RebalancePhaseInputs {
  activePhase: RebalancePhase;
  setActivePhase: (phase: RebalancePhase) => void;
  phaseInitialized: boolean;
  setPhaseInitialized: (initialized: boolean) => void;
  targets: TargetRow[];
  groups: TokenGroup[];
  categories: TokenCategory[];
  logs: RebalanceLog[];
  allAlerts: Alert[];
  concentrationAlerts: Alert[];
  targetedSuggestions: Suggestion[];
  untargetedSuggestions: Suggestion[];
  suggestionsData: SuggestionsData | undefined;
  activeSessions: RebalanceSession[];
  pastSessions: RebalanceSession[];
}

/**
 * Phase navigation for the rebalance screen: picks the initial phase from
 * the vault contents and derives per-phase visibility flags and counts.
 */
export function useRebalancePhases({
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
}: RebalancePhaseInputs) {
  const { t } = useTranslation();

  useEffect(() => {
    if (phaseInitialized) return;

    if (activeSessions.length > 0) {
      setActivePhase("execution");
      setPhaseInitialized(true);
      return;
    }

    if (targetedSuggestions.length > 0 || allAlerts.length > 0) {
      setActivePhase("analysis");
      setPhaseInitialized(true);
      return;
    }

    if (
      targets.length > 0 ||
      untargetedSuggestions.length > 0 ||
      groups.length > 0 ||
      categories.length > 0
    ) {
      setPhaseInitialized(true);
    }
  }, [
    activeSessions.length,
    allAlerts.length,
    categories.length,
    groups.length,
    phaseInitialized,
    setActivePhase,
    setPhaseInitialized,
    targetedSuggestions.length,
    targets.length,
    untargetedSuggestions.length,
  ]);

  const showSetupPhase = activePhase === "all" || activePhase === "setup";
  const showAnalysisPhase = activePhase === "all" || activePhase === "analysis";
  const showExecutionPhase = activePhase === "all" || activePhase === "execution";

  const setupPhaseCount =
    targets.length +
    untargetedSuggestions.length +
    groups.length +
    categories.length;
  const analysisPhaseCount =
    targetedSuggestions.length +
    concentrationAlerts.length +
    (suggestionsData?.dcaChunks?.length ?? 0) +
    logs.length;
  const executionPhaseCount =
    (suggestionsData?.executionSteps?.length ?? 0) +
    activeSessions.length +
    pastSessions.length;
  const phaseOptions = useMemo(
    () => [
      {
        value: "setup" as const,
        label: t("rebalance.phaseSetup"),
        count: setupPhaseCount,
      },
      {
        value: "analysis" as const,
        label: t("rebalance.phaseAnalysis"),
        count: analysisPhaseCount,
      },
      {
        value: "execution" as const,
        label: t("rebalance.phaseExecution"),
        count: executionPhaseCount,
      },
      {
        value: "all" as const,
        label: t("rebalance.viewAll"),
        count: setupPhaseCount + analysisPhaseCount + executionPhaseCount,
      },
    ],
    [
      analysisPhaseCount,
      executionPhaseCount,
      setupPhaseCount,
      t,
    ]
  );

  return {
    showSetupPhase,
    showAnalysisPhase,
    showExecutionPhase,
    phaseOptions,
  };
}
