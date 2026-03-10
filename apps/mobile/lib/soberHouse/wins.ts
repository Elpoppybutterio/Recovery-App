import { enumerateMonthDays } from "./monthlyWindow";
import type { HouseMonthlyKpiComputation, ResidentMonthlyKpiComputation } from "./kpis";
import type { ReportWinSummary } from "./types";

function longestConsecutive<T>(items: T[], matches: (item: T) => boolean): number {
  let longest = 0;
  let current = 0;
  for (const item of items) {
    if (matches(item)) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

export function computeResidentMonthlyWins(
  computation: ResidentMonthlyKpiComputation | null,
): ReportWinSummary[] {
  if (!computation) {
    return [];
  }

  const wins: ReportWinSummary[] = [];
  const curfewStreak = longestConsecutive(
    computation.curfewDayResults,
    (entry) => !entry.hadViolation,
  );
  if (curfewStreak > 0 && computation.curfewComplianceRate.denominator !== null) {
    wins.push({
      id: "curfew-streak",
      label: "On-time curfew streak",
      value: `${curfewStreak} day${curfewStreak === 1 ? "" : "s"}`,
      detail: "Longest span in the month without a curfew violation.",
    });
  }

  const choreStreak = longestConsecutive(computation.chorePeriodResults, (entry) => entry.complete);
  if (choreStreak > 0 && computation.chorePeriodResults.length > 0) {
    wins.push({
      id: "chore-streak",
      label: "Chore completion streak",
      value: `${choreStreak} period${choreStreak === 1 ? "" : "s"}`,
      detail: "Consecutive chore periods completed with valid proof.",
    });
  }

  const meetingGoalWeeks = computation.meetingWeekResults.filter((entry) => entry.met).length;
  if (meetingGoalWeeks > 0) {
    wins.push({
      id: "meeting-goal-weeks",
      label: "Meeting goal weeks achieved",
      value: `${meetingGoalWeeks}`,
      detail: "Weeks in the month where the meeting requirement was met.",
    });
  }

  const jobSearchGoalWeeks = computation.jobSearchWeekResults.filter((entry) => entry.met).length;
  if (jobSearchGoalWeeks > 0) {
    wins.push({
      id: "job-search-goal-weeks",
      label: "Job-search goal weeks achieved",
      value: `${jobSearchGoalWeeks}`,
      detail: "Weeks where the application target was met.",
    });
  }

  const violationDays = new Set(
    computation.violationsInPeriod.map((entry) => entry.triggeredAt.slice(0, 10)),
  );
  const zeroViolationSpan = longestConsecutive(
    enumerateMonthDays(computation.window),
    (day) => !violationDays.has(day.toISOString().slice(0, 10)),
  );
  if (zeroViolationSpan > 0) {
    wins.push({
      id: "zero-violation-span",
      label: "Zero-violation span",
      value: `${zeroViolationSpan} day${zeroViolationSpan === 1 ? "" : "s"}`,
      detail: "Longest stretch in the month without any new violation record.",
    });
  }

  const correctiveActionsOnTime = computation.correctiveActionsInPeriod.filter((action) => {
    if (action.status !== "COMPLETED") {
      return false;
    }
    if (!action.dueAt || !action.completedAt) {
      return true;
    }
    return new Date(action.completedAt).getTime() <= new Date(action.dueAt).getTime();
  }).length;
  if (correctiveActionsOnTime > 0) {
    wins.push({
      id: "corrective-actions-on-time",
      label: "Corrective actions completed on time",
      value: `${correctiveActionsOnTime}`,
      detail: "Completed corrective actions closed on or before their due date.",
    });
  }

  const promptAcknowledgments = computation.acknowledgmentMessages.filter((message) => {
    if (!message.acknowledgedAt) {
      return false;
    }
    return (
      new Date(message.acknowledgedAt).getTime() - new Date(message.createdAt).getTime() <=
      24 * 60 * 60 * 1000
    );
  }).length;
  if (promptAcknowledgments > 0) {
    wins.push({
      id: "prompt-acknowledgments",
      label: "Prompt acknowledgments",
      value: `${promptAcknowledgments}`,
      detail: "Acknowledgment-required notices confirmed within 24 hours.",
    });
  }

  return wins;
}

export function computeHouseMonthlyWins(
  computation: HouseMonthlyKpiComputation,
): ReportWinSummary[] {
  const wins: ReportWinSummary[] = [];
  if (computation.totalViolations === 0 && computation.activeResidentCount > 0) {
    wins.push({
      id: "zero-house-violations",
      label: "Zero violations this month",
      value: "House-wide",
      detail: "No new sober-house violations were recorded during the reporting period.",
    });
  }

  if ((computation.residentComputation?.meetingComplianceRate.value ?? 0) >= 1) {
    wins.push({
      id: "meeting-goals-met",
      label: "Residents meeting meeting goals",
      value: `${computation.activeResidentCount}`,
      detail: "Residents assigned to the house who met every weekly meeting target this month.",
    });
  }

  if ((computation.residentComputation?.choreCompletionRate.value ?? 0) >= 1) {
    wins.push({
      id: "chore-compliance-maintained",
      label: "Residents maintaining chore compliance",
      value: `${computation.activeResidentCount}`,
      detail: "Residents who completed every required chore period this month.",
    });
  }

  if (
    (computation.acknowledgmentCompletionRate.value ?? 0) >= 1 &&
    computation.acknowledgmentRequiredMessages > 0
  ) {
    wins.push({
      id: "communication-acknowledged",
      label: "All required notices acknowledged",
      value: `${computation.acknowledgmentRequiredMessages}`,
      detail: "Every acknowledgment-required message for the month was confirmed.",
    });
  }

  return wins;
}
