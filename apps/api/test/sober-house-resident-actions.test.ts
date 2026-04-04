import { Role } from "@recovery/shared-types";
import { beforeEach, describe, expect, it } from "vitest";
import type { InMemoryDb } from "./in-memory-db";
import { createTestApp, createTestDb, seedCoreFixtures } from "./test-helpers";

describe("sober-house resident action endpoints", () => {
  let db: InMemoryDb;

  beforeEach(async () => {
    db = await createTestDb();
    await seedCoreFixtures(db);

    db.addParticipantProfile({
      user_id: "enduser-a1",
      tenant_id: "tenant-a",
      participant_type: "resident_user",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      court_program_id: null,
      status: "ACTIVE",
    });
    db.addResidentHouseMembership({
      id: "membership-a1",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "enduser-a1",
      status: "ACTIVE",
    });
    db.addSoberHouseObligation({
      id: "ob-chore-a1",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "enduser-a1",
      resident_house_membership_id: "membership-a1",
      obligation_type: "CHORE",
      scheduled_at: "2026-04-03T14:00:00.000Z",
      due_at: "2026-04-03T18:00:00.000Z",
      proof_required: true,
      status: "ACTIVE",
    });
    db.addSoberHouseObligation({
      id: "ob-ooo-a1",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "enduser-a1",
      resident_house_membership_id: "membership-a1",
      obligation_type: "ONE_ON_ONE",
      scheduled_at: "2026-04-04T16:00:00.000Z",
      due_at: "2026-04-04T17:00:00.000Z",
      proof_required: false,
      status: "ACTIVE",
    });
    db.addSoberHouseObligation({
      id: "ob-meeting-a1",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "enduser-a1",
      resident_house_membership_id: "membership-a1",
      obligation_type: "HOUSE_MEETING",
      scheduled_at: "2026-04-05T01:00:00.000Z",
      due_at: "2026-04-05T02:30:00.000Z",
      proof_required: true,
      status: "ACTIVE",
    });

    db.addParticipantProfile({
      user_id: "enduser-a2",
      tenant_id: "tenant-a",
      participant_type: "court_participant",
      organization_id: null,
      house_id: null,
      court_program_id: "court-boulder",
      status: "ACTIVE",
    });

    db.addTenantConfig({
      tenant_id: "tenant-a",
      config_key: "sober_house.control_plane.org-alpine",
      value_json: {
        store: {
          houseAlertAnnouncements: [
            {
              id: "alert-house-curfew",
              organizationId: "org-alpine",
              houseId: "house-alpine-1",
              acknowledgmentRequired: true,
              status: "ACTIVE",
            },
          ],
        },
      },
      updated_by_user_id: "admin-a",
    });
  });

  it("lists current resident obligations for the authenticated resident only", async () => {
    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/me/sober-house/obligations?status=ACTIVE",
      headers: { authorization: "Bearer DEV_enduser-a1" },
    });

    expect(response.statusCode).toBe(200);
    expect(
      (
        response.json() as {
          obligations: Array<{
            obligationId: string;
            obligationType: string;
            residentUserId: string;
          }>;
        }
      ).obligations,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          obligationId: "ob-chore-a1",
          obligationType: "CHORE",
          residentUserId: "enduser-a1",
        }),
      ]),
    );

    const forbidden = await app.inject({
      method: "GET",
      url: "/v1/me/sober-house/obligations",
      headers: { authorization: "Bearer DEV_manager-a" },
    });
    expect(forbidden.statusCode).toBe(403);

    await app.close();
    await db.end?.();
  });

  it("completes a chore for the resident and creates a pending proof review", async () => {
    const app = createTestApp(db);

    const response = await app.inject({
      method: "POST",
      url: "/v1/me/sober-house/obligations/ob-chore-a1/chore-completion",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: {
        completedAt: "2026-04-03T17:40:00.000Z",
        submittedAt: "2026-04-03T17:45:00.000Z",
        proofMetadata: {
          proofType: "photo",
          proofUri: "s3://proofs/tenant-a/enduser-a1/chore-photo.jpg",
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      completion: expect.objectContaining({
        obligation_id: "ob-chore-a1",
        completion_status: "COMPLETED",
      }),
      proofReview: expect.objectContaining({
        review_outcome: "PENDING",
      }),
    });

    await app.close();
    await db.end?.();
  });

  it("completes a one-on-one for the resident and rejects non-resident users", async () => {
    const app = createTestApp(db);

    const response = await app.inject({
      method: "POST",
      url: "/v1/me/sober-house/obligations/ob-ooo-a1/one-on-one-completion",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: {
        completedAt: "2026-04-04T16:55:00.000Z",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      completion: expect.objectContaining({
        obligation_id: "ob-ooo-a1",
        completion_status: "COMPLETED",
      }),
      proofReview: null,
    });

    const forbidden = await app.inject({
      method: "POST",
      url: "/v1/me/sober-house/obligations/ob-ooo-a1/one-on-one-completion",
      headers: { authorization: "Bearer DEV_enduser-a2" },
      payload: {
        completedAt: "2026-04-04T16:55:00.000Z",
      },
    });
    expect(forbidden.statusCode).toBe(403);

    await app.close();
    await db.end?.();
  });

  it("submits meeting proof and creates a normalized review-pending record", async () => {
    const app = createTestApp(db);

    const response = await app.inject({
      method: "POST",
      url: "/v1/me/sober-house/obligations/ob-meeting-a1/proof",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: {
        completedAt: "2026-04-05T02:20:00.000Z",
        submittedAt: "2026-04-05T02:25:00.000Z",
        proofMetadata: {
          proofType: "photo",
          proofUri: "s3://proofs/tenant-a/enduser-a1/meeting-proof.jpg",
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      completion: expect.objectContaining({
        obligation_id: "ob-meeting-a1",
      }),
      proofReview: expect.objectContaining({
        review_outcome: "PENDING",
      }),
    });

    await app.close();
    await db.end?.();
  });

  it("acknowledges a house alert and exposes resident status readback", async () => {
    const app = createTestApp(db);

    const acknowledgement = await app.inject({
      method: "POST",
      url: "/v1/me/sober-house/alerts/alert-house-curfew/acknowledgements",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: {
        acknowledgedAt: "2026-04-03T19:00:00.000Z",
        note: "Read and understood.",
      },
    });
    expect(acknowledgement.statusCode).toBe(201);
    expect(acknowledgement.json()).toMatchObject({
      acknowledgement: expect.objectContaining({
        alertId: "alert-house-curfew",
        status: "ACKNOWLEDGED",
      }),
    });

    const status = await app.inject({
      method: "GET",
      url: "/v1/me/sober-house/obligations/status",
      headers: { authorization: "Bearer DEV_enduser-a1" },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      obligationStatuses: expect.arrayContaining([
        expect.objectContaining({
          obligationId: "ob-chore-a1",
        }),
      ]),
      alertAcknowledgements: expect.arrayContaining([
        expect.objectContaining({
          alertId: "alert-house-curfew",
          status: "ACKNOWLEDGED",
        }),
      ]),
    });

    await app.close();
    await db.end?.();
  });

  it("keeps resident action writes scoped to the authenticated user", async () => {
    const app = createTestApp(db);

    db.addUser({
      id: "resident-other",
      tenant_id: "tenant-a",
      email: "resident-other@example.com",
      display_name: "Resident Other",
    });
    db.addUserRole({ tenant_id: "tenant-a", user_id: "resident-other", role: Role.END_USER });
    db.addParticipantProfile({
      user_id: "resident-other",
      tenant_id: "tenant-a",
      participant_type: "resident_user",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      court_program_id: null,
      status: "ACTIVE",
    });
    db.addResidentHouseMembership({
      id: "membership-other",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "resident-other",
      status: "ACTIVE",
    });
    db.addSoberHouseObligation({
      id: "ob-other",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "resident-other",
      resident_house_membership_id: "membership-other",
      obligation_type: "CHORE",
      scheduled_at: "2026-04-06T10:00:00.000Z",
      due_at: "2026-04-06T18:00:00.000Z",
      proof_required: false,
      status: "ACTIVE",
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/me/sober-house/obligations/ob-other/chore-completion",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: {
        completedAt: "2026-04-06T17:00:00.000Z",
      },
    });

    expect(response.statusCode).toBe(404);

    await app.close();
    await db.end?.();
  });
});
