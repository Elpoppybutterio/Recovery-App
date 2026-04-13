import type {
  SoberHouseAlertAcknowledgementRecord,
  SoberHouseHouseChoreRecord,
  SoberHouseHouseMeetingRecord,
  SoberHouseLiveStoreSlice,
  SoberHouseOneOnOneSessionRecord,
  SoberHouseProofReviewRecord,
  SoberHouseRecurringObligationRecord,
  SoberHouseResidentMembershipRecord,
  SoberHouseScheduledItemCompletionRecord,
} from "@recovery/shared-types";
import type {
  ComplianceEventRow,
  HouseRow,
  ObligationRow,
  OrganizationRow,
  ParticipantProfileRow,
  ResidentHouseObligationRecord,
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

type ResidentLiveObligationSnapshotRecord = {
  obligationId: string;
  residentId: string;
  residentUserId: string;
  organizationId: string;
  houseId: string;
  obligationType: "HOUSE_MEETING" | "ONE_ON_ONE" | "CHORE";
  title: string;
  scheduledAt: string;
  dueAt: string | null;
  proofRequired: boolean;
  obligationStatus: "ACTIVE" | "INACTIVE";
  completionRecordId: string | null;
  completionStatus: "SCHEDULED" | "COMPLETED" | "MISSED" | "EXCUSED" | null;
  completedAt: string | null;
  submittedAt: string | null;
  proofSubmitted: boolean;
  proofReviewId: string | null;
  proofReviewOutcome: "PENDING" | "APPROVED" | "REJECTED" | "FOLLOW_UP_REQUIRED" | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ComplianceSummaryCounts = {
  dueTodayCount: number;
  completedTodayCount: number;
  overdueCount: number;
  pendingReviewCount: number;
  rejectedProofCount: number;
};

type HouseComplianceSummaryRecord = ComplianceSummaryCounts & {
  houseId: string;
  houseName: string;
};

type ComplianceSummarySnapshot = {
  organization: ComplianceSummaryCounts;
  houses: HouseComplianceSummaryRecord[];
};

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

type ControlPlaneStore = SoberHouseLiveStoreSlice & Record<string, unknown>;

export type OperatorControlPlaneSnapshotResponse = {
  session: ControlPlaneSession;
  data: {
    store: ControlPlaneStore;
    residentDirectory: ResidentDirectoryEntry[];
    roleDefaults: RoleDefaults;
    residentLiveObligations: ResidentLiveObligationSnapshotRecord[];
    complianceSummary: ComplianceSummarySnapshot;
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

function hasObjectKeys(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length > 0;
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

function visibleHouseIdsForRole(
  operatorRole: OperatorWebRole,
  houses: HouseRow[],
  roleDefaults: RoleDefaults,
  store: ControlPlaneStore,
): Set<string> {
  if (operatorRole === "ORG_ADMIN") {
    return new Set(houses.map((house) => house.id));
  }

  const targetHouseId = roleDefaults[operatorRole].houseId;
  if (!targetHouseId) {
    return new Set();
  }

  if (operatorRole === "HOUSE_MANAGER") {
    const assignments = recordArray(store.staffAssignments);
    const matchingAssignment = assignments.find(
      (entry) =>
        stringOr(entry.role, "") === "HOUSE_MANAGER" &&
        stringArray(entry.assignedHouseIds).includes(targetHouseId),
    );
    return new Set(stringArray(matchingAssignment?.assignedHouseIds, [targetHouseId]));
  }

  return new Set([targetHouseId]);
}

function emptyComplianceSummaryCounts(): ComplianceSummaryCounts {
  return {
    dueTodayCount: 0,
    completedTodayCount: 0,
    overdueCount: 0,
    pendingReviewCount: 0,
    rejectedProofCount: 0,
  };
}

function isoDateKey(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizeIsoTimestamp(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function normalizeRequiredIsoTimestamp(primary: unknown, fallback: unknown): string {
  return (
    normalizeIsoTimestamp(primary) ?? normalizeIsoTimestamp(fallback) ?? new Date(0).toISOString()
  );
}

function compareTimestampValues(left: unknown, right: unknown): number {
  const leftIso = normalizeIsoTimestamp(left);
  const rightIso = normalizeIsoTimestamp(right);

  if (leftIso === rightIso) {
    return 0;
  }
  if (leftIso === null) {
    return 1;
  }
  if (rightIso === null) {
    return -1;
  }

  const leftMs = Date.parse(leftIso);
  const rightMs = Date.parse(rightIso);
  if (Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs !== rightMs) {
    return leftMs - rightMs;
  }

  return leftIso < rightIso ? -1 : 1;
}

function isResolvedResidentLiveObligation(
  completionStatus: ResidentLiveObligationSnapshotRecord["completionStatus"],
): boolean {
  return completionStatus === "COMPLETED" || completionStatus === "EXCUSED";
}

function buildComplianceSummaryCounts(
  obligations: ResidentLiveObligationSnapshotRecord[],
  nowIso: string,
): ComplianceSummaryCounts {
  const todayKey = isoDateKey(nowIso);

  return obligations.reduce<ComplianceSummaryCounts>((summary, obligation) => {
    const dueAnchor = obligation.dueAt ?? obligation.scheduledAt;
    const dueToday =
      obligation.obligationStatus === "ACTIVE" &&
      !isResolvedResidentLiveObligation(obligation.completionStatus) &&
      isoDateKey(dueAnchor) === todayKey;

    if (dueToday) {
      summary.dueTodayCount += 1;
    }

    if (
      obligation.completionStatus === "COMPLETED" &&
      isoDateKey(obligation.completedAt) === todayKey
    ) {
      summary.completedTodayCount += 1;
    }

    if (
      obligation.obligationStatus === "ACTIVE" &&
      !isResolvedResidentLiveObligation(obligation.completionStatus) &&
      dueAnchor < nowIso
    ) {
      summary.overdueCount += 1;
    }

    if (obligation.proofReviewOutcome === "PENDING") {
      summary.pendingReviewCount += 1;
    }

    if (obligation.proofReviewOutcome === "REJECTED") {
      summary.rejectedProofCount += 1;
    }

    return summary;
  }, emptyComplianceSummaryCounts());
}

function buildComplianceSummarySnapshot(input: {
  obligations: ResidentLiveObligationSnapshotRecord[];
  houses: HouseRow[];
  visibleHouseIds: Set<string>;
  nowIso: string;
}): ComplianceSummarySnapshot {
  const obligationsByHouseId = new Map<string, ResidentLiveObligationSnapshotRecord[]>();

  input.obligations.forEach((obligation) => {
    if (!input.visibleHouseIds.has(obligation.houseId)) {
      return;
    }
    const current = obligationsByHouseId.get(obligation.houseId) ?? [];
    current.push(obligation);
    obligationsByHouseId.set(obligation.houseId, current);
  });

  const houses = input.houses
    .filter((house) => input.visibleHouseIds.has(house.id))
    .map((house) => ({
      houseId: house.id,
      houseName: house.name,
      ...buildComplianceSummaryCounts(obligationsByHouseId.get(house.id) ?? [], input.nowIso),
    }));

  const visibleObligations = input.obligations.filter((obligation) =>
    input.visibleHouseIds.has(obligation.houseId),
  );

  return {
    organization: buildComplianceSummaryCounts(visibleObligations, input.nowIso),
    houses,
  };
}

function createEmptyStore(): ControlPlaneStore {
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
    alertAcknowledgementRecords: [],
    scheduledItemCompletionRecords: [],
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

function buildPersistedOnlyHouseStoreRecord(
  organizationId: string,
  persistedHouse: Record<string, unknown>,
  nowIso: string,
) {
  const id = stringOr(persistedHouse.id, "");
  if (!id) {
    return null;
  }

  return {
    id,
    organizationId,
    houseGroupId: stringOrNull(persistedHouse.houseGroupId),
    name: stringOr(persistedHouse.name, "Untitled house"),
    address: stringOr(persistedHouse.address, ""),
    phone: stringOr(persistedHouse.phone, ""),
    geofenceCenterLat: numberOrNull(persistedHouse.geofenceCenterLat),
    geofenceCenterLng: numberOrNull(persistedHouse.geofenceCenterLng),
    geofenceRadiusFeetDefault: numberOr(persistedHouse.geofenceRadiusFeetDefault, 200),
    houseTypes: stringArray(persistedHouse.houseTypes, ["OTHER"]),
    bedCount: numberOr(persistedHouse.bedCount, 0),
    notes: stringOr(persistedHouse.notes, ""),
    status: stringOr(persistedHouse.status, "ACTIVE"),
    createdAt: stringOr(persistedHouse.createdAt, nowIso),
    updatedAt: stringOr(persistedHouse.updatedAt, nowIso),
  };
}

function buildResidentMembership(
  profile: ParticipantProfileRow,
): SoberHouseResidentMembershipRecord {
  const residentId = profile.user_id;
  const createdAt = normalizeRequiredIsoTimestamp(profile.created_at, profile.updated_at);
  const updatedAt = normalizeRequiredIsoTimestamp(profile.updated_at, profile.created_at);
  return {
    id: `membership:${residentId}`,
    residentId,
    linkedUserId: profile.user_id,
    organizationId: profile.organization_id,
    houseId: profile.house_id,
    roomOrBed: "",
    moveInDate: isoDateKey(createdAt) ?? new Date(0).toISOString().slice(0, 10),
    moveOutDate: null,
    isPrimary: true,
    status: profile.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    notes: "",
    createdAt,
    updatedAt,
  };
}

function defaultResidentLiveObligationTitle(
  obligationType: ResidentLiveObligationSnapshotRecord["obligationType"],
): string {
  if (obligationType === "HOUSE_MEETING") {
    return "House meeting";
  }
  if (obligationType === "ONE_ON_ONE") {
    return "One-on-one session";
  }
  return "House chore";
}

function buildResidentLiveObligationTitle(input: {
  obligation: ResidentHouseObligationRecord["obligation"];
  obligationTitleById: Map<string, string>;
}): string {
  const mappedTitle = input.obligationTitleById.get(input.obligation.id);
  if (typeof mappedTitle === "string" && mappedTitle.trim().length > 0) {
    return mappedTitle;
  }
  return defaultResidentLiveObligationTitle(input.obligation.obligation_type);
}

function buildResidentDirectoryEntry(profile: ParticipantProfileRow): ResidentDirectoryEntry {
  return {
    residentId: profile.user_id,
    linkedUserId: profile.user_id,
    fullName:
      typeof profile.display_name === "string" && profile.display_name.trim().length > 0
        ? profile.display_name
        : prettifyUserLabel(profile.user_id),
    phaseLabel:
      profile.status === "ACTIVE"
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

function buildResidentLiveObligationSnapshotRecord(
  record: ResidentHouseObligationRecord,
  residentProfileByUserId: Map<string, ParticipantProfileRow>,
  obligationTitleById: Map<string, string>,
): ResidentLiveObligationSnapshotRecord | null {
  const residentProfile = residentProfileByUserId.get(record.obligation.resident_user_id) ?? null;
  if (!residentProfile) {
    return null;
  }

  const proofSubmitted =
    record.completion?.submitted_at !== null ||
    record.completion?.completed_at !== null ||
    hasObjectKeys(record.completion?.proof_metadata_json);
  const scheduledAt = normalizeRequiredIsoTimestamp(
    record.obligation.scheduled_at,
    record.obligation.created_at,
  );
  const dueAt = normalizeIsoTimestamp(record.obligation.due_at);

  return {
    obligationId: record.obligation.id,
    residentId: residentProfile.user_id,
    residentUserId: record.obligation.resident_user_id,
    organizationId: record.obligation.organization_id,
    houseId: record.obligation.house_id,
    obligationType: record.obligation.obligation_type,
    title: buildResidentLiveObligationTitle({
      obligation: record.obligation,
      obligationTitleById,
    }),
    scheduledAt,
    dueAt,
    proofRequired: record.obligation.proof_required,
    obligationStatus: record.obligation.status,
    completionRecordId: record.completion?.id ?? null,
    completionStatus: record.completion?.completion_status ?? null,
    completedAt: normalizeIsoTimestamp(record.completion?.completed_at),
    submittedAt: normalizeIsoTimestamp(record.completion?.submitted_at),
    proofSubmitted,
    proofReviewId: record.proofReview?.id ?? null,
    proofReviewOutcome: record.proofReview?.review_outcome ?? null,
    reviewedAt: normalizeIsoTimestamp(record.proofReview?.reviewed_at),
    createdAt: normalizeRequiredIsoTimestamp(record.obligation.created_at, scheduledAt),
    updatedAt: normalizeRequiredIsoTimestamp(
      record.proofReview?.updated_at ??
        record.completion?.updated_at ??
        record.obligation.updated_at,
      record.obligation.updated_at ?? record.obligation.created_at,
    ),
  };
}

type SoberHouseLiveObligationKind = "HOUSE_MEETING" | "ONE_ON_ONE" | "CHORE";
type SoberHouseLiveProofRequirement =
  | "NONE"
  | "CHECKLIST"
  | "PHOTO"
  | "MANAGER_CONFIRMATION"
  | "SIGNATURE"
  | "ACKNOWLEDGMENT";

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function parseScheduledFrequency(
  value: unknown,
): "ONCE" | "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase().replace(/-/g, "_");
  if (
    normalized === "ONCE" ||
    normalized === "DAILY" ||
    normalized === "WEEKLY" ||
    normalized === "BIWEEKLY" ||
    normalized === "MONTHLY"
  ) {
    return normalized;
  }
  return null;
}

function parseWeekdayCode(
  value: unknown,
): "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN" | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase().slice(0, 3);
  if (
    normalized === "MON" ||
    normalized === "TUE" ||
    normalized === "WED" ||
    normalized === "THU" ||
    normalized === "FRI" ||
    normalized === "SAT" ||
    normalized === "SUN"
  ) {
    return normalized;
  }
  return null;
}

function weekdayListFromRecurrence(
  recurrence: Record<string, unknown> | null,
): Array<"MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN"> {
  if (!recurrence) {
    return [];
  }
  const values = Array.isArray(recurrence.weekdayList)
    ? recurrence.weekdayList
    : Array.isArray(recurrence.weekdays)
      ? recurrence.weekdays
      : Array.isArray(recurrence.repeatDays)
        ? recurrence.repeatDays
        : [];
  return values
    .map((entry) => parseWeekdayCode(entry))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}

function monthlyOrdinalFromRecurrence(
  recurrence: Record<string, unknown> | null,
): 1 | 2 | 3 | 4 | 5 | null {
  const value =
    recurrence?.monthlyOrdinal ?? recurrence?.monthOrdinal ?? recurrence?.ordinal ?? null;
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : null;
}

function dueDatePart(isoValue: string | null): string | null {
  return typeof isoValue === "string" && isoValue.length >= 10 ? isoValue.slice(0, 10) : null;
}

function dueTimePart(isoValue: string | null): string | null {
  return typeof isoValue === "string" && isoValue.length >= 16 ? isoValue.slice(11, 16) : null;
}

function isoFromDateAndTime(datePart: string, timeLocalHhmm: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart) || !/^\d{2}:\d{2}$/.test(timeLocalHhmm)) {
    return null;
  }
  return `${datePart}T${timeLocalHhmm}:00.000Z`;
}

function jsDayFromWeekday(weekday: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN"): number {
  switch (weekday) {
    case "MON":
      return 1;
    case "TUE":
      return 2;
    case "WED":
      return 3;
    case "THU":
      return 4;
    case "FRI":
      return 5;
    case "SAT":
      return 6;
    case "SUN":
      return 0;
  }
}

function nextRecurringOccurrenceIso(input: {
  nowIso: string;
  frequency: "ONCE" | "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  weekdayList: Array<"MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN">;
  monthlyOrdinal: 1 | 2 | 3 | 4 | 5 | null;
  scheduledDate: string | null;
  timeLocalHhmm: string;
}): string | null {
  const now = new Date(input.nowIso);
  if (Number.isNaN(now.getTime())) {
    return null;
  }

  if (input.frequency === "ONCE") {
    return input.scheduledDate
      ? isoFromDateAndTime(input.scheduledDate, input.timeLocalHhmm)
      : null;
  }

  if (input.frequency === "DAILY") {
    const today = dueDatePart(now.toISOString());
    return today ? isoFromDateAndTime(today, input.timeLocalHhmm) : null;
  }

  const primaryWeekday = input.weekdayList[0] ?? null;
  if (!primaryWeekday) {
    return null;
  }

  if (input.frequency === "MONTHLY" && input.monthlyOrdinal) {
    for (let monthOffset = 0; monthOffset < 4; monthOffset += 1) {
      const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1, 0, 0, 0, 0),
      );
      const firstWeekdayOffset =
        (jsDayFromWeekday(primaryWeekday) + 7 - monthStart.getUTCDay()) % 7;
      const candidate = new Date(monthStart);
      candidate.setUTCDate(
        candidate.getUTCDate() + firstWeekdayOffset + (input.monthlyOrdinal - 1) * 7,
      );
      if (candidate.getUTCMonth() !== monthStart.getUTCMonth()) {
        continue;
      }
      const candidateIso = isoFromDateAndTime(
        candidate.toISOString().slice(0, 10),
        input.timeLocalHhmm,
      );
      if (candidateIso && new Date(candidateIso).getTime() >= now.getTime()) {
        return candidateIso;
      }
    }
    return null;
  }

  const weekIncrement = input.frequency === "BIWEEKLY" ? 14 : 7;
  const base = new Date(now);
  base.setUTCHours(0, 0, 0, 0);
  for (let dayOffset = 0; dayOffset < 28; dayOffset += 1) {
    const candidate = new Date(base);
    candidate.setUTCDate(candidate.getUTCDate() + dayOffset);
    if (candidate.getUTCDay() !== jsDayFromWeekday(primaryWeekday)) {
      continue;
    }
    const diffDays = Math.floor((candidate.getTime() - base.getTime()) / (24 * 60 * 60 * 1000));
    if (weekIncrement > 7 && diffDays % weekIncrement !== 0) {
      continue;
    }
    const candidateIso = isoFromDateAndTime(
      candidate.toISOString().slice(0, 10),
      input.timeLocalHhmm,
    );
    if (candidateIso && new Date(candidateIso).getTime() >= now.getTime()) {
      return candidateIso;
    }
  }

  return null;
}

function obligationKind(obligation: ObligationRow): SoberHouseLiveObligationKind | null {
  if (obligation.obligation_type === "meeting_attendance") {
    return "HOUSE_MEETING";
  }
  if (obligation.obligation_type === "treatment_session") {
    return "ONE_ON_ONE";
  }
  if (obligation.obligation_type === "chore") {
    return "CHORE";
  }
  return null;
}

function proofRequirementForObligation(
  obligation: ObligationRow,
): SoberHouseLiveProofRequirement[] {
  if (obligation.requires_signature) {
    return ["SIGNATURE"];
  }
  if (!obligation.requires_proof) {
    return ["NONE"];
  }
  if (
    obligation.proof_type === "photo" ||
    obligation.proof_type === "selfie" ||
    obligation.proof_type === "document_upload"
  ) {
    return ["PHOTO"];
  }
  if (
    obligation.proof_type === "staff_verification" ||
    obligation.proof_type === "officer_verification"
  ) {
    return ["MANAGER_CONFIRMATION"];
  }
  return ["CHECKLIST"];
}

function accountabilityMethodForObligation(
  obligation: ObligationRow,
): "NONE" | "CHECKLIST" | "SIGNATURE" | "PHOTO" | "MANAGER_CONFIRMATION" {
  const proofRequirement = proofRequirementForObligation(obligation)[0] ?? "NONE";
  if (proofRequirement === "SIGNATURE") {
    return "SIGNATURE";
  }
  if (proofRequirement === "PHOTO") {
    return "PHOTO";
  }
  if (proofRequirement === "MANAGER_CONFIRMATION") {
    return "MANAGER_CONFIRMATION";
  }
  if (proofRequirement === "CHECKLIST") {
    return "CHECKLIST";
  }
  return "NONE";
}

function liveEntityStatusForObligation(obligation: ObligationRow): "ACTIVE" | "INACTIVE" {
  return obligation.status === "CANCELED" ? "INACTIVE" : "ACTIVE";
}

function proofRequirementForCompliance(
  event: ComplianceEventRow,
): SoberHouseLiveProofRequirement[] {
  if (event.signature_present) {
    return ["SIGNATURE"];
  }
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

function proofProvidedForComplianceEvent(event: ComplianceEventRow): boolean {
  return (
    typeof event.proof_uri === "string" ||
    event.signature_present === true ||
    event.verification_status === "SUBMITTED" ||
    event.verification_status === "VERIFIED" ||
    event.verification_status === "REJECTED" ||
    event.verification_status === "WAIVED"
  );
}

function eventCompletionStatus(
  event: ComplianceEventRow,
): "SCHEDULED" | "COMPLETED" | "MISSED" | "EXCUSED" {
  if (
    event.event_type === "CHORE_COMPLETED" ||
    event.event_type === "MEETING_ATTENDED" ||
    event.event_type === "TREATMENT_SESSION_ATTENDED"
  ) {
    return "COMPLETED";
  }
  if (
    event.event_type === "CHORE_MISSED" ||
    event.event_type === "MEETING_MISSED" ||
    event.event_type === "TREATMENT_SESSION_MISSED"
  ) {
    return "MISSED";
  }
  return "SCHEDULED";
}

function proofReviewStatusForEvent(
  event: ComplianceEventRow,
): "PENDING" | "APPROVED" | "REJECTED" | "FOLLOW_UP_REQUIRED" {
  if (event.verification_status === "VERIFIED" || event.verification_status === "WAIVED") {
    return "APPROVED";
  }
  if (event.verification_status === "REJECTED") {
    return "REJECTED";
  }
  if (event.event_status === "MISSED") {
    return "FOLLOW_UP_REQUIRED";
  }
  return "PENDING";
}

function liveScopeType(obligation: ObligationRow): "ORGANIZATION" | "HOUSE_GROUP" | "HOUSE" {
  return obligation.house_id ? "HOUSE" : "ORGANIZATION";
}

function normalizeObligationSchedule(obligation: ObligationRow, nowIso: string) {
  const recurrence = recordOrNull(obligation.recurrence_json);
  const weekdayList = weekdayListFromRecurrence(recurrence);
  const weekday =
    parseWeekdayCode(recurrence?.weekday ?? recurrence?.dayOfWeek ?? null) ??
    weekdayList[0] ??
    null;
  const frequency =
    parseScheduledFrequency(recurrence?.frequency ?? recurrence?.repeatUnit ?? null) ??
    (obligation.due_at ? "ONCE" : "WEEKLY");
  const scheduledDate =
    (typeof recurrence?.scheduledDate === "string" ? recurrence.scheduledDate : null) ??
    dueDatePart(obligation.due_at);
  const timeLocalHhmm =
    (typeof recurrence?.timeLocalHhmm === "string" ? recurrence.timeLocalHhmm : null) ??
    dueTimePart(obligation.due_at) ??
    "00:00";
  const durationMinutes =
    typeof recurrence?.durationMinutes === "number" && Number.isFinite(recurrence.durationMinutes)
      ? recurrence.durationMinutes
      : 60;
  const reminderLeadMinutes =
    typeof recurrence?.reminderLeadMinutes === "number" &&
    Number.isFinite(recurrence.reminderLeadMinutes)
      ? recurrence.reminderLeadMinutes
      : 30;
  const startAtIso =
    obligation.due_at ??
    nextRecurringOccurrenceIso({
      nowIso,
      frequency,
      weekdayList: weekday ? (weekdayList.length > 0 ? weekdayList : [weekday]) : weekdayList,
      monthlyOrdinal: monthlyOrdinalFromRecurrence(recurrence),
      scheduledDate,
      timeLocalHhmm,
    });

  return {
    frequency,
    weekday,
    weekdayList: weekday ? (weekdayList.length > 0 ? weekdayList : [weekday]) : weekdayList,
    monthlyOrdinal: monthlyOrdinalFromRecurrence(recurrence),
    scheduledDate,
    timeLocalHhmm,
    durationMinutes,
    reminderLeadMinutes,
    startAtIso,
  };
}

function scheduledItemId(kind: SoberHouseLiveObligationKind, obligationId: string): string {
  if (kind === "HOUSE_MEETING") {
    return `live:house-meeting:${obligationId}`;
  }
  if (kind === "ONE_ON_ONE") {
    return `live:one-on-one:${obligationId}`;
  }
  return `live:house-chore:${obligationId}`;
}

function scheduledItemTypeForKind(
  kind: SoberHouseLiveObligationKind,
): SoberHouseScheduledItemCompletionRecord["scheduledItemType"] {
  if (kind === "HOUSE_MEETING") {
    return "HOUSE_MEETING";
  }
  if (kind === "ONE_ON_ONE") {
    return "ONE_ON_ONE_SESSION";
  }
  return "HOUSE_CHORE";
}

function relevantToOrganization(input: {
  organizationId: string;
  selectedHouseIds: Set<string>;
  residentProfileByUserId: Map<string, ParticipantProfileRow>;
  organizationIdValue: string | null;
  houseIdValue: string | null;
  userIdValue: string | null;
}): boolean {
  if (input.organizationIdValue === input.organizationId) {
    return true;
  }
  if (input.houseIdValue && input.selectedHouseIds.has(input.houseIdValue)) {
    return true;
  }
  if (!input.userIdValue) {
    return false;
  }
  return (
    input.residentProfileByUserId.get(input.userIdValue)?.organization_id === input.organizationId
  );
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

function normalizeAlertAcknowledgementStatus(
  value: unknown,
): SoberHouseAlertAcknowledgementRecord["status"] {
  if (value === "ACKNOWLEDGED" || value === "WAIVED") {
    return value;
  }
  return "PENDING";
}

function normalizeAlertAcknowledgementRecords(
  value: unknown,
): SoberHouseAlertAcknowledgementRecord[] {
  return recordArray(value)
    .map((entry) => {
      const id = stringOrNull(entry.id);
      const residentId = stringOrNull(entry.residentId);
      const linkedUserId = stringOrNull(entry.linkedUserId);
      const alertId = stringOrNull(entry.alertId);
      const createdAt = stringOrNull(entry.createdAt);
      const updatedAt = stringOrNull(entry.updatedAt);

      if (!id || !residentId || !linkedUserId || !alertId || !createdAt || !updatedAt) {
        return null;
      }

      return {
        id,
        residentId,
        linkedUserId,
        organizationId: stringOrNull(entry.organizationId),
        houseId: stringOrNull(entry.houseId),
        alertId,
        required: booleanOr(entry.required, true),
        status: normalizeAlertAcknowledgementStatus(entry.status),
        acknowledgedAt: stringOrNull(entry.acknowledgedAt),
        note: stringOr(entry.note, ""),
        createdAt,
        updatedAt,
      };
    })
    .filter((entry): entry is SoberHouseAlertAcknowledgementRecord => entry !== null);
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

  const scopedRoles = new Map<string, OperatorWebRole>();
  for (const grant of accessContext.grants) {
    if (!grant.organizationId) {
      continue;
    }
    const operatorRole = deriveOperatorRoleFromGrant(grant.role);
    if (!operatorRole) {
      continue;
    }
    const current = scopedRoles.get(grant.organizationId);
    const nextRole =
      current && operatorRolePriority(current) >= operatorRolePriority(operatorRole)
        ? current
        : operatorRole;
    scopedRoles.set(grant.organizationId, nextRole);
  }

  if (scopedRoles.size === 0) {
    return [];
  }

  const organizations = await repositories.listOrganizations(
    actor.tenantId,
    Array.from(scopedRoles.keys()),
  );

  return organizations.map((organization) => ({
    organization,
    operatorRole: scopedRoles.get(organization.id) ?? "STAFF_VIEWER",
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
  obligations: ObligationRow[];
  complianceEvents: ComplianceEventRow[];
  violations: ViolationRow[];
  persistedStore: Record<string, unknown>;
  nowIso: string;
}): { store: ControlPlaneStore; residentDirectory: ResidentDirectoryEntry[] } {
  const base = createEmptyStore();
  const store = {
    ...base,
    ...(isRecord(input.persistedStore) ? input.persistedStore : {}),
  };
  const persistedHouses = recordArray(store.houses);
  const liveHouses = input.houses.map((house) =>
    buildHouseStoreRecord(
      input.organization.id,
      house,
      persistedHouses.find((entry) => entry.id === house.id),
    ),
  );
  const liveHouseIds = new Set(
    liveHouses
      .map((house) => house.id)
      .filter((houseId): houseId is string => typeof houseId === "string" && houseId.length > 0),
  );
  const persistedOnlyHouses = persistedHouses
    .filter((entry) => {
      const id = stringOr(entry.id, "");
      if (!id || liveHouseIds.has(id)) {
        return false;
      }
      const organizationId = stringOrNull(entry.organizationId);
      return organizationId === null || organizationId === input.organization.id;
    })
    .map((entry) => buildPersistedOnlyHouseStoreRecord(input.organization.id, entry, input.nowIso))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const mergedHouses = [...liveHouses, ...persistedOnlyHouses];
  const activeProfiles = input.participantProfiles.filter(
    (profile) =>
      profile.organization_id === input.organization.id &&
      profile.participant_type === "resident_user",
  );
  const residentHouseMemberships = activeProfiles.map((profile) =>
    buildResidentMembership(profile),
  );
  const residentDirectory = activeProfiles.map((profile) => buildResidentDirectoryEntry(profile));
  const residentProfileByUserId = new Map(
    activeProfiles.map((profile) => [profile.user_id, profile]),
  );
  const selectedHouseIds = new Set(
    mergedHouses
      .map((house) => house.id)
      .filter((houseId): houseId is string => typeof houseId === "string"),
  );

  const liveObligations = input.obligations.filter((obligation) => {
    if (!residentProfileByUserId.has(obligation.user_id)) {
      return false;
    }
    return relevantToOrganization({
      organizationId: input.organization.id,
      selectedHouseIds,
      residentProfileByUserId,
      organizationIdValue: obligation.organization_id,
      houseIdValue: obligation.house_id,
      userIdValue: obligation.user_id,
    });
  });
  const obligationById = new Map(liveObligations.map((obligation) => [obligation.id, obligation]));

  const recurringObligations: SoberHouseRecurringObligationRecord[] = liveObligations
    .map((obligation) => {
      const kind = obligationKind(obligation);
      if (!kind) {
        return null;
      }
      const schedule = normalizeObligationSchedule(obligation, input.nowIso);
      return {
        id: obligation.id,
        organizationId: obligation.organization_id,
        scopeType: liveScopeType(obligation),
        houseId: obligation.house_id,
        houseGroupId: null,
        residentId: obligation.user_id,
        linkedUserId: obligation.user_id,
        obligationType: kind,
        title: obligation.title,
        detail: obligation.description ?? "",
        locationLabel: "",
        frequency: schedule.frequency,
        weekday: schedule.weekday,
        weekdayList: schedule.weekdayList,
        monthlyOrdinal: schedule.monthlyOrdinal,
        scheduledDate: schedule.scheduledDate,
        timeLocalHhmm: schedule.timeLocalHhmm,
        durationMinutes: schedule.durationMinutes,
        required: obligation.status === "ACTIVE",
        reminderLeadMinutes: schedule.reminderLeadMinutes,
        inAppReminderEnabled: false,
        addToCalendar: false,
        accountabilityMethod: accountabilityMethodForObligation(obligation),
        status: liveEntityStatusForObligation(obligation),
        createdAt: obligation.created_at,
        updatedAt: obligation.updated_at,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const baseHouseMeetings: SoberHouseHouseMeetingRecord[] = liveObligations
    .map((obligation) => {
      if (obligationKind(obligation) !== "HOUSE_MEETING") {
        return null;
      }
      const schedule = normalizeObligationSchedule(obligation, input.nowIso);
      if (!schedule.startAtIso) {
        return null;
      }
      const endsAt = new Date(
        new Date(schedule.startAtIso).getTime() + schedule.durationMinutes * 60_000,
      ).toISOString();
      return {
        id: scheduledItemId("HOUSE_MEETING", obligation.id),
        organizationId: obligation.organization_id,
        houseId: obligation.house_id,
        recurringObligationId: obligation.id,
        title: obligation.title,
        description: obligation.description ?? "",
        meetingKind: "HOUSE_MEETING" as const,
        locationLabel: "",
        startsAt: schedule.startAtIso,
        endsAt,
        required: obligation.status === "ACTIVE",
        reminderLeadMinutes: schedule.reminderLeadMinutes,
        inAppReminderEnabled: false,
        addToCalendar: false,
        acknowledgmentRequired: false,
        status: liveEntityStatusForObligation(obligation),
        createdAt: obligation.created_at,
        updatedAt: obligation.updated_at,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const baseOneOnOneSessions: SoberHouseOneOnOneSessionRecord[] = liveObligations
    .map((obligation) => {
      if (obligationKind(obligation) !== "ONE_ON_ONE") {
        return null;
      }
      const schedule = normalizeObligationSchedule(obligation, input.nowIso);
      if (!schedule.startAtIso) {
        return null;
      }
      const endsAt = new Date(
        new Date(schedule.startAtIso).getTime() + schedule.durationMinutes * 60_000,
      ).toISOString();
      return {
        id: scheduledItemId("ONE_ON_ONE", obligation.id),
        organizationId: obligation.organization_id,
        houseId: obligation.house_id,
        residentId: obligation.user_id,
        linkedUserId: obligation.user_id,
        staffAssignmentId: null,
        recurringObligationId: obligation.id,
        title: obligation.title,
        notes: obligation.description ?? "",
        scheduledAt: schedule.startAtIso,
        endsAt,
        required: obligation.status === "ACTIVE",
        reminderLeadMinutes: schedule.reminderLeadMinutes,
        inAppReminderEnabled: false,
        addToCalendar: false,
        managerConfirmationRequired:
          proofRequirementForObligation(obligation)[0] === "MANAGER_CONFIRMATION",
        completionStatus: "SCHEDULED" as const,
        completedAt: null,
        completedByStaffAssignmentId: null,
        excusedAt: null,
        excusedReason: null,
        status: liveEntityStatusForObligation(obligation),
        createdAt: obligation.created_at,
        updatedAt: obligation.updated_at,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const houseChores: SoberHouseHouseChoreRecord[] = liveObligations
    .map((obligation) => {
      if (obligationKind(obligation) !== "CHORE") {
        return null;
      }
      const schedule = normalizeObligationSchedule(obligation, input.nowIso);
      return {
        id: scheduledItemId("CHORE", obligation.id),
        organizationId: obligation.organization_id,
        houseId: obligation.house_id,
        residentId: obligation.user_id,
        linkedUserId: obligation.user_id,
        recurringObligationId: obligation.id,
        title: obligation.title,
        summary: obligation.description ?? "",
        frequency:
          schedule.frequency === "DAILY" ||
          schedule.frequency === "WEEKLY" ||
          schedule.frequency === "BIWEEKLY" ||
          schedule.frequency === "MONTHLY"
            ? schedule.frequency
            : "WEEKLY",
        dueTimeLocalHhmm: schedule.timeLocalHhmm,
        weekday: schedule.weekday,
        scheduledDate: schedule.scheduledDate,
        required: obligation.status === "ACTIVE",
        proofRequirement: proofRequirementForObligation(obligation),
        reminderLeadMinutes: schedule.reminderLeadMinutes,
        inAppReminderEnabled: false,
        addToCalendar: false,
        accountabilityRequired: proofRequirementForObligation(obligation)[0] !== "NONE",
        status: liveEntityStatusForObligation(obligation),
        createdAt: obligation.created_at,
        updatedAt: obligation.updated_at,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const relevantComplianceEvents = input.complianceEvents.filter((event) =>
    relevantToOrganization({
      organizationId: input.organization.id,
      selectedHouseIds,
      residentProfileByUserId,
      organizationIdValue: event.organization_id,
      houseIdValue: event.house_id,
      userIdValue: event.user_id,
    }),
  );

  const choreCompletionRecords: Array<Record<string, unknown>> = [];
  const houseMeetingAttendanceRecords: Array<Record<string, unknown>> = [];
  const scheduledItemCompletionRecords: SoberHouseScheduledItemCompletionRecord[] = [];
  const proofReviewRecords: SoberHouseProofReviewRecord[] = [];
  const latestOneOnOneEventByObligationId = new Map<string, ComplianceEventRow>();

  for (const event of relevantComplianceEvents) {
    const linkedObligation =
      (event.obligation_id ? (obligationById.get(event.obligation_id) ?? null) : null) ?? null;
    const kind = linkedObligation?.id
      ? obligationKind(linkedObligation)
      : event.event_type === "CHORE_COMPLETED" || event.event_type === "CHORE_MISSED"
        ? "CHORE"
        : event.event_type === "MEETING_ATTENDED" || event.event_type === "MEETING_MISSED"
          ? "HOUSE_MEETING"
          : event.event_type === "TREATMENT_SESSION_ATTENDED" ||
              event.event_type === "TREATMENT_SESSION_MISSED"
            ? "ONE_ON_ONE"
            : null;
    if (!kind) {
      continue;
    }

    const proofRequirement = linkedObligation
      ? proofRequirementForObligation(linkedObligation)
      : proofRequirementForCompliance(event);
    const proofProvided = proofProvidedForComplianceEvent(event);
    const completionStatus = eventCompletionStatus(event);
    const completionRecord: SoberHouseScheduledItemCompletionRecord = {
      id: event.id,
      residentId: event.user_id,
      linkedUserId: event.user_id,
      organizationId:
        event.organization_id ??
        linkedObligation?.organization_id ??
        residentProfileByUserId.get(event.user_id)?.organization_id ??
        null,
      houseId:
        event.house_id ??
        linkedObligation?.house_id ??
        residentProfileByUserId.get(event.user_id)?.house_id ??
        null,
      scheduledItemType: scheduledItemTypeForKind(kind),
      scheduledItemId: linkedObligation ? scheduledItemId(kind, linkedObligation.id) : event.id,
      recurringObligationId: linkedObligation?.id ?? null,
      scheduledAt: linkedObligation?.due_at ?? event.occurred_at,
      status: completionStatus,
      completedAt: completionStatus === "COMPLETED" ? event.occurred_at : null,
      excusedAt: null,
      excusedReason: null,
      proofRequired: proofRequirement[0] !== "NONE",
      proofRequirement,
      proofProvided,
      proofReference: typeof event.proof_uri === "string" ? event.proof_uri : null,
      submittedAt: proofProvided ? event.occurred_at : null,
      managerConfirmationRequired: proofRequirement[0] === "MANAGER_CONFIRMATION",
      managerConfirmationStatus:
        proofRequirement[0] === "MANAGER_CONFIRMATION"
          ? event.verification_status === "VERIFIED"
            ? "CONFIRMED"
            : "PENDING"
          : "NOT_REQUIRED",
      managerConfirmationRequestedAt: null,
      managerConfirmationRequestedVia: null,
      managerConfirmedAt: event.verification_status === "VERIFIED" ? event.verified_at : null,
      notes: "",
      createdAt: event.created_at,
      updatedAt: event.created_at,
    };
    scheduledItemCompletionRecords.push(completionRecord);

    if (kind === "CHORE") {
      choreCompletionRecords.push({
        id: event.id,
        residentId: event.user_id,
        linkedUserId: event.user_id,
        organizationId: completionRecord.organizationId,
        houseId: completionRecord.houseId,
        houseChoreId: linkedObligation ? scheduledItemId("CHORE", linkedObligation.id) : null,
        completedAt: completionStatus === "COMPLETED" ? event.occurred_at : event.occurred_at,
        proofRequirement,
        proofProvided,
        proofReference: completionRecord.proofReference,
        managerConfirmationRequired: completionRecord.managerConfirmationRequired,
        managerConfirmationStatus: completionRecord.managerConfirmationStatus,
        managerConfirmationRequestedAt: null,
        managerConfirmationRequestedVia: null,
        managerConfirmedAt: completionRecord.managerConfirmedAt,
        notes: "",
        createdAt: event.created_at,
        updatedAt: event.created_at,
      });
    }

    if (kind === "HOUSE_MEETING") {
      houseMeetingAttendanceRecords.push({
        id: event.id,
        residentId: event.user_id,
        linkedUserId: event.user_id,
        organizationId: completionRecord.organizationId,
        houseId: completionRecord.houseId,
        houseMeetingId: linkedObligation
          ? scheduledItemId("HOUSE_MEETING", linkedObligation.id)
          : null,
        recurringObligationId: linkedObligation?.id ?? null,
        scheduledStartAt: linkedObligation?.due_at ?? event.occurred_at,
        status: completionStatus,
        attendedAt: completionStatus === "COMPLETED" ? event.occurred_at : null,
        excusedAt: null,
        excusedReason: null,
        proofRequired: completionRecord.proofRequired,
        proofProvided,
        proofReference: completionRecord.proofReference,
        notes: "",
        createdAt: event.created_at,
        updatedAt: event.created_at,
      });
    }

    if (kind === "ONE_ON_ONE" && linkedObligation?.id) {
      const existing = latestOneOnOneEventByObligationId.get(linkedObligation.id);
      if (
        !existing ||
        new Date(existing.occurred_at).getTime() < new Date(event.occurred_at).getTime()
      ) {
        latestOneOnOneEventByObligationId.set(linkedObligation.id, event);
      }
    }

    const proofReviewRequired = completionRecord.proofRequired || proofProvided;
    if (!proofReviewRequired) {
      continue;
    }

    const reviewCategory =
      kind === "HOUSE_MEETING"
        ? "HOUSE_MEETINGS"
        : kind === "ONE_ON_ONE"
          ? "ONE_ON_ONES"
          : "CHORES";
    const sourceRecordType =
      kind === "HOUSE_MEETING"
        ? "HOUSE_MEETING_ATTENDANCE"
        : kind === "CHORE"
          ? "CHORE_COMPLETION"
          : "SCHEDULED_ITEM_COMPLETION";
    proofReviewRecords.push({
      id: `proof-review:${event.id}`,
      residentId: event.user_id,
      linkedUserId: event.user_id,
      houseId: completionRecord.houseId,
      organizationId: completionRecord.organizationId,
      category: reviewCategory,
      sourceRecordType,
      sourceRecordId: event.id,
      linkedEnforcementRecordId: null,
      proofRequired: completionRecord.proofRequired,
      proofProvided,
      proofReference: completionRecord.proofReference,
      evidenceItemIds: [],
      submittedAt: completionRecord.submittedAt,
      status: proofReviewStatusForEvent(event),
      reviewedAt: event.verified_at,
      reviewedBy: event.verified_by_role
        ? {
            id: event.verified_by_role,
            name: event.verified_by_role,
          }
        : null,
      history: [
        {
          id: `proof-review-history:${event.id}:created`,
          createdAt: event.created_at,
          actor: {
            id: event.created_by_role ?? "SYSTEM",
            name: event.created_by_role ?? "SYSTEM",
          },
          action: "CREATED",
          note: "",
          previousStatus: null,
          nextStatus: proofReviewStatusForEvent(event),
        },
      ],
      createdAt: event.created_at,
      updatedAt: event.created_at,
    });
  }

  const oneOnOneSessions: SoberHouseOneOnOneSessionRecord[] = baseOneOnOneSessions.map(
    (session) => {
      if (!session.recurringObligationId) {
        return session;
      }
      const event = latestOneOnOneEventByObligationId.get(session.recurringObligationId);
      if (!event) {
        return session;
      }
      const completionStatus = eventCompletionStatus(event);
      return {
        ...session,
        completionStatus,
        completedAt: completionStatus === "COMPLETED" ? event.occurred_at : null,
        updatedAt: event.created_at,
      };
    },
  );

  const liveViolations = input.violations
    .filter((violation) =>
      relevantToOrganization({
        organizationId: input.organization.id,
        selectedHouseIds,
        residentProfileByUserId,
        organizationIdValue: violation.organization_id,
        houseIdValue: violation.house_id,
        userIdValue: violation.user_id,
      }),
    )
    .map(buildViolationStoreRecord);
  const persistedViolations = recordArray(store.violations).filter(
    (entry) => entry.organizationId === input.organization.id,
  );
  const sponsorCallRecords = buildSponsorCallRecords(store, relevantComplianceEvents);
  const alertAcknowledgementRecords = normalizeAlertAcknowledgementRecords(
    store.alertAcknowledgementRecords,
  );
  const soberHouseStoreSlice: SoberHouseLiveStoreSlice = {
    residentHouseMemberships,
    recurringObligations,
    houseMeetings: baseHouseMeetings,
    oneOnOneSessions,
    houseChores,
    alertAcknowledgementRecords,
    scheduledItemCompletionRecords,
    proofReviewRecords,
  };

  return {
    store: {
      ...base,
      ...store,
      version: STORE_VERSION,
      organization: buildOrganizationStoreRecord(input.organization, store, input.nowIso),
      houses: mergedHouses,
      ...soberHouseStoreSlice,
      choreCompletionRecords,
      houseMeetingAttendanceRecords,
      sponsorCallRecords: mergeRecordsById(
        sponsorCallRecords,
        recordArray(store.sponsorCallRecords),
      ),
      violations: mergeRecordsById(liveViolations, persistedViolations),
      houseGroups: recordArray(store.houseGroups),
      staffAssignments: recordArray(store.staffAssignments),
      houseRuleSets: recordArray(store.houseRuleSets),
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

  const [
    houses,
    participantProfiles,
    obligations,
    complianceEvents,
    violations,
    residentObligations,
  ] = await Promise.all([
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
    input.repositories.listObligations(input.actor.tenantId, {
      organizationId: selectedOrganization.organization.id,
    }),
    input.repositories.listComplianceEvents(input.actor.tenantId, {
      organizationId: selectedOrganization.organization.id,
    }),
    input.repositories.listViolations(input.actor.tenantId, {
      organizationId: selectedOrganization.organization.id,
    }),
    input.repositories.listResidentHouseObligations(input.actor.tenantId, {
      organizationId: selectedOrganization.organization.id,
    }),
  ]);

  const activeResidentProfileByUserId = new Map(
    participantProfiles
      .filter(
        (profile) =>
          profile.organization_id === selectedOrganization.organization.id &&
          profile.participant_type === "resident_user",
      )
      .map((profile) => [profile.user_id, profile] as const),
  );
  const liveObligationTitleById = new Map(
    obligations.map((obligation) => [obligation.id, obligation.title] as const),
  );
  const residentLiveObligations = residentObligations
    .map((record) =>
      buildResidentLiveObligationSnapshotRecord(
        record,
        activeResidentProfileByUserId,
        liveObligationTitleById,
      ),
    )
    .filter((record): record is ResidentLiveObligationSnapshotRecord => record !== null)
    .sort((left, right) => {
      const dueCompare = compareTimestampValues(
        left.dueAt ?? left.scheduledAt,
        right.dueAt ?? right.scheduledAt,
      );
      if (dueCompare !== 0) {
        return dueCompare;
      }
      return compareTimestampValues(right.createdAt, left.createdAt);
    });

  const hydrated = buildStoreFromLiveData({
    organization: selectedOrganization.organization,
    houses,
    participantProfiles,
    obligations,
    complianceEvents,
    violations,
    persistedStore,
    nowIso: input.nowIso,
  });
  const selectedRole = defaultOperatorRole(selectedOrganization.operatorRole);
  const roleDefaults = roleDefaultsFromHouses(houses);
  const visibleHouseIds = visibleHouseIdsForRole(
    selectedRole,
    houses,
    roleDefaults,
    hydrated.store,
  );

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
      roleDefaults,
      residentLiveObligations,
      complianceSummary: buildComplianceSummarySnapshot({
        obligations: residentLiveObligations,
        houses,
        visibleHouseIds,
        nowIso: input.nowIso,
      }),
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
