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

export type RebalancePhase = "setup" | "analysis" | "execution";

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

  const showSetupPhase = activePhase === "setup";
  const showAnalysisPhase = activePhase === "analysis";
  const showExecutionPhase = activePhase === "execution";

  const setupPhaseCount =
    targets.length +
    untargetedSuggestions.length +
    groups.length +
    categories.length;
  const analysisPhaseCount =
    targetedSuggestions.length + concentrationAlerts.length;
  // DCA chunks and the session log belong to Execute, where they are read.
  const executionPhaseCount =
    (suggestionsData?.executionSteps?.length ?? 0) +
    (suggestionsData?.dcaChunks?.length ?? 0) +
    activeSessions.length +
    pastSessions.length +
    logs.length;
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
    ],
    [
      analysisPhaseCount,
      executionPhaseCount,
      setupPhaseCount,
      t,
    ]
  );

  // A step is done once the flow has moved past it, which is what a
  // stepper's tick means — not "this section has rows in it".
  const phaseSteps = useMemo(() => {
    const order: RebalancePhase[] = ["setup", "analysis", "execution"];
    const activeIndex = order.indexOf(activePhase);
    return phaseOptions.map((option, index) => ({
      id: option.value,
      title: option.label,
      caption: option.count > 0 ? String(option.count) : undefined,
      done: index < activeIndex,
    }));
  }, [activePhase, phaseOptions]);

  return {
    showSetupPhase,
    showAnalysisPhase,
    showExecutionPhase,
    phaseOptions,
    phaseSteps,
  };
}
