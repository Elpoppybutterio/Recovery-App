import { isChoreCompletionVerified } from "./proof";
import {
  getEffectiveRuleSetForScope,
  getHouseById,
  getHouseChoresForResident,
  getHouseGroupById,
  getHouseMeetingsInRange,
  getResidentHouseMeetingAttendanceRecordsInRange,
  getResidentOneOnOneSessionsInRange,
  getResidentSponsorCallRecordsInRange,
} from "./selectors";
import type {
  ChoreCompletionRecord,
  ChoreFrequency,
  ComplianceStatus,
  HouseMonthlyReportSnapshot,
  ResidentMonthlyReportSnapshot,
  SoberHouseSettingsStore,
  Violation,
  ViolationRuleType,
} from "./types";

export type OperatorComplianceBand = "compliant" | "warning" | "noncompliant" | "critical";
export type OperatorTrend = "improving" | "stable" | "worsening";
export type OperatorResidentFilter =
  | "all"
  | "compliant"
  | "warning"
  | "noncompliant"
  | "critical"
  | "overdue-chores"
  | "curfew-issues"
  | "meeting-noncompliance"
  | "overdue-one-on-ones";

export type OperatorReportMetric = {
  label: string;
  value: string;
  detail: string;
  tracked: boolean;
};

export type OperatorTrendPoint = {
  key: string;
  label: string;
  count: number;
};

export type OperatorResidentReport = {
  residentId: string;
  linkedUserId: string | null;
  displayName: string;
  houseId: string | null;
  houseName: string;
  houseGroupName: string;
  complianceBand: OperatorComplianceBand;
  complianceScore: number;
  trend: OperatorTrend;
  currentComplianceStatus: ComplianceStatus;
  statusReasons: string[];
  meetingsRequired: number | null;
  meetingsCompleted: number | null;
  meetingsTracked: boolean;
  choresAssigned: number;
  choresCompleted: number;
  overdueChores: number;
  curfewMissesThisWeek: number;
  oneOnOnesDue: number | null;
  oneOnOnesCompleted: number | null;
  oneOnOnesTracked: boolean;
  sponsorCallsDue: number | null;
  sponsorCallsCompleted: number | null;
  sponsorCallsTracked: boolean;
  workRequired: boolean;
  workVerifiedThisWeek: boolean | null;
  workTracked: boolean;
  jobApplicationsDue: number | null;
  jobApplicationsCompleted: number | null;
  jobApplicationsTracked: boolean;
  houseMeetingsDue: number;
  houseMeetingsCompleted: number;
  activeViolations: number;
  openViolations: number;
  missingProofCount: number;
  unresolvedIncidents: number;
  hasCurfewIssues: boolean;
  hasMeetingNoncompliance: boolean;
  hasOverdueOneOnOnes: boolean;
};

export type OperatorHouseReport = {
  houseId: string;
  houseName: string;
  groupName: string;
  bedCount: number;
  occupiedBeds: number;
  rosterCount: number;
  compliancePercent: number | null;
  compliantResidents: number;
  warningResidents: number;
  noncompliantResidents: number;
  criticalResidents: number;
  missedChoresToday: number;
  curfewMissesThisWeek: number;
  meetingsCompleted: number | null;
  meetingsRequired: number | null;
  meetingAdherencePercent: number | null;
  oneOnOnesDue: number | null;
  oneOnOnesCompleted: number | null;
  oneOnOnesTracked: boolean;
  sponsorCallAdherencePercent: number | null;
  sponsorCallsTracked: boolean;
  workCompliancePercent: number | null;
  workTracked: boolean;
  violationsByCategory: Partial<Record<ViolationRuleType, number>>;
  unresolvedActionItems: number;
  openViolations: number;
  residents: OperatorResidentReport[];
};

export type OperatorOrganizationReport = {
  organizationName: string;
  totalHouses: number;
  occupiedBeds: number;
  totalResidents: number;
  compliantResidentsCount: number;
  warningResidentsCount: number;
  noncompliantResidentsCount: number;
  criticalResidentsCount: number;
  openViolationsIncidents: number;
  missedChoresToday: number;
  curfewMissesThisWeek: number;
  meetingAdherencePercent: number | null;
  oneOnOneCompletionPercent: number | null;
  oneOnOneTracked: boolean;
  sponsorCallAdherencePercent: number | null;
  sponsorTracked: boolean;
  workCompliancePercent: number | null;
  workTracked: boolean;
  highestRiskHouses: Array<{
    houseId: string;
    houseName: string;
    detail: string;
    complianceBand: OperatorComplianceBand;
  }>;
  highestRiskResidents: Array<{
    residentId: string;
    residentName: string;
    houseId: string | null;
    houseName: string;
    detail: string;
    complianceBand: OperatorComplianceBand;
  }>;
  housesByCompliance: Array<{
    houseId: string;
    houseName: string;
    compliancePercent: number | null;
    detail: string;
  }>;
  recentViolationsTrend: OperatorTrendPoint[];
  recentCurfewTrend: OperatorTrendPoint[];
  recentMissedChoreTrend: OperatorTrendPoint[];
};

export type SoberHouseOperatorReportingSummary = {
  organization: OperatorOrganizationReport;
  houses: OperatorHouseReport[];
  residents: OperatorResidentReport[];
};

type Input = {
  store: SoberHouseSettingsStore;
  nowIso: string;
};

type ResidentRequirementSnapshot = {
  meetingsRequired: number | null;
  workRequired: boolean;
  currentlyEmployed: boolean;
  jobApplicationsDue: number | null;
  oneOnOneRequired: boolean;
  sponsorCallsDue: number | null;
};

const OPEN_VIOLATION_STATUSES = new Set(["OPEN", "UNDER_REVIEW", "CORRECTIVE_ACTION_ASSIGNED"]);
const CRITICAL_VIOLATION_STATUSES = new Set(["OPEN", "CORRECTIVE_ACTION_ASSIGNED"]);

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date): Date {
  const next = startOfDay(date);
  const daysSinceMonday = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - daysSinceMonday);
  return next;
}

function endOfWeekExclusive(date: Date): Date {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 7);
  return next;
}

function formatDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function enumerateRecentDays(now: Date, days: number): Date[] {
  return Array.from({ length: days }, (_, index) => {
    const day = startOfDay(now);
    day.setDate(day.getDate() - (days - 1 - index));
    return day;
  });
}

function getBiweeklyBounds(date: Date, moveInDate: string | null): { start: Date; end: Date } {
  const weekStart = startOfWeek(date);
  const moveIn = moveInDate ? new Date(moveInDate) : null;
  if (moveIn && !Number.isNaN(moveIn.getTime())) {
    const anchor = startOfWeek(moveIn);
    const diffWeeks = Math.floor(
      (weekStart.getTime() - anchor.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
    const offsetWeeks = diffWeeks % 2 === 0 ? 0 : -1;
    const start = new Date(weekStart);
    start.setDate(start.getDate() + offsetWeeks * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    return { start, end };
  }

  const epoch = new Date(2026, 0, 5, 0, 0, 0, 0);
  const diffWeeks = Math.floor((weekStart.getTime() - epoch.getTime()) / (7 * 24 * 60 * 60 * 1000));
  const offsetWeeks = diffWeeks % 2 === 0 ? 0 : -1;
  const start = new Date(weekStart);
  start.setDate(start.getDate() + offsetWeeks * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 14);
  return { start, end };
}

function getChorePeriodBounds(
  date: Date,
  frequency: ChoreFrequency,
  moveInDate: string | null,
): { start: Date; endExclusive: Date; dueBaseDate: Date } {
  if (frequency === "DAILY") {
    const start = startOfDay(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, endExclusive: end, dueBaseDate: start };
  }
  if (frequency === "WEEKLY") {
    const start = startOfWeek(date);
    const end = endOfWeekExclusive(date);
    const dueBaseDate = new Date(end);
    dueBaseDate.setDate(dueBaseDate.getDate() - 1);
    return { start, endExclusive: end, dueBaseDate };
  }
  if (frequency === "BIWEEKLY") {
    const bounds = getBiweeklyBounds(date, moveInDate);
    const dueBaseDate = new Date(bounds.end);
    dueBaseDate.setDate(dueBaseDate.getDate() - 1);
    return { start: bounds.start, endExclusive: bounds.end, dueBaseDate };
  }

  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
  const dueBaseDate = new Date(end);
  dueBaseDate.setDate(dueBaseDate.getDate() - 1);
  return { start, endExclusive: end, dueBaseDate };
}

function buildPercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 100);
}

function averagePercent(values: Array<number | null>): number | null {
  const tracked = values.filter((value): value is number => value !== null);
  if (tracked.length === 0) {
    return null;
  }
  return Math.round(tracked.reduce((total, value) => total + value, 0) / tracked.length);
}

function trendLabel(current: number, previous: number): OperatorTrend {
  if (current >= previous + 2) {
    return "worsening";
  }
  if (current + 2 <= previous) {
    return "improving";
  }
  return "stable";
}

function complianceBandFromScore(score: number, hasCriticalIssue: boolean): OperatorComplianceBand {
  if (hasCriticalIssue || score <= 24) {
    return "critical";
  }
  if (score <= 59) {
    return "noncompliant";
  }
  if (score <= 84) {
    return "warning";
  }
  return "compliant";
}

function displayBandLabel(band: OperatorComplianceBand): string {
  if (band === "noncompliant") {
    return "Noncompliant";
  }
  return band.charAt(0).toUpperCase() + band.slice(1);
}

function groupViolationsByRuleType(
  violations: Violation[],
): Partial<Record<ViolationRuleType, number>> {
  return violations.reduce<Partial<Record<ViolationRuleType, number>>>((accumulator, violation) => {
    accumulator[violation.ruleType] = (accumulator[violation.ruleType] ?? 0) + 1;
    return accumulator;
  }, {});
}

function currentHouseReports(
  store: SoberHouseSettingsStore,
): Map<string, HouseMonthlyReportSnapshot> {
  const byHouse = new Map<string, HouseMonthlyReportSnapshot>();
  for (const report of store.monthlyReports) {
    if (report.type !== "HOUSE_MONTHLY" || !report.isCurrentVersion) {
      continue;
    }
    byHouse.set(report.houseId, report.summaryPayload as HouseMonthlyReportSnapshot);
  }
  return byHouse;
}

function currentResidentReports(
  store: SoberHouseSettingsStore,
): Map<string, ResidentMonthlyReportSnapshot> {
  const byResident = new Map<string, ResidentMonthlyReportSnapshot>();
  for (const report of store.monthlyReports) {
    if (report.type !== "RESIDENT_MONTHLY" || !report.isCurrentVersion || !report.residentId) {
      continue;
    }
    byResident.set(report.residentId, report.summaryPayload as ResidentMonthlyReportSnapshot);
  }
  return byResident;
}

function resolveResidentName(
  store: SoberHouseSettingsStore,
  residentId: string,
  linkedUserId: string | null,
  residentReports: Map<string, ResidentMonthlyReportSnapshot>,
): string {
  if (store.residentHousingProfile?.residentId === residentId) {
    const explicit =
      `${store.residentHousingProfile.firstName} ${store.residentHousingProfile.lastName}`.trim();
    if (explicit.length > 0) {
      return explicit;
    }
  }

  const reportName = residentReports.get(residentId)?.resident.residentName ?? "";
  if (reportName.trim().length > 0) {
    return reportName;
  }

  if (linkedUserId) {
    const normalized = linkedUserId.trim();
    if (/[a-zA-Z]/.test(normalized)) {
      return normalized
        .split(/[-_\s]+/)
        .filter((segment) => segment.length > 0)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ");
    }
    return `Resident ${linkedUserId.slice(-4).toUpperCase()}`;
  }
  return `Resident ${residentId.slice(-4).toUpperCase()}`;
}

function resolveResidentRequirements(
  store: SoberHouseSettingsStore,
  residentId: string,
  houseId: string | null,
  nowIso: string,
): ResidentRequirementSnapshot {
  const houseRules =
    houseId !== null ? getEffectiveRuleSetForScope(store, "HOUSE", houseId, nowIso).ruleSet : null;
  const profile =
    store.residentRequirementProfile?.residentId === residentId
      ? store.residentRequirementProfile
      : null;

  return {
    meetingsRequired:
      profile?.meetingsRequiredWeekly === false
        ? 0
        : (profile?.meetingsRequiredCount ??
          (houseRules?.meetings.meetingsRequired ? houseRules.meetings.meetingsPerWeek : 0)),
    workRequired: profile?.workRequired ?? houseRules?.employment.employmentRequired ?? false,
    currentlyEmployed: profile?.currentlyEmployed ?? false,
    jobApplicationsDue:
      profile?.currentlyEmployed === true
        ? 0
        : (profile?.jobApplicationsRequiredPerWeek ??
          houseRules?.jobSearch.applicationsRequiredPerWeek ??
          0),
    oneOnOneRequired:
      profile?.oneOnOneRequired ??
      (houseRules?.operations.oneOnOneSessionsEnabled === true &&
        houseRules.operations.oneOnOneSessionsRequired === true),
    sponsorCallsDue:
      houseRules?.sponsorContact.enabled === true
        ? houseRules.sponsorContact.contactsRequiredPerWeek
        : 0,
  };
}

function recordHasProofIssue(record: ChoreCompletionRecord): boolean {
  return record.proofRequirement.length > 0 && !isChoreCompletionVerified(record);
}

function isSatisfiedEventStatus(status: "SCHEDULED" | "COMPLETED" | "MISSED" | "EXCUSED"): boolean {
  return status === "COMPLETED" || status === "EXCUSED";
}

function isOverdueEventStatus(status: "SCHEDULED" | "COMPLETED" | "MISSED" | "EXCUSED"): boolean {
  return status === "MISSED";
}

function countRecentViolations(
  violations: Violation[],
  now: Date,
  daysBackStart: number,
  daysBackEnd: number,
): number {
  const rangeEnd = startOfDay(now);
  rangeEnd.setDate(rangeEnd.getDate() - daysBackEnd);
  const rangeStart = startOfDay(now);
  rangeStart.setDate(rangeStart.getDate() - daysBackStart);
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  return violations.filter((violation) => {
    const at = toTimestamp(violation.triggeredAt);
    return at !== null && at >= startMs && at < endMs;
  }).length;
}

function countViolationsByDay(
  violations: Violation[],
  now: Date,
  days: number,
  ruleType?: ViolationRuleType,
): OperatorTrendPoint[] {
  return enumerateRecentDays(now, days).map((day) => {
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    const startMs = day.getTime();
    const endMs = nextDay.getTime();
    return {
      key: formatDayKey(day),
      label: `${day.getMonth() + 1}/${day.getDate()}`,
      count: violations.filter((violation) => {
        if (ruleType && violation.ruleType !== ruleType) {
          return false;
        }
        const at = toTimestamp(violation.triggeredAt);
        return at !== null && at >= startMs && at < endMs;
      }).length,
    };
  });
}

export function buildSoberHouseOperatorReportingSummary({
  store,
  nowIso,
}: Input): SoberHouseOperatorReportingSummary {
  const now = new Date(nowIso);
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeekExclusive(now);
  const houseReports = currentHouseReports(store);
  const residentReports = currentResidentReports(store);
  const memberships = store.residentHouseMemberships.filter(
    (membership) => membership.status === "ACTIVE" && membership.moveOutDate === null,
  );

  const residents = memberships.map((membership) => {
    const house = membership.houseId ? getHouseById(store, membership.houseId) : null;
    const group = house?.houseGroupId ? getHouseGroupById(store, house.houseGroupId) : null;
    const residentId = membership.residentId;
    const linkedUserId = membership.linkedUserId ?? null;
    const houseId = membership.houseId ?? null;
    const displayName = resolveResidentName(store, residentId, linkedUserId, residentReports);
    const requirements = resolveResidentRequirements(store, residentId, houseId, nowIso);
    const residentViolations = store.violations.filter(
      (violation) => violation.residentId === residentId,
    );
    const openViolations = residentViolations.filter((violation) =>
      OPEN_VIOLATION_STATUSES.has(violation.status),
    );
    const activeViolations = openViolations.length;
    const unresolvedIncidents = activeViolations;
    const criticalIssue = openViolations.some(
      (violation) =>
        violation.severity === "CRITICAL" && CRITICAL_VIOLATION_STATUSES.has(violation.status),
    );

    const currentResidentReport = residentReports.get(residentId) ?? null;
    const meetingsRequired =
      currentResidentReport?.complianceSummary.meetings.requiredCount ??
      requirements.meetingsRequired;
    const meetingsCompleted =
      currentResidentReport?.complianceSummary.meetings.completedCount ?? null;
    const meetingsTracked = meetingsRequired !== null && meetingsCompleted !== null;
    const sponsorCallsDue =
      currentResidentReport?.complianceSummary.sponsorContact.requiredContacts ??
      requirements.sponsorCallsDue ??
      0;
    const sponsorCallRecords = getResidentSponsorCallRecordsInRange(
      store,
      residentId,
      weekStart.toISOString(),
      weekEnd.toISOString(),
    );
    const sponsorCallsCompleted =
      sponsorCallsDue > 0
        ? sponsorCallRecords.filter((record) => isSatisfiedEventStatus(record.status)).length
        : 0;
    const sponsorCallsTracked = sponsorCallsDue > 0 && sponsorCallRecords.length > 0;
    const sponsorCallsOverdue =
      sponsorCallsDue > 0 &&
      (sponsorCallsCompleted < sponsorCallsDue ||
        sponsorCallRecords.some((record) => isOverdueEventStatus(record.status)));

    const chores = getHouseChoresForResident(store, residentId, houseId);
    const requiredChores = chores.filter((chore) => chore.required);
    const choreSummary = requiredChores.reduce(
      (accumulator, chore) => {
        const bounds = getChorePeriodBounds(now, chore.frequency, membership.moveInDate || null);
        const periodStartMs = bounds.start.getTime();
        const periodEndMs = bounds.endExclusive.getTime();
        const dueAt = new Date(bounds.dueBaseDate);
        const [hours, minutes] = chore.dueTimeLocalHhmm.split(":").map(Number);
        dueAt.setHours(
          Number.isFinite(hours) ? hours : 18,
          Number.isFinite(minutes) ? minutes : 0,
          0,
          0,
        );

        const completion = store.choreCompletionRecords
          .filter((record) => record.residentId === residentId)
          .filter((record) => (chore.id ? record.houseChoreId === chore.id : true))
          .find((record) => {
            const at = toTimestamp(record.completedAt);
            return at !== null && at >= periodStartMs && at < periodEndMs;
          });
        const verified = completion ? isChoreCompletionVerified(completion) : false;
        const overdue = dueAt.getTime() <= now.getTime() && !verified;
        return {
          assigned: accumulator.assigned + 1,
          completed: accumulator.completed + (verified ? 1 : 0),
          overdue: accumulator.overdue + (overdue ? 1 : 0),
          proofIssues:
            accumulator.proofIssues +
            (completion && recordHasProofIssue(completion)
              ? 1
              : overdue && chore.proofRequirement.length > 0
                ? 1
                : 0),
        };
      },
      { assigned: 0, completed: 0, overdue: 0, proofIssues: 0 },
    );

    const residentJobApplications = store.jobApplicationRecords.filter(
      (record) =>
        record.residentId === residentId &&
        (() => {
          const at = toTimestamp(record.appliedAt);
          return at !== null && at >= weekStart.getTime() && at < weekEnd.getTime();
        })(),
    );
    const residentWorkVerifications = store.workVerificationRecords.filter(
      (record) =>
        record.residentId === residentId &&
        (() => {
          const at = toTimestamp(record.verifiedAt);
          return at !== null && at >= weekStart.getTime() && at < weekEnd.getTime();
        })(),
    );

    const houseMeetings = getHouseMeetingsInRange(
      store,
      houseId,
      weekStart.toISOString(),
      weekEnd.toISOString(),
    ).filter((meeting) => meeting.required);
    const houseMeetingAttendanceRecords = getResidentHouseMeetingAttendanceRecordsInRange(
      store,
      residentId,
      weekStart.toISOString(),
      weekEnd.toISOString(),
    );
    const houseMeetingsCompleted = houseMeetingAttendanceRecords.filter((record) =>
      isSatisfiedEventStatus(record.status),
    ).length;

    const oneOnOnesThisWeek = getResidentOneOnOneSessionsInRange(
      store,
      residentId,
      weekStart.toISOString(),
      weekEnd.toISOString(),
    );
    const oneOnOnesDue =
      oneOnOnesThisWeek.length > 0
        ? oneOnOnesThisWeek.length
        : requirements.oneOnOneRequired
          ? 1
          : 0;
    const oneOnOnesCompleted = oneOnOnesThisWeek.filter((session) =>
      isSatisfiedEventStatus(session.completionStatus),
    ).length;
    const oneOnOnesTracked = oneOnOnesThisWeek.length > 0;
    const overdueOneOnOnes =
      oneOnOnesDue > 0 &&
      (oneOnOnesThisWeek.length === 0 ||
        oneOnOnesThisWeek.some((session) => {
          const scheduledAt = toTimestamp(session.scheduledAt);
          return (
            scheduledAt !== null &&
            scheduledAt < now.getTime() &&
            !isSatisfiedEventStatus(session.completionStatus)
          );
        }));

    const curfewMissesThisWeek = residentViolations.filter(
      (violation) =>
        violation.ruleType === "curfew" &&
        (() => {
          const at = toTimestamp(violation.triggeredAt);
          return at !== null && at >= weekStart.getTime() && at < weekEnd.getTime();
        })(),
    ).length;

    const jobApplicationsDue = requirements.jobApplicationsDue;
    const jobApplicationsCompleted = residentJobApplications.length;
    const workVerifiedThisWeek = requirements.workRequired
      ? requirements.currentlyEmployed
        ? residentWorkVerifications.length > 0
        : residentJobApplications.length >= (jobApplicationsDue ?? 0)
      : null;

    const missingProofCount =
      choreSummary.proofIssues +
      residentJobApplications.filter((record) => !record.proofProvided).length +
      sponsorCallRecords.filter((record) => record.proofRequired && !record.proofProvided).length +
      houseMeetingAttendanceRecords.filter(
        (record) =>
          isSatisfiedEventStatus(record.status) && record.proofRequired && !record.proofProvided,
      ).length +
      openViolations.filter((violation) => violation.evidenceItemIds.length === 0).length;

    const currentIssueCount =
      activeViolations +
      choreSummary.overdue +
      curfewMissesThisWeek +
      missingProofCount +
      (overdueOneOnOnes ? 1 : 0) +
      (sponsorCallsOverdue ? 1 : 0);
    const previousIssueCount =
      countRecentViolations(residentViolations, now, 14, 7) +
      residentViolations.filter((violation) => violation.ruleType === "chores").length;

    let score = 100;
    score -= openViolations.filter((violation) => violation.severity === "CRITICAL").length * 40;
    score -= openViolations.filter((violation) => violation.severity === "VIOLATION").length * 28;
    score -= openViolations.filter((violation) => violation.severity === "WARNING").length * 16;
    score -= choreSummary.overdue * 12;
    score -= curfewMissesThisWeek * 15;
    score -= missingProofCount * 10;
    if (meetingsTracked && (meetingsCompleted ?? 0) < (meetingsRequired ?? 0)) {
      score -= 15;
    }
    if (requirements.workRequired && workVerifiedThisWeek === false) {
      score -= 12;
    }
    if ((jobApplicationsDue ?? 0) > 0 && jobApplicationsCompleted < (jobApplicationsDue ?? 0)) {
      score -= 12;
    }
    if (overdueOneOnOnes) {
      score -= 10;
    }
    if (sponsorCallsTracked && sponsorCallsOverdue) {
      score -= 10;
    }
    score = Math.max(0, score);

    const statusReasons: string[] = [];
    if (openViolations.length > 0) {
      statusReasons.push(
        `${openViolations.length} open violation${openViolations.length === 1 ? "" : "s"}`,
      );
    }
    if (choreSummary.overdue > 0) {
      statusReasons.push(
        `${choreSummary.overdue} overdue chore${choreSummary.overdue === 1 ? "" : "s"}`,
      );
    }
    if (curfewMissesThisWeek > 0) {
      statusReasons.push(
        `${curfewMissesThisWeek} curfew miss${curfewMissesThisWeek === 1 ? "" : "es"} this week`,
      );
    }
    if ((jobApplicationsDue ?? 0) > 0 && jobApplicationsCompleted < (jobApplicationsDue ?? 0)) {
      statusReasons.push("job-search requirement behind");
    }
    if (requirements.workRequired && workVerifiedThisWeek === false) {
      statusReasons.push("work accountability not verified");
    }
    if (missingProofCount > 0) {
      statusReasons.push(
        `${missingProofCount} item${missingProofCount === 1 ? "" : "s"} missing proof`,
      );
    }
    if (overdueOneOnOnes) {
      statusReasons.push("one-on-one not scheduled this week");
    }
    if (sponsorCallsTracked && sponsorCallsOverdue) {
      statusReasons.push("sponsor-call requirement behind");
    }
    if (statusReasons.length === 0) {
      statusReasons.push("All tracked requirements are currently satisfied.");
    }

    const complianceBand = complianceBandFromScore(score, criticalIssue);
    const currentComplianceStatus: ComplianceStatus =
      complianceBand === "critical" || complianceBand === "noncompliant"
        ? "violation"
        : complianceBand === "warning"
          ? "at_risk"
          : "compliant";

    return {
      residentId,
      linkedUserId,
      displayName,
      houseId,
      houseName: house?.name ?? "Unassigned house",
      houseGroupName: group?.name ?? "No group",
      complianceBand,
      complianceScore: score,
      trend: trendLabel(currentIssueCount, previousIssueCount),
      currentComplianceStatus,
      statusReasons,
      meetingsRequired,
      meetingsCompleted,
      meetingsTracked,
      choresAssigned: choreSummary.assigned,
      choresCompleted: choreSummary.completed,
      overdueChores: choreSummary.overdue,
      curfewMissesThisWeek,
      oneOnOnesDue,
      oneOnOnesCompleted,
      oneOnOnesTracked,
      sponsorCallsDue,
      sponsorCallsCompleted,
      sponsorCallsTracked,
      workRequired: requirements.workRequired,
      workVerifiedThisWeek,
      workTracked: requirements.workRequired,
      jobApplicationsDue,
      jobApplicationsCompleted,
      jobApplicationsTracked: requirements.workRequired && !requirements.currentlyEmployed,
      houseMeetingsDue: houseMeetings.length,
      houseMeetingsCompleted,
      activeViolations,
      openViolations: activeViolations,
      missingProofCount,
      unresolvedIncidents,
      hasCurfewIssues: curfewMissesThisWeek > 0,
      hasMeetingNoncompliance:
        meetingsTracked && (meetingsCompleted ?? 0) < (meetingsRequired ?? 0),
      hasOverdueOneOnOnes: overdueOneOnOnes,
    } satisfies OperatorResidentReport;
  });

  const houses = store.houses
    .filter((house) => house.status === "ACTIVE")
    .map((house) => {
      const groupName = house.houseGroupId
        ? (getHouseGroupById(store, house.houseGroupId)?.name ?? "No group")
        : "No group";
      const houseResidents = residents.filter((resident) => resident.houseId === house.id);
      const compliantResidents = houseResidents.filter(
        (resident) => resident.complianceBand === "compliant",
      ).length;
      const warningResidents = houseResidents.filter(
        (resident) => resident.complianceBand === "warning",
      ).length;
      const noncompliantResidents = houseResidents.filter(
        (resident) => resident.complianceBand === "noncompliant",
      ).length;
      const criticalResidents = houseResidents.filter(
        (resident) => resident.complianceBand === "critical",
      ).length;
      const houseViolations = store.violations.filter(
        (violation) => violation.houseId === house.id,
      );
      const currentReport = houseReports.get(house.id) ?? null;
      const occupiedBeds = memberships.filter(
        (membership) => membership.houseId === house.id,
      ).length;
      const trackedSponsorResidents = houseResidents.filter(
        (resident) => resident.sponsorCallsTracked,
      );
      const meetingAdherencePercent =
        currentReport?.kpis.meetingComplianceRate.value !== null &&
        currentReport?.kpis.meetingComplianceRate.value !== undefined
          ? Math.round(currentReport.kpis.meetingComplianceRate.value * 100)
          : null;
      const workCompliancePercent =
        currentReport?.kpis.jobSearchCompletionRate.value !== null &&
        currentReport?.kpis.jobSearchCompletionRate.value !== undefined
          ? Math.round(currentReport.kpis.jobSearchCompletionRate.value * 100)
          : currentReport?.kpis.employmentComplianceRate.value !== null &&
              currentReport?.kpis.employmentComplianceRate.value !== undefined
            ? Math.round(currentReport.kpis.employmentComplianceRate.value * 100)
            : null;

      return {
        houseId: house.id,
        houseName: house.name,
        groupName,
        bedCount: house.bedCount,
        occupiedBeds,
        rosterCount: houseResidents.length,
        compliancePercent: houseResidents.length
          ? Math.round(
              houseResidents.reduce((total, resident) => total + resident.complianceScore, 0) /
                houseResidents.length,
            )
          : null,
        compliantResidents,
        warningResidents,
        noncompliantResidents,
        criticalResidents,
        missedChoresToday: houseResidents.reduce(
          (total, resident) => total + resident.overdueChores,
          0,
        ),
        curfewMissesThisWeek: houseResidents.reduce(
          (total, resident) => total + resident.curfewMissesThisWeek,
          0,
        ),
        meetingsCompleted: currentReport?.kpis.meetingComplianceRate.numerator ?? null,
        meetingsRequired: currentReport?.kpis.meetingComplianceRate.denominator ?? null,
        meetingAdherencePercent,
        oneOnOnesDue: houseResidents.reduce(
          (total, resident) => total + (resident.oneOnOnesDue ?? 0),
          0,
        ),
        oneOnOnesCompleted: houseResidents.reduce(
          (total, resident) => total + (resident.oneOnOnesCompleted ?? 0),
          0,
        ),
        oneOnOnesTracked: houseResidents.some((resident) => resident.oneOnOnesTracked),
        sponsorCallAdherencePercent: buildPercent(
          trackedSponsorResidents.reduce(
            (total, resident) => total + (resident.sponsorCallsCompleted ?? 0),
            0,
          ),
          trackedSponsorResidents.reduce(
            (total, resident) => total + (resident.sponsorCallsDue ?? 0),
            0,
          ),
        ),
        sponsorCallsTracked: houseResidents.some((resident) => resident.sponsorCallsTracked),
        workCompliancePercent,
        workTracked: workCompliancePercent !== null,
        violationsByCategory: groupViolationsByRuleType(houseViolations),
        unresolvedActionItems: store.correctiveActions.filter(
          (action) =>
            action.houseId === house.id &&
            (action.status === "OPEN" || action.status === "OVERDUE"),
        ).length,
        openViolations: houseViolations.filter((violation) =>
          OPEN_VIOLATION_STATUSES.has(violation.status),
        ).length,
        residents: houseResidents,
      } satisfies OperatorHouseReport;
    })
    .sort((left, right) => left.houseName.localeCompare(right.houseName));

  const allViolations = store.violations;
  const organization: OperatorOrganizationReport = {
    organizationName: store.organization?.name ?? "Sober-house organization",
    totalHouses: houses.length,
    occupiedBeds: houses.reduce((total, house) => total + house.occupiedBeds, 0),
    totalResidents: residents.length,
    compliantResidentsCount: residents.filter((resident) => resident.complianceBand === "compliant")
      .length,
    warningResidentsCount: residents.filter((resident) => resident.complianceBand === "warning")
      .length,
    noncompliantResidentsCount: residents.filter(
      (resident) => resident.complianceBand === "noncompliant",
    ).length,
    criticalResidentsCount: residents.filter((resident) => resident.complianceBand === "critical")
      .length,
    openViolationsIncidents: allViolations.filter((violation) =>
      OPEN_VIOLATION_STATUSES.has(violation.status),
    ).length,
    missedChoresToday: residents.reduce((total, resident) => total + resident.overdueChores, 0),
    curfewMissesThisWeek: residents.reduce(
      (total, resident) => total + resident.curfewMissesThisWeek,
      0,
    ),
    meetingAdherencePercent: averagePercent(houses.map((house) => house.meetingAdherencePercent)),
    oneOnOneCompletionPercent: buildPercent(
      residents
        .filter((resident) => resident.oneOnOnesTracked)
        .reduce((total, resident) => total + (resident.oneOnOnesCompleted ?? 0), 0),
      residents
        .filter((resident) => resident.oneOnOnesTracked)
        .reduce((total, resident) => total + (resident.oneOnOnesDue ?? 0), 0),
    ),
    oneOnOneTracked: houses.some((house) => house.oneOnOnesTracked),
    sponsorCallAdherencePercent: averagePercent(
      houses
        .filter((house) => house.sponsorCallsTracked)
        .map((house) => house.sponsorCallAdherencePercent),
    ),
    sponsorTracked: houses.some((house) => house.sponsorCallsTracked),
    workCompliancePercent: averagePercent(houses.map((house) => house.workCompliancePercent)),
    workTracked: houses.some((house) => house.workTracked),
    highestRiskHouses: [...houses]
      .sort((left, right) => {
        const rightScore =
          right.criticalResidents * 4 +
          right.noncompliantResidents * 3 +
          right.warningResidents * 2 +
          right.openViolations;
        const leftScore =
          left.criticalResidents * 4 +
          left.noncompliantResidents * 3 +
          left.warningResidents * 2 +
          left.openViolations;
        return rightScore - leftScore;
      })
      .slice(0, 5)
      .map((house) => ({
        houseId: house.houseId,
        houseName: house.houseName,
        detail: `${house.criticalResidents} critical • ${house.noncompliantResidents} noncompliant • ${house.openViolations} open violations`,
        complianceBand:
          house.criticalResidents > 0
            ? "critical"
            : house.noncompliantResidents > 0
              ? "noncompliant"
              : house.warningResidents > 0
                ? "warning"
                : "compliant",
      })),
    highestRiskResidents: [...residents]
      .sort((left, right) => left.complianceScore - right.complianceScore)
      .slice(0, 8)
      .map((resident) => ({
        residentId: resident.residentId,
        residentName: resident.displayName,
        houseId: resident.houseId,
        houseName: resident.houseName,
        detail:
          resident.statusReasons[0] ?? `${displayBandLabel(resident.complianceBand)} resident`,
        complianceBand: resident.complianceBand,
      })),
    housesByCompliance: [...houses]
      .sort((left, right) => (right.compliancePercent ?? -1) - (left.compliancePercent ?? -1))
      .map((house) => ({
        houseId: house.houseId,
        houseName: house.houseName,
        compliancePercent: house.compliancePercent,
        detail: `${house.compliantResidents} compliant • ${house.warningResidents} warning • ${house.noncompliantResidents + house.criticalResidents} off-track`,
      })),
    recentViolationsTrend: countViolationsByDay(allViolations, now, 7),
    recentCurfewTrend: countViolationsByDay(allViolations, now, 7, "curfew"),
    recentMissedChoreTrend: countViolationsByDay(allViolations, now, 7, "chores"),
  };

  return {
    organization,
    houses,
    residents: [...residents].sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    ),
  };
}

export function residentMatchesOperatorFilter(
  resident: OperatorResidentReport,
  filter: OperatorResidentFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "compliant":
    case "warning":
    case "noncompliant":
    case "critical":
      return resident.complianceBand === filter;
    case "overdue-chores":
      return resident.overdueChores > 0;
    case "curfew-issues":
      return resident.hasCurfewIssues;
    case "meeting-noncompliance":
      return resident.hasMeetingNoncompliance;
    case "overdue-one-on-ones":
      return resident.hasOverdueOneOnOnes;
    default:
      return true;
  }
}

export function buildOperatorMetricCards(
  organization: OperatorOrganizationReport,
): OperatorReportMetric[] {
  return [
    {
      label: "Total houses",
      value: String(organization.totalHouses),
      detail: `${organization.occupiedBeds} occupied beds`,
      tracked: true,
    },
    {
      label: "Residents",
      value: String(organization.totalResidents),
      detail: `${organization.compliantResidentsCount} compliant • ${organization.warningResidentsCount} warning`,
      tracked: true,
    },
    {
      label: "Open violations",
      value: String(organization.openViolationsIncidents),
      detail: `${organization.criticalResidentsCount} critical residents`,
      tracked: true,
    },
    {
      label: "Missed chores today",
      value: String(organization.missedChoresToday),
      detail: `${organization.curfewMissesThisWeek} curfew misses this week`,
      tracked: true,
    },
    {
      label: "Meeting adherence",
      value:
        organization.meetingAdherencePercent === null
          ? "N/A"
          : `${organization.meetingAdherencePercent}%`,
      detail:
        organization.meetingAdherencePercent === null
          ? "No current meeting report data in scope."
          : "Current house-report meeting adherence.",
      tracked: organization.meetingAdherencePercent !== null,
    },
    {
      label: "One-on-ones",
      value:
        organization.oneOnOneCompletionPercent === null
          ? "N/A"
          : `${organization.oneOnOneCompletionPercent}%`,
      detail: organization.oneOnOneTracked
        ? "Tracked one-on-one completion."
        : "No explicit one-on-one completions logged in scope yet.",
      tracked: organization.oneOnOneTracked,
    },
    {
      label: "Sponsor calls",
      value:
        organization.sponsorCallAdherencePercent === null
          ? "N/A"
          : `${organization.sponsorCallAdherencePercent}%`,
      detail: organization.sponsorTracked
        ? "Sponsor-call adherence in current scope."
        : "No explicit sponsor-call completions logged in scope yet.",
      tracked: organization.sponsorTracked,
    },
    {
      label: "Work / job search",
      value:
        organization.workCompliancePercent === null
          ? "N/A"
          : `${organization.workCompliancePercent}%`,
      detail: organization.workTracked
        ? "Current work and job-search adherence."
        : "No current work/job-search reports in scope.",
      tracked: organization.workTracked,
    },
  ];
}
