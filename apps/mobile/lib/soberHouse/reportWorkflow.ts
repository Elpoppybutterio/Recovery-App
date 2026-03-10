import { appendAuditEntries, buildAuditActionEntry } from "./audit";
import { createEntityId } from "./defaults";
import { upsertMonthlyReport } from "./mutations";
import { getMonthlyReportById } from "./selectors";
import type {
  AuditActor,
  HouseMonthlyReportSnapshot,
  MonthlyReport,
  MonthlyReportDistributionMetadata,
  MonthlyReportExportRecord,
  MonthlyReportStatus,
  ResidentMonthlyReportSnapshot,
  SoberHouseSettingsStore,
} from "./types";

type WorkflowResult = {
  store: SoberHouseSettingsStore;
  auditCount: number;
  report: MonthlyReport | null;
};

type ResidentNotePatch = Partial<ResidentMonthlyReportSnapshot["notesSection"]>;
type HouseNotePatch = Partial<HouseMonthlyReportSnapshot["notesSection"]>;

function updateResidentNotes(
  report: MonthlyReport,
  patch: ResidentNotePatch,
): MonthlyReport["summaryPayload"] {
  const snapshot = report.summaryPayload;
  if (snapshot.reportKind !== "resident_monthly") {
    return snapshot;
  }
  return {
    ...snapshot,
    notesSection: {
      ...snapshot.notesSection,
      ...patch,
    },
  };
}

function updateHouseNotes(
  report: MonthlyReport,
  patch: HouseNotePatch,
): MonthlyReport["summaryPayload"] {
  const snapshot = report.summaryPayload;
  if (snapshot.reportKind !== "house_monthly") {
    return snapshot;
  }
  return {
    ...snapshot,
    notesSection: {
      ...snapshot.notesSection,
      ...patch,
    },
  };
}

function isResidentActor(store: SoberHouseSettingsStore, actorId: string): boolean {
  return store.residentHousingProfile?.linkedUserId === actorId;
}

export function canActorManageMonthlyReport(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  report: MonthlyReport | null,
): boolean {
  if (!report) {
    return false;
  }
  return !isResidentActor(store, actor.id);
}

export function isMonthlyReportLocked(report: MonthlyReport): boolean {
  return (
    report.lockedAt !== null ||
    report.status === "APPROVED" ||
    report.status === "EXPORTED" ||
    report.status === "SENT"
  );
}

function withDistributionReady(
  metadata: MonthlyReportDistributionMetadata,
): MonthlyReportDistributionMetadata {
  return {
    ...metadata,
    sentStatus: metadata.sentStatus ?? "READY",
  };
}

function persistReportUpdate(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  report: MonthlyReport,
  timestamp: string,
  actionTaken: string,
  fieldChanged: string,
  oldValue: string | null,
  newValue: string | null,
): WorkflowResult {
  const result = upsertMonthlyReport(store, actor, report, timestamp);
  return {
    store: appendAuditEntries(result.store, [
      buildAuditActionEntry({
        actor,
        timestamp,
        entityType: "monthlyReport",
        entityId: report.id,
        actionTaken,
        fieldChanged,
        oldValue,
        newValue,
      }),
    ]),
    auditCount: result.auditCount + 1,
    report: getMonthlyReportById(result.store, report.id),
  };
}

export function updateMonthlyReportFinalNotes(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  reportId: string,
  patch: ResidentNotePatch | HouseNotePatch,
  timestamp: string,
): WorkflowResult {
  const report = getMonthlyReportById(store, reportId);
  if (
    !report ||
    !canActorManageMonthlyReport(store, actor, report) ||
    isMonthlyReportLocked(report)
  ) {
    return { store, auditCount: 0, report: report ?? null };
  }

  const nextSummaryPayload =
    report.summaryPayload.reportKind === "resident_monthly"
      ? updateResidentNotes(report, patch as ResidentNotePatch)
      : updateHouseNotes(report, patch as HouseNotePatch);
  return persistReportUpdate(
    store,
    actor,
    {
      ...report,
      summaryPayload: nextSummaryPayload,
    },
    timestamp,
    "monthly_report_final_note_updated",
    "summaryPayload.notesSection",
    JSON.stringify(report.summaryPayload.notesSection),
    JSON.stringify(nextSummaryPayload.notesSection),
  );
}

function transitionAllowed(current: MonthlyReportStatus, next: MonthlyReportStatus): boolean {
  if (current === next) {
    return true;
  }
  switch (current) {
    case "DRAFT":
      return next === "GENERATED";
    case "GENERATED":
      return next === "IN_REVIEW" || next === "APPROVED";
    case "IN_REVIEW":
      return next === "APPROVED" || next === "GENERATED";
    case "APPROVED":
      return next === "EXPORTED" || next === "SENT";
    case "EXPORTED":
      return next === "SENT";
    default:
      return false;
  }
}

export function transitionMonthlyReportStatus(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  reportId: string,
  nextStatus: MonthlyReportStatus,
  timestamp: string,
): WorkflowResult {
  const report = getMonthlyReportById(store, reportId);
  if (
    !report ||
    !canActorManageMonthlyReport(store, actor, report) ||
    !transitionAllowed(report.status, nextStatus)
  ) {
    return { store, auditCount: 0, report: report ?? null };
  }

  const nextReport: MonthlyReport = {
    ...report,
    status: nextStatus,
    reviewedAt: nextStatus === "IN_REVIEW" ? timestamp : report.reviewedAt,
    reviewedBy: nextStatus === "IN_REVIEW" ? actor : report.reviewedBy,
    approvedAt: nextStatus === "APPROVED" ? timestamp : report.approvedAt,
    approvedBy: nextStatus === "APPROVED" ? actor : report.approvedBy,
    lockedAt:
      nextStatus === "APPROVED" || nextStatus === "EXPORTED" || nextStatus === "SENT"
        ? (report.lockedAt ?? timestamp)
        : report.lockedAt,
    distributionMetadata:
      nextStatus === "APPROVED" || nextStatus === "EXPORTED" || nextStatus === "SENT"
        ? withDistributionReady(report.distributionMetadata)
        : report.distributionMetadata,
  };
  const actionTaken =
    nextStatus === "IN_REVIEW"
      ? "monthly_report_entered_review"
      : nextStatus === "APPROVED"
        ? "monthly_report_approved"
        : nextStatus === "SENT"
          ? "monthly_report_sent"
          : "monthly_report_status_changed";

  return persistReportUpdate(
    store,
    actor,
    nextReport,
    timestamp,
    actionTaken,
    "status",
    report.status,
    nextStatus,
  );
}

export function markMonthlyReportExported(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  reportId: string,
  exportRef: string,
  timestamp: string,
): WorkflowResult {
  const report = getMonthlyReportById(store, reportId);
  if (
    !report ||
    !canActorManageMonthlyReport(store, actor, report) ||
    (report.status !== "APPROVED" && report.status !== "EXPORTED" && report.status !== "SENT")
  ) {
    return { store, auditCount: 0, report: report ?? null };
  }

  const exportRecord: MonthlyReportExportRecord = {
    id: createEntityId("report-export"),
    exportedAt: timestamp,
    exportedBy: actor,
    exportRef,
  };

  return persistReportUpdate(
    store,
    actor,
    {
      ...report,
      status: report.status === "SENT" ? "SENT" : "EXPORTED",
      exportRef,
      exportHistory: [exportRecord, ...report.exportHistory],
      lockedAt: report.lockedAt ?? timestamp,
      distributionMetadata: withDistributionReady(report.distributionMetadata),
    },
    timestamp,
    "monthly_report_exported",
    "exportRef",
    report.exportRef,
    exportRef,
  );
}
