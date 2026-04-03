import { getLegacyWizardStateForPath, type OnboardingPath } from "./onboarding";
import {
  activateParticipantTrack,
  createDefaultParticipantTrackState,
  type ParticipantTrackState,
} from "./tracks";
import { createDefaultSoberHouseSettingsStore } from "./soberHouse/defaults";
import {
  upsertHouse,
  upsertHouseGroup,
  upsertHouseRuleSet,
  upsertOrganization,
  upsertRecurringObligation,
  upsertResidentHousingProfile,
  upsertResidentRequirementProfile,
  upsertUserAccessProfile,
} from "./soberHouse/mutations";
import {
  applyHouseDefaultsToResidentDraft,
  createDefaultResidentWizardDraft,
  createResidentHousingProfileFromDraft,
  createResidentRequirementProfileFromDraft,
} from "./soberHouse/resident";
import { getEffectiveRuleSetForScope } from "./soberHouse/selectors";
import type { AccessContext, AccessGrantRole } from "./access";
import type { SoberHouseSettingsStore } from "./soberHouse/types";

export type SeededDevUser = {
  userId: string;
  displayName: string;
  summary: string;
  onboardingPath: OnboardingPath;
  setupComplete: boolean;
  sobrietyDateIso: string;
  participantTracks: ParticipantTrackState;
  recoveryProfile: Record<string, unknown>;
  soberHouseStore: SoberHouseSettingsStore | null;
  expectedProtectedRoles: AccessGrantRole[];
};

const BASE_TIMESTAMP = "2026-03-01T09:00:00.000Z";
const ACTOR = { id: "seed-system", name: "Seed System" };

function buildRecoveryProfile(input: {
  participantTracks: ParticipantTrackState;
  onboardingPath: OnboardingPath;
  sponsorName: string;
  sponsorPhoneDigits: string;
  sponsorEnabled: boolean;
  sponsorActive: boolean;
  wizardJusticeTrack?: "NONE" | "DRUG_COURT" | "PROBATION_PAROLE";
  wizardCourtProgramName?: string;
  wizardCourtSupervisorName?: string;
  wizardCourtRequirementsSummary?: string;
  wizardCourtDeadlineSummary?: string;
}) {
  const legacy = getLegacyWizardStateForPath(input.onboardingPath);
  return {
    radiusMiles: 25,
    homeGroupMeetingIds: [],
    homeGroupSeriesKey: null,
    homeGroupName: null,
    homeGroupBirthdayOptIn: false,
    homeGroupBirthdayFirstName: "",
    homeGroupBirthdayLastName: "",
    recurringServiceCommitments: [],
    attendanceAutomationPlan: null,
    sponsorEnabledAtIso: input.sponsorEnabled ? BASE_TIMESTAMP : null,
    ninetyDayGoalTarget: 90,
    recoverySubstances: ["ALCOHOL"],
    meetingSignatureRequired: true,
    sponsorName: input.sponsorName,
    sponsorPhoneDigits: input.sponsorPhoneDigits,
    sponsorHour12: 8,
    sponsorMinute: 0,
    sponsorMeridiem: "PM",
    sponsorRepeatPreset: "WEEKLY",
    sponsorRepeatDays: ["MON", "WED", "FRI"],
    sponsorEnabled: input.sponsorEnabled,
    sponsorActive: input.sponsorActive,
    sponsorLeadMinutes: 10,
    sponsorKneesSuggested: true,
    meetingAutoAddToCalendar: false,
    wizardOnboardingPath: input.onboardingPath,
    wizardSupervisionMode: legacy.wizardSupervisionMode,
    wizardJusticeTrack: input.wizardJusticeTrack ?? legacy.wizardJusticeTrack,
    wizardCourtProgramName: input.wizardCourtProgramName ?? "",
    wizardCourtSupervisorName: input.wizardCourtSupervisorName ?? "",
    wizardCourtRequirementsSummary: input.wizardCourtRequirementsSummary ?? "",
    wizardCourtDeadlineSummary: input.wizardCourtDeadlineSummary ?? "",
    participantTracks: input.participantTracks,
  };
}

function buildResidentSeedStore(linkedUserId: string): SoberHouseSettingsStore {
  let store = createDefaultSoberHouseSettingsStore();
  store = upsertOrganization(
    store,
    ACTOR,
    {
      name: "Bright Path Recovery",
      primaryContactName: "Jordan Hayes",
      primaryPhone: "(555) 555-1212",
      primaryEmail: "ops@brightpath.org",
      notes: "Seeded resident org",
      status: "ACTIVE",
    },
    BASE_TIMESTAMP,
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
      notes: "Seeded resident house",
      status: "ACTIVE",
    },
    "2026-03-01T09:05:00.000Z",
  ).store;

  const houseId = store.houses[0]!.id;
  store = upsertHouseGroup(
    store,
    ACTOR,
    {
      name: "Phase One Men",
      notes: "Reusable phase-one template for men's housing.",
      houseIds: [houseId],
      status: "ACTIVE",
    },
    "2026-03-01T09:06:00.000Z",
  ).store;

  const houseGroupId = store.houseGroups[0]!.id;
  store = upsertHouseRuleSet(
    store,
    ACTOR,
    {
      name: "Organization defaults",
      status: "ACTIVE",
      curfew: {
        enabled: false,
        weekdayCurfew: "22:00",
        fridayCurfew: "23:00",
        saturdayCurfew: "23:00",
        sundayCurfew: "22:00",
        gracePeriodMinutes: 15,
        preViolationAlertEnabled: false,
        preViolationLeadTimeMinutes: 15,
        alertBasis: "CLOCK_ONLY",
      },
      chores: {
        enabled: true,
        frequency: "WEEKLY",
        dueTime: "18:00",
        proofRequirement: [],
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
    },
    "2026-03-01T09:07:00.000Z",
  ).store;
  const orgEffective = getEffectiveRuleSetForScope(
    store,
    "ORGANIZATION",
    null,
    "2026-03-01T09:07:30.000Z",
  ).ruleSet;

  store = upsertHouseRuleSet(
    store,
    ACTOR,
    {
      houseGroupId,
      name: "Phase One template",
      status: "ACTIVE",
      curfew: orgEffective.curfew,
      chores: {
        enabled: true,
        frequency: "DAILY",
        dueTime: "18:00",
        proofRequirement: ["PHOTO"],
        gracePeriodMinutes: 10,
        managerInstantNotificationEnabled: true,
      },
      employment: orgEffective.employment,
      jobSearch: orgEffective.jobSearch,
      meetings: orgEffective.meetings,
      sponsorContact: {
        enabled: true,
        contactsRequiredPerWeek: 3,
        proofType: "CALL_LOG",
      },
      oneOnOne: orgEffective.oneOnOne,
      operations: orgEffective.operations,
      support: orgEffective.support,
    },
    "2026-03-01T09:08:00.000Z",
  ).store;
  const groupEffective = getEffectiveRuleSetForScope(
    store,
    "HOUSE_GROUP",
    houseGroupId,
    "2026-03-01T09:08:30.000Z",
  ).ruleSet;

  store = upsertRecurringObligation(
    store,
    ACTOR,
    {
      organizationId: store.organization?.id ?? null,
      scopeType: "HOUSE_GROUP",
      status: "ACTIVE",
      houseId: null,
      houseGroupId,
      residentId: null,
      linkedUserId: null,
      obligationType: "HOUSE_MEETING",
      title: "Monday House Meeting",
      detail: "Weekly required house meeting for phase-one residents.",
      locationLabel: "Maple House Common Room",
      frequency: "WEEKLY",
      weekday: "MON",
      weekdayList: ["MON"],
      monthlyOrdinal: null,
      scheduledDate: null,
      timeLocalHhmm: "19:00",
      durationMinutes: 60,
      required: true,
      reminderLeadMinutes: 30,
      inAppReminderEnabled: true,
      addToCalendar: true,
      accountabilityMethod: "ACKNOWLEDGMENT",
    },
    "2026-03-01T09:09:00.000Z",
  ).store;

  store = upsertHouseRuleSet(
    store,
    ACTOR,
    {
      houseId,
      name: "Maple house rules",
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
      chores: groupEffective.chores,
      employment: groupEffective.employment,
      jobSearch: groupEffective.jobSearch,
      meetings: {
        meetingsRequired: true,
        meetingsPerWeek: 5,
        allowedMeetingTypes: ["AA", "NA"],
        proofMethod: "SIGNATURE",
      },
      sponsorContact: groupEffective.sponsorContact,
      oneOnOne: groupEffective.oneOnOne,
      operations: groupEffective.operations,
      support: groupEffective.support,
    },
    "2026-03-01T09:10:00.000Z",
  ).store;

  store = upsertUserAccessProfile(
    store,
    ACTOR,
    {
      linkedUserId,
      role: "HOUSE_RESIDENT",
      organizationId: store.organization?.id ?? null,
      houseId,
      houseGroupId,
      status: "ACTIVE",
    },
    "2026-03-01T09:12:00.000Z",
  ).store;

  const draft = {
    ...applyHouseDefaultsToResidentDraft(
      store,
      linkedUserId,
      houseId,
      createDefaultResidentWizardDraft(linkedUserId),
    ),
    firstName: "Riley",
    lastName: "Resident",
    assignedHouseId: houseId,
    moveInDate: "2026-02-20",
    roomOrBed: "2B",
    emergencyContactName: "Jamie Resident",
    emergencyContactPhone: "(555) 555-2323",
    programPhaseOnEntry: "Phase 2",
    sponsorPresent: true,
    sponsorName: "Sam Sponsor",
    sponsorPhone: "(555) 555-4545",
  };

  const housingProfile = createResidentHousingProfileFromDraft(
    store,
    linkedUserId,
    draft,
    "2026-03-01T09:14:00.000Z",
  );
  store = upsertResidentHousingProfile(
    store,
    ACTOR,
    housingProfile,
    "2026-03-01T09:14:00.000Z",
  ).store;

  const requirementProfile = createResidentRequirementProfileFromDraft(
    store,
    linkedUserId,
    draft,
    "2026-03-01T09:15:00.000Z",
  );
  store = upsertResidentRequirementProfile(
    store,
    ACTOR,
    requirementProfile,
    "2026-03-01T09:15:00.000Z",
  ).store;

  return store;
}

function buildOrganizationSeedStore(linkedUserId: string): SoberHouseSettingsStore {
  let store = createDefaultSoberHouseSettingsStore();
  store = upsertOrganization(
    store,
    ACTOR,
    {
      name: "Bright Path Recovery",
      primaryContactName: "Olivia Operator",
      primaryPhone: "(555) 555-9090",
      primaryEmail: "owner@brightpath.org",
      notes: "Seeded organization admin context",
      status: "ACTIVE",
    },
    BASE_TIMESTAMP,
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
      notes: "Seeded admin house",
      status: "ACTIVE",
    },
    "2026-03-01T09:03:00.000Z",
  ).store;
  const houseId = store.houses[0]!.id;
  store = upsertHouseGroup(
    store,
    ACTOR,
    {
      name: "Phase One Men",
      notes: "Reusable template for seeded admin QA.",
      houseIds: [houseId],
      status: "ACTIVE",
    },
    "2026-03-01T09:04:00.000Z",
  ).store;
  const houseGroupId = store.houseGroups[0]!.id;
  store = upsertHouseRuleSet(
    store,
    ACTOR,
    {
      name: "Organization defaults",
      status: "ACTIVE",
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
      jobSearch: {
        applicationsRequiredPerWeek: 4,
        proofRequired: true,
        managerApprovalRequired: false,
      },
      employment: {
        employmentRequired: true,
        workplaceVerificationEnabled: true,
        workplaceGeofenceRadiusDefault: 200,
        managerVerificationRequired: false,
      },
    },
    "2026-03-01T09:04:30.000Z",
  ).store;
  store = upsertHouseRuleSet(
    store,
    ACTOR,
    {
      houseGroupId,
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
    },
    "2026-03-01T09:04:45.000Z",
  ).store;
  store = upsertUserAccessProfile(
    store,
    ACTOR,
    {
      linkedUserId,
      role: "OWNER_OPERATOR",
      organizationId: store.organization?.id ?? null,
      houseId,
      houseGroupId,
      status: "ACTIVE",
    },
    "2026-03-01T09:05:00.000Z",
  ).store;
  return store;
}

function buildRecoveryTrackState(): ParticipantTrackState {
  return createDefaultParticipantTrackState(BASE_TIMESTAMP);
}

function buildResidentTrackState(): ParticipantTrackState {
  return activateParticipantTrack(
    buildRecoveryTrackState(),
    "sober_housing_resident",
    BASE_TIMESTAMP,
    {
      setupStatus: "COMPLETE",
      linkedOrganizationId: "seed-org-bright-path",
      linkedHouseId: "seed-house-maple",
    },
  );
}

function buildCourtTrackState(): ParticipantTrackState {
  return activateParticipantTrack(buildRecoveryTrackState(), "court_participant", BASE_TIMESTAMP, {
    setupStatus: "COMPLETE",
    linkedCourtProgramName: "Jefferson County Drug Court",
    courtTrackKind: "DRUG_COURT",
  });
}

export const SEEDED_DEV_USERS: SeededDevUser[] = [
  {
    userId: "recovery-user",
    displayName: "Casey Recovery",
    summary: "Recovery-only seeded user",
    onboardingPath: "RECOVERY",
    setupComplete: true,
    sobrietyDateIso: "2025-12-15",
    participantTracks: buildRecoveryTrackState(),
    recoveryProfile: buildRecoveryProfile({
      participantTracks: buildRecoveryTrackState(),
      onboardingPath: "RECOVERY",
      sponsorName: "Morgan Sponsor",
      sponsorPhoneDigits: "5551112222",
      sponsorEnabled: true,
      sponsorActive: true,
    }),
    soberHouseStore: null,
    expectedProtectedRoles: [],
  },
  {
    userId: "resident-user",
    displayName: "Riley Resident",
    summary: "Recovery + sober housing resident seeded user",
    onboardingPath: "SOBER_HOUSE_RESIDENT",
    setupComplete: true,
    sobrietyDateIso: "2025-11-01",
    participantTracks: buildResidentTrackState(),
    recoveryProfile: buildRecoveryProfile({
      participantTracks: buildResidentTrackState(),
      onboardingPath: "SOBER_HOUSE_RESIDENT",
      sponsorName: "Sam Sponsor",
      sponsorPhoneDigits: "5553334444",
      sponsorEnabled: true,
      sponsorActive: true,
    }),
    soberHouseStore: buildResidentSeedStore("resident-user"),
    expectedProtectedRoles: [],
  },
  {
    userId: "organization-user",
    displayName: "Olivia Operator",
    summary: "Protected organization user seeded for backend-authorized QA",
    onboardingPath: "RECOVERY",
    setupComplete: true,
    sobrietyDateIso: "2025-10-10",
    participantTracks: buildRecoveryTrackState(),
    recoveryProfile: buildRecoveryProfile({
      participantTracks: buildRecoveryTrackState(),
      onboardingPath: "RECOVERY",
      sponsorName: "Taylor Sponsor",
      sponsorPhoneDigits: "5557778888",
      sponsorEnabled: true,
      sponsorActive: false,
    }),
    soberHouseStore: buildOrganizationSeedStore("organization-user"),
    expectedProtectedRoles: ["org_admin"],
  },
  {
    userId: "platform-user",
    displayName: "Parker Platform",
    summary: "Protected platform owner seeded for backend-authorized QA",
    onboardingPath: "RECOVERY",
    setupComplete: true,
    sobrietyDateIso: "2025-09-09",
    participantTracks: buildRecoveryTrackState(),
    recoveryProfile: buildRecoveryProfile({
      participantTracks: buildRecoveryTrackState(),
      onboardingPath: "RECOVERY",
      sponsorName: "Dana Sponsor",
      sponsorPhoneDigits: "5559990000",
      sponsorEnabled: false,
      sponsorActive: false,
    }),
    soberHouseStore: buildOrganizationSeedStore("platform-user"),
    expectedProtectedRoles: ["platform_owner"],
  },
  {
    userId: "court-user",
    displayName: "Jordan Court",
    summary: "Recovery + court participant seeded user",
    onboardingPath: "COURT_PROGRAM",
    setupComplete: true,
    sobrietyDateIso: "2025-08-01",
    participantTracks: buildCourtTrackState(),
    recoveryProfile: buildRecoveryProfile({
      participantTracks: buildCourtTrackState(),
      onboardingPath: "COURT_PROGRAM",
      sponsorName: "Blake Sponsor",
      sponsorPhoneDigits: "5551213434",
      sponsorEnabled: true,
      sponsorActive: true,
      wizardJusticeTrack: "DRUG_COURT",
      wizardCourtProgramName: "Jefferson County Drug Court",
      wizardCourtSupervisorName: "Officer Chen",
      wizardCourtRequirementsSummary: "Weekly check-in, two meetings, proof submissions",
      wizardCourtDeadlineSummary: "Next check-in Thursday at 9:00 AM",
    }),
    soberHouseStore: null,
    expectedProtectedRoles: [],
  },
];

export function getSeededDevUser(userId: string): SeededDevUser | null {
  return SEEDED_DEV_USERS.find((entry) => entry.userId === userId) ?? null;
}

export function buildSeededAccessContext(userId: string): AccessContext | null {
  const seededUser = getSeededDevUser(userId);
  if (!seededUser) {
    return null;
  }

  const organizationId = seededUser.soberHouseStore?.organization?.id ?? null;
  const organizationName = seededUser.soberHouseStore?.organization?.name ?? null;
  const participantRoles: AccessGrantRole[] = [];

  if (seededUser.onboardingPath === "SOBER_HOUSE_RESIDENT") {
    participantRoles.push("resident_user");
  } else if (seededUser.onboardingPath === "COURT_PROGRAM") {
    participantRoles.push("court_participant");
  } else {
    participantRoles.push("recovery_user");
  }

  const protectedRoles = [...seededUser.expectedProtectedRoles];
  const allRoles: AccessGrantRole[] = [...participantRoles, ...protectedRoles];

  return {
    user: {
      userId: seededUser.userId,
      tenantId: "seed-tenant",
      email: `${seededUser.userId}@soberai.dev`,
      displayName: seededUser.displayName,
      createdAt: BASE_TIMESTAMP,
    },
    grants: allRoles.map((role, index) => ({
      id: `seed-grant-${seededUser.userId}-${index + 1}`,
      role,
      organizationId:
        role === "org_admin" || role === "house_manager" || role === "resident_user"
          ? organizationId
          : null,
      organizationName:
        role === "org_admin" || role === "house_manager" || role === "resident_user"
          ? organizationName
          : null,
      courtProgramId: role === "court_participant" ? "seed-court-program" : null,
      courtProgramName: role === "court_participant" ? "Jefferson County Drug Court" : null,
      courtProgramJurisdiction: role === "court_participant" ? "Jefferson County" : null,
      grantedAt: BASE_TIMESTAMP,
      revokedAt: null,
    })),
    capabilities: {
      participantRoles,
      protectedRoles,
      canManageOrganizations:
        protectedRoles.includes("org_admin") ||
        protectedRoles.includes("house_manager") ||
        protectedRoles.includes("platform_owner"),
      canManageCourtPrograms:
        protectedRoles.includes("court_supervisor") ||
        protectedRoles.includes("probation_officer") ||
        protectedRoles.includes("parole_officer") ||
        protectedRoles.includes("platform_owner"),
      isPlatformOwner: protectedRoles.includes("platform_owner"),
    },
  };
}
