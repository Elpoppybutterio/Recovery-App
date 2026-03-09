import { createDefaultHouseRuleSet } from "./defaults";
import type {
  AlertPreference,
  CorrectiveAction,
  EvidenceItem,
  House,
  HouseRuleSet,
  SoberHouseSettingsStore,
  StaffAssignment,
  Violation,
} from "./types";

export function getActiveHouses(store: SoberHouseSettingsStore): House[] {
  return store.houses.filter((house) => house.status === "ACTIVE");
}

export function getHouseById(store: SoberHouseSettingsStore, houseId: string): House | null {
  return store.houses.find((house) => house.id === houseId) ?? null;
}

export function getStaffAssignmentById(
  store: SoberHouseSettingsStore,
  assignmentId: string,
): StaffAssignment | null {
  return store.staffAssignments.find((assignment) => assignment.id === assignmentId) ?? null;
}

export function getRuleSetForHouse(
  store: SoberHouseSettingsStore,
  houseId: string,
  now: string,
): HouseRuleSet {
  return (
    store.houseRuleSets.find((ruleSet) => ruleSet.houseId === houseId) ??
    createDefaultHouseRuleSet(now, houseId, store.organization?.id ?? null)
  );
}

export function getAlertPreferencesForHouse(
  store: SoberHouseSettingsStore,
  houseId: string | null,
): AlertPreference[] {
  return store.alertPreferences.filter((preference) =>
    preference.scope === "ORGANIZATION"
      ? houseId === null || preference.houseId === null
      : preference.houseId === houseId,
  );
}

export function getViolationById(
  store: SoberHouseSettingsStore,
  violationId: string,
): Violation | null {
  return store.violations.find((violation) => violation.id === violationId) ?? null;
}

export function getCorrectiveActionsForViolation(
  store: SoberHouseSettingsStore,
  violationId: string,
): CorrectiveAction[] {
  return store.correctiveActions.filter((action) => action.violationId === violationId);
}

export function getEvidenceItemsForViolation(
  store: SoberHouseSettingsStore,
  violationId: string,
): EvidenceItem[] {
  return store.evidenceItems.filter((item) => item.linkedViolationId === violationId);
}

export function getResidentDisplayName(store: SoberHouseSettingsStore): string {
  const housing = store.residentHousingProfile;
  if (!housing) {
    return "Resident";
  }
  return `${housing.firstName} ${housing.lastName}`.trim() || "Resident";
}
