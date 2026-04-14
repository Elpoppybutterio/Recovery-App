import AsyncStorage from "@react-native-async-storage/async-storage";
import { createDefaultSoberHouseSettingsStore } from "./defaults";
import type { ScheduledItemCompletionRecord, SoberHouseSettingsStore } from "./types";
import { SOBER_HOUSE_SETTINGS_STORE_VERSION } from "./types";

const SOBER_HOUSE_SETTINGS_STORAGE_KEY_PREFIX = "recovery:sober-house-settings:v1:";

export function soberHouseSettingsStorageKey(userId: string): string {
  return `${SOBER_HOUSE_SETTINGS_STORAGE_KEY_PREFIX}${userId}`;
}

function isScheduledItemProofRequirement(
  value: unknown,
): value is ScheduledItemCompletionRecord["proofRequirement"][number] {
  return (
    value === "NONE" ||
    value === "CHECKLIST" ||
    value === "PHOTO" ||
    value === "MANAGER_CONFIRMATION" ||
    value === "SIGNATURE" ||
    value === "ACKNOWLEDGMENT"
  );
}

export function normalizeSoberHouseSettingsStore(value: unknown): SoberHouseSettingsStore {
  if (!value || typeof value !== "object") {
    return createDefaultSoberHouseSettingsStore();
  }

  const candidate = value as Partial<SoberHouseSettingsStore>;
  const version =
    "version" in (value as Record<string, unknown>)
      ? (value as { version?: number }).version
      : undefined;
  if (
    version !== 1 &&
    version !== 2 &&
    version !== 3 &&
    version !== 4 &&
    version !== 5 &&
    version !== 6 &&
    version !== 7 &&
    version !== 8 &&
    version !== 10 &&
    version !== 12 &&
    version !== 13 &&
    version !== 14 &&
    version !== SOBER_HOUSE_SETTINGS_STORE_VERSION
  ) {
    return createDefaultSoberHouseSettingsStore();
  }

  const monthlyReports = Array.isArray(candidate.monthlyReports)
    ? candidate.monthlyReports.map((report) => ({
        ...report,
        reviewedAt: report.reviewedAt ?? null,
        reviewedBy: report.reviewedBy ?? null,
        approvedAt: report.approvedAt ?? null,
        approvedBy: report.approvedBy ?? null,
        lockedAt: report.lockedAt ?? null,
        versionNumber: report.versionNumber ?? 1,
        isCurrentVersion: report.isCurrentVersion ?? true,
        supersedesReportId: report.supersedesReportId ?? null,
        exportRef: report.exportRef ?? null,
        exportHistory: Array.isArray(report.exportHistory) ? report.exportHistory : [],
        distributionMetadata: report.distributionMetadata ?? {
          recipientType: null,
          recipientTarget: null,
          deliveryMethod: null,
          sentStatus: null,
          sentAt: null,
        },
      }))
    : [];
  const operatorReportExports = Array.isArray(candidate.operatorReportExports)
    ? candidate.operatorReportExports.map((record) => ({
        ...record,
        organizationId: record.organizationId ?? null,
        houseId: record.houseId ?? null,
        residentId: record.residentId ?? null,
        generatedBy: record.generatedBy ?? { id: "system", name: "System" },
        itemCount:
          typeof record.itemCount === "number" && Number.isFinite(record.itemCount)
            ? record.itemCount
            : 0,
        filters: {
          startDate: record.filters?.startDate ?? record.periodStart.slice(0, 10),
          endDate: record.filters?.endDate ?? record.periodEnd.slice(0, 10),
          organizationId: record.filters?.organizationId ?? record.organizationId ?? null,
          houseId: record.filters?.houseId ?? record.houseId ?? null,
          residentId: record.filters?.residentId ?? record.residentId ?? null,
          complianceBand: record.filters?.complianceBand ?? "ALL",
          onlyOpenViolations: record.filters?.onlyOpenViolations ?? false,
          onlyMissingProof: record.filters?.onlyMissingProof ?? false,
          onlyOverdue: record.filters?.onlyOverdue ?? false,
          highRiskOnly: record.filters?.highRiskOnly ?? false,
        },
      }))
    : [];
  const scheduledSummaryRecords = Array.isArray(candidate.scheduledSummaryRecords)
    ? candidate.scheduledSummaryRecords.map((record) => ({
        ...record,
        organizationId: record.organizationId ?? null,
        houseId: record.houseId ?? null,
        residentId: record.residentId ?? null,
        generatedBy: record.generatedBy ?? { id: "system", name: "System" },
        highlights: Array.isArray(record.highlights) ? record.highlights : [],
        metrics: Array.isArray(record.metrics) ? record.metrics : [],
        filters: {
          startDate: record.filters?.startDate ?? record.periodStart.slice(0, 10),
          endDate: record.filters?.endDate ?? record.periodEnd.slice(0, 10),
          organizationId: record.filters?.organizationId ?? record.organizationId ?? null,
          houseId: record.filters?.houseId ?? record.houseId ?? null,
          residentId: record.filters?.residentId ?? record.residentId ?? null,
          complianceBand: record.filters?.complianceBand ?? "ALL",
          onlyOpenViolations: record.filters?.onlyOpenViolations ?? false,
          onlyMissingProof: record.filters?.onlyMissingProof ?? false,
          onlyOverdue: record.filters?.onlyOverdue ?? false,
          highRiskOnly: record.filters?.highRiskOnly ?? false,
        },
      }))
    : [];
  const proofReviewRecords = Array.isArray(candidate.proofReviewRecords)
    ? candidate.proofReviewRecords.map((record) => ({
        ...record,
        linkedEnforcementRecordId: record.linkedEnforcementRecordId ?? null,
        proofRequired: record.proofRequired ?? true,
        proofProvided: record.proofProvided ?? false,
        proofReference: record.proofReference ?? null,
        evidenceItemIds: Array.isArray(record.evidenceItemIds) ? record.evidenceItemIds : [],
        submittedAt: record.submittedAt ?? null,
        status: record.status ?? "PENDING",
        reviewedAt: record.reviewedAt ?? null,
        reviewedBy: record.reviewedBy ?? null,
        history: Array.isArray(record.history)
          ? record.history.map((entry) => ({
              ...entry,
              note: entry.note ?? "",
              previousStatus: entry.previousStatus ?? null,
              nextStatus: entry.nextStatus ?? "PENDING",
              actor: entry.actor ?? { id: "system", name: "System" },
            }))
          : [],
      }))
    : [];
  const alertAcknowledgementRecords = Array.isArray(candidate.alertAcknowledgementRecords)
    ? candidate.alertAcknowledgementRecords.map(
        (record): SoberHouseSettingsStore["alertAcknowledgementRecords"][number] => ({
          ...record,
          organizationId: record.organizationId ?? null,
          houseId: record.houseId ?? null,
          required: record.required ?? true,
          status: record.status ?? (record.acknowledgedAt ? "ACKNOWLEDGED" : "PENDING"),
          acknowledgedAt: record.acknowledgedAt ?? null,
          note: record.note ?? "",
        }),
      )
    : [];
  const scheduledItemCompletionRecords = Array.isArray(candidate.scheduledItemCompletionRecords)
    ? candidate.scheduledItemCompletionRecords.map(
        (record): SoberHouseSettingsStore["scheduledItemCompletionRecords"][number] => ({
          ...record,
          organizationId: record.organizationId ?? null,
          houseId: record.houseId ?? null,
          recurringObligationId: record.recurringObligationId ?? null,
          scheduledAt: record.scheduledAt ?? null,
          status:
            record.status ??
            (record.completedAt ? "COMPLETED" : record.excusedAt ? "EXCUSED" : "SCHEDULED"),
          completedAt: record.completedAt ?? null,
          excusedAt: record.excusedAt ?? null,
          excusedReason: record.excusedReason ?? null,
          proofRequired: record.proofRequired ?? false,
          proofRequirement: Array.isArray(record.proofRequirement)
            ? record.proofRequirement.filter(isScheduledItemProofRequirement)
            : record.proofRequirement
              ? isScheduledItemProofRequirement(record.proofRequirement)
                ? [record.proofRequirement]
                : ["NONE"]
              : ["NONE"],
          proofProvided: record.proofProvided ?? false,
          proofReference: record.proofReference ?? null,
          submittedAt: record.submittedAt ?? record.completedAt ?? null,
          managerConfirmationRequired: record.managerConfirmationRequired ?? false,
          managerConfirmationStatus: record.managerConfirmationRequired
            ? (record.managerConfirmationStatus ?? "PENDING")
            : "NOT_REQUIRED",
          managerConfirmationRequestedAt: record.managerConfirmationRequestedAt ?? null,
          managerConfirmationRequestedVia: record.managerConfirmationRequestedVia ?? null,
          managerConfirmedAt: record.managerConfirmedAt ?? null,
          notes: record.notes ?? "",
        }),
      )
    : [];
  const enforcementRecords = Array.isArray(candidate.enforcementRecords)
    ? candidate.enforcementRecords.map((record) => ({
        ...record,
        assignedStaffAssignmentId: record.assignedStaffAssignmentId ?? null,
        linkedViolationId: record.linkedViolationId ?? null,
        linkedCorrectiveActionId: record.linkedCorrectiveActionId ?? null,
        dueAt: record.dueAt ?? null,
        acknowledgedAt: record.acknowledgedAt ?? null,
        resolvedAt: record.resolvedAt ?? null,
        escalatedAt: record.escalatedAt ?? null,
        history: Array.isArray(record.history)
          ? record.history.map((entry) => ({
              ...entry,
              note: entry.note ?? "",
              previousStatus: entry.previousStatus ?? null,
              nextStatus: entry.nextStatus ?? null,
              previousLevel: entry.previousLevel ?? null,
              nextLevel: entry.nextLevel ?? null,
              assignedStaffAssignmentId: entry.assignedStaffAssignmentId ?? null,
              linkedViolationId: entry.linkedViolationId ?? null,
              actor: entry.actor ?? { id: "system", name: "System" },
            }))
          : [],
      }))
    : [];

  return {
    version: SOBER_HOUSE_SETTINGS_STORE_VERSION,
    userAccessProfile: candidate.userAccessProfile ?? null,
    organization: candidate.organization ?? null,
    houseGroups: Array.isArray(candidate.houseGroups)
      ? candidate.houseGroups.map((group) => ({
          ...group,
          houseIds: Array.isArray(group.houseIds) ? group.houseIds : [],
        }))
      : [],
    houses: Array.isArray(candidate.houses)
      ? candidate.houses.map((house) => ({
          ...house,
          houseGroupId: house.houseGroupId ?? null,
        }))
      : [],
    staffAssignments: Array.isArray(candidate.staffAssignments) ? candidate.staffAssignments : [],
    houseRuleSets: Array.isArray(candidate.houseRuleSets)
      ? candidate.houseRuleSets.map((ruleSet) => ({
          ...ruleSet,
          scopeType:
            ruleSet.scopeType ??
            (ruleSet.houseId ? "HOUSE" : ruleSet.houseGroupId ? "HOUSE_GROUP" : "ORGANIZATION"),
          houseId: ruleSet.houseId ?? null,
          houseGroupId: ruleSet.houseGroupId ?? null,
          chores: {
            ...ruleSet.chores,
            proofRequirement: Array.isArray(ruleSet.chores?.proofRequirement)
              ? ruleSet.chores.proofRequirement
              : ruleSet.chores?.proofRequirement
                ? [ruleSet.chores.proofRequirement]
                : ["NONE"],
          },
          meetings: {
            ...ruleSet.meetings,
            proofMethod:
              ((ruleSet.meetings as { proofMethod?: string } | undefined)?.proofMethod ?? null) ===
              "PHOTO"
                ? "GEOFENCE_SIGNATURE"
                : (ruleSet.meetings?.proofMethod ?? "GEOFENCE_SIGNATURE"),
          },
          oneOnOne: {
            enabled: ruleSet.oneOnOne?.enabled ?? false,
            defaultFrequency: ruleSet.oneOnOne?.defaultFrequency ?? "WEEKLY",
            defaultWeekday: ruleSet.oneOnOne?.defaultWeekday ?? "TUE",
            defaultTimeLocalHhmm: ruleSet.oneOnOne?.defaultTimeLocalHhmm ?? "15:00",
            defaultLeadTimeMinutes: ruleSet.oneOnOne?.defaultLeadTimeMinutes ?? 30,
            addToCalendarByDefault: ruleSet.oneOnOne?.addToCalendarByDefault ?? true,
            reminderEnabledByDefault: ruleSet.oneOnOne?.reminderEnabledByDefault ?? true,
          },
          operations: {
            choresEnabled: ruleSet.operations?.choresEnabled ?? ruleSet.chores?.enabled ?? false,
            houseMeetingsEnabled: ruleSet.operations?.houseMeetingsEnabled ?? false,
            houseMeetingsRequired: ruleSet.operations?.houseMeetingsRequired ?? false,
            oneOnOneSessionsEnabled:
              ruleSet.operations?.oneOnOneSessionsEnabled ?? ruleSet.oneOnOne?.enabled ?? false,
            oneOnOneSessionsRequired: ruleSet.operations?.oneOnOneSessionsRequired ?? false,
            houseAlertsEnabled: ruleSet.operations?.houseAlertsEnabled ?? false,
            announcementsEnabled: ruleSet.operations?.announcementsEnabled ?? false,
            complianceSnapshotEnabled: ruleSet.operations?.complianceSnapshotEnabled ?? true,
          },
          support: {
            defaultReminderLeadMinutes: ruleSet.support?.defaultReminderLeadMinutes ?? 30,
            defaultAddToCalendar: ruleSet.support?.defaultAddToCalendar ?? false,
            defaultInAppReminders: ruleSet.support?.defaultInAppReminders ?? false,
            requireHouseMeetingAcknowledgment:
              ruleSet.support?.requireHouseMeetingAcknowledgment ?? false,
            requireAnnouncementAcknowledgment:
              ruleSet.support?.requireAnnouncementAcknowledgment ?? false,
            requireOneOnOneManagerConfirmation:
              ruleSet.support?.requireOneOnOneManagerConfirmation ?? false,
          },
        }))
      : [],
    residentHouseMemberships: Array.isArray(candidate.residentHouseMemberships)
      ? candidate.residentHouseMemberships
      : [],
    recurringObligations: Array.isArray(candidate.recurringObligations)
      ? candidate.recurringObligations.map((obligation) => ({
          ...obligation,
          scopeType:
            obligation.scopeType ??
            (obligation.houseId
              ? "HOUSE"
              : obligation.houseGroupId
                ? "HOUSE_GROUP"
                : "ORGANIZATION"),
          houseGroupId: obligation.houseGroupId ?? null,
          locationLabel: obligation.locationLabel ?? "",
          weekdayList: Array.isArray(obligation.weekdayList)
            ? obligation.weekdayList
            : obligation.weekday
              ? [obligation.weekday]
              : [],
          monthlyOrdinal:
            obligation.monthlyOrdinal === 1 ||
            obligation.monthlyOrdinal === 2 ||
            obligation.monthlyOrdinal === 3 ||
            obligation.monthlyOrdinal === 4 ||
            obligation.monthlyOrdinal === 5
              ? obligation.monthlyOrdinal
              : null,
          durationMinutes:
            typeof obligation.durationMinutes === "number" &&
            Number.isFinite(obligation.durationMinutes)
              ? obligation.durationMinutes
              : 60,
        }))
      : [],
    houseMeetings: Array.isArray(candidate.houseMeetings) ? candidate.houseMeetings : [],
    oneOnOneSessions: Array.isArray(candidate.oneOnOneSessions)
      ? candidate.oneOnOneSessions.map((session) => ({
          ...session,
          completionStatus:
            session.completionStatus ?? (session.completedAt ? "COMPLETED" : "SCHEDULED"),
          completedAt: session.completedAt ?? null,
          completedByStaffAssignmentId: session.completedByStaffAssignmentId ?? null,
          excusedAt: session.excusedAt ?? null,
          excusedReason: session.excusedReason ?? null,
        }))
      : [],
    houseChores: Array.isArray(candidate.houseChores)
      ? candidate.houseChores.map((chore) => ({
          ...chore,
          proofRequirement: Array.isArray(chore.proofRequirement)
            ? chore.proofRequirement
            : chore.proofRequirement
              ? [chore.proofRequirement]
              : ["NONE"],
        }))
      : [],
    alertAcknowledgementRecords,
    scheduledItemCompletionRecords,
    houseAlertAnnouncements: Array.isArray(candidate.houseAlertAnnouncements)
      ? candidate.houseAlertAnnouncements
      : [],
    alertPreferences: Array.isArray(candidate.alertPreferences)
      ? candidate.alertPreferences.map((preference) => {
          const legacyPreference = preference as Record<string, unknown>;
          const explicitIds = Array.isArray(legacyPreference.recipientStaffAssignmentIds)
            ? legacyPreference.recipientStaffAssignmentIds.filter(
                (value): value is string => typeof value === "string" && value.length > 0,
              )
            : [];
          const legacyId =
            typeof legacyPreference.recipientStaffAssignmentId === "string" &&
            legacyPreference.recipientStaffAssignmentId.length > 0
              ? legacyPreference.recipientStaffAssignmentId
              : null;

          return {
            ...preference,
            recipientStaffAssignmentIds:
              explicitIds.length > 0 ? explicitIds : legacyId ? [legacyId] : [],
          };
        })
      : [],
    residentHousingProfile: candidate.residentHousingProfile ?? null,
    residentRequirementProfile: candidate.residentRequirementProfile
      ? {
          ...candidate.residentRequirementProfile,
          workplaceGeofenceLat: candidate.residentRequirementProfile.workplaceGeofenceLat ?? null,
          workplaceGeofenceLng: candidate.residentRequirementProfile.workplaceGeofenceLng ?? null,
          workplaceGeofenceRadiusFeet:
            candidate.residentRequirementProfile.workplaceGeofenceRadiusFeet ?? null,
          workplaceGeofenceResolvedAt:
            candidate.residentRequirementProfile.workplaceGeofenceResolvedAt ?? null,
          oneOnOneRequired: candidate.residentRequirementProfile.oneOnOneRequired ?? false,
          oneOnOneAssignedStaffAssignmentId:
            candidate.residentRequirementProfile.oneOnOneAssignedStaffAssignmentId ?? null,
          oneOnOneFrequency: candidate.residentRequirementProfile.oneOnOneFrequency ?? "WEEKLY",
          oneOnOneWeekday: candidate.residentRequirementProfile.oneOnOneWeekday ?? "TUE",
          oneOnOneScheduledDate: candidate.residentRequirementProfile.oneOnOneScheduledDate ?? null,
          oneOnOneTimeLocalHhmm: candidate.residentRequirementProfile.oneOnOneTimeLocalHhmm ?? "",
          oneOnOneLeadTimeMinutes:
            candidate.residentRequirementProfile.oneOnOneLeadTimeMinutes ?? 0,
          oneOnOneAddToCalendar:
            candidate.residentRequirementProfile.oneOnOneAddToCalendar ?? false,
          oneOnOneReminderEnabled:
            candidate.residentRequirementProfile.oneOnOneReminderEnabled ?? false,
          oneOnOneCalendarEventId:
            candidate.residentRequirementProfile.oneOnOneCalendarEventId ?? null,
          oneOnOneScheduleFingerprint:
            candidate.residentRequirementProfile.oneOnOneScheduleFingerprint ?? null,
          oneOnOneNotificationIds: Array.isArray(
            candidate.residentRequirementProfile.oneOnOneNotificationIds,
          )
            ? candidate.residentRequirementProfile.oneOnOneNotificationIds
            : [],
        }
      : null,
    residentConsentRecord: candidate.residentConsentRecord ?? null,
    residentWizardDraft: candidate.residentWizardDraft
      ? {
          ...candidate.residentWizardDraft,
          oneOnOneRequired: candidate.residentWizardDraft.oneOnOneRequired ?? false,
          oneOnOneAssignedStaffAssignmentId:
            candidate.residentWizardDraft.oneOnOneAssignedStaffAssignmentId ?? null,
          oneOnOneFrequency: candidate.residentWizardDraft.oneOnOneFrequency ?? "WEEKLY",
          oneOnOneWeekday: candidate.residentWizardDraft.oneOnOneWeekday ?? "TUE",
          oneOnOneScheduledDate: candidate.residentWizardDraft.oneOnOneScheduledDate ?? null,
          oneOnOneTimeLocalHhmm: candidate.residentWizardDraft.oneOnOneTimeLocalHhmm ?? "",
          oneOnOneLeadTimeMinutes: candidate.residentWizardDraft.oneOnOneLeadTimeMinutes ?? 0,
          oneOnOneAddToCalendar: candidate.residentWizardDraft.oneOnOneAddToCalendar ?? false,
          oneOnOneReminderEnabled: candidate.residentWizardDraft.oneOnOneReminderEnabled ?? false,
        }
      : null,
    sponsorCallRecords: Array.isArray(candidate.sponsorCallRecords)
      ? candidate.sponsorCallRecords.map((record) => ({
          ...record,
          scheduledFor: record.scheduledFor ?? null,
          status: record.status ?? (record.completedAt ? "COMPLETED" : "SCHEDULED"),
          completedAt: record.completedAt ?? null,
          proofRequired: record.proofRequired ?? false,
          proofProvided: record.proofProvided ?? false,
          proofReference: record.proofReference ?? null,
          proofType: record.proofType ?? "CALL_LOG",
        }))
      : [],
    houseMeetingAttendanceRecords: Array.isArray(candidate.houseMeetingAttendanceRecords)
      ? candidate.houseMeetingAttendanceRecords.map((record) => ({
          ...record,
          status: record.status ?? (record.attendedAt ? "COMPLETED" : "SCHEDULED"),
          attendedAt: record.attendedAt ?? null,
          excusedAt: record.excusedAt ?? null,
          excusedReason: record.excusedReason ?? null,
          proofRequired: record.proofRequired ?? false,
          proofProvided: record.proofProvided ?? false,
          proofReference: record.proofReference ?? null,
        }))
      : [],
    choreCompletionRecords: Array.isArray(candidate.choreCompletionRecords)
      ? candidate.choreCompletionRecords.map((record) => ({
          ...record,
          proofRequirement: Array.isArray(record.proofRequirement)
            ? record.proofRequirement
            : record.proofRequirement
              ? [record.proofRequirement]
              : ["NONE"],
          managerConfirmationRequired: record.managerConfirmationRequired ?? false,
          managerConfirmationStatus: record.managerConfirmationRequired
            ? (record.managerConfirmationStatus ?? "PENDING")
            : "NOT_REQUIRED",
          managerConfirmationRequestedAt: record.managerConfirmationRequestedAt ?? null,
          managerConfirmationRequestedVia: record.managerConfirmationRequestedVia ?? null,
          managerConfirmedAt: record.managerConfirmedAt ?? null,
        }))
      : [],
    jobApplicationRecords: Array.isArray(candidate.jobApplicationRecords)
      ? candidate.jobApplicationRecords.map((record) => ({
          ...record,
          proofReference: record.proofReference ?? null,
        }))
      : [],
    workVerificationRecords: Array.isArray(candidate.workVerificationRecords)
      ? candidate.workVerificationRecords
      : [],
    violations: Array.isArray(candidate.violations) ? candidate.violations : [],
    correctiveActions: Array.isArray(candidate.correctiveActions)
      ? candidate.correctiveActions
      : [],
    evidenceItems: Array.isArray(candidate.evidenceItems) ? candidate.evidenceItems : [],
    chatThreads: Array.isArray(candidate.chatThreads) ? candidate.chatThreads : [],
    chatParticipants: Array.isArray(candidate.chatParticipants) ? candidate.chatParticipants : [],
    chatMessages: Array.isArray(candidate.chatMessages) ? candidate.chatMessages : [],
    chatMessageReceipts: Array.isArray(candidate.chatMessageReceipts)
      ? candidate.chatMessageReceipts
      : [],
    monthlyReports,
    operatorReportExports,
    scheduledSummaryRecords,
    proofReviewRecords,
    enforcementRecords,
    auditLogEntries: Array.isArray(candidate.auditLogEntries) ? candidate.auditLogEntries : [],
  };
}

export async function loadSoberHouseSettingsStore(
  userId: string,
): Promise<SoberHouseSettingsStore> {
  const key = soberHouseSettingsStorageKey(userId);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return createDefaultSoberHouseSettingsStore();
    }

    return normalizeSoberHouseSettingsStore(JSON.parse(raw));
  } catch {
    return createDefaultSoberHouseSettingsStore();
  }
}

export async function saveSoberHouseSettingsStore(
  userId: string,
  value: SoberHouseSettingsStore,
): Promise<void> {
  const key = soberHouseSettingsStorageKey(userId);
  await AsyncStorage.setItem(key, JSON.stringify(value));
}
