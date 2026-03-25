export type CalendarEventWriteInput = {
  title: string;
  notes?: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  alarms?: Array<{ relativeOffset: number }>;
  recurrenceRule?: {
    frequency: "weekly" | "monthly";
    interval?: number;
    daysOfTheWeek?: Array<{ dayOfTheWeek: number }>;
  };
};

export type MeetingCalendarReminderPlan = {
  relativeOffsetMinutes: number;
  source: "travel" | "buffer" | "default";
};

export const DEFAULT_MEETING_CALENDAR_REMINDER_MINUTES = 15;
export const CALENDAR_PERMISSION_FALLBACK_MESSAGE =
  "Calendar access is unavailable right now. Your reminder was still saved in the app.";
export const CALENDAR_WRITE_FAILURE_MESSAGE =
  "We couldn’t add this event to your calendar. Please check calendar permissions and try again.";

export function shouldAttemptCalendarWrite(input: {
  runtimeEnabled: boolean;
  automaticSyncEnabled: boolean;
}): boolean {
  return input.runtimeEnabled && input.automaticSyncEnabled;
}

export function resolveMeetingCalendarReminderPlan(input: {
  travelDurationSeconds?: number | null;
  arrivalBufferMinutes?: number | null;
  defaultReminderMinutes?: number;
}): MeetingCalendarReminderPlan {
  const fallbackMinutes = Math.max(
    1,
    input.defaultReminderMinutes ?? DEFAULT_MEETING_CALENDAR_REMINDER_MINUTES,
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

export function buildSponsorCalendarEventInput(input: {
  sponsorName: string;
  sponsorPhoneE164: string;
  sponsorCallTimeLocalHhmm: string;
  recurrenceSummary: string;
  startDate: Date;
  endDate: Date;
  leadMinutes: number;
  recurrenceRule?: CalendarEventWriteInput["recurrenceRule"];
}): CalendarEventWriteInput {
  return {
    title: "Call Sponsor",
    notes: [
      `Sponsor: ${input.sponsorName}`,
      `Phone: ${input.sponsorPhoneE164}`,
      `Schedule: ${input.sponsorCallTimeLocalHhmm} ${input.recurrenceSummary}`,
    ].join("\n"),
    startDate: input.startDate,
    endDate: input.endDate,
    alarms: [{ relativeOffset: -Math.max(0, input.leadMinutes) }],
    recurrenceRule: input.recurrenceRule,
  };
}

export function buildMeetingCalendarEventInput(input: {
  meetingName: string;
  meetingAddress?: string | null;
  requiresSignature: boolean;
  startDate: Date;
  endDate: Date;
  relativeOffsetMinutes: number;
}): CalendarEventWriteInput {
  return {
    title: `AA/NA Meeting - ${input.meetingName}`,
    startDate: input.startDate,
    endDate: input.endDate,
    location:
      input.meetingAddress && input.meetingAddress.trim().length > 0
        ? input.meetingAddress
        : undefined,
    notes: input.requiresSignature
      ? "Signature required. Added by Sober AI."
      : "Attendance added by Sober AI.",
    alarms: [{ relativeOffset: input.relativeOffsetMinutes }],
  };
}

export function mapCalendarWriteErrorToUserMessage(input: {
  errorCode: "none" | "permission" | "unavailable";
  reminderSavedInApp?: boolean;
}): string {
  if (input.errorCode === "permission" || input.reminderSavedInApp) {
    return CALENDAR_PERMISSION_FALLBACK_MESSAGE;
  }
  return CALENDAR_WRITE_FAILURE_MESSAGE;
}
