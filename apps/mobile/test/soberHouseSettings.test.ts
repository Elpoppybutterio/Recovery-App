import { describe, expect, it } from "vitest";
import { getSeededDevUser } from "../lib/devSeedUsers";
import { createDefaultSoberHouseSettingsStore } from "../lib/soberHouse/defaults";
import {
  saveResidentWizardDraft,
  setHouseStatus,
  upsertAlertPreference,
  upsertChoreCompletionRecord,
  upsertHouseAlertAnnouncement,
  upsertHouseChore,
  upsertHouse,
  upsertHouseGroup,
  upsertHouseMeeting,
  upsertHouseMeetingAttendanceRecord,
  upsertHouseRuleSet,
  upsertJobApplicationRecord,
  upsertOneOnOneSession,
  upsertOrganization,
  upsertRecurringObligation,
  upsertResidentConsentRecord,
  upsertResidentHouseMembership,
  upsertResidentHousingProfile,
  upsertResidentRequirementProfile,
  upsertStaffAssignment,
  upsertUserAccessProfile,
  upsertWorkVerificationRecord,
} from "../lib/soberHouse/mutations";
import {
  applyHouseDefaultsToResidentDraft,
  createDefaultResidentWizardDraft,
  createResidentConsentRecordFromDraft,
  createResidentHousingProfileFromDraft,
  createResidentRequirementProfileFromDraft,
  createResidentWizardDraftFromProfiles,
  getResidentSetupState,
} from "../lib/soberHouse/resident";
import { evaluateResidentCompliance } from "../lib/soberHouse/compliance";
import {
  addCorrectiveActionToViolation,
  addEvidenceLink,
  createManualViolation,
  syncViolationFromEvaluation,
  transitionCorrectiveActionStatus,
  transitionViolationForManager,
} from "../lib/soberHouse/interventions";
import {
  acknowledgeChatMessage,
  buildChatThreadSummaries,
  ensureDirectThreadForResident,
  getManagerViewerContexts,
  markThreadRead,
  sendChatMessage,
} from "../lib/soberHouse/chat";
import { computeResidentMonthlyKpis } from "../lib/soberHouse/kpis";
import { buildMonthlyWindow } from "../lib/soberHouse/monthlyWindow";
import { buildSoberHouseMonthlyReportPdfHtml } from "../lib/pdf/exportSoberHouseMonthlyReportPdf";
import {
  generateHouseMonthlyReport,
  generateResidentMonthlyReport,
  listMonthlyReportsForViewer,
} from "../lib/soberHouse/reports";
import {
  markMonthlyReportExported,
  transitionMonthlyReportStatus,
  updateMonthlyReportFinalNotes,
} from "../lib/soberHouse/reportWorkflow";
import {
  isSoberHouseProtectedSessionExpired,
  requiresSoberHouseDeviceUnlock,
  SOBER_HOUSE_PROTECTED_SESSION_TIMEOUT_MS,
} from "../lib/soberHouse/deviceAuth";
import { buildSoberHouseResidentDashboardSummary } from "../lib/soberHouse/dashboard";
import {
  attachSoberHouseRoutineProof,
  buildSoberHouseRoutineSummary,
} from "../lib/soberHouse/routine";
import {
  buildSoberHouseOwnerDashboardSummary,
  buildSoberHouseOwnerHouseDetail,
  buildSoberHouseOwnerHouseViolationRows,
} from "../lib/soberHouse/orgDashboard";
import {
  getEffectiveRuleSetForScope,
  getChatReceiptForMessageAndUser,
  getHouseMeetingsInRange,
  getRuleSetForHouse,
  getRuleSetForScope,
} from "../lib/soberHouse/selectors";
import {
  buildOneOnOneCalendarEventPlan,
  buildOneOnOneReminderPlans,
  isOneOnOneApplicable,
} from "../lib/soberHouse/scheduling";
import { computeResidentMonthlyWins } from "../lib/soberHouse/wins";

const ACTOR = {
  id: "admin-a",
  name: "Admin A",
};

function buildResidentComplianceStore() {
  let store = createDefaultSoberHouseSettingsStore();
  store = upsertOrganization(
    store,
    ACTOR,
    {
      name: "Bright Path Recovery",
      primaryContactName: "Jordan Hayes",
      primaryPhone: "(555) 555-1212",
      primaryEmail: "ops@brightpath.org",
      notes: "Pilot org",
      status: "ACTIVE",
    },
    "2026-03-08T10:00:00.000Z",
  ).store;

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
      notes: "North campus",
      status: "ACTIVE",
    },
    "2026-03-08T10:05:00.000Z",
  ).store;

  const houseId = store.houses[0]!.id;
  store = upsertHouseRuleSet(
    store,
    ACTOR,
    {
      houseId,
      name: "Maple rules",
      status: "ACTIVE",
      curfew: {
        enabled: true,
        weekdayCurfew: "22:00",
        fridayCurfew: "23:00",
        saturdayCurfew: "23:00",
        sundayCurfew: "22:00",
        gracePeriodMinutes: 10,
        preViolationAlertEnabled: true,
        preViolationLeadTimeMinutes: 15,
        alertBasis: "CLOCK_ONLY",
      },
      chores: {
        enabled: true,
        frequency: "DAILY",
        dueTime: "18:00",
        proofRequirement: ["PHOTO"],
        gracePeriodMinutes: 10,
        managerInstantNotificationEnabled: true,
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
        meetingsPerWeek: 5,
        allowedMeetingTypes: ["AA", "NA"],
        proofMethod: "SIGNATURE",
      },
      sponsorContact: {
        enabled: false,
        contactsRequiredPerWeek: 0,
        proofType: "CALL_LOG",
      },
    },
    "2026-03-08T10:10:00.000Z",
  ).store;

  const draft = {
    ...createDefaultResidentWizardDraft("enduser-a1"),
    firstName: "Taylor",
    lastName: "Brooks",
    assignedHouseId: houseId,
    moveInDate: "2026-03-01",
    roomOrBed: "2B",
    emergencyContactName: "Jamie Brooks",
    emergencyContactPhone: "(555) 555-1212",
    programPhaseOnEntry: "Phase 1",
    workRequired: true,
    currentlyEmployed: false,
    jobApplicationsRequiredPerWeek: 4,
    meetingsRequiredWeekly: true,
    meetingsRequiredCount: 5,
    consentToHouseRules: true,
    consentToLocationVerification: true,
    consentToComplianceDocumentation: true,
    consentSignedAt: "2026-03-08T10:12:00.000Z",
    consentSignatureRef: {
      uri: "file:///documents/signatures/resident.svg",
      mimeType: "image/svg+xml" as const,
    },
  };

  const housing = createResidentHousingProfileFromDraft(
    store,
    "enduser-a1",
    draft,
    "2026-03-08T10:12:00.000Z",
  );
  const requirements = createResidentRequirementProfileFromDraft(
    store,
    "enduser-a1",
    draft,
    "2026-03-08T10:12:00.000Z",
  );

  store = upsertResidentHousingProfile(store, ACTOR, housing, "2026-03-08T10:12:00.000Z").store;
  store = upsertResidentRequirementProfile(
    store,
    ACTOR,
    requirements,
    "2026-03-08T10:12:00.000Z",
  ).store;
  const consent = createResidentConsentRecordFromDraft(
    store,
    "enduser-a1",
    draft,
    "2026-03-08T10:12:00.000Z",
  );
  store = upsertResidentConsentRecord(store, ACTOR, consent, "2026-03-08T10:12:00.000Z").store;

  return {
    store,
    houseId,
    residentId: housing.residentId,
    linkedUserId: housing.linkedUserId,
  };
}

function buildChatStore() {
  const base = buildResidentComplianceStore();
  const store = upsertStaffAssignment(
    base.store,
    ACTOR,
    {
      firstName: "Casey",
      lastName: "Morris",
      phone: "(555) 555-4444",
      email: "casey@brightpath.org",
      role: "HOUSE_MANAGER",
      assignedHouseIds: base.houseId ? [base.houseId] : [],
      receiveRealTimeViolationAlerts: true,
      receiveNearMissAlerts: true,
      receiveMonthlyReports: true,
      canApproveExceptions: false,
      canIssueCorrectiveActions: true,
      canViewResidentEvidence: true,
      status: "ACTIVE",
    },
    "2026-03-08T10:15:00.000Z",
  ).store;
  return {
    ...base,
    store,
    managerContext: getManagerViewerContexts(store)[0] ?? null,
  };
}

function buildReportingStore() {
  const base = buildChatStore();
  if (!base.managerContext) {
    throw new Error("manager context should exist");
  }

  let store = base.store;
  const resident = store.residentHousingProfile!;
  const organizationId = store.organization?.id ?? null;
  const houseId = resident.houseId;

  store = upsertChoreCompletionRecord(
    store,
    ACTOR,
    {
      residentId: resident.residentId,
      linkedUserId: resident.linkedUserId,
      organizationId,
      houseId,
      houseChoreId: null,
      completedAt: "2026-03-02T17:30:00-07:00",
      proofRequirement: ["PHOTO"],
      proofProvided: true,
      proofReference: "file:///documents/chore-proof-1.jpg",
      notes: "Kitchen deep clean complete.",
    },
    "2026-03-02T17:30:00-07:00",
  ).store;

  store = upsertChoreCompletionRecord(
    store,
    ACTOR,
    {
      residentId: resident.residentId,
      linkedUserId: resident.linkedUserId,
      organizationId,
      houseId,
      houseChoreId: null,
      completedAt: "2026-03-03T17:45:00-07:00",
      proofRequirement: ["PHOTO"],
      proofProvided: true,
      proofReference: "file:///documents/chore-proof-2.jpg",
      notes: "Bathroom checklist completed.",
    },
    "2026-03-03T17:45:00-07:00",
  ).store;

  store = upsertJobApplicationRecord(
    store,
    ACTOR,
    {
      residentId: resident.residentId,
      linkedUserId: resident.linkedUserId,
      organizationId,
      houseId,
      employerName: "Northside Hardware",
      appliedAt: "2026-03-03T12:00:00-07:00",
      proofProvided: true,
      proofReference: "file:///documents/job-proof-1.jpg",
      notes: "Week 1 application 1",
    },
    "2026-03-03T12:00:00-07:00",
  ).store;
  store = upsertJobApplicationRecord(
    store,
    ACTOR,
    {
      residentId: resident.residentId,
      linkedUserId: resident.linkedUserId,
      organizationId,
      houseId,
      employerName: "River City Works",
      appliedAt: "2026-03-04T12:00:00-07:00",
      proofProvided: true,
      proofReference: "file:///documents/job-proof-2.jpg",
      notes: "Week 1 application 2",
    },
    "2026-03-04T12:00:00-07:00",
  ).store;
  store = upsertJobApplicationRecord(
    store,
    ACTOR,
    {
      residentId: resident.residentId,
      linkedUserId: resident.linkedUserId,
      organizationId,
      houseId,
      employerName: "Recovery Movers",
      appliedAt: "2026-03-05T12:00:00-07:00",
      proofProvided: true,
      proofReference: "file:///documents/job-proof-3.jpg",
      notes: "Week 1 application 3",
    },
    "2026-03-05T12:00:00-07:00",
  ).store;
  store = upsertJobApplicationRecord(
    store,
    ACTOR,
    {
      residentId: resident.residentId,
      linkedUserId: resident.linkedUserId,
      organizationId,
      houseId,
      employerName: "Bridge Staffing",
      appliedAt: "2026-03-06T12:00:00-07:00",
      proofProvided: true,
      proofReference: "file:///documents/job-proof-4.jpg",
      notes: "Week 1 application 4",
    },
    "2026-03-06T12:00:00-07:00",
  ).store;

  const threadResult = ensureDirectThreadForResident(
    store,
    ACTOR,
    { managerStaffAssignmentId: base.managerContext.staffAssignmentId },
    "2026-03-04T09:00:00-07:00",
  );
  store = threadResult.store;
  const managerMessage = sendChatMessage(
    store,
    ACTOR,
    base.managerContext,
    {
      threadId: threadResult.thread!.id,
      messageType: "ACKNOWLEDGMENT_REQUIRED",
      bodyText: "Attend one extra meeting this week.",
    },
    "2026-03-04T09:05:00-07:00",
  );
  store = managerMessage.store;
  const residentViewer = {
    kind: "resident" as const,
    userId: resident.linkedUserId,
    residentId: resident.residentId,
    houseId: resident.houseId,
    role: "RESIDENT" as const,
    label: "Taylor Brooks",
  };
  store = markThreadRead(
    store,
    ACTOR,
    residentViewer,
    threadResult.thread!.id,
    "2026-03-04T09:10:00-07:00",
  ).store;
  store = acknowledgeChatMessage(
    store,
    ACTOR,
    residentViewer,
    managerMessage.message!.id,
    "2026-03-04T09:20:00-07:00",
  ).store;

  const violation = createManualViolation(
    store,
    ACTOR,
    {
      ruleType: "chores",
      severity: "WARNING",
      reasonSummary: "Missed Saturday house chore.",
    },
    "2026-03-07T20:00:00-07:00",
  );
  store = violation.store;
  const corrective = addCorrectiveActionToViolation(
    store,
    ACTOR,
    violation.violation!.id,
    {
      actionType: "MAKE_UP_CHORE",
      dueAt: "2026-03-10T12:00:00-07:00",
      notes: "Complete a make-up kitchen reset.",
    },
    "2026-03-07T20:05:00-07:00",
  );
  store = corrective.store;
  store = transitionCorrectiveActionStatus(
    store,
    ACTOR,
    corrective.correctiveAction!.id,
    "COMPLETED",
    "2026-03-09T09:00:00-07:00",
    "Completed before house meeting.",
  ).store;

  return {
    ...base,
    store,
    residentViewer,
    attendanceRecords: [
      { id: "att-1", meetingId: "m1", startAt: "2026-03-02T19:00:00-07:00" },
      { id: "att-2", meetingId: "m2", startAt: "2026-03-03T19:00:00-07:00" },
      { id: "att-3", meetingId: "m3", startAt: "2026-03-04T19:00:00-07:00" },
      { id: "att-4", meetingId: "m4", startAt: "2026-03-05T19:00:00-07:00" },
      { id: "att-5", meetingId: "m5", startAt: "2026-03-06T19:00:00-07:00" },
    ],
    meetingAttendanceLogs: [],
  };
}

describe("sober house settings mutations", () => {
  it("requires device unlock only for protected sober-house admin access", () => {
    expect(requiresSoberHouseDeviceUnlock("OWNER_OPERATOR")).toBe(true);
    expect(requiresSoberHouseDeviceUnlock("HOUSE_RESIDENT")).toBe(false);
    expect(requiresSoberHouseDeviceUnlock("UNASSIGNED")).toBe(false);
    expect(requiresSoberHouseDeviceUnlock("DRUG_COURT_PARTICIPANT")).toBe(false);
    expect(requiresSoberHouseDeviceUnlock("PROBATION_PAROLE_PARTICIPANT")).toBe(false);
  });

  it("keeps a protected sober-house session unlocked until inactivity expires", () => {
    const lastActivityAtMs = 1_000;

    expect(
      isSoberHouseProtectedSessionExpired(
        lastActivityAtMs,
        lastActivityAtMs + SOBER_HOUSE_PROTECTED_SESSION_TIMEOUT_MS - 1,
      ),
    ).toBe(false);
    expect(
      isSoberHouseProtectedSessionExpired(
        lastActivityAtMs,
        lastActivityAtMs + SOBER_HOUSE_PROTECTED_SESSION_TIMEOUT_MS,
      ),
    ).toBe(true);
    expect(isSoberHouseProtectedSessionExpired(null, lastActivityAtMs)).toBe(true);
  });

  it("supports multi-house records and audits staff assignment changes", () => {
    let store = createDefaultSoberHouseSettingsStore();
    store = upsertOrganization(
      store,
      ACTOR,
      {
        name: "Bright Path Recovery",
        primaryContactName: "Jordan Hayes",
        primaryPhone: "(555) 555-1212",
        primaryEmail: "ops@brightpath.org",
        notes: "Pilot org",
        status: "ACTIVE",
      },
      "2026-03-08T10:00:00.000Z",
    ).store;

    store = upsertHouse(
      store,
      ACTOR,
      {
        name: "Maple House",
        address: "123 Main St",
        phone: "(555) 555-1000",
        geofenceRadiusFeetDefault: 200,
        houseTypes: ["MEN", "REENTRY"],
        bedCount: 12,
        notes: "North campus",
        status: "ACTIVE",
      },
      "2026-03-08T10:05:00.000Z",
    ).store;

    store = upsertHouse(
      store,
      ACTOR,
      {
        name: "Willow House",
        address: "456 Center Ave",
        phone: "(555) 555-2000",
        geofenceRadiusFeetDefault: 225,
        houseTypes: ["WOMEN"],
        bedCount: 10,
        notes: "South campus",
        status: "ACTIVE",
      },
      "2026-03-08T10:06:00.000Z",
    ).store;

    const houseIds = store.houses.map((house) => house.id);
    store = upsertStaffAssignment(
      store,
      ACTOR,
      {
        firstName: "Casey",
        lastName: "Morris",
        phone: "(555) 555-4444",
        email: "casey@brightpath.org",
        role: "HOUSE_MANAGER",
        assignedHouseIds: houseIds,
        receiveRealTimeViolationAlerts: true,
        receiveNearMissAlerts: true,
        receiveMonthlyReports: true,
        canApproveExceptions: true,
        canIssueCorrectiveActions: false,
        canViewResidentEvidence: true,
        status: "ACTIVE",
      },
      "2026-03-08T10:07:00.000Z",
    ).store;

    expect(store.organization?.name).toBe("Bright Path Recovery");
    expect(store.houses).toHaveLength(2);
    expect(store.staffAssignments[0]?.assignedHouseIds).toEqual(houseIds);
    expect(
      store.auditLogEntries.some(
        (entry) =>
          entry.entityType === "staffAssignment" &&
          entry.fieldChanged === "assignedHouseIds" &&
          entry.newValue?.includes(houseIds[0]) === true,
      ),
    ).toBe(true);
  });

  it("stores rule sets per house without overwriting a second house", () => {
    let store = createDefaultSoberHouseSettingsStore();
    store = upsertOrganization(
      store,
      ACTOR,
      {
        name: "Bright Path Recovery",
        primaryContactName: "",
        primaryPhone: "",
        primaryEmail: "",
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-08T11:00:00.000Z",
    ).store;

    store = upsertHouse(
      store,
      ACTOR,
      {
        name: "Maple House",
        address: "123 Main St",
        phone: "",
        geofenceRadiusFeetDefault: 200,
        houseTypes: ["MEN"],
        bedCount: 12,
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-08T11:01:00.000Z",
    ).store;

    store = upsertHouse(
      store,
      ACTOR,
      {
        name: "Willow House",
        address: "456 Center Ave",
        phone: "",
        geofenceRadiusFeetDefault: 200,
        houseTypes: ["WOMEN"],
        bedCount: 10,
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-08T11:02:00.000Z",
    ).store;

    const [willowHouse, mapleHouse] = store.houses;
    store = upsertHouseRuleSet(
      store,
      ACTOR,
      {
        houseId: mapleHouse.id,
        name: "Maple rules",
        status: "ACTIVE",
        curfew: {
          enabled: true,
          weekdayCurfew: "22:00",
          fridayCurfew: "23:00",
          saturdayCurfew: "23:30",
          sundayCurfew: "22:00",
          gracePeriodMinutes: 10,
          preViolationAlertEnabled: true,
          preViolationLeadTimeMinutes: 20,
          alertBasis: "BOTH",
        },
        chores: {
          enabled: true,
          frequency: "DAILY",
          dueTime: "18:00",
          proofRequirement: ["CHECKLIST"],
          gracePeriodMinutes: 10,
          managerInstantNotificationEnabled: true,
        },
        employment: {
          employmentRequired: true,
          workplaceVerificationEnabled: true,
          workplaceGeofenceRadiusDefault: 250,
          managerVerificationRequired: true,
        },
        jobSearch: {
          applicationsRequiredPerWeek: 0,
          proofRequired: false,
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
      },
      "2026-03-08T11:10:00.000Z",
    ).store;

    store = upsertHouseRuleSet(
      store,
      ACTOR,
      {
        houseId: willowHouse.id,
        name: "Willow rules",
        status: "ACTIVE",
        curfew: {
          enabled: true,
          weekdayCurfew: "21:00",
          fridayCurfew: "22:00",
          saturdayCurfew: "22:00",
          sundayCurfew: "21:00",
          gracePeriodMinutes: 5,
          preViolationAlertEnabled: false,
          preViolationLeadTimeMinutes: 15,
          alertBasis: "CLOCK_ONLY",
        },
        chores: {
          enabled: false,
          frequency: "WEEKLY",
          dueTime: "17:00",
          proofRequirement: ["PHOTO"],
          gracePeriodMinutes: 15,
          managerInstantNotificationEnabled: false,
        },
        employment: {
          employmentRequired: false,
          workplaceVerificationEnabled: false,
          workplaceGeofenceRadiusDefault: 200,
          managerVerificationRequired: false,
        },
        jobSearch: {
          applicationsRequiredPerWeek: 3,
          proofRequired: true,
          managerApprovalRequired: true,
        },
        meetings: {
          meetingsRequired: true,
          meetingsPerWeek: 6,
          allowedMeetingTypes: ["AA"],
          proofMethod: "GEOFENCE_SIGNATURE",
        },
        sponsorContact: {
          enabled: true,
          contactsRequiredPerWeek: 4,
          proofType: "TEXT_CONFIRMATION",
        },
      },
      "2026-03-08T11:11:00.000Z",
    ).store;

    expect(
      getRuleSetForHouse(store, mapleHouse.id, "2026-03-08T11:12:00.000Z").meetings.meetingsPerWeek,
    ).toBe(4);
    expect(
      getRuleSetForHouse(store, willowHouse.id, "2026-03-08T11:12:00.000Z").meetings
        .meetingsPerWeek,
    ).toBe(6);
    expect(store.houseRuleSets).toHaveLength(2);
  });

  it("resolves organization, house-group, and house rule scopes in order", () => {
    let store = createDefaultSoberHouseSettingsStore();
    store = upsertOrganization(
      store,
      ACTOR,
      {
        name: "Bright Path Recovery",
        primaryContactName: "",
        primaryPhone: "",
        primaryEmail: "",
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-08T11:20:00.000Z",
    ).store;

    store = upsertHouseGroup(
      store,
      ACTOR,
      {
        name: "Downtown cluster",
        houseIds: [],
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-08T11:21:00.000Z",
    ).store;

    const houseGroupId = store.houseGroups[0]!.id;
    store = upsertHouse(
      store,
      ACTOR,
      {
        houseGroupId,
        name: "Maple House",
        address: "123 Main St",
        phone: "",
        geofenceRadiusFeetDefault: 200,
        houseTypes: ["MEN"],
        bedCount: 12,
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-08T11:22:00.000Z",
    ).store;

    const houseId = store.houses[0]!.id;
    store = upsertHouseRuleSet(
      store,
      ACTOR,
      {
        scopeType: "ORGANIZATION",
        houseId: null,
        houseGroupId: null,
        name: "Org defaults",
        status: "ACTIVE",
        curfew: {
          enabled: true,
          weekdayCurfew: "22:00",
          fridayCurfew: "22:00",
          saturdayCurfew: "22:00",
          sundayCurfew: "22:00",
          gracePeriodMinutes: 10,
          preViolationAlertEnabled: false,
          preViolationLeadTimeMinutes: 15,
          alertBasis: "CLOCK_ONLY",
        },
        chores: {
          enabled: false,
          frequency: "WEEKLY",
          dueTime: "18:00",
          proofRequirement: ["CHECKLIST"],
          gracePeriodMinutes: 15,
          managerInstantNotificationEnabled: false,
        },
        employment: {
          employmentRequired: false,
          workplaceVerificationEnabled: false,
          workplaceGeofenceRadiusDefault: 200,
          managerVerificationRequired: false,
        },
        jobSearch: {
          applicationsRequiredPerWeek: 0,
          proofRequired: false,
          managerApprovalRequired: false,
        },
        meetings: {
          meetingsRequired: true,
          meetingsPerWeek: 3,
          allowedMeetingTypes: ["AA"],
          proofMethod: "GEOFENCE_SIGNATURE",
        },
        sponsorContact: {
          enabled: false,
          contactsRequiredPerWeek: 0,
          proofType: "CALL_LOG",
        },
      },
      "2026-03-08T11:23:00.000Z",
    ).store;

    expect(
      getRuleSetForHouse(store, houseId, "2026-03-08T11:24:00.000Z").meetings.meetingsPerWeek,
    ).toBe(3);

    store = upsertHouseRuleSet(
      store,
      ACTOR,
      {
        scopeType: "HOUSE_GROUP",
        houseId: null,
        houseGroupId,
        name: "Group defaults",
        status: "ACTIVE",
        curfew: {
          enabled: true,
          weekdayCurfew: "21:30",
          fridayCurfew: "22:30",
          saturdayCurfew: "22:30",
          sundayCurfew: "21:30",
          gracePeriodMinutes: 10,
          preViolationAlertEnabled: false,
          preViolationLeadTimeMinutes: 15,
          alertBasis: "CLOCK_ONLY",
        },
        chores: {
          enabled: false,
          frequency: "WEEKLY",
          dueTime: "18:00",
          proofRequirement: ["CHECKLIST"],
          gracePeriodMinutes: 15,
          managerInstantNotificationEnabled: false,
        },
        employment: {
          employmentRequired: false,
          workplaceVerificationEnabled: false,
          workplaceGeofenceRadiusDefault: 200,
          managerVerificationRequired: false,
        },
        jobSearch: {
          applicationsRequiredPerWeek: 0,
          proofRequired: false,
          managerApprovalRequired: false,
        },
        meetings: {
          meetingsRequired: true,
          meetingsPerWeek: 5,
          allowedMeetingTypes: ["AA"],
          proofMethod: "GEOFENCE_SIGNATURE",
        },
        sponsorContact: {
          enabled: false,
          contactsRequiredPerWeek: 0,
          proofType: "CALL_LOG",
        },
      },
      "2026-03-08T11:25:00.000Z",
    ).store;

    expect(
      getRuleSetForHouse(store, houseId, "2026-03-08T11:26:00.000Z").meetings.meetingsPerWeek,
    ).toBe(5);

    store = upsertHouseRuleSet(
      store,
      ACTOR,
      {
        scopeType: "HOUSE",
        houseId,
        houseGroupId: null,
        name: "House defaults",
        status: "ACTIVE",
        curfew: {
          enabled: true,
          weekdayCurfew: "21:00",
          fridayCurfew: "22:00",
          saturdayCurfew: "22:00",
          sundayCurfew: "21:00",
          gracePeriodMinutes: 10,
          preViolationAlertEnabled: false,
          preViolationLeadTimeMinutes: 15,
          alertBasis: "CLOCK_ONLY",
        },
        chores: {
          enabled: false,
          frequency: "WEEKLY",
          dueTime: "18:00",
          proofRequirement: ["CHECKLIST"],
          gracePeriodMinutes: 15,
          managerInstantNotificationEnabled: false,
        },
        employment: {
          employmentRequired: false,
          workplaceVerificationEnabled: false,
          workplaceGeofenceRadiusDefault: 200,
          managerVerificationRequired: false,
        },
        jobSearch: {
          applicationsRequiredPerWeek: 0,
          proofRequired: false,
          managerApprovalRequired: false,
        },
        meetings: {
          meetingsRequired: true,
          meetingsPerWeek: 7,
          allowedMeetingTypes: ["AA"],
          proofMethod: "GEOFENCE_SIGNATURE",
        },
        sponsorContact: {
          enabled: false,
          contactsRequiredPerWeek: 0,
          proofType: "CALL_LOG",
        },
      },
      "2026-03-08T11:27:00.000Z",
    ).store;

    expect(
      getRuleSetForHouse(store, houseId, "2026-03-08T11:28:00.000Z").meetings.meetingsPerWeek,
    ).toBe(7);
  });

  it("keeps organization defaults, house-group templates, and house overrides distinct by rule category", () => {
    let store = createDefaultSoberHouseSettingsStore();
    store = upsertOrganization(
      store,
      ACTOR,
      {
        name: "Bright Path Recovery",
        primaryContactName: "",
        primaryPhone: "",
        primaryEmail: "",
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-08T11:29:00.000Z",
    ).store;

    store = upsertHouseGroup(
      store,
      ACTOR,
      {
        name: "North campus template",
        houseIds: [],
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-08T11:30:00.000Z",
    ).store;

    const houseGroupId = store.houseGroups[0]!.id;
    store = upsertHouse(
      store,
      ACTOR,
      {
        houseGroupId,
        name: "Maple House",
        address: "123 Main St",
        phone: "",
        geofenceRadiusFeetDefault: 200,
        houseTypes: ["MEN"],
        bedCount: 12,
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-08T11:31:00.000Z",
    ).store;

    const houseId = store.houses[0]!.id;
    store = upsertHouseRuleSet(
      store,
      ACTOR,
      {
        scopeType: "ORGANIZATION",
        houseId: null,
        houseGroupId: null,
        name: "Org defaults",
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
          frequency: "WEEKLY",
          dueTime: "18:00",
          proofRequirement: ["CHECKLIST"],
          gracePeriodMinutes: 15,
          managerInstantNotificationEnabled: false,
        },
        employment: {
          employmentRequired: true,
          workplaceVerificationEnabled: true,
          workplaceGeofenceRadiusDefault: 200,
          managerVerificationRequired: false,
        },
        jobSearch: {
          applicationsRequiredPerWeek: 2,
          proofRequired: false,
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
          contactsRequiredPerWeek: 1,
          proofType: "CALL_LOG",
        },
      },
      "2026-03-08T11:32:00.000Z",
    ).store;

    const orgEffective = getEffectiveRuleSetForScope(
      store,
      "ORGANIZATION",
      null,
      "2026-03-08T11:33:00.000Z",
    ).ruleSet;

    store = upsertHouseRuleSet(
      store,
      ACTOR,
      {
        scopeType: "HOUSE_GROUP",
        houseId: null,
        houseGroupId,
        name: "North campus template",
        status: "ACTIVE",
        curfew: orgEffective.curfew,
        chores: orgEffective.chores,
        employment: orgEffective.employment,
        jobSearch: orgEffective.jobSearch,
        meetings: orgEffective.meetings,
        sponsorContact: {
          ...orgEffective.sponsorContact,
          contactsRequiredPerWeek: 3,
        },
        oneOnOne: orgEffective.oneOnOne,
        operations: orgEffective.operations,
        support: orgEffective.support,
      },
      "2026-03-08T11:34:00.000Z",
    ).store;

    const groupEffective = getEffectiveRuleSetForScope(
      store,
      "HOUSE_GROUP",
      houseGroupId,
      "2026-03-08T11:35:00.000Z",
    ).ruleSet;

    store = upsertHouseRuleSet(
      store,
      ACTOR,
      {
        scopeType: "HOUSE",
        houseId,
        houseGroupId: null,
        name: "Maple local override",
        status: "ACTIVE",
        curfew: groupEffective.curfew,
        chores: {
          ...groupEffective.chores,
          proofRequirement: ["PHOTO"],
        },
        employment: groupEffective.employment,
        jobSearch: groupEffective.jobSearch,
        meetings: groupEffective.meetings,
        sponsorContact: groupEffective.sponsorContact,
        oneOnOne: groupEffective.oneOnOne,
        operations: groupEffective.operations,
        support: groupEffective.support,
      },
      "2026-03-08T11:36:00.000Z",
    ).store;

    const effective = getEffectiveRuleSetForScope(
      store,
      "HOUSE",
      houseId,
      "2026-03-08T11:37:00.000Z",
    );
    const houseRules = getRuleSetForHouse(store, houseId, "2026-03-08T11:37:00.000Z");

    expect(houseRules.meetings.meetingsPerWeek).toBe(4);
    expect(houseRules.sponsorContact.contactsRequiredPerWeek).toBe(3);
    expect(houseRules.chores.proofRequirement).toEqual(["PHOTO"]);
    expect(effective.sources.meetings).toBe("ORGANIZATION");
    expect(effective.sources.sponsorContact).toBe("HOUSE_GROUP");
    expect(effective.sources.chores).toBe("HOUSE");
  });

  it("uses organization defaults for houses unless an active house or group override exists", () => {
    let store = createDefaultSoberHouseSettingsStore();
    store = upsertOrganization(
      store,
      ACTOR,
      {
        name: "Bright Path Recovery",
        primaryContactName: "",
        primaryPhone: "",
        primaryEmail: "",
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-08T11:20:00.000Z",
    ).store;
    store = upsertHouse(
      store,
      ACTOR,
      {
        houseGroupId: null,
        name: "Maple House",
        address: "123 Main St",
        phone: "",
        geofenceRadiusFeetDefault: 200,
        houseTypes: ["MEN"],
        bedCount: 12,
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-08T11:21:00.000Z",
    ).store;
    const houseId = store.houses[0]!.id;

    store = upsertHouseRuleSet(
      store,
      ACTOR,
      {
        scopeType: "ORGANIZATION",
        houseId: null,
        houseGroupId: null,
        name: "Org defaults",
        status: "ACTIVE",
        curfew: {
          enabled: true,
          weekdayCurfew: "22:00",
          fridayCurfew: "22:00",
          saturdayCurfew: "22:00",
          sundayCurfew: "22:00",
          gracePeriodMinutes: 10,
          preViolationAlertEnabled: false,
          preViolationLeadTimeMinutes: 15,
          alertBasis: "CLOCK_ONLY",
        },
        chores: {
          enabled: false,
          frequency: "WEEKLY",
          dueTime: "18:00",
          proofRequirement: ["CHECKLIST"],
          gracePeriodMinutes: 15,
          managerInstantNotificationEnabled: false,
        },
        employment: {
          employmentRequired: false,
          workplaceVerificationEnabled: false,
          workplaceGeofenceRadiusDefault: 200,
          managerVerificationRequired: false,
        },
        jobSearch: {
          applicationsRequiredPerWeek: 0,
          proofRequired: false,
          managerApprovalRequired: false,
        },
        meetings: {
          meetingsRequired: true,
          meetingsPerWeek: 4,
          allowedMeetingTypes: ["AA"],
          proofMethod: "SIGNATURE",
        },
        sponsorContact: {
          enabled: false,
          contactsRequiredPerWeek: 0,
          proofType: "CALL_LOG",
        },
      },
      "2026-03-08T11:22:00.000Z",
    ).store;

    store = upsertHouseRuleSet(
      store,
      ACTOR,
      {
        scopeType: "HOUSE",
        houseId,
        houseGroupId: null,
        name: "Old inactive house override",
        status: "INACTIVE",
        curfew: {
          enabled: true,
          weekdayCurfew: "21:00",
          fridayCurfew: "21:00",
          saturdayCurfew: "21:00",
          sundayCurfew: "21:00",
          gracePeriodMinutes: 10,
          preViolationAlertEnabled: false,
          preViolationLeadTimeMinutes: 15,
          alertBasis: "CLOCK_ONLY",
        },
        chores: {
          enabled: false,
          frequency: "WEEKLY",
          dueTime: "18:00",
          proofRequirement: ["CHECKLIST"],
          gracePeriodMinutes: 15,
          managerInstantNotificationEnabled: false,
        },
        employment: {
          employmentRequired: false,
          workplaceVerificationEnabled: false,
          workplaceGeofenceRadiusDefault: 200,
          managerVerificationRequired: false,
        },
        jobSearch: {
          applicationsRequiredPerWeek: 0,
          proofRequired: false,
          managerApprovalRequired: false,
        },
        meetings: {
          meetingsRequired: true,
          meetingsPerWeek: 1,
          allowedMeetingTypes: ["AA"],
          proofMethod: "SIGNATURE",
        },
        sponsorContact: {
          enabled: false,
          contactsRequiredPerWeek: 0,
          proofType: "CALL_LOG",
        },
      },
      "2026-03-08T11:23:00.000Z",
    ).store;

    expect(
      getRuleSetForHouse(store, houseId, "2026-03-08T11:24:00.000Z").meetings.meetingsPerWeek,
    ).toBe(4);
  });

  it("builds the seeded resident user with visible organization, house-group, and house inheritance", () => {
    const seededResident = getSeededDevUser("resident-user");
    const store = seededResident?.soberHouseStore;
    const houseId = store?.userAccessProfile?.houseId ?? null;

    expect(store).not.toBeNull();
    expect(houseId).not.toBeNull();

    const effective = getEffectiveRuleSetForScope(
      store!,
      "HOUSE",
      houseId,
      "2026-03-08T11:40:00.000Z",
    );

    expect(effective.ruleSet.meetings.meetingsPerWeek).toBe(5);
    expect(effective.ruleSet.sponsorContact.contactsRequiredPerWeek).toBe(3);
    expect(effective.ruleSet.jobSearch.applicationsRequiredPerWeek).toBe(4);
    expect(effective.ruleSet.chores.frequency).toBe("DAILY");
    expect(effective.sources.meetings).toBe("HOUSE");
    expect(effective.sources.sponsorContact).toBe("HOUSE_GROUP");
    expect(effective.sources.jobSearch).toBe("ORGANIZATION");
    expect(effective.sources.chores).toBe("HOUSE_GROUP");
    expect(effective.sources.curfew).toBe("HOUSE");
  });

  it("prefers the active scope rule set when loading organization defaults back into the editor", () => {
    let store = createDefaultSoberHouseSettingsStore();
    store = upsertOrganization(
      store,
      ACTOR,
      {
        name: "Bright Path Recovery",
        primaryContactName: "",
        primaryPhone: "",
        primaryEmail: "",
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-08T11:20:00.000Z",
    ).store;

    store = upsertHouseRuleSet(
      store,
      ACTOR,
      {
        scopeType: "ORGANIZATION",
        houseId: null,
        houseGroupId: null,
        name: "Inactive org defaults",
        status: "INACTIVE",
        meetings: {
          meetingsRequired: true,
          meetingsPerWeek: 1,
          allowedMeetingTypes: ["AA"],
          proofMethod: "SIGNATURE",
        },
      },
      "2026-03-08T11:21:00.000Z",
    ).store;

    store = upsertHouseRuleSet(
      store,
      ACTOR,
      {
        scopeType: "ORGANIZATION",
        houseId: null,
        houseGroupId: null,
        name: "Active org defaults",
        status: "ACTIVE",
        meetings: {
          meetingsRequired: true,
          meetingsPerWeek: 4,
          allowedMeetingTypes: ["AA"],
          proofMethod: "SIGNATURE",
        },
      },
      "2026-03-08T11:22:00.000Z",
    ).store;

    expect(getRuleSetForScope(store, "ORGANIZATION", null)?.name).toBe("Active org defaults");
    expect(getRuleSetForScope(store, "ORGANIZATION", null)?.meetings.meetingsPerWeek).toBe(4);
  });

  it("audits deactivation and alert preference persistence", () => {
    let store = createDefaultSoberHouseSettingsStore();
    store = upsertOrganization(
      store,
      ACTOR,
      {
        name: "Bright Path Recovery",
        primaryContactName: "",
        primaryPhone: "",
        primaryEmail: "",
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-08T12:00:00.000Z",
    ).store;

    store = upsertHouse(
      store,
      ACTOR,
      {
        name: "Maple House",
        address: "123 Main St",
        phone: "",
        geofenceRadiusFeetDefault: 200,
        houseTypes: ["MEN"],
        bedCount: 12,
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-08T12:01:00.000Z",
    ).store;

    const houseId = store.houses[0]?.id;
    if (!houseId) {
      throw new Error("house should exist");
    }

    store = upsertAlertPreference(
      store,
      ACTOR,
      {
        label: "Primary manager",
        scope: "HOUSE",
        houseId,
        recipientStaffAssignmentIds: [],
        recipientName: "Jordan Hayes",
        recipientPhone: "(555) 555-9999",
        recipientEmail: "alerts@brightpath.org",
        deliveryMethod: "BOTH",
        sendRealTimeViolationAlerts: true,
        sendNearMissAlerts: true,
        sendMonthlyReports: true,
        status: "ACTIVE",
      },
      "2026-03-08T12:02:00.000Z",
    ).store;

    store = setHouseStatus(store, ACTOR, houseId, "INACTIVE", "2026-03-08T12:03:00.000Z").store;

    expect(store.alertPreferences).toHaveLength(1);
    expect(store.houses[0]?.status).toBe("INACTIVE");
    expect(
      store.auditLogEntries.find(
        (entry) => entry.entityType === "house" && entry.fieldChanged === "status",
      )?.newValue,
    ).toBe("INACTIVE");
  });

  it("persists the current user access profile for owner or resident routing", () => {
    let store = createDefaultSoberHouseSettingsStore();
    store = upsertOrganization(
      store,
      ACTOR,
      {
        name: "Bright Path Recovery",
        primaryContactName: "",
        primaryPhone: "",
        primaryEmail: "",
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-08T12:10:00.000Z",
    ).store;

    store = upsertHouse(
      store,
      ACTOR,
      {
        name: "Maple House",
        address: "123 Main St",
        phone: "",
        geofenceRadiusFeetDefault: 200,
        houseTypes: ["MEN"],
        bedCount: 12,
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-08T12:11:00.000Z",
    ).store;

    const houseId = store.houses[0]!.id;
    store = upsertUserAccessProfile(
      store,
      ACTOR,
      {
        linkedUserId: "enduser-a1",
        role: "HOUSE_RESIDENT",
        organizationId: store.organization?.id ?? null,
        houseId,
        houseGroupId: null,
        status: "ACTIVE",
      },
      "2026-03-08T12:12:00.000Z",
    ).store;

    expect(store.userAccessProfile?.linkedUserId).toBe("enduser-a1");
    expect(store.userAccessProfile?.role).toBe("HOUSE_RESIDENT");
    expect(store.userAccessProfile?.houseId).toBe(houseId);
  });

  it("initializes resident requirement defaults from house rules and persists profiles", () => {
    let store = createDefaultSoberHouseSettingsStore();
    store = upsertOrganization(
      store,
      ACTOR,
      {
        name: "Bright Path Recovery",
        primaryContactName: "",
        primaryPhone: "",
        primaryEmail: "",
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-08T13:00:00.000Z",
    ).store;

    store = upsertHouse(
      store,
      ACTOR,
      {
        name: "Maple House",
        address: "123 Main St",
        phone: "",
        geofenceRadiusFeetDefault: 200,
        houseTypes: ["MEN"],
        bedCount: 12,
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-08T13:01:00.000Z",
    ).store;

    const houseId = store.houses[0]?.id;
    if (!houseId) {
      throw new Error("house should exist");
    }

    store = upsertHouseRuleSet(
      store,
      ACTOR,
      {
        houseId,
        name: "Maple defaults",
        status: "ACTIVE",
        curfew: {
          enabled: true,
          weekdayCurfew: "22:00",
          fridayCurfew: "23:00",
          saturdayCurfew: "23:30",
          sundayCurfew: "22:00",
          gracePeriodMinutes: 10,
          preViolationAlertEnabled: true,
          preViolationLeadTimeMinutes: 20,
          alertBasis: "BOTH",
        },
        chores: {
          enabled: true,
          frequency: "WEEKLY",
          dueTime: "18:00",
          proofRequirement: ["CHECKLIST"],
          gracePeriodMinutes: 10,
          managerInstantNotificationEnabled: false,
        },
        employment: {
          employmentRequired: true,
          workplaceVerificationEnabled: true,
          workplaceGeofenceRadiusDefault: 250,
          managerVerificationRequired: true,
        },
        jobSearch: {
          applicationsRequiredPerWeek: 5,
          proofRequired: true,
          managerApprovalRequired: true,
        },
        meetings: {
          meetingsRequired: true,
          meetingsPerWeek: 4,
          allowedMeetingTypes: ["AA"],
          proofMethod: "SIGNATURE",
        },
        sponsorContact: {
          enabled: true,
          contactsRequiredPerWeek: 3,
          proofType: "CALL_LOG",
        },
      },
      "2026-03-08T13:02:00.000Z",
    ).store;

    const draft = applyHouseDefaultsToResidentDraft(
      store,
      "enduser-a1",
      houseId,
      createDefaultResidentWizardDraft("enduser-a1"),
    );
    expect(draft.workRequired).toBe(true);
    expect(draft.jobApplicationsRequiredPerWeek).toBe(5);
    expect(draft.meetingsRequiredWeekly).toBe(true);
    expect(draft.meetingsRequiredCount).toBe(4);
    expect(draft.sponsorContactFrequency).toBe("3 per week");

    const populatedDraft = {
      ...draft,
      firstName: "Taylor",
      lastName: "Brooks",
      moveInDate: "2026-03-01",
      roomOrBed: "2B",
      emergencyContactName: "Jamie Brooks",
      emergencyContactPhone: "(555) 555-1212",
      programPhaseOnEntry: "Phase 1",
      currentlyEmployed: false,
      consentToHouseRules: true,
      consentToLocationVerification: true,
      consentToComplianceDocumentation: true,
      consentSignedAt: "2026-03-08T13:05:00.000Z",
      consentSignatureRef: {
        uri: "file:///documents/signatures/resident.svg",
        mimeType: "image/svg+xml" as const,
      },
    };

    store = saveResidentWizardDraft(store, populatedDraft);
    const housing = createResidentHousingProfileFromDraft(
      store,
      "enduser-a1",
      populatedDraft,
      "2026-03-08T13:05:00.000Z",
    );
    const requirements = createResidentRequirementProfileFromDraft(
      store,
      "enduser-a1",
      populatedDraft,
      "2026-03-08T13:05:00.000Z",
    );
    const consent = createResidentConsentRecordFromDraft(
      store,
      "enduser-a1",
      populatedDraft,
      "2026-03-08T13:05:00.000Z",
    );

    store = upsertResidentHousingProfile(store, ACTOR, housing, "2026-03-08T13:05:00.000Z").store;
    store = upsertResidentRequirementProfile(
      store,
      ACTOR,
      requirements,
      "2026-03-08T13:05:00.000Z",
    ).store;
    store = upsertResidentConsentRecord(store, ACTOR, consent, "2026-03-08T13:05:00.000Z").store;

    expect(store.residentHousingProfile?.houseId).toBe(houseId);
    expect(store.residentRequirementProfile?.sourceHouseRuleSetId).toBe(
      getRuleSetForHouse(store, houseId, "2026-03-08T13:06:00.000Z").id,
    );
    expect(store.residentConsentRecord?.rulesVersionReference).toContain("rule-set:");
  });

  it("writes audit entries for resident profile edits", () => {
    let store = createDefaultSoberHouseSettingsStore();
    const baseDraft = {
      ...createDefaultResidentWizardDraft("enduser-a1"),
      firstName: "Taylor",
      lastName: "Brooks",
      moveInDate: "2026-03-01",
      consentToHouseRules: true,
      consentToLocationVerification: true,
      consentToComplianceDocumentation: true,
      consentSignedAt: "2026-03-08T14:00:00.000Z",
      consentSignatureRef: {
        uri: "file:///documents/signatures/resident.svg",
        mimeType: "image/svg+xml" as const,
      },
    };

    const housing = createResidentHousingProfileFromDraft(
      store,
      "enduser-a1",
      baseDraft,
      "2026-03-08T14:00:00.000Z",
    );
    const requirements = createResidentRequirementProfileFromDraft(
      store,
      "enduser-a1",
      baseDraft,
      "2026-03-08T14:00:00.000Z",
    );
    const consent = createResidentConsentRecordFromDraft(
      store,
      "enduser-a1",
      baseDraft,
      "2026-03-08T14:00:00.000Z",
    );

    store = upsertResidentHousingProfile(store, ACTOR, housing, "2026-03-08T14:00:00.000Z").store;
    store = upsertResidentRequirementProfile(
      store,
      ACTOR,
      requirements,
      "2026-03-08T14:00:00.000Z",
    ).store;
    store = upsertResidentConsentRecord(store, ACTOR, consent, "2026-03-08T14:00:00.000Z").store;

    store = upsertResidentRequirementProfile(
      store,
      ACTOR,
      { ...requirements, meetingsRequiredWeekly: true, meetingsRequiredCount: 5 },
      "2026-03-08T14:10:00.000Z",
    ).store;

    expect(
      store.auditLogEntries.some(
        (entry) =>
          entry.entityType === "residentRequirementProfile" &&
          entry.fieldChanged === "meetingsRequiredCount" &&
          entry.newValue === "5",
      ),
    ).toBe(true);
  });
});

describe("sober house compliance evaluation", () => {
  it("uses resident curfew overrides and returns at-risk then violation states", () => {
    const { store } = buildResidentComplianceStore();
    const overriddenStore = upsertResidentRequirementProfile(
      store,
      ACTOR,
      {
        ...store.residentRequirementProfile!,
        residentCurfewOverrideEnabled: true,
        residentCurfewWeekday: "21:00",
        residentCurfewFriday: "21:30",
        residentCurfewSaturday: "21:30",
        residentCurfewSunday: "21:00",
      },
      "2026-03-09T20:45:00-06:00",
    ).store;

    const atRisk = evaluateResidentCompliance({
      store: overriddenStore,
      nowIso: "2026-03-09T20:50:00-06:00",
      currentLocation: { lat: 45.79, lng: -108.49, accuracyM: 15 },
      attendanceRecords: [],
      meetingAttendanceLogs: [],
    });
    const violation = evaluateResidentCompliance({
      store: overriddenStore,
      nowIso: "2026-03-09T21:15:00-06:00",
      currentLocation: { lat: 45.79, lng: -108.49, accuracyM: 15 },
      attendanceRecords: [],
      meetingAttendanceLogs: [],
    });

    expect(atRisk?.evaluations.find((entry) => entry.ruleType === "curfew")?.status).toBe(
      "at_risk",
    );
    expect(
      atRisk?.evaluations.find((entry) => entry.ruleType === "curfew")?.effectiveTargetValue,
    ).toBe("21:00");
    expect(violation?.evaluations.find((entry) => entry.ruleType === "curfew")?.status).toBe(
      "violation",
    );
  });

  it("distinguishes missing-proof chore completions from valid chore completions", () => {
    const { store, residentId, linkedUserId } = buildResidentComplianceStore();
    const invalidStore = upsertChoreCompletionRecord(
      store,
      ACTOR,
      {
        residentId,
        linkedUserId,
        organizationId: store.organization?.id ?? null,
        houseId: store.residentHousingProfile?.houseId ?? null,
        houseChoreId: null,
        completedAt: "2026-03-09T17:30:00-06:00",
        proofRequirement: ["PHOTO"],
        proofProvided: false,
        proofReference: null,
        notes: "Finished kitchen wipe-down.",
      },
      "2026-03-09T17:30:00-06:00",
    ).store;
    const validStore = upsertChoreCompletionRecord(
      invalidStore,
      ACTOR,
      {
        residentId,
        linkedUserId,
        organizationId: invalidStore.organization?.id ?? null,
        houseId: invalidStore.residentHousingProfile?.houseId ?? null,
        houseChoreId: null,
        completedAt: "2026-03-09T17:45:00-06:00",
        proofRequirement: ["PHOTO"],
        proofProvided: true,
        proofReference: "file:///documents/chore-proof.jpg",
        notes: "Uploaded sink photo.",
      },
      "2026-03-09T17:45:00-06:00",
    ).store;

    const invalidSummary = evaluateResidentCompliance({
      store: invalidStore,
      nowIso: "2026-03-09T18:15:00-06:00",
      currentLocation: { lat: 45.7833, lng: -108.5007, accuracyM: 10 },
      attendanceRecords: [],
      meetingAttendanceLogs: [],
    });
    const validSummary = evaluateResidentCompliance({
      store: validStore,
      nowIso: "2026-03-09T18:15:00-06:00",
      currentLocation: { lat: 45.7833, lng: -108.5007, accuracyM: 10 },
      attendanceRecords: [],
      meetingAttendanceLogs: [],
    });

    expect(invalidSummary?.evaluations.find((entry) => entry.ruleType === "chores")?.status).toBe(
      "violation",
    );
    expect(validSummary?.evaluations.find((entry) => entry.ruleType === "chores")?.status).toBe(
      "compliant",
    );
  });

  it("shows chore proof as awaiting manager confirmation until the manager confirms it", () => {
    const base = buildResidentComplianceStore();
    const configuredStore = upsertHouseRuleSet(
      base.store,
      ACTOR,
      {
        ...base.store.houseRuleSets[0]!,
        chores: {
          ...base.store.houseRuleSets[0]!.chores,
          proofRequirement: ["PHOTO", "MANAGER_CONFIRMATION"],
        },
      },
      "2026-03-09T17:00:00-06:00",
    ).store;
    const pendingStore = upsertChoreCompletionRecord(
      configuredStore,
      ACTOR,
      {
        residentId: base.residentId,
        linkedUserId: base.linkedUserId,
        organizationId: configuredStore.organization?.id ?? null,
        houseId: configuredStore.residentHousingProfile?.houseId ?? null,
        houseChoreId: null,
        completedAt: "2026-03-09T17:30:00-06:00",
        proofRequirement: ["PHOTO", "MANAGER_CONFIRMATION"],
        proofProvided: true,
        proofReference: "file:///documents/chore-proof.jpg",
        managerConfirmationRequired: true,
        managerConfirmationStatus: "PENDING",
        managerConfirmationRequestedAt: "2026-03-09T17:31:00-06:00",
        managerConfirmationRequestedVia: "SHARE_SHEET",
        managerConfirmedAt: null,
        notes: "Uploaded sink photo and shared with manager.",
      },
      "2026-03-09T17:31:00-06:00",
    ).store;
    const confirmedStore = upsertChoreCompletionRecord(
      pendingStore,
      ACTOR,
      {
        id: pendingStore.choreCompletionRecords[0]!.id,
        residentId: base.residentId,
        linkedUserId: base.linkedUserId,
        organizationId: pendingStore.organization?.id ?? null,
        houseId: pendingStore.residentHousingProfile?.houseId ?? null,
        houseChoreId: null,
        completedAt: "2026-03-09T17:30:00-06:00",
        proofRequirement: ["PHOTO", "MANAGER_CONFIRMATION"],
        proofProvided: true,
        proofReference: "file:///documents/chore-proof.jpg",
        managerConfirmationRequired: true,
        managerConfirmationStatus: "CONFIRMED",
        managerConfirmationRequestedAt: "2026-03-09T17:31:00-06:00",
        managerConfirmationRequestedVia: "SHARE_SHEET",
        managerConfirmedAt: "2026-03-09T17:45:00-06:00",
        notes: "Manager confirmed completion.",
      },
      "2026-03-09T17:45:00-06:00",
    ).store;

    const pendingSummary = evaluateResidentCompliance({
      store: pendingStore,
      nowIso: "2026-03-09T17:50:00-06:00",
      currentLocation: { lat: 45.7833, lng: -108.5007, accuracyM: 10 },
      attendanceRecords: [],
      meetingAttendanceLogs: [],
    });
    const confirmedSummary = evaluateResidentCompliance({
      store: confirmedStore,
      nowIso: "2026-03-09T17:50:00-06:00",
      currentLocation: { lat: 45.7833, lng: -108.5007, accuracyM: 10 },
      attendanceRecords: [],
      meetingAttendanceLogs: [],
    });

    expect(pendingSummary?.evaluations.find((entry) => entry.ruleType === "chores")?.status).toBe(
      "at_risk",
    );
    expect(
      pendingSummary?.evaluations.find((entry) => entry.ruleType === "chores")?.statusReason,
    ).toContain("awaiting manager confirmation");
    expect(confirmedSummary?.evaluations.find((entry) => entry.ruleType === "chores")?.status).toBe(
      "compliant",
    );
  });

  it("routes unemployed residents through job-search and meeting quota evaluation", () => {
    const { store, residentId, linkedUserId } = buildResidentComplianceStore();
    const nextStore = upsertJobApplicationRecord(
      store,
      ACTOR,
      {
        residentId,
        linkedUserId,
        organizationId: store.organization?.id ?? null,
        houseId: store.residentHousingProfile?.houseId ?? null,
        employerName: "Northside Hardware",
        appliedAt: "2026-03-13T12:00:00-06:00",
        proofProvided: true,
        proofReference: "file:///documents/application-proof.jpg",
        notes: "Submitted application online.",
      },
      "2026-03-13T12:00:00-06:00",
    ).store;
    const summary = evaluateResidentCompliance({
      store: nextStore,
      nowIso: "2026-03-14T18:00:00-06:00",
      currentLocation: { lat: 45.7833, lng: -108.5007, accuracyM: 10 },
      attendanceRecords: [{ id: "att-1", meetingId: "m1", startAt: "2026-03-10T19:00:00-06:00" }],
      meetingAttendanceLogs: [
        {
          id: "log-1",
          meetingId: "m2",
          atIso: "2026-03-11T19:00:00-06:00",
          method: "verified",
        },
      ],
    });

    expect(summary?.evaluations.find((entry) => entry.ruleType === "work")?.status).toBe("at_risk");
    expect(summary?.evaluations.find((entry) => entry.ruleType === "jobSearch")?.status).toBe(
      "at_risk",
    );
    expect(summary?.evaluations.find((entry) => entry.ruleType === "meetings")?.status).toBe(
      "at_risk",
    );
    expect(
      summary?.evaluations.find((entry) => entry.ruleType === "meetings")?.metadata
        .attendanceSource,
    ).toBe("attendanceRecords");
  });

  it("marks employed residents incomplete until employer details exist and compliant once verified", () => {
    const { store, residentId, linkedUserId } = buildResidentComplianceStore();
    const employedStore = upsertResidentRequirementProfile(
      store,
      ACTOR,
      {
        ...store.residentRequirementProfile!,
        currentlyEmployed: true,
        employerName: "",
        employerAddress: "",
        employerPhone: "",
        jobApplicationsRequiredPerWeek: 0,
      },
      "2026-03-12T10:00:00-06:00",
    ).store;
    const incompleteSummary = evaluateResidentCompliance({
      store: employedStore,
      nowIso: "2026-03-12T10:15:00-06:00",
      currentLocation: { lat: 45.7833, lng: -108.5007, accuracyM: 10 },
      attendanceRecords: [],
      meetingAttendanceLogs: [],
    });

    const configuredStore = upsertResidentRequirementProfile(
      employedStore,
      ACTOR,
      {
        ...employedStore.residentRequirementProfile!,
        employerName: "Acme Recovery Works",
        employerAddress: "500 Work Ave",
        employerPhone: "(555) 555-8800",
      },
      "2026-03-12T10:20:00-06:00",
    ).store;
    const verifiedStore = upsertWorkVerificationRecord(
      configuredStore,
      ACTOR,
      {
        residentId,
        linkedUserId,
        organizationId: configuredStore.organization?.id ?? null,
        houseId: configuredStore.residentHousingProfile?.houseId ?? null,
        verifiedAt: "2026-03-12T11:00:00-06:00",
        verificationMethod: "SELF_REPORTED",
        notes: "Logged regular day shift.",
      },
      "2026-03-12T11:00:00-06:00",
    ).store;
    const verifiedSummary = evaluateResidentCompliance({
      store: verifiedStore,
      nowIso: "2026-03-12T12:00:00-06:00",
      currentLocation: { lat: 45.7833, lng: -108.5007, accuracyM: 10 },
      attendanceRecords: [],
      meetingAttendanceLogs: [],
    });

    expect(incompleteSummary?.evaluations.find((entry) => entry.ruleType === "work")?.status).toBe(
      "incomplete_setup",
    );
    expect(verifiedSummary?.evaluations.find((entry) => entry.ruleType === "work")?.status).toBe(
      "compliant",
    );
  });
});

describe("sober house interventions", () => {
  it("dedupes repeated compliance violations into one open violation per rule window", () => {
    const { store } = buildResidentComplianceStore();
    const summary = evaluateResidentCompliance({
      store,
      nowIso: "2026-03-09T22:20:00-06:00",
      currentLocation: { lat: 45.79, lng: -108.49, accuracyM: 15 },
      attendanceRecords: [],
      meetingAttendanceLogs: [],
    });
    const curfewViolation = summary?.evaluations.find((entry) => entry.ruleType === "curfew");

    expect(curfewViolation?.status).toBe("violation");
    const first = syncViolationFromEvaluation(
      store,
      ACTOR,
      curfewViolation!,
      "2026-03-09T22:20:00-06:00",
    );
    const second = syncViolationFromEvaluation(
      first.store,
      ACTOR,
      { ...curfewViolation!, evaluatedAt: "2026-03-09T22:25:00-06:00" },
      "2026-03-09T22:25:00-06:00",
    );

    expect(first.store.violations).toHaveLength(1);
    expect(second.store.violations).toHaveLength(1);
    expect(second.store.violations[0]?.complianceWindowKey).toBe(
      first.store.violations[0]?.complianceWindowKey,
    );
  });

  it("writes audit-safe status transitions when a violation moves through review and resolution", () => {
    const { store } = buildResidentComplianceStore();
    const violation = createManualViolation(
      store,
      ACTOR,
      {
        ruleType: "other",
        severity: "WARNING",
        reasonSummary: "Manager-created note for follow-up.",
      },
      "2026-03-10T09:00:00-06:00",
    );

    let nextStore = violation.store;
    const createdViolation = violation.violation!;
    nextStore = transitionViolationForManager(
      nextStore,
      ACTOR,
      createdViolation.id,
      "UNDER_REVIEW",
      "2026-03-10T09:10:00-06:00",
      "Review started.",
    ).store;
    nextStore = transitionViolationForManager(
      nextStore,
      ACTOR,
      createdViolation.id,
      "RESOLVED",
      "2026-03-10T09:20:00-06:00",
      "Resident completed required follow-up.",
    ).store;

    const resolved = nextStore.violations.find((entry) => entry.id === createdViolation.id);
    expect(resolved?.status).toBe("RESOLVED");
    expect(
      nextStore.auditLogEntries.some(
        (entry) =>
          entry.entityType === "violation" &&
          entry.entityId === createdViolation.id &&
          entry.actionTaken === "violation_under_review",
      ),
    ).toBe(true);
    expect(
      nextStore.auditLogEntries.some(
        (entry) =>
          entry.entityType === "violation" &&
          entry.entityId === createdViolation.id &&
          entry.actionTaken === "violation_resolved",
      ),
    ).toBe(true);
  });

  it("links corrective actions and evidence to a violation without losing parent history", () => {
    const { store } = buildResidentComplianceStore();
    const manual = createManualViolation(
      store,
      ACTOR,
      {
        ruleType: "chores",
        severity: "VIOLATION",
        reasonSummary: "Chore escalation for testing.",
      },
      "2026-03-11T10:00:00-06:00",
    );
    const createdViolation = manual.violation!;
    const corrective = addCorrectiveActionToViolation(
      manual.store,
      ACTOR,
      createdViolation.id,
      {
        actionType: "MAKE_UP_CHORE",
        dueAt: "2026-03-12",
        notes: "Complete kitchen deep clean.",
      },
      "2026-03-11T10:05:00-06:00",
    );
    const action = corrective.correctiveAction!;
    const evidence = addEvidenceLink(
      corrective.store,
      ACTOR,
      createdViolation.id,
      {
        linkedCorrectiveActionId: action.id,
        evidenceType: "DOCUMENT",
        assetReference: "file:///documents/makeup-chore-checklist.pdf",
        description: "Checklist signed by manager.",
      },
      "2026-03-11T10:06:00-06:00",
    );

    const updatedViolation = evidence.store.violations.find(
      (entry) => entry.id === createdViolation.id,
    );
    expect(updatedViolation?.correctiveActionIds).toContain(action.id);
    expect(updatedViolation?.evidenceItemIds).toContain(evidence.evidence?.id);
    expect(evidence.store.correctiveActions[0]?.violationId).toBe(createdViolation.id);
    expect(evidence.store.evidenceItems[0]?.linkedCorrectiveActionId).toBe(action.id);
    expect(
      evidence.store.auditLogEntries.some(
        (entry) =>
          entry.entityType === "correctiveAction" &&
          entry.actionTaken === "corrective_action_assigned",
      ),
    ).toBe(true);
    expect(
      evidence.store.auditLogEntries.some(
        (entry) => entry.entityType === "evidenceItem" && entry.actionTaken === "evidence_linked",
      ),
    ).toBe(true);
  });
});

describe("structured sober house chat", () => {
  it("creates one reusable violation-linked direct thread per violation and manager pair", () => {
    const { store, managerContext } = buildChatStore();
    if (!managerContext) {
      throw new Error("manager context should exist");
    }

    const violation = createManualViolation(
      store,
      ACTOR,
      {
        ruleType: "chores",
        severity: "WARNING",
        reasonSummary: "Missed assigned kitchen task.",
      },
      "2026-03-12T10:00:00-06:00",
    );
    const first = ensureDirectThreadForResident(
      violation.store,
      ACTOR,
      {
        managerStaffAssignmentId: managerContext.staffAssignmentId,
        linkedViolationId: violation.violation!.id,
      },
      "2026-03-12T10:05:00-06:00",
    );
    const second = ensureDirectThreadForResident(
      first.store,
      ACTOR,
      {
        managerStaffAssignmentId: managerContext.staffAssignmentId,
        linkedViolationId: violation.violation!.id,
      },
      "2026-03-12T10:06:00-06:00",
    );

    expect(first.thread?.linkedViolationId).toBe(violation.violation?.id ?? null);
    expect(first.store.chatThreads).toHaveLength(1);
    expect(second.store.chatThreads).toHaveLength(1);
    expect(second.thread?.id).toBe(first.thread?.id);
    expect(
      first.store.auditLogEntries.some(
        (entry) =>
          entry.entityType === "chatThread" &&
          entry.entityId === first.thread?.id &&
          entry.actionTaken === "chat_thread_linked_to_violation",
      ),
    ).toBe(true);
  });

  it("limits thread visibility to the participating resident or assigned manager", () => {
    const { store, managerContext } = buildChatStore();
    if (!managerContext) {
      throw new Error("manager context should exist");
    }

    const threadResult = ensureDirectThreadForResident(
      store,
      ACTOR,
      { managerStaffAssignmentId: managerContext.staffAssignmentId },
      "2026-03-12T11:00:00-06:00",
    );
    const residentViewer = {
      kind: "resident" as const,
      userId: store.residentHousingProfile!.linkedUserId,
      residentId: store.residentHousingProfile!.residentId,
      houseId: store.residentHousingProfile!.houseId,
      role: "RESIDENT" as const,
      label: "Taylor Brooks",
    };
    const residentThreads = buildChatThreadSummaries(threadResult.store, residentViewer);
    const outsiderViewer = {
      kind: "manager" as const,
      userId: "staff-assignment:outsider",
      staffAssignmentId: "staff-outsider",
      houseIds: [],
      role: "MANAGER" as const,
      label: "Outside Manager",
    };
    const outsiderThreads = buildChatThreadSummaries(threadResult.store, outsiderViewer);

    expect(residentThreads).toHaveLength(1);
    expect(residentThreads[0]?.thread.id).toBe(threadResult.thread?.id);
    expect(outsiderThreads).toHaveLength(0);
  });

  it("persists read and acknowledgment state transitions for structured messages", () => {
    const { store, managerContext } = buildChatStore();
    if (!managerContext) {
      throw new Error("manager context should exist");
    }

    const threadResult = ensureDirectThreadForResident(
      store,
      ACTOR,
      { managerStaffAssignmentId: managerContext.staffAssignmentId },
      "2026-03-12T12:00:00-06:00",
    );
    const managerSend = sendChatMessage(
      threadResult.store,
      ACTOR,
      managerContext,
      {
        threadId: threadResult.thread!.id,
        messageType: "ACKNOWLEDGMENT_REQUIRED",
        bodyText: "You need to complete one make-up chore tonight.",
      },
      "2026-03-12T12:01:00-06:00",
    );
    const residentViewer = {
      kind: "resident" as const,
      userId: managerSend.store.residentHousingProfile!.linkedUserId,
      residentId: managerSend.store.residentHousingProfile!.residentId,
      houseId: managerSend.store.residentHousingProfile!.houseId,
      role: "RESIDENT" as const,
      label: "Taylor Brooks",
    };
    const markedRead = markThreadRead(
      managerSend.store,
      ACTOR,
      residentViewer,
      threadResult.thread!.id,
      "2026-03-12T12:02:00-06:00",
    );
    const acknowledged = acknowledgeChatMessage(
      markedRead.store,
      ACTOR,
      residentViewer,
      managerSend.message!.id,
      "2026-03-12T12:03:00-06:00",
    );
    const receipt = getChatReceiptForMessageAndUser(
      acknowledged.store,
      managerSend.message!.id,
      residentViewer.userId,
    );

    expect(receipt?.readAt).toBe("2026-03-12T12:02:00-06:00");
    expect(receipt?.acknowledgedAt).toBe("2026-03-12T12:03:00-06:00");
    expect(
      acknowledged.store.auditLogEntries.some(
        (entry) =>
          entry.entityType === "chatMessageReceipt" &&
          entry.actionTaken === "chat_message_acknowledged",
      ),
    ).toBe(true);
  });
});

describe("sober house monthly reports", () => {
  it("builds deterministic monthly windows", () => {
    const window = buildMonthlyWindow("2026-03");

    expect(window.periodStart).toBe("2026-03-01T07:00:00.000Z");
    expect(window.periodEnd).toBe("2026-04-01T06:00:00.000Z");
    expect(window.label).toContain("2026");
  });

  it("computes KPI and wins data from persisted sober-house records", () => {
    const { store, attendanceRecords, meetingAttendanceLogs } = buildReportingStore();
    const computation = computeResidentMonthlyKpis({
      store,
      monthKey: "2026-03",
      attendanceRecords,
      meetingAttendanceLogs,
    });
    const wins = computeResidentMonthlyWins(computation);

    expect(computation?.choreCompletionRate.numerator).toBe(2);
    expect(computation?.jobSearchCompletionRate.numerator).toBeGreaterThanOrEqual(1);
    expect(computation?.acknowledgmentRequiredMessages).toBe(1);
    expect(computation?.acknowledgmentCompletionRate.value).toBe(1);
    expect(wins.some((win) => win.id === "prompt-acknowledgments")).toBe(true);
    expect(wins.some((win) => win.id === "corrective-actions-on-time")).toBe(true);
  });

  it("generates stable resident and house monthly report snapshots", () => {
    const { store, attendanceRecords, meetingAttendanceLogs, houseId } = buildReportingStore();
    const residentResult = generateResidentMonthlyReport({
      store,
      actor: ACTOR,
      monthKey: "2026-03",
      attendanceRecords,
      meetingAttendanceLogs,
      timestamp: "2026-03-31T22:00:00-06:00",
    });
    const houseResult = generateHouseMonthlyReport({
      store: residentResult.store,
      actor: ACTOR,
      houseId,
      monthKey: "2026-03",
      attendanceRecords,
      meetingAttendanceLogs,
      timestamp: "2026-03-31T22:05:00-06:00",
    });

    const residentSnapshot = residentResult.report?.summaryPayload;
    const houseSnapshot = houseResult.report?.summaryPayload;

    expect(residentSnapshot?.reportKind).toBe("resident_monthly");
    expect(
      residentSnapshot?.reportKind === "resident_monthly"
        ? residentSnapshot.communicationSummary.acknowledgmentRequiredCount
        : null,
    ).toBe(1);
    expect(
      residentSnapshot?.reportKind === "resident_monthly"
        ? residentSnapshot.correctiveActionSummary.completedCount
        : null,
    ).toBe(1);
    expect(houseSnapshot?.reportKind).toBe("house_monthly");
    expect(
      houseSnapshot?.reportKind === "house_monthly" ? houseSnapshot.kpis.totalViolations : null,
    ).toBe(1);
    expect(
      houseResult.store.auditLogEntries.some(
        (entry) =>
          entry.entityType === "monthlyReport" && entry.actionTaken === "monthly_report_generated",
      ),
    ).toBe(true);
  });

  it("enforces resident-vs-manager report history boundaries", () => {
    const { store, attendanceRecords, meetingAttendanceLogs, houseId, residentId } =
      buildReportingStore();
    const residentReport = generateResidentMonthlyReport({
      store,
      actor: ACTOR,
      monthKey: "2026-03",
      attendanceRecords,
      meetingAttendanceLogs,
      timestamp: "2026-03-31T22:10:00-06:00",
    });
    const houseReport = generateHouseMonthlyReport({
      store: residentReport.store,
      actor: ACTOR,
      houseId,
      monthKey: "2026-03",
      attendanceRecords,
      meetingAttendanceLogs,
      timestamp: "2026-03-31T22:15:00-06:00",
    });

    const residentVisible = listMonthlyReportsForViewer(houseReport.store, {
      kind: "resident",
      residentId,
    });
    const managerVisible = listMonthlyReportsForViewer(houseReport.store, {
      kind: "manager",
      houseId,
    });

    expect(residentVisible).toHaveLength(1);
    expect(residentVisible[0]?.type).toBe("RESIDENT_MONTHLY");
    expect(managerVisible).toHaveLength(2);
  });

  it("locks final notes after approval and records workflow audits", () => {
    const { store, attendanceRecords, meetingAttendanceLogs } = buildReportingStore();
    const generated = generateResidentMonthlyReport({
      store,
      actor: ACTOR,
      monthKey: "2026-03",
      attendanceRecords,
      meetingAttendanceLogs,
      timestamp: "2026-03-31T22:20:00-06:00",
    });
    const report = generated.report;
    expect(report).not.toBeNull();

    const noted = updateMonthlyReportFinalNotes(
      generated.store,
      ACTOR,
      report!.id,
      {
        monthlySummary: "Resident showed consistent follow-through.",
        progressSummary: "Improved communication and meeting consistency.",
      },
      "2026-03-31T22:21:00-06:00",
    );
    expect(noted.auditCount).toBeGreaterThan(0);

    const inReview = transitionMonthlyReportStatus(
      noted.store,
      ACTOR,
      report!.id,
      "IN_REVIEW",
      "2026-03-31T22:22:00-06:00",
    );
    const approved = transitionMonthlyReportStatus(
      inReview.store,
      ACTOR,
      report!.id,
      "APPROVED",
      "2026-03-31T22:23:00-06:00",
    );
    const approvedReport = approved.report;

    expect(approvedReport?.status).toBe("APPROVED");
    expect(approvedReport?.lockedAt).toBe("2026-03-31T22:23:00-06:00");
    expect(
      approved.store.auditLogEntries.some(
        (entry) =>
          entry.entityType === "monthlyReport" &&
          entry.actionTaken === "monthly_report_entered_review",
      ),
    ).toBe(true);
    expect(
      approved.store.auditLogEntries.some(
        (entry) =>
          entry.entityType === "monthlyReport" && entry.actionTaken === "monthly_report_approved",
      ),
    ).toBe(true);

    const blockedEdit = updateMonthlyReportFinalNotes(
      approved.store,
      ACTOR,
      report!.id,
      { monthlySummary: "This should not overwrite the locked snapshot." },
      "2026-03-31T22:24:00-06:00",
    );

    expect(blockedEdit.auditCount).toBe(0);
    expect(
      approvedReport?.summaryPayload.reportKind === "resident_monthly"
        ? approvedReport.summaryPayload.notesSection.monthlySummary
        : null,
    ).toBe("Resident showed consistent follow-through.");
  });

  it("prevents resident actors from changing report workflow state", () => {
    const { store, attendanceRecords, meetingAttendanceLogs, residentViewer } =
      buildReportingStore();
    const generated = generateResidentMonthlyReport({
      store,
      actor: ACTOR,
      monthKey: "2026-03",
      attendanceRecords,
      meetingAttendanceLogs,
      timestamp: "2026-03-31T22:25:00-06:00",
    });
    const report = generated.report;
    expect(report).not.toBeNull();

    const residentActor = {
      id: residentViewer.userId,
      name: residentViewer.label,
    };
    const residentAttempt = transitionMonthlyReportStatus(
      generated.store,
      residentActor,
      report!.id,
      "APPROVED",
      "2026-03-31T22:26:00-06:00",
    );

    expect(residentAttempt.auditCount).toBe(0);
    expect(residentAttempt.report?.status).toBe("GENERATED");
  });

  it("versions regenerated reports instead of mutating finalized history", () => {
    const { store, attendanceRecords, meetingAttendanceLogs } = buildReportingStore();
    const first = generateResidentMonthlyReport({
      store,
      actor: ACTOR,
      monthKey: "2026-03",
      attendanceRecords,
      meetingAttendanceLogs,
      timestamp: "2026-03-31T22:30:00-06:00",
    });
    const withNotes = updateMonthlyReportFinalNotes(
      first.store,
      ACTOR,
      first.report!.id,
      { monthlySummary: "Version one summary." },
      "2026-03-31T22:31:00-06:00",
    );
    const approved = transitionMonthlyReportStatus(
      withNotes.store,
      ACTOR,
      first.report!.id,
      "APPROVED",
      "2026-03-31T22:32:00-06:00",
    );

    const regenerated = generateResidentMonthlyReport({
      store: approved.store,
      actor: ACTOR,
      monthKey: "2026-03",
      attendanceRecords,
      meetingAttendanceLogs,
      timestamp: "2026-03-31T22:33:00-06:00",
    });

    const sameScopeReports = regenerated.store.monthlyReports
      .filter(
        (entry) =>
          entry.type === "RESIDENT_MONTHLY" &&
          entry.periodStart === first.report?.periodStart &&
          entry.periodEnd === first.report?.periodEnd,
      )
      .sort((left, right) => left.versionNumber - right.versionNumber);

    expect(sameScopeReports).toHaveLength(2);
    expect(sameScopeReports[0]?.status).toBe("APPROVED");
    expect(sameScopeReports[0]?.isCurrentVersion).toBe(false);
    expect(sameScopeReports[1]?.versionNumber).toBe(2);
    expect(sameScopeReports[1]?.isCurrentVersion).toBe(true);
    expect(sameScopeReports[1]?.supersedesReportId).toBe(sameScopeReports[0]?.id ?? null);
    expect(
      sameScopeReports[0]?.summaryPayload.reportKind === "resident_monthly"
        ? sameScopeReports[0].summaryPayload.notesSection.monthlySummary
        : null,
    ).toBe("Version one summary.");
  });

  it("builds resident and house export markup from stored snapshots and records export metadata", () => {
    const { store, attendanceRecords, meetingAttendanceLogs, houseId } = buildReportingStore();
    const residentGenerated = generateResidentMonthlyReport({
      store,
      actor: ACTOR,
      monthKey: "2026-03",
      attendanceRecords,
      meetingAttendanceLogs,
      timestamp: "2026-03-31T22:35:00-06:00",
    });
    const residentNoted = updateMonthlyReportFinalNotes(
      residentGenerated.store,
      ACTOR,
      residentGenerated.report!.id,
      {
        monthlySummary: "Resident report export note.",
        encouragementStrengths: "Stayed responsive to house guidance.",
      },
      "2026-03-31T22:36:00-06:00",
    );
    const residentApproved = transitionMonthlyReportStatus(
      residentNoted.store,
      ACTOR,
      residentGenerated.report!.id,
      "APPROVED",
      "2026-03-31T22:37:00-06:00",
    );
    const residentHtml = buildSoberHouseMonthlyReportPdfHtml(residentApproved.report!);

    expect(residentHtml).toContain("Resident report export note.");
    expect(residentHtml).toContain("Workflow Metadata");
    expect(residentHtml).toContain("APPROVED");

    const exported = markMonthlyReportExported(
      residentApproved.store,
      ACTOR,
      residentGenerated.report!.id,
      "file:///documents/reports/resident-march-2026.pdf",
      "2026-03-31T22:38:00-06:00",
    );

    expect(exported.report?.status).toBe("EXPORTED");
    expect(exported.report?.exportHistory).toHaveLength(1);
    expect(exported.report?.exportHistory[0]?.exportRef).toBe(
      "file:///documents/reports/resident-march-2026.pdf",
    );
    expect(
      exported.store.auditLogEntries.some(
        (entry) =>
          entry.entityType === "monthlyReport" && entry.actionTaken === "monthly_report_exported",
      ),
    ).toBe(true);

    const houseGenerated = generateHouseMonthlyReport({
      store: exported.store,
      actor: ACTOR,
      houseId,
      monthKey: "2026-03",
      attendanceRecords,
      meetingAttendanceLogs,
      timestamp: "2026-03-31T22:39:00-06:00",
    });
    const houseNoted = updateMonthlyReportFinalNotes(
      houseGenerated.store,
      ACTOR,
      houseGenerated.report!.id,
      {
        monthlySummary: "House report export note.",
        operationalConcerns: "Weekend staffing remained tight.",
      },
      "2026-03-31T22:40:00-06:00",
    );
    const houseApproved = transitionMonthlyReportStatus(
      houseNoted.store,
      ACTOR,
      houseGenerated.report!.id,
      "APPROVED",
      "2026-03-31T22:41:00-06:00",
    );
    const houseHtml = buildSoberHouseMonthlyReportPdfHtml(houseApproved.report!);

    expect(houseHtml).toContain("House report export note.");
    expect(houseHtml).toContain("Operations Summary");
    expect(houseHtml).toContain("Workflow Metadata");
  });

  it("hides sober-house resident dashboard tiles for recovery-only users", () => {
    const { store } = buildResidentComplianceStore();
    const summary = buildSoberHouseResidentDashboardSummary({
      store,
      nowIso: "2026-03-10T10:00:00-06:00",
      attendanceRecords: [],
      meetingAttendanceLogs: [],
      sponsorCallLogs: [],
      complianceSummary: null,
      upcomingMeetings: [],
    });

    expect(summary.visibility.eligible).toBe(false);
    expect(summary.tiles).toHaveLength(0);
  });

  it("shows resident dashboard tile visibility from role and house config", () => {
    const base = buildResidentComplianceStore();
    const store = upsertUserAccessProfile(
      base.store,
      ACTOR,
      {
        linkedUserId: base.linkedUserId,
        role: "HOUSE_RESIDENT",
        organizationId: base.store.organization?.id ?? null,
        houseId: base.houseId,
        houseGroupId: null,
        status: "ACTIVE",
      },
      "2026-03-10T09:00:00-06:00",
    ).store;

    const summary = buildSoberHouseResidentDashboardSummary({
      store,
      nowIso: "2026-03-10T10:00:00-06:00",
      attendanceRecords: [],
      meetingAttendanceLogs: [],
      sponsorCallLogs: [],
      complianceSummary: null,
      upcomingMeetings: [
        {
          id: "meeting-a",
          name: "Noon AA",
          address: "123 Main St",
          startsAtLocal: "12:00",
          distanceMeters: 800,
          format: "IN_PERSON",
        },
      ],
    });

    expect(summary.visibility).toEqual({
      eligible: true,
      showRequirementsTile: true,
      showChoreTile: true,
      showWeeklyMeetingTile: true,
      showSponsorContactTile: false,
      showJobApplicationsTile: true,
      showHouseMeetingsTile: false,
      showOneOnOneTile: false,
      showHouseAlertsTile: false,
      showComplianceSnapshotTile: true,
      showHouseScheduleTile: true,
    });
    expect(summary.tiles.map((tile) => tile.id)).toEqual(
      expect.arrayContaining(["sober-house-requirements"]),
    );
    expect(summary.requirementsTile.title).toBe("Sober House Routine");
    expect(summary.requirementsTile.value).toBe("0%");
    expect(summary.requirementsTile.subtitle).toContain("3 open");
  });

  it("builds a locked sober-house routine from effective resident rules", () => {
    const base = buildResidentComplianceStore();
    const residentStore = upsertUserAccessProfile(
      base.store,
      ACTOR,
      {
        linkedUserId: base.linkedUserId,
        role: "HOUSE_RESIDENT",
        organizationId: base.store.organization?.id ?? null,
        houseId: base.houseId,
        houseGroupId: null,
        status: "ACTIVE",
      },
      "2026-03-10T09:00:00-06:00",
    ).store;

    const routine = buildSoberHouseRoutineSummary({
      store: residentStore,
      nowIso: "2026-03-10T10:00:00-06:00",
      attendanceRecords: [],
      meetingAttendanceLogs: [],
      sponsorCallLogs: [],
    });

    expect(routine).not.toBeNull();
    expect(routine?.percentComplete).toBe(0);
    expect(routine?.openRequiredCount).toBe(3);
    expect(routine?.overdueCount).toBe(0);
    expect(routine?.tasks.map((task) => task.kind)).toEqual(
      expect.arrayContaining(["meetings", "chores", "job_applications", "curfew"]),
    );
    expect(routine?.tasks.every((task) => task.locked)).toBe(true);
    expect(routine?.tasks.find((task) => task.kind === "chores")).toMatchObject({
      requiresProof: true,
      actionLabel: "Complete with photo",
      countsTowardProgress: true,
    });
    expect(routine?.tasks.find((task) => task.kind === "curfew")?.countsTowardProgress).toBe(false);
  });

  it("stores multiple sober-house routine proof photos as resident-linked evidence", () => {
    const base = buildResidentComplianceStore();
    const residentStore = upsertUserAccessProfile(
      base.store,
      ACTOR,
      {
        linkedUserId: base.linkedUserId,
        role: "HOUSE_RESIDENT",
        organizationId: base.store.organization?.id ?? null,
        houseId: base.houseId,
        houseGroupId: null,
        status: "ACTIVE",
      },
      "2026-03-10T09:00:00-06:00",
    ).store;

    const routine = buildSoberHouseRoutineSummary({
      store: residentStore,
      nowIso: "2026-03-10T10:00:00-06:00",
      attendanceRecords: [],
      meetingAttendanceLogs: [],
      sponsorCallLogs: [],
    });
    const choreTask = routine?.tasks.find((task) => task.kind === "chores");

    expect(choreTask).toBeTruthy();

    const nextStore = attachSoberHouseRoutineProof({
      store: residentStore,
      actor: ACTOR,
      housingProfile: residentStore.residentHousingProfile!,
      task: choreTask!,
      proofUris: ["file:///proofs/chore-1.jpg", "file:///proofs/chore-2.jpg"],
      timestamp: "2026-03-10T10:05:00-06:00",
      completionRecordId: "chore-completion-test",
      completionRecordType: "CHORE",
    });

    expect(nextStore.evidenceItems).toHaveLength(2);
    expect(nextStore.evidenceItems[0]).toMatchObject({
      residentId: residentStore.residentHousingProfile?.residentId,
      linkedUserId: base.linkedUserId,
      organizationId: base.store.organization?.id ?? null,
      houseId: base.houseId,
      evidenceType: "PHOTO",
      assetReference: "file:///proofs/chore-2.jpg",
    });
    expect(nextStore.evidenceItems[0]?.metadata).toMatchObject({
      completionRecordId: "chore-completion-test",
      completionRecordType: "CHORE",
      routineTaskKind: "chores",
    });
    expect(nextStore.evidenceItems[1]?.assetReference).toBe("file:///proofs/chore-1.jpg");
  });

  it("keeps chore routine progress pending until manager confirmation is satisfied", () => {
    const base = buildResidentComplianceStore();
    const configuredStore = upsertHouseRuleSet(
      base.store,
      ACTOR,
      {
        ...base.store.houseRuleSets[0]!,
        chores: {
          ...base.store.houseRuleSets[0]!.chores,
          proofRequirement: ["PHOTO", "MANAGER_CONFIRMATION"],
        },
      },
      "2026-03-10T08:30:00-06:00",
    ).store;
    let residentStore = upsertUserAccessProfile(
      configuredStore,
      ACTOR,
      {
        linkedUserId: base.linkedUserId,
        role: "HOUSE_RESIDENT",
        organizationId: configuredStore.organization?.id ?? null,
        houseId: base.houseId,
        houseGroupId: null,
        status: "ACTIVE",
      },
      "2026-03-10T09:00:00-06:00",
    ).store;

    residentStore = upsertChoreCompletionRecord(
      residentStore,
      ACTOR,
      {
        residentId: base.residentId,
        linkedUserId: base.linkedUserId,
        organizationId: residentStore.organization?.id ?? null,
        houseId: base.houseId,
        houseChoreId: null,
        completedAt: "2026-03-10T10:05:00-06:00",
        proofRequirement: ["PHOTO", "MANAGER_CONFIRMATION"],
        proofProvided: true,
        proofReference: "file:///proofs/chore-proof.jpg",
        managerConfirmationRequired: true,
        managerConfirmationStatus: "PENDING",
        managerConfirmationRequestedAt: "2026-03-10T10:06:00-06:00",
        managerConfirmationRequestedVia: "SHARE_SHEET",
        managerConfirmedAt: null,
        notes: "Kitchen cleanup submitted.",
      },
      "2026-03-10T10:06:00-06:00",
    ).store;

    const routine = buildSoberHouseRoutineSummary({
      store: residentStore,
      nowIso: "2026-03-10T10:10:00-06:00",
      attendanceRecords: [],
      meetingAttendanceLogs: [],
      sponsorCallLogs: [],
    });
    const choreTask = routine?.tasks.find((task) => task.kind === "chores");

    expect(choreTask).toMatchObject({
      status: "pending",
      statusLabel: "Awaiting manager",
      proofMode: "PHOTO_MANAGER_CONFIRMATION",
      managerConfirmationRequired: true,
      completedCount: 0,
    });
    expect(routine?.completedRequiredCount).toBe(0);
  });

  it("prefills the resident wizard from persisted profiles when an unrelated stale draft exists", () => {
    const base = buildResidentComplianceStore();
    const store = saveResidentWizardDraft(base.store, {
      ...createDefaultResidentWizardDraft("someone-else"),
      firstName: "Wrong",
      lastName: "Resident",
      assignedHouseId: null,
      moveInDate: "2026-02-01",
    });

    const draft = createResidentWizardDraftFromProfiles(base.linkedUserId, store);

    expect(draft.firstName).toBe("Taylor");
    expect(draft.lastName).toBe("Brooks");
    expect(draft.assignedHouseId).toBe(base.houseId);
    expect(draft.emergencyContactName).toBe("Jamie Brooks");
    expect(draft.programPhaseOnEntry).toBe("Phase 1");
  });

  it("marks resident setup incomplete until required sober-house fields are actually finished", () => {
    const base = buildResidentComplianceStore();
    const residentStore = upsertUserAccessProfile(
      base.store,
      ACTOR,
      {
        linkedUserId: base.linkedUserId,
        role: "HOUSE_RESIDENT",
        organizationId: base.store.organization?.id ?? null,
        houseId: base.houseId,
        houseGroupId: null,
        status: "ACTIVE",
      },
      "2026-03-10T09:20:00-06:00",
    ).store;
    const incompleteStore = upsertResidentConsentRecord(
      residentStore,
      ACTOR,
      {
        ...residentStore.residentConsentRecord!,
        signatureRef: null,
        signedAt: null,
      },
      "2026-03-10T09:30:00-06:00",
    ).store;

    const setupState = getResidentSetupState(incompleteStore, "enduser-a1");
    const summary = buildSoberHouseResidentDashboardSummary({
      store: incompleteStore,
      nowIso: "2026-03-10T10:00:00-06:00",
      attendanceRecords: [],
      meetingAttendanceLogs: [],
      sponsorCallLogs: [],
      complianceSummary: null,
      upcomingMeetings: [],
    });

    expect(setupState.complete).toBe(false);
    expect(setupState.missingItems).toContain("signed resident consent");
    expect(setupState.nextStep).toBe(8);
    expect(summary.visibility.eligible).toBe(true);
    expect(summary.visibility.showWeeklyMeetingTile).toBe(true);
    expect(summary.tiles.length).toBeGreaterThan(0);
  });

  it("hides chore and weekly meeting tiles when house config disables them", () => {
    const base = buildResidentComplianceStore();
    const residentStore = upsertUserAccessProfile(
      base.store,
      ACTOR,
      {
        linkedUserId: base.linkedUserId,
        role: "HOUSE_RESIDENT",
        organizationId: base.store.organization?.id ?? null,
        houseId: base.houseId,
        houseGroupId: null,
        status: "ACTIVE",
      },
      "2026-03-10T09:10:00-06:00",
    ).store;
    const ruleSet = getRuleSetForHouse(residentStore, base.houseId, "2026-03-10T09:10:00-06:00");
    const updatedStore = upsertHouseRuleSet(
      residentStore,
      ACTOR,
      {
        ...ruleSet,
        chores: { ...ruleSet.chores, enabled: false },
        meetings: { ...ruleSet.meetings, meetingsRequired: false, meetingsPerWeek: 0 },
      },
      "2026-03-10T09:11:00-06:00",
    ).store;
    const residentRequirements = updatedStore.residentRequirementProfile!;
    const noMeetingRequirementStore = upsertResidentRequirementProfile(
      updatedStore,
      ACTOR,
      {
        ...residentRequirements,
        meetingsRequiredWeekly: false,
        meetingsRequiredCount: 0,
      },
      "2026-03-10T09:12:00-06:00",
    ).store;

    const summary = buildSoberHouseResidentDashboardSummary({
      store: noMeetingRequirementStore,
      nowIso: "2026-03-10T10:00:00-06:00",
      attendanceRecords: [],
      meetingAttendanceLogs: [],
      sponsorCallLogs: [],
      complianceSummary: null,
      upcomingMeetings: [],
    });

    expect(summary.visibility.showChoreTile).toBe(false);
    expect(summary.visibility.showWeeklyMeetingTile).toBe(false);
  });

  it("computes the chore dashboard tile from persisted completion data", () => {
    const base = buildResidentComplianceStore();
    let store = upsertUserAccessProfile(
      base.store,
      ACTOR,
      {
        linkedUserId: base.linkedUserId,
        role: "HOUSE_RESIDENT",
        organizationId: base.store.organization?.id ?? null,
        houseId: base.houseId,
        houseGroupId: null,
        status: "ACTIVE",
      },
      "2026-03-10T08:00:00-06:00",
    ).store;

    store = upsertChoreCompletionRecord(
      store,
      ACTOR,
      {
        residentId: base.residentId,
        linkedUserId: base.linkedUserId,
        organizationId: store.organization?.id ?? null,
        houseId: base.houseId,
        houseChoreId: null,
        completedAt: "2026-03-10T17:20:00-06:00",
        proofRequirement: ["PHOTO"],
        proofProvided: true,
        proofReference: "file:///tmp/chore-proof.jpg",
        notes: "Kitchen chore done.",
      },
      "2026-03-10T17:21:00-06:00",
    ).store;

    const summary = buildSoberHouseResidentDashboardSummary({
      store,
      nowIso: "2026-03-10T17:30:00-06:00",
      attendanceRecords: [],
      meetingAttendanceLogs: [],
      sponsorCallLogs: [],
      complianceSummary: null,
      upcomingMeetings: [],
    });

    expect(summary.choreTile.visible).toBe(true);
    expect(summary.choreTile.value).toBe("1/1");
    expect(summary.choreTile.tone).toBe("green");
    expect(summary.choreTile.badgeLabel).toBe("All complete");
  });

  it("wires explicit house chores, meetings, one-on-ones, alerts, and compliance snapshot into the resident dashboard", () => {
    const base = buildChatStore();
    let store = upsertUserAccessProfile(
      base.store,
      ACTOR,
      {
        linkedUserId: base.linkedUserId,
        role: "HOUSE_RESIDENT",
        organizationId: base.store.organization?.id ?? null,
        houseId: base.houseId,
        houseGroupId: null,
        status: "ACTIVE",
      },
      "2026-03-10T08:00:00-06:00",
    ).store;

    store = upsertResidentHouseMembership(
      store,
      ACTOR,
      {
        residentId: base.residentId,
        linkedUserId: base.linkedUserId,
        organizationId: store.organization?.id ?? null,
        houseId: base.houseId,
        roomOrBed: "2B",
        moveInDate: "2026-03-01",
        moveOutDate: null,
        isPrimary: true,
        status: "ACTIVE",
        notes: "Primary membership",
      },
      "2026-03-10T08:01:00-06:00",
    ).store;

    const recurringObligationId = upsertRecurringObligation(
      store,
      ACTOR,
      {
        organizationId: store.organization?.id ?? null,
        scopeType: "HOUSE",
        houseId: base.houseId,
        houseGroupId: null,
        residentId: base.residentId,
        linkedUserId: base.linkedUserId,
        obligationType: "HOUSE_MEETING",
        title: "Weekly house business",
        detail: "House business and announcements",
        locationLabel: "Maple House",
        frequency: "WEEKLY",
        weekday: "MON",
        weekdayList: ["MON"],
        monthlyOrdinal: null,
        scheduledDate: null,
        timeLocalHhmm: "18:30",
        durationMinutes: 60,
        required: true,
        reminderLeadMinutes: 30,
        inAppReminderEnabled: true,
        addToCalendar: false,
        accountabilityMethod: "ACKNOWLEDGMENT",
        status: "ACTIVE",
      },
      "2026-03-10T08:02:00-06:00",
    ).store.recurringObligations[0]!.id;

    store = upsertHouseRuleSet(
      store,
      ACTOR,
      {
        houseId: base.houseId,
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
          defaultReminderLeadMinutes: 20,
          defaultAddToCalendar: false,
          defaultInAppReminders: true,
          requireHouseMeetingAcknowledgment: true,
          requireAnnouncementAcknowledgment: true,
          requireOneOnOneManagerConfirmation: true,
        },
      },
      "2026-03-10T08:03:00-06:00",
    ).store;

    const houseChoreId = upsertHouseChore(
      store,
      ACTOR,
      {
        organizationId: store.organization?.id ?? null,
        houseId: base.houseId,
        residentId: base.residentId,
        linkedUserId: base.linkedUserId,
        recurringObligationId: null,
        title: "Kitchen reset",
        summary: "Reset the kitchen before lights out.",
        frequency: "DAILY",
        dueTimeLocalHhmm: "18:00",
        weekday: null,
        scheduledDate: null,
        required: true,
        proofRequirement: ["PHOTO"],
        reminderLeadMinutes: 30,
        inAppReminderEnabled: true,
        addToCalendar: false,
        accountabilityRequired: true,
        status: "ACTIVE",
      },
      "2026-03-10T08:04:00-06:00",
    ).store.houseChores[0]!.id;

    store = upsertHouseMeeting(
      store,
      ACTOR,
      {
        organizationId: store.organization?.id ?? null,
        houseId: base.houseId,
        recurringObligationId,
        title: "Monday house meeting",
        description: "Review weekly expectations.",
        meetingKind: "HOUSE_MEETING",
        locationLabel: "Main living room",
        startsAt: "2026-03-10T19:00:00-06:00",
        endsAt: "2026-03-10T20:00:00-06:00",
        required: true,
        reminderLeadMinutes: 30,
        inAppReminderEnabled: true,
        addToCalendar: false,
        acknowledgmentRequired: true,
        status: "ACTIVE",
      },
      "2026-03-10T08:05:00-06:00",
    ).store;

    store = upsertOneOnOneSession(
      store,
      ACTOR,
      {
        organizationId: store.organization?.id ?? null,
        houseId: base.houseId,
        residentId: base.residentId,
        linkedUserId: base.linkedUserId,
        staffAssignmentId: base.managerContext?.staffAssignmentId ?? null,
        recurringObligationId: null,
        title: "Manager one-on-one",
        notes: "Weekly resident check-in.",
        scheduledAt: "2026-03-10T16:00:00-06:00",
        endsAt: "2026-03-10T16:30:00-06:00",
        required: true,
        reminderLeadMinutes: 15,
        inAppReminderEnabled: true,
        addToCalendar: false,
        managerConfirmationRequired: true,
        completionStatus: "SCHEDULED",
        completedAt: null,
        completedByStaffAssignmentId: null,
        excusedAt: null,
        excusedReason: null,
        status: "ACTIVE",
      },
      "2026-03-10T08:06:00-06:00",
    ).store;

    store = upsertHouseAlertAnnouncement(
      store,
      ACTOR,
      {
        organizationId: store.organization?.id ?? null,
        houseId: base.houseId,
        recurringObligationId: null,
        title: "Medication check-in tonight",
        body: "Residents need to check in with staff before curfew.",
        severity: "ACTION_REQUIRED",
        startsAt: "2026-03-10T12:00:00-06:00",
        endsAt: "2026-03-10T23:00:00-06:00",
        reminderLeadMinutes: 60,
        inAppReminderEnabled: true,
        addToCalendar: false,
        acknowledgmentRequired: true,
        status: "ACTIVE",
      },
      "2026-03-10T08:07:00-06:00",
    ).store;

    store = upsertChoreCompletionRecord(
      store,
      ACTOR,
      {
        residentId: base.residentId,
        linkedUserId: base.linkedUserId,
        organizationId: store.organization?.id ?? null,
        houseId: base.houseId,
        houseChoreId,
        completedAt: "2026-03-10T17:20:00-06:00",
        proofRequirement: ["PHOTO"],
        proofProvided: true,
        proofReference: "file:///tmp/chore-proof.jpg",
        notes: "Kitchen reset done.",
      },
      "2026-03-10T17:21:00-06:00",
    ).store;

    const complianceSummary = evaluateResidentCompliance({
      store,
      nowIso: "2026-03-10T13:00:00-06:00",
      currentLocation: null,
      attendanceRecords: [],
      meetingAttendanceLogs: [],
    });

    const summary = buildSoberHouseResidentDashboardSummary({
      store,
      nowIso: "2026-03-10T13:00:00-06:00",
      attendanceRecords: [],
      meetingAttendanceLogs: [],
      sponsorCallLogs: [],
      complianceSummary,
      upcomingMeetings: [],
    });

    expect(summary.visibility.showHouseMeetingsTile).toBe(true);
    expect(summary.visibility.showOneOnOneTile).toBe(true);
    expect(summary.visibility.showHouseAlertsTile).toBe(true);
    expect(summary.visibility.showComplianceSnapshotTile).toBe(true);
    expect(summary.houseMeetingsTile.subtitle).toBe("Monday house meeting");
    expect(summary.oneOnOneTile.subtitle).toBe("Manager one-on-one");
    expect(summary.houseAlertsTile.subtitle).toBe("Medication check-in tonight");
    expect(summary.complianceSnapshotTile.visible).toBe(true);
    expect(summary.tiles.map((tile) => tile.id)).toEqual(
      expect.arrayContaining([
        "sober-house-requirements",
        "chores",
        "weekly-meetings",
        "house-meetings",
        "one-on-ones",
      ]),
    );
    expect(summary.tiles.map((tile) => tile.id)).not.toEqual(
      expect.arrayContaining(["house-alerts", "compliance-snapshot"]),
    );
  });

  it("computes the weekly meeting dashboard tile from persisted attendance", () => {
    const base = buildResidentComplianceStore();
    const store = upsertUserAccessProfile(
      base.store,
      ACTOR,
      {
        linkedUserId: base.linkedUserId,
        role: "HOUSE_RESIDENT",
        organizationId: base.store.organization?.id ?? null,
        houseId: base.houseId,
        houseGroupId: null,
        status: "ACTIVE",
      },
      "2026-03-12T08:00:00-06:00",
    ).store;

    const summary = buildSoberHouseResidentDashboardSummary({
      store,
      nowIso: "2026-03-12T10:00:00-06:00",
      attendanceRecords: [
        { id: "att-1", meetingId: "m1", startAt: "2026-03-10T08:00:00-06:00" },
        { id: "att-2", meetingId: "m2", startAt: "2026-03-11T08:00:00-06:00" },
        { id: "att-3", meetingId: "m3", startAt: "2026-03-12T08:00:00-06:00" },
      ],
      meetingAttendanceLogs: [],
      sponsorCallLogs: [],
      complianceSummary: null,
      upcomingMeetings: [
        {
          id: "meeting-next",
          name: "Thursday Night AA",
          address: "123 Main St",
          startsAtLocal: "19:00",
          distanceMeters: 900,
          format: "IN_PERSON",
        },
      ],
    });

    expect(summary.weeklyMeetingTile.visible).toBe(true);
    expect(summary.weeklyMeetingTile.value).toBe("3/5");
    expect(summary.weeklyMeetingTile.subtitle).toContain("2 meetings remaining");
    expect(summary.weeklyMeetingTile.detail).toContain("Thursday Night AA");
  });

  it("shows sponsor setup needed when sponsor contact is required but not configured yet", () => {
    const base = buildResidentComplianceStore();
    let store = upsertUserAccessProfile(
      base.store,
      ACTOR,
      {
        linkedUserId: base.linkedUserId,
        role: "HOUSE_RESIDENT",
        organizationId: base.store.organization?.id ?? null,
        houseId: base.houseId,
        houseGroupId: null,
        status: "ACTIVE",
      },
      "2026-03-12T08:00:00-06:00",
    ).store;

    store = upsertHouseRuleSet(
      store,
      ACTOR,
      {
        ...getRuleSetForHouse(store, base.houseId, "2026-03-12T08:00:00-06:00"),
        scopeType: "HOUSE",
        houseId: base.houseId,
        houseGroupId: null,
        sponsorContact: {
          enabled: true,
          contactsRequiredPerWeek: 3,
          proofType: "CALL_LOG",
        },
      },
      "2026-03-12T08:05:00-06:00",
    ).store;

    const summary = buildSoberHouseResidentDashboardSummary({
      store,
      nowIso: "2026-03-12T10:00:00-06:00",
      attendanceRecords: [],
      meetingAttendanceLogs: [],
      sponsorCallLogs: [],
      complianceSummary: null,
      upcomingMeetings: [],
    });

    expect(summary.sponsorContactTile.visible).toBe(true);
    expect(summary.sponsorContactTile.value).toBe("Setup");
    expect(summary.sponsorContactTile.badgeLabel).toBe("Setup needed");
    expect(summary.sponsorContactTile.subtitle).toContain("Sponsor details");
  });

  it("shows sponsor contact progress from effective sober-house rules", () => {
    const base = buildResidentComplianceStore();
    let store = upsertUserAccessProfile(
      base.store,
      ACTOR,
      {
        linkedUserId: base.linkedUserId,
        role: "HOUSE_RESIDENT",
        organizationId: base.store.organization?.id ?? null,
        houseId: base.houseId,
        houseGroupId: null,
        status: "ACTIVE",
      },
      "2026-03-12T08:00:00-06:00",
    ).store;

    store = upsertHouseRuleSet(
      store,
      ACTOR,
      {
        ...getRuleSetForHouse(store, base.houseId, "2026-03-12T08:00:00-06:00"),
        scopeType: "HOUSE",
        houseId: base.houseId,
        houseGroupId: null,
        sponsorContact: {
          enabled: true,
          contactsRequiredPerWeek: 3,
          proofType: "CALL_LOG",
        },
      },
      "2026-03-12T08:05:00-06:00",
    ).store;
    store = upsertResidentRequirementProfile(
      store,
      ACTOR,
      {
        ...store.residentRequirementProfile!,
        sponsorPresent: true,
        sponsorName: "Sam Sponsor",
        sponsorPhone: "(555) 555-3131",
        sponsorContactFrequency: "3 per week",
      },
      "2026-03-12T08:06:00-06:00",
    ).store;

    const summary = buildSoberHouseResidentDashboardSummary({
      store,
      nowIso: "2026-03-12T10:00:00-06:00",
      attendanceRecords: [],
      meetingAttendanceLogs: [],
      sponsorCallLogs: [
        { id: "s1", atIso: "2026-03-10T08:00:00-06:00", success: true },
        { id: "s2", atIso: "2026-03-11T08:00:00-06:00", success: true },
      ],
      complianceSummary: null,
      upcomingMeetings: [],
    });

    expect(summary.sponsorContactTile.visible).toBe(true);
    expect(summary.sponsorContactTile.value).toBe("2/3");
    expect(summary.sponsorContactTile.subtitle).toContain("1 sponsor call");
  });

  it("tracks scheduled house meetings against resident attendance", () => {
    const base = buildResidentComplianceStore();
    let store = upsertUserAccessProfile(
      base.store,
      ACTOR,
      {
        linkedUserId: base.linkedUserId,
        role: "HOUSE_RESIDENT",
        organizationId: base.store.organization?.id ?? null,
        houseId: base.houseId,
        houseGroupId: null,
        status: "ACTIVE",
      },
      "2026-03-10T08:00:00.000Z",
    ).store;

    const recurringResult = upsertRecurringObligation(
      store,
      ACTOR,
      {
        organizationId: store.organization?.id ?? null,
        scopeType: "HOUSE",
        houseId: base.houseId,
        houseGroupId: null,
        residentId: null,
        linkedUserId: null,
        obligationType: "HOUSE_MEETING",
        title: "Wednesday house meeting",
        detail: "Weekly accountability review",
        locationLabel: "Maple House common room",
        frequency: "WEEKLY",
        weekday: "WED",
        weekdayList: ["WED"],
        monthlyOrdinal: null,
        scheduledDate: null,
        timeLocalHhmm: "19:00",
        durationMinutes: 60,
        required: true,
        reminderLeadMinutes: 30,
        inAppReminderEnabled: true,
        addToCalendar: true,
        accountabilityMethod: "ACKNOWLEDGMENT",
        status: "ACTIVE",
      },
      "2026-03-10T08:05:00.000Z",
    );
    store = recurringResult.store;
    const scheduledHouseMeeting = getHouseMeetingsInRange(
      store,
      base.houseId,
      "2026-03-09T00:00:00.000Z",
      "2026-03-16T00:00:00.000Z",
    )[0];
    if (!scheduledHouseMeeting) {
      throw new Error("scheduled house meeting should exist");
    }

    store = upsertHouseMeetingAttendanceRecord(
      store,
      ACTOR,
      {
        residentId: base.residentId,
        linkedUserId: base.linkedUserId,
        organizationId: store.organization?.id ?? null,
        houseId: base.houseId,
        houseMeetingId: null,
        recurringObligationId: recurringResult.store.recurringObligations[0]!.id,
        scheduledStartAt: scheduledHouseMeeting.startsAt,
        status: "COMPLETED",
        attendedAt: "2026-03-11T19:05:00.000Z",
        excusedAt: null,
        excusedReason: null,
        proofRequired: false,
        proofProvided: false,
        proofReference: null,
        notes: "Present",
      },
      "2026-03-11T19:05:00.000Z",
    ).store;

    const summary = buildSoberHouseResidentDashboardSummary({
      store,
      nowIso: "2026-03-12T10:00:00.000Z",
      attendanceRecords: [],
      meetingAttendanceLogs: [],
      sponsorCallLogs: [],
      complianceSummary: null,
      upcomingMeetings: [],
    });

    expect(summary.houseMeetingsTile.visible).toBe(true);
    expect(summary.houseMeetingsTile.value).toBe("1/1");
  });

  it("uses pending acknowledgments as the next house schedule obligation", () => {
    const base = buildChatStore();
    if (!base.managerContext) {
      throw new Error("manager context should exist");
    }

    let store = upsertUserAccessProfile(
      base.store,
      ACTOR,
      {
        linkedUserId: base.linkedUserId,
        role: "HOUSE_RESIDENT",
        organizationId: base.store.organization?.id ?? null,
        houseId: base.houseId,
        houseGroupId: null,
        status: "ACTIVE",
      },
      "2026-03-12T07:00:00-06:00",
    ).store;

    const ensured = ensureDirectThreadForResident(
      store,
      ACTOR,
      {
        managerStaffAssignmentId: base.managerContext.staffAssignmentId,
      },
      "2026-03-12T07:05:00-06:00",
    );
    store = ensured.store;

    const sent = sendChatMessage(
      store,
      ACTOR,
      base.managerContext,
      {
        threadId: ensured.thread!.id,
        messageType: "ACKNOWLEDGMENT_REQUIRED",
        bodyText: "Please acknowledge tonight's house meeting update.",
      },
      "2026-03-12T07:10:00-06:00",
    );

    const summary = buildSoberHouseResidentDashboardSummary({
      store: sent.store,
      nowIso: "2026-03-12T08:00:00-06:00",
      attendanceRecords: [],
      meetingAttendanceLogs: [],
      sponsorCallLogs: [],
      complianceSummary: null,
      upcomingMeetings: [],
    });

    expect(summary.houseScheduleTile.visible).toBe(true);
    expect(summary.houseScheduleTile.subtitle).toBe("Acknowledge manager notice");
    expect(summary.houseScheduleTile.badgeLabel).toBe("Ack needed");
  });

  it("shows one-on-one wizard scheduling only when house config or resident requirement makes it applicable", () => {
    const base = buildResidentComplianceStore();
    const draft = createDefaultResidentWizardDraft(base.linkedUserId);

    expect(isOneOnOneApplicable(base.store, draft)).toBe(false);

    const houseRules = getRuleSetForHouse(base.store, base.houseId, "2026-03-14T09:00:00-06:00");
    const configuredStore = upsertHouseRuleSet(
      base.store,
      ACTOR,
      {
        ...houseRules,
        oneOnOne: {
          ...houseRules.oneOnOne,
          enabled: true,
          defaultFrequency: "WEEKLY",
          defaultWeekday: "THU",
          defaultTimeLocalHhmm: "14:00",
        },
      },
      "2026-03-14T09:00:00-06:00",
    ).store;

    expect(
      isOneOnOneApplicable(configuredStore, {
        ...draft,
        assignedHouseId: base.houseId,
      }),
    ).toBe(true);
  });

  it("persists one-on-one scheduling fields from the resident draft", () => {
    const base = buildResidentComplianceStore();
    const draft = {
      ...createDefaultResidentWizardDraft(base.linkedUserId),
      assignedHouseId: base.houseId,
      firstName: "Taylor",
      lastName: "Brooks",
      moveInDate: "2026-03-01",
      roomOrBed: "2B",
      emergencyContactName: "Jamie Brooks",
      emergencyContactPhone: "(555) 555-1212",
      programPhaseOnEntry: "Phase 1",
      oneOnOneRequired: true,
      oneOnOneAssignedStaffAssignmentId: null,
      oneOnOneFrequency: "WEEKLY" as const,
      oneOnOneWeekday: "THU" as const,
      oneOnOneTimeLocalHhmm: "14:30",
      oneOnOneLeadTimeMinutes: 45,
      oneOnOneAddToCalendar: true,
      oneOnOneReminderEnabled: true,
    };

    const requirement = createResidentRequirementProfileFromDraft(
      base.store,
      base.linkedUserId,
      draft,
      "2026-03-14T09:15:00-06:00",
    );

    expect(requirement.oneOnOneRequired).toBe(true);
    expect(requirement.oneOnOneFrequency).toBe("WEEKLY");
    expect(requirement.oneOnOneWeekday).toBe("THU");
    expect(requirement.oneOnOneTimeLocalHhmm).toBe("14:30");
    expect(requirement.oneOnOneLeadTimeMinutes).toBe(45);
    expect(requirement.oneOnOneAddToCalendar).toBe(true);
    expect(requirement.oneOnOneReminderEnabled).toBe(true);
  });

  it("maps one-on-one scheduling into calendar events and reminders without recovery-only side effects", () => {
    const base = buildChatStore();
    const houseRules = getRuleSetForHouse(base.store, base.houseId, "2026-03-14T09:00:00-06:00");
    let store = upsertHouseRuleSet(
      base.store,
      ACTOR,
      {
        ...houseRules,
        oneOnOne: {
          ...houseRules.oneOnOne,
          enabled: true,
          defaultFrequency: "WEEKLY",
          defaultWeekday: "FRI",
          defaultTimeLocalHhmm: "13:00",
          defaultLeadTimeMinutes: 20,
        },
      },
      "2026-03-14T09:00:00-06:00",
    ).store;

    store = upsertUserAccessProfile(
      store,
      ACTOR,
      {
        linkedUserId: base.linkedUserId,
        role: "HOUSE_RESIDENT",
        organizationId: store.organization?.id ?? null,
        houseId: base.houseId,
        houseGroupId: null,
        status: "ACTIVE",
      },
      "2026-03-14T09:01:00-06:00",
    ).store;

    const nextRequirement = upsertResidentRequirementProfile(
      store,
      ACTOR,
      {
        ...store.residentRequirementProfile!,
        oneOnOneRequired: true,
        oneOnOneAssignedStaffAssignmentId: base.managerContext?.staffAssignmentId ?? null,
        oneOnOneFrequency: "WEEKLY",
        oneOnOneWeekday: "FRI",
        oneOnOneScheduledDate: null,
        oneOnOneTimeLocalHhmm: "13:00",
        oneOnOneLeadTimeMinutes: 20,
        oneOnOneAddToCalendar: true,
        oneOnOneReminderEnabled: true,
      },
      "2026-03-14T09:02:00-06:00",
    ).store.residentRequirementProfile!;

    const eventPlan = buildOneOnOneCalendarEventPlan(
      store,
      nextRequirement,
      "2026-03-14T09:10:00-06:00",
    );
    const reminderPlans = buildOneOnOneReminderPlans(
      store,
      nextRequirement,
      "2026-03-14T09:10:00-06:00",
    );

    expect(eventPlan?.title).toContain("One-on-one");
    expect(eventPlan?.alarms[0]?.relativeOffset).toBe(-20);
    expect(reminderPlans).toHaveLength(1);
    expect(reminderPlans[0]?.obligationType).toBe("ONE_ON_ONE");
  });

  it("shows the next one-on-one session in the blended house schedule tile", () => {
    const base = buildChatStore();
    let store = upsertUserAccessProfile(
      base.store,
      ACTOR,
      {
        linkedUserId: base.linkedUserId,
        role: "HOUSE_RESIDENT",
        organizationId: base.store.organization?.id ?? null,
        houseId: base.houseId,
        houseGroupId: null,
        status: "ACTIVE",
      },
      "2026-03-14T09:30:00-06:00",
    ).store;

    store = upsertHouseRuleSet(
      store,
      ACTOR,
      {
        houseId: base.houseId,
        curfew: {
          enabled: false,
          weekdayCurfew: "22:00",
          fridayCurfew: "23:00",
          saturdayCurfew: "23:00",
          sundayCurfew: "22:00",
          gracePeriodMinutes: 15,
          preViolationAlertEnabled: true,
          preViolationLeadTimeMinutes: 30,
          alertBasis: "CLOCK_ONLY",
        },
        chores: {
          enabled: false,
          frequency: "DAILY",
          dueTime: "18:00",
          proofRequirement: ["PHOTO"],
          gracePeriodMinutes: 15,
          managerInstantNotificationEnabled: true,
        },
      },
      "2026-03-14T09:30:30-06:00",
    ).store;

    store = upsertResidentRequirementProfile(
      store,
      ACTOR,
      {
        ...store.residentRequirementProfile!,
        oneOnOneRequired: true,
        oneOnOneAssignedStaffAssignmentId: base.managerContext?.staffAssignmentId ?? null,
        oneOnOneFrequency: "WEEKLY",
        oneOnOneWeekday: "FRI",
        oneOnOneScheduledDate: null,
        oneOnOneTimeLocalHhmm: "11:00",
        oneOnOneLeadTimeMinutes: 15,
        oneOnOneAddToCalendar: true,
        oneOnOneReminderEnabled: true,
      },
      "2026-03-14T09:31:00-06:00",
    ).store;

    const summary = buildSoberHouseResidentDashboardSummary({
      store,
      nowIso: "2026-03-14T09:40:00-06:00",
      attendanceRecords: [],
      meetingAttendanceLogs: [],
      sponsorCallLogs: [],
      complianceSummary: null,
      upcomingMeetings: [],
    });

    expect(summary.houseScheduleTile.visible).toBe(true);
    expect(summary.houseScheduleTile.subtitle).toBe("Next one-on-one session");
    expect(summary.houseScheduleTile.badgeLabel).toBe("1:1");
  });

  it("builds owner dashboard summaries with group and house filters", () => {
    const base = buildReportingStore();
    let store = base.store;
    store = upsertHouseGroup(
      store,
      ACTOR,
      {
        name: "North Campus",
        houseIds: [base.houseId],
        notes: "",
        status: "ACTIVE",
      },
      "2026-03-01T00:05:00.000Z",
    ).store;
    const groupId = store.houseGroups[0]!.id;
    const mapleId = base.houseId;
    store = upsertHouse(
      store,
      ACTOR,
      { ...store.houses.find((house) => house.id === mapleId)!, houseGroupId: groupId },
      "2026-03-01T00:10:00.000Z",
    ).store;
    store = upsertHouse(
      store,
      ACTOR,
      {
        name: "Willow",
        address: "2 Main",
        phone: "555",
        geofenceRadiusFeetDefault: 200,
        houseTypes: ["WOMEN"],
        bedCount: 8,
        notes: "",
        status: "INACTIVE",
      },
      "2026-03-01T00:11:00.000Z",
    ).store;
    const willowId = store.houses.find((house) => house.name === "Willow")!.id;

    const groupSummary = buildSoberHouseOwnerDashboardSummary({
      store,
      selectedGroupIds: [groupId],
      selectedHouseIds: [],
    });
    expect(groupSummary.filteredHouseIds).toEqual([mapleId]);
    expect(groupSummary.kpis.find((tile) => tile.id === "violations")?.value).toBe("1");

    const houseSummary = buildSoberHouseOwnerDashboardSummary({
      store,
      selectedGroupIds: [],
      selectedHouseIds: [willowId],
    });
    expect(houseSummary.filteredHouseIds).toEqual([willowId]);
    expect(houseSummary.concerns.some((concern) => concern.title === "Willow")).toBe(true);
  });

  it("builds owner house detail and violation drilldowns", () => {
    const base = buildReportingStore();
    const houseDetail = buildSoberHouseOwnerHouseDetail(base.store, base.houseId);
    expect(houseDetail?.houseName).toBe("Maple House");
    expect(houseDetail?.activeViolations).toBe(1);
    expect(houseDetail?.violations).toHaveLength(1);

    const violationRows = buildSoberHouseOwnerHouseViolationRows(base.store, base.houseId);
    expect(violationRows).toHaveLength(1);
    expect(violationRows[0]?.reasonSummary.length).toBeGreaterThan(0);
  });
});
