export const RECURRING_SERVICE_COMMITMENTS_STEP_COPY = {
  title: "Recurring Service Commitments",
  description:
    "Capture recurring recovery-related commitments you need to show up for beyond standard meetings.",
  helperText:
    "Add commitments like Greeter every Thursday, First Saturday intergroup meeting, or Close Tuesday meeting and stay 30 minutes after.",
  labels: {
    name: "Commitment name",
    type: "Commitment type",
    location: "Location",
    startsAt: "Starts at",
    endsAt: "Ends at",
    arriveEarlyBy: "Arrive early by",
    stayAfterBy: "Stay after by",
    repeats: "Repeats",
    notes: "Notes",
  },
} as const;

export type RecurringServiceCommitmentType =
  | "GREETER"
  | "SETUP"
  | "CLEANUP"
  | "MEETING_CLOSE"
  | "SERVICE_ROLE"
  | "BRIDGING_THE_GAP"
  | "INTERGROUP"
  | "OTHER";

export type RecurringServiceCommitmentWeekday =
  | "MON"
  | "TUE"
  | "WED"
  | "THU"
  | "FRI"
  | "SAT"
  | "SUN";

export type RecurringServiceCommitmentOrdinal = 1 | 2 | 3 | 4 | "LAST";

export type RecurringServiceCommitmentRecurrence =
  | {
      kind: "WEEKLY";
      days: RecurringServiceCommitmentWeekday[];
    }
  | {
      kind: "MONTHLY_ORDINAL";
      ordinal: RecurringServiceCommitmentOrdinal;
      day: RecurringServiceCommitmentWeekday;
    };

export type RecurringServiceCommitment = {
  id: string;
  name: string;
  type: RecurringServiceCommitmentType;
  location: string;
  startsAtLocal: string;
  endsAtLocal: string | null;
  durationMinutes: number | null;
  arriveEarlyMinutes: number;
  stayAfterMinutes: number;
  notes: string;
  recurrence: RecurringServiceCommitmentRecurrence;
  calendarSeriesId: string | null;
  calendarEventId: string | null;
  calendarSyncFingerprint: string | null;
};

export type RecurringServiceCommitmentDraft = {
  id: string | null;
  name: string;
  type: RecurringServiceCommitmentType;
  location: string;
  startsAtLocal: string;
  endsAtLocal: string;
  durationMinutes: string;
  arriveEarlyMinutes: string;
  stayAfterMinutes: string;
  notes: string;
  recurrenceKind: "WEEKLY" | "MONTHLY_ORDINAL";
  weeklyDays: RecurringServiceCommitmentWeekday[];
  monthlyOrdinal: RecurringServiceCommitmentOrdinal;
  monthlyDay: RecurringServiceCommitmentWeekday;
};

export const RECURRING_SERVICE_COMMITMENT_TYPE_OPTIONS: Array<{
  value: RecurringServiceCommitmentType;
  label: string;
}> = [
  { value: "GREETER", label: "Greeter" },
  { value: "SETUP", label: "Setup" },
  { value: "CLEANUP", label: "Cleanup" },
  { value: "MEETING_CLOSE", label: "Meeting close" },
  { value: "SERVICE_ROLE", label: "Service role" },
  { value: "BRIDGING_THE_GAP", label: "Bridging the Gap" },
  { value: "INTERGROUP", label: "Intergroup" },
  { value: "OTHER", label: "Other" },
];

export const RECURRING_SERVICE_COMMITMENT_WEEKDAY_OPTIONS: Array<{
  value: RecurringServiceCommitmentWeekday;
  label: string;
}> = [
  { value: "MON", label: "Mon" },
  { value: "TUE", label: "Tue" },
  { value: "WED", label: "Wed" },
  { value: "THU", label: "Thu" },
  { value: "FRI", label: "Fri" },
  { value: "SAT", label: "Sat" },
  { value: "SUN", label: "Sun" },
];

export const RECURRING_SERVICE_COMMITMENT_ORDINAL_OPTIONS: Array<{
  value: RecurringServiceCommitmentOrdinal;
  label: string;
}> = [
  { value: 1, label: "First" },
  { value: 2, label: "Second" },
  { value: 3, label: "Third" },
  { value: 4, label: "Fourth" },
  { value: "LAST", label: "Last" },
];

const VALID_TYPES = new Set(
  RECURRING_SERVICE_COMMITMENT_TYPE_OPTIONS.map((option) => option.value),
);
const VALID_WEEKDAYS = new Set(
  RECURRING_SERVICE_COMMITMENT_WEEKDAY_OPTIONS.map((option) => option.value),
);
const VALID_ORDINALS = new Set<RecurringServiceCommitmentOrdinal>([1, 2, 3, 4, "LAST"]);

export function createDefaultRecurringServiceCommitmentDraft(): RecurringServiceCommitmentDraft {
  return {
    id: null,
    name: "",
    type: "SERVICE_ROLE",
    location: "",
    startsAtLocal: "",
    endsAtLocal: "",
    durationMinutes: "",
    arriveEarlyMinutes: "",
    stayAfterMinutes: "",
    notes: "",
    recurrenceKind: "WEEKLY",
    weeklyDays: ["MON"],
    monthlyOrdinal: 1,
    monthlyDay: "SAT",
  };
}

function normalizeMinutesText(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.min(24 * 60, parsed);
}

function normalizeOptionalMinutesText(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return normalizeMinutesText(trimmed);
}

export function normalizeHhmmInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function isValidHhmm(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  return (
    Number.isInteger(hours) &&
    Number.isInteger(minutes) &&
    hours >= 0 &&
    hours <= 23 &&
    minutes >= 0 &&
    minutes <= 59
  );
}

export function hasUnsavedRecurringServiceCommitmentDraftChanges(
  draft: RecurringServiceCommitmentDraft,
): boolean {
  if (draft.id) {
    return true;
  }
  return (
    draft.name.trim().length > 0 ||
    draft.location.trim().length > 0 ||
    draft.startsAtLocal.trim().length > 0 ||
    draft.endsAtLocal.trim().length > 0 ||
    draft.durationMinutes.trim().length > 0 ||
    draft.arriveEarlyMinutes.trim().length > 0 ||
    draft.stayAfterMinutes.trim().length > 0 ||
    draft.notes.trim().length > 0 ||
    draft.type !== "SERVICE_ROLE" ||
    draft.recurrenceKind !== "WEEKLY" ||
    draft.weeklyDays.length !== 1 ||
    draft.weeklyDays[0] !== "MON" ||
    draft.monthlyOrdinal !== 1 ||
    draft.monthlyDay !== "SAT"
  );
}

export function buildRecurringServiceCommitmentFromDraft(input: {
  id: string;
  draft: RecurringServiceCommitmentDraft;
  existing?: RecurringServiceCommitment | null;
}): RecurringServiceCommitment {
  const recurrence: RecurringServiceCommitmentRecurrence =
    input.draft.recurrenceKind === "MONTHLY_ORDINAL"
      ? {
          kind: "MONTHLY_ORDINAL",
          ordinal: input.draft.monthlyOrdinal,
          day: input.draft.monthlyDay,
        }
      : {
          kind: "WEEKLY",
          days: normalizeWeekdays(input.draft.weeklyDays),
        };

  return {
    id: input.id,
    name: input.draft.name.trim(),
    type: input.draft.type,
    location: input.draft.location.trim(),
    startsAtLocal: input.draft.startsAtLocal.trim(),
    endsAtLocal: input.draft.endsAtLocal.trim() || null,
    durationMinutes: normalizeOptionalMinutesText(input.draft.durationMinutes),
    arriveEarlyMinutes: normalizeMinutesText(input.draft.arriveEarlyMinutes),
    stayAfterMinutes: normalizeMinutesText(input.draft.stayAfterMinutes),
    notes: input.draft.notes.trim(),
    recurrence,
    calendarSeriesId: input.existing?.calendarSeriesId ?? null,
    calendarEventId: input.existing?.calendarEventId ?? null,
    calendarSyncFingerprint: input.existing?.calendarSyncFingerprint ?? null,
  };
}

function normalizeWeekdays(days: unknown): RecurringServiceCommitmentWeekday[] {
  if (!Array.isArray(days)) {
    return [];
  }
  const normalized = days.filter(
    (day): day is RecurringServiceCommitmentWeekday =>
      typeof day === "string" && VALID_WEEKDAYS.has(day as RecurringServiceCommitmentWeekday),
  );
  return Array.from(new Set(normalized));
}

export function normalizeRecurringServiceCommitments(value: unknown): RecurringServiceCommitment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const raw = entry as Record<string, unknown>;
    if (typeof raw.id !== "string" || raw.id.trim().length === 0) {
      return [];
    }
    if (typeof raw.name !== "string" || raw.name.trim().length === 0) {
      return [];
    }
    if (
      typeof raw.type !== "string" ||
      !VALID_TYPES.has(raw.type as RecurringServiceCommitmentType)
    ) {
      return [];
    }
    if (typeof raw.startsAtLocal !== "string" || !isValidHhmm(raw.startsAtLocal.trim())) {
      return [];
    }

    const recurrenceRaw = raw.recurrence;
    if (!recurrenceRaw || typeof recurrenceRaw !== "object") {
      return [];
    }
    const recurrenceRecord = recurrenceRaw as Record<string, unknown>;
    let recurrence: RecurringServiceCommitmentRecurrence | null = null;

    if (recurrenceRecord.kind === "WEEKLY") {
      const days = normalizeWeekdays(recurrenceRecord.days);
      if (days.length === 0) {
        return [];
      }
      recurrence = { kind: "WEEKLY", days };
    } else if (recurrenceRecord.kind === "MONTHLY_ORDINAL") {
      const ordinal = recurrenceRecord.ordinal;
      const day = recurrenceRecord.day;
      if (!VALID_ORDINALS.has(ordinal as RecurringServiceCommitmentOrdinal)) {
        return [];
      }
      if (
        typeof day !== "string" ||
        !VALID_WEEKDAYS.has(day as RecurringServiceCommitmentWeekday)
      ) {
        return [];
      }
      recurrence = {
        kind: "MONTHLY_ORDINAL",
        ordinal: ordinal as RecurringServiceCommitmentOrdinal,
        day: day as RecurringServiceCommitmentWeekday,
      };
    } else {
      return [];
    }

    const endsAtLocal =
      typeof raw.endsAtLocal === "string" && isValidHhmm(raw.endsAtLocal.trim())
        ? raw.endsAtLocal.trim()
        : null;

    const normalizeOptionalNumber = (input: unknown): number | null =>
      typeof input === "number" && Number.isFinite(input) && input >= 0 ? Math.floor(input) : null;
    const normalizeRequiredNumber = (input: unknown): number =>
      typeof input === "number" && Number.isFinite(input) && input >= 0 ? Math.floor(input) : 0;

    return [
      {
        id: raw.id.trim(),
        name: raw.name.trim(),
        type: raw.type as RecurringServiceCommitmentType,
        location: typeof raw.location === "string" ? raw.location.trim() : "",
        startsAtLocal: raw.startsAtLocal.trim(),
        endsAtLocal,
        durationMinutes: normalizeOptionalNumber(raw.durationMinutes),
        arriveEarlyMinutes: normalizeRequiredNumber(raw.arriveEarlyMinutes),
        stayAfterMinutes: normalizeRequiredNumber(raw.stayAfterMinutes),
        notes: typeof raw.notes === "string" ? raw.notes.trim() : "",
        recurrence,
        calendarSeriesId:
          typeof raw.calendarSeriesId === "string" && raw.calendarSeriesId.trim().length > 0
            ? raw.calendarSeriesId.trim()
            : null,
        calendarEventId:
          typeof raw.calendarEventId === "string" && raw.calendarEventId.trim().length > 0
            ? raw.calendarEventId.trim()
            : null,
        calendarSyncFingerprint:
          typeof raw.calendarSyncFingerprint === "string" &&
          raw.calendarSyncFingerprint.trim().length > 0
            ? raw.calendarSyncFingerprint.trim()
            : null,
      },
    ];
  });
}

export function upsertRecurringServiceCommitment(
  current: RecurringServiceCommitment[],
  next: RecurringServiceCommitment,
): RecurringServiceCommitment[] {
  const existingIndex = current.findIndex((entry) => entry.id === next.id);
  if (existingIndex === -1) {
    return [...current, next];
  }
  return current.map((entry) => (entry.id === next.id ? next : entry));
}

export function removeRecurringServiceCommitment(
  current: RecurringServiceCommitment[],
  id: string,
): RecurringServiceCommitment[] {
  return current.filter((entry) => entry.id !== id);
}

export function createRecurringServiceCommitmentDraftFromItem(
  item: RecurringServiceCommitment,
): RecurringServiceCommitmentDraft {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    location: item.location,
    startsAtLocal: item.startsAtLocal,
    endsAtLocal: item.endsAtLocal ?? "",
    durationMinutes: item.durationMinutes === null ? "" : String(item.durationMinutes),
    arriveEarlyMinutes: item.arriveEarlyMinutes > 0 ? String(item.arriveEarlyMinutes) : "",
    stayAfterMinutes: item.stayAfterMinutes > 0 ? String(item.stayAfterMinutes) : "",
    notes: item.notes,
    recurrenceKind: item.recurrence.kind,
    weeklyDays: item.recurrence.kind === "WEEKLY" ? item.recurrence.days : ["MON"],
    monthlyOrdinal: item.recurrence.kind === "MONTHLY_ORDINAL" ? item.recurrence.ordinal : 1,
    monthlyDay: item.recurrence.kind === "MONTHLY_ORDINAL" ? item.recurrence.day : "SAT",
  };
}

function weekdayLabel(day: RecurringServiceCommitmentWeekday): string {
  return (
    RECURRING_SERVICE_COMMITMENT_WEEKDAY_OPTIONS.find((option) => option.value === day)?.label ??
    day
  );
}

function ordinalLabel(value: RecurringServiceCommitmentOrdinal): string {
  return (
    RECURRING_SERVICE_COMMITMENT_ORDINAL_OPTIONS.find((option) => option.value === value)?.label ??
    String(value)
  );
}

export function describeRecurringServiceCommitmentRecurrence(
  recurrence: RecurringServiceCommitmentRecurrence,
): string {
  if (recurrence.kind === "MONTHLY_ORDINAL") {
    return `${ordinalLabel(recurrence.ordinal)} ${weekdayLabel(recurrence.day)}`;
  }
  return recurrence.days.map((day) => weekdayLabel(day)).join(", ");
}

export function buildRecurringServiceCommitmentSummary(
  commitment: RecurringServiceCommitment,
): string {
  const pieces = [
    describeRecurringServiceCommitmentRecurrence(commitment.recurrence),
    commitment.startsAtLocal,
  ];
  if (commitment.location) {
    pieces.push(commitment.location);
  }
  if (commitment.arriveEarlyMinutes > 0) {
    pieces.push(`Arrive ${commitment.arriveEarlyMinutes}m early`);
  }
  if (commitment.stayAfterMinutes > 0) {
    pieces.push(`Stay ${commitment.stayAfterMinutes}m after`);
  }
  return pieces.join(" • ");
}

export function buildRecurringServiceCommitmentCalendarFingerprint(
  commitment: RecurringServiceCommitment,
): string {
  return JSON.stringify({
    name: commitment.name,
    type: commitment.type,
    location: commitment.location,
    startsAtLocal: commitment.startsAtLocal,
    endsAtLocal: commitment.endsAtLocal,
    durationMinutes: commitment.durationMinutes,
    arriveEarlyMinutes: commitment.arriveEarlyMinutes,
    stayAfterMinutes: commitment.stayAfterMinutes,
    notes: commitment.notes,
    recurrence: commitment.recurrence,
  });
}
