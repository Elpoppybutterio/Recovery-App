import { describe, expect, it } from "vitest";
import {
  buildResidentRuleEnforcementLinks,
  buildSoberHouseEnforcementSummary,
  filterEnforcementQueue,
} from "../lib/soberHouse/enforcement";
import {
  createEnforcementRecord,
  createProofReviewRecord,
  reviewProofRecord,
} from "../lib/soberHouse/mutations";
import {
  buildProofReviewRecordDraftFromQueueItem,
  buildSoberHouseProofReviewSummary,
} from "../lib/soberHouse/proofReview";
import { createOperatorWebSessionStore } from "../../dashboard/app/lib/soberHouseControlPlane";

const ACTOR = { id: "operator-a", name: "Operator A" };

describe("sober-house enforcement", () => {
  it("derives actionable enforcement queue items from reporting truth", () => {
    const { store } = createOperatorWebSessionStore();
    const summary = buildSoberHouseEnforcementSummary({
      store,
      nowIso: "2026-04-01T12:00:00.000Z",
    });

    expect(summary.queue.length).toBeGreaterThan(0);
    expect(summary.queue.some((item) => item.category === "CURFEW")).toBe(true);
    expect(summary.organizationSummary.openCount).toBeGreaterThan(0);
  });

  it("filters the queue and preserves resident intervention timelines", () => {
    const base = createOperatorWebSessionStore();
    let store = base.store;
    store = createEnforcementRecord(
      store,
      ACTOR,
      {
        organizationId: store.organization?.id ?? null,
        houseId: store.houses[0]?.id ?? null,
        residentId: "resident-avery",
        linkedUserId: "avery-brooks",
        category: "MEETINGS",
        sourceRuleType: "meetings",
        sourceSignal: "Meeting pace behind.",
        level: "WARNING",
        status: "OPEN",
        reasonSummary: "Resident is behind the weekly meeting goal.",
        recommendedAction: "Review the meeting recovery plan.",
        assignedStaffAssignmentId: null,
        linkedViolationId: null,
        linkedCorrectiveActionId: null,
        dueAt: null,
      },
      "2026-04-01T12:05:00.000Z",
    ).store;

    const summary = buildSoberHouseEnforcementSummary({
      store,
      nowIso: "2026-04-01T12:10:00.000Z",
    });
    const filtered = filterEnforcementQueue(summary.queue, {
      houseId: null,
      residentId: "resident-avery",
      level: "WARNING",
      status: "all",
      urgentOnly: false,
      highRiskOnly: false,
      category: "all",
    });

    expect(filtered.some((item) => item.residentId === "resident-avery")).toBe(true);
    expect(summary.residentTimelineById.get("resident-avery")?.length ?? 0).toBeGreaterThan(0);
  });

  it("shows rule-to-enforcement linkage rows with safe empty counts", () => {
    const { store } = createOperatorWebSessionStore();
    const rows = buildResidentRuleEnforcementLinks(
      store,
      "resident-avery",
      "2026-04-01T12:00:00.000Z",
    );

    expect(rows.find((row) => row.category === "Curfew")?.consequencePath).toContain("Curfew");
    expect(rows.find((row) => row.category === "Meetings required")).toBeDefined();
  });

  it("reduces proof-driven enforcement pressure once submitted proof is approved", () => {
    const base = createOperatorWebSessionStore();
    let store = base.store;
    const beforeProof = buildSoberHouseProofReviewSummary({
      store,
      nowIso: "2026-04-01T12:00:00.000Z",
    });
    const queueItem = beforeProof.queue.find(
      (item) =>
        item.proofProvided && item.reviewStatus === "pending" && item.proofReviewRecordId === null,
    );

    expect(queueItem).toBeDefined();

    store = createProofReviewRecord(
      store,
      ACTOR,
      {
        ...buildProofReviewRecordDraftFromQueueItem(queueItem!),
        organizationId: store.organization?.id ?? null,
      },
      "2026-04-01T12:01:00.000Z",
    ).store;
    const proofReviewId = store.proofReviewRecords[0]!.id;

    const withRejectedProof = reviewProofRecord(
      store,
      ACTOR,
      proofReviewId,
      "REJECTED",
      "2026-04-01T12:02:00.000Z",
      "Proof is not sufficient.",
    ).store;
    const rejectedSummary = buildSoberHouseEnforcementSummary({
      store: withRejectedProof,
      nowIso: "2026-04-01T12:03:00.000Z",
    });

    expect(
      rejectedSummary.queue.some(
        (item) => item.residentId === queueItem!.residentId && item.category === "MISSING_PROOF",
      ),
    ).toBe(true);

    const withApprovedProof = reviewProofRecord(
      withRejectedProof,
      ACTOR,
      proofReviewId,
      "APPROVED",
      "2026-04-01T12:04:00.000Z",
      "Approved after review.",
    ).store;
    const approvedSummary = buildSoberHouseEnforcementSummary({
      store: withApprovedProof,
      nowIso: "2026-04-01T12:05:00.000Z",
    });

    expect(
      approvedSummary.queue.some(
        (item) => item.residentId === queueItem!.residentId && item.category === "MISSING_PROOF",
      ),
    ).toBe(false);
  });
});
