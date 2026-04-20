import { describe, expect, it } from "vitest";
import {
  DEV_QA_SCENARIOS,
  filterDevQaResetStorageKeys,
  getDevQaScenario,
  resolveDevQaScenarioByUserId,
} from "../lib/devQaHarness";

describe("dev QA harness scenarios", () => {
  it("resolves each required seeded scenario deterministically", () => {
    expect(resolveDevQaScenarioByUserId("kacy-admin").id).toBe("NEW_HOUSING_ADMIN");
    expect(resolveDevQaScenarioByUserId("organization-user").id).toBe("EXISTING_HOUSING_ADMIN");
    expect(resolveDevQaScenarioByUserId("resident-user").id).toBe("RESIDENT_USER");
    expect(resolveDevQaScenarioByUserId("jason-admin").id).toBe("PLATFORM_OWNER");
    expect(resolveDevQaScenarioByUserId("unknown-user").id).toBe("UNKNOWN_USER");
  });

  it("falls back unknown identities into the unknown-user scenario", () => {
    expect(resolveDevQaScenarioByUserId("not-seeded").id).toBe("UNKNOWN_USER");
    expect(resolveDevQaScenarioByUserId("").id).toBe("UNKNOWN_USER");
    expect(resolveDevQaScenarioByUserId(null).id).toBe("UNKNOWN_USER");
  });

  it("exposes the exact five QA scenarios required for onboarding testing", () => {
    expect(DEV_QA_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      "NEW_HOUSING_ADMIN",
      "EXISTING_HOUSING_ADMIN",
      "RESIDENT_USER",
      "PLATFORM_OWNER",
      "UNKNOWN_USER",
    ]);
    expect(getDevQaScenario("NEW_HOUSING_ADMIN").startTarget).toBe("SETUP");
    expect(getDevQaScenario("EXISTING_HOUSING_ADMIN").startTarget).toBe("SOBER_HOUSE_ADMIN");
  });
});

describe("dev QA harness reset filtering", () => {
  it("keeps only app-owned recovery storage keys and removes duplicates", () => {
    expect(
      filterDevQaResetStorageKeys([
        "recovery:profile:enduser-a1",
        "expo.location.cache",
        "recovery:profile:enduser-a1",
        "recovery:sober-house-settings:v1:enduser-a1",
        "some-other-key",
        "recovery:routines:v1:enduser-a1",
      ]),
    ).toEqual([
      "recovery:profile:enduser-a1",
      "recovery:sober-house-settings:v1:enduser-a1",
      "recovery:routines:v1:enduser-a1",
    ]);
  });
});
