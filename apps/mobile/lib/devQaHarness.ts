import type { OnboardingPath, SetupStep } from "./onboarding";

export type DevQaScenarioId =
  | "NEW_HOUSING_ADMIN"
  | "EXISTING_HOUSING_ADMIN"
  | "RESIDENT_USER"
  | "PLATFORM_OWNER"
  | "UNKNOWN_USER";

export type DevQaScenario = {
  id: DevQaScenarioId;
  label: string;
  summary: string;
  userId: string;
  onboardingPath: OnboardingPath;
  setupStep: SetupStep;
  setupComplete: boolean;
  startTarget: "SETUP" | "DASHBOARD" | "SOBER_HOUSE_ADMIN";
};

const RECOVERY_STORAGE_KEY_PREFIX = "recovery:";

export const DEV_QA_SCENARIOS: DevQaScenario[] = [
  {
    id: "NEW_HOUSING_ADMIN",
    label: "New Housing Admin",
    summary: "Approved org admin with no organization yet.",
    userId: "kacy-admin",
    onboardingPath: "SOBER_HOUSE_ORG_ADMIN",
    setupStep: 2,
    setupComplete: false,
    startTarget: "SETUP",
  },
  {
    id: "EXISTING_HOUSING_ADMIN",
    label: "Existing Housing Admin",
    summary: "Approved org admin with one attached organization.",
    userId: "organization-user",
    onboardingPath: "RECOVERY",
    setupStep: 1,
    setupComplete: true,
    startTarget: "SOBER_HOUSE_ADMIN",
  },
  {
    id: "RESIDENT_USER",
    label: "Resident User",
    summary: "Resident dashboard with assigned org, house, and group.",
    userId: "resident-user",
    onboardingPath: "SOBER_HOUSE_RESIDENT",
    setupStep: 10,
    setupComplete: true,
    startTarget: "DASHBOARD",
  },
  {
    id: "PLATFORM_OWNER",
    label: "Platform Owner",
    summary: "Cross-org SaaS admin for control-plane QA.",
    userId: "jason-admin",
    onboardingPath: "RECOVERY",
    setupStep: 1,
    setupComplete: true,
    startTarget: "SOBER_HOUSE_ADMIN",
  },
  {
    id: "UNKNOWN_USER",
    label: "Unknown User",
    summary: "No seeded identity or attached org context.",
    userId: "unknown-user",
    onboardingPath: "RECOVERY",
    setupStep: 1,
    setupComplete: false,
    startTarget: "SETUP",
  },
];

const scenarioById = new Map(DEV_QA_SCENARIOS.map((scenario) => [scenario.id, scenario] as const));
const scenarioByUserId = new Map(
  DEV_QA_SCENARIOS.map((scenario) => [scenario.userId, scenario] as const),
);

export function getDevQaScenario(scenarioId: DevQaScenarioId): DevQaScenario {
  return scenarioById.get(scenarioId) ?? scenarioById.get("UNKNOWN_USER")!;
}

export function resolveDevQaScenarioByUserId(userId: string | null | undefined): DevQaScenario {
  if (!userId) {
    return getDevQaScenario("UNKNOWN_USER");
  }

  return scenarioByUserId.get(userId.trim()) ?? getDevQaScenario("UNKNOWN_USER");
}

export function filterDevQaResetStorageKeys(keys: readonly string[]): string[] {
  const filtered: string[] = [];
  const seen = new Set<string>();

  keys.forEach((key) => {
    if (!key.startsWith(RECOVERY_STORAGE_KEY_PREFIX) || seen.has(key)) {
      return;
    }
    seen.add(key);
    filtered.push(key);
  });

  return filtered;
}
