import { haversineDistanceMeters } from "../meetings/distance";
import type { AttendanceRecordSummary, MeetingAttendanceLogRecord } from "../attendance/storage";
import type { LocationCoords } from "../services/locationService";
import { getHouseById, getRuleSetForHouse } from "./selectors";
import type {
  ChoreFrequency,
  ComplianceEvaluation,
  ComplianceStatus,
  ResidentComplianceSummary,
  SoberHouseSettingsStore,
} from "./types";

const FEET_TO_METERS = 0.3048;
const DUE_SOON_WINDOW_MS = 2 * 60 * 60 * 1000;

type ComplianceContext = {
  store: SoberHouseSettingsStore;
  nowIso: string;
  currentLocation: LocationCoords | null;
  attendanceRecords: AttendanceRecordSummary[];
  meetingAttendanceLogs: MeetingAttendanceLogRecord[];
};

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

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonthExclusive(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
}

function parseTimeOnDate(date: Date, hhmm: string): Date | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) {
    return null;
  }
  const [hoursText, minutesText] = hhmm.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function getCurfewForDate(
  date: Date,
  weekday: string,
  friday: string,
  saturday: string,
  sunday: string,
): string {
  if (date.getDay() === 5) {
    return friday;
  }
  if (date.getDay() === 6) {
    return saturday;
  }
  if (date.getDay() === 0) {
    return sunday;
  }
  return weekday;
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

  const start = startOfMonth(date);
  const end = endOfMonthExclusive(date);
  const dueBaseDate = new Date(end);
  dueBaseDate.setDate(dueBaseDate.getDate() - 1);
  return { start, endExclusive: end, dueBaseDate };
}

function countMeetingsInRange(
  attendanceRecords: AttendanceRecordSummary[],
  meetingAttendanceLogs: MeetingAttendanceLogRecord[],
  rangeStartMs: number,
  rangeEndMs: number,
): { count: number; source: "attendanceRecords" | "meetingAttendanceLogs" } {
  if (attendanceRecords.length > 0) {
    return {
      count: attendanceRecords.filter((record) => {
        if (record.inactive) {
          return false;
        }
        const at = toTimestamp(record.startAt);
        return at !== null && at >= rangeStartMs && at < rangeEndMs;
      }).length,
      source: "attendanceRecords",
    };
  }

  return {
    count: meetingAttendanceLogs.filter((entry) => {
      const at = toTimestamp(entry.atIso);
      return at !== null && at >= rangeStartMs && at < rangeEndMs;
    }).length,
    source: "meetingAttendanceLogs",
  };
}

function buildEvaluation(
  input: Omit<ComplianceEvaluation, "metadata"> & {
    metadata?: ComplianceEvaluation["metadata"];
  },
): ComplianceEvaluation {
  return {
    ...input,
    metadata: input.metadata ?? {},
  };
}

function isAttentionStatus(status: ComplianceStatus): boolean {
  return status === "at_risk" || status === "violation" || status === "incomplete_setup";
}

export function statusToneForComplianceStatus(
  status: ComplianceStatus,
): "green" | "yellow" | "red" | "gray" {
  if (status === "compliant") {
    return "green";
  }
  if (status === "at_risk") {
    return "yellow";
  }
  if (status === "violation") {
    return "red";
  }
  return "gray";
}

export function evaluateResidentCompliance({
  store,
  nowIso,
  currentLocation,
  attendanceRecords,
  meetingAttendanceLogs,
}: ComplianceContext): ResidentComplianceSummary | null {
  const housing = store.residentHousingProfile;
  const requirements = store.residentRequirementProfile;
  if (!housing || !requirements) {
    return null;
  }

  const now = new Date(nowIso);
  const house = housing.houseId ? getHouseById(store, housing.houseId) : null;
  const rules = housing.houseId ? getRuleSetForHouse(store, housing.houseId, nowIso) : null;
  const residentId = housing.residentId;
  const houseId = housing.houseId ?? null;

  const evaluations: ComplianceEvaluation[] = [];

  if (!house || !rules) {
    evaluations.push(
      buildEvaluation({
        ruleType: "curfew",
        residentId,
        houseId,
        status: "incomplete_setup",
        statusReason: "Resident is not assigned to a configured house.",
        effectiveTargetValue: null,
        actualValue: null,
        dueAt: null,
        evaluatedAt: nowIso,
        configSource: "none",
      }),
    );
    evaluations.push(
      buildEvaluation({
        ruleType: "chores",
        residentId,
        houseId,
        status: "incomplete_setup",
        statusReason: "Resident is not assigned to a configured house.",
        effectiveTargetValue: null,
        actualValue: null,
        dueAt: null,
        evaluatedAt: nowIso,
        configSource: "none",
      }),
    );
    evaluations.push(
      buildEvaluation({
        ruleType: "work",
        residentId,
        houseId,
        status: "incomplete_setup",
        statusReason: "Resident is not assigned to a configured house.",
        effectiveTargetValue: null,
        actualValue: null,
        dueAt: null,
        evaluatedAt: nowIso,
        configSource: "none",
      }),
    );
    evaluations.push(
      buildEvaluation({
        ruleType: "jobSearch",
        residentId,
        houseId,
        status: "incomplete_setup",
        statusReason: "Resident is not assigned to a configured house.",
        effectiveTargetValue: null,
        actualValue: null,
        dueAt: null,
        evaluatedAt: nowIso,
        configSource: "none",
      }),
    );
    evaluations.push(
      buildEvaluation({
        ruleType: "meetings",
        residentId,
        houseId,
        status: "incomplete_setup",
        statusReason: "Resident is not assigned to a configured house.",
        effectiveTargetValue: null,
        actualValue: null,
        dueAt: null,
        evaluatedAt: nowIso,
        configSource: "none",
      }),
    );

    return { residentId, houseId, evaluatedAt: nowIso, evaluations };
  }

  const effectiveCurfewEnabled = requirements.residentCurfewOverrideEnabled || rules.curfew.enabled;
  const curfewConfigSource = requirements.residentCurfewOverrideEnabled ? "resident" : "house";
  const curfewTime = getCurfewForDate(
    now,
    requirements.residentCurfewOverrideEnabled
      ? requirements.residentCurfewWeekday
      : rules.curfew.weekdayCurfew,
    requirements.residentCurfewOverrideEnabled
      ? requirements.residentCurfewFriday
      : rules.curfew.fridayCurfew,
    requirements.residentCurfewOverrideEnabled
      ? requirements.residentCurfewSaturday
      : rules.curfew.saturdayCurfew,
    requirements.residentCurfewOverrideEnabled
      ? requirements.residentCurfewSunday
      : rules.curfew.sundayCurfew,
  );
  const curfewDueAt = parseTimeOnDate(now, curfewTime);
  const curfewLeadMs = rules.curfew.preViolationAlertEnabled
    ? rules.curfew.preViolationLeadTimeMinutes * 60 * 1000
    : 0;
  const curfewGraceMs = rules.curfew.gracePeriodMinutes * 60 * 1000;
  const residentInsideGeofence =
    currentLocation &&
    house.geofenceCenterLat !== null &&
    house.geofenceCenterLng !== null &&
    haversineDistanceMeters(
      { lat: currentLocation.lat, lng: currentLocation.lng },
      { lat: house.geofenceCenterLat, lng: house.geofenceCenterLng },
    ) <=
      house.geofenceRadiusFeetDefault * FEET_TO_METERS;

  if (!effectiveCurfewEnabled) {
    evaluations.push(
      buildEvaluation({
        ruleType: "curfew",
        residentId,
        houseId,
        status: "not_applicable",
        statusReason: "Curfew is disabled for this resident.",
        effectiveTargetValue: false,
        actualValue: null,
        dueAt: null,
        evaluatedAt: nowIso,
        configSource: curfewConfigSource,
      }),
    );
  } else if (!curfewDueAt) {
    evaluations.push(
      buildEvaluation({
        ruleType: "curfew",
        residentId,
        houseId,
        status: "incomplete_setup",
        statusReason: "Curfew time is missing or invalid.",
        effectiveTargetValue: curfewTime,
        actualValue: null,
        dueAt: null,
        evaluatedAt: nowIso,
        configSource: curfewConfigSource,
      }),
    );
  } else if (house.geofenceCenterLat === null || house.geofenceCenterLng === null) {
    evaluations.push(
      buildEvaluation({
        ruleType: "curfew",
        residentId,
        houseId,
        status: "incomplete_setup",
        statusReason: "House geofence coordinates are missing.",
        effectiveTargetValue: curfewTime,
        actualValue: null,
        dueAt: curfewDueAt.toISOString(),
        evaluatedAt: nowIso,
        configSource: curfewConfigSource,
      }),
    );
  } else if (!currentLocation) {
    evaluations.push(
      buildEvaluation({
        ruleType: "curfew",
        residentId,
        houseId,
        status: "incomplete_setup",
        statusReason: "Current location is unavailable for curfew evaluation.",
        effectiveTargetValue: curfewTime,
        actualValue: null,
        dueAt: curfewDueAt.toISOString(),
        evaluatedAt: nowIso,
        configSource: curfewConfigSource,
      }),
    );
  } else if (residentInsideGeofence) {
    evaluations.push(
      buildEvaluation({
        ruleType: "curfew",
        residentId,
        houseId,
        status: "compliant",
        statusReason: "Resident is currently inside the house geofence.",
        effectiveTargetValue: curfewTime,
        actualValue: "inside_geofence",
        dueAt: curfewDueAt.toISOString(),
        evaluatedAt: nowIso,
        configSource: curfewConfigSource,
        metadata: {
          standingException: requirements.standingExceptionNotes || null,
          graceMinutes: rules.curfew.gracePeriodMinutes,
        },
      }),
    );
  } else {
    const nowMs = now.getTime();
    const dueMs = curfewDueAt.getTime();
    const leadWindowStartMs = dueMs - curfewLeadMs;
    const violationMs = dueMs + curfewGraceMs;
    const status: ComplianceStatus =
      nowMs > violationMs
        ? "violation"
        : nowMs >= leadWindowStartMs || nowMs >= dueMs
          ? "at_risk"
          : "compliant";
    const reason =
      status === "violation"
        ? "Resident is outside the house geofence after curfew and grace period."
        : status === "at_risk"
          ? `Resident is outside the house geofence and curfew is approaching or in grace period.`
          : "Resident is outside the house geofence, but curfew is not in the warning window yet.";
    evaluations.push(
      buildEvaluation({
        ruleType: "curfew",
        residentId,
        houseId,
        status,
        statusReason: reason,
        effectiveTargetValue: curfewTime,
        actualValue: "outside_geofence",
        dueAt: curfewDueAt.toISOString(),
        evaluatedAt: nowIso,
        configSource: curfewConfigSource,
        metadata: {
          standingException: requirements.standingExceptionNotes || null,
          graceMinutes: rules.curfew.gracePeriodMinutes,
          preViolationLeadMinutes: rules.curfew.preViolationLeadTimeMinutes,
          minutesUntilCurfew: Math.max(0, Math.round((dueMs - nowMs) / 60_000)),
        },
      }),
    );
  }

  if (!rules.chores.enabled) {
    evaluations.push(
      buildEvaluation({
        ruleType: "chores",
        residentId,
        houseId,
        status: "not_applicable",
        statusReason: "Chores are not required for this house.",
        effectiveTargetValue: false,
        actualValue: null,
        dueAt: null,
        evaluatedAt: nowIso,
        configSource: "house",
      }),
    );
  } else {
    const bounds = getChorePeriodBounds(now, rules.chores.frequency, housing.moveInDate);
    const dueAt = parseTimeOnDate(bounds.dueBaseDate, rules.chores.dueTime);
    const completions = store.choreCompletionRecords
      .filter((record) => record.residentId === residentId)
      .filter((record) => {
        const completedAt = toTimestamp(record.completedAt);
        return (
          completedAt !== null &&
          completedAt >= bounds.start.getTime() &&
          completedAt < bounds.endExclusive.getTime()
        );
      })
      .sort((a, b) => (toTimestamp(b.completedAt) ?? 0) - (toTimestamp(a.completedAt) ?? 0));
    const latest = completions[0] ?? null;
    const proofRequired = rules.chores.proofRequirement !== "NONE";
    const hasValidCompletion = latest ? !proofRequired || latest.proofProvided : false;
    const dueMs = dueAt?.getTime() ?? null;
    const violationMs = dueMs === null ? null : dueMs + rules.chores.gracePeriodMinutes * 60_000;
    const nowMs = now.getTime();

    if (!dueAt) {
      evaluations.push(
        buildEvaluation({
          ruleType: "chores",
          residentId,
          houseId,
          status: "incomplete_setup",
          statusReason: "Chore due time is missing or invalid.",
          effectiveTargetValue: rules.chores.dueTime,
          actualValue: latest?.completedAt ?? null,
          dueAt: null,
          evaluatedAt: nowIso,
          configSource: "house",
        }),
      );
    } else if (hasValidCompletion) {
      evaluations.push(
        buildEvaluation({
          ruleType: "chores",
          residentId,
          houseId,
          status: "compliant",
          statusReason: "Chore completed with the required proof.",
          effectiveTargetValue: rules.chores.proofRequirement,
          actualValue: latest?.completedAt ?? null,
          dueAt: dueAt.toISOString(),
          evaluatedAt: nowIso,
          configSource: "house",
          metadata: {
            proofProvided: latest?.proofProvided ?? false,
            assignedChoreNotes: requirements.assignedChoreNotes || null,
          },
        }),
      );
    } else if (latest && proofRequired && !latest.proofProvided) {
      evaluations.push(
        buildEvaluation({
          ruleType: "chores",
          residentId,
          houseId,
          status: violationMs !== null && nowMs > violationMs ? "violation" : "at_risk",
          statusReason:
            violationMs !== null && nowMs > violationMs
              ? "Chore was marked complete, but required proof is missing."
              : "Chore has been marked complete, but required proof is still missing.",
          effectiveTargetValue: rules.chores.proofRequirement,
          actualValue: latest.completedAt,
          dueAt: dueAt.toISOString(),
          evaluatedAt: nowIso,
          configSource: "house",
          metadata: {
            proofProvided: false,
            invalidCompletion: true,
          },
        }),
      );
    } else if (violationMs !== null && nowMs > violationMs) {
      evaluations.push(
        buildEvaluation({
          ruleType: "chores",
          residentId,
          houseId,
          status: "violation",
          statusReason: "Chore due time has passed without a valid completion.",
          effectiveTargetValue: rules.chores.dueTime,
          actualValue: latest?.completedAt ?? null,
          dueAt: dueAt.toISOString(),
          evaluatedAt: nowIso,
          configSource: "house",
          metadata: {
            proofRequirement: rules.chores.proofRequirement,
          },
        }),
      );
    } else if (dueMs !== null && dueMs - nowMs <= DUE_SOON_WINDOW_MS) {
      evaluations.push(
        buildEvaluation({
          ruleType: "chores",
          residentId,
          houseId,
          status: "at_risk",
          statusReason: "Chore due time is approaching and no valid completion is on file.",
          effectiveTargetValue: rules.chores.dueTime,
          actualValue: latest?.completedAt ?? null,
          dueAt: dueAt.toISOString(),
          evaluatedAt: nowIso,
          configSource: "house",
          metadata: {
            proofRequirement: rules.chores.proofRequirement,
          },
        }),
      );
    } else {
      evaluations.push(
        buildEvaluation({
          ruleType: "chores",
          residentId,
          houseId,
          status: "compliant",
          statusReason: "No immediate chore issue is active right now.",
          effectiveTargetValue: rules.chores.dueTime,
          actualValue: latest?.completedAt ?? null,
          dueAt: dueAt.toISOString(),
          evaluatedAt: nowIso,
          configSource: "house",
        }),
      );
    }
  }

  const employmentRequired = requirements.workRequired || rules.employment.employmentRequired;
  const workConfigSource = requirements.workRequired ? "resident" : "house";
  if (!employmentRequired) {
    evaluations.push(
      buildEvaluation({
        ruleType: "work",
        residentId,
        houseId,
        status: "not_applicable",
        statusReason: "Employment is not required for this resident.",
        effectiveTargetValue: false,
        actualValue: null,
        dueAt: null,
        evaluatedAt: nowIso,
        configSource: workConfigSource,
      }),
    );
  } else if (requirements.currentlyEmployed) {
    if (
      !requirements.employerName.trim() ||
      !requirements.employerAddress.trim() ||
      !requirements.employerPhone.trim()
    ) {
      evaluations.push(
        buildEvaluation({
          ruleType: "work",
          residentId,
          houseId,
          status: "incomplete_setup",
          statusReason: "Employer name, address, and phone are required for employed residents.",
          effectiveTargetValue: true,
          actualValue: false,
          dueAt: null,
          evaluatedAt: nowIso,
          configSource: "resident",
        }),
      );
    } else if (rules.employment.workplaceVerificationEnabled) {
      const weekStart = startOfWeek(now).getTime();
      const weekEnd = endOfWeekExclusive(now).getTime();
      const verifications = store.workVerificationRecords.filter((record) => {
        const verifiedAt = toTimestamp(record.verifiedAt);
        return (
          record.residentId === residentId &&
          verifiedAt !== null &&
          verifiedAt >= weekStart &&
          verifiedAt < weekEnd
        );
      });
      evaluations.push(
        buildEvaluation({
          ruleType: "work",
          residentId,
          houseId,
          status: verifications.length > 0 ? "compliant" : "at_risk",
          statusReason:
            verifications.length > 0
              ? "Employment is configured and a work verification record exists this week."
              : "Employment is configured, but no work verification record exists this week.",
          effectiveTargetValue: rules.employment.workplaceVerificationEnabled,
          actualValue: verifications.length,
          dueAt: endOfWeekExclusive(now).toISOString(),
          evaluatedAt: nowIso,
          configSource: "house",
          metadata: {
            workplaceVerificationEnabled: true,
            managerVerificationRequired: rules.employment.managerVerificationRequired,
          },
        }),
      );
    } else {
      evaluations.push(
        buildEvaluation({
          ruleType: "work",
          residentId,
          houseId,
          status: "compliant",
          statusReason: "Employment is configured and no extra verification is required.",
          effectiveTargetValue: true,
          actualValue: true,
          dueAt: null,
          evaluatedAt: nowIso,
          configSource: workConfigSource,
        }),
      );
    }
  } else {
    const jobApplicationsRequired = Math.max(
      requirements.jobApplicationsRequiredPerWeek,
      rules.jobSearch.applicationsRequiredPerWeek,
    );
    evaluations.push(
      buildEvaluation({
        ruleType: "work",
        residentId,
        houseId,
        status: jobApplicationsRequired > 0 ? "at_risk" : "incomplete_setup",
        statusReason:
          jobApplicationsRequired > 0
            ? "Employment is required and the resident is currently being evaluated under the job-search target."
            : "Employment is required, but no job-search target is configured.",
        effectiveTargetValue: true,
        actualValue: false,
        dueAt: endOfWeekExclusive(now).toISOString(),
        evaluatedAt: nowIso,
        configSource: workConfigSource,
      }),
    );
  }

  const jobApplicationsRequired = requirements.currentlyEmployed
    ? 0
    : Math.max(
        requirements.jobApplicationsRequiredPerWeek,
        rules.jobSearch.applicationsRequiredPerWeek,
      );
  if (!employmentRequired || requirements.currentlyEmployed) {
    evaluations.push(
      buildEvaluation({
        ruleType: "jobSearch",
        residentId,
        houseId,
        status: "not_applicable",
        statusReason: requirements.currentlyEmployed
          ? "Resident is employed, so the weekly job-search target does not apply."
          : "Job-search tracking does not apply because employment is not required.",
        effectiveTargetValue: jobApplicationsRequired,
        actualValue: null,
        dueAt: null,
        evaluatedAt: nowIso,
        configSource: requirements.jobApplicationsRequiredPerWeek > 0 ? "resident" : "house",
      }),
    );
  } else if (jobApplicationsRequired <= 0) {
    evaluations.push(
      buildEvaluation({
        ruleType: "jobSearch",
        residentId,
        houseId,
        status: "incomplete_setup",
        statusReason:
          "Employment is required, but the weekly job-application target is not configured.",
        effectiveTargetValue: 0,
        actualValue: 0,
        dueAt: endOfWeekExclusive(now).toISOString(),
        evaluatedAt: nowIso,
        configSource: requirements.jobApplicationsRequiredPerWeek > 0 ? "resident" : "house",
      }),
    );
  } else {
    const weekStart = startOfWeek(now).getTime();
    const weekEnd = endOfWeekExclusive(now).getTime();
    const applicationsThisWeek = store.jobApplicationRecords.filter((record) => {
      const appliedAt = toTimestamp(record.appliedAt);
      return (
        record.residentId === residentId &&
        appliedAt !== null &&
        appliedAt >= weekStart &&
        appliedAt < weekEnd
      );
    });
    const completed = applicationsThisWeek.length;
    const remaining = Math.max(0, jobApplicationsRequired - completed);
    const remainingDays = Math.max(1, Math.ceil((weekEnd - now.getTime()) / (24 * 60 * 60 * 1000)));
    const status: ComplianceStatus =
      completed >= jobApplicationsRequired
        ? "compliant"
        : now.getTime() >= weekEnd
          ? "violation"
          : remaining > remainingDays
            ? "at_risk"
            : "compliant";
    evaluations.push(
      buildEvaluation({
        ruleType: "jobSearch",
        residentId,
        houseId,
        status,
        statusReason:
          status === "compliant"
            ? completed >= jobApplicationsRequired
              ? "Weekly job-application target is met."
              : "Job-search pace is still recoverable for this week."
            : status === "violation"
              ? "Weekly job-application target was not met before the end of the week."
              : "Current job-search pace is behind the remaining days in this week.",
        effectiveTargetValue: jobApplicationsRequired,
        actualValue: completed,
        dueAt: endOfWeekExclusive(now).toISOString(),
        evaluatedAt: nowIso,
        configSource: requirements.jobApplicationsRequiredPerWeek > 0 ? "resident" : "house",
        metadata: {
          remainingThisWeek: remaining,
          proofRequired: rules.jobSearch.proofRequired,
        },
      }),
    );
  }

  const meetingsRequired = requirements.meetingsRequiredWeekly || rules.meetings.meetingsRequired;
  const meetingsTarget = requirements.meetingsRequiredWeekly
    ? requirements.meetingsRequiredCount
    : rules.meetings.meetingsPerWeek;
  if (!meetingsRequired || meetingsTarget <= 0) {
    evaluations.push(
      buildEvaluation({
        ruleType: "meetings",
        residentId,
        houseId,
        status: "not_applicable",
        statusReason: "Weekly meeting quota is not active for this resident.",
        effectiveTargetValue: meetingsTarget,
        actualValue: 0,
        dueAt: null,
        evaluatedAt: nowIso,
        configSource: requirements.meetingsRequiredWeekly ? "resident" : "house",
      }),
    );
  } else {
    const weekStart = startOfWeek(now);
    const weekEnd = endOfWeekExclusive(now);
    const meetingCounts = countMeetingsInRange(
      attendanceRecords,
      meetingAttendanceLogs,
      weekStart.getTime(),
      weekEnd.getTime(),
    );
    const remaining = Math.max(0, meetingsTarget - meetingCounts.count);
    const remainingDays = Math.max(
      1,
      Math.ceil((weekEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
    );
    const status: ComplianceStatus =
      meetingCounts.count >= meetingsTarget
        ? "compliant"
        : now.getTime() >= weekEnd.getTime()
          ? "violation"
          : remaining > remainingDays
            ? "at_risk"
            : "compliant";
    evaluations.push(
      buildEvaluation({
        ruleType: "meetings",
        residentId,
        houseId,
        status,
        statusReason:
          status === "compliant"
            ? meetingCounts.count >= meetingsTarget
              ? "Weekly meeting quota is met."
              : "Meeting pace is still recoverable for this week."
            : status === "violation"
              ? "Weekly meeting quota was not met before the end of the week."
              : "Meeting pace is behind the remaining days in this week.",
        effectiveTargetValue: meetingsTarget,
        actualValue: meetingCounts.count,
        dueAt: weekEnd.toISOString(),
        evaluatedAt: nowIso,
        configSource: requirements.meetingsRequiredWeekly ? "resident" : "house",
        metadata: {
          requiredThisWeek: meetingsTarget,
          completedThisWeek: meetingCounts.count,
          remainingThisWeek: remaining,
          attendanceSource: meetingCounts.source,
        },
      }),
    );
  }

  return {
    residentId,
    houseId,
    evaluatedAt: nowIso,
    evaluations,
  };
}

export function getEvaluationsNeedingAttention(
  summary: ResidentComplianceSummary | null,
): ComplianceEvaluation[] {
  if (!summary) {
    return [];
  }
  return summary.evaluations.filter((evaluation) => isAttentionStatus(evaluation.status));
}
