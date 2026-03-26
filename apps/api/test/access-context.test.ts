import { Role } from "@recovery/shared-types";
import { beforeEach, describe, expect, it } from "vitest";
import type { InMemoryDb } from "./in-memory-db";
import { createTestApp, createTestDb, seedCoreFixtures } from "./test-helpers";

describe("access context", () => {
  let db: InMemoryDb;

  beforeEach(async () => {
    db = await createTestDb();
    await seedCoreFixtures(db);
  });

  it("returns backend-scoped organization access for authorized admins only", async () => {
    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/me/access-context",
      headers: {
        authorization: "Bearer DEV_manager-a",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user: {
        userId: "manager-a",
        tenantId: "tenant-a",
        email: "manager-a@example.com",
      },
      grants: [
        {
          role: "org_admin",
          organizationId: "org-alpine",
          organizationName: "Alpine Recovery Housing",
        },
      ],
      capabilities: {
        canManageOrganizations: true,
        canManageCourtPrograms: false,
        isPlatformOwner: false,
        protectedRoles: ["org_admin"],
      },
    });

    await app.close();
    await db.end?.();
  });

  it("keeps participant users out of protected org and court configuration", async () => {
    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/me/access-context",
      headers: {
        authorization: "Bearer DEV_enduser-a2",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user: {
        userId: "enduser-a2",
      },
      grants: [
        {
          role: "court_participant",
          courtProgramId: "court-boulder",
          courtProgramName: "Boulder Recovery Court",
        },
      ],
      capabilities: {
        participantRoles: ["court_participant"],
        protectedRoles: [],
        canManageOrganizations: false,
        canManageCourtPrograms: false,
      },
    });

    await app.close();
    await db.end?.();
  });

  it("returns court-scoped supervisory access without org authority", async () => {
    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/me/access-context",
      headers: {
        authorization: "Bearer DEV_officer-a",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user: {
        userId: "officer-a",
      },
      grants: [
        {
          role: "probation_officer",
          courtProgramId: "court-boulder",
          courtProgramName: "Boulder Recovery Court",
          courtProgramJurisdiction: "Boulder County",
        },
      ],
      capabilities: {
        protectedRoles: ["probation_officer"],
        canManageOrganizations: false,
        canManageCourtPrograms: true,
        isPlatformOwner: false,
      },
    });

    await app.close();
    await db.end?.();
  });

  it("gives platform owners full protected access across tracks", async () => {
    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/me/access-context",
      headers: {
        authorization: "Bearer DEV_admin-a",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user: {
        userId: "admin-a",
      },
      grants: [
        {
          role: "platform_owner",
        },
      ],
      capabilities: {
        canManageOrganizations: true,
        canManageCourtPrograms: true,
        isPlatformOwner: true,
      },
    });

    await app.close();
    await db.end?.();
  });

  it("drops revoked or inactive protected grants from the access-context response", async () => {
    db.addUser({
      id: "revoked-a",
      tenant_id: "tenant-a",
      email: "revoked-a@example.com",
      display_name: "Revoked User",
    });
    db.addUserRole({ tenant_id: "tenant-a", user_id: "revoked-a", role: Role.END_USER });
    db.addUserRole({
      tenant_id: "tenant-a",
      user_id: "revoked-a",
      role: "org_admin",
      organization_id: "org-alpine",
      is_active: false,
      revoked_at: "2026-03-26T00:00:00.000Z",
      granted_by_user_id: "admin-a",
    });

    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/me/access-context",
      headers: {
        authorization: "Bearer DEV_revoked-a",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user: {
        userId: "revoked-a",
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

    await app.close();
    await db.end?.();
  });
});
