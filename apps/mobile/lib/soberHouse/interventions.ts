import { createEntityId } from "./defaults";
import {
  setViolationStatus,
  upsertCorrectiveAction,
  upsertEvidenceItem,
  upsertViolation,
} from "./mutations";
import { getResidentDisplayName, getViolationById } from "./selectors";
import type {
  AuditActor,
  ComplianceEvaluation,
  ComplianceRuleType,
  CorrectiveAction,
  CorrectiveActionStatus,
  CorrectiveActionType,
  EvidenceItem,
  EvidenceType,
  ResidentComplianceSummary,
  SoberHouseSettingsStore,
  Violation,
  ViolationCreatedBy,
  ViolationRuleType,
  ViolationSeverity,
  ViolationStatus,
} from "./types";

const ACTIVE_VIOLATION_STATUSES: ViolationStatus[] = [
  "OPEN",
  "UNDER_REVIEW",
  "CORRECTIVE_ACTION_ASSIGNED",
];

function toViolationRuleType(ruleType: ComplianceRuleType): ViolationRuleType {
  return ruleType;
}

function parseIsoDate(value: string): Date {
  return new Date(value);
}

function formatDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

function startOfWeekUtc(date: Date): Date {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  const daysSinceMonday = (next.getUTCDay() + 6) % 7;
  next.setUTCDate(next.getUTCDate() - daysSinceMonday);
  return next;
}

export function getComplianceWindowKey(evaluation: ComplianceEvaluation): string {
  const anchor = parseIsoDate(evaluation.dueAt ?? evaluation.evaluatedAt);
  if (
    evaluation.ruleType === "meetings" ||
    evaluation.ruleType === "jobSearch" ||
    evaluation.ruleType === "work"
  ) {
    return `${evaluation.ruleType}:${formatDateKey(startOfWeekUtc(anchor))}`;
  }
  return `${evaluation.ruleType}:${formatDateKey(anchor)}`;
}

export function createEvaluationReference(evaluation: ComplianceEvaluation): string {
  return [
    "evaluation",
    evaluation.ruleType,
    evaluation.residentId,
    evaluation.houseId ?? "no-house",
    getComplianceWindowKey(evaluation),
    evaluation.evaluatedAt,
  ].join(":");
}

export function severityForEvaluation(evaluation: ComplianceEvaluation): ViolationSeverity {
  if (evaluation.ruleType === "curfew") {
    return "CRITICAL";
  }
  if (evaluation.ruleType === "meetings" || evaluation.ruleType === "jobSearch") {
    return "VIOLATION";
  }
  if (evaluation.ruleType === "chores" || evaluation.ruleType === "work") {
    return "WARNING";
  }
  return "INFORMATIONAL";
}

export function getOpenViolationForEvaluation(
  store: SoberHouseSettingsStore,
  evaluation: ComplianceEvaluation,
): Violation | null {
  const windowKey = getComplianceWindowKey(evaluation);
  return (
    store.violations.find(
      (violation) =>
        violation.residentId === evaluation.residentId &&
        violation.ruleType === toViolationRuleType(evaluation.ruleType) &&
        violation.complianceWindowKey === windowKey &&
        ACTIVE_VIOLATION_STATUSES.includes(violation.status),
    ) ?? null
  );
}

function gracePeriodFromEvaluation(evaluation: ComplianceEvaluation): number | null {
  const raw = evaluation.metadata.graceMinutes;
  return typeof raw === "number" ? raw : null;
}

export function syncViolationFromEvaluation(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  evaluation: ComplianceEvaluation,
  timestamp: string,
  createdBy: ViolationCreatedBy = "SYSTEM",
) {
  const housing = store.residentHousingProfile;
  if (evaluation.status !== "violation" || !housing) {
    return { store, auditCount: 0, violation: null as Violation | null };
  }

  const existing = getOpenViolationForEvaluation(store, evaluation);
  const fields = {
    id: existing?.id,
    residentId: housing.residentId,
    linkedUserId: housing.linkedUserId,
    houseId: evaluation.houseId,
    organizationId: store.organization?.id ?? null,
    ruleType: toViolationRuleType(evaluation.ruleType),
    sourceEvaluationReference: createEvaluationReference(evaluation),
    sourceEvaluationSnapshot: evaluation,
    complianceWindowKey: getComplianceWindowKey(evaluation),
    triggeredAt: existing?.triggeredAt ?? timestamp,
    effectiveAt: timestamp,
    dueAt: evaluation.dueAt,
    gracePeriodMinutesUsed: gracePeriodFromEvaluation(evaluation),
    status: existing?.status ?? "OPEN",
    severity: existing?.severity ?? severityForEvaluation(evaluation),
    reasonSummary: evaluation.statusReason,
    managerNotes: existing?.managerNotes ?? "",
    resolutionNotes: existing?.resolutionNotes ?? "",
    createdBy: existing?.createdBy ?? createdBy,
    reviewedBy: existing?.reviewedBy ?? null,
    reviewedAt: existing?.reviewedAt ?? null,
    resolvedBy: existing?.resolvedBy ?? null,
    resolvedAt: existing?.resolvedAt ?? null,
    correctiveActionIds: existing?.correctiveActionIds ?? [],
    evidenceItemIds: existing?.evidenceItemIds ?? [],
  } satisfies Omit<Violation, "id" | "createdAt" | "updatedAt"> & { id?: string };

  const result = upsertViolation(store, actor, fields, timestamp);
  const violation =
    getViolationById(result.store, fields.id ?? result.store.violations[0]?.id ?? "") ??
    result.store.violations.find(
      (item) =>
        item.complianceWindowKey === fields.complianceWindowKey &&
        item.ruleType === fields.ruleType,
    ) ??
    null;

  return { ...result, violation };
}

export function syncViolationsFromComplianceSummary(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  summary: ResidentComplianceSummary | null,
  timestamp: string,
) {
  if (!summary) {
    return { store, auditCount: 0, violations: [] as Violation[] };
  }

  let nextStore = store;
  let auditCount = 0;
  const violations: Violation[] = [];
  for (const evaluation of summary.evaluations) {
    if (evaluation.status !== "violation") {
      continue;
    }
    const result = syncViolationFromEvaluation(nextStore, actor, evaluation, timestamp);
    nextStore = result.store;
    auditCount += result.auditCount;
    if (result.violation) {
      violations.push(result.violation);
    }
  }

  return { store: nextStore, auditCount, violations };
}

export function labelForViolationStatus(status: ViolationStatus): string {
  switch (status) {
    case "UNDER_REVIEW":
      return "Under review";
    case "CORRECTIVE_ACTION_ASSIGNED":
      return "Corrective action assigned";
    default:
      return status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");
  }
}

export function labelForViolationSeverity(severity: ViolationSeverity): string {
  return severity.charAt(0) + severity.slice(1).toLowerCase();
}

export function labelForViolationRuleType(ruleType: ViolationRuleType): string {
  if (ruleType === "jobSearch") {
    return "Job search";
  }
  if (ruleType === "sponsorContact") {
    return "Sponsor contact";
  }
  return ruleType.charAt(0).toUpperCase() + ruleType.slice(1);
}

export function buildResidentViolationSummary(store: SoberHouseSettingsStore) {
  const residentId = store.residentHousingProfile?.residentId ?? null;
  const residentViolations = residentId
    ? store.violations.filter((violation) => violation.residentId === residentId)
    : [];
  const activeCorrectiveActions = residentId
    ? store.correctiveActions.filter(
        (action) =>
          action.residentId === residentId &&
          (action.status === "OPEN" || action.status === "OVERDUE"),
      )
    : [];

  return {
    residentName: getResidentDisplayName(store),
    violations: residentViolations,
    activeCorrectiveActions,
  };
}

export function addCorrectiveActionToViolation(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  violationId: string,
  input: {
    actionType: CorrectiveActionType;
    dueAt: string | null;
    notes: string;
  },
  timestamp: string,
) {
  const violation = getViolationById(store, violationId);
  if (!violation) {
    return { store, auditCount: 0, correctiveAction: null as CorrectiveAction | null };
  }
  const result = upsertCorrectiveAction(
    store,
    actor,
    {
      violationId: violation.id,
      residentId: violation.residentId,
      linkedUserId: violation.linkedUserId,
      houseId: violation.houseId,
      organizationId: violation.organizationId,
      actionType: input.actionType,
      assignedBy: actor,
      assignedAt: timestamp,
      dueAt: input.dueAt,
      notes: input.notes,
      status: "OPEN",
      completedAt: null,
      completionNotes: "",
    },
    timestamp,
  );
  const correctiveAction =
    result.store.correctiveActions.find(
      (action) => action.violationId === violationId && action.assignedAt === timestamp,
    ) ?? null;
  return { ...result, correctiveAction };
}

export function addEvidenceLink(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  violationId: string,
  input: {
    linkedCorrectiveActionId: string | null;
    evidenceType: EvidenceType;
    assetReference: string | null;
    description: string;
    metadata?: Record<string, string | number | boolean | null>;
  },
  timestamp: string,
) {
  const violation = getViolationById(store, violationId);
  if (!violation) {
    return { store, auditCount: 0, evidence: null as EvidenceItem | null };
  }
  const result = upsertEvidenceItem(
    store,
    actor,
    {
      residentId: violation.residentId,
      linkedUserId: violation.linkedUserId,
      houseId: violation.houseId,
      organizationId: violation.organizationId,
      linkedViolationId: violation.id,
      linkedCorrectiveActionId: input.linkedCorrectiveActionId,
      evidenceType: input.evidenceType,
      assetReference: input.assetReference,
      createdAt: timestamp,
      createdBy: actor,
      metadata: input.metadata ?? {},
      description: input.description,
    },
    timestamp,
  );
  const evidence =
    result.store.evidenceItems.find(
      (item) => item.linkedViolationId === violationId && item.createdAt === timestamp,
    ) ?? null;
  return { ...result, evidence };
}

export function transitionViolationForManager(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  violationId: string,
  nextStatus: ViolationStatus,
  timestamp: string,
  notes: string,
) {
  if (nextStatus === "UNDER_REVIEW") {
    return setViolationStatus(store, actor, violationId, nextStatus, timestamp, {
      managerNotes: notes,
      reviewedBy: actor,
      reviewedAt: timestamp,
    });
  }
  if (nextStatus === "RESOLVED") {
    return setViolationStatus(store, actor, violationId, nextStatus, timestamp, {
      resolutionNotes: notes,
      resolvedBy: actor,
      resolvedAt: timestamp,
    });
  }
  if (nextStatus === "DISMISSED") {
    return setViolationStatus(store, actor, violationId, nextStatus, timestamp, {
      resolutionNotes: notes,
      resolvedBy: actor,
      resolvedAt: timestamp,
    });
  }
  return setViolationStatus(store, actor, violationId, nextStatus, timestamp, {
    managerNotes: notes,
  });
}

export function transitionCorrectiveActionStatus(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  actionId: string,
  nextStatus: CorrectiveActionStatus,
  timestamp: string,
  completionNotes: string,
) {
  const existing = store.correctiveActions.find((action) => action.id === actionId);
  if (!existing) {
    return { store, auditCount: 0 };
  }
  return upsertCorrectiveAction(
    store,
    actor,
    {
      ...existing,
      status: nextStatus,
      completedAt: nextStatus === "COMPLETED" ? timestamp : existing.completedAt,
      completionNotes,
    },
    timestamp,
  );
}

export function createManualViolation(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  input: {
    ruleType: ViolationRuleType;
    severity: ViolationSeverity;
    reasonSummary: string;
    dueAt?: string | null;
  },
  timestamp: string,
) {
  const housing = store.residentHousingProfile;
  if (!housing) {
    return { store, auditCount: 0, violation: null as Violation | null };
  }
  const result = upsertViolation(
    store,
    actor,
    {
      residentId: housing.residentId,
      linkedUserId: housing.linkedUserId,
      houseId: housing.houseId,
      organizationId: housing.organizationId,
      ruleType: input.ruleType,
      sourceEvaluationReference: null,
      sourceEvaluationSnapshot: null,
      complianceWindowKey: `${housing.residentId}:${input.ruleType}:${createEntityId("manual-window")}`,
      triggeredAt: timestamp,
      effectiveAt: timestamp,
      dueAt: input.dueAt ?? null,
      gracePeriodMinutesUsed: null,
      status: "OPEN",
      severity: input.severity,
      reasonSummary: input.reasonSummary,
      managerNotes: "",
      resolutionNotes: "",
      createdBy: "MANUAL",
      reviewedBy: null,
      reviewedAt: null,
      resolvedBy: null,
      resolvedAt: null,
      correctiveActionIds: [],
      evidenceItemIds: [],
    },
    timestamp,
  );
  return {
    ...result,
    violation: result.store.violations[0] ?? null,
  };
}
