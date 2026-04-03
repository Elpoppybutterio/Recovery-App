import { Role } from "@recovery/shared-types";
import { createLogger } from "@recovery/shared-utils";
import type { ApiEnv } from "../env";
import { loadApiEnv } from "../env";
import { createPostgresPool } from "../db/postgres";

const logger = createLogger("api");

type DevUserSeed = {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  roles: Role[];
};

type TenantSeed = {
  id: string;
  name: string;
};

type OrganizationSeed = {
  id: string;
  tenantId: string;
  name: string;
};

type CourtProgramSeed = {
  id: string;
  tenantId: string;
  name: string;
  jurisdiction: string | null;
};

type HouseSeed = {
  id: string;
  tenantId: string;
  organizationId: string;
  name: string;
};

type AccessGrantSeed = {
  tenantId: string;
  userId: string;
  role: "platform_owner" | "org_admin" | "resident_user" | "court_participant" | "court_supervisor";
  organizationId?: string;
  courtProgramId?: string;
  grantedByUserId: string;
};

const TENANTS: TenantSeed[] = [
  { id: "tenant-a", name: "Tenant A" },
  { id: "tenant-b", name: "Tenant B" },
];

const ORGANIZATIONS: OrganizationSeed[] = [
  { id: "org-alpine", tenantId: "tenant-a", name: "Alpine Recovery Housing" },
];

const COURT_PROGRAMS: CourtProgramSeed[] = [
  {
    id: "court-boulder",
    tenantId: "tenant-a",
    name: "Boulder Recovery Court",
    jurisdiction: "Boulder County",
  },
];

const HOUSES: HouseSeed[] = [
  {
    id: "house-alpine-1",
    tenantId: "tenant-a",
    organizationId: "org-alpine",
    name: "Alpine House 1",
  },
];

const DEV_USERS: DevUserSeed[] = [
  {
    id: "admin-a",
    tenantId: "tenant-a",
    email: "admin-a@example.com",
    displayName: "Admin A",
    roles: [Role.ADMIN],
  },
  {
    id: "supervisor-a",
    tenantId: "tenant-a",
    email: "supervisor-a@example.com",
    displayName: "Supervisor A",
    roles: [Role.SUPERVISOR],
  },
  {
    id: "demo",
    tenantId: "tenant-a",
    email: "demo@example.com",
    displayName: "Demo",
    roles: [Role.ADMIN],
  },
  {
    id: "enduser-a1",
    tenantId: "tenant-a",
    email: "enduser-a1@example.com",
    displayName: "End User A1",
    roles: [Role.END_USER],
  },
  {
    id: "enduser-a2",
    tenantId: "tenant-a",
    email: "enduser-a2@example.com",
    displayName: "End User A2",
    roles: [Role.END_USER],
  },
  {
    id: "sponsor-a",
    tenantId: "tenant-a",
    email: "sponsor-a@example.com",
    displayName: "Sponsor A",
    roles: [Role.SPONSOR],
  },
  {
    id: "verifier-a",
    tenantId: "tenant-a",
    email: "verifier-a@example.com",
    displayName: "Verifier A",
    roles: [Role.MEETING_VERIFIER],
  },
  {
    id: "admin-b",
    tenantId: "tenant-b",
    email: "admin-b@example.com",
    displayName: "Admin B",
    roles: [Role.ADMIN],
  },
  {
    id: "enduser-b1",
    tenantId: "tenant-b",
    email: "enduser-b1@example.com",
    displayName: "End User B1",
    roles: [Role.END_USER],
  },
];

const ACCESS_GRANTS: AccessGrantSeed[] = [
  {
    tenantId: "tenant-a",
    userId: "admin-a",
    role: "platform_owner",
    grantedByUserId: "admin-a",
  },
  {
    tenantId: "tenant-a",
    userId: "demo",
    role: "platform_owner",
    grantedByUserId: "admin-a",
  },
  {
    tenantId: "tenant-a",
    userId: "supervisor-a",
    role: "court_supervisor",
    courtProgramId: "court-boulder",
    grantedByUserId: "admin-a",
  },
  {
    tenantId: "tenant-a",
    userId: "enduser-a1",
    role: "resident_user",
    organizationId: "org-alpine",
    grantedByUserId: "admin-a",
  },
  {
    tenantId: "tenant-a",
    userId: "enduser-a2",
    role: "court_participant",
    courtProgramId: "court-boulder",
    grantedByUserId: "admin-a",
  },
  ...ORGANIZATIONS.filter((organization) => organization.tenantId === "tenant-a").map(
    (organization) => ({
      tenantId: organization.tenantId,
      userId: "demo",
      role: "org_admin" as const,
      organizationId: organization.id,
      grantedByUserId: "admin-a",
    }),
  ),
];

export async function seedDevUsers(env: ApiEnv = loadApiEnv()): Promise<void> {
  const db = createPostgresPool(env.DATABASE_URL);

  try {
    for (const tenant of TENANTS) {
      await db.query(
        `
        INSERT INTO tenants (id, name)
        VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name
      `,
        [tenant.id, tenant.name],
      );
    }

    for (const user of DEV_USERS) {
      await db.query(
        `
        INSERT INTO users (id, tenant_id, email, display_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE
        SET tenant_id = EXCLUDED.tenant_id,
            email = EXCLUDED.email,
            display_name = EXCLUDED.display_name
      `,
        [user.id, user.tenantId, user.email, user.displayName],
      );

      for (const role of user.roles) {
        await db.query(
          `
          INSERT INTO user_roles (tenant_id, user_id, role)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `,
          [user.tenantId, user.id, role],
        );
      }
    }

    for (const organization of ORGANIZATIONS) {
      await db.query(
        `
        INSERT INTO organizations (id, tenant_id, name)
        VALUES ($1, $2, $3)
        ON CONFLICT (tenant_id, id) DO UPDATE
        SET tenant_id = EXCLUDED.tenant_id,
            name = EXCLUDED.name
      `,
        [organization.id, organization.tenantId, organization.name],
      );
    }

    for (const courtProgram of COURT_PROGRAMS) {
      await db.query(
        `
        INSERT INTO court_programs (id, tenant_id, name, jurisdiction)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, id) DO UPDATE
        SET tenant_id = EXCLUDED.tenant_id,
            name = EXCLUDED.name,
            jurisdiction = EXCLUDED.jurisdiction
      `,
        [courtProgram.id, courtProgram.tenantId, courtProgram.name, courtProgram.jurisdiction],
      );
    }

    for (const house of HOUSES) {
      await db.query(
        `
        INSERT INTO houses (id, tenant_id, organization_id, name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (tenant_id, id) DO UPDATE
        SET tenant_id = EXCLUDED.tenant_id,
            organization_id = EXCLUDED.organization_id,
            name = EXCLUDED.name
      `,
        [house.id, house.tenantId, house.organizationId, house.name],
      );
    }

    for (const grant of ACCESS_GRANTS) {
      await db.query(
        `
        INSERT INTO user_roles (
          tenant_id,
          user_id,
          role,
          organization_id,
          court_program_id,
          is_active,
          granted_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, TRUE, $6)
        ON CONFLICT DO NOTHING
      `,
        [
          grant.tenantId,
          grant.userId,
          grant.role,
          grant.organizationId ?? null,
          grant.courtProgramId ?? null,
          grant.grantedByUserId,
        ],
      );
    }

    await db.query(
      `
      INSERT INTO participant_profiles (
        user_id,
        tenant_id,
        participant_type,
        organization_id,
        house_id,
        court_program_id,
        status
      )
      VALUES
        ('enduser-a1', 'tenant-a', 'resident_user', 'org-alpine', 'house-alpine-1', NULL, 'ACTIVE'),
        ('enduser-a2', 'tenant-a', 'court_participant', NULL, NULL, 'court-boulder', 'ACTIVE')
      ON CONFLICT (user_id) DO UPDATE
      SET participant_type = EXCLUDED.participant_type,
          organization_id = EXCLUDED.organization_id,
          house_id = EXCLUDED.house_id,
          court_program_id = EXCLUDED.court_program_id,
          status = EXCLUDED.status,
          updated_at = NOW()
    `,
    );

    await db.query(
      `
      INSERT INTO supervisor_assignments (tenant_id, supervisor_user_id, assigned_user_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (tenant_id, supervisor_user_id, assigned_user_id) DO NOTHING
    `,
      ["tenant-a", "supervisor-a", "enduser-a1"],
    );

    logger.info("dev.seed.complete", {
      tenants: TENANTS.map((tenant) => tenant.id),
      users: DEV_USERS.map((user) => user.id),
    });
  } finally {
    await db.end?.();
  }
}

if (require.main === module) {
  seedDevUsers().catch((error) => {
    logger.error("dev.seed.failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    process.exit(1);
  });
}
