import { SponsorRepeatDay, SponsorRepeatUnit } from "@recovery/shared-types";
import { beforeEach, describe, expect, it } from "vitest";
import type { InMemoryDb } from "./in-memory-db";
import { createTestApp, createTestDb, seedCoreFixtures } from "./test-helpers";

describe("MVP Slice D: sponsor config + reminders", () => {
  let db: InMemoryDb;

  beforeEach(async () => {
    db = await createTestDb();
    await seedCoreFixtures(db);
  });

  it("allows END_USER to PUT then GET /v1/me/sponsor with weekly Tuesday-only recurrence", async () => {
    const app = createTestApp(db);

    const putResponse = await app.inject({
      method: "PUT",
      url: "/v1/me/sponsor",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: {
        sponsorName: "Case Sponsor",
        sponsorPhoneE164: "+15555550123",
        callTimeLocalHhmm: "17:00",
        repeatUnit: SponsorRepeatUnit.WEEKLY,
        repeatInterval: 1,
        repeatDays: [SponsorRepeatDay.TUE],
        active: true,
      },
    });

    expect(putResponse.statusCode).toBe(200);
    const putPayload = putResponse.json() as {
      sponsorConfig: {
        userId: string;
        sponsorName: string;
        sponsorPhoneE164: string;
        callTimeLocalHhmm: string;
        repeatRule: string;
        repeatUnit: string;
        repeatInterval: number;
        repeatDays: string[];
        active: boolean;
      };
    };
    expect(putPayload.sponsorConfig).toMatchObject({
      userId: "enduser-a1",
      sponsorName: "Case Sponsor",
      sponsorPhoneE164: "+15555550123",
      callTimeLocalHhmm: "17:00",
      repeatRule: "WEEKLY",
      repeatUnit: SponsorRepeatUnit.WEEKLY,
      repeatInterval: 1,
      repeatDays: [SponsorRepeatDay.TUE],
      active: true,
    });

    const postUpdateAudit = db.getLatestAuditForActor("enduser-a1");
    expect(postUpdateAudit).toMatchObject({
      action: "sponsor_config.updated",
      subject_type: "sponsor_config",
      subject_id: "enduser-a1",
    });

    const getResponse = await app.inject({
      method: "GET",
      url: "/v1/me/sponsor",
      headers: { authorization: "Bearer DEV_enduser-a1" },
    });

    expect(getResponse.statusCode).toBe(200);
    const getPayload = getResponse.json() as {
      sponsorConfig: typeof putPayload.sponsorConfig | null;
    };
    expect(getPayload.sponsorConfig).toMatchObject({
      userId: "enduser-a1",
      sponsorName: "Case Sponsor",
      sponsorPhoneE164: "+15555550123",
      callTimeLocalHhmm: "17:00",
      repeatRule: "WEEKLY",
      repeatUnit: SponsorRepeatUnit.WEEKLY,
      repeatInterval: 1,
      repeatDays: [SponsorRepeatDay.TUE],
      active: true,
    });

    const postViewAudit = db.getLatestAuditForActor("enduser-a1");
    expect(postViewAudit).toMatchObject({
      action: "sponsor_config.viewed",
      subject_type: "sponsor_config",
      subject_id: "enduser-a1",
    });

    await app.close();
    await db.end?.();
  });

  it("supports bi-weekly Tuesday-only recurrence", async () => {
    const app = createTestApp(db);

    const putResponse = await app.inject({
      method: "PUT",
      url: "/v1/me/sponsor",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: {
        sponsorName: "Case Sponsor",
        sponsorPhoneE164: "+15555550123",
        callTimeLocalHhmm: "17:00",
        repeatUnit: SponsorRepeatUnit.WEEKLY,
        repeatInterval: 2,
        repeatDays: [SponsorRepeatDay.TUE],
        active: true,
      },
    });

    expect(putResponse.statusCode).toBe(200);
    const putPayload = putResponse.json() as {
      sponsorConfig: {
        repeatRule: string;
        repeatUnit: string;
        repeatInterval: number;
        repeatDays: string[];
      };
    };
    expect(putPayload.sponsorConfig).toMatchObject({
      repeatRule: "BIWEEKLY",
      repeatUnit: SponsorRepeatUnit.WEEKLY,
      repeatInterval: 2,
      repeatDays: [SponsorRepeatDay.TUE],
    });

    const getResponse = await app.inject({
      method: "GET",
      url: "/v1/me/sponsor",
      headers: { authorization: "Bearer DEV_enduser-a1" },
    });

    expect(getResponse.statusCode).toBe(200);
    const getPayload = getResponse.json() as { sponsorConfig: typeof putPayload.sponsorConfig };
    expect(getPayload.sponsorConfig).toMatchObject({
      repeatRule: "BIWEEKLY",
      repeatUnit: SponsorRepeatUnit.WEEKLY,
      repeatInterval: 2,
      repeatDays: [SponsorRepeatDay.TUE],
    });

    await app.close();
    await db.end?.();
  });

  it("keeps sponsor config tenant-scoped per user", async () => {
    const app = createTestApp(db);

    const putResponse = await app.inject({
      method: "PUT",
      url: "/v1/me/sponsor",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: {
        sponsorName: "Tenant A Sponsor",
        sponsorPhoneE164: "+15555550199",
        callTimeLocalHhmm: "09:30",
        repeatUnit: SponsorRepeatUnit.MONTHLY,
        repeatInterval: 1,
        repeatDays: [],
        active: true,
      },
    });
    expect(putResponse.statusCode).toBe(200);

    const sameTenantOtherUser = await app.inject({
      method: "GET",
      url: "/v1/me/sponsor",
      headers: { authorization: "Bearer DEV_enduser-a2" },
    });
    expect(sameTenantOtherUser.statusCode).toBe(200);
    expect((sameTenantOtherUser.json() as { sponsorConfig: unknown }).sponsorConfig).toBeNull();

    const otherTenantUser = await app.inject({
      method: "GET",
      url: "/v1/me/sponsor",
      headers: { authorization: "Bearer DEV_enduser-b1" },
    });
    expect(otherTenantUser.statusCode).toBe(200);
    expect((otherTenantUser.json() as { sponsorConfig: unknown }).sponsorConfig).toBeNull();

    await app.close();
    await db.end?.();
  });

  it("denies SUPERVISOR access to /v1/me/sponsor", async () => {
    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/me/sponsor",
      headers: { authorization: "Bearer DEV_supervisor-a" },
    });

    expect(response.statusCode).toBe(403);

    await app.close();
    await db.end?.();
  });
});
