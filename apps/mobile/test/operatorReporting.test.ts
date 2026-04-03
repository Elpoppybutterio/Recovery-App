import { describe, expect, it } from "vitest";
import { createDefaultSoberHouseSettingsStore } from "../lib/soberHouse/defaults";
import {
  upsertChoreCompletionRecord,
  upsertHouse,
  upsertHouseChore,
  upsertHouseGroup,
  upsertHouseMeeting,
  upsertHouseMeetingAttendanceRecord,
  upsertHouseRuleSet,
  upsertOneOnOneSession,
  upsertOrganization,
  upsertResidentHouseMembership,
  upsertResidentHousingProfile,
  upsertResidentRequirementProfile,
  upsertSponsorCallRecord,
  upsertUserAccessProfile,
  upsertViolation,
} from "../lib/soberHouse/mutations";
import {
  buildSoberHouseOperatorReportingSummary,
  residentMatchesOperatorFilter,
} from "../lib/soberHouse/operatorReporting";
import {
  createDefaultResidentWizardDraft,
  createResidentHousingProfileFromDraft,
  createResidentRequirementProfileFromDraft,
} from "../lib/soberHouse/resident";

const ACTOR = {
  id: "admin-a",
  name: "Admin A",
};

export function buildOperatorReportingStore() {
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
    "2026-04-01T08:00:00.000Z",
  ).store;

  store = upsertHouseGroup(
    store,
    ACTOR,
    {
      name: "Phase One",
      houseIds: [],
      notes: "",
      status: "ACTIVE",
    },
    "2026-04-01T08:05:00.000Z",
  ).store;
  const groupId = store.houseGroups[0]!.id;

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
      houseGroupId: groupId,
      status: "ACTIVE",
    },
    "2026-04-01T08:10:00.000Z",
  ).store;
  const houseOneId = store.houses.find((house) => house.name === "Maple House")!.id;

  store = upsertHouse(
    store,
    ACTOR,
    {
      name: "Pine House",
      address: "456 Elm St",
      phone: "(555) 555-2222",
      geofenceCenterLat: 45.782,
      geofenceCenterLng: -108.501,
      geofenceRadiusFeetDefault: 200,
      houseTypes: ["MEN"],
      bedCount: 10,
      notes: "South campus",
      houseGroupId: groupId,
      status: "ACTIVE",
    },
    "2026-04-01T08:12:00.000Z",
  ).store;
  const houseTwoId = store.houses.find((house) => house.name === "Pine House")!.id;

  store = upsertHouseRuleSet(
    store,
    ACTOR,
    {
      name: "Org defaults",
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
        enabled: true,
        contactsRequiredPerWeek: 2,
        proofType: "CALL_LOG",
      },
      oneOnOne: {
        enabled: true,
        defaultFrequency: "WEEKLY",
        defaultWeekday: "THU",
        defaultTimeLocalHhmm: "14:00",
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
    "2026-04-01T08:15:00.000Z",
  ).store;

  store = upsertHouseRuleSet(
    store,
    ACTOR,
    {
      houseId: houseTwoId,
      name: "Pine overrides",
      status: "ACTIVE",
      meetings: {
        meetingsRequired: true,
        meetingsPerWeek: 5,
        allowedMeetingTypes: ["AA", "NA"],
        proofMethod: "SIGNATURE",
      },
      chores: {
        enabled: true,
        frequency: "DAILY",
        dueTime: "17:00",
        proofRequirement: ["PHOTO"],
        gracePeriodMinutes: 5,
        managerInstantNotificationEnabled: true,
      },
    },
    "2026-04-01T08:18:00.000Z",
  ).store;

  const residentOneDraft = {
    ...createDefaultResidentWizardDraft("resident-user-1"),
    firstName: "Riley",
    lastName: "Resident",
    assignedHouseId: houseOneId,
    moveInDate: "2026-03-20",
    roomOrBed: "2B",
    emergencyContactName: "Jamie Resident",
    emergencyContactPhone: "(555) 555-2323",
    programPhaseOnEntry: "Phase 2",
    meetingsRequiredWeekly: true,
    meetingsRequiredCount: 6,
    currentlyEmployed: false,
    workRequired: false,
    jobApplicationsRequiredPerWeek: 0,
    consentToHouseRules: true,
    consentToLocationVerification: true,
    consentToComplianceDocumentation: true,
  };

  const residentOneHousing = createResidentHousingProfileFromDraft(
    store,
    "resident-user-1",
    residentOneDraft,
    "2026-04-01T08:20:00.000Z",
  );
  store = upsertResidentHousingProfile(
    store,
    ACTOR,
    residentOneHousing,
    "2026-04-01T08:21:00.000Z",
  ).store;
  const residentOneRequirements = createResidentRequirementProfileFromDraft(
    store,
    "resident-user-1",
    residentOneDraft,
    "2026-04-01T08:20:00.000Z",
  );
  store = upsertResidentRequirementProfile(
    store,
    ACTOR,
    residentOneRequirements,
    "2026-04-01T08:21:30.000Z",
  ).store;
  store = upsertResidentHouseMembership(
    store,
    ACTOR,
    {
      residentId: residentOneHousing.residentId,
      linkedUserId: residentOneHousing.linkedUserId,
      organizationId: store.organization?.id ?? null,
      houseId: houseOneId,
      roomOrBed: "2B",
      moveInDate: "2026-03-20",
      moveOutDate: null,
      isPrimary: true,
      status: "ACTIVE",
      notes: "",
    },
    "2026-04-01T08:22:00.000Z",
  ).store;
  store = upsertUserAccessProfile(
    store,
    ACTOR,
    {
      linkedUserId: "resident-user-1",
      role: "HOUSE_RESIDENT",
      organizationId: store.organization?.id ?? null,
      houseId: houseOneId,
      houseGroupId: groupId,
      status: "ACTIVE",
    },
    "2026-04-01T08:22:30.000Z",
  ).store;

  store = upsertResidentHouseMembership(
    store,
    ACTOR,
    {
      residentId: "resident-two",
      linkedUserId: "resident-user-2",
      organizationId: store.organization?.id ?? null,
      houseId: houseTwoId,
      roomOrBed: "1A",
      moveInDate: "2026-03-22",
      moveOutDate: null,
      isPrimary: true,
      status: "ACTIVE",
      notes: "",
    },
    "2026-04-01T08:23:00.000Z",
  ).store;

  store = upsertHouseChore(
    store,
    ACTOR,
    {
      organizationId: store.organization?.id ?? null,
      houseId: houseOneId,
      residentId: residentOneHousing.residentId,
      linkedUserId: "resident-user-1",
      recurringObligationId: null,
      title: "Kitchen reset",
      summary: "Reset the kitchen.",
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
    "2026-04-01T08:24:00.000Z",
  ).store;

  store = upsertHouseChore(
    store,
    ACTOR,
    {
      organizationId: store.organization?.id ?? null,
      houseId: houseTwoId,
      residentId: "resident-two",
      linkedUserId: "resident-user-2",
      recurringObligationId: null,
      title: "Bathroom clean",
      summary: "Clean the bathroom.",
      frequency: "DAILY",
      dueTimeLocalHhmm: "17:00",
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
    "2026-04-01T08:25:00.000Z",
  ).store;

  store = upsertChoreCompletionRecord(
    store,
    ACTOR,
    {
      residentId: residentOneHousing.residentId,
      linkedUserId: "resident-user-1",
      organizationId: store.organization?.id ?? null,
      houseId: houseOneId,
      houseChoreId: store.houseChores[0]!.id,
      completedAt: "2026-04-01T17:15:00.000Z",
      proofRequirement: ["PHOTO"],
      proofProvided: true,
      proofReference: "file:///tmp/chore-proof-1.jpg",
      notes: "Done.",
    },
    "2026-04-01T17:16:00.000Z",
  ).store;

  store = upsertOneOnOneSession(
    store,
    ACTOR,
    {
      organizationId: store.organization?.id ?? null,
      houseId: houseOneId,
      residentId: residentOneHousing.residentId,
      linkedUserId: "resident-user-1",
      staffAssignmentId: null,
      recurringObligationId: null,
      title: "Weekly one-on-one",
      notes: "Resident accountability check-in.",
      scheduledAt: "2026-04-01T18:30:00.000Z",
      endsAt: "2026-04-01T19:00:00.000Z",
      required: true,
      reminderLeadMinutes: 15,
      inAppReminderEnabled: true,
      addToCalendar: false,
      managerConfirmationRequired: true,
      completionStatus: "COMPLETED",
      completedAt: "2026-04-01T18:55:00.000Z",
      completedByStaffAssignmentId: null,
      excusedAt: null,
      excusedReason: null,
      status: "ACTIVE",
    },
    "2026-04-01T17:30:00.000Z",
  ).store;

  store = upsertSponsorCallRecord(
    store,
    ACTOR,
    {
      residentId: residentOneHousing.residentId,
      linkedUserId: "resident-user-1",
      organizationId: store.organization?.id ?? null,
      houseId: houseOneId,
      scheduledFor: "2026-04-01T13:00:00.000Z",
      status: "COMPLETED",
      completedAt: "2026-04-01T13:05:00.000Z",
      proofRequired: true,
      proofProvided: true,
      proofReference: "call-log://resident-user-1/2026-04-01",
      proofType: "CALL_LOG",
      notes: "Logged sponsor call.",
    },
    "2026-04-01T13:05:00.000Z",
  ).store;

  store = upsertSponsorCallRecord(
    store,
    ACTOR,
    {
      residentId: residentOneHousing.residentId,
      linkedUserId: "resident-user-1",
      organizationId: store.organization?.id ?? null,
      houseId: houseOneId,
      scheduledFor: "2026-04-01T14:00:00.000Z",
      status: "COMPLETED",
      completedAt: "2026-04-01T14:04:00.000Z",
      proofRequired: true,
      proofProvided: false,
      proofReference: null,
      proofType: "CALL_LOG",
      notes: "Proof missing for test coverage.",
    },
    "2026-04-01T14:04:00.000Z",
  ).store;

  store = upsertHouseMeeting(
    store,
    ACTOR,
    {
      organizationId: store.organization?.id ?? null,
      houseId: houseOneId,
      recurringObligationId: null,
      title: "Weekly house meeting",
      description: "Weekly resident check-in.",
      meetingKind: "HOUSE_MEETING",
      locationLabel: "Common room",
      startsAt: "2026-04-01T19:30:00.000Z",
      endsAt: "2026-04-01T20:30:00.000Z",
      required: true,
      reminderLeadMinutes: 30,
      inAppReminderEnabled: true,
      addToCalendar: false,
      acknowledgmentRequired: true,
      status: "ACTIVE",
    },
    "2026-04-01T09:00:00.000Z",
  ).store;

  store = upsertHouseMeetingAttendanceRecord(
    store,
    ACTOR,
    {
      residentId: residentOneHousing.residentId,
      linkedUserId: "resident-user-1",
      organizationId: store.organization?.id ?? null,
      houseId: houseOneId,
      houseMeetingId: store.houseMeetings[0]!.id,
      recurringObligationId: null,
      scheduledStartAt: "2026-04-01T19:30:00.000Z",
      status: "COMPLETED",
      attendedAt: "2026-04-01T19:31:00.000Z",
      excusedAt: null,
      excusedReason: null,
      proofRequired: true,
      proofProvided: false,
      proofReference: null,
      notes: "Attended",
    },
    "2026-04-01T19:31:00.000Z",
  ).store;

  store = upsertViolation(
    store,
    ACTOR,
    {
      residentId: "resident-two",
      linkedUserId: "resident-user-2",
      houseId: houseTwoId,
      organizationId: store.organization?.id ?? null,
      ruleType: "curfew",
      sourceEvaluationReference: null,
      sourceEvaluationSnapshot: null,
      complianceWindowKey: "2026-W14",
      triggeredAt: "2026-04-01T23:30:00.000Z",
      effectiveAt: "2026-04-01T23:30:00.000Z",
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
    "2026-04-01T23:31:00.000Z",
  ).store;

  return { store, residentOneId: residentOneHousing.residentId, houseOneId, houseTwoId };
}

describe("sober house operator reporting", () => {
  it("builds org, house, and resident compliance reporting from current sober-house data", () => {
    const base = buildOperatorReportingStore();
    const summary = buildSoberHouseOperatorReportingSummary({
      store: base.store,
      nowIso: "2026-04-02T02:30:00.000Z",
    });

    expect(summary.organization.totalHouses).toBe(2);
    expect(summary.organization.totalResidents).toBe(2);
    expect(summary.organization.criticalResidentsCount).toBe(1);
    expect(summary.organization.openViolationsIncidents).toBe(1);
    expect(summary.organization.highestRiskHouses[0]?.houseId).toBe(base.houseTwoId);

    const houseOne = summary.houses.find((house) => house.houseId === base.houseOneId);
    const houseTwo = summary.houses.find((house) => house.houseId === base.houseTwoId);

    expect(houseOne?.occupiedBeds).toBe(1);
    expect(houseOne?.noncompliantResidents).toBe(1);
    expect(houseTwo?.criticalResidents).toBe(1);
    expect(houseTwo?.openViolations).toBe(1);

    const residentOne = summary.residents.find(
      (resident) => resident.residentId === base.residentOneId,
    );
    const residentTwo = summary.residents.find(
      (resident) => resident.residentId === "resident-two",
    );

    expect(residentOne?.displayName).toBe("Riley Resident");
    expect(residentOne?.meetingsRequired).toBe(6);
    expect(residentOne?.oneOnOnesTracked).toBe(true);
    expect(residentOne?.oneOnOnesCompleted).toBe(1);
    expect(residentOne?.sponsorCallsTracked).toBe(true);
    expect(residentOne?.sponsorCallsCompleted).toBe(2);
    expect(residentOne?.houseMeetingsDue).toBe(1);
    expect(residentOne?.houseMeetingsCompleted).toBe(1);
    expect(residentOne?.missingProofCount).toBeGreaterThan(0);
    expect(residentOne?.complianceBand).toBe("noncompliant");
    expect(residentTwo?.complianceBand).toBe("critical");
    expect(residentTwo?.hasCurfewIssues).toBe(true);
    expect(residentTwo?.overdueChores).toBe(1);
    expect(houseOne?.oneOnOnesTracked).toBe(true);
    expect(houseOne?.sponsorCallsTracked).toBe(true);
    expect(houseTwo?.oneOnOnesTracked).toBe(false);
    expect(houseTwo?.sponsorCallsTracked).toBe(false);
    expect(residentTwo?.oneOnOnesTracked).toBe(false);
    expect(residentTwo?.sponsorCallsTracked).toBe(false);
    expect(summary.organization.oneOnOneTracked).toBe(true);
    expect(summary.organization.sponsorTracked).toBe(true);
  });

  it("supports resident drilldown filters without cross-band leakage", () => {
    const base = buildOperatorReportingStore();
    const summary = buildSoberHouseOperatorReportingSummary({
      store: base.store,
      nowIso: "2026-04-02T02:30:00.000Z",
    });

    const compliantResident = summary.residents.find(
      (resident) => resident.complianceBand === "noncompliant",
    );
    const criticalResident = summary.residents.find(
      (resident) => resident.complianceBand === "critical",
    );

    expect(compliantResident).toBeTruthy();
    expect(criticalResident).toBeTruthy();
    expect(residentMatchesOperatorFilter(compliantResident!, "noncompliant")).toBe(true);
    expect(residentMatchesOperatorFilter(compliantResident!, "critical")).toBe(false);
    expect(residentMatchesOperatorFilter(criticalResident!, "curfew-issues")).toBe(true);
    expect(residentMatchesOperatorFilter(criticalResident!, "overdue-chores")).toBe(true);
  });
});
