import { describe, expect, it } from "vitest";
import { createDefaultSoberHouseSettingsStore } from "../../../mobile/lib/soberHouse/defaults";
import { buildSoberHouseOperatorReportingSummary } from "../../../mobile/lib/soberHouse/operatorReporting";
import {
  buildOperatorWebViewModel,
  buildResidentRuleVisibility,
  createOperatorWebSessionStore,
  filterOperatorResidents,
  getOperatorWebDemoStore,
} from "./soberHouseControlPlane";

describe("operator web control plane", () => {
  it("builds hierarchy-aware org, house, and resident data from the sober-house store", () => {
    const viewModel = buildOperatorWebViewModel({
      role: "ORG_ADMIN",
      selectedHouseId: null,
      selectedResidentId: null,
      selectedActionId: null,
      selectedProofItemId: null,
      residentFilters: {
        search: "",
        houseId: null,
        complianceBand: "all",
        overdueOnly: false,
        highRiskOnly: false,
        openViolationsOnly: false,
      },
      enforcementFilters: {
        houseId: null,
        residentId: null,
        level: "all",
        status: "all",
        urgentOnly: false,
        highRiskOnly: false,
        category: "all",
      },
      proofFilters: {
        houseId: null,
        residentId: null,
        category: "all",
        status: "all",
        proofRequiredOnly: false,
        pendingOnly: false,
        rejectedOnly: false,
        missingOnly: false,
        highRiskOnly: false,
      },
      reportType: "ORGANIZATION_ROLLUP_REPORT",
      reportHouseId: null,
      reportResidentId: null,
    });

    expect(viewModel.houses.length).toBeGreaterThan(1);
    expect(viewModel.residents.length).toBeGreaterThan(1);
    expect(viewModel.organization.totalHouses).toBeGreaterThan(1);
    expect(viewModel.enforcementQueue.length).toBeGreaterThan(0);
  });

  it("filters resident lookup by search, band, and overdue state", () => {
    const demo = getOperatorWebDemoStore();
    const summary = buildSoberHouseOperatorReportingSummary({
      store: demo.store,
      nowIso: "2026-04-01T12:00:00.000Z",
    });

    const filtered = filterOperatorResidents(summary.residents, demo.residentDirectory, {
      search: "Noah",
      houseId: null,
      complianceBand: "critical",
      overdueOnly: true,
      highRiskOnly: true,
      openViolationsOnly: true,
    });

    expect(filtered.length).toBe(1);
    expect(filtered[0]?.residentId).toBe("resident-noah");
  });

  it("shows org default vs house override vs resident exception in the rule summary", () => {
    const demo = getOperatorWebDemoStore();
    const rows = buildResidentRuleVisibility(
      demo.store,
      "resident-avery",
      "2026-04-01T12:00:00.000Z",
    );

    expect(rows.find((row) => row.category === "Meetings required")?.source).toBe(
      "Resident exception",
    );
    expect(rows.find((row) => row.category === "Chore proof")?.source).toBe("House group");
  });

  it("renders safe empty-state view models for older or empty sober-house stores", () => {
    const empty = {
      store: createDefaultSoberHouseSettingsStore(),
      residentDirectory: [],
      roleDefaults: {
        ORG_ADMIN: { houseId: null },
        HOUSE_MANAGER: { houseId: null },
        STAFF_VIEWER: { houseId: null },
      },
      residentLiveObligations: [],
    };

    const viewModel = buildOperatorWebViewModel({
      storeOverride: empty,
      role: "ORG_ADMIN",
      selectedHouseId: null,
      selectedResidentId: null,
      selectedActionId: null,
      selectedProofItemId: null,
      residentFilters: {
        search: "",
        houseId: null,
        complianceBand: "all",
        overdueOnly: false,
        highRiskOnly: false,
        openViolationsOnly: false,
      },
      enforcementFilters: {
        houseId: null,
        residentId: null,
        level: "all",
        status: "all",
        urgentOnly: false,
        highRiskOnly: false,
        category: "all",
      },
      proofFilters: {
        houseId: null,
        residentId: null,
        category: "all",
        status: "all",
        proofRequiredOnly: false,
        pendingOnly: false,
        rejectedOnly: false,
        missingOnly: false,
        highRiskOnly: false,
      },
      reportType: "ORGANIZATION_ROLLUP_REPORT",
      reportHouseId: null,
      reportResidentId: null,
    });

    expect(viewModel.houses).toHaveLength(0);
    expect(viewModel.residents).toHaveLength(0);
    expect(viewModel.snapshots).toHaveLength(0);
    expect(viewModel.enforcementQueue).toHaveLength(0);
  });

  it("supports enforcement queue drilldown and resident timeline in the web view model", () => {
    const session = createOperatorWebSessionStore();
    const viewModel = buildOperatorWebViewModel({
      storeOverride: session,
      role: "ORG_ADMIN",
      selectedHouseId: null,
      selectedResidentId: "resident-noah",
      selectedActionId: null,
      selectedProofItemId: null,
      residentFilters: {
        search: "",
        houseId: null,
        complianceBand: "all",
        overdueOnly: false,
        highRiskOnly: false,
        openViolationsOnly: false,
      },
      enforcementFilters: {
        houseId: null,
        residentId: null,
        level: "all",
        status: "all",
        urgentOnly: false,
        highRiskOnly: false,
        category: "all",
      },
      proofFilters: {
        houseId: null,
        residentId: null,
        category: "all",
        status: "all",
        proofRequiredOnly: false,
        pendingOnly: false,
        rejectedOnly: false,
        missingOnly: false,
        highRiskOnly: false,
      },
      reportType: "ORGANIZATION_ROLLUP_REPORT",
      reportHouseId: null,
      reportResidentId: null,
    });

    expect(viewModel.selectedResident?.interventionTimeline.length).toBeGreaterThan(0);
    expect(viewModel.organizationEnforcement.openCount).toBeGreaterThan(0);
    expect(viewModel.proofQueue.length).toBeGreaterThan(0);
    expect(
      viewModel.selectedResident?.enforcementLinks.find((row) => row.category === "Curfew")
        ?.consequencePath,
    ).toContain("warning");
  });

  it("surfaces live resident obligation execution and the pending review queue", () => {
    const demo = getOperatorWebDemoStore();
    const resident = demo.residentDirectory[0]!;
    const storeOverride = {
      ...demo,
      residentLiveObligations: [
        {
          obligationId: "obl-pending",
          residentId: resident.residentId,
          residentUserId: resident.linkedUserId,
          organizationId: demo.store.organization!.id,
          houseId: resident.houseId,
          obligationType: "CHORE" as const,
          title: "Kitchen reset",
          scheduledAt: "2026-03-31T18:00:00.000Z",
          dueAt: "2026-03-31T18:00:00.000Z",
          proofRequired: true,
          obligationStatus: "ACTIVE" as const,
          completionRecordId: "completion-pending",
          completionStatus: "COMPLETED" as const,
          completedAt: "2026-03-31T18:05:00.000Z",
          submittedAt: "2026-03-31T18:05:00.000Z",
          proofSubmitted: true,
          proofReviewId: "review-pending",
          proofReviewOutcome: "PENDING" as const,
          reviewedAt: null,
          createdAt: "2026-03-31T17:00:00.000Z",
          updatedAt: "2026-03-31T18:05:00.000Z",
        },
        {
          obligationId: "obl-rejected",
          residentId: resident.residentId,
          residentUserId: resident.linkedUserId,
          organizationId: demo.store.organization!.id,
          houseId: resident.houseId,
          obligationType: "ONE_ON_ONE" as const,
          title: "Weekly one-on-one",
          scheduledAt: "2026-03-30T15:00:00.000Z",
          dueAt: "2026-03-30T15:00:00.000Z",
          proofRequired: true,
          obligationStatus: "ACTIVE" as const,
          completionRecordId: "completion-rejected",
          completionStatus: "COMPLETED" as const,
          completedAt: "2026-03-30T15:20:00.000Z",
          submittedAt: "2026-03-30T15:20:00.000Z",
          proofSubmitted: true,
          proofReviewId: "review-rejected",
          proofReviewOutcome: "REJECTED" as const,
          reviewedAt: "2026-03-30T18:00:00.000Z",
          createdAt: "2026-03-30T14:00:00.000Z",
          updatedAt: "2026-03-30T18:00:00.000Z",
        },
      ],
    };

    const viewModel = buildOperatorWebViewModel({
      storeOverride,
      role: "ORG_ADMIN",
      selectedHouseId: null,
      selectedResidentId: resident.residentId,
      selectedActionId: null,
      selectedProofItemId: null,
      residentFilters: {
        search: "",
        houseId: null,
        complianceBand: "all",
        overdueOnly: false,
        highRiskOnly: false,
        openViolationsOnly: false,
      },
      enforcementFilters: {
        houseId: null,
        residentId: null,
        level: "all",
        status: "all",
        urgentOnly: false,
        highRiskOnly: false,
        category: "all",
      },
      proofFilters: {
        houseId: null,
        residentId: null,
        category: "all",
        status: "all",
        proofRequiredOnly: false,
        pendingOnly: false,
        rejectedOnly: false,
        missingOnly: false,
        highRiskOnly: false,
      },
      reportType: "ORGANIZATION_ROLLUP_REPORT",
      reportHouseId: null,
      reportResidentId: null,
    });

    expect(viewModel.liveObligationSummary.reviewPendingCount).toBe(1);
    expect(viewModel.liveObligationSummary.rejectedCount).toBe(1);
    expect(viewModel.livePendingReviewQueue[0]?.obligationId).toBe("obl-pending");
    expect(viewModel.selectedResident?.liveObligations).toHaveLength(2);
    expect(viewModel.selectedResident?.liveObligations[0]?.statusLabel).toBeDefined();
  });

  it("uses API-computed compliance summaries for role and selected-house scope", () => {
    const demo = getOperatorWebDemoStore();
    const [firstHouse, secondHouse] = demo.store.houses;
    const staffViewerHouseId = demo.roleDefaults.STAFF_VIEWER.houseId;
    expect(firstHouse).toBeDefined();
    expect(secondHouse).toBeDefined();
    expect(staffViewerHouseId).toBeTruthy();

    const storeOverride = {
      ...demo,
      complianceSummary: {
        organization: {
          dueTodayCount: 5,
          completedTodayCount: 4,
          overdueCount: 3,
          pendingReviewCount: 2,
          rejectedProofCount: 1,
        },
        houses: [
          {
            houseId: firstHouse!.id,
            houseName: firstHouse!.name,
            dueTodayCount: 2,
            completedTodayCount: 1,
            overdueCount: 1,
            pendingReviewCount: 1,
            rejectedProofCount: 0,
          },
          {
            houseId: secondHouse!.id,
            houseName: secondHouse!.name,
            dueTodayCount: 3,
            completedTodayCount: 3,
            overdueCount: 2,
            pendingReviewCount: 1,
            rejectedProofCount: 1,
          },
        ],
      },
      residentLiveObligations: [],
    };

    const staffViewerModel = buildOperatorWebViewModel({
      storeOverride,
      role: "STAFF_VIEWER",
      selectedHouseId: null,
      selectedResidentId: null,
      selectedActionId: null,
      selectedProofItemId: null,
      residentFilters: {
        search: "",
        houseId: null,
        complianceBand: "all",
        overdueOnly: false,
        highRiskOnly: false,
        openViolationsOnly: false,
      },
      enforcementFilters: {
        houseId: null,
        residentId: null,
        level: "all",
        status: "all",
        urgentOnly: false,
        highRiskOnly: false,
        category: "all",
      },
      proofFilters: {
        houseId: null,
        residentId: null,
        category: "all",
        status: "all",
        proofRequiredOnly: false,
        pendingOnly: false,
        rejectedOnly: false,
        missingOnly: false,
        highRiskOnly: false,
      },
      reportType: "ORGANIZATION_ROLLUP_REPORT",
      reportHouseId: null,
      reportResidentId: null,
    });

    const selectedHouseModel = buildOperatorWebViewModel({
      storeOverride,
      role: "ORG_ADMIN",
      selectedHouseId: firstHouse!.id,
      selectedResidentId: null,
      selectedActionId: null,
      selectedProofItemId: null,
      residentFilters: {
        search: "",
        houseId: null,
        complianceBand: "all",
        overdueOnly: false,
        highRiskOnly: false,
        openViolationsOnly: false,
      },
      enforcementFilters: {
        houseId: null,
        residentId: null,
        level: "all",
        status: "all",
        urgentOnly: false,
        highRiskOnly: false,
        category: "all",
      },
      proofFilters: {
        houseId: null,
        residentId: null,
        category: "all",
        status: "all",
        proofRequiredOnly: false,
        pendingOnly: false,
        rejectedOnly: false,
        missingOnly: false,
        highRiskOnly: false,
      },
      reportType: "ORGANIZATION_ROLLUP_REPORT",
      reportHouseId: null,
      reportResidentId: null,
    });

    expect(staffViewerModel.liveComplianceSummary).toEqual(
      staffViewerHouseId === firstHouse!.id
        ? {
            dueTodayCount: 2,
            completedTodayCount: 1,
            overdueCount: 1,
            pendingReviewCount: 1,
            rejectedProofCount: 0,
          }
        : {
            dueTodayCount: 3,
            completedTodayCount: 3,
            overdueCount: 2,
            pendingReviewCount: 1,
            rejectedProofCount: 1,
          },
    );
    expect(selectedHouseModel.liveComplianceSummary).toEqual({
      dueTodayCount: 2,
      completedTodayCount: 1,
      overdueCount: 1,
      pendingReviewCount: 1,
      rejectedProofCount: 0,
    });
  });
});
