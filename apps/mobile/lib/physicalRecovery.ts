import {
  buildRecoveryDashboardViewModel,
  buildRecoveryInsightDetailViewModel,
  RECOVERY_SUBSTANCE_OPTIONS,
  normalizeRecoverySubstances,
  type RecoveryGaugeTileSummary,
  type RecoverySubstanceCategory,
} from "./recoveryInsights";

export { RECOVERY_SUBSTANCE_OPTIONS, normalizeRecoverySubstances };
export type { RecoverySubstanceCategory };

export type PhysicalRecoveryDetailItem = {
  id: string;
  title: string;
  stageTimeWindow: string;
  summary: string;
  whatMayBeHappening: string[];
  whatMayFeelNormal: string[];
  whatOftenImprovesNext: string[];
  encouragement?: string;
};

export type PhysicalRecoverySubstanceTrack = {
  substance: RecoverySubstanceCategory;
  substanceLabel: string;
  currentStageLabel: string;
  currentWindowLabel: string;
  nextStageLabel: string | null;
  currentStageStartIso: string | null;
  nextStageStartIso: string | null;
};

export type PhysicalRecoveryTileSummary = {
  hasProfile: boolean;
  headline: string;
  stageLabel: string;
  snapshot: string;
  nextLabel: string;
  disclaimer: string;
  ctaLabel: string;
  percent: number | null;
  selectedSubstanceLabel: string | null;
};

export type PhysicalRecoveryViewModel = {
  hasProfile: boolean;
  selectedSubstances: RecoverySubstanceCategory[];
  summary: PhysicalRecoveryTileSummary;
  disclaimer: string;
  currentFocus: PhysicalRecoveryDetailItem | null;
  substanceTracks: PhysicalRecoverySubstanceTrack[];
  detailItems: PhysicalRecoveryDetailItem[];
};

function adaptSummary(summary: RecoveryGaugeTileSummary): PhysicalRecoveryTileSummary {
  return {
    hasProfile: summary.hasProfile,
    headline: summary.label,
    stageLabel: summary.selectedSubstanceLabel
      ? `${summary.selectedSubstanceLabel} • Week ${summary.weekNumber}`
      : "Personalize this guide",
    snapshot: summary.supportiveLine,
    nextLabel: summary.summaryLine,
    disclaimer: summary.educationalNote,
    ctaLabel: summary.hasProfile ? "View guide" : "Open Recovery Settings",
    percent: summary.percent,
    selectedSubstanceLabel: summary.selectedSubstanceLabel,
  };
}

export function buildPhysicalRecoveryViewModel(input: {
  sobrietyDateIso: string | null;
  nowMs: number;
  substances: RecoverySubstanceCategory[];
}): PhysicalRecoveryViewModel {
  const dashboardView = buildRecoveryDashboardViewModel(input);
  const summary = adaptSummary(dashboardView.gauges.PHYSICAL);
  const detail = buildRecoveryInsightDetailViewModel({
    ...input,
    kind: "PHYSICAL",
    selectedSubstance: dashboardView.gauges.PHYSICAL.selectedSubstance,
  });

  const substanceTracks = dashboardView.selectedSubstances.map((substance) => {
    const trackDetail = buildRecoveryInsightDetailViewModel({
      ...input,
      kind: "PHYSICAL",
      selectedSubstance: substance,
    });
    return {
      substance,
      substanceLabel: trackDetail.selectedSubstanceLabel ?? substance,
      currentStageLabel: `Week ${trackDetail.weekNumber}`,
      currentWindowLabel: `~${trackDetail.percent ?? 0}%`,
      nextStageLabel: trackDetail.trendLine,
      currentStageStartIso: null,
      nextStageStartIso: null,
    };
  });

  const detailItems: PhysicalRecoveryDetailItem[] = detail.hasProfile
    ? [
        {
          id: "physical-current",
          title: `${detail.selectedSubstanceLabel} recovery right now`,
          stageTimeWindow: `Week ${detail.weekNumber}`,
          summary: detail.snapshot,
          whatMayBeHappening: detail.whatMayBeImproving,
          whatMayFeelNormal: detail.whatMayStillOccur,
          whatOftenImprovesNext: detail.whatToExpect,
          encouragement: detail.encouragement,
        },
      ]
    : [];

  return {
    hasProfile: detail.hasProfile,
    selectedSubstances: normalizeRecoverySubstances(input.substances),
    summary,
    disclaimer: summary.disclaimer,
    currentFocus:
      detail.hasProfile && detail.selectedSubstanceLabel
        ? {
            id: "physical-focus",
            title: `${detail.selectedSubstanceLabel} recovery right now`,
            stageTimeWindow: `Week ${detail.weekNumber}`,
            summary: detail.snapshot,
            whatMayBeHappening: detail.whatMayBeImproving,
            whatMayFeelNormal: detail.whatMayStillOccur,
            whatOftenImprovesNext: detail.whatToExpect,
            encouragement: detail.encouragement,
          }
        : null,
    substanceTracks,
    detailItems,
  };
}
