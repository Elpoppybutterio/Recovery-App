import {
  buildSoberHouseOperatorReportingSummary,
  type OperatorHouseReport,
  type OperatorResidentReport,
  type OperatorTrendPoint,
} from "./operatorReporting";
import { buildSoberHouseProofReviewSummary } from "./proofReview";
import type {
  OperatorReportComplianceBandFilter,
  OperatorReportExportType,
  OperatorReportFilterSnapshot,
  OperatorScheduledSummaryType,
  ScheduledSummaryRecord,
  SoberHouseSettingsStore,
} from "./types";

type BuildInput = {
  store: SoberHouseSettingsStore;
  nowIso: string;
  filters: OperatorReportFilterSnapshot;
};

export type OperatorReportMetricCard = {
  label: string;
  value: string;
  detail: string;
};

export type OperatorReportTableSection = {
  kind: "table";
  title: string;
  columns: string[];
  rows: string[][];
  emptyState: string;
};

export type OperatorReportListSection = {
  kind: "list";
  title: string;
  items: string[];
  emptyState: string;
};

export type OperatorReportTrendSection = {
  kind: "trend";
  title: string;
  points: OperatorTrendPoint[];
  emptyState: string;
};

export type OperatorReportSection =
  | OperatorReportTableSection
  | OperatorReportListSection
  | OperatorReportTrendSection;

export type OperatorReportDocument = {
  reportType: OperatorReportExportType;
  title: string;
  scopeLabel: string;
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  metrics: OperatorReportMetricCard[];
  sections: OperatorReportSection[];
  csvColumns: string[];
  csvRows: string[][];
  itemCount: number;
};

type FilteredReportingContext = BuildInput & {
  summary: ReturnType<typeof buildSoberHouseOperatorReportingSummary>;
  proofSummary: ReturnType<typeof buildSoberHouseProofReviewSummary>;
  residents: OperatorResidentReport[];
  houses: OperatorHouseReport[];
  violationsInRange: SoberHouseSettingsStore["violations"];
};

function parseDateOnly(value: string, fallback: Date): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function formatPercent(value: number | null): string {
  return value === null ? "Not tracked" : `${Math.round(value)}%`;
}

function complianceBandLabel(value: OperatorReportComplianceBandFilter): string {
  if (value === "ALL") {
    return "All statuses";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatRatio(completed: number | null, required: number | null, suffix = ""): string {
  if (required === null || completed === null) {
    return "Not tracked";
  }
  return `${completed}/${required}${suffix}`;
}

function resolveWorkStatus(resident: OperatorResidentReport): string {
  if (!resident.workTracked) {
    return "Not tracked";
  }
  if (resident.jobApplicationsTracked) {
    return `${resident.jobApplicationsCompleted ?? 0}/${resident.jobApplicationsDue ?? 0} apps`;
  }
  return resident.workVerifiedThisWeek ? "Verified" : "Missing";
}

function isResidentOverdue(resident: OperatorResidentReport): boolean {
  return (
    resident.overdueChores > 0 ||
    resident.hasCurfewIssues ||
    resident.hasMeetingNoncompliance ||
    resident.hasOverdueOneOnOnes ||
    (resident.jobApplicationsDue ?? 0) > (resident.jobApplicationsCompleted ?? 0) ||
    resident.openViolations > 0
  );
}

function residentProofIssueCounts(context: FilteredReportingContext, residentId: string) {
  const proofSummary = context.proofSummary.residentSummaries.get(residentId);
  return {
    pending: proofSummary?.pendingCount ?? 0,
    rejected: proofSummary?.rejectedCount ?? 0,
    followUp: proofSummary?.followUpCount ?? 0,
    missing: proofSummary?.missingCount ?? 0,
    unresolved:
      proofSummary?.unresolvedCount ??
      context.residents.find((resident) => resident.residentId === residentId)?.missingProofCount ??
      0,
  };
}

function totalProofPressure(context: FilteredReportingContext) {
  return context.residents.reduce((total, resident) => {
    const proofCounts = residentProofIssueCounts(context, resident.residentId);
    return (
      total +
      proofCounts.pending +
      proofCounts.rejected +
      proofCounts.followUp +
      proofCounts.missing
    );
  }, 0);
}

function bandMatches(
  resident: OperatorResidentReport,
  band: OperatorReportComplianceBandFilter,
): boolean {
  return band === "ALL" ? true : resident.complianceBand === band;
}

function filterContext(input: BuildInput): FilteredReportingContext {
  const summary = buildSoberHouseOperatorReportingSummary({
    store: input.store,
    nowIso: input.nowIso,
  });
  const proofSummary = buildSoberHouseProofReviewSummary({
    store: input.store,
    nowIso: input.nowIso,
  });
  const now = new Date(input.nowIso);
  const defaultEnd = toIsoDate(now);
  const defaultStart = toIsoDate(addDays(now, -6));
  const startDate = parseDateOnly(input.filters.startDate || defaultStart, addDays(now, -6));
  const endDate = addDays(parseDateOnly(input.filters.endDate || defaultEnd, now), 1);
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();

  const residents = summary.residents.filter((resident) => {
    if (input.filters.houseId && resident.houseId !== input.filters.houseId) {
      return false;
    }
    if (input.filters.residentId && resident.residentId !== input.filters.residentId) {
      return false;
    }
    if (!bandMatches(resident, input.filters.complianceBand)) {
      return false;
    }
    if (input.filters.highRiskOnly && resident.complianceBand === "compliant") {
      return false;
    }
    if (
      input.filters.onlyMissingProof &&
      (() => {
        const proofCounts = residentProofIssueCounts(
          {
            ...input,
            summary,
            proofSummary,
            residents: summary.residents,
            houses: summary.houses,
            violationsInRange: input.store.violations,
          },
          resident.residentId,
        );
        return (
          proofCounts.pending +
            proofCounts.rejected +
            proofCounts.followUp +
            proofCounts.missing ===
          0
        );
      })()
    ) {
      return false;
    }
    if (input.filters.onlyOverdue && !isResidentOverdue(resident)) {
      return false;
    }
    if (input.filters.onlyOpenViolations && resident.openViolations === 0) {
      return false;
    }
    return true;
  });
  const residentIds = new Set(residents.map((resident) => resident.residentId));
  const houseIds = new Set(residents.map((resident) => resident.houseId).filter(Boolean));
  const houses = summary.houses.filter((house) => {
    if (input.filters.houseId && house.houseId !== input.filters.houseId) {
      return false;
    }
    if (
      input.filters.residentId &&
      !house.residents.some((resident) => residentIds.has(resident.residentId))
    ) {
      return false;
    }
    if (residentIds.size > 0 && input.filters.houseId === null && !houseIds.has(house.houseId)) {
      return false;
    }
    return true;
  });
  const violationsInRange = input.store.violations.filter((violation) => {
    if (input.filters.organizationId && violation.organizationId !== input.filters.organizationId) {
      return false;
    }
    if (input.filters.houseId && violation.houseId !== input.filters.houseId) {
      return false;
    }
    if (input.filters.residentId && violation.residentId !== input.filters.residentId) {
      return false;
    }
    if (residentIds.size > 0 && !residentIds.has(violation.residentId)) {
      return false;
    }
    const at = new Date(violation.triggeredAt).getTime();
    if (!Number.isFinite(at) || at < startMs || at >= endMs) {
      return false;
    }
    if (input.filters.onlyOpenViolations) {
      return violation.status === "OPEN" || violation.status === "UNDER_REVIEW";
    }
    return true;
  });

  return {
    ...input,
    summary,
    proofSummary,
    residents,
    houses,
    violationsInRange,
  };
}

export function buildDefaultOperatorReportFilters(
  store: SoberHouseSettingsStore,
  nowIso: string,
): OperatorReportFilterSnapshot {
  const now = new Date(nowIso);
  return {
    startDate: toIsoDate(addDays(now, -6)),
    endDate: toIsoDate(now),
    organizationId: store.organization?.id ?? null,
    houseId: store.residentHousingProfile?.houseId ?? store.houses[0]?.id ?? null,
    residentId: null,
    complianceBand: "ALL",
    onlyOpenViolations: false,
    onlyMissingProof: false,
    onlyOverdue: false,
    highRiskOnly: false,
  };
}

function buildScopeLabel(context: FilteredReportingContext): string {
  if (context.filters.residentId) {
    const resident = context.residents.find(
      (entry) => entry.residentId === context.filters.residentId,
    );
    return resident ? `${resident.displayName} • ${resident.houseName}` : "Resident";
  }
  if (context.filters.houseId) {
    const house = context.houses.find((entry) => entry.houseId === context.filters.houseId);
    return house ? house.houseName : "House";
  }
  return context.summary.organization.organizationName;
}

function buildResidentDocument(context: FilteredReportingContext): OperatorReportDocument {
  const metrics: OperatorReportMetricCard[] = [
    {
      label: "Residents",
      value: String(context.residents.length),
      detail: "Residents in the selected scope.",
    },
    {
      label: "Critical",
      value: String(
        context.residents.filter((resident) => resident.complianceBand === "critical").length,
      ),
      detail: "Residents currently in the critical band.",
    },
    {
      label: "Missing proof",
      value: String(
        context.residents.reduce(
          (total, resident) =>
            total + residentProofIssueCounts(context, resident.residentId).missing,
          0,
        ),
      ),
      detail: "Explicit proof gaps tied to tracked resident obligations.",
    },
    {
      label: "Open violations",
      value: String(
        context.residents.reduce((total, resident) => total + resident.openViolations, 0),
      ),
      detail: "Open sober-house violations for the filtered residents.",
    },
  ];
  const columns = [
    "Resident",
    "House",
    "Band",
    "Score",
    "Meetings",
    "Chores",
    "Curfew",
    "One-on-ones",
    "Sponsor",
    "House meetings",
    "Work / Job search",
    "Missing proof",
    "Open violations",
    "Trend",
  ];
  const rows = context.residents.map((resident) => [
    resident.displayName,
    resident.houseName,
    resident.complianceBand,
    String(resident.complianceScore),
    formatRatio(resident.meetingsCompleted, resident.meetingsRequired),
    `${resident.choresCompleted}/${resident.choresAssigned}`,
    resident.curfewMissesThisWeek === 0 ? "On track" : `${resident.curfewMissesThisWeek} misses`,
    formatRatio(resident.oneOnOnesCompleted, resident.oneOnOnesDue),
    formatRatio(resident.sponsorCallsCompleted, resident.sponsorCallsDue),
    `${resident.houseMeetingsCompleted}/${resident.houseMeetingsDue}`,
    resolveWorkStatus(resident),
    String(resident.missingProofCount),
    String(resident.openViolations),
    resident.trend,
  ]);
  return {
    reportType: "RESIDENT_COMPLIANCE_SUMMARY",
    title: "Resident Compliance Summary",
    scopeLabel: buildScopeLabel(context),
    generatedAt: context.nowIso,
    periodStart: context.filters.startDate,
    periodEnd: context.filters.endDate,
    metrics,
    sections: [
      {
        kind: "table",
        title: "Resident compliance table",
        columns,
        rows,
        emptyState: "No residents match the current report filters.",
      },
    ],
    csvColumns: columns,
    csvRows: rows,
    itemCount: rows.length,
  };
}

function buildHouseDocument(context: FilteredReportingContext): OperatorReportDocument {
  const metrics: OperatorReportMetricCard[] = [
    {
      label: "Houses",
      value: String(context.houses.length),
      detail: "Houses represented in the selected scope.",
    },
    {
      label: "Residents",
      value: String(context.residents.length),
      detail: "Residents attached to those houses.",
    },
    {
      label: "Avg compliance",
      value: formatPercent(
        context.houses.length
          ? context.houses.reduce((total, house) => total + (house.compliancePercent ?? 0), 0) /
              context.houses.length
          : null,
      ),
      detail: "Average current house compliance score.",
    },
    {
      label: "Open incidents",
      value: String(context.houses.reduce((total, house) => total + house.openViolations, 0)),
      detail: "Open violations/incidents across the selected houses.",
    },
  ];
  const columns = [
    "House",
    "Occupancy",
    "Roster",
    "Compliance",
    "Warning",
    "Critical",
    "Missed chores",
    "Curfew misses",
    "Meetings",
    "One-on-ones",
    "Sponsor",
    "Work",
    "Open violations",
  ];
  const rows = context.houses.map((house) => [
    house.houseName,
    `${house.occupiedBeds}/${house.bedCount}`,
    String(house.rosterCount),
    formatPercent(house.compliancePercent),
    String(house.warningResidents + house.noncompliantResidents),
    String(house.criticalResidents),
    String(house.missedChoresToday),
    String(house.curfewMissesThisWeek),
    formatRatio(house.meetingsCompleted, house.meetingsRequired),
    house.oneOnOnesTracked
      ? formatRatio(house.oneOnOnesCompleted, house.oneOnOnesDue)
      : "Not tracked",
    house.sponsorCallsTracked ? formatPercent(house.sponsorCallAdherencePercent) : "Not tracked",
    house.workTracked ? formatPercent(house.workCompliancePercent) : "Not tracked",
    String(house.openViolations),
  ]);
  const highestRiskResidents = context.residents
    .filter((resident) => resident.complianceBand !== "compliant")
    .sort((left, right) => left.complianceScore - right.complianceScore)
    .slice(0, 5)
    .map(
      (resident) =>
        `${resident.displayName} • ${resident.houseName} • ${resident.complianceBand} • ${resident.statusReasons[0]}`,
    );
  return {
    reportType: "HOUSE_COMPLIANCE_REPORT",
    title: "House Compliance Report",
    scopeLabel: buildScopeLabel(context),
    generatedAt: context.nowIso,
    periodStart: context.filters.startDate,
    periodEnd: context.filters.endDate,
    metrics,
    sections: [
      {
        kind: "table",
        title: "House comparison",
        columns,
        rows,
        emptyState: "No houses match the current report filters.",
      },
      {
        kind: "list",
        title: "Highest-risk residents",
        items: highestRiskResidents,
        emptyState: "No elevated-risk residents in the current house scope.",
      },
    ],
    csvColumns: columns,
    csvRows: rows,
    itemCount: rows.length,
  };
}

function buildOrganizationDocument(context: FilteredReportingContext): OperatorReportDocument {
  const compliant = context.residents.filter(
    (resident) => resident.complianceBand === "compliant",
  ).length;
  const warning = context.residents.filter(
    (resident) => resident.complianceBand === "warning",
  ).length;
  const noncompliant = context.residents.filter(
    (resident) => resident.complianceBand === "noncompliant",
  ).length;
  const critical = context.residents.filter(
    (resident) => resident.complianceBand === "critical",
  ).length;
  const metrics: OperatorReportMetricCard[] = [
    {
      label: "Total houses",
      value: String(context.houses.length),
      detail: "Active houses in the filtered organization scope.",
    },
    {
      label: "Total residents",
      value: String(context.residents.length),
      detail: "Residents included in this rollup.",
    },
    {
      label: "Status counts",
      value: `${compliant}/${warning}/${noncompliant}/${critical}`,
      detail: "Compliant / warning / noncompliant / critical.",
    },
    {
      label: "Open incidents",
      value: String(
        context.violationsInRange.filter((violation) => violation.status === "OPEN").length,
      ),
      detail: "Open violations inside the selected reporting period.",
    },
  ];
  const houseColumns = [
    "House",
    "Compliance",
    "Roster",
    "Open incidents",
    "Missing proof",
    "Trend",
  ];
  const houseRows = context.houses
    .slice()
    .sort((left, right) => (left.compliancePercent ?? 0) - (right.compliancePercent ?? 0))
    .map((house) => [
      house.houseName,
      formatPercent(house.compliancePercent),
      String(house.rosterCount),
      String(house.openViolations),
      String(house.residents.reduce((total, resident) => total + resident.missingProofCount, 0)),
      house.criticalResidents > 0
        ? "Critical residents present"
        : house.warningResidents + house.noncompliantResidents > 0
          ? "Watch list"
          : "Stable",
    ]);
  const highestRiskResidents = context.residents
    .filter((resident) => resident.complianceBand !== "compliant")
    .sort((left, right) => left.complianceScore - right.complianceScore)
    .slice(0, 8)
    .map(
      (resident) =>
        `${resident.displayName} • ${resident.houseName} • ${resident.complianceBand} • ${resident.statusReasons[0]}`,
    );
  return {
    reportType: "ORGANIZATION_ROLLUP_REPORT",
    title: "Organization Rollup Report",
    scopeLabel: buildScopeLabel(context),
    generatedAt: context.nowIso,
    periodStart: context.filters.startDate,
    periodEnd: context.filters.endDate,
    metrics,
    sections: [
      {
        kind: "table",
        title: "House comparison",
        columns: houseColumns,
        rows: houseRows,
        emptyState: "No houses are available for the selected reporting scope.",
      },
      {
        kind: "list",
        title: "Highest-risk residents",
        items: highestRiskResidents,
        emptyState: "No elevated-risk residents in the current organization scope.",
      },
      {
        kind: "trend",
        title: "Recent violations trend",
        points: context.summary.organization.recentViolationsTrend,
        emptyState: "No recent violation trend data is available.",
      },
      {
        kind: "trend",
        title: "Recent curfew trend",
        points: context.summary.organization.recentCurfewTrend,
        emptyState: "No recent curfew trend data is available.",
      },
      {
        kind: "trend",
        title: "Recent missed chore trend",
        points: context.summary.organization.recentMissedChoreTrend,
        emptyState: "No recent missed-chore trend data is available.",
      },
    ],
    csvColumns: houseColumns,
    csvRows: houseRows,
    itemCount: houseRows.length,
  };
}

function buildViolationsDocument(context: FilteredReportingContext): OperatorReportDocument {
  const rows = context.violationsInRange.map((violation) => {
    const resident = context.residents.find((entry) => entry.residentId === violation.residentId);
    const house = context.houses.find((entry) => entry.houseId === violation.houseId);
    return [
      house?.houseName ?? "Unknown house",
      resident?.displayName ?? violation.residentId,
      violation.ruleType,
      violation.severity,
      violation.status,
      formatDateTime(violation.triggeredAt),
      violation.status === "RESOLVED" || violation.status === "DISMISSED" ? "Resolved" : "Open",
      violation.reasonSummary || "",
    ];
  });
  return {
    reportType: "VIOLATIONS_INCIDENTS_EXPORT",
    title: "Violations / Incidents Export",
    scopeLabel: buildScopeLabel(context),
    generatedAt: context.nowIso,
    periodStart: context.filters.startDate,
    periodEnd: context.filters.endDate,
    metrics: [
      {
        label: "Incidents",
        value: String(rows.length),
        detail: "Violations/incidents inside the selected reporting period.",
      },
      {
        label: "Open",
        value: String(
          context.violationsInRange.filter(
            (violation) => violation.status === "OPEN" || violation.status === "UNDER_REVIEW",
          ).length,
        ),
        detail: "Incidents still open or under review.",
      },
      {
        label: "Critical",
        value: String(
          context.violationsInRange.filter((violation) => violation.severity === "CRITICAL").length,
        ),
        detail: "Critical-severity incidents in the selected period.",
      },
      {
        label: "Houses impacted",
        value: String(
          new Set(context.violationsInRange.map((violation) => violation.houseId)).size,
        ),
        detail: "Distinct houses represented in this export.",
      },
    ],
    sections: [
      {
        kind: "table",
        title: "Violations and incidents",
        columns: [
          "House",
          "Resident",
          "Category",
          "Severity",
          "Status",
          "Created",
          "State",
          "Notes",
        ],
        rows,
        emptyState: "No violations or incidents match the current filters.",
      },
    ],
    csvColumns: [
      "House",
      "Resident",
      "Category",
      "Severity",
      "Status",
      "Created",
      "State",
      "Notes",
    ],
    csvRows: rows,
    itemCount: rows.length,
  };
}

function buildMissingProofRows(context: FilteredReportingContext): string[][] {
  const rows: string[][] = [];
  context.residents.forEach((resident) => {
    const proofCounts = residentProofIssueCounts(context, resident.residentId);
    if (proofCounts.missing > 0) {
      rows.push([
        resident.displayName,
        resident.houseName,
        "Missing proof",
        context.filters.endDate,
        "Yes",
        String(proofCounts.missing),
        resident.statusReasons.find((reason) => reason.includes("missing proof")) ??
          resident.statusReasons[0] ??
          "",
      ]);
    }
    if (proofCounts.pending > 0) {
      rows.push([
        resident.displayName,
        resident.houseName,
        "Proof pending review",
        context.filters.endDate,
        "Submitted",
        String(proofCounts.pending),
        "Proof has been submitted and is still awaiting operator review.",
      ]);
    }
    if (proofCounts.rejected > 0) {
      rows.push([
        resident.displayName,
        resident.houseName,
        "Rejected proof",
        context.filters.endDate,
        "Submitted",
        String(proofCounts.rejected),
        "Submitted proof was reviewed and rejected.",
      ]);
    }
    if (proofCounts.followUp > 0) {
      rows.push([
        resident.displayName,
        resident.houseName,
        "Proof follow-up required",
        context.filters.endDate,
        "Submitted",
        String(proofCounts.followUp),
        "Submitted proof needs additional follow-up before approval.",
      ]);
    }
    if (resident.overdueChores > 0) {
      rows.push([
        resident.displayName,
        resident.houseName,
        "Overdue chores",
        context.filters.endDate,
        "Rule dependent",
        String(resident.overdueChores),
        "Chore completion is overdue.",
      ]);
    }
    if (resident.hasOverdueOneOnOnes) {
      rows.push([
        resident.displayName,
        resident.houseName,
        "Overdue one-on-one",
        context.filters.endDate,
        "No",
        "1",
        "Required one-on-one remains incomplete.",
      ]);
    }
    if ((resident.jobApplicationsDue ?? 0) > (resident.jobApplicationsCompleted ?? 0)) {
      rows.push([
        resident.displayName,
        resident.houseName,
        "Job search behind",
        context.filters.endDate,
        "Rule dependent",
        `${resident.jobApplicationsCompleted ?? 0}/${resident.jobApplicationsDue ?? 0}`,
        "Required job applications remain incomplete.",
      ]);
    }
  });
  return rows;
}

function buildOverdueDocument(context: FilteredReportingContext): OperatorReportDocument {
  const rows = buildMissingProofRows(context);
  return {
    reportType: "OVERDUE_MISSING_PROOF_REPORT",
    title: "Overdue / Missing Proof Report",
    scopeLabel: buildScopeLabel(context),
    generatedAt: context.nowIso,
    periodStart: context.filters.startDate,
    periodEnd: context.filters.endDate,
    metrics: [
      {
        label: "Rows",
        value: String(rows.length),
        detail: "Residents/items that still need completion or proof.",
      },
      {
        label: "Residents impacted",
        value: String(new Set(rows.map((row) => row[0])).size),
        detail: "Distinct residents included in this report.",
      },
      {
        label: "Missing proof",
        value: String(
          context.residents.reduce(
            (total, resident) =>
              total + residentProofIssueCounts(context, resident.residentId).missing,
            0,
          ),
        ),
        detail: "Truly missing proof across the selected scope.",
      },
      {
        label: "Pending / rejected",
        value: String(totalProofPressure(context)),
        detail: "Submitted proof still pending, rejected, or needing follow-up.",
      },
      {
        label: "Overdue items",
        value: String(context.residents.filter((resident) => isResidentOverdue(resident)).length),
        detail: "Residents with one or more overdue tracked items.",
      },
    ],
    sections: [
      {
        kind: "table",
        title: "Overdue and missing-proof detail",
        columns: [
          "Resident",
          "House",
          "Item type",
          "Due / period",
          "Proof required",
          "Count / progress",
          "Compliance impact",
        ],
        rows,
        emptyState: "No overdue items or missing-proof records match the current filters.",
      },
    ],
    csvColumns: [
      "Resident",
      "House",
      "Item type",
      "Due / period",
      "Proof required",
      "Count / progress",
      "Compliance impact",
    ],
    csvRows: rows,
    itemCount: rows.length,
  };
}

export function buildSoberHouseOperatorReportDocument(
  input: BuildInput & { reportType: OperatorReportExportType },
): OperatorReportDocument {
  const context = filterContext(input);
  switch (input.reportType) {
    case "RESIDENT_COMPLIANCE_SUMMARY":
      return buildResidentDocument(context);
    case "HOUSE_COMPLIANCE_REPORT":
      return buildHouseDocument(context);
    case "ORGANIZATION_ROLLUP_REPORT":
      return buildOrganizationDocument(context);
    case "VIOLATIONS_INCIDENTS_EXPORT":
      return buildViolationsDocument(context);
    case "OVERDUE_MISSING_PROOF_REPORT":
      return buildOverdueDocument(context);
    default:
      return buildOrganizationDocument(context);
  }
}

export function buildScheduledSummaryDraft(
  input: BuildInput & { summaryType: OperatorScheduledSummaryType },
): Omit<ScheduledSummaryRecord, "id"> {
  const context = filterContext(input);
  const residentsNeedingAttention = context.residents.filter(
    (resident) => resident.complianceBand !== "compliant" || isResidentOverdue(resident),
  );
  const topResidents = residentsNeedingAttention
    .sort((left, right) => left.complianceScore - right.complianceScore)
    .slice(0, 5)
    .map(
      (resident) =>
        `${resident.displayName} • ${resident.houseName} • ${resident.complianceBand} • ${resident.statusReasons[0]}`,
    );
  if (input.summaryType === "DAILY_HOUSE") {
    const house = context.houses[0] ?? null;
    return {
      summaryType: "DAILY_HOUSE",
      scopeType: "HOUSE",
      organizationId: context.filters.organizationId,
      houseId: house?.houseId ?? context.filters.houseId,
      residentId: null,
      periodStart: `${context.filters.startDate}T00:00:00.000Z`,
      periodEnd: `${context.filters.endDate}T23:59:59.999Z`,
      generatedAt: input.nowIso,
      generatedBy: { id: "system", name: "System" },
      title: `${house?.houseName ?? "House"} daily summary`,
      subtitle:
        "Residents needing attention today, overdue chores, proof gaps, and open incidents.",
      highlights: topResidents,
      metrics: [
        {
          label: "Residents needing attention",
          value: String(residentsNeedingAttention.length),
          detail: "Residents with overdue tasks, open violations, or elevated risk.",
        },
        {
          label: "Overdue chores",
          value: String(
            context.residents.reduce((total, resident) => total + resident.overdueChores, 0),
          ),
          detail: "Overdue chore completions in the current house scope.",
        },
        {
          label: "Missing proof",
          value: String(
            context.residents.reduce(
              (total, resident) =>
                total + residentProofIssueCounts(context, resident.residentId).missing,
              0,
            ),
          ),
          detail: "Truly missing proof still unresolved.",
        },
        {
          label: "Pending / rejected proof",
          value: String(totalProofPressure(context)),
          detail: "Submitted proof still pending, rejected, or needing follow-up.",
        },
        {
          label: "Open incidents",
          value: String(context.violationsInRange.length),
          detail: "Open or recent house incidents inside the selected day range.",
        },
      ],
      filters: input.filters,
    };
  }

  if (input.summaryType === "WEEKLY_HOUSE_MANAGER") {
    const house = context.houses[0] ?? null;
    return {
      summaryType: "WEEKLY_HOUSE_MANAGER",
      scopeType: "HOUSE",
      organizationId: context.filters.organizationId,
      houseId: house?.houseId ?? context.filters.houseId,
      residentId: null,
      periodStart: `${context.filters.startDate}T00:00:00.000Z`,
      periodEnd: `${context.filters.endDate}T23:59:59.999Z`,
      generatedAt: input.nowIso,
      generatedBy: { id: "system", name: "System" },
      title: `${house?.houseName ?? "House"} weekly manager summary`,
      subtitle:
        "Weekly compliance snapshot with resident changes, house meetings, sponsor calls, and one-on-ones.",
      highlights: topResidents,
      metrics: [
        {
          label: "Compliance",
          value: formatPercent(house?.compliancePercent ?? null),
          detail: "Current house compliance score.",
        },
        {
          label: "House meetings",
          value: house
            ? formatRatio(
                house.residents.reduce(
                  (total, resident) => total + resident.houseMeetingsCompleted,
                  0,
                ),
                house.residents.reduce((total, resident) => total + resident.houseMeetingsDue, 0),
              )
            : "Not tracked",
          detail: "Completed versus required house-meeting acknowledgments.",
        },
        {
          label: "One-on-ones",
          value: house?.oneOnOnesTracked
            ? formatRatio(house.oneOnOnesCompleted, house.oneOnOnesDue)
            : "Not tracked",
          detail: "Explicit one-on-one completion in scope.",
        },
        {
          label: "Sponsor calls",
          value: house?.sponsorCallsTracked
            ? formatPercent(house.sponsorCallAdherencePercent)
            : "Not tracked",
          detail: "Explicit sponsor-call adherence in scope.",
        },
      ],
      filters: input.filters,
    };
  }

  return {
    summaryType: "WEEKLY_ORGANIZATION",
    scopeType: "ORGANIZATION",
    organizationId: context.filters.organizationId,
    houseId: null,
    residentId: null,
    periodStart: `${context.filters.startDate}T00:00:00.000Z`,
    periodEnd: `${context.filters.endDate}T23:59:59.999Z`,
    generatedAt: input.nowIso,
    generatedBy: { id: "system", name: "System" },
    title: `${context.summary.organization.organizationName} weekly organization summary`,
    subtitle:
      "Organization-wide status counts, highest-risk houses, residents, and completion highlights.",
    highlights: [
      ...context.summary.organization.highestRiskHouses.map(
        (house) => `${house.houseName} • ${house.complianceBand} • ${house.detail}`,
      ),
      ...topResidents,
    ].slice(0, 8),
    metrics: [
      {
        label: "Status counts",
        value: `${context.summary.organization.compliantResidentsCount}/${context.summary.organization.warningResidentsCount}/${context.summary.organization.noncompliantResidentsCount}/${context.summary.organization.criticalResidentsCount}`,
        detail: "Compliant / warning / noncompliant / critical residents.",
      },
      {
        label: "Highest-risk houses",
        value: String(context.summary.organization.highestRiskHouses.length),
        detail: "Houses currently driving the most operator attention.",
      },
      {
        label: "Open incidents",
        value: String(context.summary.organization.openViolationsIncidents),
        detail: "Open violations/incidents in the organization view.",
      },
      {
        label: "Missing proof",
        value: String(
          context.residents.reduce(
            (total, resident) =>
              total + residentProofIssueCounts(context, resident.residentId).missing,
            0,
          ),
        ),
        detail: "Truly missing proof across the organization scope.",
      },
      {
        label: "Pending / rejected proof",
        value: String(totalProofPressure(context)),
        detail: "Submitted proof still pending, rejected, or needing follow-up.",
      },
    ],
    filters: input.filters,
  };
}

function csvEscapeCell(value: string): string {
  const normalized = value.replaceAll('"', '""');
  return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized;
}

export function buildOperatorReportCsv(document: OperatorReportDocument): string {
  const header = document.csvColumns.map(csvEscapeCell).join(",");
  const rows = document.csvRows.map((row) => row.map(csvEscapeCell).join(","));
  return [header, ...rows].join("\n");
}
