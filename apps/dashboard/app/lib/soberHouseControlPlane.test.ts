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
});
