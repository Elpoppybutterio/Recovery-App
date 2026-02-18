import { beforeEach, describe, expect, it } from "vitest";
import type { InMemoryDb } from "./in-memory-db";
import { createTestApp, createTestDb, seedCoreFixtures } from "./test-helpers";

async function createZone(app: ReturnType<typeof createTestApp>, label: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/zones",
    headers: { authorization: "Bearer DEV_admin-a" },
    payload: {
      label,
      type: "CIRCLE",
      centerLat: 33.755,
      centerLng: -84.39,
      radiusM: 120,
      active: true,
    },
  });

  expect(response.statusCode).toBe(201);
  return (response.json() as { zone: { id: string } }).zone.id;
}

describe("MVP Slice B: exclusion zones + incidents + notifications", () => {
  let db: InMemoryDb;

  beforeEach(async () => {
    db = await createTestDb();
    await seedCoreFixtures(db);
  });

  it("allows ADMIN/SUPERVISOR to create and list zones, but denies END_USER", async () => {
    const app = createTestApp(db);

    const adminCreate = await app.inject({
      method: "POST",
      url: "/v1/zones",
      headers: { authorization: "Bearer DEV_admin-a" },
      payload: {
        label: "School perimeter",
        type: "CIRCLE",
        centerLat: 33.755,
        centerLng: -84.39,
        radiusM: 150,
      },
    });
    expect(adminCreate.statusCode).toBe(201);

    const supervisorCreate = await app.inject({
      method: "POST",
      url: "/v1/zones",
      headers: { authorization: "Bearer DEV_supervisor-a" },
      payload: {
        label: "Park exclusion",
        type: "CIRCLE",
        centerLat: 33.756,
        centerLng: -84.391,
        radiusM: 100,
      },
    });
    expect(supervisorCreate.statusCode).toBe(201);

    const denied = await app.inject({
      method: "POST",
      url: "/v1/zones",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: {
        label: "Denied zone",
        type: "CIRCLE",
        centerLat: 33.756,
        centerLng: -84.391,
        radiusM: 90,
      },
    });
    expect(denied.statusCode).toBe(403);

    const list = await app.inject({
      method: "GET",
      url: "/v1/zones",
      headers: { authorization: "Bearer DEV_supervisor-a" },
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { zones: unknown[] }).zones.length).toBe(2);

    await app.close();
    await db.end?.();
  });

  it("enforces role + assignment constraints when assigning user zone rules", async () => {
    const app = createTestApp(db);
    const zoneId = await createZone(app, "Assignment zone");

    const assigned = await app.inject({
      method: "POST",
      url: "/v1/users/enduser-a1/zones",
      headers: { authorization: "Bearer DEV_supervisor-a" },
      payload: {
        zoneId,
        bufferM: 30,
        active: true,
      },
    });
    expect(assigned.statusCode).toBe(201);

    const deniedByAssignment = await app.inject({
      method: "POST",
      url: "/v1/users/enduser-a2/zones",
      headers: { authorization: "Bearer DEV_supervisor-a" },
      payload: {
        zoneId,
        bufferM: 30,
        active: true,
      },
    });
    expect(deniedByAssignment.statusCode).toBe(403);

    const deniedByRole = await app.inject({
      method: "POST",
      url: "/v1/users/enduser-a1/zones",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: {
        zoneId,
        bufferM: 30,
        active: true,
      },
    });
    expect(deniedByRole.statusCode).toBe(403);

    const adminAssigned = await app.inject({
      method: "POST",
      url: "/v1/users/enduser-a2/zones",
      headers: { authorization: "Bearer DEV_admin-a" },
      payload: {
        zoneId,
        bufferM: 10,
        active: true,
      },
    });
    expect(adminAssigned.statusCode).toBe(201);

    await app.close();
    await db.end?.();
  });

  it("allows END_USER incident reporting and persists incidents", async () => {
    const app = createTestApp(db);
    const zoneId = await createZone(app, "Incident zone");

    const report = await app.inject({
      method: "POST",
      url: "/v1/incidents/report",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: {
        zoneId,
        type: "WARNING",
        metadata: {
          source: "app",
        },
      },
    });

    expect(report.statusCode).toBe(201);
    const incidents = db.getIncidentsForTenant("tenant-a");
    expect(incidents.length).toBe(1);
    expect(incidents[0]).toMatchObject({
      user_id: "enduser-a1",
      zone_id: zoneId,
      incident_type: "WARNING",
      status: "OPEN",
    });

    await app.close();
    await db.end?.();
  });

  it("creates notification events when default_supervisor_email is configured", async () => {
    const app = createTestApp(db);
    const zoneId = await createZone(app, "Notification zone");

    const configResponse = await app.inject({
      method: "PUT",
      url: "/v1/admin/config/tenant/default_supervisor_email",
      headers: { authorization: "Bearer DEV_admin-a" },
      payload: {
        value: "supervisor-alerts@example.com",
      },
    });
    expect(configResponse.statusCode).toBe(200);

    const report = await app.inject({
      method: "POST",
      url: "/v1/incidents/report",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: {
        zoneId,
        type: "VIOLATION",
      },
    });

    expect(report.statusCode).toBe(201);
    expect((report.json() as { notificationsQueued: number }).notificationsQueued).toBe(1);

    const events = db.getNotificationEventsForTenant("tenant-a");
    expect(events.length).toBe(1);
    expect(events[0]).toMatchObject({
      channel: "EMAIL",
      recipient: "supervisor-alerts@example.com",
      template_key: "incident_violation",
      status: "PENDING",
    });

    await app.close();
    await db.end?.();
  });

  it("limits supervisor incident list to assigned users and denies unassigned user filters", async () => {
    const app = createTestApp(db);
    const zoneId = await createZone(app, "Supervisor scope zone");

    const reportA1 = await app.inject({
      method: "POST",
      url: "/v1/incidents/report",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: {
        zoneId,
        type: "WARNING",
      },
    });
    expect(reportA1.statusCode).toBe(201);

    const reportA2 = await app.inject({
      method: "POST",
      url: "/v1/incidents/report",
      headers: { authorization: "Bearer DEV_enduser-a2" },
      payload: {
        zoneId,
        type: "VIOLATION",
      },
    });
    expect(reportA2.statusCode).toBe(201);

    const supervisorList = await app.inject({
      method: "GET",
      url: "/v1/supervisor/incidents",
      headers: { authorization: "Bearer DEV_supervisor-a" },
    });
    expect(supervisorList.statusCode).toBe(200);
    const supervisorPayload = supervisorList.json() as { incidents: Array<{ userId: string }> };
    expect(supervisorPayload.incidents.length).toBe(1);
    expect(supervisorPayload.incidents[0].userId).toBe("enduser-a1");

    const supervisorDenied = await app.inject({
      method: "GET",
      url: "/v1/supervisor/incidents?userId=enduser-a2",
      headers: { authorization: "Bearer DEV_supervisor-a" },
    });
    expect(supervisorDenied.statusCode).toBe(403);

    const adminList = await app.inject({
      method: "GET",
      url: "/v1/supervisor/incidents",
      headers: { authorization: "Bearer DEV_admin-a" },
    });
    expect(adminList.statusCode).toBe(200);
    expect((adminList.json() as { incidents: unknown[] }).incidents.length).toBe(2);

    const latestAudit = db.getLatestAuditForActor("supervisor-a");
    expect(latestAudit?.action).toBe("supervisor.incidents.list_view");

    await app.close();
    await db.end?.();
  });
});
