import {
  buildRecurringServiceCommitmentCalendarFingerprint,
  describeRecurringServiceCommitmentRecurrence,
  type RecurringServiceCommitment,
  type RecurringServiceCommitmentType,
  type RecurringServiceCommitmentWeekday,
} from "./recurringServiceCommitments";

export type ServiceCommitmentCalendarRecurrenceRule = {
  frequency: "weekly" | "monthly";
  interval?: number;
  daysOfTheWeek?: Array<{ dayOfTheWeek: number; weekNumber?: number }>;
};

export type ServiceCommitmentCalendarEventInput = {
  title: string;
  notes?: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  alarms?: Array<{ relativeOffset: number }>;
  recurrenceRule?: ServiceCommitmentCalendarRecurrenceRule;
};

export type ServiceCommitmentReminderPlan = {
  relativeOffsetMinutes: number;
  source: "travel" | "buffer" | "default";
};

export const DEFAULT_SERVICE_COMMITMENT_DURATION_MINUTES = 60;
export const DEFAULT_SERVICE_COMMITMENT_REMINDER_MINUTES = 15;
export const SERVICE_COMMITMENT_CALENDAR_PERMISSION_MESSAGE =
  "Calendar access is unavailable right now. Your service commitment was still saved in the app.";
export const SERVICE_COMMITMENT_CALENDAR_FAILURE_MESSAGE =
  "We couldn’t sync this commitment to your calendar. Please check permissions and try again.";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function parseMinutesFromHhmm(value: string): number {
  const [hoursText, minutesText] = value.split(":");
  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 0;
  }
  return hours * 60 + minutes;
}

function combineDateWithHhmm(date: Date, hhmm: string): Date {
  const result = new Date(date);
  const totalMinutes = parseMinutesFromHhmm(hhmm);
  result.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  return result;
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toJsDay(day: RecurringServiceCommitmentWeekday): number {
  switch (day) {
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
    default:
      return 0;
  }
}

export function toCalendarDayOfWeek(day: RecurringServiceCommitmentWeekday): number {
  switch (day) {
    case "MON":
      return 2;
    case "TUE":
      return 3;
    case "WED":
      return 4;
    case "THU":
      return 5;
    case "FRI":
      return 6;
    case "SAT":
      return 7;
    case "SUN":
    default:
      return 1;
  }
}

function ordinalToWeekNumber(input: 1 | 2 | 3 | 4 | "LAST"): number {
  return input === "LAST" ? -1 : input;
}

function nthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: RecurringServiceCommitmentWeekday,
  ordinal: 1 | 2 | 3 | 4 | "LAST",
): Date {
  if (ordinal === "LAST") {
    const lastDay = new Date(year, monthIndex + 1, 0);
    const result = new Date(lastDay);
    while (result.getDay() !== toJsDay(weekday)) {
      result.setDate(result.getDate() - 1);
    }
    return startOfDay(result);
  }

  const firstDay = new Date(year, monthIndex, 1);
  const result = new Date(firstDay);
  while (result.getDay() !== toJsDay(weekday)) {
    result.setDate(result.getDate() + 1);
  }
  result.setDate(result.getDate() + (ordinal - 1) * 7);
  return startOfDay(result);
}

function resolveNextWeeklyOccurrenceDate(
  commitment: RecurringServiceCommitment,
  referenceDate: Date,
): Date {
  const days = commitment.recurrence.kind === "WEEKLY" ? commitment.recurrence.days : [];
  const base = startOfDay(referenceDate);
  const candidates = days.map((day) => {
    const jsDay = toJsDay(day);
    const currentJsDay = base.getDay();
    const delta = (jsDay - currentJsDay + 7) % 7;
    return addDays(base, delta);
  });
  const sorted = candidates.sort((left, right) => left.getTime() - right.getTime());
  const scheduledTodayOrSooner = sorted.find((candidate) => {
    const candidateAt = combineDateWithHhmm(candidate, commitment.startsAtLocal);
    return candidateAt.getTime() >= referenceDate.getTime();
  });
  return scheduledTodayOrSooner ?? addDays(sorted[0] ?? base, 7);
}

function resolveNextMonthlyOrdinalOccurrenceDate(
  commitment: RecurringServiceCommitment,
  referenceDate: Date,
): Date {
  if (commitment.recurrence.kind !== "MONTHLY_ORDINAL") {
    return startOfDay(referenceDate);
  }

  const attemptCurrentMonth = nthWeekdayOfMonth(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    commitment.recurrence.day,
    commitment.recurrence.ordinal,
  );
  if (
    combineDateWithHhmm(attemptCurrentMonth, commitment.startsAtLocal).getTime() >=
    referenceDate.getTime()
  ) {
    return attemptCurrentMonth;
  }

  const nextMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1);
  return nthWeekdayOfMonth(
    nextMonth.getFullYear(),
    nextMonth.getMonth(),
    commitment.recurrence.day,
    commitment.recurrence.ordinal,
  );
}

export function resolveNextRecurringServiceCommitmentOccurrence(
  commitment: RecurringServiceCommitment,
  referenceDate: Date,
): Date {
  if (commitment.recurrence.kind === "MONTHLY_ORDINAL") {
    return resolveNextMonthlyOrdinalOccurrenceDate(commitment, referenceDate);
  }
  return resolveNextWeeklyOccurrenceDate(commitment, referenceDate);
}

function typeLabel(type: RecurringServiceCommitmentType): string {
  switch (type) {
    case "GREETER":
      return "Greeter";
    case "SETUP":
      return "Setup";
    case "CLEANUP":
      return "Cleanup";
    case "MEETING_CLOSE":
      return "Meeting close";
    case "SERVICE_ROLE":
      return "Service Commitment";
    case "BRIDGING_THE_GAP":
      return "Bridging the Gap";
    case "INTERGROUP":
      return "Intergroup";
    case "OTHER":
    default:
      return "Service Commitment";
  }
}

export function resolveRecurringServiceCommitmentReminderPlan(input: {
  travelDurationSeconds?: number | null;
  arrivalBufferMinutes?: number | null;
  defaultReminderMinutes?: number;
}): ServiceCommitmentReminderPlan {
  const fallbackMinutes = Math.max(
    1,
    input.defaultReminderMinutes ?? DEFAULT_SERVICE_COMMITMENT_REMINDER_MINUTES,
  );
  const arrivalBufferMinutes = Math.max(0, input.arrivalBufferMinutes ?? 0);
  const travelDurationMinutes =
    typeof input.travelDurationSeconds === "number" && Number.isFinite(input.travelDurationSeconds)
      ? Math.max(0, Math.ceil(input.travelDurationSeconds / 60))
      : null;

  if (travelDurationMinutes !== null) {
    return {
      relativeOffsetMinutes: -Math.max(1, travelDurationMinutes + arrivalBufferMinutes),
      source: "travel",
    };
  }
  if (arrivalBufferMinutes > 0) {
    return {
      relativeOffsetMinutes: -arrivalBufferMinutes,
      source: "buffer",
    };
  }
  return {
    relativeOffsetMinutes: -fallbackMinutes,
    source: "default",
  };
}

export function buildRecurringServiceCommitmentCalendarEventInput(input: {
  commitment: RecurringServiceCommitment;
  referenceDate?: Date;
  relativeOffsetMinutes: number;
}): ServiceCommitmentCalendarEventInput {
  const referenceDate = input.referenceDate ?? new Date();
  const commitment = input.commitment;
  const occurrenceDate = resolveNextRecurringServiceCommitmentOccurrence(commitment, referenceDate);
  const scheduledStart = combineDateWithHhmm(occurrenceDate, commitment.startsAtLocal);
  const actualStart = new Date(scheduledStart.getTime() - commitment.arriveEarlyMinutes * 60_000);

  let endDate: Date | null = null;
  if (commitment.endsAtLocal) {
    endDate = combineDateWithHhmm(occurrenceDate, commitment.endsAtLocal);
  } else if (typeof commitment.durationMinutes === "number" && commitment.durationMinutes > 0) {
    endDate = new Date(scheduledStart.getTime() + commitment.durationMinutes * 60_000);
  } else if (commitment.stayAfterMinutes > 0) {
    endDate = new Date(scheduledStart.getTime() + commitment.stayAfterMinutes * 60_000);
  }
  if (!endDate || endDate.getTime() <= actualStart.getTime()) {
    endDate = new Date(
      scheduledStart.getTime() + DEFAULT_SERVICE_COMMITMENT_DURATION_MINUTES * 60_000,
    );
  }

  const recurrenceRule: ServiceCommitmentCalendarRecurrenceRule =
    commitment.recurrence.kind === "MONTHLY_ORDINAL"
      ? {
          frequency: "monthly",
          interval: 1,
          daysOfTheWeek: [
            {
              dayOfTheWeek: toCalendarDayOfWeek(commitment.recurrence.day),
              weekNumber: ordinalToWeekNumber(commitment.recurrence.ordinal),
            },
          ],
        }
      : {
          frequency: "weekly",
          interval: 1,
          daysOfTheWeek: commitment.recurrence.days.map((day) => ({
            dayOfTheWeek: toCalendarDayOfWeek(day),
          })),
        };

  const noteLines = [
    `Commitment: ${commitment.name}`,
    `Repeats: ${describeRecurringServiceCommitmentRecurrence(commitment.recurrence)}`,
    `Starts: ${commitment.startsAtLocal}`,
  ];
  if (commitment.arriveEarlyMinutes > 0) {
    noteLines.push(`Arrive early: ${commitment.arriveEarlyMinutes} minutes`);
  }
  if (commitment.stayAfterMinutes > 0) {
    noteLines.push(`Stay after: ${commitment.stayAfterMinutes} minutes`);
  }
  if (commitment.notes) {
    noteLines.push(`Notes: ${commitment.notes}`);
  }

  return {
    title: `Sober²— ${typeLabel(commitment.type)}: ${commitment.name}`,
    notes: noteLines.join("\n"),
    startDate: actualStart,
    endDate,
    location: commitment.location || undefined,
    alarms: [{ relativeOffset: input.relativeOffsetMinutes }],
    recurrenceRule,
  };
}

export function mapRecurringServiceCommitmentCalendarErrorToUserMessage(input: {
  errorCode: "none" | "permission" | "unavailable";
}): string {
  if (input.errorCode === "permission") {
    return SERVICE_COMMITMENT_CALENDAR_PERMISSION_MESSAGE;
  }
  return SERVICE_COMMITMENT_CALENDAR_FAILURE_MESSAGE;
}

export function withRecurringServiceCommitmentCalendarSync(
  commitment: RecurringServiceCommitment,
  updates: {
    calendarEventId?: string | null;
    calendarSeriesId?: string | null;
    calendarSyncFingerprint?: string | null;
  },
): RecurringServiceCommitment {
  return {
    ...commitment,
    calendarEventId:
      updates.calendarEventId !== undefined ? updates.calendarEventId : commitment.calendarEventId,
    calendarSeriesId:
      updates.calendarSeriesId !== undefined
        ? updates.calendarSeriesId
        : commitment.calendarSeriesId,
    calendarSyncFingerprint:
      updates.calendarSyncFingerprint !== undefined
        ? updates.calendarSyncFingerprint
        : buildRecurringServiceCommitmentCalendarFingerprint(commitment),
  };
}

export function getRecurringServiceCommitmentCalendarFingerprint(
  commitment: RecurringServiceCommitment,
): string {
  return buildRecurringServiceCommitmentCalendarFingerprint(commitment);
}

export function formatRecurringServiceCommitmentTimeLabel(date: Date): string {
  const hours = date.getHours();
  const minutes = pad2(date.getMinutes());
  const meridiem = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${meridiem}`;
}
