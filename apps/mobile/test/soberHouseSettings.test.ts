import { describe, expect, it } from "vitest";
import { createDefaultSoberHouseSettingsStore } from "../lib/soberHouse/defaults";
import {
  saveResidentWizardDraft,
  setHouseStatus,
  upsertAlertPreference,
  upsertChoreCompletionRecord,
  upsertHouse,
  upsertHouseRuleSet,
  upsertJobApplicationRecord,
  upsertOrganization,
  upsertResidentConsentRecord,
  upsertResidentHousingProfile,
  upsertResidentRequirementProfile,
  upsertStaffAssignment,
  upsertWorkVerificationRecord,
} from "../lib/soberHouse/mutations";
import {
  applyHouseDefaultsToResidentDraft,
  createDefaultResidentWizardDraft,
  createResidentConsentRecordFromDraft,
  createResidentHousingProfileFromDraft,
  createResidentRequirementProfileFromDraft,
} from "../lib/soberHouse/resident";
import { evaluateResidentCompliance } from "../lib/soberHouse/compliance";
import { getRuleSetForHouse } from "../lib/soberHouse/selectors";

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
        proofRequirement: "PHOTO",
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

  return {
    store,
    houseId,
    residentId: housing.residentId,
    linkedUserId: housing.linkedUserId,
  };
}

describe("sober house settings mutations", () => {
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
          proofRequirement: "CHECKLIST",
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
          proofRequirement: "PHOTO",
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
          proofMethod: "GEOFENCE",
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
        recipientStaffAssignmentId: null,
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
          proofRequirement: "CHECKLIST",
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
        completedAt: "2026-03-09T17:30:00-06:00",
        proofRequirement: "PHOTO",
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
        completedAt: "2026-03-09T17:45:00-06:00",
        proofRequirement: "PHOTO",
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
