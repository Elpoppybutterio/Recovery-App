import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Calendar from "expo-calendar";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapView, { Marker, type Region } from "react-native-maps";
import {
  Alert,
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
import { exportMorningRoutinePdf } from "./lib/pdf/exportMorningRoutinePdf";
import { exportNightlyInventoryPdf } from "./lib/pdf/exportNightlyInventoryPdf";
import { getInsightForDay } from "./lib/recoveryInsights";
import { Dashboard } from "./lib/dashboard/Dashboard";
import { createDefaultRoutinesStore } from "./lib/routines/defaults";
import {
  dateKeyForRoutines,
  getMorningDayState,
  getNightlyDayState,
  loadRoutinesStore,
  saveRoutinesStore,
} from "./lib/routines/storage";
import {
  computeMorningRoutineStats,
  computeNightlyInventoryStats,
  computeRoutineInsights,
} from "./lib/routines/stats";
import type { NightlyInventoryDayState, RecoveryRoutinesStore } from "./lib/routines/types";
import { AppButton } from "./lib/ui/AppButton";
import { GlassCard } from "./lib/ui/GlassCard";
import { LiquidBackground } from "./lib/ui/LiquidBackground";
import { Design } from "./lib/ui/design";
import { ui } from "./lib/ui/ui";
import { colors } from "./lib/theme/tokens";
import { MorningRoutineScreen } from "./screens/MorningRoutineScreen";
import { NightlyInventoryScreen } from "./screens/NightlyInventoryScreen";
import { RoutineReaderScreen } from "./screens/RoutineReaderScreen";
import { ToolsRoutinesScreen } from "./screens/ToolsRoutinesScreen";

const MapViewCompat: any = MapView;
const MarkerCompat: any = Marker;

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
type SaveSponsorConfigOverrides = {
  sponsorEnabled?: boolean;
  sponsorActive?: boolean;
};

type LocationStamp = {
  lat: number;
  lng: number;
  accuracyM: number | null;
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

type MeetingsViewMode = "LIST" | "MAP";
type HomeScreen = "SETUP" | "DASHBOARD" | "MEETINGS" | "ATTENDANCE" | "SETTINGS" | "TOOLS";
type SetupStep = 1 | 2 | 3 | 4 | 5;
type MeetingsFormatFilter = "ALL" | "IN_PERSON" | "ONLINE";
type MeetingsTimeFilter = "ANY" | "MORNING" | "AFTERNOON" | "EVENING";
type ToolsScreen = "HOME" | "MORNING" | "NIGHTLY" | "READER";
type RoutineInventoryCategory = keyof Pick<
  NightlyInventoryDayState,
  "resentful" | "selfish" | "dishonest" | "afraid" | "apology"
>;
type RoutineReaderState = {
  title: string;
  url: string | null;
};

type MapBoundaryCenter = {
  lat: number;
  lng: number;
};

type MeetingLocationGroup = {
  key: string;
  lat: number;
  lng: number;
  address: string;
  meetings: MeetingListItem[];
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

const DASHBOARD_FOOTER_NAV_HEIGHT = Platform.OS === "ios" ? 74 : 66;
const DASHBOARD_SCROLL_FADE_HEIGHT = 34;

type SponsorCallLog = {
  id: string;
  atIso: string;
  sponsorPhoneE164: string | null;
  source: "button" | "notification";
  success: boolean;
};

type MeetingAttendanceLog = {
  id: string;
  meetingId: string;
  atIso: string;
  method: "manual" | "arrivalPrompt" | "verified";
};

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
const SETUP_COMPLETE_STORAGE_KEY_PREFIX = "recovery:setupComplete:";
const SOBRIETY_DATE_STORAGE_KEY_PREFIX = "recovery:sobrietyDate:";
const PROFILE_STORAGE_KEY_PREFIX = "recovery:modePrefs:";
const SPONSOR_CALL_LOG_STORAGE_KEY_PREFIX = "recovery:sponsorCalls:";
const MEETING_ATTENDANCE_LOG_STORAGE_KEY_PREFIX = "recovery:meetingsCompleted:";
const SPONSOR_ENABLED_AT_STORAGE_KEY_PREFIX = "recovery:sponsorEnabledAt:";
const NINETY_DAY_GOAL_STORAGE_KEY_PREFIX = "recovery:ninetyDayGoal:";
const SOBRIETY_MILESTONE_EVENT_IDS_STORAGE_KEY_PREFIX = "recovery:sobrietyMilestoneEventIds:";
const SOBRIETY_MILESTONE_SYNC_DATE_STORAGE_KEY_PREFIX = "recovery:sobrietyMilestoneSyncDate:";

const SPONSOR_NOTIFICATION_CATEGORY_ID = "SPONSOR_CALL";
const DRIVE_NOTIFICATION_CATEGORY_ID = "DRIVE_LEAVE";
const SPONSOR_CALL_ACTION_ID = "SPONSOR_CALL_NOW";
const DRIVE_ACTION_ID = "DRIVE_NOW";

const DEFAULT_MEETING_EARLY_MINUTES = 10;
const DEFAULT_SERVICE_COMMITMENT_MINUTES = 45;
const MAX_MEETING_MINUTES = 99;
const DEFAULT_NINETY_DAY_GOAL_TARGET = 90;
const DASHBOARD_NEARBY_RADIUS_MILES = 20;
const DASHBOARD_NEARBY_RADIUS_METERS = DASHBOARD_NEARBY_RADIUS_MILES * 1609.344;
const LOCALHOST_API_HINT = "API URL is localhost; set it to your machine IP for simulator/device.";
const DEFAULT_MAP_LATITUDE_DELTA = 0.22;
const DEFAULT_MAP_LONGITUDE_DELTA = 0.22;

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
const MEETINGS_FORMAT_OPTIONS: Array<{ value: MeetingsFormatFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "IN_PERSON", label: "In-person" },
  { value: "ONLINE", label: "Online" },
];
const MEETINGS_TIME_OPTIONS: Array<{ value: MeetingsTimeFilter; label: string }> = [
  { value: "ANY", label: "Any time" },
  { value: "MORNING", label: "Morning" },
  { value: "AFTERNOON", label: "Afternoon" },
  { value: "EVENING", label: "Evening" },
];

const SHOW_MODE_TILES = false;
const DAILY_REFLECTIONS_SOUND_CLOUD_BASE_URL = "https://soundcloud.com/aaws";
const DAILY_REFLECTIONS_SOUND_CLOUD_TOKEN = "s-8IxPSjlasYX";
const DAILY_REFLECTIONS_AUDIO_DAY_OFFSET = 2;
const MONTH_SLUGS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

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

function coordinatesEqual(
  left: { lat: number; lng: number } | null,
  right: { lat: number; lng: number },
): boolean {
  if (!left) {
    return false;
  }
  return Math.abs(left.lat - right.lat) < 1e-6 && Math.abs(left.lng - right.lng) < 1e-6;
}

function formatDistance(distanceMeters: number | null): string {
  if (distanceMeters === null) {
    return "Distance unavailable";
  }
  const miles = distanceMeters / 1609.344;
  return `${miles.toFixed(1)} mi`;
}

function formatCoordinate(value: number): string {
  return value.toFixed(5);
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

function formatHhmmForDisplay(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return value;
  }
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour24) || !Number.isFinite(minute)) {
    return value;
  }
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
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

function parseTwoDigitMinutes(value: string, fallback: number): number {
  const digitsOnly = value.replace(/\D/g, "").slice(0, 2);
  if (!digitsOnly) {
    return fallback;
  }
  return Math.min(MAX_MEETING_MINUTES, parsePositiveInt(digitsOnly, fallback));
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

function setupCompleteStorageKey(userId: string): string {
  return `${SETUP_COMPLETE_STORAGE_KEY_PREFIX}${userId}`;
}

function sobrietyDateStorageKey(userId: string): string {
  return `${SOBRIETY_DATE_STORAGE_KEY_PREFIX}${userId}`;
}

function profileStorageKey(userId: string): string {
  return `${PROFILE_STORAGE_KEY_PREFIX}${userId}`;
}

function sponsorCallLogStorageKey(userId: string): string {
  return `${SPONSOR_CALL_LOG_STORAGE_KEY_PREFIX}${userId}`;
}

function meetingAttendanceLogStorageKey(userId: string): string {
  return `${MEETING_ATTENDANCE_LOG_STORAGE_KEY_PREFIX}${userId}`;
}

function sponsorEnabledAtStorageKey(userId: string): string {
  return `${SPONSOR_ENABLED_AT_STORAGE_KEY_PREFIX}${userId}`;
}

function ninetyDayGoalStorageKey(userId: string): string {
  return `${NINETY_DAY_GOAL_STORAGE_KEY_PREFIX}${userId}`;
}

function sobrietyMilestoneEventIdsStorageKey(userId: string): string {
  return `${SOBRIETY_MILESTONE_EVENT_IDS_STORAGE_KEY_PREFIX}${userId}`;
}

function sobrietyMilestoneSyncDateStorageKey(userId: string): string {
  return `${SOBRIETY_MILESTONE_SYNC_DATE_STORAGE_KEY_PREFIX}${userId}`;
}

function normalizeUsDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  const month = digits.slice(0, 2);
  const day = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  if (digits.length <= 2) {
    return month;
  }
  if (digits.length <= 4) {
    return `${month}/${day}`;
  }
  return `${month}/${day}/${year}`;
}

function normalizeGoalInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

function parseGoalTargetInput(value: string): number | null {
  const normalized = normalizeGoalInput(value);
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(1, Math.min(9999, Math.floor(parsed)));
}

function parseDdMmYyyyToIso(value: string): string | null {
  const normalized = value.trim();
  const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return null;
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }
  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateKeyToLocalDate(dateKey: string): Date | null {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function dayOfYear(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
  const currentDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  return Math.floor((currentDay.getTime() - startOfYear.getTime()) / 86_400_000) + 1;
}

function buildDailyReflectionsListenUrl(dateKey: string): string {
  const targetDate = parseDateKeyToLocalDate(dateKey) ?? new Date();
  const trackNumber = dayOfYear(targetDate) + DAILY_REFLECTIONS_AUDIO_DAY_OFFSET;
  const monthSlug = MONTH_SLUGS[targetDate.getMonth()] ?? "january";
  const dayOfMonth = targetDate.getDate();
  return `${DAILY_REFLECTIONS_SOUND_CLOUD_BASE_URL}/${String(trackNumber).padStart(3, "0")}-${monthSlug}-${dayOfMonth}/${DAILY_REFLECTIONS_SOUND_CLOUD_TOKEN}`;
}

function formatIsoToDdMmYyyy(value: string | null): string {
  if (!value) {
    return "";
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return "";
  }
  return `${match[2]}/${match[3]}/${match[1]}`;
}

type SobrietyMilestoneSpec = {
  title: string;
  at: Date;
};

function createSobrietyDateAtNoon(dateIso: string): Date | null {
  const match = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function buildSobrietyMilestones(dateIso: string): SobrietyMilestoneSpec[] {
  const startAt = createSobrietyDateAtNoon(dateIso);
  if (!startAt) {
    return [];
  }
  return [
    { title: "30 DAYS", at: addDays(startAt, 30) },
    { title: "60 DAYS", at: addDays(startAt, 60) },
    { title: "90 DAYS", at: addDays(startAt, 90) },
    { title: "6 MONTHS", at: addMonths(startAt, 6) },
    { title: "9 MONTHS", at: addMonths(startAt, 9) },
    { title: "1 YEAR", at: addMonths(startAt, 12) },
  ];
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

function loadOptionalModule<T>(moduleName: string): T | null {
  try {
    const runtime = globalThis as { require?: (name: string) => unknown };
    if (typeof runtime.require !== "function") {
      return null;
    }
    return runtime.require(moduleName) as T;
  } catch {
    return null;
  }
}

function getDaysSober(dateIso: string | null, nowMs: number): number {
  if (!dateIso) {
    return 0;
  }
  const start = new Date(dateIso);
  if (Number.isNaN(start.getTime())) {
    return 0;
  }
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const now = new Date(nowMs);
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.floor((nowMidnight - startMidnight) / 86_400_000);
  return Math.max(0, diffDays);
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

function locationGroupKeyForMeeting(meeting: MeetingListItem): string {
  return `${meeting.lat?.toFixed(5)},${meeting.lng?.toFixed(5)}|${meeting.address.trim()}`;
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
  const defaultMeetingRadiusMiles =
    typeof extra.meetingRadiusMiles === "number" && Number.isFinite(extra.meetingRadiusMiles)
      ? extra.meetingRadiusMiles
      : 20;

  const authHeader = useMemo(() => `Bearer DEV_${devAuthUserId}`, [devAuthUserId]);
  const [meetingRadiusMiles, setMeetingRadiusMiles] = useState(defaultMeetingRadiusMiles);
  const source = useMemo(
    () =>
      createMeetingsSource({
        feedUrl: meetingFeedUrl,
        apiUrl,
        authHeader,
        radiusMiles: defaultMeetingRadiusMiles,
      }),
    [apiUrl, authHeader, meetingFeedUrl, defaultMeetingRadiusMiles],
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
  const setupCompleteStorage = useMemo(
    () => setupCompleteStorageKey(devAuthUserId),
    [devAuthUserId],
  );
  const sobrietyDateStorage = useMemo(() => sobrietyDateStorageKey(devAuthUserId), [devAuthUserId]);
  const profileStorage = useMemo(() => profileStorageKey(devAuthUserId), [devAuthUserId]);
  const sponsorCallLogStorage = useMemo(
    () => sponsorCallLogStorageKey(devAuthUserId),
    [devAuthUserId],
  );
  const sponsorEnabledAtStorage = useMemo(
    () => sponsorEnabledAtStorageKey(devAuthUserId),
    [devAuthUserId],
  );
  const ninetyDayGoalStorage = useMemo(
    () => ninetyDayGoalStorageKey(devAuthUserId),
    [devAuthUserId],
  );
  const sobrietyMilestoneEventIdsStorage = useMemo(
    () => sobrietyMilestoneEventIdsStorageKey(devAuthUserId),
    [devAuthUserId],
  );
  const sobrietyMilestoneSyncDateStorage = useMemo(
    () => sobrietyMilestoneSyncDateStorageKey(devAuthUserId),
    [devAuthUserId],
  );
  const meetingAttendanceLogStorage = useMemo(
    () => meetingAttendanceLogStorageKey(devAuthUserId),
    [devAuthUserId],
  );

  const [mode, setMode] = useState<RecoveryMode>("A");
  const [homeScreen, setHomeScreen] = useState<HomeScreen>("SETUP");
  const [toolsScreen, setToolsScreen] = useState<ToolsScreen>("HOME");
  const [setupStep, setSetupStep] = useState<SetupStep>(1);
  const [setupComplete, setSetupComplete] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [screen, setScreen] = useState<AppScreen>("LIST");
  const [meetingsViewMode, setMeetingsViewMode] = useState<MeetingsViewMode>("LIST");

  const [locationPermission, setLocationPermission] = useState<LocationPermissionState>("unknown");
  const [currentLocation, setCurrentLocation] = useState<LocationStamp | null>(null);
  const [mapCenter, setMapCenter] = useState<MapBoundaryCenter | null>(null);
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const [mapBoundaryCenter, setMapBoundaryCenter] = useState<MapBoundaryCenter | null>(null);
  const [mapBoundaryRadiusMiles] = useState(20);
  const [mapDraggedOutsideBoundary, setMapDraggedOutsideBoundary] = useState(false);
  const [selectedLocationKey, setSelectedLocationKey] = useState<string | null>(null);

  const [selectedDayOffset, setSelectedDayOffset] = useState(0);
  const [meetingsFormatFilter, setMeetingsFormatFilter] = useState<MeetingsFormatFilter>("ALL");
  const [meetingsTimeFilter, setMeetingsTimeFilter] = useState<MeetingsTimeFilter>("ANY");
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [todayNearbyMeetings, setTodayNearbyMeetings] = useState<MeetingRecord[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [meetingsStatus, setMeetingsStatus] = useState("Meetings not loaded yet.");
  const [meetingsError, setMeetingsError] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingRecord | null>(null);
  const [pendingGeofenceLogMeetingId, setPendingGeofenceLogMeetingId] = useState<string | null>(
    null,
  );
  const [clockTickMs, setClockTickMs] = useState(Date.now());

  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [activeAttendance, setActiveAttendance] = useState<AttendanceRecord | null>(null);
  const [attendanceStatus, setAttendanceStatus] = useState("No active attendance session.");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingAttendanceSelectionPdf, setExportingAttendanceSelectionPdf] = useState(false);
  const [selectedAttendanceIds, setSelectedAttendanceIds] = useState<string[]>([]);
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
  const [sobrietyDateIso, setSobrietyDateIso] = useState<string | null>(null);
  const [sobrietyDateInput, setSobrietyDateInput] = useState("");
  const [sobrietyDateStatus, setSobrietyDateStatus] = useState<string | null>(null);
  const [ninetyDayGoalTarget, setNinetyDayGoalTarget] = useState(DEFAULT_NINETY_DAY_GOAL_TARGET);
  const [ninetyDayGoalInput, setNinetyDayGoalInput] = useState(
    String(DEFAULT_NINETY_DAY_GOAL_TARGET),
  );
  const [milestoneCalendarStatus, setMilestoneCalendarStatus] = useState(
    "Sobriety milestones not synced yet.",
  );
  const [wizardHasSponsor, setWizardHasSponsor] = useState<boolean | null>(null);
  const [wizardWantsReminders, setWizardWantsReminders] = useState<boolean | null>(null);
  const [wizardHasHomeGroup, setWizardHasHomeGroup] = useState<boolean | null>(null);
  const [homeGroupMeetingIds, setHomeGroupMeetingIds] = useState<string[]>([]);
  const [sponsorEnabledAtIso, setSponsorEnabledAtIso] = useState<string | null>(null);
  const [sponsorCallLogs, setSponsorCallLogs] = useState<SponsorCallLog[]>([]);
  const [meetingAttendanceLogs, setMeetingAttendanceLogs] = useState<MeetingAttendanceLog[]>([]);
  const [routinesStore, setRoutinesStore] = useState<RecoveryRoutinesStore>(
    createDefaultRoutinesStore,
  );
  const [routinesStatus, setRoutinesStatus] = useState<string | null>(null);
  const [routineReader, setRoutineReader] = useState<RoutineReaderState | null>(null);
  const [recordingItemId, setRecordingItemId] = useState<string | null>(null);

  const [meetingPlansByDate, setMeetingPlansByDate] = useState<MeetingPlansState>({});
  const [debugTimeCompressionEnabled, setDebugTimeCompressionEnabled] = useState(__DEV__);
  const [bootstrapped, setBootstrapped] = useState(false);

  const arrivalPromptedMeetingRef = useRef<string | null>(null);
  const meetingsByIdRef = useRef<Record<string, MeetingRecord>>({});
  const meetingsShapeLoggedRef = useRef(false);
  const locationIssueRef = useRef<LocationIssue>(null);
  const locationPermissionAlertShownRef = useRef(false);
  const mapRef = useRef<any>(null);
  const meetingsRequestInFlightRef = useRef(false);
  const lastMeetingsRequestKeyRef = useRef<string | null>(null);
  const hasSkippedInitialSelectedDayRefreshRef = useRef(false);
  const bootstrapStartedRef = useRef(false);
  const setupStep4RefreshLocationKeyRef = useRef<string | null>(null);
  const saveSponsorConfigRef = useRef<(overrides?: SaveSponsorConfigOverrides) => Promise<boolean>>(
    async () => false,
  );
  const recordingRef = useRef<any>(null);
  const playbackRef = useRef<any>(null);

  const selectedDay = dayOptions[selectedDayOffset] ?? dayOptions[0];
  const meetingsSearchOrigin = mapBoundaryCenter ?? currentLocation;
  const routineDateKey = useMemo(() => dateKeyForRoutines(new Date(clockTickMs)), [clockTickMs]);

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
  const selectedMeetingPlan =
    selectedMeeting && selectedDayPlan.plans[selectedMeeting.id]
      ? selectedDayPlan.plans[selectedMeeting.id]
      : {
          going: false,
          earlyMinutes: DEFAULT_MEETING_EARLY_MINUTES,
          serviceCommitmentMinutes: DEFAULT_SERVICE_COMMITMENT_MINUTES,
        };
  const selectedMeetingIsHomeGroup =
    selectedMeeting !== null && selectedDayPlan.homeGroupMeetingId === selectedMeeting.id;
  const todayDateKey = useMemo(() => dateKeyForDate(new Date(clockTickMs)), [clockTickMs]);
  const selectedDayIsToday = selectedDay.dateKey === todayDateKey;
  const selectedDayIsPast = selectedDay.date.getTime() < new Date(todayDateKey).getTime();

  const meetingsForDay = useMemo<MeetingListItem[]>(() => {
    const nowLocal = new Date(clockTickMs);
    const nowMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();

    if (selectedDayIsPast) {
      return [];
    }

    const list = meetings
      .filter((meeting) => meeting.dayOfWeek === selectedDay.dayOfWeek)
      .filter((meeting) => {
        if (!selectedDayIsToday) {
          return true;
        }
        return parseMinutesFromHhmm(meeting.startsAtLocal) >= nowMinutes;
      })
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
  }, [
    meetings,
    selectedDay.dayOfWeek,
    currentLocation,
    clockTickMs,
    selectedDayIsPast,
    selectedDayIsToday,
  ]);

  const meetingsTodayUpcoming = useMemo<MeetingListItem[]>(() => {
    const nowLocal = new Date(clockTickMs);
    const todayDay = nowLocal.getDay();
    const nowMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
    const list = todayNearbyMeetings
      .filter((meeting) => meeting.dayOfWeek === todayDay)
      .filter((meeting) => parseMinutesFromHhmm(meeting.startsAtLocal) >= nowMinutes)
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
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }
      return left.name.localeCompare(right.name);
    });

    return list;
  }, [todayNearbyMeetings, currentLocation, clockTickMs]);

  const meetingsForMeetingsScreen = useMemo<MeetingListItem[]>(() => {
    return meetingsForDay.filter((meeting) => {
      const minutes = parseMinutesFromHhmm(meeting.startsAtLocal);

      const formatMatches =
        meetingsFormatFilter === "ALL" ||
        (meetingsFormatFilter === "IN_PERSON" &&
          (meeting.format === "IN_PERSON" || meeting.format === "HYBRID")) ||
        (meetingsFormatFilter === "ONLINE" &&
          (meeting.format === "ONLINE" || meeting.format === "HYBRID"));

      if (!formatMatches) {
        return false;
      }

      if (meetingsTimeFilter === "ANY") {
        return true;
      }
      if (meetingsTimeFilter === "MORNING") {
        return minutes < 12 * 60;
      }
      if (meetingsTimeFilter === "AFTERNOON") {
        return minutes >= 12 * 60 && minutes < 17 * 60;
      }
      return minutes >= 17 * 60;
    });
  }, [meetingsForDay, meetingsFormatFilter, meetingsTimeFilter]);

  const allMeetings = useMemo(() => {
    const byId = new Map<string, MeetingRecord>();
    for (const meeting of meetings) {
      byId.set(meeting.id, meeting);
    }
    for (const meeting of todayNearbyMeetings) {
      if (!byId.has(meeting.id)) {
        byId.set(meeting.id, meeting);
      }
    }
    return Array.from(byId.values());
  }, [meetings, todayNearbyMeetings]);

  const dashboardNextThreeMeetings = useMemo(() => {
    const withinRadius = meetingsTodayUpcoming.filter(
      (meeting) =>
        meeting.distanceMeters !== null && meeting.distanceMeters <= DASHBOARD_NEARBY_RADIUS_METERS,
    );

    if (withinRadius.length > 0) {
      return withinRadius.slice(0, 3);
    }

    // Fallback: if location/coords are unavailable, still show upcoming meetings.
    return meetingsTodayUpcoming.slice(0, 3);
  }, [meetingsTodayUpcoming]);
  const homeGroupCandidateMeetings = useMemo(() => meetingsTodayUpcoming, [meetingsTodayUpcoming]);

  const mapMeetingsForDay = useMemo(
    () =>
      meetingsForDay.filter(
        (meeting) => meeting.format !== "ONLINE" && meeting.lat !== null && meeting.lng !== null,
      ),
    [meetingsForDay],
  );

  const meetingLocationGroups = useMemo<MeetingLocationGroup[]>(() => {
    const byKey = new Map<string, MeetingLocationGroup>();
    for (const meeting of mapMeetingsForDay) {
      const key = locationGroupKeyForMeeting(meeting);
      const existing = byKey.get(key);
      if (existing) {
        existing.meetings.push(meeting);
        continue;
      }
      byKey.set(key, {
        key,
        lat: meeting.lat as number,
        lng: meeting.lng as number,
        address: meeting.address,
        meetings: [meeting],
      });
    }

    return Array.from(byKey.values()).map((group) => ({
      ...group,
      meetings: [...group.meetings].sort(
        (left, right) =>
          parseMinutesFromHhmm(left.startsAtLocal) - parseMinutesFromHhmm(right.startsAtLocal),
      ),
    }));
  }, [mapMeetingsForDay]);

  const selectedLocationGroup = useMemo(
    () => meetingLocationGroups.find((group) => group.key === selectedLocationKey) ?? null,
    [meetingLocationGroups, selectedLocationKey],
  );

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
  }, [
    sponsorEnabled,
    sponsorActive,
    sponsorCallTimeLocalHhmm,
    sponsorRepeatUnit,
    sponsorRepeatInterval,
    sponsorRepeatDaysSorted,
  ]);

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

  const daysSober = useMemo(
    () => getDaysSober(sobrietyDateIso, clockTickMs),
    [sobrietyDateIso, clockTickMs],
  );
  const soberInsight = useMemo(() => getInsightForDay(daysSober), [daysSober]);

  const homeGroupUpcoming = useMemo(() => {
    if (homeGroupMeetingIds.length === 0) {
      return null;
    }

    const nowLocal = new Date(clockTickMs);
    const nowMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
    const todayDay = nowLocal.getDay();

    const candidates = allMeetings
      .filter((meeting) => homeGroupMeetingIds.includes(meeting.id))
      .map((meeting) => {
        const dayDistance = (meeting.dayOfWeek - todayDay + 7) % 7;
        const isToday = dayDistance === 0;
        const meetingMinutes = parseMinutesFromHhmm(meeting.startsAtLocal);
        const validToday = isToday ? meetingMinutes >= nowMinutes : true;
        const effectiveDayDistance = isToday && !validToday ? 7 : dayDistance;
        return {
          meeting,
          effectiveDayDistance,
          meetingMinutes,
        };
      })
      .sort((left, right) => {
        if (left.effectiveDayDistance !== right.effectiveDayDistance) {
          return left.effectiveDayDistance - right.effectiveDayDistance;
        }
        return left.meetingMinutes - right.meetingMinutes;
      });

    return candidates[0]?.meeting ?? null;
  }, [homeGroupMeetingIds, allMeetings, clockTickMs]);

  const meetingsAttendedInNinetyDays = useMemo(() => {
    if (!sobrietyDateIso) {
      return 0;
    }
    const sobrietyStart = new Date(sobrietyDateIso).getTime();
    if (Number.isNaN(sobrietyStart)) {
      return 0;
    }
    const windowEnd = sobrietyStart + 90 * 86_400_000;
    return meetingAttendanceLogs.filter((entry) => {
      const at = new Date(entry.atIso).getTime();
      return at >= sobrietyStart && at <= windowEnd;
    }).length;
  }, [sobrietyDateIso, meetingAttendanceLogs]);

  const ninetyDayProgressPct = useMemo(
    () => Math.min(100, Math.round((meetingsAttendedInNinetyDays / ninetyDayGoalTarget) * 100)),
    [meetingsAttendedInNinetyDays, ninetyDayGoalTarget],
  );

  const sponsorAdherence = useMemo(() => {
    if (!sponsorEnabledAtIso) {
      return { days: 0, completed: 0, percent: 0 };
    }
    const since = new Date(sponsorEnabledAtIso).getTime();
    if (Number.isNaN(since)) {
      return { days: 0, completed: 0, percent: 0 };
    }
    const days = Math.max(1, Math.floor((clockTickMs - since) / 86_400_000) + 1);
    const completed = sponsorCallLogs.filter((entry) => entry.success).length;
    const percent = Math.min(100, (completed / days) * 100);
    return { days, completed, percent };
  }, [sponsorEnabledAtIso, sponsorCallLogs, clockTickMs]);

  const meetingsLast7Bars = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const entry of meetingAttendanceLogs) {
      const key = dateKeyForDate(new Date(entry.atIso));
      byDate.set(key, (byDate.get(key) ?? 0) + 1);
    }
    const bars: number[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(clockTickMs - offset * 86_400_000);
      bars.push(byDate.get(dateKeyForDate(date)) ?? 0);
    }
    return bars;
  }, [meetingAttendanceLogs, clockTickMs]);

  const sponsorLast14Bars = useMemo(() => {
    const successByDate = new Map<string, boolean>();
    for (const entry of sponsorCallLogs) {
      if (!entry.success) {
        continue;
      }
      const key = dateKeyForDate(new Date(entry.atIso));
      successByDate.set(key, true);
    }
    const bars: boolean[] = [];
    for (let offset = 13; offset >= 0; offset -= 1) {
      const date = new Date(clockTickMs - offset * 86_400_000);
      bars.push(successByDate.get(dateKeyForDate(date)) === true);
    }
    return bars;
  }, [sponsorCallLogs, clockTickMs]);

  const morningRoutineDayState = useMemo(
    () => getMorningDayState(routinesStore, routineDateKey),
    [routinesStore, routineDateKey],
  );

  const nightlyInventoryDayState = useMemo(
    () => getNightlyDayState(routinesStore, routineDateKey),
    [routinesStore, routineDateKey],
  );

  const morningRoutineStats = useMemo(
    () => computeMorningRoutineStats(routinesStore, new Date(clockTickMs)),
    [routinesStore, clockTickMs],
  );

  const nightlyInventoryStats = useMemo(
    () => computeNightlyInventoryStats(routinesStore, new Date(clockTickMs)),
    [routinesStore, clockTickMs],
  );

  const routineInsights = useMemo(
    () => computeRoutineInsights(routinesStore, new Date(clockTickMs)),
    [routinesStore, clockTickMs],
  );

  const openSessionDurationSeconds = useMemo(() => {
    if (!activeAttendance || activeAttendance.endAt) {
      return activeAttendance?.durationSeconds ?? null;
    }
    return Math.max(
      0,
      Math.floor((sessionNowMs - new Date(activeAttendance.startAt).getTime()) / 1000),
    );
  }, [activeAttendance, sessionNowMs]);

  const readCurrentLocation = useCallback(
    async (requestPermission: boolean): Promise<LocationStamp | null> => {
      try {
        const currentPermission = await Location.getForegroundPermissionsAsync();
        const permission = currentPermission.granted
          ? currentPermission
          : requestPermission
            ? await Location.requestForegroundPermissionsAsync()
            : currentPermission;

        if (!permission.granted) {
          setLocationPermission("denied");
          locationIssueRef.current = "permission_denied";
          return null;
        }

        setLocationPermission("granted");

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const next: LocationStamp = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: position.coords.accuracy ?? null,
        };
        locationIssueRef.current = null;
        setCurrentLocation(next);
        return next;
      } catch (error) {
        if (
          error instanceof Error &&
          /location provider|unavailable|timeout/i.test(error.message)
        ) {
          setLocationPermission("granted");
          locationIssueRef.current = "position_unavailable";
          return null;
        }

        setLocationPermission("unavailable");
        locationIssueRef.current = "unavailable";
        return null;
      }
    },
    [],
  );

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
    const position = await readCurrentLocation(true);
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

  const persistSponsorCallLogs = useCallback(
    async (nextLogs: SponsorCallLog[]) => {
      try {
        await AsyncStorage.setItem(sponsorCallLogStorage, JSON.stringify(nextLogs));
      } catch {
        setNotificationStatus("Failed to persist sponsor call activity.");
      }
    },
    [sponsorCallLogStorage],
  );

  const persistMeetingAttendanceLogs = useCallback(
    async (nextLogs: MeetingAttendanceLog[]) => {
      try {
        await AsyncStorage.setItem(meetingAttendanceLogStorage, JSON.stringify(nextLogs));
      } catch {
        setAttendanceStatus("Failed to persist meeting attendance activity.");
      }
    },
    [meetingAttendanceLogStorage],
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

  const appendSponsorCallLog = useCallback(
    (entry: Omit<SponsorCallLog, "id" | "atIso">) => {
      setSponsorCallLogs((previous) => {
        const next = [
          {
            id: createId("sponsor-call"),
            atIso: new Date().toISOString(),
            ...entry,
          },
          ...previous,
        ].slice(0, 500);
        void persistSponsorCallLogs(next);
        return next;
      });
    },
    [persistSponsorCallLogs],
  );

  const appendMeetingAttendanceLog = useCallback(
    (entry: Omit<MeetingAttendanceLog, "id" | "atIso">) => {
      setMeetingAttendanceLogs((previous) => {
        const next = [
          {
            id: createId("meeting-attendance"),
            atIso: new Date().toISOString(),
            ...entry,
          },
          ...previous,
        ].slice(0, 1000);
        void persistMeetingAttendanceLogs(next);
        return next;
      });
    },
    [persistMeetingAttendanceLogs],
  );

  const updateRoutinesStore = useCallback(
    (
      updater: (current: RecoveryRoutinesStore) => RecoveryRoutinesStore,
      statusMessage?: string | null,
    ) => {
      setRoutinesStore((current) => {
        const next = updater(current);
        void saveRoutinesStore(devAuthUserId, next).catch(() => {
          setRoutinesStatus("Failed to persist routines data.");
        });
        return next;
      });
      if (statusMessage !== undefined) {
        setRoutinesStatus(statusMessage);
      }
    },
    [devAuthUserId],
  );

  const updateMorningTemplate = useCallback(
    (
      updater: (
        template: RecoveryRoutinesStore["morningTemplate"],
      ) => RecoveryRoutinesStore["morningTemplate"],
    ) => {
      updateRoutinesStore((store) => ({
        ...store,
        morningTemplate: updater(store.morningTemplate),
      }));
    },
    [updateRoutinesStore],
  );

  const updateMorningDayState = useCallback(
    (
      updater: (
        day: ReturnType<typeof getMorningDayState>,
      ) => ReturnType<typeof getMorningDayState>,
      statusMessage?: string | null,
    ) => {
      updateRoutinesStore((store) => {
        const currentDay = getMorningDayState(store, routineDateKey);
        const nextDay = updater(currentDay);
        return {
          ...store,
          morningByDate: {
            ...store.morningByDate,
            [routineDateKey]: nextDay,
          },
        };
      }, statusMessage);
    },
    [routineDateKey, updateRoutinesStore],
  );

  const updateNightlyDayState = useCallback(
    (
      updater: (day: NightlyInventoryDayState) => NightlyInventoryDayState,
      statusMessage?: string | null,
    ) => {
      updateRoutinesStore((store) => {
        const currentDay = getNightlyDayState(store, routineDateKey);
        const nextDay = updater(currentDay);
        return {
          ...store,
          nightlyByDate: {
            ...store.nightlyByDate,
            [routineDateKey]: nextDay,
          },
        };
      }, statusMessage);
    },
    [routineDateKey, updateRoutinesStore],
  );

  const speakRoutineText = useCallback((text: string) => {
    const nextText = text.trim();
    if (!nextText) {
      setRoutinesStatus("No text available to read aloud.");
      return;
    }

    try {
      const speechModule = loadOptionalModule<{
        stop?: () => void;
        speak?: (value: string, options?: Record<string, unknown>) => void;
      }>("expo-speech");
      if (!speechModule) {
        setRoutinesStatus("Text-to-speech unavailable. Install expo-speech.");
        return;
      }
      speechModule.stop?.();
      speechModule.speak?.(nextText, { rate: 0.95, pitch: 1.0 });
      setRoutinesStatus("Reading aloud.");
    } catch {
      setRoutinesStatus("Text-to-speech unavailable. Install expo-speech.");
    }
  }, []);

  const recordRoutineItem = useCallback(
    async (itemId: string) => {
      try {
        const avModule = loadOptionalModule<{
          Audio?: {
            requestPermissionsAsync: () => Promise<{ granted: boolean }>;
            setAudioModeAsync: (input: Record<string, unknown>) => Promise<void>;
            Recording: new () => {
              prepareToRecordAsync: (options: unknown) => Promise<void>;
              startAsync: () => Promise<void>;
              stopAndUnloadAsync: () => Promise<void>;
              getURI: () => string | null;
            };
            RecordingOptionsPresets?: { HIGH_QUALITY?: unknown };
            Sound?: {
              createAsync: (source: { uri: string }) => Promise<{
                sound: { unloadAsync: () => Promise<void>; playAsync: () => Promise<void> };
              }>;
            };
          };
        }>("expo-av");

        const audio = avModule?.Audio;
        if (!audio) {
          setRoutinesStatus("Audio recording unavailable. Install expo-av.");
          return;
        }

        if (recordingRef.current && recordingItemId === itemId) {
          const recording = recordingRef.current as {
            stopAndUnloadAsync: () => Promise<void>;
            getURI: () => string | null;
          };
          await recording.stopAndUnloadAsync();
          const uri = recording.getURI();
          recordingRef.current = null;
          setRecordingItemId(null);
          if (uri) {
            updateMorningDayState(
              (day) => ({
                ...day,
                audioRefs: { ...day.audioRefs, [itemId]: uri },
              }),
              "Recording saved.",
            );
          } else {
            setRoutinesStatus("Recording finished, but no audio file was produced.");
          }
          return;
        }

        if (recordingRef.current) {
          const recording = recordingRef.current as {
            stopAndUnloadAsync: () => Promise<void>;
          };
          await recording.stopAndUnloadAsync();
          recordingRef.current = null;
          setRecordingItemId(null);
        }

        const permission = await audio.requestPermissionsAsync();
        if (!permission.granted) {
          setRoutinesStatus("Microphone permission denied.");
          return;
        }

        await audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });

        const recording = new audio.Recording();
        await recording.prepareToRecordAsync(
          audio.RecordingOptionsPresets?.HIGH_QUALITY ?? undefined,
        );
        await recording.startAsync();
        recordingRef.current = recording;
        setRecordingItemId(itemId);
        setRoutinesStatus("Recording... tap Record again to stop.");
      } catch {
        setRecordingItemId(null);
        recordingRef.current = null;
        setRoutinesStatus("Unable to record audio on this device.");
      }
    },
    [recordingItemId, updateMorningDayState],
  );

  const playRoutineItemAudio = useCallback(
    async (itemId: string) => {
      const uri = morningRoutineDayState.audioRefs[itemId];
      if (!uri) {
        setRoutinesStatus("No recording found for this item.");
        return;
      }
      try {
        const avModule = loadOptionalModule<{
          Audio?: {
            Sound?: {
              createAsync: (source: { uri: string }) => Promise<{
                sound: {
                  unloadAsync: () => Promise<void>;
                  playAsync: () => Promise<void>;
                  setOnPlaybackStatusUpdate: (handler: (status: any) => void) => void;
                };
              }>;
            };
          };
        }>("expo-av");
        const soundApi = avModule?.Audio?.Sound;
        if (!soundApi) {
          setRoutinesStatus("Audio playback unavailable. Install expo-av.");
          return;
        }

        if (playbackRef.current) {
          try {
            await playbackRef.current.unloadAsync();
          } catch {
            // ignore stale sound
          }
          playbackRef.current = null;
        }

        const created = await soundApi.createAsync({ uri });
        playbackRef.current = created.sound;
        created.sound.setOnPlaybackStatusUpdate((status) => {
          if (status?.didJustFinish) {
            void created.sound.unloadAsync();
            if (playbackRef.current === created.sound) {
              playbackRef.current = null;
            }
          }
        });
        await created.sound.playAsync();
        setRoutinesStatus("Playing recording.");
      } catch {
        setRoutinesStatus("Unable to play recording.");
      }
    },
    [morningRoutineDayState.audioRefs],
  );

  const openRoutineReader = useCallback((title: string, url: string | null) => {
    setRoutineReader({ title, url });
    setToolsScreen("READER");
  }, []);

  const dailyReflectionsReadUrl = useMemo(() => {
    const configuredLink = routinesStore.morningTemplate.dailyReflectionsLink.trim();
    return configuredLink.length > 0 ? configuredLink : "https://www.aa.org/daily-reflections";
  }, [routinesStore.morningTemplate.dailyReflectionsLink]);

  const dailyReflectionsListenUrl = useMemo(
    () => buildDailyReflectionsListenUrl(routineDateKey),
    [routineDateKey],
  );

  const openRoutineReaderLink = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      setRoutinesStatus("Unable to open this link.");
    }
  }, []);

  const openDailyReflectionsRead = useCallback(() => {
    openRoutineReader("Daily Reflections", dailyReflectionsReadUrl);
  }, [dailyReflectionsReadUrl, openRoutineReader]);

  const openDailyReflectionsListen = useCallback(async () => {
    await openRoutineReaderLink(dailyReflectionsListenUrl);
  }, [dailyReflectionsListenUrl, openRoutineReaderLink]);

  const exportMorningRoutineForToday = useCallback(async () => {
    try {
      const template = routinesStore.morningTemplate;
      const dayState = morningRoutineDayState;
      const completedItems = template.items
        .filter((item) => dayState.completedByItemId[item.id])
        .map((item) => ({
          title: item.title,
          completedAt: dayState.completedByItemId[item.id] ?? null,
        }));
      const incompleteItems = template.items
        .filter((item) => !dayState.completedByItemId[item.id])
        .map((item) => item.title);
      const uri = await exportMorningRoutinePdf({
        userLabel: devUserDisplayName,
        dateKey: routineDateKey,
        completedItems,
        incompleteItems,
        sponsorSuggestions: template.sponsorSuggestions,
        dailyReflectionsLink: template.dailyReflectionsLink,
        dailyReflectionsText: template.dailyReflectionsText,
        notes: dayState.notes,
      });
      setRoutinesStatus(`Morning routine PDF exported: ${uri}`);
    } catch (error) {
      setRoutinesStatus(`Morning PDF export failed: ${formatError(error)}`);
    }
  }, [routinesStore.morningTemplate, morningRoutineDayState, devUserDisplayName, routineDateKey]);

  const exportNightlyInventoryForToday = useCallback(async () => {
    try {
      const dayState = nightlyInventoryDayState;
      const uri = await exportNightlyInventoryPdf({
        userLabel: devUserDisplayName,
        dateKey: routineDateKey,
        prompt: dayState.prompt,
        resentful: dayState.resentful.map((entry) => entry.text),
        selfish: dayState.selfish.map((entry) => entry.text),
        dishonest: dayState.dishonest.map((entry) => entry.text),
        afraid: dayState.afraid.map((entry) => entry.text),
        apology: dayState.apology.map((entry) => entry.text),
        notes: dayState.notes,
        completedAt: dayState.completedAt,
      });
      setRoutinesStatus(`Nightly inventory PDF exported: ${uri}`);
    } catch (error) {
      setRoutinesStatus(`Nightly PDF export failed: ${formatError(error)}`);
    }
  }, [nightlyInventoryDayState, devUserDisplayName, routineDateKey]);

  const textNightlyToSponsor = useCallback(async () => {
    const digits = normalizePhoneDigits(sponsorPhoneDigits);
    if (!digits) {
      setRoutinesStatus("Sponsor phone not set. Configure sponsor in Recovery Settings.");
      return;
    }

    const dayState = nightlyInventoryDayState;
    const summarize = (label: string, values: Array<{ text: string }>) =>
      `${label}: ${values.length > 0 ? values.map((entry) => entry.text).join("; ") : "None"}`;
    const body = [
      `Nightly Inventory ${routineDateKey}`,
      summarize("Resentful", dayState.resentful),
      summarize("Selfish", dayState.selfish),
      summarize("Dishonest", dayState.dishonest),
      summarize("Afraid", dayState.afraid),
      summarize("Apology", dayState.apology),
      `Notes: ${dayState.notes || "None"}`,
    ].join("\n");

    const separator = Platform.OS === "ios" ? "&" : "?";
    const url = `sms:${digits}${separator}body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
      setRoutinesStatus("Opened SMS draft for sponsor.");
    } catch {
      setRoutinesStatus("Unable to open SMS on this device.");
    }
  }, [sponsorPhoneDigits, nightlyInventoryDayState, routineDateKey]);

  const updateNightlyCategoryEntry = useCallback(
    (category: RoutineInventoryCategory, id: string, value: string) => {
      updateNightlyDayState((day) => ({
        ...day,
        [category]: day[category].map((entry) =>
          entry.id === id ? { ...entry, text: value } : entry,
        ),
      }));
    },
    [updateNightlyDayState],
  );

  const refreshMeetings = useCallback(
    async (options?: { location?: LocationStamp | null }) => {
      try {
        let location: LocationStamp | null = options?.location ?? null;
        if (options?.location === undefined && locationPermission === "granted") {
          location = await readCurrentLocation(false);
        }

        const requestKey = [
          selectedDay.dayOfWeek,
          meetingRadiusMiles,
          location ? location.lat.toFixed(4) : "na",
          location ? location.lng.toFixed(4) : "na",
        ].join("|");

        if (
          meetingsRequestInFlightRef.current &&
          lastMeetingsRequestKeyRef.current === requestKey
        ) {
          return;
        }

        meetingsRequestInFlightRef.current = true;
        lastMeetingsRequestKeyRef.current = requestKey;
        setLoadingMeetings(true);
        setMeetingsError(null);

        const todayDayOfWeek = new Date().getDay();
        const requestParams = {
          lat: location?.lat,
          lng: location?.lng,
          radiusMiles: meetingRadiusMiles,
        };

        const selectedDayResult = await source.listMeetings({
          dayOfWeek: selectedDay.dayOfWeek,
          ...requestParams,
        });

        let todayResultMeetings = selectedDayResult.meetings;
        if (selectedDay.dayOfWeek !== todayDayOfWeek) {
          const todayResult = await source.listMeetings({
            dayOfWeek: todayDayOfWeek,
            ...requestParams,
          });
          todayResultMeetings = todayResult.meetings;
        }

        setMeetings(selectedDayResult.meetings);
        setTodayNearbyMeetings(todayResultMeetings);

        if (!meetingsShapeLoggedRef.current && selectedDayResult.meetings.length > 0) {
          meetingsShapeLoggedRef.current = true;
          console.log("[meetings] normalized sample", selectedDayResult.meetings[0]);
        }

        const warningSuffix = selectedDayResult.warning ? ` (${selectedDayResult.warning})` : "";
        setMeetingsStatus(
          `Loaded ${selectedDayResult.meetings.length} meetings from ${selectedDayResult.source}${warningSuffix}.`,
        );
      } catch (error) {
        setMeetingsError(formatApiErrorWithHint(formatError(error)));
        setMeetingsStatus("Unable to load meetings.");
      } finally {
        meetingsRequestInFlightRef.current = false;
        setLoadingMeetings(false);
      }
    },
    [
      locationPermission,
      readCurrentLocation,
      selectedDay.dayOfWeek,
      source,
      meetingRadiusMiles,
      formatApiErrorWithHint,
    ],
  );

  const handleModeSelect = useCallback(
    (nextMode: RecoveryMode) => {
      setMode(nextMode);
      if (nextMode === "A") {
        setHomeScreen(setupComplete ? "DASHBOARD" : "SETUP");
        if (!setupComplete) {
          setSetupStep(1);
        } else {
          setSelectedDayOffset(0);
        }
        setScreen("LIST");
        setSelectedMeeting(null);
        void refreshMeetings();
      } else {
        setHomeScreen("SETTINGS");
      }
    },
    [refreshMeetings, setupComplete],
  );

  const openSettingsHub = useCallback(() => {
    setMode("A");
    setHomeScreen("SETTINGS");
    setScreen("LIST");
    setSelectedMeeting(null);
  }, []);

  const openAttendanceHub = useCallback(() => {
    setHomeScreen("ATTENDANCE");
    setToolsScreen("HOME");
    setScreen("LIST");
    setSelectedMeeting(null);
  }, []);

  const openToolsHub = useCallback(() => {
    setHomeScreen("TOOLS");
    setToolsScreen("HOME");
    setScreen("LIST");
    setSelectedMeeting(null);
  }, []);

  const openMorningRoutine = useCallback(() => {
    setHomeScreen("TOOLS");
    setToolsScreen("MORNING");
  }, []);

  const openNightlyInventory = useCallback(() => {
    setHomeScreen("TOOLS");
    setToolsScreen("NIGHTLY");
  }, []);

  const openDashboard = useCallback(() => {
    setHomeScreen("DASHBOARD");
    setToolsScreen("HOME");
    setSelectedDayOffset(0);
    setScreen("LIST");
    setSelectedMeeting(null);
    void refreshMeetings();
  }, [refreshMeetings]);

  const openMeetingsHub = useCallback(() => {
    setHomeScreen("MEETINGS");
    setToolsScreen("HOME");
    setScreen("LIST");
    setSelectedMeeting(null);
    setSelectedDayOffset(0);
  }, []);

  const openSoberHousingSettings = useCallback(() => {
    setMode("B");
    setHomeScreen("SETTINGS");
    setToolsScreen("HOME");
    setScreen("LIST");
    setSelectedMeeting(null);
  }, []);

  const openProbationParoleSettings = useCallback(() => {
    setMode("C");
    setHomeScreen("SETTINGS");
    setToolsScreen("HOME");
    setScreen("LIST");
    setSelectedMeeting(null);
  }, []);

  const searchMeetingsFromDashboard = useCallback(async () => {
    setHomeScreen("MEETINGS");
    setScreen("LIST");
    setMeetingsViewMode("LIST");
    setSelectedMeeting(null);
    setSelectedDayOffset(0);

    const searchCenter = mapCenter ?? mapBoundaryCenter;
    if (searchCenter) {
      setMapBoundaryCenter(searchCenter);
      await refreshMeetings({
        location: { lat: searchCenter.lat, lng: searchCenter.lng, accuracyM: null },
      });
      return;
    }

    const location = currentLocation ?? (await requestLocationPermission());
    if (location) {
      await refreshMeetings({ location });
      return;
    }

    await refreshMeetings();
  }, [mapCenter, mapBoundaryCenter, currentLocation, requestLocationPermission, refreshMeetings]);

  const restartSetup = useCallback(() => {
    setMode("A");
    setSetupComplete(false);
    setHomeScreen("SETUP");
    setSetupStep(1);
    setSetupError(null);
    setScreen("LIST");
    setSelectedMeeting(null);
    setSelectedDayOffset(0);
    void refreshMeetings();
  }, [refreshMeetings]);

  const nextSetupStep = useCallback(async () => {
    setSetupError(null);

    if (setupStep === 1) {
      const parsedDateIso = parseDdMmYyyyToIso(sobrietyDateInput);
      if (!parsedDateIso) {
        setSetupError("Enter sobriety date as MM/DD/YYYY.");
        return;
      }
      const parsedGoal = parseGoalTargetInput(ninetyDayGoalInput);
      if (!parsedGoal) {
        setSetupError("Enter a valid 90-day meeting goal (1 or higher).");
        return;
      }
      setSobrietyDateIso(parsedDateIso);
      setNinetyDayGoalTarget(parsedGoal);
      setNinetyDayGoalInput(String(parsedGoal));
      setSetupStep(2);
      return;
    }

    if (setupStep === 2) {
      if (wizardHasSponsor === null) {
        setSetupError("Choose whether you have a sponsor.");
        return;
      }
      if (wizardHasSponsor) {
        if (!normalizedSponsorName || !sponsorPhoneE164) {
          setSetupError("Enter sponsor name and phone.");
          return;
        }
        setWizardWantsReminders((current) => (current === null ? true : current));
        setSponsorEnabled(true);
      } else {
        setSponsorEnabled(false);
        setSponsorActive(false);
      }
      setSetupStep(3);
      return;
    }

    if (setupStep === 3) {
      if (wizardHasSponsor) {
        const remindersEnabled = wizardWantsReminders ?? true;
        if (wizardWantsReminders === null) {
          setWizardWantsReminders(remindersEnabled);
        }
        setSponsorEnabled(true);
        setSponsorActive(remindersEnabled);
        setSponsorEnabledAtIso((current) => current ?? new Date().toISOString());
        void (async () => {
          const saved = await saveSponsorConfigRef.current({
            sponsorEnabled: true,
            sponsorActive: remindersEnabled,
          });
          if (!saved) {
            setSponsorStatus("Sponsor auto-save failed. You can continue and retry from Settings.");
          }
        })();
      } else {
        setWizardWantsReminders(false);
      }
      setSetupStep(4);
      return;
    }

    if (setupStep === 4) {
      if (wizardHasHomeGroup === null) {
        setSetupError("Choose whether you have a home group.");
        return;
      }
      if (wizardHasHomeGroup && homeGroupMeetingIds.length === 0) {
        setSetupError("Select a home group meeting.");
        return;
      }
      setSetupStep(5);
    }
  }, [
    setupStep,
    sobrietyDateInput,
    ninetyDayGoalInput,
    wizardHasSponsor,
    normalizedSponsorName,
    sponsorPhoneE164,
    wizardWantsReminders,
    wizardHasHomeGroup,
    homeGroupMeetingIds.length,
  ]);

  const previousSetupStep = useCallback(() => {
    setSetupError(null);
    setSetupStep((current) => (current <= 1 ? 1 : ((current - 1) as SetupStep)));
  }, []);

  const updateMapCenter = useCallback((center: MapBoundaryCenter) => {
    setMapCenter((previous) => (coordinatesEqual(previous, center) ? previous : center));
    setMapRegion((previous: Region | null) => {
      const latitudeDelta = previous?.latitudeDelta ?? DEFAULT_MAP_LATITUDE_DELTA;
      const longitudeDelta = previous?.longitudeDelta ?? DEFAULT_MAP_LONGITUDE_DELTA;
      if (
        previous &&
        Math.abs(previous.latitude - center.lat) < 1e-6 &&
        Math.abs(previous.longitude - center.lng) < 1e-6 &&
        Math.abs(previous.latitudeDelta - latitudeDelta) < 1e-9 &&
        Math.abs(previous.longitudeDelta - longitudeDelta) < 1e-9
      ) {
        return previous;
      }
      return {
        latitude: center.lat,
        longitude: center.lng,
        latitudeDelta,
        longitudeDelta,
      };
    });
  }, []);

  const onMapRegionChangeComplete = useCallback(
    (nextRegion: Region) => {
      const center = { lat: nextRegion.latitude, lng: nextRegion.longitude };
      setMapCenter(center);
      setMapRegion(nextRegion);

      if (!mapBoundaryCenter) {
        return;
      }

      const boundaryDistanceMeters = distanceMetersBetween(
        center.lat,
        center.lng,
        mapBoundaryCenter.lat,
        mapBoundaryCenter.lng,
      );
      const boundaryMeters = mapBoundaryRadiusMiles * 1609.344;
      setMapDraggedOutsideBoundary(boundaryDistanceMeters > boundaryMeters * 0.6);
    },
    [mapBoundaryCenter, mapBoundaryRadiusMiles],
  );

  const returnToBoundary = useCallback(() => {
    if (!mapBoundaryCenter) {
      return;
    }

    const targetRegion: Region = {
      latitude: mapBoundaryCenter.lat,
      longitude: mapBoundaryCenter.lng,
      latitudeDelta: mapRegion?.latitudeDelta ?? DEFAULT_MAP_LATITUDE_DELTA,
      longitudeDelta: mapRegion?.longitudeDelta ?? DEFAULT_MAP_LONGITUDE_DELTA,
    };
    setMapRegion(targetRegion);
    setMapCenter({ lat: targetRegion.latitude, lng: targetRegion.longitude });
    setMapDraggedOutsideBoundary(false);
    mapRef.current?.animateToRegion?.(targetRegion, 250);
  }, [mapBoundaryCenter, mapRegion]);

  const searchThisArea = useCallback(async () => {
    if (!mapCenter) {
      return;
    }

    const location: LocationStamp = { lat: mapCenter.lat, lng: mapCenter.lng, accuracyM: null };
    setMapBoundaryCenter(mapCenter);
    await refreshMeetings({ location });
    setMapDraggedOutsideBoundary(false);
  }, [mapCenter, refreshMeetings]);

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
      setSponsorEnabled(true);
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

  const openPhoneCall = useCallback(
    async (phoneE164?: string | null, source: "button" | "notification" = "button") => {
      const fallbackE164 = toE164FromUsTenDigit(sponsorPhoneDigits);
      const resolvedInput = phoneE164 ?? fallbackE164;
      const digits = normalizePhoneDigits(resolvedInput ?? "");

      if (!digits) {
        setSponsorStatus("Enter sponsor name and phone to enable calling.");
        appendSponsorCallLog({ sponsorPhoneE164: resolvedInput ?? null, source, success: false });
        return;
      }

      const normalizedE164 = toE164FromUsTenDigit(digits) ?? resolvedInput ?? null;
      const primaryUrl = Platform.OS === "ios" ? `telprompt:${digits}` : `tel:${digits}`;
      const fallbackUrl = `tel:${digits}`;

      try {
        await Linking.openURL(primaryUrl);
        setSponsorStatus(null);
        appendSponsorCallLog({ sponsorPhoneE164: normalizedE164, source, success: true });
        return;
      } catch {
        try {
          await Linking.openURL(fallbackUrl);
          setSponsorStatus(null);
          appendSponsorCallLog({ sponsorPhoneE164: normalizedE164, source, success: true });
          return;
        } catch {
          setSponsorStatus("Calling is not supported on this device (simulator).");
          appendSponsorCallLog({ sponsorPhoneE164: normalizedE164, source, success: false });
        }
      }
    },
    [appendSponsorCallLog, sponsorPhoneDigits],
  );

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

  const syncSobrietyMilestoneCalendarEvents = useCallback(
    async (reason: string) => {
      try {
        if (Platform.OS !== "ios") {
          setMilestoneCalendarStatus("Sobriety milestones are iOS-only in this MVP.");
          return;
        }

        const hasPermission = await ensureCalendarPermission();
        if (!hasPermission) {
          setMilestoneCalendarStatus("Milestone calendar permission denied.");
          return;
        }

        const calendarId = await findWritableCalendarId();
        if (!calendarId) {
          setMilestoneCalendarStatus("No writable calendar found for milestones.");
          return;
        }

        const [storedIdsRaw, storedSyncDate] = await Promise.all([
          AsyncStorage.getItem(sobrietyMilestoneEventIdsStorage),
          AsyncStorage.getItem(sobrietyMilestoneSyncDateStorage),
        ]);
        let storedIds: string[] = [];
        if (storedIdsRaw) {
          try {
            const parsed = JSON.parse(storedIdsRaw) as unknown;
            if (Array.isArray(parsed)) {
              storedIds = parsed.filter(
                (entry): entry is string => typeof entry === "string" && entry.length > 0,
              );
            }
          } catch {
            storedIds = [];
          }
        }

        if (storedSyncDate === sobrietyDateIso && storedIds.length > 0) {
          setMilestoneCalendarStatus("Sobriety milestones unchanged.");
          return;
        }

        if (storedIds.length > 0) {
          await Promise.all(
            storedIds.map(async (id) => {
              try {
                await Calendar.deleteEventAsync(id);
              } catch {
                // ignore stale/removed events
              }
            }),
          );
        }

        if (!sobrietyDateIso) {
          await Promise.all([
            AsyncStorage.removeItem(sobrietyMilestoneEventIdsStorage),
            AsyncStorage.removeItem(sobrietyMilestoneSyncDateStorage),
          ]);
          setMilestoneCalendarStatus("Sobriety date cleared. Milestone events removed.");
          return;
        }

        const milestones = buildSobrietyMilestones(sobrietyDateIso);
        const createdIds: string[] = [];
        const sobrietyDateLabel = formatIsoToDdMmYyyy(sobrietyDateIso);

        for (const milestone of milestones) {
          const eventId = await Calendar.createEventAsync(calendarId, {
            title: milestone.title,
            notes: `Sobriety milestone from start date ${sobrietyDateLabel}.`,
            startDate: milestone.at,
            endDate: new Date(milestone.at.getTime() + 60 * 60 * 1000),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
          createdIds.push(eventId);
        }

        await Promise.all([
          AsyncStorage.setItem(sobrietyMilestoneEventIdsStorage, JSON.stringify(createdIds)),
          AsyncStorage.setItem(sobrietyMilestoneSyncDateStorage, sobrietyDateIso),
        ]);

        console.log("[calendar] sobriety milestones sync", {
          reason,
          sobrietyDateIso,
          createdIds,
        });
        setMilestoneCalendarStatus(`Synced ${createdIds.length} sobriety milestone events.`);
      } catch {
        setMilestoneCalendarStatus("Sobriety milestone calendar sync failed.");
      }
    },
    [
      sobrietyDateIso,
      ensureCalendarPermission,
      findWritableCalendarId,
      sobrietyMilestoneEventIdsStorage,
      sobrietyMilestoneSyncDateStorage,
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

  const saveSponsorConfig = useCallback(
    async (overrides?: SaveSponsorConfigOverrides): Promise<boolean> => {
      const effectiveSponsorEnabled = overrides?.sponsorEnabled ?? sponsorEnabled;
      const effectiveSponsorActive = overrides?.sponsorActive ?? sponsorActive;
      const effectivePayloadActive = effectiveSponsorEnabled && effectiveSponsorActive;

      if (!effectiveSponsorEnabled) {
        setSponsorStatus("Sponsor is disabled.");
        return false;
      }

      if (!normalizedSponsorName) {
        setSponsorStatus("Sponsor name is required.");
        return false;
      }

      if (!sponsorPhoneE164) {
        setSponsorStatus("Sponsor phone must be a valid 10-digit US number.");
        return false;
      }

      if (sponsorRepeatUnit === "WEEKLY" && sponsorRepeatDaysSorted.length === 0) {
        setSponsorStatus("Select at least one weekday for weekly reminders.");
        return false;
      }

      const payload: SponsorConfigPayload = {
        sponsorName: normalizedSponsorName,
        sponsorPhoneE164,
        callTimeLocalHhmm: sponsorCallTimeLocalHhmm,
        repeatUnit: sponsorRepeatUnit,
        repeatInterval: sponsorRepeatInterval,
        repeatDays: sponsorRepeatDaysSorted,
        active: effectivePayloadActive,
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
          setSponsorStatus(
            formatApiErrorWithHint(`Sponsor config save failed: ${response.status}`),
          );
          return false;
        }

        setSponsorStatus(null);

        const [storedEventFingerprint, storedAlertFingerprint] = await Promise.all([
          AsyncStorage.getItem(sponsorCalendarEventFingerprintStorage),
          AsyncStorage.getItem(sponsorAlertFingerprintStorage),
        ]);

        if (storedEventFingerprint !== sponsorEventFingerprint) {
          await syncSponsorCalendarEvent("save:event-changed");
          await AsyncStorage.setItem(
            sponsorCalendarEventFingerprintStorage,
            sponsorEventFingerprint,
          );
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
        return true;
      } catch {
        setSponsorStatus(formatApiErrorWithHint("Sponsor config save failed: network."));
        return false;
      } finally {
        setSponsorSaving(false);
      }
    },
    [
      sponsorEnabled,
      sponsorActive,
      normalizedSponsorName,
      sponsorPhoneE164,
      sponsorRepeatUnit,
      sponsorRepeatInterval,
      sponsorRepeatDaysSorted,
      sponsorCallTimeLocalHhmm,
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
    ],
  );

  useEffect(() => {
    saveSponsorConfigRef.current = saveSponsorConfig;
  }, [saveSponsorConfig]);

  const finishSetup = useCallback(async () => {
    setSetupError(null);
    const parsedDateIso = parseDdMmYyyyToIso(sobrietyDateInput);
    if (!parsedDateIso) {
      setSetupError("Enter sobriety date as MM/DD/YYYY.");
      setSetupStep(1);
      return;
    }
    const parsedGoal = parseGoalTargetInput(ninetyDayGoalInput);
    if (!parsedGoal) {
      setSetupError("Enter a valid 90-day meeting goal (1 or higher).");
      setSetupStep(1);
      return;
    }

    const hasSponsor = wizardHasSponsor === true;
    const wantsReminders = hasSponsor && wizardWantsReminders === true;
    if (hasSponsor && (!normalizedSponsorName || !sponsorPhoneE164)) {
      setSetupError("Enter sponsor name and phone.");
      setSetupStep(2);
      return;
    }
    if (wantsReminders && sponsorRepeatUnit === "WEEKLY" && sponsorRepeatDaysSorted.length === 0) {
      setSetupError("Select at least one reminder day.");
      setSetupStep(3);
      return;
    }
    if (wizardHasHomeGroup === true && homeGroupMeetingIds.length === 0) {
      setSetupError("Select a home group meeting.");
      setSetupStep(4);
      return;
    }

    setSobrietyDateIso(parsedDateIso);
    setNinetyDayGoalTarget(parsedGoal);
    setNinetyDayGoalInput(String(parsedGoal));
    setSponsorEnabled(hasSponsor);
    setSponsorActive(wantsReminders);
    if (!hasSponsor) {
      setSponsorName("");
      setSponsorPhoneDigits("");
      setSponsorStatus(null);
      await cancelNotificationBucket("sponsor");
    } else {
      setSponsorEnabledAtIso((current) => current ?? new Date().toISOString());
      const saved = await saveSponsorConfig({
        sponsorEnabled: hasSponsor,
        sponsorActive: wantsReminders,
      });
      if (!saved) {
        setSponsorStatus("Sponsor auto-save failed. Open Settings to retry.");
      }
    }

    if (wizardHasHomeGroup !== true) {
      setHomeGroupMeetingIds([]);
    }

    setSetupComplete(true);
    setSetupStep(1);
    setHomeScreen("DASHBOARD");
    setSelectedDayOffset(0);
    setScreen("LIST");
    setSelectedMeeting(null);
    void refreshMeetings();
  }, [
    sobrietyDateInput,
    ninetyDayGoalInput,
    wizardHasSponsor,
    wizardWantsReminders,
    normalizedSponsorName,
    sponsorPhoneE164,
    sponsorRepeatUnit,
    sponsorRepeatDaysSorted.length,
    wizardHasHomeGroup,
    homeGroupMeetingIds.length,
    cancelNotificationBucket,
    saveSponsorConfig,
    refreshMeetings,
  ]);

  const saveRecoveryTileAndOpenDashboard = useCallback(async () => {
    if (!sobrietyDateIso) {
      setSetupError("Complete setup first by adding sobriety date.");
      setHomeScreen("SETUP");
      setSetupStep(1);
      return;
    }

    if (sponsorEnabled) {
      const saved = await saveSponsorConfig();
      if (!saved) {
        return;
      }
    }

    setSetupComplete(true);
    setHomeScreen("DASHBOARD");
    setScreen("LIST");
    setSelectedMeeting(null);
    setSelectedDayOffset(0);
    void refreshMeetings();
  }, [sobrietyDateIso, sponsorEnabled, saveSponsorConfig, refreshMeetings]);

  const saveSobrietyDateFromSettings = useCallback(() => {
    const parsedDateIso = parseDdMmYyyyToIso(sobrietyDateInput);
    if (!parsedDateIso) {
      setSobrietyDateStatus("Enter date as MM/DD/YYYY.");
      return;
    }
    setSobrietyDateIso(parsedDateIso);
    setSobrietyDateInput(formatIsoToDdMmYyyy(parsedDateIso));
    setSobrietyDateStatus("Sobriety date saved.");
  }, [sobrietyDateInput]);

  const clearSobrietyDateFromSettings = useCallback(() => {
    setSobrietyDateIso(null);
    setSobrietyDateInput("");
    setSobrietyDateStatus("Sobriety date cleared.");
    setSetupComplete(false);
  }, []);

  const saveNinetyDayGoalFromSettings = useCallback(() => {
    const parsedGoal = parseGoalTargetInput(ninetyDayGoalInput);
    if (!parsedGoal) {
      setSobrietyDateStatus("Enter a valid 90-day goal (1 or higher).");
      return;
    }
    setNinetyDayGoalTarget(parsedGoal);
    setNinetyDayGoalInput(String(parsedGoal));
    setSobrietyDateStatus("90-day meeting goal saved.");
  }, [ninetyDayGoalInput]);

  const resetNinetyDayGoalFromSettings = useCallback(() => {
    setNinetyDayGoalTarget(DEFAULT_NINETY_DAY_GOAL_TARGET);
    setNinetyDayGoalInput(String(DEFAULT_NINETY_DAY_GOAL_TARGET));
    setSobrietyDateStatus("90-day meeting goal reset to 90.");
  }, []);

  const startAttendance = useCallback(
    async (meeting: MeetingRecord) => {
      const location = await readCurrentLocation(false);
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

    const location = await readCurrentLocation(false);
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
    appendMeetingAttendanceLog({
      meetingId: activeAttendance.meetingId,
      method: "verified",
    });
    setAttendanceStatus("Attendance ended. Capture chairperson signature to complete the log.");
    setScreen("SIGNATURE");
  }, [activeAttendance, readCurrentLocation, upsertAttendanceRecord, appendMeetingAttendanceLog]);

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

  const toggleAttendanceSelection = useCallback((recordId: string) => {
    setSelectedAttendanceIds((current) =>
      current.includes(recordId)
        ? current.filter((entry) => entry !== recordId)
        : [...current, recordId],
    );
  }, []);

  const selectAllAttendance = useCallback(() => {
    setSelectedAttendanceIds(attendanceRecords.map((record) => record.id));
  }, [attendanceRecords]);

  const clearAttendanceSelection = useCallback(() => {
    setSelectedAttendanceIds([]);
  }, []);

  const exportSelectedAttendance = useCallback(async () => {
    const selectedRecords = attendanceRecords.filter((record) =>
      selectedAttendanceIds.includes(record.id),
    );
    if (selectedRecords.length === 0) {
      setAttendanceStatus("Select at least one attendance record to export.");
      return;
    }

    const escapeHtml = (value: string): string =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

    const formatMaybeTime = (value: string | null): string => {
      if (!value) {
        return "Not set";
      }
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
    };

    const buildRecordHtml = (record: AttendanceRecord): string => {
      const signatureMarkup = record.signaturePngBase64
        ? `<img alt="Signature" src="data:image/svg+xml;base64,${record.signaturePngBase64}" style="width: 100%; max-width: 340px; border: 1px solid #d0d5dd; border-radius: 8px;" />`
        : '<p style="color:#6b7280;">No signature captured.</p>';
      return `<section style="margin-bottom: 20px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px;">
        <h3 style="margin:0 0 6px 0;">${escapeHtml(record.meetingName)}</h3>
        <p><strong>Address:</strong> ${escapeHtml(record.meetingAddress || "Unknown")}</p>
        <p><strong>Started:</strong> ${escapeHtml(formatMaybeTime(record.startAt))}</p>
        <p><strong>Ended:</strong> ${escapeHtml(formatMaybeTime(record.endAt))}</p>
        <p><strong>Duration:</strong> ${escapeHtml(formatDuration(record.durationSeconds))}</p>
        <p><strong>Signature:</strong> ${record.signaturePngBase64 ? "Captured" : "Missing"}</p>
        ${signatureMarkup}
      </section>`;
    };

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Selected Attendance - ${new Date().toISOString().slice(0, 10)}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; padding: 24px; }
      h1 { margin: 0 0 8px 0; font-size: 22px; }
      p { margin: 4px 0; font-size: 13px; }
    </style>
  </head>
  <body>
    <h1>Meetings Attended Export</h1>
    <p>User: ${escapeHtml(devUserDisplayName)}</p>
    <p>Generated: ${escapeHtml(new Date().toLocaleString())}</p>
    ${selectedRecords.map(buildRecordHtml).join("\n")}
  </body>
</html>`;

    const printModule = loadOptionalModule<{
      printToFileAsync: (input: {
        html: string;
        width?: number;
        height?: number;
      }) => Promise<{ uri: string }>;
    }>("expo-print");
    const sharingModule = loadOptionalModule<{
      isAvailableAsync: () => Promise<boolean>;
      shareAsync: (
        uri: string,
        options?: { UTI?: string; mimeType?: string; dialogTitle?: string },
      ) => Promise<void>;
    }>("expo-sharing");
    const fileSystemModule = loadOptionalModule<{
      documentDirectory?: string;
      cacheDirectory?: string;
      getInfoAsync: (uri: string) => Promise<{ exists: boolean }>;
      deleteAsync: (uri: string, options?: { idempotent?: boolean }) => Promise<void>;
      moveAsync: (input: { from: string; to: string }) => Promise<void>;
    }>("expo-file-system");

    if (!printModule || !sharingModule || !fileSystemModule) {
      setAttendanceStatus(
        "PDF modules unavailable. Install expo-print, expo-file-system, and expo-sharing.",
      );
      return;
    }

    setExportingAttendanceSelectionPdf(true);
    try {
      const printed = await printModule.printToFileAsync({ html, width: 612, height: 792 });
      const outputDirectory = fileSystemModule.documentDirectory ?? fileSystemModule.cacheDirectory;
      if (!outputDirectory) {
        setAttendanceStatus("No writable directory available for attendance export.");
        return;
      }

      const fileName = `Meetings Attended - ${new Date().toISOString().slice(0, 10)}.pdf`;
      const targetUri = `${outputDirectory}${fileName}`;
      const existing = await fileSystemModule.getInfoAsync(targetUri);
      if (existing.exists) {
        await fileSystemModule.deleteAsync(targetUri, { idempotent: true });
      }
      await fileSystemModule.moveAsync({ from: printed.uri, to: targetUri });

      const canShare = await sharingModule.isAvailableAsync();
      if (canShare) {
        await sharingModule.shareAsync(targetUri, {
          UTI: "com.adobe.pdf",
          mimeType: "application/pdf",
          dialogTitle: fileName,
        });
      }
      setAttendanceStatus(`Exported ${selectedRecords.length} meeting record(s).`);
    } catch (error) {
      setAttendanceStatus(`Failed to export selected attendance: ${formatError(error)}`);
    } finally {
      setExportingAttendanceSelectionPdf(false);
    }
  }, [attendanceRecords, selectedAttendanceIds, devUserDisplayName]);

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
      const nextEarlyMinutes = parseTwoDigitMinutes(
        earlyMinutesText,
        DEFAULT_MEETING_EARLY_MINUTES,
      );
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
      const parsed = parseTwoDigitMinutes(valueText, DEFAULT_SERVICE_COMMITMENT_MINUTES);
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

  const markMeetingAttended = useCallback(
    (meeting: MeetingRecord) => {
      appendMeetingAttendanceLog({
        meetingId: meeting.id,
        method: "manual",
      });
      setAttendanceStatus(`Marked ${meeting.name} as attended.`);
    },
    [appendMeetingAttendanceLog],
  );

  const resolveMeetingForLogging = useCallback(
    (meetingId: string): MeetingRecord | null => {
      return (
        meetingsTodayUpcoming.find((meeting) => meeting.id === meetingId) ??
        meetingsForDay.find((meeting) => meeting.id === meetingId) ??
        allMeetings.find((meeting) => meeting.id === meetingId) ??
        null
      );
    },
    [meetingsTodayUpcoming, meetingsForDay, allMeetings],
  );

  const logUpcomingMeetingFromDashboard = useCallback(
    async (meetingId: string) => {
      if (activeAttendance && !activeAttendance.endAt) {
        Alert.alert(
          "Attendance in progress",
          "Finish the current meeting attendance before logging another meeting.",
        );
        return;
      }

      const meeting = resolveMeetingForLogging(meetingId);
      if (!meeting) {
        Alert.alert("Meeting unavailable", "This meeting is no longer in the upcoming list.");
        return;
      }

      if (
        meeting.format === "ONLINE" ||
        meeting.lat === null ||
        meeting.lng === null ||
        !Number.isFinite(meeting.lat) ||
        !Number.isFinite(meeting.lng)
      ) {
        Alert.alert(
          "Geofence unavailable",
          "This meeting does not have a valid in-person geofence location.",
        );
        return;
      }

      const location = await readCurrentLocation(true);
      if (location) {
        const distance = distanceMetersBetween(
          location.lat,
          location.lng,
          meeting.lat,
          meeting.lng,
        );
        if (distance <= ARRIVAL_RADIUS_METERS) {
          setPendingGeofenceLogMeetingId(null);
          setSelectedMeeting(meeting);
          setHomeScreen("MEETINGS");
          await startAttendance(meeting);
          return;
        }
      }

      setPendingGeofenceLogMeetingId(meeting.id);
      setSelectedMeeting(meeting);
      setAttendanceStatus(`Queued ${meeting.name}. Logging starts automatically at arrival.`);
      Alert.alert(
        "Outside meeting geofence",
        `${meeting.name} will be logged once you are at the meeting location (~200 ft geofence).`,
      );
    },
    [activeAttendance, readCurrentLocation, resolveMeetingForLogging, startAttendance],
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
          void openPhoneCall(phone, "notification");
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
    if (locationIssueRef.current !== "permission_denied") {
      locationPermissionAlertShownRef.current = false;
      return;
    }

    if (locationPermissionAlertShownRef.current) {
      return;
    }
    locationPermissionAlertShownRef.current = true;

    Alert.alert(
      "Location Permission Needed",
      "Distance and arrival detection need location access. You can enable it in Settings.",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Open Settings",
          onPress: () => {
            void Linking.openSettings().catch(() => {
              setMeetingsStatus("Unable to open Settings. Please enable location manually.");
            });
          },
        },
      ],
    );
  }, [locationPermission]);

  useEffect(() => {
    const mapping: Record<string, MeetingRecord> = {};
    for (const meeting of meetings) {
      mapping[meeting.id] = meeting;
    }
    meetingsByIdRef.current = mapping;
  }, [meetings]);

  useEffect(() => {
    setSelectedLocationKey(null);
  }, [selectedDay.dayOfWeek, meetingsViewMode]);

  useEffect(() => {
    const timer = setInterval(() => {
      setClockTickMs(Date.now());
    }, 60_000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (playbackRef.current) {
        void playbackRef.current.unloadAsync?.();
      }
      if (recordingRef.current) {
        void recordingRef.current.stopAndUnloadAsync?.();
      }
    };
  }, []);

  useEffect(() => {
    if (currentLocation) {
      const center = { lat: currentLocation.lat, lng: currentLocation.lng };
      if (!mapBoundaryCenter) {
        setMapBoundaryCenter(center);
      }
      updateMapCenter(center);
      return;
    }

    if (mapMeetingsForDay.length > 0 && !mapCenter) {
      const fallback = {
        lat: mapMeetingsForDay[0].lat as number,
        lng: mapMeetingsForDay[0].lng as number,
      };
      if (!mapBoundaryCenter) {
        setMapBoundaryCenter(fallback);
      }
      updateMapCenter(fallback);
    }
  }, [currentLocation, mapMeetingsForDay, mapCenter, mapBoundaryCenter, updateMapCenter]);

  useEffect(() => {
    if (bootstrapStartedRef.current) {
      return;
    }
    bootstrapStartedRef.current = true;

    void (async () => {
      const position = await requestLocationPermission();
      await Promise.all([refreshMeetings({ location: position }), fetchSponsorConfig()]);

      try {
        const [
          modeRaw,
          sponsorUiPrefsRaw,
          attendanceRaw,
          planRaw,
          setupCompleteRaw,
          sobrietyDateRaw,
          profileRaw,
          ninetyDayGoalRaw,
          sponsorCallLogRaw,
          sponsorEnabledAtRaw,
          meetingAttendanceLogRaw,
          loadedRoutinesStore,
        ] = await Promise.all([
          AsyncStorage.getItem(modeStorage),
          AsyncStorage.getItem(sponsorUiPrefsStorage),
          AsyncStorage.getItem(attendanceStorage),
          AsyncStorage.getItem(meetingPlansStorage),
          AsyncStorage.getItem(setupCompleteStorage),
          AsyncStorage.getItem(sobrietyDateStorage),
          AsyncStorage.getItem(profileStorage),
          AsyncStorage.getItem(ninetyDayGoalStorage),
          AsyncStorage.getItem(sponsorCallLogStorage),
          AsyncStorage.getItem(sponsorEnabledAtStorage),
          AsyncStorage.getItem(meetingAttendanceLogStorage),
          loadRoutinesStore(devAuthUserId),
        ]);

        const resolvedMode: RecoveryMode =
          modeRaw === "A" || modeRaw === "B" || modeRaw === "C" ? modeRaw : "A";
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

        const parsedSetupComplete = setupCompleteRaw === "true";
        const hasSobrietyDate = typeof sobrietyDateRaw === "string" && sobrietyDateRaw.length > 0;
        const resolvedSetupComplete = parsedSetupComplete && hasSobrietyDate;
        setSetupComplete(resolvedSetupComplete);

        if (sobrietyDateRaw) {
          setSobrietyDateIso(sobrietyDateRaw);
          setSobrietyDateInput(formatIsoToDdMmYyyy(sobrietyDateRaw));
        }

        if (profileRaw) {
          const parsedProfile = JSON.parse(profileRaw) as {
            radiusMiles?: number;
            homeGroupMeetingIds?: string[];
            sponsorEnabledAtIso?: string | null;
            ninetyDayGoalTarget?: number;
          };
          if (typeof parsedProfile.radiusMiles === "number" && parsedProfile.radiusMiles > 0) {
            setMeetingRadiusMiles(parsedProfile.radiusMiles);
          }
          if (Array.isArray(parsedProfile.homeGroupMeetingIds)) {
            setHomeGroupMeetingIds(
              parsedProfile.homeGroupMeetingIds.filter(
                (entry): entry is string => typeof entry === "string" && entry.length > 0,
              ),
            );
          }
          if (
            typeof parsedProfile.sponsorEnabledAtIso === "string" ||
            parsedProfile.sponsorEnabledAtIso === null
          ) {
            setSponsorEnabledAtIso(parsedProfile.sponsorEnabledAtIso ?? null);
          }
          if (
            typeof parsedProfile.ninetyDayGoalTarget === "number" &&
            Number.isFinite(parsedProfile.ninetyDayGoalTarget)
          ) {
            const nextGoal = Math.max(
              1,
              Math.min(9999, Math.floor(parsedProfile.ninetyDayGoalTarget)),
            );
            setNinetyDayGoalTarget(nextGoal);
            setNinetyDayGoalInput(String(nextGoal));
          }
        }

        if (typeof ninetyDayGoalRaw === "string" && ninetyDayGoalRaw.trim().length > 0) {
          const parsedGoal = Number(ninetyDayGoalRaw);
          if (Number.isFinite(parsedGoal)) {
            const nextGoal = Math.max(1, Math.min(9999, Math.floor(parsedGoal)));
            setNinetyDayGoalTarget(nextGoal);
            setNinetyDayGoalInput(String(nextGoal));
          }
        }

        if (typeof sponsorEnabledAtRaw === "string" && sponsorEnabledAtRaw.trim().length > 0) {
          setSponsorEnabledAtIso(sponsorEnabledAtRaw);
        }

        if (sponsorCallLogRaw) {
          const parsedLogs = JSON.parse(sponsorCallLogRaw) as SponsorCallLog[];
          if (Array.isArray(parsedLogs)) {
            setSponsorCallLogs(parsedLogs);
          }
        }

        if (meetingAttendanceLogRaw) {
          const parsedLogs = JSON.parse(meetingAttendanceLogRaw) as MeetingAttendanceLog[];
          if (Array.isArray(parsedLogs)) {
            setMeetingAttendanceLogs(parsedLogs);
          }
        }

        setRoutinesStore(loadedRoutinesStore);

        if (resolvedMode === "A") {
          setHomeScreen(resolvedSetupComplete ? "DASHBOARD" : "SETUP");
        } else {
          setHomeScreen("SETTINGS");
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
    setupCompleteStorage,
    sobrietyDateStorage,
    profileStorage,
    ninetyDayGoalStorage,
    sponsorCallLogStorage,
    sponsorEnabledAtStorage,
    meetingAttendanceLogStorage,
    devAuthUserId,
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
    if (mode !== "A") {
      return;
    }
    if (setupComplete && homeScreen === "SETUP") {
      setHomeScreen("DASHBOARD");
    }
    if (!setupComplete && homeScreen === "DASHBOARD") {
      setHomeScreen("SETUP");
    }
  }, [mode, setupComplete, homeScreen]);

  useEffect(() => {
    if (mode !== "A" || !setupComplete) {
      return;
    }
    const missingSobrietyDate = !sobrietyDateIso;
    const sponsorProfileIncomplete =
      sponsorEnabled && (!normalizedSponsorName || sponsorPhoneE164 === null);
    if (missingSobrietyDate || sponsorProfileIncomplete) {
      setSetupComplete(false);
      setHomeScreen("SETUP");
    }
  }, [
    mode,
    setupComplete,
    sobrietyDateIso,
    sponsorEnabled,
    normalizedSponsorName,
    sponsorPhoneE164,
  ]);

  useEffect(() => {
    if (mode === "A" && homeScreen === "DASHBOARD" && selectedDayOffset !== 0) {
      setSelectedDayOffset(0);
    }
  }, [mode, homeScreen, selectedDayOffset]);

  useEffect(() => {
    if (!bootstrapped) {
      return;
    }
    setWizardHasSponsor((current) => (current === null ? sponsorEnabled : current));
    setWizardWantsReminders((current) => (current === null ? sponsorActive : current));
    setWizardHasHomeGroup((current) =>
      current === null ? homeGroupMeetingIds.length > 0 : current,
    );
  }, [bootstrapped, sponsorEnabled, sponsorActive, homeGroupMeetingIds.length]);

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
    if (!bootstrapped) {
      return;
    }
    void AsyncStorage.setItem(setupCompleteStorage, setupComplete ? "true" : "false");
  }, [setupComplete, setupCompleteStorage, bootstrapped]);

  useEffect(() => {
    if (!bootstrapped) {
      return;
    }
    if (sobrietyDateIso) {
      void AsyncStorage.setItem(sobrietyDateStorage, sobrietyDateIso);
      return;
    }
    void AsyncStorage.removeItem(sobrietyDateStorage);
  }, [sobrietyDateIso, sobrietyDateStorage, bootstrapped]);

  useEffect(() => {
    if (!bootstrapped) {
      return;
    }
    void AsyncStorage.setItem(ninetyDayGoalStorage, String(ninetyDayGoalTarget));
  }, [bootstrapped, ninetyDayGoalStorage, ninetyDayGoalTarget]);

  useEffect(() => {
    if (!bootstrapped) {
      return;
    }
    void syncSobrietyMilestoneCalendarEvents("sobriety-date-change");
  }, [bootstrapped, sobrietyDateIso, syncSobrietyMilestoneCalendarEvents]);

  useEffect(() => {
    if (!bootstrapped || !sponsorEnabledAtIso) {
      return;
    }
    void AsyncStorage.setItem(sponsorEnabledAtStorage, sponsorEnabledAtIso);
  }, [bootstrapped, sponsorEnabledAtIso, sponsorEnabledAtStorage]);

  useEffect(() => {
    if (!bootstrapped) {
      return;
    }
    void AsyncStorage.setItem(
      profileStorage,
      JSON.stringify({
        radiusMiles: meetingRadiusMiles,
        homeGroupMeetingIds,
        sponsorEnabledAtIso,
        ninetyDayGoalTarget,
      }),
    );
  }, [
    meetingRadiusMiles,
    homeGroupMeetingIds,
    sponsorEnabledAtIso,
    ninetyDayGoalTarget,
    profileStorage,
    bootstrapped,
  ]);

  useEffect(() => {
    if (!bootstrapped) {
      return;
    }
    if (!hasSkippedInitialSelectedDayRefreshRef.current) {
      hasSkippedInitialSelectedDayRefreshRef.current = true;
      return;
    }
    void refreshMeetings();
  }, [selectedDay.dayOfWeek, refreshMeetings, bootstrapped]);

  useEffect(() => {
    if (!bootstrapped || homeScreen !== "SETUP" || setupStep !== 4) {
      setupStep4RefreshLocationKeyRef.current = null;
      return;
    }

    const locationKey = currentLocation
      ? `${currentLocation.lat.toFixed(4)}|${currentLocation.lng.toFixed(4)}`
      : "none";
    if (setupStep4RefreshLocationKeyRef.current === locationKey) {
      return;
    }
    setupStep4RefreshLocationKeyRef.current = locationKey;

    if (currentLocation) {
      void refreshMeetings({ location: currentLocation });
      return;
    }
    void refreshMeetings();
  }, [bootstrapped, homeScreen, setupStep, refreshMeetings, currentLocation]);

  useEffect(() => {
    if (!bootstrapped || homeScreen !== "MEETINGS") {
      return;
    }
    void (async () => {
      const location = currentLocation ?? (await requestLocationPermission());
      await refreshMeetings({ location });
    })();
  }, [bootstrapped, homeScreen, currentLocation, requestLocationPermission, refreshMeetings]);

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
    if (!sponsorEnabled) {
      return;
    }
    if (!sponsorEnabledAtIso) {
      setSponsorEnabledAtIso(new Date().toISOString());
    }
  }, [sponsorEnabled, sponsorEnabledAtIso]);

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

      const location = await readCurrentLocation(false);
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

  useEffect(() => {
    if (!pendingGeofenceLogMeetingId) {
      return;
    }
    if (activeAttendance && !activeAttendance.endAt) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const checkPendingMeeting = async () => {
      if (cancelled) {
        return;
      }

      const meeting = resolveMeetingForLogging(pendingGeofenceLogMeetingId);
      if (!meeting) {
        setPendingGeofenceLogMeetingId(null);
        return;
      }

      if (
        meeting.format === "ONLINE" ||
        meeting.lat === null ||
        meeting.lng === null ||
        !Number.isFinite(meeting.lat) ||
        !Number.isFinite(meeting.lng)
      ) {
        setPendingGeofenceLogMeetingId(null);
        return;
      }

      const location = await readCurrentLocation(false);
      if (!location || cancelled) {
        return;
      }

      const distance = distanceMetersBetween(location.lat, location.lng, meeting.lat, meeting.lng);
      if (distance > ARRIVAL_RADIUS_METERS) {
        return;
      }

      setPendingGeofenceLogMeetingId(null);
      setSelectedMeeting(meeting);
      setHomeScreen("MEETINGS");
      await startAttendance(meeting);
      if (!cancelled) {
        Alert.alert("Meeting log started", `${meeting.name} attendance logging has started.`);
      }
    };

    void checkPendingMeeting();
    timer = setInterval(() => {
      void checkPendingMeeting();
    }, 15_000);

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [
    pendingGeofenceLogMeetingId,
    activeAttendance,
    resolveMeetingForLogging,
    readCurrentLocation,
    startAttendance,
  ]);

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

  const showFixedBottomMenu =
    mode === "A" &&
    setupComplete &&
    (homeScreen === "DASHBOARD" ||
      homeScreen === "MEETINGS" ||
      homeScreen === "ATTENDANCE" ||
      homeScreen === "TOOLS");
  // Keep dashboard content scrollable from the parent container so users can reach
  // the Upcoming Meetings tile reliably on all devices.
  const shouldLockOuterScrollForDashboard = false;

  return (
    <LiquidBackground>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={24}
      >
        <ScrollView
          style={showFixedBottomMenu ? styles.scrollViewWithFooterNav : undefined}
          contentContainerStyle={[
            styles.contentContainer,
            showFixedBottomMenu ? styles.contentContainerWithFooterNav : null,
          ]}
          pointerEvents={shouldLockOuterScrollForDashboard ? "box-none" : "auto"}
          scrollEnabled={!shouldLockOuterScrollForDashboard}
          scrollIndicatorInsets={{ bottom: showFixedBottomMenu ? DASHBOARD_FOOTER_NAV_HEIGHT : 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {homeScreen !== "DASHBOARD" ? (
            <View style={styles.headerRow}>
              <View style={styles.headerTextWrap}>
                <Text style={[styles.title, ui.title]}>Recovery Mode</Text>
                <Text style={[styles.meta, ui.subtitle]}>DEV user: {devAuthUserId}</Text>
              </View>
              {mode === "A" && setupComplete && homeScreen === "SETTINGS" ? (
                <Pressable
                  style={styles.hamburgerButton}
                  onPress={openDashboard}
                  accessibilityRole="button"
                  accessibilityLabel="Back to dashboard"
                >
                  <Text style={styles.hamburgerText}>✕</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {SHOW_MODE_TILES && homeScreen !== "DASHBOARD" ? (
            <View style={styles.modeRow}>
              {RECOVERY_MODE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => handleModeSelect(option.value)}
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
                  {!option.implemented ? (
                    <Text style={styles.modeComingSoon}>Coming soon</Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          {SHOW_MODE_TILES &&
          homeScreen !== "DASHBOARD" &&
          mode !== "A" &&
          homeScreen !== "SETTINGS" ? (
            <GlassCard style={styles.card} strong>
              <Text style={styles.sectionTitle}>
                {RECOVERY_MODE_OPTIONS.find((item) => item.value === mode)?.title}
              </Text>
              <Text style={styles.sectionMeta}>
                This mode is visible for planning and will be implemented in a future slice.
              </Text>
            </GlassCard>
          ) : null}

          {mode === "A" ? (
            <>
              {homeScreen === "SETUP" ? (
                <GlassCard style={styles.card} strong>
                  <Text style={styles.sectionTitle}>Recovery Setup Wizard</Text>
                  <Text style={styles.sectionMeta}>Step {setupStep} of 5</Text>
                  {setupStep === 1 ? (
                    <>
                      <Text style={styles.label}>What is your sobriety date?</Text>
                      <TextInput
                        style={styles.input}
                        value={sobrietyDateInput}
                        onChangeText={(value) => setSobrietyDateInput(normalizeUsDateInput(value))}
                        placeholder="MM/DD/YYYY"
                        keyboardType="number-pad"
                        maxLength={10}
                      />
                      <Text style={styles.label}>90-day meeting goal (any number)</Text>
                      <TextInput
                        style={styles.input}
                        value={ninetyDayGoalInput}
                        onChangeText={(value) => setNinetyDayGoalInput(normalizeGoalInput(value))}
                        placeholder="90"
                        keyboardType="number-pad"
                        maxLength={4}
                      />
                    </>
                  ) : null}

                  {setupStep === 2 ? (
                    <>
                      <Text style={styles.label}>Do you have a sponsor?</Text>
                      <View style={styles.chipRow}>
                        <Pressable
                          style={[
                            styles.chip,
                            wizardHasSponsor === true ? styles.chipSelected : null,
                          ]}
                          onPress={() => setWizardHasSponsor(true)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              wizardHasSponsor === true ? styles.chipTextSelected : null,
                            ]}
                          >
                            Yes
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.chip,
                            wizardHasSponsor === false ? styles.chipSelected : null,
                          ]}
                          onPress={() => setWizardHasSponsor(false)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              wizardHasSponsor === false ? styles.chipTextSelected : null,
                            ]}
                          >
                            No
                          </Text>
                        </Pressable>
                      </View>
                      {wizardHasSponsor ? (
                        <>
                          <Text style={styles.label}>Name</Text>
                          <TextInput
                            style={styles.input}
                            value={sponsorName}
                            onChangeText={setSponsorName}
                            placeholder="Sponsor name"
                          />
                          <Text style={styles.label}>Phone #</Text>
                          <TextInput
                            style={styles.input}
                            value={formatUsPhoneDisplay(sponsorPhoneDigits)}
                            onChangeText={(value) =>
                              setSponsorPhoneDigits(normalizePhoneDigits(value))
                            }
                            keyboardType="phone-pad"
                            placeholder="(555) 555-1234"
                          />
                        </>
                      ) : null}
                    </>
                  ) : null}

                  {setupStep === 3 ? (
                    <>
                      <Text style={styles.label}>Do you want sponsor call reminders?</Text>
                      <View style={styles.chipRow}>
                        <Pressable
                          style={[
                            styles.chip,
                            wizardWantsReminders === true ? styles.chipSelected : null,
                          ]}
                          onPress={() => setWizardWantsReminders(true)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              wizardWantsReminders === true ? styles.chipTextSelected : null,
                            ]}
                          >
                            Yes
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.chip,
                            wizardWantsReminders === false ? styles.chipSelected : null,
                          ]}
                          onPress={() => setWizardWantsReminders(false)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              wizardWantsReminders === false ? styles.chipTextSelected : null,
                            ]}
                          >
                            No
                          </Text>
                        </Pressable>
                      </View>

                      {wizardWantsReminders ? (
                        <>
                          <Text style={styles.label}>Call time</Text>
                          <View style={styles.timeRow}>
                            <Pressable style={styles.stepButton} onPress={() => incrementHour(-1)}>
                              <Text style={styles.stepButtonText}>-</Text>
                            </Pressable>
                            <Text style={styles.timeValue}>
                              {String(sponsorHour12).padStart(2, "0")}
                            </Text>
                            <Pressable style={styles.stepButton} onPress={() => incrementHour(1)}>
                              <Text style={styles.stepButtonText}>+</Text>
                            </Pressable>
                            <Text style={styles.timeDivider}>:</Text>
                            <Pressable
                              style={styles.stepButton}
                              onPress={() => incrementMinute(-1)}
                            >
                              <Text style={styles.stepButtonText}>-</Text>
                            </Pressable>
                            <Text style={styles.timeValue}>
                              {String(sponsorMinute).padStart(2, "0")}
                            </Text>
                            <Pressable style={styles.stepButton} onPress={() => incrementMinute(1)}>
                              <Text style={styles.stepButtonText}>+</Text>
                            </Pressable>
                            <Pressable
                              style={styles.meridiemButton}
                              onPress={() =>
                                setSponsorMeridiem((current) => (current === "AM" ? "PM" : "AM"))
                              }
                            >
                              <Text style={styles.meridiemText}>{sponsorMeridiem}</Text>
                            </Pressable>
                          </View>
                          <Text style={styles.label}>Repeat</Text>
                          <View style={styles.chipRow}>
                            {SPONSOR_REPEAT_OPTIONS.map((option) => (
                              <Pressable
                                key={option.value}
                                style={[
                                  styles.chip,
                                  sponsorRepeatPreset === option.value ? styles.chipSelected : null,
                                ]}
                                onPress={() => setSponsorRepeatPreset(option.value)}
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    sponsorRepeatPreset === option.value
                                      ? styles.chipTextSelected
                                      : null,
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
                                    style={[
                                      styles.chip,
                                      sponsorRepeatDays.includes(day.code)
                                        ? styles.chipSelected
                                        : null,
                                    ]}
                                    onPress={() => toggleRepeatDay(day.code)}
                                  >
                                    <Text
                                      style={[
                                        styles.chipText,
                                        sponsorRepeatDays.includes(day.code)
                                          ? styles.chipTextSelected
                                          : null,
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
                                style={[
                                  styles.chip,
                                  sponsorLeadMinutes === option.value ? styles.chipSelected : null,
                                ]}
                                onPress={() => setSponsorLeadMinutes(option.value)}
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    sponsorLeadMinutes === option.value
                                      ? styles.chipTextSelected
                                      : null,
                                  ]}
                                >
                                  {option.label}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </>
                      ) : null}
                    </>
                  ) : null}

                  {setupStep === 4 ? (
                    <>
                      <Text style={styles.label}>Do you have a home group meeting?</Text>
                      <View style={styles.chipRow}>
                        <Pressable
                          style={[
                            styles.chip,
                            wizardHasHomeGroup === true ? styles.chipSelected : null,
                          ]}
                          onPress={() => setWizardHasHomeGroup(true)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              wizardHasHomeGroup === true ? styles.chipTextSelected : null,
                            ]}
                          >
                            Yes
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.chip,
                            wizardHasHomeGroup === false ? styles.chipSelected : null,
                          ]}
                          onPress={() => setWizardHasHomeGroup(false)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              wizardHasHomeGroup === false ? styles.chipTextSelected : null,
                            ]}
                          >
                            No
                          </Text>
                        </Pressable>
                      </View>

                      {wizardHasHomeGroup ? (
                        <>
                          <Text style={styles.sectionMeta}>
                            Select a home group from upcoming meetings within {meetingRadiusMiles}{" "}
                            miles.
                          </Text>
                          {homeGroupCandidateMeetings.length === 0 ? (
                            <Text style={styles.sectionMeta}>
                              No nearby upcoming meetings loaded yet.
                            </Text>
                          ) : (
                            <ScrollView
                              style={styles.setupMeetingListScroll}
                              contentContainerStyle={styles.setupMeetingListContent}
                              nestedScrollEnabled
                              showsVerticalScrollIndicator
                              keyboardShouldPersistTaps="handled"
                            >
                              {homeGroupCandidateMeetings.map((meeting) => {
                                const selected = homeGroupMeetingIds.includes(meeting.id);
                                return (
                                  <Pressable
                                    key={meeting.id}
                                    style={[
                                      styles.meetingCard,
                                      selected ? styles.homeGroupSelectedCard : null,
                                    ]}
                                    onPress={() =>
                                      setHomeGroupMeetingIds((current) =>
                                        current.includes(meeting.id) ? [] : [meeting.id],
                                      )
                                    }
                                  >
                                    <Text style={styles.meetingName}>{meeting.name}</Text>
                                    <Text style={styles.sectionMeta}>
                                      {formatHhmmForDisplay(meeting.startsAtLocal)} •{" "}
                                      {formatDistance(meeting.distanceMeters)}
                                    </Text>
                                    <Text style={styles.sectionMeta}>
                                      {selected
                                        ? "Selected as home group"
                                        : "Tap to set as home group"}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </ScrollView>
                          )}
                        </>
                      ) : null}
                    </>
                  ) : null}

                  {setupStep === 5 ? (
                    <>
                      <Text style={styles.label}>Review</Text>
                      <Text style={styles.sectionMeta}>
                        Sobriety date: {sobrietyDateInput || "Not set"}
                      </Text>
                      <Text style={styles.sectionMeta}>90-day goal: {ninetyDayGoalTarget}</Text>
                      <Text style={styles.sectionMeta}>
                        Sponsor: {wizardHasSponsor ? "Enabled" : "Not enabled"}
                      </Text>
                      <Text style={styles.sectionMeta}>
                        Sponsor reminders: {wizardWantsReminders ? "Enabled" : "Disabled"}
                      </Text>
                      <Text style={styles.sectionMeta}>
                        Home group:{" "}
                        {homeGroupMeetingIds.length > 0
                          ? (allMeetings.find((meeting) => meeting.id === homeGroupMeetingIds[0])
                              ?.name ?? "Selected")
                          : "Not selected"}
                      </Text>
                    </>
                  ) : null}

                  {setupError ? <Text style={styles.errorText}>{setupError}</Text> : null}

                  <View style={styles.buttonRow}>
                    {setupStep > 1 ? (
                      <>
                        <AppButton title="Back" onPress={previousSetupStep} />
                        <View style={styles.buttonSpacer} />
                      </>
                    ) : null}
                    {setupStep < 5 ? (
                      <AppButton title="Next" onPress={() => void nextSetupStep()} />
                    ) : (
                      <AppButton title="Save & Finish" onPress={() => void finishSetup()} />
                    )}
                  </View>
                </GlassCard>
              ) : null}

              {homeScreen === "DASHBOARD" ? (
                <Dashboard
                  daysSober={daysSober}
                  sobrietyDateLabel={formatIsoToDdMmYyyy(sobrietyDateIso)}
                  insight={soberInsight}
                  locationEnabled={locationPermission === "granted"}
                  nextMeetings={dashboardNextThreeMeetings}
                  homeGroupMeeting={
                    homeGroupUpcoming
                      ? {
                          ...homeGroupUpcoming,
                          distanceMeters:
                            currentLocation &&
                            homeGroupUpcoming.lat !== null &&
                            homeGroupUpcoming.lng !== null
                              ? distanceMetersBetween(
                                  currentLocation.lat,
                                  currentLocation.lng,
                                  homeGroupUpcoming.lat,
                                  homeGroupUpcoming.lng,
                                )
                              : null,
                        }
                      : null
                  }
                  meetingsAttendedInNinetyDays={meetingsAttendedInNinetyDays}
                  ninetyDayGoalTarget={ninetyDayGoalTarget}
                  ninetyDayProgressPct={ninetyDayProgressPct}
                  meetingBarsLast7={meetingsLast7Bars}
                  sponsorAdherence={sponsorAdherence}
                  sponsorBarsLast14={sponsorLast14Bars}
                  morningRoutine={morningRoutineStats}
                  nightlyInventory={nightlyInventoryStats}
                  routineInsights={routineInsights}
                  onMeetingPress={(meetingId) => {
                    const meeting =
                      meetingsForDay.find((entry) => entry.id === meetingId) ??
                      meetingsTodayUpcoming.find((entry) => entry.id === meetingId);
                    if (!meeting) {
                      return;
                    }
                    setHomeScreen("MEETINGS");
                    setSelectedMeeting(meeting);
                    setScreen("DETAIL");
                  }}
                  onSearchArea={() => {
                    void searchMeetingsFromDashboard();
                  }}
                  onCallSponsor={() => {
                    void openPhoneCall();
                  }}
                  onOpenMorningRoutine={openMorningRoutine}
                  onOpenNightlyInventory={openNightlyInventory}
                  onOpenMeetings={openMeetingsHub}
                  onOpenRecoverySettings={openSettingsHub}
                  onOpenAttendance={openAttendanceHub}
                  onOpenTools={openToolsHub}
                  onOpenSoberHousingSettings={openSoberHousingSettings}
                  onOpenProbationParoleSettings={openProbationParoleSettings}
                  onRefresh={() => {
                    void (async () => {
                      const location = await requestLocationPermission();
                      await refreshMeetings({ location });
                    })();
                  }}
                  onLogMeeting={(meetingId) => {
                    void logUpcomingMeetingFromDashboard(meetingId);
                  }}
                  onLearnMore={openSettingsHub}
                />
              ) : null}

              {homeScreen === "MEETINGS" ? (
                <GlassCard style={styles.card} strong>
                  <View style={styles.inlineRow}>
                    <Text style={styles.sectionTitle}>Meetings</Text>
                    <AppButton
                      title="Back to Dashboard"
                      onPress={openDashboard}
                      variant="secondary"
                    />
                  </View>

                  <Text style={styles.sectionMeta}>
                    Upcoming meetings for {selectedDay.label} within {meetingRadiusMiles} miles.
                  </Text>
                  <Text style={styles.sectionMeta}>{meetingsStatus}</Text>
                  {meetingsError ? <Text style={styles.errorText}>{meetingsError}</Text> : null}

                  <View style={styles.buttonRow}>
                    <AppButton title="Refresh meetings" onPress={() => void refreshMeetings()} />
                    <View style={styles.buttonSpacer} />
                    <AppButton
                      title="Use current location"
                      onPress={() => {
                        void (async () => {
                          const position = await requestLocationPermission();
                          await refreshMeetings({ location: position });
                        })();
                      }}
                      variant="secondary"
                    />
                  </View>

                  <Text style={styles.label}>Format</Text>
                  <View style={styles.chipRow}>
                    {MEETINGS_FORMAT_OPTIONS.map((option) => (
                      <Pressable
                        key={option.value}
                        style={[
                          styles.chip,
                          meetingsFormatFilter === option.value ? styles.chipSelected : null,
                        ]}
                        onPress={() => setMeetingsFormatFilter(option.value)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            meetingsFormatFilter === option.value ? styles.chipTextSelected : null,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.label}>Day</Text>
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

                  <Text style={styles.label}>Time</Text>
                  <View style={styles.chipRow}>
                    {MEETINGS_TIME_OPTIONS.map((option) => (
                      <Pressable
                        key={option.value}
                        style={[
                          styles.chip,
                          meetingsTimeFilter === option.value ? styles.chipSelected : null,
                        ]}
                        onPress={() => setMeetingsTimeFilter(option.value)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            meetingsTimeFilter === option.value ? styles.chipTextSelected : null,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {loadingMeetings ? (
                    <Text style={styles.sectionMeta}>Loading meetings...</Text>
                  ) : null}

                  {screen === "LIST" ? (
                    <>
                      {meetingsForMeetingsScreen.map((meeting) => (
                        <View key={meeting.id} style={styles.meetingCard}>
                          <Text style={styles.meetingName}>{meeting.name}</Text>
                          <Text style={styles.sectionMeta}>
                            {formatHhmmForDisplay(meeting.startsAtLocal)} •{" "}
                            {meeting.format || "Unknown"}
                          </Text>
                          <Text style={styles.sectionMeta}>
                            {meeting.format === "ONLINE"
                              ? "Online"
                              : meeting.address || "Unknown address"}{" "}
                            • {formatDistance(meeting.distanceMeters)}
                          </Text>

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
                      ))}

                      {!loadingMeetings && meetingsForMeetingsScreen.length === 0 ? (
                        <Text style={styles.sectionMeta}>
                          {selectedDayIsPast
                            ? "No upcoming meetings for a past day."
                            : selectedDayIsToday
                              ? "No upcoming meetings remaining today."
                              : "No upcoming meetings for this day."}
                        </Text>
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
                        {formatHhmmForDisplay(selectedMeeting.startsAtLocal)} •{" "}
                        {selectedMeeting.openness || "Unknown"} •{" "}
                        {selectedMeeting.format || "Unknown"}
                      </Text>

                      <Pressable
                        style={styles.checkboxRow}
                        onPress={() => toggleHomeGroupMeeting(selectedMeeting.id)}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            selectedMeetingIsHomeGroup ? styles.checkboxChecked : null,
                          ]}
                        >
                          {selectedMeetingIsHomeGroup ? (
                            <Text style={styles.checkboxTick}>✓</Text>
                          ) : null}
                        </View>
                        <Text style={styles.label}>Home group</Text>
                      </Pressable>

                      <View style={styles.inlineRowGap}>
                        <Text style={styles.sectionMeta}>Arrive early (mins)</Text>
                        <TextInput
                          style={styles.smallInput}
                          value={String(selectedMeetingPlan.earlyMinutes)}
                          keyboardType="number-pad"
                          maxLength={2}
                          onChangeText={(value) =>
                            setMeetingEarlyMinutes(selectedMeeting.id, value)
                          }
                        />
                      </View>

                      <View style={styles.inlineRowGap}>
                        <Text style={styles.sectionMeta}>End meeting (mins)</Text>
                        <TextInput
                          style={styles.smallInput}
                          value={String(
                            selectedMeetingPlan.serviceCommitmentMinutes ??
                              DEFAULT_SERVICE_COMMITMENT_MINUTES,
                          )}
                          keyboardType="number-pad"
                          maxLength={2}
                          editable={selectedMeetingIsHomeGroup}
                          onChangeText={(value) =>
                            setServiceCommitmentMinutes(selectedMeeting.id, value)
                          }
                        />
                      </View>
                      {!selectedMeetingIsHomeGroup ? (
                        <Text style={styles.sectionMeta}>
                          Select home group to edit end meeting minutes.
                        </Text>
                      ) : null}

                      <View style={styles.buttonRow}>
                        <AppButton title="Back to list" onPress={() => setScreen("LIST")} />
                        <View style={styles.buttonSpacer} />
                        <AppButton
                          title="Drive now"
                          onPress={() => void openMeetingDestination(selectedMeeting)}
                          variant="secondary"
                        />
                      </View>

                      {selectedMeeting.onlineUrl ? (
                        <View style={styles.buttonRow}>
                          <AppButton
                            title="Open meeting link"
                            onPress={() =>
                              void Linking.openURL(selectedMeeting.onlineUrl as string)
                            }
                            variant="secondary"
                          />
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </GlassCard>
              ) : null}

              {homeScreen === "ATTENDANCE" ? (
                <GlassCard style={styles.card} strong>
                  <View style={styles.inlineRow}>
                    <Text style={styles.sectionTitle}>Meeting Attendance</Text>
                    <AppButton
                      title="Back to Dashboard"
                      onPress={openDashboard}
                      variant="secondary"
                    />
                  </View>
                  <Text style={styles.sectionMeta}>{attendanceStatus}</Text>

                  <View style={styles.buttonRow}>
                    <AppButton
                      title="Select all"
                      onPress={selectAllAttendance}
                      variant="secondary"
                    />
                    <View style={styles.buttonSpacer} />
                    <AppButton
                      title="Select none"
                      onPress={clearAttendanceSelection}
                      variant="secondary"
                    />
                  </View>

                  <View style={styles.buttonRow}>
                    <AppButton
                      title={
                        exportingAttendanceSelectionPdf
                          ? "Exporting..."
                          : `Export selected (${selectedAttendanceIds.length})`
                      }
                      onPress={() => void exportSelectedAttendance()}
                      disabled={exportingAttendanceSelectionPdf}
                    />
                  </View>

                  {attendanceRecords.length === 0 ? (
                    <Text style={styles.sectionMeta}>No attendance records yet.</Text>
                  ) : (
                    attendanceRecords.map((record) => {
                      const selected = selectedAttendanceIds.includes(record.id);
                      return (
                        <Pressable
                          key={record.id}
                          style={[styles.historyCard, selected ? styles.chipSelected : null]}
                          onPress={() => toggleAttendanceSelection(record.id)}
                        >
                          <Text style={styles.meetingName}>{record.meetingName}</Text>
                          <Text style={styles.sectionMeta}>
                            Start: {new Date(record.startAt).toLocaleString()}
                          </Text>
                          <Text style={styles.sectionMeta}>
                            End:{" "}
                            {record.endAt ? new Date(record.endAt).toLocaleString() : "In progress"}
                          </Text>
                          <Text style={styles.sectionMeta}>
                            Duration: {formatDuration(record.durationSeconds)} • Signature:{" "}
                            {record.signaturePngBase64 ? "Yes" : "No"}
                          </Text>
                          <Text style={styles.sectionMeta}>
                            {selected ? "Selected for export" : "Tap to select for export"}
                          </Text>
                        </Pressable>
                      );
                    })
                  )}
                </GlassCard>
              ) : null}

              {homeScreen === "TOOLS" ? (
                <>
                  {routinesStatus ? (
                    <GlassCard style={styles.card} strong>
                      <Text style={styles.sectionMeta}>{routinesStatus}</Text>
                    </GlassCard>
                  ) : null}

                  {toolsScreen === "HOME" ? (
                    <ToolsRoutinesScreen
                      morningStats={morningRoutineStats}
                      nightlyStats={nightlyInventoryStats}
                      insights={routineInsights}
                      onOpenMorning={openMorningRoutine}
                      onOpenNightly={openNightlyInventory}
                    />
                  ) : null}

                  {toolsScreen === "MORNING" ? (
                    <MorningRoutineScreen
                      template={routinesStore.morningTemplate}
                      dayState={morningRoutineDayState}
                      dateLabel={routineDateKey}
                      onBack={() => setToolsScreen("HOME")}
                      onToggleItem={(itemId) => {
                        updateMorningDayState((day) => {
                          const completedByItemId = { ...day.completedByItemId };
                          if (completedByItemId[itemId]) {
                            delete completedByItemId[itemId];
                          } else {
                            completedByItemId[itemId] = new Date().toISOString();
                          }
                          const totalCount = routinesStore.morningTemplate.items.length;
                          const nextCompletedAt =
                            totalCount > 0 && Object.keys(completedByItemId).length >= totalCount
                              ? new Date().toISOString()
                              : null;
                          return {
                            ...day,
                            completedByItemId,
                            completedAt: nextCompletedAt,
                          };
                        });
                      }}
                      onSetSponsorSuggestions={(value) =>
                        updateMorningTemplate((template) => ({
                          ...template,
                          sponsorSuggestions: value,
                        }))
                      }
                      onSetDailyReflectionsLink={(value) =>
                        updateMorningTemplate((template) => ({
                          ...template,
                          dailyReflectionsLink: value,
                        }))
                      }
                      onSetDailyReflectionsText={(value) =>
                        updateMorningTemplate((template) => ({
                          ...template,
                          dailyReflectionsText: value,
                        }))
                      }
                      onSetNotes={(value) =>
                        updateMorningDayState((day) => ({
                          ...day,
                          notes: value,
                        }))
                      }
                      onSetItemDetail={(itemId, detail) =>
                        updateMorningTemplate((template) => ({
                          ...template,
                          items: template.items.map((item) =>
                            item.id === itemId ? { ...item, detail } : item,
                          ),
                        }))
                      }
                      onOpenReader={openRoutineReader}
                      onReadDailyReflections={openDailyReflectionsRead}
                      onListenDailyReflections={() => {
                        void openDailyReflectionsListen();
                      }}
                      onListenText={speakRoutineText}
                      onRecordItem={(itemId) => void recordRoutineItem(itemId)}
                      onPlayItem={(itemId) => void playRoutineItemAudio(itemId)}
                      onAddCustomPrayer={() =>
                        updateMorningTemplate((template) => ({
                          ...template,
                          customPrayers: [
                            ...template.customPrayers,
                            { id: createId("prayer"), title: "Custom Prayer", text: "" },
                          ],
                        }))
                      }
                      onUpdateCustomPrayer={(id, value) =>
                        updateMorningTemplate((template) => ({
                          ...template,
                          customPrayers: template.customPrayers.map((prayer) =>
                            prayer.id === id ? { ...prayer, text: value } : prayer,
                          ),
                        }))
                      }
                      onRemoveCustomPrayer={(id) =>
                        updateMorningTemplate((template) => ({
                          ...template,
                          customPrayers: template.customPrayers.filter(
                            (prayer) => prayer.id !== id,
                          ),
                        }))
                      }
                      onAddMeditationLink={() =>
                        updateMorningTemplate((template) => ({
                          ...template,
                          meditationLinks: [
                            ...template.meditationLinks,
                            { id: createId("meditation"), title: "", url: "" },
                          ],
                        }))
                      }
                      onUpdateMeditationLink={(id, link) =>
                        updateMorningTemplate((template) => ({
                          ...template,
                          meditationLinks: template.meditationLinks.map((entry) =>
                            entry.id === id ? link : entry,
                          ),
                        }))
                      }
                      onRemoveMeditationLink={(id) =>
                        updateMorningTemplate((template) => ({
                          ...template,
                          meditationLinks: template.meditationLinks.filter(
                            (entry) => entry.id !== id,
                          ),
                        }))
                      }
                      onExportPdf={() => void exportMorningRoutineForToday()}
                    />
                  ) : null}

                  {toolsScreen === "NIGHTLY" ? (
                    <NightlyInventoryScreen
                      dayState={nightlyInventoryDayState}
                      dateLabel={routineDateKey}
                      onBack={() => setToolsScreen("HOME")}
                      onAddEntry={(category) =>
                        updateNightlyDayState((day) => ({
                          ...day,
                          [category]: [
                            ...day[category],
                            { id: createId(`nightly-${category}`), text: "" },
                          ],
                        }))
                      }
                      onUpdateEntry={(category, id, value) =>
                        updateNightlyCategoryEntry(category, id, value)
                      }
                      onRemoveEntry={(category, id) =>
                        updateNightlyDayState((day) => ({
                          ...day,
                          [category]: day[category].filter((entry) => entry.id !== id),
                        }))
                      }
                      onSetNotes={(value) =>
                        updateNightlyDayState((day) => ({
                          ...day,
                          notes: value,
                        }))
                      }
                      onToggleCompleted={() =>
                        updateNightlyDayState(
                          (day) => ({
                            ...day,
                            completedAt: day.completedAt ? null : new Date().toISOString(),
                          }),
                          "Nightly inventory saved.",
                        )
                      }
                      onTextSponsor={() => void textNightlyToSponsor()}
                      onExportPdf={() => void exportNightlyInventoryForToday()}
                    />
                  ) : null}

                  {toolsScreen === "READER" ? (
                    <RoutineReaderScreen
                      title={routineReader?.title ?? "Routine Reader"}
                      url={routineReader?.url ?? null}
                      onBack={() => setToolsScreen("MORNING")}
                      onOpenLink={(url) => void openRoutineReaderLink(url)}
                    />
                  ) : null}
                </>
              ) : null}

              {homeScreen === "SETTINGS" ? (
                <>
                  <GlassCard style={styles.card} strong>
                    <Text style={styles.sectionTitle}>Recovery Settings</Text>
                    <Text style={styles.sectionMeta}>
                      Configure sponsor reminders, meeting planning, and attendance options.
                    </Text>
                    <View style={styles.buttonRow}>
                      <AppButton title="Open dashboard" onPress={openDashboard} />
                      <View style={styles.buttonSpacer} />
                      <AppButton title="Run setup wizard" onPress={restartSetup} />
                    </View>
                  </GlassCard>

                  <GlassCard style={styles.card} strong>
                    <Text style={styles.sectionTitle}>Sobriety Date</Text>
                    <Text style={styles.sectionMeta}>
                      Used for Days Sober on the dashboard. Format: MM/DD/YYYY
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={sobrietyDateInput}
                      onChangeText={(value) => {
                        setSobrietyDateInput(normalizeUsDateInput(value));
                        setSobrietyDateStatus(null);
                      }}
                      placeholder="MM/DD/YYYY"
                      keyboardType="number-pad"
                      maxLength={10}
                    />
                    <Text style={styles.sectionMeta}>
                      Current: {sobrietyDateIso ? formatIsoToDdMmYyyy(sobrietyDateIso) : "Not set"}
                    </Text>
                    <Text style={styles.label}>90-day meeting goal</Text>
                    <TextInput
                      style={styles.input}
                      value={ninetyDayGoalInput}
                      onChangeText={(value) => {
                        setNinetyDayGoalInput(normalizeGoalInput(value));
                        setSobrietyDateStatus(null);
                      }}
                      placeholder="90"
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                    <Text style={styles.sectionMeta}>Current goal: {ninetyDayGoalTarget}</Text>
                    {sobrietyDateStatus ? (
                      <Text style={styles.sectionMeta}>{sobrietyDateStatus}</Text>
                    ) : null}
                    <Text style={styles.sectionMeta}>{milestoneCalendarStatus}</Text>
                    <View style={styles.buttonRow}>
                      <AppButton title="Save date" onPress={saveSobrietyDateFromSettings} />
                      <View style={styles.buttonSpacer} />
                      <AppButton title="Clear date" onPress={clearSobrietyDateFromSettings} />
                    </View>
                    <View style={styles.buttonRow}>
                      <AppButton title="Save goal" onPress={saveNinetyDayGoalFromSettings} />
                      <View style={styles.buttonSpacer} />
                      <AppButton title="Reset goal" onPress={resetNinetyDayGoalFromSettings} />
                    </View>
                  </GlassCard>
                  <GlassCard style={styles.card} strong>
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
                      <Text style={styles.sectionMeta}>
                        Sponsor is disabled. Turn on to configure.
                      </Text>
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
                          onChangeText={(value) =>
                            setSponsorPhoneDigits(normalizePhoneDigits(value))
                          }
                          keyboardType="phone-pad"
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
                              <Pressable
                                style={styles.stepButton}
                                onPress={() => incrementHour(-1)}
                              >
                                <Text style={styles.stepButtonText}>-</Text>
                              </Pressable>
                              <Text style={styles.timeValue}>
                                {String(sponsorHour12).padStart(2, "0")}
                              </Text>
                              <Pressable style={styles.stepButton} onPress={() => incrementHour(1)}>
                                <Text style={styles.stepButtonText}>+</Text>
                              </Pressable>

                              <Text style={styles.timeDivider}>:</Text>

                              <Pressable
                                style={styles.stepButton}
                                onPress={() => incrementMinute(-1)}
                              >
                                <Text style={styles.stepButtonText}>-</Text>
                              </Pressable>
                              <Text style={styles.timeValue}>
                                {String(sponsorMinute).padStart(2, "0")}
                              </Text>
                              <Pressable
                                style={styles.stepButton}
                                onPress={() => incrementMinute(1)}
                              >
                                <Text style={styles.stepButtonText}>+</Text>
                              </Pressable>

                              <Pressable
                                style={styles.meridiemButton}
                                onPress={() =>
                                  setSponsorMeridiem((current) => (current === "AM" ? "PM" : "AM"))
                                }
                              >
                                <Text style={styles.meridiemText}>{sponsorMeridiem}</Text>
                              </Pressable>
                            </View>

                            <Text style={styles.label}>Repeat</Text>
                            <View style={styles.chipRow}>
                              {SPONSOR_REPEAT_OPTIONS.map((option) => (
                                <Pressable
                                  key={option.value}
                                  style={[
                                    styles.chip,
                                    sponsorRepeatPreset === option.value
                                      ? styles.chipSelected
                                      : null,
                                  ]}
                                  onPress={() => setSponsorRepeatPreset(option.value)}
                                >
                                  <Text
                                    style={[
                                      styles.chipText,
                                      sponsorRepeatPreset === option.value
                                        ? styles.chipTextSelected
                                        : null,
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
                                      style={[
                                        styles.chip,
                                        sponsorRepeatDays.includes(day.code)
                                          ? styles.chipSelected
                                          : null,
                                      ]}
                                      onPress={() => toggleRepeatDay(day.code)}
                                    >
                                      <Text
                                        style={[
                                          styles.chipText,
                                          sponsorRepeatDays.includes(day.code)
                                            ? styles.chipTextSelected
                                            : null,
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
                                  style={[
                                    styles.chip,
                                    sponsorLeadMinutes === option.value
                                      ? styles.chipSelected
                                      : null,
                                  ]}
                                  onPress={() => setSponsorLeadMinutes(option.value)}
                                >
                                  <Text
                                    style={[
                                      styles.chipText,
                                      sponsorLeadMinutes === option.value
                                        ? styles.chipTextSelected
                                        : null,
                                    ]}
                                  >
                                    {option.label}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          </>
                        ) : (
                          <Text style={styles.sectionMeta}>
                            Turn reminders on to configure schedule + alerts.
                          </Text>
                        )}

                        {notificationOpenPhone ? (
                          <View style={styles.callNowBox}>
                            <Text style={styles.sectionMeta}>
                              {"Opened from notification: "}
                              {notificationOpenPhone}
                            </Text>
                            <AppButton
                              title="Call now"
                              onPress={() => void openPhoneCall(notificationOpenPhone)}
                            />
                          </View>
                        ) : null}
                        <Text style={styles.sectionMeta}>{sponsorStatusLine}</Text>
                        <AppButton
                          title={sponsorSaving ? "Saving..." : "Save Sponsor Config"}
                          onPress={() => void saveSponsorConfig()}
                          disabled={sponsorSaving}
                        />
                      </>
                    )}
                  </GlassCard>

                  {__DEV__ ? (
                    <GlassCard style={styles.card} strong>
                      <Text style={styles.sectionTitle}>Debug Notification Tools</Text>
                      <View style={styles.inlineRow}>
                        <Text style={styles.label}>Time compression</Text>
                        <Switch
                          value={debugTimeCompressionEnabled}
                          onValueChange={setDebugTimeCompressionEnabled}
                        />
                      </View>
                      <Text style={styles.sectionMeta}>
                        When enabled, scheduled notification delays are compressed for quick
                        simulator tests.
                      </Text>
                      <Text style={styles.sectionMeta}>
                        Notification debug: {notificationStatus}
                      </Text>
                      <Text style={styles.sectionMeta}>Calendar debug: {calendarStatus}</Text>
                      <View style={styles.buttonRow}>
                        <AppButton
                          title="Test sponsor alert in 10s"
                          onPress={() => void scheduleDebugSponsorNotification()}
                          variant="secondary"
                        />
                        <View style={styles.buttonSpacer} />
                        <AppButton
                          title="Test leave alert in 10s"
                          onPress={() => void scheduleDebugDriveNotification()}
                          variant="secondary"
                        />
                      </View>
                    </GlassCard>
                  ) : null}

                  <GlassCard style={styles.card} strong>
                    <View style={styles.inlineRow}>
                      <Text style={styles.sectionTitle}>Meetings</Text>
                      <Pressable
                        style={styles.viewModeButton}
                        onPress={() => {
                          setMeetingsViewMode((current) => (current === "LIST" ? "MAP" : "LIST"));
                          setSelectedLocationKey(null);
                        }}
                      >
                        <Text style={styles.viewModeButtonText}>
                          {meetingsViewMode === "LIST" ? "🗺 Map" : "☰ List"}
                        </Text>
                      </Pressable>
                    </View>
                    <Text style={styles.sectionMeta}>{meetingsStatus}</Text>
                    <Text style={styles.sectionMeta}>
                      Location: {locationPermission === "granted" ? "Enabled" : "Not enabled"}
                    </Text>
                    {locationPermission === "denied" ? (
                      <Text style={styles.errorText}>
                        Location disabled - enable to see meetings near you.
                      </Text>
                    ) : null}
                    <Text style={styles.sectionMeta}>
                      GPS:{" "}
                      {currentLocation
                        ? `${formatCoordinate(currentLocation.lat)}, ${formatCoordinate(currentLocation.lng)} accuracy ${Math.round(currentLocation.accuracyM ?? 0)}m`
                        : "Unavailable"}
                    </Text>
                    <Text style={styles.sectionMeta}>
                      Search origin:{" "}
                      {meetingsSearchOrigin
                        ? `${formatCoordinate(meetingsSearchOrigin.lat)}, ${formatCoordinate(meetingsSearchOrigin.lng)} radius ${meetingRadiusMiles}mi`
                        : `Unavailable radius ${meetingRadiusMiles}mi`}
                    </Text>
                    {meetingsError ? <Text style={styles.errorText}>{meetingsError}</Text> : null}

                    <View style={styles.buttonRow}>
                      <AppButton title="Refresh meetings" onPress={() => void refreshMeetings()} />
                      <View style={styles.buttonSpacer} />
                      <AppButton
                        title="Enable location"
                        onPress={() => {
                          void (async () => {
                            const position = await requestLocationPermission();
                            await refreshMeetings({ location: position });
                          })();
                        }}
                        variant="secondary"
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

                    {loadingMeetings ? (
                      <Text style={styles.sectionMeta}>Loading meetings...</Text>
                    ) : null}

                    {screen === "LIST" && meetingsViewMode === "MAP" ? (
                      <>
                        <Text style={styles.sectionMeta}>
                          Map view shows in-person meetings with location coordinates for the
                          selected day.
                        </Text>
                        {mapRegion ? (
                          <View style={styles.mapContainer}>
                            <MapViewCompat
                              ref={mapRef}
                              style={styles.map}
                              initialRegion={mapRegion}
                              region={mapRegion}
                              onRegionChangeComplete={onMapRegionChangeComplete}
                              showsUserLocation={locationPermission === "granted"}
                            >
                              {meetingLocationGroups.map((group) => (
                                <MarkerCompat
                                  key={group.key}
                                  coordinate={{ latitude: group.lat, longitude: group.lng }}
                                  onPress={() => setSelectedLocationKey(group.key)}
                                  pinColor={group.meetings.length > 1 ? "#9c4221" : "#155eef"}
                                />
                              ))}
                            </MapViewCompat>

                            {mapDraggedOutsideBoundary ? (
                              <View style={styles.mapBoundaryControls}>
                                <AppButton
                                  title="Return to boundary"
                                  onPress={returnToBoundary}
                                  variant="secondary"
                                />
                                <View style={styles.buttonSpacer} />
                                <AppButton
                                  title="Search this area"
                                  onPress={() => void searchThisArea()}
                                  variant="secondary"
                                />
                              </View>
                            ) : null}
                          </View>
                        ) : (
                          <Text style={styles.sectionMeta}>
                            Enable location to initialize the map view.
                          </Text>
                        )}

                        {selectedLocationGroup ? (
                          selectedLocationGroup.meetings.length === 1 ? (
                            <Pressable
                              style={styles.mapMeetingCard}
                              onPress={() => {
                                setSelectedMeeting(selectedLocationGroup.meetings[0]);
                                setScreen("DETAIL");
                              }}
                            >
                              <Text style={styles.meetingName}>
                                {selectedLocationGroup.meetings[0].name}
                              </Text>
                              <Text style={styles.sectionMeta}>
                                {selectedLocationGroup.address}
                              </Text>
                              <Text style={styles.sectionMeta}>
                                {formatHhmmForDisplay(
                                  selectedLocationGroup.meetings[0].startsAtLocal,
                                )}
                              </Text>
                            </Pressable>
                          ) : (
                            <View style={styles.mapMeetingCard}>
                              <Text style={styles.meetingName}>Meetings at this location</Text>
                              <Text style={styles.sectionMeta}>
                                {selectedLocationGroup.address}
                              </Text>
                              {selectedLocationGroup.meetings.map((meeting) => (
                                <Pressable
                                  key={meeting.id}
                                  style={styles.mapMeetingRow}
                                  onPress={() => {
                                    setSelectedMeeting(meeting);
                                    setScreen("DETAIL");
                                  }}
                                >
                                  <Text style={styles.detailButtonText}>
                                    {formatHhmmForDisplay(meeting.startsAtLocal)} • {meeting.name}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          )
                        ) : null}

                        {!loadingMeetings && meetingLocationGroups.length === 0 ? (
                          <Text style={styles.sectionMeta}>
                            No in-person meetings with coordinates for this day.
                          </Text>
                        ) : null}
                      </>
                    ) : null}

                    {screen === "LIST" && meetingsViewMode === "LIST" ? (
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
                                {formatHhmmForDisplay(meeting.startsAtLocal)} •{" "}
                                {meeting.openness || "Unknown"} • {meeting.format || "Unknown"}
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
                                  style={[
                                    styles.checkbox,
                                    plan.going ? styles.checkboxChecked : null,
                                  ]}
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
                                      maxLength={2}
                                      onChangeText={(value) =>
                                        setMeetingEarlyMinutes(meeting.id, value)
                                      }
                                    />
                                  </View>

                                  <View style={styles.inlineRowGap}>
                                    <AppButton
                                      title={isHomeGroup ? "Unset home group" : "Set as home group"}
                                      onPress={() => toggleHomeGroupMeeting(meeting.id)}
                                      variant="secondary"
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
                                        maxLength={2}
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
                          <Text style={styles.sectionMeta}>
                            {selectedDayIsPast
                              ? "No upcoming meetings for a past day."
                              : selectedDayIsToday
                                ? "No upcoming meetings remaining today."
                                : "No upcoming meetings for this day."}
                          </Text>
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
                          {formatHhmmForDisplay(selectedMeeting.startsAtLocal)} •{" "}
                          {selectedMeeting.openness || "Unknown"} •{" "}
                          {selectedMeeting.format || "Unknown"}
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

                        <Pressable
                          style={styles.checkboxRow}
                          onPress={() => toggleHomeGroupMeeting(selectedMeeting.id)}
                        >
                          <View
                            style={[
                              styles.checkbox,
                              selectedMeetingIsHomeGroup ? styles.checkboxChecked : null,
                            ]}
                          >
                            {selectedMeetingIsHomeGroup ? (
                              <Text style={styles.checkboxTick}>✓</Text>
                            ) : null}
                          </View>
                          <Text style={styles.label}>Home group</Text>
                        </Pressable>

                        <View style={styles.inlineRowGap}>
                          <Text style={styles.sectionMeta}>Arrive early (mins)</Text>
                          <TextInput
                            style={styles.smallInput}
                            value={String(selectedMeetingPlan.earlyMinutes)}
                            keyboardType="number-pad"
                            maxLength={2}
                            onChangeText={(value) =>
                              setMeetingEarlyMinutes(selectedMeeting.id, value)
                            }
                          />
                        </View>

                        <View style={styles.inlineRowGap}>
                          <Text style={styles.sectionMeta}>End meeting (mins)</Text>
                          <TextInput
                            style={styles.smallInput}
                            value={String(
                              selectedMeetingPlan.serviceCommitmentMinutes ??
                                DEFAULT_SERVICE_COMMITMENT_MINUTES,
                            )}
                            keyboardType="number-pad"
                            maxLength={2}
                            editable={selectedMeetingIsHomeGroup}
                            onChangeText={(value) =>
                              setServiceCommitmentMinutes(selectedMeeting.id, value)
                            }
                          />
                        </View>
                        {!selectedMeetingIsHomeGroup ? (
                          <Text style={styles.sectionMeta}>
                            Select home group to edit end meeting minutes.
                          </Text>
                        ) : null}

                        <View style={styles.buttonRow}>
                          <AppButton title="Back" onPress={() => setScreen("LIST")} />
                          <View style={styles.buttonSpacer} />
                          <AppButton
                            title="Drive now"
                            onPress={() => void openMeetingDestination(selectedMeeting)}
                            variant="secondary"
                          />
                        </View>

                        {selectedMeeting.onlineUrl ? (
                          <View style={styles.buttonRow}>
                            <AppButton
                              title="Open meeting link"
                              onPress={() =>
                                void Linking.openURL(selectedMeeting.onlineUrl as string)
                              }
                              variant="secondary"
                            />
                          </View>
                        ) : null}

                        <View style={styles.buttonRow}>
                          <AppButton
                            title="Start attendance"
                            onPress={() => void startAttendance(selectedMeeting)}
                          />
                          <View style={styles.buttonSpacer} />
                          <AppButton
                            title="Mark attended"
                            onPress={() => markMeetingAttended(selectedMeeting)}
                            variant="secondary"
                          />
                        </View>

                        <Text style={styles.sectionMeta}>
                          Arrival watcher: you will be prompted when within ~200 ft on iOS.
                        </Text>
                      </View>
                    ) : null}
                  </GlassCard>

                  {(screen === "SESSION" || screen === "SIGNATURE") && activeAttendance ? (
                    <GlassCard style={styles.card} strong>
                      <Text style={styles.sectionTitle}>Verified Attendance</Text>
                      <Text style={styles.sectionMeta}>{attendanceStatus}</Text>
                      <Text style={styles.sectionMeta}>
                        Meeting: {activeAttendance.meetingName}
                      </Text>
                      <Text style={styles.sectionMeta}>
                        Started: {new Date(activeAttendance.startAt).toLocaleString()}
                      </Text>
                      <Text style={styles.sectionMeta}>
                        Duration: {formatDuration(openSessionDurationSeconds)}
                      </Text>

                      {!activeAttendance.endAt ? (
                        <AppButton title="End attendance" onPress={() => void endAttendance()} />
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
                            <AppButton title="Back to meetings" onPress={() => setScreen("LIST")} />
                            <View style={styles.buttonSpacer} />
                            <AppButton
                              title="Add signature"
                              onPress={() => setScreen("SIGNATURE")}
                            />
                          </View>

                          <View style={styles.buttonRow}>
                            <AppButton
                              title={exportingPdf ? "Exporting..." : "Export attendance PDF"}
                              onPress={() => void exportAttendance()}
                              disabled={exportingPdf}
                            />
                          </View>
                        </>
                      ) : null}

                      <Text style={styles.sectionMeta}>
                        PDF file name: {ATTENDANCE_PDF_FILE_NAME}
                      </Text>
                    </GlassCard>
                  ) : null}

                  {screen === "SIGNATURE" && activeAttendance ? (
                    <GlassCard style={styles.card} strong>
                      <Text style={styles.sectionTitle}>Signature Capture</Text>
                      <Text style={styles.sectionMeta}>
                        Draw chairperson signature with finger.
                      </Text>

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
                        <AppButton title="Back" onPress={() => setScreen("SESSION")} />
                        <View style={styles.buttonSpacer} />
                        <AppButton title="Clear" onPress={() => setSignaturePoints([])} />
                        <View style={styles.buttonSpacer} />
                        <AppButton title="Save" onPress={saveSignature} />
                      </View>
                    </GlassCard>
                  ) : null}

                  <GlassCard style={styles.card} strong>
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
                  </GlassCard>

                  <GlassCard style={styles.card} strong>
                    <AppButton
                      title="Save Recovery Settings"
                      onPress={() => void saveRecoveryTileAndOpenDashboard()}
                    />
                  </GlassCard>
                </>
              ) : null}
            </>
          ) : null}

          {mode !== "A" && homeScreen === "SETTINGS" ? (
            <>
              <GlassCard style={styles.card} strong>
                <Text style={styles.sectionTitle}>
                  {mode === "B" ? "Sober Housing Settings" : "Probation/Parole Settings"}
                </Text>
                <Text style={styles.sectionMeta}>
                  {mode === "B"
                    ? "Configure sober housing rules, check-ins, and reporting preferences."
                    : "Configure probation/parole rules, reporting windows, and reminder preferences."}
                </Text>
                <View style={styles.buttonRow}>
                  <AppButton title="Back to Dashboard" onPress={() => handleModeSelect("A")} />
                </View>
              </GlassCard>

              <GlassCard style={styles.card} strong>
                <Text style={styles.sectionTitle}>Status</Text>
                <Text style={styles.sectionMeta}>
                  This settings page is active from the dashboard hamburger menu and reserved for
                  mode-specific configuration.
                </Text>
              </GlassCard>
            </>
          ) : null}
        </ScrollView>

        {shouldLockOuterScrollForDashboard ? (
          <View pointerEvents="none" style={styles.dashboardScrollFadeWrap}>
            <View style={[styles.dashboardScrollFadeBand, styles.dashboardScrollFadeBand1]} />
            <View style={[styles.dashboardScrollFadeBand, styles.dashboardScrollFadeBand2]} />
            <View style={[styles.dashboardScrollFadeBand, styles.dashboardScrollFadeBand3]} />
            <View style={[styles.dashboardScrollFadeBand, styles.dashboardScrollFadeBand4]} />
          </View>
        ) : null}

        {showFixedBottomMenu ? (
          <View style={styles.dashboardBottomMenuWrap} pointerEvents="box-none">
            <View style={styles.dashboardBottomMenu}>
              <View pointerEvents="none" style={styles.dashboardBottomMenuSheen} />
              <View pointerEvents="none" style={styles.dashboardBottomMenuInset} />
              <View style={styles.dashboardBottomTabsRow}>
                <Pressable
                  style={[
                    styles.dashboardTabItem,
                    homeScreen === "DASHBOARD" ? styles.dashboardTabItemActive : null,
                  ]}
                  onPress={openDashboard}
                >
                  <Text style={styles.dashboardTabIcon}>📈</Text>
                  <Text
                    style={
                      homeScreen === "DASHBOARD"
                        ? styles.dashboardTabTextActive
                        : styles.dashboardTabText
                    }
                  >
                    Dashboard
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.dashboardTabItem,
                    homeScreen === "MEETINGS" ? styles.dashboardTabItemActive : null,
                  ]}
                  onPress={openMeetingsHub}
                >
                  <Text style={styles.dashboardTabIcon}>🗓</Text>
                  <Text
                    style={
                      homeScreen === "MEETINGS"
                        ? styles.dashboardTabTextActive
                        : styles.dashboardTabText
                    }
                  >
                    Meetings
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.dashboardTabItem,
                    homeScreen === "TOOLS" ? styles.dashboardTabItemActive : null,
                  ]}
                  onPress={openToolsHub}
                >
                  <Text style={styles.dashboardTabIcon}>👥</Text>
                  <Text
                    style={
                      homeScreen === "TOOLS"
                        ? styles.dashboardTabTextActive
                        : styles.dashboardTabText
                    }
                  >
                    Tools
                  </Text>
                </Pressable>
                <Pressable style={styles.dashboardTabItem} onPress={openSettingsHub}>
                  <Text style={styles.dashboardTabIcon}>•••</Text>
                  <Text style={styles.dashboardTabText}>More</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        <StatusBar style="light" />
      </KeyboardAvoidingView>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  contentContainer: {
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 140,
    gap: 12,
  },
  contentContainerWithFooterNav: {
    paddingBottom: 8,
  },
  scrollViewWithFooterNav: {
    marginBottom: DASHBOARD_FOOTER_NAV_HEIGHT,
  },
  dashboardScrollFadeWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: DASHBOARD_FOOTER_NAV_HEIGHT - 2,
    height: DASHBOARD_SCROLL_FADE_HEIGHT,
  },
  dashboardScrollFadeBand: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  dashboardScrollFadeBand1: {
    top: 0,
    height: 8,
    backgroundColor: "rgba(11,6,26,0.02)",
  },
  dashboardScrollFadeBand2: {
    top: 8,
    height: 8,
    backgroundColor: "rgba(11,6,26,0.08)",
  },
  dashboardScrollFadeBand3: {
    top: 16,
    height: 9,
    backgroundColor: "rgba(11,6,26,0.16)",
  },
  dashboardScrollFadeBand4: {
    top: 25,
    height: 9,
    backgroundColor: "rgba(11,6,26,0.26)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  hamburgerButton: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    minWidth: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  hamburgerText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 20,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    gap: 4,
  },
  modeChipSelected: {
    borderColor: colors.neonLavender,
    backgroundColor: "rgba(196,181,253,0.22)",
  },
  modeChipDisabled: {
    opacity: 0.65,
  },
  modeChipText: {
    color: colors.textSecondary,
    fontWeight: "600",
    textAlign: "center",
  },
  modeChipTextSelected: {
    color: colors.textPrimary,
  },
  modeComingSoon: {
    color: colors.textMuted,
    fontSize: 11,
  },
  card: {
    marginTop: Design.spacing.lg,
    padding: Design.spacing.lg,
    gap: Design.spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  sectionMeta: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  daysSoberValue: {
    fontSize: 36,
    fontWeight: "800",
    color: colors.textPrimary,
    lineHeight: 42,
  },
  errorText: {
    color: "#fecdd3",
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.textPrimary,
  },
  smallInput: {
    minWidth: 64,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: "center",
    color: colors.textPrimary,
  },
  label: {
    color: colors.textSecondary,
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
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  stepButtonText: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  timeValue: {
    minWidth: 28,
    textAlign: "center",
    fontWeight: "700",
    color: colors.textPrimary,
  },
  timeDivider: {
    fontWeight: "700",
    color: colors.textPrimary,
  },
  meridiemButton: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  meridiemText: {
    fontWeight: "600",
    color: colors.textPrimary,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    borderWidth: 1,
    borderColor: Design.color.chipStroke,
    borderRadius: Design.radius.chip,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Design.color.chipFill,
  },
  chipSelected: {
    borderColor: colors.neonLavender,
    backgroundColor: "rgba(196,181,253,0.22)",
  },
  chipText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  chipTextSelected: {
    color: colors.textPrimary,
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
    borderColor: "rgba(196,181,253,0.35)",
    borderRadius: 8,
    padding: 8,
    gap: 6,
    backgroundColor: "rgba(196,181,253,0.18)",
  },
  meetingCard: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 12,
    padding: 10,
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  meetingName: {
    fontWeight: "700",
    color: colors.textPrimary,
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
    borderColor: "rgba(255,255,255,0.5)",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  checkboxChecked: {
    borderColor: colors.purple500,
    backgroundColor: colors.purple500,
  },
  checkboxTick: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  detailButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.neonLavender,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  detailButtonText: {
    color: colors.textPrimary,
    fontWeight: "600",
  },
  viewModeButton: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  viewModeButtonText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  dashboardBottomMenuWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  dashboardBottomMenu: {
    position: "relative",
    paddingTop: 9,
    paddingBottom: Platform.OS === "ios" ? 20 : 10,
    paddingHorizontal: 8,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.1)",
    shadowColor: "rgba(31,38,135,0.85)",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    overflow: "hidden",
  },
  dashboardBottomMenuSheen: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: "62%",
    backgroundColor: "rgba(255,255,255,0.12)",
    opacity: 0.35,
  },
  dashboardBottomMenuInset: {
    position: "absolute",
    left: 1,
    right: 1,
    top: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  dashboardBottomTabsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  dashboardTabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 0,
    opacity: 0.9,
  },
  dashboardTabItemActive: {
    opacity: 1,
  },
  dashboardTabIcon: {
    color: Design.color.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  dashboardTabTextActive: {
    color: Design.color.textPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
  dashboardTabText: {
    color: Design.color.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  mapContainer: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    overflow: "hidden",
    minHeight: 280,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  map: {
    width: "100%",
    height: 280,
  },
  mapBoundaryControls: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(22,10,43,0.9)",
    borderRadius: 8,
    padding: 8,
  },
  mapMeetingCard: {
    borderWidth: 1,
    borderColor: "rgba(196,181,253,0.35)",
    borderRadius: 8,
    padding: 10,
    gap: 4,
    backgroundColor: "rgba(196,181,253,0.16)",
  },
  mapMeetingRow: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
    paddingTop: 8,
    marginTop: 4,
  },
  setupMeetingListScroll: {
    maxHeight: 320,
  },
  setupMeetingListContent: {
    gap: 8,
    paddingRight: 4,
  },
  homeGroupSelectedCard: {
    borderColor: colors.neonLavender,
    backgroundColor: "rgba(196,181,253,0.2)",
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.neonLavender,
  },
  signatureCanvas: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 8,
    height: 180,
    backgroundColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    position: "relative",
  },
  signaturePoint: {
    position: "absolute",
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#ffffff",
  },
  historyCard: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
    paddingTop: 8,
    gap: 2,
  },
});
