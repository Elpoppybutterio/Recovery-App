import type { OnboardingPath } from "./onboarding";
import type { SoberHouseAccessRole } from "./soberHouse/types";

export type AppAccessRole =
  | "RECOVERY_USER"
  | "SOBER_HOUSE_RESIDENT"
  | "SOBER_HOUSE_ORG_ADMIN"
  | "COURT_PARTICIPANT"
  | "COURT_SUPERVISOR"
  | "PLATFORM_ADMIN";

export function deriveAppAccessRole(input: {
  onboardingPath: OnboardingPath;
  soberHouseRole?: SoberHouseAccessRole | null;
  isSoberHouseOrgAdmin?: boolean;
  isCourtSupervisor?: boolean;
  isPlatformAdmin?: boolean;
}): AppAccessRole {
  if (input.isPlatformAdmin) {
    return "PLATFORM_ADMIN";
  }
  if (input.isCourtSupervisor) {
    return "COURT_SUPERVISOR";
  }
  if (input.isSoberHouseOrgAdmin) {
    return "SOBER_HOUSE_ORG_ADMIN";
  }
  if (
    input.soberHouseRole === "HOUSE_RESIDENT" ||
    input.onboardingPath === "SOBER_HOUSE_RESIDENT"
  ) {
    return "SOBER_HOUSE_RESIDENT";
  }
  if (
    input.soberHouseRole === "DRUG_COURT_PARTICIPANT" ||
    input.soberHouseRole === "PROBATION_PAROLE_PARTICIPANT" ||
    input.onboardingPath === "COURT_PROGRAM"
  ) {
    return "COURT_PARTICIPANT";
  }
  return "RECOVERY_USER";
}

export function canManageSoberHouseHierarchy(role: AppAccessRole): boolean {
  return role === "SOBER_HOUSE_ORG_ADMIN" || role === "PLATFORM_ADMIN";
}

export function canViewSoberHouseResidentExperience(role: AppAccessRole): boolean {
  return canManageSoberHouseHierarchy(role) || role === "SOBER_HOUSE_RESIDENT";
}

export function canManageCourtHierarchy(role: AppAccessRole): boolean {
  return role === "COURT_SUPERVISOR" || role === "PLATFORM_ADMIN";
}

export function canViewCourtParticipantExperience(role: AppAccessRole): boolean {
  return canManageCourtHierarchy(role) || role === "COURT_PARTICIPANT";
}

export function soberHouseEntryLabel(role: AppAccessRole): string {
  return canManageSoberHouseHierarchy(role) ? "Sober Housing Settings" : "Sober House Profile";
}

export function courtEntryLabel(role: AppAccessRole): string {
  return canManageCourtHierarchy(role) ? "Court Configuration" : "Court Program";
}
