import { buildSoberHouseOperatorReportingSummary } from "./operatorReporting";
import { choreRequiresPhotoProof } from "./proof";
import { getEffectiveRuleSetForScope, getHouseById } from "./selectors";
import type {
  EnforcementRecord,
  ProofReviewCategory,
  ProofReviewDerivedStatus,
  ProofReviewRecord,
  ProofReviewSourceRecordType,
  SoberHouseSettingsStore,
} from "./types";

export type ProofReviewQueueFilters = {
  houseId: string | null;
  residentId: string | null;
  category: ProofReviewCategory | "all";
  status: ProofReviewDerivedStatus | "all";
  proofRequiredOnly: boolean;
  pendingOnly: boolean;
  rejectedOnly: boolean;
  missingOnly: boolean;
  highRiskOnly: boolean;
};

export type ProofReviewQueueItem = {
  id: string;
  sourceKind: "record" | "derived";
  proofReviewRecordId: string | null;
  residentId: string;
  linkedUserId: string;
  residentName: string;
  houseId: string | null;
  houseName: string;
  category: ProofReviewCategory;
  sourceRecordType: ProofReviewSourceRecordType;
  sourceRecordId: string;
  title: string;
  dueAt: string | null;
  submittedAt: string | null;
  reviewStatus: ProofReviewDerivedStatus;
  proofRequired: boolean;
  proofProvided: boolean;
  proofReference: string | null;
  evidenceItemIds: string[];
  noteCount: number;
  latestNote: string | null;
  linkedEnforcementCount: number;
  complianceBand: ReturnType<
    typeof buildSoberHouseOperatorReportingSummary
  >["residents"][number]["complianceBand"];
  highRisk: boolean;
};

export type ProofReviewStatusSummary = {
  totalTracked: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  followUpCount: number;
  missingCount: number;
  unresolvedCount: number;
  residentsWithProblems: number;
  issuesByCategory: Partial<Record<ProofReviewCategory, number>>;
};

export type ProofReviewResidentSummary = ProofReviewStatusSummary & {
  residentId: string;
};

export type ProofReviewHouseSummary = ProofReviewStatusSummary & {
  houseId: string;
};

export type ProofReviewTimelineEvent = {
  id: string;
  residentId: string;
  at: string;
  title: string;
  detail: string;
  status: ProofReviewDerivedStatus;
};

export type SoberHouseProofReviewSummary = {
  queue: ProofReviewQueueItem[];
  residentSummaries: Map<string, ProofReviewResidentSummary>;
  houseSummaries: Map<string, ProofReviewHouseSummary>;
  organizationSummary: ProofReviewStatusSummary;
  residentTimelineById: Map<string, ProofReviewTimelineEvent[]>;
};

type ReviewableSource = {
  category: ProofReviewCategory;
  sourceRecordType: ProofReviewSourceRecordType;
  sourceRecordId: string;
  residentId: string;
  linkedUserId: string;
  houseId: string | null;
  title: string;
  dueAt: string | null;
  submittedAt: string | null;
  proofRequired: boolean;
  proofProvided: boolean;
  proofReference: string | null;
  evidenceItemIds: string[];
};

function queueItemId(
  sourceRecordType: ProofReviewSourceRecordType,
  sourceRecordId: string,
): string {
  return `${sourceRecordType}:${sourceRecordId}`;
}

function isNonNull<T>(value: T | null): value is T {
  return value !== null;
}

function reviewStatusFromRecord(record: ProofReviewRecord | null): ProofReviewDerivedStatus | null {
  if (!record) {
    return null;
  }
  switch (record.status) {
    case "APPROVED":
      return "approved";
    case "REJECTED":
      return "rejected";
    case "FOLLOW_UP_REQUIRED":
      return "follow_up_required";
    case "PENDING":
    default:
      return "pending";
  }
}

function resolveDerivedStatus(
  source: ReviewableSource,
  reviewRecord: ProofReviewRecord | null,
): ProofReviewDerivedStatus {
  if (!source.proofRequired && !source.proofProvided && !reviewRecord) {
    return "not_tracked";
  }
  if (source.proofRequired && !source.proofProvided) {
    return "missing";
  }
  return reviewStatusFromRecord(reviewRecord) ?? "pending";
}

function collectEvidenceIds(
  store: SoberHouseSettingsStore,
  sourceRecordType: ProofReviewSourceRecordType,
  sourceRecordId: string,
): string[] {
  return store.evidenceItems
    .filter((item) => {
      const completionRecordId = item.metadata.completionRecordId;
      const completionRecordType = item.metadata.completionRecordType;
      if (completionRecordId !== sourceRecordId) {
        return false;
      }
      if (sourceRecordType === "CHORE_COMPLETION") {
        return completionRecordType === "CHORE_COMPLETION";
      }
      if (sourceRecordType === "JOB_APPLICATION") {
        return completionRecordType === "JOB_APPLICATION";
      }
      return true;
    })
    .map((item) => item.id);
}

function buildChoreSources(store: SoberHouseSettingsStore): ReviewableSource[] {
  return store.choreCompletionRecords
    .filter(
      (record) =>
        choreRequiresPhotoProof(record.proofRequirement) ||
        record.proofProvided ||
        Boolean(record.proofReference),
    )
    .map((record) => ({
      category: "CHORES" as const,
      sourceRecordType: "CHORE_COMPLETION" as const,
      sourceRecordId: record.id,
      residentId: record.residentId,
      linkedUserId: record.linkedUserId,
      houseId: record.houseId,
      title:
        store.houseChores.find((chore) => chore.id === record.houseChoreId)?.title ?? "Chore proof",
      dueAt: record.completedAt,
      submittedAt: record.completedAt,
      proofRequired: choreRequiresPhotoProof(record.proofRequirement),
      proofProvided: record.proofProvided || Boolean(record.proofReference),
      proofReference: record.proofReference,
      evidenceItemIds: collectEvidenceIds(store, "CHORE_COMPLETION", record.id),
    }));
}

function buildHouseMeetingSources(store: SoberHouseSettingsStore): ReviewableSource[] {
  return store.houseMeetingAttendanceRecords
    .filter(
      (record) => record.proofRequired || record.proofProvided || Boolean(record.proofReference),
    )
    .map((record) => ({
      category: "HOUSE_MEETINGS" as const,
      sourceRecordType: "HOUSE_MEETING_ATTENDANCE" as const,
      sourceRecordId: record.id,
      residentId: record.residentId,
      linkedUserId: record.linkedUserId,
      houseId: record.houseId,
      title:
        store.houseMeetings.find((meeting) => meeting.id === record.houseMeetingId)?.title ??
        "House meeting proof",
      dueAt: record.scheduledStartAt,
      submittedAt: record.attendedAt ?? record.createdAt,
      proofRequired: record.proofRequired,
      proofProvided: record.proofProvided || Boolean(record.proofReference),
      proofReference: record.proofReference,
      evidenceItemIds: collectEvidenceIds(store, "HOUSE_MEETING_ATTENDANCE", record.id),
    }));
}

function buildSponsorSources(store: SoberHouseSettingsStore): ReviewableSource[] {
  return store.sponsorCallRecords
    .filter(
      (record) => record.proofRequired || record.proofProvided || Boolean(record.proofReference),
    )
    .map((record) => ({
      category: "SPONSOR_CALLS" as const,
      sourceRecordType: "SPONSOR_CALL" as const,
      sourceRecordId: record.id,
      residentId: record.residentId,
      linkedUserId: record.linkedUserId,
      houseId: record.houseId,
      title: "Sponsor call proof",
      dueAt: record.scheduledFor,
      submittedAt: record.completedAt ?? record.createdAt,
      proofRequired: record.proofRequired,
      proofProvided: record.proofProvided || Boolean(record.proofReference),
      proofReference: record.proofReference,
      evidenceItemIds: collectEvidenceIds(store, "SPONSOR_CALL", record.id),
    }));
}

function buildJobSearchSources(store: SoberHouseSettingsStore, nowIso: string): ReviewableSource[] {
  return store.jobApplicationRecords
    .map((record) => {
      const ruleSet = getEffectiveRuleSetForScope(store, "HOUSE", record.houseId, nowIso).ruleSet;
      const proofRequired = ruleSet.jobSearch.proofRequired;
      return {
        record,
        proofRequired,
      };
    })
    .filter(
      ({ record, proofRequired }) =>
        proofRequired || record.proofProvided || Boolean(record.proofReference),
    )
    .map(({ record, proofRequired }) => ({
      category: "JOB_SEARCH" as const,
      sourceRecordType: "JOB_APPLICATION" as const,
      sourceRecordId: record.id,
      residentId: record.residentId,
      linkedUserId: record.linkedUserId,
      houseId: record.houseId,
      title: record.employerName.trim().length > 0 ? record.employerName : "Job application proof",
      dueAt: record.appliedAt,
      submittedAt: record.appliedAt,
      proofRequired,
      proofProvided: record.proofProvided || Boolean(record.proofReference),
      proofReference: record.proofReference,
      evidenceItemIds: collectEvidenceIds(store, "JOB_APPLICATION", record.id),
    }));
}

function buildReviewableSources(
  store: SoberHouseSettingsStore,
  nowIso: string,
): ReviewableSource[] {
  return [
    ...buildChoreSources(store),
    ...buildHouseMeetingSources(store),
    ...buildSponsorSources(store),
    ...buildJobSearchSources(store, nowIso),
  ];
}

function emptySummary(): ProofReviewStatusSummary {
  return {
    totalTracked: 0,
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    followUpCount: 0,
    missingCount: 0,
    unresolvedCount: 0,
    residentsWithProblems: 0,
    issuesByCategory: {},
  };
}

function applyStatusCount(
  summary: ProofReviewStatusSummary,
  status: ProofReviewDerivedStatus,
  category: ProofReviewCategory,
) {
  summary.totalTracked += 1;
  if (status === "pending") {
    summary.pendingCount += 1;
  } else if (status === "approved") {
    summary.approvedCount += 1;
  } else if (status === "rejected") {
    summary.rejectedCount += 1;
    summary.unresolvedCount += 1;
  } else if (status === "follow_up_required") {
    summary.followUpCount += 1;
    summary.unresolvedCount += 1;
  } else if (status === "missing") {
    summary.missingCount += 1;
    summary.unresolvedCount += 1;
  }
  if (status === "rejected" || status === "follow_up_required" || status === "missing") {
    summary.issuesByCategory[category] = (summary.issuesByCategory[category] ?? 0) + 1;
  }
}

function buildTimelineByResident(
  queue: ProofReviewQueueItem[],
  records: ProofReviewRecord[],
): Map<string, ProofReviewTimelineEvent[]> {
  const timeline = new Map<string, ProofReviewTimelineEvent[]>();

  for (const record of records) {
    const queueItem = queue.find((item) => item.proofReviewRecordId === record.id);
    record.history.forEach((entry) => {
      const existing = timeline.get(record.residentId) ?? [];
      existing.push({
        id: entry.id,
        residentId: record.residentId,
        at: entry.createdAt,
        title: `${queueItem?.title ?? record.category.replaceAll("_", " ")} review`,
        detail:
          entry.note || `${entry.action.replaceAll("_", " ").toLowerCase()} by ${entry.actor.name}`,
        status: reviewStatusFromRecord(record) ?? "pending",
      });
      timeline.set(record.residentId, existing);
    });
  }

  for (const value of timeline.values()) {
    value.sort((left, right) => right.at.localeCompare(left.at));
  }
  return timeline;
}

export function buildProofReviewRecordDraftFromQueueItem(
  item: ProofReviewQueueItem,
): Omit<
  ProofReviewRecord,
  "id" | "createdAt" | "updatedAt" | "history" | "reviewedAt" | "reviewedBy"
> {
  return {
    residentId: item.residentId,
    linkedUserId: item.linkedUserId,
    houseId: item.houseId,
    organizationId: null,
    category: item.category,
    sourceRecordType: item.sourceRecordType,
    sourceRecordId: item.sourceRecordId,
    linkedEnforcementRecordId: null,
    proofRequired: item.proofRequired,
    proofProvided: item.proofProvided,
    proofReference: item.proofReference,
    evidenceItemIds: item.evidenceItemIds,
    submittedAt: item.submittedAt,
    status:
      item.reviewStatus === "approved"
        ? "APPROVED"
        : item.reviewStatus === "rejected"
          ? "REJECTED"
          : item.reviewStatus === "follow_up_required"
            ? "FOLLOW_UP_REQUIRED"
            : "PENDING",
  };
}

export function filterProofReviewQueue(
  queue: ProofReviewQueueItem[],
  filters: ProofReviewQueueFilters,
): ProofReviewQueueItem[] {
  return queue.filter((item) => {
    if (filters.houseId && item.houseId !== filters.houseId) {
      return false;
    }
    if (filters.residentId && item.residentId !== filters.residentId) {
      return false;
    }
    if (filters.category !== "all" && item.category !== filters.category) {
      return false;
    }
    if (filters.status !== "all" && item.reviewStatus !== filters.status) {
      return false;
    }
    if (filters.proofRequiredOnly && !item.proofRequired) {
      return false;
    }
    if (filters.pendingOnly && item.reviewStatus !== "pending") {
      return false;
    }
    if (filters.rejectedOnly && item.reviewStatus !== "rejected") {
      return false;
    }
    if (filters.missingOnly && item.reviewStatus !== "missing") {
      return false;
    }
    if (filters.highRiskOnly && !item.highRisk) {
      return false;
    }
    return true;
  });
}

export function buildSoberHouseProofReviewSummary(input: {
  store: SoberHouseSettingsStore;
  nowIso: string;
}): SoberHouseProofReviewSummary {
  const reporting = buildSoberHouseOperatorReportingSummary(input);
  const residentMeta = new Map(
    reporting.residents.map((resident) => [resident.residentId, resident] as const),
  );
  const proofEnforcementByResident = new Map<string, EnforcementRecord[]>();
  input.store.enforcementRecords
    .filter(
      (record) =>
        record.category === "MISSING_PROOF" &&
        (record.status === "OPEN" ||
          record.status === "ACKNOWLEDGED" ||
          record.status === "ESCALATED"),
    )
    .forEach((record) => {
      const existing = proofEnforcementByResident.get(record.residentId) ?? [];
      existing.push(record);
      proofEnforcementByResident.set(record.residentId, existing);
    });

  const reviewRecordBySource = new Map<string, ProofReviewRecord>();
  input.store.proofReviewRecords.forEach((record) => {
    reviewRecordBySource.set(queueItemId(record.sourceRecordType, record.sourceRecordId), record);
  });

  const queue = buildReviewableSources(input.store, input.nowIso)
    .map((source): ProofReviewQueueItem | null => {
      const resident = residentMeta.get(source.residentId);
      const reviewRecord =
        reviewRecordBySource.get(queueItemId(source.sourceRecordType, source.sourceRecordId)) ??
        null;
      const reviewStatus = resolveDerivedStatus(source, reviewRecord);
      if (reviewStatus === "not_tracked") {
        return null;
      }
      const house = source.houseId ? getHouseById(input.store, source.houseId) : null;
      const notes = reviewRecord?.history.filter((entry) => entry.note.trim().length > 0) ?? [];
      const linkedEnforcementCount = proofEnforcementByResident.get(source.residentId)?.length ?? 0;
      return {
        id: reviewRecord?.id ?? queueItemId(source.sourceRecordType, source.sourceRecordId),
        sourceKind: reviewRecord ? "record" : "derived",
        proofReviewRecordId: reviewRecord?.id ?? null,
        residentId: source.residentId,
        linkedUserId: source.linkedUserId,
        residentName: resident?.displayName ?? source.residentId,
        houseId: source.houseId,
        houseName: resident?.houseName ?? house?.name ?? "Unassigned",
        category: source.category,
        sourceRecordType: source.sourceRecordType,
        sourceRecordId: source.sourceRecordId,
        title: source.title,
        dueAt: source.dueAt,
        submittedAt: source.submittedAt,
        reviewStatus,
        proofRequired: source.proofRequired,
        proofProvided: source.proofProvided,
        proofReference: source.proofReference,
        evidenceItemIds: source.evidenceItemIds,
        noteCount: notes.length,
        latestNote: notes.length > 0 ? (notes[notes.length - 1]?.note ?? null) : null,
        linkedEnforcementCount,
        complianceBand: resident?.complianceBand ?? "compliant",
        highRisk:
          resident?.complianceBand === "critical" || resident?.complianceBand === "noncompliant",
      };
    })
    .filter(isNonNull)
    .sort((left, right) => {
      const urgencyWeight = (value: ProofReviewDerivedStatus) =>
        value === "missing"
          ? 5
          : value === "rejected"
            ? 4
            : value === "follow_up_required"
              ? 3
              : value === "pending"
                ? 2
                : 1;
      const byUrgency = urgencyWeight(right.reviewStatus) - urgencyWeight(left.reviewStatus);
      if (byUrgency !== 0) {
        return byUrgency;
      }
      return (right.submittedAt ?? right.dueAt ?? "").localeCompare(
        left.submittedAt ?? left.dueAt ?? "",
      );
    });

  const residentSummaries = new Map<string, ProofReviewResidentSummary>();
  const houseSummaries = new Map<string, ProofReviewHouseSummary>();
  const organizationSummary = emptySummary();
  const residentsWithProblems = new Set<string>();
  const housesWithProblems = new Map<string, Set<string>>();

  queue.forEach((item) => {
    const residentSummary = residentSummaries.get(item.residentId) ?? {
      ...emptySummary(),
      residentId: item.residentId,
    };
    applyStatusCount(residentSummary, item.reviewStatus, item.category);
    residentSummaries.set(item.residentId, residentSummary);

    if (item.houseId) {
      const houseSummary = houseSummaries.get(item.houseId) ?? {
        ...emptySummary(),
        houseId: item.houseId,
      };
      applyStatusCount(houseSummary, item.reviewStatus, item.category);
      houseSummaries.set(item.houseId, houseSummary);
    }

    applyStatusCount(organizationSummary, item.reviewStatus, item.category);

    if (
      item.reviewStatus === "missing" ||
      item.reviewStatus === "rejected" ||
      item.reviewStatus === "follow_up_required"
    ) {
      residentsWithProblems.add(item.residentId);
      if (item.houseId) {
        const houseResidentSet = housesWithProblems.get(item.houseId) ?? new Set<string>();
        houseResidentSet.add(item.residentId);
        housesWithProblems.set(item.houseId, houseResidentSet);
      }
    }
  });

  residentSummaries.forEach((summary) => {
    summary.residentsWithProblems = summary.unresolvedCount > 0 ? 1 : 0;
  });
  houseSummaries.forEach((summary) => {
    summary.residentsWithProblems = housesWithProblems.get(summary.houseId)?.size ?? 0;
  });
  organizationSummary.residentsWithProblems = residentsWithProblems.size;

  return {
    queue,
    residentSummaries,
    houseSummaries,
    organizationSummary,
    residentTimelineById: buildTimelineByResident(queue, input.store.proofReviewRecords),
  };
}
