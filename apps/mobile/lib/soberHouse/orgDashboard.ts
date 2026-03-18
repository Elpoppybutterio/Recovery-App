import type {
  CorrectiveActionStatus,
  House,
  HouseGroup,
  SoberHouseSettingsStore,
  ViolationStatus,
} from "./types";

export type SoberHouseOwnerKpiTileId =
  | "houses"
  | "violations"
  | "corrective-actions"
  | "reports"
  | "managers"
  | "chat";

export type SoberHouseOwnerDashboardFilterOption = {
  id: string;
  label: string;
};

export type SoberHouseOwnerDashboardKpiTile = {
  id: SoberHouseOwnerKpiTileId;
  label: string;
  value: string;
  detail: string;
  tone: "green" | "yellow" | "red" | "gray";
};

export type SoberHouseOwnerHouseRow = {
  houseId: string;
  houseName: string;
  groupName: string;
  status: House["status"];
  activeViolations: number;
  underReviewViolations: number;
  correctiveActionsOpen: number;
  currentReports: number;
};

export type SoberHouseOwnerConcernRow = {
  id: string;
  title: string;
  detail: string;
  tone: "green" | "yellow" | "red" | "gray";
};

export type SoberHouseOwnerDashboardSummary = {
  organizationName: string;
  availableGroups: SoberHouseOwnerDashboardFilterOption[];
  availableHouses: SoberHouseOwnerDashboardFilterOption[];
  filteredHouseIds: string[];
  kpis: SoberHouseOwnerDashboardKpiTile[];
  houseRows: SoberHouseOwnerHouseRow[];
  concerns: SoberHouseOwnerConcernRow[];
};

type Input = {
  store: SoberHouseSettingsStore;
  selectedGroupIds: string[];
  selectedHouseIds: string[];
};

const ACTIVE_VIOLATION_STATUSES: ViolationStatus[] = [
  "OPEN",
  "UNDER_REVIEW",
  "CORRECTIVE_ACTION_ASSIGNED",
];

const OPEN_CORRECTIVE_ACTION_STATUSES: CorrectiveActionStatus[] = ["OPEN", "OVERDUE"];

function intersectingHouseIdsFromGroups(groups: HouseGroup[]): string[] {
  return Array.from(new Set(groups.flatMap((group) => group.houseIds)));
}

function toneForCount(
  count: number,
  thresholds: { green: number; yellow: number },
): "green" | "yellow" | "red" | "gray" {
  if (count <= thresholds.green) {
    return "green";
  }
  if (count <= thresholds.yellow) {
    return "yellow";
  }
  return "red";
}

export function buildSoberHouseOwnerDashboardSummary(
  input: Input,
): SoberHouseOwnerDashboardSummary {
  const activeGroups = input.store.houseGroups.filter((group) => group.status === "ACTIVE");
  const allHouses = [...input.store.houses].sort((a, b) => a.name.localeCompare(b.name));
  const matchingGroups =
    input.selectedGroupIds.length > 0
      ? activeGroups.filter((group) => input.selectedGroupIds.includes(group.id))
      : activeGroups;
  const houseIdsFromGroups =
    input.selectedGroupIds.length > 0 ? intersectingHouseIdsFromGroups(matchingGroups) : null;

  const filteredHouses = allHouses.filter((house) => {
    const matchesGroup = houseIdsFromGroups === null ? true : houseIdsFromGroups.includes(house.id);
    const matchesHouse =
      input.selectedHouseIds.length === 0 ? true : input.selectedHouseIds.includes(house.id);
    return matchesGroup && matchesHouse;
  });

  const filteredHouseIds = filteredHouses.map((house) => house.id);
  const filteredViolations = input.store.violations.filter(
    (violation) => violation.houseId !== null && filteredHouseIds.includes(violation.houseId),
  );
  const activeViolations = filteredViolations.filter((violation) =>
    ACTIVE_VIOLATION_STATUSES.includes(violation.status),
  );
  const underReviewViolations = filteredViolations.filter(
    (violation) => violation.status === "UNDER_REVIEW",
  );
  const filteredCorrectiveActions = input.store.correctiveActions.filter(
    (action) => action.houseId !== null && filteredHouseIds.includes(action.houseId),
  );
  const openCorrectiveActions = filteredCorrectiveActions.filter((action) =>
    OPEN_CORRECTIVE_ACTION_STATUSES.includes(action.status),
  );
  const filteredReports = input.store.monthlyReports.filter(
    (report) => filteredHouseIds.includes(report.houseId) && report.isCurrentVersion,
  );
  const filteredThreads = input.store.chatThreads.filter(
    (thread) =>
      thread.active && thread.houseId !== null && filteredHouseIds.includes(thread.houseId),
  );
  const filteredManagers = input.store.staffAssignments.filter((assignment) => {
    if (assignment.status !== "ACTIVE") {
      return false;
    }
    if (assignment.role === "OWNER") {
      return true;
    }
    return assignment.assignedHouseIds.some((houseId) => filteredHouseIds.includes(houseId));
  });

  const houseRows: SoberHouseOwnerHouseRow[] = filteredHouses.map((house) => {
    const groupName =
      input.store.houseGroups.find((group) => group.id === house.houseGroupId)?.name ?? "No group";
    return {
      houseId: house.id,
      houseName: house.name,
      groupName,
      status: house.status,
      activeViolations: activeViolations.filter((violation) => violation.houseId === house.id)
        .length,
      underReviewViolations: underReviewViolations.filter(
        (violation) => violation.houseId === house.id,
      ).length,
      correctiveActionsOpen: openCorrectiveActions.filter((action) => action.houseId === house.id)
        .length,
      currentReports: filteredReports.filter((report) => report.houseId === house.id).length,
    };
  });

  const concerns: SoberHouseOwnerConcernRow[] = houseRows
    .filter(
      (row) =>
        row.status === "INACTIVE" ||
        row.activeViolations > 0 ||
        row.underReviewViolations > 0 ||
        row.correctiveActionsOpen > 0,
    )
    .sort(
      (left, right) =>
        right.activeViolations +
        right.correctiveActionsOpen -
        (left.activeViolations + left.correctiveActionsOpen),
    )
    .map((row) => ({
      id: row.houseId,
      title: row.houseName,
      detail:
        row.status === "INACTIVE"
          ? `${row.groupName} • Inactive house`
          : `${row.groupName} • ${row.activeViolations} active violations • ${row.correctiveActionsOpen} open corrective actions`,
      tone:
        row.status === "INACTIVE"
          ? "gray"
          : row.activeViolations > 0
            ? "red"
            : row.correctiveActionsOpen > 0
              ? "yellow"
              : "green",
    }));

  if (concerns.length === 0) {
    concerns.push({
      id: "clear",
      title: "No immediate house concerns",
      detail:
        "The current organization scope has no open violations or corrective-action pressure.",
      tone: "green",
    });
  }

  return {
    organizationName: input.store.organization?.name || "Sober-house organization",
    availableGroups: activeGroups.map((group) => ({ id: group.id, label: group.name })),
    availableHouses: allHouses.map((house) => ({ id: house.id, label: house.name })),
    filteredHouseIds,
    kpis: [
      {
        id: "houses",
        label: "Houses in scope",
        value: String(filteredHouses.length),
        detail: `${filteredHouses.filter((house) => house.status === "ACTIVE").length} active • ${
          filteredHouses.filter((house) => house.status === "INACTIVE").length
        } inactive`,
        tone: filteredHouses.length === 0 ? "gray" : "green",
      },
      {
        id: "violations",
        label: "Active violations",
        value: String(activeViolations.length),
        detail: `${underReviewViolations.length} under review in current scope`,
        tone: toneForCount(activeViolations.length, { green: 0, yellow: 3 }),
      },
      {
        id: "corrective-actions",
        label: "Open corrective actions",
        value: String(openCorrectiveActions.length),
        detail: `${filteredCorrectiveActions.length} total corrective actions in scope`,
        tone: toneForCount(openCorrectiveActions.length, { green: 0, yellow: 4 }),
      },
      {
        id: "reports",
        label: "Current reports",
        value: String(filteredReports.length),
        detail: "Current-version house reports for the selected scope",
        tone: filteredReports.length > 0 ? "green" : "gray",
      },
      {
        id: "managers",
        label: "Managers / staff",
        value: String(filteredManagers.length),
        detail: "Active staff assignments connected to the selected scope",
        tone: filteredManagers.length > 0 ? "green" : "yellow",
      },
      {
        id: "chat",
        label: "Active chat threads",
        value: String(filteredThreads.length),
        detail: "House-linked operational threads across the selected scope",
        tone: filteredThreads.length > 0 ? "green" : "gray",
      },
    ],
    houseRows,
    concerns,
  };
}
