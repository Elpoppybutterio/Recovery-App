import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import appJson from "./app.json";

type Meeting = {
  id: string;
  name: string;
  address: string;
};

type AttendanceResponse = {
  attendance: {
    id: string;
    status: string;
    checkInAt: string;
    checkOutAt: string | null;
    dwellSeconds: number | null;
  };
};

type MeZone = {
  ruleId: string;
  zoneId: string;
  bufferM: number;
  zone: {
    id: string;
    type: "CIRCLE" | "POLYGON";
    centerLat: number | null;
    centerLng: number | null;
    radiusM: number | null;
  };
};

type WeekdayCode = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
type RepeatUnit = "WEEKLY" | "MONTHLY";
type RepeatPreset = "WEEKLY" | "BIWEEKLY" | "MONTHLY";
type LegacyRepeatRule = "DAILY" | "WEEKDAYS" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";

type SponsorConfigPayload = {
  sponsorName: string;
  sponsorPhoneE164: string;
  callTimeLocalHhmm: string;
  repeatUnit: RepeatUnit;
  repeatInterval: number;
  repeatDays: WeekdayCode[];
  active: boolean;
  // TODO(api-compat): Remove legacy field once all environments use repeatUnit/repeatInterval/repeatDays.
  repeatRule?: LegacyRepeatRule;
};

type SponsorConfigResponse = {
  sponsorName: string;
  sponsorPhoneE164: string;
  callTimeLocalHhmm: string;
  active: boolean;
  repeatUnit?: RepeatUnit;
  repeatInterval?: number;
  repeatDays?: WeekdayCode[];
  repeatRule?: LegacyRepeatRule;
};

const SPONSOR_REPEAT_OPTIONS: Array<{ value: RepeatPreset; label: string }> = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Bi-weekly" },
  { value: "MONTHLY", label: "Monthly" },
];

const WEEKDAY_OPTIONS: Array<{ code: WeekdayCode; label: string; jsDay: number }> = [
  { code: "MON", label: "Mon", jsDay: 1 },
  { code: "TUE", label: "Tue", jsDay: 2 },
  { code: "WED", label: "Wed", jsDay: 3 },
  { code: "THU", label: "Thu", jsDay: 4 },
  { code: "FRI", label: "Fri", jsDay: 5 },
  { code: "SAT", label: "Sat", jsDay: 6 },
  { code: "SUN", label: "Sun", jsDay: 0 },
];

const WEEKDAY_CODES = WEEKDAY_OPTIONS.map((option) => option.code);

type GeolocationApi = {
  getCurrentPosition(
    success: (position: {
      coords: {
        latitude: number;
        longitude: number;
        accuracy?: number;
      };
    }) => void,
    error?: () => void,
    options?: {
      enableHighAccuracy?: boolean;
      timeout?: number;
      maximumAge?: number;
    },
  ): void;
};

const WARNING_DISTANCE_METERS = 200 * 0.3048;
const EARTH_RADIUS_METERS = 6371000;
const SPONSOR_ALERT_LEAD_DEFAULT_MINUTES = 15;
const SPONSOR_ALERT_LEAD_PRESETS_MINUTES = [0, 5, 10, 15, 30];
const SPONSOR_ALERT_LEAD_MAX_MINUTES = 24 * 60;
const SPONSOR_CALENDAR_EVENT_KEY_PREFIX = "recovery:sponsorCalendarEventId:";
const SPONSOR_ALERT_LEAD_KEY_PREFIX = "recovery:sponsorAlertLeadMinutes:";
const SPONSOR_LOCAL_NOTIFICATION_KEY_PREFIX = "recovery:sponsorReminderNotificationId:";
const TIME_WHEEL_ITEM_HEIGHT = 40;
const TIME_WHEEL_VISIBLE_ROWS = 5;
const TIME_WHEEL_SIDE_PADDING = ((TIME_WHEEL_VISIBLE_ROWS - 1) / 2) * TIME_WHEEL_ITEM_HEIGHT;
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => index);
const MERIDIEM_OPTIONS = ["AM", "PM"] as const;

type AsyncStorageModule = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

type CalendarRecord = {
  id: string;
  allowsModifications: boolean;
  isPrimary?: boolean;
  isDefault?: boolean;
  title?: string;
  source?: { name?: string };
};

type CalendarWeekdayMap = {
  SUNDAY: number;
  MONDAY: number;
  TUESDAY: number;
  WEDNESDAY: number;
  THURSDAY: number;
  FRIDAY: number;
  SATURDAY: number;
};

type CalendarRecurrenceRuleInput = {
  frequency: string;
  interval?: number;
  daysOfTheWeek?: Array<{ dayOfTheWeek: number }>;
};

type CalendarEventInput = {
  title: string;
  notes: string;
  startDate: Date;
  endDate: Date;
  recurrenceRule: CalendarRecurrenceRuleInput;
  alarms: Array<{ relativeOffset: number }>;
  timeZone?: string;
};

type CalendarModule = {
  EntityTypes: { EVENT: string };
  RecurrenceFrequency: {
    DAILY: string;
    WEEKLY: string;
    MONTHLY: string;
  };
  Weekday?: Partial<CalendarWeekdayMap>;
  requestCalendarPermissionsAsync(): Promise<{ granted?: boolean; status?: string }>;
  getDefaultCalendarAsync?(): Promise<CalendarRecord | null>;
  getCalendarsAsync(entityType: string): Promise<CalendarRecord[]>;
  getEventAsync(eventId: string): Promise<unknown | null>;
  updateEventAsync(eventId: string, eventDetails: CalendarEventInput): Promise<string>;
  createEventAsync(calendarId: string, eventDetails: CalendarEventInput): Promise<string>;
};

type TimeWheelPickerProps<T extends string | number> = {
  items: readonly T[];
  value: T;
  onChange: (value: T) => void;
  formatItem?: (value: T) => string;
  width?: number;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function TimeWheelPicker<T extends string | number>({
  items,
  value,
  onChange,
  formatItem,
  width,
}: TimeWheelPickerProps<T>) {
  const scrollRef = useRef<ScrollView>(null);
  const selectedIndex = Math.max(0, items.indexOf(value));

  useEffect(() => {
    scrollRef.current?.scrollTo({
      y: selectedIndex * TIME_WHEEL_ITEM_HEIGHT,
      animated: false,
    });
  }, [selectedIndex]);

  function settleAtOffset(offsetY: number) {
    const rawIndex = Math.round(offsetY / TIME_WHEEL_ITEM_HEIGHT);
    const nextIndex = Math.max(0, Math.min(items.length - 1, rawIndex));
    const nextValue = items[nextIndex];
    onChange(nextValue);
    scrollRef.current?.scrollTo({
      y: nextIndex * TIME_WHEEL_ITEM_HEIGHT,
      animated: true,
    });
  }

  return (
    <View style={[styles.timeWheelColumn, width ? { width } : null]}>
      <ScrollView
        ref={scrollRef}
        nestedScrollEnabled
        bounces={false}
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={TIME_WHEEL_ITEM_HEIGHT}
        contentContainerStyle={styles.timeWheelContent}
        onMomentumScrollEnd={(event) => settleAtOffset(event.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(event) => settleAtOffset(event.nativeEvent.contentOffset.y)}
      >
        {items.map((item) => (
          <View key={String(item)} style={styles.timeWheelItem}>
            <Text style={styles.timeWheelItemText}>
              {formatItem ? formatItem(item) : String(item)}
            </Text>
          </View>
        ))}
      </ScrollView>
      <View pointerEvents="none" style={styles.timeWheelSelection} />
    </View>
  );
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMetersBetween(
  leftLat: number,
  leftLng: number,
  rightLat: number,
  rightLng: number,
): number {
  const latDelta = toRadians(rightLat - leftLat);
  const lngDelta = toRadians(rightLng - leftLng);
  const leftLatRad = toRadians(leftLat);
  const rightLatRad = toRadians(rightLat);

  const value =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(leftLatRad) * Math.cos(rightLatRad) * Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2);
  const arc = 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  return EARTH_RADIUS_METERS * arc;
}

function isNearAssignedZone(lat: number, lng: number, zones: MeZone[]): boolean {
  return zones.some((rule) => {
    if (
      rule.zone.type !== "CIRCLE" ||
      rule.zone.centerLat === null ||
      rule.zone.centerLng === null ||
      rule.zone.radiusM === null
    ) {
      return false;
    }
    const boundaryM = rule.zone.radiusM + rule.bufferM;
    const distanceM = distanceMetersBetween(lat, lng, rule.zone.centerLat, rule.zone.centerLng);
    return distanceM <= boundaryM + WARNING_DISTANCE_METERS;
  });
}

function normalizePhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits.slice(0, 10);
}

function formatUsPhoneDisplay(phoneDigits: string): string {
  const digits = normalizePhoneDigits(phoneDigits);
  if (digits.length === 0) {
    return "";
  }
  if (digits.length <= 3) {
    return `(${digits}`;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function toE164FromUsTenDigit(phoneDigits: string): string | null {
  if (phoneDigits.length !== 10) {
    return null;
  }
  return `+1${phoneDigits}`;
}

function to24HourText(hour12: number, minute: number, meridiem: "AM" | "PM"): string {
  const normalizedHour12 = Math.min(12, Math.max(1, Math.floor(hour12)));
  const normalizedMinute = Math.min(59, Math.max(0, Math.floor(minute)));
  let hour24 = normalizedHour12 % 12;
  if (meridiem === "PM") {
    hour24 += 12;
  }
  return `${String(hour24).padStart(2, "0")}:${String(normalizedMinute).padStart(2, "0")}`;
}

function from24HourText(time24: string): { hour12: number; minute: number; meridiem: "AM" | "PM" } {
  const [hoursText, minutesText] = time24.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const safeHours = Number.isFinite(hours) ? Math.min(23, Math.max(0, hours)) : 17;
  const safeMinutes = Number.isFinite(minutes) ? Math.min(59, Math.max(0, minutes)) : 0;
  const meridiem: "AM" | "PM" = safeHours >= 12 ? "PM" : "AM";
  const rawHour12 = safeHours % 12;
  return {
    hour12: rawHour12 === 0 ? 12 : rawHour12,
    minute: safeMinutes,
    meridiem,
  };
}

function formatCallTime12Hour(time24: string): string {
  const { hour12, minute, meridiem } = from24HourText(time24);
  return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function weekdayCodeFromJsDay(jsDay: number): WeekdayCode {
  const option = WEEKDAY_OPTIONS.find((entry) => entry.jsDay === jsDay);
  return option?.code ?? "MON";
}

function getCurrentWeekdayCode(date: Date): WeekdayCode {
  return weekdayCodeFromJsDay(date.getDay());
}

function sortWeekdays(days: WeekdayCode[]): WeekdayCode[] {
  const daySet = new Set(days);
  return WEEKDAY_CODES.filter((code) => daySet.has(code));
}

function startOfWeekMonday(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const delta = day === 0 ? 6 : day - 1;
  result.setDate(result.getDate() - delta);
  result.setHours(0, 0, 0, 0);
  return result;
}

function deriveLegacyRepeatRule(
  repeatUnit: RepeatUnit,
  repeatInterval: number,
  repeatDays: WeekdayCode[],
): LegacyRepeatRule {
  if (repeatUnit === "MONTHLY") {
    return "MONTHLY";
  }
  if (repeatInterval === 2) {
    return "BIWEEKLY";
  }
  if (repeatDays.length === 7) {
    return "DAILY";
  }
  const weekdays: WeekdayCode[] = ["MON", "TUE", "WED", "THU", "FRI"];
  const isWeekdaysOnly =
    repeatDays.length === weekdays.length && weekdays.every((day) => repeatDays.includes(day));
  if (isWeekdaysOnly) {
    return "WEEKDAYS";
  }
  return "WEEKLY";
}

function describeWeekdaySelection(days: WeekdayCode[]): string {
  if (days.length === 0) {
    return "No days selected";
  }
  return days
    .map((day) => WEEKDAY_OPTIONS.find((entry) => entry.code === day)?.label ?? day)
    .join(", ");
}

function resolveRepeatStateFromConfig(
  config: SponsorConfigResponse,
  fallbackDay: WeekdayCode,
): {
  preset: RepeatPreset;
  days: WeekdayCode[];
} {
  if (config.repeatUnit) {
    const interval = config.repeatInterval ?? 1;
    const preset: RepeatPreset =
      config.repeatUnit === "MONTHLY" ? "MONTHLY" : interval >= 2 ? "BIWEEKLY" : "WEEKLY";
    const days =
      config.repeatUnit === "MONTHLY"
        ? []
        : sortWeekdays(
            (config.repeatDays ?? []).filter((day): day is WeekdayCode =>
              WEEKDAY_CODES.includes(day as WeekdayCode),
            ),
          );
    return { preset, days: days.length > 0 ? days : [fallbackDay] };
  }

  switch (config.repeatRule) {
    case "DAILY":
      return { preset: "WEEKLY", days: [...WEEKDAY_CODES] };
    case "WEEKDAYS":
      return { preset: "WEEKLY", days: ["MON", "TUE", "WED", "THU", "FRI"] };
    case "BIWEEKLY":
      return { preset: "BIWEEKLY", days: [fallbackDay] };
    case "MONTHLY":
      return { preset: "MONTHLY", days: [] };
    case "WEEKLY":
    default:
      return { preset: "WEEKLY", days: [fallbackDay] };
  }
}

function computeNextCall(
  now: Date,
  callTimeLocalHhmm: string,
  repeatUnit: RepeatUnit,
  repeatInterval: number,
  repeatDays: WeekdayCode[],
): { nextAt: Date; dueToday: boolean } {
  const [hoursText, minutesText] = callTimeLocalHhmm.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (repeatUnit === "MONTHLY") {
    const candidate = new Date(now);
    candidate.setHours(hours, minutes, 0, 0);
    if (candidate.getTime() >= now.getTime()) {
      return { nextAt: candidate, dueToday: true };
    }
    candidate.setMonth(candidate.getMonth() + Math.max(1, repeatInterval));
    return { nextAt: candidate, dueToday: false };
  }

  const activeDays =
    repeatDays.length > 0 ? sortWeekdays(repeatDays) : [getCurrentWeekdayCode(now)];
  const interval = Math.max(1, repeatInterval);
  const anchorWeekStart = startOfWeekMonday(now);

  for (let offsetDays = 0; offsetDays <= 90; offsetDays += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offsetDays);
    candidate.setHours(hours, minutes, 0, 0);

    if (candidate.getTime() < now.getTime()) {
      continue;
    }

    const candidateCode = weekdayCodeFromJsDay(candidate.getDay());
    if (!activeDays.includes(candidateCode)) {
      continue;
    }

    const candidateWeekStart = startOfWeekMonday(candidate);
    const weekDelta = Math.floor(
      (candidateWeekStart.getTime() - anchorWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
    if (weekDelta % interval !== 0) {
      continue;
    }

    return { nextAt: candidate, dueToday: offsetDays === 0 };
  }

  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 7);
  fallback.setHours(hours, minutes, 0, 0);
  return { nextAt: fallback, dueToday: false };
}

function sponsorCalendarEventStorageKey(userId: string): string {
  return `${SPONSOR_CALENDAR_EVENT_KEY_PREFIX}${userId}`;
}

function sponsorAlertLeadStorageKey(userId: string): string {
  return `${SPONSOR_ALERT_LEAD_KEY_PREFIX}${userId}`;
}

function sponsorLocalNotificationStorageKey(userId: string): string {
  return `${SPONSOR_LOCAL_NOTIFICATION_KEY_PREFIX}${userId}`;
}

function normalizeAlertLeadMinutes(value: number): number {
  const safeInteger = Number.isFinite(value)
    ? Math.round(value)
    : SPONSOR_ALERT_LEAD_DEFAULT_MINUTES;
  return Math.min(SPONSOR_ALERT_LEAD_MAX_MINUTES, Math.max(0, safeInteger));
}

function isValidCallTimeLocalHhmm(value: string): boolean {
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

function tryRequireModule<T>(moduleName: string): T | null {
  try {
    const dynamicRequire: (name: string) => unknown = require;
    return dynamicRequire(moduleName) as T;
  } catch {
    return null;
  }
}

function loadAsyncStorageModule(): AsyncStorageModule | null {
  const moduleValue = tryRequireModule<{
    default?: AsyncStorageModule;
    getItem?: AsyncStorageModule["getItem"];
    setItem?: AsyncStorageModule["setItem"];
    removeItem?: AsyncStorageModule["removeItem"];
  }>("@react-native-async-storage/async-storage");

  if (!moduleValue) {
    return null;
  }

  if (moduleValue.default) {
    return moduleValue.default;
  }

  if (moduleValue.getItem && moduleValue.setItem && moduleValue.removeItem) {
    return moduleValue as AsyncStorageModule;
  }

  return null;
}

function loadCalendarModule(): CalendarModule | null {
  return tryRequireModule<CalendarModule>("expo-calendar");
}

function resolveCalendarWeekdayMap(calendar: CalendarModule): CalendarWeekdayMap {
  return {
    SUNDAY: calendar.Weekday?.SUNDAY ?? 1,
    MONDAY: calendar.Weekday?.MONDAY ?? 2,
    TUESDAY: calendar.Weekday?.TUESDAY ?? 3,
    WEDNESDAY: calendar.Weekday?.WEDNESDAY ?? 4,
    THURSDAY: calendar.Weekday?.THURSDAY ?? 5,
    FRIDAY: calendar.Weekday?.FRIDAY ?? 6,
    SATURDAY: calendar.Weekday?.SATURDAY ?? 7,
  };
}

function buildCalendarRecurrenceRule(
  repeatUnit: RepeatUnit,
  repeatInterval: number,
  repeatDays: WeekdayCode[],
  calendar: CalendarModule,
): CalendarRecurrenceRuleInput {
  if (repeatUnit === "MONTHLY") {
    return {
      frequency: calendar.RecurrenceFrequency.MONTHLY,
      interval: Math.max(1, repeatInterval),
    };
  }

  const weekdays = resolveCalendarWeekdayMap(calendar);
  const weekdayNumberByCode: Record<WeekdayCode, number> = {
    MON: weekdays.MONDAY,
    TUE: weekdays.TUESDAY,
    WED: weekdays.WEDNESDAY,
    THU: weekdays.THURSDAY,
    FRI: weekdays.FRIDAY,
    SAT: weekdays.SATURDAY,
    SUN: weekdays.SUNDAY,
  };
  const normalizedDays =
    repeatDays.length > 0 ? sortWeekdays(repeatDays) : [getCurrentWeekdayCode(new Date())];
  return {
    frequency: calendar.RecurrenceFrequency.WEEKLY,
    interval: Math.max(1, repeatInterval),
    daysOfTheWeek: normalizedDays.map((day) => ({ dayOfTheWeek: weekdayNumberByCode[day] })),
  };
}

function pickWritableCalendar(calendars: CalendarRecord[]): CalendarRecord | null {
  const writableCalendars = calendars.filter((calendar) => calendar.allowsModifications);
  if (writableCalendars.length === 0) {
    return null;
  }

  const defaultWritable =
    writableCalendars.find((calendar) => calendar.isPrimary || calendar.isDefault) ??
    writableCalendars.find((calendar) =>
      calendar.source?.name ? calendar.source.name.toLowerCase().includes("default") : false,
    );
  return defaultWritable ?? writableCalendars[0];
}

function parseLeadMinutesInput(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) {
    return null;
  }
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue)) {
    return null;
  }
  if (parsedValue < 0 || parsedValue > SPONSOR_ALERT_LEAD_MAX_MINUTES) {
    return null;
  }
  return parsedValue;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Unknown error";
}

export default function App() {
  const extra = (appJson.expo.extra ?? {}) as Record<string, unknown>;
  const apiUrl = typeof extra.apiUrl === "string" ? extra.apiUrl : "http://localhost:3001";
  const devAuthUserId =
    typeof extra.devAuthUserId === "string" ? extra.devAuthUserId : "enduser-a1";
  const defaultSupervisionEnabled =
    typeof extra.supervisionEnabled === "boolean" ? extra.supervisionEnabled : false;
  const fallbackLat = typeof extra.fallbackLat === "number" ? extra.fallbackLat : 33.755;
  const fallbackLng = typeof extra.fallbackLng === "number" ? extra.fallbackLng : -84.39;
  const authHeader = useMemo(() => `Bearer DEV_${devAuthUserId}`, [devAuthUserId]);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAttendanceId, setLastAttendanceId] = useState<string | null>(null);
  const [lastAttendanceStatus, setLastAttendanceStatus] = useState<string | null>(null);
  const [sponsorName, setSponsorName] = useState("");
  const [sponsorPhoneDigits, setSponsorPhoneDigits] = useState("");
  const [sponsorHour12, setSponsorHour12] = useState(5);
  const [sponsorMinute, setSponsorMinute] = useState(0);
  const [sponsorMeridiem, setSponsorMeridiem] = useState<"AM" | "PM">("PM");
  const [sponsorRepeatPreset, setSponsorRepeatPreset] = useState<RepeatPreset>("WEEKLY");
  const [sponsorRepeatDays, setSponsorRepeatDays] = useState<WeekdayCode[]>([
    getCurrentWeekdayCode(new Date()),
  ]);
  const [sponsorActive, setSponsorActive] = useState(true);
  const [sponsorStatusMessage, setSponsorStatusMessage] = useState<string>(
    "Sponsor config not saved yet.",
  );
  const [savingSponsor, setSavingSponsor] = useState(false);
  const [alertLeadMinutes, setAlertLeadMinutes] = useState(SPONSOR_ALERT_LEAD_DEFAULT_MINUTES);
  const [customAlertLeadMinutes, setCustomAlertLeadMinutes] = useState(
    String(SPONSOR_ALERT_LEAD_DEFAULT_MINUTES),
  );
  const [calendarStatusMessage, setCalendarStatusMessage] = useState(
    "Calendar event not created yet.",
  );
  const [calendarEventId, setCalendarEventId] = useState<string | null>(null);
  const [savingCalendar, setSavingCalendar] = useState(false);

  const [supervisionEnabled, setSupervisionEnabled] = useState(defaultSupervisionEnabled);
  const [supervisionMessage, setSupervisionMessage] = useState<string>("Supervision mode is off.");
  const [zones, setZones] = useState<MeZone[]>([]);

  const zonesRef = useRef<MeZone[]>([]);
  const supervisionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supervisionActiveRef = useRef(false);
  const lastPingLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  const normalizedSponsorName = useMemo(() => sponsorName.trim(), [sponsorName]);
  const sponsorPhoneE164 = useMemo(
    () => toE164FromUsTenDigit(sponsorPhoneDigits),
    [sponsorPhoneDigits],
  );
  const callTimeLocalHhmm = useMemo(
    () => to24HourText(sponsorHour12, sponsorMinute, sponsorMeridiem),
    [sponsorHour12, sponsorMinute, sponsorMeridiem],
  );
  const sponsorConfigCompleteForCalendar = useMemo(
    () =>
      normalizedSponsorName.length > 0 &&
      sponsorPhoneE164 !== null &&
      isValidCallTimeLocalHhmm(callTimeLocalHhmm) &&
      (sponsorRepeatPreset === "MONTHLY" || sponsorRepeatDays.length > 0),
    [
      callTimeLocalHhmm,
      normalizedSponsorName,
      sponsorPhoneE164,
      sponsorRepeatPreset,
      sponsorRepeatDays,
    ],
  );
  const sponsorScheduleSummary = useMemo(() => {
    if (!sponsorActive) {
      return "Sponsor reminders disabled.";
    }

    const callTime = to24HourText(sponsorHour12, sponsorMinute, sponsorMeridiem);
    const repeatUnit: RepeatUnit = sponsorRepeatPreset === "MONTHLY" ? "MONTHLY" : "WEEKLY";
    const repeatInterval = sponsorRepeatPreset === "BIWEEKLY" ? 2 : 1;
    const repeatDays = repeatUnit === "MONTHLY" ? [] : sponsorRepeatDays;
    const result = computeNextCall(new Date(), callTime, repeatUnit, repeatInterval, repeatDays);
    const repeatSummary =
      sponsorRepeatPreset === "MONTHLY"
        ? "Monthly"
        : `${sponsorRepeatPreset === "BIWEEKLY" ? "Bi-weekly" : "Weekly"} on ${describeWeekdaySelection(repeatDays)}`;
    return `Next scheduled call: ${result.nextAt.toLocaleString()} • Due today: ${
      result.dueToday ? "Yes" : "No"
    } • ${repeatSummary}`;
  }, [
    sponsorActive,
    sponsorHour12,
    sponsorMinute,
    sponsorMeridiem,
    sponsorRepeatPreset,
    sponsorRepeatDays,
  ]);

  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);

  useEffect(() => {
    let isMounted = true;
    const asyncStorage = loadAsyncStorageModule();
    if (!asyncStorage) {
      return undefined;
    }

    void (async () => {
      try {
        const [storedAlertLeadText, storedEventId] = await Promise.all([
          asyncStorage.getItem(sponsorAlertLeadStorageKey(devAuthUserId)),
          asyncStorage.getItem(sponsorCalendarEventStorageKey(devAuthUserId)),
        ]);
        if (!isMounted) {
          return;
        }

        if (storedAlertLeadText !== null) {
          const parsedAlertLead = parseLeadMinutesInput(storedAlertLeadText);
          if (parsedAlertLead !== null) {
            const normalizedAlertLead = normalizeAlertLeadMinutes(parsedAlertLead);
            setAlertLeadMinutes(normalizedAlertLead);
            setCustomAlertLeadMinutes(String(normalizedAlertLead));
          }
        }

        if (storedEventId) {
          setCalendarEventId(storedEventId);
          setCalendarStatusMessage("Loaded existing sponsor calendar event.");
        }
      } catch {
        if (isMounted) {
          setCalendarStatusMessage("Unable to load saved calendar settings.");
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [devAuthUserId]);

  function getGeolocation(): GeolocationApi | undefined {
    const navigatorValue = (
      globalThis as typeof globalThis & { navigator?: { geolocation?: GeolocationApi } }
    ).navigator;
    return navigatorValue?.geolocation;
  }

  async function requestLocationPermissionFlow() {
    if (Platform.OS !== "ios") {
      return;
    }

    const geolocation = getGeolocation();
    if (!geolocation) {
      setSupervisionMessage("Location API unavailable in this build. Using fallback coordinates.");
      return;
    }

    await new Promise<void>((resolve) => {
      geolocation.getCurrentPosition(
        () => resolve(),
        () => resolve(),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
      );
    });
    setSupervisionMessage("If prompted, choose Always Allow to keep supervision active.");
  }

  async function readCurrentLocation(): Promise<{ lat: number; lng: number; accuracyM?: number }> {
    const geolocation = getGeolocation();
    if (!geolocation) {
      return {
        lat: fallbackLat,
        lng: fallbackLng,
        accuracyM: undefined,
      };
    }

    return new Promise((resolve) => {
      geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyM: position.coords.accuracy,
          });
        },
        () => {
          resolve({
            lat: fallbackLat,
            lng: fallbackLng,
            accuracyM: undefined,
          });
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
      );
    });
  }

  async function fetchMeetings() {
    setLoadingMeetings(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/v1/meetings`, {
        headers: {
          Authorization: authHeader,
        },
      });
      if (!response.ok) {
        setError(`Meetings request failed: ${response.status}`);
        return;
      }

      const payload = (await response.json()) as { meetings?: Meeting[] };
      setMeetings(payload.meetings ?? []);
    } catch {
      setError("Unable to reach API.");
    } finally {
      setLoadingMeetings(false);
    }
  }

  async function fetchMyZones() {
    try {
      const response = await fetch(`${apiUrl}/v1/me/zones`, {
        headers: {
          Authorization: authHeader,
        },
      });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { zones?: MeZone[] };
      setZones(payload.zones ?? []);
    } catch {
      // Ignore zone fetch failure and continue pinging.
    }
  }

  async function fetchSponsorConfig() {
    try {
      const response = await fetch(`${apiUrl}/v1/me/sponsor`, {
        headers: {
          Authorization: authHeader,
        },
      });
      if (!response.ok) {
        setSponsorStatusMessage(`Sponsor config load failed: ${response.status}`);
        return;
      }

      const payload = (await response.json()) as { sponsorConfig?: SponsorConfigResponse | null };
      if (!payload.sponsorConfig) {
        setSponsorStatusMessage("Sponsor config not set.");
        return;
      }

      const config = payload.sponsorConfig;
      setSponsorName(config.sponsorName);
      setSponsorPhoneDigits(normalizePhoneDigits(config.sponsorPhoneE164));
      const parsedTime = from24HourText(config.callTimeLocalHhmm);
      setSponsorHour12(parsedTime.hour12);
      setSponsorMinute(parsedTime.minute);
      setSponsorMeridiem(parsedTime.meridiem);
      const fallbackDay = getCurrentWeekdayCode(new Date());
      const resolvedRepeatState = resolveRepeatStateFromConfig(config, fallbackDay);
      setSponsorRepeatPreset(resolvedRepeatState.preset);
      setSponsorRepeatDays(resolvedRepeatState.days);
      setSponsorActive(config.active);
      const repeatSummary =
        resolvedRepeatState.preset === "MONTHLY"
          ? "Monthly"
          : `${resolvedRepeatState.preset === "BIWEEKLY" ? "Bi-weekly" : "Weekly"} on ${describeWeekdaySelection(resolvedRepeatState.days)}`;
      setSponsorStatusMessage(
        `Loaded sponsor config (${formatCallTime12Hour(config.callTimeLocalHhmm)}, ${repeatSummary}).`,
      );
    } catch {
      setSponsorStatusMessage("Sponsor config load failed: network.");
    }
  }

  function toggleRepeatDay(day: WeekdayCode) {
    setSponsorRepeatDays((previous) => {
      const next = previous.includes(day)
        ? previous.filter((value) => value !== day)
        : [...previous, day];
      return sortWeekdays(next);
    });
  }

  async function persistAlertLeadMinutes(nextMinutes: number) {
    const asyncStorage = loadAsyncStorageModule();
    if (!asyncStorage) {
      return;
    }

    try {
      await asyncStorage.setItem(sponsorAlertLeadStorageKey(devAuthUserId), String(nextMinutes));
    } catch {
      setCalendarStatusMessage("Failed to save reminder lead time locally.");
    }
  }

  function applyAlertLeadMinutes(nextMinutes: number) {
    const normalized = normalizeAlertLeadMinutes(nextMinutes);
    setAlertLeadMinutes(normalized);
    setCustomAlertLeadMinutes(String(normalized));
    void persistAlertLeadMinutes(normalized);
  }

  function handleApplyCustomAlertLeadMinutes() {
    const parsedMinutes = parseLeadMinutesInput(customAlertLeadMinutes);
    if (parsedMinutes === null) {
      setCalendarStatusMessage(
        `Lead time must be between 0 and ${SPONSOR_ALERT_LEAD_MAX_MINUTES} minutes.`,
      );
      return;
    }

    applyAlertLeadMinutes(parsedMinutes);
    setCalendarStatusMessage(`Reminder lead time set to ${parsedMinutes} minutes.`);
  }

  function handleResetAlertLeadMinutes() {
    applyAlertLeadMinutes(SPONSOR_ALERT_LEAD_DEFAULT_MINUTES);
    setCalendarStatusMessage(
      `Reminder lead time reset to ${SPONSOR_ALERT_LEAD_DEFAULT_MINUTES} minutes.`,
    );
  }

  async function handleAddToCalendar() {
    if (!sponsorConfigCompleteForCalendar || sponsorPhoneE164 === null) {
      setCalendarStatusMessage("Complete sponsor name, phone, call time, and repeat rule first.");
      return;
    }

    if (Platform.OS !== "ios") {
      setCalendarStatusMessage("Add to Calendar is currently available on iOS.");
      return;
    }

    const calendarModule = loadCalendarModule();
    if (!calendarModule) {
      setCalendarStatusMessage("Calendar module unavailable. Install expo-calendar.");
      return;
    }

    setSavingCalendar(true);
    try {
      const permission = await calendarModule.requestCalendarPermissionsAsync();
      const isGranted = permission.granted ?? permission.status === "granted";
      if (!isGranted) {
        setCalendarStatusMessage("Calendar permission denied. Enable in Settings.");
        return;
      }

      let defaultCalendar: CalendarRecord | null = null;
      if (calendarModule.getDefaultCalendarAsync) {
        try {
          defaultCalendar = await calendarModule.getDefaultCalendarAsync();
        } catch {
          defaultCalendar = null;
        }
      }

      const calendars = await calendarModule.getCalendarsAsync(calendarModule.EntityTypes.EVENT);
      const writableCalendar =
        defaultCalendar && defaultCalendar.allowsModifications
          ? defaultCalendar
          : pickWritableCalendar(calendars);
      if (!writableCalendar) {
        setCalendarStatusMessage("No writable calendar found.");
        return;
      }

      const repeatUnit: RepeatUnit = sponsorRepeatPreset === "MONTHLY" ? "MONTHLY" : "WEEKLY";
      const repeatInterval = sponsorRepeatPreset === "BIWEEKLY" ? 2 : 1;
      const repeatDays =
        repeatUnit === "MONTHLY"
          ? []
          : sortWeekdays(sponsorRepeatDays.filter((day) => WEEKDAY_CODES.includes(day)));
      const nextCall = computeNextCall(
        new Date(),
        callTimeLocalHhmm,
        repeatUnit,
        repeatInterval,
        repeatDays,
      ).nextAt;
      const repeatSummary =
        repeatUnit === "MONTHLY"
          ? "Monthly"
          : `${repeatInterval === 2 ? "Bi-weekly" : "Weekly"} on ${describeWeekdaySelection(repeatDays)}`;
      const reminderLeadMinutes = normalizeAlertLeadMinutes(alertLeadMinutes);
      const eventDetails: CalendarEventInput = {
        title: "Call Sponsor",
        notes: [
          `Sponsor: ${normalizedSponsorName}`,
          `Phone: ${sponsorPhoneE164}`,
          `Repeat: ${repeatSummary}`,
        ].join("\n"),
        startDate: nextCall,
        endDate: new Date(nextCall.getTime() + 15 * 60 * 1000),
        recurrenceRule: buildCalendarRecurrenceRule(
          repeatUnit,
          repeatInterval,
          repeatDays,
          calendarModule,
        ),
        alarms: [{ relativeOffset: -reminderLeadMinutes }],
      };
      const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (localTimezone) {
        eventDetails.timeZone = localTimezone;
      }

      const asyncStorage = loadAsyncStorageModule();
      const eventStorageKey = sponsorCalendarEventStorageKey(devAuthUserId);
      const notificationStorageKey = sponsorLocalNotificationStorageKey(devAuthUserId);
      const storedEventId =
        calendarEventId ??
        (asyncStorage ? await asyncStorage.getItem(eventStorageKey) : null) ??
        null;
      const storedNotificationId = asyncStorage
        ? await asyncStorage.getItem(notificationStorageKey)
        : null;

      let resultingEventId: string;
      let updatedExistingEvent = false;

      if (storedEventId) {
        try {
          const existingEvent = await calendarModule.getEventAsync(storedEventId);
          if (!existingEvent) {
            throw new Error("Stored event deleted");
          }
          const updatedId = await calendarModule.updateEventAsync(storedEventId, eventDetails);
          resultingEventId = updatedId || storedEventId;
          updatedExistingEvent = true;
        } catch (error) {
          const message = describeError(error).toLowerCase();
          const shouldRecreate =
            message.includes("not found") ||
            message.includes("does not exist") ||
            message.includes("deleted") ||
            message.includes("no event");

          if (!shouldRecreate) {
            throw error;
          }

          resultingEventId = await calendarModule.createEventAsync(
            writableCalendar.id,
            eventDetails,
          );
        }
      } else {
        resultingEventId = await calendarModule.createEventAsync(writableCalendar.id, eventDetails);
      }

      setCalendarEventId(resultingEventId);
      if (asyncStorage) {
        await asyncStorage.setItem(eventStorageKey, resultingEventId);
      }
      let localReminderStatus = "Calendar saved.";
      const notificationPermission = await Notifications.getPermissionsAsync();
      let notificationsGranted = notificationPermission.granted;
      if (!notificationsGranted) {
        const requestedPermission = await Notifications.requestPermissionsAsync();
        notificationsGranted = requestedPermission.granted;
      }

      if (notificationsGranted) {
        if (storedNotificationId) {
          try {
            await Notifications.cancelScheduledNotificationAsync(storedNotificationId);
          } catch {
            // Ignore stale notification IDs.
          }
        }
        const now = new Date();
        const reminderAt = new Date(nextCall.getTime() - reminderLeadMinutes * 60 * 1000);
        const triggerAt =
          reminderAt.getTime() > now.getTime() ? reminderAt : new Date(now.getTime() + 5000);
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: "Sponsor call reminder",
            body: `Call ${normalizedSponsorName} at ${formatCallTime12Hour(callTimeLocalHhmm)}.`,
            sound: "default",
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: triggerAt,
          },
        });
        if (asyncStorage) {
          await asyncStorage.setItem(notificationStorageKey, notificationId);
        }
        localReminderStatus = `Alert scheduled for ${triggerAt.toLocaleString()} with sound.`;
      } else {
        localReminderStatus = "Calendar saved, but notification permission is denied.";
      }

      setCalendarStatusMessage(
        updatedExistingEvent
          ? `Sponsor calendar event updated. ${localReminderStatus}`
          : `Sponsor calendar event created. ${localReminderStatus}`,
      );
    } catch (error) {
      setCalendarStatusMessage(`Calendar update failed: ${describeError(error)}`);
    } finally {
      setSavingCalendar(false);
    }
  }

  async function handleSaveSponsorConfig() {
    const normalizedName = sponsorName.trim();
    if (!normalizedName) {
      setSponsorStatusMessage("Sponsor name is required.");
      return;
    }

    const phoneE164 = toE164FromUsTenDigit(sponsorPhoneDigits);
    if (!phoneE164) {
      setSponsorStatusMessage("Sponsor phone must be a valid 10-digit US number.");
      return;
    }

    const repeatUnit: RepeatUnit = sponsorRepeatPreset === "MONTHLY" ? "MONTHLY" : "WEEKLY";
    const repeatInterval = sponsorRepeatPreset === "BIWEEKLY" ? 2 : 1;
    const repeatDays =
      repeatUnit === "MONTHLY"
        ? []
        : sortWeekdays(sponsorRepeatDays.filter((day) => WEEKDAY_CODES.includes(day)));
    if (repeatUnit === "WEEKLY" && repeatDays.length === 0) {
      setSponsorStatusMessage("Select at least one weekday for weekly reminders.");
      return;
    }

    const payload: SponsorConfigPayload = {
      sponsorName: normalizedName,
      sponsorPhoneE164: phoneE164,
      callTimeLocalHhmm: to24HourText(sponsorHour12, sponsorMinute, sponsorMeridiem),
      repeatUnit,
      repeatInterval,
      repeatDays,
      active: sponsorActive,
      repeatRule: deriveLegacyRepeatRule(repeatUnit, repeatInterval, repeatDays),
    };

    setSavingSponsor(true);
    try {
      const response = await fetch(`${apiUrl}/v1/me/sponsor`, {
        method: "PUT",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setSponsorStatusMessage(`Sponsor config save failed: ${response.status}`);
        return;
      }

      // TODO(notifications): wire Expo local notifications for sponsor reminders.
      const repeatSummary =
        repeatUnit === "MONTHLY"
          ? "Monthly"
          : `${repeatInterval === 2 ? "Bi-weekly" : "Weekly"} on ${describeWeekdaySelection(repeatDays)}`;
      setSponsorStatusMessage(
        `Sponsor config saved (${formatCallTime12Hour(payload.callTimeLocalHhmm)}, ${repeatSummary}).`,
      );
    } catch {
      setSponsorStatusMessage("Sponsor config save failed: network.");
    } finally {
      setSavingSponsor(false);
    }
  }

  async function handleCheckIn(meetingId: string) {
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/v1/attendance/check-in`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ meetingId }),
      });
      if (!response.ok) {
        setError(`Check-in failed: ${response.status}`);
        return;
      }

      const payload = (await response.json()) as AttendanceResponse;
      setLastAttendanceId(payload.attendance.id);
      setLastAttendanceStatus(payload.attendance.status);
    } catch {
      setError("Check-in failed: network error.");
    }
  }

  async function handleCheckOut() {
    if (!lastAttendanceId) {
      setError("No active attendance to check out.");
      return;
    }

    setError(null);
    try {
      const response = await fetch(`${apiUrl}/v1/attendance/check-out`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ attendanceId: lastAttendanceId }),
      });
      if (!response.ok) {
        setError(`Check-out failed: ${response.status}`);
        return;
      }

      const payload = (await response.json()) as AttendanceResponse;
      setLastAttendanceStatus(payload.attendance.status);
    } catch {
      setError("Check-out failed: network error.");
    }
  }

  function scheduleNextPing(delayMs: number) {
    if (supervisionTimerRef.current) {
      clearTimeout(supervisionTimerRef.current);
    }
    supervisionTimerRef.current = setTimeout(() => {
      void runSupervisionTick();
    }, delayMs);
  }

  async function runSupervisionTick() {
    if (!supervisionActiveRef.current) {
      return;
    }

    const currentLocation = await readCurrentLocation();
    const nowIso = new Date().toISOString();

    try {
      const response = await fetch(`${apiUrl}/v1/location/ping`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lat: currentLocation.lat,
          lng: currentLocation.lng,
          accuracyM: currentLocation.accuracyM,
          recordedAt: nowIso,
        }),
      });

      if (!response.ok) {
        setSupervisionMessage(`Ping failed (${response.status}). Retrying in 180s.`);
        scheduleNextPing(180_000);
        return;
      }

      const nearZone = isNearAssignedZone(
        currentLocation.lat,
        currentLocation.lng,
        zonesRef.current,
      );
      const lastLocation = lastPingLocationRef.current;
      const moving =
        lastLocation !== null &&
        distanceMetersBetween(
          lastLocation.lat,
          lastLocation.lng,
          currentLocation.lat,
          currentLocation.lng,
        ) > 25;
      lastPingLocationRef.current = { lat: currentLocation.lat, lng: currentLocation.lng };

      const nextMs = moving || nearZone ? 15_000 : 120_000;
      setSupervisionMessage(
        `Supervision active. Last ping ${nowIso}. Next ping in ${Math.round(nextMs / 1000)}s.`,
      );
      scheduleNextPing(nextMs);
    } catch {
      setSupervisionMessage("Ping failed (network). Retrying in 180s.");
      scheduleNextPing(180_000);
    }
  }

  useEffect(() => {
    // TODO(auth): Replace DEV auth headers with real auth session tokens.
    void fetchMeetings();
    void fetchSponsorConfig();
  }, []);

  useEffect(() => {
    if (!supervisionEnabled) {
      supervisionActiveRef.current = false;
      if (supervisionTimerRef.current) {
        clearTimeout(supervisionTimerRef.current);
      }
      setSupervisionMessage("Supervision mode is off.");
      return;
    }

    supervisionActiveRef.current = true;
    void (async () => {
      await requestLocationPermissionFlow();
      await fetchMyZones();
      await runSupervisionTick();
    })();

    return () => {
      supervisionActiveRef.current = false;
      if (supervisionTimerRef.current) {
        clearTimeout(supervisionTimerRef.current);
      }
    };
  }, [supervisionEnabled]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={24}
    >
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Recovery Accountability (Scaffold)</Text>
        <Text style={styles.meta}>DEV user: {devAuthUserId}</Text>
        {loadingMeetings ? <Text>Loading meetings...</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Refresh Meetings" onPress={() => void fetchMeetings()} />

        <View style={styles.supervisionBox}>
          <View style={styles.supervisionRow}>
            <Text style={styles.supervisionTitle}>Supervision mode</Text>
            <Switch value={supervisionEnabled} onValueChange={setSupervisionEnabled} />
          </View>
          <Text style={styles.supervisionMeta}>{supervisionMessage}</Text>
          <Text style={styles.supervisionMeta}>Zone rules loaded: {zones.length}</Text>
        </View>

        <View style={styles.sponsorBox}>
          <Text style={styles.sponsorTitle}>Sponsor</Text>
          <TextInput
            style={styles.input}
            value={sponsorName}
            onChangeText={setSponsorName}
            placeholder="Sponsor name"
          />
          <TextInput
            style={styles.input}
            value={formatUsPhoneDisplay(sponsorPhoneDigits)}
            onChangeText={(value) => setSponsorPhoneDigits(normalizePhoneDigits(value))}
            placeholder="(555) 555-1234"
            keyboardType="phone-pad"
            maxLength={14}
          />

          <Text style={styles.sponsorLabel}>Call time</Text>
          <View style={styles.timeWheelRow}>
            <TimeWheelPicker
              items={HOUR_OPTIONS}
              value={sponsorHour12}
              onChange={setSponsorHour12}
              formatItem={(value) => String(value).padStart(2, "0")}
              width={72}
            />
            <Text style={styles.timeWheelColon}>:</Text>
            <TimeWheelPicker
              items={MINUTE_OPTIONS}
              value={sponsorMinute}
              onChange={setSponsorMinute}
              formatItem={(value) => String(value).padStart(2, "0")}
              width={72}
            />
            <TimeWheelPicker
              items={MERIDIEM_OPTIONS}
              value={sponsorMeridiem}
              onChange={setSponsorMeridiem}
              width={88}
            />
          </View>

          <Text style={styles.sponsorLabel}>Repeat</Text>
          <View style={styles.repeatRow}>
            {SPONSOR_REPEAT_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.repeatChip,
                  sponsorRepeatPreset === option.value ? styles.repeatChipSelected : null,
                ]}
                onPress={() => setSponsorRepeatPreset(option.value)}
              >
                <Text
                  style={[
                    styles.repeatChipText,
                    sponsorRepeatPreset === option.value ? styles.repeatChipTextSelected : null,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {sponsorRepeatPreset !== "MONTHLY" ? (
            <>
              <Text style={styles.sponsorLabel}>Days</Text>
              <View style={styles.repeatRow}>
                {WEEKDAY_OPTIONS.map((day) => (
                  <Pressable
                    key={day.code}
                    style={[
                      styles.repeatChip,
                      sponsorRepeatDays.includes(day.code) ? styles.repeatChipSelected : null,
                    ]}
                    onPress={() => toggleRepeatDay(day.code)}
                  >
                    <Text
                      style={[
                        styles.repeatChipText,
                        sponsorRepeatDays.includes(day.code) ? styles.repeatChipTextSelected : null,
                      ]}
                    >
                      {day.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <Text style={styles.sponsorLabel}>Alert lead time (minutes)</Text>
          <View style={styles.repeatRow}>
            {SPONSOR_ALERT_LEAD_PRESETS_MINUTES.map((minutes) => (
              <Pressable
                key={minutes}
                style={[
                  styles.repeatChip,
                  alertLeadMinutes === minutes ? styles.repeatChipSelected : null,
                ]}
                onPress={() => applyAlertLeadMinutes(minutes)}
              >
                <Text
                  style={[
                    styles.repeatChipText,
                    alertLeadMinutes === minutes ? styles.repeatChipTextSelected : null,
                  ]}
                >
                  {minutes === 0 ? "No lead time" : `${minutes}m`}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.customLeadRow}>
            <TextInput
              style={styles.customLeadInput}
              value={customAlertLeadMinutes}
              onChangeText={setCustomAlertLeadMinutes}
              placeholder="Custom minutes"
              keyboardType="number-pad"
              maxLength={4}
            />
            <Pressable style={styles.customLeadButton} onPress={handleApplyCustomAlertLeadMinutes}>
              <Text style={styles.customLeadButtonText}>Apply</Text>
            </Pressable>
          </View>
          <Pressable style={styles.resetLeadButton} onPress={handleResetAlertLeadMinutes}>
            <Text style={styles.resetLeadButtonText}>
              Reset to default ({SPONSOR_ALERT_LEAD_DEFAULT_MINUTES}m)
            </Text>
          </Pressable>

          <View style={styles.supervisionRow}>
            <Text style={styles.sponsorLabel}>Active reminders</Text>
            <Switch value={sponsorActive} onValueChange={setSponsorActive} />
          </View>

          <Text style={styles.sponsorMeta}>{sponsorScheduleSummary}</Text>
          <Text style={styles.sponsorMeta}>Calendar alert: {alertLeadMinutes} minutes before</Text>
          <Text style={styles.sponsorMeta}>{sponsorStatusMessage}</Text>
          <Text style={styles.sponsorMeta}>{calendarStatusMessage}</Text>
          <Button
            title={savingSponsor ? "Saving..." : "Save Sponsor Config"}
            onPress={() => void handleSaveSponsorConfig()}
            disabled={savingSponsor}
          />
          <Button
            title={savingCalendar ? "Adding..." : "Add to Calendar"}
            onPress={() => void handleAddToCalendar()}
            disabled={savingCalendar || !sponsorConfigCompleteForCalendar}
          />
          <Text style={styles.sponsorMeta}>
            If install changed recently, reset Metro: pnpm --filter @recovery/mobile dev -- --clear
          </Text>
        </View>

        <View style={styles.list}>
          {meetings.map((item) => (
            <View key={item.id} style={styles.item}>
              <Text style={styles.itemTitle}>{item.name}</Text>
              <Text style={styles.itemAddress}>{item.address}</Text>
              <Button title="Check In" onPress={() => void handleCheckIn(item.id)} />
            </View>
          ))}
          {!loadingMeetings && meetings.length === 0 ? <Text>No meetings found.</Text> : null}
        </View>
        <View style={styles.checkoutBox}>
          <Text>Last attendance: {lastAttendanceId ?? "None"}</Text>
          <Text>Last status: {lastAttendanceStatus ?? "N/A"}</Text>
          <Button title="Check Out Last Attendance" onPress={() => void handleCheckOut()} />
        </View>
      </ScrollView>
      <StatusBar style="auto" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f4f7fb",
  },
  contentContainer: {
    paddingTop: 64,
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
  },
  meta: {
    marginBottom: 8,
  },
  error: {
    color: "#b00020",
    marginBottom: 8,
  },
  supervisionBox: {
    marginTop: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    backgroundColor: "#fff",
    padding: 10,
    gap: 6,
  },
  supervisionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  supervisionTitle: {
    fontWeight: "700",
  },
  supervisionMeta: {
    color: "#475467",
    fontSize: 12,
  },
  sponsorBox: {
    marginTop: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    backgroundColor: "#fff",
    padding: 10,
    gap: 8,
  },
  sponsorTitle: {
    fontWeight: "700",
    fontSize: 16,
  },
  sponsorLabel: {
    fontWeight: "600",
    color: "#344054",
  },
  sponsorMeta: {
    color: "#475467",
    fontSize: 12,
  },
  buttonSpacer: {
    height: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  customLeadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  customLeadInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  customLeadButton: {
    borderWidth: 1,
    borderColor: "#155eef",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#155eef",
  },
  customLeadButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  resetLeadButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#f8fafc",
  },
  resetLeadButtonText: {
    color: "#344054",
    fontSize: 12,
    fontWeight: "600",
  },
  timeWheelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeWheelColumn: {
    height: TIME_WHEEL_ITEM_HEIGHT * TIME_WHEEL_VISIBLE_ROWS,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    overflow: "hidden",
  },
  timeWheelContent: {
    paddingVertical: TIME_WHEEL_SIDE_PADDING,
  },
  timeWheelItem: {
    height: TIME_WHEEL_ITEM_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  timeWheelItemText: {
    color: "#1d2939",
    fontSize: 18,
    fontWeight: "600",
  },
  timeWheelSelection: {
    position: "absolute",
    left: 0,
    right: 0,
    top: TIME_WHEEL_SIDE_PADDING,
    height: TIME_WHEEL_ITEM_HEIGHT,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderColor: "#98a2b3",
    backgroundColor: "rgba(255, 255, 255, 0.45)",
  },
  timeWheelColon: {
    color: "#344054",
    fontSize: 22,
    fontWeight: "700",
    marginHorizontal: -2,
  },
  repeatRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  repeatChip: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  repeatChipSelected: {
    borderColor: "#155eef",
    backgroundColor: "#e0eaff",
  },
  repeatChipText: {
    color: "#344054",
    fontSize: 12,
  },
  repeatChipTextSelected: {
    color: "#1d4ed8",
    fontWeight: "700",
  },
  list: {
    marginTop: 12,
  },
  item: {
    borderWidth: 1,
    borderColor: "#d9d9d9",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  itemTitle: {
    fontWeight: "700",
    marginBottom: 4,
  },
  itemAddress: {
    marginBottom: 8,
  },
  checkoutBox: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#ddd",
    paddingTop: 12,
    marginBottom: 12,
  },
});
