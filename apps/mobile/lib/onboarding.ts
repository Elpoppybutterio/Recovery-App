import type { SoberHouseAccessRole } from "./soberHouse/types";

export type SetupStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type SetupSupervisionMode = "INDEPENDENT" | "SOBER_HOUSE_RESIDENT" | "SOBER_HOUSE_OWNER";
export type SetupJusticeTrack = "NONE" | "DRUG_COURT" | "PROBATION_PAROLE";
export type OnboardingPath =
  | "RECOVERY"
  | "SOBER_HOUSE_RESIDENT"
  | "COURT_PROGRAM"
  | "SOBER_HOUSE_ORG_ADMIN";

export const ONBOARDING_PATH_OPTIONS: Array<{
  value: OnboardingPath;
  label: string;
  description: string;
}> = [
  {
    value: "RECOVERY",
    label: "My recovery",
    description: "Set up your personal recovery foundation.",
  },
  {
    value: "SOBER_HOUSE_RESIDENT",
    label: "Recovery in sober housing",
    description: "Complete recovery first, then add resident requirements.",
  },
  {
    value: "COURT_PROGRAM",
    label: "Recovery with court / program requirements",
    description: "Finish recovery setup before program-specific requirements.",
  },
  {
    value: "SOBER_HOUSE_ORG_ADMIN",
    label: "Managing a sober housing organization",
    description: "Configure organizations, houses, staff, and rules.",
  },
];

export function getSetupFlowSteps(path: OnboardingPath): SetupStep[] {
  switch (path) {
    case "SOBER_HOUSE_RESIDENT":
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    case "COURT_PROGRAM":
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    case "SOBER_HOUSE_ORG_ADMIN":
      return [1, 2];
    case "RECOVERY":
    default:
      return [1, 2, 3, 4, 5, 6, 7, 8, 9];
  }
}

export function getLegacyWizardStateForPath(path: OnboardingPath): {
  wizardSupervisionMode: SetupSupervisionMode;
  wizardJusticeTrack: SetupJusticeTrack;
} {
  if (path === "SOBER_HOUSE_RESIDENT") {
    return {
      wizardSupervisionMode: "SOBER_HOUSE_RESIDENT",
      wizardJusticeTrack: "NONE",
    };
  }
  if (path === "COURT_PROGRAM") {
    return {
      wizardSupervisionMode: "INDEPENDENT",
      wizardJusticeTrack: "DRUG_COURT",
    };
  }
  if (path === "SOBER_HOUSE_ORG_ADMIN") {
    return {
      wizardSupervisionMode: "SOBER_HOUSE_OWNER",
      wizardJusticeTrack: "NONE",
    };
  }
  return {
    wizardSupervisionMode: "INDEPENDENT",
    wizardJusticeTrack: "NONE",
  };
}

export function inferOnboardingPath(input: {
  onboardingPath?: unknown;
  wizardSupervisionMode?: unknown;
  wizardJusticeTrack?: unknown;
  soberHouseRole?: SoberHouseAccessRole | null;
}): OnboardingPath {
  if (
    input.onboardingPath === "RECOVERY" ||
    input.onboardingPath === "SOBER_HOUSE_RESIDENT" ||
    input.onboardingPath === "COURT_PROGRAM" ||
    input.onboardingPath === "SOBER_HOUSE_ORG_ADMIN"
  ) {
    return input.onboardingPath;
  }
  if (
    input.soberHouseRole === "OWNER_OPERATOR" ||
    input.wizardSupervisionMode === "SOBER_HOUSE_OWNER"
  ) {
    return "SOBER_HOUSE_ORG_ADMIN";
  }
  if (
    input.soberHouseRole === "HOUSE_RESIDENT" ||
    input.wizardSupervisionMode === "SOBER_HOUSE_RESIDENT"
  ) {
    return "SOBER_HOUSE_RESIDENT";
  }
  if (
    input.soberHouseRole === "DRUG_COURT_PARTICIPANT" ||
    input.soberHouseRole === "PROBATION_PAROLE_PARTICIPANT" ||
    input.wizardJusticeTrack === "DRUG_COURT" ||
    input.wizardJusticeTrack === "PROBATION_PAROLE"
  ) {
    return "COURT_PROGRAM";
  }
  return "RECOVERY";
}

export function pathRequiresRecovery(path: OnboardingPath): boolean {
  return path !== "SOBER_HOUSE_ORG_ADMIN";
}
