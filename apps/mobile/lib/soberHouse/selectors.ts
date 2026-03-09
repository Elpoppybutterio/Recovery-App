import { createDefaultHouseRuleSet } from "./defaults";
import type {
  AlertPreference,
  House,
  HouseRuleSet,
  SoberHouseSettingsStore,
  StaffAssignment,
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
