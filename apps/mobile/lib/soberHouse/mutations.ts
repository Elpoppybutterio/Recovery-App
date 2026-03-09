import { appendAuditEntries, buildAuditEntriesForChange } from "./audit";
import {
  cloneSoberHouseStore,
  createDefaultAlertPreference,
  createDefaultChoreCompletionRecord,
  createDefaultHouse,
  createDefaultHouseRuleSet,
  createDefaultJobApplicationRecord,
  createDefaultOrganization,
  createDefaultStaffAssignment,
  createDefaultWorkVerificationRecord,
} from "./defaults";
import type {
  AlertPreference,
  AuditActor,
  ChoreCompletionRecord,
  House,
  HouseRuleSet,
  JobApplicationRecord,
  Organization,
  ResidentConsentRecord,
  ResidentHousingProfile,
  ResidentRequirementProfile,
  SoberHouseEntityType,
  ResidentWizardDraft,
  SoberHouseSettingsStore,
  StaffAssignment,
  WorkVerificationRecord,
} from "./types";

type MutationResult = {
  store: SoberHouseSettingsStore;
  auditCount: number;
};

type HouseMutationFields = Omit<
  House,
  "id" | "createdAt" | "updatedAt" | "organizationId" | "geofenceCenterLat" | "geofenceCenterLng"
> & {
  id?: string;
  geofenceCenterLat?: number | null;
  geofenceCenterLng?: number | null;
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

function replaceById<T extends { id: string }>(items: T[], nextValue: T): T[] {
  const existingIndex = items.findIndex((item) => item.id === nextValue.id);
  if (existingIndex === -1) {
    return [nextValue, ...items];
  }

  return items.map((item) => (item.id === nextValue.id ? nextValue : item));
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
  fields: Omit<HouseRuleSet, "id" | "createdAt" | "updatedAt" | "organizationId"> & {
    id?: string;
  },
  timestamp: string,
): MutationResult {
  const previous =
    store.houseRuleSets.find((ruleSet) => ruleSet.houseId === fields.houseId) ?? null;
  const base =
    previous ??
    createDefaultHouseRuleSet(timestamp, fields.houseId, store.organization?.id ?? null, fields.id);
  const nextValue: HouseRuleSet = {
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
    "houseRuleSet",
    previous,
    nextValue,
    (draftStore) => ({
      ...draftStore,
      houseRuleSets: replaceById(
        draftStore.houseRuleSets.filter((ruleSet) => ruleSet.houseId !== nextValue.houseId),
        nextValue,
      ),
    }),
    timestamp,
  );
}

export function setHouseRuleSetStatus(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  houseId: string,
  status: HouseRuleSet["status"],
  timestamp: string,
): MutationResult {
  const previous = store.houseRuleSets.find((ruleSet) => ruleSet.houseId === houseId);
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

export function saveResidentWizardDraft(
  store: SoberHouseSettingsStore,
  draft: ResidentWizardDraft | null,
): SoberHouseSettingsStore {
  return {
    ...cloneSoberHouseStore(store),
    residentWizardDraft: draft ? { ...draft } : null,
  };
}
