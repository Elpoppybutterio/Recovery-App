import { describe, expect, it } from "vitest";
import { buildSeededAccessContext, SEEDED_DEV_USERS, getSeededDevUser } from "../lib/devSeedUsers";
import { canManageSoberHouseHierarchy, deriveAppAccessRole } from "../lib/access";
import {
  activateParticipantTrack,
  buildEffectiveOnboardingPathFromTracks,
  createDefaultParticipantTrackState,
  endParticipantTrack,
  getActiveParticipantTracks,
  hasActiveParticipantTrack,
  normalizeParticipantTrackState,
} from "../lib/tracks";

describe("participant track model", () => {
  it("infers recovery plus resident enrollments from legacy resident state", () => {
    const trackState = normalizeParticipantTrackState(null, {
      setupComplete: true,
      onboardingPath: "SOBER_HOUSE_RESIDENT",
      soberHouseRole: "HOUSE_RESIDENT",
      organizationId: "org-1",
      houseId: "house-1",
      nowIso: "2026-03-20T12:00:00.000Z",
    });

    expect(trackState.recoveryProfileCreatedAt).toBe("2026-03-20T12:00:00.000Z");
    expect(getActiveParticipantTracks(trackState).map((entry) => entry.trackType)).toEqual([
      "recovery_only",
      "sober_housing_resident",
    ]);
    expect(buildEffectiveOnboardingPathFromTracks(trackState)).toBe("SOBER_HOUSE_RESIDENT");
  });

  it("preserves the recovery base when a resident track ends", () => {
    const startedAt = "2026-03-20T12:00:00.000Z";
    const endedAt = "2026-03-25T12:00:00.000Z";
    const baseState = activateParticipantTrack(
      createDefaultParticipantTrackState(startedAt),
      "sober_housing_resident",
      startedAt,
      {
        setupStatus: "COMPLETE",
        linkedOrganizationId: "org-1",
        linkedHouseId: "house-1",
      },
    );

    const endedState = endParticipantTrack(baseState, "sober_housing_resident", endedAt);

    expect(hasActiveParticipantTrack(endedState, "recovery_only")).toBe(true);
    expect(
      hasActiveParticipantTrack(endedState, "sober_housing_resident", {
        includeIncomplete: true,
      }),
    ).toBe(false);
    expect(buildEffectiveOnboardingPathFromTracks(endedState)).toBe("RECOVERY");
  });

  it("adds a court participant track without deleting recovery", () => {
    const trackState = activateParticipantTrack(
      createDefaultParticipantTrackState("2026-03-20T12:00:00.000Z"),
      "court_participant",
      "2026-03-22T12:00:00.000Z",
      {
        setupStatus: "COMPLETE",
        linkedCourtProgramName: "Jefferson County Drug Court",
        courtTrackKind: "DRUG_COURT",
      },
    );

    expect(getActiveParticipantTracks(trackState).map((entry) => entry.trackType)).toEqual([
      "court_participant",
      "recovery_only",
    ]);
    expect(buildEffectiveOnboardingPathFromTracks(trackState)).toBe("COURT_PROGRAM");
  });
});

describe("seeded dev users", () => {
  it("includes deterministic qa identities for recovery, resident, organization, and platform users", () => {
    expect(SEEDED_DEV_USERS.map((entry) => entry.userId)).toEqual(
      expect.arrayContaining([
        "recovery-user",
        "resident-user",
        "organization-user",
        "platform-user",
      ]),
    );

    expect(
      getSeededDevUser("recovery-user")?.participantTracks.enrollments.map(
        (entry) => entry.trackType,
      ),
    ).toEqual(["recovery_only"]);
    expect(
      getSeededDevUser("resident-user")?.participantTracks.enrollments.map(
        (entry) => entry.trackType,
      ),
    ).toEqual(["sober_housing_resident", "recovery_only"]);
  });

  it("keeps protected role expectations separate from participant tracks", () => {
    const organizationUser = getSeededDevUser("organization-user");
    const platformUser = getSeededDevUser("platform-user");

    expect(organizationUser?.expectedProtectedRoles).toEqual(["org_admin"]);
    expect(platformUser?.expectedProtectedRoles).toEqual(["platform_owner"]);
    expect(
      organizationUser?.participantTracks.enrollments.every(
        (entry) =>
          entry.trackType !== "court_participant" && entry.trackType !== "sober_housing_resident",
      ),
    ).toBe(true);
    expect(
      platformUser?.participantTracks.enrollments.every(
        (entry) =>
          entry.trackType !== "court_participant" && entry.trackType !== "sober_housing_resident",
      ),
    ).toBe(true);
  });

  it("builds deterministic protected access context for seeded organization admins", () => {
    const accessContext = buildSeededAccessContext("organization-user");
    const role = deriveAppAccessRole({
      onboardingPath: "RECOVERY",
      accessContext,
    });

    expect(accessContext?.grants.map((grant) => grant.role)).toContain("org_admin");
    expect(role).toBe("SOBER_HOUSE_ORG_ADMIN");
    expect(canManageSoberHouseHierarchy(role)).toBe(true);
  });
});
