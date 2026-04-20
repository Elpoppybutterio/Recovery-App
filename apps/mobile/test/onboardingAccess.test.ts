import { describe, expect, it } from "vitest";
import {
  buildPlatformOwnerGrantSql,
  canBootstrapSingleSoberHouseOrganization,
  canManageCourtHierarchy,
  canManageSoberHouseHierarchy,
  canViewCourtParticipantExperience,
  canViewSoberHouseResidentExperience,
  deriveProtectedOrgAccessGateState,
  deriveAppAccessRole,
  listGrantedOrganizationScopes,
  parseAccessContextResponse,
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
  const platformOwnerAccessContext = parseAccessContextResponse({
    user: {
      userId: "platform-a",
      tenantId: "tenant-a",
      email: "platform@example.com",
      displayName: "Platform Owner",
      createdAt: "2026-03-26T00:00:00.000Z",
    },
    grants: [
      {
        id: "1",
        role: "platform_owner",
        organizationId: null,
        organizationName: null,
        courtProgramId: null,
        courtProgramName: null,
        courtProgramJurisdiction: null,
        grantedAt: "2026-03-26T00:00:00.000Z",
        revokedAt: null,
      },
    ],
    capabilities: {
      participantRoles: [],
      protectedRoles: ["platform_owner"],
      canManageOrganizations: true,
      canManageCourtPrograms: true,
      isPlatformOwner: true,
    },
  });

  const courtSupervisorAccessContext = parseAccessContextResponse({
    user: {
      userId: "officer-a",
      tenantId: "tenant-a",
      email: "officer@example.com",
      displayName: "Officer A",
      createdAt: "2026-03-26T00:00:00.000Z",
    },
    grants: [
      {
        id: "2",
        role: "court_supervisor",
        organizationId: null,
        organizationName: null,
        courtProgramId: "court-a",
        courtProgramName: "Recovery Court",
        courtProgramJurisdiction: "Boulder County",
        grantedAt: "2026-03-26T00:00:00.000Z",
        revokedAt: null,
      },
    ],
    capabilities: {
      participantRoles: [],
      protectedRoles: ["court_supervisor"],
      canManageOrganizations: false,
      canManageCourtPrograms: true,
      isPlatformOwner: false,
    },
  });

  const participantAccessContext = parseAccessContextResponse({
    user: {
      userId: "participant-a",
      tenantId: "tenant-a",
      email: "participant@example.com",
      displayName: "Participant A",
      createdAt: "2026-03-26T00:00:00.000Z",
    },
    grants: [
      {
        id: "3",
        role: "resident_user",
        organizationId: "org-a",
        organizationName: "Alpine Recovery Housing",
        courtProgramId: null,
        courtProgramName: null,
        courtProgramJurisdiction: null,
        grantedAt: "2026-03-26T00:00:00.000Z",
        revokedAt: null,
      },
    ],
    capabilities: {
      participantRoles: ["resident_user"],
      protectedRoles: [],
      canManageOrganizations: false,
      canManageCourtPrograms: false,
      isPlatformOwner: false,
    },
  });

  const dualProtectedAccessContext = parseAccessContextResponse({
    user: {
      userId: "dual-a",
      tenantId: "tenant-a",
      email: "dual@example.com",
      displayName: "Dual Admin",
      createdAt: "2026-03-26T00:00:00.000Z",
    },
    grants: [
      {
        id: "4",
        role: "org_admin",
        organizationId: "org-a",
        organizationName: "Alpine Recovery Housing",
        courtProgramId: null,
        courtProgramName: null,
        courtProgramJurisdiction: null,
        grantedAt: "2026-03-26T00:00:00.000Z",
        revokedAt: null,
      },
      {
        id: "5",
        role: "court_supervisor",
        organizationId: null,
        organizationName: null,
        courtProgramId: "court-a",
        courtProgramName: "Recovery Court",
        courtProgramJurisdiction: "Boulder County",
        grantedAt: "2026-03-26T00:00:00.000Z",
        revokedAt: null,
      },
    ],
    capabilities: {
      participantRoles: [],
      protectedRoles: ["org_admin", "court_supervisor"],
      canManageOrganizations: true,
      canManageCourtPrograms: true,
      isPlatformOwner: false,
    },
  });
  const bootstrapOrgAdminAccessContext = parseAccessContextResponse({
    user: {
      userId: "kacy-admin",
      tenantId: "tenant-a",
      email: "kacy@example.com",
      displayName: "Kacy Housing Admin",
      createdAt: "2026-03-26T00:00:00.000Z",
    },
    grants: [
      {
        id: "6",
        role: "org_admin",
        organizationId: null,
        organizationName: null,
        courtProgramId: null,
        courtProgramName: null,
        courtProgramJurisdiction: null,
        grantedAt: "2026-03-26T00:00:00.000Z",
        revokedAt: null,
      },
    ],
    capabilities: {
      participantRoles: [],
      protectedRoles: ["org_admin"],
      canManageOrganizations: true,
      canManageCourtPrograms: false,
      isPlatformOwner: false,
    },
  });

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
      accessContext: platformOwnerAccessContext,
    });
    const supervisorRole = deriveAppAccessRole({
      onboardingPath: "RECOVERY",
      accessContext: courtSupervisorAccessContext,
    });

    expect(canManageSoberHouseHierarchy(platformAdminRole)).toBe(true);
    expect(canManageCourtHierarchy(platformAdminRole)).toBe(true);
    expect(canManageCourtHierarchy(supervisorRole)).toBe(true);
    expect(canManageSoberHouseHierarchy(supervisorRole)).toBe(false);
  });

  it("does not let altered local onboarding state bypass backend participant access", () => {
    const role = deriveAppAccessRole({
      onboardingPath: "SOBER_HOUSE_ORG_ADMIN",
      accessContext: participantAccessContext,
    });

    expect(role).toBe("SOBER_HOUSE_RESIDENT");
    expect(canManageSoberHouseHierarchy(role)).toBe(false);
  });

  it("preserves both protected scopes when the backend grants both", () => {
    const role = deriveAppAccessRole({
      onboardingPath: "RECOVERY",
      accessContext: dualProtectedAccessContext,
    });

    expect(canManageSoberHouseHierarchy(role)).toBe(true);
    expect(canManageCourtHierarchy(role)).toBe(true);
  });

  it("identifies bootstrap-eligible org admins without scoped organizations", () => {
    expect(canBootstrapSingleSoberHouseOrganization(bootstrapOrgAdminAccessContext)).toBe(true);
    expect(listGrantedOrganizationScopes(bootstrapOrgAdminAccessContext, ["org_admin"])).toEqual(
      [],
    );
  });

  it("treats signed-in users with no existing organization scope as bootstrap-eligible", () => {
    const accessContext = parseAccessContextResponse({
      user: {
        userId: "fresh-bootstrap-admin",
        tenantId: "tenant-a",
        email: "fresh-bootstrap-admin@dev.soberai.local",
        displayName: "Fresh Bootstrap Admin",
        createdAt: "2026-04-17T00:00:00.000Z",
      },
      grants: [],
      capabilities: {
        participantRoles: [],
        protectedRoles: [],
        canManageOrganizations: false,
        canManageCourtPrograms: false,
        isPlatformOwner: false,
      },
    });

    expect(canBootstrapSingleSoberHouseOrganization(accessContext)).toBe(true);
  });

  it("keeps the protected org gate in auth-required mode until sign-in proves the account is unauthorized", () => {
    expect(
      deriveProtectedOrgAccessGateState({
        authorized: false,
        outcome: "idle",
      }),
    ).toBe("AUTH_REQUIRED");
    expect(
      deriveProtectedOrgAccessGateState({
        authorized: false,
        outcome: "unauthenticated",
      }),
    ).toBe("AUTH_REQUIRED");
    expect(
      deriveProtectedOrgAccessGateState({
        authorized: false,
        outcome: "unauthorized",
      }),
    ).toBe("ACCESS_DENIED");
  });

  it("removes the protected org gate once backend authorization is present", () => {
    expect(
      deriveProtectedOrgAccessGateState({
        authorized: true,
        outcome: "unauthorized",
      }),
    ).toBeNull();
  });

  it("builds exact bootstrap SQL for the current signed-in user id", () => {
    expect(
      buildPlatformOwnerGrantSql({
        tenantId: "tenant-a",
        userId: "enduser-a1",
      }),
    ).toBe(
      [
        "INSERT INTO user_roles (",
        "  tenant_id,",
        "  user_id,",
        "  role,",
        "  is_active,",
        "  granted_by_user_id",
        ")",
        "VALUES (",
        "  'tenant-a',",
        "  'enduser-a1',",
        "  'platform_owner',",
        "  TRUE,",
        "  'enduser-a1'",
        ")",
        "ON CONFLICT DO NOTHING;",
      ].join("\n"),
    );
  });
});
