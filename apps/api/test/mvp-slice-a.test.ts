import { beforeEach, describe, expect, it } from "vitest";
import type { InMemoryDb } from "./in-memory-db";
import { createTestApp, createTestDb, seedCoreFixtures } from "./test-helpers";

function buildClock(startIso = "2026-01-01T00:00:00.000Z") {
  let current = new Date(startIso);
  return {
    now: () => new Date(current),
    set: (iso: string) => {
      current = new Date(iso);
    },
  };
}

describe("MVP Slice A: meetings + attendance + signature", () => {
  let db: InMemoryDb;

  beforeEach(async () => {
    db = await createTestDb();
    await seedCoreFixtures(db);
  });

  it("creates meetings for ADMIN/SUPERVISOR and denies END_USER", async () => {
    const app = createTestApp(db);
    const payload = {
      name: "Downtown Recovery",
      address: "100 Main St",
      lat: 39.73,
      lng: -104.99,
      radiusM: 150,
    };

    const adminCreate = await app.inject({
      method: "POST",
      url: "/v1/meetings",
      headers: { authorization: "Bearer DEV_admin-a" },
      payload,
    });
    expect(adminCreate.statusCode).toBe(201);

    const supervisorCreate = await app.inject({
      method: "POST",
      url: "/v1/meetings",
      headers: { authorization: "Bearer DEV_supervisor-a" },
      payload: { ...payload, name: "Westside Recovery" },
    });
    expect(supervisorCreate.statusCode).toBe(201);

    const endUserDenied = await app.inject({
      method: "POST",
      url: "/v1/meetings",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: { ...payload, name: "Denied Meeting" },
    });
    expect(endUserDenied.statusCode).toBe(403);

    await app.close();
    await db.end?.();
  });

  it("filters meetings by location radius when lat/lng are provided", async () => {
    const app = createTestApp(db);

    const createMeeting = async (payload: {
      name: string;
      address: string;
      lat: number;
      lng: number;
      radiusM: number;
    }) =>
      app.inject({
        method: "POST",
        url: "/v1/meetings",
        headers: { authorization: "Bearer DEV_admin-a" },
        payload,
      });

    await createMeeting({
      name: "Nearby Meeting",
      address: "101 Near St",
      lat: 40.01,
      lng: -105,
      radiusM: 120,
    });
    await createMeeting({
      name: "Far Meeting",
      address: "999 Far St",
      lat: 41,
      lng: -105,
      radiusM: 120,
    });

    const list = await app.inject({
      method: "GET",
      url: "/v1/meetings?lat=40&lng=-105&radiusMiles=20",
      headers: { authorization: "Bearer DEV_enduser-a1" },
    });

    expect(list.statusCode).toBe(200);
    const payload = list.json() as { meetings: Array<{ name: string }> };
    expect(payload.meetings.map((meeting) => meeting.name)).toEqual(["Nearby Meeting"]);

    await app.close();
    await db.end?.();
  });

  it("supports check-in/check-out with dwell-based status transitions", async () => {
    const clock = buildClock("2026-01-02T10:00:00.000Z");
    const app = createTestApp(db, { now: clock.now });

    const meetingCreate = await app.inject({
      method: "POST",
      url: "/v1/meetings",
      headers: { authorization: "Bearer DEV_admin-a" },
      payload: {
        name: "Morning Meeting",
        address: "1 Center Plaza",
        lat: 35,
        lng: -90,
        radiusM: 120,
      },
    });
    const meetingId = (meetingCreate.json() as { id: string }).id;

    const checkInOne = await app.inject({
      method: "POST",
      url: "/v1/attendance/check-in",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: { meetingId },
    });
    expect(checkInOne.statusCode).toBe(201);
    const attendanceIdOne = (checkInOne.json() as { attendance: { id: string } }).attendance.id;

    clock.set("2026-01-02T10:30:00.000Z");
    const checkOutOne = await app.inject({
      method: "POST",
      url: "/v1/attendance/check-out",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: { attendanceId: attendanceIdOne },
    });
    expect(checkOutOne.statusCode).toBe(200);
    expect(
      (checkOutOne.json() as { attendance: { dwellSeconds: number; status: string } }).attendance,
    ).toMatchObject({
      dwellSeconds: 1800,
      status: "INCOMPLETE",
    });

    clock.set("2026-01-02T12:00:00.000Z");
    const checkInTwo = await app.inject({
      method: "POST",
      url: "/v1/attendance/check-in",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: { meetingId },
    });
    const attendanceIdTwo = (checkInTwo.json() as { attendance: { id: string } }).attendance.id;

    clock.set("2026-01-02T13:00:00.000Z");
    const checkOutTwo = await app.inject({
      method: "POST",
      url: "/v1/attendance/check-out",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: { attendanceId: attendanceIdTwo },
    });
    expect(
      (checkOutTwo.json() as { attendance: { dwellSeconds: number; status: string } }).attendance,
    ).toMatchObject({
      dwellSeconds: 3600,
      status: "PROVISIONAL",
    });

    const latestAudit = db.getLatestAuditForActor("enduser-a1");
    expect(latestAudit?.action).toBe("attendance.check_out");

    await app.close();
    await db.end?.();
  });

  it("allows MEETING_VERIFIER to sign and marks attendance VERIFIED", async () => {
    const clock = buildClock("2026-01-03T08:00:00.000Z");
    const app = createTestApp(db, { now: clock.now });

    const meetingCreate = await app.inject({
      method: "POST",
      url: "/v1/meetings",
      headers: { authorization: "Bearer DEV_admin-a" },
      payload: {
        name: "Verification Meeting",
        address: "500 Elm",
        lat: 40,
        lng: -105,
        radiusM: 100,
      },
    });
    const meetingId = (meetingCreate.json() as { id: string }).id;

    const checkIn = await app.inject({
      method: "POST",
      url: "/v1/attendance/check-in",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: { meetingId },
    });
    const attendanceId = (checkIn.json() as { attendance: { id: string } }).attendance.id;

    clock.set("2026-01-03T09:05:00.000Z");
    await app.inject({
      method: "POST",
      url: "/v1/attendance/check-out",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: { attendanceId },
    });

    const sign = await app.inject({
      method: "POST",
      url: `/v1/attendance/${attendanceId}/sign`,
      headers: { authorization: "Bearer DEV_verifier-a" },
      payload: { signatureBlob: "base64:signature" },
    });
    expect(sign.statusCode).toBe(200);
    expect((sign.json() as { attendance: { status: string } }).attendance.status).toBe("VERIFIED");

    await app.close();
    await db.end?.();
  });

  it("limits supervisor list to assigned users and denies unassigned filtered access", async () => {
    const clock = buildClock("2026-01-04T10:00:00.000Z");
    const app = createTestApp(db, { now: clock.now });

    const meetingCreate = await app.inject({
      method: "POST",
      url: "/v1/meetings",
      headers: { authorization: "Bearer DEV_admin-a" },
      payload: {
        name: "Assigned List Meeting",
        address: "200 South Ave",
        lat: 33,
        lng: -112,
        radiusM: 90,
      },
    });
    const meetingId = (meetingCreate.json() as { id: string }).id;

    const userA1 = await app.inject({
      method: "POST",
      url: "/v1/attendance/check-in",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: { meetingId },
    });
    const userA1Attendance = (userA1.json() as { attendance: { id: string } }).attendance.id;
    clock.set("2026-01-04T11:10:00.000Z");
    await app.inject({
      method: "POST",
      url: "/v1/attendance/check-out",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: { attendanceId: userA1Attendance },
    });

    clock.set("2026-01-04T12:00:00.000Z");
    const userA2 = await app.inject({
      method: "POST",
      url: "/v1/attendance/check-in",
      headers: { authorization: "Bearer DEV_enduser-a2" },
      payload: { meetingId },
    });
    const userA2Attendance = (userA2.json() as { attendance: { id: string } }).attendance.id;
    clock.set("2026-01-04T13:10:00.000Z");
    await app.inject({
      method: "POST",
      url: "/v1/attendance/check-out",
      headers: { authorization: "Bearer DEV_enduser-a2" },
      payload: { attendanceId: userA2Attendance },
    });

    const supervisorList = await app.inject({
      method: "GET",
      url: "/v1/supervisor/attendance",
      headers: { authorization: "Bearer DEV_supervisor-a" },
    });
    expect(supervisorList.statusCode).toBe(200);
    const listPayload = supervisorList.json() as { attendance: Array<{ userId: string }> };
    expect(listPayload.attendance.length).toBe(1);
    expect(listPayload.attendance[0].userId).toBe("enduser-a1");

    const supervisorDenied = await app.inject({
      method: "GET",
      url: "/v1/supervisor/attendance?userId=enduser-a2",
      headers: { authorization: "Bearer DEV_supervisor-a" },
    });
    expect(supervisorDenied.statusCode).toBe(403);

    const adminList = await app.inject({
      method: "GET",
      url: "/v1/supervisor/attendance",
      headers: { authorization: "Bearer DEV_admin-a" },
    });
    expect((adminList.json() as { attendance: unknown[] }).attendance.length).toBe(2);

    await app.close();
    await db.end?.();
  });
});
