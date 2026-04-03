import { describe, expect, it } from "vitest";
import { createDefaultSoberHouseSettingsStore } from "../lib/soberHouse/defaults";
import {
  createProofReviewRecord,
  reviewProofRecord,
  upsertOrganization,
} from "../lib/soberHouse/mutations";
import {
  buildProofReviewRecordDraftFromQueueItem,
  buildSoberHouseProofReviewSummary,
} from "../lib/soberHouse/proofReview";
import {
  buildDefaultOperatorReportFilters,
  buildOperatorReportCsv,
  buildScheduledSummaryDraft,
  buildSoberHouseOperatorReportDocument,
} from "../lib/soberHouse/reportingExports";
import { buildOperatorReportingStore } from "./operatorReporting.test";

const NOW_ISO = "2026-04-01T12:00:00.000Z";

describe("sober-house reporting exports", () => {
  it("builds resident compliance export rows and csv output", () => {
    const { store } = buildOperatorReportingStore();
    const filters = {
      ...buildDefaultOperatorReportFilters(store, NOW_ISO),
      houseId: null,
      residentId: null,
    };

    const document = buildSoberHouseOperatorReportDocument({
      store,
      nowIso: NOW_ISO,
      filters,
      reportType: "RESIDENT_COMPLIANCE_SUMMARY",
    });

    expect(document.title).toBe("Resident Compliance Summary");
    expect(document.csvColumns).toContain("Resident");
    expect(document.csvRows.length).toBeGreaterThan(0);
    expect(buildOperatorReportCsv(document)).toContain("Resident,House,Band,Score");
  });

  it("applies date-range filters to violations exports", () => {
    const { store } = buildOperatorReportingStore();
    const filters = {
      ...buildDefaultOperatorReportFilters(store, NOW_ISO),
      houseId: null,
      residentId: null,
      startDate: "2026-04-01",
      endDate: "2026-04-01",
    };

    const document = buildSoberHouseOperatorReportDocument({
      store,
      nowIso: NOW_ISO,
      filters,
      reportType: "VIOLATIONS_INCIDENTS_EXPORT",
    });

    expect(document.csvRows.length).toBeGreaterThan(0);
    expect(document.csvRows.every((row) => row[5]?.includes("4/1/2026"))).toBe(true);
  });

  it("builds weekly organization summaries from live reporting truth", () => {
    const { store } = buildOperatorReportingStore();
    const filters = {
      ...buildDefaultOperatorReportFilters(store, NOW_ISO),
      houseId: null,
      residentId: null,
    };

    const summary = buildScheduledSummaryDraft({
      store,
      nowIso: NOW_ISO,
      filters,
      summaryType: "WEEKLY_ORGANIZATION",
    });

    expect(summary.title).toContain("weekly organization summary");
    expect(summary.metrics.length).toBeGreaterThan(0);
    expect(summary.highlights.length).toBeGreaterThan(0);
  });

  it("surfaces pending and rejected proof states in the overdue / missing-proof export", () => {
    let { store } = buildOperatorReportingStore();
    const proofSummary = buildSoberHouseProofReviewSummary({
      store,
      nowIso: NOW_ISO,
    });
    const queueItem = proofSummary.queue.find(
      (item) =>
        item.proofProvided && item.reviewStatus === "pending" && item.proofReviewRecordId === null,
    );

    expect(queueItem).toBeDefined();

    store = createProofReviewRecord(
      store,
      { id: "operator-1", name: "Operator 1" },
      {
        ...buildProofReviewRecordDraftFromQueueItem(queueItem!),
        organizationId: store.organization?.id ?? null,
      },
      NOW_ISO,
    ).store;
    const reviewId = store.proofReviewRecords[0]!.id;

    store = reviewProofRecord(
      store,
      { id: "operator-1", name: "Operator 1" },
      reviewId,
      "REJECTED",
      "2026-04-01T12:10:00.000Z",
      "Rejected for test coverage.",
    ).store;

    const filters = {
      ...buildDefaultOperatorReportFilters(store, NOW_ISO),
      houseId: null,
      residentId: null,
    };
    const document = buildSoberHouseOperatorReportDocument({
      store,
      nowIso: NOW_ISO,
      filters,
      reportType: "OVERDUE_MISSING_PROOF_REPORT",
    });

    expect(document.csvRows.some((row) => row[2] === "Rejected proof")).toBe(true);
    expect(document.metrics.some((metric) => metric.label === "Pending / rejected")).toBe(true);
  });

  it("renders safe empty export states for orgs with no sober-house activity", () => {
    let store = createDefaultSoberHouseSettingsStore();
    store = upsertOrganization(
      store,
      { id: "admin-1", name: "Admin 1" },
      {
        name: "Empty Org",
        primaryContactName: "N/A",
        primaryPhone: "",
        primaryEmail: "",
        notes: "",
        status: "ACTIVE",
      },
      NOW_ISO,
    ).store;

    const filters = buildDefaultOperatorReportFilters(store, NOW_ISO);
    const document = buildSoberHouseOperatorReportDocument({
      store,
      nowIso: NOW_ISO,
      filters: { ...filters, houseId: null },
      reportType: "HOUSE_COMPLIANCE_REPORT",
    });

    expect(document.itemCount).toBe(0);
    expect(document.sections[0]).toMatchObject({
      kind: "table",
      emptyState: "No houses match the current report filters.",
    });
  });
});
