import { getHouseById, getRuleSetForHouse, getStaffAssignmentById } from "./selectors";
import type {
  ResidentRequirementProfile,
  ResidentWizardDraft,
  ScheduledFrequency,
  ScheduledWeekdayCode,
  SoberHouseSettingsStore,
} from "./types";

export type SoberHouseScheduledObligationType =
  | "ONE_ON_ONE"
  | "CURFEW_REMINDER"
  | "CHORE_DEADLINE"
  | "MEETING_TARGET";

export type SoberHouseCalendarEventPlan = {
  fingerprint: string;
  title: string;
  notes: string;
  startDate: Date;
  endDate: Date;
  alarms: Array<{ relativeOffset: number }>;
};

export type SoberHouseReminderPlan = {
  fingerprint: string;
  fireAt: Date;
  title: string;
  body: string;
  obligationType: SoberHouseScheduledObligationType;
};

export type SoberHouseScheduledObligationSummary = {
  obligationType: SoberHouseScheduledObligationType;
  title: string;
  subtitle: string;
  detail: string;
  startsAtIso: string;
  dueLabel: string;
  tone: "green" | "yellow" | "red" | "gray";
};

export const SCHEDULED_WEEKDAY_OPTIONS: Array<{
  value: ScheduledWeekdayCode;
  label: string;
  jsDay: number;
}> = [
  { value: "MON", label: "Mon", jsDay: 1 },
  { value: "TUE", label: "Tue", jsDay: 2 },
  { value: "WED", label: "Wed", jsDay: 3 },
  { value: "THU", label: "Thu", jsDay: 4 },
  { value: "FRI", label: "Fri", jsDay: 5 },
  { value: "SAT", label: "Sat", jsDay: 6 },
  { value: "SUN", label: "Sun", jsDay: 0 },
];

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

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function sameOrFutureDate(date: Date, now: Date): boolean {
  return date.getTime() >= now.getTime() - 60_000;
}

function humanizeFrequency(frequency: ScheduledFrequency): string {
  return frequency === "BIWEEKLY"
    ? "Bi-weekly"
    : frequency.charAt(0) + frequency.slice(1).toLowerCase();
}

export function isOneOnOneApplicable(
  store: SoberHouseSettingsStore,
  input:
    | { houseId: string | null; oneOnOneRequired?: boolean | null }
    | ResidentRequirementProfile
    | ResidentWizardDraft,
): boolean {
  const houseId =
    "assignedHouseId" in input ? input.assignedHouseId : "houseId" in input ? input.houseId : null;
  const explicitRequired =
    "oneOnOneRequired" in input && typeof input.oneOnOneRequired === "boolean"
      ? input.oneOnOneRequired
      : false;
  if (explicitRequired) {
    return true;
  }
  if (!houseId) {
    return false;
  }
  const rules = getRuleSetForHouse(store, houseId, new Date().toISOString());
  return rules.oneOnOne.enabled;
}

export function nextOccurrenceForOneOnOne(input: {
  nowIso: string;
  frequency: ScheduledFrequency;
  weekday: ScheduledWeekdayCode | null;
  scheduledDate: string | null;
  timeLocalHhmm: string;
}): Date | null {
  const now = new Date(input.nowIso);
  if (Number.isNaN(now.getTime())) {
    return null;
  }

  if (input.frequency === "ONCE") {
    if (!input.scheduledDate) {
      return null;
    }
    const base = parseTimeOnDate(new Date(`${input.scheduledDate}T00:00:00`), input.timeLocalHhmm);
    return base && sameOrFutureDate(base, now) ? base : null;
  }

  const weekday = SCHEDULED_WEEKDAY_OPTIONS.find((option) => option.value === input.weekday);
  if (!weekday) {
    return null;
  }

  const candidates: Date[] = [];
  const iterationLimit = input.frequency === "MONTHLY" ? 12 : 10;
  for (let index = 0; index < iterationLimit; index += 1) {
    let base = input.frequency === "MONTHLY" ? addMonths(startOfWeek(now), index) : new Date(now);
    if (input.frequency !== "MONTHLY") {
      base.setDate(base.getDate() + index * (input.frequency === "BIWEEKLY" ? 14 : 7));
    }
    const start =
      input.frequency === "MONTHLY"
        ? new Date(base.getFullYear(), base.getMonth(), 1)
        : startOfWeek(base);
    const candidate = new Date(start);
    const offsetDays = (weekday.jsDay + 7 - candidate.getDay()) % 7;
    candidate.setDate(candidate.getDate() + offsetDays);
    const candidateAt = parseTimeOnDate(candidate, input.timeLocalHhmm);
    if (candidateAt && sameOrFutureDate(candidateAt, now)) {
      candidates.push(candidateAt);
    }
  }

  candidates.sort((left, right) => left.getTime() - right.getTime());
  return candidates[0] ?? null;
}

export function buildOneOnOneCalendarEventPlan(
  store: SoberHouseSettingsStore,
  requirement: ResidentRequirementProfile,
  nowIso: string,
): SoberHouseCalendarEventPlan | null {
  if (!requirement.oneOnOneRequired || !requirement.oneOnOneAddToCalendar) {
    return null;
  }
  const startDate = nextOccurrenceForOneOnOne({
    nowIso,
    frequency: requirement.oneOnOneFrequency,
    weekday: requirement.oneOnOneWeekday,
    scheduledDate: requirement.oneOnOneScheduledDate,
    timeLocalHhmm: requirement.oneOnOneTimeLocalHhmm,
  });
  if (!startDate) {
    return null;
  }
  const house = requirement.houseId ? getHouseById(store, requirement.houseId) : null;
  const staffAssignment = requirement.oneOnOneAssignedStaffAssignmentId
    ? getStaffAssignmentById(store, requirement.oneOnOneAssignedStaffAssignmentId)
    : null;
  const title = staffAssignment
    ? `One-on-one with ${staffAssignment.firstName} ${staffAssignment.lastName}`.trim()
    : "Sober-house one-on-one";
  const notes = [
    house ? `House: ${house.name}` : null,
    `Frequency: ${humanizeFrequency(requirement.oneOnOneFrequency)}`,
    staffAssignment
      ? `Assigned staff: ${staffAssignment.firstName} ${staffAssignment.lastName}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
  const endDate = new Date(startDate.getTime() + 30 * 60_000);
  const leadTimeMinutes = requirement.oneOnOneLeadTimeMinutes;
  return {
    fingerprint: [
      requirement.residentId,
      requirement.houseId ?? "none",
      requirement.oneOnOneFrequency,
      requirement.oneOnOneWeekday ?? "none",
      requirement.oneOnOneScheduledDate ?? "none",
      requirement.oneOnOneTimeLocalHhmm,
      requirement.oneOnOneLeadTimeMinutes,
      requirement.oneOnOneAddToCalendar ? "calendar" : "no-calendar",
    ].join("|"),
    title,
    notes,
    startDate,
    endDate,
    alarms: leadTimeMinutes > 0 ? [{ relativeOffset: -leadTimeMinutes }] : [{ relativeOffset: 0 }],
  };
}

export function buildOneOnOneReminderPlans(
  store: SoberHouseSettingsStore,
  requirement: ResidentRequirementProfile,
  nowIso: string,
): SoberHouseReminderPlan[] {
  if (!requirement.oneOnOneRequired || !requirement.oneOnOneReminderEnabled) {
    return [];
  }
  const eventPlan = buildOneOnOneCalendarEventPlan(store, requirement, nowIso);
  if (!eventPlan) {
    return [];
  }
  const fireAt = new Date(
    eventPlan.startDate.getTime() - requirement.oneOnOneLeadTimeMinutes * 60_000,
  );
  const staffAssignment = requirement.oneOnOneAssignedStaffAssignmentId
    ? getStaffAssignmentById(store, requirement.oneOnOneAssignedStaffAssignmentId)
    : null;
  const plans: SoberHouseReminderPlan[] = [
    {
      fingerprint: `${eventPlan.fingerprint}|notification`,
      fireAt,
      title: staffAssignment
        ? `One-on-one with ${staffAssignment.firstName} soon`
        : "One-on-one session upcoming",
      body: `Scheduled at ${eventPlan.startDate.toLocaleString()}.`,
      obligationType: "ONE_ON_ONE",
    },
  ];
  return plans.filter((plan) => plan.fireAt.getTime() > new Date(nowIso).getTime());
}

export function buildOneOnOneObligationSummary(
  store: SoberHouseSettingsStore,
  requirement: ResidentRequirementProfile,
  nowIso: string,
): SoberHouseScheduledObligationSummary | null {
  if (!requirement.oneOnOneRequired) {
    return null;
  }
  const nextAt = nextOccurrenceForOneOnOne({
    nowIso,
    frequency: requirement.oneOnOneFrequency,
    weekday: requirement.oneOnOneWeekday,
    scheduledDate: requirement.oneOnOneScheduledDate,
    timeLocalHhmm: requirement.oneOnOneTimeLocalHhmm,
  });
  if (!nextAt) {
    return null;
  }
  const staffAssignment = requirement.oneOnOneAssignedStaffAssignmentId
    ? getStaffAssignmentById(store, requirement.oneOnOneAssignedStaffAssignmentId)
    : null;
  const nowMs = new Date(nowIso).getTime();
  const diffMs = nextAt.getTime() - nowMs;
  return {
    obligationType: "ONE_ON_ONE",
    title: "Next one-on-one session",
    subtitle: staffAssignment
      ? `${staffAssignment.firstName} ${staffAssignment.lastName}`.trim()
      : "Assigned sober-house staff",
    detail: `${humanizeFrequency(requirement.oneOnOneFrequency)} at ${requirement.oneOnOneTimeLocalHhmm}`,
    startsAtIso: nextAt.toISOString(),
    dueLabel: nextAt.toLocaleString(),
    tone: diffMs <= 2 * 60 * 60 * 1000 ? "yellow" : "gray",
  };
}
