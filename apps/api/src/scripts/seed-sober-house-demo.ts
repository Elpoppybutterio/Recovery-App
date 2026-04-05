import { Role } from "@recovery/shared-types";
import { createLogger } from "@recovery/shared-utils";
import { createRepositories } from "../db/repositories";
import { createPostgresPool } from "../db/postgres";
import type { ApiEnv } from "../env";
import { loadApiEnv } from "../env";

const logger = createLogger("api");

const TENANT_ID = "tenant-a";
const ORGANIZATION_ID = "org-alpine";
const HOUSE_ID = "house-alpine-1";
const HOUSE_NAME = "Alpine Demo House";
const RESIDENT_USER_ID = "enduser-a1";
const RESIDENT_EMAIL = "enduser-a1@example.com";
const RESIDENT_DISPLAY_NAME = "End User A1";
const OPERATOR_USER_ID = "demo";
const CONTROL_PLANE_CONFIG_KEY = `sober_house.control_plane.${ORGANIZATION_ID}`;
const ALERT_ID = "alert-house-curfew-demo";
const NOW_ISO = "2026-04-04T12:00:00.000Z";

const DEMO_OBLIGATIONS = [
  {
    id: "shobl:org-alpine:enduser-a1:demo-chore",
    obligationType: "CHORE",
    scheduledAt: "2026-04-04T16:00:00.000Z",
    dueAt: "2026-04-04T19:00:00.000Z",
    proofRequired: true,
  },
  {
    id: "shobl:org-alpine:enduser-a1:demo-house-meeting",
    obligationType: "HOUSE_MEETING",
    scheduledAt: "2026-04-05T01:00:00.000Z",
    dueAt: "2026-04-05T02:15:00.000Z",
    proofRequired: true,
  },
] as const;

type ExistingConfigRow = {
  value_json: unknown;
};

type ExistingUserRow = {
  id: string;
  tenant_id: string;
};

type ExistingOrganizationRow = {
  id: string;
  tenant_id: string;
};

type MembershipRow = {
  id: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function mergeAnnouncementById(
  existing: unknown,
  nextAnnouncement: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const merged = new Map<string, Record<string, unknown>>();

  for (const entry of asRecordArray(existing)) {
    const id = typeof entry.id === "string" ? entry.id : null;
    if (!id) {
      continue;
    }
    merged.set(id, entry);
  }

  merged.set(String(nextAnnouncement.id), nextAnnouncement);
  return Array.from(merged.values());
}

async function ensureResidentUser(
  env: ApiEnv,
  userId: string,
  displayName: string,
  email: string,
): Promise<void> {
  const db = createPostgresPool(env.DATABASE_URL);
  try {
    const existing = await db.query<ExistingUserRow>(
      `
      SELECT id, tenant_id
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
      [userId],
    );

    const user = existing.rows[0] ?? null;
    if (user && user.tenant_id !== TENANT_ID) {
      throw new Error(
        `User ${userId} already exists in tenant ${user.tenant_id}; refusing cross-tenant overwrite.`,
      );
    }

    if (!user) {
      await db.query(
        `
        INSERT INTO users (id, tenant_id, email, display_name)
        VALUES ($1, $2, $3, $4)
      `,
        [userId, TENANT_ID, email, displayName],
      );
    }

    await db.query(
      `
      INSERT INTO user_roles (
        tenant_id,
        user_id,
        role
      )
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING
    `,
      [TENANT_ID, userId, Role.END_USER],
    );

    await db.query(
      `
      INSERT INTO user_roles (
        tenant_id,
        user_id,
        role,
        organization_id,
        is_active,
        granted_by_user_id
      )
      VALUES ($1, $2, 'resident_user', $3, TRUE, $4)
      ON CONFLICT DO NOTHING
    `,
      [TENANT_ID, userId, ORGANIZATION_ID, OPERATOR_USER_ID],
    );
  } finally {
    await db.end?.();
  }
}

export async function seedSoberHouseDemo(env: ApiEnv = loadApiEnv()): Promise<void> {
  const db = createPostgresPool(env.DATABASE_URL);
  const repositories = createRepositories(db);

  try {
    const operatorUser = await db.query<ExistingUserRow>(
      `
      SELECT id, tenant_id
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
      [OPERATOR_USER_ID],
    );
    const operator = operatorUser.rows[0] ?? null;
    if (!operator || operator.tenant_id !== TENANT_ID) {
      throw new Error(
        `Expected operator user ${OPERATOR_USER_ID} in ${TENANT_ID}. Seed or restore DEV_${OPERATOR_USER_ID} first.`,
      );
    }

    const organizationResult = await db.query<ExistingOrganizationRow>(
      `
      SELECT id, tenant_id
      FROM organizations
      WHERE id = $1
      LIMIT 1
    `,
      [ORGANIZATION_ID],
    );
    const organization = organizationResult.rows[0] ?? null;
    if (!organization) {
      throw new Error(`Expected organization ${ORGANIZATION_ID} to already exist.`);
    }
    if (organization.tenant_id !== TENANT_ID) {
      throw new Error(
        `Organization ${ORGANIZATION_ID} belongs to ${organization.tenant_id}, expected ${TENANT_ID}.`,
      );
    }

    await ensureResidentUser(env, RESIDENT_USER_ID, RESIDENT_DISPLAY_NAME, RESIDENT_EMAIL);

    await db.query(
      `
      INSERT INTO houses (id, tenant_id, organization_id, name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (tenant_id, id)
      DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        name = EXCLUDED.name
    `,
      [HOUSE_ID, TENANT_ID, ORGANIZATION_ID, HOUSE_NAME],
    );

    await repositories.upsertParticipantProfile(TENANT_ID, RESIDENT_USER_ID, {
      participantType: "resident_user",
      organizationId: ORGANIZATION_ID,
      houseId: HOUSE_ID,
      courtProgramId: null,
      status: "ACTIVE",
    });

    const membershipResult = await db.query<MembershipRow>(
      `
      SELECT id
      FROM resident_house_memberships
      WHERE tenant_id = $1
        AND organization_id = $2
        AND house_id = $3
        AND resident_user_id = $4
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `,
      [TENANT_ID, ORGANIZATION_ID, HOUSE_ID, RESIDENT_USER_ID],
    );
    const membershipId = membershipResult.rows[0]?.id ?? null;
    if (!membershipId) {
      throw new Error("Resident house membership was not created.");
    }

    for (const obligation of DEMO_OBLIGATIONS) {
      await db.query(
        `
        INSERT INTO sober_house_obligations (
          id,
          tenant_id,
          organization_id,
          house_id,
          resident_user_id,
          resident_house_membership_id,
          obligation_type,
          scheduled_at,
          due_at,
          proof_required,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE')
        ON CONFLICT (id)
        DO UPDATE SET
          organization_id = EXCLUDED.organization_id,
          house_id = EXCLUDED.house_id,
          resident_user_id = EXCLUDED.resident_user_id,
          resident_house_membership_id = EXCLUDED.resident_house_membership_id,
          obligation_type = EXCLUDED.obligation_type,
          scheduled_at = EXCLUDED.scheduled_at,
          due_at = EXCLUDED.due_at,
          proof_required = EXCLUDED.proof_required,
          status = EXCLUDED.status,
          updated_at = NOW()
      `,
        [
          obligation.id,
          TENANT_ID,
          ORGANIZATION_ID,
          HOUSE_ID,
          RESIDENT_USER_ID,
          membershipId,
          obligation.obligationType,
          obligation.scheduledAt,
          obligation.dueAt,
          obligation.proofRequired,
        ],
      );
    }

    const existingConfig = await db.query<ExistingConfigRow>(
      `
      SELECT value_json
      FROM tenant_config
      WHERE tenant_id = $1
        AND config_key = $2
      LIMIT 1
    `,
      [TENANT_ID, CONTROL_PLANE_CONFIG_KEY],
    );

    const rawConfig = existingConfig.rows[0]?.value_json ?? {};
    const existingConfigRecord = isRecord(rawConfig) ? rawConfig : {};
    const existingStore = isRecord(existingConfigRecord.store)
      ? existingConfigRecord.store
      : existingConfigRecord;

    const nextStore = {
      ...existingStore,
      version: typeof existingStore.version === "number" ? existingStore.version : 16,
      houseAlertAnnouncements: mergeAnnouncementById(existingStore.houseAlertAnnouncements, {
        id: ALERT_ID,
        organizationId: ORGANIZATION_ID,
        houseId: HOUSE_ID,
        recurringObligationId: null,
        title: "Demo curfew reminder",
        body: "Confirm you reviewed the 10:00 PM curfew rules before tonight's walkthrough.",
        severity: "ACTION_REQUIRED",
        startsAt: NOW_ISO,
        endsAt: null,
        reminderLeadMinutes: 0,
        inAppReminderEnabled: false,
        addToCalendar: false,
        acknowledgmentRequired: true,
        status: "ACTIVE",
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
      }),
    };

    await db.query(
      `
      INSERT INTO tenant_config (
        tenant_id,
        config_key,
        value_json,
        updated_by_user_id
      )
      VALUES ($1, $2, $3::jsonb, $4)
      ON CONFLICT (tenant_id, config_key)
      DO UPDATE SET
        value_json = EXCLUDED.value_json,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = NOW()
    `,
      [
        TENANT_ID,
        CONTROL_PLANE_CONFIG_KEY,
        JSON.stringify({ ...existingConfigRecord, store: nextStore }),
        OPERATOR_USER_ID,
      ],
    );

    logger.info("sober_house.demo.seeded", {
      tenantId: TENANT_ID,
      organizationId: ORGANIZATION_ID,
      houseId: HOUSE_ID,
      residentUserId: RESIDENT_USER_ID,
      operatorUserId: OPERATOR_USER_ID,
      obligationIds: DEMO_OBLIGATIONS.map((obligation) => obligation.id),
      alertId: ALERT_ID,
    });
  } finally {
    await db.end?.();
  }
}

if (require.main === module) {
  seedSoberHouseDemo().catch((error) => {
    logger.error("sober_house.demo.seed.failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    process.exit(1);
  });
}
