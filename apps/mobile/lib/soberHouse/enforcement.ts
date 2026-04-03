import {
  buildSoberHouseOperatorReportingSummary,
  type OperatorComplianceBand,
} from "./operatorReporting";
import { buildSoberHouseProofReviewSummary } from "./proofReview";
import type {
  EnforcementCategory,
  EnforcementLevel,
  EnforcementRecord,
  EnforcementStatus,
  SoberHouseSettingsStore,
  ViolationRuleType,
} from "./types";

export type EnforcementQueueFilters = {
  houseId: string | null;
  residentId: string | null;
  level: EnforcementLevel | "all";
  status: EnforcementStatus | "all";
  urgentOnly: boolean;
  highRiskOnly: boolean;
  category: EnforcementCategory | "all";
};

export type EnforcementQueueItem = {
  id: string;
  residentId: string;
  residentName: string;
  linkedUserId: string | null;
  houseId: string | null;
  houseName: string;
  level: EnforcementLevel;
  status: EnforcementStatus;
  category: EnforcementCategory;
  sourceRuleType: ViolationRuleType | "houseMeetings" | "oneOnOne" | "missingProof";
  reasonSummary: string;
  recommendedAction: string;
  createdAt: string;
  dueAt: string | null;
  assignedStaffAssignmentId: string | null;
  linkedViolationId: string | null;
  urgent: boolean;
  highRisk: boolean;
  complianceBand: OperatorComplianceBand;
  sourceKind: "record" | "recommendation";
};

export type EnforcementTimelineEvent = {
  id: string;
  residentId: string;
  at: string;
  title: string;
  detail: string;
  level: EnforcementLevel | null;
  status: EnforcementStatus | null;
  category: EnforcementCategory | null;
};

export type RuleEnforcementLinkRow = {
  category: string;
  consequencePath: string;
  openCount: number;
  activeLevel: EnforcementLevel | null;
};

export type EnforcementResidentSummary = {
  residentId: string;
  openCount: number;
  reminderCount: number;
  warningCount: number;
  reviewCount: number;
  incidentCount: number;
  dischargeReviewCount: number;
};

export type EnforcementHouseSummary = {
  houseId: string;
  openCount: number;
  reminderCount: number;
  warningCount: number;
  reviewCount: number;
  incidentCount: number;
  dischargeReviewCount: number;
  repeatedEscalations: number;
};

export type EnforcementOrganizationSummary = {
  openCount: number;
  reminderCount: number;
  warningCount: number;
  reviewCount: number;
  incidentCount: number;
  dischargeReviewCount: number;
  repeatedEscalationResidents: number;
  risingVolumeHouseIds: string[];
};

export type SoberHouseEnforcementSummary = {
  queue: EnforcementQueueItem[];
  houseSummaries: Map<string, EnforcementHouseSummary>;
  residentSummaries: Map<string, EnforcementResidentSummary>;
  organizationSummary: EnforcementOrganizationSummary;
  residentTimelineById: Map<string, EnforcementTimelineEvent[]>;
};

type RecommendationDraft = Omit<EnforcementRecord, "id" | "createdAt" | "updatedAt" | "history">;

const ACTIVE_STATUSES = new Set<EnforcementStatus>(["OPEN", "ACKNOWLEDGED", "ESCALATED"]);

function levelWeight(level: EnforcementLevel): number {
  switch (level) {
    case "DISCHARGE_REVIEW":
      return 5;
    case "INCIDENT":
      return 4;
    case "STAFF_REVIEW":
      return 3;
    case "WARNING":
      return 2;
    case "REMINDER":
    default:
      return 1;
  }
}

function isUrgent(level: EnforcementLevel, status: EnforcementStatus): boolean {
  return level === "INCIDENT" || level === "DISCHARGE_REVIEW" || status === "ESCALATED";
}

function categoryPath(category: EnforcementCategory): string {
  switch (category) {
    case "CHORES":
      return "First miss -> reminder. Repeat or persistent misses -> warning. Ongoing pattern -> staff review.";
    case "CURFEW":
      return "Curfew issue -> warning. Repeat misses or severe issue -> incident.";
    case "HOUSE_MEETINGS":
      return "Missed house meeting -> warning. Repeat misses -> staff review.";
    case "ONE_ON_ONES":
      return "Overdue one-on-one -> staff review. Ongoing misses -> incident review.";
    case "SPONSOR_CALLS":
      return "Missed sponsor contact -> reminder. Repeat misses -> warning.";
    case "MISSING_PROOF":
      return "Missing proof -> warning. Repeat missing proof -> staff review.";
    case "WORK":
      return "Work verification gap -> warning. Ongoing gap -> staff review.";
    case "JOB_SEARCH":
      return "Behind on applications -> reminder. Persistent gap -> warning.";
    case "MEETINGS":
      return "Meeting pace behind -> reminder. Persistent noncompliance -> warning.";
    case "VIOLATION":
      return "Open violation -> incident workflow.";
    case "REPEATED_NONCOMPLIANCE":
      return "Worsening or repeated noncompliance -> staff review or discharge review.";
    default:
      return "Operator review required.";
  }
}

function formatStatus(status: EnforcementStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function levelLabel(level: EnforcementLevel): string {
  return level
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildRecommendationKey(residentId: string, category: EnforcementCategory): string {
  return `${residentId}:${category}`;
}

function hasActiveRecordForCategory(
  records: EnforcementRecord[],
  residentId: string,
  category: EnforcementCategory,
): boolean {
  return records.some(
    (record) =>
      record.residentId === residentId &&
      record.category === category &&
      ACTIVE_STATUSES.has(record.status),
  );
}

function buildRecommendationDrafts(
  store: SoberHouseSettingsStore,
  nowIso: string,
): RecommendationDraft[] {
  const summary = buildSoberHouseOperatorReportingSummary({ store, nowIso });
  const proofReviewSummary = buildSoberHouseProofReviewSummary({ store, nowIso });
  const drafts: RecommendationDraft[] = [];

  for (const resident of summary.residents) {
    const linkedUserId = resident.linkedUserId ?? resident.residentId;
    const base = {
      organizationId: store.organization?.id ?? null,
      houseId: resident.houseId,
      residentId: resident.residentId,
      linkedUserId,
      assignedStaffAssignmentId: null,
      linkedViolationId: null,
      linkedCorrectiveActionId: null,
      dueAt: null,
      acknowledgedAt: null,
      resolvedAt: null,
      escalatedAt: null,
      status: "OPEN" as const,
    };

    if (
      resident.openViolations > 0 &&
      !hasActiveRecordForCategory(store.enforcementRecords, resident.residentId, "VIOLATION")
    ) {
      const linkedViolation =
        store.violations.find(
          (violation) =>
            violation.residentId === resident.residentId &&
            (violation.status === "OPEN" ||
              violation.status === "UNDER_REVIEW" ||
              violation.status === "CORRECTIVE_ACTION_ASSIGNED"),
        ) ?? null;
      drafts.push({
        ...base,
        category: "VIOLATION",
        sourceRuleType: linkedViolation?.ruleType ?? "other",
        sourceSignal: "Open violation requires operator follow-up.",
        level: linkedViolation?.severity === "CRITICAL" ? "INCIDENT" : "STAFF_REVIEW",
        reasonSummary:
          linkedViolation?.reasonSummary ??
          `${resident.openViolations} open violation${resident.openViolations === 1 ? "" : "s"} require follow-up.`,
        recommendedAction:
          linkedViolation?.severity === "CRITICAL"
            ? "Open incident review and assign immediate staff response."
            : "Review the open violation, acknowledge it, and assign follow-up.",
        linkedViolationId: linkedViolation?.id ?? null,
      });
    }

    if (
      resident.curfewMissesThisWeek > 0 &&
      !hasActiveRecordForCategory(store.enforcementRecords, resident.residentId, "CURFEW")
    ) {
      drafts.push({
        ...base,
        category: "CURFEW",
        sourceRuleType: "curfew",
        sourceSignal: "Curfew misses detected this week.",
        level: resident.curfewMissesThisWeek >= 2 ? "INCIDENT" : "WARNING",
        reasonSummary: `${resident.curfewMissesThisWeek} curfew miss${resident.curfewMissesThisWeek === 1 ? "" : "es"} this week.`,
        recommendedAction:
          resident.curfewMissesThisWeek >= 2
            ? "Escalate to an incident review and document follow-up."
            : "Issue a warning and document curfew follow-up.",
      });
    }

    if (
      resident.overdueChores > 0 &&
      !hasActiveRecordForCategory(store.enforcementRecords, resident.residentId, "CHORES")
    ) {
      drafts.push({
        ...base,
        category: "CHORES",
        sourceRuleType: "chores",
        sourceSignal: "Required chores are overdue.",
        level: resident.overdueChores >= 2 ? "WARNING" : "REMINDER",
        reasonSummary: `${resident.overdueChores} overdue chore${resident.overdueChores === 1 ? "" : "s"} still need completion.`,
        recommendedAction:
          resident.overdueChores >= 2
            ? "Issue a warning and schedule staff follow-up on chore compliance."
            : "Send a reminder and track completion before the next review.",
      });
    }

    if (
      resident.hasMeetingNoncompliance &&
      !hasActiveRecordForCategory(store.enforcementRecords, resident.residentId, "MEETINGS")
    ) {
      drafts.push({
        ...base,
        category: "MEETINGS",
        sourceRuleType: "meetings",
        sourceSignal: "Meeting adherence is behind the active requirement.",
        level: resident.complianceBand === "critical" ? "WARNING" : "REMINDER",
        reasonSummary: "Meeting attendance is behind the current weekly goal.",
        recommendedAction:
          "Review the meeting plan with the resident and confirm make-up expectations.",
      });
    }

    if (
      resident.houseMeetingsDue > resident.houseMeetingsCompleted &&
      !hasActiveRecordForCategory(store.enforcementRecords, resident.residentId, "HOUSE_MEETINGS")
    ) {
      const misses = resident.houseMeetingsDue - resident.houseMeetingsCompleted;
      drafts.push({
        ...base,
        category: "HOUSE_MEETINGS",
        sourceRuleType: "houseMeetings",
        sourceSignal: "Required house meetings were missed.",
        level: misses >= 2 ? "STAFF_REVIEW" : "WARNING",
        reasonSummary: `${misses} required house meeting${misses === 1 ? "" : "s"} missed in the current period.`,
        recommendedAction:
          misses >= 2
            ? "Escalate to staff review and confirm attendance plan."
            : "Issue a warning and document the missed house meeting.",
      });
    }

    if (
      resident.hasOverdueOneOnOnes &&
      !hasActiveRecordForCategory(store.enforcementRecords, resident.residentId, "ONE_ON_ONES")
    ) {
      drafts.push({
        ...base,
        category: "ONE_ON_ONES",
        sourceRuleType: "oneOnOne",
        sourceSignal: "Required one-on-one is overdue or missed.",
        level: "STAFF_REVIEW",
        reasonSummary: "Required one-on-one follow-up is overdue this week.",
        recommendedAction: "Assign staff follow-up and complete the missed one-on-one.",
      });
    }

    const residentProofSummary = proofReviewSummary.residentSummaries.get(resident.residentId);
    const unresolvedProofCount =
      residentProofSummary?.unresolvedCount ?? resident.missingProofCount;

    if (
      unresolvedProofCount > 0 &&
      !hasActiveRecordForCategory(store.enforcementRecords, resident.residentId, "MISSING_PROOF")
    ) {
      drafts.push({
        ...base,
        category: "MISSING_PROOF",
        sourceRuleType: "missingProof",
        sourceSignal: "Required proof is unresolved across tracked sober-house items.",
        level: unresolvedProofCount >= 2 ? "STAFF_REVIEW" : "WARNING",
        reasonSummary: `${unresolvedProofCount} proof item${unresolvedProofCount === 1 ? "" : "s"} are unresolved, missing, or rejected.`,
        recommendedAction:
          unresolvedProofCount >= 2
            ? "Review proof expectations with staff and resident."
            : "Request missing proof and document the follow-up.",
      });
    }

    const sponsorMisses =
      resident.sponsorCallsTracked &&
      resident.sponsorCallsDue !== null &&
      resident.sponsorCallsCompleted !== null
        ? Math.max(0, resident.sponsorCallsDue - resident.sponsorCallsCompleted)
        : 0;
    if (
      sponsorMisses > 0 &&
      !hasActiveRecordForCategory(store.enforcementRecords, resident.residentId, "SPONSOR_CALLS")
    ) {
      drafts.push({
        ...base,
        category: "SPONSOR_CALLS",
        sourceRuleType: "sponsorContact",
        sourceSignal: "Sponsor-call requirement is behind.",
        level: sponsorMisses >= 2 ? "WARNING" : "REMINDER",
        reasonSummary: `${sponsorMisses} sponsor call${sponsorMisses === 1 ? "" : "s"} still missing this period.`,
        recommendedAction:
          sponsorMisses >= 2
            ? "Issue a warning and review sponsor-call accountability."
            : "Remind the resident to complete the sponsor call requirement.",
      });
    }

    if (
      resident.workRequired &&
      resident.workVerifiedThisWeek === false &&
      !hasActiveRecordForCategory(store.enforcementRecords, resident.residentId, "WORK")
    ) {
      drafts.push({
        ...base,
        category: "WORK",
        sourceRuleType: "work",
        sourceSignal: "Work accountability was not verified.",
        level: "WARNING",
        reasonSummary: "Work/employment accountability is required but not verified.",
        recommendedAction:
          "Review work verification or employment accountability with the resident.",
      });
    }

    const jobSearchGap =
      resident.jobApplicationsTracked &&
      resident.jobApplicationsDue !== null &&
      resident.jobApplicationsCompleted !== null
        ? Math.max(0, resident.jobApplicationsDue - resident.jobApplicationsCompleted)
        : 0;
    if (
      jobSearchGap > 0 &&
      !hasActiveRecordForCategory(store.enforcementRecords, resident.residentId, "JOB_SEARCH")
    ) {
      drafts.push({
        ...base,
        category: "JOB_SEARCH",
        sourceRuleType: "jobSearch",
        sourceSignal: "Job-search requirement is behind.",
        level: jobSearchGap >= 2 ? "WARNING" : "REMINDER",
        reasonSummary: `${jobSearchGap} required job application${jobSearchGap === 1 ? "" : "s"} still missing this week.`,
        recommendedAction:
          jobSearchGap >= 2
            ? "Issue a warning and assign follow-up on job-search proof."
            : "Remind the resident to submit the missing applications.",
      });
    }

    if (
      resident.complianceBand === "critical" &&
      resident.trend === "worsening" &&
      !hasActiveRecordForCategory(
        store.enforcementRecords,
        resident.residentId,
        "REPEATED_NONCOMPLIANCE",
      )
    ) {
      drafts.push({
        ...base,
        category: "REPEATED_NONCOMPLIANCE",
        sourceRuleType: "other",
        sourceSignal: "Critical compliance pattern is worsening.",
        level: "DISCHARGE_REVIEW",
        reasonSummary:
          "Resident shows a worsening critical noncompliance pattern that requires leadership review.",
        recommendedAction:
          "Escalate to discharge-review status or equivalent critical leadership review.",
      });
    }
  }

  return drafts;
}

export function buildEnforcementRecordDraftFromRecommendation(
  recommendation: EnforcementQueueItem,
): Omit<EnforcementRecord, "id" | "createdAt" | "updatedAt" | "history"> {
  return {
    organizationId: null,
    houseId: recommendation.houseId,
    residentId: recommendation.residentId,
    linkedUserId: recommendation.linkedUserId ?? recommendation.residentId,
    category: recommendation.category,
    sourceRuleType: recommendation.sourceRuleType,
    sourceSignal: recommendation.reasonSummary,
    level: recommendation.level,
    status: "OPEN",
    reasonSummary: recommendation.reasonSummary,
    recommendedAction: recommendation.recommendedAction,
    assignedStaffAssignmentId: recommendation.assignedStaffAssignmentId,
    linkedViolationId: recommendation.linkedViolationId,
    linkedCorrectiveActionId: null,
    dueAt: recommendation.dueAt,
    acknowledgedAt: null,
    resolvedAt: null,
    escalatedAt: null,
  };
}

function summarizeResidentQueueItems(items: EnforcementQueueItem[]): EnforcementResidentSummary {
  return {
    residentId: items[0]?.residentId ?? "",
    openCount: items.length,
    reminderCount: items.filter((item) => item.level === "REMINDER").length,
    warningCount: items.filter((item) => item.level === "WARNING").length,
    reviewCount: items.filter((item) => item.level === "STAFF_REVIEW").length,
    incidentCount: items.filter((item) => item.level === "INCIDENT").length,
    dischargeReviewCount: items.filter((item) => item.level === "DISCHARGE_REVIEW").length,
  };
}

function residentBandById(
  store: SoberHouseSettingsStore,
  nowIso: string,
): Map<string, OperatorComplianceBand> {
  const summary = buildSoberHouseOperatorReportingSummary({ store, nowIso });
  return new Map(
    summary.residents.map((resident) => [resident.residentId, resident.complianceBand]),
  );
}

function recordToQueueItem(
  record: EnforcementRecord,
  residentNames: Map<string, string>,
  houseNames: Map<string, string>,
  residentBands: Map<string, OperatorComplianceBand>,
): EnforcementQueueItem {
  const complianceBand = residentBands.get(record.residentId) ?? "warning";
  return {
    id: record.id,
    residentId: record.residentId,
    residentName: residentNames.get(record.residentId) ?? record.residentId,
    linkedUserId: record.linkedUserId,
    houseId: record.houseId,
    houseName: record.houseId
      ? (houseNames.get(record.houseId) ?? "Unassigned house")
      : "Unassigned house",
    level: record.level,
    status: record.status,
    category: record.category,
    sourceRuleType: record.sourceRuleType,
    reasonSummary: record.reasonSummary,
    recommendedAction: record.recommendedAction,
    createdAt: record.createdAt,
    dueAt: record.dueAt,
    assignedStaffAssignmentId: record.assignedStaffAssignmentId,
    linkedViolationId: record.linkedViolationId,
    urgent: isUrgent(record.level, record.status),
    highRisk: complianceBand === "noncompliant" || complianceBand === "critical",
    complianceBand,
    sourceKind: "record",
  };
}

export function buildSoberHouseEnforcementSummary(input: {
  store: SoberHouseSettingsStore;
  nowIso: string;
}): SoberHouseEnforcementSummary {
  const { store, nowIso } = input;
  const reporting = buildSoberHouseOperatorReportingSummary({ store, nowIso });
  const residentNames = new Map(
    reporting.residents.map((resident) => [resident.residentId, resident.displayName]),
  );
  const houseNames = new Map(reporting.houses.map((house) => [house.houseId, house.houseName]));
  const residentBands = residentBandById(store, nowIso);

  const activeRecordItems = store.enforcementRecords
    .filter((record) => ACTIVE_STATUSES.has(record.status))
    .map((record) => recordToQueueItem(record, residentNames, houseNames, residentBands));

  const recommendationItems = buildRecommendationDrafts(store, nowIso).map((draft) => {
    const complianceBand = residentBands.get(draft.residentId) ?? "warning";
    return {
      id: buildRecommendationKey(draft.residentId, draft.category),
      residentId: draft.residentId,
      residentName: residentNames.get(draft.residentId) ?? draft.residentId,
      linkedUserId: draft.linkedUserId,
      houseId: draft.houseId,
      houseName: draft.houseId
        ? (houseNames.get(draft.houseId) ?? "Unassigned house")
        : "Unassigned house",
      level: draft.level,
      status: draft.status,
      category: draft.category,
      sourceRuleType: draft.sourceRuleType,
      reasonSummary: draft.reasonSummary,
      recommendedAction: draft.recommendedAction,
      createdAt: nowIso,
      dueAt: draft.dueAt,
      assignedStaffAssignmentId: draft.assignedStaffAssignmentId,
      linkedViolationId: draft.linkedViolationId,
      urgent: isUrgent(draft.level, draft.status),
      highRisk: complianceBand === "noncompliant" || complianceBand === "critical",
      complianceBand,
      sourceKind: "recommendation" as const,
    } satisfies EnforcementQueueItem;
  });

  const queue = [...activeRecordItems, ...recommendationItems].sort((left, right) => {
    const severityDiff = levelWeight(right.level) - levelWeight(left.level);
    if (severityDiff !== 0) {
      return severityDiff;
    }
    return right.createdAt.localeCompare(left.createdAt);
  });

  const residentSummaries = new Map<string, EnforcementResidentSummary>();
  for (const resident of reporting.residents) {
    const items = queue.filter((item) => item.residentId === resident.residentId);
    residentSummaries.set(
      resident.residentId,
      items.length > 0
        ? summarizeResidentQueueItems(items)
        : {
            residentId: resident.residentId,
            openCount: 0,
            reminderCount: 0,
            warningCount: 0,
            reviewCount: 0,
            incidentCount: 0,
            dischargeReviewCount: 0,
          },
    );
  }

  const houseSummaries = new Map<string, EnforcementHouseSummary>();
  for (const house of reporting.houses) {
    const items = queue.filter((item) => item.houseId === house.houseId);
    const repeatedEscalations = new Set(
      items
        .filter((item) => levelWeight(item.level) >= levelWeight("WARNING"))
        .map((item) => item.residentId),
    ).size;
    houseSummaries.set(house.houseId, {
      houseId: house.houseId,
      openCount: items.length,
      reminderCount: items.filter((item) => item.level === "REMINDER").length,
      warningCount: items.filter((item) => item.level === "WARNING").length,
      reviewCount: items.filter((item) => item.level === "STAFF_REVIEW").length,
      incidentCount: items.filter((item) => item.level === "INCIDENT").length,
      dischargeReviewCount: items.filter((item) => item.level === "DISCHARGE_REVIEW").length,
      repeatedEscalations,
    });
  }

  const residentTimelineById = new Map<string, EnforcementTimelineEvent[]>();
  for (const resident of reporting.residents) {
    const events: EnforcementTimelineEvent[] = [];
    for (const record of store.enforcementRecords.filter(
      (entry) => entry.residentId === resident.residentId,
    )) {
      events.push({
        id: `${record.id}:created`,
        residentId: resident.residentId,
        at: record.createdAt,
        title: `${levelLabel(record.level)} created`,
        detail: record.reasonSummary,
        level: record.level,
        status: record.status,
        category: record.category,
      });
      for (const historyEntry of record.history) {
        if (historyEntry.action === "CREATED") {
          continue;
        }
        events.push({
          id: historyEntry.id,
          residentId: resident.residentId,
          at: historyEntry.createdAt,
          title: historyEntry.action
            .toLowerCase()
            .split("_")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" "),
          detail: historyEntry.note || `${levelLabel(record.level)} ${formatStatus(record.status)}`,
          level: historyEntry.nextLevel ?? record.level,
          status: historyEntry.nextStatus ?? record.status,
          category: record.category,
        });
      }
    }
    for (const violation of store.violations.filter(
      (entry) => entry.residentId === resident.residentId,
    )) {
      events.push({
        id: `violation:${violation.id}`,
        residentId: resident.residentId,
        at: violation.triggeredAt,
        title: "Violation opened",
        detail: violation.reasonSummary,
        level: violation.severity === "CRITICAL" ? "INCIDENT" : "WARNING",
        status:
          violation.status === "RESOLVED" || violation.status === "DISMISSED" ? "RESOLVED" : "OPEN",
        category: "VIOLATION",
      });
    }
    for (const action of store.correctiveActions.filter(
      (entry) => entry.residentId === resident.residentId,
    )) {
      events.push({
        id: `corrective:${action.id}`,
        residentId: resident.residentId,
        at: action.assignedAt,
        title: "Corrective action assigned",
        detail: action.notes || action.actionType,
        level: action.actionType === "WARNING" ? "WARNING" : "STAFF_REVIEW",
        status: action.status === "COMPLETED" ? "RESOLVED" : "OPEN",
        category: "VIOLATION",
      });
    }
    residentTimelineById.set(
      resident.residentId,
      events.sort((left, right) => right.at.localeCompare(left.at)),
    );
  }

  const repeatedEscalationResidents = Array.from(residentSummaries.values()).filter(
    (summary) =>
      summary.warningCount +
        summary.reviewCount +
        summary.incidentCount +
        summary.dischargeReviewCount >=
      2,
  ).length;
  const risingVolumeHouseIds = Array.from(houseSummaries.values())
    .filter((summary) => summary.warningCount + summary.reviewCount + summary.incidentCount >= 2)
    .map((summary) => summary.houseId);

  return {
    queue,
    organizationSummary: {
      openCount: queue.length,
      reminderCount: queue.filter((item) => item.level === "REMINDER").length,
      warningCount: queue.filter((item) => item.level === "WARNING").length,
      reviewCount: queue.filter((item) => item.level === "STAFF_REVIEW").length,
      incidentCount: queue.filter((item) => item.level === "INCIDENT").length,
      dischargeReviewCount: queue.filter((item) => item.level === "DISCHARGE_REVIEW").length,
      repeatedEscalationResidents,
      risingVolumeHouseIds,
    },
    residentSummaries,
    houseSummaries,
    residentTimelineById,
  };
}

export function filterEnforcementQueue(
  queue: EnforcementQueueItem[],
  filters: EnforcementQueueFilters,
): EnforcementQueueItem[] {
  return queue.filter((item) => {
    if (filters.houseId && item.houseId !== filters.houseId) {
      return false;
    }
    if (filters.residentId && item.residentId !== filters.residentId) {
      return false;
    }
    if (filters.level !== "all" && item.level !== filters.level) {
      return false;
    }
    if (filters.status !== "all" && item.status !== filters.status) {
      return false;
    }
    if (filters.category !== "all" && item.category !== filters.category) {
      return false;
    }
    if (filters.urgentOnly && !item.urgent) {
      return false;
    }
    if (filters.highRiskOnly && !item.highRisk) {
      return false;
    }
    return true;
  });
}

export function buildResidentRuleEnforcementLinks(
  store: SoberHouseSettingsStore,
  residentId: string,
  nowIso: string,
): RuleEnforcementLinkRow[] {
  const enforcement = buildSoberHouseEnforcementSummary({ store, nowIso });
  const activeResidentItems = enforcement.queue.filter((item) => item.residentId === residentId);
  const rows: Array<{ category: string; enforcementCategory: EnforcementCategory }> = [
    { category: "Meetings required", enforcementCategory: "MEETINGS" },
    { category: "Work required", enforcementCategory: "WORK" },
    { category: "Job applications", enforcementCategory: "JOB_SEARCH" },
    { category: "Curfew", enforcementCategory: "CURFEW" },
    { category: "Chore proof", enforcementCategory: "MISSING_PROOF" },
    { category: "One-on-one", enforcementCategory: "ONE_ON_ONES" },
    { category: "House meetings", enforcementCategory: "HOUSE_MEETINGS" },
    { category: "Sponsor contact", enforcementCategory: "SPONSOR_CALLS" },
  ];

  return rows.map((row) => {
    const matching = activeResidentItems.filter(
      (item) => item.category === row.enforcementCategory,
    );
    return {
      category: row.category,
      consequencePath: categoryPath(row.enforcementCategory),
      openCount: matching.length,
      activeLevel:
        matching.length > 0
          ? matching.reduce(
              (highest, item) =>
                levelWeight(item.level) > levelWeight(highest) ? item.level : highest,
              matching[0]!.level,
            )
          : null,
    };
  });
}
