import type {
  AlertPreference,
  House,
  HouseRuleSet,
  Organization,
  SoberHouseSettingsStore,
  StaffAssignment,
} from "./types";
import { SOBER_HOUSE_SETTINGS_STORE_VERSION } from "./types";

export const DEFAULT_HOUSE_GEOFENCE_RADIUS_FEET = 200;
export const DEFAULT_WORKPLACE_GEOFENCE_RADIUS_FEET = 200;
export const MAX_SOBER_HOUSE_AUDIT_LOG_ENTRIES = 500;

function randomSegment(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function createEntityId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomSegment()}`;
}

export function createDefaultSoberHouseSettingsStore(): SoberHouseSettingsStore {
  return {
    version: SOBER_HOUSE_SETTINGS_STORE_VERSION,
    organization: null,
    houses: [],
    staffAssignments: [],
    houseRuleSets: [],
    alertPreferences: [],
    residentHousingProfile: null,
    residentRequirementProfile: null,
    residentConsentRecord: null,
    residentWizardDraft: null,
    auditLogEntries: [],
  };
}

export function createDefaultOrganization(now: string, id = createEntityId("org")): Organization {
  return {
    id,
    name: "",
    primaryContactName: "",
    primaryPhone: "",
    primaryEmail: "",
    notes: "",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultHouse(
  now: string,
  organizationId: string | null,
  id = createEntityId("house"),
): House {
  return {
    id,
    organizationId,
    name: "",
    address: "",
    phone: "",
    geofenceRadiusFeetDefault: DEFAULT_HOUSE_GEOFENCE_RADIUS_FEET,
    houseTypes: ["OTHER"],
    bedCount: 0,
    notes: "",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultStaffAssignment(
  now: string,
  organizationId: string | null,
  id = createEntityId("staff"),
): StaffAssignment {
  return {
    id,
    organizationId,
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    role: "VIEWER",
    assignedHouseIds: [],
    receiveRealTimeViolationAlerts: false,
    receiveNearMissAlerts: false,
    receiveMonthlyReports: false,
    canApproveExceptions: false,
    canIssueCorrectiveActions: false,
    canViewResidentEvidence: false,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultHouseRuleSet(
  now: string,
  houseId: string,
  organizationId: string | null,
  id = createEntityId("rules"),
): HouseRuleSet {
  return {
    id,
    organizationId,
    houseId,
    name: "Default house rules",
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
      enabled: false,
      frequency: "WEEKLY",
      dueTime: "18:00",
      proofRequirement: "CHECKLIST",
      gracePeriodMinutes: 15,
      managerInstantNotificationEnabled: false,
    },
    employment: {
      employmentRequired: false,
      workplaceVerificationEnabled: false,
      workplaceGeofenceRadiusDefault: DEFAULT_WORKPLACE_GEOFENCE_RADIUS_FEET,
      managerVerificationRequired: false,
    },
    jobSearch: {
      applicationsRequiredPerWeek: 0,
      proofRequired: false,
      managerApprovalRequired: false,
    },
    meetings: {
      meetingsRequired: false,
      meetingsPerWeek: 0,
      allowedMeetingTypes: ["AA"],
      proofMethod: "GEOFENCE",
    },
    sponsorContact: {
      enabled: false,
      contactsRequiredPerWeek: 0,
      proofType: "CALL_LOG",
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultAlertPreference(
  now: string,
  organizationId: string | null,
  id = createEntityId("alert"),
): AlertPreference {
  return {
    id,
    organizationId,
    houseId: null,
    label: "",
    scope: "ORGANIZATION",
    recipientStaffAssignmentId: null,
    recipientName: "",
    recipientPhone: "",
    recipientEmail: "",
    deliveryMethod: "BOTH",
    sendRealTimeViolationAlerts: true,
    sendNearMissAlerts: false,
    sendMonthlyReports: true,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneSoberHouseStore(store: SoberHouseSettingsStore): SoberHouseSettingsStore {
  return {
    version: store.version,
    organization: store.organization ? { ...store.organization } : null,
    houses: store.houses.map((house) => ({ ...house, houseTypes: [...house.houseTypes] })),
    staffAssignments: store.staffAssignments.map((assignment) => ({
      ...assignment,
      assignedHouseIds: [...assignment.assignedHouseIds],
    })),
    houseRuleSets: store.houseRuleSets.map((ruleSet) => ({
      ...ruleSet,
      curfew: { ...ruleSet.curfew },
      chores: { ...ruleSet.chores },
      employment: { ...ruleSet.employment },
      jobSearch: { ...ruleSet.jobSearch },
      meetings: {
        ...ruleSet.meetings,
        allowedMeetingTypes: [...ruleSet.meetings.allowedMeetingTypes],
      },
      sponsorContact: { ...ruleSet.sponsorContact },
    })),
    alertPreferences: store.alertPreferences.map((preference) => ({ ...preference })),
    residentHousingProfile: store.residentHousingProfile
      ? { ...store.residentHousingProfile }
      : null,
    residentRequirementProfile: store.residentRequirementProfile
      ? { ...store.residentRequirementProfile }
      : null,
    residentConsentRecord: store.residentConsentRecord
      ? {
          ...store.residentConsentRecord,
          signatureRef: store.residentConsentRecord.signatureRef
            ? { ...store.residentConsentRecord.signatureRef }
            : null,
        }
      : null,
    residentWizardDraft: store.residentWizardDraft
      ? {
          ...store.residentWizardDraft,
          consentSignatureRef: store.residentWizardDraft.consentSignatureRef
            ? { ...store.residentWizardDraft.consentSignatureRef }
            : null,
        }
      : null,
    auditLogEntries: store.auditLogEntries.map((entry) => ({
      ...entry,
      actor: { ...entry.actor },
    })),
  };
}
