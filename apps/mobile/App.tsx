import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Calendar from "expo-calendar";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  GestureResponderEvent,
  KeyboardAvoidingView,
  Linking,
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
import { createMeetingsSource, MeetingRecord } from "./lib/meetings/source";
import { ATTENDANCE_PDF_FILE_NAME, exportAttendancePdf } from "./lib/pdf/exportAttendancePdf";

type RecoveryMode = "A" | "B" | "C";
type AppScreen = "LIST" | "DETAIL" | "SESSION" | "SIGNATURE";
type WeekdayCode = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
type RepeatUnit = "WEEKLY" | "MONTHLY";
type RepeatPreset = "WEEKLY" | "BIWEEKLY" | "MONTHLY";
type LocationPermissionState = "unknown" | "granted" | "denied" | "unavailable";
type SponsorLeadMinutes = 0 | 5 | 10 | 30;

type SponsorConfigPayload = {
  sponsorName: string;
  sponsorPhoneE164: string;
  callTimeLocalHhmm: string;
  repeatUnit: RepeatUnit;
  repeatInterval: number;
  repeatDays: WeekdayCode[];
  active: boolean;
};

type SponsorConfigResponse = SponsorConfigPayload;

type LocationStamp = {
  lat: number;
  lng: number;
  accuracyM: number | null;
};

type GeolocationApi = {
  getCurrentPosition(
    success: (position: {
      coords: {
        latitude: number;
        longitude: number;
        accuracy?: number;
      };
    }) => void,
    error?: (error: unknown) => void,
    options?: {
      enableHighAccuracy?: boolean;
      timeout?: number;
      maximumAge?: number;
    },
  ): void;
};

type AttendanceRecord = {
  id: string;
  meetingId: string;
  meetingName: string;
  meetingAddress: string;
  startAt: string;
  endAt: string | null;
  durationSeconds: number | null;
  startLat: number | null;
  startLng: number | null;
  startAccuracyM: number | null;
  endLat: number | null;
  endLng: number | null;
  endAccuracyM: number | null;
  signaturePngBase64: string | null;
  pdfUri: string | null;
};

type DayOption = {
  offset: number;
  label: string;
  dayOfWeek: number;
  date: Date;
  dateKey: string;
};

type MeetingListItem = MeetingRecord & {
  distanceMeters: number | null;
};

type PlannedMeeting = {
  going: boolean;
  earlyMinutes: number;
  serviceCommitmentMinutes: number | null;
};

type DayPlanState = {
  homeGroupMeetingId: string | null;
  plans: Record<string, PlannedMeeting>;
};

type MeetingPlansState = Record<string, DayPlanState>;

type NotificationBuckets = {
  sponsor: string[];
  drive: string[];
};

type TravelTimeProvider = {
  estimateMinutes(distanceMeters: number | null): number;
};

type DriveSchedulePreview = {
  meetingStartAt: Date;
  arrivalBufferMinutes: number;
  travelMinutes: number;
  departAt: Date;
  notifyAt: Date;
  usesServiceCommitment: boolean;
};

type LocationIssue = "permission_denied" | "position_unavailable" | "unavailable" | null;

const ARRIVAL_RADIUS_METERS = 61;
const EARTH_RADIUS_METERS = 6371000;
const ATTENDANCE_STORAGE_KEY_PREFIX = "recovery:verifiedAttendance:";
const MEETING_PLAN_STORAGE_KEY_PREFIX = "recovery:meetingPlans:";
const NOTIFICATION_STORAGE_KEY_PREFIX = "recovery:notificationIds:";
const MODE_STORAGE_KEY_PREFIX = "recovery:mode:";
const SPONSOR_UI_PREFS_STORAGE_KEY_PREFIX = "recovery:sponsorUiPrefs:";
const SPONSOR_CALENDAR_EVENT_STORAGE_KEY_PREFIX = "recovery:sponsorCalendarEvent:";
const SPONSOR_CALENDAR_EVENT_FINGERPRINT_STORAGE_KEY_PREFIX =
  "recovery:sponsorCalendarEventFingerprint:";
const SPONSOR_ALERT_FINGERPRINT_STORAGE_KEY_PREFIX = "recovery:sponsorAlertFingerprint:";

const SPONSOR_NOTIFICATION_CATEGORY_ID = "SPONSOR_CALL";
const DRIVE_NOTIFICATION_CATEGORY_ID = "DRIVE_LEAVE";
const SPONSOR_CALL_ACTION_ID = "SPONSOR_CALL_NOW";
const DRIVE_ACTION_ID = "DRIVE_NOW";

const DEFAULT_MEETING_EARLY_MINUTES = 10;
const DEFAULT_SERVICE_COMMITMENT_MINUTES = 45;
const LOCALHOST_API_HINT = "API URL is localhost; set it to your machine IP for simulator/device.";

const WEEKDAY_OPTIONS: Array<{ code: WeekdayCode; label: string; jsDay: number }> = [
  { code: "MON", label: "Mon", jsDay: 1 },
  { code: "TUE", label: "Tue", jsDay: 2 },
  { code: "WED", label: "Wed", jsDay: 3 },
  { code: "THU", label: "Thu", jsDay: 4 },
  { code: "FRI", label: "Fri", jsDay: 5 },
  { code: "SAT", label: "Sat", jsDay: 6 },
  { code: "SUN", label: "Sun", jsDay: 0 },
];
const WEEKDAY_CODES = WEEKDAY_OPTIONS.map((item) => item.code);

const SPONSOR_REPEAT_OPTIONS: Array<{ value: RepeatPreset; label: string }> = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Bi-weekly" },
  { value: "MONTHLY", label: "Monthly" },
];

const SPONSOR_LEAD_OPTIONS: Array<{ value: SponsorLeadMinutes; label: string }> = [
  { value: 0, label: "None" },
  { value: 5, label: "5m" },
  { value: 10, label: "10m" },
  { value: 30, label: "30m" },
];

const RECOVERY_MODE_OPTIONS: Array<{ value: RecoveryMode; title: string; implemented: boolean }> = [
  { value: "A", title: "Recovery", implemented: true },
  { value: "B", title: "Sober Housing", implemented: false },
  { value: "C", title: "Probation/Parole", implemented: false },
];

const EMPTY_DAY_PLAN: DayPlanState = {
  homeGroupMeetingId: null,
  plans: {},
};

function createTravelTimeProvider(assumedSpeedMph = 25): TravelTimeProvider {
  const speedMetersPerMinute = (assumedSpeedMph * 1609.344) / 60;

  return {
    estimateMinutes(distanceMeters: number | null): number {
      if (distanceMeters === null) {
        return 15;
      }
      const estimated = Math.ceil(distanceMeters / speedMetersPerMinute);
      return Math.max(5, Math.min(180, estimated));
    },
  };
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMetersBetween(latA: number, lngA: number, latB: number, lngB: number): number {
  const latDelta = toRadians(latB - latA);
  const lngDelta = toRadians(lngB - lngA);
  const latAInRadians = toRadians(latA);
  const latBInRadians = toRadians(latB);

  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(latAInRadians) * Math.cos(latBInRadians) * Math.sin(lngDelta / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

function formatDistance(distanceMeters: number | null): string {
  if (distanceMeters === null) {
    return "Distance unavailable";
  }
  const miles = distanceMeters / 1609.344;
  return `${miles.toFixed(1)} mi`;
}

function parseMinutesFromHhmm(value: string): number {
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 0;
  }
  return Math.max(0, Math.min(23, hours)) * 60 + Math.max(0, Math.min(59, minutes));
}

function normalizePhoneDigits(value: string): string {
  const stripped = value.replace(/\D/g, "");
  const withoutCountryCode =
    stripped.length === 11 && stripped.startsWith("1") ? stripped.slice(1) : stripped;
  return withoutCountryCode.slice(0, 10);
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

function dateKeyForDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function createDayOptions(): DayOption[] {
  const result: DayOption[] = [];
  const today = new Date();

  for (let offset = 0; offset < 7; offset += 1) {
    const next = new Date(today);
    next.setDate(today.getDate() + offset);
    result.push({
      offset,
      label: offset === 0 ? "Today" : next.toLocaleDateString(undefined, { weekday: "short" }),
      dayOfWeek: next.getDay(),
      date: next,
      dateKey: dateKeyForDate(next),
    });
  }

  return result;
}

function sortWeekdays(days: WeekdayCode[]): WeekdayCode[] {
  const set = new Set(days);
  return WEEKDAY_CODES.filter((code) => set.has(code));
}

function describeWeekdays(days: WeekdayCode[]): string {
  if (days.length === 0) {
    return "No days selected";
  }
  return days
    .map((day) => WEEKDAY_OPTIONS.find((option) => option.code === day)?.label ?? day)
    .join(", ");
}

function to24HourText(hour12: number, minute: number, meridiem: "AM" | "PM"): string {
  const hour = Math.max(1, Math.min(12, Math.round(hour12)));
  const minuteSafe = Math.max(0, Math.min(59, Math.round(minute)));
  let result = hour % 12;
  if (meridiem === "PM") {
    result += 12;
  }
  return `${String(result).padStart(2, "0")}:${String(minuteSafe).padStart(2, "0")}`;
}

function from24HourText(value: string): { hour12: number; minute: number; meridiem: "AM" | "PM" } {
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  const normalizedHours = Number.isFinite(hours) ? Math.max(0, Math.min(23, hours)) : 17;
  const normalizedMinutes = Number.isFinite(minutes) ? Math.max(0, Math.min(59, minutes)) : 0;
  const meridiem: "AM" | "PM" = normalizedHours >= 12 ? "PM" : "AM";
  const base = normalizedHours % 12;

  return {
    hour12: base === 0 ? 12 : base,
    minute: normalizedMinutes,
    meridiem,
  };
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return "--";
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getCurrentWeekdayCode(date: Date): WeekdayCode {
  const match = WEEKDAY_OPTIONS.find((item) => item.jsDay === date.getDay());
  return match?.code ?? "MON";
}

function startOfWeekMonday(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const shift = day === 0 ? 6 : day - 1;
  result.setDate(result.getDate() - shift);
  result.setHours(0, 0, 0, 0);
  return result;
}

function computeNextCall(
  now: Date,
  callTimeLocalHhmm: string,
  repeatUnit: RepeatUnit,
  repeatInterval: number,
  repeatDays: WeekdayCode[],
): { nextAt: Date; dueToday: boolean } {
  const [hourText, minuteText] = callTimeLocalHhmm.split(":");
  const hours = Number(hourText);
  const minutes = Number(minuteText);

  if (repeatUnit === "MONTHLY") {
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    if (next.getTime() >= now.getTime()) {
      return { nextAt: next, dueToday: true };
    }
    next.setMonth(next.getMonth() + 1);
    return { nextAt: next, dueToday: false };
  }

  const sortedDays =
    repeatDays.length > 0 ? sortWeekdays(repeatDays) : [getCurrentWeekdayCode(now)];
  const interval = Math.max(1, repeatInterval);
  const anchorWeek = startOfWeekMonday(now);

  for (let offset = 0; offset <= 90; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(hours, minutes, 0, 0);

    if (candidate.getTime() < now.getTime()) {
      continue;
    }

    const candidateCode = getCurrentWeekdayCode(candidate);
    if (!sortedDays.includes(candidateCode)) {
      continue;
    }

    const candidateWeek = startOfWeekMonday(candidate);
    const weekDiff = Math.floor(
      (candidateWeek.getTime() - anchorWeek.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
    if (weekDiff % interval !== 0) {
      continue;
    }

    return { nextAt: candidate, dueToday: offset === 0 };
  }

  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 7);
  fallback.setHours(hours, minutes, 0, 0);
  return { nextAt: fallback, dueToday: false };
}

function combineDateWithHhmm(date: Date, hhmm: string): Date {
  const result = new Date(date);
  const [hoursText, minutesText] = hhmm.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  result.setHours(
    Number.isFinite(hours) ? Math.max(0, Math.min(23, hours)) : 0,
    Number.isFinite(minutes) ? Math.max(0, Math.min(59, minutes)) : 0,
    0,
    0,
  );
  return result;
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.floor(parsed));
}

function getGeolocationApi(): GeolocationApi | undefined {
  const navigatorValue = (
    globalThis as typeof globalThis & { navigator?: { geolocation?: GeolocationApi } }
  ).navigator;
  return navigatorValue?.geolocation;
}

function encodeBase64(value: string): string {
  const btoaFn = (globalThis as { btoa?: (data: string) => string }).btoa;
  if (typeof btoaFn === "function") {
    return btoaFn(value);
  }

  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";
  let index = 0;

  while (index < value.length) {
    const c1 = value.charCodeAt(index++);
    const c2 = value.charCodeAt(index++);
    const c3 = value.charCodeAt(index++);

    const e1 = c1 >> 2;
    const e2 = ((c1 & 3) << 4) | (c2 >> 4);
    const e3 = Number.isNaN(c2) ? 64 : ((c2 & 15) << 2) | (c3 >> 6);
    const e4 = Number.isNaN(c3) ? 64 : c3 & 63;

    output += `${chars.charAt(e1)}${chars.charAt(e2)}${chars.charAt(e3)}${chars.charAt(e4)}`;
  }

  return output;
}

function buildSignatureSvgBase64(
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number,
): string | null {
  if (points.length < 2) {
    return null;
  }

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  return encodeBase64(svg);
}

function attendanceStorageKey(userId: string): string {
  return `${ATTENDANCE_STORAGE_KEY_PREFIX}${userId}`;
}

function meetingPlanStorageKey(userId: string): string {
  return `${MEETING_PLAN_STORAGE_KEY_PREFIX}${userId}`;
}

function notificationStorageKey(userId: string): string {
  return `${NOTIFICATION_STORAGE_KEY_PREFIX}${userId}`;
}

function modeStorageKey(userId: string): string {
  return `${MODE_STORAGE_KEY_PREFIX}${userId}`;
}

function sponsorUiPrefsStorageKey(userId: string): string {
  return `${SPONSOR_UI_PREFS_STORAGE_KEY_PREFIX}${userId}`;
}

function sponsorCalendarEventStorageKey(userId: string): string {
  return `${SPONSOR_CALENDAR_EVENT_STORAGE_KEY_PREFIX}${userId}`;
}

function sponsorCalendarEventFingerprintStorageKey(userId: string): string {
  return `${SPONSOR_CALENDAR_EVENT_FINGERPRINT_STORAGE_KEY_PREFIX}${userId}`;
}

function sponsorAlertFingerprintStorageKey(userId: string): string {
  return `${SPONSOR_ALERT_FINGERPRINT_STORAGE_KEY_PREFIX}${userId}`;
}

function toCalendarDayOfWeek(code: WeekdayCode): Calendar.DayOfTheWeek {
  switch (code) {
    case "MON":
      return Calendar.DayOfTheWeek.Monday;
    case "TUE":
      return Calendar.DayOfTheWeek.Tuesday;
    case "WED":
      return Calendar.DayOfTheWeek.Wednesday;
    case "THU":
      return Calendar.DayOfTheWeek.Thursday;
    case "FRI":
      return Calendar.DayOfTheWeek.Friday;
    case "SAT":
      return Calendar.DayOfTheWeek.Saturday;
    case "SUN":
    default:
      return Calendar.DayOfTheWeek.Sunday;
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Unknown error";
}

function buildSponsorEventFingerprint(input: {
  sponsorName: string;
  sponsorPhoneE164: string | null;
  callTimeLocalHhmm: string;
  repeatUnit: RepeatUnit;
  repeatInterval: number;
  repeatDays: WeekdayCode[];
  active: boolean;
}): string {
  const sortedDays = sortWeekdays(input.repeatDays);
  return [
    input.sponsorName.trim().toLowerCase(),
    input.sponsorPhoneE164 ?? "",
    input.callTimeLocalHhmm,
    input.repeatUnit,
    String(input.repeatInterval),
    sortedDays.join(","),
    `active:${input.active ? "true" : "false"}`,
  ].join("|");
}

function buildSponsorAlertFingerprint(eventFingerprint: string, leadMinutes: number): string {
  return `${eventFingerprint}|lead:${leadMinutes}`;
}

function createId(prefix: string): string {
  const random = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  return `${prefix}-${random}`;
}

function emptyNotificationBuckets(): NotificationBuckets {
  return {
    sponsor: [],
    drive: [],
  };
}

export default function App() {
  const extra = (appJson.expo.extra ?? {}) as Record<string, unknown>;
  const apiUrl = typeof extra.apiUrl === "string" ? extra.apiUrl : "http://localhost:3001";
  const devAuthUserId =
    typeof extra.devAuthUserId === "string" ? extra.devAuthUserId : "enduser-a1";
  const devUserDisplayName =
    typeof extra.devUserDisplayName === "string" ? extra.devUserDisplayName : devAuthUserId;
  const meetingFeedUrl =
    typeof extra.meetingFeedUrl === "string" && extra.meetingFeedUrl.trim().length > 0
      ? extra.meetingFeedUrl
      : undefined;

  const authHeader = useMemo(() => `Bearer DEV_${devAuthUserId}`, [devAuthUserId]);
  const source = useMemo(
    () => createMeetingsSource({ feedUrl: meetingFeedUrl, apiUrl, authHeader }),
    [apiUrl, authHeader, meetingFeedUrl],
  );
  const travelTimeProvider = useMemo(() => createTravelTimeProvider(25), []);

  const dayOptions = useMemo(() => createDayOptions(), []);
  const attendanceStorage = useMemo(() => attendanceStorageKey(devAuthUserId), [devAuthUserId]);
  const meetingPlansStorage = useMemo(() => meetingPlanStorageKey(devAuthUserId), [devAuthUserId]);
  const notificationStorage = useMemo(() => notificationStorageKey(devAuthUserId), [devAuthUserId]);
  const modeStorage = useMemo(() => modeStorageKey(devAuthUserId), [devAuthUserId]);
  const sponsorUiPrefsStorage = useMemo(
    () => sponsorUiPrefsStorageKey(devAuthUserId),
    [devAuthUserId],
  );
  const sponsorCalendarEventStorage = useMemo(
    () => sponsorCalendarEventStorageKey(devAuthUserId),
    [devAuthUserId],
  );
  const sponsorCalendarEventFingerprintStorage = useMemo(
    () => sponsorCalendarEventFingerprintStorageKey(devAuthUserId),
    [devAuthUserId],
  );
  const sponsorAlertFingerprintStorage = useMemo(
    () => sponsorAlertFingerprintStorageKey(devAuthUserId),
    [devAuthUserId],
  );

  const [mode, setMode] = useState<RecoveryMode>("A");
  const [screen, setScreen] = useState<AppScreen>("LIST");

  const [locationPermission, setLocationPermission] = useState<LocationPermissionState>("unknown");
  const [currentLocation, setCurrentLocation] = useState<LocationStamp | null>(null);

  const [selectedDayOffset, setSelectedDayOffset] = useState(0);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [meetingsStatus, setMeetingsStatus] = useState("Meetings not loaded yet.");
  const [meetingsError, setMeetingsError] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingRecord | null>(null);

  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [activeAttendance, setActiveAttendance] = useState<AttendanceRecord | null>(null);
  const [attendanceStatus, setAttendanceStatus] = useState("No active attendance session.");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [sessionNowMs, setSessionNowMs] = useState(Date.now());

  const [signaturePoints, setSignaturePoints] = useState<Array<{ x: number; y: number }>>([]);
  const [signatureCanvasSize, setSignatureCanvasSize] = useState({ width: 320, height: 180 });

  const [sponsorName, setSponsorName] = useState("");
  const [sponsorPhoneDigits, setSponsorPhoneDigits] = useState("");
  const [sponsorHour12, setSponsorHour12] = useState(5);
  const [sponsorMinute, setSponsorMinute] = useState(0);
  const [sponsorMeridiem, setSponsorMeridiem] = useState<"AM" | "PM">("PM");
  const [sponsorRepeatPreset, setSponsorRepeatPreset] = useState<RepeatPreset>("WEEKLY");
  const [sponsorRepeatDays, setSponsorRepeatDays] = useState<WeekdayCode[]>([
    getCurrentWeekdayCode(new Date()),
  ]);
  const [sponsorEnabled, setSponsorEnabled] = useState(true);
  const [sponsorActive, setSponsorActive] = useState(true);
  const [sponsorLeadMinutes, setSponsorLeadMinutes] = useState<SponsorLeadMinutes>(5);
  const [sponsorSaving, setSponsorSaving] = useState(false);
  const [sponsorStatus, setSponsorStatus] = useState<string | null>(null);
  const [calendarStatus, setCalendarStatus] = useState("Sponsor calendar not synced yet.");

  const [notificationStatus, setNotificationStatus] = useState("Notifications not scheduled yet.");
  const [notificationOpenPhone, setNotificationOpenPhone] = useState<string | null>(null);

  const [meetingPlansByDate, setMeetingPlansByDate] = useState<MeetingPlansState>({});
  const [debugTimeCompressionEnabled, setDebugTimeCompressionEnabled] = useState(__DEV__);
  const [bootstrapped, setBootstrapped] = useState(false);

  const arrivalPromptedMeetingRef = useRef<string | null>(null);
  const meetingsByIdRef = useRef<Record<string, MeetingRecord>>({});
  const meetingsShapeLoggedRef = useRef(false);
  const locationIssueRef = useRef<LocationIssue>(null);

  const selectedDay = dayOptions[selectedDayOffset] ?? dayOptions[0];

  const normalizedSponsorName = useMemo(() => sponsorName.trim(), [sponsorName]);
  const sponsorPhoneE164 = useMemo(
    () => toE164FromUsTenDigit(sponsorPhoneDigits),
    [sponsorPhoneDigits],
  );
  const sponsorCallTimeLocalHhmm = useMemo(
    () => to24HourText(sponsorHour12, sponsorMinute, sponsorMeridiem),
    [sponsorHour12, sponsorMinute, sponsorMeridiem],
  );
  const sponsorRepeatUnit = useMemo<RepeatUnit>(
    () => (sponsorRepeatPreset === "MONTHLY" ? "MONTHLY" : "WEEKLY"),
    [sponsorRepeatPreset],
  );
  const sponsorRepeatInterval = useMemo(
    () => (sponsorRepeatPreset === "BIWEEKLY" ? 2 : 1),
    [sponsorRepeatPreset],
  );
  const sponsorRepeatDaysSorted = useMemo(
    () => (sponsorRepeatUnit === "MONTHLY" ? [] : sortWeekdays(sponsorRepeatDays)),
    [sponsorRepeatUnit, sponsorRepeatDays],
  );
  const sponsorPayloadActive = useMemo(
    () => sponsorEnabled && sponsorActive,
    [sponsorEnabled, sponsorActive],
  );
  const sponsorEventFingerprint = useMemo(
    () =>
      buildSponsorEventFingerprint({
        sponsorName: normalizedSponsorName,
        sponsorPhoneE164,
        callTimeLocalHhmm: sponsorCallTimeLocalHhmm,
        repeatUnit: sponsorRepeatUnit,
        repeatInterval: sponsorRepeatInterval,
        repeatDays: sponsorRepeatDaysSorted,
        active: sponsorPayloadActive,
      }),
    [
      normalizedSponsorName,
      sponsorPhoneE164,
      sponsorCallTimeLocalHhmm,
      sponsorRepeatUnit,
      sponsorRepeatInterval,
      sponsorRepeatDaysSorted,
      sponsorPayloadActive,
    ],
  );
  const sponsorAlertFingerprint = useMemo(
    () => buildSponsorAlertFingerprint(sponsorEventFingerprint, sponsorLeadMinutes),
    [sponsorEventFingerprint, sponsorLeadMinutes],
  );
  const isLocalhostApiUrl = useMemo(() => {
    try {
      const parsed = new URL(apiUrl);
      return ["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname);
    } catch {
      return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(apiUrl);
    }
  }, [apiUrl]);

  const selectedDayPlan = useMemo(
    () => meetingPlansByDate[selectedDay.dateKey] ?? EMPTY_DAY_PLAN,
    [meetingPlansByDate, selectedDay.dateKey],
  );

  const meetingsForDay = useMemo<MeetingListItem[]>(() => {
    const list = meetings
      .filter((meeting) => meeting.dayOfWeek === selectedDay.dayOfWeek)
      .map((meeting) => {
        const distanceMeters =
          currentLocation && meeting.lat !== null && meeting.lng !== null
            ? distanceMetersBetween(
                currentLocation.lat,
                currentLocation.lng,
                meeting.lat,
                meeting.lng,
              )
            : null;

        return {
          ...meeting,
          distanceMeters,
        };
      });

    list.sort((left, right) => {
      const byTime =
        parseMinutesFromHhmm(left.startsAtLocal) - parseMinutesFromHhmm(right.startsAtLocal);
      if (byTime !== 0) {
        return byTime;
      }

      const leftDistance = left.distanceMeters ?? Number.POSITIVE_INFINITY;
      const rightDistance = right.distanceMeters ?? Number.POSITIVE_INFINITY;
      return leftDistance - rightDistance;
    });

    return list;
  }, [meetings, selectedDay.dayOfWeek, currentLocation]);

  const sponsorScheduleSummary = useMemo(() => {
if (!sponsorEnabled) {
  return "Sponsor disabled.";
}

if (!sponsorActive) {
  return "Sponsor reminders disabled.";
}

    const next = computeNextCall(
      new Date(),
      sponsorCallTimeLocalHhmm,
      sponsorRepeatUnit,
      sponsorRepeatInterval,
      sponsorRepeatDaysSorted,
    );

    const repeatSummary =
      sponsorRepeatUnit === "MONTHLY"
        ? "Monthly"
        : `${sponsorRepeatInterval === 2 ? "Bi-weekly" : "Weekly"} on ${describeWeekdays(sponsorRepeatDaysSorted)}`;

    return `Next scheduled call: ${next.nextAt.toLocaleString()} • Due today: ${
      next.dueToday ? "Yes" : "No"
    } • ${repeatSummary}`;
  }, [sponsorCallTimeLocalHhmm, sponsorRepeatUnit, sponsorRepeatInterval, sponsorRepeatDaysSorted]);

  const sponsorStatusLine = useMemo(() => {
    if (!sponsorEnabled) {
      return "Sponsor is disabled.";
    }
    if (!sponsorActive) {
      return "Sponsor reminders are disabled.";
    }
    if (!normalizedSponsorName || !sponsorPhoneE164) {
      return "Enter sponsor name and phone to enable reminders.";
    }
    if (sponsorStatus) {
      return sponsorStatus;
    }
    return sponsorScheduleSummary;
  }, [
    sponsorEnabled,
    sponsorActive,
const sponsorStatusLine = useMemo(() => {
  if (!sponsorEnabled) {
    return "Sponsor is disabled.";
  }
  if (!sponsorActive) {
    return "Sponsor reminders are disabled.";
  }
  if (!normalizedSponsorName || !sponsorPhoneE164) {
    return "Enter sponsor name and phone to enable reminders.";
  }
  if (sponsorStatus) {
    return sponsorStatus;
  }
  return sponsorScheduleSummary;
}, [
  sponsorEnabled,
  sponsorActive,
  normalizedSponsorName,
  sponsorPhoneE164,
  sponsorStatus,
  sponsorScheduleSummary,
]);
    normalizedSponsorName,
    sponsorPhoneE164,
    sponsorStatus,
    sponsorScheduleSummary,
  ]);

  const openSessionDurationSeconds = useMemo(() => {
    if (!activeAttendance || activeAttendance.endAt) {
      return activeAttendance?.durationSeconds ?? null;
    }
    return Math.max(
      0,
      Math.floor((sessionNowMs - new Date(activeAttendance.startAt).getTime()) / 1000),
    );
  }, [activeAttendance, sessionNowMs]);

  const readCurrentLocation = useCallback(async (): Promise<LocationStamp | null> => {
    const geolocation = getGeolocationApi();
    if (!geolocation) {
      setLocationPermission("unavailable");
      locationIssueRef.current = "unavailable";
      return null;
    }

    return new Promise((resolve) => {
      geolocation.getCurrentPosition(
        (position) => {
          const next = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyM: position.coords.accuracy ?? null,
          };
          setLocationPermission("granted");
          locationIssueRef.current = null;
          setCurrentLocation(next);
          resolve(next);
        },
        (error) => {
          const code =
            typeof error === "object" && error && "code" in error
              ? Number((error as { code?: number }).code)
              : 0;

          if (code === 1) {
            setLocationPermission("denied");
            locationIssueRef.current = "permission_denied";
          } else if (code === 2 || code === 3) {
            setLocationPermission("granted");
            locationIssueRef.current = "position_unavailable";
          } else {
            setLocationPermission("unavailable");
            locationIssueRef.current = "unavailable";
          }
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
      );
    });
  }, []);

  const formatApiErrorWithHint = useCallback(
    (baseMessage: string): string => {
      if (!isLocalhostApiUrl) {
        return baseMessage;
      }
      return `${baseMessage} ${LOCALHOST_API_HINT}`;
    },
    [isLocalhostApiUrl],
  );

  const ensureNotificationPermission = useCallback(async (): Promise<boolean> => {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted || existing.status === Notifications.PermissionStatus.GRANTED) {
      return true;
    }

    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted || requested.status === Notifications.PermissionStatus.GRANTED;
  }, []);

  const ensureCalendarPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== "ios") {
      return false;
    }
    const existing = await Calendar.getCalendarPermissionsAsync();
    if (existing.granted) {
      return true;
    }
    const requested = await Calendar.requestCalendarPermissionsAsync();
    return requested.granted;
  }, []);

  const findWritableCalendarId = useCallback(async (): Promise<string | null> => {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const writable = calendars.find((item) => item.allowsModifications);
    return writable?.id ?? null;
  }, []);

  const applyScheduleTime = useCallback(
    (target: Date): Date => {
      const now = Date.now();
      const diffMs = target.getTime() - now;
      if (debugTimeCompressionEnabled) {
        const compressedDelay = Math.max(5000, Math.floor(Math.max(diffMs, 0) / 12));
        return new Date(now + compressedDelay);
      }
      if (diffMs <= 2000) {
        return new Date(now + 5000);
      }
      return target;
    },
    [debugTimeCompressionEnabled],
  );

  const loadNotificationBuckets = useCallback(async (): Promise<NotificationBuckets> => {
    try {
      const raw = await AsyncStorage.getItem(notificationStorage);
      if (!raw) {
        return emptyNotificationBuckets();
      }
      const parsed = JSON.parse(raw) as NotificationBuckets;
      return {
        sponsor: Array.isArray(parsed.sponsor) ? parsed.sponsor : [],
        drive: Array.isArray(parsed.drive) ? parsed.drive : [],
      };
    } catch {
      return emptyNotificationBuckets();
    }
  }, [notificationStorage]);

  const saveNotificationBuckets = useCallback(
    async (buckets: NotificationBuckets) => {
      await AsyncStorage.setItem(notificationStorage, JSON.stringify(buckets));
    },
    [notificationStorage],
  );

  const cancelNotificationBucket = useCallback(
    async (bucket: keyof NotificationBuckets) => {
      const buckets = await loadNotificationBuckets();
      const ids = buckets[bucket];
      await Promise.all(
        ids.map(async (id) => {
          try {
            await Notifications.cancelScheduledNotificationAsync(id);
          } catch {
            // ignore stale ids
          }
        }),
      );
      buckets[bucket] = [];
      await saveNotificationBuckets(buckets);
      return buckets;
    },
    [loadNotificationBuckets, saveNotificationBuckets],
  );

  const scheduleAt = useCallback(
    async (date: Date, content: Notifications.NotificationContentInput): Promise<string> => {
      const trigger: Notifications.DateTriggerInput = {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
      };

      return Notifications.scheduleNotificationAsync({
        content,
        trigger,
      });
    },
    [],
  );

  const requestLocationPermission = useCallback(async (): Promise<LocationStamp | null> => {
    const position = await readCurrentLocation();
    if (position) {
      setMeetingsStatus("Location enabled for distance and arrival detection.");
      return position;
    }
    if (locationIssueRef.current === "position_unavailable") {
      setMeetingsStatus("Location enabled, but no simulated location is set.");
      return null;
    }
    if (locationIssueRef.current === "permission_denied") {
      setMeetingsStatus("Location permission denied. Distance and arrival detection are disabled.");
      return null;
    }
    setMeetingsStatus("Location is unavailable on this device.");
    return null;
  }, [readCurrentLocation]);

  const persistAttendanceRecords = useCallback(
    async (nextRecords: AttendanceRecord[]) => {
      try {
        await AsyncStorage.setItem(attendanceStorage, JSON.stringify(nextRecords));
      } catch {
        setAttendanceStatus("Failed to persist attendance records locally.");
      }
    },
    [attendanceStorage],
  );

  const persistMeetingPlans = useCallback(
    async (nextPlans: MeetingPlansState) => {
      try {
        await AsyncStorage.setItem(meetingPlansStorage, JSON.stringify(nextPlans));
      } catch {
        setMeetingsStatus("Failed to persist meeting planning settings locally.");
      }
    },
    [meetingPlansStorage],
  );

  const upsertAttendanceRecord = useCallback(
    (record: AttendanceRecord) => {
      setAttendanceRecords((previous) => {
        const next = [record, ...previous.filter((item) => item.id !== record.id)].sort(
          (left, right) => new Date(right.startAt).getTime() - new Date(left.startAt).getTime(),
        );
        void persistAttendanceRecords(next);
        return next;
      });
    },
    [persistAttendanceRecords],
  );

  const refreshMeetings = useCallback(
    async (options?: { location?: LocationStamp | null }) => {
      setLoadingMeetings(true);
      setMeetingsError(null);

      try {
        let location: LocationStamp | null = options?.location ?? null;
        if (options?.location === undefined && locationPermission === "granted") {
          location = await readCurrentLocation();
        }
        const result = await source.listMeetings({
          dayOfWeek: selectedDay.dayOfWeek,
          lat: location?.lat,
          lng: location?.lng,
        });
        setMeetings(result.meetings);

        if (!meetingsShapeLoggedRef.current && result.meetings.length > 0) {
          meetingsShapeLoggedRef.current = true;
          console.log("[meetings] normalized sample", result.meetings[0]);
        }

        const warningSuffix = result.warning ? ` (${result.warning})` : "";
        setMeetingsStatus(
          `Loaded ${result.meetings.length} meetings from ${result.source}${warningSuffix}.`,
        );
      } catch (error) {
        setMeetingsError(formatApiErrorWithHint(formatError(error)));
        setMeetingsStatus("Unable to load meetings.");
      } finally {
        setLoadingMeetings(false);
      }
    },
    [
      locationPermission,
      readCurrentLocation,
      selectedDay.dayOfWeek,
      source,
      formatApiErrorWithHint,
    ],
  );

  const fetchSponsorConfig = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/v1/me/sponsor`, {
        headers: {
          Authorization: authHeader,
        },
      });
      if (!response.ok) {
        setSponsorStatus(formatApiErrorWithHint(`Sponsor config load failed: ${response.status}`));
        return;
      }

      const payload = (await response.json()) as { sponsorConfig?: SponsorConfigResponse | null };
      if (!payload.sponsorConfig) {
        setSponsorStatus(null);
        return;
      }

      const config = payload.sponsorConfig;
      setSponsorName(config.sponsorName);
      setSponsorPhoneDigits(normalizePhoneDigits(config.sponsorPhoneE164));
      const parsedTime = from24HourText(config.callTimeLocalHhmm);
      setSponsorHour12(parsedTime.hour12);
      setSponsorMinute(parsedTime.minute);
      setSponsorMeridiem(parsedTime.meridiem);

      const preset: RepeatPreset =
        config.repeatUnit === "MONTHLY"
          ? "MONTHLY"
          : config.repeatInterval >= 2
            ? "BIWEEKLY"
            : "WEEKLY";
      setSponsorRepeatPreset(preset);

      const nextDays =
        config.repeatUnit === "MONTHLY"
          ? []
          : sortWeekdays(
              (config.repeatDays ?? []).filter((day): day is WeekdayCode =>
                WEEKDAY_CODES.includes(day as WeekdayCode),
              ),
            );
      setSponsorRepeatDays(nextDays.length > 0 ? nextDays : [getCurrentWeekdayCode(new Date())]);
      setSponsorActive(Boolean(config.active));
      setSponsorStatus(null);
    } catch {
      setSponsorStatus(formatApiErrorWithHint("Sponsor config load failed: network."));
    }
  }, [apiUrl, authHeader, formatApiErrorWithHint]);

  const openPhoneCall = useCallback(async (phoneE164: string | null) => {
    if (!phoneE164) {
      setSponsorStatus("Enter sponsor name and phone to enable reminders.");
      return;
    }
    const digits = normalizePhoneDigits(phoneE164);
    if (!digits) {
      setSponsorStatus("Enter sponsor name and phone to enable reminders.");
      return;
    }
    const telUrl = `tel:${digits}`;
    try {
      const canOpen = await Linking.canOpenURL(telUrl);
      if (!canOpen) {
        setSponsorStatus("Calling is not supported on this device (simulator).");
        return;
      }

      await Linking.openURL(telUrl);
      setSponsorStatus(null);
    } catch {
      setSponsorStatus("Calling is not supported on this device (simulator).");
    }
  }, []);

  const openMeetingDestination = useCallback(async (meeting: MeetingRecord) => {
    if (
      meeting.format === "ONLINE" ||
      (meeting.onlineUrl && meeting.lat === null && meeting.lng === null)
    ) {
      if (!meeting.onlineUrl) {
        setAttendanceStatus("No online URL configured for this meeting.");
        return;
      }
      await Linking.openURL(meeting.onlineUrl);
      return;
    }

    const destination =
      meeting.lat !== null && meeting.lng !== null
        ? `${meeting.lat},${meeting.lng}`
        : encodeURIComponent(meeting.address);

    const url =
      Platform.OS === "ios"
        ? `http://maps.apple.com/?daddr=${destination}`
        : `https://www.google.com/maps/search/?api=1&query=${destination}`;

    await Linking.openURL(url);
  }, []);

  const buildDriveSchedulePreview = useCallback(
    (
      meeting: MeetingListItem,
      dayPlan: DayPlanState,
      options?: { arrivalBufferMinutes?: number; usesServiceCommitment?: boolean },
    ): DriveSchedulePreview | null => {
      const meetingPlan = dayPlan.plans[meeting.id];
      if (!meetingPlan?.going) {
        return null;
      }

      const meetingStartAt = combineDateWithHhmm(selectedDay.date, meeting.startsAtLocal);
      const distance =
        currentLocation && meeting.lat !== null && meeting.lng !== null
          ? distanceMetersBetween(
              currentLocation.lat,
              currentLocation.lng,
              meeting.lat,
              meeting.lng,
            )
          : null;
      const travelMinutes = travelTimeProvider.estimateMinutes(distance);

      const computedUsesServiceCommitment =
        dayPlan.homeGroupMeetingId === meeting.id && meetingPlan.serviceCommitmentMinutes !== null;
      const usesServiceCommitment = options?.usesServiceCommitment ?? computedUsesServiceCommitment;
      const arrivalBufferMinutes =
        options?.arrivalBufferMinutes ??
        (usesServiceCommitment
          ? (meetingPlan.serviceCommitmentMinutes ?? DEFAULT_SERVICE_COMMITMENT_MINUTES)
          : meetingPlan.earlyMinutes);

      const departAt = new Date(
        meetingStartAt.getTime() - (arrivalBufferMinutes + travelMinutes) * 60_000,
      );
      const notifyAt = new Date(departAt.getTime() - 10 * 60_000);

      return {
        meetingStartAt,
        arrivalBufferMinutes,
        travelMinutes,
        departAt,
        notifyAt,
        usesServiceCommitment,
      };
    },
    [selectedDay.date, currentLocation, travelTimeProvider],
  );

  const syncSponsorCalendarEvent = useCallback(
    async (reason: string) => {
      if (Platform.OS !== "ios") {
        setCalendarStatus("Calendar sync is iOS-only in this MVP.");
        return;
      }

      if (!normalizedSponsorName || sponsorPhoneE164 === null) {
        setCalendarStatus("Calendar sync skipped: sponsor name/phone incomplete.");
        return;
      }

      const hasPermission = await ensureCalendarPermission();
      if (!hasPermission) {
        setCalendarStatus("Calendar permission denied.");
        return;
      }

      const calendarId = await findWritableCalendarId();
      if (!calendarId) {
        setCalendarStatus("No writable calendar found.");
        return;
      }

      const nextStart = computeNextCall(
        new Date(),
        sponsorCallTimeLocalHhmm,
        sponsorRepeatUnit,
        sponsorRepeatInterval,
        sponsorRepeatDaysSorted,
      ).nextAt;
      const endDate = new Date(nextStart.getTime() + 15 * 60_000);

      const recurrenceSummary =
        sponsorRepeatUnit === "MONTHLY"
          ? "Monthly"
          : `${sponsorRepeatInterval === 2 ? "Bi-weekly" : "Weekly"} on ${describeWeekdays(sponsorRepeatDaysSorted)}`;

      const recurrenceRule: Calendar.RecurrenceRule =
        sponsorRepeatUnit === "MONTHLY"
          ? {
              frequency: Calendar.Frequency.MONTHLY,
              interval: 1,
            }
          : {
              frequency: Calendar.Frequency.WEEKLY,
              interval: sponsorRepeatInterval,
              daysOfTheWeek: sponsorRepeatDaysSorted.map((day) => ({
                dayOfTheWeek: toCalendarDayOfWeek(day),
              })),
            };

      const notes = [
        `Sponsor: ${normalizedSponsorName}`,
        `Phone: ${sponsorPhoneE164}`,
        `Schedule: ${sponsorCallTimeLocalHhmm} ${recurrenceSummary}`,
      ].join("\n");

      const eventDetails: Omit<Partial<Calendar.Event>, "id"> = {
        title: "Call Sponsor",
        notes,
        startDate: nextStart,
        endDate,
        alarms: [{ relativeOffset: 0 }],
        recurrenceRule,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      const storedEventId = await AsyncStorage.getItem(sponsorCalendarEventStorage);
      let nextEventId: string;

      if (storedEventId) {
        try {
          await Calendar.getEventAsync(storedEventId);
          nextEventId = await Calendar.updateEventAsync(storedEventId, {
            ...eventDetails,
            calendarId,
          });
        } catch {
          nextEventId = await Calendar.createEventAsync(calendarId, eventDetails);
        }
      } else {
        nextEventId = await Calendar.createEventAsync(calendarId, eventDetails);
      }

      await AsyncStorage.setItem(sponsorCalendarEventStorage, nextEventId);
      console.log("[calendar] sponsor sync", {
        reason,
        eventId: nextEventId,
        startAt: nextStart.toISOString(),
        recurrenceSummary,
      });
      setCalendarStatus(`Calendar synced (${nextStart.toLocaleString()}).`);
    },
    [
      normalizedSponsorName,
      sponsorPhoneE164,
      ensureCalendarPermission,
      findWritableCalendarId,
      sponsorCallTimeLocalHhmm,
      sponsorRepeatUnit,
      sponsorRepeatInterval,
      sponsorRepeatDaysSorted,
      sponsorCalendarEventStorage,
    ],
  );

  const rescheduleSponsorNotifications = useCallback(
    async (reason: string) => {
      await cancelNotificationBucket("sponsor");

      if (!sponsorEnabled) {
        await AsyncStorage.setItem(sponsorAlertFingerprintStorage, sponsorAlertFingerprint);
        setNotificationStatus("Sponsor disabled.");
        return;
      }

      if (!sponsorActive) {
        await AsyncStorage.setItem(sponsorAlertFingerprintStorage, sponsorAlertFingerprint);
        setNotificationStatus("Sponsor reminders disabled.");
        return;
      }

      if (!normalizedSponsorName || sponsorPhoneE164 === null) {
        await AsyncStorage.setItem(sponsorAlertFingerprintStorage, sponsorAlertFingerprint);
        setNotificationStatus("Sponsor notifications skipped: name/phone incomplete.");
        return;
      }

      if (sponsorRepeatUnit === "WEEKLY" && sponsorRepeatDaysSorted.length === 0) {
        await AsyncStorage.setItem(sponsorAlertFingerprintStorage, sponsorAlertFingerprint);
        setNotificationStatus("Sponsor notifications skipped: choose at least one day.");
        return;
      }

      const hasPermission = await ensureNotificationPermission();
      if (!hasPermission) {
        setNotificationStatus("Notification permission denied.");
        return;
      }

      const now = new Date();
      const nextCall = computeNextCall(
        now,
        sponsorCallTimeLocalHhmm,
        sponsorRepeatUnit,
        sponsorRepeatInterval,
        sponsorRepeatDaysSorted,
      ).nextAt;

      const nextBuckets = await loadNotificationBuckets();
      const scheduledIds: string[] = [];
      const sponsorPhoneDisplay = formatUsPhoneDisplay(sponsorPhoneE164);

      if (sponsorLeadMinutes > 0) {
        const leadTimeTarget = new Date(nextCall.getTime() - sponsorLeadMinutes * 60_000);
        const leadFireAt = applyScheduleTime(leadTimeTarget);
        const leadId = await scheduleAt(leadFireAt, {
          title: "Sponsor Call upcoming",
          body: `Call now? ${sponsorPhoneDisplay}`,
          categoryIdentifier: SPONSOR_NOTIFICATION_CATEGORY_ID,
          data: {
            type: "sponsor",
            phoneE164: sponsorPhoneE164,
            reason: "lead",
          },
        });
        scheduledIds.push(leadId);
      }

      const callFireAt = applyScheduleTime(nextCall);
      const atTimeId = await scheduleAt(callFireAt, {
        title: `Call ${normalizedSponsorName} now`,
        body: sponsorPhoneDisplay,
        categoryIdentifier: SPONSOR_NOTIFICATION_CATEGORY_ID,
        data: {
          type: "sponsor",
          phoneE164: sponsorPhoneE164,
          reason: "at-time",
        },
      });
      scheduledIds.push(atTimeId);

      nextBuckets.sponsor = scheduledIds;
      await saveNotificationBuckets(nextBuckets);
      await AsyncStorage.setItem(sponsorAlertFingerprintStorage, sponsorAlertFingerprint);

      console.log("[notifications] sponsor schedule", {
        reason,
        nextCall: nextCall.toISOString(),
        leadMinutes: sponsorLeadMinutes,
        ids: scheduledIds,
      });

      setNotificationStatus(
        `Scheduled sponsor notifications (${scheduledIds.length}) for ${nextCall.toLocaleString()}.`,
      );
    },
    [
      cancelNotificationBucket,
      sponsorEnabled,
      sponsorActive,
      normalizedSponsorName,
      sponsorPhoneE164,
      sponsorRepeatUnit,
      sponsorRepeatInterval,
      sponsorRepeatDaysSorted,
      ensureNotificationPermission,
      sponsorCallTimeLocalHhmm,
      sponsorLeadMinutes,
      sponsorAlertFingerprint,
      sponsorAlertFingerprintStorage,
      loadNotificationBuckets,
      applyScheduleTime,
      scheduleAt,
      saveNotificationBuckets,
    ],
  );

  const rescheduleDriveNotifications = useCallback(
    async (reason: string) => {
      await cancelNotificationBucket("drive");

      const plannedMeetings = meetingsForDay.filter(
        (meeting) => selectedDayPlan.plans[meeting.id]?.going,
      );
      if (plannedMeetings.length === 0) {
        setMeetingsStatus(
          (previous) => `${previous.split(" | ")[0]} | No planned meetings to notify.`,
        );
        return;
      }

      const hasPermission = await ensureNotificationPermission();
      if (!hasPermission) {
        setMeetingsStatus("Notification permission denied for drive alerts.");
        return;
      }

      const nextBuckets = await loadNotificationBuckets();
      const scheduledIds: string[] = [];

      for (const meeting of plannedMeetings) {
        const meetingPlan = selectedDayPlan.plans[meeting.id];
        if (!meetingPlan?.going) {
          continue;
        }

        const standardPreview = buildDriveSchedulePreview(meeting, selectedDayPlan, {
          arrivalBufferMinutes: meetingPlan.earlyMinutes,
          usesServiceCommitment: false,
        });
        if (!standardPreview) {
          continue;
        }

        const fireAt = applyScheduleTime(standardPreview.notifyAt);
        const id = await scheduleAt(fireAt, {
          title: `Leave in 10 minutes for ${meeting.name}`,
          body: `${standardPreview.travelMinutes}m travel • depart ${standardPreview.departAt.toLocaleTimeString()}`,
          categoryIdentifier: DRIVE_NOTIFICATION_CATEGORY_ID,
          data: {
            type: "drive",
            meetingId: meeting.id,
            reason: "planned",
          },
        });
        scheduledIds.push(id);

        console.log("[notifications] drive schedule", {
          reason,
          meetingId: meeting.id,
          meetingName: meeting.name,
          meetingStartAt: standardPreview.meetingStartAt.toISOString(),
          travelMinutes: standardPreview.travelMinutes,
          arrivalBufferMinutes: standardPreview.arrivalBufferMinutes,
          departAt: standardPreview.departAt.toISOString(),
          notifyAt: standardPreview.notifyAt.toISOString(),
          scheduledAt: fireAt.toISOString(),
          notificationId: id,
        });

        const isHomeGroup = selectedDayPlan.homeGroupMeetingId === meeting.id;
        if (isHomeGroup && meetingPlan.serviceCommitmentMinutes !== null) {
          const servicePreview = buildDriveSchedulePreview(meeting, selectedDayPlan, {
            arrivalBufferMinutes: meetingPlan.serviceCommitmentMinutes,
            usesServiceCommitment: true,
          });
          if (servicePreview) {
            const serviceFireAt = applyScheduleTime(servicePreview.notifyAt);
            const serviceId = await scheduleAt(serviceFireAt, {
              title: `Service commitment: leave in 10 minutes for ${meeting.name}`,
              body: `${servicePreview.travelMinutes}m travel • depart ${servicePreview.departAt.toLocaleTimeString()}`,
              categoryIdentifier: DRIVE_NOTIFICATION_CATEGORY_ID,
              data: {
                type: "drive",
                meetingId: meeting.id,
                reason: "service",
              },
            });
            scheduledIds.push(serviceId);
            console.log("[notifications] service schedule", {
              reason,
              meetingId: meeting.id,
              meetingName: meeting.name,
              meetingStartAt: servicePreview.meetingStartAt.toISOString(),
              travelMinutes: servicePreview.travelMinutes,
              arrivalBufferMinutes: servicePreview.arrivalBufferMinutes,
              departAt: servicePreview.departAt.toISOString(),
              notifyAt: servicePreview.notifyAt.toISOString(),
              scheduledAt: serviceFireAt.toISOString(),
              notificationId: serviceId,
            });
          }
        }
      }

      nextBuckets.drive = scheduledIds;
      await saveNotificationBuckets(nextBuckets);

      if (scheduledIds.length > 0) {
        setMeetingsStatus(
          `Scheduled ${scheduledIds.length} drive reminder(s) for planned meetings on ${selectedDay.label}.`,
        );
      }
    },
    [
      cancelNotificationBucket,
      meetingsForDay,
      selectedDayPlan,
      ensureNotificationPermission,
      loadNotificationBuckets,
      buildDriveSchedulePreview,
      applyScheduleTime,
      scheduleAt,
      saveNotificationBuckets,
      selectedDay.label,
    ],
  );

  const saveSponsorConfig = useCallback(async () => {
    if (!sponsorEnabled) {
      setSponsorStatus("Sponsor is disabled.");
      return;
    }

    if (!normalizedSponsorName) {
      setSponsorStatus("Sponsor name is required.");
      return;
    }

    if (!sponsorPhoneE164) {
      setSponsorStatus("Sponsor phone must be a valid 10-digit US number.");
      return;
    }

    if (sponsorRepeatUnit === "WEEKLY" && sponsorRepeatDaysSorted.length === 0) {
      setSponsorStatus("Select at least one weekday for weekly reminders.");
      return;
    }

    const payload: SponsorConfigPayload = {
      sponsorName: normalizedSponsorName,
      sponsorPhoneE164,
      callTimeLocalHhmm: sponsorCallTimeLocalHhmm,
      repeatUnit: sponsorRepeatUnit,
      repeatInterval: sponsorRepeatInterval,
      repeatDays: sponsorRepeatDaysSorted,
      active: sponsorPayloadActive,
callTimeLocalHhmm: sponsorCallTimeLocalHhmm,
repeatUnit: sponsorRepeatUnit,
repeatInterval: sponsorRepeatInterval,
repeatDays: sponsorRepeatDaysSorted,
active: sponsorPayloadActive,
    };

    setSponsorSaving(true);
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
        setSponsorStatus(formatApiErrorWithHint(`Sponsor config save failed: ${response.status}`));
        return;
      }

      setSponsorStatus(null);

      const [storedEventFingerprint, storedAlertFingerprint] = await Promise.all([
        AsyncStorage.getItem(sponsorCalendarEventFingerprintStorage),
        AsyncStorage.getItem(sponsorAlertFingerprintStorage),
      ]);

      if (storedEventFingerprint !== sponsorEventFingerprint) {
        await syncSponsorCalendarEvent("save:event-changed");
        await AsyncStorage.setItem(sponsorCalendarEventFingerprintStorage, sponsorEventFingerprint);
      } else {
        const storedEventId = await AsyncStorage.getItem(sponsorCalendarEventStorage);
        let eventExists = Boolean(storedEventId);
        if (eventExists && Platform.OS === "ios" && storedEventId) {
          try {
            await Calendar.getEventAsync(storedEventId);
          } catch {
            eventExists = false;
          }
        }

        if (eventExists) {
          setCalendarStatus("Calendar event unchanged.");
        } else {
          await syncSponsorCalendarEvent("save:event-recreate");
          await AsyncStorage.setItem(
            sponsorCalendarEventFingerprintStorage,
            sponsorEventFingerprint,
          );
        }
      }

      if (storedAlertFingerprint !== sponsorAlertFingerprint) {
        await rescheduleSponsorNotifications("save:alert-changed");
      } else {
        setNotificationStatus("Sponsor notifications unchanged.");
      }
    } catch {
      setSponsorStatus(formatApiErrorWithHint("Sponsor config save failed: network."));
    } finally {
      setSponsorSaving(false);
    }
  }, [
    sponsorEnabled,
    normalizedSponsorName,
    sponsorPhoneE164,
    sponsorRepeatUnit,
    sponsorRepeatInterval,
    sponsorRepeatDaysSorted,
    sponsorCallTimeLocalHhmm,
    sponsorPayloadActive,
    apiUrl,
    authHeader,
    formatApiErrorWithHint,
    sponsorCalendarEventStorage,
    sponsorCalendarEventFingerprintStorage,
    sponsorAlertFingerprintStorage,
    sponsorEventFingerprint,
    sponsorAlertFingerprint,
    syncSponsorCalendarEvent,
    rescheduleSponsorNotifications,
  ]);

  const startAttendance = useCallback(
    async (meeting: MeetingRecord) => {
      const location = await readCurrentLocation();
      const nowIso = new Date().toISOString();
      const next: AttendanceRecord = {
        id: createId("attendance"),
        meetingId: meeting.id,
        meetingName: meeting.name,
        meetingAddress: meeting.address,
        startAt: nowIso,
        endAt: null,
        durationSeconds: null,
        startLat: location?.lat ?? null,
        startLng: location?.lng ?? null,
        startAccuracyM: location?.accuracyM ?? null,
        endLat: null,
        endLng: null,
        endAccuracyM: null,
        signaturePngBase64: null,
        pdfUri: null,
      };

      setActiveAttendance(next);
      upsertAttendanceRecord(next);
      setAttendanceStatus(`Attendance started at ${new Date(nowIso).toLocaleTimeString()}.`);
      setScreen("SESSION");
    },
    [readCurrentLocation, upsertAttendanceRecord],
  );

  const endAttendance = useCallback(async () => {
    if (!activeAttendance || activeAttendance.endAt) {
      return;
    }

    const location = await readCurrentLocation();
    const nowIso = new Date().toISOString();
    const durationSeconds = Math.max(
      0,
      Math.floor(
        (new Date(nowIso).getTime() - new Date(activeAttendance.startAt).getTime()) / 1000,
      ),
    );

    const next: AttendanceRecord = {
      ...activeAttendance,
      endAt: nowIso,
      durationSeconds,
      endLat: location?.lat ?? null,
      endLng: location?.lng ?? null,
      endAccuracyM: location?.accuracyM ?? null,
    };

    setActiveAttendance(next);
    upsertAttendanceRecord(next);
    setAttendanceStatus("Attendance ended. Add signature, then export PDF.");
  }, [activeAttendance, readCurrentLocation, upsertAttendanceRecord]);

  const saveSignature = useCallback(() => {
    if (!activeAttendance || !activeAttendance.endAt) {
      setAttendanceStatus("End attendance before saving signature.");
      return;
    }

    const signatureSvgBase64 = buildSignatureSvgBase64(
      signaturePoints,
      signatureCanvasSize.width,
      signatureCanvasSize.height,
    );

    if (!signatureSvgBase64) {
      setAttendanceStatus("Draw a signature before saving.");
      return;
    }

    const next: AttendanceRecord = {
      ...activeAttendance,
      signaturePngBase64: signatureSvgBase64,
    };

    setActiveAttendance(next);
    upsertAttendanceRecord(next);
    setSignaturePoints([]);
    setAttendanceStatus("Signature saved.");
    setScreen("SESSION");
  }, [activeAttendance, signaturePoints, signatureCanvasSize, upsertAttendanceRecord]);

  const exportAttendance = useCallback(async () => {
    if (!activeAttendance || !activeAttendance.endAt || activeAttendance.durationSeconds === null) {
      setAttendanceStatus("Complete attendance session before exporting.");
      return;
    }

    setExportingPdf(true);
    try {
      const uri = await exportAttendancePdf({
        userLabel: devUserDisplayName,
        meetingName: activeAttendance.meetingName,
        meetingAddress: activeAttendance.meetingAddress,
        startAtIso: activeAttendance.startAt,
        endAtIso: activeAttendance.endAt,
        durationSeconds: activeAttendance.durationSeconds,
        startLocation: {
          lat: activeAttendance.startLat,
          lng: activeAttendance.startLng,
          accuracyM: activeAttendance.startAccuracyM,
        },
        endLocation: {
          lat: activeAttendance.endLat,
          lng: activeAttendance.endLng,
          accuracyM: activeAttendance.endAccuracyM,
        },
        signatureSvgBase64: activeAttendance.signaturePngBase64,
      });

      const next: AttendanceRecord = {
        ...activeAttendance,
        pdfUri: uri,
      };
      setActiveAttendance(next);
      upsertAttendanceRecord(next);
      setAttendanceStatus(`${ATTENDANCE_PDF_FILE_NAME} exported.`);
    } catch (error) {
      setAttendanceStatus(`PDF export failed: ${formatError(error)}`);
    } finally {
      setExportingPdf(false);
    }
  }, [activeAttendance, devUserDisplayName, upsertAttendanceRecord]);

  const updateSelectedDayPlan = useCallback(
    (updater: (current: DayPlanState) => DayPlanState, callback?: (next: DayPlanState) => void) => {
      setMeetingPlansByDate((previous) => {
        const current = previous[selectedDay.dateKey] ?? EMPTY_DAY_PLAN;
        const nextForDay = updater(current);
        const next = {
          ...previous,
          [selectedDay.dateKey]: nextForDay,
        };
        void persistMeetingPlans(next);
        callback?.(nextForDay);
        return next;
      });
    },
    [persistMeetingPlans, selectedDay.dateKey],
  );

  const setMeetingGoing = useCallback(
    (meetingId: string, going: boolean) => {
      updateSelectedDayPlan((current) => {
        const existing = current.plans[meetingId] ?? {
          going: false,
          earlyMinutes: DEFAULT_MEETING_EARLY_MINUTES,
          serviceCommitmentMinutes: null,
        };

        return {
          ...current,
          plans: {
            ...current.plans,
            [meetingId]: {
              ...existing,
              going,
            },
          },
        };
      });
    },
    [updateSelectedDayPlan],
  );

  const setMeetingEarlyMinutes = useCallback(
    (meetingId: string, earlyMinutesText: string) => {
      const nextEarlyMinutes = parsePositiveInt(earlyMinutesText, DEFAULT_MEETING_EARLY_MINUTES);
      updateSelectedDayPlan((current) => {
        const existing = current.plans[meetingId] ?? {
          going: true,
          earlyMinutes: DEFAULT_MEETING_EARLY_MINUTES,
          serviceCommitmentMinutes: null,
        };

        return {
          ...current,
          plans: {
            ...current.plans,
            [meetingId]: {
              ...existing,
              going: true,
              earlyMinutes: nextEarlyMinutes,
            },
          },
        };
      });
    },
    [updateSelectedDayPlan],
  );

  const toggleHomeGroupMeeting = useCallback(
    (meetingId: string) => {
      updateSelectedDayPlan((current) => {
        const nextHomeGroup = current.homeGroupMeetingId === meetingId ? null : meetingId;
        const existing = current.plans[meetingId] ?? {
          going: true,
          earlyMinutes: DEFAULT_MEETING_EARLY_MINUTES,
          serviceCommitmentMinutes: null,
        };

        return {
          ...current,
          homeGroupMeetingId: nextHomeGroup,
          plans: {
            ...current.plans,
            [meetingId]: {
              ...existing,
              going: true,
              serviceCommitmentMinutes:
                nextHomeGroup === meetingId
                  ? (existing.serviceCommitmentMinutes ?? DEFAULT_SERVICE_COMMITMENT_MINUTES)
                  : existing.serviceCommitmentMinutes,
            },
          },
        };
      });
    },
    [updateSelectedDayPlan],
  );

  const setServiceCommitmentMinutes = useCallback(
    (meetingId: string, valueText: string) => {
      const parsed = parsePositiveInt(valueText, DEFAULT_SERVICE_COMMITMENT_MINUTES);
      updateSelectedDayPlan((current) => {
        const existing = current.plans[meetingId] ?? {
          going: true,
          earlyMinutes: DEFAULT_MEETING_EARLY_MINUTES,
          serviceCommitmentMinutes: DEFAULT_SERVICE_COMMITMENT_MINUTES,
        };

        return {
          ...current,
          plans: {
            ...current.plans,
            [meetingId]: {
              ...existing,
              going: true,
              serviceCommitmentMinutes: parsed,
            },
          },
        };
      });
    },
    [updateSelectedDayPlan],
  );

  const scheduleDebugSponsorNotification = useCallback(async () => {
    const hasPermission = await ensureNotificationPermission();
    if (!hasPermission) {
      setNotificationStatus("Notification permission denied.");
      return;
    }

    const id = await scheduleAt(new Date(Date.now() + 10_000), {
      title: "Sponsor call test",
      body: `Call ${normalizedSponsorName || "Sponsor"} now (${sponsorPhoneE164 ?? "No number"})`,
      categoryIdentifier: SPONSOR_NOTIFICATION_CATEGORY_ID,
      data: {
        type: "sponsor",
        phoneE164: sponsorPhoneE164,
        reason: "debug",
      },
    });

    const buckets = await loadNotificationBuckets();
    buckets.sponsor = [...buckets.sponsor, id];
    await saveNotificationBuckets(buckets);

    console.log("[notifications] debug sponsor scheduled", { id });
    setNotificationStatus("Debug sponsor notification scheduled for ~10 seconds.");
  }, [
    ensureNotificationPermission,
    scheduleAt,
    normalizedSponsorName,
    sponsorPhoneE164,
    loadNotificationBuckets,
    saveNotificationBuckets,
  ]);

  const scheduleDebugDriveNotification = useCallback(async () => {
    const hasPermission = await ensureNotificationPermission();
    if (!hasPermission) {
      setNotificationStatus("Notification permission denied.");
      return;
    }

    const id = await scheduleAt(new Date(Date.now() + 10_000), {
      title: "Leave in 10 minutes",
      body: "Leave in 10 minutes for your planned meeting.",
      categoryIdentifier: DRIVE_NOTIFICATION_CATEGORY_ID,
      data: {
        type: "drive",
      },
    });

    const buckets = await loadNotificationBuckets();
    buckets.drive = [...buckets.drive, id];
    await saveNotificationBuckets(buckets);

    console.log("[notifications] debug drive scheduled", { id });
    setNotificationStatus("Debug drive notification scheduled for ~10 seconds.");
  }, [ensureNotificationPermission, loadNotificationBuckets, saveNotificationBuckets, scheduleAt]);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });

    void Notifications.setNotificationCategoryAsync(SPONSOR_NOTIFICATION_CATEGORY_ID, [
      {
        identifier: SPONSOR_CALL_ACTION_ID,
        buttonTitle: "Call",
        options: { opensAppToForeground: true },
      },
    ]);
    void Notifications.setNotificationCategoryAsync(DRIVE_NOTIFICATION_CATEGORY_ID, [
      {
        identifier: DRIVE_ACTION_ID,
        buttonTitle: "Drive",
        options: { opensAppToForeground: true },
      },
    ]);

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const action = response.actionIdentifier;
      const data = response.notification.request.content.data as {
        type?: string;
        phoneE164?: string | null;
        meetingId?: string;
      };

      if (data.type === "sponsor") {
        const phone = typeof data.phoneE164 === "string" ? data.phoneE164 : null;
        setMode("A");
        setScreen("LIST");
        setSelectedMeeting(null);
        if (phone) {
          setNotificationOpenPhone(phone);
        }
        if (action === SPONSOR_CALL_ACTION_ID && phone) {
          void openPhoneCall(phone);
        }
      }

      if (data.type === "drive") {
        const meetingId = typeof data.meetingId === "string" ? data.meetingId : null;
        if (meetingId && meetingsByIdRef.current[meetingId]) {
          if (action === DRIVE_ACTION_ID || action === Notifications.DEFAULT_ACTION_IDENTIFIER) {
            void openMeetingDestination(meetingsByIdRef.current[meetingId]);
          }
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [openMeetingDestination, openPhoneCall]);

  useEffect(() => {
    const mapping: Record<string, MeetingRecord> = {};
    for (const meeting of meetings) {
      mapping[meeting.id] = meeting;
    }
    meetingsByIdRef.current = mapping;
  }, [meetings]);

  useEffect(() => {
    void (async () => {
      const position = await requestLocationPermission();
      await Promise.all([refreshMeetings({ location: position }), fetchSponsorConfig()]);

      try {
        const [modeRaw, sponsorUiPrefsRaw, attendanceRaw, planRaw] = await Promise.all([
          AsyncStorage.getItem(modeStorage),
          AsyncStorage.getItem(sponsorUiPrefsStorage),
          AsyncStorage.getItem(attendanceStorage),
          AsyncStorage.getItem(meetingPlansStorage),
        ]);

        if (modeRaw === "A" || modeRaw === "B" || modeRaw === "C") {
          setMode(modeRaw);
        }

        if (sponsorUiPrefsRaw) {
          const parsedPrefs = JSON.parse(sponsorUiPrefsRaw) as { leadMinutes?: number };
          if (
            parsedPrefs &&
            typeof parsedPrefs.leadMinutes === "number" &&
            [0, 5, 10, 30].includes(parsedPrefs.leadMinutes)
          ) {
            setSponsorLeadMinutes(parsedPrefs.leadMinutes as SponsorLeadMinutes);
          }
        }

        if (attendanceRaw) {
          const parsedAttendance = JSON.parse(attendanceRaw) as AttendanceRecord[];
          if (Array.isArray(parsedAttendance)) {
            setAttendanceRecords(parsedAttendance);
          }
        }

        if (planRaw) {
          const parsedPlans = JSON.parse(planRaw) as MeetingPlansState;
          if (parsedPlans && typeof parsedPlans === "object") {
            setMeetingPlansByDate(parsedPlans);
          }
        }
      } catch {
        setAttendanceStatus("Unable to load local attendance history.");
      } finally {
        setBootstrapped(true);
      }
    })();
    // TODO(auth): replace DEV auth headers with real session auth tokens.
  }, [
    modeStorage,
    sponsorUiPrefsStorage,
    attendanceStorage,
    meetingPlansStorage,
    fetchSponsorConfig,
    refreshMeetings,
    requestLocationPermission,
  ]);

  useEffect(() => {
    if (!bootstrapped) {
      return;
    }
    void AsyncStorage.setItem(modeStorage, mode);
  }, [mode, modeStorage, bootstrapped]);

  useEffect(() => {
    if (!bootstrapped) {
      return;
    }
    void AsyncStorage.setItem(
      sponsorUiPrefsStorage,
      JSON.stringify({
        leadMinutes: sponsorLeadMinutes,
      }),
    );
  }, [sponsorLeadMinutes, sponsorUiPrefsStorage, bootstrapped]);

  useEffect(() => {
    void refreshMeetings();
  }, [selectedDay.dayOfWeek, refreshMeetings]);

  useEffect(() => {
    if (!sponsorEnabled) {
      void cancelNotificationBucket("sponsor");
      setNotificationStatus("Sponsor disabled.");
setNotificationOpenPhone(null);
    }
  }, [sponsorEnabled, cancelNotificationBucket]);

  useEffect(() => {
    if (!sponsorEnabled) {
      return;
    }
    if (!sponsorActive) {
      void cancelNotificationBucket("sponsor");
      setNotificationStatus("Sponsor reminders disabled.");
    }
  }, [sponsorEnabled, sponsorActive, cancelNotificationBucket]);

  useEffect(() => {
    if (!bootstrapped || !sponsorEnabled || !sponsorActive) {
      return;
    }
    void rescheduleSponsorNotifications("lead-change");
  }, [
    bootstrapped,
    sponsorEnabled,
    sponsorLeadMinutes,
    sponsorActive,
    rescheduleSponsorNotifications,
  ]);

  useEffect(() => {
    void rescheduleDriveNotifications("plan-change");
  }, [rescheduleDriveNotifications]);

  useEffect(() => {
    if (!activeAttendance || activeAttendance.endAt) {
      return;
    }

    const timer = setInterval(() => {
      setSessionNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [activeAttendance]);

  useEffect(() => {
    arrivalPromptedMeetingRef.current = null;
  }, [selectedMeeting?.id]);

  useEffect(() => {
    if (
      Platform.OS !== "ios" ||
      !selectedMeeting ||
      selectedMeeting.format === "ONLINE" ||
      selectedMeeting.lat === null ||
      selectedMeeting.lng === null
    ) {
      return;
    }

    if (activeAttendance && !activeAttendance.endAt) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const checkArrival = async () => {
      if (cancelled) {
        return;
      }

      const location = await readCurrentLocation();
      if (!location || cancelled) {
        return;
      }

      const distance = distanceMetersBetween(
        location.lat,
        location.lng,
        selectedMeeting.lat as number,
        selectedMeeting.lng as number,
      );

      if (
        distance <= ARRIVAL_RADIUS_METERS &&
        arrivalPromptedMeetingRef.current !== selectedMeeting.id
      ) {
        arrivalPromptedMeetingRef.current = selectedMeeting.id;
        Alert.alert("Arriving?", `You're arriving at ${selectedMeeting.name}. Start attendance?`, [
          { text: "Not now", style: "cancel" },
          {
            text: "Start",
            onPress: () => {
              void startAttendance(selectedMeeting);
            },
          },
        ]);
      }
    };

    void checkArrival();
    timer = setInterval(() => {
      void checkArrival();
    }, 15_000);

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [selectedMeeting, activeAttendance, readCurrentLocation, startAttendance]);

  function toggleRepeatDay(day: WeekdayCode) {
    setSponsorRepeatDays((previous) => {
      const next = previous.includes(day)
        ? previous.filter((item) => item !== day)
        : [...previous, day];
      return sortWeekdays(next);
    });
  }

  function incrementHour(delta: number) {
    setSponsorHour12((previous) => {
      const next = previous + delta;
      if (next > 12) {
        return 1;
      }
      if (next < 1) {
        return 12;
      }
      return next;
    });
  }

  function incrementMinute(delta: number) {
    setSponsorMinute((previous) => {
      const next = previous + delta;
      if (next > 59) {
        return 0;
      }
      if (next < 0) {
        return 59;
      }
      return next;
    });
  }

  function onDayPress(option: DayOption) {
    if (selectedMeeting && screen === "DETAIL") {
      Alert.alert(
        "Change day filter?",
        "Changing day filter will close the selected meeting detail.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Change",
            onPress: () => {
              setSelectedMeeting(null);
              setScreen("LIST");
              setSelectedDayOffset(option.offset);
            },
          },
        ],
      );
      return;
    }

    setSelectedDayOffset(option.offset);
  }

  function addSignaturePoint(event: GestureResponderEvent) {
    const x = Math.max(0, Math.min(signatureCanvasSize.width, event.nativeEvent.locationX));
    const y = Math.max(0, Math.min(signatureCanvasSize.height, event.nativeEvent.locationY));
    setSignaturePoints((previous) => [...previous, { x, y }]);
  }

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
        <Text style={styles.title}>Recovery Mode</Text>
        <Text style={styles.meta}>DEV user: {devAuthUserId}</Text>

        <View style={styles.modeRow}>
          {RECOVERY_MODE_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setMode(option.value)}
              style={[
                styles.modeChip,
                mode === option.value ? styles.modeChipSelected : null,
                option.implemented ? null : styles.modeChipDisabled,
              ]}
            >
              <Text
                style={[
                  styles.modeChipText,
                  mode === option.value ? styles.modeChipTextSelected : null,
                ]}
              >
                {option.title}
              </Text>
              {!option.implemented ? <Text style={styles.modeComingSoon}>Coming soon</Text> : null}
            </Pressable>
          ))}
        </View>

        {mode !== "A" ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              {RECOVERY_MODE_OPTIONS.find((item) => item.value === mode)?.title}
            </Text>
            <Text style={styles.sectionMeta}>
              This mode is visible for planning and will be implemented in a future slice.
            </Text>
          </View>
        ) : null}

        {mode === "A" ? (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Sponsor</Text>
              <View style={styles.inlineRow}>
                <Text style={styles.label}>Enable sponsor</Text>
                <Switch
                  value={sponsorEnabled}
                  onValueChange={(value) => {
                    setSponsorEnabled(value);
                    if (!value) {
                      setSponsorActive(false);
                      void cancelNotificationBucket("sponsor");
                      setNotificationStatus("Sponsor disabled.");
                      setCalendarStatus("Sponsor disabled.");

                      setNotificationOpenPhone(null);

                    }
                  }}
                />
              </View>
{!sponsorEnabled ? (
  <Text style={styles.sectionMeta}>Sponsor is disabled. Turn on to configure.</Text>
) : (
  <>
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
      keyboardType="phone-pad"
      maxLength={14}
      placeholder="(555) 555-1234"
    />

    <View style={styles.inlineRow}>
      <Text style={styles.label}>Reminders</Text>
      <Switch
        value={sponsorActive}
        onValueChange={(value) => {
          setSponsorActive(value);
          setSponsorStatus(null);

          if (!value) {
            void cancelNotificationBucket("sponsor");
            setNotificationStatus("Sponsor reminders disabled.");
            return;
          }

          if (!normalizedSponsorName || !sponsorPhoneE164) {
            return;
          }

          void rescheduleSponsorNotifications("toggle-on");
        }}
      />
    </View>

    {sponsorActive ? (
      <>
        <Text style={styles.label}>Call time</Text>
        <View style={styles.timeRow}>
          <Pressable style={styles.stepButton} onPress={() => incrementHour(-1)}>
            <Text style={styles.stepButtonText}>-</Text>
          </Pressable>
          <Text style={styles.timeValue}>{String(sponsorHour12).padStart(2, "0")}</Text>
          <Pressable style={styles.stepButton} onPress={() => incrementHour(1)}>
            <Text style={styles.stepButtonText}>+</Text>
          </Pressable>

          <Text style={styles.timeDivider}>:</Text>

          <Pressable style={styles.stepButton} onPress={() => incrementMinute(-1)}>
            <Text style={styles.stepButtonText}>-</Text>
          </Pressable>
          <Text style={styles.timeValue}>{String(sponsorMinute).padStart(2, "0")}</Text>
          <Pressable style={styles.stepButton} onPress={() => incrementMinute(1)}>
            <Text style={styles.stepButtonText}>+</Text>
          </Pressable>

          <Pressable
            style={styles.meridiemButton}
            onPress={() => setSponsorMeridiem((current) => (current === "AM" ? "PM" : "AM"))}
          >
            <Text style={styles.meridiemText}>{sponsorMeridiem}</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Repeat</Text>
        <View style={styles.chipRow}>
          {SPONSOR_REPEAT_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[styles.chip, sponsorRepeatPreset === option.value ? styles.chipSelected : null]}
              onPress={() => setSponsorRepeatPreset(option.value)}
            >
              <Text
                style={[
                  styles.chipText,
                  sponsorRepeatPreset === option.value ? styles.chipTextSelected : null,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {sponsorRepeatPreset !== "MONTHLY" ? (
          <>
            <Text style={styles.label}>Days</Text>
            <View style={styles.chipRow}>
              {WEEKDAY_OPTIONS.map((day) => (
                <Pressable
                  key={day.code}
                  style={[styles.chip, sponsorRepeatDays.includes(day.code) ? styles.chipSelected : null]}
                  onPress={() => toggleRepeatDay(day.code)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      sponsorRepeatDays.includes(day.code) ? styles.chipTextSelected : null,
                    ]}
                  >
                    {day.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <Text style={styles.label}>Alert lead time</Text>
        <View style={styles.chipRow}>
          {SPONSOR_LEAD_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[styles.chip, sponsorLeadMinutes === option.value ? styles.chipSelected : null]}
              onPress={() => setSponsorLeadMinutes(option.value)}
            >
              <Text
                style={[
                  styles.chipText,
                  sponsorLeadMinutes === option.value ? styles.chipTextSelected : null,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </>
    ) : (
      <Text style={styles.sectionMeta}>Turn reminders on to configure schedule + alerts.</Text>
    )}

    {notificationOpenPhone ? (
  <View style={styles.callNowBox}>
   <Text style={styles.sectionMeta}>
  {"Opened from notification: "}
  {notificationOpenPhone}
</Text>
    <Button
      title="Call now"
      onPress={() => void openPhoneCall(notificationOpenPhone)}
    />
  </View>
) : null}
    <Text style={styles.sectionMeta}>{sponsorStatusLine}</Text>
    <Button
      title={sponsorSaving ? "Saving..." : "Save Sponsor Config"}
      onPress={() => void saveSponsorConfig()}
      disabled={sponsorSaving}
    />
  </>
)}
            </View>

            {__DEV__ ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Debug Notification Tools</Text>
                <View style={styles.inlineRow}>
                  <Text style={styles.label}>Time compression</Text>
                  <Switch
                    value={debugTimeCompressionEnabled}
                    onValueChange={setDebugTimeCompressionEnabled}
                  />
                </View>
                <Text style={styles.sectionMeta}>
                  When enabled, scheduled notification delays are compressed for quick simulator
                  tests.
                </Text>
                <Text style={styles.sectionMeta}>Notification debug: {notificationStatus}</Text>
                <Text style={styles.sectionMeta}>Calendar debug: {calendarStatus}</Text>
                <View style={styles.buttonRow}>
                  <Button
                    title="Test sponsor alert in 10s"
                    onPress={() => void scheduleDebugSponsorNotification()}
                  />
                  <View style={styles.buttonSpacer} />
                  <Button
                    title="Test leave alert in 10s"
                    onPress={() => void scheduleDebugDriveNotification()}
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Meetings</Text>
              <Text style={styles.sectionMeta}>{meetingsStatus}</Text>
              <Text style={styles.sectionMeta}>
                Location: {locationPermission === "granted" ? "Enabled" : "Not enabled"}
              </Text>
              {meetingsError ? <Text style={styles.errorText}>{meetingsError}</Text> : null}

              <View style={styles.buttonRow}>
                <Button title="Refresh meetings" onPress={() => void refreshMeetings()} />
                <View style={styles.buttonSpacer} />
                <Button
                  title="Enable location"
                  onPress={() => {
                    void (async () => {
                      const position = await requestLocationPermission();
                      await refreshMeetings({ location: position });
                    })();
                  }}
                />
              </View>

              <View style={styles.chipRow}>
                {dayOptions.map((option) => (
                  <Pressable
                    key={option.offset}
                    style={[
                      styles.chip,
                      selectedDayOffset === option.offset ? styles.chipSelected : null,
                    ]}
                    onPress={() => onDayPress(option)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selectedDayOffset === option.offset ? styles.chipTextSelected : null,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {loadingMeetings ? <Text style={styles.sectionMeta}>Loading meetings...</Text> : null}

              {screen === "LIST" ? (
                <>
                  {meetingsForDay.map((meeting) => {
                    const plan = selectedDayPlan.plans[meeting.id] ?? {
                      going: false,
                      earlyMinutes: DEFAULT_MEETING_EARLY_MINUTES,
                      serviceCommitmentMinutes: null,
                    };
                    const isHomeGroup = selectedDayPlan.homeGroupMeetingId === meeting.id;
                    const preview = buildDriveSchedulePreview(meeting, selectedDayPlan);

                    return (
                      <View key={meeting.id} style={styles.meetingCard}>
                        <Text style={styles.meetingName}>{meeting.name}</Text>
                        <Text style={styles.sectionMeta}>
                          {meeting.startsAtLocal || "Unknown"} • {meeting.openness || "Unknown"} •{" "}
                          {meeting.format || "Unknown"}
                        </Text>
                        <Text style={styles.sectionMeta}>
                          {meeting.format === "ONLINE"
                            ? "Online"
                            : meeting.address || "Unknown address"}{" "}
                          • {formatDistance(meeting.distanceMeters)}
                        </Text>

                        <Pressable
                          style={styles.checkboxRow}
                          onPress={() => setMeetingGoing(meeting.id, !plan.going)}
                        >
                          <View
                            style={[styles.checkbox, plan.going ? styles.checkboxChecked : null]}
                          >
                            {plan.going ? <Text style={styles.checkboxTick}>✓</Text> : null}
                          </View>
                          <Text style={styles.label}>Going</Text>
                        </Pressable>

                        {plan.going ? (
                          <>
                            <View style={styles.inlineRowGap}>
                              <Text style={styles.sectionMeta}>Minutes early</Text>
                              <TextInput
                                style={styles.smallInput}
                                value={String(plan.earlyMinutes)}
                                keyboardType="number-pad"
                                onChangeText={(value) => setMeetingEarlyMinutes(meeting.id, value)}
                              />
                            </View>

                            <View style={styles.inlineRowGap}>
                              <Button
                                title={isHomeGroup ? "Unset home group" : "Set as home group"}
                                onPress={() => toggleHomeGroupMeeting(meeting.id)}
                              />
                            </View>

                            {isHomeGroup ? (
                              <View style={styles.inlineRowGap}>
                                <Text style={styles.sectionMeta}>
                                  Service commitment (minutes early)
                                </Text>
                                <TextInput
                                  style={styles.smallInput}
                                  value={String(
                                    plan.serviceCommitmentMinutes ??
                                      DEFAULT_SERVICE_COMMITMENT_MINUTES,
                                  )}
                                  keyboardType="number-pad"
                                  onChangeText={(value) =>
                                    setServiceCommitmentMinutes(meeting.id, value)
                                  }
                                />
                              </View>
                            ) : null}

                            {preview ? (
                              <Text style={styles.sectionMeta}>
                                {preview.usesServiceCommitment
                                  ? "Service commitment override"
                                  : "Standard early arrival"}
                                : start {preview.meetingStartAt.toLocaleTimeString()}, travel{" "}
                                {preview.travelMinutes}m, depart{" "}
                                {preview.departAt.toLocaleTimeString()}, notify{" "}
                                {preview.notifyAt.toLocaleTimeString()}
                              </Text>
                            ) : null}
                          </>
                        ) : null}

                        <Pressable
                          style={styles.detailButton}
                          onPress={() => {
                            setSelectedMeeting(meeting);
                            setScreen("DETAIL");
                          }}
                        >
                          <Text style={styles.detailButtonText}>View details</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                  {!loadingMeetings && meetingsForDay.length === 0 ? (
                    <Text style={styles.sectionMeta}>No meetings for this day.</Text>
                  ) : null}
                </>
              ) : null}

              {screen === "DETAIL" && selectedMeeting ? (
                <View style={styles.meetingCard}>
                  <Text style={styles.meetingName}>{selectedMeeting.name}</Text>
                  <Text style={styles.sectionMeta}>
                    {selectedMeeting.address || "Unknown address"}
                  </Text>
                  <Text style={styles.sectionMeta}>
                    {selectedMeeting.startsAtLocal || "Unknown"} •{" "}
                    {selectedMeeting.openness || "Unknown"} • {selectedMeeting.format || "Unknown"}
                  </Text>
                  <Text style={styles.sectionMeta}>
                    Distance:{" "}
                    {formatDistance(
                      currentLocation &&
                        selectedMeeting.lat !== null &&
                        selectedMeeting.lng !== null
                        ? distanceMetersBetween(
                            currentLocation.lat,
                            currentLocation.lng,
                            selectedMeeting.lat,
                            selectedMeeting.lng,
                          )
                        : null,
                    )}
                  </Text>

                  <View style={styles.buttonRow}>
                    <Button title="Back" onPress={() => setScreen("LIST")} />
                    <View style={styles.buttonSpacer} />
                    <Button
                      title="Drive now"
                      onPress={() => void openMeetingDestination(selectedMeeting)}
                    />
                  </View>

                  {selectedMeeting.onlineUrl ? (
                    <View style={styles.buttonRow}>
                      <Button
                        title="Open meeting link"
                        onPress={() => void Linking.openURL(selectedMeeting.onlineUrl as string)}
                      />
                    </View>
                  ) : null}

                  <View style={styles.buttonRow}>
                    <Button
                      title="Start attendance"
                      onPress={() => void startAttendance(selectedMeeting)}
                    />
                  </View>

                  <Text style={styles.sectionMeta}>
                    Arrival watcher: you will be prompted when within ~200 ft on iOS.
                  </Text>
                </View>
              ) : null}
            </View>

            {(screen === "SESSION" || screen === "SIGNATURE") && activeAttendance ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Verified Attendance</Text>
                <Text style={styles.sectionMeta}>{attendanceStatus}</Text>
                <Text style={styles.sectionMeta}>Meeting: {activeAttendance.meetingName}</Text>
                <Text style={styles.sectionMeta}>
                  Started: {new Date(activeAttendance.startAt).toLocaleString()}
                </Text>
                <Text style={styles.sectionMeta}>
                  Duration: {formatDuration(openSessionDurationSeconds)}
                </Text>

                {!activeAttendance.endAt ? (
                  <Button title="End attendance" onPress={() => void endAttendance()} />
                ) : null}

                {activeAttendance.endAt ? (
                  <>
                    <Text style={styles.sectionMeta}>
                      Ended: {new Date(activeAttendance.endAt).toLocaleString()}
                    </Text>
                    <Text style={styles.sectionMeta}>
                      Signature: {activeAttendance.signaturePngBase64 ? "Saved" : "Missing"}
                    </Text>
                    <Text style={styles.sectionMeta}>
                      PDF: {activeAttendance.pdfUri ?? "Not exported"}
                    </Text>

                    <View style={styles.buttonRow}>
                      <Button title="Back to meetings" onPress={() => setScreen("LIST")} />
                      <View style={styles.buttonSpacer} />
                      <Button title="Add signature" onPress={() => setScreen("SIGNATURE")} />
                    </View>

                    <View style={styles.buttonRow}>
                      <Button
                        title={exportingPdf ? "Exporting..." : "Export attendance PDF"}
                        onPress={() => void exportAttendance()}
                        disabled={exportingPdf}
                      />
                    </View>
                  </>
                ) : null}

                <Text style={styles.sectionMeta}>PDF file name: {ATTENDANCE_PDF_FILE_NAME}</Text>
              </View>
            ) : null}

            {screen === "SIGNATURE" && activeAttendance ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Signature Capture</Text>
                <Text style={styles.sectionMeta}>Draw chairperson signature with finger.</Text>

                <View
                  style={styles.signatureCanvas}
                  onLayout={(event) => {
                    setSignatureCanvasSize({
                      width: event.nativeEvent.layout.width,
                      height: event.nativeEvent.layout.height,
                    });
                  }}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={addSignaturePoint}
                  onResponderMove={addSignaturePoint}
                >
                  {signaturePoints.map((point, index) => (
                    <View
                      key={`${point.x}-${point.y}-${index}`}
                      style={[
                        styles.signaturePoint,
                        {
                          left: point.x,
                          top: point.y,
                        },
                      ]}
                    />
                  ))}
                </View>

                <View style={styles.buttonRow}>
                  <Button title="Back" onPress={() => setScreen("SESSION")} />
                  <View style={styles.buttonSpacer} />
                  <Button title="Clear" onPress={() => setSignaturePoints([])} />
                  <View style={styles.buttonSpacer} />
                  <Button title="Save" onPress={saveSignature} />
                </View>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Recent Attendance</Text>
              {attendanceRecords.slice(0, 5).map((record) => (
                <View key={record.id} style={styles.historyCard}>
                  <Text style={styles.meetingName}>{record.meetingName}</Text>
                  <Text style={styles.sectionMeta}>
                    {new Date(record.startAt).toLocaleString()} •{" "}
                    {formatDuration(record.durationSeconds)}
                  </Text>
                  <Text style={styles.sectionMeta}>
                    {record.endAt ? "Completed" : "In progress"} • Signature:{" "}
                    {record.signaturePngBase64 ? "Yes" : "No"}
                  </Text>
                </View>
              ))}
              {attendanceRecords.length === 0 ? (
                <Text style={styles.sectionMeta}>No attendance records yet.</Text>
              ) : null}
            </View>
          </>
        ) : null}
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
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 140,
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  meta: {
    color: "#667085",
    marginBottom: 8,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "#ffffff",
    alignItems: "center",
    gap: 4,
  },
  modeChipSelected: {
    borderColor: "#155eef",
    backgroundColor: "#e0eaff",
  },
  modeChipDisabled: {
    opacity: 0.65,
  },
  modeChipText: {
    color: "#344054",
    fontWeight: "600",
    textAlign: "center",
  },
  modeChipTextSelected: {
    color: "#1d4ed8",
  },
  modeComingSoon: {
    color: "#667085",
    fontSize: 11,
  },
  card: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#101828",
  },
  sectionMeta: {
    color: "#475467",
    fontSize: 12,
  },
  errorText: {
    color: "#b42318",
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallInput: {
    minWidth: 64,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: "center",
  },
  label: {
    color: "#344054",
    fontWeight: "600",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  stepButton: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#f8fafc",
  },
  stepButtonText: {
    fontWeight: "700",
  },
  timeValue: {
    minWidth: 28,
    textAlign: "center",
    fontWeight: "700",
  },
  timeDivider: {
    fontWeight: "700",
  },
  meridiemButton: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#f8fafc",
  },
  meridiemText: {
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  chipSelected: {
    borderColor: "#155eef",
    backgroundColor: "#e0eaff",
  },
  chipText: {
    color: "#344054",
    fontSize: 12,
  },
  chipTextSelected: {
    color: "#1d4ed8",
    fontWeight: "700",
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inlineRowGap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  buttonSpacer: {
    width: 8,
    height: 8,
  },
  callNowBox: {
    borderWidth: 1,
    borderColor: "#c7d7fe",
    borderRadius: 8,
    padding: 8,
    gap: 6,
    backgroundColor: "#eef4ff",
  },
  meetingCard: {
    borderWidth: 1,
    borderColor: "#eaecf0",
    borderRadius: 8,
    padding: 10,
    gap: 4,
    backgroundColor: "#fff",
  },
  meetingName: {
    fontWeight: "700",
    color: "#101828",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#98a2b3",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  checkboxChecked: {
    borderColor: "#155eef",
    backgroundColor: "#155eef",
  },
  checkboxTick: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  detailButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#155eef",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  detailButtonText: {
    color: "#155eef",
    fontWeight: "600",
  },
  signatureCanvas: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    height: 180,
    backgroundColor: "#fff",
    overflow: "hidden",
    position: "relative",
  },
  signaturePoint: {
    position: "absolute",
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#101828",
  },
  historyCard: {
    borderTopWidth: 1,
    borderTopColor: "#eaecf0",
    paddingTop: 8,
    gap: 2,
  },
});
