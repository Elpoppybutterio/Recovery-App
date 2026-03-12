import { appendAuditEntries, buildAuditActionEntry, buildAuditEntriesForChange } from "./audit";
import {
  cloneSoberHouseStore,
  createDefaultAlertPreference,
  createDefaultChatMessage,
  createDefaultChatMessageReceipt,
  createDefaultChatParticipant,
  createDefaultChatThread,
  createDefaultChoreCompletionRecord,
  createDefaultCorrectiveAction,
  createDefaultEvidenceItem,
  createDefaultHouse,
  createDefaultHouseGroup,
  createDefaultHouseRuleSet,
  createDefaultJobApplicationRecord,
  createDefaultMonthlyReport,
  createDefaultOrganization,
  createDefaultSoberHouseUserAccessProfile,
  createDefaultStaffAssignment,
  createDefaultViolation,
  createDefaultWorkVerificationRecord,
} from "./defaults";
import type {
  AlertPreference,
  AuditActor,
  ChatMessage,
  ChatMessageReceipt,
  ChatParticipant,
  ChatThread,
  ChoreCompletionRecord,
  CorrectiveAction,
  EvidenceItem,
  House,
  HouseGroup,
  HouseRuleSet,
  JobApplicationRecord,
  MonthlyReport,
  Organization,
  ResidentConsentRecord,
  ResidentHousingProfile,
  ResidentRequirementProfile,
  ResidentWizardDraft,
  SoberHouseEntityType,
  SoberHouseSettingsStore,
  SoberHouseUserAccessProfile,
  StaffAssignment,
  Violation,
  ViolationStatus,
  WorkVerificationRecord,
} from "./types";

type MutationResult = {
  store: SoberHouseSettingsStore;
  auditCount: number;
};

type HouseMutationFields = Omit<
  House,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "organizationId"
  | "houseGroupId"
  | "geofenceCenterLat"
  | "geofenceCenterLng"
> & {
  id?: string;
  houseGroupId?: string | null;
  geofenceCenterLat?: number | null;
  geofenceCenterLng?: number | null;
};

type HouseGroupMutationFields = Omit<
  HouseGroup,
  "id" | "createdAt" | "updatedAt" | "organizationId"
> & {
  id?: string;
};

function applyAuditedEntityChange<T extends { id: string }>(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  entityType: SoberHouseEntityType,
  previousValue: T | null,
  nextValue: T,
  applyChange: (draftStore: SoberHouseSettingsStore) => SoberHouseSettingsStore,
  timestamp: string,
): MutationResult {
  const changedStore = applyChange(cloneSoberHouseStore(store));
  const auditEntries = buildAuditEntriesForChange(
    actor,
    entityType,
    nextValue.id,
    previousValue as Record<string, unknown> | null,
    nextValue as Record<string, unknown>,
    timestamp,
  );

  return {
    store: appendAuditEntries(changedStore, auditEntries),
    auditCount: auditEntries.length,
  };
}

export function upsertOrganization(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  fields: Omit<Organization, "id" | "createdAt" | "updatedAt"> & { id?: string },
  timestamp: string,
): MutationResult {
  const previous = store.organization;
  const base = previous ?? createDefaultOrganization(timestamp, fields.id);
  const nextValue: Organization = {
    ...base,
    ...fields,
    id: base.id,
    createdAt: base.createdAt,
    updatedAt: timestamp,
  };

  return applyAuditedEntityChange(
    store,
    actor,
    "organization",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      organization: nextValue,
      houseGroups: draftStore.houseGroups.map((group) => ({
        ...group,
        organizationId: nextValue.id,
      })),
      houses: draftStore.houses.map((house) => ({ ...house, organizationId: nextValue.id })),
      staffAssignments: draftStore.staffAssignments.map((assignment) => ({
        ...assignment,
        organizationId: nextValue.id,
      })),
      houseRuleSets: draftStore.houseRuleSets.map((ruleSet) => ({
        ...ruleSet,
        organizationId: nextValue.id,
      })),
      alertPreferences: draftStore.alertPreferences.map((preference) => ({
        ...preference,
        organizationId: nextValue.id,
      })),
    }),
    timestamp,
  );
}

export function upsertUserAccessProfile(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  fields: Omit<SoberHouseUserAccessProfile, "id" | "createdAt" | "updatedAt"> & { id?: string },
  timestamp: string,
): MutationResult {
  const previous = store.userAccessProfile;
  const base =
    previous ?? createDefaultSoberHouseUserAccessProfile(timestamp, fields.linkedUserId, fields.id);
  const nextValue: SoberHouseUserAccessProfile = {
    ...base,
    ...fields,
    id: base.id,
    createdAt: base.createdAt,
    updatedAt: timestamp,
  };

  return applyAuditedEntityChange(
    store,
    actor,
    "userAccessProfile",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      userAccessProfile: nextValue,
    }),
    timestamp,
  );
}

function replaceById<T extends { id: string }>(items: T[], nextValue: T): T[] {
  const existingIndex = items.findIndex((item) => item.id === nextValue.id);
  if (existingIndex === -1) {
    return [nextValue, ...items];
  }

  return items.map((item) => (item.id === nextValue.id ? nextValue : item));
}

function syncHouseGroupMembership(
  houseGroups: HouseGroup[],
  houseId: string,
  nextHouseGroupId: string | null,
): HouseGroup[] {
  return houseGroups.map((group) => {
    const withoutHouse = group.houseIds.filter((groupHouseId) => groupHouseId !== houseId);
    if (group.id !== nextHouseGroupId) {
      return withoutHouse.length === group.houseIds.length
        ? group
        : { ...group, houseIds: withoutHouse };
    }
    return withoutHouse.includes(houseId)
      ? { ...group, houseIds: withoutHouse }
      : { ...group, houseIds: [...withoutHouse, houseId] };
  });
}

function matchesRuleScope(ruleSet: HouseRuleSet, candidate: HouseRuleSet): boolean {
  return (
    ruleSet.scopeType === candidate.scopeType &&
    ruleSet.houseId === candidate.houseId &&
    ruleSet.houseGroupId === candidate.houseGroupId
  );
}

export function upsertHouseGroup(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  fields: HouseGroupMutationFields,
  timestamp: string,
): MutationResult {
  const previous = store.houseGroups.find((group) => group.id === fields.id) ?? null;
  const base =
    previous ?? createDefaultHouseGroup(timestamp, store.organization?.id ?? null, fields.id);
  const nextValue: HouseGroup = {
    ...base,
    ...fields,
    id: base.id,
    organizationId: store.organization?.id ?? null,
    houseIds: Array.from(new Set(fields.houseIds ?? base.houseIds)),
    createdAt: base.createdAt,
    updatedAt: timestamp,
  };

  return applyAuditedEntityChange(
    store,
    actor,
    "houseGroup",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      houseGroups: replaceById(draftStore.houseGroups, nextValue),
      houses: draftStore.houses.map((house) => ({
        ...house,
        houseGroupId: nextValue.houseIds.includes(house.id)
          ? nextValue.id
          : house.houseGroupId === nextValue.id
            ? null
            : house.houseGroupId,
      })),
    }),
    timestamp,
  );
}

export function setHouseGroupStatus(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  houseGroupId: string,
  status: HouseGroup["status"],
  timestamp: string,
): MutationResult {
  const previous = store.houseGroups.find((group) => group.id === houseGroupId);
  if (!previous) {
    return { store, auditCount: 0 };
  }

  return upsertHouseGroup(store, actor, { ...previous, status }, timestamp);
}

export function upsertHouse(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  fields: HouseMutationFields,
  timestamp: string,
): MutationResult {
  const previous = store.houses.find((house) => house.id === fields.id) ?? null;
  const base = previous ?? createDefaultHouse(timestamp, store.organization?.id ?? null, fields.id);
  const nextValue: House = {
    ...base,
    ...fields,
    id: base.id,
    organizationId: store.organization?.id ?? null,
    createdAt: base.createdAt,
    updatedAt: timestamp,
  };

  return applyAuditedEntityChange(
    store,
    actor,
    "house",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      houseGroups: syncHouseGroupMembership(
        draftStore.houseGroups,
        nextValue.id,
        nextValue.houseGroupId,
      ),
      houses: replaceById(draftStore.houses, nextValue),
    }),
    timestamp,
  );
}

export function setHouseStatus(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  houseId: string,
  status: House["status"],
  timestamp: string,
): MutationResult {
  const previous = store.houses.find((house) => house.id === houseId);
  if (!previous) {
    return { store, auditCount: 0 };
  }

  return upsertHouse(store, actor, { ...previous, status }, timestamp);
}

export function upsertStaffAssignment(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  fields: Omit<StaffAssignment, "id" | "createdAt" | "updatedAt" | "organizationId"> & {
    id?: string;
  },
  timestamp: string,
): MutationResult {
  const previous = store.staffAssignments.find((assignment) => assignment.id === fields.id) ?? null;
  const base =
    previous ?? createDefaultStaffAssignment(timestamp, store.organization?.id ?? null, fields.id);
  const nextValue: StaffAssignment = {
    ...base,
    ...fields,
    id: base.id,
    organizationId: store.organization?.id ?? null,
    createdAt: base.createdAt,
    updatedAt: timestamp,
  };

  return applyAuditedEntityChange(
    store,
    actor,
    "staffAssignment",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      staffAssignments: replaceById(draftStore.staffAssignments, nextValue),
    }),
    timestamp,
  );
}

export function setStaffAssignmentStatus(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  assignmentId: string,
  status: StaffAssignment["status"],
  timestamp: string,
): MutationResult {
  const previous = store.staffAssignments.find((assignment) => assignment.id === assignmentId);
  if (!previous) {
    return { store, auditCount: 0 };
  }

  return upsertStaffAssignment(store, actor, { ...previous, status }, timestamp);
}

export function upsertHouseRuleSet(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  fields: Partial<
    Omit<
      HouseRuleSet,
      "id" | "createdAt" | "updatedAt" | "organizationId" | "scopeType" | "houseId" | "houseGroupId"
    >
  > & {
    id?: string;
    scopeType?: HouseRuleSet["scopeType"];
    houseId?: string | null;
    houseGroupId?: string | null;
  },
  timestamp: string,
): MutationResult {
  const scopeType =
    fields.scopeType ??
    (fields.houseId ? "HOUSE" : fields.houseGroupId ? "HOUSE_GROUP" : "ORGANIZATION");
  const previous =
    (fields.id ? store.houseRuleSets.find((ruleSet) => ruleSet.id === fields.id) : null) ??
    store.houseRuleSets.find(
      (ruleSet) =>
        ruleSet.scopeType === scopeType &&
        ruleSet.houseId === (fields.houseId ?? null) &&
        ruleSet.houseGroupId === (fields.houseGroupId ?? null),
    ) ??
    null;
  const base =
    previous ??
    createDefaultHouseRuleSet(
      timestamp,
      fields.houseId ?? "",
      store.organization?.id ?? null,
      fields.id,
    );
  const nextValue: HouseRuleSet = {
    ...base,
    ...fields,
    curfew: { ...base.curfew, ...(fields.curfew ?? {}) },
    chores: { ...base.chores, ...(fields.chores ?? {}) },
    employment: { ...base.employment, ...(fields.employment ?? {}) },
    jobSearch: { ...base.jobSearch, ...(fields.jobSearch ?? {}) },
    meetings: { ...base.meetings, ...(fields.meetings ?? {}) },
    sponsorContact: { ...base.sponsorContact, ...(fields.sponsorContact ?? {}) },
    oneOnOne: { ...base.oneOnOne, ...(fields.oneOnOne ?? {}) },
    id: base.id,
    organizationId: store.organization?.id ?? null,
    scopeType,
    houseId: scopeType === "HOUSE" ? (fields.houseId ?? null) : null,
    houseGroupId: scopeType === "HOUSE_GROUP" ? (fields.houseGroupId ?? null) : null,
    createdAt: base.createdAt,
    updatedAt: timestamp,
  };

  return applyAuditedEntityChange(
    store,
    actor,
    "houseRuleSet",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      houseRuleSets: replaceById(
        draftStore.houseRuleSets.filter((ruleSet) => !matchesRuleScope(ruleSet, nextValue)),
        nextValue,
      ),
    }),
    timestamp,
  );
}

export function setHouseRuleSetStatus(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  ruleSetId: string,
  status: HouseRuleSet["status"],
  timestamp: string,
): MutationResult {
  const previous = store.houseRuleSets.find((ruleSet) => ruleSet.id === ruleSetId);
  if (!previous) {
    return { store, auditCount: 0 };
  }

  return upsertHouseRuleSet(store, actor, { ...previous, status }, timestamp);
}

export function upsertAlertPreference(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  fields: Omit<AlertPreference, "id" | "createdAt" | "updatedAt" | "organizationId"> & {
    id?: string;
  },
  timestamp: string,
): MutationResult {
  const previous = store.alertPreferences.find((preference) => preference.id === fields.id) ?? null;
  const base =
    previous ?? createDefaultAlertPreference(timestamp, store.organization?.id ?? null, fields.id);
  const nextValue: AlertPreference = {
    ...base,
    ...fields,
    id: base.id,
    organizationId: store.organization?.id ?? null,
    createdAt: base.createdAt,
    updatedAt: timestamp,
  };

  return applyAuditedEntityChange(
    store,
    actor,
    "alertPreference",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      alertPreferences: replaceById(draftStore.alertPreferences, nextValue),
    }),
    timestamp,
  );
}

export function setAlertPreferenceStatus(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  preferenceId: string,
  status: AlertPreference["status"],
  timestamp: string,
): MutationResult {
  const previous = store.alertPreferences.find((preference) => preference.id === preferenceId);
  if (!previous) {
    return { store, auditCount: 0 };
  }

  return upsertAlertPreference(store, actor, { ...previous, status }, timestamp);
}

export function upsertResidentHousingProfile(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  nextValue: ResidentHousingProfile,
  timestamp: string,
): MutationResult {
  return applyAuditedEntityChange(
    store,
    actor,
    "residentHousingProfile",
    store.residentHousingProfile,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      residentHousingProfile: { ...nextValue, updatedAt: timestamp },
    }),
    timestamp,
  );
}

export function upsertResidentRequirementProfile(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  nextValue: ResidentRequirementProfile,
  timestamp: string,
): MutationResult {
  return applyAuditedEntityChange(
    store,
    actor,
    "residentRequirementProfile",
    store.residentRequirementProfile,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      residentRequirementProfile: { ...nextValue, updatedAt: timestamp },
    }),
    timestamp,
  );
}

export function upsertResidentConsentRecord(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  nextValue: ResidentConsentRecord,
  timestamp: string,
): MutationResult {
  return applyAuditedEntityChange(
    store,
    actor,
    "residentConsentRecord",
    store.residentConsentRecord,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      residentConsentRecord: { ...nextValue, updatedAt: timestamp },
    }),
    timestamp,
  );
}

export function upsertChoreCompletionRecord(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  fields: Omit<ChoreCompletionRecord, "id" | "createdAt" | "updatedAt"> & { id?: string },
  timestamp: string,
): MutationResult {
  const previous = store.choreCompletionRecords.find((record) => record.id === fields.id) ?? null;
  const base =
    previous ??
    createDefaultChoreCompletionRecord(
      timestamp,
      fields.residentId,
      fields.linkedUserId,
      fields.organizationId,
      fields.houseId,
      fields.id,
    );
  const nextValue: ChoreCompletionRecord = {
    ...base,
    ...fields,
    id: base.id,
    createdAt: base.createdAt,
    updatedAt: timestamp,
  };

  return applyAuditedEntityChange(
    store,
    actor,
    "choreCompletionRecord",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      choreCompletionRecords: replaceById(draftStore.choreCompletionRecords, nextValue),
    }),
    timestamp,
  );
}

export function upsertJobApplicationRecord(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  fields: Omit<JobApplicationRecord, "id" | "createdAt" | "updatedAt"> & { id?: string },
  timestamp: string,
): MutationResult {
  const previous = store.jobApplicationRecords.find((record) => record.id === fields.id) ?? null;
  const base =
    previous ??
    createDefaultJobApplicationRecord(
      timestamp,
      fields.residentId,
      fields.linkedUserId,
      fields.organizationId,
      fields.houseId,
      fields.id,
    );
  const nextValue: JobApplicationRecord = {
    ...base,
    ...fields,
    id: base.id,
    createdAt: base.createdAt,
    updatedAt: timestamp,
  };

  return applyAuditedEntityChange(
    store,
    actor,
    "jobApplicationRecord",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      jobApplicationRecords: replaceById(draftStore.jobApplicationRecords, nextValue),
    }),
    timestamp,
  );
}

export function upsertWorkVerificationRecord(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  fields: Omit<WorkVerificationRecord, "id" | "createdAt" | "updatedAt"> & { id?: string },
  timestamp: string,
): MutationResult {
  const previous = store.workVerificationRecords.find((record) => record.id === fields.id) ?? null;
  const base =
    previous ??
    createDefaultWorkVerificationRecord(
      timestamp,
      fields.residentId,
      fields.linkedUserId,
      fields.organizationId,
      fields.houseId,
      fields.id,
    );
  const nextValue: WorkVerificationRecord = {
    ...base,
    ...fields,
    id: base.id,
    createdAt: base.createdAt,
    updatedAt: timestamp,
  };

  return applyAuditedEntityChange(
    store,
    actor,
    "workVerificationRecord",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      workVerificationRecords: replaceById(draftStore.workVerificationRecords, nextValue),
    }),
    timestamp,
  );
}

export function upsertViolation(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  fields: Omit<Violation, "id" | "createdAt" | "updatedAt"> & { id?: string },
  timestamp: string,
): MutationResult {
  const previous = store.violations.find((violation) => violation.id === fields.id) ?? null;
  const base =
    previous ??
    createDefaultViolation(
      timestamp,
      fields.residentId,
      fields.linkedUserId,
      fields.organizationId,
      fields.houseId,
      fields.id,
    );
  const nextValue: Violation = {
    ...base,
    ...fields,
    id: base.id,
    createdAt: base.createdAt,
    updatedAt: timestamp,
  };

  const result = applyAuditedEntityChange(
    store,
    actor,
    "violation",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      violations: replaceById(draftStore.violations, nextValue),
    }),
    timestamp,
  );

  const actionEntry = buildAuditActionEntry({
    actor,
    timestamp,
    entityType: "violation",
    entityId: nextValue.id,
    actionTaken: previous ? "violation_updated" : "violation_created",
    fieldChanged: "status",
    oldValue: previous?.status ?? null,
    newValue: nextValue.status,
  });

  return {
    store: appendAuditEntries(result.store, [actionEntry]),
    auditCount: result.auditCount + 1,
  };
}

export function setViolationStatus(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  violationId: string,
  status: ViolationStatus,
  timestamp: string,
  options?: {
    managerNotes?: string;
    resolutionNotes?: string;
    reviewedBy?: AuditActor | null;
    resolvedBy?: AuditActor | null;
    reviewedAt?: string | null;
    resolvedAt?: string | null;
  },
): MutationResult {
  const previous = store.violations.find((violation) => violation.id === violationId);
  if (!previous) {
    return { store, auditCount: 0 };
  }

  const result = upsertViolation(
    store,
    actor,
    {
      ...previous,
      status,
      managerNotes: options?.managerNotes ?? previous.managerNotes,
      resolutionNotes: options?.resolutionNotes ?? previous.resolutionNotes,
      reviewedBy: options?.reviewedBy ?? previous.reviewedBy,
      resolvedBy: options?.resolvedBy ?? previous.resolvedBy,
      reviewedAt: options?.reviewedAt ?? previous.reviewedAt,
      resolvedAt: options?.resolvedAt ?? previous.resolvedAt,
    },
    timestamp,
  );
  const actionTaken =
    status === "UNDER_REVIEW"
      ? "violation_under_review"
      : status === "CORRECTIVE_ACTION_ASSIGNED"
        ? "violation_corrective_action_assigned"
        : status === "RESOLVED"
          ? "violation_resolved"
          : status === "DISMISSED"
            ? "violation_dismissed"
            : "violation_status_changed";
  const actionEntry = buildAuditActionEntry({
    actor,
    timestamp,
    entityType: "violation",
    entityId: violationId,
    actionTaken,
    fieldChanged: "status",
    oldValue: previous.status,
    newValue: status,
  });
  return {
    store: appendAuditEntries(result.store, [actionEntry]),
    auditCount: result.auditCount + 1,
  };
}

export function upsertCorrectiveAction(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  fields: Omit<CorrectiveAction, "id" | "createdAt" | "updatedAt"> & { id?: string },
  timestamp: string,
): MutationResult {
  const previous =
    store.correctiveActions.find((correctiveAction) => correctiveAction.id === fields.id) ?? null;
  const base =
    previous ??
    createDefaultCorrectiveAction(
      timestamp,
      fields.violationId,
      fields.residentId,
      fields.linkedUserId,
      fields.organizationId,
      fields.houseId,
      fields.assignedBy,
      fields.id,
    );
  const nextValue: CorrectiveAction = {
    ...base,
    ...fields,
    id: base.id,
    createdAt: base.createdAt,
    updatedAt: timestamp,
  };

  const result = applyAuditedEntityChange(
    store,
    actor,
    "correctiveAction",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      correctiveActions: replaceById(draftStore.correctiveActions, nextValue),
      violations: draftStore.violations.map((violation) =>
        violation.id !== nextValue.violationId
          ? violation
          : {
              ...violation,
              correctiveActionIds: violation.correctiveActionIds.includes(nextValue.id)
                ? violation.correctiveActionIds
                : [nextValue.id, ...violation.correctiveActionIds],
              status:
                nextValue.status === "CANCELED" && violation.status === "CORRECTIVE_ACTION_ASSIGNED"
                  ? "UNDER_REVIEW"
                  : "CORRECTIVE_ACTION_ASSIGNED",
            },
      ),
    }),
    timestamp,
  );

  const actionEntry = buildAuditActionEntry({
    actor,
    timestamp,
    entityType: "correctiveAction",
    entityId: nextValue.id,
    actionTaken: previous ? "corrective_action_updated" : "corrective_action_assigned",
    fieldChanged: "status",
    oldValue: previous?.status ?? null,
    newValue: nextValue.status,
  });

  return {
    store: appendAuditEntries(result.store, [actionEntry]),
    auditCount: result.auditCount + 1,
  };
}

export function upsertEvidenceItem(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  fields: Omit<EvidenceItem, "id"> & { id?: string },
  timestamp: string,
): MutationResult {
  const previous = store.evidenceItems.find((item) => item.id === fields.id) ?? null;
  const base =
    previous ??
    createDefaultEvidenceItem(
      timestamp,
      fields.residentId,
      fields.linkedUserId,
      fields.organizationId,
      fields.houseId,
      fields.createdBy,
      fields.id,
    );
  const nextValue: EvidenceItem = {
    ...base,
    ...fields,
    id: base.id,
  };

  const result = applyAuditedEntityChange(
    store,
    actor,
    "evidenceItem",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      evidenceItems: replaceById(draftStore.evidenceItems, nextValue),
      violations: nextValue.linkedViolationId
        ? draftStore.violations.map((violation) =>
            violation.id !== nextValue.linkedViolationId
              ? violation
              : {
                  ...violation,
                  evidenceItemIds: violation.evidenceItemIds.includes(nextValue.id)
                    ? violation.evidenceItemIds
                    : [nextValue.id, ...violation.evidenceItemIds],
                },
          )
        : draftStore.violations,
    }),
    timestamp,
  );

  const actionEntry = buildAuditActionEntry({
    actor,
    timestamp,
    entityType: "evidenceItem",
    entityId: nextValue.id,
    actionTaken: previous ? "evidence_updated" : "evidence_linked",
    fieldChanged: "linkedViolationId",
    oldValue: previous?.linkedViolationId ?? null,
    newValue: nextValue.linkedViolationId,
  });

  return {
    store: appendAuditEntries(result.store, [actionEntry]),
    auditCount: result.auditCount + 1,
  };
}

export function upsertChatThread(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  fields: Omit<ChatThread, "id"> & { id?: string },
  timestamp: string,
): MutationResult {
  const previous = store.chatThreads.find((thread) => thread.id === fields.id) ?? null;
  const base = previous ?? createDefaultChatThread(timestamp, fields.createdBy, fields.id);
  const nextValue: ChatThread = {
    ...base,
    ...fields,
    id: base.id,
  };

  const result = applyAuditedEntityChange(
    store,
    actor,
    "chatThread",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      chatThreads: replaceById(draftStore.chatThreads, nextValue),
    }),
    timestamp,
  );

  const actionEntry = buildAuditActionEntry({
    actor,
    timestamp,
    entityType: "chatThread",
    entityId: nextValue.id,
    actionTaken: previous ? "chat_thread_updated" : "chat_thread_created",
    fieldChanged: "threadType",
    oldValue: previous?.threadType ?? null,
    newValue: nextValue.threadType,
  });

  return {
    store: appendAuditEntries(result.store, [actionEntry]),
    auditCount: result.auditCount + 1,
  };
}

export function upsertChatParticipant(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  fields: Omit<ChatParticipant, "id"> & { id?: string },
  timestamp: string,
): MutationResult {
  const previous =
    store.chatParticipants.find((participant) => participant.id === fields.id) ?? null;
  const base =
    previous ?? createDefaultChatParticipant(timestamp, fields.threadId, fields.userId, fields.id);
  const nextValue: ChatParticipant = {
    ...base,
    ...fields,
    id: base.id,
  };

  const result = applyAuditedEntityChange(
    store,
    actor,
    "chatParticipant",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      chatParticipants: replaceById(draftStore.chatParticipants, nextValue),
    }),
    timestamp,
  );

  const actionEntry = buildAuditActionEntry({
    actor,
    timestamp,
    entityType: "chatParticipant",
    entityId: nextValue.id,
    actionTaken: previous ? "chat_participant_updated" : "chat_participant_added",
    fieldChanged: "roleInThread",
    oldValue: previous?.roleInThread ?? null,
    newValue: nextValue.roleInThread,
  });

  return {
    store: appendAuditEntries(result.store, [actionEntry]),
    auditCount: result.auditCount + 1,
  };
}

export function upsertChatMessage(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  fields: Omit<ChatMessage, "id"> & { id?: string },
  timestamp: string,
): MutationResult {
  const previous = store.chatMessages.find((message) => message.id === fields.id) ?? null;
  const base =
    previous ??
    createDefaultChatMessage(timestamp, fields.threadId, fields.senderUserId, fields.id);
  const nextValue: ChatMessage = {
    ...base,
    ...fields,
    id: base.id,
  };

  const result = applyAuditedEntityChange(
    store,
    actor,
    "chatMessage",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      chatMessages: replaceById(draftStore.chatMessages, nextValue),
      chatThreads: draftStore.chatThreads.map((thread) =>
        thread.id !== nextValue.threadId
          ? thread
          : {
              ...thread,
              lastMessageAt: nextValue.createdAt,
            },
      ),
    }),
    timestamp,
  );

  const actionEntry = buildAuditActionEntry({
    actor,
    timestamp,
    entityType: "chatMessage",
    entityId: nextValue.id,
    actionTaken: previous ? "chat_message_updated" : "chat_message_sent",
    fieldChanged: "messageType",
    oldValue: previous?.messageType ?? null,
    newValue: nextValue.messageType,
  });

  return {
    store: appendAuditEntries(result.store, [actionEntry]),
    auditCount: result.auditCount + 1,
  };
}

export function upsertChatMessageReceipt(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  fields: Omit<ChatMessageReceipt, "id"> & { id?: string },
  timestamp: string,
): MutationResult {
  const previous =
    store.chatMessageReceipts.find((receipt) => receipt.id === fields.id) ??
    store.chatMessageReceipts.find(
      (receipt) => receipt.messageId === fields.messageId && receipt.userId === fields.userId,
    ) ??
    null;
  const base =
    previous ?? createDefaultChatMessageReceipt(fields.messageId, fields.userId, fields.id);
  const nextValue: ChatMessageReceipt = {
    ...base,
    ...fields,
    id: base.id,
  };

  const result = applyAuditedEntityChange(
    store,
    actor,
    "chatMessageReceipt",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      chatMessageReceipts: replaceById(draftStore.chatMessageReceipts, nextValue),
    }),
    timestamp,
  );

  const actionEntry = buildAuditActionEntry({
    actor,
    timestamp,
    entityType: "chatMessageReceipt",
    entityId: nextValue.id,
    actionTaken: previous ? "chat_receipt_updated" : "chat_receipt_created",
    fieldChanged: "messageId",
    oldValue: previous?.messageId ?? null,
    newValue: nextValue.messageId,
  });

  return {
    store: appendAuditEntries(result.store, [actionEntry]),
    auditCount: result.auditCount + 1,
  };
}

export function upsertMonthlyReport(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  fields: Omit<MonthlyReport, "id" | "createdAt" | "updatedAt"> & { id?: string },
  timestamp: string,
): MutationResult {
  const previous = store.monthlyReports.find((report) => report.id === fields.id) ?? null;
  const base =
    previous ??
    createDefaultMonthlyReport(timestamp, fields.houseId, fields.summaryPayload, fields.id);
  const nextValue: MonthlyReport = {
    ...base,
    ...fields,
    id: base.id,
    createdAt: base.createdAt,
    updatedAt: timestamp,
  };

  const result = applyAuditedEntityChange(
    store,
    actor,
    "monthlyReport",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      monthlyReports: replaceById(draftStore.monthlyReports, nextValue),
    }),
    timestamp,
  );

  const actionEntry = buildAuditActionEntry({
    actor,
    timestamp,
    entityType: "monthlyReport",
    entityId: nextValue.id,
    actionTaken: previous ? "monthly_report_updated" : "monthly_report_created",
    fieldChanged: "status",
    oldValue: previous?.status ?? null,
    newValue: nextValue.status,
  });

  return {
    store: appendAuditEntries(result.store, [actionEntry]),
    auditCount: result.auditCount + 1,
  };
}

export function saveResidentWizardDraft(
  store: SoberHouseSettingsStore,
  draft: ResidentWizardDraft | null,
): SoberHouseSettingsStore {
  return {
    ...cloneSoberHouseStore(store),
    residentWizardDraft: draft ? { ...draft } : null,
  };
}
