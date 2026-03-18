import type {
  AlertPreference,
  ChatMessage,
  ChatMessageReceipt,
  ChatParticipant,
  ChatThread,
  ChoreCompletionRecord,
  CorrectiveAction,
  EvidenceItem,
  House,
  HouseAlertAnnouncement,
  HouseChore,
  HouseGroup,
  HouseMeeting,
  JobApplicationRecord,
  HouseRuleSet,
  MonthlyReport,
  Organization,
  OneOnOneSession,
  RecurringObligation,
  ResidentHouseMembership,
  SoberHouseUserAccessProfile,
  SoberHouseSettingsStore,
  StaffAssignment,
  Violation,
  WorkVerificationRecord,
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

export function createDefaultSoberHouseUserAccessProfile(
  now: string,
  linkedUserId: string,
  id = createEntityId("user-access"),
): SoberHouseUserAccessProfile {
  return {
    id,
    linkedUserId,
    role: "UNASSIGNED",
    organizationId: null,
    houseId: null,
    houseGroupId: null,
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
    houseGroupId: null,
    name: "",
    address: "",
    phone: "",
    geofenceCenterLat: null,
    geofenceCenterLng: null,
    geofenceRadiusFeetDefault: DEFAULT_HOUSE_GEOFENCE_RADIUS_FEET,
    houseTypes: ["OTHER"],
    bedCount: 0,
    notes: "",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultHouseGroup(
  now: string,
  organizationId: string | null,
  id = createEntityId("house-group"),
): HouseGroup {
  return {
    id,
    organizationId,
    name: "",
    houseIds: [],
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
    scopeType: "HOUSE",
    houseId,
    houseGroupId: null,
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
      proofRequirement: ["CHECKLIST"],
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
      proofMethod: "GEOFENCE_SIGNATURE",
    },
    sponsorContact: {
      enabled: false,
      contactsRequiredPerWeek: 0,
      proofType: "CALL_LOG",
    },
    oneOnOne: {
      enabled: false,
      defaultFrequency: "WEEKLY",
      defaultWeekday: "TUE",
      defaultTimeLocalHhmm: "15:00",
      defaultLeadTimeMinutes: 30,
      addToCalendarByDefault: true,
      reminderEnabledByDefault: true,
    },
    operations: {
      choresEnabled: false,
      houseMeetingsEnabled: false,
      houseMeetingsRequired: false,
      oneOnOneSessionsEnabled: false,
      oneOnOneSessionsRequired: false,
      houseAlertsEnabled: false,
      announcementsEnabled: false,
      complianceSnapshotEnabled: true,
    },
    support: {
      defaultReminderLeadMinutes: 30,
      defaultAddToCalendar: false,
      defaultInAppReminders: false,
      requireHouseMeetingAcknowledgment: false,
      requireAnnouncementAcknowledgment: false,
      requireOneOnOneManagerConfirmation: false,
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

export function createDefaultResidentHouseMembership(
  now: string,
  residentId: string,
  linkedUserId: string,
  organizationId: string | null,
  houseId: string | null,
  id = createEntityId("resident-house-membership"),
): ResidentHouseMembership {
  return {
    id,
    residentId,
    linkedUserId,
    organizationId,
    houseId,
    roomOrBed: "",
    moveInDate: now.slice(0, 10),
    moveOutDate: null,
    isPrimary: true,
    status: "ACTIVE",
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultRecurringObligation(
  now: string,
  organizationId: string | null,
  houseId: string | null,
  residentId: string | null,
  linkedUserId: string | null,
  id = createEntityId("recurring-obligation"),
): RecurringObligation {
  return {
    id,
    organizationId,
    houseId,
    residentId,
    linkedUserId,
    obligationType: "HOUSE_MEETING",
    title: "",
    detail: "",
    frequency: "WEEKLY",
    weekday: "MON",
    scheduledDate: null,
    timeLocalHhmm: "18:00",
    required: false,
    reminderLeadMinutes: 30,
    inAppReminderEnabled: false,
    addToCalendar: false,
    accountabilityMethod: "NONE",
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultHouseMeeting(
  now: string,
  organizationId: string | null,
  houseId: string | null,
  id = createEntityId("house-meeting"),
): HouseMeeting {
  return {
    id,
    organizationId,
    houseId,
    recurringObligationId: null,
    title: "",
    description: "",
    meetingKind: "HOUSE_MEETING",
    locationLabel: "",
    startsAt: now,
    endsAt: null,
    required: false,
    reminderLeadMinutes: 30,
    inAppReminderEnabled: false,
    addToCalendar: false,
    acknowledgmentRequired: false,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultOneOnOneSession(
  now: string,
  residentId: string,
  linkedUserId: string,
  organizationId: string | null,
  houseId: string | null,
  id = createEntityId("one-on-one-session"),
): OneOnOneSession {
  return {
    id,
    organizationId,
    houseId,
    residentId,
    linkedUserId,
    staffAssignmentId: null,
    recurringObligationId: null,
    title: "One-on-one",
    notes: "",
    scheduledAt: now,
    endsAt: null,
    required: false,
    reminderLeadMinutes: 30,
    inAppReminderEnabled: false,
    addToCalendar: false,
    managerConfirmationRequired: false,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultHouseChore(
  now: string,
  organizationId: string | null,
  houseId: string | null,
  residentId: string | null,
  linkedUserId: string | null,
  id = createEntityId("house-chore"),
): HouseChore {
  return {
    id,
    organizationId,
    houseId,
    residentId,
    linkedUserId,
    recurringObligationId: null,
    title: "",
    summary: "",
    frequency: "WEEKLY",
    dueTimeLocalHhmm: "18:00",
    weekday: null,
    scheduledDate: null,
    required: false,
    proofRequirement: ["NONE"],
    reminderLeadMinutes: 30,
    inAppReminderEnabled: false,
    addToCalendar: false,
    accountabilityRequired: false,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultHouseAlertAnnouncement(
  now: string,
  organizationId: string | null,
  houseId: string | null,
  id = createEntityId("house-alert"),
): HouseAlertAnnouncement {
  return {
    id,
    organizationId,
    houseId,
    recurringObligationId: null,
    title: "",
    body: "",
    severity: "INFO",
    startsAt: now,
    endsAt: null,
    reminderLeadMinutes: 0,
    inAppReminderEnabled: false,
    addToCalendar: false,
    acknowledgmentRequired: false,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultChoreCompletionRecord(
  now: string,
  residentId: string,
  linkedUserId: string,
  organizationId: string | null,
  houseId: string | null,
  id = createEntityId("chore-completion"),
): ChoreCompletionRecord {
  return {
    id,
    residentId,
    linkedUserId,
    organizationId,
    houseId,
    houseChoreId: null,
    completedAt: now,
    proofRequirement: ["NONE"],
    proofProvided: false,
    proofReference: null,
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultJobApplicationRecord(
  now: string,
  residentId: string,
  linkedUserId: string,
  organizationId: string | null,
  houseId: string | null,
  id = createEntityId("job-application"),
): JobApplicationRecord {
  return {
    id,
    residentId,
    linkedUserId,
    organizationId,
    houseId,
    employerName: "",
    appliedAt: now,
    proofProvided: false,
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultWorkVerificationRecord(
  now: string,
  residentId: string,
  linkedUserId: string,
  organizationId: string | null,
  houseId: string | null,
  id = createEntityId("work-verification"),
): WorkVerificationRecord {
  return {
    id,
    residentId,
    linkedUserId,
    organizationId,
    houseId,
    verifiedAt: now,
    verificationMethod: "SELF_REPORTED",
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultViolation(
  now: string,
  residentId: string,
  linkedUserId: string,
  organizationId: string | null,
  houseId: string | null,
  id = createEntityId("violation"),
): Violation {
  return {
    id,
    residentId,
    linkedUserId,
    houseId,
    organizationId,
    ruleType: "other",
    sourceEvaluationReference: null,
    sourceEvaluationSnapshot: null,
    complianceWindowKey: `${residentId}:other:${now.slice(0, 10)}`,
    triggeredAt: now,
    effectiveAt: now,
    dueAt: null,
    gracePeriodMinutesUsed: null,
    status: "OPEN",
    severity: "VIOLATION",
    reasonSummary: "",
    managerNotes: "",
    resolutionNotes: "",
    createdBy: "MANUAL",
    reviewedBy: null,
    reviewedAt: null,
    resolvedBy: null,
    resolvedAt: null,
    correctiveActionIds: [],
    evidenceItemIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultCorrectiveAction(
  now: string,
  violationId: string,
  residentId: string,
  linkedUserId: string,
  organizationId: string | null,
  houseId: string | null,
  assignedBy: { id: string; name: string },
  id = createEntityId("corrective-action"),
): CorrectiveAction {
  return {
    id,
    violationId,
    residentId,
    linkedUserId,
    houseId,
    organizationId,
    actionType: "WARNING",
    assignedBy,
    assignedAt: now,
    dueAt: null,
    notes: "",
    status: "OPEN",
    completedAt: null,
    completionNotes: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultEvidenceItem(
  now: string,
  residentId: string,
  linkedUserId: string,
  organizationId: string | null,
  houseId: string | null,
  createdBy: { id: string; name: string },
  id = createEntityId("evidence"),
): EvidenceItem {
  return {
    id,
    residentId,
    linkedUserId,
    houseId,
    organizationId,
    linkedViolationId: null,
    linkedCorrectiveActionId: null,
    evidenceType: "NOTE",
    assetReference: null,
    createdAt: now,
    createdBy,
    metadata: {},
    description: "",
  };
}

export function createDefaultChatThread(
  now: string,
  createdBy: { id: string; name: string },
  id = createEntityId("chat-thread"),
): ChatThread {
  return {
    id,
    threadType: "DIRECT",
    moduleContext: "SOBER_HOUSE",
    houseId: null,
    residentId: null,
    linkedViolationId: null,
    createdBy,
    createdAt: now,
    lastMessageAt: null,
    active: true,
    metadata: {},
  };
}

export function createDefaultChatParticipant(
  now: string,
  threadId: string,
  userId: string,
  id = createEntityId("chat-participant"),
): ChatParticipant {
  return {
    id,
    threadId,
    userId,
    roleInThread: "SYSTEM",
    joinedAt: now,
    active: true,
    lastReadAt: null,
    notificationPreferences: {},
  };
}

export function createDefaultChatMessage(
  now: string,
  threadId: string,
  senderUserId: string,
  id = createEntityId("chat-message"),
): ChatMessage {
  return {
    id,
    threadId,
    senderUserId,
    senderRole: "SYSTEM",
    messageType: "NORMAL",
    bodyText: "",
    createdAt: now,
    editedAt: null,
    active: true,
    linkedViolationId: null,
    linkedCorrectiveActionId: null,
    metadata: {},
  };
}

export function createDefaultChatMessageReceipt(
  messageId: string,
  userId: string,
  id = createEntityId("chat-receipt"),
): ChatMessageReceipt {
  return {
    id,
    messageId,
    userId,
    deliveredAt: null,
    readAt: null,
    acknowledgedAt: null,
  };
}

export function createDefaultMonthlyReport(
  now: string,
  houseId: string,
  snapshot: MonthlyReport["summaryPayload"],
  id = createEntityId("monthly-report"),
): MonthlyReport {
  return {
    id,
    type: snapshot.reportKind === "resident_monthly" ? "RESIDENT_MONTHLY" : "HOUSE_MONTHLY",
    residentId: snapshot.reportKind === "resident_monthly" ? snapshot.resident.residentId : null,
    houseId,
    organizationId: null,
    periodStart: now,
    periodEnd: now,
    generatedAt: now,
    generatedBy: "USER",
    generatedByUserId: null,
    status: "GENERATED",
    summaryPayload: snapshot,
    reviewedAt: null,
    reviewedBy: null,
    approvedAt: null,
    approvedBy: null,
    lockedAt: null,
    versionNumber: 1,
    isCurrentVersion: true,
    supersedesReportId: null,
    exportRef: null,
    exportHistory: [],
    distributionMetadata: {
      recipientType: null,
      recipientTarget: null,
      deliveryMethod: null,
      sentStatus: null,
      sentAt: null,
    },
    notes: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneSoberHouseStore(store: SoberHouseSettingsStore): SoberHouseSettingsStore {
  return {
    version: store.version,
    userAccessProfile: store.userAccessProfile ? { ...store.userAccessProfile } : null,
    organization: store.organization ? { ...store.organization } : null,
    houseGroups: store.houseGroups.map((group) => ({
      ...group,
      houseIds: [...group.houseIds],
    })),
    houses: store.houses.map((house) => ({ ...house, houseTypes: [...house.houseTypes] })),
    staffAssignments: store.staffAssignments.map((assignment) => ({
      ...assignment,
      assignedHouseIds: [...assignment.assignedHouseIds],
    })),
    houseRuleSets: store.houseRuleSets.map((ruleSet) => ({
      ...ruleSet,
      curfew: { ...ruleSet.curfew },
      chores: {
        ...ruleSet.chores,
        proofRequirement: [...ruleSet.chores.proofRequirement],
      },
      employment: { ...ruleSet.employment },
      jobSearch: { ...ruleSet.jobSearch },
      meetings: {
        ...ruleSet.meetings,
        allowedMeetingTypes: [...ruleSet.meetings.allowedMeetingTypes],
      },
      sponsorContact: { ...ruleSet.sponsorContact },
      oneOnOne: { ...ruleSet.oneOnOne },
      operations: { ...ruleSet.operations },
      support: { ...ruleSet.support },
    })),
    residentHouseMemberships: store.residentHouseMemberships.map((membership) => ({
      ...membership,
    })),
    recurringObligations: store.recurringObligations.map((obligation) => ({
      ...obligation,
    })),
    houseMeetings: store.houseMeetings.map((meeting) => ({ ...meeting })),
    oneOnOneSessions: store.oneOnOneSessions.map((session) => ({ ...session })),
    houseChores: store.houseChores.map((chore) => ({
      ...chore,
      proofRequirement: [...chore.proofRequirement],
    })),
    houseAlertAnnouncements: store.houseAlertAnnouncements.map((announcement) => ({
      ...announcement,
    })),
    alertPreferences: store.alertPreferences.map((preference) => ({ ...preference })),
    residentHousingProfile: store.residentHousingProfile
      ? { ...store.residentHousingProfile }
      : null,
    residentRequirementProfile: store.residentRequirementProfile
      ? {
          ...store.residentRequirementProfile,
          oneOnOneNotificationIds: [...store.residentRequirementProfile.oneOnOneNotificationIds],
        }
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
    choreCompletionRecords: store.choreCompletionRecords.map((record) => ({
      ...record,
      proofRequirement: [...record.proofRequirement],
    })),
    jobApplicationRecords: store.jobApplicationRecords.map((record) => ({ ...record })),
    workVerificationRecords: store.workVerificationRecords.map((record) => ({ ...record })),
    violations: store.violations.map((violation) => ({
      ...violation,
      sourceEvaluationSnapshot: violation.sourceEvaluationSnapshot
        ? {
            ...violation.sourceEvaluationSnapshot,
            metadata: { ...violation.sourceEvaluationSnapshot.metadata },
          }
        : null,
      reviewedBy: violation.reviewedBy ? { ...violation.reviewedBy } : null,
      resolvedBy: violation.resolvedBy ? { ...violation.resolvedBy } : null,
      correctiveActionIds: [...violation.correctiveActionIds],
      evidenceItemIds: [...violation.evidenceItemIds],
    })),
    correctiveActions: store.correctiveActions.map((action) => ({
      ...action,
      assignedBy: { ...action.assignedBy },
    })),
    evidenceItems: store.evidenceItems.map((item) => ({
      ...item,
      createdBy: { ...item.createdBy },
      metadata: { ...item.metadata },
    })),
    chatThreads: store.chatThreads.map((thread) => ({
      ...thread,
      createdBy: { ...thread.createdBy },
      metadata: { ...thread.metadata },
    })),
    chatParticipants: store.chatParticipants.map((participant) => ({
      ...participant,
      notificationPreferences: { ...participant.notificationPreferences },
    })),
    chatMessages: store.chatMessages.map((message) => ({
      ...message,
      metadata: { ...message.metadata },
    })),
    chatMessageReceipts: store.chatMessageReceipts.map((receipt) => ({ ...receipt })),
    monthlyReports: store.monthlyReports.map((report) => ({
      ...report,
      summaryPayload: JSON.parse(
        JSON.stringify(report.summaryPayload),
      ) as MonthlyReport["summaryPayload"],
      reviewedBy: report.reviewedBy ? { ...report.reviewedBy } : null,
      approvedBy: report.approvedBy ? { ...report.approvedBy } : null,
      exportHistory: report.exportHistory.map((entry) => ({
        ...entry,
        exportedBy: { ...entry.exportedBy },
      })),
      distributionMetadata: { ...report.distributionMetadata },
    })),
    auditLogEntries: store.auditLogEntries.map((entry) => ({
      ...entry,
      actor: { ...entry.actor },
    })),
  };
}
