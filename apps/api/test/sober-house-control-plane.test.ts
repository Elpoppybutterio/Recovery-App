import { beforeEach, describe, expect, it } from "vitest";
import type { InMemoryDb } from "./in-memory-db";
import { createTestApp, createTestDb, seedCoreFixtures } from "./test-helpers";

describe("sober-house control plane access", () => {
  let db: InMemoryDb;

  beforeEach(async () => {
    db = await createTestDb();
    await seedCoreFixtures(db);
  });

  it("allows resident users with org access to load the dashboard as staff viewers", async () => {
    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/operator/sober-house/control-plane",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      session: {
        operatorUserId: "enduser-a1",
        operatorRole: "STAFF_VIEWER",
        allowedRoles: ["STAFF_VIEWER"],
        availableOrganizations: [
          {
            organizationId: "org-alpine",
            operatorRole: "STAFF_VIEWER",
          },
        ],
      },
    });

    await app.close();
    await db.end?.();
  });

  it("persists PUT updates and returns the updated snapshot", async () => {
    const app = createTestApp(db);

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/v1/operator/sober-house/control-plane?organizationId=org-alpine",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
      payload: {
        store: {
          version: 16,
          organization: {
            id: "org-alpine",
            name: "Alpine Recovery Housing",
            primaryContactName: "",
            primaryPhone: "",
            primaryEmail: "",
            notes: "persisted from test",
            status: "ACTIVE",
            createdAt: "2026-04-02T12:00:00.000Z",
            updatedAt: "2026-04-02T12:00:00.000Z",
          },
        },
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      session: {
        organizationId: "org-alpine",
      },
      data: {
        store: {
          organization: {
            notes: "persisted from test",
          },
        },
      },
    });

    const getResponse = await app.inject({
      method: "GET",
      url: "/v1/operator/sober-house/control-plane?organizationId=org-alpine",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toMatchObject({
      data: {
        store: {
          organization: {
            notes: "persisted from test",
          },
        },
      },
    });

    await app.close();
    await db.end?.();
  });

  it("honors organizationId when a user can switch between organizations", async () => {
    db.addOrganization({
      id: "org-birch",
      tenant_id: "tenant-a",
      name: "Birch Recovery Housing",
    });
    db.addHouse({
      id: "house-birch-1",
      tenant_id: "tenant-a",
      organization_id: "org-birch",
      name: "Birch House 1",
    });
    db.addUserRole({
      tenant_id: "tenant-a",
      user_id: "enduser-a1",
      role: "resident_user",
      organization_id: "org-birch",
      granted_by_user_id: "admin-a",
    });

    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/operator/sober-house/control-plane?organizationId=org-birch",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      session: {
        organizationId: "org-birch",
        organizationName: "Birch Recovery Housing",
      },
    });

    await app.close();
    await db.end?.();
  });

  it("allows demo platform owner access across all tenant organizations", async () => {
    db.addOrganization({
      id: "org-birch",
      tenant_id: "tenant-a",
      name: "Birch Recovery Housing",
    });
    db.addHouse({
      id: "house-birch-1",
      tenant_id: "tenant-a",
      organization_id: "org-birch",
      name: "Birch House 1",
    });

    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/operator/sober-house/control-plane",
      headers: {
        authorization: "Bearer DEV_demo",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      session: {
        operatorUserId: "demo",
        operatorRole: "ORG_ADMIN",
        allowedRoles: ["ORG_ADMIN", "HOUSE_MANAGER", "STAFF_VIEWER"],
        availableOrganizations: [
          {
            organizationId: "org-alpine",
            organizationName: "Alpine Recovery Housing",
            operatorRole: "ORG_ADMIN",
          },
          {
            organizationId: "org-birch",
            organizationName: "Birch Recovery Housing",
            operatorRole: "ORG_ADMIN",
          },
        ],
      },
    });

    await app.close();
    await db.end?.();
  });

  it("honors organizationId for demo platform owner sessions", async () => {
    db.addOrganization({
      id: "org-birch",
      tenant_id: "tenant-a",
      name: "Birch Recovery Housing",
    });
    db.addHouse({
      id: "house-birch-1",
      tenant_id: "tenant-a",
      organization_id: "org-birch",
      name: "Birch House 1",
    });

    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/operator/sober-house/control-plane?organizationId=org-birch",
      headers: {
        authorization: "Bearer DEV_demo",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      session: {
        operatorUserId: "demo",
        organizationId: "org-birch",
        organizationName: "Birch Recovery Housing",
      },
    });

    await app.close();
    await db.end?.();
  });

  it("keeps users without sober-house org access forbidden", async () => {
    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/operator/sober-house/control-plane",
      headers: {
        authorization: "Bearer DEV_enduser-b1",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "forbidden",
      message: "No sober-housing organization access is available for this account.",
    });

    await app.close();
    await db.end?.();
  });

  it("persists control-plane updates for demo", async () => {
    const app = createTestApp(db);

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/v1/operator/sober-house/control-plane?organizationId=org-alpine",
      headers: {
        authorization: "Bearer DEV_demo",
      },
      payload: {
        store: {
          version: 16,
          organization: {
            id: "org-alpine",
            name: "Alpine Recovery Housing",
            primaryContactName: "",
            primaryPhone: "",
            primaryEmail: "",
            notes: "saved by demo",
            status: "ACTIVE",
            createdAt: "2026-04-02T12:00:00.000Z",
            updatedAt: "2026-04-02T12:00:00.000Z",
          },
        },
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      data: {
        store: {
          organization: {
            notes: "saved by demo",
          },
        },
      },
    });

    await app.close();
    await db.end?.();
  });
});
