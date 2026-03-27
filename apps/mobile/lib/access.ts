import type { OnboardingPath } from "./onboarding";
import type { SoberHouseAccessRole } from "./soberHouse/types";

export type AccessGrantRole =
  | "recovery_user"
  | "resident_user"
  | "court_participant"
  | "org_admin"
  | "house_manager"
  | "probation_officer"
  | "parole_officer"
  | "court_supervisor"
  | "platform_owner";

export type AccessContextGrant = {
  id: string;
  role: AccessGrantRole;
  organizationId: string | null;
  organizationName: string | null;
  courtProgramId: string | null;
  courtProgramName: string | null;
  courtProgramJurisdiction: string | null;
  grantedAt: string;
  revokedAt: string | null;
};

export type AccessContext = {
  user: {
    userId: string;
    tenantId: string;
    email: string;
    displayName: string;
    createdAt: string;
  };
  grants: AccessContextGrant[];
  capabilities: {
    participantRoles: AccessGrantRole[];
    protectedRoles: AccessGrantRole[];
    canManageOrganizations: boolean;
    canManageCourtPrograms: boolean;
    isPlatformOwner: boolean;
  };
};

export type AppAccessRole =
  | "RECOVERY_USER"
  | "SOBER_HOUSE_RESIDENT"
  | "SOBER_HOUSE_ORG_ADMIN"
  | "COURT_PARTICIPANT"
  | "COURT_SUPERVISOR"
  | "DUAL_TRACK_ADMIN"
  | "PLATFORM_ADMIN";

export type ProtectedOrgAccessGateOutcome = "idle" | "unauthenticated" | "unauthorized";
export type ProtectedOrgAccessGateState = "AUTH_REQUIRED" | "ACCESS_DENIED";

const accessGrantRoles: AccessGrantRole[] = [
  "recovery_user",
  "resident_user",
  "court_participant",
  "org_admin",
  "house_manager",
  "probation_officer",
  "parole_officer",
  "court_supervisor",
  "platform_owner",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAccessGrantRole(value: unknown): value is AccessGrantRole {
  return typeof value === "string" && accessGrantRoles.includes(value as AccessGrantRole);
}

function parseAccessContextGrant(value: unknown): AccessContextGrant | null {
  if (!isRecord(value) || !isAccessGrantRole(value.role) || typeof value.id !== "string") {
    return null;
  }

  return {
    id: value.id,
    role: value.role,
    organizationId: typeof value.organizationId === "string" ? value.organizationId : null,
    organizationName: typeof value.organizationName === "string" ? value.organizationName : null,
    courtProgramId: typeof value.courtProgramId === "string" ? value.courtProgramId : null,
    courtProgramName: typeof value.courtProgramName === "string" ? value.courtProgramName : null,
    courtProgramJurisdiction:
      typeof value.courtProgramJurisdiction === "string" ? value.courtProgramJurisdiction : null,
    grantedAt: typeof value.grantedAt === "string" ? value.grantedAt : "",
    revokedAt: typeof value.revokedAt === "string" ? value.revokedAt : null,
  };
}

function parseAccessGrantRoleArray(value: unknown): AccessGrantRole[] {
  return Array.isArray(value) ? value.filter(isAccessGrantRole) : [];
}

export function parseAccessContextResponse(value: unknown): AccessContext | null {
  if (!isRecord(value) || !isRecord(value.user) || !isRecord(value.capabilities)) {
    return null;
  }

  if (
    typeof value.user.userId !== "string" ||
    typeof value.user.tenantId !== "string" ||
    typeof value.user.email !== "string" ||
    typeof value.user.displayName !== "string" ||
    typeof value.user.createdAt !== "string"
  ) {
    return null;
  }

  const grants = Array.isArray(value.grants)
    ? value.grants
        .map((entry) => parseAccessContextGrant(entry))
        .filter((entry): entry is AccessContextGrant => entry !== null)
    : [];

  return {
    user: {
      userId: value.user.userId,
      tenantId: value.user.tenantId,
      email: value.user.email,
      displayName: value.user.displayName,
      createdAt: value.user.createdAt,
    },
    grants,
    capabilities: {
      participantRoles: parseAccessGrantRoleArray(value.capabilities.participantRoles),
      protectedRoles: parseAccessGrantRoleArray(value.capabilities.protectedRoles),
      canManageOrganizations: value.capabilities.canManageOrganizations === true,
      canManageCourtPrograms: value.capabilities.canManageCourtPrograms === true,
      isPlatformOwner: value.capabilities.isPlatformOwner === true,
    },
  };
}

function hasGrant(
  accessContext: AccessContext | null | undefined,
  ...roles: AccessGrantRole[]
): boolean {
  return accessContext?.grants.some((grant) => roles.includes(grant.role)) ?? false;
}

export function deriveAppAccessRole(input: {
  onboardingPath: OnboardingPath;
  soberHouseRole?: SoberHouseAccessRole | null;
  accessContext?: AccessContext | null;
}): AppAccessRole {
  const hasPlatformOwnerGrant = hasGrant(input.accessContext, "platform_owner");
  const hasCourtSupervisorGrant = hasGrant(
    input.accessContext,
    "probation_officer",
    "parole_officer",
    "court_supervisor",
  );
  const hasOrganizationAdminGrant = hasGrant(input.accessContext, "org_admin", "house_manager");

  if (hasPlatformOwnerGrant) {
    return "PLATFORM_ADMIN";
  }
  if (hasCourtSupervisorGrant && hasOrganizationAdminGrant) {
    return "DUAL_TRACK_ADMIN";
  }
  if (hasCourtSupervisorGrant) {
    return "COURT_SUPERVISOR";
  }
  if (hasOrganizationAdminGrant) {
    return "SOBER_HOUSE_ORG_ADMIN";
  }
  if (
    hasGrant(input.accessContext, "resident_user") ||
    input.soberHouseRole === "HOUSE_RESIDENT" ||
    input.onboardingPath === "SOBER_HOUSE_RESIDENT"
  ) {
    return "SOBER_HOUSE_RESIDENT";
  }
  if (
    hasGrant(input.accessContext, "court_participant") ||
    input.soberHouseRole === "DRUG_COURT_PARTICIPANT" ||
    input.soberHouseRole === "PROBATION_PAROLE_PARTICIPANT" ||
    input.onboardingPath === "COURT_PROGRAM"
  ) {
    return "COURT_PARTICIPANT";
  }
  return "RECOVERY_USER";
}

export function canManageSoberHouseHierarchy(role: AppAccessRole): boolean {
  return (
    role === "SOBER_HOUSE_ORG_ADMIN" || role === "DUAL_TRACK_ADMIN" || role === "PLATFORM_ADMIN"
  );
}

export function deriveProtectedOrgAccessGateState(input: {
  authorized: boolean;
  outcome: ProtectedOrgAccessGateOutcome;
}): ProtectedOrgAccessGateState | null {
  if (input.authorized) {
    return null;
  }

  return input.outcome === "unauthorized" ? "ACCESS_DENIED" : "AUTH_REQUIRED";
}

export function buildPlatformOwnerGrantSql(input: {
  tenantId: string;
  userId: string;
}): string | null {
  const tenantId = input.tenantId.trim();
  const userId = input.userId.trim();
  if (!tenantId || !userId) {
    return null;
  }

  const escapedTenantId = tenantId.replaceAll("'", "''");
  const escapedUserId = userId.replaceAll("'", "''");

  return [
    "INSERT INTO user_roles (",
    "  tenant_id,",
    "  user_id,",
    "  role,",
    "  is_active,",
    "  granted_by_user_id",
    ")",
    "VALUES (",
    `  '${escapedTenantId}',`,
    `  '${escapedUserId}',`,
    "  'platform_owner',",
    "  TRUE,",
    `  '${escapedUserId}'`,
    ")",
    "ON CONFLICT DO NOTHING;",
  ].join("\n");
}

export function canViewSoberHouseResidentExperience(role: AppAccessRole): boolean {
  return canManageSoberHouseHierarchy(role) || role === "SOBER_HOUSE_RESIDENT";
}

export function canManageCourtHierarchy(role: AppAccessRole): boolean {
  return role === "COURT_SUPERVISOR" || role === "DUAL_TRACK_ADMIN" || role === "PLATFORM_ADMIN";
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
