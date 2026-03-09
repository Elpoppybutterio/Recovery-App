import type { SignatureRef } from "../signatures/signatureStore";

export const SOBER_HOUSE_SETTINGS_STORE_VERSION = 1 as const;

export type EntityStatus = "ACTIVE" | "INACTIVE";
export type HouseType =
  | "MEN"
  | "WOMEN"
  | "CO_ED"
  | "MAT_FRIENDLY"
  | "REENTRY"
  | "YOUNG_ADULT"
  | "OTHER";
export type StaffRole = "OWNER" | "HOUSE_MANAGER" | "ASSISTANT_MANAGER" | "RESIDENT" | "VIEWER";
export type CurfewAlertBasis = "CLOCK_ONLY" | "ESTIMATED_TRAVEL_TIME" | "BOTH";
export type ChoreFrequency = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
export type ProofRequirement = "NONE" | "CHECKLIST" | "PHOTO" | "MANAGER_CONFIRMATION";
export type MeetingType =
  | "AA"
  | "NA"
  | "SMART_RECOVERY"
  | "DHARMA_RECOVERY"
  | "CELEBRATE_RECOVERY"
  | "OTHER";
export type MeetingProofMethod = "GEOFENCE" | "SIGNATURE" | "PHOTO" | "MANAGER_CONFIRMATION";
export type SponsorProofType = "CALL_LOG" | "TEXT_CONFIRMATION" | "MANAGER_CONFIRMATION";
export type AlertDeliveryMethod = "EMAIL" | "SMS" | "BOTH";
export type AlertScope = "ORGANIZATION" | "HOUSE";
export type SoberHouseEntityType =
  | "organization"
  | "house"
  | "staffAssignment"
  | "houseRuleSet"
  | "alertPreference"
  | "residentHousingProfile"
  | "residentRequirementProfile"
  | "residentConsentRecord";
export type ResidentOnboardingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type Option<Value extends string> = {
  value: Value;
  label: string;
};

export const HOUSE_TYPE_OPTIONS: ReadonlyArray<Option<HouseType>> = [
  { value: "MEN", label: "Men" },
  { value: "WOMEN", label: "Women" },
  { value: "CO_ED", label: "Co-ed" },
  { value: "MAT_FRIENDLY", label: "MAT-friendly" },
  { value: "REENTRY", label: "Reentry" },
  { value: "YOUNG_ADULT", label: "Young adult" },
  { value: "OTHER", label: "Other" },
];

export const STAFF_ROLE_OPTIONS: ReadonlyArray<Option<StaffRole>> = [
  { value: "OWNER", label: "Owner" },
  { value: "HOUSE_MANAGER", label: "House manager" },
  { value: "ASSISTANT_MANAGER", label: "Assistant manager" },
  { value: "RESIDENT", label: "Resident" },
  { value: "VIEWER", label: "Viewer" },
];

export const CURFEW_ALERT_BASIS_OPTIONS: ReadonlyArray<Option<CurfewAlertBasis>> = [
  { value: "CLOCK_ONLY", label: "Clock only" },
  { value: "ESTIMATED_TRAVEL_TIME", label: "Estimated travel time" },
  { value: "BOTH", label: "Both" },
];

export const CHORE_FREQUENCY_OPTIONS: ReadonlyArray<Option<ChoreFrequency>> = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Biweekly" },
  { value: "MONTHLY", label: "Monthly" },
];

export const PROOF_REQUIREMENT_OPTIONS: ReadonlyArray<Option<ProofRequirement>> = [
  { value: "NONE", label: "None" },
  { value: "CHECKLIST", label: "Checklist" },
  { value: "PHOTO", label: "Photo" },
  { value: "MANAGER_CONFIRMATION", label: "Manager confirmation" },
];

export const MEETING_TYPE_OPTIONS: ReadonlyArray<Option<MeetingType>> = [
  { value: "AA", label: "AA" },
  { value: "NA", label: "NA" },
  { value: "SMART_RECOVERY", label: "SMART Recovery" },
  { value: "DHARMA_RECOVERY", label: "Recovery Dharma" },
  { value: "CELEBRATE_RECOVERY", label: "Celebrate Recovery" },
  { value: "OTHER", label: "Other" },
];

export const MEETING_PROOF_METHOD_OPTIONS: ReadonlyArray<Option<MeetingProofMethod>> = [
  { value: "GEOFENCE", label: "Geofence" },
  { value: "SIGNATURE", label: "Signature" },
  { value: "PHOTO", label: "Photo" },
  { value: "MANAGER_CONFIRMATION", label: "Manager confirmation" },
];

export const SPONSOR_PROOF_TYPE_OPTIONS: ReadonlyArray<Option<SponsorProofType>> = [
  { value: "CALL_LOG", label: "Call log" },
  { value: "TEXT_CONFIRMATION", label: "Text confirmation" },
  { value: "MANAGER_CONFIRMATION", label: "Manager confirmation" },
];

export const ALERT_DELIVERY_METHOD_OPTIONS: ReadonlyArray<Option<AlertDeliveryMethod>> = [
  { value: "EMAIL", label: "Email" },
  { value: "SMS", label: "SMS" },
  { value: "BOTH", label: "Email + SMS" },
];

export const ALERT_SCOPE_OPTIONS: ReadonlyArray<Option<AlertScope>> = [
  { value: "ORGANIZATION", label: "Organization-wide" },
  { value: "HOUSE", label: "House-specific" },
];

export type AuditActor = {
  id: string;
  name: string;
};

export type Organization = {
  id: string;
  name: string;
  primaryContactName: string;
  primaryPhone: string;
  primaryEmail: string;
  notes: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
};

export type House = {
  id: string;
  organizationId: string | null;
  name: string;
  address: string;
  phone: string;
  geofenceRadiusFeetDefault: number;
  houseTypes: HouseType[];
  bedCount: number;
  notes: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
};

export type StaffAssignment = {
  id: string;
  organizationId: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  role: StaffRole;
  assignedHouseIds: string[];
  receiveRealTimeViolationAlerts: boolean;
  receiveNearMissAlerts: boolean;
  receiveMonthlyReports: boolean;
  canApproveExceptions: boolean;
  canIssueCorrectiveActions: boolean;
  canViewResidentEvidence: boolean;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
};

export type CurfewRuleConfig = {
  enabled: boolean;
  weekdayCurfew: string;
  fridayCurfew: string;
  saturdayCurfew: string;
  sundayCurfew: string;
  gracePeriodMinutes: number;
  preViolationAlertEnabled: boolean;
  preViolationLeadTimeMinutes: number;
  alertBasis: CurfewAlertBasis;
};

export type ChoresRuleConfig = {
  enabled: boolean;
  frequency: ChoreFrequency;
  dueTime: string;
  proofRequirement: ProofRequirement;
  gracePeriodMinutes: number;
  managerInstantNotificationEnabled: boolean;
};

export type EmploymentRuleConfig = {
  employmentRequired: boolean;
  workplaceVerificationEnabled: boolean;
  workplaceGeofenceRadiusDefault: number;
  managerVerificationRequired: boolean;
};

export type JobSearchRuleConfig = {
  applicationsRequiredPerWeek: number;
  proofRequired: boolean;
  managerApprovalRequired: boolean;
};

export type MeetingsRuleConfig = {
  meetingsRequired: boolean;
  meetingsPerWeek: number;
  allowedMeetingTypes: MeetingType[];
  proofMethod: MeetingProofMethod;
};

export type SponsorContactRuleConfig = {
  enabled: boolean;
  contactsRequiredPerWeek: number;
  proofType: SponsorProofType;
};

export type HouseRuleSet = {
  id: string;
  organizationId: string | null;
  houseId: string;
  name: string;
  status: EntityStatus;
  curfew: CurfewRuleConfig;
  chores: ChoresRuleConfig;
  employment: EmploymentRuleConfig;
  jobSearch: JobSearchRuleConfig;
  meetings: MeetingsRuleConfig;
  sponsorContact: SponsorContactRuleConfig;
  createdAt: string;
  updatedAt: string;
};

export type AlertPreference = {
  id: string;
  organizationId: string | null;
  houseId: string | null;
  label: string;
  scope: AlertScope;
  recipientStaffAssignmentId: string | null;
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  deliveryMethod: AlertDeliveryMethod;
  sendRealTimeViolationAlerts: boolean;
  sendNearMissAlerts: boolean;
  sendMonthlyReports: boolean;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
};

export type AuditLogEntry = {
  id: string;
  actor: AuditActor;
  timestamp: string;
  entityType: SoberHouseEntityType;
  entityId: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
};

export type ResidentHousingProfile = {
  id: string;
  residentId: string;
  linkedUserId: string;
  organizationId: string | null;
  houseId: string | null;
  firstName: string;
  lastName: string;
  moveInDate: string;
  roomOrBed: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  programPhaseOnEntry: string;
  status: EntityStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ResidentRequirementProfile = {
  id: string;
  residentId: string;
  linkedUserId: string;
  organizationId: string | null;
  houseId: string | null;
  sourceHouseRuleSetId: string | null;
  inheritanceInitializedAt: string | null;
  workRequired: boolean;
  currentlyEmployed: boolean;
  employerName: string;
  employerAddress: string;
  employerPhone: string;
  expectedWorkScheduleNotes: string;
  jobApplicationsRequiredPerWeek: number;
  meetingsRequiredWeekly: boolean;
  meetingsRequiredCount: number;
  sponsorPresent: boolean;
  sponsorName: string;
  sponsorPhone: string;
  sponsorContactFrequency: string;
  residentCurfewOverrideEnabled: boolean;
  residentCurfewWeekday: string;
  residentCurfewFriday: string;
  residentCurfewSaturday: string;
  residentCurfewSunday: string;
  standingExceptionNotes: string;
  assignedChoreNotes: string;
  proofTypeOverrideNotes: string;
  isHouseManager: boolean;
  isHouseOwner: boolean;
  wantsRealTimeViolationAlerts: boolean;
  wantsNearMissAlerts: boolean;
  wantsMonthlySummaryReports: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ResidentConsentRecord = {
  id: string;
  residentId: string;
  linkedUserId: string;
  organizationId: string | null;
  houseId: string | null;
  consentToHouseRules: boolean;
  consentToLocationVerification: boolean;
  consentToComplianceDocumentation: boolean;
  signatureRef: SignatureRef | null;
  signedAt: string | null;
  acknowledgmentArtifactRef: string | null;
  rulesVersionReference: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ResidentWizardDraft = {
  linkedUserId: string;
  currentStep: ResidentOnboardingStep;
  firstName: string;
  lastName: string;
  assignedHouseId: string | null;
  moveInDate: string;
  roomOrBed: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  programPhaseOnEntry: string;
  housingNotes: string;
  isHouseManager: boolean;
  isHouseOwner: boolean;
  wantsRealTimeViolationAlerts: boolean;
  wantsNearMissAlerts: boolean;
  wantsMonthlySummaryReports: boolean;
  workRequired: boolean;
  currentlyEmployed: boolean;
  employerName: string;
  employerAddress: string;
  employerPhone: string;
  expectedWorkScheduleNotes: string;
  jobApplicationsRequiredPerWeek: number;
  meetingsRequiredWeekly: boolean;
  meetingsRequiredCount: number;
  sponsorPresent: boolean;
  sponsorName: string;
  sponsorPhone: string;
  sponsorContactFrequency: string;
  residentCurfewOverrideEnabled: boolean;
  residentCurfewWeekday: string;
  residentCurfewFriday: string;
  residentCurfewSaturday: string;
  residentCurfewSunday: string;
  standingExceptionNotes: string;
  assignedChoreNotes: string;
  proofTypeOverrideNotes: string;
  consentToHouseRules: boolean;
  consentToLocationVerification: boolean;
  consentToComplianceDocumentation: boolean;
  consentSignatureRef: SignatureRef | null;
  consentSignedAt: string | null;
  updatedAt: string;
};

export type SoberHouseSettingsStore = {
  version: typeof SOBER_HOUSE_SETTINGS_STORE_VERSION;
  organization: Organization | null;
  houses: House[];
  staffAssignments: StaffAssignment[];
  houseRuleSets: HouseRuleSet[];
  alertPreferences: AlertPreference[];
  residentHousingProfile: ResidentHousingProfile | null;
  residentRequirementProfile: ResidentRequirementProfile | null;
  residentConsentRecord: ResidentConsentRecord | null;
  residentWizardDraft: ResidentWizardDraft | null;
  auditLogEntries: AuditLogEntry[];
};
