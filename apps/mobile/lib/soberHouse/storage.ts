import AsyncStorage from "@react-native-async-storage/async-storage";
import { createDefaultSoberHouseSettingsStore } from "./defaults";
import type { SoberHouseSettingsStore } from "./types";
import { SOBER_HOUSE_SETTINGS_STORE_VERSION } from "./types";

const SOBER_HOUSE_SETTINGS_STORAGE_KEY_PREFIX = "recovery:sober-house-settings:v1:";

export function soberHouseSettingsStorageKey(userId: string): string {
  return `${SOBER_HOUSE_SETTINGS_STORAGE_KEY_PREFIX}${userId}`;
}

function normalizeStore(value: unknown): SoberHouseSettingsStore {
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
        }))
      : [],
    alertPreferences: Array.isArray(candidate.alertPreferences) ? candidate.alertPreferences : [],
    residentHousingProfile: candidate.residentHousingProfile ?? null,
    residentRequirementProfile: candidate.residentRequirementProfile
      ? {
          ...candidate.residentRequirementProfile,
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
    choreCompletionRecords: Array.isArray(candidate.choreCompletionRecords)
      ? candidate.choreCompletionRecords.map((record) => ({
          ...record,
          proofRequirement: Array.isArray(record.proofRequirement)
            ? record.proofRequirement
            : record.proofRequirement
              ? [record.proofRequirement]
              : ["NONE"],
        }))
      : [],
    jobApplicationRecords: Array.isArray(candidate.jobApplicationRecords)
      ? candidate.jobApplicationRecords
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

    return normalizeStore(JSON.parse(raw));
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
