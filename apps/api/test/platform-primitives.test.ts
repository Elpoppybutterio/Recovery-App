import { beforeEach, describe, expect, it } from "vitest";
import type { InMemoryDb } from "./in-memory-db";
import { createTestApp, createTestDb, seedCoreFixtures } from "./test-helpers";

describe("core platform primitives", () => {
  let db: InMemoryDb;

  beforeEach(async () => {
    db = await createTestDb();
    await seedCoreFixtures(db);
  });

  it("enforces tenant isolation (tenant A actor cannot read tenant B user)", async () => {
    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/users/enduser-b1",
      headers: {
        authorization: "Bearer DEV_admin-a",
      },
    });

    expect(response.statusCode).toBe(404);

    await app.close();
    await db.end?.();
  });

  it("enforces RBAC deny and allow cases for assigned-user reads", async () => {
    const app = createTestApp(db);

    const deniedByPermission = await app.inject({
      method: "GET",
      url: "/v1/users/enduser-a1",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
    });
    expect(deniedByPermission.statusCode).toBe(403);

    const deniedByAssignment = await app.inject({
      method: "GET",
      url: "/v1/users/enduser-a2",
      headers: {
        authorization: "Bearer DEV_supervisor-a",
      },
    });
    expect(deniedByAssignment.statusCode).toBe(403);

    const allowed = await app.inject({
      method: "GET",
      url: "/v1/users/enduser-a1",
      headers: {
        authorization: "Bearer DEV_supervisor-a",
      },
    });
    expect(allowed.statusCode).toBe(200);

    await app.close();
    await db.end?.();
  });

  it("writes audit_log entries for /v1/me sensitive reads", async () => {
    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: {
        authorization: "Bearer DEV_admin-a",
      },
    });

    expect(response.statusCode).toBe(200);

    const latestAudit = db.getLatestAuditForActor("admin-a");
    expect(latestAudit).toMatchObject({
      tenant_id: "tenant-a",
      actor_user_id: "admin-a",
      action: "auth.me.read",
      subject_type: "user",
      subject_id: "admin-a",
    });

    await app.close();
    await db.end?.();
  });
});
