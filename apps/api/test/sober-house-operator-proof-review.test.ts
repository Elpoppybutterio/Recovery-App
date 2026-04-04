import { Role } from "@recovery/shared-types";
import { beforeEach, describe, expect, it } from "vitest";
import type { InMemoryDb } from "./in-memory-db";
import { createTestApp, createTestDb, seedCoreFixtures } from "./test-helpers";

describe("sober-house operator proof review actions", () => {
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

    db.addUser({
      id: "manager-b",
      tenant_id: "tenant-a",
      email: "manager-b@example.com",
      display_name: "Manager B",
    });
    db.addUserRole({ tenant_id: "tenant-a", user_id: "manager-b", role: Role.END_USER });
    db.addUserRole({
      tenant_id: "tenant-a",
      user_id: "manager-b",
      role: "house_manager",
      organization_id: "org-birch",
      granted_by_user_id: "admin-a",
    });
  });

  it("lets an in-scope operator approve a pending sober-house proof review and updates resident status", async () => {
    const app = createTestApp(db);

    const submission = await app.inject({
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

    expect(submission.statusCode).toBe(201);
    const reviewId = (
      submission.json() as {
        proofReview: { id?: string; reviewId?: string } | null;
      }
    ).proofReview?.id;

    const pendingStatus = await app.inject({
      method: "GET",
      url: "/v1/me/sober-house/obligations/status",
      headers: { authorization: "Bearer DEV_enduser-a1" },
    });
    expect(pendingStatus.statusCode).toBe(200);
    expect(pendingStatus.json()).toMatchObject({
      pendingProofReviews: [
        expect.objectContaining({
          obligationId: "ob-meeting-a1",
          reviewOutcome: "PENDING",
        }),
      ],
      obligationStatuses: expect.arrayContaining([
        expect.objectContaining({
          obligationId: "ob-meeting-a1",
          proofReviewOutcome: "PENDING",
        }),
      ]),
    });

    const reviewResponse = await app.inject({
      method: "PATCH",
      url: `/v1/operator/sober-house/proof-reviews/${reviewId}`,
      headers: { authorization: "Bearer DEV_manager-a" },
      payload: {
        reviewOutcome: "APPROVED",
      },
    });

    expect(reviewResponse.statusCode).toBe(200);
    expect(reviewResponse.json()).toMatchObject({
      proofReview: expect.objectContaining({
        reviewId,
        obligationId: "ob-meeting-a1",
        reviewOutcome: "APPROVED",
        reviewerUserId: "manager-a",
      }),
    });

    const residentStatus = await app.inject({
      method: "GET",
      url: "/v1/me/sober-house/obligations/status",
      headers: { authorization: "Bearer DEV_enduser-a1" },
    });
    expect(residentStatus.statusCode).toBe(200);
    expect(residentStatus.json()).toMatchObject({
      pendingProofReviews: [],
      obligationStatuses: expect.arrayContaining([
        expect.objectContaining({
          obligationId: "ob-meeting-a1",
          proofReviewOutcome: "APPROVED",
        }),
      ]),
    });

    expect(db.getLatestAuditForActor("manager-a")).toMatchObject({
      action: "sober_house.proof_review.reviewed",
      subject_type: "sober_house_proof_review",
      subject_id: reviewId,
      metadata_json: expect.objectContaining({
        reviewOutcome: "APPROVED",
        obligationId: "ob-meeting-a1",
      }),
    });

    await app.close();
    await db.end?.();
  });

  it("supports a rejection note and blocks operators outside the sober-house org scope", async () => {
    const app = createTestApp(db);

    const submission = await app.inject({
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

    const reviewId = (
      submission.json() as {
        proofReview: { id?: string } | null;
      }
    ).proofReview?.id;

    const forbidden = await app.inject({
      method: "PATCH",
      url: `/v1/operator/sober-house/proof-reviews/${reviewId}`,
      headers: { authorization: "Bearer DEV_manager-b" },
      payload: {
        reviewOutcome: "REJECTED",
        note: "Not enough detail.",
      },
    });
    expect(forbidden.statusCode).toBe(403);

    const allowed = await app.inject({
      method: "PATCH",
      url: `/v1/operator/sober-house/proof-reviews/${reviewId}`,
      headers: { authorization: "Bearer DEV_demo" },
      payload: {
        reviewOutcome: "REJECTED",
        note: "Photo did not show the completed task.",
      },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toMatchObject({
      proofReview: expect.objectContaining({
        reviewId,
        reviewOutcome: "REJECTED",
        reviewerUserId: "demo",
      }),
    });

    const residentStatus = await app.inject({
      method: "GET",
      url: "/v1/me/sober-house/obligations/status",
      headers: { authorization: "Bearer DEV_enduser-a1" },
    });
    expect(residentStatus.json()).toMatchObject({
      obligationStatuses: expect.arrayContaining([
        expect.objectContaining({
          obligationId: "ob-meeting-a1",
          proofReviewOutcome: "REJECTED",
        }),
      ]),
    });

    expect(db.getLatestAuditForActor("demo")).toMatchObject({
      action: "sober_house.proof_review.reviewed",
      metadata_json: expect.objectContaining({
        reviewOutcome: "REJECTED",
        note: "Photo did not show the completed task.",
      }),
    });

    await app.close();
    await db.end?.();
  });
});
