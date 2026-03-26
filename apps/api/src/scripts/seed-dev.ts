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

type AccessGrantSeed = {
  tenantId: string;
  userId: string;
  role: "platform_owner" | "resident_user" | "court_participant" | "court_supervisor";
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
          ON CONFLICT (tenant_id, user_id, role) DO NOTHING
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
        ON CONFLICT (id) DO UPDATE
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
        ON CONFLICT (id) DO UPDATE
        SET tenant_id = EXCLUDED.tenant_id,
            name = EXCLUDED.name,
            jurisdiction = EXCLUDED.jurisdiction
      `,
        [courtProgram.id, courtProgram.tenantId, courtProgram.name, courtProgram.jurisdiction],
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
