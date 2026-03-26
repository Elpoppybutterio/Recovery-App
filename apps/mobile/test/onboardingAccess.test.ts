import { describe, expect, it } from "vitest";
import {
  canManageCourtHierarchy,
  canManageSoberHouseHierarchy,
  canViewCourtParticipantExperience,
  canViewSoberHouseResidentExperience,
  deriveAppAccessRole,
} from "../lib/access";
import { getSetupFlowSteps, inferOnboardingPath } from "../lib/onboarding";

describe("onboarding routing", () => {
  it("keeps recovery first for court participants and routes into selector plus wizard", () => {
    expect(getSetupFlowSteps("COURT_PROGRAM")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("infers participant onboarding paths from persisted participant roles", () => {
    expect(
      inferOnboardingPath({
        soberHouseRole: "HOUSE_RESIDENT",
      }),
    ).toBe("SOBER_HOUSE_RESIDENT");
    expect(
      inferOnboardingPath({
        wizardJusticeTrack: "PROBATION_PAROLE",
      }),
    ).toBe("COURT_PROGRAM");
  });
});

describe("protected access gating", () => {
  it("does not grant sober-house admin access from the onboarding splash alone", () => {
    const role = deriveAppAccessRole({
      onboardingPath: "SOBER_HOUSE_ORG_ADMIN",
    });

    expect(role).toBe("RECOVERY_USER");
    expect(canManageSoberHouseHierarchy(role)).toBe(false);
  });

  it("allows participant-facing access without hierarchy control", () => {
    const residentRole = deriveAppAccessRole({
      onboardingPath: "SOBER_HOUSE_RESIDENT",
    });
    const courtRole = deriveAppAccessRole({
      onboardingPath: "COURT_PROGRAM",
    });

    expect(canViewSoberHouseResidentExperience(residentRole)).toBe(true);
    expect(canManageSoberHouseHierarchy(residentRole)).toBe(false);
    expect(canViewCourtParticipantExperience(courtRole)).toBe(true);
    expect(canManageCourtHierarchy(courtRole)).toBe(false);
  });

  it("requires verified backend authorization for protected roles", () => {
    const platformAdminRole = deriveAppAccessRole({
      onboardingPath: "RECOVERY",
      isPlatformAdmin: true,
    });
    const supervisorRole = deriveAppAccessRole({
      onboardingPath: "RECOVERY",
      isCourtSupervisor: true,
    });

    expect(canManageSoberHouseHierarchy(platformAdminRole)).toBe(true);
    expect(canManageCourtHierarchy(platformAdminRole)).toBe(true);
    expect(canManageCourtHierarchy(supervisorRole)).toBe(true);
    expect(canManageSoberHouseHierarchy(supervisorRole)).toBe(false);
  });
});
