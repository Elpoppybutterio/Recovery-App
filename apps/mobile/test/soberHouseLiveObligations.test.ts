import { describe, expect, it } from "vitest";
import {
  acknowledgeResidentSoberHouseAlert,
  buildResidentSoberHouseObligationsSnapshot,
  completeResidentSoberHouseChore,
  loadResidentSoberHouseObligationsWithCache,
  persistCachedResidentSoberHouseObligations,
  submitResidentSoberHouseProof,
  type ResidentSoberHouseObligationsPayload,
  type StorageLike,
} from "../lib/soberHouse/liveObligations";

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const state = new Map(Object.entries(initial));
  return {
    async getItem(key: string) {
      return state.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      state.set(key, value);
    },
  };
}

function buildPayload(): ResidentSoberHouseObligationsPayload {
  return {
    fetchedAt: "2026-04-03T15:30:00.000Z",
    obligations: [
      {
        obligationId: "obl-active-due-today",
        organizationId: "org-1",
        houseId: "house-1",
        residentUserId: "resident-1",
        obligationType: "CHORE",
        scheduledAt: "2026-04-03T22:00:00.000Z",
        dueAt: "2026-04-03T22:00:00.000Z",
        proofRequired: true,
        obligationStatus: "ACTIVE",
        completionRecordId: null,
        completionStatus: null,
        completedAt: null,
        proofReviewId: null,
        proofReviewOutcome: null,
        reviewedAt: null,
        createdAt: "2026-04-03T09:00:00.000Z",
        updatedAt: "2026-04-03T09:00:00.000Z",
      },
      {
        obligationId: "obl-overdue",
        organizationId: "org-1",
        houseId: "house-1",
        residentUserId: "resident-1",
        obligationType: "HOUSE_MEETING",
        scheduledAt: "2026-04-03T13:00:00.000Z",
        dueAt: "2026-04-03T13:00:00.000Z",
        proofRequired: false,
        obligationStatus: "ACTIVE",
        completionRecordId: null,
        completionStatus: null,
        completedAt: null,
        proofReviewId: null,
        proofReviewOutcome: null,
        reviewedAt: null,
        createdAt: "2026-04-03T09:00:00.000Z",
        updatedAt: "2026-04-03T09:00:00.000Z",
      },
      {
        obligationId: "obl-review-pending",
        organizationId: "org-1",
        houseId: "house-1",
        residentUserId: "resident-1",
        obligationType: "ONE_ON_ONE",
        scheduledAt: "2026-04-03T17:00:00.000Z",
        dueAt: "2026-04-03T17:00:00.000Z",
        proofRequired: true,
        obligationStatus: "ACTIVE",
        completionRecordId: "completion-1",
        completionStatus: "COMPLETED",
        completedAt: "2026-04-03T15:00:00.000Z",
        proofReviewId: "review-1",
        proofReviewOutcome: "PENDING",
        reviewedAt: null,
        createdAt: "2026-04-03T09:00:00.000Z",
        updatedAt: "2026-04-03T15:00:00.000Z",
      },
      {
        obligationId: "obl-active-future",
        organizationId: "org-1",
        houseId: "house-1",
        residentUserId: "resident-1",
        obligationType: "CHORE",
        scheduledAt: "2026-04-04T16:00:00.000Z",
        dueAt: "2026-04-04T16:00:00.000Z",
        proofRequired: false,
        obligationStatus: "ACTIVE",
        completionRecordId: null,
        completionStatus: null,
        completedAt: null,
        proofReviewId: null,
        proofReviewOutcome: null,
        reviewedAt: null,
        createdAt: "2026-04-03T09:00:00.000Z",
        updatedAt: "2026-04-03T09:00:00.000Z",
      },
    ],
    obligationStatuses: [
      {
        obligationId: "obl-active-due-today",
        obligationType: "CHORE",
        obligationStatus: "ACTIVE",
        scheduledAt: "2026-04-03T22:00:00.000Z",
        dueAt: "2026-04-03T22:00:00.000Z",
        completionStatus: null,
        proofRequired: true,
        proofSubmitted: false,
        proofReviewOutcome: null,
        reviewedAt: null,
      },
      {
        obligationId: "obl-overdue",
        obligationType: "HOUSE_MEETING",
        obligationStatus: "ACTIVE",
        scheduledAt: "2026-04-03T13:00:00.000Z",
        dueAt: "2026-04-03T13:00:00.000Z",
        completionStatus: null,
        proofRequired: false,
        proofSubmitted: false,
        proofReviewOutcome: null,
        reviewedAt: null,
      },
      {
        obligationId: "obl-review-pending",
        obligationType: "ONE_ON_ONE",
        obligationStatus: "ACTIVE",
        scheduledAt: "2026-04-03T17:00:00.000Z",
        dueAt: "2026-04-03T17:00:00.000Z",
        completionStatus: "COMPLETED",
        proofRequired: true,
        proofSubmitted: true,
        proofReviewOutcome: "PENDING",
        reviewedAt: null,
      },
      {
        obligationId: "obl-active-future",
        obligationType: "CHORE",
        obligationStatus: "ACTIVE",
        scheduledAt: "2026-04-04T16:00:00.000Z",
        dueAt: "2026-04-04T16:00:00.000Z",
        completionStatus: null,
        proofRequired: false,
        proofSubmitted: false,
        proofReviewOutcome: null,
        reviewedAt: null,
      },
    ],
    pendingProofReviews: [
      {
        reviewId: "review-1",
        completionRecordId: "completion-1",
        obligationId: "obl-review-pending",
        obligationType: "ONE_ON_ONE",
        reviewOutcome: "PENDING",
        submittedAt: "2026-04-03T15:00:00.000Z",
        createdAt: "2026-04-03T15:01:00.000Z",
      },
    ],
    alertAcknowledgements: [
      {
        acknowledgementId: "ack-1",
        organizationId: "org-1",
        houseId: "house-1",
        residentUserId: "resident-1",
        alertId: "alert-1",
        status: "ACKNOWLEDGED",
        acknowledgedAt: "2026-04-03T15:20:00.000Z",
        note: "",
        createdAt: "2026-04-03T15:20:00.000Z",
        updatedAt: "2026-04-03T15:20:00.000Z",
      },
    ],
  };
}

describe("resident sober-house live obligations", () => {
  it("maps backend dto records into resident summary buckets", () => {
    const snapshot = buildResidentSoberHouseObligationsSnapshot(
      buildPayload(),
      "live",
      new Date("2026-04-03T15:30:00.000Z"),
    );

    expect(snapshot.summary).toEqual({
      active: 3,
      dueToday: 2,
      overdue: 1,
      reviewPending: 1,
      completedToday: 1,
    });
    expect(snapshot.sections.find((section) => section.id === "overdue")?.items[0]?.id).toBe(
      "obl-overdue",
    );
    expect(
      snapshot.sections.find((section) => section.id === "review_pending")?.items[0]
        ?.primaryStatusLabel,
    ).toBe("Review pending");
    expect(snapshot.alertAcknowledgements[0]?.alertId).toBe("alert-1");
  });

  it("falls back to the cached live snapshot when the network is offline", async () => {
    const storage = createMemoryStorage();
    const payload = buildPayload();
    await persistCachedResidentSoberHouseObligations(storage, "Bearer DEV_resident-1", payload);

    const result = await loadResidentSoberHouseObligationsWithCache({
      storage,
      identityKey: "Bearer DEV_resident-1",
      apiUrl: "https://sober-ai-api.onrender.com",
      authHeader: "Bearer DEV_resident-1",
      fetchImpl: async () => {
        throw new Error("Failed to fetch");
      },
      now: new Date("2026-04-03T15:30:00.000Z"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.snapshot.source).toBe("offline_cache");
    expect(result.notice).toContain("Offline");
    expect(result.snapshot.summary.overdue).toBe(1);
  });

  it("posts chore completions to the live resident endpoint", async () => {
    const requests: Array<{ url: string; method: string; body: string }> = [];

    await completeResidentSoberHouseChore({
      apiUrl: "https://sober-ai-api.onrender.com",
      authHeader: "Bearer DEV_resident-1",
      obligationId: "obl-1",
      payload: { completedAt: "2026-04-03T15:30:00.000Z" },
      fetchImpl: async (input, init) => {
        requests.push({
          url: String(input),
          method: String(init?.method ?? "GET"),
          body: String(init?.body ?? ""),
        });
        return new Response(JSON.stringify({ completion: { id: "completion-1" } }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "https://sober-ai-api.onrender.com/v1/me/sober-house/obligations/obl-1/chore-completion",
    );
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.body).toContain("completedAt");
  });

  it("posts proof submissions and alert acknowledgements to resident endpoints", async () => {
    const urls: string[] = [];

    const fetchImpl = async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    };

    await submitResidentSoberHouseProof({
      apiUrl: "https://sober-ai-api.onrender.com",
      authHeader: "Bearer DEV_resident-1",
      obligationId: "obl-2",
      payload: {
        submittedAt: "2026-04-03T15:31:00.000Z",
        proofMetadata: { note: "Shift supervisor signed off." },
      },
      fetchImpl,
    });

    await acknowledgeResidentSoberHouseAlert({
      apiUrl: "https://sober-ai-api.onrender.com",
      authHeader: "Bearer DEV_resident-1",
      alertId: "alert-2",
      payload: { acknowledgedAt: "2026-04-03T15:32:00.000Z" },
      fetchImpl,
    });

    expect(urls).toEqual([
      "https://sober-ai-api.onrender.com/v1/me/sober-house/obligations/obl-2/proof",
      "https://sober-ai-api.onrender.com/v1/me/sober-house/alerts/alert-2/acknowledgements",
    ]);
  });
});
