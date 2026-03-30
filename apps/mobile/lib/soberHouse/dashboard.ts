import type { AttendanceRecordSummary, MeetingAttendanceLogRecord } from "../attendance/storage";
import { statusToneForComplianceStatus } from "./compliance";
import {
  getActiveHouseAlertAnnouncements,
  getChatReceiptForMessageAndUser,
  getHouseChoresForResident,
  getHouseMeetingsInRange,
  getRuleSetForHouse,
  getUpcomingHouseMeetings,
  getUpcomingOneOnOneSessions,
} from "./selectors";
import { buildSoberHouseRoutineSummary } from "./routine";
import { buildOneOnOneObligationSummary } from "./scheduling";
import type {
  ChoreFrequency,
  ComplianceStatus,
  CorrectiveAction,
  HouseChore,
  ResidentComplianceSummary,
  SoberHouseSettingsStore,
} from "./types";

export type SoberHouseDashboardTileTone = "green" | "yellow" | "red" | "gray";
export type SoberHouseDashboardTileId =
  | "sober-house-requirements"
  | "chores"
  | "weekly-meetings"
  | "sponsor-calls"
  | "job-applications"
  | "house-meetings"
  | "one-on-ones"
  | "house-alerts"
  | "compliance-snapshot"
  | "house-schedule";
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
  showRequirementsTile: boolean;
  showChoreTile: boolean;
  showWeeklyMeetingTile: boolean;
  showSponsorContactTile: boolean;
  showJobApplicationsTile: boolean;
  showHouseMeetingsTile: boolean;
  showOneOnOneTile: boolean;
  showHouseAlertsTile: boolean;
  showComplianceSnapshotTile: boolean;
  showHouseScheduleTile: boolean;
};

export type SoberHouseResidentDashboardSummary = {
  visibility: SoberHouseDashboardVisibility;
  requirementsTile: SoberHouseDashboardTileSummary;
  choreTile: SoberHouseDashboardTileSummary;
  weeklyMeetingTile: SoberHouseDashboardTileSummary;
  sponsorContactTile: SoberHouseDashboardTileSummary;
  jobApplicationsTile: SoberHouseDashboardTileSummary;
  houseMeetingsTile: SoberHouseDashboardTileSummary;
  oneOnOneTile: SoberHouseDashboardTileSummary;
  houseAlertsTile: SoberHouseDashboardTileSummary;
  complianceSnapshotTile: SoberHouseDashboardTileSummary;
  houseScheduleTile: SoberHouseDashboardTileSummary;
  tiles: SoberHouseDashboardTileSummary[];
};

type SummaryContext = {
  store: SoberHouseSettingsStore;
  nowIso: string;
  attendanceRecords: AttendanceRecordSummary[];
  meetingAttendanceLogs: MeetingAttendanceLogRecord[];
  sponsorCallLogs: Array<{ id: string; atIso: string; success: boolean }>;
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
  workRequired: boolean;
  currentlyEmployed: boolean;
  sponsorPresent: boolean;
  jobApplicationsRequiredPerWeek: number;
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

function weekdayIndexFromCode(code: string | null | undefined): number | null {
  switch (code) {
    case "MON":
      return 1;
    case "TUE":
      return 2;
    case "WED":
      return 3;
    case "THU":
      return 4;
    case "FRI":
      return 5;
    case "SAT":
      return 6;
    case "SUN":
      return 0;
    default:
      return null;
  }
}

function isExplicitChoreDueToday(chore: HouseChore, now: Date): boolean {
  if (chore.status !== "ACTIVE") {
    return false;
  }
  if (chore.scheduledDate) {
    return sameCalendarDate(new Date(chore.scheduledDate), now);
  }
  const weekdayIndex = weekdayIndexFromCode(chore.weekday);
  if (weekdayIndex !== null) {
    return now.getDay() === weekdayIndex;
  }
  return chore.frequency === "DAILY";
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
    workRequired: requirements.workRequired,
    currentlyEmployed: requirements.currentlyEmployed,
    sponsorPresent: requirements.sponsorPresent,
    jobApplicationsRequiredPerWeek: requirements.jobApplicationsRequiredPerWeek,
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

function countSponsorCallsInRange(
  sponsorCallLogs: Array<{ id: string; atIso: string; success: boolean }>,
  rangeStartMs: number,
  rangeEndMs: number,
): number {
  return sponsorCallLogs.filter((entry) => {
    if (!entry.success) {
      return false;
    }
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
  const explicitChores = getHouseChoresForResident(store, resident.residentId, resident.houseId);
  if (explicitChores.length > 0) {
    const choresDueToday = explicitChores.filter((chore) => isExplicitChoreDueToday(chore, now));
    const validCompletionByChoreId = new Set(
      store.choreCompletionRecords
        .filter((record) => record.residentId === resident.residentId && record.houseChoreId)
        .filter((record) => {
          const completedAtMs = toTimestamp(record.completedAt);
          if (completedAtMs === null) {
            return false;
          }
          if (!sameCalendarDate(new Date(completedAtMs), now)) {
            return false;
          }
          if (!hasRequiredProof(record.proofRequirement)) {
            return true;
          }
          return record.proofProvided;
        })
        .map((record) => record.houseChoreId as string),
    );
    const dueItems = choresDueToday.map((chore) => {
      const dueAt = parseTimeOnDate(now, chore.dueTimeLocalHhmm);
      const completed = validCompletionByChoreId.has(chore.id);
      const overdue = Boolean(dueAt && now.getTime() > dueAt.getTime() && !completed);
      return { chore, dueAt, completed, overdue };
    });
    const completedCount = dueItems.filter((entry) => entry.completed).length;
    const overdueCount = dueItems.filter((entry) => entry.overdue).length;
    const nextPending = dueItems.find((entry) => !entry.completed) ?? null;
    const totalDueToday = dueItems.length;

    let subtitle =
      totalDueToday > 0
        ? `${completedCount}/${totalDueToday} chores complete today`
        : "No chores due today";
    let detail =
      nextPending?.chore.summary ||
      nextPending?.chore.title ||
      resident.assignedChoreNotes ||
      "House chores are configured for this resident.";
    let tone: SoberHouseDashboardTileTone =
      overdueCount > 0
        ? "red"
        : totalDueToday > 0 && completedCount === totalDueToday
          ? "green"
          : totalDueToday > 0
            ? "yellow"
            : "gray";
    let badgeLabel: string | null =
      overdueCount > 0
        ? `${overdueCount} overdue`
        : totalDueToday > 0 && completedCount === totalDueToday
          ? "All complete"
          : totalDueToday > 0
            ? "Pending"
            : null;
    if (nextPending?.dueAt) {
      detail = `${detail} Due by ${formatTimeLabel(nextPending.chore.dueTimeLocalHhmm)}.`;
    }

    return {
      id: "chores",
      title: "Chore Completion",
      value: `${completedCount}/${totalDueToday}`,
      subtitle,
      detail,
      tone,
      visible: resident.rules.operations.choresEnabled || totalDueToday > 0,
      routeTarget: "SOBER_HOUSE",
      badgeLabel,
      dueAtIso: nextPending?.dueAt?.toISOString() ?? null,
      isPending: totalDueToday > 0 && completedCount < totalDueToday && overdueCount === 0,
      isOverdue: overdueCount > 0,
    };
  }

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

function buildHouseMeetingsTileSummary({
  store,
  nowIso,
  resident,
}: {
  store: SoberHouseSettingsStore;
  nowIso: string;
  resident: ResidentContext | null;
}): SoberHouseDashboardTileSummary {
  if (!resident) {
    return buildHiddenTile("house-meetings", "SOBER_HOUSE", "Upcoming House Meetings");
  }

  const upcomingHouseMeetings = getUpcomingHouseMeetings(store, resident.houseId, nowIso);
  const weekStartIso = startOfWeek(new Date(nowIso)).toISOString();
  const weekEndIso = endOfWeekExclusive(new Date(nowIso)).toISOString();
  const houseMeetingsThisWeek = getHouseMeetingsInRange(
    store,
    resident.houseId,
    weekStartIso,
    weekEndIso,
  );
  const completedKeys = new Set(
    store.houseMeetingAttendanceRecords
      .filter((record) => record.residentId === resident.residentId)
      .map(
        (record) =>
          `${record.recurringObligationId ?? record.houseMeetingId ?? "manual"}:${record.scheduledStartAt}`,
      ),
  );
  const attendedThisWeek = houseMeetingsThisWeek.filter((meeting) =>
    completedKeys.has(`${meeting.recurringObligationId ?? meeting.id}:${meeting.startsAt}`),
  ).length;
  const remainingThisWeek = Math.max(0, houseMeetingsThisWeek.length - attendedThisWeek);
  const enabled =
    resident.rules.operations.houseMeetingsEnabled || upcomingHouseMeetings.length > 0;
  if (!enabled) {
    return buildHiddenTile("house-meetings", "SOBER_HOUSE", "House Meetings");
  }

  const nextMeeting = upcomingHouseMeetings[0] ?? null;
  if (!nextMeeting) {
    return {
      id: "house-meetings",
      title: "House Meetings",
      value: `${attendedThisWeek}/${houseMeetingsThisWeek.length}`,
      subtitle:
        houseMeetingsThisWeek.length > 0
          ? "No more house meetings scheduled this week"
          : "No house meetings scheduled",
      detail:
        houseMeetingsThisWeek.length > 0
          ? "All currently scheduled house meetings for this week are complete."
          : "Your house manager has not posted an upcoming house meeting yet.",
      tone: "gray",
      visible: true,
      routeTarget: "SOBER_HOUSE",
      badgeLabel: null,
    };
  }

  const startsAt = new Date(nextMeeting.startsAt);
  const timeUntilMs = startsAt.getTime() - new Date(nowIso).getTime();
  return {
    id: "house-meetings",
    title: "House Meetings",
    value: `${attendedThisWeek}/${houseMeetingsThisWeek.length}`,
    subtitle: nextMeeting.title,
    detail: `${remainingThisWeek} house meeting${remainingThisWeek === 1 ? "" : "s"} still due • ${formatDateTimeLabel(
      nextMeeting.startsAt,
    )} • ${
      nextMeeting.locationLabel ||
      nextMeeting.description ||
      "Open sober-house details for the full meeting plan."
    }`,
    tone: timeUntilMs <= 12 * 60 * 60 * 1000 ? "yellow" : "gray",
    visible: true,
    routeTarget: "SOBER_HOUSE",
    badgeLabel: nextMeeting.required ? "Required" : humanizeEnum(nextMeeting.meetingKind),
  };
}

function buildOneOnOneTileSummary({
  store,
  nowIso,
  resident,
}: {
  store: SoberHouseSettingsStore;
  nowIso: string;
  resident: ResidentContext | null;
}): SoberHouseDashboardTileSummary {
  if (!resident) {
    return buildHiddenTile("one-on-ones", "SOBER_HOUSE", "One-on-Ones");
  }

  const upcomingSessions = getUpcomingOneOnOneSessions(
    store,
    resident.residentId,
    resident.houseId,
    nowIso,
  );
  const enabled =
    resident.rules.operations.oneOnOneSessionsEnabled ||
    store.residentRequirementProfile?.oneOnOneRequired === true ||
    upcomingSessions.length > 0;
  if (!enabled) {
    return buildHiddenTile("one-on-ones", "SOBER_HOUSE", "One-on-Ones");
  }

  const session = upcomingSessions[0] ?? null;
  if (!session) {
    return {
      id: "one-on-ones",
      title: "One-on-Ones",
      value: "Not set",
      subtitle: "No one-on-one scheduled",
      detail: "Your house support schedule has not posted the next one-on-one yet.",
      tone: store.residentRequirementProfile?.oneOnOneRequired ? "yellow" : "gray",
      visible: true,
      routeTarget: "SOBER_HOUSE",
      badgeLabel: store.residentRequirementProfile?.oneOnOneRequired ? "Required" : null,
    };
  }

  return {
    id: "one-on-ones",
    title: "One-on-Ones",
    value: formatDateTimeLabel(session.scheduledAt),
    subtitle: session.title,
    detail: session.notes.trim() || "Open sober-house details for the assigned one-on-one session.",
    tone: "yellow",
    visible: true,
    routeTarget: "SOBER_HOUSE",
    badgeLabel: session.required ? "Required" : "Scheduled",
  };
}

function buildHouseAlertsTileSummary({
  store,
  nowIso,
  resident,
}: {
  store: SoberHouseSettingsStore;
  nowIso: string;
  resident: ResidentContext | null;
}): SoberHouseDashboardTileSummary {
  if (!resident) {
    return buildHiddenTile("house-alerts", "SOBER_HOUSE", "House Alerts");
  }

  const activeAlerts = getActiveHouseAlertAnnouncements(store, resident.houseId, nowIso);
  const enabled =
    resident.rules.operations.houseAlertsEnabled ||
    resident.rules.operations.announcementsEnabled ||
    activeAlerts.length > 0;
  if (!enabled) {
    return buildHiddenTile("house-alerts", "SOBER_HOUSE", "House Alerts");
  }

  const latestAlert = activeAlerts[0] ?? null;
  if (!latestAlert) {
    return {
      id: "house-alerts",
      title: "House Alerts",
      value: "0",
      subtitle: "No active alerts",
      detail: "There are no active house announcements or alerts right now.",
      tone: "gray",
      visible: true,
      routeTarget: "SOBER_HOUSE",
      badgeLabel: null,
    };
  }

  const tone: SoberHouseDashboardTileTone =
    latestAlert.severity === "URGENT"
      ? "red"
      : latestAlert.severity === "ACTION_REQUIRED"
        ? "yellow"
        : "gray";
  return {
    id: "house-alerts",
    title: "House Alerts",
    value: activeAlerts.length.toString(),
    subtitle: latestAlert.title,
    detail: latestAlert.body,
    tone,
    visible: true,
    routeTarget: "SOBER_HOUSE",
    badgeLabel:
      latestAlert.severity === "URGENT"
        ? "Urgent"
        : latestAlert.acknowledgmentRequired
          ? "Action"
          : "Info",
  };
}

function buildComplianceSnapshotTileSummary({
  complianceSummary,
  resident,
}: {
  complianceSummary: ResidentComplianceSummary | null;
  resident: ResidentContext | null;
}): SoberHouseDashboardTileSummary {
  if (!resident || !resident.rules.operations.complianceSnapshotEnabled) {
    return buildHiddenTile("compliance-snapshot", "SOBER_HOUSE", "Compliance Snapshot");
  }

  if (!complianceSummary) {
    return {
      id: "compliance-snapshot",
      title: "Compliance Snapshot",
      value: "Waiting",
      subtitle: "Compliance engine has not evaluated yet",
      detail: "Compliance status will update after enough resident activity is recorded.",
      tone: "gray",
      visible: true,
      routeTarget: "SOBER_HOUSE",
      badgeLabel: null,
    };
  }

  const actionable = complianceSummary.evaluations.filter(
    (evaluation) => evaluation.status !== "not_applicable",
  );
  const violations = actionable.filter((evaluation) => evaluation.status === "violation").length;
  const atRisk = actionable.filter((evaluation) => evaluation.status === "at_risk").length;
  const incomplete = actionable.filter(
    (evaluation) => evaluation.status === "incomplete_setup",
  ).length;
  const compliant = actionable.filter((evaluation) => evaluation.status === "compliant").length;

  const tone: SoberHouseDashboardTileTone =
    violations > 0 ? "red" : atRisk > 0 ? "yellow" : actionable.length > 0 ? "green" : "gray";
  const subtitle =
    violations > 0
      ? `${violations} item${violations === 1 ? "" : "s"} in violation`
      : atRisk > 0
        ? `${atRisk} item${atRisk === 1 ? "" : "s"} at risk`
        : incomplete > 0
          ? `${incomplete} setup gap${incomplete === 1 ? "" : "s"} remaining`
          : compliant > 0
            ? `${compliant} house requirement${compliant === 1 ? "" : "s"} on track`
            : "No active compliance data";
  const detail =
    violations > 0 || atRisk > 0 || incomplete > 0
      ? `${compliant} compliant • ${atRisk} at risk • ${violations} violations • ${incomplete} setup gaps`
      : "All current sober-house requirements are on track.";

  return {
    id: "compliance-snapshot",
    title: "Compliance Snapshot",
    value: actionable.length.toString(),
    subtitle,
    detail,
    tone,
    visible: true,
    routeTarget: "SOBER_HOUSE",
    badgeLabel:
      violations > 0
        ? "Violation"
        : atRisk > 0
          ? "Attention"
          : incomplete > 0
            ? "Setup"
            : "Good standing",
  };
}

function buildWeeklyMeetingTileSummary({
  nowIso,
  attendanceRecords,
  meetingAttendanceLogs,
  complianceSummary,
  upcomingMeetings,
  resident,
}: {
  nowIso: string;
  attendanceRecords: AttendanceRecordSummary[];
  meetingAttendanceLogs: MeetingAttendanceLogRecord[];
  complianceSummary: ResidentComplianceSummary | null;
  upcomingMeetings: SoberHouseDashboardMeetingPreview[];
  resident: ResidentContext | null;
}): MeetingSummary {
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
    resident.rules.meetings.meetingsRequired && resident.rules.meetings.meetingsPerWeek > 0
      ? resident.rules.meetings.meetingsPerWeek
      : resident.meetingsRequiredCount;
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

function buildSponsorContactTileSummary({
  nowIso,
  sponsorCallLogs,
  resident,
}: {
  nowIso: string;
  sponsorCallLogs: Array<{ id: string; atIso: string; success: boolean }>;
  resident: ResidentContext | null;
}): SoberHouseDashboardTileSummary {
  if (!resident || !resident.rules.sponsorContact.enabled) {
    return buildHiddenTile("sponsor-calls", "SOBER_HOUSE", "Sponsor Check-ins");
  }

  const requiredCount = resident.rules.sponsorContact.contactsRequiredPerWeek;
  if (requiredCount <= 0) {
    return buildHiddenTile("sponsor-calls", "SOBER_HOUSE", "Sponsor Check-ins");
  }
  if (!resident.sponsorPresent) {
    return {
      id: "sponsor-calls",
      title: "Sponsor Check-ins",
      value: "Setup",
      subtitle: "Sponsor details still need to be added",
      detail:
        "Sponsor check-ins are required by house rules, but sponsor details are not on file yet.",
      tone: "yellow",
      visible: true,
      routeTarget: "SOBER_HOUSE",
      badgeLabel: "Setup needed",
    };
  }

  const now = new Date(nowIso);
  const weekStart = startOfWeek(now).getTime();
  const weekEnd = endOfWeekExclusive(now).getTime();
  const completedCount = countSponsorCallsInRange(sponsorCallLogs, weekStart, weekEnd);
  const remainingCount = Math.max(0, requiredCount - completedCount);
  const weekdayIndex = (now.getDay() + 6) % 7;
  const expectedPace = Math.floor(((weekdayIndex + 1) / 7) * requiredCount);
  const behindPace = remainingCount > 0 && completedCount < expectedPace;

  return {
    id: "sponsor-calls",
    title: "Sponsor Check-ins",
    value: `${completedCount}/${requiredCount}`,
    subtitle:
      remainingCount === 0
        ? "Sponsor requirement met"
        : `${remainingCount} sponsor call${remainingCount === 1 ? "" : "s"} left this week`,
    detail: "Log sponsor calls from the recovery dashboard or the sober-house action flow.",
    tone: remainingCount === 0 ? "green" : behindPace ? "yellow" : "gray",
    visible: true,
    routeTarget: "SOBER_HOUSE",
    badgeLabel:
      remainingCount === 0 ? "On track" : behindPace ? "Behind pace" : `Req ${requiredCount}`,
  };
}

function buildRequirementsTileSummary({
  resident,
  routineSummary,
  houseAlertsTile,
  complianceSnapshotTile,
}: {
  resident: ResidentContext | null;
  routineSummary: ReturnType<typeof buildSoberHouseRoutineSummary>;
  houseAlertsTile: SoberHouseDashboardTileSummary;
  complianceSnapshotTile: SoberHouseDashboardTileSummary;
}): SoberHouseDashboardTileSummary {
  if (!resident || !routineSummary) {
    return buildHiddenTile("sober-house-requirements", "SOBER_HOUSE", "Sober House Routine");
  }

  const completedLabel = `${routineSummary.completedRequiredCount}/${routineSummary.totalRequiredCount}`;
  const detailBits = [
    `${completedLabel} required task${routineSummary.totalRequiredCount === 1 ? "" : "s"} complete`,
    `${routineSummary.openRequiredCount} open`,
  ];
  if (routineSummary.overdueCount > 0) {
    detailBits.push(`${routineSummary.overdueCount} overdue`);
  }

  return {
    id: "sober-house-requirements",
    title: "Sober House Routine",
    value: `${routineSummary.percentComplete}%`,
    subtitle:
      routineSummary.openRequiredCount === 0
        ? "All required sober-house tasks are complete"
        : `${routineSummary.openRequiredCount} open • ${routineSummary.overdueCount} overdue`,
    detail: `Open the resident-safe routine to complete chores, applications, house meetings, and proof-based items. ${detailBits.join(" • ")}.`,
    tone:
      routineSummary.overdueCount > 0 ||
      houseAlertsTile.tone === "red" ||
      complianceSnapshotTile.tone === "red"
        ? "red"
        : routineSummary.openRequiredCount === 0
          ? "green"
          : "yellow",
    visible: true,
    routeTarget: "SOBER_HOUSE",
    badgeLabel:
      routineSummary.openRequiredCount === 0
        ? "On track"
        : routineSummary.overdueCount > 0
          ? `${routineSummary.overdueCount} overdue`
          : `${routineSummary.openRequiredCount} open`,
  };
}

function buildJobApplicationsTileSummary({
  store,
  nowIso,
  resident,
}: {
  store: SoberHouseSettingsStore;
  nowIso: string;
  resident: ResidentContext | null;
}): SoberHouseDashboardTileSummary {
  if (!resident) {
    return buildHiddenTile("job-applications", "SOBER_HOUSE", "Job Applications");
  }

  const employmentRequired = resident.workRequired || resident.rules.employment.employmentRequired;
  const requiredCount = resident.currentlyEmployed
    ? 0
    : Math.max(
        resident.jobApplicationsRequiredPerWeek,
        resident.rules.jobSearch.applicationsRequiredPerWeek,
      );
  if (!employmentRequired || resident.currentlyEmployed || requiredCount <= 0) {
    return buildHiddenTile("job-applications", "SOBER_HOUSE", "Job Applications");
  }

  const weekStart = startOfWeek(new Date(nowIso)).getTime();
  const weekEnd = endOfWeekExclusive(new Date(nowIso)).getTime();
  const completedCount = store.jobApplicationRecords.filter((record) => {
    if (record.residentId !== resident.residentId) {
      return false;
    }
    const appliedAtMs = toTimestamp(record.appliedAt);
    if (appliedAtMs === null || appliedAtMs < weekStart || appliedAtMs >= weekEnd) {
      return false;
    }
    return (
      !resident.rules.jobSearch.proofRequired ||
      record.proofProvided ||
      Boolean(record.proofReference)
    );
  }).length;
  const remainingCount = Math.max(0, requiredCount - completedCount);

  return {
    id: "job-applications",
    title: "Job Applications",
    value: `${completedCount}/${requiredCount}`,
    subtitle:
      remainingCount === 0
        ? "Weekly application target met"
        : `${remainingCount} application${remainingCount === 1 ? "" : "s"} left this week`,
    detail: resident.rules.jobSearch.proofRequired
      ? "Attach photo proof when you submit each application."
      : "Log submitted applications from the sober-house checklist.",
    tone: remainingCount === 0 ? "green" : completedCount > 0 ? "yellow" : "gray",
    visible: true,
    routeTarget: "SOBER_HOUSE",
    badgeLabel: remainingCount === 0 ? "On track" : `Req ${requiredCount}`,
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
  houseMeetingsTile,
  oneOnOneTile,
  houseAlertsTile,
}: {
  store: SoberHouseSettingsStore;
  nowIso: string;
  resident: ResidentContext | null;
  choreTile: ChoreSummary;
  weeklyMeetingTile: MeetingSummary;
  houseMeetingsTile: SoberHouseDashboardTileSummary;
  oneOnOneTile: SoberHouseDashboardTileSummary;
  houseAlertsTile: SoberHouseDashboardTileSummary;
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
  const nextHouseMeeting = getUpcomingHouseMeetings(store, resident.houseId, nowIso)[0] ?? null;
  if (nextHouseMeeting) {
    candidates.push({
      dueAtMs: toTimestamp(nextHouseMeeting.startsAt) ?? now.getTime(),
      dueAtLabel: formatDateTimeLabel(nextHouseMeeting.startsAt),
      title: "Upcoming house meeting",
      subtitle: nextHouseMeeting.title,
      detail:
        nextHouseMeeting.locationLabel || nextHouseMeeting.description || houseMeetingsTile.detail,
      tone: houseMeetingsTile.tone,
      badgeLabel: nextHouseMeeting.required ? "Required" : houseMeetingsTile.badgeLabel,
    });
  }
  const explicitOneOnOne =
    getUpcomingOneOnOneSessions(store, resident.residentId, resident.houseId, nowIso)[0] ?? null;
  if (explicitOneOnOne) {
    candidates.push({
      dueAtMs: toTimestamp(explicitOneOnOne.scheduledAt) ?? now.getTime(),
      dueAtLabel: formatDateTimeLabel(explicitOneOnOne.scheduledAt),
      title: "Upcoming one-on-one",
      subtitle: explicitOneOnOne.title,
      detail: explicitOneOnOne.notes || oneOnOneTile.detail,
      tone: oneOnOneTile.tone,
      badgeLabel: explicitOneOnOne.required ? "Required" : oneOnOneTile.badgeLabel,
    });
  }
  const activeAnnouncement =
    getActiveHouseAlertAnnouncements(store, resident.houseId, nowIso)[0] ?? null;
  if (activeAnnouncement) {
    candidates.push({
      dueAtMs: toTimestamp(activeAnnouncement.startsAt) ?? now.getTime(),
      dueAtLabel: formatDateTimeLabel(activeAnnouncement.startsAt),
      title: "House alert",
      subtitle: activeAnnouncement.title,
      detail: activeAnnouncement.body || houseAlertsTile.detail,
      tone: houseAlertsTile.tone,
      badgeLabel: houseAlertsTile.badgeLabel,
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
  const routineSummary = buildSoberHouseRoutineSummary({
    store: context.store,
    nowIso: context.nowIso,
    attendanceRecords: context.attendanceRecords,
    meetingAttendanceLogs: context.meetingAttendanceLogs,
    sponsorCallLogs: context.sponsorCallLogs,
  });
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
  const sponsorContactTile = buildSponsorContactTileSummary({
    nowIso: context.nowIso,
    sponsorCallLogs: context.sponsorCallLogs,
    resident,
  });
  const jobApplicationsTile = buildJobApplicationsTileSummary({
    store: context.store,
    nowIso: context.nowIso,
    resident,
  });
  const houseScheduleTile = buildHouseScheduleTileSummary({
    store: context.store,
    nowIso: context.nowIso,
    resident,
    choreTile,
    weeklyMeetingTile,
    houseMeetingsTile: buildHouseMeetingsTileSummary({
      store: context.store,
      nowIso: context.nowIso,
      resident,
    }),
    oneOnOneTile: buildOneOnOneTileSummary({
      store: context.store,
      nowIso: context.nowIso,
      resident,
    }),
    houseAlertsTile: buildHouseAlertsTileSummary({
      store: context.store,
      nowIso: context.nowIso,
      resident,
    }),
  });
  const houseMeetingsTile = buildHouseMeetingsTileSummary({
    store: context.store,
    nowIso: context.nowIso,
    resident,
  });
  const oneOnOneTile = buildOneOnOneTileSummary({
    store: context.store,
    nowIso: context.nowIso,
    resident,
  });
  const houseAlertsTile = buildHouseAlertsTileSummary({
    store: context.store,
    nowIso: context.nowIso,
    resident,
  });
  const complianceSnapshotTile = buildComplianceSnapshotTileSummary({
    complianceSummary: context.complianceSummary,
    resident,
  });
  const requirementsTile = buildRequirementsTileSummary({
    resident,
    routineSummary,
    houseAlertsTile,
    complianceSnapshotTile,
  });
  const visibility: SoberHouseDashboardVisibility = {
    eligible: resident !== null,
    showRequirementsTile: requirementsTile.visible,
    showChoreTile: choreTile.visible,
    showWeeklyMeetingTile: weeklyMeetingTile.visible,
    showSponsorContactTile: sponsorContactTile.visible,
    showJobApplicationsTile: jobApplicationsTile.visible,
    showHouseMeetingsTile: houseMeetingsTile.visible,
    showOneOnOneTile: oneOnOneTile.visible,
    showHouseAlertsTile: houseAlertsTile.visible,
    showComplianceSnapshotTile: complianceSnapshotTile.visible,
    showHouseScheduleTile: houseScheduleTile.visible,
  };

  return {
    visibility,
    requirementsTile,
    choreTile,
    weeklyMeetingTile,
    sponsorContactTile,
    jobApplicationsTile,
    houseMeetingsTile,
    oneOnOneTile,
    houseAlertsTile,
    complianceSnapshotTile,
    houseScheduleTile,
    tiles: [
      requirementsTile,
      choreTile,
      weeklyMeetingTile,
      sponsorContactTile,
      jobApplicationsTile,
      houseMeetingsTile,
      oneOnOneTile,
      houseAlertsTile,
      complianceSnapshotTile,
      houseScheduleTile,
    ].filter((tile) => tile.visible),
  };
}
