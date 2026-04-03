import { describe, expect, it } from "vitest";
import { createProofReviewRecord, reviewProofRecord } from "../lib/soberHouse/mutations";
import {
  buildProofReviewRecordDraftFromQueueItem,
  buildSoberHouseProofReviewSummary,
  filterProofReviewQueue,
} from "../lib/soberHouse/proofReview";
import { buildOperatorReportingStore } from "./operatorReporting.test";

const NOW_ISO = "2026-04-01T20:00:00.000Z";
const ACTOR = { id: "operator-proof", name: "Operator Proof" };

describe("sober-house proof review", () => {
  it("builds a queue and resident rollups from tracked proof sources", () => {
    const { store } = buildOperatorReportingStore();
    const summary = buildSoberHouseProofReviewSummary({
      store,
      nowIso: NOW_ISO,
    });

    expect(summary.queue.length).toBeGreaterThan(0);
    expect(summary.organizationSummary.missingCount).toBeGreaterThan(0);
    expect(summary.organizationSummary.pendingCount).toBeGreaterThan(0);
    expect(
      Array.from(summary.residentSummaries.values()).some(
        (resident) => resident.missingCount > 0 || resident.pendingCount > 0,
      ),
    ).toBe(true);
  });

  it("filters the proof queue by status and high-risk state", () => {
    const { store } = buildOperatorReportingStore();
    const summary = buildSoberHouseProofReviewSummary({
      store,
      nowIso: NOW_ISO,
    });

    const filtered = filterProofReviewQueue(summary.queue, {
      houseId: null,
      residentId: null,
      category: "all",
      status: "missing",
      proofRequiredOnly: true,
      pendingOnly: false,
      rejectedOnly: false,
      missingOnly: true,
      highRiskOnly: false,
    });

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((item) => item.reviewStatus === "missing")).toBe(true);
  });

  it("changes unresolved proof pressure when a proof item is approved or rejected", () => {
    let { store } = buildOperatorReportingStore();
    const before = buildSoberHouseProofReviewSummary({
      store,
      nowIso: NOW_ISO,
    });
    const queueItem = before.queue.find(
      (item) =>
        item.reviewStatus === "pending" && item.proofProvided && item.proofReviewRecordId === null,
    );

    expect(queueItem).toBeDefined();

    store = createProofReviewRecord(
      store,
      ACTOR,
      {
        ...buildProofReviewRecordDraftFromQueueItem(queueItem!),
        organizationId: store.organization?.id ?? null,
      },
      NOW_ISO,
    ).store;
    const createdId = store.proofReviewRecords[0]!.id;

    store = reviewProofRecord(
      store,
      ACTOR,
      createdId,
      "REJECTED",
      "2026-04-01T20:05:00.000Z",
      "Image does not clearly show the completed task.",
    ).store;

    const rejected = buildSoberHouseProofReviewSummary({
      store,
      nowIso: NOW_ISO,
    });

    expect(
      rejected.queue.find((item) => item.proofReviewRecordId === createdId)?.reviewStatus,
    ).toBe("rejected");
    expect(rejected.organizationSummary.rejectedCount).toBeGreaterThan(0);

    store = reviewProofRecord(
      store,
      ACTOR,
      createdId,
      "APPROVED",
      "2026-04-01T20:10:00.000Z",
      "Approved after follow-up review.",
    ).store;

    const approved = buildSoberHouseProofReviewSummary({
      store,
      nowIso: NOW_ISO,
    });

    expect(
      approved.queue.find((item) => item.proofReviewRecordId === createdId)?.reviewStatus,
    ).toBe("approved");
    expect(approved.organizationSummary.approvedCount).toBeGreaterThan(0);
  });
});
