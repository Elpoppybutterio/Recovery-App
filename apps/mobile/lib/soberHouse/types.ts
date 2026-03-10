import type { SignatureRef } from "../signatures/signatureStore";

export const SOBER_HOUSE_SETTINGS_STORE_VERSION = 5 as const;

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
  | "residentConsentRecord"
  | "choreCompletionRecord"
  | "jobApplicationRecord"
  | "workVerificationRecord"
  | "violation"
  | "correctiveAction"
  | "evidenceItem"
  | "chatThread"
  | "chatParticipant"
  | "chatMessage"
  | "chatMessageReceipt"
  | "monthlyReport";
export type ResidentOnboardingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type ComplianceRuleType =
  | "curfew"
  | "chores"
  | "work"
  | "jobSearch"
  | "meetings"
  | "sponsorContact";
export type ComplianceStatus =
  | "compliant"
  | "at_risk"
  | "violation"
  | "not_applicable"
  | "incomplete_setup";
export type ComplianceConfigSource = "resident" | "house" | "organization" | "none";
export type WorkVerificationMethod = "SELF_REPORTED" | "MANAGER_CONFIRMATION";
export type ViolationRuleType =
  | "curfew"
  | "chores"
  | "work"
  | "jobSearch"
  | "meetings"
  | "sponsorContact"
  | "other";
export type ViolationStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "CORRECTIVE_ACTION_ASSIGNED"
  | "RESOLVED"
  | "DISMISSED";
export type ViolationSeverity = "INFORMATIONAL" | "WARNING" | "VIOLATION" | "CRITICAL";
export type ViolationCreatedBy = "SYSTEM" | "MANUAL";
export type CorrectiveActionType =
  | "WARNING"
  | "MAKE_UP_CHORE"
  | "EXTRA_MEETING_REQUIREMENT"
  | "MANAGER_CHECK_IN"
  | "SPONSOR_CONTACT_REQUIRED"
  | "REFLECTION_ASSIGNMENT"
  | "PRIVILEGE_RESTRICTION"
  | "BEHAVIOR_CONTRACT_NOTE"
  | "OTHER";
export type CorrectiveActionStatus = "OPEN" | "COMPLETED" | "OVERDUE" | "CANCELED";
export type EvidenceType =
  | "PHOTO"
  | "SIGNATURE"
  | "GEOFENCE_SNAPSHOT_REFERENCE"
  | "ATTENDANCE_REFERENCE"
  | "DOCUMENT"
  | "NOTE"
  | "OTHER";
export type ChatThreadType = "DIRECT" | "VIOLATION_LINKED_DIRECT" | "SYSTEM_LINKED_DIRECT";
export type ChatModuleContext = "SOBER_HOUSE" | "RECOVERY" | "DRUG_COURT" | "PROBATION";
export type ChatParticipantRole =
  | "RESIDENT"
  | "MANAGER"
  | "OWNER"
  | "ASSISTANT_MANAGER"
  | "SPONSOR"
  | "PROBATION_OFFICER"
  | "SYSTEM";
export type ChatMessageType =
  | "NORMAL"
  | "REMINDER"
  | "WARNING"
  | "ACKNOWLEDGMENT_REQUIRED"
  | "CORRECTIVE_ACTION_NOTICE"
  | "SYSTEM_NOTICE";
export type ChatMetadataValue = string | number | boolean | null;
export type MonthlyReportType = "RESIDENT_MONTHLY" | "HOUSE_MONTHLY";
export type MonthlyReportStatus =
  | "DRAFT"
  | "GENERATED"
  | "IN_REVIEW"
  | "APPROVED"
  | "EXPORTED"
  | "SENT";
export type MonthlyReportGeneratedBy = "SYSTEM" | "USER";
export type ReportDistributionRecipientType = "RESIDENT" | "MANAGER" | "OWNER" | "COURT" | "OTHER";
export type ReportDistributionMethod = "EMAIL" | "SMS" | "PORTAL" | "PRINT" | "OTHER";

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

export const VIOLATION_RULE_TYPE_OPTIONS: ReadonlyArray<Option<ViolationRuleType>> = [
  { value: "curfew", label: "Curfew" },
  { value: "chores", label: "Chores" },
  { value: "work", label: "Work" },
  { value: "jobSearch", label: "Job search" },
  { value: "meetings", label: "Meetings" },
  { value: "sponsorContact", label: "Sponsor contact" },
  { value: "other", label: "Other" },
];

export const VIOLATION_STATUS_OPTIONS: ReadonlyArray<Option<ViolationStatus>> = [
  { value: "OPEN", label: "Open" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "CORRECTIVE_ACTION_ASSIGNED", label: "Corrective action assigned" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "DISMISSED", label: "Dismissed" },
];

export const VIOLATION_SEVERITY_OPTIONS: ReadonlyArray<Option<ViolationSeverity>> = [
  { value: "INFORMATIONAL", label: "Informational" },
  { value: "WARNING", label: "Warning" },
  { value: "VIOLATION", label: "Violation" },
  { value: "CRITICAL", label: "Critical" },
];

export const CORRECTIVE_ACTION_TYPE_OPTIONS: ReadonlyArray<Option<CorrectiveActionType>> = [
  { value: "WARNING", label: "Warning" },
  { value: "MAKE_UP_CHORE", label: "Make-up chore" },
  { value: "EXTRA_MEETING_REQUIREMENT", label: "Extra meeting requirement" },
  { value: "MANAGER_CHECK_IN", label: "Manager check-in" },
  { value: "SPONSOR_CONTACT_REQUIRED", label: "Sponsor contact required" },
  { value: "REFLECTION_ASSIGNMENT", label: "Reflection assignment" },
  { value: "PRIVILEGE_RESTRICTION", label: "Privilege restriction" },
  { value: "BEHAVIOR_CONTRACT_NOTE", label: "Behavior contract note" },
  { value: "OTHER", label: "Other" },
];

export const CORRECTIVE_ACTION_STATUS_OPTIONS: ReadonlyArray<Option<CorrectiveActionStatus>> = [
  { value: "OPEN", label: "Open" },
  { value: "COMPLETED", label: "Completed" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "CANCELED", label: "Canceled" },
];

export const EVIDENCE_TYPE_OPTIONS: ReadonlyArray<Option<EvidenceType>> = [
  { value: "PHOTO", label: "Photo" },
  { value: "SIGNATURE", label: "Signature" },
  { value: "GEOFENCE_SNAPSHOT_REFERENCE", label: "Geofence reference" },
  { value: "ATTENDANCE_REFERENCE", label: "Attendance reference" },
  { value: "DOCUMENT", label: "Document" },
  { value: "NOTE", label: "Note" },
  { value: "OTHER", label: "Other" },
];

export const CHAT_MESSAGE_TYPE_OPTIONS: ReadonlyArray<Option<ChatMessageType>> = [
  { value: "NORMAL", label: "Normal" },
  { value: "REMINDER", label: "Reminder" },
  { value: "WARNING", label: "Warning" },
  { value: "ACKNOWLEDGMENT_REQUIRED", label: "Acknowledgment required" },
  { value: "CORRECTIVE_ACTION_NOTICE", label: "Corrective action notice" },
  { value: "SYSTEM_NOTICE", label: "System notice" },
];

export type AuditActor = {
  id: string;
  name: string;
};

export type ReportMetricValue = {
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  label: string;
};

export type ReportWinSummary = {
  id: string;
  label: string;
  value: string;
  detail: string;
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
  geofenceCenterLat: number | null;
  geofenceCenterLng: number | null;
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
  actionTaken: string | null;
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

export type ChoreCompletionRecord = {
  id: string;
  residentId: string;
  linkedUserId: string;
  organizationId: string | null;
  houseId: string | null;
  completedAt: string;
  proofRequirement: ProofRequirement;
  proofProvided: boolean;
  proofReference: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type JobApplicationRecord = {
  id: string;
  residentId: string;
  linkedUserId: string;
  organizationId: string | null;
  houseId: string | null;
  employerName: string;
  appliedAt: string;
  proofProvided: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkVerificationRecord = {
  id: string;
  residentId: string;
  linkedUserId: string;
  organizationId: string | null;
  houseId: string | null;
  verifiedAt: string;
  verificationMethod: WorkVerificationMethod;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Violation = {
  id: string;
  residentId: string;
  linkedUserId: string;
  houseId: string | null;
  organizationId: string | null;
  ruleType: ViolationRuleType;
  sourceEvaluationReference: string | null;
  sourceEvaluationSnapshot: ComplianceEvaluation | null;
  complianceWindowKey: string;
  triggeredAt: string;
  effectiveAt: string;
  dueAt: string | null;
  gracePeriodMinutesUsed: number | null;
  status: ViolationStatus;
  severity: ViolationSeverity;
  reasonSummary: string;
  managerNotes: string;
  resolutionNotes: string;
  createdBy: ViolationCreatedBy;
  reviewedBy: AuditActor | null;
  reviewedAt: string | null;
  resolvedBy: AuditActor | null;
  resolvedAt: string | null;
  correctiveActionIds: string[];
  evidenceItemIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type CorrectiveAction = {
  id: string;
  violationId: string;
  residentId: string;
  linkedUserId: string;
  houseId: string | null;
  organizationId: string | null;
  actionType: CorrectiveActionType;
  assignedBy: AuditActor;
  assignedAt: string;
  dueAt: string | null;
  notes: string;
  status: CorrectiveActionStatus;
  completedAt: string | null;
  completionNotes: string;
  createdAt: string;
  updatedAt: string;
};

export type EvidenceItem = {
  id: string;
  residentId: string;
  linkedUserId: string;
  houseId: string | null;
  organizationId: string | null;
  linkedViolationId: string | null;
  linkedCorrectiveActionId: string | null;
  evidenceType: EvidenceType;
  assetReference: string | null;
  createdAt: string;
  createdBy: AuditActor;
  metadata: Record<string, string | number | boolean | null>;
  description: string;
};

export type ChatThread = {
  id: string;
  threadType: ChatThreadType;
  moduleContext: ChatModuleContext;
  houseId: string | null;
  residentId: string | null;
  linkedViolationId: string | null;
  createdBy: AuditActor;
  createdAt: string;
  lastMessageAt: string | null;
  active: boolean;
  metadata: Record<string, ChatMetadataValue>;
};

export type ChatParticipant = {
  id: string;
  threadId: string;
  userId: string;
  roleInThread: ChatParticipantRole;
  joinedAt: string;
  active: boolean;
  lastReadAt: string | null;
  notificationPreferences: Record<string, ChatMetadataValue>;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  senderUserId: string;
  senderRole: ChatParticipantRole;
  messageType: ChatMessageType;
  bodyText: string;
  createdAt: string;
  editedAt: string | null;
  active: boolean;
  linkedViolationId: string | null;
  linkedCorrectiveActionId: string | null;
  metadata: Record<string, ChatMetadataValue>;
};

export type ChatMessageReceipt = {
  id: string;
  messageId: string;
  userId: string;
  deliveredAt: string | null;
  readAt: string | null;
  acknowledgedAt: string | null;
};

export type ResidentMonthlyReportSnapshot = {
  reportKind: "resident_monthly";
  reportMonth: string;
  resident: {
    residentId: string;
    residentName: string;
    houseId: string | null;
    houseName: string;
    moveInDate: string | null;
    programPhaseOnEntry: string | null;
  };
  complianceSummary: {
    curfew: ReportMetricValue & { summary: string };
    chores: ReportMetricValue & { summary: string };
    work: ReportMetricValue & { summary: string };
    jobSearch: ReportMetricValue & { summary: string };
    meetings: ReportMetricValue & {
      summary: string;
      requiredCount: number | null;
      completedCount: number | null;
      remainingCount: number | null;
    };
    sponsorContact: {
      applicable: boolean;
      summary: string;
      requiredContacts: number | null;
    };
  };
  kpis: {
    curfewComplianceRate: ReportMetricValue;
    choreCompletionRate: ReportMetricValue;
    meetingComplianceRate: ReportMetricValue;
    employmentComplianceRate: ReportMetricValue;
    jobSearchCompletionRate: ReportMetricValue;
    totalViolations: number;
    violationsByRuleType: Partial<Record<ViolationRuleType, number>>;
    correctiveActionsOpen: number;
    correctiveActionsCompleted: number;
    correctiveActionsOverdue: number;
    acknowledgmentRequiredMessages: number;
    acknowledgmentCompletionRate: ReportMetricValue;
  };
  violationsSummary: {
    totalViolations: number;
    violationsByType: Partial<Record<ViolationRuleType, number>>;
    openCount: number;
    resolvedCount: number;
    dismissedCount: number;
    notableIncidents: Array<{
      id: string;
      ruleType: ViolationRuleType;
      reasonSummary: string;
      triggeredAt: string;
      status: ViolationStatus;
    }>;
  };
  correctiveActionSummary: {
    totalAssigned: number;
    openCount: number;
    completedCount: number;
    overdueCount: number;
  };
  communicationSummary: {
    structuredMessageCount: number;
    acknowledgmentRequiredCount: number;
    acknowledgmentCompletedCount: number;
    acknowledgmentCompletionSummary: string;
  };
  winsSummary: ReportWinSummary[];
  notesSection: {
    monthlySummary: string | null;
    progressSummary: string | null;
    concernsPriorities: string | null;
    encouragementStrengths: string | null;
  };
};

export type HouseMonthlyReportSnapshot = {
  reportKind: "house_monthly";
  reportMonth: string;
  house: {
    houseId: string;
    houseName: string;
    organizationId: string | null;
    activeResidentCount: number;
    staffSummary: string[];
  };
  kpis: {
    curfewComplianceRate: ReportMetricValue;
    choreCompletionRate: ReportMetricValue;
    meetingComplianceRate: ReportMetricValue;
    employmentComplianceRate: ReportMetricValue;
    jobSearchCompletionRate: ReportMetricValue;
    totalViolations: number;
    violationsByRuleType: Partial<Record<ViolationRuleType, number>>;
    correctiveActionsOpen: number;
    correctiveActionsResolved: number;
    acknowledgmentRequiredMessages: number;
    acknowledgmentCompletionRate: ReportMetricValue;
  };
  operationsSummary: {
    residentsInGoodStandingCount: number;
    residentsWithUnresolvedIssuesCount: number;
    residentsWithRepeatedViolationsCount: number;
    acknowledgmentRequiredCommunicationCount: number;
  };
  winsSummary: ReportWinSummary[];
  notesSection: {
    monthlySummary: string | null;
    operationalConcerns: string | null;
    followUpPriorities: string | null;
  };
  residentHighlights: Array<{
    residentId: string;
    residentName: string;
    zeroViolations: boolean;
    metMeetingGoals: boolean;
    maintainedChoreCompliance: boolean;
  }>;
};

export type MonthlyReportSnapshot = ResidentMonthlyReportSnapshot | HouseMonthlyReportSnapshot;

export type MonthlyReportExportRecord = {
  id: string;
  exportedAt: string;
  exportedBy: AuditActor;
  exportRef: string;
};

export type MonthlyReportDistributionMetadata = {
  recipientType: ReportDistributionRecipientType | null;
  recipientTarget: string | null;
  deliveryMethod: ReportDistributionMethod | null;
  sentStatus: "READY" | "SENT" | null;
  sentAt: string | null;
};

export type MonthlyReport = {
  id: string;
  type: MonthlyReportType;
  residentId: string | null;
  houseId: string;
  organizationId: string | null;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  generatedBy: MonthlyReportGeneratedBy;
  generatedByUserId: string | null;
  status: MonthlyReportStatus;
  summaryPayload: MonthlyReportSnapshot;
  reviewedAt: string | null;
  reviewedBy: AuditActor | null;
  approvedAt: string | null;
  approvedBy: AuditActor | null;
  lockedAt: string | null;
  versionNumber: number;
  isCurrentVersion: boolean;
  supersedesReportId: string | null;
  exportRef: string | null;
  exportHistory: MonthlyReportExportRecord[];
  distributionMetadata: MonthlyReportDistributionMetadata;
  notes: string | null;
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
  choreCompletionRecords: ChoreCompletionRecord[];
  jobApplicationRecords: JobApplicationRecord[];
  workVerificationRecords: WorkVerificationRecord[];
  violations: Violation[];
  correctiveActions: CorrectiveAction[];
  evidenceItems: EvidenceItem[];
  chatThreads: ChatThread[];
  chatParticipants: ChatParticipant[];
  chatMessages: ChatMessage[];
  chatMessageReceipts: ChatMessageReceipt[];
  monthlyReports: MonthlyReport[];
  auditLogEntries: AuditLogEntry[];
};

export type ComplianceEvaluation = {
  ruleType: ComplianceRuleType;
  residentId: string;
  houseId: string | null;
  status: ComplianceStatus;
  statusReason: string;
  effectiveTargetValue: string | number | boolean | null;
  actualValue: string | number | boolean | null;
  dueAt: string | null;
  evaluatedAt: string;
  configSource: ComplianceConfigSource;
  metadata: Record<string, string | number | boolean | null>;
};

export type ResidentComplianceSummary = {
  residentId: string;
  houseId: string | null;
  evaluatedAt: string;
  evaluations: ComplianceEvaluation[];
};
