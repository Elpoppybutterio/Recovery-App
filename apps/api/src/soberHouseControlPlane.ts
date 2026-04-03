import type {
  ComplianceEventRow,
  HouseRow,
  OrganizationRow,
  ParticipantProfileRow,
  Repositories,
  UserAccessContext,
  ViolationRow,
} from "./db/repositories";
import { AccessDeniedError } from "./db/tenantRepositories";
import type { TenantRepositories } from "./db/tenantRepositories";
import type { ActorContext } from "./domain/actor";

export type OperatorWebRole = "ORG_ADMIN" | "HOUSE_MANAGER" | "STAFF_VIEWER";

type ResidentDirectoryEntry = {
  residentId: string;
  linkedUserId: string;
  fullName: string;
  phaseLabel: string;
  assignedStaffAssignmentId: string | null;
  houseId: string;
};

type RoleDefaults = Record<OperatorWebRole, { houseId: string | null }>;

type ControlPlaneSession = {
  authMode: "DEV_BEARER";
  operatorUserId: string;
  operatorDisplayName: string;
  organizationId: string;
  organizationName: string;
  operatorRole: OperatorWebRole;
  allowedRoles: OperatorWebRole[];
  availableOrganizations: Array<{
    organizationId: string;
    organizationName: string;
    operatorRole: OperatorWebRole;
  }>;
};

export type OperatorControlPlaneSnapshotResponse = {
  session: ControlPlaneSession;
  data: {
    store: Record<string, unknown>;
    residentDirectory: ResidentDirectoryEntry[];
    roleDefaults: RoleDefaults;
  };
  generatedAt: string;
};

const STORE_VERSION = 16;
const CONTROL_PLANE_CONFIG_KEY_PREFIX = "sober_house.control_plane.";

function controlPlaneConfigKey(organizationId: string): string {
  return `${CONTROL_PLANE_CONFIG_KEY_PREFIX}${organizationId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown, fallback: string[] = []): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : fallback;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function prettifyUserLabel(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function deriveOperatorRoleFromGrant(role: string): OperatorWebRole | null {
  if (role === "org_admin" || role === "platform_owner") {
    return "ORG_ADMIN";
  }
  if (role === "house_manager") {
    return "HOUSE_MANAGER";
  }
  if (role === "resident_user") {
    return "STAFF_VIEWER";
  }
  return null;
}

function defaultOperatorRole(role: OperatorWebRole): OperatorWebRole {
  if (role === "HOUSE_MANAGER") {
    return "HOUSE_MANAGER";
  }
  if (role === "STAFF_VIEWER") {
    return "STAFF_VIEWER";
  }
  return "ORG_ADMIN";
}

function allowedRolesForOperatorRole(role: OperatorWebRole): OperatorWebRole[] {
  if (role === "STAFF_VIEWER") {
    return ["STAFF_VIEWER"];
  }
  if (role === "HOUSE_MANAGER") {
    return ["HOUSE_MANAGER", "STAFF_VIEWER"];
  }
  return ["ORG_ADMIN", "HOUSE_MANAGER", "STAFF_VIEWER"];
}

function operatorRolePriority(role: OperatorWebRole): number {
  if (role === "ORG_ADMIN") {
    return 3;
  }
  if (role === "HOUSE_MANAGER") {
    return 2;
  }
  return 1;
}

function roleDefaultsFromHouses(houses: HouseRow[]): RoleDefaults {
  const firstHouseId = houses[0]?.id ?? null;
  return {
    ORG_ADMIN: { houseId: null },
    HOUSE_MANAGER: { houseId: firstHouseId },
    STAFF_VIEWER: { houseId: firstHouseId },
  };
}

function createEmptyStore(): Record<string, unknown> {
  return {
    version: STORE_VERSION,
    userAccessProfile: null,
    organization: null,
    houseGroups: [],
    houses: [],
    staffAssignments: [],
    houseRuleSets: [],
    residentHouseMemberships: [],
    recurringObligations: [],
    houseMeetings: [],
    oneOnOneSessions: [],
    houseChores: [],
    houseAlertAnnouncements: [],
    alertPreferences: [],
    residentHousingProfile: null,
    residentRequirementProfile: null,
    residentConsentRecord: null,
    residentWizardDraft: null,
    sponsorCallRecords: [],
    houseMeetingAttendanceRecords: [],
    choreCompletionRecords: [],
    jobApplicationRecords: [],
    workVerificationRecords: [],
    violations: [],
    correctiveActions: [],
    evidenceItems: [],
    chatThreads: [],
    chatParticipants: [],
    chatMessages: [],
    chatMessageReceipts: [],
    monthlyReports: [],
    operatorReportExports: [],
    scheduledSummaryRecords: [],
    proofReviewRecords: [],
    enforcementRecords: [],
    auditLogEntries: [],
  };
}

function buildOrganizationStoreRecord(
  organization: OrganizationRow,
  persisted: Record<string, unknown>,
  nowIso: string,
) {
  const existing = isRecord(persisted.organization) ? persisted.organization : {};
  return {
    id: organization.id,
    name: organization.name,
    primaryContactName: stringOr(existing.primaryContactName, ""),
    primaryPhone: stringOr(existing.primaryPhone, ""),
    primaryEmail: stringOr(existing.primaryEmail, ""),
    notes: stringOr(existing.notes, ""),
    status: stringOr(existing.status, "ACTIVE"),
    createdAt: stringOr(existing.createdAt, organization.created_at),
    updatedAt: nowIso,
  };
}

function buildHouseStoreRecord(
  organizationId: string,
  house: HouseRow,
  persistedHouse: Record<string, unknown> | undefined,
) {
  return {
    id: house.id,
    organizationId,
    houseGroupId: stringOrNull(persistedHouse?.houseGroupId),
    name: house.name,
    address: stringOr(persistedHouse?.address, ""),
    phone: stringOr(persistedHouse?.phone, ""),
    geofenceCenterLat: numberOrNull(persistedHouse?.geofenceCenterLat),
    geofenceCenterLng: numberOrNull(persistedHouse?.geofenceCenterLng),
    geofenceRadiusFeetDefault: numberOr(persistedHouse?.geofenceRadiusFeetDefault, 200),
    houseTypes: stringArray(persistedHouse?.houseTypes, ["OTHER"]),
    bedCount: numberOr(persistedHouse?.bedCount, 0),
    notes: stringOr(persistedHouse?.notes, ""),
    status: stringOr(persistedHouse?.status, "ACTIVE"),
    createdAt: stringOr(persistedHouse?.createdAt, house.created_at),
    updatedAt: stringOr(persistedHouse?.updatedAt, house.created_at),
  };
}

function buildResidentMembership(
  profile: ParticipantProfileRow,
  persisted?: Record<string, unknown>,
) {
  const residentId = profile.user_id;
  return {
    id: stringOr(persisted?.id, `membership:${residentId}`),
    residentId,
    linkedUserId: profile.user_id,
    organizationId: profile.organization_id,
    houseId: profile.house_id,
    roomOrBed: stringOr(persisted?.roomOrBed, ""),
    moveInDate: stringOr(persisted?.moveInDate, profile.created_at.slice(0, 10)),
    moveOutDate: stringOrNull(persisted?.moveOutDate),
    isPrimary: booleanOr(persisted?.isPrimary, true),
    status: profile.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    notes: stringOr(persisted?.notes, ""),
    createdAt: stringOr(persisted?.createdAt, profile.created_at),
    updatedAt: stringOr(persisted?.updatedAt, profile.updated_at),
  };
}

function buildResidentDirectoryEntry(
  profile: ParticipantProfileRow,
  persistedMembership?: Record<string, unknown>,
): ResidentDirectoryEntry {
  return {
    residentId: profile.user_id,
    linkedUserId: profile.user_id,
    fullName:
      typeof profile.display_name === "string" && profile.display_name.trim().length > 0
        ? profile.display_name
        : prettifyUserLabel(profile.user_id),
    phaseLabel:
      typeof persistedMembership?.programPhaseOnEntry === "string" &&
      persistedMembership.programPhaseOnEntry.length > 0
        ? persistedMembership.programPhaseOnEntry
        : profile.status === "ACTIVE"
          ? "Active"
          : profile.status === "PENDING"
            ? "Pending"
            : profile.status === "PAUSED"
              ? "Paused"
              : "Inactive",
    assignedStaffAssignmentId: null,
    houseId: profile.house_id ?? "",
  };
}

function mapViolationRuleType(
  violationType: string,
): "curfew" | "chores" | "work" | "jobSearch" | "meetings" | "sponsorContact" | "other" {
  switch (violationType) {
    case "missed_curfew":
      return "curfew";
    case "missed_chore":
      return "chores";
    case "missed_meeting":
      return "meetings";
    case "missed_sponsor_contact":
      return "sponsorContact";
    default:
      return "other";
  }
}

function mapViolationSeverity(
  severity: string,
): "INFORMATIONAL" | "WARNING" | "VIOLATION" | "CRITICAL" {
  switch (severity) {
    case "LOW":
      return "INFORMATIONAL";
    case "MEDIUM":
      return "WARNING";
    case "HIGH":
      return "VIOLATION";
    case "CRITICAL":
    default:
      return "CRITICAL";
  }
}

function mapViolationStatus(
  status: string,
): "OPEN" | "UNDER_REVIEW" | "CORRECTIVE_ACTION_ASSIGNED" | "RESOLVED" | "DISMISSED" {
  switch (status) {
    case "UNDER_REVIEW":
      return "UNDER_REVIEW";
    case "RESOLVED":
      return "RESOLVED";
    case "DISMISSED":
      return "DISMISSED";
    case "OPEN":
    default:
      return "OPEN";
  }
}

function buildViolationStoreRecord(violation: ViolationRow) {
  return {
    id: violation.id,
    residentId: violation.user_id,
    linkedUserId: violation.user_id,
    houseId: violation.house_id,
    organizationId: violation.organization_id,
    ruleType: mapViolationRuleType(violation.violation_type),
    sourceEvaluationReference: violation.detected_from_event_id,
    sourceEvaluationSnapshot: null,
    complianceWindowKey: `${violation.user_id}:${violation.violation_type}:${violation.detected_at.slice(0, 10)}`,
    triggeredAt: violation.detected_at,
    effectiveAt: violation.detected_at,
    dueAt: null,
    gracePeriodMinutesUsed: null,
    status: mapViolationStatus(violation.status),
    severity: mapViolationSeverity(violation.severity),
    reasonSummary: violation.notes ?? violation.violation_type,
    managerNotes: violation.notes ?? "",
    resolutionNotes: "",
    createdBy: "SYSTEM",
    reviewedBy: null,
    reviewedAt: null,
    resolvedBy: null,
    resolvedAt: violation.resolved_at,
    correctiveActionIds: [],
    evidenceItemIds: [],
    createdAt: violation.created_at,
    updatedAt: violation.updated_at,
  };
}

function proofRequirementForCompliance(
  event: ComplianceEventRow,
): Array<"NONE" | "CHECKLIST" | "PHOTO" | "MANAGER_CONFIRMATION"> {
  if (!event.proof_type) {
    return ["NONE"];
  }
  if (
    event.proof_type === "photo" ||
    event.proof_type === "selfie" ||
    event.proof_type === "document_upload"
  ) {
    return ["PHOTO"];
  }
  if (event.proof_type === "staff_verification" || event.proof_type === "officer_verification") {
    return ["MANAGER_CONFIRMATION"];
  }
  return ["CHECKLIST"];
}

function buildSoberHouseChoreRecords(
  persistedStore: Record<string, unknown>,
  complianceEvents: ComplianceEventRow[],
) {
  const persistedChores = recordArray(persistedStore.houseChores);
  const persistedCompletions = recordArray(persistedStore.choreCompletionRecords);
  const choreEvents = complianceEvents.filter((event) => event.event_type === "CHORE_COMPLETED");

  const houseChores = choreEvents.map((event) => {
    const existing = persistedChores.find(
      (entry) => entry.id === `api:chore:${event.obligation_id ?? event.id}`,
    );
    return {
      id: stringOr(existing?.id, `api:chore:${event.obligation_id ?? event.id}`),
      organizationId: event.organization_id,
      houseId: event.house_id,
      residentId: event.user_id,
      linkedUserId: event.user_id,
      recurringObligationId: null,
      title:
        typeof event.metadata_json === "object" &&
        event.metadata_json !== null &&
        typeof (event.metadata_json as Record<string, unknown>).title === "string"
          ? String((event.metadata_json as Record<string, unknown>).title)
          : "Chore",
      summary: "",
      frequency: "WEEKLY",
      dueTimeLocalHhmm: "18:00",
      weekday: null,
      scheduledDate: event.occurred_at.slice(0, 10),
      required: true,
      proofRequirement: proofRequirementForCompliance(event),
      reminderLeadMinutes: 30,
      inAppReminderEnabled: false,
      addToCalendar: false,
      accountabilityRequired: false,
      status: "ACTIVE",
      createdAt: stringOr(existing?.createdAt, event.created_at),
      updatedAt: event.created_at,
    };
  });

  const choreCompletionRecords = choreEvents.map((event) => {
    const existing = persistedCompletions.find((entry) => entry.id === event.id);
    const proofProvided =
      typeof event.proof_uri === "string" ||
      event.signature_present === true ||
      event.verification_status === "SUBMITTED" ||
      event.verification_status === "VERIFIED";
    return {
      id: event.id,
      residentId: event.user_id,
      linkedUserId: event.user_id,
      organizationId: event.organization_id,
      houseId: event.house_id,
      houseChoreId: `api:chore:${event.obligation_id ?? event.id}`,
      completedAt: event.occurred_at,
      proofRequirement: proofRequirementForCompliance(event),
      proofProvided,
      proofReference: typeof event.proof_uri === "string" ? event.proof_uri : null,
      managerConfirmationRequired: false,
      managerConfirmationStatus: "NOT_REQUIRED",
      managerConfirmationRequestedAt: null,
      managerConfirmationRequestedVia: null,
      managerConfirmedAt: null,
      notes: "",
      createdAt: stringOr(existing?.createdAt, event.created_at),
      updatedAt: event.created_at,
    };
  });

  return { houseChores, choreCompletionRecords };
}

function buildSponsorCallRecords(
  persistedStore: Record<string, unknown>,
  complianceEvents: ComplianceEventRow[],
) {
  const persistedCalls = recordArray(persistedStore.sponsorCallRecords);
  return complianceEvents
    .filter(
      (event) =>
        event.event_type === "SPONSOR_CONTACT_COMPLETED" ||
        event.event_type === "SPONSOR_CONTACT_MISSED",
    )
    .map((event) => {
      const existing = persistedCalls.find((entry) => entry.id === event.id);
      const proofProvided =
        typeof event.proof_uri === "string" ||
        event.signature_present === true ||
        event.verification_status === "SUBMITTED" ||
        event.verification_status === "VERIFIED";
      return {
        id: event.id,
        residentId: event.user_id,
        linkedUserId: event.user_id,
        organizationId: event.organization_id,
        houseId: event.house_id,
        scheduledFor: event.occurred_at,
        status: event.event_type === "SPONSOR_CONTACT_COMPLETED" ? "COMPLETED" : "MISSED",
        completedAt: event.event_type === "SPONSOR_CONTACT_COMPLETED" ? event.occurred_at : null,
        proofRequired: Boolean(event.proof_type),
        proofProvided,
        proofReference: typeof event.proof_uri === "string" ? event.proof_uri : null,
        proofType:
          event.proof_type === "staff_verification" || event.proof_type === "officer_verification"
            ? "MANAGER_CONFIRMATION"
            : event.proof_type === "photo" || event.proof_type === "selfie"
              ? "TEXT_CONFIRMATION"
              : "CALL_LOG",
        notes: "",
        createdAt: stringOr(existing?.createdAt, event.created_at),
        updatedAt: event.created_at,
      };
    });
}

async function resolveAvailableOrganizations(
  repositories: Repositories,
  actor: ActorContext,
  accessContext: UserAccessContext,
): Promise<
  Array<{
    organization: OrganizationRow;
    operatorRole: OperatorWebRole;
  }>
> {
  if (accessContext.capabilities.isPlatformOwner) {
    const organizations = await repositories.listOrganizations(actor.tenantId);
    return organizations.map((organization) => ({
      organization,
      operatorRole: "ORG_ADMIN",
    }));
  }

  const scoped = new Map<
    string,
    { organizationId: string; organizationName: string; operatorRole: OperatorWebRole }
  >();
  for (const grant of accessContext.grants) {
    if (!grant.organizationId) {
      continue;
    }
    const operatorRole = deriveOperatorRoleFromGrant(grant.role);
    if (!operatorRole) {
      continue;
    }
    const current = scoped.get(grant.organizationId);
    const nextRole =
      current && operatorRolePriority(current.operatorRole) >= operatorRolePriority(operatorRole)
        ? current.operatorRole
        : operatorRole;
    scoped.set(grant.organizationId, {
      organizationId: grant.organizationId,
      organizationName: grant.organizationName ?? grant.organizationId,
      operatorRole: nextRole,
    });
  }

  return Array.from(scoped.values()).map((entry) => ({
    organization: {
      id: entry.organizationId,
      tenant_id: actor.tenantId,
      name: entry.organizationName,
      created_at: new Date().toISOString(),
    },
    operatorRole: entry.operatorRole,
  }));
}

function mergeRecordsById(
  primary: Array<Record<string, unknown>>,
  secondary: Array<Record<string, unknown>>,
) {
  const merged = new Map<string, Record<string, unknown>>();
  for (const record of secondary) {
    const id = typeof record.id === "string" ? record.id : null;
    if (!id) {
      continue;
    }
    merged.set(id, record);
  }
  for (const record of primary) {
    const id = typeof record.id === "string" ? record.id : null;
    if (!id) {
      continue;
    }
    merged.set(id, record);
  }
  return Array.from(merged.values());
}

function buildStoreFromLiveData(input: {
  organization: OrganizationRow;
  houses: HouseRow[];
  participantProfiles: ParticipantProfileRow[];
  complianceEvents: ComplianceEventRow[];
  violations: ViolationRow[];
  persistedStore: Record<string, unknown>;
  nowIso: string;
}) {
  const base = createEmptyStore();
  const store = {
    ...base,
    ...(isRecord(input.persistedStore) ? input.persistedStore : {}),
  };
  const persistedHouses = recordArray(store.houses);
  const persistedMemberships = recordArray(store.residentHouseMemberships);
  const liveHouses = input.houses.map((house) =>
    buildHouseStoreRecord(
      input.organization.id,
      house,
      persistedHouses.find((entry) => entry.id === house.id),
    ),
  );
  const extraPersistedHouses = persistedHouses.filter(
    (entry) =>
      typeof entry.id === "string" &&
      typeof entry.organizationId === "string" &&
      entry.organizationId === input.organization.id &&
      !liveHouses.some((house) => house.id === entry.id),
  );
  const activeProfiles = input.participantProfiles.filter(
    (profile) =>
      profile.organization_id === input.organization.id &&
      profile.participant_type === "resident_user",
  );
  const residentHouseMemberships = activeProfiles.map((profile) =>
    buildResidentMembership(
      profile,
      persistedMemberships.find(
        (entry) => entry.residentId === profile.user_id || entry.linkedUserId === profile.user_id,
      ),
    ),
  );
  const residentDirectory = activeProfiles.map((profile) =>
    buildResidentDirectoryEntry(
      profile,
      persistedMemberships.find(
        (entry) => entry.residentId === profile.user_id || entry.linkedUserId === profile.user_id,
      ),
    ),
  );
  const liveViolations = input.violations
    .filter((violation) => violation.organization_id === input.organization.id)
    .map(buildViolationStoreRecord);
  const persistedViolations = recordArray(store.violations).filter(
    (entry) => entry.organizationId === input.organization.id,
  );
  const { houseChores, choreCompletionRecords } = buildSoberHouseChoreRecords(
    store,
    input.complianceEvents.filter((event) => event.organization_id === input.organization.id),
  );
  const sponsorCallRecords = buildSponsorCallRecords(
    store,
    input.complianceEvents.filter((event) => event.organization_id === input.organization.id),
  );

  return {
    store: {
      ...base,
      ...store,
      version: STORE_VERSION,
      organization: buildOrganizationStoreRecord(input.organization, store, input.nowIso),
      houses: [...liveHouses, ...extraPersistedHouses],
      residentHouseMemberships,
      houseChores: mergeRecordsById(houseChores, recordArray(store.houseChores)),
      choreCompletionRecords: mergeRecordsById(
        choreCompletionRecords,
        recordArray(store.choreCompletionRecords),
      ),
      sponsorCallRecords: mergeRecordsById(
        sponsorCallRecords,
        recordArray(store.sponsorCallRecords),
      ),
      violations: mergeRecordsById(liveViolations, persistedViolations),
      houseGroups: recordArray(store.houseGroups),
      staffAssignments: recordArray(store.staffAssignments),
      houseRuleSets: recordArray(store.houseRuleSets),
      recurringObligations: recordArray(store.recurringObligations),
      houseMeetings: recordArray(store.houseMeetings),
      oneOnOneSessions: recordArray(store.oneOnOneSessions),
      houseAlertAnnouncements: recordArray(store.houseAlertAnnouncements),
      alertPreferences: recordArray(store.alertPreferences),
      residentHousingProfile: isRecord(store.residentHousingProfile)
        ? store.residentHousingProfile
        : null,
      residentRequirementProfile: isRecord(store.residentRequirementProfile)
        ? store.residentRequirementProfile
        : null,
      residentConsentRecord: isRecord(store.residentConsentRecord)
        ? store.residentConsentRecord
        : null,
      residentWizardDraft: isRecord(store.residentWizardDraft) ? store.residentWizardDraft : null,
      houseMeetingAttendanceRecords: recordArray(store.houseMeetingAttendanceRecords),
      jobApplicationRecords: recordArray(store.jobApplicationRecords),
      workVerificationRecords: recordArray(store.workVerificationRecords),
      correctiveActions: recordArray(store.correctiveActions),
      evidenceItems: recordArray(store.evidenceItems),
      chatThreads: recordArray(store.chatThreads),
      chatParticipants: recordArray(store.chatParticipants),
      chatMessages: recordArray(store.chatMessages),
      chatMessageReceipts: recordArray(store.chatMessageReceipts),
      monthlyReports: recordArray(store.monthlyReports),
      operatorReportExports: recordArray(store.operatorReportExports),
      scheduledSummaryRecords: recordArray(store.scheduledSummaryRecords),
      proofReviewRecords: recordArray(store.proofReviewRecords),
      enforcementRecords: recordArray(store.enforcementRecords),
      auditLogEntries: recordArray(store.auditLogEntries),
    },
    residentDirectory,
  };
}

export async function buildOperatorControlPlaneSnapshot(input: {
  repositories: Repositories;
  tenantRepositories: TenantRepositories;
  actor: ActorContext;
  organizationId?: string | null;
  nowIso: string;
}): Promise<OperatorControlPlaneSnapshotResponse> {
  const accessContext = await input.repositories.findAccessContextByUserId(input.actor.userId);
  if (!accessContext) {
    throw new AccessDeniedError("Missing protected access context.");
  }

  const availableOrganizations = await resolveAvailableOrganizations(
    input.repositories,
    input.actor,
    accessContext,
  );
  if (availableOrganizations.length === 0) {
    throw new AccessDeniedError(
      "No sober-housing organization access is available for this account.",
    );
  }

  const selectedOrganization =
    availableOrganizations.find((entry) => entry.organization.id === input.organizationId) ??
    availableOrganizations[0];
  if (!selectedOrganization) {
    throw new AccessDeniedError(
      "No sober-housing organization access is available for this account.",
    );
  }

  const persistedConfig = await input.tenantRepositories.tenantConfig.getValue(
    input.actor,
    controlPlaneConfigKey(selectedOrganization.organization.id),
  );
  const persistedStore =
    isRecord(persistedConfig) && isRecord(persistedConfig.store)
      ? persistedConfig.store
      : isRecord(persistedConfig)
        ? persistedConfig
        : createEmptyStore();

  const [houses, participantProfiles, complianceEvents, violations] = await Promise.all([
    input.repositories.listHouses(input.actor.tenantId, {
      organizationId: selectedOrganization.organization.id,
    }),
    input.repositories
      .listParticipantProfiles(input.actor.tenantId)
      .then((profiles) =>
        profiles.filter(
          (profile) => profile.organization_id === selectedOrganization.organization.id,
        ),
      ),
    input.repositories.listComplianceEvents(input.actor.tenantId, {
      organizationId: selectedOrganization.organization.id,
    }),
    input.repositories.listViolations(input.actor.tenantId, {
      organizationId: selectedOrganization.organization.id,
    }),
  ]);

  const hydrated = buildStoreFromLiveData({
    organization: selectedOrganization.organization,
    houses,
    participantProfiles,
    complianceEvents,
    violations,
    persistedStore,
    nowIso: input.nowIso,
  });
  const selectedRole = defaultOperatorRole(selectedOrganization.operatorRole);

  return {
    session: {
      authMode: "DEV_BEARER",
      operatorUserId: accessContext.user.userId,
      operatorDisplayName: accessContext.user.displayName,
      organizationId: selectedOrganization.organization.id,
      organizationName: selectedOrganization.organization.name,
      operatorRole: selectedRole,
      allowedRoles: allowedRolesForOperatorRole(selectedOrganization.operatorRole),
      availableOrganizations: availableOrganizations.map((entry) => ({
        organizationId: entry.organization.id,
        organizationName: entry.organization.name,
        operatorRole: entry.operatorRole,
      })),
    },
    data: {
      store: hydrated.store,
      residentDirectory: hydrated.residentDirectory,
      roleDefaults: roleDefaultsFromHouses(houses),
    },
    generatedAt: input.nowIso,
  };
}

export async function persistOperatorControlPlaneStore(input: {
  tenantRepositories: TenantRepositories;
  actor: ActorContext;
  organizationId: string;
  store: unknown;
}): Promise<void> {
  await input.tenantRepositories.tenantConfig.upsert(
    input.actor,
    controlPlaneConfigKey(input.organizationId),
    {
      store: input.store,
    },
  );
}
