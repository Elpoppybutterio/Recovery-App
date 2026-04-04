import { describe, expect, it } from "vitest";
import { createRepositories } from "../src/db/repositories";
import { createTestDb, seedCoreFixtures } from "./test-helpers";

describe("sober-house live repositories", () => {
  it("syncs resident house memberships from participant profiles", async () => {
    const db = await createTestDb();
    await seedCoreFixtures(db);
    const repositories = createRepositories(db);

    await repositories.upsertParticipantProfile("tenant-a", "enduser-a1", {
      participantType: "resident_user",
      organizationId: "org-alpine",
      houseId: "house-alpine-1",
      courtProgramId: null,
      status: "ACTIVE",
    });

    await repositories.upsertParticipantProfile("tenant-a", "enduser-a1", {
      participantType: "resident_user",
      organizationId: "org-alpine",
      houseId: "house-alpine-1",
      courtProgramId: null,
      status: "INACTIVE",
    });

    await expect(
      repositories.listResidentHouseMemberships("tenant-a", {
        residentUserId: "enduser-a1",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        organization_id: "org-alpine",
        house_id: "house-alpine-1",
        resident_user_id: "enduser-a1",
        status: "INACTIVE",
      }),
    ]);

    await db.end?.();
  });

  it("records resident completion proof and exposes pending staff reviews", async () => {
    const db = await createTestDb();
    await seedCoreFixtures(db);
    const repositories = createRepositories(db);

    db.addResidentHouseMembership({
      id: "membership-1",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "enduser-a1",
      status: "ACTIVE",
    });
    db.addSoberHouseObligation({
      id: "sho-1",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "enduser-a1",
      resident_house_membership_id: "membership-1",
      obligation_type: "CHORE",
      scheduled_at: "2026-04-03T10:00:00.000Z",
      due_at: "2026-04-03T18:00:00.000Z",
      proof_required: true,
      status: "ACTIVE",
    });

    await expect(
      repositories.listResidentHouseObligations("tenant-a", {
        residentUserId: "enduser-a1",
        houseId: "house-alpine-1",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        obligation: expect.objectContaining({
          id: "sho-1",
          obligation_type: "CHORE",
          proof_required: true,
        }),
        completion: null,
        proofReview: null,
      }),
    ]);

    const completionResult = await repositories.recordSoberHouseCompletion(
      "tenant-a",
      "enduser-a1",
      {
        obligationId: "sho-1",
        completionStatus: "COMPLETED",
        completedAt: new Date("2026-04-03T17:45:00.000Z"),
        submittedAt: new Date("2026-04-03T17:46:00.000Z"),
        proofMetadata: {
          proofType: "photo",
          proofUri: "s3://proofs/tenant-a/enduser-a1/chore-1.jpg",
        },
      },
    );

    expect(completionResult).toMatchObject({
      completion: expect.objectContaining({
        obligation_id: "sho-1",
        completion_status: "COMPLETED",
      }),
      proofReview: expect.objectContaining({
        review_outcome: "PENDING",
      }),
    });

    const pendingReviews = await repositories.listPendingSoberHouseProofReviews("tenant-a", {
      organizationId: "org-alpine",
      houseId: "house-alpine-1",
    });
    expect(pendingReviews).toHaveLength(1);
    expect(pendingReviews[0]).toMatchObject({
      review: expect.objectContaining({
        review_outcome: "PENDING",
      }),
      obligation: expect.objectContaining({
        id: "sho-1",
      }),
    });

    const approvedReview = await repositories.updateSoberHouseProofReviewOutcome(
      "tenant-a",
      pendingReviews[0]?.review.id ?? "",
      {
        reviewOutcome: "APPROVED",
        reviewerUserId: "manager-a",
        reviewedAt: new Date("2026-04-03T18:00:00.000Z"),
      },
    );

    expect(approvedReview).toMatchObject({
      review_outcome: "APPROVED",
      reviewer_user_id: "manager-a",
    });
    await expect(
      repositories.listPendingSoberHouseProofReviews("tenant-a", {
        organizationId: "org-alpine",
      }),
    ).resolves.toEqual([]);

    await db.end?.();
  });

  it("does not create a proof review when the obligation has no proof requirement", async () => {
    const db = await createTestDb();
    await seedCoreFixtures(db);
    const repositories = createRepositories(db);

    db.addResidentHouseMembership({
      id: "membership-2",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "enduser-a1",
      status: "ACTIVE",
    });
    db.addSoberHouseObligation({
      id: "sho-2",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "enduser-a1",
      resident_house_membership_id: "membership-2",
      obligation_type: "HOUSE_MEETING",
      scheduled_at: "2026-04-04T01:00:00.000Z",
      due_at: null,
      proof_required: false,
      status: "ACTIVE",
    });

    await expect(
      repositories.recordSoberHouseCompletion("tenant-a", "enduser-a1", {
        obligationId: "sho-2",
        completionStatus: "COMPLETED",
        completedAt: new Date("2026-04-04T02:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      completion: expect.objectContaining({
        obligation_id: "sho-2",
      }),
      proofReview: null,
    });

    await expect(
      repositories.listPendingSoberHouseProofReviews("tenant-a", {
        residentUserId: "enduser-a1",
      }),
    ).resolves.toEqual([]);

    await db.end?.();
  });
});
