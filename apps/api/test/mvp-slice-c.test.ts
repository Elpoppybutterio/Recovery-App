import { beforeEach, describe, expect, it } from "vitest";
import type { InMemoryDb } from "./in-memory-db";
import { createTestApp, createTestDb, seedCoreFixtures } from "./test-helpers";

function metersToLatitudeDelta(meters: number): number {
  return meters / 111_111;
}

async function createZone(app: ReturnType<typeof createTestApp>, label: string) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/zones",
    headers: { authorization: "Bearer DEV_admin-a" },
    payload: {
      label,
      type: "CIRCLE",
      centerLat: 0,
      centerLng: 0,
      radiusM: 100,
      active: true,
    },
  });

  expect(response.statusCode).toBe(201);
  return (response.json() as { zone: { id: string } }).zone.id;
}

async function assignZone(app: ReturnType<typeof createTestApp>, userId: string, zoneId: string) {
  const response = await app.inject({
    method: "POST",
    url: `/v1/users/${userId}/zones`,
    headers: { authorization: "Bearer DEV_admin-a" },
    payload: {
      zoneId,
      bufferM: 0,
      active: true,
    },
  });
  expect(response.statusCode).toBe(201);
}

describe("MVP Slice C: supervision live location + zone evaluation", () => {
  let db: InMemoryDb;

  beforeEach(async () => {
    db = await createTestDb();
    await seedCoreFixtures(db);
  });

  it("allows END_USER location ping and stores last known location", async () => {
    const app = createTestApp(db);

    const ping = await app.inject({
      method: "POST",
      url: "/v1/location/ping",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: {
        lat: 33.755,
        lng: -84.39,
        accuracyM: 9,
        recordedAt: "2026-02-01T10:00:00.000Z",
      },
    });

    expect(ping.statusCode).toBe(200);
    const stored = db.getLastKnownLocation("tenant-a", "enduser-a1");
    expect(stored).toMatchObject({
      tenant_id: "tenant-a",
      user_id: "enduser-a1",
      lat: 33.755,
      lng: -84.39,
      accuracy_m: 9,
      source: "MOBILE",
    });

    await app.close();
    await db.end?.();
  });

  it("limits SUPERVISOR live view to assigned users and denies unassigned filters", async () => {
    const app = createTestApp(db);

    await app.inject({
      method: "POST",
      url: "/v1/location/ping",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: { lat: 33.755, lng: -84.39, recordedAt: "2026-02-01T10:00:00.000Z" },
    });
    await app.inject({
      method: "POST",
      url: "/v1/location/ping",
      headers: { authorization: "Bearer DEV_enduser-a2" },
      payload: { lat: 33.756, lng: -84.391, recordedAt: "2026-02-01T10:01:00.000Z" },
    });

    const supervisorList = await app.inject({
      method: "GET",
      url: "/v1/supervisor/live",
      headers: { authorization: "Bearer DEV_supervisor-a" },
    });
    expect(supervisorList.statusCode).toBe(200);
    const visibleUserIds = (
      supervisorList.json() as { locations: Array<{ userId: string }> }
    ).locations.map((entry) => entry.userId);
    expect(visibleUserIds).toEqual(["enduser-a1"]);

    const denied = await app.inject({
      method: "GET",
      url: "/v1/supervisor/live?userId=enduser-a2",
      headers: { authorization: "Bearer DEV_supervisor-a" },
    });
    expect(denied.statusCode).toBe(403);

    await app.close();
    await db.end?.();
  });

  it("allows ADMIN live view for all tenant users", async () => {
    const app = createTestApp(db);

    await app.inject({
      method: "POST",
      url: "/v1/location/ping",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: { lat: 33.755, lng: -84.39, recordedAt: "2026-02-01T10:00:00.000Z" },
    });
    await app.inject({
      method: "POST",
      url: "/v1/location/ping",
      headers: { authorization: "Bearer DEV_enduser-a2" },
      payload: { lat: 33.756, lng: -84.391, recordedAt: "2026-02-01T10:01:00.000Z" },
    });

    const adminList = await app.inject({
      method: "GET",
      url: "/v1/supervisor/live",
      headers: { authorization: "Bearer DEV_admin-a" },
    });
    expect(adminList.statusCode).toBe(200);
    const locations = (adminList.json() as { locations: Array<{ userId: string }> }).locations;
    expect(locations.map((entry) => entry.userId).sort()).toEqual(["enduser-a1", "enduser-a2"]);

    await app.close();
    await db.end?.();
  });

  it("creates WARNING/VIOLATION incidents from pings and only notifies for VIOLATION", async () => {
    const app = createTestApp(db);
    const zoneId = await createZone(app, "School perimeter");
    await assignZone(app, "enduser-a1", zoneId);

    const setConfig = await app.inject({
      method: "PUT",
      url: "/v1/admin/config/tenant/default_supervisor_email",
      headers: { authorization: "Bearer DEV_admin-a" },
      payload: { value: "alerts@example.com" },
    });
    expect(setConfig.statusCode).toBe(200);

    const warningPing = await app.inject({
      method: "POST",
      url: "/v1/location/ping",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: {
        lat: metersToLatitudeDelta(140),
        lng: 0,
        recordedAt: "2026-02-01T10:00:00.000Z",
      },
    });
    expect(warningPing.statusCode).toBe(200);
    expect((warningPing.json() as { notificationsQueued: number }).notificationsQueued).toBe(0);

    const afterWarning = db.getIncidentsForTenant("tenant-a");
    expect(afterWarning[0]).toMatchObject({
      user_id: "enduser-a1",
      zone_id: zoneId,
      incident_type: "WARNING",
    });
    expect(db.getNotificationEventsForTenant("tenant-a")).toHaveLength(0);

    const violationPing = await app.inject({
      method: "POST",
      url: "/v1/location/ping",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: {
        lat: metersToLatitudeDelta(20),
        lng: 0,
        recordedAt: "2026-02-01T10:05:00.000Z",
      },
    });
    expect(violationPing.statusCode).toBe(200);
    expect((violationPing.json() as { notificationsQueued: number }).notificationsQueued).toBe(1);

    const incidents = db.getIncidentsForTenant("tenant-a");
    expect(incidents.map((entry) => entry.incident_type)).toContain("VIOLATION");

    const events = db.getNotificationEventsForTenant("tenant-a");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      recipient: "alerts@example.com",
      template_key: "incident_violation",
      status: "PENDING",
    });

    await app.close();
    await db.end?.();
  });
});
