import { appendAuditEntries, buildAuditActionEntry } from "./audit";
import { createEntityId } from "./defaults";
import {
  computeHouseMonthlyKpis,
  computeResidentMonthlyKpis,
  type HouseMonthlyKpiComputation,
  type ResidentMonthlyKpiComputation,
} from "./kpis";
import { upsertMonthlyReport } from "./mutations";
import { getMonthlyReportById } from "./selectors";
import { computeHouseMonthlyWins, computeResidentMonthlyWins } from "./wins";
import type { AttendanceRecordSummary, MeetingAttendanceLogRecord } from "../attendance/storage";
import type {
  AuditActor,
  HouseMonthlyReportSnapshot,
  MonthlyReport,
  MonthlyReportType,
  ResidentMonthlyReportSnapshot,
  SoberHouseSettingsStore,
} from "./types";

type GenerationInput = {
  store: SoberHouseSettingsStore;
  actor: AuditActor;
  monthKey: string;
  attendanceRecords: AttendanceRecordSummary[];
  meetingAttendanceLogs: MeetingAttendanceLogRecord[];
  timestamp: string;
};

export type MonthlyReportViewer =
  | { kind: "manager"; houseId?: string | null }
  | { kind: "resident"; residentId: string };

function sortReports(reports: MonthlyReport[]): MonthlyReport[] {
  return [...reports].sort(
    (left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime(),
  );
}

function reportMonthFromPeriod(periodStart: string): string {
  return periodStart.slice(0, 7);
}

function findExistingReport(
  store: SoberHouseSettingsStore,
  type: MonthlyReportType,
  houseId: string,
  residentId: string | null,
  monthKey: string,
): MonthlyReport | null {
  return (
    store.monthlyReports.find(
      (report) =>
        report.type === type &&
        report.houseId === houseId &&
        report.residentId === residentId &&
        reportMonthFromPeriod(report.periodStart) === monthKey,
    ) ?? null
  );
}

function residentReportSnapshot(
  computation: ResidentMonthlyKpiComputation,
): ResidentMonthlyReportSnapshot {
  const meetingsRequired = computation.meetingWeekResults.reduce(
    (total, week) => total + week.required,
    0,
  );
  const meetingsCompleted = computation.meetingWeekResults.reduce(
    (total, week) => total + week.completed,
    0,
  );
  const latestManagerNote =
    [...computation.violationsInPeriod]
      .sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      )
      .find((violation) => violation.managerNotes.trim().length > 0)?.managerNotes ?? null;

  return {
    reportKind: "resident_monthly",
    reportMonth: computation.window.label,
    resident: {
      residentId: computation.residentId,
      residentName: computation.residentName,
      houseId: computation.house?.id ?? null,
      houseName: computation.house?.name ?? "No house assigned",
      moveInDate: computation.moveInDate,
      programPhaseOnEntry: computation.programPhaseOnEntry,
    },
    complianceSummary: {
      curfew: {
        ...computation.curfewComplianceRate,
        summary:
          computation.curfewComplianceRate.value === null
            ? "Curfew is not applicable for this month."
            : `${computation.curfewDayResults.filter((entry) => !entry.hadViolation).length} of ${computation.curfewDayResults.length} active days had no curfew violation.`,
      },
      chores: {
        ...computation.choreCompletionRate,
        summary:
          computation.choreCompletionRate.value === null
            ? "Chore compliance is not applicable for this month."
            : `${computation.chorePeriodResults.filter((entry) => entry.complete).length} of ${computation.chorePeriodResults.length} chore periods were completed with valid proof.`,
      },
      work: {
        ...computation.employmentComplianceRate,
        summary:
          computation.employmentComplianceRate.value === null
            ? computation.employmentComplianceRate.label
            : `${computation.workWeekResults.filter((entry) => entry.met).length} of ${computation.workWeekResults.length} weeks had a work verification.`,
      },
      jobSearch: {
        ...computation.jobSearchCompletionRate,
        summary:
          computation.jobSearchCompletionRate.value === null
            ? computation.jobSearchCompletionRate.label
            : `${computation.jobSearchWeekResults.filter((entry) => entry.met).length} of ${computation.jobSearchWeekResults.length} weeks met the job-search goal.`,
      },
      meetings: {
        ...computation.meetingComplianceRate,
        summary:
          computation.meetingComplianceRate.value === null
            ? "Meeting requirements were not applicable this month."
            : `${meetingsCompleted} of ${meetingsRequired} meetings were completed across the month.`,
        requiredCount: meetingsRequired > 0 ? meetingsRequired : null,
        completedCount: meetingsCompleted,
        remainingCount:
          meetingsRequired > 0 ? Math.max(meetingsRequired - meetingsCompleted, 0) : null,
      },
      sponsorContact: computation.sponsorContactSummary,
    },
    kpis: {
      curfewComplianceRate: computation.curfewComplianceRate,
      choreCompletionRate: computation.choreCompletionRate,
      meetingComplianceRate: computation.meetingComplianceRate,
      employmentComplianceRate: computation.employmentComplianceRate,
      jobSearchCompletionRate: computation.jobSearchCompletionRate,
      totalViolations: computation.totalViolations,
      violationsByRuleType: computation.violationsByRuleType,
      correctiveActionsOpen: computation.correctiveActionsOpen,
      correctiveActionsCompleted: computation.correctiveActionsCompleted,
      correctiveActionsOverdue: computation.correctiveActionsOverdue,
      acknowledgmentRequiredMessages: computation.acknowledgmentRequiredMessages,
      acknowledgmentCompletionRate: computation.acknowledgmentCompletionRate,
    },
    violationsSummary: {
      totalViolations: computation.totalViolations,
      violationsByType: computation.violationsByRuleType,
      openCount: computation.violationsInPeriod.filter((entry) => entry.status === "OPEN").length,
      resolvedCount: computation.violationsInPeriod.filter((entry) => entry.status === "RESOLVED")
        .length,
      dismissedCount: computation.violationsInPeriod.filter((entry) => entry.status === "DISMISSED")
        .length,
      notableIncidents: computation.violationsInPeriod.slice(0, 5).map((violation) => ({
        id: violation.id,
        ruleType: violation.ruleType,
        reasonSummary: violation.reasonSummary,
        triggeredAt: violation.triggeredAt,
        status: violation.status,
      })),
    },
    correctiveActionSummary: {
      totalAssigned: computation.correctiveActionsInPeriod.length,
      openCount: computation.correctiveActionsOpen,
      completedCount: computation.correctiveActionsCompleted,
      overdueCount: computation.correctiveActionsOverdue,
    },
    communicationSummary: {
      structuredMessageCount: computation.messagesInPeriod.length,
      acknowledgmentRequiredCount: computation.acknowledgmentRequiredMessages,
      acknowledgmentCompletedCount: computation.acknowledgmentMessages.filter(
        (message) => message.acknowledgedAt !== null,
      ).length,
      acknowledgmentCompletionSummary:
        computation.acknowledgmentCompletionRate.value === null
          ? "No acknowledgment-required notices were sent this month."
          : `${computation.acknowledgmentMessages.filter((message) => message.acknowledgedAt !== null).length} of ${computation.acknowledgmentRequiredMessages} acknowledgment-required notices were completed.`,
    },
    winsSummary: computeResidentMonthlyWins(computation),
    notesSection: {
      managerNote: latestManagerNote,
    },
  };
}

function houseReportSnapshot(
  store: SoberHouseSettingsStore,
  computation: HouseMonthlyKpiComputation,
): HouseMonthlyReportSnapshot {
  return {
    reportKind: "house_monthly",
    reportMonth: computation.window.label,
    house: {
      houseId: computation.house?.id ?? "unknown-house",
      houseName: computation.house?.name ?? "Unknown house",
      organizationId: computation.house?.organizationId ?? null,
      activeResidentCount: computation.activeResidentCount,
      staffSummary: store.staffAssignments
        .filter(
          (assignment) =>
            assignment.status === "ACTIVE" &&
            (assignment.role === "OWNER" ||
              assignment.assignedHouseIds.includes(computation.house?.id ?? "")),
        )
        .map((assignment) => `${assignment.firstName} ${assignment.lastName}`.trim())
        .filter((name) => name.length > 0),
    },
    kpis: {
      curfewComplianceRate: computation.curfewComplianceRate,
      choreCompletionRate: computation.choreCompletionRate,
      meetingComplianceRate: computation.meetingComplianceRate,
      employmentComplianceRate: computation.employmentComplianceRate,
      jobSearchCompletionRate: computation.jobSearchCompletionRate,
      totalViolations: computation.totalViolations,
      violationsByRuleType: computation.violationsByRuleType,
      correctiveActionsOpen: computation.correctiveActionsOpen,
      correctiveActionsResolved: computation.correctiveActionsResolved,
      acknowledgmentRequiredMessages: computation.acknowledgmentRequiredMessages,
      acknowledgmentCompletionRate: computation.acknowledgmentCompletionRate,
    },
    operationsSummary: computation.operationsSummary,
    winsSummary: computeHouseMonthlyWins(computation),
    residentHighlights: computation.residentComputation
      ? [
          {
            residentId: computation.residentComputation.residentId,
            residentName: computation.residentComputation.residentName,
            zeroViolations: computation.residentComputation.totalViolations === 0,
            metMeetingGoals:
              (computation.residentComputation.meetingComplianceRate.value ?? 0) >= 1,
            maintainedChoreCompliance:
              (computation.residentComputation.choreCompletionRate.value ?? 0) >= 1,
          },
        ]
      : [],
  };
}

function saveReportRecord(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  report: Omit<MonthlyReport, "id" | "createdAt" | "updatedAt">,
  timestamp: string,
  actionTaken: string,
) {
  const createdId = createEntityId("monthly-report");
  const result = upsertMonthlyReport(
    store,
    actor,
    {
      ...report,
      id: createdId,
    },
    timestamp,
  );
  return {
    store: appendAuditEntries(result.store, [
      buildAuditActionEntry({
        actor,
        timestamp,
        entityType: "monthlyReport",
        entityId: createdId,
        actionTaken,
        fieldChanged: "period",
        oldValue: null,
        newValue: `${report.periodStart}..${report.periodEnd}`,
      }),
    ]),
    report:
      result.store.monthlyReports.find((entry) => entry.id === createdId) ??
      getMonthlyReportById(result.store, createdId),
    auditCount: result.auditCount + 1,
  };
}

export function generateResidentMonthlyReport(input: GenerationInput) {
  const computation = computeResidentMonthlyKpis(input);
  const resident = input.store.residentHousingProfile;
  if (!computation || !resident || !resident.houseId) {
    return { store: input.store, auditCount: 0, report: null as MonthlyReport | null };
  }

  const existing = findExistingReport(
    input.store,
    "RESIDENT_MONTHLY",
    resident.houseId,
    resident.residentId,
    input.monthKey,
  );
  const snapshot = residentReportSnapshot(computation);
  return saveReportRecord(
    input.store,
    input.actor,
    {
      type: "RESIDENT_MONTHLY",
      residentId: resident.residentId,
      houseId: resident.houseId,
      organizationId: input.store.organization?.id ?? null,
      periodStart: computation.window.periodStart,
      periodEnd: computation.window.periodEnd,
      generatedAt: input.timestamp,
      generatedBy: "USER",
      generatedByUserId: input.actor.id,
      status: "GENERATED",
      summaryPayload: snapshot,
      exportRef: null,
      notes: null,
    },
    input.timestamp,
    existing ? "monthly_report_regenerated" : "monthly_report_generated",
  );
}

export function generateHouseMonthlyReport(input: GenerationInput & { houseId: string }) {
  const computation = computeHouseMonthlyKpis({
    ...input,
    houseId: input.houseId,
  });
  const house = computation.house;
  if (!house) {
    return { store: input.store, auditCount: 0, report: null as MonthlyReport | null };
  }

  const existing = findExistingReport(input.store, "HOUSE_MONTHLY", house.id, null, input.monthKey);
  const snapshot = houseReportSnapshot(input.store, computation);
  return saveReportRecord(
    input.store,
    input.actor,
    {
      type: "HOUSE_MONTHLY",
      residentId: null,
      houseId: house.id,
      organizationId: input.store.organization?.id ?? null,
      periodStart: computation.window.periodStart,
      periodEnd: computation.window.periodEnd,
      generatedAt: input.timestamp,
      generatedBy: "USER",
      generatedByUserId: input.actor.id,
      status: "GENERATED",
      summaryPayload: snapshot,
      exportRef: null,
      notes: null,
    },
    input.timestamp,
    existing ? "monthly_report_regenerated" : "monthly_report_generated",
  );
}

export function listMonthlyReportsForViewer(
  store: SoberHouseSettingsStore,
  viewer: MonthlyReportViewer,
): MonthlyReport[] {
  if (viewer.kind === "resident") {
    return sortReports(
      store.monthlyReports.filter(
        (report) => report.type === "RESIDENT_MONTHLY" && report.residentId === viewer.residentId,
      ),
    );
  }
  return sortReports(
    store.monthlyReports.filter((report) =>
      viewer.houseId ? report.houseId === viewer.houseId : true,
    ),
  );
}

export function recordMonthlyReportViewed(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  reportId: string,
  timestamp: string,
) {
  const report = getMonthlyReportById(store, reportId);
  if (!report) {
    return { store, auditCount: 0 };
  }

  return {
    store: appendAuditEntries(store, [
      buildAuditActionEntry({
        actor,
        timestamp,
        entityType: "monthlyReport",
        entityId: report.id,
        actionTaken: "monthly_report_viewed",
        fieldChanged: "period",
        oldValue: null,
        newValue: `${report.periodStart}..${report.periodEnd}`,
      }),
    ]),
    auditCount: 1,
  };
}
