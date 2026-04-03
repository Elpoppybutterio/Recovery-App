import {
  cloneSoberHouseStore,
  createEntityId,
  createDefaultSoberHouseSettingsStore,
} from "../../../mobile/lib/soberHouse/defaults";
import {
  acknowledgeEnforcementRecord,
  addEnforcementRecordNote,
  createEnforcementRecord,
  resolveEnforcementRecord,
  upsertChoreCompletionRecord,
  upsertCorrectiveAction,
  upsertHouse,
  upsertHouseChore,
  upsertHouseGroup,
  upsertHouseMeeting,
  upsertHouseMeetingAttendanceRecord,
  upsertHouseRuleSet,
  upsertOneOnOneSession,
  upsertOperatorReportExportRecord,
  upsertOrganization,
  upsertResidentHouseMembership,
  upsertResidentHousingProfile,
  upsertResidentRequirementProfile,
  upsertScheduledSummaryRecord,
  upsertSponsorCallRecord,
  upsertStaffAssignment,
  upsertUserAccessProfile,
  upsertViolation,
  upsertWorkVerificationRecord,
} from "../../../mobile/lib/soberHouse/mutations";
import {
  buildResidentRuleEnforcementLinks,
  buildSoberHouseEnforcementSummary,
  filterEnforcementQueue,
  type EnforcementQueueFilters,
} from "../../../mobile/lib/soberHouse/enforcement";
import { buildSoberHouseOperatorReportingSummary } from "../../../mobile/lib/soberHouse/operatorReporting";
import {
  buildSoberHouseProofReviewSummary,
  filterProofReviewQueue,
  type ProofReviewQueueFilters,
} from "../../../mobile/lib/soberHouse/proofReview";
import {
  buildDefaultOperatorReportFilters,
  buildScheduledSummaryDraft,
  buildSoberHouseOperatorReportDocument,
} from "../../../mobile/lib/soberHouse/reportingExports";
import {
  getEffectiveRuleSetForScope,
  getHouseById,
  getHouseGroupById,
} from "../../../mobile/lib/soberHouse/selectors";
import type { SoberHouseLiveStoreSlice } from "../../../../packages/shared-types/src/soberHouse";
import type {
  OperatorReportExportType,
  ProofRequirement,
  ResidentHousingProfile,
  ResidentRequirementProfile,
  SoberHouseSettingsStore,
  StaffAssignment,
} from "../../../mobile/lib/soberHouse/types";

const ACTOR = { id: "dashboard-operator", name: "Dashboard Operator" };
const NOW_ISO = "2026-04-01T12:00:00.000Z";

export type OperatorWebRole = "ORG_ADMIN" | "HOUSE_MANAGER" | "STAFF_VIEWER";
export type OperatorNavSection =
  | "overview"
  | "actions"
  | "proof"
  | "houses"
  | "residents"
  | "staff"
  | "rules"
  | "reports"
  | "summaries";

export type ResidentDirectoryEntry = {
  residentId: string;
  linkedUserId: string;
  fullName: string;
  phaseLabel: string;
  assignedStaffAssignmentId: string | null;
  houseId: string;
};

export type RuleSourceLabel =
  | "Org default"
  | "House group"
  | "House override"
  | "Resident exception";

export type RuleVisibilityRow = {
  category: string;
  effectiveValue: string;
  source: RuleSourceLabel;
  organizationValue: string;
  houseValue: string;
  residentExceptionValue: string | null;
};

export type ResidentLookupFilters = {
  search: string;
  houseId: string | null;
  complianceBand: "all" | "compliant" | "warning" | "noncompliant" | "critical";
  overdueOnly: boolean;
  highRiskOnly: boolean;
  openViolationsOnly: boolean;
};

export type OperatorEnforcementQueueFilters = EnforcementQueueFilters;
export type OperatorProofQueueFilters = ProofReviewQueueFilters;

export type OperatorControlPlaneDataSource = {
  store: SoberHouseSettingsStore & SoberHouseLiveStoreSlice;
  residentDirectory: ResidentDirectoryEntry[];
  roleDefaults: Record<OperatorWebRole, { houseId: string | null }>;
};

function prettifyProofRequirement(proofRequirement: ProofRequirement[]): string {
  if (proofRequirement.length === 0 || proofRequirement.every((entry) => entry === "NONE")) {
    return "None";
  }
  return proofRequirement
    .map((entry) =>
      entry
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
    )
    .join(" + ");
}

function formatSource(source: "ORGANIZATION" | "HOUSE_GROUP" | "HOUSE"): RuleSourceLabel {
  if (source === "HOUSE_GROUP") {
    return "House group";
  }
  if (source === "HOUSE") {
    return "House override";
  }
  return "Org default";
}

function buildDemoStore(): OperatorControlPlaneDataSource {
  let store = createDefaultSoberHouseSettingsStore();
  store = upsertOrganization(
    store,
    ACTOR,
    {
      name: "Bright Path Recovery",
      primaryContactName: "Olivia Operator",
      primaryPhone: "(555) 555-9090",
      primaryEmail: "owner@brightpath.org",
      notes: "Seeded sober-housing operator control plane.",
      status: "ACTIVE",
    },
    "2026-03-01T08:00:00.000Z",
  ).store;

  store = upsertHouseGroup(
    store,
    ACTOR,
    {
      name: "Phase One Men",
      houseIds: [],
      notes: "Template for early-program housing.",
      status: "ACTIVE",
    },
    "2026-03-01T08:05:00.000Z",
  ).store;
  store = upsertHouseGroup(
    store,
    ACTOR,
    {
      name: "Employment Ready",
      houseIds: [],
      notes: "Template for employed / transitional residents.",
      status: "ACTIVE",
    },
    "2026-03-01T08:06:00.000Z",
  ).store;
  const phaseOneGroupId = store.houseGroups[0]!.id;
  const employmentGroupId = store.houseGroups[1]!.id;

  store = upsertHouse(
    store,
    ACTOR,
    {
      name: "Maple House",
      address: "123 Main St",
      phone: "(555) 555-1000",
      geofenceCenterLat: 45.7833,
      geofenceCenterLng: -108.5007,
      geofenceRadiusFeetDefault: 200,
      houseTypes: ["MEN"],
      bedCount: 12,
      notes: "Phase one men.",
      houseGroupId: phaseOneGroupId,
      status: "ACTIVE",
    },
    "2026-03-01T08:10:00.000Z",
  ).store;
  store = upsertHouse(
    store,
    ACTOR,
    {
      name: "Pine House",
      address: "456 Elm St",
      phone: "(555) 555-2200",
      geofenceCenterLat: 45.782,
      geofenceCenterLng: -108.501,
      geofenceRadiusFeetDefault: 220,
      houseTypes: ["MEN", "REENTRY"],
      bedCount: 10,
      notes: "Higher-touch curfew oversight.",
      houseGroupId: phaseOneGroupId,
      status: "ACTIVE",
    },
    "2026-03-01T08:11:00.000Z",
  ).store;
  store = upsertHouse(
    store,
    ACTOR,
    {
      name: "Cedar House",
      address: "789 River Rd",
      phone: "(555) 555-3300",
      geofenceCenterLat: 45.781,
      geofenceCenterLng: -108.498,
      geofenceRadiusFeetDefault: 180,
      houseTypes: ["MEN", "YOUNG_ADULT"],
      bedCount: 8,
      notes: "Employment-focused step-down house.",
      houseGroupId: employmentGroupId,
      status: "ACTIVE",
    },
    "2026-03-01T08:12:00.000Z",
  ).store;

  const mapleHouseId = store.houses.find((house) => house.name === "Maple House")!.id;
  const pineHouseId = store.houses.find((house) => house.name === "Pine House")!.id;
  const cedarHouseId = store.houses.find((house) => house.name === "Cedar House")!.id;

  store = upsertHouseGroup(
    store,
    ACTOR,
    {
      ...store.houseGroups.find((group) => group.id === phaseOneGroupId)!,
      houseIds: [mapleHouseId, pineHouseId],
    },
    "2026-03-01T08:12:30.000Z",
  ).store;
  store = upsertHouseGroup(
    store,
    ACTOR,
    {
      ...store.houseGroups.find((group) => group.id === employmentGroupId)!,
      houseIds: [cedarHouseId],
    },
    "2026-03-01T08:12:45.000Z",
  ).store;

  store = upsertHouseRuleSet(
    store,
    ACTOR,
    {
      name: "Organization defaults",
      status: "ACTIVE",
      curfew: {
        enabled: true,
        weekdayCurfew: "22:00",
        fridayCurfew: "23:00",
        saturdayCurfew: "23:00",
        sundayCurfew: "22:00",
        gracePeriodMinutes: 15,
        preViolationAlertEnabled: true,
        preViolationLeadTimeMinutes: 20,
        alertBasis: "CLOCK_ONLY",
      },
      chores: {
        enabled: true,
        frequency: "DAILY",
        dueTime: "18:00",
        proofRequirement: ["CHECKLIST"],
        gracePeriodMinutes: 10,
        managerInstantNotificationEnabled: false,
      },
      employment: {
        employmentRequired: true,
        workplaceVerificationEnabled: true,
        workplaceGeofenceRadiusDefault: 200,
        managerVerificationRequired: false,
      },
      jobSearch: {
        applicationsRequiredPerWeek: 4,
        proofRequired: true,
        managerApprovalRequired: false,
      },
      meetings: {
        meetingsRequired: true,
        meetingsPerWeek: 4,
        allowedMeetingTypes: ["AA", "NA"],
        proofMethod: "SIGNATURE",
      },
      sponsorContact: {
        enabled: true,
        contactsRequiredPerWeek: 2,
        proofType: "CALL_LOG",
      },
      oneOnOne: {
        enabled: true,
        defaultFrequency: "WEEKLY",
        defaultWeekday: "TUE",
        defaultTimeLocalHhmm: "15:00",
        defaultLeadTimeMinutes: 30,
        addToCalendarByDefault: true,
        reminderEnabledByDefault: true,
      },
      operations: {
        choresEnabled: true,
        houseMeetingsEnabled: true,
        houseMeetingsRequired: true,
        oneOnOneSessionsEnabled: true,
        oneOnOneSessionsRequired: true,
        houseAlertsEnabled: true,
        announcementsEnabled: true,
        complianceSnapshotEnabled: true,
      },
      support: {
        defaultReminderLeadMinutes: 30,
        defaultAddToCalendar: true,
        defaultInAppReminders: true,
        requireHouseMeetingAcknowledgment: true,
        requireAnnouncementAcknowledgment: true,
        requireOneOnOneManagerConfirmation: true,
      },
    },
    "2026-03-01T08:13:00.000Z",
  ).store;

  const orgRules = getEffectiveRuleSetForScope(store, "ORGANIZATION", null, NOW_ISO).ruleSet;

  store = upsertHouseRuleSet(
    store,
    ACTOR,
    {
      houseGroupId: phaseOneGroupId,
      name: "Phase One template",
      status: "ACTIVE",
      chores: {
        enabled: true,
        frequency: "DAILY",
        dueTime: "18:00",
        proofRequirement: ["PHOTO"],
        gracePeriodMinutes: 10,
        managerInstantNotificationEnabled: true,
      },
      sponsorContact: {
        enabled: true,
        contactsRequiredPerWeek: 3,
        proofType: "CALL_LOG",
      },
      employment: orgRules.employment,
      jobSearch: orgRules.jobSearch,
      meetings: orgRules.meetings,
      curfew: orgRules.curfew,
      oneOnOne: orgRules.oneOnOne,
      operations: orgRules.operations,
      support: orgRules.support,
    },
    "2026-03-01T08:14:00.000Z",
  ).store;
  store = upsertHouseRuleSet(
    store,
    ACTOR,
    {
      houseGroupId: employmentGroupId,
      name: "Employment Ready template",
      status: "ACTIVE",
      employment: {
        employmentRequired: true,
        workplaceVerificationEnabled: true,
        workplaceGeofenceRadiusDefault: 250,
        managerVerificationRequired: true,
      },
      jobSearch: {
        applicationsRequiredPerWeek: 2,
        proofRequired: false,
        managerApprovalRequired: false,
      },
      sponsorContact: orgRules.sponsorContact,
      chores: orgRules.chores,
      meetings: {
        meetingsRequired: true,
        meetingsPerWeek: 3,
        allowedMeetingTypes: ["AA", "NA"],
        proofMethod: "SIGNATURE",
      },
      curfew: orgRules.curfew,
      oneOnOne: orgRules.oneOnOne,
      operations: orgRules.operations,
      support: orgRules.support,
    },
    "2026-03-01T08:15:00.000Z",
  ).store;

  store = upsertHouseRuleSet(
    store,
    ACTOR,
    {
      houseId: pineHouseId,
      name: "Pine overrides",
      status: "ACTIVE",
      meetings: {
        meetingsRequired: true,
        meetingsPerWeek: 5,
        allowedMeetingTypes: ["AA", "NA"],
        proofMethod: "SIGNATURE",
      },
      curfew: {
        enabled: true,
        weekdayCurfew: "21:30",
        fridayCurfew: "22:30",
        saturdayCurfew: "22:30",
        sundayCurfew: "21:30",
        gracePeriodMinutes: 10,
        preViolationAlertEnabled: true,
        preViolationLeadTimeMinutes: 20,
        alertBasis: "CLOCK_ONLY",
      },
    },
    "2026-03-01T08:16:00.000Z",
  ).store;

  store = upsertUserAccessProfile(
    store,
    ACTOR,
    {
      linkedUserId: "organization-user",
      role: "OWNER_OPERATOR",
      organizationId: store.organization?.id ?? null,
      houseId: mapleHouseId,
      houseGroupId: phaseOneGroupId,
      status: "ACTIVE",
    },
    "2026-03-01T08:16:30.000Z",
  ).store;

  store = upsertStaffAssignment(
    store,
    ACTOR,
    {
      firstName: "Olivia",
      lastName: "Operator",
      phone: "(555) 555-9090",
      email: "owner@brightpath.org",
      role: "OWNER",
      assignedHouseIds: [mapleHouseId, pineHouseId, cedarHouseId],
      receiveRealTimeViolationAlerts: true,
      receiveNearMissAlerts: true,
      receiveMonthlyReports: true,
      canApproveExceptions: true,
      canIssueCorrectiveActions: true,
      canViewResidentEvidence: true,
      status: "ACTIVE",
    },
    "2026-03-01T08:17:00.000Z",
  ).store;
  store = upsertStaffAssignment(
    store,
    ACTOR,
    {
      firstName: "Marco",
      lastName: "Lewis",
      phone: "(555) 555-1200",
      email: "marco@brightpath.org",
      role: "HOUSE_MANAGER",
      assignedHouseIds: [mapleHouseId, pineHouseId],
      receiveRealTimeViolationAlerts: true,
      receiveNearMissAlerts: true,
      receiveMonthlyReports: true,
      canApproveExceptions: true,
      canIssueCorrectiveActions: true,
      canViewResidentEvidence: true,
      status: "ACTIVE",
    },
    "2026-03-01T08:17:30.000Z",
  ).store;
  store = upsertStaffAssignment(
    store,
    ACTOR,
    {
      firstName: "Nina",
      lastName: "Soto",
      phone: "(555) 555-1300",
      email: "nina@brightpath.org",
      role: "HOUSE_MANAGER",
      assignedHouseIds: [cedarHouseId],
      receiveRealTimeViolationAlerts: true,
      receiveNearMissAlerts: false,
      receiveMonthlyReports: true,
      canApproveExceptions: false,
      canIssueCorrectiveActions: true,
      canViewResidentEvidence: true,
      status: "ACTIVE",
    },
    "2026-03-01T08:17:45.000Z",
  ).store;
  store = upsertStaffAssignment(
    store,
    ACTOR,
    {
      firstName: "Talia",
      lastName: "Reed",
      phone: "(555) 555-1400",
      email: "talia@brightpath.org",
      role: "VIEWER",
      assignedHouseIds: [cedarHouseId],
      receiveRealTimeViolationAlerts: false,
      receiveNearMissAlerts: false,
      receiveMonthlyReports: false,
      canApproveExceptions: false,
      canIssueCorrectiveActions: false,
      canViewResidentEvidence: true,
      status: "ACTIVE",
    },
    "2026-03-01T08:18:00.000Z",
  ).store;

  const marcoId = store.staffAssignments.find((assignment) => assignment.firstName === "Marco")!.id;
  const ninaId = store.staffAssignments.find((assignment) => assignment.firstName === "Nina")!.id;
  const taliaId = store.staffAssignments.find((assignment) => assignment.firstName === "Talia")!.id;

  const residentDirectory: ResidentDirectoryEntry[] = [
    {
      residentId: "resident-avery",
      linkedUserId: "avery-brooks",
      fullName: "Avery Brooks",
      phaseLabel: "Phase 2",
      assignedStaffAssignmentId: marcoId,
      houseId: mapleHouseId,
    },
    {
      residentId: "resident-mason",
      linkedUserId: "mason-lee",
      fullName: "Mason Lee",
      phaseLabel: "Phase 1",
      assignedStaffAssignmentId: marcoId,
      houseId: mapleHouseId,
    },
    {
      residentId: "resident-noah",
      linkedUserId: "noah-grant",
      fullName: "Noah Grant",
      phaseLabel: "Phase 1",
      assignedStaffAssignmentId: marcoId,
      houseId: pineHouseId,
    },
    {
      residentId: "resident-julian",
      linkedUserId: "julian-cole",
      fullName: "Julian Cole",
      phaseLabel: "Transition",
      assignedStaffAssignmentId: ninaId,
      houseId: cedarHouseId,
    },
    {
      residentId: "resident-ethan",
      linkedUserId: "ethan-price",
      fullName: "Ethan Price",
      phaseLabel: "Transition",
      assignedStaffAssignmentId: taliaId,
      houseId: cedarHouseId,
    },
  ];

  residentDirectory.forEach((resident, index) => {
    store = upsertResidentHouseMembership(
      store,
      ACTOR,
      {
        residentId: resident.residentId,
        linkedUserId: resident.linkedUserId,
        organizationId: store.organization?.id ?? null,
        houseId: resident.houseId,
        roomOrBed: `${index + 1}A`,
        moveInDate: `2026-03-${10 + index}`,
        moveOutDate: null,
        isPrimary: true,
        status: "ACTIVE",
        notes: resident.fullName,
      },
      `2026-03-${10 + index}T09:00:00.000Z`,
    ).store;
  });

  const housingProfile: ResidentHousingProfile = {
    id: createEntityId("resident-housing-profile"),
    residentId: "resident-avery",
    linkedUserId: "avery-brooks",
    organizationId: store.organization?.id ?? null,
    houseId: mapleHouseId,
    firstName: "Avery",
    lastName: "Brooks",
    moveInDate: "2026-03-10",
    roomOrBed: "1A",
    emergencyContactName: "Chris Brooks",
    emergencyContactPhone: "(555) 555-5000",
    programPhaseOnEntry: "Phase 2",
    status: "ACTIVE",
    notes: "Resident exception sample.",
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  };
  store = upsertResidentHousingProfile(store, ACTOR, housingProfile, NOW_ISO).store;
  const requirementProfile: ResidentRequirementProfile = {
    id: createEntityId("resident-requirement-profile"),
    residentId: "resident-avery",
    linkedUserId: "avery-brooks",
    organizationId: store.organization?.id ?? null,
    houseId: mapleHouseId,
    sourceHouseRuleSetId: null,
    inheritanceInitializedAt: NOW_ISO,
    workRequired: true,
    currentlyEmployed: false,
    employerName: "",
    employerAddress: "",
    employerPhone: "",
    workplaceGeofenceLat: null,
    workplaceGeofenceLng: null,
    workplaceGeofenceRadiusFeet: null,
    workplaceGeofenceResolvedAt: null,
    expectedWorkScheduleNotes: "",
    jobApplicationsRequiredPerWeek: 5,
    meetingsRequiredWeekly: true,
    meetingsRequiredCount: 6,
    sponsorPresent: true,
    sponsorName: "Sam Sponsor",
    sponsorPhone: "(555) 555-6600",
    sponsorContactFrequency: "Three per week",
    residentCurfewOverrideEnabled: true,
    residentCurfewWeekday: "21:00",
    residentCurfewFriday: "22:00",
    residentCurfewSaturday: "22:00",
    residentCurfewSunday: "21:00",
    standingExceptionNotes: "Resident is in an early curfew stabilization period.",
    assignedChoreNotes: "",
    proofTypeOverrideNotes: "",
    isHouseManager: false,
    isHouseOwner: false,
    wantsRealTimeViolationAlerts: true,
    wantsNearMissAlerts: true,
    wantsMonthlySummaryReports: true,
    oneOnOneRequired: true,
    oneOnOneAssignedStaffAssignmentId: marcoId,
    oneOnOneFrequency: "WEEKLY",
    oneOnOneWeekday: "WED",
    oneOnOneScheduledDate: null,
    oneOnOneTimeLocalHhmm: "14:30",
    oneOnOneLeadTimeMinutes: 30,
    oneOnOneAddToCalendar: true,
    oneOnOneReminderEnabled: true,
    oneOnOneCalendarEventId: null,
    oneOnOneScheduleFingerprint: null,
    oneOnOneNotificationIds: [],
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  };
  store = upsertResidentRequirementProfile(store, ACTOR, requirementProfile, NOW_ISO).store;

  const residentChoreMap: Record<string, string> = {};
  residentDirectory.forEach((resident, index) => {
    store = upsertHouseChore(
      store,
      ACTOR,
      {
        organizationId: store.organization?.id ?? null,
        houseId: resident.houseId,
        residentId: resident.residentId,
        linkedUserId: resident.linkedUserId,
        recurringObligationId: null,
        title: index % 2 === 0 ? "Kitchen reset" : "Bathroom reset",
        summary: "Complete assigned house chore.",
        frequency: "DAILY",
        dueTimeLocalHhmm: resident.houseId === pineHouseId ? "17:00" : "18:00",
        weekday: null,
        scheduledDate: null,
        required: true,
        proofRequirement:
          resident.houseId === mapleHouseId || resident.houseId === pineHouseId
            ? ["PHOTO"]
            : ["CHECKLIST"],
        reminderLeadMinutes: 30,
        inAppReminderEnabled: true,
        addToCalendar: false,
        accountabilityRequired: true,
        status: "ACTIVE",
      },
      `2026-03-20T0${index}:00:00.000Z`,
    ).store;
    residentChoreMap[resident.residentId] = store.houseChores[0]!.id;
  });

  const houseMeetingIds: Record<string, string> = {};
  [mapleHouseId, pineHouseId, cedarHouseId].forEach((houseId, index) => {
    store = upsertHouseMeeting(
      store,
      ACTOR,
      {
        organizationId: store.organization?.id ?? null,
        houseId,
        recurringObligationId: null,
        title: index === 2 ? "Employment check-in" : "Weekly house meeting",
        description: "Required house gathering for current residents.",
        meetingKind: "HOUSE_MEETING",
        locationLabel: "Common room",
        startsAt: `2026-04-0${index + 1}T19:00:00.000Z`,
        endsAt: `2026-04-0${index + 1}T20:00:00.000Z`,
        required: true,
        reminderLeadMinutes: 30,
        inAppReminderEnabled: true,
        addToCalendar: false,
        acknowledgmentRequired: true,
        status: "ACTIVE",
      },
      `2026-03-25T0${index}:00:00.000Z`,
    ).store;
    houseMeetingIds[houseId] = store.houseMeetings[0]!.id;
  });

  const today = "2026-04-01";
  store = upsertChoreCompletionRecord(
    store,
    ACTOR,
    {
      residentId: "resident-avery",
      linkedUserId: "avery-brooks",
      organizationId: store.organization?.id ?? null,
      houseId: mapleHouseId,
      houseChoreId: residentChoreMap["resident-avery"],
      completedAt: `${today}T17:20:00.000Z`,
      proofRequirement: ["PHOTO"],
      proofProvided: true,
      proofReference: "file:///proofs/avery-kitchen.jpg",
      notes: "On time.",
    },
    `${today}T17:21:00.000Z`,
  ).store;
  store = upsertChoreCompletionRecord(
    store,
    ACTOR,
    {
      residentId: "resident-julian",
      linkedUserId: "julian-cole",
      organizationId: store.organization?.id ?? null,
      houseId: cedarHouseId,
      houseChoreId: residentChoreMap["resident-julian"],
      completedAt: `${today}T17:45:00.000Z`,
      proofRequirement: ["CHECKLIST"],
      proofProvided: true,
      proofReference: null,
      notes: "Checklist complete.",
    },
    `${today}T17:46:00.000Z`,
  ).store;

  store = upsertOneOnOneSession(
    store,
    ACTOR,
    {
      organizationId: store.organization?.id ?? null,
      houseId: mapleHouseId,
      residentId: "resident-avery",
      linkedUserId: "avery-brooks",
      staffAssignmentId: marcoId,
      recurringObligationId: null,
      title: "Weekly one-on-one",
      notes: "Resident accountability check-in.",
      scheduledAt: `${today}T14:30:00.000Z`,
      endsAt: `${today}T15:00:00.000Z`,
      required: true,
      reminderLeadMinutes: 15,
      inAppReminderEnabled: true,
      addToCalendar: false,
      managerConfirmationRequired: true,
      completionStatus: "COMPLETED",
      completedAt: `${today}T14:58:00.000Z`,
      completedByStaffAssignmentId: marcoId,
      excusedAt: null,
      excusedReason: null,
      status: "ACTIVE",
    },
    `${today}T15:00:00.000Z`,
  ).store;
  store = upsertOneOnOneSession(
    store,
    ACTOR,
    {
      organizationId: store.organization?.id ?? null,
      houseId: pineHouseId,
      residentId: "resident-noah",
      linkedUserId: "noah-grant",
      staffAssignmentId: marcoId,
      recurringObligationId: null,
      title: "Weekly one-on-one",
      notes: "Not completed.",
      scheduledAt: `${today}T15:30:00.000Z`,
      endsAt: `${today}T16:00:00.000Z`,
      required: true,
      reminderLeadMinutes: 15,
      inAppReminderEnabled: true,
      addToCalendar: false,
      managerConfirmationRequired: true,
      completionStatus: "MISSED",
      completedAt: null,
      completedByStaffAssignmentId: null,
      excusedAt: null,
      excusedReason: null,
      status: "ACTIVE",
    },
    `${today}T16:30:00.000Z`,
  ).store;

  store = upsertSponsorCallRecord(
    store,
    ACTOR,
    {
      residentId: "resident-avery",
      linkedUserId: "avery-brooks",
      organizationId: store.organization?.id ?? null,
      houseId: mapleHouseId,
      scheduledFor: `${today}T13:00:00.000Z`,
      status: "COMPLETED",
      completedAt: `${today}T13:05:00.000Z`,
      proofRequired: true,
      proofProvided: true,
      proofReference: "call-log://avery-brooks/2026-04-01",
      proofType: "CALL_LOG",
      notes: "Logged sponsor call.",
    },
    `${today}T13:05:00.000Z`,
  ).store;
  store = upsertSponsorCallRecord(
    store,
    ACTOR,
    {
      residentId: "resident-noah",
      linkedUserId: "noah-grant",
      organizationId: store.organization?.id ?? null,
      houseId: pineHouseId,
      scheduledFor: `${today}T11:00:00.000Z`,
      status: "MISSED",
      completedAt: null,
      proofRequired: true,
      proofProvided: false,
      proofReference: null,
      proofType: "CALL_LOG",
      notes: "Sponsor call missed.",
    },
    `${today}T11:05:00.000Z`,
  ).store;

  store = upsertHouseMeetingAttendanceRecord(
    store,
    ACTOR,
    {
      residentId: "resident-avery",
      linkedUserId: "avery-brooks",
      organizationId: store.organization?.id ?? null,
      houseId: mapleHouseId,
      houseMeetingId: houseMeetingIds[mapleHouseId],
      recurringObligationId: null,
      scheduledStartAt: `${today}T19:00:00.000Z`,
      status: "COMPLETED",
      attendedAt: `${today}T19:03:00.000Z`,
      excusedAt: null,
      excusedReason: null,
      proofRequired: true,
      proofProvided: true,
      proofReference: "ack://avery/meeting",
      notes: "Attended.",
    },
    `${today}T19:05:00.000Z`,
  ).store;
  store = upsertHouseMeetingAttendanceRecord(
    store,
    ACTOR,
    {
      residentId: "resident-noah",
      linkedUserId: "noah-grant",
      organizationId: store.organization?.id ?? null,
      houseId: pineHouseId,
      houseMeetingId: houseMeetingIds[pineHouseId],
      recurringObligationId: null,
      scheduledStartAt: `${today}T19:00:00.000Z`,
      status: "MISSED",
      attendedAt: null,
      excusedAt: null,
      excusedReason: null,
      proofRequired: true,
      proofProvided: false,
      proofReference: null,
      notes: "Missed required house meeting.",
    },
    `${today}T20:15:00.000Z`,
  ).store;

  store = upsertWorkVerificationRecord(
    store,
    ACTOR,
    {
      residentId: "resident-julian",
      linkedUserId: "julian-cole",
      organizationId: store.organization?.id ?? null,
      houseId: cedarHouseId,
      verifiedAt: `${today}T16:00:00.000Z`,
      verificationMethod: "SELF_REPORTED",
      notes: "Shift completed.",
    },
    `${today}T16:01:00.000Z`,
  ).store;

  store = upsertViolation(
    store,
    ACTOR,
    {
      residentId: "resident-noah",
      linkedUserId: "noah-grant",
      houseId: pineHouseId,
      organizationId: store.organization?.id ?? null,
      ruleType: "curfew",
      sourceEvaluationReference: null,
      sourceEvaluationSnapshot: null,
      complianceWindowKey: "2026-W14",
      triggeredAt: `${today}T23:30:00.000Z`,
      effectiveAt: `${today}T23:30:00.000Z`,
      dueAt: null,
      gracePeriodMinutesUsed: 5,
      status: "OPEN",
      severity: "CRITICAL",
      reasonSummary: "Resident missed curfew and remained outside the geofence.",
      managerNotes: "",
      resolutionNotes: "",
      createdBy: "SYSTEM",
      reviewedBy: null,
      reviewedAt: null,
      resolvedBy: null,
      resolvedAt: null,
      correctiveActionIds: [],
      evidenceItemIds: [],
    },
    `${today}T23:31:00.000Z`,
  ).store;
  const noahViolationId = store.violations[0]!.id;
  store = upsertCorrectiveAction(
    store,
    ACTOR,
    {
      violationId: noahViolationId,
      residentId: "resident-noah",
      linkedUserId: "noah-grant",
      houseId: pineHouseId,
      organizationId: store.organization?.id ?? null,
      actionType: "MANAGER_CHECK_IN",
      assignedBy: ACTOR,
      assignedAt: `${today}T23:40:00.000Z`,
      dueAt: "2026-04-02T12:00:00.000Z",
      notes: "Manager follow-up required.",
      status: "OPEN",
      completedAt: null,
      completionNotes: "",
      id: undefined,
    },
    `${today}T23:40:00.000Z`,
  ).store;

  store = createEnforcementRecord(
    store,
    ACTOR,
    {
      organizationId: store.organization?.id ?? null,
      houseId: pineHouseId,
      residentId: "resident-noah",
      linkedUserId: "noah-grant",
      category: "VIOLATION",
      sourceRuleType: "curfew",
      sourceSignal: "Critical curfew violation detected.",
      level: "INCIDENT",
      status: "OPEN",
      reasonSummary: "Critical curfew violation requires immediate operator review.",
      recommendedAction: "Review the incident, assign the house manager, and document outreach.",
      assignedStaffAssignmentId: marcoId,
      linkedViolationId: noahViolationId,
      linkedCorrectiveActionId: store.correctiveActions[0]?.id ?? null,
      dueAt: "2026-04-02T08:00:00.000Z",
    },
    `${today}T23:45:00.000Z`,
  ).store;
  const noahEnforcementId = store.enforcementRecords[0]!.id;
  store = addEnforcementRecordNote(
    store,
    ACTOR,
    noahEnforcementId,
    "House manager notified and resident outreach requested before morning check-in.",
    `${today}T23:46:00.000Z`,
  ).store;

  store = createEnforcementRecord(
    store,
    ACTOR,
    {
      organizationId: store.organization?.id ?? null,
      houseId: mapleHouseId,
      residentId: "resident-mason",
      linkedUserId: "mason-lee",
      category: "CHORES",
      sourceRuleType: "chores",
      sourceSignal: "Required chore is overdue.",
      level: "REMINDER",
      status: "OPEN",
      reasonSummary: "Kitchen reset chore was not completed by the due time.",
      recommendedAction: "Acknowledge the miss and confirm same-day completion.",
      assignedStaffAssignmentId: marcoId,
      linkedViolationId: null,
      linkedCorrectiveActionId: null,
      dueAt: `${today}T21:00:00.000Z`,
    },
    `${today}T18:30:00.000Z`,
  ).store;
  const masonEnforcementId = store.enforcementRecords[0]!.id;
  store = acknowledgeEnforcementRecord(
    store,
    ACTOR,
    masonEnforcementId,
    `${today}T18:45:00.000Z`,
    "Resident checked in and is completing the chore before lights out.",
  ).store;

  store = createEnforcementRecord(
    store,
    ACTOR,
    {
      organizationId: store.organization?.id ?? null,
      houseId: cedarHouseId,
      residentId: "resident-julian",
      linkedUserId: "julian-cole",
      category: "WORK",
      sourceRuleType: "work",
      sourceSignal: "Work verification was missing.",
      level: "WARNING",
      status: "OPEN",
      reasonSummary: "Work verification was still missing at the weekly review.",
      recommendedAction: "Confirm shift completion and close the warning once work is verified.",
      assignedStaffAssignmentId: ninaId,
      linkedViolationId: null,
      linkedCorrectiveActionId: null,
      dueAt: "2026-04-02T12:00:00.000Z",
    },
    `${today}T10:00:00.000Z`,
  ).store;
  const julianEnforcementId = store.enforcementRecords[0]!.id;
  store = resolveEnforcementRecord(
    store,
    ACTOR,
    julianEnforcementId,
    `${today}T16:05:00.000Z`,
    "Shift was verified and the work warning was cleared.",
  ).store;

  const exportFilters = {
    ...buildDefaultOperatorReportFilters(store, NOW_ISO),
    houseId: null,
    residentId: null,
  };
  const orgDocument = buildSoberHouseOperatorReportDocument({
    store,
    nowIso: NOW_ISO,
    filters: exportFilters,
    reportType: "ORGANIZATION_ROLLUP_REPORT",
  });
  store = upsertOperatorReportExportRecord(
    store,
    ACTOR,
    {
      reportType: "ORGANIZATION_ROLLUP_REPORT",
      format: "CSV",
      scopeType: "ORGANIZATION",
      organizationId: store.organization?.id ?? null,
      houseId: null,
      residentId: null,
      periodStart: `${exportFilters.startDate}T00:00:00.000Z`,
      periodEnd: `${exportFilters.endDate}T23:59:59.999Z`,
      generatedAt: NOW_ISO,
      generatedBy: ACTOR,
      title: orgDocument.title,
      fileRef: "/exports/org-rollup-demo.csv",
      itemCount: orgDocument.itemCount,
      filters: exportFilters,
    },
    NOW_ISO,
  ).store;
  const dailySummary = buildScheduledSummaryDraft({
    store,
    nowIso: NOW_ISO,
    filters: { ...exportFilters, houseId: pineHouseId },
    summaryType: "DAILY_HOUSE",
  });
  store = upsertScheduledSummaryRecord(
    store,
    ACTOR,
    { ...dailySummary, generatedBy: ACTOR },
    NOW_ISO,
  ).store;
  const weeklyOrgSummary = buildScheduledSummaryDraft({
    store,
    nowIso: NOW_ISO,
    filters: exportFilters,
    summaryType: "WEEKLY_ORGANIZATION",
  });
  store = upsertScheduledSummaryRecord(
    store,
    ACTOR,
    { ...weeklyOrgSummary, generatedBy: ACTOR },
    NOW_ISO,
  ).store;

  return {
    store,
    residentDirectory,
    roleDefaults: {
      ORG_ADMIN: { houseId: null },
      HOUSE_MANAGER: { houseId: mapleHouseId },
      STAFF_VIEWER: { houseId: cedarHouseId },
    },
  };
}

const DEMO_STORE = buildDemoStore();

export function getOperatorWebDemoStore(): OperatorControlPlaneDataSource {
  return DEMO_STORE;
}

export function createOperatorWebSessionStore(): OperatorControlPlaneDataSource {
  return {
    store: cloneSoberHouseStore(DEMO_STORE.store),
    residentDirectory: DEMO_STORE.residentDirectory.map((entry) => ({ ...entry })),
    roleDefaults: {
      ORG_ADMIN: { ...DEMO_STORE.roleDefaults.ORG_ADMIN },
      HOUSE_MANAGER: { ...DEMO_STORE.roleDefaults.HOUSE_MANAGER },
      STAFF_VIEWER: { ...DEMO_STORE.roleDefaults.STAFF_VIEWER },
    },
  };
}

function visibleHouseIdsForRole(
  store: SoberHouseSettingsStore,
  role: OperatorWebRole,
  defaults: OperatorControlPlaneDataSource["roleDefaults"],
): Set<string> {
  if (role === "ORG_ADMIN") {
    return new Set(store.houses.map((house) => house.id));
  }
  const targetHouseId = defaults[role].houseId;
  if (!targetHouseId) {
    return new Set();
  }
  if (role === "HOUSE_MANAGER") {
    const assignment = store.staffAssignments.find(
      (entry) => entry.role === "HOUSE_MANAGER" && entry.assignedHouseIds.includes(targetHouseId),
    );
    return new Set(assignment?.assignedHouseIds ?? [targetHouseId]);
  }
  return new Set([targetHouseId]);
}

export function buildResidentRuleVisibility(
  store: SoberHouseSettingsStore,
  residentId: string,
  nowIso: string,
): RuleVisibilityRow[] {
  const membership = store.residentHouseMemberships.find(
    (entry) => entry.residentId === residentId && entry.status === "ACTIVE",
  );
  const houseId = membership?.houseId ?? null;
  const house = houseId ? getHouseById(store, houseId) : null;
  const orgEffective = getEffectiveRuleSetForScope(store, "ORGANIZATION", null, nowIso).ruleSet;
  const houseEffective = getEffectiveRuleSetForScope(store, "HOUSE", houseId, nowIso);
  const profile =
    store.residentRequirementProfile?.residentId === residentId
      ? store.residentRequirementProfile
      : null;

  const meetingsSource: RuleSourceLabel =
    profile?.meetingsRequiredWeekly === true || profile?.meetingsRequiredCount
      ? "Resident exception"
      : formatSource(houseEffective.sources.meetings);
  const workSource: RuleSourceLabel =
    profile?.workRequired !== undefined &&
    profile.workRequired !== houseEffective.ruleSet.employment.employmentRequired
      ? "Resident exception"
      : formatSource(houseEffective.sources.employment);
  const jobSearchSource: RuleSourceLabel =
    typeof profile?.jobApplicationsRequiredPerWeek === "number" &&
    profile.jobApplicationsRequiredPerWeek !==
      houseEffective.ruleSet.jobSearch.applicationsRequiredPerWeek
      ? "Resident exception"
      : formatSource(houseEffective.sources.jobSearch);
  const curfewSource: RuleSourceLabel = profile?.residentCurfewOverrideEnabled
    ? "Resident exception"
    : formatSource(houseEffective.sources.curfew);
  const oneOnOneSource: RuleSourceLabel =
    profile?.oneOnOneRequired !== undefined &&
    profile.oneOnOneRequired !==
      (houseEffective.ruleSet.operations.oneOnOneSessionsEnabled &&
        houseEffective.ruleSet.operations.oneOnOneSessionsRequired)
      ? "Resident exception"
      : formatSource(houseEffective.sources.oneOnOne);

  return [
    {
      category: "Meetings required",
      effectiveValue: `${
        profile?.meetingsRequiredWeekly === false
          ? 0
          : (profile?.meetingsRequiredCount ?? houseEffective.ruleSet.meetings.meetingsPerWeek)
      } / week`,
      source: meetingsSource,
      organizationValue: `${orgEffective.meetings.meetingsPerWeek} / week`,
      houseValue: `${houseEffective.ruleSet.meetings.meetingsPerWeek} / week`,
      residentExceptionValue: profile ? `${profile.meetingsRequiredCount} / week` : null,
    },
    {
      category: "Work required",
      effectiveValue:
        (profile?.workRequired ?? houseEffective.ruleSet.employment.employmentRequired)
          ? "Required"
          : "Not required",
      source: workSource,
      organizationValue: orgEffective.employment.employmentRequired ? "Required" : "Not required",
      houseValue: houseEffective.ruleSet.employment.employmentRequired
        ? "Required"
        : "Not required",
      residentExceptionValue: profile ? (profile.workRequired ? "Required" : "Not required") : null,
    },
    {
      category: "Job applications",
      effectiveValue: `${
        profile?.jobApplicationsRequiredPerWeek ??
        houseEffective.ruleSet.jobSearch.applicationsRequiredPerWeek
      } / week`,
      source: jobSearchSource,
      organizationValue: `${orgEffective.jobSearch.applicationsRequiredPerWeek} / week`,
      houseValue: `${houseEffective.ruleSet.jobSearch.applicationsRequiredPerWeek} / week`,
      residentExceptionValue: profile ? `${profile.jobApplicationsRequiredPerWeek} / week` : null,
    },
    {
      category: "Curfew",
      effectiveValue: profile?.residentCurfewOverrideEnabled
        ? `${profile.residentCurfewWeekday} weekday`
        : `${houseEffective.ruleSet.curfew.weekdayCurfew} weekday`,
      source: curfewSource,
      organizationValue: `${orgEffective.curfew.weekdayCurfew} weekday`,
      houseValue: `${houseEffective.ruleSet.curfew.weekdayCurfew} weekday`,
      residentExceptionValue: profile?.residentCurfewOverrideEnabled
        ? `${profile.residentCurfewWeekday} weekday`
        : null,
    },
    {
      category: "Chore proof",
      effectiveValue: prettifyProofRequirement(houseEffective.ruleSet.chores.proofRequirement),
      source: formatSource(houseEffective.sources.chores),
      organizationValue: prettifyProofRequirement(orgEffective.chores.proofRequirement),
      houseValue: prettifyProofRequirement(houseEffective.ruleSet.chores.proofRequirement),
      residentExceptionValue: null,
    },
    {
      category: "House meetings",
      effectiveValue: houseEffective.ruleSet.operations.houseMeetingsRequired
        ? "Required"
        : "Not required",
      source: formatSource(houseEffective.sources.operations),
      organizationValue: orgEffective.operations.houseMeetingsRequired
        ? "Required"
        : "Not required",
      houseValue: houseEffective.ruleSet.operations.houseMeetingsRequired
        ? "Required"
        : "Not required",
      residentExceptionValue: null,
    },
    {
      category: "Sponsor contact",
      effectiveValue: houseEffective.ruleSet.sponsorContact.enabled
        ? `${houseEffective.ruleSet.sponsorContact.contactsRequiredPerWeek} / week`
        : "Not required",
      source: formatSource(houseEffective.sources.sponsorContact),
      organizationValue: orgEffective.sponsorContact.enabled
        ? `${orgEffective.sponsorContact.contactsRequiredPerWeek} / week`
        : "Not required",
      houseValue: houseEffective.ruleSet.sponsorContact.enabled
        ? `${houseEffective.ruleSet.sponsorContact.contactsRequiredPerWeek} / week`
        : "Not required",
      residentExceptionValue: null,
    },
    {
      category: "One-on-one",
      effectiveValue:
        (profile?.oneOnOneRequired ??
        (houseEffective.ruleSet.operations.oneOnOneSessionsEnabled &&
          houseEffective.ruleSet.operations.oneOnOneSessionsRequired))
          ? "Required"
          : "Not required",
      source: oneOnOneSource,
      organizationValue:
        orgEffective.operations.oneOnOneSessionsEnabled &&
        orgEffective.operations.oneOnOneSessionsRequired
          ? "Required"
          : "Not required",
      houseValue:
        houseEffective.ruleSet.operations.oneOnOneSessionsEnabled &&
        houseEffective.ruleSet.operations.oneOnOneSessionsRequired
          ? "Required"
          : "Not required",
      residentExceptionValue:
        profile?.oneOnOneRequired !== undefined
          ? profile.oneOnOneRequired
            ? "Required"
            : "Not required"
          : null,
    },
    {
      category: "Scope",
      effectiveValue: house
        ? `${house.name} • ${getHouseGroupById(store, house.houseGroupId ?? "")?.name ?? "No group"}`
        : "Unassigned",
      source: formatSource(houseEffective.sources.support),
      organizationValue: "Organization default scope",
      houseValue: house?.name ?? "Unassigned",
      residentExceptionValue: profile?.standingExceptionNotes || null,
    },
  ];
}

export function filterOperatorResidents(
  residents: ReturnType<typeof buildSoberHouseOperatorReportingSummary>["residents"],
  directory: ResidentDirectoryEntry[],
  filters: ResidentLookupFilters,
) {
  return residents.filter((resident) => {
    const directoryEntry = directory.find((entry) => entry.residentId === resident.residentId);
    const searchNeedle = filters.search.trim().toLowerCase();
    if (searchNeedle) {
      const haystack =
        `${directoryEntry?.fullName ?? resident.displayName} ${resident.houseName}`.toLowerCase();
      if (!haystack.includes(searchNeedle)) {
        return false;
      }
    }
    if (filters.houseId && resident.houseId !== filters.houseId) {
      return false;
    }
    if (filters.complianceBand !== "all" && resident.complianceBand !== filters.complianceBand) {
      return false;
    }
    if (filters.overdueOnly) {
      const overdue =
        resident.overdueChores > 0 ||
        resident.hasCurfewIssues ||
        resident.hasMeetingNoncompliance ||
        resident.hasOverdueOneOnOnes;
      if (!overdue) {
        return false;
      }
    }
    if (filters.highRiskOnly && resident.complianceBand === "compliant") {
      return false;
    }
    if (filters.openViolationsOnly && resident.openViolations === 0) {
      return false;
    }
    return true;
  });
}

export function buildOperatorWebViewModel(input: {
  storeOverride?: OperatorControlPlaneDataSource;
  role: OperatorWebRole;
  selectedHouseId: string | null;
  selectedResidentId: string | null;
  selectedActionId: string | null;
  selectedProofItemId: string | null;
  residentFilters: ResidentLookupFilters;
  enforcementFilters: OperatorEnforcementQueueFilters;
  proofFilters: OperatorProofQueueFilters;
  reportType: OperatorReportExportType;
  reportHouseId: string | null;
  reportResidentId: string | null;
}) {
  const source = input.storeOverride ?? DEMO_STORE;
  const { store, residentDirectory, roleDefaults } = source;
  const visibleHouseIds = visibleHouseIdsForRole(store, input.role, roleDefaults);
  const summary = buildSoberHouseOperatorReportingSummary({ store, nowIso: NOW_ISO });
  const enforcementSummary = buildSoberHouseEnforcementSummary({ store, nowIso: NOW_ISO });
  const proofSummary = buildSoberHouseProofReviewSummary({ store, nowIso: NOW_ISO });
  const houseReports = summary.houses.filter((house) => visibleHouseIds.has(house.houseId));
  const residentReports = filterOperatorResidents(
    summary.residents.filter(
      (resident) => resident.houseId && visibleHouseIds.has(resident.houseId),
    ),
    residentDirectory,
    input.residentFilters,
  );
  const selectedHouse =
    houseReports.find((house) => house.houseId === input.selectedHouseId) ??
    houseReports[0] ??
    null;
  const selectedResident =
    residentReports.find((resident) => resident.residentId === input.selectedResidentId) ??
    summary.residents.find((resident) => resident.residentId === input.selectedResidentId) ??
    residentReports[0] ??
    null;
  const enforcementQueue = filterEnforcementQueue(
    enforcementSummary.queue.filter((item) =>
      item.houseId ? visibleHouseIds.has(item.houseId) : true,
    ),
    input.enforcementFilters,
  );
  const selectedAction =
    enforcementQueue.find((item) => item.id === input.selectedActionId) ??
    enforcementQueue[0] ??
    null;
  const proofQueue = filterProofReviewQueue(
    proofSummary.queue.filter((item) => (item.houseId ? visibleHouseIds.has(item.houseId) : true)),
    input.proofFilters,
  );
  const selectedProofItem =
    proofQueue.find((item) => item.id === input.selectedProofItemId) ?? proofQueue[0] ?? null;
  const reportFilters = {
    ...buildDefaultOperatorReportFilters(store, NOW_ISO),
    houseId: input.reportHouseId,
    residentId: input.reportResidentId,
  };
  const reportPreview = buildSoberHouseOperatorReportDocument({
    store,
    nowIso: NOW_ISO,
    filters: reportFilters,
    reportType: input.reportType,
  });
  const recentExports = store.operatorReportExports.filter((record) =>
    record.houseId ? visibleHouseIds.has(record.houseId) : true,
  );
  const snapshots = store.scheduledSummaryRecords.filter((record) =>
    record.houseId ? visibleHouseIds.has(record.houseId) : true,
  );

  const houseRoster = selectedHouse
    ? summary.residents
        .filter((resident) => resident.houseId === selectedHouse.houseId)
        .map((resident) => ({
          ...resident,
          fullName:
            residentDirectory.find((entry) => entry.residentId === resident.residentId)?.fullName ??
            resident.displayName,
          assignedStaff:
            store.staffAssignments.find(
              (assignment) =>
                assignment.id ===
                residentDirectory.find((entry) => entry.residentId === resident.residentId)
                  ?.assignedStaffAssignmentId,
            ) ?? null,
        }))
    : [];

  const selectedResidentDirectory =
    selectedResident &&
    residentDirectory.find((entry) => entry.residentId === selectedResident.residentId);

  const assignedStaffByHouse = new Map<string, StaffAssignment[]>();
  store.staffAssignments.forEach((assignment) => {
    assignment.assignedHouseIds.forEach((houseId) => {
      const current = assignedStaffByHouse.get(houseId) ?? [];
      current.push(assignment);
      assignedStaffByHouse.set(houseId, current);
    });
  });

  const recentHouseActivity = selectedHouse
    ? [
        ...store.violations
          .filter((violation) => violation.houseId === selectedHouse.houseId)
          .map((violation) => ({
            id: violation.id,
            at: violation.triggeredAt,
            label: `${violation.ruleType} violation`,
            detail: violation.reasonSummary,
          })),
        ...store.oneOnOneSessions
          .filter((session) => session.houseId === selectedHouse.houseId)
          .map((session) => ({
            id: session.id,
            at: session.scheduledAt,
            label: "One-on-one",
            detail: `${session.title} • ${session.completionStatus.toLowerCase()}`,
          })),
        ...store.sponsorCallRecords
          .filter((record) => record.houseId === selectedHouse.houseId)
          .map((record) => ({
            id: record.id,
            at: record.completedAt ?? record.scheduledFor ?? record.createdAt,
            label: "Sponsor call",
            detail: `${record.status.toLowerCase()} • ${record.proofProvided ? "proof logged" : "proof missing"}`,
          })),
      ].sort((left, right) => right.at.localeCompare(left.at))
    : [];

  return {
    nowIso: NOW_ISO,
    store,
    organization: summary.organization,
    organizationEnforcement: {
      ...enforcementSummary.organizationSummary,
      risingVolumeHouses: enforcementSummary.organizationSummary.risingVolumeHouseIds
        .map((houseId) => houseReports.find((house) => house.houseId === houseId))
        .filter((house) => house !== undefined),
    },
    organizationProofSummary: proofSummary.organizationSummary,
    houses: houseReports,
    residents: residentReports.map((resident) => ({
      ...resident,
      fullName:
        residentDirectory.find((entry) => entry.residentId === resident.residentId)?.fullName ??
        resident.displayName,
      phaseLabel:
        residentDirectory.find((entry) => entry.residentId === resident.residentId)?.phaseLabel ??
        "Not set",
    })),
    staff: store.staffAssignments.filter((assignment) =>
      assignment.assignedHouseIds.some((houseId) => visibleHouseIds.has(houseId)),
    ),
    enforcementQueue,
    proofQueue,
    selectedAction,
    selectedProofItem,
    selectedHouse,
    selectedHouseRoster: houseRoster,
    selectedHouseStaff: selectedHouse
      ? (assignedStaffByHouse.get(selectedHouse.houseId) ?? [])
      : [],
    selectedHouseEnforcement: selectedHouse
      ? (enforcementSummary.houseSummaries.get(selectedHouse.houseId) ?? null)
      : null,
    selectedHouseProofSummary: selectedHouse
      ? (proofSummary.houseSummaries.get(selectedHouse.houseId) ?? null)
      : null,
    recentHouseActivity,
    selectedResident:
      selectedResident && selectedResidentDirectory
        ? {
            ...selectedResident,
            fullName: selectedResidentDirectory.fullName,
            phaseLabel: selectedResidentDirectory.phaseLabel,
            assignedStaff:
              store.staffAssignments.find(
                (assignment) =>
                  assignment.id === selectedResidentDirectory.assignedStaffAssignmentId,
              ) ?? null,
            effectiveRules: buildResidentRuleVisibility(
              store,
              selectedResident.residentId,
              NOW_ISO,
            ),
            enforcementLinks: buildResidentRuleEnforcementLinks(
              store,
              selectedResident.residentId,
              NOW_ISO,
            ),
            enforcementSummary:
              enforcementSummary.residentSummaries.get(selectedResident.residentId) ?? null,
            interventionTimeline: [
              ...(enforcementSummary.residentTimelineById.get(selectedResident.residentId) ?? []),
              ...(proofSummary.residentTimelineById.get(selectedResident.residentId) ?? []).map(
                (entry) => ({
                  id: entry.id,
                  residentId: entry.residentId,
                  at: entry.at,
                  title: entry.title,
                  detail: entry.detail,
                  level: null,
                  status: null,
                  category: "MISSING_PROOF" as const,
                }),
              ),
            ].sort((left, right) => right.at.localeCompare(left.at)),
            proofSummary: proofSummary.residentSummaries.get(selectedResident.residentId) ?? null,
          }
        : null,
    reportPreview,
    recentExports,
    snapshots,
    roleDefaults,
  };
}
