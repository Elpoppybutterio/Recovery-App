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
  if (version !== 1 && version !== 2 && version !== SOBER_HOUSE_SETTINGS_STORE_VERSION) {
    return createDefaultSoberHouseSettingsStore();
  }

  return {
    version: SOBER_HOUSE_SETTINGS_STORE_VERSION,
    organization: candidate.organization ?? null,
    houses: Array.isArray(candidate.houses) ? candidate.houses : [],
    staffAssignments: Array.isArray(candidate.staffAssignments) ? candidate.staffAssignments : [],
    houseRuleSets: Array.isArray(candidate.houseRuleSets) ? candidate.houseRuleSets : [],
    alertPreferences: Array.isArray(candidate.alertPreferences) ? candidate.alertPreferences : [],
    residentHousingProfile: candidate.residentHousingProfile ?? null,
    residentRequirementProfile: candidate.residentRequirementProfile ?? null,
    residentConsentRecord: candidate.residentConsentRecord ?? null,
    residentWizardDraft: candidate.residentWizardDraft ?? null,
    choreCompletionRecords: Array.isArray(candidate.choreCompletionRecords)
      ? candidate.choreCompletionRecords
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
