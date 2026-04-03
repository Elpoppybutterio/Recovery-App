import type { AttendanceRecordSummary, MeetingAttendanceLogRecord } from "../attendance/storage";
import { upsertEvidenceItem } from "./mutations";
import {
  choreRequiresManagerConfirmation,
  choreRequiresPhotoProof,
  formatChoreProofModeLabel,
  isChoreCompletionVerified,
  resolveChoreCompletionWorkflowStatus,
  resolveChoreProofMode,
} from "./proof";
import {
  getHouseById,
  getHouseChoresForResident,
  getHouseMeetingsInRange,
  getRuleSetForHouse,
} from "./selectors";
import type {
  AuditActor,
  ChoreFrequency,
  ChoreCompletionRecord,
  HouseChore,
  HouseRuleSet,
  ResidentHousingProfile,
  SoberHouseSettingsStore,
} from "./types";

export type SoberHouseRoutineTaskStatus =
  | "due"
  | "completed"
  | "overdue"
  | "setup"
  | "info"
  | "pending";
export type SoberHouseRoutineTaskKind =
  | "meetings"
  | "sponsor_calls"
  | "chores"
  | "job_applications"
  | "house_meeting"
  | "curfew"
  | "work_verification";

export type SoberHouseRoutineTask = {
  id: string;
  kind: SoberHouseRoutineTaskKind;
  title: string;
  detail: string;
  status: SoberHouseRoutineTaskStatus;
  locked: boolean;
  countsTowardProgress: boolean;
  requiredCount: number;
  completedCount: number;
  dueLabel: string | null;
  dueAtIso: string | null;
  requiresProof: boolean;
  proofLabel: string | null;
  actionLabel: string | null;
  statusLabel: string;
  sourceLabel: string;
  proofMode: ReturnType<typeof resolveChoreProofMode> | null;
  workflowStatus: ReturnType<typeof resolveChoreCompletionWorkflowStatus> | null;
  managerConfirmationRequired: boolean;
  houseChoreId: string | null;
  houseMeetingId: string | null;
  recurringObligationId: string | null;
};

export type SoberHouseRoutineSummary = {
  residentId: string;
  houseId: string;
  houseName: string;
  tasks: SoberHouseRoutineTask[];
  totalRequiredCount: number;
  completedRequiredCount: number;
  openRequiredCount: number;
  overdueCount: number;
  percentComplete: number;
};

export type SoberHouseRoutineProofRecordType = "CHORE" | "JOB_APPLICATION";

type RoutineContext = {
  store: SoberHouseSettingsStore;
  nowIso: string;
  attendanceRecords: AttendanceRecordSummary[];
  meetingAttendanceLogs: MeetingAttendanceLogRecord[];
  sponsorCallLogs: Array<{ id: string; atIso: string; success: boolean }>;
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

function sameCalendarDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
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

function formatDateLabel(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sourceLabel(_ruleSet: HouseRuleSet, label: string): string {
  return `${label} requirement`;
}

function latestCompletionForRecords(
  records: ChoreCompletionRecord[],
  predicate: (record: ChoreCompletionRecord) => boolean,
): ChoreCompletionRecord | null {
  return (
    records
      .filter(predicate)
      .sort(
        (left, right) =>
          (toTimestamp(right.completedAt) ?? 0) - (toTimestamp(left.completedAt) ?? 0),
      )[0] ?? null
  );
}

function buildChoreTaskPresentation(input: {
  proofRequirement: HouseChore["proofRequirement"];
  latestCompletion: ChoreCompletionRecord | null;
  overdue: boolean;
  defaultDueLabel: string;
}): Pick<
  SoberHouseRoutineTask,
  | "status"
  | "completedCount"
  | "requiresProof"
  | "proofLabel"
  | "actionLabel"
  | "statusLabel"
  | "proofMode"
  | "workflowStatus"
  | "managerConfirmationRequired"
> {
  const proofMode = resolveChoreProofMode(input.proofRequirement);
  const workflowStatus = resolveChoreCompletionWorkflowStatus(input.latestCompletion);
  const managerConfirmationRequired = choreRequiresManagerConfirmation(input.proofRequirement);
  const requiresProof = choreRequiresPhotoProof(input.proofRequirement);
  const verified = input.latestCompletion
    ? isChoreCompletionVerified(input.latestCompletion)
    : false;

  if (verified) {
    return {
      status: "completed",
      completedCount: 1,
      requiresProof,
      proofLabel: formatChoreProofModeLabel(input.proofRequirement),
      actionLabel: null,
      statusLabel: "Completed",
      proofMode,
      workflowStatus,
      managerConfirmationRequired,
    };
  }

  if (workflowStatus === "proof_attached" || workflowStatus === "awaiting_manager_confirmation") {
    return {
      status: "pending",
      completedCount: 0,
      requiresProof,
      proofLabel: formatChoreProofModeLabel(input.proofRequirement),
      actionLabel: null,
      statusLabel: "Awaiting manager",
      proofMode,
      workflowStatus,
      managerConfirmationRequired,
    };
  }

  return {
    status: input.overdue ? "overdue" : "due",
    completedCount: 0,
    requiresProof,
    proofLabel: formatChoreProofModeLabel(input.proofRequirement),
    actionLabel:
      proofMode === "PHOTO" || proofMode === "PHOTO_MANAGER_CONFIRMATION"
        ? "Complete with photo"
        : proofMode === "MANAGER_CONFIRMATION"
          ? "Submit for manager review"
          : "Post completion",
    statusLabel:
      workflowStatus === "proof_required"
        ? "Proof required"
        : input.overdue
          ? "Overdue"
          : input.defaultDueLabel,
    proofMode,
    workflowStatus,
    managerConfirmationRequired,
  };
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
  const house = getHouseById(store, housing.houseId);
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
    rules: getRuleSetForHouse(store, housing.houseId, nowIso),
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

export function attachSoberHouseRoutineProof({
  store,
  actor,
  housingProfile,
  task,
  proofUris,
  timestamp,
  completionRecordId,
  completionRecordType,
}: {
  store: SoberHouseSettingsStore;
  actor: AuditActor;
  housingProfile: ResidentHousingProfile;
  task: SoberHouseRoutineTask;
  proofUris: string[];
  timestamp: string;
  completionRecordId: string;
  completionRecordType: SoberHouseRoutineProofRecordType;
}): SoberHouseSettingsStore {
  if (proofUris.length === 0) {
    return store;
  }

  let workingStore = store;
  proofUris.forEach((uri, index) => {
    workingStore = upsertEvidenceItem(
      workingStore,
      actor,
      {
        residentId: housingProfile.residentId,
        linkedUserId: housingProfile.linkedUserId,
        organizationId: housingProfile.organizationId,
        houseId: housingProfile.houseId,
        linkedViolationId: null,
        linkedCorrectiveActionId: null,
        evidenceType: "PHOTO",
        assetReference: uri,
        createdAt: timestamp,
        createdBy: actor,
        description: `${task.title} proof ${index + 1}`,
        metadata: {
          completionRecordId,
          completionRecordType,
          proofIndex: index,
          routineTaskId: task.id,
          routineTaskKind: task.kind,
          houseChoreId: task.houseChoreId,
          houseMeetingId: task.houseMeetingId,
          recurringObligationId: task.recurringObligationId,
        },
      },
      timestamp,
    ).store;
  });
  return workingStore;
}

export function buildSoberHouseRoutineSummary(
  context: RoutineContext,
): SoberHouseRoutineSummary | null {
  const resident = resolveResidentContext(context.store, context.nowIso);
  if (!resident) {
    return null;
  }

  const now = new Date(context.nowIso);
  const weekStart = startOfWeek(now).getTime();
  const weekEnd = endOfWeekExclusive(now).getTime();
  const tasks: SoberHouseRoutineTask[] = [];

  const meetingsRequired =
    resident.rules.meetings.meetingsRequired && resident.rules.meetings.meetingsPerWeek > 0
      ? resident.rules.meetings.meetingsPerWeek
      : resident.meetingsRequiredWeekly
        ? resident.meetingsRequiredCount
        : 0;
  if (meetingsRequired > 0) {
    const completedCount = countMeetingsInRange(
      context.attendanceRecords,
      context.meetingAttendanceLogs,
      weekStart,
      weekEnd,
    );
    const remainingCount = Math.max(0, meetingsRequired - completedCount);
    tasks.push({
      id: "routine-meetings",
      kind: "meetings",
      title: "Meetings goal",
      detail: `${completedCount}/${meetingsRequired} logged this week from your house requirements.`,
      status: remainingCount === 0 ? "completed" : "due",
      locked: true,
      countsTowardProgress: true,
      requiredCount: meetingsRequired,
      completedCount,
      dueLabel: "This week",
      dueAtIso: new Date(weekEnd).toISOString(),
      requiresProof: true,
      proofLabel: `Proof: ${resident.rules.meetings.proofMethod.replaceAll("_", " ").toLowerCase()}`,
      actionLabel: null,
      statusLabel:
        remainingCount === 0
          ? "Completed"
          : `${remainingCount} meeting${remainingCount === 1 ? "" : "s"} left`,
      sourceLabel: sourceLabel(resident.rules, "Meeting"),
      proofMode: null,
      workflowStatus: null,
      managerConfirmationRequired: false,
      houseChoreId: null,
      houseMeetingId: null,
      recurringObligationId: null,
    });
  }

  if (
    resident.rules.sponsorContact.enabled &&
    resident.rules.sponsorContact.contactsRequiredPerWeek > 0
  ) {
    const requiredCount = resident.rules.sponsorContact.contactsRequiredPerWeek;
    const completedCount = resident.sponsorPresent
      ? countSponsorCallsInRange(context.sponsorCallLogs, weekStart, weekEnd)
      : 0;
    const remainingCount = Math.max(0, requiredCount - completedCount);
    tasks.push({
      id: "routine-sponsor-calls",
      kind: "sponsor_calls",
      title: "Sponsor calls",
      detail: resident.sponsorPresent
        ? `${completedCount}/${requiredCount} sponsor calls logged this week.`
        : "Sponsor details still need to be on file before this requirement can be completed.",
      status: !resident.sponsorPresent ? "setup" : remainingCount === 0 ? "completed" : "due",
      locked: true,
      countsTowardProgress: true,
      requiredCount,
      completedCount,
      dueLabel: "This week",
      dueAtIso: new Date(weekEnd).toISOString(),
      requiresProof: resident.rules.sponsorContact.proofType !== "CALL_LOG",
      proofLabel: `Proof: ${resident.rules.sponsorContact.proofType.replaceAll("_", " ").toLowerCase()}`,
      actionLabel: null,
      statusLabel: !resident.sponsorPresent
        ? "Setup needed"
        : remainingCount === 0
          ? "Completed"
          : `${remainingCount} sponsor call${remainingCount === 1 ? "" : "s"} left`,
      sourceLabel: sourceLabel(resident.rules, "Sponsor"),
      proofMode: null,
      workflowStatus: null,
      managerConfirmationRequired: false,
      houseChoreId: null,
      houseMeetingId: null,
      recurringObligationId: null,
    });
  }

  if (resident.rules.chores.enabled) {
    const explicitChores = getHouseChoresForResident(
      context.store,
      resident.residentId,
      resident.houseId,
    );
    const choresDueToday = explicitChores.filter((chore) => isExplicitChoreDueToday(chore, now));
    if (choresDueToday.length > 0) {
      for (const chore of choresDueToday) {
        const dueAt = parseTimeOnDate(now, chore.dueTimeLocalHhmm);
        const latestCompletion = latestCompletionForRecords(
          context.store.choreCompletionRecords,
          (record) => {
            if (record.residentId !== resident.residentId || record.houseChoreId !== chore.id) {
              return false;
            }
            const completedAtMs = toTimestamp(record.completedAt);
            return completedAtMs !== null && sameCalendarDate(new Date(completedAtMs), now);
          },
        );
        const overdue = Boolean(
          dueAt &&
          now.getTime() > dueAt.getTime() &&
          !(latestCompletion ? isChoreCompletionVerified(latestCompletion) : false),
        );
        const taskPresentation = buildChoreTaskPresentation({
          proofRequirement: chore.proofRequirement,
          latestCompletion,
          overdue,
          defaultDueLabel: "Due today",
        });
        tasks.push({
          id: `routine-chore-${chore.id}`,
          kind: "chores",
          title: chore.title,
          detail: chore.summary || "Complete the assigned chore and post completion here.",
          status: taskPresentation.status,
          locked: true,
          countsTowardProgress: true,
          requiredCount: 1,
          completedCount: taskPresentation.completedCount,
          dueLabel: dueAt ? formatTimeLabel(chore.dueTimeLocalHhmm) : "Today",
          dueAtIso: dueAt?.toISOString() ?? null,
          requiresProof: taskPresentation.requiresProof,
          proofLabel: taskPresentation.proofLabel,
          actionLabel: taskPresentation.actionLabel,
          statusLabel: taskPresentation.statusLabel,
          sourceLabel: "Chore assignment",
          proofMode: taskPresentation.proofMode,
          workflowStatus: taskPresentation.workflowStatus,
          managerConfirmationRequired: taskPresentation.managerConfirmationRequired,
          houseChoreId: chore.id,
          houseMeetingId: null,
          recurringObligationId: null,
        });
      }
    } else {
      const period = getChorePeriodBounds(
        now,
        resident.rules.chores.frequency,
        resident.moveInDate,
      );
      const latestCompletion = latestCompletionForRecords(
        context.store.choreCompletionRecords,
        (record) => {
          if (record.residentId !== resident.residentId || record.houseChoreId !== null) {
            return false;
          }
          const completedAtMs = toTimestamp(record.completedAt);
          return (
            completedAtMs !== null &&
            completedAtMs >= period.start.getTime() &&
            completedAtMs < period.endExclusive.getTime()
          );
        },
      );
      const dueAt = parseTimeOnDate(period.dueBaseDate, resident.rules.chores.dueTime);
      const overdue = Boolean(
        dueAt &&
        now.getTime() > dueAt.getTime() &&
        !(latestCompletion ? isChoreCompletionVerified(latestCompletion) : false),
      );
      const taskPresentation = buildChoreTaskPresentation({
        proofRequirement: resident.rules.chores.proofRequirement,
        latestCompletion,
        overdue,
        defaultDueLabel: "Required",
      });
      tasks.push({
        id: "routine-generic-chore",
        kind: "chores",
        title: "House chore",
        detail:
          resident.assignedChoreNotes ||
          `Complete your ${resident.rules.chores.frequency.toLowerCase()} chore cycle here.`,
        status: taskPresentation.status,
        locked: true,
        countsTowardProgress: true,
        requiredCount: 1,
        completedCount: taskPresentation.completedCount,
        dueLabel: dueAt ? formatDateLabel(dueAt.toISOString()) : resident.rules.chores.frequency,
        dueAtIso: dueAt?.toISOString() ?? null,
        requiresProof: taskPresentation.requiresProof,
        proofLabel: taskPresentation.proofLabel,
        actionLabel: taskPresentation.actionLabel,
        statusLabel: taskPresentation.statusLabel,
        sourceLabel: sourceLabel(resident.rules, "Chore"),
        proofMode: taskPresentation.proofMode,
        workflowStatus: taskPresentation.workflowStatus,
        managerConfirmationRequired: taskPresentation.managerConfirmationRequired,
        houseChoreId: null,
        houseMeetingId: null,
        recurringObligationId: null,
      });
    }
  }

  const jobApplicationsRequired =
    !resident.currentlyEmployed && resident.workRequired
      ? Math.max(
          resident.jobApplicationsRequiredPerWeek,
          resident.rules.jobSearch.applicationsRequiredPerWeek,
        )
      : 0;
  if (jobApplicationsRequired > 0) {
    const completedCount = context.store.jobApplicationRecords.filter((record) => {
      if (record.residentId !== resident.residentId) {
        return false;
      }
      const appliedAt = toTimestamp(record.appliedAt);
      if (appliedAt === null || appliedAt < weekStart || appliedAt >= weekEnd) {
        return false;
      }
      return (
        !resident.rules.jobSearch.proofRequired ||
        record.proofProvided ||
        Boolean(record.proofReference)
      );
    }).length;
    const remainingCount = Math.max(0, jobApplicationsRequired - completedCount);
    tasks.push({
      id: "routine-job-applications",
      kind: "job_applications",
      title: "Job applications",
      detail: `${completedCount}/${jobApplicationsRequired} applications logged this week.`,
      status: remainingCount === 0 ? "completed" : "due",
      locked: true,
      countsTowardProgress: true,
      requiredCount: jobApplicationsRequired,
      completedCount,
      dueLabel: "This week",
      dueAtIso: new Date(weekEnd).toISOString(),
      requiresProof: resident.rules.jobSearch.proofRequired,
      proofLabel: resident.rules.jobSearch.proofRequired ? "Photo proof required" : null,
      actionLabel:
        remainingCount === 0
          ? null
          : resident.rules.jobSearch.proofRequired
            ? "Upload proof"
            : "Log application",
      statusLabel:
        remainingCount === 0
          ? "Completed"
          : `${remainingCount} application${remainingCount === 1 ? "" : "s"} left`,
      sourceLabel: sourceLabel(resident.rules, "Job application"),
      proofMode: null,
      workflowStatus: null,
      managerConfirmationRequired: false,
      houseChoreId: null,
      houseMeetingId: null,
      recurringObligationId: null,
    });
  }

  const houseMeetingsThisWeek = getHouseMeetingsInRange(
    context.store,
    resident.houseId,
    new Date(weekStart).toISOString(),
    new Date(weekEnd).toISOString(),
  ).filter((meeting) => meeting.required);
  const attendedKeys = new Set(
    context.store.houseMeetingAttendanceRecords
      .filter((record) => record.residentId === resident.residentId)
      .map(
        (record) =>
          `${record.recurringObligationId ?? record.houseMeetingId ?? "manual"}:${record.scheduledStartAt}`,
      ),
  );
  for (const meeting of houseMeetingsThisWeek) {
    const key = `${meeting.recurringObligationId ?? meeting.id}:${meeting.startsAt}`;
    const attended = attendedKeys.has(key);
    const startsAt = new Date(meeting.startsAt);
    tasks.push({
      id: `routine-house-meeting-${key}`,
      kind: "house_meeting",
      title: meeting.title,
      detail: `${meeting.locationLabel || "House location"} • ${formatDateLabel(meeting.startsAt)}`,
      status: attended ? "completed" : startsAt.getTime() < now.getTime() ? "overdue" : "due",
      locked: true,
      countsTowardProgress: true,
      requiredCount: 1,
      completedCount: attended ? 1 : 0,
      dueLabel: formatDateLabel(meeting.startsAt),
      dueAtIso: meeting.startsAt,
      requiresProof: false,
      proofLabel: null,
      actionLabel: attended ? null : "Mark attended",
      statusLabel: attended
        ? "Completed"
        : startsAt.getTime() < now.getTime()
          ? "Overdue"
          : "Scheduled",
      sourceLabel: "House meeting requirement",
      proofMode: null,
      workflowStatus: null,
      managerConfirmationRequired: false,
      houseChoreId: null,
      houseMeetingId: meeting.id,
      recurringObligationId: meeting.recurringObligationId,
    });
  }

  if (resident.rules.curfew.enabled) {
    const curfewTime =
      now.getDay() === 5
        ? resident.rules.curfew.fridayCurfew
        : now.getDay() === 6
          ? resident.rules.curfew.saturdayCurfew
          : now.getDay() === 0
            ? resident.rules.curfew.sundayCurfew
            : resident.rules.curfew.weekdayCurfew;
    const curfewAt = parseTimeOnDate(now, curfewTime);
    tasks.push({
      id: "routine-curfew",
      kind: "curfew",
      title: "Curfew accountability",
      detail:
        resident.standingExceptionNotes ||
        "Curfew is tracked automatically from your assigned house rules.",
      status: "info",
      locked: true,
      countsTowardProgress: false,
      requiredCount: 0,
      completedCount: 0,
      dueLabel: curfewAt ? formatTimeLabel(curfewTime) : curfewTime,
      dueAtIso: curfewAt?.toISOString() ?? null,
      requiresProof: false,
      proofLabel: null,
      actionLabel: null,
      statusLabel: "Auto-tracked",
      sourceLabel: sourceLabel(resident.rules, "Curfew"),
      proofMode: null,
      workflowStatus: null,
      managerConfirmationRequired: false,
      houseChoreId: null,
      houseMeetingId: null,
      recurringObligationId: null,
    });
  }

  if (
    resident.workRequired &&
    resident.currentlyEmployed &&
    resident.rules.employment.workplaceVerificationEnabled
  ) {
    const dayStart = startOfDay(now).getTime();
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const completedToday = context.store.workVerificationRecords.some((record) => {
      if (record.residentId !== resident.residentId) {
        return false;
      }
      const verifiedAt = toTimestamp(record.verifiedAt);
      return verifiedAt !== null && verifiedAt >= dayStart && verifiedAt < dayEnd.getTime();
    });
    tasks.push({
      id: "routine-work-verification",
      kind: "work_verification",
      title: "Work accountability",
      detail: "Post work/location accountability after your shift when house rules require it.",
      status: completedToday ? "completed" : "due",
      locked: true,
      countsTowardProgress: false,
      requiredCount: 0,
      completedCount: 0,
      dueLabel: "Today",
      dueAtIso: null,
      requiresProof: false,
      proofLabel: null,
      actionLabel: completedToday ? null : "Post completion",
      statusLabel: completedToday ? "Completed today" : "Available",
      sourceLabel: sourceLabel(resident.rules, "Work"),
      proofMode: null,
      workflowStatus: null,
      managerConfirmationRequired: false,
      houseChoreId: null,
      houseMeetingId: null,
      recurringObligationId: null,
    });
  }

  const countableTasks = tasks.filter((task) => task.countsTowardProgress);
  const completedRequiredCount = countableTasks.filter(
    (task) => task.status === "completed",
  ).length;
  const overdueCount = countableTasks.filter((task) => task.status === "overdue").length;
  const totalRequiredCount = countableTasks.length;
  const openRequiredCount = countableTasks.filter((task) => task.status !== "completed").length;
  const percentComplete =
    totalRequiredCount === 0
      ? 100
      : Math.round((completedRequiredCount / totalRequiredCount) * 100);

  return {
    residentId: resident.residentId,
    houseId: resident.houseId,
    houseName: resident.houseName,
    tasks,
    totalRequiredCount,
    completedRequiredCount,
    openRequiredCount,
    overdueCount,
    percentComplete,
  };
}
