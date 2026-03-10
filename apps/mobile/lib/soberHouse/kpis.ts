import type { AttendanceRecordSummary, MeetingAttendanceLogRecord } from "../attendance/storage";
import { getHouseById, getRuleSetForHouse } from "./selectors";
import {
  buildMonthlyWindow,
  clampStartToWindow,
  enumerateMonthDays,
  enumerateMonthWeeks,
  isTimestampInWindow,
  toTimestamp,
  type MonthlyWeekWindow,
  type MonthlyWindow,
} from "./monthlyWindow";
import type {
  ChoreFrequency,
  ChatMessage,
  ChoreCompletionRecord,
  CorrectiveAction,
  House,
  ReportMetricValue,
  SoberHouseSettingsStore,
  Violation,
  ViolationRuleType,
} from "./types";

type WeekResult = {
  key: string;
  required: number;
  completed: number;
  met: boolean;
};

type CurfewDayResult = {
  key: string;
  hadViolation: boolean;
};

type ChorePeriodResult = {
  key: string;
  complete: boolean;
};

type AcknowledgmentMessageResult = {
  messageId: string;
  createdAt: string;
  acknowledgedAt: string | null;
};

export type ResidentMonthlyKpiComputation = {
  window: MonthlyWindow;
  residentId: string;
  residentName: string;
  moveInDate: string | null;
  programPhaseOnEntry: string | null;
  house: House | null;
  curfewDayResults: CurfewDayResult[];
  chorePeriodResults: ChorePeriodResult[];
  meetingWeekResults: WeekResult[];
  workWeekResults: WeekResult[];
  jobSearchWeekResults: WeekResult[];
  violationsInPeriod: Violation[];
  correctiveActionsInPeriod: CorrectiveAction[];
  messagesInPeriod: ChatMessage[];
  acknowledgmentMessages: AcknowledgmentMessageResult[];
  curfewComplianceRate: ReportMetricValue;
  choreCompletionRate: ReportMetricValue;
  meetingComplianceRate: ReportMetricValue;
  employmentComplianceRate: ReportMetricValue;
  jobSearchCompletionRate: ReportMetricValue;
  totalViolations: number;
  violationsByRuleType: Partial<Record<ViolationRuleType, number>>;
  correctiveActionsOpen: number;
  correctiveActionsCompleted: number;
  correctiveActionsOverdue: number;
  acknowledgmentRequiredMessages: number;
  acknowledgmentCompletionRate: ReportMetricValue;
  sponsorContactSummary: {
    applicable: boolean;
    summary: string;
    requiredContacts: number | null;
  };
};

export type HouseMonthlyKpiComputation = {
  window: MonthlyWindow;
  house: House | null;
  activeResidentCount: number;
  residentComputation: ResidentMonthlyKpiComputation | null;
  curfewComplianceRate: ReportMetricValue;
  choreCompletionRate: ReportMetricValue;
  meetingComplianceRate: ReportMetricValue;
  employmentComplianceRate: ReportMetricValue;
  jobSearchCompletionRate: ReportMetricValue;
  totalViolations: number;
  violationsByRuleType: Partial<Record<ViolationRuleType, number>>;
  correctiveActionsOpen: number;
  correctiveActionsResolved: number;
  acknowledgmentRequiredMessages: number;
  acknowledgmentCompletionRate: ReportMetricValue;
  operationsSummary: {
    residentsInGoodStandingCount: number;
    residentsWithUnresolvedIssuesCount: number;
    residentsWithRepeatedViolationsCount: number;
    acknowledgmentRequiredCommunicationCount: number;
  };
};

type ResidentInput = {
  store: SoberHouseSettingsStore;
  monthKey: string;
  attendanceRecords: AttendanceRecordSummary[];
  meetingAttendanceLogs: MeetingAttendanceLogRecord[];
};

function emptyMetric(label: string): ReportMetricValue {
  return { value: null, numerator: null, denominator: null, label };
}

function toRateMetric(label: string, numerator: number, denominator: number): ReportMetricValue {
  if (denominator <= 0) {
    return emptyMetric(label);
  }
  return {
    value: Number((numerator / denominator).toFixed(4)),
    numerator,
    denominator,
    label,
  };
}

function formatDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function countMeetingsForWeek(
  attendanceRecords: AttendanceRecordSummary[],
  meetingAttendanceLogs: MeetingAttendanceLogRecord[],
  week: MonthlyWeekWindow,
): number {
  const start = week.startDate.getTime();
  const end = week.endExclusiveDate.getTime();
  if (attendanceRecords.length > 0) {
    return attendanceRecords.filter((record) => {
      if (record.inactive) {
        return false;
      }
      const timestamp = toTimestamp(record.startAt);
      return timestamp !== null && timestamp >= start && timestamp < end;
    }).length;
  }
  return meetingAttendanceLogs.filter((entry) => {
    const timestamp = toTimestamp(entry.atIso);
    return timestamp !== null && timestamp >= start && timestamp < end;
  }).length;
}

function countItemsInWeek<T>(
  items: T[],
  getValue: (item: T) => string | null,
  week: MonthlyWeekWindow,
): number {
  const start = week.startDate.getTime();
  const end = week.endExclusiveDate.getTime();
  return items.filter((item) => {
    const timestamp = toTimestamp(getValue(item));
    return timestamp !== null && timestamp >= start && timestamp < end;
  }).length;
}

function groupViolationsByRuleType(
  violations: Violation[],
): Partial<Record<ViolationRuleType, number>> {
  return violations.reduce<Partial<Record<ViolationRuleType, number>>>((accumulator, violation) => {
    accumulator[violation.ruleType] = (accumulator[violation.ruleType] ?? 0) + 1;
    return accumulator;
  }, {});
}

function validChoreCompletion(record: ChoreCompletionRecord): boolean {
  return (
    record.proofRequirement === "NONE" || record.proofProvided || Boolean(record.proofReference)
  );
}

function enumerateChorePeriods(
  window: MonthlyWindow,
  frequency: ChoreFrequency,
  moveInDate: string | null,
): Array<{ key: string; start: Date; endExclusive: Date }> {
  const activeStart = clampStartToWindow(moveInDate, window);
  if (frequency === "DAILY") {
    return enumerateMonthDays(window)
      .filter((day) => day >= activeStart)
      .map((day) => {
        const endExclusive = new Date(day);
        endExclusive.setDate(endExclusive.getDate() + 1);
        return { key: formatDayKey(day), start: day, endExclusive };
      });
  }

  if (frequency === "WEEKLY") {
    return enumerateMonthWeeks(window)
      .filter((week) => week.endExclusiveDate > activeStart)
      .map((week) => ({
        key: week.key,
        start: week.startDate,
        endExclusive: week.endExclusiveDate,
      }));
  }

  if (frequency === "BIWEEKLY") {
    const anchor = moveInDate ? new Date(moveInDate) : new Date(window.startDate);
    const anchorWeek = new Date(anchor);
    anchorWeek.setHours(0, 0, 0, 0);
    const daysSinceMonday = (anchorWeek.getDay() + 6) % 7;
    anchorWeek.setDate(anchorWeek.getDate() - daysSinceMonday);
    return enumerateMonthWeeks(window)
      .filter((week) => week.endExclusiveDate > activeStart)
      .filter((week) => {
        const diffWeeks = Math.floor(
          (week.startDate.getTime() - anchorWeek.getTime()) / (7 * 24 * 60 * 60 * 1000),
        );
        return diffWeeks % 2 === 0;
      })
      .map((week) => {
        const endExclusive = new Date(week.startDate);
        endExclusive.setDate(endExclusive.getDate() + 14);
        return { key: week.key, start: week.startDate, endExclusive };
      });
  }

  return [{ key: window.monthKey, start: activeStart, endExclusive: window.endExclusiveDate }];
}

function filterAcknowledgmentMessages(
  store: SoberHouseSettingsStore,
  residentId: string,
  window: MonthlyWindow,
): AcknowledgmentMessageResult[] {
  const relevantThreads = new Set(
    store.chatThreads
      .filter(
        (thread) => thread.residentId === residentId && thread.moduleContext === "SOBER_HOUSE",
      )
      .map((thread) => thread.id),
  );
  return store.chatMessages
    .filter(
      (message) =>
        relevantThreads.has(message.threadId) &&
        message.messageType === "ACKNOWLEDGMENT_REQUIRED" &&
        isTimestampInWindow(message.createdAt, window),
    )
    .map((message) => {
      const receipt =
        store.chatMessageReceipts.find(
          (entry) =>
            entry.messageId === message.id &&
            entry.userId === store.residentHousingProfile?.linkedUserId,
        ) ?? null;
      return {
        messageId: message.id,
        createdAt: message.createdAt,
        acknowledgedAt: receipt?.acknowledgedAt ?? null,
      };
    });
}

function filterMessagesInPeriod(
  store: SoberHouseSettingsStore,
  residentId: string,
  window: MonthlyWindow,
): ChatMessage[] {
  const relevantThreads = new Set(
    store.chatThreads
      .filter(
        (thread) => thread.residentId === residentId && thread.moduleContext === "SOBER_HOUSE",
      )
      .map((thread) => thread.id),
  );
  return store.chatMessages.filter(
    (message) =>
      relevantThreads.has(message.threadId) && isTimestampInWindow(message.createdAt, window),
  );
}

export function computeResidentMonthlyKpis({
  store,
  monthKey,
  attendanceRecords,
  meetingAttendanceLogs,
}: ResidentInput): ResidentMonthlyKpiComputation | null {
  const resident = store.residentHousingProfile;
  const requirements = store.residentRequirementProfile;
  if (!resident || !requirements) {
    return null;
  }

  const window = buildMonthlyWindow(monthKey);
  const house = resident.houseId ? getHouseById(store, resident.houseId) : null;
  const rules = resident.houseId
    ? getRuleSetForHouse(store, resident.houseId, window.periodStart)
    : null;
  const residentName = `${resident.firstName} ${resident.lastName}`.trim() || "Resident";
  const moveInDate = resident.moveInDate || null;

  const curfewViolations = store.violations.filter(
    (violation) =>
      violation.residentId === resident.residentId &&
      violation.ruleType === "curfew" &&
      isTimestampInWindow(violation.triggeredAt, window),
  );
  const curfewViolationDays = new Set(
    curfewViolations.map((violation) => violation.triggeredAt.slice(0, 10)),
  );
  const activeDays = enumerateMonthDays(window).filter(
    (day) => day >= clampStartToWindow(moveInDate, window),
  );
  const curfewDayResults = activeDays.map((day) => ({
    key: formatDayKey(day),
    hadViolation: curfewViolationDays.has(formatDayKey(day)),
  }));
  const curfewComplianceRate =
    rules?.curfew.enabled && activeDays.length > 0
      ? toRateMetric(
          "days compliant",
          activeDays.length - curfewViolationDays.size,
          activeDays.length,
        )
      : emptyMetric("not applicable");

  const choreCompletions = store.choreCompletionRecords.filter(
    (record) =>
      record.residentId === resident.residentId && isTimestampInWindow(record.completedAt, window),
  );
  const chorePeriods = rules
    ? enumerateChorePeriods(window, rules.chores.frequency, moveInDate)
    : [];
  const chorePeriodResults = chorePeriods.map((period) => ({
    key: period.key,
    complete: choreCompletions.some((record) => {
      const timestamp = toTimestamp(record.completedAt);
      return (
        timestamp !== null &&
        timestamp >= period.start.getTime() &&
        timestamp < period.endExclusive.getTime() &&
        validChoreCompletion(record)
      );
    }),
  }));
  const choreCompletionRate =
    rules?.chores.enabled && chorePeriods.length > 0
      ? toRateMetric(
          "periods completed",
          chorePeriodResults.filter((period) => period.complete).length,
          chorePeriodResults.length,
        )
      : emptyMetric("not applicable");

  const meetingWeekResults = enumerateMonthWeeks(window).map((week) => {
    const completed = countMeetingsForWeek(attendanceRecords, meetingAttendanceLogs, week);
    const required = requirements.meetingsRequiredWeekly ? requirements.meetingsRequiredCount : 0;
    return {
      key: week.key,
      required,
      completed,
      met: required > 0 ? completed >= required : false,
    };
  });
  const meetingApplicableWeeks = meetingWeekResults.filter((week) => week.required > 0);
  const meetingComplianceRate =
    meetingApplicableWeeks.length > 0
      ? toRateMetric(
          "weeks meeting target",
          meetingApplicableWeeks.filter((week) => week.met).length,
          meetingApplicableWeeks.length,
        )
      : emptyMetric("not applicable");

  const workVerifications = store.workVerificationRecords.filter(
    (record) =>
      record.residentId === resident.residentId && isTimestampInWindow(record.verifiedAt, window),
  );
  const workWeekResults = enumerateMonthWeeks(window).map((week) => {
    const completed = countItemsInWeek(workVerifications, (record) => record.verifiedAt, week);
    return {
      key: week.key,
      required: requirements.workRequired && requirements.currentlyEmployed ? 1 : 0,
      completed,
      met: completed > 0,
    };
  });
  const employmentComplianceRate =
    requirements.workRequired && requirements.currentlyEmployed
      ? requirements.employerName && requirements.employerAddress && requirements.employerPhone
        ? toRateMetric(
            "weeks verified",
            workWeekResults.filter((week) => week.met).length,
            workWeekResults.length,
          )
        : emptyMetric("incomplete setup")
      : emptyMetric(requirements.workRequired ? "tracked in job search" : "not applicable");

  const jobApplications = store.jobApplicationRecords.filter(
    (record) =>
      record.residentId === resident.residentId && isTimestampInWindow(record.appliedAt, window),
  );
  const jobSearchWeekResults = enumerateMonthWeeks(window).map((week) => {
    const required =
      requirements.workRequired && !requirements.currentlyEmployed
        ? requirements.jobApplicationsRequiredPerWeek
        : 0;
    const completed = countItemsInWeek(jobApplications, (record) => record.appliedAt, week);
    return {
      key: week.key,
      required,
      completed,
      met: required > 0 ? completed >= required : false,
    };
  });
  const applicableJobSearchWeeks = jobSearchWeekResults.filter((week) => week.required > 0);
  const jobSearchCompletionRate =
    applicableJobSearchWeeks.length > 0
      ? toRateMetric(
          "weeks meeting target",
          applicableJobSearchWeeks.filter((week) => week.met).length,
          applicableJobSearchWeeks.length,
        )
      : emptyMetric("not applicable");

  const violationsInPeriod = store.violations.filter(
    (violation) =>
      violation.residentId === resident.residentId &&
      isTimestampInWindow(violation.triggeredAt, window),
  );
  const correctiveActionsInPeriod = store.correctiveActions.filter(
    (action) =>
      action.residentId === resident.residentId &&
      (isTimestampInWindow(action.assignedAt, window) ||
        isTimestampInWindow(action.completedAt, window)),
  );
  const messagesInPeriod = filterMessagesInPeriod(store, resident.residentId, window);
  const acknowledgmentMessages = filterAcknowledgmentMessages(store, resident.residentId, window);
  const acknowledgmentCompletionRate =
    acknowledgmentMessages.length > 0
      ? toRateMetric(
          "messages acknowledged",
          acknowledgmentMessages.filter((message) => message.acknowledgedAt !== null).length,
          acknowledgmentMessages.length,
        )
      : emptyMetric("not applicable");

  return {
    window,
    residentId: resident.residentId,
    residentName,
    moveInDate,
    programPhaseOnEntry: resident.programPhaseOnEntry || null,
    house,
    curfewDayResults,
    chorePeriodResults,
    meetingWeekResults,
    workWeekResults,
    jobSearchWeekResults,
    violationsInPeriod,
    correctiveActionsInPeriod,
    messagesInPeriod,
    acknowledgmentMessages,
    curfewComplianceRate,
    choreCompletionRate,
    meetingComplianceRate,
    employmentComplianceRate,
    jobSearchCompletionRate,
    totalViolations: violationsInPeriod.length,
    violationsByRuleType: groupViolationsByRuleType(violationsInPeriod),
    correctiveActionsOpen: correctiveActionsInPeriod.filter((action) => action.status === "OPEN")
      .length,
    correctiveActionsCompleted: correctiveActionsInPeriod.filter(
      (action) => action.status === "COMPLETED",
    ).length,
    correctiveActionsOverdue: correctiveActionsInPeriod.filter(
      (action) => action.status === "OVERDUE",
    ).length,
    acknowledgmentRequiredMessages: acknowledgmentMessages.length,
    acknowledgmentCompletionRate,
    sponsorContactSummary:
      requirements.sponsorPresent || Boolean(requirements.sponsorName)
        ? {
            applicable: true,
            summary: requirements.sponsorContactFrequency
              ? `Sponsor contact expectation: ${requirements.sponsorContactFrequency}.`
              : "Sponsor is present, but monthly contact tracking is not yet captured.",
            requiredContacts: rules?.sponsorContact.contactsRequiredPerWeek ?? null,
          }
        : {
            applicable: false,
            summary: "No sponsor-contact requirement configured for this period.",
            requiredContacts: null,
          },
  };
}

export function computeHouseMonthlyKpis({
  store,
  houseId,
  monthKey,
  attendanceRecords,
  meetingAttendanceLogs,
}: ResidentInput & { houseId: string }): HouseMonthlyKpiComputation {
  const window = buildMonthlyWindow(monthKey);
  const house = getHouseById(store, houseId);
  const resident = store.residentHousingProfile;
  const residentComputation =
    resident?.houseId === houseId
      ? computeResidentMonthlyKpis({ store, monthKey, attendanceRecords, meetingAttendanceLogs })
      : null;
  const houseViolations = store.violations.filter(
    (violation) =>
      violation.houseId === houseId && isTimestampInWindow(violation.triggeredAt, window),
  );
  const houseActions = store.correctiveActions.filter(
    (action) =>
      action.houseId === houseId &&
      (isTimestampInWindow(action.assignedAt, window) ||
        isTimestampInWindow(action.completedAt, window)),
  );
  const acknowledgmentRequiredMessages = residentComputation?.acknowledgmentRequiredMessages ?? 0;
  const acknowledgmentCompletionRate =
    residentComputation?.acknowledgmentCompletionRate ?? emptyMetric("not applicable");
  const unresolvedIssueCount =
    houseViolations.filter(
      (violation) => violation.status !== "RESOLVED" && violation.status !== "DISMISSED",
    ).length > 0 ||
    houseActions.filter((action) => action.status === "OPEN" || action.status === "OVERDUE")
      .length > 0
      ? 1
      : 0;

  return {
    window,
    house,
    activeResidentCount: resident?.houseId === houseId ? 1 : 0,
    residentComputation,
    curfewComplianceRate:
      residentComputation?.curfewComplianceRate ?? emptyMetric("not applicable"),
    choreCompletionRate: residentComputation?.choreCompletionRate ?? emptyMetric("not applicable"),
    meetingComplianceRate:
      residentComputation?.meetingComplianceRate ?? emptyMetric("not applicable"),
    employmentComplianceRate:
      residentComputation?.employmentComplianceRate ?? emptyMetric("not applicable"),
    jobSearchCompletionRate:
      residentComputation?.jobSearchCompletionRate ?? emptyMetric("not applicable"),
    totalViolations: houseViolations.length,
    violationsByRuleType: groupViolationsByRuleType(houseViolations),
    correctiveActionsOpen: houseActions.filter((action) => action.status === "OPEN").length,
    correctiveActionsResolved: houseActions.filter((action) => action.status === "COMPLETED")
      .length,
    acknowledgmentRequiredMessages,
    acknowledgmentCompletionRate,
    operationsSummary: {
      residentsInGoodStandingCount:
        resident?.houseId === houseId && unresolvedIssueCount === 0 ? 1 : 0,
      residentsWithUnresolvedIssuesCount: unresolvedIssueCount,
      residentsWithRepeatedViolationsCount:
        resident?.houseId === houseId && houseViolations.length > 1 ? 1 : 0,
      acknowledgmentRequiredCommunicationCount: acknowledgmentRequiredMessages,
    },
  };
}
