import { Role } from "@recovery/shared-types";
import { buildApp } from "../src/app";
import type { ApiEnv } from "../src/env";
import { InMemoryDb } from "./in-memory-db";

const testEnv: ApiEnv = {
  NODE_ENV: "test",
  API_HOST: "127.0.0.1",
  API_PORT: 0,
  DATABASE_URL: "postgres://test:test@localhost:5432/test",
  ENABLE_DEV_AUTH: true,
  LOG_LEVEL: "info",
  MEETING_FEEDS_AA: "",
  MEETING_FEEDS_NA: "",
  MEETING_IMPORT_RADIUS_MILES: 20,
  MEETING_GUIDE_FEEDS_JSON: "[]",
  MEETING_GUIDE_DEFAULT_TENANT_ID: undefined,
  MEETING_GUIDE_REFRESH_INTERVAL_MS: 43_200_000,
  MEETING_GUIDE_AUTO_INGEST: false,
  MEETING_GUIDE_GEOCODE_MISSING: false,
  MEETING_GUIDE_GEOCODE_USER_AGENT: "Recovery-Accountability/0.1 (+https://sober-ai.app)",
};

export async function createTestDb(): Promise<InMemoryDb> {
  return new InMemoryDb();
}

export function createTestApp(db: InMemoryDb, options: { now?: () => Date } = {}) {
  return buildApp({ db, env: testEnv, now: options.now });
}

export async function seedCoreFixtures(db: InMemoryDb) {
  db.addTenant({ id: "tenant-a", name: "Tenant A" });
  db.addTenant({ id: "tenant-b", name: "Tenant B" });

  db.addUser({
    id: "admin-a",
    tenant_id: "tenant-a",
    email: "admin-a@example.com",
    display_name: "Admin A",
  });
  db.addUser({
    id: "supervisor-a",
    tenant_id: "tenant-a",
    email: "supervisor-a@example.com",
    display_name: "Supervisor A",
  });
  db.addUser({
    id: "enduser-a1",
    tenant_id: "tenant-a",
    email: "enduser-a1@example.com",
    display_name: "End User A1",
  });
  db.addUser({
    id: "enduser-a2",
    tenant_id: "tenant-a",
    email: "enduser-a2@example.com",
    display_name: "End User A2",
  });
  db.addUser({
    id: "sponsor-a",
    tenant_id: "tenant-a",
    email: "sponsor-a@example.com",
    display_name: "Sponsor A",
  });
  db.addUser({
    id: "verifier-a",
    tenant_id: "tenant-a",
    email: "verifier-a@example.com",
    display_name: "Verifier A",
  });
  db.addUser({
    id: "admin-b",
    tenant_id: "tenant-b",
    email: "admin-b@example.com",
    display_name: "Admin B",
  });
  db.addUser({
    id: "enduser-b1",
    tenant_id: "tenant-b",
    email: "enduser-b1@example.com",
    display_name: "End User B1",
  });

  db.addUserRole({ tenant_id: "tenant-a", user_id: "admin-a", role: Role.ADMIN });
  db.addUserRole({ tenant_id: "tenant-a", user_id: "supervisor-a", role: Role.SUPERVISOR });
  db.addUserRole({ tenant_id: "tenant-a", user_id: "enduser-a1", role: Role.END_USER });
  db.addUserRole({ tenant_id: "tenant-a", user_id: "enduser-a2", role: Role.END_USER });
  db.addUserRole({ tenant_id: "tenant-a", user_id: "sponsor-a", role: Role.SPONSOR });
  db.addUserRole({
    tenant_id: "tenant-a",
    user_id: "verifier-a",
    role: Role.MEETING_VERIFIER,
  });
  db.addUserRole({ tenant_id: "tenant-b", user_id: "admin-b", role: Role.ADMIN });
  db.addUserRole({ tenant_id: "tenant-b", user_id: "enduser-b1", role: Role.END_USER });

  db.addSupervisorAssignment({
    tenant_id: "tenant-a",
    supervisor_user_id: "supervisor-a",
    assigned_user_id: "enduser-a1",
  });
}
