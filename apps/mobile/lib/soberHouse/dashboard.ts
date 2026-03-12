import type { AttendanceRecordSummary, MeetingAttendanceLogRecord } from "../attendance/storage";
import { statusToneForComplianceStatus } from "./compliance";
import { getChatReceiptForMessageAndUser, getRuleSetForHouse } from "./selectors";
import { buildOneOnOneObligationSummary } from "./scheduling";
import type {
  ChoreFrequency,
  ComplianceStatus,
  CorrectiveAction,
  ResidentComplianceSummary,
  SoberHouseSettingsStore,
} from "./types";

export type SoberHouseDashboardTileTone = "green" | "yellow" | "red" | "gray";
export type SoberHouseDashboardTileId = "chores" | "weekly-meetings" | "house-schedule";
export type SoberHouseDashboardRouteTarget = "SOBER_HOUSE" | "MEETINGS";

export type SoberHouseDashboardMeetingPreview = {
  id: string;
  name: string;
  startsAtLocal: string;
  address: string;
  distanceMeters: number | null;
  format: "IN_PERSON" | "ONLINE" | "HYBRID";
};

export type SoberHouseDashboardTileSummary = {
  id: SoberHouseDashboardTileId;
  title: string;
  value: string;
  subtitle: string;
  detail: string;
  tone: SoberHouseDashboardTileTone;
  visible: boolean;
  routeTarget: SoberHouseDashboardRouteTarget;
  badgeLabel: string | null;
};

export type SoberHouseDashboardVisibility = {
  eligible: boolean;
  showChoreTile: boolean;
  showWeeklyMeetingTile: boolean;
  showHouseScheduleTile: boolean;
};

export type SoberHouseResidentDashboardSummary = {
  visibility: SoberHouseDashboardVisibility;
  choreTile: SoberHouseDashboardTileSummary;
  weeklyMeetingTile: SoberHouseDashboardTileSummary;
  houseScheduleTile: SoberHouseDashboardTileSummary;
  tiles: SoberHouseDashboardTileSummary[];
};

type SummaryContext = {
  store: SoberHouseSettingsStore;
  nowIso: string;
  attendanceRecords: AttendanceRecordSummary[];
  meetingAttendanceLogs: MeetingAttendanceLogRecord[];
  complianceSummary: ResidentComplianceSummary | null;
  upcomingMeetings: SoberHouseDashboardMeetingPreview[];
};

type ResidentContext = {
  residentId: string;
  linkedUserId: string;
  houseId: string;
  moveInDate: string | null;
  assignedChoreNotes: string;
  standingExceptionNotes: string;
  meetingsRequiredCount: number;
  meetingsRequiredWeekly: boolean;
  houseName: string;
  rules: ReturnType<typeof getRuleSetForHouse>;
};

type ChoreSummary = SoberHouseDashboardTileSummary & {
  dueAtIso: string | null;
  isPending: boolean;
  isOverdue: boolean;
};

type MeetingSummary = SoberHouseDashboardTileSummary & {
  remainingCount: number;
  nextExpectedMeeting: SoberHouseDashboardMeetingPreview | null;
};

function buildHiddenTile(
  id: SoberHouseDashboardTileId,
  routeTarget: SoberHouseDashboardRouteTarget,
  title: string,
): SoberHouseDashboardTileSummary {
  return {
    id,
    title,
    value: "",
    subtitle: "",
    detail: "",
    tone: "gray",
    visible: false,
    routeTarget,
    badgeLabel: null,
  };
}

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

function hasRequiredProof(proofRequirement: string[]): boolean {
  return proofRequirement.some((entry) => entry !== "NONE");
}

function sameCalendarDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatTimeLabel(hhmm: string): string {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) {
    return hhmm;
  }
  const [hoursText, minutesText] = hhmm.split(":");
  const hour = Number(hoursText);
  const minute = Number(minutesText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return hhmm;
  }
  const meridiem = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function formatDateTimeLabel(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return "Now";
  }
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function humanizeEnum(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function resolveResidentContext(
  store: SoberHouseSettingsStore,
  nowIso: string,
): ResidentContext | null {
  if (store.userAccessProfile?.role !== "HOUSE_RESIDENT") {
    return null;
  }
  const housing = store.residentHousingProfile;
  const requirements = store.residentRequirementProfile;
  if (!housing || !requirements || !housing.houseId) {
    return null;
  }
  const house = store.houses.find((candidate) => candidate.id === housing.houseId) ?? null;
  const rules = getRuleSetForHouse(store, housing.houseId, nowIso);
  return {
    residentId: housing.residentId,
    linkedUserId: housing.linkedUserId,
    houseId: housing.houseId,
    moveInDate: housing.moveInDate || null,
    assignedChoreNotes: requirements.assignedChoreNotes.trim(),
    standingExceptionNotes: requirements.standingExceptionNotes.trim(),
    meetingsRequiredCount: requirements.meetingsRequiredCount,
    meetingsRequiredWeekly: requirements.meetingsRequiredWeekly,
    houseName: house?.name ?? "Assigned house",
    rules,
  };
}

function countMeetingsInRange(
  attendanceRecords: AttendanceRecordSummary[],
  meetingAttendanceLogs: MeetingAttendanceLogRecord[],
  rangeStartMs: number,
  rangeEndMs: number,
): number {
  if (attendanceRecords.length > 0) {
    return attendanceRecords.filter((record) => {
      if (record.inactive) {
        return false;
      }
      const at = toTimestamp(record.startAt);
      return at !== null && at >= rangeStartMs && at < rangeEndMs;
    }).length;
  }

  return meetingAttendanceLogs.filter((entry) => {
    const at = toTimestamp(entry.atIso);
    return at !== null && at >= rangeStartMs && at < rangeEndMs;
  }).length;
}

function toneForComplianceStatus(status: ComplianceStatus): SoberHouseDashboardTileTone {
  const tone = statusToneForComplianceStatus(status);
  if (tone === "green" || tone === "yellow" || tone === "red") {
    return tone;
  }
  return "gray";
}

function buildChoreTileSummary({
  store,
  nowIso,
  resident,
}: {
  store: SoberHouseSettingsStore;
  nowIso: string;
  resident: ResidentContext | null;
}): ChoreSummary {
  if (!resident || !resident.rules.chores.enabled) {
    return {
      ...buildHiddenTile("chores", "SOBER_HOUSE", "Chore Completion"),
      dueAtIso: null,
      isPending: false,
      isOverdue: false,
    };
  }

  const now = new Date(nowIso);
  const period = getChorePeriodBounds(now, resident.rules.chores.frequency, resident.moveInDate);
  const validCompletions = store.choreCompletionRecords.filter((record) => {
    if (record.residentId !== resident.residentId) {
      return false;
    }
    const completedAtMs = toTimestamp(record.completedAt);
    if (completedAtMs === null) {
      return false;
    }
    if (completedAtMs < period.start.getTime() || completedAtMs >= period.endExclusive.getTime()) {
      return false;
    }
    if (!hasRequiredProof(record.proofRequirement)) {
      return true;
    }
    return record.proofProvided;
  });

  const dueAt = parseTimeOnDate(period.dueBaseDate, resident.rules.chores.dueTime);
  const dueAtIso = dueAt ? dueAt.toISOString() : null;
  const dueToday = sameCalendarDate(period.dueBaseDate, now);
  const totalDueToday = dueToday ? 1 : 0;
  const overdue = Boolean(
    dueAt && now.getTime() > dueAt.getTime() && validCompletions.length === 0,
  );
  const nextPendingLabel = resident.assignedChoreNotes || "House chore";
  const value = totalDueToday > 0 || overdue ? `${validCompletions.length > 0 ? 1 : 0}/1` : "0/0";

  let subtitle = "No chores due today";
  let detail = resident.assignedChoreNotes
    ? resident.assignedChoreNotes
    : `House chores run on a ${resident.rules.chores.frequency.toLowerCase()} cadence.`;
  let tone: SoberHouseDashboardTileTone = "gray";
  let badgeLabel: string | null = null;
  if (overdue) {
    subtitle = "1 chore overdue";
    detail = `${nextPendingLabel} was due by ${formatTimeLabel(resident.rules.chores.dueTime)}.`;
    tone = "red";
    badgeLabel = "Overdue";
  } else if (totalDueToday > 0 && validCompletions.length > 0) {
    subtitle = "All chores complete today";
    detail = `Verified before ${formatTimeLabel(resident.rules.chores.dueTime)}.`;
    tone = "green";
    badgeLabel = "All complete";
  } else if (totalDueToday > 0) {
    subtitle = `1 chore due by ${formatTimeLabel(resident.rules.chores.dueTime)}`;
    detail = `Next pending: ${nextPendingLabel}.`;
    tone = "yellow";
    badgeLabel = "Pending";
  }

  return {
    id: "chores",
    title: "Chore Completion",
    value,
    subtitle,
    detail,
    tone,
    visible: true,
    routeTarget: "SOBER_HOUSE",
    badgeLabel,
    dueAtIso,
    isPending: totalDueToday > 0 && validCompletions.length === 0,
    isOverdue: overdue,
  };
}

function buildWeeklyMeetingTileSummary({
  nowIso,
  attendanceRecords,
  meetingAttendanceLogs,
  complianceSummary,
  upcomingMeetings,
  resident,
}: Omit<SummaryContext, "store"> & { resident: ResidentContext | null }): MeetingSummary {
  if (
    !resident ||
    (!resident.meetingsRequiredWeekly && !resident.rules.meetings.meetingsRequired)
  ) {
    return {
      ...buildHiddenTile("weekly-meetings", "MEETINGS", "Weekly Meeting Goal"),
      remainingCount: 0,
      nextExpectedMeeting: null,
    };
  }

  const now = new Date(nowIso);
  const weekStart = startOfWeek(now).getTime();
  const weekEnd = endOfWeekExclusive(now).getTime();
  const requiredCount =
    resident.meetingsRequiredCount > 0
      ? resident.meetingsRequiredCount
      : resident.rules.meetings.meetingsPerWeek;
  if (requiredCount <= 0) {
    return {
      ...buildHiddenTile("weekly-meetings", "MEETINGS", "Weekly Meeting Goal"),
      remainingCount: 0,
      nextExpectedMeeting: null,
    };
  }

  const completedCount = countMeetingsInRange(
    attendanceRecords,
    meetingAttendanceLogs,
    weekStart,
    weekEnd,
  );
  const remainingCount = Math.max(0, requiredCount - completedCount);
  const evaluation = complianceSummary?.evaluations.find((entry) => entry.ruleType === "meetings");
  const nextExpectedMeeting = upcomingMeetings[0] ?? null;
  const weekdayIndex = (now.getDay() + 6) % 7;
  const expectedPace = Math.floor(((weekdayIndex + 1) / 7) * requiredCount);
  const behindPace = remainingCount > 0 && completedCount < expectedPace;
  const tone = evaluation
    ? toneForComplianceStatus(evaluation.status)
    : remainingCount === 0
      ? "green"
      : behindPace
        ? "yellow"
        : "gray";

  return {
    id: "weekly-meetings",
    title: "Weekly Meeting Goal",
    value: `${completedCount}/${requiredCount}`,
    subtitle:
      remainingCount === 0
        ? "Weekly meeting requirement met"
        : `${remainingCount} meeting${remainingCount === 1 ? "" : "s"} remaining this week`,
    detail: nextExpectedMeeting
      ? `Next expected: ${nextExpectedMeeting.name} at ${formatTimeLabel(nextExpectedMeeting.startsAtLocal)}.`
      : "No upcoming meetings are scheduled in the current feed.",
    tone,
    visible: true,
    routeTarget: "MEETINGS",
    badgeLabel:
      remainingCount === 0 ? "On track" : behindPace ? "Behind pace" : `Req ${requiredCount}`,
    remainingCount,
    nextExpectedMeeting,
  };
}

type ObligationCandidate = {
  dueAtMs: number;
  dueAtLabel: string;
  title: string;
  subtitle: string;
  detail: string;
  tone: SoberHouseDashboardTileTone;
  badgeLabel: string | null;
};

function buildPendingAcknowledgmentCandidates(
  store: SoberHouseSettingsStore,
  resident: ResidentContext,
  nowMs: number,
): ObligationCandidate[] {
  const residentThreadIds = new Set(
    store.chatParticipants
      .filter((participant) => participant.userId === resident.linkedUserId && participant.active)
      .map((participant) => participant.threadId),
  );

  return store.chatMessages
    .filter(
      (message) =>
        message.active &&
        message.messageType === "ACKNOWLEDGMENT_REQUIRED" &&
        residentThreadIds.has(message.threadId),
    )
    .filter(
      (message) =>
        !getChatReceiptForMessageAndUser(store, message.id, resident.linkedUserId)?.acknowledgedAt,
    )
    .map((message) => {
      const ageMs = nowMs - (toTimestamp(message.createdAt) ?? nowMs);
      return {
        dueAtMs: toTimestamp(message.createdAt) ?? nowMs,
        dueAtLabel: formatDateTimeLabel(message.createdAt),
        title: "Acknowledge manager notice",
        subtitle: message.bodyText.trim() || "A manager message still needs acknowledgment.",
        detail: "Open chat to acknowledge the latest house notice.",
        tone: ageMs > 24 * 60 * 60 * 1000 ? "red" : "yellow",
        badgeLabel: "Ack needed",
      };
    });
}

function buildCorrectiveActionCandidates(
  resident: ResidentContext,
  correctiveActions: CorrectiveAction[],
  nowIso: string,
): ObligationCandidate[] {
  const nowMs = toTimestamp(nowIso) ?? Date.now();
  return correctiveActions
    .filter(
      (action) =>
        action.residentId === resident.residentId &&
        (action.status === "OPEN" || action.status === "OVERDUE"),
    )
    .map((action) => {
      const dueAtMs = toTimestamp(action.dueAt) ?? toTimestamp(action.assignedAt) ?? nowMs;
      const overdue = action.status === "OVERDUE" || dueAtMs < nowMs;
      return {
        dueAtMs,
        dueAtLabel: action.dueAt ? formatDateTimeLabel(action.dueAt) : "Open now",
        title: overdue ? "Corrective action overdue" : "Corrective action due",
        subtitle: humanizeEnum(action.actionType),
        detail: action.notes.trim() || "Review the linked corrective action details.",
        tone: overdue ? "red" : "yellow",
        badgeLabel: "Action",
      };
    });
}

function buildHouseScheduleTileSummary({
  store,
  nowIso,
  resident,
  choreTile,
  weeklyMeetingTile,
}: {
  store: SoberHouseSettingsStore;
  nowIso: string;
  resident: ResidentContext | null;
  choreTile: ChoreSummary;
  weeklyMeetingTile: MeetingSummary;
}): SoberHouseDashboardTileSummary {
  if (!resident) {
    return buildHiddenTile("house-schedule", "SOBER_HOUSE", "House Schedule & Alerts");
  }

  const now = new Date(nowIso);
  const candidates: ObligationCandidate[] = [];
  const oneOnOneSummary = store.residentRequirementProfile
    ? buildOneOnOneObligationSummary(store, store.residentRequirementProfile, nowIso)
    : null;
  if (oneOnOneSummary) {
    candidates.push({
      dueAtMs: toTimestamp(oneOnOneSummary.startsAtIso) ?? now.getTime(),
      dueAtLabel: oneOnOneSummary.dueLabel,
      title: oneOnOneSummary.title,
      subtitle: oneOnOneSummary.subtitle,
      detail: oneOnOneSummary.detail,
      tone: oneOnOneSummary.tone,
      badgeLabel: "1:1",
    });
  }
  candidates.push(...buildPendingAcknowledgmentCandidates(store, resident, now.getTime()));
  candidates.push(...buildCorrectiveActionCandidates(resident, store.correctiveActions, nowIso));

  if ((choreTile.isPending || choreTile.isOverdue) && choreTile.dueAtIso) {
    candidates.push({
      dueAtMs: toTimestamp(choreTile.dueAtIso) ?? now.getTime(),
      dueAtLabel: choreTile.isOverdue ? "Past due" : formatDateTimeLabel(choreTile.dueAtIso),
      title: choreTile.isOverdue ? "Chore deadline missed" : "Next chore deadline",
      subtitle: choreTile.subtitle,
      detail: choreTile.detail,
      tone: choreTile.tone,
      badgeLabel: choreTile.badgeLabel,
    });
  }

  if (resident.rules.curfew.enabled) {
    const day = now.getDay();
    const curfewTime =
      day === 5
        ? resident.rules.curfew.fridayCurfew
        : day === 6
          ? resident.rules.curfew.saturdayCurfew
          : day === 0
            ? resident.rules.curfew.sundayCurfew
            : resident.rules.curfew.weekdayCurfew;
    const curfewAt = parseTimeOnDate(now, curfewTime);
    if (curfewAt && curfewAt.getTime() >= now.getTime()) {
      candidates.push({
        dueAtMs: curfewAt.getTime(),
        dueAtLabel: formatTimeLabel(curfewTime),
        title: "Curfew tonight",
        subtitle: `${resident.houseName} curfew`,
        detail: resident.standingExceptionNotes
          ? resident.standingExceptionNotes
          : "Be inside the house geofence before curfew.",
        tone: curfewAt.getTime() - now.getTime() <= 2 * 60 * 60 * 1000 ? "yellow" : "gray",
        badgeLabel: "Tonight",
      });
    }
  }

  if (weeklyMeetingTile.remainingCount > 0 && weeklyMeetingTile.nextExpectedMeeting) {
    candidates.push({
      dueAtMs:
        parseTimeOnDate(now, weeklyMeetingTile.nextExpectedMeeting.startsAtLocal)?.getTime() ??
        now.getTime(),
      dueAtLabel: formatTimeLabel(weeklyMeetingTile.nextExpectedMeeting.startsAtLocal),
      title: "Next meeting opportunity",
      subtitle: weeklyMeetingTile.nextExpectedMeeting.name,
      detail: `${weeklyMeetingTile.remainingCount} meeting${weeklyMeetingTile.remainingCount === 1 ? "" : "s"} still needed this week.`,
      tone: weeklyMeetingTile.tone,
      badgeLabel: weeklyMeetingTile.badgeLabel,
    });
  }

  candidates.sort((left, right) => left.dueAtMs - right.dueAtMs);
  const nextCandidate = candidates[0] ?? null;
  if (!nextCandidate) {
    return buildHiddenTile("house-schedule", "SOBER_HOUSE", "House Schedule & Alerts");
  }

  return {
    id: "house-schedule",
    title: "House Schedule & Alerts",
    value: nextCandidate.dueAtLabel,
    subtitle: nextCandidate.title,
    detail: `${nextCandidate.subtitle} ${nextCandidate.detail}`.trim(),
    tone: nextCandidate.tone,
    visible: true,
    routeTarget: "SOBER_HOUSE",
    badgeLabel: nextCandidate.badgeLabel,
  };
}

export function buildSoberHouseResidentDashboardSummary(
  context: SummaryContext,
): SoberHouseResidentDashboardSummary {
  const resident = resolveResidentContext(context.store, context.nowIso);
  const choreTile = buildChoreTileSummary({
    store: context.store,
    nowIso: context.nowIso,
    resident,
  });
  const weeklyMeetingTile = buildWeeklyMeetingTileSummary({
    nowIso: context.nowIso,
    attendanceRecords: context.attendanceRecords,
    meetingAttendanceLogs: context.meetingAttendanceLogs,
    complianceSummary: context.complianceSummary,
    upcomingMeetings: context.upcomingMeetings,
    resident,
  });
  const houseScheduleTile = buildHouseScheduleTileSummary({
    store: context.store,
    nowIso: context.nowIso,
    resident,
    choreTile,
    weeklyMeetingTile,
  });

  const visibility: SoberHouseDashboardVisibility = {
    eligible: resident !== null,
    showChoreTile: choreTile.visible,
    showWeeklyMeetingTile: weeklyMeetingTile.visible,
    showHouseScheduleTile: houseScheduleTile.visible,
  };

  return {
    visibility,
    choreTile,
    weeklyMeetingTile,
    houseScheduleTile,
    tiles: [choreTile, weeklyMeetingTile, houseScheduleTile].filter((tile) => tile.visible),
  };
}
