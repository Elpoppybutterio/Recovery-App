import AsyncStorage from "@react-native-async-storage/async-storage";
import { geocodeAsync } from "expo-location";
import type * as CalendarTypes from "expo-calendar";
import type * as NotificationsTypes from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Region } from "react-native-maps";
import Svg, { Path } from "react-native-svg";
import {
  AppState,
  type AppStateStatus,
  Alert,
  GestureResponderEvent,
  KeyboardAvoidingView,
  Linking,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import appJson from "./app.json";
import {
  createMeetingsSource,
  MeetingRecord,
  type MeetingsApiHealthEvent,
} from "./lib/meetings/source";
import {
  classifyGeo,
  distanceMiles,
  isValidLatLng,
  isTrustedGeoStatus,
  type MeetingGeoSource,
  type MeetingGeoStatus,
} from "./lib/geo/geoTrust";
import {
  estimateBase64Bytes as estimateSignatureBase64Bytes,
  loadSignatureFileSystemModule,
  looksLikeFileUri as looksLikeSignatureFileUri,
  normalizeSignatureValueToRef,
  type SignatureRef,
} from "./lib/signatures/signatureStore";
import { exportMorningRoutinePdf } from "./lib/pdf/exportMorningRoutinePdf";
import { exportNightlyInventoryPdf } from "./lib/pdf/exportNightlyInventoryPdf";
import {
  asFiniteNumber,
  formatDistanceMiles,
  haversineDistanceMeters,
  normalizeCoordinates,
} from "./lib/meetings/distance";
import {
  getCurrentLocation as getCurrentLocationFromService,
  refreshLocationPermissionStates as readLocationPermissionStates,
  requestAlwaysLocationPermission as requestAlwaysLocationPermissionFromService,
} from "./lib/services/locationService";
import { getDirectionsDuration } from "./lib/services/directionsService";
import { buildLeaveTimePlan } from "./lib/services/leaveTimePlanner";
import { getInsightForDay } from "./lib/recoveryInsights";
import { Dashboard } from "./lib/dashboard/Dashboard";
import { featureFlags } from "./lib/config/featureFlags";
import { createDefaultRoutinesStore } from "./lib/routines/defaults";
import { completeMorningItemIfEnabled, computeMorningCompletedAt } from "./lib/routines/completion";
import {
  DAILY_REFLECTIONS_ITEM_ID,
  DAILY_REFLECTIONS_URL,
  buildPendingDailyReflectionsCompletion,
  shouldCompletePendingDailyReflections,
  type PendingDailyReflectionsCompletion,
} from "./lib/routines/dailyReflections";
import { BIG_BOOK_60_63_READ_TEXT, BIG_BOOK_86_88_READ_TEXT } from "./lib/routines/bigBookTexts";
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
import { ChatComingSoonScreen } from "./screens/ChatComingSoonScreen";
import { RoutineReaderScreen } from "./screens/RoutineReaderScreen";
import { ToolsRoutinesScreen } from "./screens/ToolsRoutinesScreen";
import { SoberHouseSettingsScreen } from "./screens/SoberHouseSettingsScreen";
import {
  DiagnosticsScreen,
  type DiagnosticsExportAttempt,
  type DiagnosticsExportDebug,
  type DiagnosticsLocationStatus,
  type DiagnosticsMeetingsApiHealth,
} from "./screens/DiagnosticsScreen";
import {
  LEGACY_WISDOM_QUOTE,
  getLocalDailyWisdomQuote,
  getWisdomCacheKey,
  type DailyWisdomPayload,
} from "./lib/wisdom/daily";
const THIRD_STEP_PRAYER_ITEM_ID = "prayer-third-step";
const THIRD_STEP_PRAYER_YOUTUBE_URL = "https://www.youtube.com/watch?v=b63wxijyK2A";
const THIRD_STEP_PRAYER_READ_TEXT =
  "God, I offer myself to Thee—to build with me and to do with me as Thou wilt. Relieve me of the bondage of self, that I may better do Thy will. Take away my difficulties, that victory over them may bear witness to those I would help of Thy Power, Thy Love, and Thy Way of life. May I do Thy will always! Amen.";
const BIG_BOOK_86_88_ITEM_ID = "bb-86-88";
const BIG_BOOK_60_63_ITEM_ID = "bb-60-63";
const SEVENTH_STEP_PRAYER_ITEM_ID = "prayer-seventh-step";
const ELEVENTH_STEP_PRAYER_ITEM_ID = "prayer-eleventh-step";
const SEVENTH_STEP_PRAYER_READ_TEXT = [
  "My Creator, I am now willing that You should have all of me, good and bad.",
  "I pray that You now remove from me every single defect of character which stand in the way of my usefulness to You and my fellows.",
  "Grant me strength, as I go out from here to do Your bidding. Amen",
].join("\n\n");
const ELEVENTH_STEP_AM_PRAYER_TEXT = [
  "MORNING PRAYER",
  "God, direct my thinking today so that it be empty of self pity, dishonesty, self-will, self-seeking and fear. God, inspire my thinking, decisions and intuitions. Help me to relax and take it easy. Free me from doubt and indecision. Guide me through this day and show me my next step. God, show me what I need to do to take care of any problems. I ask all these things that I may be of maximum service to you and my fellow man. In the spirit of the Steps I pray. AMEN",
].join("\n\n");
const ELEVENTH_STEP_NIGHTLY_PRAYER_TEXT = [
  "NIGHTLY PRAYER",
  "God, forgive me where I have been resentful, selfish, dishonest or afraid today. Help me to not keep anything to myself but to discuss it all openly with another person - show me where I owe an apology and help me make it. Help me to be kind and loving to all people. Use me in the mainstream of life, God. Free me of worry, remorse or morbid (sick) reflections that I may be of usefulness to others. AMEN",
].join("\n\n");
const BIG_BOOK_ROUTINE_TEXT: Record<string, string> = {
  [BIG_BOOK_86_88_ITEM_ID]: BIG_BOOK_86_88_READ_TEXT,
  [BIG_BOOK_60_63_ITEM_ID]: BIG_BOOK_60_63_READ_TEXT,
};
const MORNING_PRAYER_ITEM_IDS = new Set<string>([
  THIRD_STEP_PRAYER_ITEM_ID,
  SEVENTH_STEP_PRAYER_ITEM_ID,
  ELEVENTH_STEP_PRAYER_ITEM_ID,
]);

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
  schemaVersion?: number;
  id: string;
  meetingId: string;
  meetingName: string;
  meetingAddress: string;
  meetingDayOfWeek?: number | null;
  scheduledStartsAtLocal?: string | null;
  meetingLat?: number | null;
  meetingLng?: number | null;
  meetingGeoStatus?: MeetingGeoStatus | null;
  meetingGeoSource?: MeetingGeoSource | null;
  meetingGeoReason?: string | null;
  meetingFormat?: "IN_PERSON" | "ONLINE" | "HYBRID";
  captureMethod?: "attend-log" | "signature";
  startAt: string;
  endAt: string | null;
  durationSeconds: number | null;
  startLat: number | null;
  startLng: number | null;
  startAccuracyM: number | null;
  endLat: number | null;
  endLng: number | null;
  endAccuracyM: number | null;
  inactive?: boolean;
  signaturePromptShown?: boolean;
  chairName?: string | null;
  chairRole?: string | null;
  signatureCapturedAtIso?: string | null;
  calendarEventId?: string | null;
  leaveNotificationId?: string | null;
  leaveNotificationAtIso?: string | null;
  signatureRef?: SignatureRef | null;
  // Legacy field kept for one-way migration from historical local storage.
  signaturePngBase64?: string | null;
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
type HomeScreen =
  | "SETUP"
  | "DASHBOARD"
  | "PRIVACY"
  | "MEETINGS"
  | "ATTENDANCE"
  | "CHAT"
  | "SETTINGS"
  | "TOOLS"
  | "DIAGNOSTICS";
type SetupStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type MeetingsFormatFilter = "ALL" | "IN_PERSON" | "ONLINE";
type MeetingsTimeFilter = "ANY" | "MORNING" | "AFTERNOON" | "EVENING";
type MeetingsLocationFilter = "CURRENT" | "MILES_50" | "MILES_100";
type MeetingsFilterDropdown = "FORMAT" | "DAY" | "TIME" | "LOCATION";
type ToolsScreen = "HOME" | "MORNING" | "NIGHTLY" | "READER";
type RoutineReaderBackScreen = "MORNING" | "NIGHTLY";
type AttendanceViewFilter = "ALL" | "TODAY";
type AttendanceValidityFilter = "ALL" | "VALID_ONLY" | "INVALID_ONLY";
type AttendanceEntryPoint = "dashboard" | "meetings";
type RoutineInventoryCategory = keyof Pick<
  NightlyInventoryDayState,
  "resentful" | "selfSeeking" | "selfish" | "dishonest" | "apology"
>;
type RoutineReaderState = {
  title: string;
  url: string | null;
  bodyText?: string | null;
  itemId?: string | null;
  requiredDwellSeconds?: number | null;
};
type SignaturePoint = {
  x: number;
  y: number;
  isStrokeStart: boolean;
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
  attendLeave: string[];
};

type NotificationContentInputCompat = NotificationsTypes.NotificationContentInput;
type NotificationDateTriggerInputCompat = NotificationsTypes.DateTriggerInput;
type CalendarEventInputCompat = Omit<Partial<CalendarTypes.Event>, "id">;

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

type AttendanceValidationResult = {
  code: "VALID" | "INVALID" | "UNVERIFIED_LOCATION";
  valid: boolean;
  reason: string;
};

type LocationIssue =
  | "permission_denied"
  | "services_disabled"
  | "position_unavailable"
  | "unavailable"
  | null;

type DiagnosticsLocationSnapshot = {
  servicesEnabled: boolean | null;
  foregroundPermission: LocationPermissionState;
  backgroundPermission: LocationPermissionState;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  timestampIso: string;
};

const DASHBOARD_FOOTER_NAV_HEIGHT = Platform.OS === "ios" ? 74 : 66;
const DASHBOARD_SCROLL_FADE_HEIGHT = 34;
const DEFAULT_REMOTE_API_URL = "https://sober-ai-api.onrender.com";

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
const MAX_GPS_ACCURACY_TOLERANCE_METERS = 160;
const MIN_VALID_MEETING_MINUTES = 50;
const DEFAULT_MEETING_DURATION_MINUTES = 60;
const SIGNATURE_WINDOW_MINUTES = 90;
const SIGNATURE_WINDOW_MS = SIGNATURE_WINDOW_MINUTES * 60 * 1000;
const SIGNATURE_PROMPT_AFTER_MINUTES = 20;
const SIGNATURE_PROMPT_AFTER_MS = SIGNATURE_PROMPT_AFTER_MINUTES * 60 * 1000;
const SIGNATURE_WINDOW_HELP_TEXT =
  "Signature is available from meeting start until 90 minutes after start.";
const MAX_SIGNATURE_POINTS_FOR_STORAGE = 1400;
const MAX_BOOTSTRAP_ATTENDANCE_RAW_CHARS = 4_000_000;
const MAX_BOOTSTRAP_ATTENDANCE_RECORDS = 1200;
const ATTENDANCE_SCHEMA_VERSION = 1;
const SIGNATURE_MIGRATION_BATCH_SIZE = 25;
const ATTENDANCE_STORAGE_KEY_PREFIX = "recovery:verifiedAttendance:";
const ATTENDANCE_SIGNATURE_MIGRATION_KEY_PREFIX = "recovery:attendanceSignaturesMigrationV1:";
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
const BOOT_GUARD_STORAGE_KEY_PREFIX = "recovery:bootGuard:";

const SPONSOR_NOTIFICATION_CATEGORY_ID = "SPONSOR_CALL";
const DRIVE_NOTIFICATION_CATEGORY_ID = "DRIVE_LEAVE";
const SPONSOR_CALL_ACTION_ID = "SPONSOR_CALL_NOW";
const DRIVE_ACTION_ID = "DRIVE_NOW";

const DEFAULT_MEETING_EARLY_MINUTES = 10;
const DEFAULT_SERVICE_COMMITMENT_MINUTES = 45;
const DEFAULT_MORNING_READ_DWELL_SECONDS = 20;
const SPONSOR_NO_KNEES_READ_DWELL_SECONDS = 15;
const MAX_MEETING_MINUTES = 99;
const DEFAULT_NINETY_DAY_GOAL_TARGET = 90;
const DEFAULT_DAILY_MEETINGS_GOAL_TARGET = 3;
const DASHBOARD_NEARBY_RADIUS_MILES = 20;
const DASHBOARD_NEARBY_RADIUS_METERS = DASHBOARD_NEARBY_RADIUS_MILES * 1609.344;
const LOCALHOST_API_HINT = "API URL is localhost; set it to your machine IP for simulator/device.";
const DEFAULT_MAP_LATITUDE_DELTA = 0.22;
const DEFAULT_MAP_LONGITUDE_DELTA = 0.22;
const DEFAULT_MAP_FALLBACK_LAT = 45.7833;
const DEFAULT_MAP_FALLBACK_LNG = -108.5007;
const ATTENDANCE_EXPORT_MAX_RECORDS = 25;
const ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX = "AA-NA Attendance Slip";

const WEEKDAY_OPTIONS: Array<{ code: WeekdayCode; label: string; jsDay: number }> = [
  { code: "MON", label: "Mon", jsDay: 1 },
  { code: "TUE", label: "Tue", jsDay: 2 },
  { code: "WED", label: "Wed", jsDay: 3 },
  { code: "THU", label: "Thu", jsDay: 4 },
  { code: "FRI", label: "Fri", jsDay: 5 },
  { code: "SAT", label: "Sat", jsDay: 6 },
  { code: "SUN", label: "Sun", jsDay: 0 },
];
const WEEKDAY_SHORT_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
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
  { value: "ANY", label: "Any" },
  { value: "MORNING", label: "Morning" },
  { value: "AFTERNOON", label: "Afternoon" },
  { value: "EVENING", label: "Evening" },
];
const MEETINGS_LOCATION_OPTIONS: Array<{ value: MeetingsLocationFilter; label: string }> = [
  { value: "CURRENT", label: "Current" },
  { value: "MILES_50", label: "50 miles" },
  { value: "MILES_100", label: "100 miles" },
];

const SHOW_MODE_TILES = false;

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

function distanceMetersBetween(latA: number, lngA: number, latB: number, lngB: number): number {
  return haversineDistanceMeters({ lat: latA, lng: lngA }, { lat: latB, lng: lngB });
}

function resolveMeetingDistanceMeters(
  meeting: Pick<MeetingRecord, "lat" | "lng" | "distanceMeters" | "address" | "geoStatus">,
  currentLocation: LocationStamp | null,
): number | null {
  if (!isTrustedGeoStatus(meeting.geoStatus ?? null)) {
    return null;
  }
  if (!currentLocation) {
    // Avoid stale/remote-provided distance values when we do not have device location.
    return null;
  }
  if (currentLocation && meeting.lat !== null && meeting.lng !== null) {
    const computedMiles = distanceMiles(
      { lat: currentLocation.lat, lng: currentLocation.lng },
      { lat: meeting.lat, lng: meeting.lng },
    );
    const geoClassification = classifyGeo({
      lat: meeting.lat,
      lng: meeting.lng,
      address: meeting.address,
      userRegionHint: resolveUserRegionHintFromLocation(currentLocation),
      distanceFromUserMiles: computedMiles,
    });
    if (!isTrustedGeoStatus(geoClassification.geoStatus)) {
      return null;
    }
    return computedMiles * 1609.344;
  }
  return null;
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
  return formatDistanceMiles(distanceMeters);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatTimeLabel(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    return "--:--";
  }
  const hour24 = value.getHours();
  const minute = pad2(value.getMinutes());
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute} ${meridiem}`;
}

function formatDateLabel(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    return "--/--/----";
  }
  const month = pad2(value.getMonth() + 1);
  const day = pad2(value.getDate());
  const year = value.getFullYear();
  return `${month}/${day}/${year}`;
}

function formatDateTimeLabel(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    return "--/--/---- --:--";
  }
  return `${formatDateLabel(value)} ${formatTimeLabel(value)}`;
}

function isMeetingInProgress(startsAtLocal: string, nowMinutes: number): boolean {
  const startMinutes = parseMinutesFromHhmm(startsAtLocal);
  const endMinutes = startMinutes + DEFAULT_MEETING_DURATION_MINUTES;
  return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}

function isMeetingActionableToday(startsAtLocal: string, nowMinutes: number): boolean {
  const startMinutes = parseMinutesFromHhmm(startsAtLocal);
  const endMinutes = startMinutes + DEFAULT_MEETING_DURATION_MINUTES;
  return endMinutes > nowMinutes;
}

function meetingDistanceLabel(
  meeting: Pick<MeetingRecord, "lat" | "lng" | "geoStatus">,
  distanceMeters: number | null,
  permission: LocationPermissionState,
  issue: LocationIssue,
): string {
  if (!isTrustedGeoStatus(meeting.geoStatus ?? null)) {
    return "Distance unavailable";
  }
  const hasCoords = normalizeCoordinates({ lat: meeting.lat, lng: meeting.lng }) !== null;
  if (!hasCoords) {
    return "Distance unavailable";
  }
  if (distanceMeters === null || !Number.isFinite(distanceMeters)) {
    if (issue === "services_disabled") {
      return "Turn on Location Services";
    }
    return permission === "granted" ? "Distance unavailable" : "Enable location to see distance";
  }
  return formatDistance(distanceMeters);
}

function leaveByLabel(
  meetingDate: Date,
  startsAtLocal: string,
  distanceMeters: number | null,
  travelTimeProvider: TravelTimeProvider,
): string | null {
  if (distanceMeters === null || !Number.isFinite(distanceMeters)) {
    return null;
  }
  const meetingStart = combineDateWithHhmm(meetingDate, startsAtLocal);
  const travelMinutes = travelTimeProvider.estimateMinutes(distanceMeters);
  const leaveBy = new Date(meetingStart.getTime() - travelMinutes * 60_000);
  if (Number.isNaN(leaveBy.getTime())) {
    return null;
  }
  return formatTimeLabel(leaveBy);
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

function normalizeMeetingDayOfWeek(dayOfWeek: unknown): number | null {
  if (typeof dayOfWeek !== "number" || !Number.isFinite(dayOfWeek)) {
    return null;
  }
  return Math.max(0, Math.min(6, Math.round(dayOfWeek)));
}

function resolveScheduledDateForAttendance(record: AttendanceRecord, base: Date): Date {
  const scheduledDate = new Date(base);
  const meetingDayOfWeek = normalizeMeetingDayOfWeek(record.meetingDayOfWeek);
  if (meetingDayOfWeek === null) {
    return scheduledDate;
  }

  const currentDayOfWeek = scheduledDate.getDay();
  const dayOffset = (meetingDayOfWeek - currentDayOfWeek + 7) % 7;
  if (dayOffset > 0) {
    scheduledDate.setDate(scheduledDate.getDate() + dayOffset);
  }
  return scheduledDate;
}

function parseScheduledStartForAttendance(record: AttendanceRecord): number | null {
  const scheduled = record.scheduledStartsAtLocal;
  if (!scheduled) {
    return null;
  }
  const match = scheduled.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const base = new Date(record.startAt);
  if (Number.isNaN(base.getTime())) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  const scheduledDate = resolveScheduledDateForAttendance(record, base);
  scheduledDate.setHours(
    Math.max(0, Math.min(23, hours)),
    Math.max(0, Math.min(59, minutes)),
    0,
    0,
  );
  return scheduledDate.getTime();
}

function getSignatureWindowForAttendance(
  record: AttendanceRecord,
  nowMs = Date.now(),
): {
  eligible: boolean;
  reason: string | null;
  windowStartMs: number | null;
  windowEndMs: number | null;
} {
  const scheduledStartMs = parseScheduledStartForAttendance(record);
  const checkInMs = new Date(record.startAt).getTime();
  const windowStartMs = scheduledStartMs ?? (Number.isFinite(checkInMs) ? checkInMs : null);
  if (windowStartMs === null) {
    return {
      eligible: false,
      reason: "Signature is unavailable because meeting start time is missing.",
      windowStartMs: null,
      windowEndMs: null,
    };
  }

  const windowEndMs = windowStartMs + SIGNATURE_WINDOW_MS;
  if (record.endAt) {
    return {
      eligible: true,
      reason: null,
      windowStartMs,
      windowEndMs,
    };
  }

  if (nowMs < windowStartMs || nowMs > windowEndMs) {
    return {
      eligible: false,
      reason: SIGNATURE_WINDOW_HELP_TEXT,
      windowStartMs,
      windowEndMs,
    };
  }

  return {
    eligible: true,
    reason: null,
    windowStartMs,
    windowEndMs,
  };
}

function validateAttendanceRecord(
  record: AttendanceRecord,
  requiresSignature: boolean,
): AttendanceValidationResult {
  const invalid = (reason: string): AttendanceValidationResult => ({
    code: "INVALID",
    valid: false,
    reason,
  });
  const unverifiedLocation = (): AttendanceValidationResult => ({
    code: "UNVERIFIED_LOCATION",
    valid: false,
    reason: "Meeting location could not be verified",
  });

  const startAtMs = new Date(record.startAt).getTime();
  if (!Number.isFinite(startAtMs)) {
    return invalid("Invalid start time");
  }

  const inferredMeetingGeoStatus =
    normalizeMeetingGeoStatus(record.meetingGeoStatus) ??
    (isValidLatLng(record.meetingLat, record.meetingLng) ? "verified" : "missing");
  if (!isTrustedGeoStatus(inferredMeetingGeoStatus)) {
    return unverifiedLocation();
  }

  const meetingLat = typeof record.meetingLat === "number" ? record.meetingLat : null;
  const meetingLng = typeof record.meetingLng === "number" ? record.meetingLng : null;
  if (meetingLat === null || meetingLng === null) {
    return unverifiedLocation();
  }

  const startLat = typeof record.startLat === "number" ? record.startLat : null;
  const startLng = typeof record.startLng === "number" ? record.startLng : null;
  const endLat = typeof record.endLat === "number" ? record.endLat : null;
  const endLng = typeof record.endLng === "number" ? record.endLng : null;

  const startDistance =
    startLat !== null && startLng !== null
      ? distanceMetersBetween(startLat, startLng, meetingLat, meetingLng)
      : null;
  const endDistance =
    endLat !== null && endLng !== null
      ? distanceMetersBetween(endLat, endLng, meetingLat, meetingLng)
      : null;

  if (startDistance === null && endDistance === null) {
    return unverifiedLocation();
  }

  const startAccuracyTolerance =
    typeof record.startAccuracyM === "number" && Number.isFinite(record.startAccuracyM)
      ? Math.max(0, Math.min(record.startAccuracyM, MAX_GPS_ACCURACY_TOLERANCE_METERS))
      : 0;
  const endAccuracyTolerance =
    typeof record.endAccuracyM === "number" && Number.isFinite(record.endAccuracyM)
      ? Math.max(0, Math.min(record.endAccuracyM, MAX_GPS_ACCURACY_TOLERANCE_METERS))
      : 0;

  const startWithinGeofence =
    startDistance !== null && startDistance <= ARRIVAL_RADIUS_METERS + startAccuracyTolerance;
  const endWithinGeofence =
    endDistance !== null && endDistance <= ARRIVAL_RADIUS_METERS + endAccuracyTolerance;

  if (!startWithinGeofence && !endWithinGeofence) {
    if (startDistance !== null && endDistance !== null) {
      return invalid("Not within geofence at check-in or check-out");
    }
    if (startDistance !== null) {
      return invalid("Not within geofence at check-in");
    }
    return invalid("Not within geofence at check-out");
  }

  if (!record.endAt) {
    return invalid("Missing end time");
  }
  const endAtMs = new Date(record.endAt).getTime();
  if (!Number.isFinite(endAtMs)) {
    return invalid("Invalid end time");
  }
  const minDurationMs = MIN_VALID_MEETING_MINUTES * 60 * 1000;
  if (endAtMs - startAtMs < minDurationMs) {
    return invalid(`Duration must be at least ${MIN_VALID_MEETING_MINUTES} minutes`);
  }

  if (requiresSignature && !hasAttendanceSignature(record)) {
    return invalid("Signature required");
  }

  return { code: "VALID", valid: true, reason: "Valid meeting" };
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

function resolveDeviceTimeZone(): string {
  return "local";
}

function dateKeyForTimeZone(value: Date, timeZone: string): string {
  void timeZone;
  return dateKeyForDate(value);
}

function parseDailyWisdomPayload(value: unknown): DailyWisdomPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const entry = value as Record<string, unknown>;
  const id = typeof entry.id === "string" ? entry.id : null;
  const date = typeof entry.date === "string" ? entry.date : null;
  const tz = typeof entry.tz === "string" ? entry.tz : null;
  const index =
    typeof entry.index === "number" && Number.isFinite(entry.index) ? entry.index : null;
  const text = typeof entry.text === "string" ? entry.text : null;
  if (!id || !date || !tz || index === null || !text || text.trim().length === 0) {
    return null;
  }
  return {
    id,
    date,
    tz,
    index,
    text: text.trim(),
  };
}

function createDayOptions(): DayOption[] {
  const result: DayOption[] = [];
  const today = new Date();

  for (let offset = 0; offset < 7; offset += 1) {
    const next = new Date(today);
    next.setDate(today.getDate() + offset);
    const weekdayShort = WEEKDAY_SHORT_LABELS[next.getDay()] ?? "Day";
    result.push({
      offset,
      label: offset === 0 ? "Today" : weekdayShort,
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

function resolveNextMeetingDateForDayOfWeek(dayOfWeek: number, now: Date): Date {
  const result = new Date(now);
  const normalizedDay = Math.max(0, Math.min(6, Math.floor(dayOfWeek)));
  const currentDay = now.getDay();
  const deltaDays = (normalizedDay - currentDay + 7) % 7;
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() + deltaDays);
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

function buildSignatureSvgMarkup(
  points: SignaturePoint[],
  width: number,
  height: number,
): string | null {
  if (points.length < 1) {
    return null;
  }

  const reducePoints = (input: SignaturePoint[], maxPoints: number): SignaturePoint[] => {
    if (input.length <= maxPoints) {
      return input;
    }
    const step = Math.max(1, Math.ceil(input.length / maxPoints));
    return input.filter(
      (point, index) =>
        point.isStrokeStart || index === 0 || index === input.length - 1 || index % step === 0,
    );
  };

  const sourcePoints =
    points.length === 1
      ? [
          points[0],
          {
            ...points[0],
            x: points[0].x + 0.1,
            y: points[0].y + 0.1,
            isStrokeStart: false,
          },
        ]
      : points;
  const normalizedPoints = reducePoints(sourcePoints, MAX_SIGNATURE_POINTS_FOR_STORAGE);

  const path = normalizedPoints
    .map(
      (point, index) =>
        `${index === 0 || point.isStrokeStart ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    )
    .join(" ");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  return svg;
}

function attendanceStorageKey(userId: string): string {
  return `${ATTENDANCE_STORAGE_KEY_PREFIX}${userId}`;
}

function attendanceSignatureMigrationStorageKey(userId: string): string {
  return `${ATTENDANCE_SIGNATURE_MIGRATION_KEY_PREFIX}${userId}`;
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

function bootGuardStorageKey(userId: string): string {
  return `${BOOT_GUARD_STORAGE_KEY_PREFIX}${userId}`;
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

function meetingsLocationFilterFromRadius(radiusMiles: number): MeetingsLocationFilter {
  if (radiusMiles >= 100) {
    return "MILES_100";
  }
  if (radiusMiles >= 50) {
    return "MILES_50";
  }
  return "CURRENT";
}

function radiusMilesFromMeetingsLocationFilter(
  filter: MeetingsLocationFilter,
  currentRadiusMiles: number,
): number {
  if (filter === "MILES_50") {
    return 50;
  }
  if (filter === "MILES_100") {
    return 100;
  }
  return currentRadiusMiles > 0 && currentRadiusMiles < 50 ? currentRadiusMiles : 50;
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

function toCalendarDayOfWeek(code: WeekdayCode): CalendarTypes.DayOfTheWeek {
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

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function looksLikeFileUri(value: string): boolean {
  return looksLikeSignatureFileUri(value);
}

function estimateBase64Bytes(value: string): number {
  return estimateSignatureBase64Bytes(value);
}

function estimateUtf8Bytes(value: string): number {
  const textEncoderCtor = (
    globalThis as {
      TextEncoder?: new () => {
        encode(input: string): Uint8Array;
      };
    }
  ).TextEncoder;
  if (typeof textEncoderCtor === "function") {
    return new textEncoderCtor().encode(value).length;
  }
  return value.length;
}

function looksLikeSvgMarkup(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith("<svg") || (normalized.startsWith("<?xml") && normalized.includes("<svg"))
  );
}

function looksLikeSvgDataUri(value: string): boolean {
  return value.trim().toLowerCase().startsWith("data:image/svg+xml");
}

function looksLikeInlineSvgSignature(value: string): boolean {
  return looksLikeSvgMarkup(value) || looksLikeSvgDataUri(value);
}

function normalizeSignatureUri(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getAttendanceSignatureUri(record: AttendanceRecord): string | null {
  const fromRef = normalizeSignatureUri(record.signatureRef?.uri);
  if (fromRef) {
    return fromRef;
  }
  return normalizeSignatureUri(record.signaturePngBase64);
}

function hasAttendanceSignature(record: AttendanceRecord): boolean {
  return getAttendanceSignatureUri(record) !== null;
}

type AttendanceSlipPdfModule = typeof import("./lib/pdf/attendanceSlipPdf");

async function loadAttendanceSlipPdfModule(): Promise<AttendanceSlipPdfModule> {
  return import("./lib/pdf/attendanceSlipPdf");
}

function invalidMeetingCoordsReason(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) {
    return "missing coords";
  }
  const latValid = lat >= -90 && lat <= 90;
  const lngValid = lng >= -180 && lng <= 180;
  if (!latValid || !lngValid) {
    if (Math.abs(lat) <= 180 && Math.abs(lng) <= 90) {
      return "swapped coords suspected";
    }
    return "invalid coords";
  }
  if (lat === 0 && lng === 0) {
    return "invalid coords";
  }
  return null;
}

function normalizeMeetingGeoStatus(value: unknown): MeetingGeoStatus | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "ok" || normalized === "verified") {
    return "verified";
  }
  if (normalized === "estimated") {
    return "estimated";
  }
  if (normalized === "missing") {
    return "missing";
  }
  if (normalized === "invalid" || normalized === "partial" || normalized === "suspect") {
    return "suspect";
  }
  return null;
}

function normalizeMeetingGeoSource(value: unknown): MeetingGeoSource | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "feed" ||
    normalized === "api" ||
    normalized === "device_geocode" ||
    normalized === "backend_geocode" ||
    normalized === "nominatim" ||
    normalized === "unknown"
  ) {
    return normalized as MeetingGeoSource;
  }
  return null;
}

function resolveUserRegionHintFromLocation(location: LocationStamp | null): string | null {
  if (!location) {
    return null;
  }
  const inMontanaBounds =
    location.lat >= 44 && location.lat <= 49.5 && location.lng >= -116 && location.lng <= -104;
  return inMontanaBounds ? "MT" : null;
}

function loadOptionalModule<T>(moduleName: string): T | null {
  try {
    switch (moduleName) {
      case "react-native-maps":
        return require("react-native-maps") as T;
      case "expo-calendar":
        return require("expo-calendar") as T;
      case "expo-notifications":
        return require("expo-notifications") as T;
      case "expo-file-system":
        try {
          return require("expo-file-system/legacy") as T;
        } catch {
          return require("expo-file-system") as T;
        }
      case "expo-speech":
        return require("expo-speech") as T;
      case "expo-av":
        return require("expo-av") as T;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

const mapsModule = loadOptionalModule<typeof import("react-native-maps")>("react-native-maps");
const MapViewCompat: any = mapsModule?.default ?? null;
const MarkerCompat: any = mapsModule?.Marker ?? null;
const mapsRuntimeAvailable = Boolean(MapViewCompat && MarkerCompat);

const calendarModuleRaw = loadOptionalModule<typeof import("expo-calendar")>("expo-calendar");
const calendarModule =
  calendarModuleRaw ??
  ({
    DayOfTheWeek: {
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
      Sunday: 7,
    },
    Frequency: {
      WEEKLY: "weekly",
      MONTHLY: "monthly",
    },
    EntityTypes: {
      EVENT: "event",
    },
    getCalendarPermissionsAsync: async () => ({ granted: false }),
    requestCalendarPermissionsAsync: async () => ({ granted: false }),
    getCalendarsAsync: async () => [],
    getEventAsync: async () => {
      throw new Error("calendar_unavailable");
    },
    updateEventAsync: async () => {
      throw new Error("calendar_unavailable");
    },
    createEventAsync: async () => {
      throw new Error("calendar_unavailable");
    },
    deleteEventAsync: async () => {
      throw new Error("calendar_unavailable");
    },
  } as const);
const Calendar: any = calendarModule;
const calendarRuntimeAvailable = Boolean(calendarModuleRaw);

const notificationsModuleRaw =
  loadOptionalModule<typeof import("expo-notifications")>("expo-notifications");
const notificationsModule =
  notificationsModuleRaw ??
  ({
    PermissionStatus: {
      GRANTED: "granted",
    },
    SchedulableTriggerInputTypes: {
      DATE: "date",
    },
    DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
    getPermissionsAsync: async () => ({ granted: false, status: "denied" }),
    requestPermissionsAsync: async () => ({ granted: false, status: "denied" }),
    cancelScheduledNotificationAsync: async () => {},
    scheduleNotificationAsync: async () => {
      throw new Error("notifications_unavailable");
    },
    getAllScheduledNotificationsAsync: async () => [],
    setNotificationHandler: () => {},
    setNotificationCategoryAsync: async () => {},
    addNotificationResponseReceivedListener: () => ({
      remove: () => {},
    }),
  } as const);
const Notifications: any = notificationsModule;
const notificationsModuleAvailable = Boolean(notificationsModuleRaw);

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function isLocalNetworkHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(normalized)) {
    return true;
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) {
    const [a, b] = normalized.split(".").map((part) => Number(part));
    if (a === 10) {
      return true;
    }
    if (a === 127) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
  }
  return false;
}

function resolveApiBaseUrl(fromEnv: string, fromConfig: string): string {
  const preferred = fromEnv || fromConfig;
  if (preferred) {
    return trimTrailingSlashes(preferred);
  }

  const scriptUrl = (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode
    ?.scriptURL;
  if (typeof scriptUrl === "string" && scriptUrl.length > 0) {
    try {
      const parsed = new URL(scriptUrl);
      const host = parsed.hostname;
      if (host && isLocalNetworkHost(host)) {
        return `http://${host}:3031`;
      }
    } catch {
      // fall through to localhost default
    }
  }

  return DEFAULT_REMOTE_API_URL;
}

function resolveFallbackApiUrls(primaryApiUrl: string): string[] {
  const normalizedPrimary = trimTrailingSlashes(primaryApiUrl.trim());
  const fallback = trimTrailingSlashes(DEFAULT_REMOTE_API_URL);
  if (!normalizedPrimary || normalizedPrimary === fallback) {
    return [];
  }
  return [fallback];
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
    attendLeave: [],
  };
}

function locationGroupKeyForMeeting(meeting: MeetingListItem): string {
  return `${meeting.lat?.toFixed(5)},${meeting.lng?.toFixed(5)}|${meeting.address.trim()}`;
}

function sanitizeMeetingRecords(meetings: MeetingRecord[]): MeetingRecord[] {
  return meetings
    .filter((entry) => entry && typeof entry === "object")
    .map((entry, index) => {
      const parsedDistance = asFiniteNumber(entry.distanceMeters);
      const safeId =
        typeof entry.id === "string" && entry.id.trim().length > 0 ? entry.id : `meeting-${index}`;
      const safeName =
        typeof entry.name === "string" && entry.name.trim().length > 0
          ? entry.name
          : "Recovery Meeting";
      const safeAddress =
        typeof entry.address === "string" && entry.address.trim().length > 0
          ? entry.address
          : "Address unavailable";
      const safeStartsAtLocal =
        typeof entry.startsAtLocal === "string" && entry.startsAtLocal.trim().length > 0
          ? entry.startsAtLocal
          : "19:00";
      const safeDayOfWeek = Number.isFinite(entry.dayOfWeek)
        ? Math.max(0, Math.min(6, Math.round(entry.dayOfWeek)))
        : 0;
      const classifiedGeo = classifyGeo({
        lat: entry.lat,
        lng: entry.lng,
        address: safeAddress,
      });
      const normalizedExistingStatus = normalizeMeetingGeoStatus(entry.geoStatus);
      const geoStatus: MeetingGeoStatus =
        normalizedExistingStatus === "missing" || normalizedExistingStatus === "suspect"
          ? normalizedExistingStatus
          : classifiedGeo.geoStatus;
      const trustedCoords = isTrustedGeoStatus(geoStatus);
      const normalizedGeoSource = normalizeMeetingGeoSource(entry.geoSource);
      const geoSource: MeetingGeoSource =
        normalizedGeoSource ?? (trustedCoords ? "api" : "unknown");

      return {
        ...entry,
        id: safeId,
        name: safeName,
        address: safeAddress,
        startsAtLocal: safeStartsAtLocal,
        dayOfWeek: safeDayOfWeek,
        lat: trustedCoords ? classifiedGeo.lat : null,
        lng: trustedCoords ? classifiedGeo.lng : null,
        distanceMeters:
          typeof parsedDistance === "number" && Number.isFinite(parsedDistance)
            ? Math.max(0, parsedDistance)
            : null,
        geoStatus,
        geoSource,
        geoReason: entry.geoReason ?? classifiedGeo.geoReason,
        geoUpdatedAt:
          typeof entry.geoUpdatedAt === "string" && entry.geoUpdatedAt.trim().length > 0
            ? entry.geoUpdatedAt
            : null,
      };
    });
}

export default function App() {
  const iosLaunchSafeMode =
    Platform.OS === "ios" && process.env.EXPO_PUBLIC_IOS_SAFE_BOOT?.trim() === "1";
  const extra = (appJson.expo.extra ?? {}) as Record<string, unknown>;
  const appEnvFromProcess = typeof process.env.APP_ENV === "string" ? process.env.APP_ENV : "";
  const appEnvFromConfig = typeof extra.appEnv === "string" ? extra.appEnv : "";
  const resolvedAppEnv = appEnvFromProcess || appEnvFromConfig || "development";
  const isDiagnosticsEnabled = process.env.APP_ENV !== "production";
  const apiUrlFromEnv =
    typeof process.env.EXPO_PUBLIC_API_URL === "string"
      ? process.env.EXPO_PUBLIC_API_URL.trim()
      : "";
  const apiUrlFromConfig = typeof extra.apiUrl === "string" ? extra.apiUrl.trim() : "";
  const apiUrl = useMemo(
    () => resolveApiBaseUrl(apiUrlFromEnv, apiUrlFromConfig),
    [apiUrlFromConfig, apiUrlFromEnv],
  );
  const appVersion = typeof appJson.expo.version === "string" ? appJson.expo.version : "unknown";
  const buildNumber = useMemo(() => {
    const iosBuild = appJson.expo.ios?.buildNumber;
    const androidBuild = appJson.expo.android?.versionCode;
    if (iosBuild !== undefined && iosBuild !== null) {
      return String(iosBuild);
    }
    if (androidBuild !== undefined && androidBuild !== null) {
      return String(androidBuild);
    }
    return "unknown";
  }, []);
  const devAuthUserId =
    typeof extra.devAuthUserId === "string" ? extra.devAuthUserId : "enduser-a1";
  const devUserDisplayName =
    typeof extra.devUserDisplayName === "string" ? extra.devUserDisplayName : devAuthUserId;
  const meetingFeedUrl =
    typeof extra.meetingFeedUrl === "string" && extra.meetingFeedUrl.trim().length > 0
      ? extra.meetingFeedUrl
      : undefined;
  const enableSponsorApiSync =
    typeof extra.enableSponsorApiSync === "boolean" ? extra.enableSponsorApiSync : false;
  const defaultMeetingRadiusMiles =
    typeof extra.meetingRadiusMiles === "number" && Number.isFinite(extra.meetingRadiusMiles)
      ? extra.meetingRadiusMiles
      : 50;

  const authHeader = useMemo(() => `Bearer DEV_${devAuthUserId}`, [devAuthUserId]);
  const [meetingRadiusMiles, setMeetingRadiusMiles] = useState(defaultMeetingRadiusMiles);
  const source = useMemo(
    () =>
      createMeetingsSource({
        feedUrl: meetingFeedUrl,
        apiUrl,
        fallbackApiUrls: resolveFallbackApiUrls(apiUrl),
        authHeader,
        radiusMiles: defaultMeetingRadiusMiles,
        onApiEvent: (event) => {
          setLastMeetingsApiEvent(event);
        },
      }),
    [apiUrl, authHeader, meetingFeedUrl, defaultMeetingRadiusMiles],
  );
  const travelTimeProvider = useMemo(() => createTravelTimeProvider(25), []);
  const chatEnabled = featureFlags.chatEnabled;

  const dayOptions = useMemo(() => createDayOptions(), []);
  const attendanceStorage = useMemo(() => attendanceStorageKey(devAuthUserId), [devAuthUserId]);
  const attendanceSignatureMigrationStorage = useMemo(
    () => attendanceSignatureMigrationStorageKey(devAuthUserId),
    [devAuthUserId],
  );
  const signatureStorageSubdirectory = useMemo(
    () => `signatures/${devAuthUserId}`,
    [devAuthUserId],
  );
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
  const bootGuardStorage = useMemo(() => bootGuardStorageKey(devAuthUserId), [devAuthUserId]);
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
  const [locationAlwaysPermission, setLocationAlwaysPermission] =
    useState<LocationPermissionState>("unknown");
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
  const [meetingsLocationFilter, setMeetingsLocationFilter] =
    useState<MeetingsLocationFilter>("CURRENT");
  const [openMeetingsFilterDropdown, setOpenMeetingsFilterDropdown] =
    useState<MeetingsFilterDropdown | null>(null);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [todayNearbyMeetings, setTodayNearbyMeetings] = useState<MeetingRecord[]>([]);
  const [homeGroupFallbackMeetings, setHomeGroupFallbackMeetings] = useState<MeetingRecord[]>([]);
  const [homeGroupFallbackDayOffset, setHomeGroupFallbackDayOffset] = useState(1);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [meetingsStatus, setMeetingsStatus] = useState("Meetings not loaded yet.");
  const [meetingsError, setMeetingsError] = useState<string | null>(null);
  const [lastMeetingsApiEvent, setLastMeetingsApiEvent] = useState<MeetingsApiHealthEvent | null>(
    null,
  );
  const [dailyWisdomText, setDailyWisdomText] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingRecord | null>(null);
  const [diagnosticsMeetingIdInput, setDiagnosticsMeetingIdInput] = useState("");
  const [diagnosticsLocationSnapshot, setDiagnosticsLocationSnapshot] =
    useState<DiagnosticsLocationSnapshot | null>(null);
  const [pendingGeofenceLogMeetingId, setPendingGeofenceLogMeetingId] = useState<string | null>(
    null,
  );
  const [clockTickMs, setClockTickMs] = useState(Date.now());

  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceViewFilter, setAttendanceViewFilter] = useState<AttendanceViewFilter>("ALL");
  const [attendanceEntryPoint, setAttendanceEntryPoint] =
    useState<AttendanceEntryPoint>("dashboard");
  const [activeAttendance, setActiveAttendance] = useState<AttendanceRecord | null>(null);
  const [attendanceStatus, setAttendanceStatus] = useState("No active attendance session.");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingAttendanceSelectionPdf, setExportingAttendanceSelectionPdf] = useState(false);
  const [attendanceExportProgressLabel, setAttendanceExportProgressLabel] = useState<string | null>(
    null,
  );
  const [selectedAttendanceIds, setSelectedAttendanceIds] = useState<string[]>([]);
  const [diagnosticsExportDryRunStatus, setDiagnosticsExportDryRunStatus] = useState<string | null>(
    null,
  );
  const [diagnosticsSignatureUriBytes, setDiagnosticsSignatureUriBytes] = useState<number | null>(
    null,
  );
  const [lastExportAttempt, setLastExportAttempt] = useState<DiagnosticsExportAttempt | null>(null);
  const [showInactiveAttendance, setShowInactiveAttendance] = useState(false);
  const [attendanceValidityFilter, setAttendanceValidityFilter] =
    useState<AttendanceValidityFilter>("ALL");
  const [attendanceExportStartDateInput, setAttendanceExportStartDateInput] = useState("");
  const [attendanceExportEndDateInput, setAttendanceExportEndDateInput] = useState("");
  const [sessionNowMs, setSessionNowMs] = useState(Date.now());
  const [signatureCaptureMeeting, setSignatureCaptureMeeting] = useState<MeetingRecord | null>(
    null,
  );

  const [signaturePoints, setSignaturePoints] = useState<SignaturePoint[]>([]);
  const [signatureChairNameInput, setSignatureChairNameInput] = useState("");
  const [signatureChairRoleInput, setSignatureChairRoleInput] = useState("");
  const [signatureCanvasSize, setSignatureCanvasSize] = useState({ width: 320, height: 180 });
  const signaturePreviewPath = useMemo(
    () =>
      signaturePoints
        .map(
          (point, index) =>
            `${index === 0 || point.isStrokeStart ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
        )
        .join(" "),
    [signaturePoints],
  );

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
  const [meetingAutoAddToCalendar, setMeetingAutoAddToCalendar] = useState(true);

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
  const [wizardSponsorKneesSuggested, setWizardSponsorKneesSuggested] = useState<boolean | null>(
    null,
  );
  const [wizardWantsReminders, setWizardWantsReminders] = useState<boolean | null>(null);
  const [wizardHasHomeGroup, setWizardHasHomeGroup] = useState<boolean | null>(null);
  const [wizardMeetingSignatureRequired, setWizardMeetingSignatureRequired] = useState<
    boolean | null
  >(null);
  const [meetingSignatureRequired, setMeetingSignatureRequired] = useState(false);
  const [sponsorKneesSuggested, setSponsorKneesSuggested] = useState<boolean | null>(null);
  const [homeGroupMeetingIds, setHomeGroupMeetingIds] = useState<string[]>([]);
  const [sponsorEnabledAtIso, setSponsorEnabledAtIso] = useState<string | null>(null);
  const [, setSponsorCallLogs] = useState<SponsorCallLog[]>([]);
  const [meetingAttendanceLogs, setMeetingAttendanceLogs] = useState<MeetingAttendanceLog[]>([]);
  const [routinesStore, setRoutinesStore] = useState<RecoveryRoutinesStore>(
    createDefaultRoutinesStore,
  );
  const [routinesStatus, setRoutinesStatus] = useState<string | null>(null);
  const [, setPendingDailyReflectionsCompletion] =
    useState<PendingDailyReflectionsCompletion | null>(null);
  const [routineReader, setRoutineReader] = useState<RoutineReaderState | null>(null);
  const [routineReaderBackScreen, setRoutineReaderBackScreen] =
    useState<RoutineReaderBackScreen>("MORNING");

  const [meetingPlansByDate, setMeetingPlansByDate] = useState<MeetingPlansState>({});
  const [debugTimeCompressionEnabled] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  const activeAttendanceRef = useRef<AttendanceRecord | null>(null);
  const attendanceRecordsRef = useRef<AttendanceRecord[]>([]);
  const attendanceExportInFlightRef = useRef(false);
  const startAttendanceInFlightRef = useRef(false);
  const arrivalPromptedMeetingRef = useRef<string | null>(null);
  const meetingsByIdRef = useRef<Record<string, MeetingRecord>>({});
  const meetingsShapeLoggedRef = useRef(false);
  const [locationIssue, setLocationIssue] = useState<LocationIssue>(null);
  const locationIssueRef = useRef<LocationIssue>(null);
  const locationPermissionAlertShownRef = useRef<LocationIssue>(null);
  const mapRef = useRef<any>(null);
  const rootScrollRef = useRef<ScrollView | null>(null);
  const meetingsRequestInFlightRef = useRef(false);
  const lastMeetingsRequestKeyRef = useRef<string | null>(null);
  const meetingsAutoRefreshKeyRef = useRef<string | null>(null);
  const refreshMeetingsRef = useRef<
    ((options?: { location?: LocationStamp | null; radiusMiles?: number }) => Promise<void>) | null
  >(null);
  const requestLocationPermissionRef = useRef<(() => Promise<LocationStamp | null>) | null>(null);
  const currentLocationRef = useRef<LocationStamp | null>(null);
  const geocodedAddressCacheRef = useRef<
    Record<string, { lat: number; lng: number; source: MeetingGeoSource } | null>
  >({});
  const dailyWisdomFetchKeyRef = useRef<string | null>(null);
  const sponsorScheduleEffectKeyRef = useRef<string | null>(null);
  const bootstrapStartedRef = useRef(false);
  const setupStep4RefreshLocationKeyRef = useRef<string | null>(null);
  const departurePromptedAttendanceRef = useRef<string | null>(null);
  const saveSponsorConfigRef = useRef<(overrides?: SaveSponsorConfigOverrides) => Promise<boolean>>(
    async () => false,
  );
  const playbackRef = useRef<any>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

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
  const dashboardWisdomTimeZone = useMemo(() => resolveDeviceTimeZone(), []);
  const dashboardWisdomDateKey = useMemo(
    () => dateKeyForTimeZone(new Date(clockTickMs), dashboardWisdomTimeZone),
    [clockTickMs, dashboardWisdomTimeZone],
  );
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
        return isMeetingActionableToday(meeting.startsAtLocal, nowMinutes);
      })
      .map((meeting) => {
        return {
          ...meeting,
          distanceMeters: resolveMeetingDistanceMeters(meeting, currentLocation),
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

  const meetingsTodayAll = useMemo<MeetingListItem[]>(() => {
    const todayDay = new Date(clockTickMs).getDay();
    const list = todayNearbyMeetings
      .filter((meeting) => meeting.dayOfWeek === todayDay)
      .map((meeting) => {
        return {
          ...meeting,
          distanceMeters: resolveMeetingDistanceMeters(meeting, currentLocation),
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

  const meetingsTodayUpcoming = useMemo<MeetingListItem[]>(() => {
    const nowLocal = new Date(clockTickMs);
    const nowMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
    return meetingsTodayAll.filter((meeting) =>
      isMeetingActionableToday(meeting.startsAtLocal, nowMinutes),
    );
  }, [meetingsTodayAll, clockTickMs]);

  const homeGroupFallbackMeetingItems = useMemo<MeetingListItem[]>(() => {
    const list = homeGroupFallbackMeetings.map((meeting) => {
      return {
        ...meeting,
        distanceMeters: resolveMeetingDistanceMeters(meeting, currentLocation),
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
  }, [homeGroupFallbackMeetings, currentLocation]);

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
  const dashboardMeetingsForPanel = useMemo<MeetingListItem[]>(
    () => meetingsForMeetingsScreen.slice(0, 5),
    [meetingsForMeetingsScreen],
  );
  const selectedMeetingsFormatLabel = useMemo(
    () =>
      MEETINGS_FORMAT_OPTIONS.find((option) => option.value === meetingsFormatFilter)?.label ??
      "All",
    [meetingsFormatFilter],
  );
  const selectedMeetingsTimeLabel = useMemo(
    () =>
      MEETINGS_TIME_OPTIONS.find((option) => option.value === meetingsTimeFilter)?.label ?? "Any",
    [meetingsTimeFilter],
  );
  const selectedMeetingsDayLabel = useMemo(
    () => dayOptions.find((option) => option.offset === selectedDayOffset)?.label ?? "Today",
    [dayOptions, selectedDayOffset],
  );
  const selectedMeetingsLocationLabel = useMemo(
    () =>
      MEETINGS_LOCATION_OPTIONS.find((option) => option.value === meetingsLocationFilter)?.label ??
      "Current",
    [meetingsLocationFilter],
  );

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
    for (const meeting of homeGroupFallbackMeetings) {
      if (!byId.has(meeting.id)) {
        byId.set(meeting.id, meeting);
      }
    }
    return Array.from(byId.values());
  }, [meetings, todayNearbyMeetings, homeGroupFallbackMeetings]);

  const diagnosticsSelectedAttendanceRecords = useMemo(() => {
    const selected = new Set(selectedAttendanceIds);
    return attendanceRecords.filter((record) => selected.has(record.id));
  }, [attendanceRecords, selectedAttendanceIds]);

  const diagnosticsExportDebug = useMemo<DiagnosticsExportDebug>(() => {
    let signedCount = 0;
    let signatureBase64Bytes = 0;
    let signatureUriCount = 0;

    for (const record of diagnosticsSelectedAttendanceRecords) {
      const signature = getAttendanceSignatureUri(record) ?? "";
      const trimmed = signature.trim();
      if (trimmed.length === 0) {
        continue;
      }
      signedCount += 1;
      if (looksLikeFileUri(trimmed)) {
        signatureUriCount += 1;
      } else if (looksLikeInlineSvgSignature(trimmed)) {
        signatureBase64Bytes += estimateUtf8Bytes(trimmed);
      } else {
        signatureBase64Bytes += estimateBase64Bytes(trimmed);
      }
    }

    return {
      selectedCount: diagnosticsSelectedAttendanceRecords.length,
      signedCount,
      unsignedCount: diagnosticsSelectedAttendanceRecords.length - signedCount,
      signatureBase64Bytes,
      signatureUriCount,
      signatureUriBytes: diagnosticsSignatureUriBytes,
      dryRunStatus: diagnosticsExportDryRunStatus,
    };
  }, [
    diagnosticsExportDryRunStatus,
    diagnosticsSelectedAttendanceRecords,
    diagnosticsSignatureUriBytes,
  ]);

  const diagnosticsMeetingGeoSample = useMemo(() => {
    const targetId = diagnosticsMeetingIdInput.trim();
    if (targetId.length === 0) {
      return null;
    }
    const targetMeeting = allMeetings.find((meeting) => meeting.id === targetId);
    if (!targetMeeting) {
      return null;
    }

    const lat = asFiniteNumber(targetMeeting.lat);
    const lng = asFiniteNumber(targetMeeting.lng);
    const invalidReason = invalidMeetingCoordsReason(lat, lng);
    const validCoords = lat !== null && lng !== null && invalidReason === null;
    const distanceMeters =
      validCoords && currentLocation
        ? haversineDistanceMeters(
            { lat: currentLocation.lat, lng: currentLocation.lng },
            { lat, lng },
          )
        : null;

    return {
      meetingId: targetMeeting.id,
      name: targetMeeting.name,
      address: targetMeeting.address,
      lat,
      lng,
      isValidLatLng: validCoords,
      distanceMeters,
      invalidReason,
    };
  }, [allMeetings, currentLocation, diagnosticsMeetingIdInput]);

  useEffect(() => {
    let cancelled = false;
    const signatures = diagnosticsSelectedAttendanceRecords
      .map((record) => getAttendanceSignatureUri(record) ?? "")
      .filter((signature) => signature.length > 0 && looksLikeFileUri(signature));

    if (signatures.length === 0) {
      setDiagnosticsSignatureUriBytes(0);
      return () => {
        cancelled = true;
      };
    }

    type FileSystemLike = {
      getInfoAsync(uri: string): Promise<{ exists: boolean; size?: number }>;
    };

    const run = async () => {
      const fileSystemModule = loadOptionalModule<FileSystemLike>("expo-file-system");
      if (!fileSystemModule || typeof fileSystemModule.getInfoAsync !== "function") {
        if (!cancelled) {
          setDiagnosticsSignatureUriBytes(null);
        }
        return;
      }

      let totalBytes = 0;
      for (const signatureUri of signatures) {
        try {
          const info = await fileSystemModule.getInfoAsync(signatureUri);
          if (info.exists && typeof info.size === "number" && Number.isFinite(info.size)) {
            totalBytes += info.size;
          }
        } catch {
          // ignore unreadable files and continue gathering available metrics
        }
      }

      if (!cancelled) {
        setDiagnosticsSignatureUriBytes(totalBytes);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [diagnosticsSelectedAttendanceRecords]);

  const attendanceRecordsByDateAndActivity = useMemo(() => {
    const byDate =
      attendanceViewFilter === "ALL"
        ? attendanceRecords
        : attendanceRecords.filter(
            (record) => dateKeyForRoutines(new Date(record.startAt)) === routineDateKey,
          );
    if (showInactiveAttendance) {
      return byDate;
    }
    return byDate.filter((record) => !record.inactive);
  }, [attendanceRecords, attendanceViewFilter, routineDateKey, showInactiveAttendance]);

  const attendanceValidationById = useMemo(() => {
    const byId = new Map<string, AttendanceValidationResult>();
    for (const record of attendanceRecordsByDateAndActivity) {
      byId.set(record.id, validateAttendanceRecord(record, meetingSignatureRequired));
    }
    return byId;
  }, [attendanceRecordsByDateAndActivity, meetingSignatureRequired]);

  const attendanceRecordsForView = useMemo(() => {
    if (attendanceValidityFilter === "ALL") {
      return attendanceRecordsByDateAndActivity;
    }
    const expectValid = attendanceValidityFilter === "VALID_ONLY";
    return attendanceRecordsByDateAndActivity.filter((record) => {
      const validation = attendanceValidationById.get(record.id);
      return expectValid ? validation?.code === "VALID" : validation?.code !== "VALID";
    });
  }, [attendanceRecordsByDateAndActivity, attendanceValidationById, attendanceValidityFilter]);

  const inactiveAttendanceCount = useMemo(
    () => attendanceRecords.filter((record) => Boolean(record.inactive)).length,
    [attendanceRecords],
  );

  const selectedAttendanceVisibleCount = useMemo(
    () =>
      attendanceRecordsForView.filter((record) => selectedAttendanceIds.includes(record.id)).length,
    [attendanceRecordsForView, selectedAttendanceIds],
  );
  const attendanceSignatureWindowById = useMemo(() => {
    const byId = new Map<
      string,
      {
        eligible: boolean;
        reason: string | null;
        windowStartMs: number | null;
        windowEndMs: number | null;
      }
    >();
    for (const record of attendanceRecordsForView) {
      byId.set(record.id, getSignatureWindowForAttendance(record, sessionNowMs));
    }
    return byId;
  }, [attendanceRecordsForView, sessionNowMs]);
  const activeAttendanceSignatureWindow = useMemo(() => {
    if (!activeAttendance) {
      return null;
    }
    return getSignatureWindowForAttendance(activeAttendance, sessionNowMs);
  }, [activeAttendance, sessionNowMs]);

  const dashboardUpcomingInPerson = useMemo(
    () => meetingsTodayUpcoming.filter((meeting) => meeting.format !== "ONLINE"),
    [meetingsTodayUpcoming],
  );
  const dashboardUpcomingOnline = useMemo(
    () =>
      meetingsTodayUpcoming.filter(
        (meeting) => meeting.format === "ONLINE" || typeof meeting.onlineUrl === "string",
      ),
    [meetingsTodayUpcoming],
  );
  const dashboardNextFiveMeetings = useMemo(() => {
    const nearbyInPerson = dashboardUpcomingInPerson.filter(
      (meeting) =>
        meeting.distanceMeters !== null && meeting.distanceMeters <= DASHBOARD_NEARBY_RADIUS_METERS,
    );

    if (nearbyInPerson.length > 0) {
      return nearbyInPerson.slice(0, 5);
    }

    if (dashboardUpcomingInPerson.length > 0) {
      return dashboardUpcomingInPerson.slice(0, 5);
    }

    return dashboardUpcomingOnline.slice(0, 5);
  }, [dashboardUpcomingInPerson, dashboardUpcomingOnline]);
  const dashboardMeetingPrimaryActionLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    const now = new Date(clockTickMs);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    for (const meeting of dashboardNextFiveMeetings) {
      const meetingInProgress = isMeetingInProgress(meeting.startsAtLocal, nowMinutes);
      labels[meeting.id] = meetingInProgress ? "Attend now" : "Attend";
    }
    if (activeAttendance && !activeAttendance.endAt) {
      const elapsedSeconds = Math.max(
        0,
        Math.floor((sessionNowMs - new Date(activeAttendance.startAt).getTime()) / 1000),
      );
      labels[activeAttendance.meetingId] =
        elapsedSeconds >= MIN_VALID_MEETING_MINUTES * 60 ? "End meeting" : "In progress";
    }
    return labels;
  }, [dashboardNextFiveMeetings, activeAttendance, clockTickMs, sessionNowMs]);
  const dashboardShowsOnlineFallback = useMemo(
    () => dashboardUpcomingInPerson.length === 0 && dashboardUpcomingOnline.length > 0,
    [dashboardUpcomingInPerson, dashboardUpcomingOnline],
  );
  const homeGroupUsesNextDayFallback = useMemo(
    () => meetingsTodayUpcoming.length === 0 && homeGroupFallbackMeetingItems.length > 0,
    [meetingsTodayUpcoming.length, homeGroupFallbackMeetingItems.length],
  );
  const homeGroupFallbackDayLabel = useMemo(
    () =>
      dayOptions.find((option) => option.offset === homeGroupFallbackDayOffset)?.label ?? "Next",
    [dayOptions, homeGroupFallbackDayOffset],
  );
  const homeGroupCandidateMeetings = useMemo(() => {
    if (meetingsTodayUpcoming.length > 0) {
      return meetingsTodayUpcoming;
    }
    if (homeGroupFallbackMeetingItems.length > 0) {
      return homeGroupFallbackMeetingItems;
    }
    return [];
  }, [meetingsTodayUpcoming, homeGroupFallbackMeetingItems]);

  const mapMeetingsForDay = useMemo(
    () =>
      meetingsForDay.filter(
        (meeting) => meeting.format !== "ONLINE" && meeting.lat !== null && meeting.lng !== null,
      ),
    [meetingsForDay],
  );

  const mapRenderRegion = useMemo<Region>(() => {
    if (mapRegion) {
      return mapRegion;
    }

    const firstMeeting = mapMeetingsForDay[0];
    if (firstMeeting && firstMeeting.lat !== null && firstMeeting.lng !== null) {
      return {
        latitude: firstMeeting.lat,
        longitude: firstMeeting.lng,
        latitudeDelta: DEFAULT_MAP_LATITUDE_DELTA,
        longitudeDelta: DEFAULT_MAP_LONGITUDE_DELTA,
      };
    }

    if (currentLocation) {
      return {
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        latitudeDelta: DEFAULT_MAP_LATITUDE_DELTA,
        longitudeDelta: DEFAULT_MAP_LONGITUDE_DELTA,
      };
    }

    return {
      latitude: DEFAULT_MAP_FALLBACK_LAT,
      longitude: DEFAULT_MAP_FALLBACK_LNG,
      latitudeDelta: DEFAULT_MAP_LATITUDE_DELTA,
      longitudeDelta: DEFAULT_MAP_LONGITUDE_DELTA,
    };
  }, [mapRegion, mapMeetingsForDay, currentLocation]);

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

    return `Next scheduled call: ${formatDateTimeLabel(next.nextAt)} • Due today: ${
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
    const ninetyDayWindowEnd = sobrietyStart + 90 * 86_400_000;
    const withinFirstNinetyDays = clockTickMs <= ninetyDayWindowEnd;
    const windowEnd = withinFirstNinetyDays ? clockTickMs : ninetyDayWindowEnd;

    // Source of truth is logged meeting records. Fall back to legacy logs if needed.
    if (attendanceRecords.length > 0) {
      return attendanceRecords.filter((record) => {
        const at = new Date(record.startAt).getTime();
        return Number.isFinite(at) && at >= sobrietyStart && at <= windowEnd;
      }).length;
    }

    return meetingAttendanceLogs.filter((entry) => {
      const at = new Date(entry.atIso).getTime();
      return Number.isFinite(at) && at >= sobrietyStart && at <= windowEnd;
    }).length;
  }, [sobrietyDateIso, attendanceRecords, meetingAttendanceLogs, clockTickMs]);

  const ninetyDayProgressPct = useMemo(
    () => Math.min(100, Math.round((meetingsAttendedInNinetyDays / ninetyDayGoalTarget) * 100)),
    [meetingsAttendedInNinetyDays, ninetyDayGoalTarget],
  );

  const meetingsWeekBarsMonSun = useMemo(() => {
    const bars = [0, 0, 0, 0, 0, 0, 0];
    const now = new Date(clockTickMs);
    const weekStart = new Date(now);
    const dayOfWeek = weekStart.getDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - daysSinceMonday);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekStartMs = weekStart.getTime();
    const weekEndMs = weekEnd.getTime();

    const addToBar = (atMs: number) => {
      if (!Number.isFinite(atMs) || atMs < weekStartMs || atMs >= weekEndMs) {
        return;
      }
      const weekday = new Date(atMs).getDay();
      const mondayFirstIndex = (weekday + 6) % 7;
      bars[mondayFirstIndex] += 1;
    };

    if (attendanceRecords.length > 0) {
      for (const record of attendanceRecords) {
        addToBar(new Date(record.startAt).getTime());
      }
      return bars;
    }

    for (const entry of meetingAttendanceLogs) {
      addToBar(new Date(entry.atIso).getTime());
    }
    return bars;
  }, [attendanceRecords, meetingAttendanceLogs, clockTickMs]);

  const meetingsAttendedTodayCount = useMemo(() => {
    const attendedMeetingIds = new Set<string>();
    for (const entry of meetingAttendanceLogs) {
      if (dateKeyForDate(new Date(entry.atIso)) === todayDateKey) {
        attendedMeetingIds.add(entry.meetingId);
      }
    }
    if (
      activeAttendance &&
      !activeAttendance.endAt &&
      dateKeyForDate(new Date(activeAttendance.startAt)) === todayDateKey
    ) {
      attendedMeetingIds.add(activeAttendance.meetingId);
    }
    return attendedMeetingIds.size;
  }, [meetingAttendanceLogs, activeAttendance, todayDateKey]);

  const morningRoutineDayState = useMemo(
    () => getMorningDayState(routinesStore, routineDateKey),
    [routinesStore, routineDateKey],
  );

  const nightlyInventoryDayState = useMemo(
    () => getNightlyDayState(routinesStore, routineDateKey),
    [routinesStore, routineDateKey],
  );
  const dailyChecklistStatus = useMemo(() => {
    const morningEnabledRows = routinesStore.morningTemplate.items
      .filter((item) => item.enabled)
      .map((item) => {
        const completed = Boolean(morningRoutineDayState.completedByItemId[item.id]);
        const prayerUsesOnKnees = MORNING_PRAYER_ITEM_IDS.has(item.id);
        const onKneesToggleRequired =
          prayerUsesOnKnees && !(wizardHasSponsor === true && sponsorKneesSuggested === false);
        const onKnees = Boolean(morningRoutineDayState.prayerOnKneesByItemId[item.id]);
        const progress = onKneesToggleRequired
          ? completed
            ? onKnees
              ? 100
              : 50
            : 0
          : completed
            ? 100
            : 0;
        const itemLabel =
          item.id === ELEVENTH_STEP_PRAYER_ITEM_ID ? "11th Step AM Prayer" : item.title;
        const kneesSuffix =
          onKneesToggleRequired && completed ? (onKnees ? " -knees" : " -no knees") : "";
        return {
          id: `morning-${item.id}`,
          label: `Morning: ${itemLabel}${kneesSuffix}`,
          complete: progress >= 100,
          progress,
        };
      });
    const meetingAttendanceLabel =
      meetingsAttendedTodayCount === 1
        ? "1 meeting attended"
        : `${meetingsAttendedTodayCount} meetings attended`;
    const attendedMeetingToday = meetingsAttendedTodayCount > 0;
    const meetingAttendanceRow = {
      id: "meeting-attended",
      label: meetingAttendanceLabel,
      complete: attendedMeetingToday,
      progress: attendedMeetingToday ? 100 : 0,
    };
    const rows: Array<{ id: string; label: string; complete: boolean; progress: number }> = [
      ...morningEnabledRows,
      meetingAttendanceRow,
      {
        id: "nightly-inventory",
        label: "Nightly routine",
        complete: Boolean(nightlyInventoryDayState.completedAt),
        progress: nightlyInventoryDayState.completedAt ? 100 : 0,
      },
      ...(nightlyInventoryDayState.eleventhStepPrayerEnabled
        ? [
            (() => {
              const completed = Boolean(nightlyInventoryDayState.eleventhStepPrayerCompletedAt);
              const onKnees = Boolean(nightlyInventoryDayState.gotOnKneesCompleted);
              const onKneesToggleRequired = !(
                wizardHasSponsor === true && sponsorKneesSuggested === false
              );
              const progress = completed ? (onKneesToggleRequired ? (onKnees ? 100 : 50) : 100) : 0;
              const kneesSuffix =
                onKneesToggleRequired && completed ? (onKnees ? " -knees" : " -no knees") : "";
              return {
                id: "nightly-eleventh-step-prayer",
                label: `Nightly: 11th Step Prayer${kneesSuffix}`,
                complete: progress >= 100,
                progress,
              };
            })(),
          ]
        : []),
    ];
    const progressTotal = rows.reduce((sum, row) => sum + row.progress, 0);
    const completedCount = rows.filter((row) => row.progress >= 100).length;
    const percent = rows.length > 0 ? Math.round(progressTotal / rows.length) : 0;
    return {
      rows,
      percent,
      summary: `${completedCount}/${rows.length} completed today`,
    };
  }, [
    routinesStore.morningTemplate.items,
    morningRoutineDayState.completedByItemId,
    morningRoutineDayState.prayerOnKneesByItemId,
    wizardHasSponsor,
    sponsorKneesSuggested,
    meetingsAttendedTodayCount,
    todayDateKey,
    nightlyInventoryDayState.completedAt,
    nightlyInventoryDayState.eleventhStepPrayerEnabled,
    nightlyInventoryDayState.eleventhStepPrayerCompletedAt,
    nightlyInventoryDayState.gotOnKneesCompleted,
  ]);

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
      const result = await getCurrentLocationFromService({
        requestPermission,
        timeoutMs: 12_000,
        cacheTtlMs: 45_000,
      });
      setLocationPermission(result.permissionStatus);
      setLocationAlwaysPermission(result.alwaysPermissionStatus);

      if (result.coords) {
        locationIssueRef.current = null;
        setLocationIssue(null);
        setCurrentLocation(result.coords);
        return result.coords;
      }

      setCurrentLocation(null);

      if (result.failureReason === "services_disabled" || result.servicesEnabled === false) {
        locationIssueRef.current = "services_disabled";
        setLocationIssue("services_disabled");
        return null;
      }

      if (
        result.failureReason === "permission_denied" ||
        result.permissionStatus === "denied" ||
        result.permissionStatus === "unknown"
      ) {
        locationIssueRef.current = "permission_denied";
        setLocationIssue("permission_denied");
        return null;
      }

      if (
        result.failureReason === "position_unavailable" ||
        (result.permissionStatus === "granted" && result.timedOut)
      ) {
        locationIssueRef.current = "position_unavailable";
        setLocationIssue("position_unavailable");
        return null;
      }

      locationIssueRef.current = "unavailable";
      setLocationIssue("unavailable");
      return null;
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
  const notificationsRuntimeEnabled = Platform.OS !== "ios" && notificationsModuleAvailable;
  const calendarRuntimeEnabled = Platform.OS === "ios" && calendarRuntimeAvailable;

  const ensureNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (!notificationsRuntimeEnabled) {
      return false;
    }
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted || existing.status === Notifications.PermissionStatus.GRANTED) {
      return true;
    }

    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted || requested.status === Notifications.PermissionStatus.GRANTED;
  }, [notificationsRuntimeEnabled]);

  const ensureCalendarPermission = useCallback(async (): Promise<boolean> => {
    if (!calendarRuntimeEnabled) {
      return false;
    }
    try {
      const existing = await Calendar.getCalendarPermissionsAsync();
      if (existing.granted) {
        return true;
      }
      const requested = await Calendar.requestCalendarPermissionsAsync();
      return requested.granted;
    } catch {
      return false;
    }
  }, [calendarRuntimeEnabled]);

  const findWritableCalendarId = useCallback(async (): Promise<string | null> => {
    if (!calendarRuntimeEnabled) {
      return null;
    }
    const calendars = (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)) as Array<{
      id?: string;
      allowsModifications?: boolean;
    }>;
    const writable = calendars.find((item) => item.allowsModifications === true);
    return writable?.id ?? null;
  }, [calendarRuntimeEnabled]);

  const applyScheduleTime = useCallback(
    (target: Date): Date | null => {
      const now = Date.now();
      const diffMs = target.getTime() - now;
      if (debugTimeCompressionEnabled) {
        const compressedDelay = Math.max(5000, Math.floor(Math.max(diffMs, 0) / 12));
        return new Date(now + compressedDelay);
      }
      if (diffMs <= 0) {
        return null;
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
        attendLeave: Array.isArray(parsed.attendLeave) ? parsed.attendLeave : [],
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
      if (!notificationsRuntimeEnabled) {
        const buckets = await loadNotificationBuckets();
        buckets[bucket] = [];
        await saveNotificationBuckets(buckets);
        return buckets;
      }
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
    [loadNotificationBuckets, notificationsRuntimeEnabled, saveNotificationBuckets],
  );

  const scheduleAt = useCallback(
    async (date: Date, content: NotificationContentInputCompat): Promise<string> => {
      if (!notificationsRuntimeEnabled) {
        throw new Error("notifications_disabled");
      }
      const trigger: NotificationDateTriggerInputCompat = {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
      };

      return Notifications.scheduleNotificationAsync({
        content,
        trigger,
      });
    },
    [notificationsRuntimeEnabled],
  );

  const cancelScheduledNotificationsByType = useCallback(
    async (type: "sponsor" | "drive") => {
      if (!notificationsRuntimeEnabled) {
        return;
      }
      try {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        await Promise.all(
          scheduled.map(async (request: NotificationsTypes.NotificationRequest) => {
            const data = request.content.data as { type?: string } | undefined;
            if (data?.type !== type) {
              return;
            }
            try {
              await Notifications.cancelScheduledNotificationAsync(request.identifier);
            } catch {
              // ignore stale ids
            }
          }),
        );
      } catch {
        // ignore lookup failures
      }
    },
    [notificationsRuntimeEnabled],
  );

  const requestLocationPermission = useCallback(async (): Promise<LocationStamp | null> => {
    const position = await readCurrentLocation(true);
    if (position) {
      setMeetingsStatus("Location enabled for distance and arrival detection.");
      return position;
    }
    if (locationIssueRef.current === "services_disabled") {
      setMeetingsStatus("Turn on Location Services to resolve meeting distance and geofence.");
      return null;
    }
    if (locationIssueRef.current === "position_unavailable") {
      setMeetingsStatus("Location enabled, but current GPS position is unavailable.");
      return null;
    }
    if (locationIssueRef.current === "permission_denied") {
      setMeetingsStatus("Location permission denied. Distance and arrival detection are disabled.");
      return null;
    }
    setMeetingsStatus("Location is unavailable on this device.");
    return null;
  }, [readCurrentLocation]);

  const requestAlwaysLocationPermission = useCallback(async (): Promise<boolean> => {
    const result = await requestAlwaysLocationPermissionFromService();
    setLocationPermission(result.permissionStatus);
    setLocationAlwaysPermission(result.alwaysPermissionStatus);

    if (result.permissionStatus !== "granted") {
      locationIssueRef.current = "permission_denied";
      setLocationIssue("permission_denied");
      setMeetingsStatus("Location permission denied. Enable While Using the App first.");
      return false;
    }

    if (result.alwaysPermissionStatus === "granted") {
      locationIssueRef.current = null;
      setLocationIssue(null);
      setMeetingsStatus("Always location enabled for automatic meeting logging.");
      return true;
    }

    if (result.alwaysPermissionStatus === "denied") {
      setMeetingsStatus("Always location denied. Open device settings to allow Always.");
      Alert.alert(
        "Enable Always Location",
        "Always access is required for background geofence verification. Open Settings to allow Always.",
        [
          { text: "Not now", style: "cancel" },
          {
            text: "Open Settings",
            onPress: () => {
              void Linking.openSettings();
            },
          },
        ],
      );
      return false;
    }

    if (result.alwaysPermissionStatus === "unavailable") {
      setMeetingsStatus("Always location option is unavailable in this build.");
      return false;
    }

    setMeetingsStatus("Always location not enabled. Choose Always in device location settings.");
    return false;
  }, []);

  const refreshDeviceLocationOnFocus = useCallback(async (): Promise<LocationStamp | null> => {
    if (iosLaunchSafeMode) {
      return null;
    }
    const permissionState = await readLocationPermissionStates();
    setLocationPermission(permissionState.permissionStatus);
    setLocationAlwaysPermission(permissionState.alwaysPermissionStatus);

    if (permissionState.permissionStatus !== "granted") {
      if (
        permissionState.permissionStatus === "denied" ||
        permissionState.permissionStatus === "unknown"
      ) {
        locationIssueRef.current = "permission_denied";
        setLocationIssue("permission_denied");
      }
      setCurrentLocation(null);
      return null;
    }

    const position = await readCurrentLocation(false);
    if (position) {
      await refreshMeetingsRef.current?.({ location: position });
    }
    return position;
  }, [iosLaunchSafeMode, readCurrentLocation]);

  const refreshDiagnosticsLocation = useCallback(async () => {
    const permissions = await readLocationPermissionStates();
    const locationResult = await getCurrentLocationFromService({
      requestPermission: false,
      timeoutMs: 12_000,
      cacheTtlMs: 10_000,
    });

    setLocationPermission(permissions.permissionStatus);
    setLocationAlwaysPermission(permissions.alwaysPermissionStatus);

    if (locationResult.coords) {
      setCurrentLocation(locationResult.coords);
    }

    setDiagnosticsLocationSnapshot({
      servicesEnabled: locationResult.servicesEnabled,
      foregroundPermission: permissions.permissionStatus,
      backgroundPermission: permissions.alwaysPermissionStatus,
      lat: locationResult.coords?.lat ?? null,
      lng: locationResult.coords?.lng ?? null,
      accuracyM: locationResult.coords?.accuracyM ?? null,
      timestampIso: new Date().toISOString(),
    });
  }, []);

  const geocodeMeetingsMissingCoordinates = useCallback(
    async (records: MeetingRecord[]) => {
      const MAX_GEOCODE_LOOKUPS_PER_REFRESH = 30;
      const ADDRESS_SECOND_CHECK_MISMATCH_MILES = 75;
      const ADDRESS_SECOND_CHECK_DISTANCE_ANOMALY_MILES = 120;
      let lookups = 0;
      let resolved = 0;
      let overrides = 0;
      const userRegionHint = resolveUserRegionHintFromLocation(currentLocation);

      const buildAddressCandidates = (meeting: MeetingRecord): string[] => {
        const raw = meeting.address.trim().replace(/\s+/g, " ");
        if (raw.length === 0 || raw.toLowerCase() === "address unavailable") {
          return [];
        }
        const hasStateOrZip = /\b[A-Z]{2}\b/.test(raw) || /\b\d{5}(?:-\d{4})?\b/.test(raw);
        const lowerName = meeting.name.toLowerCase();
        const hintedCity = lowerName.includes("laurel")
          ? "Laurel"
          : lowerName.includes("billings")
            ? "Billings"
            : "Billings";
        const withMontana = hasStateOrZip ? raw : `${raw}, ${hintedCity}, MT`;
        // Prefer region-qualified candidates first to avoid ambiguous global street matches.
        return hasStateOrZip
          ? Array.from(new Set([raw, `${raw}, USA`]))
          : Array.from(new Set([withMontana, `${withMontana}, USA`, raw]));
      };

      const geocodeFromNetwork = async (
        candidate: string,
      ): Promise<{ lat: number; lng: number; source: MeetingGeoSource } | null> => {
        try {
          const apiResponse = await fetch(
            `${apiUrl}/v1/geo/geocode?address=${encodeURIComponent(candidate)}`,
            {
              headers: {
                Authorization: authHeader,
              },
            },
          );
          if (apiResponse.ok) {
            const payload = (await apiResponse.json()) as {
              coords?: { lat?: number; lng?: number };
            };
            const parsedLat = asFiniteNumber(payload?.coords?.lat ?? null);
            const parsedLng = asFiniteNumber(payload?.coords?.lng ?? null);
            const distanceFromUserMiles =
              currentLocation &&
              parsedLat !== null &&
              parsedLng !== null &&
              Number.isFinite(currentLocation.lat) &&
              Number.isFinite(currentLocation.lng)
                ? distanceMiles(
                    { lat: currentLocation.lat, lng: currentLocation.lng },
                    { lat: parsedLat, lng: parsedLng },
                  )
                : null;
            const geo = classifyGeo({
              lat: payload?.coords?.lat ?? null,
              lng: payload?.coords?.lng ?? null,
              address: candidate,
              userRegionHint,
              distanceFromUserMiles,
            });
            if (isTrustedGeoStatus(geo.geoStatus) && geo.lat !== null && geo.lng !== null) {
              return { lat: geo.lat, lng: geo.lng, source: "backend_geocode" };
            }
          }
        } catch {
          // fall through to direct provider lookup
        }

        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(candidate)}`;
          const response = await fetch(url, {
            headers: {
              accept: "application/json",
            },
          });
          if (!response.ok) {
            return null;
          }
          const payload = (await response.json()) as Array<{ lat?: string; lon?: string }>;
          const first = payload[0];
          const parsedLat = asFiniteNumber(first?.lat ?? null);
          const parsedLng = asFiniteNumber(first?.lon ?? null);
          const distanceFromUserMiles =
            currentLocation &&
            parsedLat !== null &&
            parsedLng !== null &&
            Number.isFinite(currentLocation.lat) &&
            Number.isFinite(currentLocation.lng)
              ? distanceMiles(
                  { lat: currentLocation.lat, lng: currentLocation.lng },
                  { lat: parsedLat, lng: parsedLng },
                )
              : null;
          const geo = classifyGeo({
            lat: first?.lat ?? null,
            lng: first?.lon ?? null,
            address: candidate,
            userRegionHint,
            distanceFromUserMiles,
          });
          return isTrustedGeoStatus(geo.geoStatus) && geo.lat !== null && geo.lng !== null
            ? { lat: geo.lat, lng: geo.lng, source: "nominatim" }
            : null;
        } catch {
          return null;
        }
      };

      const next = [...records];
      for (let index = 0; index < next.length; index += 1) {
        const meeting = next[index];
        if (!meeting || meeting.format === "ONLINE") {
          continue;
        }
        const currentGeoStatus =
          normalizeMeetingGeoStatus(meeting.geoStatus) ??
          (meeting.lat !== null && meeting.lng !== null ? "verified" : "missing");
        const hasTrustedCoords =
          isTrustedGeoStatus(currentGeoStatus) &&
          typeof meeting.lat === "number" &&
          Number.isFinite(meeting.lat) &&
          typeof meeting.lng === "number" &&
          Number.isFinite(meeting.lng);
        const distanceFromUserToExistingMiles =
          currentLocation && hasTrustedCoords
            ? distanceMiles(
                { lat: currentLocation.lat, lng: currentLocation.lng },
                { lat: meeting.lat as number, lng: meeting.lng as number },
              )
            : null;
        const existingGeo = hasTrustedCoords
          ? classifyGeo({
              lat: meeting.lat,
              lng: meeting.lng,
              address: meeting.address,
              userRegionHint,
              distanceFromUserMiles: distanceFromUserToExistingMiles,
            })
          : null;
        const existingTrustedLooksAbsurd =
          hasTrustedCoords && existingGeo !== null && !isTrustedGeoStatus(existingGeo.geoStatus);
        const needsRecovery =
          currentGeoStatus === "missing" ||
          currentGeoStatus === "suspect" ||
          existingTrustedLooksAbsurd;
        const shouldSecondCheckTrusted =
          hasTrustedCoords &&
          !needsRecovery &&
          (meeting.geoSource === "feed" ||
            meeting.geoSource === "api" ||
            meeting.geoSource === "unknown" ||
            meeting.geoSource === null ||
            meeting.geoSource === undefined) &&
          typeof distanceFromUserToExistingMiles === "number" &&
          Number.isFinite(distanceFromUserToExistingMiles) &&
          distanceFromUserToExistingMiles > ADDRESS_SECOND_CHECK_DISTANCE_ANOMALY_MILES;
        if (!needsRecovery && !shouldSecondCheckTrusted) {
          continue;
        }

        const addressCandidates = buildAddressCandidates(meeting);
        if (addressCandidates.length === 0) {
          if (shouldSecondCheckTrusted && existingTrustedLooksAbsurd) {
            next[index] = {
              ...meeting,
              lat: null,
              lng: null,
              distanceMeters: null,
              geoStatus: "suspect",
              geoReason: "address_missing_for_second_check",
              geoUpdatedAt: new Date().toISOString(),
            };
          }
          continue;
        }

        let cached: { lat: number; lng: number; source: MeetingGeoSource } | null | undefined;
        let cacheKey = "";
        for (const candidate of addressCandidates) {
          const candidateKey = candidate.toLowerCase().replace(/\s+/g, " ").trim();
          const entry = geocodedAddressCacheRef.current[candidateKey];
          if (entry !== undefined) {
            cacheKey = candidateKey;
            cached = entry;
            break;
          }
        }
        if (cached === undefined) {
          if (lookups >= MAX_GEOCODE_LOOKUPS_PER_REFRESH) {
            if (shouldSecondCheckTrusted && existingTrustedLooksAbsurd) {
              next[index] = {
                ...meeting,
                lat: null,
                lng: null,
                distanceMeters: null,
                geoStatus: "suspect",
                geoReason: "second_check_lookup_budget_exhausted",
                geoUpdatedAt: new Date().toISOString(),
              };
            }
            continue;
          }
          lookups += 1;
          for (const candidate of addressCandidates) {
            const candidateKey = candidate.toLowerCase().replace(/\s+/g, " ").trim();
            cacheKey = candidateKey;
            try {
              if (Platform.OS === "ios") {
                // iOS 18.x has shown unstable native crashes in TurboModule exception conversion.
                // Avoid device geocoder on iOS and use network fallback instead.
                cached = await geocodeFromNetwork(candidate);
              } else {
                const geocoded = await geocodeAsync(candidate);
                const first = geocoded[0];
                const geo = classifyGeo({
                  lat: first?.latitude ?? null,
                  lng: first?.longitude ?? null,
                  address: candidate,
                });
                cached =
                  isTrustedGeoStatus(geo.geoStatus) && geo.lat !== null && geo.lng !== null
                    ? { lat: geo.lat, lng: geo.lng, source: "device_geocode" }
                    : null;
              }
            } catch {
              cached = await geocodeFromNetwork(candidate);
            }
            geocodedAddressCacheRef.current[candidateKey] = cached ?? null;
            if (cached) {
              break;
            }
          }
        }

        if (!cached) {
          if (cacheKey.length === 0) {
            const fallbackKey = addressCandidates[0]?.toLowerCase().replace(/\s+/g, " ").trim();
            if (fallbackKey) {
              geocodedAddressCacheRef.current[fallbackKey] = null;
            }
          }
          if (needsRecovery) {
            next[index] = {
              ...meeting,
              lat: null,
              lng: null,
              geoStatus: "missing",
              geoReason: "missing_coordinates",
            };
          } else if (shouldSecondCheckTrusted && existingTrustedLooksAbsurd) {
            next[index] = {
              ...meeting,
              lat: null,
              lng: null,
              distanceMeters: null,
              geoStatus: "suspect",
              geoReason: "address_second_check_failed",
              geoUpdatedAt: new Date().toISOString(),
            };
          }
          continue;
        }

        const distanceFromUserMiles =
          currentLocation &&
          Number.isFinite(currentLocation.lat) &&
          Number.isFinite(currentLocation.lng)
            ? distanceMiles(
                { lat: currentLocation.lat, lng: currentLocation.lng },
                { lat: cached.lat, lng: cached.lng },
              )
            : null;
        const trustedGeo = classifyGeo({
          lat: cached.lat,
          lng: cached.lng,
          address: meeting.address,
          userRegionHint,
          distanceFromUserMiles,
        });
        if (
          !isTrustedGeoStatus(trustedGeo.geoStatus) ||
          trustedGeo.lat === null ||
          trustedGeo.lng === null
        ) {
          if (needsRecovery) {
            next[index] = {
              ...meeting,
              lat: null,
              lng: null,
              geoStatus: "missing",
              geoSource: cached.source,
              geoReason: trustedGeo.geoReason ?? "missing_coordinates",
              geoUpdatedAt: new Date().toISOString(),
            };
          } else if (shouldSecondCheckTrusted && existingTrustedLooksAbsurd) {
            next[index] = {
              ...meeting,
              lat: null,
              lng: null,
              distanceMeters: null,
              geoStatus: "suspect",
              geoSource: cached.source,
              geoReason: trustedGeo.geoReason ?? "address_second_check_failed",
              geoUpdatedAt: new Date().toISOString(),
            };
          }
          continue;
        }

        if (needsRecovery) {
          resolved += 1;
          next[index] = {
            ...meeting,
            lat: trustedGeo.lat,
            lng: trustedGeo.lng,
            geoStatus: "estimated",
            geoSource: cached.source,
            geoReason: trustedGeo.geoReason,
            geoUpdatedAt: new Date().toISOString(),
          };
          continue;
        }

        if (!hasTrustedCoords) {
          continue;
        }

        const existingVsAddressMiles = distanceMiles(
          { lat: meeting.lat as number, lng: meeting.lng as number },
          { lat: trustedGeo.lat, lng: trustedGeo.lng },
        );
        if (
          !Number.isFinite(existingVsAddressMiles) ||
          existingVsAddressMiles < ADDRESS_SECOND_CHECK_MISMATCH_MILES
        ) {
          continue;
        }

        const distanceMetersFromCurrent =
          currentLocation &&
          Number.isFinite(currentLocation.lat) &&
          Number.isFinite(currentLocation.lng)
            ? distanceMiles(
                { lat: currentLocation.lat, lng: currentLocation.lng },
                { lat: trustedGeo.lat, lng: trustedGeo.lng },
              ) * 1609.344
            : (meeting.distanceMeters ?? null);

        resolved += 1;
        overrides += 1;
        next[index] = {
          ...meeting,
          lat: trustedGeo.lat,
          lng: trustedGeo.lng,
          distanceMeters: distanceMetersFromCurrent,
          geoStatus: "estimated",
          geoSource: cached.source,
          geoReason: "address_second_check_override",
          geoUpdatedAt: new Date().toISOString(),
        };
      }

      if (__DEV__ && resolved > 0) {
        console.log("[meetings] geocode fallback resolved", {
          resolved,
          overrides,
          lookups,
        });
      }

      return next;
    },
    [apiUrl, authHeader, currentLocation],
  );

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
      const normalizedSignatureUri = getAttendanceSignatureUri(record);
      const normalizedRecord: AttendanceRecord = {
        ...record,
        schemaVersion: ATTENDANCE_SCHEMA_VERSION,
        signatureRef: normalizedSignatureUri
          ? {
              uri: normalizedSignatureUri,
              mimeType: normalizedSignatureUri.toLowerCase().endsWith(".svg")
                ? "image/svg+xml"
                : "image/png",
            }
          : null,
        signaturePngBase64: null,
      };
      setAttendanceRecords((previous) => {
        const next = [
          normalizedRecord,
          ...previous.filter((item) => item.id !== normalizedRecord.id),
        ].sort(
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

  const autoCompleteSponsorCheckIn = useCallback(() => {
    updateRoutinesStore((store) => {
      const todayKey = dateKeyForRoutines(new Date());
      const currentDay = getMorningDayState(store, todayKey);
      if (currentDay.completedByItemId["sponsor-check-in"]) {
        return store;
      }

      const completedByItemId = {
        ...currentDay.completedByItemId,
        "sponsor-check-in": new Date().toISOString(),
      };
      const enabledItemIds = new Set(
        store.morningTemplate.items.filter((item) => item.enabled).map((item) => item.id),
      );
      const completedEnabledCount = Object.keys(completedByItemId).filter((itemId) =>
        enabledItemIds.has(itemId),
      ).length;
      const nextCompletedAt =
        enabledItemIds.size > 0 && completedEnabledCount >= enabledItemIds.size
          ? new Date().toISOString()
          : null;

      return {
        ...store,
        morningByDate: {
          ...store.morningByDate,
          [todayKey]: {
            ...currentDay,
            completedByItemId,
            completedAt: nextCompletedAt,
          },
        },
      };
    });
  }, [updateRoutinesStore]);

  const completeMorningItemForCurrentDayIfEnabled = useCallback(
    (itemId: string): "completed" | "disabled" | "already-complete" => {
      const currentDay = getMorningDayState(routinesStore, routineDateKey);
      const completionResult = completeMorningItemIfEnabled(
        currentDay,
        routinesStore.morningTemplate.items,
        itemId,
        new Date().toISOString(),
      );
      if (completionResult.changed) {
        updateRoutinesStore((store) => ({
          ...store,
          morningByDate: {
            ...store.morningByDate,
            [routineDateKey]: completionResult.nextDayState,
          },
        }));
      }
      return completionResult.reason;
    },
    [routineDateKey, routinesStore, updateRoutinesStore],
  );

  const isMorningItemEnabled = useCallback(
    (itemId: string): boolean =>
      routinesStore.morningTemplate.items.some((item) => item.id === itemId && item.enabled),
    [routinesStore.morningTemplate.items],
  );

  const resolveMorningReadRequiredSeconds = useCallback(
    (itemId: string): number => {
      if (
        MORNING_PRAYER_ITEM_IDS.has(itemId) &&
        wizardHasSponsor === true &&
        sponsorKneesSuggested === false
      ) {
        return SPONSOR_NO_KNEES_READ_DWELL_SECONDS;
      }
      return DEFAULT_MORNING_READ_DWELL_SECONDS;
    },
    [wizardHasSponsor, sponsorKneesSuggested],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      const didReturnToApp =
        (previousState === "inactive" || previousState === "background") && nextState === "active";

      if (!didReturnToApp) {
        return;
      }

      setPendingDailyReflectionsCompletion((pending) => {
        if (!pending) {
          return null;
        }

        const todayDateKey = dateKeyForRoutines(new Date());
        if (!shouldCompletePendingDailyReflections(pending, Date.now(), todayDateKey)) {
          return null;
        }

        completeMorningItemForCurrentDayIfEnabled(DAILY_REFLECTIONS_ITEM_ID);
        return null;
      });
    });

    return () => {
      subscription.remove();
    };
  }, [completeMorningItemForCurrentDayIfEnabled]);
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

  const playRoutineItemAudio = useCallback(
    async (itemId: string) => {
      if (itemId === THIRD_STEP_PRAYER_ITEM_ID) {
        try {
          await Linking.openURL(THIRD_STEP_PRAYER_YOUTUBE_URL);
        } catch {
          setRoutinesStatus("Unable to open video.");
        }
        return;
      }
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

  const onReadThirdStepPrayer = useCallback(() => {
    if (!isMorningItemEnabled(THIRD_STEP_PRAYER_ITEM_ID)) {
      setRoutinesStatus("Turn this checklist item on first.");
      return;
    }
    setRoutineReaderBackScreen("MORNING");
    setRoutineReader({
      title: "3rd Step Prayer",
      url: null,
      bodyText: THIRD_STEP_PRAYER_READ_TEXT,
      itemId: THIRD_STEP_PRAYER_ITEM_ID,
      requiredDwellSeconds: resolveMorningReadRequiredSeconds(THIRD_STEP_PRAYER_ITEM_ID),
    });
    setToolsScreen("READER");
  }, [isMorningItemEnabled, resolveMorningReadRequiredSeconds]);

  const onListenThirdStepPrayer = useCallback(() => {
    const completionReason = completeMorningItemForCurrentDayIfEnabled(THIRD_STEP_PRAYER_ITEM_ID);
    if (completionReason === "disabled") {
      setRoutinesStatus("Turn this checklist item on first.");
      return;
    }
    speakRoutineText("3rd Step Prayer");
  }, [completeMorningItemForCurrentDayIfEnabled, speakRoutineText]);

  const sendMorningSponsorTextNow = useCallback(async () => {
    const completionReason = completeMorningItemForCurrentDayIfEnabled("sponsor-check-in");
    if (completionReason === "disabled") {
      setRoutinesStatus("Turn this checklist item on first.");
      return;
    }

    const digits = normalizePhoneDigits(sponsorPhoneDigits);
    if (!digits) {
      setRoutinesStatus("Sponsor phone not set. Configure sponsor in Recovery Settings.");
      return;
    }

    const recipient = sponsorPhoneE164 ?? digits;
    const candidateUrls =
      Platform.OS === "ios"
        ? [`sms:${recipient}`, `sms:${recipient}&body=`, `sms:${recipient}?body=`]
        : [`sms:${recipient}`, `smsto:${recipient}`];

    for (const url of candidateUrls) {
      try {
        await Linking.openURL(url);
        setRoutinesStatus("Opened SMS draft for sponsor.");
        return;
      } catch {
        // try next URL shape
      }
    }

    setRoutinesStatus("Unable to open SMS on this device.");
  }, [completeMorningItemForCurrentDayIfEnabled, sponsorPhoneDigits, sponsorPhoneE164]);

  const onReadSeventhStepPrayer = useCallback(() => {
    if (!isMorningItemEnabled(SEVENTH_STEP_PRAYER_ITEM_ID)) {
      setRoutinesStatus("Turn this checklist item on first.");
      return;
    }
    setRoutineReaderBackScreen("MORNING");
    setRoutineReader({
      title: "7th Step Prayer",
      url: null,
      bodyText: SEVENTH_STEP_PRAYER_READ_TEXT,
      itemId: SEVENTH_STEP_PRAYER_ITEM_ID,
      requiredDwellSeconds: resolveMorningReadRequiredSeconds(SEVENTH_STEP_PRAYER_ITEM_ID),
    });
    setToolsScreen("READER");
  }, [isMorningItemEnabled, resolveMorningReadRequiredSeconds]);

  const onReadEleventhStepPrayer = useCallback(() => {
    if (!isMorningItemEnabled(ELEVENTH_STEP_PRAYER_ITEM_ID)) {
      setRoutinesStatus("Turn this checklist item on first.");
      return;
    }
    setRoutineReaderBackScreen("MORNING");
    setRoutineReader({
      title: "11th Step AM Prayer",
      url: null,
      bodyText: ELEVENTH_STEP_AM_PRAYER_TEXT,
      itemId: ELEVENTH_STEP_PRAYER_ITEM_ID,
      requiredDwellSeconds: resolveMorningReadRequiredSeconds(ELEVENTH_STEP_PRAYER_ITEM_ID),
    });
    setToolsScreen("READER");
  }, [isMorningItemEnabled, resolveMorningReadRequiredSeconds]);

  const onListenNightlyPrayer = useCallback(() => {
    speakRoutineText(ELEVENTH_STEP_NIGHTLY_PRAYER_TEXT);
  }, [speakRoutineText]);

  const onReadNightlyPrayer = useCallback(() => {
    if (!nightlyInventoryDayState.eleventhStepPrayerEnabled) {
      setRoutinesStatus("Turn this checklist item on first.");
      return;
    }

    updateNightlyDayState((day) => ({
      ...day,
      eleventhStepPrayerCompletedAt: day.eleventhStepPrayerCompletedAt ?? new Date().toISOString(),
    }));
    setRoutineReaderBackScreen("NIGHTLY");
    setRoutineReader({
      title: "11th Step Prayer",
      url: null,
      bodyText: ELEVENTH_STEP_NIGHTLY_PRAYER_TEXT,
      itemId: null,
    });
    setToolsScreen("READER");
  }, [
    nightlyInventoryDayState.eleventhStepPrayerEnabled,
    setRoutinesStatus,
    updateNightlyDayState,
  ]);

  const openRoutineReader = useCallback(
    (itemId: string, title: string, url: string | null) => {
      if (!isMorningItemEnabled(itemId)) {
        setRoutinesStatus("Turn this checklist item on first.");
        return;
      }

      const requiredDwellSeconds = resolveMorningReadRequiredSeconds(itemId);
      if (itemId === BIG_BOOK_86_88_ITEM_ID || itemId === BIG_BOOK_60_63_ITEM_ID) {
        const bigBookBodyText = BIG_BOOK_ROUTINE_TEXT[itemId] ?? "";
        setRoutineReaderBackScreen("MORNING");
        setRoutineReader({
          title,
          url: null,
          bodyText: bigBookBodyText,
          itemId,
          requiredDwellSeconds,
        });
        setToolsScreen("READER");
        return;
      }
      setRoutineReaderBackScreen("MORNING");
      setRoutineReader({ title, url, bodyText: null, itemId, requiredDwellSeconds });
      setToolsScreen("READER");
    },
    [isMorningItemEnabled, resolveMorningReadRequiredSeconds],
  );

  const openRoutineReaderLink = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      setRoutinesStatus("Unable to open this link.");
    }
  }, []);

  const routineReaderMorningPrayerItemId = useMemo(() => {
    if (routineReaderBackScreen !== "MORNING") {
      return null;
    }
    const itemId = routineReader?.itemId ?? null;
    if (!itemId || !MORNING_PRAYER_ITEM_IDS.has(itemId)) {
      return null;
    }
    return itemId;
  }, [routineReaderBackScreen, routineReader?.itemId]);

  const routineReaderShowsNightlyOnKneesToggle = useMemo(
    () =>
      routineReaderBackScreen === "NIGHTLY" && (routineReader?.title ?? "") === "11th Step Prayer",
    [routineReaderBackScreen, routineReader?.title],
  );

  const hideOnKneesToggleForSponsorPreference =
    wizardHasSponsor === true && sponsorKneesSuggested === false;

  const routineReaderShowsOnKneesToggle =
    !hideOnKneesToggleForSponsorPreference &&
    (routineReaderShowsNightlyOnKneesToggle || routineReaderMorningPrayerItemId !== null);

  const routineReaderOnKneesCompleted = useMemo(() => {
    if (routineReaderShowsNightlyOnKneesToggle) {
      return nightlyInventoryDayState.gotOnKneesCompleted;
    }
    if (routineReaderMorningPrayerItemId) {
      return Boolean(
        morningRoutineDayState.prayerOnKneesByItemId[routineReaderMorningPrayerItemId],
      );
    }
    return false;
  }, [
    routineReaderShowsNightlyOnKneesToggle,
    nightlyInventoryDayState.gotOnKneesCompleted,
    routineReaderMorningPrayerItemId,
    morningRoutineDayState.prayerOnKneesByItemId,
  ]);

  const onToggleRoutineReaderOnKnees = useCallback(() => {
    if (routineReaderShowsNightlyOnKneesToggle) {
      updateNightlyDayState((day) => ({
        ...day,
        gotOnKneesCompleted: !day.gotOnKneesCompleted,
      }));
      return;
    }
    if (routineReaderMorningPrayerItemId) {
      updateMorningDayState((day) => ({
        ...day,
        prayerOnKneesByItemId: {
          ...day.prayerOnKneesByItemId,
          [routineReaderMorningPrayerItemId]:
            !day.prayerOnKneesByItemId[routineReaderMorningPrayerItemId],
        },
      }));
    }
  }, [
    routineReaderShowsNightlyOnKneesToggle,
    routineReaderMorningPrayerItemId,
    updateNightlyDayState,
    updateMorningDayState,
  ]);

  const onRoutineReaderDwellEligible = useCallback(() => {
    if (routineReaderBackScreen !== "MORNING") {
      return;
    }
    const itemId = routineReader?.itemId ?? null;
    if (!itemId) {
      return;
    }
    const completionReason = completeMorningItemForCurrentDayIfEnabled(itemId);
    if (completionReason === "disabled") {
      setRoutinesStatus("Turn this checklist item on first.");
      return;
    }
    if (completionReason === "completed") {
      setRoutinesStatus("Read complete.");
    }
  }, [completeMorningItemForCurrentDayIfEnabled, routineReader?.itemId, routineReaderBackScreen]);

  const openDailyReflections = useCallback(
    async (source: "read" | "listen") => {
      const dailyReflectionsItem = routinesStore.morningTemplate.items.find(
        (item) => item.id === DAILY_REFLECTIONS_ITEM_ID,
      );
      if (!dailyReflectionsItem?.enabled) {
        setRoutinesStatus("Turn this checklist item on first.");
        return;
      }

      const startedAtMs = Date.now();
      setPendingDailyReflectionsCompletion(
        buildPendingDailyReflectionsCompletion(source, startedAtMs),
      );

      try {
        await Linking.openURL(DAILY_REFLECTIONS_URL);
      } catch {
        setPendingDailyReflectionsCompletion(null);
        setRoutinesStatus("Unable to open Daily Reflections");
      }
    },
    [routinesStore.morningTemplate.items],
  );

  const openDailyReflectionsRead = useCallback(() => {
    void openDailyReflections("read");
  }, [openDailyReflections]);

  const openDailyReflectionsListen = useCallback(() => {
    void openDailyReflections("listen");
  }, [openDailyReflections]);

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
      const mapEntriesWithFear = (entries: Array<{ text: string; fear?: string | null }>) =>
        entries.map((entry) =>
          entry.fear && entry.fear.trim().length > 0
            ? `${entry.text} (Fear: ${entry.fear})`
            : entry.text,
        );
      const uri = await exportNightlyInventoryPdf({
        userLabel: devUserDisplayName,
        dateKey: routineDateKey,
        prompt: dayState.prompt,
        gotOnKneesCompleted: dayState.gotOnKneesCompleted,
        resentful: mapEntriesWithFear(dayState.resentful),
        selfSeeking: mapEntriesWithFear(dayState.selfSeeking),
        selfish: mapEntriesWithFear(dayState.selfish),
        dishonest: mapEntriesWithFear(dayState.dishonest),
        apology: dayState.apology.map((entry) => entry.text),
        notes: dayState.notes,
        completedAt: dayState.completedAt,
      });
      setRoutinesStatus(`Nightly routine PDF exported: ${uri}`);
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
    const summarizeWithFear = (
      label: string,
      values: Array<{ text: string; fear?: string | null }>,
    ) =>
      `${label}: ${
        values.length > 0
          ? values
              .map((entry) =>
                entry.fear && entry.fear.trim().length > 0
                  ? `${entry.text} (Fear: ${entry.fear})`
                  : entry.text,
              )
              .join("; ")
          : "None"
      }`;
    const body = [
      `Nightly Routine ${routineDateKey}`,
      `Got on knees: ${dayState.gotOnKneesCompleted ? "Yes" : "No"}`,
      summarizeWithFear("Resentful", dayState.resentful),
      summarizeWithFear("Self-seeking", dayState.selfSeeking),
      summarizeWithFear("Selfish", dayState.selfish),
      summarizeWithFear("Dishonest", dayState.dishonest),
      summarize("Apology", dayState.apology),
      `Notes: ${dayState.notes || "None"}`,
    ].join("\n");

    const recipient = sponsorPhoneE164 ?? digits;
    const encodedBody = encodeURIComponent(body);
    const candidateUrls =
      Platform.OS === "ios"
        ? [
            `sms:${recipient}&body=${encodedBody}`,
            `sms:${recipient}?body=${encodedBody}`,
            `sms:${recipient}`,
          ]
        : [
            `sms:${recipient}?body=${encodedBody}`,
            `sms:${recipient}&body=${encodedBody}`,
            `smsto:${recipient}?body=${encodedBody}`,
            `sms:${recipient}`,
          ];

    for (const url of candidateUrls) {
      try {
        await Linking.openURL(url);
        setRoutinesStatus("Opened SMS draft for sponsor.");
        return;
      } catch {
        // try next URL shape
      }
    }
    setRoutinesStatus("Unable to open SMS on this device.");
  }, [sponsorPhoneDigits, sponsorPhoneE164, nightlyInventoryDayState, routineDateKey]);

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
    async (options?: { location?: LocationStamp | null; radiusMiles?: number }) => {
      try {
        let location: LocationStamp | null = options?.location ?? null;
        const effectiveRadiusMiles = options?.radiusMiles ?? meetingRadiusMiles;
        if (options?.location === undefined && locationPermission === "granted") {
          location = await readCurrentLocation(false);
        }

        const requestKey = [
          selectedDay.dayOfWeek,
          effectiveRadiusMiles,
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
          radiusMiles: effectiveRadiusMiles,
        };

        const selectedDayScopedResult = await source.listMeetings({
          dayOfWeek: selectedDay.dayOfWeek,
          ...requestParams,
        });
        const selectedDayScopedMeetings = sanitizeMeetingRecords(
          Array.isArray(selectedDayScopedResult.meetings) ? selectedDayScopedResult.meetings : [],
        );
        const selectedDayUnscopedResult = await source.listMeetings({
          dayOfWeek: selectedDay.dayOfWeek,
        });
        const selectedDayUnscopedMeetings = sanitizeMeetingRecords(
          Array.isArray(selectedDayUnscopedResult.meetings)
            ? selectedDayUnscopedResult.meetings
            : [],
        );
        const selectedDayById = new Map<string, MeetingRecord>();
        for (const meeting of selectedDayUnscopedMeetings) {
          selectedDayById.set(meeting.id, meeting);
        }
        for (const meeting of selectedDayScopedMeetings) {
          selectedDayById.set(meeting.id, meeting);
        }
        const selectedDayMeetings = Array.from(selectedDayById.values());

        const todayScopedResult =
          selectedDay.dayOfWeek === todayDayOfWeek
            ? selectedDayScopedResult
            : await source.listMeetings({
                dayOfWeek: todayDayOfWeek,
                ...requestParams,
              });
        const todayScopedMeetings = sanitizeMeetingRecords(
          Array.isArray(todayScopedResult.meetings) ? todayScopedResult.meetings : [],
        );

        // Always merge in an unscoped "today" fetch so setup can offer all meetings for today's
        // home-group selection, not only meetings inside the nearby radius.
        const todayUnscopedResult =
          selectedDay.dayOfWeek === todayDayOfWeek
            ? selectedDayUnscopedResult
            : await source.listMeetings({
                dayOfWeek: todayDayOfWeek,
              });
        const todayUnscopedMeetings = sanitizeMeetingRecords(
          Array.isArray(todayUnscopedResult.meetings) ? todayUnscopedResult.meetings : [],
        );
        const todayById = new Map<string, MeetingRecord>();
        for (const meeting of todayUnscopedMeetings) {
          todayById.set(meeting.id, meeting);
        }
        for (const meeting of todayScopedMeetings) {
          todayById.set(meeting.id, meeting);
        }
        const todayResultMeetings = Array.from(todayById.values());

        const nowLocal = new Date();
        const nowMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
        const todayHasUpcomingMeetings = todayResultMeetings.some(
          (meeting) => parseMinutesFromHhmm(meeting.startsAtLocal) >= nowMinutes,
        );

        let nextDayOffset = 1;
        let nextDayMeetings: MeetingRecord[] = [];

        if (!todayHasUpcomingMeetings) {
          for (let dayOffset = 1; dayOffset <= 6; dayOffset += 1) {
            const dayOfWeek = (todayDayOfWeek + dayOffset) % 7;
            const scopedResult = await source.listMeetings({
              dayOfWeek,
              ...requestParams,
            });
            const scopedMeetings = sanitizeMeetingRecords(
              Array.isArray(scopedResult.meetings) ? scopedResult.meetings : [],
            );
            const unscopedResult = await source.listMeetings({ dayOfWeek });
            const unscopedMeetings = sanitizeMeetingRecords(
              Array.isArray(unscopedResult.meetings) ? unscopedResult.meetings : [],
            );
            const byId = new Map<string, MeetingRecord>();
            for (const meeting of unscopedMeetings) {
              byId.set(meeting.id, meeting);
            }
            for (const meeting of scopedMeetings) {
              byId.set(meeting.id, meeting);
            }
            const merged = Array.from(byId.values());
            if (merged.length > 0) {
              nextDayOffset = dayOffset;
              nextDayMeetings = merged;
              break;
            }
          }
        }

        const selectedDayMeetingsWithGeo =
          await geocodeMeetingsMissingCoordinates(selectedDayMeetings);
        const todayResultMeetingsWithGeo =
          await geocodeMeetingsMissingCoordinates(todayResultMeetings);
        const nextDayMeetingsWithGeo = await geocodeMeetingsMissingCoordinates(nextDayMeetings);

        setMeetings(selectedDayMeetingsWithGeo);
        setTodayNearbyMeetings(todayResultMeetingsWithGeo);
        setHomeGroupFallbackDayOffset(nextDayOffset);
        setHomeGroupFallbackMeetings(nextDayMeetingsWithGeo);

        if (!meetingsShapeLoggedRef.current && selectedDayMeetingsWithGeo.length > 0) {
          meetingsShapeLoggedRef.current = true;
          console.log("[meetings] normalized sample", selectedDayMeetingsWithGeo[0]);
        }

        const selectedDayWarning =
          selectedDayScopedResult.warning ?? selectedDayUnscopedResult.warning;
        const warningSuffix = selectedDayWarning ? ` (${selectedDayWarning})` : "";
        setMeetingsStatus(`Meetings updated${warningSuffix}.`);
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
      geocodeMeetingsMissingCoordinates,
    ],
  );

  useEffect(() => {
    refreshMeetingsRef.current = refreshMeetings;
  }, [refreshMeetings]);

  useEffect(() => {
    requestLocationPermissionRef.current = requestLocationPermission;
  }, [requestLocationPermission]);

  useEffect(() => {
    currentLocationRef.current = currentLocation;
  }, [currentLocation]);

  useEffect(() => {
    if (homeScreen === "DIAGNOSTICS" && isDiagnosticsEnabled) {
      void refreshDiagnosticsLocation();
    }
  }, [homeScreen, isDiagnosticsEnabled, refreshDiagnosticsLocation]);

  useEffect(() => {
    if (homeScreen === "DIAGNOSTICS" && !isDiagnosticsEnabled) {
      setHomeScreen("SETTINGS");
    }
  }, [homeScreen, isDiagnosticsEnabled]);

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

  const openPrivacyStatement = useCallback(() => {
    setMode("A");
    setHomeScreen("PRIVACY");
    setScreen("LIST");
    setSelectedMeeting(null);
  }, []);

  const openDiagnosticsFromSettings = useCallback(() => {
    if (!isDiagnosticsEnabled) {
      return;
    }

    if (Platform.OS === "android") {
      ToastAndroid.show("Diagnostics unlocked", ToastAndroid.SHORT);
    } else {
      Alert.alert("Diagnostics unlocked");
    }
    setHomeScreen("DIAGNOSTICS");
    setScreen("LIST");
  }, [isDiagnosticsEnabled]);

  const closeDiagnostics = useCallback(() => {
    setHomeScreen("SETTINGS");
    setScreen("LIST");
  }, []);

  const openAttendanceHub = useCallback(
    (entryPoint: AttendanceEntryPoint = "dashboard") => {
      setAttendanceEntryPoint(entryPoint);
      setHomeScreen("ATTENDANCE");
      setAttendanceViewFilter("ALL");
      setShowInactiveAttendance(false);
      setAttendanceValidityFilter("ALL");
      setSelectedAttendanceIds([]);
      setAttendanceStatus(
        activeAttendance && !activeAttendance.endAt
          ? `Attendance in progress for ${activeAttendance.meetingName}.`
          : "Viewing all logged meetings.",
      );
      setToolsScreen("HOME");
      setScreen("LIST");
      setSelectedMeeting(null);
    },
    [activeAttendance],
  );

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

  const openChatComingSoon = useCallback(() => {
    setHomeScreen("CHAT");
    setToolsScreen("HOME");
    setScreen("LIST");
    setSelectedMeeting(null);
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
    setScreen(activeAttendance && !activeAttendance.endAt ? "SESSION" : "LIST");
    setSelectedMeeting(null);
    setSelectedDayOffset(0);
  }, [activeAttendance]);

  const backFromAttendance = useCallback(() => {
    if (attendanceEntryPoint === "meetings") {
      openMeetingsHub();
      return;
    }
    openDashboard();
  }, [attendanceEntryPoint, openDashboard, openMeetingsHub]);

  const attendanceBackLabel =
    attendanceEntryPoint === "meetings" ? "Back to Upcoming Meetings" : "Back to Dashboard";
  const attendanceBackA11yLabel =
    attendanceEntryPoint === "meetings" ? "Back to upcoming meetings" : "Back to dashboard";

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
    setWizardSponsorKneesSuggested(sponsorEnabled ? (sponsorKneesSuggested ?? true) : null);
    setWizardMeetingSignatureRequired(meetingSignatureRequired);
    setScreen("LIST");
    setSelectedMeeting(null);
    setSelectedDayOffset(0);
    void refreshMeetings();
  }, [refreshMeetings, meetingSignatureRequired, sponsorEnabled, sponsorKneesSuggested]);

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
        setWizardSponsorKneesSuggested((current) => (current === null ? true : current));
        setWizardWantsReminders((current) => (current === null ? true : current));
        setSponsorEnabled(true);
        setSetupStep(3);
      } else {
        setSponsorEnabled(false);
        setSponsorActive(false);
        setWizardSponsorKneesSuggested(null);
        setSponsorKneesSuggested(null);
        setWizardWantsReminders(false);
        setSetupStep(6);
      }
      return;
    }

    if (setupStep === 3) {
      if (wizardHasSponsor) {
        if (wizardSponsorKneesSuggested === null) {
          setSetupError("Choose whether your sponsor suggests praying on your knees.");
          return;
        }
        setSponsorKneesSuggested(wizardSponsorKneesSuggested);
      } else {
        setSponsorKneesSuggested(null);
      }
      setSetupStep(4);
      return;
    }

    if (setupStep === 4) {
      setSetupStep(5);
      return;
    }

    if (setupStep === 5) {
      if (wizardHasSponsor) {
        if (wizardWantsReminders === null) {
          setSetupError("Choose whether calendar notifications and alerts are enabled.");
          return;
        }
        if (
          wizardWantsReminders &&
          sponsorRepeatUnit === "WEEKLY" &&
          sponsorRepeatDaysSorted.length === 0
        ) {
          setSetupError("Select at least one reminder day.");
          return;
        }

        setSponsorEnabled(true);
        setSponsorActive(wizardWantsReminders);
        setSponsorEnabledAtIso((current) => current ?? new Date().toISOString());
        void (async () => {
          const saved = await saveSponsorConfigRef.current({
            sponsorEnabled: true,
            sponsorActive: wizardWantsReminders,
          });
          if (!saved) {
            setSponsorStatus("Sponsor auto-save failed. You can continue and retry from Settings.");
          }
        })();
      } else {
        setWizardWantsReminders(false);
      }
      setSetupStep(6);
      return;
    }

    if (setupStep === 6) {
      if (wizardHasHomeGroup === null) {
        setSetupError("Choose whether you have a home group.");
        return;
      }
      if (wizardHasHomeGroup && homeGroupMeetingIds.length === 0) {
        setSetupError("Select a home group meeting.");
        return;
      }
      if (wizardMeetingSignatureRequired === null) {
        setSetupError("Choose whether signatures are required at meetings.");
        return;
      }
      setSetupStep(7);
    }
  }, [
    setupStep,
    sobrietyDateInput,
    ninetyDayGoalInput,
    wizardHasSponsor,
    wizardSponsorKneesSuggested,
    normalizedSponsorName,
    sponsorPhoneE164,
    wizardWantsReminders,
    sponsorRepeatUnit,
    sponsorRepeatDaysSorted.length,
    wizardHasHomeGroup,
    homeGroupMeetingIds.length,
    wizardMeetingSignatureRequired,
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
      if (!enableSponsorApiSync) {
        return;
      }

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
  }, [apiUrl, authHeader, enableSponsorApiSync, formatApiErrorWithHint]);

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
        autoCompleteSponsorCheckIn();
        return;
      } catch {
        try {
          await Linking.openURL(fallbackUrl);
          setSponsorStatus(null);
          appendSponsorCallLog({ sponsorPhoneE164: normalizedE164, source, success: true });
          autoCompleteSponsorCheckIn();
          return;
        } catch {
          setSponsorStatus("Calling is not supported on this device (simulator).");
          appendSponsorCallLog({ sponsorPhoneE164: normalizedE164, source, success: false });
        }
      }
    },
    [appendSponsorCallLog, autoCompleteSponsorCheckIn, sponsorPhoneDigits],
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
      if (!calendarRuntimeEnabled) {
        setCalendarStatus("Calendar module unavailable in this build. Reinstall the app.");
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

      const recurrenceRule: CalendarTypes.RecurrenceRule =
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

      const eventDetails: CalendarEventInputCompat = {
        title: "Call Sponsor",
        notes,
        startDate: nextStart,
        endDate,
        alarms: [{ relativeOffset: 0 }],
        recurrenceRule,
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
      setCalendarStatus(`Calendar synced (${formatDateTimeLabel(nextStart)}).`);
    },
    [
      calendarRuntimeEnabled,
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
        if (!calendarRuntimeEnabled) {
          setMilestoneCalendarStatus("Calendar module unavailable in this build.");
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
      calendarRuntimeEnabled,
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
      await cancelScheduledNotificationsByType("sponsor");

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
        if (leadFireAt) {
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
      }

      const callFireAt = applyScheduleTime(nextCall);
      if (callFireAt) {
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
      }

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
        `Scheduled sponsor notifications (${scheduledIds.length}) for ${formatDateTimeLabel(nextCall)}.`,
      );
    },
    [
      cancelNotificationBucket,
      cancelScheduledNotificationsByType,
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
        if (!fireAt) {
          continue;
        }
        const id = await scheduleAt(fireAt, {
          title: `Leave in 10 minutes for ${meeting.name}`,
          body: `${standardPreview.travelMinutes}m travel • depart ${formatTimeLabel(standardPreview.departAt)}`,
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
            if (!serviceFireAt) {
              continue;
            }
            const serviceId = await scheduleAt(serviceFireAt, {
              title: `Service commitment: leave in 10 minutes for ${meeting.name}`,
              body: `${servicePreview.travelMinutes}m travel • depart ${formatTimeLabel(servicePreview.departAt)}`,
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
        if (enableSponsorApiSync) {
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
        }

        setSponsorStatus(enableSponsorApiSync ? null : "Sponsor settings saved locally.");

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
      enableSponsorApiSync,
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
    if (hasSponsor && wizardSponsorKneesSuggested === null) {
      setSetupError("Choose whether your sponsor suggests praying on your knees.");
      setSetupStep(3);
      return;
    }
    if (wantsReminders && sponsorRepeatUnit === "WEEKLY" && sponsorRepeatDaysSorted.length === 0) {
      setSetupError("Select at least one reminder day.");
      setSetupStep(5);
      return;
    }
    if (wizardHasHomeGroup === true && homeGroupMeetingIds.length === 0) {
      setSetupError("Select a home group meeting.");
      setSetupStep(6);
      return;
    }
    if (wizardMeetingSignatureRequired === null) {
      setSetupError("Choose whether signatures are required at meetings.");
      setSetupStep(6);
      return;
    }

    setSobrietyDateIso(parsedDateIso);
    setNinetyDayGoalTarget(parsedGoal);
    setNinetyDayGoalInput(String(parsedGoal));
    setMeetingSignatureRequired(wizardMeetingSignatureRequired);
    setSponsorEnabled(hasSponsor);
    setSponsorActive(wantsReminders);
    setSponsorKneesSuggested(hasSponsor ? (wizardSponsorKneesSuggested ?? true) : null);
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
    wizardSponsorKneesSuggested,
    wizardWantsReminders,
    normalizedSponsorName,
    sponsorPhoneE164,
    sponsorRepeatUnit,
    sponsorRepeatDaysSorted.length,
    wizardHasHomeGroup,
    homeGroupMeetingIds.length,
    wizardMeetingSignatureRequired,
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

  const getScheduledWindowForAttendance = useCallback((record: AttendanceRecord) => {
    const startedAt = new Date(record.startAt);
    const fallbackStart = Number.isNaN(startedAt.getTime()) ? new Date() : startedAt;
    const resolvedScheduledStartMs = parseScheduledStartForAttendance(record);

    if (resolvedScheduledStartMs === null) {
      const fallbackEnd = new Date(
        fallbackStart.getTime() + DEFAULT_MEETING_DURATION_MINUTES * 60_000,
      );
      return { startDate: fallbackStart, endDate: fallbackEnd };
    }
    const startDate = new Date(resolvedScheduledStartMs);
    const endDate = new Date(startDate.getTime() + DEFAULT_MEETING_DURATION_MINUTES * 60_000);
    return { startDate, endDate };
  }, []);

  const attachCalendarEventToAttendance = useCallback(
    async (recordId: string): Promise<boolean> => {
      if (!calendarRuntimeEnabled) {
        setAttendanceStatus("Calendar module unavailable in this build.");
        return false;
      }

      const sourceRecord =
        (activeAttendanceRef.current && activeAttendanceRef.current.id === recordId
          ? activeAttendanceRef.current
          : null) ??
        attendanceRecordsRef.current.find((record) => record.id === recordId) ??
        null;
      if (!sourceRecord) {
        setAttendanceStatus("Attendance record unavailable for calendar sync.");
        return false;
      }

      const hasPermission = await ensureCalendarPermission();
      if (!hasPermission) {
        setAttendanceStatus("Calendar permission denied.");
        Alert.alert("Calendar Permission Needed", "Enable Calendar access to add meeting events.", [
          { text: "Not now", style: "cancel" },
          {
            text: "Open Settings",
            onPress: () => {
              void Linking.openSettings();
            },
          },
        ]);
        return false;
      }

      const calendarId = await findWritableCalendarId();
      if (!calendarId) {
        setAttendanceStatus("No writable calendar found.");
        return false;
      }

      let existingEventId = sourceRecord.calendarEventId ?? null;
      if (existingEventId) {
        try {
          await Calendar.getEventAsync(existingEventId);
          setAttendanceStatus("Calendar event already linked to this attendance.");
          return true;
        } catch {
          existingEventId = null;
        }
      }

      const window = getScheduledWindowForAttendance(sourceRecord);
      const eventId = await Calendar.createEventAsync(calendarId, {
        title: `AA/NA Meeting - ${sourceRecord.meetingName}`,
        startDate: window.startDate,
        endDate:
          window.endDate > window.startDate
            ? window.endDate
            : new Date(window.startDate.getTime() + DEFAULT_MEETING_DURATION_MINUTES * 60_000),
        location:
          sourceRecord.meetingAddress && sourceRecord.meetingAddress.trim().length > 0
            ? sourceRecord.meetingAddress
            : undefined,
        notes: "Signature required",
        alarms: [{ relativeOffset: -10 }],
      });

      const next: AttendanceRecord = {
        ...sourceRecord,
        calendarEventId: eventId,
      };
      upsertAttendanceRecord(next);
      if (activeAttendanceRef.current?.id === next.id) {
        setActiveAttendance(next);
      }
      setAttendanceStatus("Meeting added to calendar.");
      return true;
    },
    [
      calendarRuntimeEnabled,
      ensureCalendarPermission,
      findWritableCalendarId,
      getScheduledWindowForAttendance,
      upsertAttendanceRecord,
    ],
  );

  const syncAttendCalendarAndLeaveAlert = useCallback(
    async (recordId: string, meeting: MeetingRecord, originOverride?: LocationStamp | null) => {
      try {
        const calendarAdded = await attachCalendarEventToAttendance(recordId);

        const sourceRecord =
          (activeAttendanceRef.current && activeAttendanceRef.current.id === recordId
            ? activeAttendanceRef.current
            : null) ??
          attendanceRecordsRef.current.find((record) => record.id === recordId) ??
          null;
        if (!sourceRecord) {
          return;
        }

        const destination = normalizeCoordinates({ lat: meeting.lat, lng: meeting.lng });
        if (!destination) {
          setAttendanceStatus(
            "Added to Calendar. Leave-time unavailable (missing meeting location).",
          );
          return;
        }

        const origin =
          originOverride ?? currentLocationRef.current ?? (await readCurrentLocation(false));
        if (!origin) {
          setAttendanceStatus(
            "Added to Calendar. Leave-time unavailable (current location unavailable).",
          );
          return;
        }

        const earlyMinutes =
          selectedDayPlan.plans[meeting.id]?.earlyMinutes ?? DEFAULT_MEETING_EARLY_MINUTES;
        const baseStartDate = new Date(sourceRecord.startAt);
        const startDateSource = Number.isNaN(baseStartDate.getTime()) ? new Date() : baseStartDate;
        const meetingDate = resolveNextMeetingDateForDayOfWeek(meeting.dayOfWeek, startDateSource);
        const meetingStartAt = combineDateWithHhmm(meetingDate, meeting.startsAtLocal);
        const directions = await getDirectionsDuration({
          origin: { lat: origin.lat, lng: origin.lng },
          destination,
          arrivalTime: meetingStartAt,
        });
        const leavePlan = buildLeaveTimePlan({
          meetingStartAt,
          earlyMinutes,
          travelDurationSeconds: directions.durationSeconds,
        });

        const hasNotificationPermission = await ensureNotificationPermission();
        if (!hasNotificationPermission) {
          setAttendanceStatus(
            "Added to Calendar. Notification permission denied for leave alerts.",
          );
          return;
        }

        let buckets = await loadNotificationBuckets();
        if (sourceRecord.leaveNotificationId) {
          try {
            await Notifications.cancelScheduledNotificationAsync(sourceRecord.leaveNotificationId);
          } catch {
            // ignore stale ids
          }
          buckets = {
            ...buckets,
            attendLeave: buckets.attendLeave.filter(
              (id) => id !== sourceRecord.leaveNotificationId,
            ),
          };
        }

        const fallbackImmediate = new Date(Date.now() + 1_500);
        const scheduledAt = leavePlan.notifyImmediately
          ? fallbackImmediate
          : (applyScheduleTime(leavePlan.leaveAt) ?? fallbackImmediate);
        const leaveTimeLabel = formatTimeLabel(leavePlan.leaveAt);
        const arrivalTimeLabel = formatTimeLabel(leavePlan.arrivalTargetAt);

        const leaveNotificationId = await scheduleAt(scheduledAt, {
          title: leavePlan.notifyImmediately
            ? "Leave now to arrive on time"
            : `Time to leave for ${meeting.name}`,
          body: `${leaveTimeLabel} leave • arrive by ${arrivalTimeLabel} (${earlyMinutes} min early)`,
          categoryIdentifier: DRIVE_NOTIFICATION_CATEGORY_ID,
          data: {
            type: "drive",
            meetingId: meeting.id,
            reason: "attend-leave",
          },
        });

        const nextBuckets: NotificationBuckets = {
          ...buckets,
          attendLeave: Array.from(new Set([...buckets.attendLeave, leaveNotificationId])),
        };
        await saveNotificationBuckets(nextBuckets);

        const latestRecord =
          (activeAttendanceRef.current && activeAttendanceRef.current.id === sourceRecord.id
            ? activeAttendanceRef.current
            : null) ??
          attendanceRecordsRef.current.find((record) => record.id === sourceRecord.id) ??
          sourceRecord;
        const nextRecord: AttendanceRecord = {
          ...latestRecord,
          leaveNotificationId,
          leaveNotificationAtIso: scheduledAt.toISOString(),
        };
        upsertAttendanceRecord(nextRecord);
        if (activeAttendanceRef.current?.id === nextRecord.id) {
          setActiveAttendance(nextRecord);
        }

        const summary = `Leave at ${leaveTimeLabel} to arrive by ${arrivalTimeLabel} (${earlyMinutes} min early).`;
        setAttendanceStatus(
          calendarAdded ? `Added to Calendar. ${summary}` : `Attendance started. ${summary}`,
        );
        Alert.alert("Attend confirmed", `Added to Calendar\n${summary}`);
      } catch (error) {
        setAttendanceStatus(
          `Attendance started. Post-attend scheduling failed: ${formatError(error)}`,
        );
      }
    },
    [
      attachCalendarEventToAttendance,
      readCurrentLocation,
      selectedDayPlan.plans,
      ensureNotificationPermission,
      loadNotificationBuckets,
      applyScheduleTime,
      scheduleAt,
      saveNotificationBuckets,
      upsertAttendanceRecord,
    ],
  );

  const startAttendance = useCallback(
    async (meeting: MeetingRecord) => {
      if (startAttendanceInFlightRef.current) {
        return;
      }

      const currentActive = activeAttendanceRef.current;
      if (currentActive && !currentActive.endAt) {
        if (currentActive.meetingId === meeting.id) {
          setAttendanceStatus(`Attendance already in progress for ${meeting.name}.`);
          setScreen("SESSION");
          return;
        }
        setAttendanceStatus(
          `Finish ${currentActive.meetingName} before starting another attendance.`,
        );
        return;
      }

      startAttendanceInFlightRef.current = true;
      try {
        const location = await readCurrentLocation(false);
        const nowIso = new Date().toISOString();
        const meetingCoords = normalizeCoordinates({ lat: meeting.lat, lng: meeting.lng });
        const distanceFromUserMiles =
          location && meetingCoords
            ? distanceMiles(
                { lat: location.lat, lng: location.lng },
                { lat: meetingCoords.lat, lng: meetingCoords.lng },
              )
            : null;
        const meetingGeoClassification = classifyGeo({
          lat: meetingCoords?.lat ?? null,
          lng: meetingCoords?.lng ?? null,
          address: meeting.address,
          userRegionHint: resolveUserRegionHintFromLocation(location),
          distanceFromUserMiles,
        });
        const normalizedMeetingGeoStatus = normalizeMeetingGeoStatus(meeting.geoStatus);
        const resolvedMeetingGeoStatus: MeetingGeoStatus = !isTrustedGeoStatus(
          meetingGeoClassification.geoStatus,
        )
          ? meetingGeoClassification.geoStatus
          : normalizedMeetingGeoStatus && !isTrustedGeoStatus(normalizedMeetingGeoStatus)
            ? normalizedMeetingGeoStatus
            : meetingGeoClassification.geoStatus;
        const resolvedMeetingCoords =
          isTrustedGeoStatus(resolvedMeetingGeoStatus) &&
          meetingGeoClassification.lat !== null &&
          meetingGeoClassification.lng !== null
            ? { lat: meetingGeoClassification.lat, lng: meetingGeoClassification.lng }
            : null;
        const next: AttendanceRecord = {
          id: createId("attendance"),
          meetingId: meeting.id,
          meetingName: meeting.name,
          meetingAddress: meeting.address,
          meetingDayOfWeek: normalizeMeetingDayOfWeek(meeting.dayOfWeek),
          scheduledStartsAtLocal: meeting.startsAtLocal ?? null,
          meetingLat: resolvedMeetingCoords?.lat ?? null,
          meetingLng: resolvedMeetingCoords?.lng ?? null,
          meetingGeoStatus: resolvedMeetingGeoStatus,
          meetingGeoSource: normalizeMeetingGeoSource(meeting.geoSource) ?? "unknown",
          meetingGeoReason:
            (!isTrustedGeoStatus(meetingGeoClassification.geoStatus)
              ? meetingGeoClassification.geoReason
              : null) ??
            meeting.geoReason ??
            null,
          meetingFormat: meeting.format,
          captureMethod: "attend-log",
          startAt: nowIso,
          endAt: null,
          durationSeconds: null,
          startLat: location?.lat ?? null,
          startLng: location?.lng ?? null,
          startAccuracyM: location?.accuracyM ?? null,
          endLat: null,
          endLng: null,
          endAccuracyM: null,
          inactive: false,
          signaturePromptShown: false,
          chairName: null,
          chairRole: null,
          signatureCapturedAtIso: null,
          calendarEventId: null,
          leaveNotificationId: null,
          leaveNotificationAtIso: null,
          signatureRef: null,
          pdfUri: null,
        };

        setActiveAttendance(next);
        setSignatureCaptureMeeting(null);
        upsertAttendanceRecord(next);
        setAttendanceStatus(`Attendance started at ${formatTimeLabel(new Date(nowIso))}.`);
        setScreen("SESSION");
        void syncAttendCalendarAndLeaveAlert(next.id, meeting, location);
      } finally {
        startAttendanceInFlightRef.current = false;
      }
    },
    [readCurrentLocation, upsertAttendanceRecord, syncAttendCalendarAndLeaveAlert],
  );

  const endAttendanceByRecordId = useCallback(
    async (
      recordId: string,
      options?: {
        skipDurationGuard?: boolean;
        skipSignaturePrompt?: boolean;
        skipEndConfirm?: boolean;
      },
    ) => {
      const baseRecord =
        (activeAttendance && activeAttendance.id === recordId ? activeAttendance : null) ??
        attendanceRecords.find((record) => record.id === recordId) ??
        null;
      if (!baseRecord || baseRecord.endAt) {
        return;
      }
      if (
        meetingSignatureRequired &&
        !hasAttendanceSignature(baseRecord) &&
        !options?.skipSignaturePrompt
      ) {
        const promptedRecord = baseRecord.signaturePromptShown
          ? baseRecord
          : {
              ...baseRecord,
              signaturePromptShown: true,
            };
        if (!baseRecord.signaturePromptShown) {
          upsertAttendanceRecord(promptedRecord);
          if (activeAttendance?.id === promptedRecord.id) {
            setActiveAttendance(promptedRecord);
          }
        }

        setAttendanceStatus("Before you leave, obtain chair signature.");
        if (!baseRecord.signaturePromptShown) {
          Alert.alert("Chair signature needed", "Before you leave, obtain chair signature.", [
            { text: "Later", style: "cancel" },
            {
              text: "Get signature",
              onPress: () => {
                setHomeScreen("MEETINGS");
                setScreen("SIGNATURE");
              },
            },
          ]);
        }
        return;
      }
      if (!options?.skipEndConfirm) {
        Alert.alert("End meeting now?", "This will close attendance.", [
          { text: "Cancel", style: "cancel" },
          {
            text: "End meeting",
            style: "destructive",
            onPress: () => {
              void endAttendanceByRecordId(recordId, {
                ...options,
                skipEndConfirm: true,
              });
            },
          },
        ]);
        return;
      }

      const location = await readCurrentLocation(false);
      const nowIso = new Date().toISOString();
      const durationSeconds = Math.max(
        0,
        Math.floor((new Date(nowIso).getTime() - new Date(baseRecord.startAt).getTime()) / 1000),
      );

      const next: AttendanceRecord = {
        ...baseRecord,
        endAt: nowIso,
        durationSeconds,
        endLat: location?.lat ?? null,
        endLng: location?.lng ?? null,
        endAccuracyM: location?.accuracyM ?? null,
      };

      if (
        durationSeconds < MIN_VALID_MEETING_MINUTES * 60 &&
        !options?.skipDurationGuard &&
        !options?.skipSignaturePrompt
      ) {
        Alert.alert(
          "Meeting may be invalid",
          `This meeting is under ${MIN_VALID_MEETING_MINUTES} minutes and will be marked invalid. End anyway?`,
          [
            { text: "Keep in progress", style: "cancel" },
            {
              text: "End anyway",
              style: "destructive",
              onPress: () => {
                void endAttendanceByRecordId(recordId, {
                  skipDurationGuard: true,
                  skipEndConfirm: true,
                });
              },
            },
          ],
        );
        return;
      }

      setActiveAttendance(next);
      upsertAttendanceRecord(next);
      appendMeetingAttendanceLog({
        meetingId: baseRecord.meetingId,
        method: "verified",
      });
      departurePromptedAttendanceRef.current = null;

      if (options?.skipSignaturePrompt) {
        setAttendanceStatus("Meeting canceled and logged as invalid.");
        if (homeScreen === "MEETINGS") {
          setScreen("LIST");
        }
        return;
      }

      if (hasAttendanceSignature(next)) {
        setAttendanceStatus("Attendance ended.");
        if (homeScreen === "MEETINGS") {
          setScreen("LIST");
        }
        return;
      }

      setAttendanceStatus("Attendance ended.");
      Alert.alert("Add signature?", "Do you want to capture a chairperson signature?", [
        {
          text: "No",
          style: "cancel",
          onPress: () => {
            if (homeScreen === "MEETINGS") {
              setScreen("LIST");
            }
          },
        },
        {
          text: "Yes",
          onPress: () => {
            setHomeScreen("MEETINGS");
            setScreen("SIGNATURE");
          },
        },
      ]);
    },
    [
      activeAttendance,
      attendanceRecords,
      readCurrentLocation,
      upsertAttendanceRecord,
      appendMeetingAttendanceLog,
      homeScreen,
      meetingSignatureRequired,
    ],
  );

  const endAttendance = useCallback(async () => {
    if (!activeAttendance || activeAttendance.endAt) {
      return;
    }
    await endAttendanceByRecordId(activeAttendance.id);
  }, [activeAttendance, endAttendanceByRecordId]);

  const cancelAttendanceByRecordId = useCallback(
    async (recordId: string) => {
      await endAttendanceByRecordId(recordId, {
        skipDurationGuard: true,
        skipSignaturePrompt: true,
        skipEndConfirm: true,
      });
    },
    [endAttendanceByRecordId],
  );

  const openAttendanceRecordSignatureCapture = useCallback(
    (recordId: string) => {
      const record = attendanceRecords.find((entry) => entry.id === recordId) ?? null;
      if (!record) {
        setAttendanceStatus("Attendance record unavailable.");
        return;
      }
      const signatureWindow = getSignatureWindowForAttendance(record);
      if (!signatureWindow.eligible) {
        setAttendanceStatus(signatureWindow.reason ?? SIGNATURE_WINDOW_HELP_TEXT);
        return;
      }
      if (activeAttendance && !activeAttendance.endAt && activeAttendance.id !== record.id) {
        setAttendanceStatus("End current attendance before capturing another signature.");
        return;
      }
      activeAttendanceRef.current = record;
      setActiveAttendance(record);
      setSignatureCaptureMeeting(null);
      setSignaturePoints([]);
      setSignatureChairNameInput(record.chairName ?? "");
      setSignatureChairRoleInput(record.chairRole ?? "");
      setHomeScreen("MEETINGS");
      setScreen("SIGNATURE");
      setAttendanceStatus(`Capture signature for ${record.meetingName}.`);
      setTimeout(() => {
        rootScrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 0);
    },
    [attendanceRecords, activeAttendance],
  );

  const openMeetingSignatureCapture = useCallback(
    (meeting: MeetingRecord) => {
      if (activeAttendance && !activeAttendance.endAt) {
        if (activeAttendance.meetingId !== meeting.id) {
          setAttendanceStatus("End current attendance before capturing a meeting-only signature.");
          return;
        }
        const signatureWindow = getSignatureWindowForAttendance(activeAttendance);
        if (!signatureWindow.eligible) {
          setAttendanceStatus(signatureWindow.reason ?? SIGNATURE_WINDOW_HELP_TEXT);
          return;
        }
        setSignatureCaptureMeeting(null);
        setSignaturePoints([]);
        setSignatureChairNameInput(activeAttendance.chairName ?? "");
        setSignatureChairRoleInput(activeAttendance.chairRole ?? "");
        setSelectedMeeting(meeting);
        setHomeScreen("MEETINGS");
        setMeetingsViewMode("LIST");
        setScreen("SIGNATURE");
        setAttendanceStatus(`Capture signature for ${meeting.name}.`);
        setTimeout(() => {
          rootScrollRef.current?.scrollTo({ y: 0, animated: true });
        }, 0);
        return;
      }
      setSignatureCaptureMeeting(meeting);
      setSignaturePoints([]);
      setSignatureChairNameInput("");
      setSignatureChairRoleInput("");
      setSelectedMeeting(meeting);
      setHomeScreen("MEETINGS");
      setMeetingsViewMode("LIST");
      setScreen("SIGNATURE");
      setAttendanceStatus(`Capture signature for ${meeting.name}.`);
      setTimeout(() => {
        rootScrollRef.current?.scrollTo({ y: 0, animated: true });
      }, 0);
    },
    [activeAttendance],
  );

  const persistSignaturePayloadAsFileRef = useCallback(
    async (rawSignature: string, recordId: string): Promise<string | null> => {
      try {
        const fileSystemModule = loadSignatureFileSystemModule();
        const normalized = await normalizeSignatureValueToRef(rawSignature, {
          fileSystem: fileSystemModule,
          recordId,
          subdirectory: signatureStorageSubdirectory,
          verifyFileExists: true,
        });
        if (!normalized.ref) {
          console.log("[signature] persist unavailable", {
            reason: normalized.reason ?? "unknown",
            recordId,
          });
        }
        return normalized.ref?.uri ?? null;
      } catch (error) {
        console.log("[signature] persist error", {
          message: error instanceof Error ? error.message : String(error),
          recordId,
        });
        return null;
      }
    },
    [signatureStorageSubdirectory],
  );

  const saveSignature = useCallback(async () => {
    try {
      const targetActiveAttendance = activeAttendanceRef.current ?? activeAttendance;
      if (!targetActiveAttendance && !signatureCaptureMeeting) {
        setAttendanceStatus("Open signature capture from a meeting first.");
        return;
      }

      const signatureSvgMarkup = buildSignatureSvgMarkup(
        signaturePoints,
        signatureCanvasSize.width,
        signatureCanvasSize.height,
      );

      if (!signatureSvgMarkup) {
        setAttendanceStatus("Draw a signature before saving.");
        return;
      }

      setAttendanceStatus("Saving signature...");

      const signatureRecordId = targetActiveAttendance?.id ?? createId("attendance-signature");
      const persistedSignatureRef = await persistSignaturePayloadAsFileRef(
        signatureSvgMarkup,
        signatureRecordId,
      );
      const signatureRefValue = persistedSignatureRef
        ? {
            uri: persistedSignatureRef,
            mimeType: persistedSignatureRef.toLowerCase().endsWith(".svg")
              ? ("image/svg+xml" as const)
              : ("image/png" as const),
          }
        : null;
      const signatureInlineFallback = persistedSignatureRef ? null : signatureSvgMarkup;

      if (targetActiveAttendance) {
        const nowIso = new Date().toISOString();
        const next: AttendanceRecord = {
          ...targetActiveAttendance,
          schemaVersion: ATTENDANCE_SCHEMA_VERSION,
          signatureRef: signatureRefValue,
          signaturePngBase64: signatureInlineFallback,
          signaturePromptShown: true,
          chairName:
            signatureChairNameInput.trim().length > 0 ? signatureChairNameInput.trim() : null,
          chairRole:
            signatureChairRoleInput.trim().length > 0 ? signatureChairRoleInput.trim() : null,
          signatureCapturedAtIso: nowIso,
        };

        activeAttendanceRef.current = next;
        setActiveAttendance(next);
        upsertAttendanceRecord(next);
        setSignatureCaptureMeeting(null);
        setSignaturePoints([]);
        setSignatureChairNameInput(next.chairName ?? "");
        setSignatureChairRoleInput(next.chairRole ?? "");
        const savedMessage = targetActiveAttendance.endAt
          ? "Signature saved."
          : "Signature saved. Meeting remains in progress until ended.";
        setAttendanceStatus(
          persistedSignatureRef
            ? savedMessage
            : `${savedMessage} Saved inline because file storage is unavailable.`,
        );
        setScreen("SESSION");
        return;
      }

      if (!signatureCaptureMeeting) {
        setAttendanceStatus("End attendance before saving signature.");
        return;
      }

      let location = currentLocationRef.current;
      if (!location) {
        location = await Promise.race<LocationStamp | null>([
          readCurrentLocation(false),
          new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), 1500);
          }),
        ]);
      }
      const nowIso = new Date().toISOString();
      const signatureMeetingCoords = normalizeCoordinates({
        lat: signatureCaptureMeeting.lat,
        lng: signatureCaptureMeeting.lng,
      });
      const signatureOnlyRecord: AttendanceRecord = {
        schemaVersion: ATTENDANCE_SCHEMA_VERSION,
        id: createId("attendance"),
        meetingId: signatureCaptureMeeting.id,
        meetingName: signatureCaptureMeeting.name,
        meetingAddress: signatureCaptureMeeting.address,
        meetingDayOfWeek: normalizeMeetingDayOfWeek(signatureCaptureMeeting.dayOfWeek),
        scheduledStartsAtLocal: signatureCaptureMeeting.startsAtLocal ?? null,
        meetingLat: signatureMeetingCoords?.lat ?? null,
        meetingLng: signatureMeetingCoords?.lng ?? null,
        meetingGeoStatus:
          normalizeMeetingGeoStatus(signatureCaptureMeeting.geoStatus) ??
          (isValidLatLng(signatureMeetingCoords?.lat ?? null, signatureMeetingCoords?.lng ?? null)
            ? "verified"
            : "missing"),
        meetingGeoSource: normalizeMeetingGeoSource(signatureCaptureMeeting.geoSource) ?? "unknown",
        meetingGeoReason: signatureCaptureMeeting.geoReason ?? null,
        meetingFormat: signatureCaptureMeeting.format,
        captureMethod: "signature",
        startAt: nowIso,
        endAt: nowIso,
        durationSeconds: 0,
        startLat: location?.lat ?? null,
        startLng: location?.lng ?? null,
        startAccuracyM: location?.accuracyM ?? null,
        endLat: location?.lat ?? null,
        endLng: location?.lng ?? null,
        endAccuracyM: location?.accuracyM ?? null,
        inactive: false,
        signaturePromptShown: true,
        chairName:
          signatureChairNameInput.trim().length > 0 ? signatureChairNameInput.trim() : null,
        chairRole:
          signatureChairRoleInput.trim().length > 0 ? signatureChairRoleInput.trim() : null,
        signatureCapturedAtIso: nowIso,
        calendarEventId: null,
        signatureRef: signatureRefValue,
        signaturePngBase64: signatureInlineFallback,
        pdfUri: null,
      };

      upsertAttendanceRecord(signatureOnlyRecord);
      appendMeetingAttendanceLog({
        meetingId: signatureOnlyRecord.meetingId,
        method: "manual",
      });
      setSignaturePoints([]);
      setSignatureChairNameInput("");
      setSignatureChairRoleInput("");
      setSignatureCaptureMeeting(null);
      const savedSignatureMessage =
        "Signature captured and meeting log saved (provisional red X until duration and location requirements are met).";
      setAttendanceStatus(
        persistedSignatureRef
          ? savedSignatureMessage
          : `${savedSignatureMessage} Saved inline because file storage is unavailable.`,
      );
      setScreen("LIST");
    } catch (error) {
      console.log("[signature] save failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      setAttendanceStatus("Could not save signature. Try again.");
      Alert.alert(
        "Could not save signature",
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Try again after restarting the app.",
      );
    }
  }, [
    activeAttendance,
    signatureCaptureMeeting,
    signaturePoints,
    signatureCanvasSize,
    signatureChairNameInput,
    signatureChairRoleInput,
    upsertAttendanceRecord,
    appendMeetingAttendanceLog,
    readCurrentLocation,
    persistSignaturePayloadAsFileRef,
  ]);

  const buildAttendanceShareMessage = useCallback((records: AttendanceRecord[]): string => {
    const lines = records.map((record) => {
      const started = new Date(record.startAt);
      const ended = record.endAt ? new Date(record.endAt) : null;
      return [
        `• ${record.meetingName}`,
        `  Meeting time: ${formatHhmmForDisplay(record.scheduledStartsAtLocal)}`,
        `  Start: ${Number.isNaN(started.getTime()) ? record.startAt : formatDateTimeLabel(started)}`,
        `  End: ${ended ? formatDateTimeLabel(ended) : "In progress"}`,
        `  Duration: ${formatDuration(record.durationSeconds)}`,
        `  Address: ${record.meetingAddress}`,
      ].join("\n");
    });
    return [`AA/NA Attendance Export (${records.length})`, ...lines].join("\n\n");
  }, []);

  const toAttendanceSlipRecord = useCallback((record: AttendanceRecord) => {
    return {
      id: record.id,
      meetingName: record.meetingName,
      meetingAddress: record.meetingAddress,
      startAtIso: record.startAt,
      endAtIso: record.endAt,
      durationSeconds: record.durationSeconds,
      signatureRefUri: getAttendanceSignatureUri(record),
      chairName: record.chairName ?? null,
      chairRole: record.chairRole ?? null,
      signatureCapturedAtIso: record.signatureCapturedAtIso ?? null,
      startLocation: {
        lat: record.startLat,
        lng: record.startLng,
        accuracyM: record.startAccuracyM,
      },
      endLocation: {
        lat: record.endLat,
        lng: record.endLng,
        accuracyM: record.endAccuracyM,
      },
    };
  }, []);

  const diagnosticsBuildInfo = useMemo(
    () => ({
      appEnv: resolvedAppEnv,
      apiUrl,
      appVersion,
      buildNumber,
    }),
    [apiUrl, appVersion, buildNumber, resolvedAppEnv],
  );

  const diagnosticsMeetingsApiHealth = useMemo<DiagnosticsMeetingsApiHealth>(
    () => ({
      endpointPath: lastMeetingsApiEvent?.endpointPath ?? "",
      statusCode: lastMeetingsApiEvent?.statusCode ?? null,
      errorMessage: lastMeetingsApiEvent?.errorMessage ?? null,
      errorBodySnippet: lastMeetingsApiEvent?.errorBodySnippet
        ? truncateText(lastMeetingsApiEvent.errorBodySnippet, 500)
        : null,
      timestampIso: lastMeetingsApiEvent?.timestampIso ?? null,
    }),
    [lastMeetingsApiEvent],
  );

  const diagnosticsLocationStatus = useMemo<DiagnosticsLocationStatus>(
    () => ({
      servicesEnabled: diagnosticsLocationSnapshot?.servicesEnabled ?? null,
      foregroundPermission: diagnosticsLocationSnapshot?.foregroundPermission ?? locationPermission,
      backgroundPermission:
        diagnosticsLocationSnapshot?.backgroundPermission ?? locationAlwaysPermission,
      preciseIndicator:
        diagnosticsLocationSnapshot?.accuracyM !== null &&
        diagnosticsLocationSnapshot?.accuracyM !== undefined
          ? `accuracy ±${Math.round(diagnosticsLocationSnapshot.accuracyM)}m`
          : "accuracy unavailable",
      lat: diagnosticsLocationSnapshot?.lat ?? currentLocation?.lat ?? null,
      lng: diagnosticsLocationSnapshot?.lng ?? currentLocation?.lng ?? null,
      accuracyM: diagnosticsLocationSnapshot?.accuracyM ?? currentLocation?.accuracyM ?? null,
      timestampIso: diagnosticsLocationSnapshot?.timestampIso ?? null,
    }),
    [
      currentLocation?.accuracyM,
      currentLocation?.lat,
      currentLocation?.lng,
      diagnosticsLocationSnapshot,
      locationAlwaysPermission,
      locationPermission,
    ],
  );

  const recordLastExportAttempt = useCallback((success: boolean, error?: unknown) => {
    setLastExportAttempt({
      success,
      errorMessage: success ? null : formatError(error),
      timestampIso: new Date().toISOString(),
    });
  }, []);

  const logSafeExportFailure = useCallback(
    (
      stage:
        | "EXPORT_SINGLE"
        | "EXPORT_SELECTED"
        | "EXPORT_RANGE"
        | "EXPORT_GENERATE"
        | "EXPORT_SHARE",
      error: unknown,
    ) => {
      console.log("[attendance-export][safe-error]", {
        stage,
        message: truncateText(formatError(error), 240),
        platform: Platform.OS,
        appVersion,
        buildNumber,
      });
    },
    [appVersion, buildNumber],
  );

  const runDiagnosticsExportDryRun = useCallback(() => {
    if (diagnosticsSelectedAttendanceRecords.length === 0) {
      setDiagnosticsExportDryRunStatus("Dry-run failed: select at least one attendance record.");
      return;
    }

    const ordered = [...diagnosticsSelectedAttendanceRecords].sort(
      (left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime(),
    );

    for (const record of ordered) {
      if (typeof record.id !== "string" || record.id.trim().length === 0) {
        const reason = "Dry-run failed: attendance record missing id.";
        console.log("[diagnostics][export-dry-run] failed", { reason, record });
        setDiagnosticsExportDryRunStatus(reason);
        return;
      }
      if (typeof record.meetingName !== "string" || record.meetingName.trim().length === 0) {
        const reason = `Dry-run failed: ${record.id} missing meetingName.`;
        console.log("[diagnostics][export-dry-run] failed", { reason, recordId: record.id });
        setDiagnosticsExportDryRunStatus(reason);
        return;
      }
      const startMs = new Date(record.startAt).getTime();
      if (!Number.isFinite(startMs)) {
        const reason = `Dry-run failed: ${record.id} has invalid startAt.`;
        console.log("[diagnostics][export-dry-run] failed", {
          reason,
          recordId: record.id,
          startAt: record.startAt,
        });
        setDiagnosticsExportDryRunStatus(reason);
        return;
      }
      if (record.endAt) {
        const endMs = new Date(record.endAt).getTime();
        if (!Number.isFinite(endMs)) {
          const reason = `Dry-run failed: ${record.id} has invalid endAt.`;
          console.log("[diagnostics][export-dry-run] failed", {
            reason,
            recordId: record.id,
            endAt: record.endAt,
          });
          setDiagnosticsExportDryRunStatus(reason);
          return;
        }
      }
      if (
        record.durationSeconds !== null &&
        (!Number.isFinite(record.durationSeconds) || record.durationSeconds < 0)
      ) {
        const reason = `Dry-run failed: ${record.id} has invalid durationSeconds.`;
        console.log("[diagnostics][export-dry-run] failed", {
          reason,
          recordId: record.id,
          durationSeconds: record.durationSeconds,
        });
        setDiagnosticsExportDryRunStatus(reason);
        return;
      }
      const signature = getAttendanceSignatureUri(record) ?? "";
      if (signature.trim().length > 0 && !looksLikeFileUri(signature.trim())) {
        if (looksLikeInlineSvgSignature(signature)) {
          continue;
        }
        const cleaned = signature.replace(/[^A-Za-z0-9+/=]/g, "");
        if (cleaned.length === 0) {
          const reason = `Dry-run failed: ${record.id} signature payload is malformed.`;
          console.log("[diagnostics][export-dry-run] failed", {
            reason,
            recordId: record.id,
          });
          setDiagnosticsExportDryRunStatus(reason);
          return;
        }
      }
    }

    setDiagnosticsExportDryRunStatus(
      `Dry-run passed for ${diagnosticsSelectedAttendanceRecords.length} record(s).`,
    );
  }, [diagnosticsSelectedAttendanceRecords]);

  const createDiagnosticsCompletedTestMeeting = useCallback(async () => {
    if (!isDiagnosticsEnabled) {
      return;
    }

    try {
      const now = new Date();
      const start = new Date(now.getTime() - 65 * 60 * 1000);
      const candidateMeeting = selectedMeeting ?? allMeetings[0] ?? null;
      const candidateCoords = normalizeCoordinates({
        lat: candidateMeeting?.lat ?? currentLocation?.lat ?? null,
        lng: candidateMeeting?.lng ?? currentLocation?.lng ?? null,
      });

      const fallbackLat = 39.7392;
      const fallbackLng = -104.9903;
      const lat = candidateCoords?.lat ?? currentLocation?.lat ?? fallbackLat;
      const lng = candidateCoords?.lng ?? currentLocation?.lng ?? fallbackLng;
      const accuracyM = currentLocation?.accuracyM ?? 18;

      const sampleSignature = buildSignatureSvgMarkup(
        [
          { x: 16, y: 90, isStrokeStart: true },
          { x: 68, y: 64, isStrokeStart: false },
          { x: 118, y: 92, isStrokeStart: false },
          { x: 178, y: 58, isStrokeStart: false },
          { x: 232, y: 88, isStrokeStart: false },
        ],
        320,
        180,
      );

      const recordId = createId("attendance-diagnostic");
      const scheduledStartsAtLocal = `${String(start.getHours()).padStart(2, "0")}:${String(
        start.getMinutes(),
      ).padStart(2, "0")}`;

      const persistedSignatureRef =
        sampleSignature && sampleSignature.trim().length > 0
          ? await persistSignaturePayloadAsFileRef(sampleSignature, recordId)
          : null;

      const diagnosticRecord: AttendanceRecord = {
        schemaVersion: ATTENDANCE_SCHEMA_VERSION,
        id: recordId,
        meetingId: candidateMeeting?.id ?? "diagnostic-meeting",
        meetingName: candidateMeeting?.name ?? "Diagnostics Test Meeting",
        meetingAddress: candidateMeeting?.address ?? "Diagnostics Address",
        scheduledStartsAtLocal,
        meetingLat: lat,
        meetingLng: lng,
        meetingGeoStatus: "verified",
        meetingGeoSource: "device_geocode",
        meetingGeoReason: null,
        meetingFormat: candidateMeeting?.format ?? "IN_PERSON",
        captureMethod: "signature",
        startAt: start.toISOString(),
        endAt: now.toISOString(),
        durationSeconds: Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000)),
        startLat: lat,
        startLng: lng,
        startAccuracyM: accuracyM,
        endLat: lat,
        endLng: lng,
        endAccuracyM: accuracyM,
        signaturePromptShown: true,
        chairName: "Diagnostics Chair",
        chairRole: "Chairperson",
        signatureCapturedAtIso: now.toISOString(),
        calendarEventId: null,
        signatureRef: persistedSignatureRef
          ? {
              uri: persistedSignatureRef,
              mimeType: persistedSignatureRef.toLowerCase().endsWith(".svg")
                ? "image/svg+xml"
                : "image/png",
            }
          : null,
        signaturePngBase64: null,
        pdfUri: null,
      };

      upsertAttendanceRecord(diagnosticRecord);
      setSelectedAttendanceIds((previous) => Array.from(new Set([recordId, ...previous])));
      setHomeScreen("ATTENDANCE");
      setAttendanceViewFilter("ALL");
      setShowInactiveAttendance(false);
      setAttendanceValidityFilter("ALL");
      setScreen("LIST");
      setAttendanceStatus(
        "Diagnostics: added a completed test meeting and selected it for export.",
      );
    } catch (error) {
      setAttendanceStatus(`Diagnostics meeting creation failed: ${formatError(error)}`);
    }
  }, [
    allMeetings,
    currentLocation,
    isDiagnosticsEnabled,
    selectedMeeting,
    setSelectedAttendanceIds,
    setHomeScreen,
    setAttendanceViewFilter,
    setShowInactiveAttendance,
    setAttendanceValidityFilter,
    setScreen,
    upsertAttendanceRecord,
    persistSignaturePayloadAsFileRef,
  ]);

  const settleBeforePdfShare = useCallback(async () => {
    if (Platform.OS !== "ios") {
      return;
    }
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  }, []);

  const exportAttendance = useCallback(async () => {
    if (!activeAttendance || !activeAttendance.endAt || activeAttendance.durationSeconds === null) {
      setAttendanceStatus("Complete attendance session before exporting.");
      return;
    }
    if (attendanceExportInFlightRef.current) {
      setAttendanceStatus("Export already in progress.");
      return;
    }

    attendanceExportInFlightRef.current = true;
    setExportingPdf(true);
    try {
      const attendanceSlipPdf = await loadAttendanceSlipPdfModule();
      const payloadRecords = [toAttendanceSlipRecord(activeAttendance)];
      const fileName = `${ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX}.pdf`;
      const { uri, diagnostics } = await attendanceSlipPdf.generateAttendanceSlipPdf(
        payloadRecords,
        { participantName: devUserDisplayName },
        { fileName },
      );
      await settleBeforePdfShare();
      if (Platform.OS === "ios" && diagnostics.safeMode) {
        console.log("[attendance-export] share skipped (safe mode)", diagnostics);
        setAttendanceStatus("PDF saved (safe mode). Open Files to share.");
      } else {
        try {
          await attendanceSlipPdf.shareAttendanceSlipPdf(uri, ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX);
          setAttendanceStatus("Export complete. Share sheet opened for your PDF.");
        } catch (shareError) {
          logSafeExportFailure("EXPORT_SHARE", shareError);
          setAttendanceStatus("PDF generated, but share sheet is unavailable on this device.");
          Alert.alert(
            "PDF generated",
            "Your PDF was generated, but the share sheet is unavailable on this device (common on Simulator).",
          );
          recordLastExportAttempt(true);
          return;
        }
      }
      recordLastExportAttempt(true);
    } catch (error) {
      logSafeExportFailure("EXPORT_SINGLE", error);
      recordLastExportAttempt(false, error);
      const message = formatError(error);
      setAttendanceStatus(`Export failed: ${message}`);
      Alert.alert("Export failed", message);
    } finally {
      attendanceExportInFlightRef.current = false;
      setExportingPdf(false);
    }
  }, [
    activeAttendance,
    devUserDisplayName,
    logSafeExportFailure,
    recordLastExportAttempt,
    settleBeforePdfShare,
    toAttendanceSlipRecord,
  ]);

  const toggleAttendanceSelection = useCallback((recordId: string) => {
    setSelectedAttendanceIds((current) =>
      current.includes(recordId)
        ? current.filter((entry) => entry !== recordId)
        : [...current, recordId],
    );
  }, []);

  const selectAllAttendance = useCallback(() => {
    setSelectedAttendanceIds(attendanceRecordsForView.map((record) => record.id));
  }, [attendanceRecordsForView]);

  const clearAttendanceSelection = useCallback(() => {
    setSelectedAttendanceIds([]);
  }, []);

  const makeSelectedAttendanceInactive = useCallback(() => {
    const selectedRecords = attendanceRecordsForView.filter((record) =>
      selectedAttendanceIds.includes(record.id),
    );
    if (selectedRecords.length === 0) {
      setAttendanceStatus("Select at least one attendance record to make inactive.");
      return;
    }

    const archivedIds = new Set(selectedRecords.map((record) => record.id));
    setAttendanceRecords((previous) => {
      const next = previous.map((record) =>
        archivedIds.has(record.id) ? { ...record, inactive: true } : record,
      );
      void persistAttendanceRecords(next);
      return next;
    });
    setSelectedAttendanceIds((current) => current.filter((id) => !archivedIds.has(id)));
    setAttendanceStatus(
      `Marked ${selectedRecords.length} meeting record(s) inactive. Turn on Show inactive to view them.`,
    );
  }, [attendanceRecordsForView, selectedAttendanceIds, persistAttendanceRecords]);

  const exportSelectedAttendance = useCallback(async () => {
    const selectedRecords = attendanceRecordsForView.filter((record) =>
      selectedAttendanceIds.includes(record.id),
    );
    if (selectedRecords.length === 0) {
      setAttendanceStatus("Select at least one attendance record to export.");
      return;
    }
    if (selectedRecords.length > ATTENDANCE_EXPORT_MAX_RECORDS) {
      setAttendanceStatus(
        `Select ${ATTENDANCE_EXPORT_MAX_RECORDS} or fewer records per PDF export.`,
      );
      return;
    }
    if (attendanceExportInFlightRef.current) {
      setAttendanceStatus("Export already in progress.");
      return;
    }

    attendanceExportInFlightRef.current = true;
    setExportingAttendanceSelectionPdf(true);
    setAttendanceExportProgressLabel(null);
    try {
      const attendanceSlipPdf = await loadAttendanceSlipPdfModule();
      const payloadRecords = selectedRecords.map(toAttendanceSlipRecord);
      const fileName = `${ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX} - Selected.pdf`;
      const { uri, diagnostics } = await attendanceSlipPdf.generateAttendanceSlipPdf(
        payloadRecords,
        { participantName: devUserDisplayName },
        {
          fileName,
          onProgress: ({ chunkIndex, chunkCount }) => {
            setAttendanceExportProgressLabel(`Generating ${chunkIndex}/${chunkCount}`);
          },
        },
      );
      await settleBeforePdfShare();
      if (Platform.OS === "ios" && diagnostics.safeMode) {
        console.log("[attendance-export] share skipped (safe mode)", diagnostics);
        setAttendanceStatus("PDF saved (safe mode). Open Files to share.");
      } else {
        try {
          await attendanceSlipPdf.shareAttendanceSlipPdf(
            uri,
            `${ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX} - Selected`,
          );
          setAttendanceStatus(`Export complete for ${selectedRecords.length} meeting record(s).`);
        } catch (shareError) {
          logSafeExportFailure("EXPORT_SHARE", shareError);
          setAttendanceStatus("PDF generated, but share sheet is unavailable on this device.");
          Alert.alert(
            "PDF generated",
            "Your PDF was generated, but the share sheet is unavailable on this device (common on Simulator).",
          );
          recordLastExportAttempt(true);
          return;
        }
      }
      recordLastExportAttempt(true);
    } catch (error) {
      logSafeExportFailure("EXPORT_SELECTED", error);
      recordLastExportAttempt(false, error);
      const message = formatError(error);
      setAttendanceStatus(`Export failed: ${message}`);
      Alert.alert("Export failed", message);
    } finally {
      attendanceExportInFlightRef.current = false;
      setAttendanceExportProgressLabel(null);
      setExportingAttendanceSelectionPdf(false);
    }
  }, [
    attendanceRecordsForView,
    selectedAttendanceIds,
    logSafeExportFailure,
    setAttendanceExportProgressLabel,
    devUserDisplayName,
    recordLastExportAttempt,
    settleBeforePdfShare,
    toAttendanceSlipRecord,
  ]);

  const exportAttendanceRange = useCallback(
    async (startDate: Date, endDate: Date, label: string) => {
      const startMs = startDate.getTime();
      const endMs = endDate.getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
        setAttendanceStatus("Invalid export date range.");
        return;
      }

      const selectedRecords = attendanceRecords
        .filter((record) => !record.inactive)
        .filter((record) => {
          const atMs = new Date(record.startAt).getTime();
          return Number.isFinite(atMs) && atMs >= startMs && atMs <= endMs;
        });

      if (selectedRecords.length === 0) {
        setAttendanceStatus(`No attendance records found for ${label}.`);
        return;
      }
      if (selectedRecords.length > ATTENDANCE_EXPORT_MAX_RECORDS) {
        setAttendanceStatus(
          `${label} has ${selectedRecords.length} records. Export ${ATTENDANCE_EXPORT_MAX_RECORDS} or fewer at a time.`,
        );
        return;
      }
      if (attendanceExportInFlightRef.current) {
        setAttendanceStatus("Export already in progress.");
        return;
      }

      attendanceExportInFlightRef.current = true;
      setExportingAttendanceSelectionPdf(true);
      setAttendanceExportProgressLabel(null);
      try {
        const attendanceSlipPdf = await loadAttendanceSlipPdfModule();
        const payloadRecords = selectedRecords.map(toAttendanceSlipRecord);
        const fileName = `${ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX} - ${label}.pdf`;
        const { uri, diagnostics } = await attendanceSlipPdf.generateAttendanceSlipPdf(
          payloadRecords,
          { participantName: devUserDisplayName },
          {
            fileName,
            onProgress: ({ chunkIndex, chunkCount }) => {
              setAttendanceExportProgressLabel(`Generating ${chunkIndex}/${chunkCount}`);
            },
          },
        );
        await settleBeforePdfShare();
        if (Platform.OS === "ios" && diagnostics.safeMode) {
          console.log("[attendance-export] share skipped (safe mode)", diagnostics);
          setAttendanceStatus("PDF saved (safe mode). Open Files to share.");
        } else {
          try {
            await attendanceSlipPdf.shareAttendanceSlipPdf(
              uri,
              `${ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX} - ${label}`,
            );
            setAttendanceStatus(
              `Export complete for ${selectedRecords.length} attendance slip(s) for ${label}.`,
            );
          } catch (shareError) {
            logSafeExportFailure("EXPORT_SHARE", shareError);
            setAttendanceStatus("PDF generated, but share sheet is unavailable on this device.");
            Alert.alert(
              "PDF generated",
              "Your PDF was generated, but the share sheet is unavailable on this device (common on Simulator).",
            );
            recordLastExportAttempt(true);
            return;
          }
        }
        recordLastExportAttempt(true);
      } catch (error) {
        logSafeExportFailure("EXPORT_RANGE", error);
        recordLastExportAttempt(false, error);
        const message = formatError(error);
        setAttendanceStatus(`Export failed: ${message}`);
        Alert.alert("Export failed", message);
      } finally {
        attendanceExportInFlightRef.current = false;
        setAttendanceExportProgressLabel(null);
        setExportingAttendanceSelectionPdf(false);
      }
    },
    [
      attendanceRecords,
      devUserDisplayName,
      logSafeExportFailure,
      recordLastExportAttempt,
      setAttendanceExportProgressLabel,
      settleBeforePdfShare,
      toAttendanceSlipRecord,
    ],
  );

  const exportLast7DaysAttendance = useCallback(async () => {
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);
    await exportAttendanceRange(startDate, endDate, "Last 7 days");
  }, [exportAttendanceRange]);

  const exportCustomAttendanceRange = useCallback(async () => {
    const startText = attendanceExportStartDateInput.trim();
    const endText = attendanceExportEndDateInput.trim();
    const startDate = new Date(`${startText}T00:00:00`);
    const endDate = new Date(`${endText}T23:59:59`);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startText) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endText) ||
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime())
    ) {
      setAttendanceStatus("Enter export dates as YYYY-MM-DD.");
      return;
    }

    if (endDate < startDate) {
      setAttendanceStatus("Export end date must be on or after start date.");
      return;
    }

    await exportAttendanceRange(startDate, endDate, `${startText} to ${endText}`);
  }, [attendanceExportEndDateInput, attendanceExportStartDateInput, exportAttendanceRange]);

  const shareSelectedAttendanceText = useCallback(async () => {
    const selectedRecords = attendanceRecordsForView.filter((record) =>
      selectedAttendanceIds.includes(record.id),
    );
    if (selectedRecords.length === 0) {
      setAttendanceStatus("Select at least one attendance record to text.");
      return;
    }

    const message = buildAttendanceShareMessage(selectedRecords);

    try {
      await Share.share({ message });
      setAttendanceStatus(`Prepared text summary for ${selectedRecords.length} meeting record(s).`);
    } catch (error) {
      setAttendanceStatus(`Failed to share selected attendance text: ${formatError(error)}`);
    }
  }, [attendanceRecordsForView, selectedAttendanceIds, buildAttendanceShareMessage]);

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

      const nowLocal = new Date();
      const nowMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
      const meetingInProgress =
        meeting.dayOfWeek === nowLocal.getDay() &&
        isMeetingInProgress(meeting.startsAtLocal, nowMinutes);

      if (meetingInProgress) {
        setPendingGeofenceLogMeetingId(null);
        setSelectedMeeting(meeting);
        setHomeScreen("MEETINGS");
        await startAttendance(meeting);
        setAttendanceStatus(`Attendance started for in-progress meeting: ${meeting.name}.`);
        return;
      }

      const hasValidGeofence =
        meeting.format !== "ONLINE" &&
        meeting.lat !== null &&
        meeting.lng !== null &&
        Number.isFinite(meeting.lat) &&
        Number.isFinite(meeting.lng);

      const location = await readCurrentLocation(true);
      if (location && hasValidGeofence) {
        const meetingLat = meeting.lat as number;
        const meetingLng = meeting.lng as number;
        const distance = distanceMetersBetween(location.lat, location.lng, meetingLat, meetingLng);
        if (distance <= ARRIVAL_RADIUS_METERS) {
          setPendingGeofenceLogMeetingId(null);
          setSelectedMeeting(meeting);
          setHomeScreen("MEETINGS");
          await startAttendance(meeting);
          const startedAtLabel = formatTimeLabel(new Date());
          Alert.alert(
            "Meeting log started",
            `${meeting.name} start time logged at ${startedAtLabel}.`,
          );
          return;
        }
      }

      setPendingGeofenceLogMeetingId(meeting.id);
      setSelectedMeeting(meeting);
      setAttendanceStatus(`Queued ${meeting.name}. Logging starts automatically when you arrive.`);
      Alert.alert(
        "Meeting queued",
        hasValidGeofence
          ? `${meeting.name} will be logged once you are at the meeting location (~200 ft geofence).`
          : `${meeting.name} is queued. Once a valid meeting location is available and you are within range, attendance will auto-log.`,
      );
    },
    [activeAttendance, readCurrentLocation, resolveMeetingForLogging, startAttendance],
  );

  const handleDashboardMeetingPrimaryAction = useCallback(
    async (meetingId: string) => {
      if (activeAttendance && !activeAttendance.endAt && activeAttendance.meetingId === meetingId) {
        const elapsedSeconds = Math.max(
          0,
          Math.floor((Date.now() - new Date(activeAttendance.startAt).getTime()) / 1000),
        );

        if (elapsedSeconds >= MIN_VALID_MEETING_MINUTES * 60) {
          await endAttendanceByRecordId(activeAttendance.id);
          return;
        }

        Alert.alert(
          "Meeting in progress",
          "Do you want to cancel this meeting? It will be logged as invalid.",
          [
            { text: "Resume", style: "cancel" },
            {
              text: "Cancel meeting",
              style: "destructive",
              onPress: () => {
                void cancelAttendanceByRecordId(activeAttendance.id);
              },
            },
          ],
        );
        return;
      }

      await logUpcomingMeetingFromDashboard(meetingId);
    },
    [
      activeAttendance,
      endAttendanceByRecordId,
      cancelAttendanceByRecordId,
      logUpcomingMeetingFromDashboard,
    ],
  );

  const captureMeetingSignatureFromDashboard = useCallback(
    (meetingId: string) => {
      const meeting = resolveMeetingForLogging(meetingId);
      if (!meeting) {
        Alert.alert("Meeting unavailable", "This meeting is no longer in the upcoming list.");
        return;
      }
      openMeetingSignatureCapture(meeting);
    },
    [resolveMeetingForLogging, openMeetingSignatureCapture],
  );

  useEffect(() => {
    if (!notificationsRuntimeEnabled) {
      return;
    }

    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    } catch (error) {
      console.log("[notifications] setNotificationHandler failed", error);
    }

    void Notifications.setNotificationCategoryAsync(SPONSOR_NOTIFICATION_CATEGORY_ID, [
      {
        identifier: SPONSOR_CALL_ACTION_ID,
        buttonTitle: "Call",
        options: { opensAppToForeground: true },
      },
    ]).catch((error: unknown) => {
      console.log("[notifications] sponsor category setup failed", error);
    });
    void Notifications.setNotificationCategoryAsync(DRIVE_NOTIFICATION_CATEGORY_ID, [
      {
        identifier: DRIVE_ACTION_ID,
        buttonTitle: "Drive",
        options: { opensAppToForeground: true },
      },
    ]).catch((error: unknown) => {
      console.log("[notifications] drive category setup failed", error);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response: NotificationsTypes.NotificationResponse) => {
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
      },
    );

    return () => {
      subscription.remove();
    };
  }, [notificationsRuntimeEnabled, openMeetingDestination, openPhoneCall]);

  useEffect(() => {
    if (
      !locationIssue ||
      locationIssue === "position_unavailable" ||
      locationIssue === "unavailable"
    ) {
      locationPermissionAlertShownRef.current = null;
      return;
    }

    if (locationPermissionAlertShownRef.current === locationIssue) {
      return;
    }
    locationPermissionAlertShownRef.current = locationIssue;

    if (locationIssue === "services_disabled") {
      Alert.alert(
        "Turn On Location Services",
        "Location Services are turned off on this device. Turn them on to resolve meeting distance and geofence features.",
        [{ text: "OK" }],
      );
      return;
    }

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
  }, [locationIssue]);

  useEffect(() => {
    const mapping: Record<string, MeetingRecord> = {};
    for (const meeting of meetings) {
      mapping[meeting.id] = meeting;
    }
    meetingsByIdRef.current = mapping;
  }, [meetings]);

  useEffect(() => {
    activeAttendanceRef.current = activeAttendance;
  }, [activeAttendance]);

  useEffect(() => {
    attendanceRecordsRef.current = attendanceRecords;
  }, [attendanceRecords]);

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
    if (iosLaunchSafeMode) {
      return;
    }
    void refreshDeviceLocationOnFocus();
  }, [iosLaunchSafeMode, refreshDeviceLocationOnFocus]);

  useEffect(() => {
    if (iosLaunchSafeMode) {
      return;
    }
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void refreshDeviceLocationOnFocus();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [iosLaunchSafeMode, refreshDeviceLocationOnFocus]);

  useEffect(() => {
    if (bootstrapStartedRef.current) {
      return;
    }
    bootstrapStartedRef.current = true;

    void (async () => {
      let recoveredModeFromPreviousCrash = false;
      let bootstrapCompletedSuccessfully = false;
      const startedAtIso = new Date().toISOString();

      try {
        const guardRaw = await AsyncStorage.getItem(bootGuardStorage);
        if (guardRaw) {
          const parsedGuard = JSON.parse(guardRaw) as {
            inProgress?: unknown;
            lastBootOk?: unknown;
          };
          if (parsedGuard?.inProgress === true && parsedGuard?.lastBootOk !== true) {
            recoveredModeFromPreviousCrash = true;
          }
        }
      } catch {
        // Ignore guard read failures and continue boot.
      }

      if (recoveredModeFromPreviousCrash) {
        setAttendanceStatus("Recovered mode enabled after the previous startup failed.");
      }

      try {
        await AsyncStorage.setItem(
          bootGuardStorage,
          JSON.stringify({
            inProgress: true,
            lastBootOk: false,
            startedAtIso,
            appVersion,
            buildNumber,
          }),
        );
      } catch {
        // Ignore guard write failures and continue boot.
      }

      if (iosLaunchSafeMode || recoveredModeFromPreviousCrash) {
        try {
          await refreshMeetings();
          setAttendanceStatus(
            recoveredModeFromPreviousCrash
              ? "Recovered mode enabled: local attendance history loads after app stabilization."
              : "iOS safe boot mode enabled: attendance history loads after app stabilization.",
          );
          bootstrapCompletedSuccessfully = true;
        } catch {
          setMeetingsStatus("Unable to load meetings.");
        } finally {
          setBootstrapped(true);
          try {
            await AsyncStorage.setItem(
              bootGuardStorage,
              JSON.stringify({
                inProgress: false,
                lastBootOk: bootstrapCompletedSuccessfully,
                startedAtIso,
                finishedAtIso: new Date().toISOString(),
                appVersion,
                buildNumber,
                recoveredMode: recoveredModeFromPreviousCrash || iosLaunchSafeMode,
              }),
            );
          } catch {
            // Ignore guard write failures and continue.
          }
        }
        return;
      }

      try {
        const position = await requestLocationPermission();
        await refreshMeetings({ location: position });

        const [
          modeRaw,
          sponsorUiPrefsRaw,
          attendanceRaw,
          attendanceSignatureMigrationRaw,
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
          AsyncStorage.getItem(attendanceSignatureMigrationStorage),
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
          if (attendanceRaw.length > MAX_BOOTSTRAP_ATTENDANCE_RAW_CHARS) {
            await AsyncStorage.removeItem(attendanceStorage);
            setAttendanceStatus(
              "Local attendance cache was reset because it exceeded size limits.",
            );
          } else {
            const parsedAttendance = JSON.parse(attendanceRaw) as unknown;
            if (Array.isArray(parsedAttendance)) {
              const migrationDone = attendanceSignatureMigrationRaw === "true";
              const fileSystemModule = loadSignatureFileSystemModule();
              const cappedAttendance = parsedAttendance.slice(0, MAX_BOOTSTRAP_ATTENDANCE_RECORDS);
              const normalizedAttendance: AttendanceRecord[] = [];
              let droppedSignatureCount = 0;
              let migratedSignatureCount = 0;
              let skippedRecordCount = 0;
              let missingFileSignatureCount = 0;

              for (let index = 0; index < cappedAttendance.length; index += 1) {
                const rawRecord = cappedAttendance[index];
                if (!rawRecord || typeof rawRecord !== "object") {
                  skippedRecordCount += 1;
                  continue;
                }

                const record = rawRecord as Record<string, unknown>;
                const schemaVersion =
                  typeof record.schemaVersion === "number" && Number.isFinite(record.schemaVersion)
                    ? Math.floor(record.schemaVersion)
                    : 0;
                if (schemaVersion > ATTENDANCE_SCHEMA_VERSION) {
                  skippedRecordCount += 1;
                  continue;
                }

                try {
                  const recordId =
                    typeof record.id === "string" && record.id.trim().length > 0
                      ? record.id
                      : createId("attendance-recovered");
                  const rawSignature =
                    (typeof record.signatureRef === "object" &&
                    record.signatureRef !== null &&
                    typeof (record.signatureRef as { uri?: unknown }).uri === "string"
                      ? ((record.signatureRef as { uri: string }).uri ?? null)
                      : null) ??
                    (typeof record.signaturePngBase64 === "string"
                      ? record.signaturePngBase64
                      : null);

                  const normalizedSignature = await normalizeSignatureValueToRef(rawSignature, {
                    fileSystem: fileSystemModule,
                    recordId,
                    subdirectory: signatureStorageSubdirectory,
                    verifyFileExists: true,
                  });

                  if (rawSignature && !normalizedSignature.ref) {
                    droppedSignatureCount += 1;
                    if (normalizedSignature.reason === "missing_file") {
                      missingFileSignatureCount += 1;
                    }
                  }
                  if (normalizedSignature.migrated && normalizedSignature.ref) {
                    migratedSignatureCount += 1;
                  }

                  const startAt =
                    typeof record.startAt === "string" && record.startAt.trim().length > 0
                      ? record.startAt
                      : new Date().toISOString();
                  const endAt =
                    typeof record.endAt === "string" && record.endAt.trim().length > 0
                      ? record.endAt
                      : null;
                  const meetingLat = asFiniteNumber(record.meetingLat);
                  const meetingLng = asFiniteNumber(record.meetingLng);
                  const startLat = asFiniteNumber(record.startLat);
                  const startLng = asFiniteNumber(record.startLng);
                  const endLat = asFiniteNumber(record.endLat);
                  const endLng = asFiniteNumber(record.endLng);
                  const meetingName =
                    typeof record.meetingName === "string" && record.meetingName.trim().length > 0
                      ? record.meetingName.trim()
                      : "Recovery Meeting";
                  const meetingAddress =
                    typeof record.meetingAddress === "string" &&
                    record.meetingAddress.trim().length > 0
                      ? record.meetingAddress.trim()
                      : "Address unavailable";

                  normalizedAttendance.push({
                    schemaVersion: ATTENDANCE_SCHEMA_VERSION,
                    id: recordId,
                    meetingId:
                      typeof record.meetingId === "string" && record.meetingId.trim().length > 0
                        ? record.meetingId
                        : "unknown",
                    meetingName,
                    meetingAddress,
                    meetingDayOfWeek: normalizeMeetingDayOfWeek(record.meetingDayOfWeek),
                    scheduledStartsAtLocal:
                      typeof record.scheduledStartsAtLocal === "string"
                        ? record.scheduledStartsAtLocal
                        : null,
                    meetingLat: meetingLat ?? null,
                    meetingLng: meetingLng ?? null,
                    meetingGeoStatus:
                      normalizeMeetingGeoStatus(record.meetingGeoStatus) ??
                      (isValidLatLng(meetingLat, meetingLng) ? "verified" : "missing"),
                    meetingGeoSource:
                      normalizeMeetingGeoSource(record.meetingGeoSource) ?? "unknown",
                    meetingGeoReason:
                      typeof record.meetingGeoReason === "string" &&
                      record.meetingGeoReason.trim().length > 0
                        ? record.meetingGeoReason
                        : null,
                    meetingFormat:
                      record.meetingFormat === "IN_PERSON" ||
                      record.meetingFormat === "ONLINE" ||
                      record.meetingFormat === "HYBRID"
                        ? record.meetingFormat
                        : undefined,
                    captureMethod:
                      record.captureMethod === "attend-log" || record.captureMethod === "signature"
                        ? record.captureMethod
                        : undefined,
                    startAt,
                    endAt,
                    durationSeconds: asFiniteNumber(record.durationSeconds),
                    startLat: startLat ?? null,
                    startLng: startLng ?? null,
                    startAccuracyM: asFiniteNumber(record.startAccuracyM) ?? null,
                    endLat: endLat ?? null,
                    endLng: endLng ?? null,
                    endAccuracyM: asFiniteNumber(record.endAccuracyM) ?? null,
                    inactive: Boolean(record.inactive),
                    signaturePromptShown: Boolean(record.signaturePromptShown),
                    chairName:
                      typeof record.chairName === "string" && record.chairName.trim().length > 0
                        ? record.chairName.trim()
                        : null,
                    chairRole:
                      typeof record.chairRole === "string" && record.chairRole.trim().length > 0
                        ? record.chairRole.trim()
                        : null,
                    signatureCapturedAtIso:
                      typeof record.signatureCapturedAtIso === "string"
                        ? record.signatureCapturedAtIso
                        : null,
                    calendarEventId:
                      typeof record.calendarEventId === "string" &&
                      record.calendarEventId.trim().length > 0
                        ? record.calendarEventId
                        : null,
                    leaveNotificationId:
                      typeof record.leaveNotificationId === "string" &&
                      record.leaveNotificationId.trim().length > 0
                        ? record.leaveNotificationId
                        : null,
                    leaveNotificationAtIso:
                      typeof record.leaveNotificationAtIso === "string" &&
                      record.leaveNotificationAtIso.trim().length > 0
                        ? record.leaveNotificationAtIso
                        : null,
                    signatureRef: normalizedSignature.ref ?? null,
                    signaturePngBase64: null,
                    pdfUri:
                      typeof record.pdfUri === "string" && record.pdfUri.trim().length > 0
                        ? record.pdfUri
                        : null,
                  });
                } catch {
                  skippedRecordCount += 1;
                }

                if (index > 0 && index % SIGNATURE_MIGRATION_BATCH_SIZE === 0) {
                  await yieldToEventLoop();
                }
              }

              normalizedAttendance.sort(
                (left, right) =>
                  new Date(right.startAt).getTime() - new Date(left.startAt).getTime(),
              );
              setAttendanceRecords(normalizedAttendance);

              const shouldPersistAttendance =
                parsedAttendance.length > MAX_BOOTSTRAP_ATTENDANCE_RECORDS ||
                droppedSignatureCount > 0 ||
                migratedSignatureCount > 0 ||
                skippedRecordCount > 0 ||
                !migrationDone;

              if (shouldPersistAttendance) {
                await AsyncStorage.setItem(attendanceStorage, JSON.stringify(normalizedAttendance));
              }
              if (!migrationDone) {
                await AsyncStorage.setItem(attendanceSignatureMigrationStorage, "true");
              }

              const recoveryMessages: string[] = [];
              if (migratedSignatureCount > 0) {
                recoveryMessages.push(`migrated ${migratedSignatureCount} signature file(s)`);
              }
              if (droppedSignatureCount > 0) {
                recoveryMessages.push(`dropped ${droppedSignatureCount} invalid signature(s)`);
              }
              if (missingFileSignatureCount > 0) {
                recoveryMessages.push(`${missingFileSignatureCount} signature file(s) missing`);
              }
              if (skippedRecordCount > 0) {
                recoveryMessages.push(`skipped ${skippedRecordCount} corrupt record(s)`);
              }
              if (recoveryMessages.length > 0) {
                setAttendanceStatus(`Recovered local data: ${recoveryMessages.join("; ")}.`);
              }

              const latestOpenRecord = normalizedAttendance.find((record) => !record.endAt) ?? null;
              if (latestOpenRecord) {
                setActiveAttendance(latestOpenRecord);
                setAttendanceStatus(
                  `Attendance in progress for ${latestOpenRecord.meetingName}. End meeting when complete.`,
                );
              }
            }
          }
        }

        if (planRaw) {
          const parsedPlans = JSON.parse(planRaw) as MeetingPlansState;
          if (parsedPlans && typeof parsedPlans === "object") {
            setMeetingPlansByDate(parsedPlans);
          }
        }

        const resolvedSetupComplete = setupCompleteRaw === "true";
        setSetupComplete(resolvedSetupComplete);

        if (sobrietyDateRaw) {
          setSobrietyDateIso(sobrietyDateRaw);
          setSobrietyDateInput(formatIsoToDdMmYyyy(sobrietyDateRaw));
        }

        let hasLocalSponsorProfile = false;
        if (profileRaw) {
          const parsedProfile = JSON.parse(profileRaw) as {
            radiusMiles?: number;
            homeGroupMeetingIds?: string[];
            sponsorEnabledAtIso?: string | null;
            ninetyDayGoalTarget?: number;
            meetingSignatureRequired?: boolean;
            sponsorName?: string;
            sponsorPhoneDigits?: string;
            sponsorHour12?: number;
            sponsorMinute?: number;
            sponsorMeridiem?: "AM" | "PM";
            sponsorRepeatPreset?: RepeatPreset;
            sponsorRepeatDays?: WeekdayCode[];
            sponsorEnabled?: boolean;
            sponsorActive?: boolean;
            sponsorLeadMinutes?: SponsorLeadMinutes;
            sponsorKneesSuggested?: boolean | null;
            meetingAutoAddToCalendar?: boolean;
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
          if (typeof parsedProfile.meetingSignatureRequired === "boolean") {
            setMeetingSignatureRequired(parsedProfile.meetingSignatureRequired);
            setWizardMeetingSignatureRequired(parsedProfile.meetingSignatureRequired);
          }
          if (typeof parsedProfile.sponsorName === "string") {
            setSponsorName(parsedProfile.sponsorName);
            hasLocalSponsorProfile =
              hasLocalSponsorProfile || parsedProfile.sponsorName.trim().length > 0;
          }
          if (typeof parsedProfile.sponsorPhoneDigits === "string") {
            const normalized = normalizePhoneDigits(parsedProfile.sponsorPhoneDigits);
            setSponsorPhoneDigits(normalized);
            hasLocalSponsorProfile = hasLocalSponsorProfile || normalized.length > 0;
          }
          if (
            typeof parsedProfile.sponsorHour12 === "number" &&
            Number.isFinite(parsedProfile.sponsorHour12) &&
            parsedProfile.sponsorHour12 >= 1 &&
            parsedProfile.sponsorHour12 <= 12
          ) {
            setSponsorHour12(Math.floor(parsedProfile.sponsorHour12));
          }
          if (
            typeof parsedProfile.sponsorMinute === "number" &&
            Number.isFinite(parsedProfile.sponsorMinute) &&
            parsedProfile.sponsorMinute >= 0 &&
            parsedProfile.sponsorMinute <= 59
          ) {
            setSponsorMinute(Math.floor(parsedProfile.sponsorMinute));
          }
          if (parsedProfile.sponsorMeridiem === "AM" || parsedProfile.sponsorMeridiem === "PM") {
            setSponsorMeridiem(parsedProfile.sponsorMeridiem);
          }
          if (
            parsedProfile.sponsorRepeatPreset === "WEEKLY" ||
            parsedProfile.sponsorRepeatPreset === "BIWEEKLY" ||
            parsedProfile.sponsorRepeatPreset === "MONTHLY"
          ) {
            setSponsorRepeatPreset(parsedProfile.sponsorRepeatPreset);
          }
          if (Array.isArray(parsedProfile.sponsorRepeatDays)) {
            const safeDays = parsedProfile.sponsorRepeatDays.filter((day): day is WeekdayCode =>
              WEEKDAY_CODES.includes(day),
            );
            if (safeDays.length > 0) {
              setSponsorRepeatDays(sortWeekdays(safeDays));
            }
          }
          if (typeof parsedProfile.sponsorEnabled === "boolean") {
            setSponsorEnabled(parsedProfile.sponsorEnabled);
          }
          if (typeof parsedProfile.sponsorActive === "boolean") {
            setSponsorActive(parsedProfile.sponsorActive);
          }
          if (
            typeof parsedProfile.sponsorLeadMinutes === "number" &&
            [0, 5, 10, 30].includes(parsedProfile.sponsorLeadMinutes)
          ) {
            setSponsorLeadMinutes(parsedProfile.sponsorLeadMinutes as SponsorLeadMinutes);
          }
          if (
            typeof parsedProfile.sponsorKneesSuggested === "boolean" ||
            parsedProfile.sponsorKneesSuggested === null
          ) {
            setSponsorKneesSuggested(parsedProfile.sponsorKneesSuggested ?? null);
            setWizardSponsorKneesSuggested(parsedProfile.sponsorKneesSuggested ?? null);
          }
          if (typeof parsedProfile.meetingAutoAddToCalendar === "boolean") {
            setMeetingAutoAddToCalendar(parsedProfile.meetingAutoAddToCalendar);
          }
        }

        if (enableSponsorApiSync && !hasLocalSponsorProfile) {
          await fetchSponsorConfig();
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
        bootstrapCompletedSuccessfully = true;
      } catch {
        setAttendanceStatus("Unable to load local attendance history.");
      } finally {
        setBootstrapped(true);
        try {
          await AsyncStorage.setItem(
            bootGuardStorage,
            JSON.stringify({
              inProgress: false,
              lastBootOk: bootstrapCompletedSuccessfully,
              startedAtIso,
              finishedAtIso: new Date().toISOString(),
              appVersion,
              buildNumber,
              recoveredMode: recoveredModeFromPreviousCrash,
            }),
          );
        } catch {
          // Ignore guard write failures and continue.
        }
      }
    })();
    // TODO(auth): replace DEV auth headers with real session auth tokens.
  }, [
    modeStorage,
    sponsorUiPrefsStorage,
    attendanceStorage,
    attendanceSignatureMigrationStorage,
    meetingPlansStorage,
    setupCompleteStorage,
    sobrietyDateStorage,
    profileStorage,
    ninetyDayGoalStorage,
    sponsorCallLogStorage,
    sponsorEnabledAtStorage,
    meetingAttendanceLogStorage,
    bootGuardStorage,
    devAuthUserId,
    enableSponsorApiSync,
    fetchSponsorConfig,
    refreshMeetings,
    requestLocationPermission,
    signatureStorageSubdirectory,
    iosLaunchSafeMode,
    appVersion,
    buildNumber,
  ]);

  useEffect(() => {
    if (!bootstrapped || homeScreen !== "DASHBOARD") {
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
    if (mode === "A" && homeScreen === "DASHBOARD" && selectedDayOffset !== 0) {
      setSelectedDayOffset(0);
    }
  }, [mode, homeScreen, selectedDayOffset]);

  useEffect(() => {
    if (!bootstrapped) {
      return;
    }
    setWizardHasSponsor((current) => (current === null ? sponsorEnabled : current));
    setWizardSponsorKneesSuggested((current) =>
      current === null ? (sponsorEnabled ? (sponsorKneesSuggested ?? true) : null) : current,
    );
    setWizardWantsReminders((current) => (current === null ? sponsorActive : current));
    setWizardHasHomeGroup((current) =>
      current === null ? homeGroupMeetingIds.length > 0 : current,
    );
  }, [
    bootstrapped,
    sponsorEnabled,
    sponsorKneesSuggested,
    sponsorActive,
    homeGroupMeetingIds.length,
  ]);

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
    if (Platform.OS !== "ios") {
      return;
    }
    if (homeScreen !== "SETTINGS") {
      return;
    }
    void syncSobrietyMilestoneCalendarEvents("settings-open");
  }, [bootstrapped, homeScreen, sobrietyDateIso, syncSobrietyMilestoneCalendarEvents]);

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
        meetingSignatureRequired,
        sponsorName,
        sponsorPhoneDigits,
        sponsorHour12,
        sponsorMinute,
        sponsorMeridiem,
        sponsorRepeatPreset,
        sponsorRepeatDays: sponsorRepeatDaysSorted,
        sponsorEnabled,
        sponsorActive,
        sponsorLeadMinutes,
        sponsorKneesSuggested,
        meetingAutoAddToCalendar,
      }),
    );
  }, [
    meetingRadiusMiles,
    homeGroupMeetingIds,
    sponsorEnabledAtIso,
    ninetyDayGoalTarget,
    meetingSignatureRequired,
    sponsorName,
    sponsorPhoneDigits,
    sponsorHour12,
    sponsorMinute,
    sponsorMeridiem,
    sponsorRepeatPreset,
    sponsorRepeatDaysSorted,
    sponsorEnabled,
    sponsorActive,
    sponsorLeadMinutes,
    sponsorKneesSuggested,
    meetingAutoAddToCalendar,
    profileStorage,
    bootstrapped,
  ]);

  useEffect(() => {
    setMeetingsLocationFilter((current) => {
      const next = meetingsLocationFilterFromRadius(meetingRadiusMiles);
      return current === next ? current : next;
    });
  }, [meetingRadiusMiles]);

  useEffect(() => {
    if (!bootstrapped || homeScreen !== "SETUP" || setupStep !== 6) {
      setupStep4RefreshLocationKeyRef.current = null;
      return;
    }

    const location = currentLocationRef.current;
    const locationKey = location ? `${location.lat.toFixed(4)}|${location.lng.toFixed(4)}` : "none";
    if (setupStep4RefreshLocationKeyRef.current === locationKey) {
      return;
    }
    setupStep4RefreshLocationKeyRef.current = locationKey;

    if (location) {
      void refreshMeetingsRef.current?.({ location });
      return;
    }
    void refreshMeetingsRef.current?.();
  }, [bootstrapped, homeScreen, setupStep]);

  useEffect(() => {
    if (homeScreen !== "MEETINGS") {
      setOpenMeetingsFilterDropdown(null);
    }
  }, [homeScreen]);

  useEffect(() => {
    const shouldRefreshSelectedDayMeetings =
      mode === "A" &&
      (homeScreen === "MEETINGS" || homeScreen === "SETTINGS" || homeScreen === "DASHBOARD");
    if (!bootstrapped || !shouldRefreshSelectedDayMeetings) {
      meetingsAutoRefreshKeyRef.current = null;
      return;
    }
    const nextKey = [
      selectedDay.dayOfWeek,
      meetingsFormatFilter,
      meetingsTimeFilter,
      meetingsLocationFilter,
      meetingRadiusMiles,
    ].join("|");

    if (meetingsAutoRefreshKeyRef.current === nextKey) {
      return;
    }
    meetingsAutoRefreshKeyRef.current = nextKey;

    void (async () => {
      const location =
        currentLocationRef.current ?? (await requestLocationPermissionRef.current?.());
      await refreshMeetingsRef.current?.({ location });
    })();
  }, [
    bootstrapped,
    mode,
    homeScreen,
    selectedDay.dayOfWeek,
    meetingsFormatFilter,
    meetingsTimeFilter,
    meetingsLocationFilter,
    meetingRadiusMiles,
  ]);

  useEffect(() => {
    if (!bootstrapped || homeScreen !== "DASHBOARD") {
      return;
    }

    const fetchKey = getWisdomCacheKey(dashboardWisdomDateKey, dashboardWisdomTimeZone);
    if (dailyWisdomFetchKeyRef.current === fetchKey) {
      return;
    }
    dailyWisdomFetchKeyRef.current = fetchKey;

    let cancelled = false;
    void (async () => {
      const localFallback = getLocalDailyWisdomQuote(
        dashboardWisdomDateKey,
        dashboardWisdomTimeZone,
      );
      let cachedPayload: DailyWisdomPayload | null = null;

      try {
        const cachedRaw = await AsyncStorage.getItem(fetchKey);
        if (cachedRaw) {
          const parsed = parseDailyWisdomPayload(JSON.parse(cachedRaw));
          if (parsed) {
            cachedPayload = parsed;
            if (!cancelled) {
              setDailyWisdomText(parsed.text);
            }
          }
        }
      } catch {
        // ignore cache read errors and proceed
      }

      try {
        const query = new URLSearchParams({
          date: dashboardWisdomDateKey,
          tz: dashboardWisdomTimeZone,
        });
        const response = await fetch(`${apiUrl}/api/wisdom/daily?${query.toString()}`, {
          headers: {
            Authorization: authHeader,
          },
        });
        if (!response.ok) {
          throw new Error(`wisdom fetch failed: ${response.status}`);
        }
        const payload = parseDailyWisdomPayload(await response.json());
        if (!payload) {
          throw new Error("wisdom payload invalid");
        }
        const nextText =
          payload.text === LEGACY_WISDOM_QUOTE && localFallback.text !== payload.text
            ? localFallback.text
            : payload.text;
        if (!cancelled) {
          setDailyWisdomText(nextText);
        }
        try {
          await AsyncStorage.setItem(
            fetchKey,
            JSON.stringify({
              ...payload,
              text: nextText,
            } satisfies DailyWisdomPayload),
          );
        } catch {
          // cache writes are best effort
        }
      } catch {
        if (!cancelled && !cachedPayload) {
          setDailyWisdomText(localFallback.text);
        }
        if (!cachedPayload) {
          try {
            await AsyncStorage.setItem(fetchKey, JSON.stringify(localFallback));
          } catch {
            // cache writes are best effort
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    bootstrapped,
    homeScreen,
    dashboardWisdomDateKey,
    dashboardWisdomTimeZone,
    apiUrl,
    authHeader,
  ]);

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
      sponsorScheduleEffectKeyRef.current = null;
      return;
    }
    const effectKey = [
      sponsorAlertFingerprint,
      sponsorLeadMinutes,
      debugTimeCompressionEnabled ? "debug" : "normal",
    ].join("|");
    if (sponsorScheduleEffectKeyRef.current === effectKey) {
      return;
    }
    sponsorScheduleEffectKeyRef.current = effectKey;
    void rescheduleSponsorNotifications("lead-or-debug-change");
  }, [
    bootstrapped,
    sponsorEnabled,
    sponsorLeadMinutes,
    sponsorActive,
    debugTimeCompressionEnabled,
    sponsorAlertFingerprint,
    rescheduleSponsorNotifications,
  ]);

  useEffect(() => {
    void rescheduleDriveNotifications("plan-or-debug-change");
  }, [rescheduleDriveNotifications, debugTimeCompressionEnabled]);

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
    if (!activeAttendance || activeAttendance.endAt) {
      return;
    }
    if (hasAttendanceSignature(activeAttendance) || activeAttendance.signaturePromptShown) {
      return;
    }

    const startedAtMs = new Date(activeAttendance.startAt).getTime();
    if (!Number.isFinite(startedAtMs)) {
      return;
    }
    if (sessionNowMs < startedAtMs + SIGNATURE_PROMPT_AFTER_MS) {
      return;
    }

    const prompted: AttendanceRecord = {
      ...activeAttendance,
      signaturePromptShown: true,
    };
    setActiveAttendance(prompted);
    upsertAttendanceRecord(prompted);
    Alert.alert("Before you leave", "Before you leave, obtain chair signature.", [
      { text: "Later", style: "cancel" },
      {
        text: "Get signature",
        onPress: () => {
          setHomeScreen("MEETINGS");
          setScreen("SIGNATURE");
        },
      },
    ]);
  }, [activeAttendance, sessionNowMs, upsertAttendanceRecord]);

  useEffect(() => {
    departurePromptedAttendanceRef.current = null;
  }, [activeAttendance?.id]);

  useEffect(() => {
    if (
      !activeAttendance ||
      activeAttendance.endAt ||
      activeAttendance.meetingLat === null ||
      activeAttendance.meetingLng === null ||
      !Number.isFinite(activeAttendance.meetingLat) ||
      !Number.isFinite(activeAttendance.meetingLng)
    ) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const checkDeparture = async () => {
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
        activeAttendance.meetingLat as number,
        activeAttendance.meetingLng as number,
      );
      if (distance <= ARRIVAL_RADIUS_METERS) {
        return;
      }
      if (departurePromptedAttendanceRef.current === activeAttendance.id) {
        return;
      }

      departurePromptedAttendanceRef.current = activeAttendance.id;
      Alert.alert("Left meeting geofence", "You left the meeting area. End this meeting now?", [
        { text: "Keep in progress", style: "cancel" },
        {
          text: "End meeting",
          onPress: () => {
            void endAttendanceByRecordId(activeAttendance.id, { skipEndConfirm: true });
          },
        },
      ]);
    };

    void checkDeparture();
    timer = setInterval(() => {
      void checkDeparture();
    }, 20_000);

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [activeAttendance, readCurrentLocation, endAttendanceByRecordId]);

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
        // Keep pending queue alive; geofence coordinates may appear after refresh.
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
        const startedAtLabel = formatTimeLabel(new Date());
        Alert.alert(
          "Meeting log started",
          `${meeting.name} start time logged at ${startedAtLabel}.`,
        );
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

  function addSignaturePoint(event: GestureResponderEvent, isStrokeStart = false) {
    const x = Math.max(0, Math.min(signatureCanvasSize.width, event.nativeEvent.locationX));
    const y = Math.max(0, Math.min(signatureCanvasSize.height, event.nativeEvent.locationY));
    setSignaturePoints((previous) => {
      if (previous.length === 0 || isStrokeStart) {
        return [...previous, { x, y, isStrokeStart }];
      }

      const last = previous[previous.length - 1];
      const deltaX = x - last.x;
      const deltaY = y - last.y;
      const distance = Math.hypot(deltaX, deltaY);
      if (!Number.isFinite(distance) || distance < 0.8) {
        return previous;
      }

      const sampleStep = 1.5;
      const samples = Math.max(1, Math.ceil(distance / sampleStep));
      const additions: SignaturePoint[] = [];
      for (let index = 1; index <= samples; index += 1) {
        const ratio = index / samples;
        additions.push({
          x: last.x + deltaX * ratio,
          y: last.y + deltaY * ratio,
          isStrokeStart: false,
        });
      }

      return [...previous, ...additions];
    });
  }

  const isSignatureCaptureVisible =
    homeScreen === "MEETINGS" &&
    screen === "SIGNATURE" &&
    (activeAttendance || signatureCaptureMeeting);

  const showFixedBottomMenu =
    mode === "A" &&
    setupComplete &&
    (homeScreen === "DASHBOARD" ||
      homeScreen === "MEETINGS" ||
      homeScreen === "ATTENDANCE" ||
      homeScreen === "TOOLS");
  const shouldLockOuterScroll = isSignatureCaptureVisible;

  return (
    <LiquidBackground>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={24}
      >
        <ScrollView
          ref={rootScrollRef}
          style={showFixedBottomMenu ? styles.scrollViewWithFooterNav : undefined}
          contentContainerStyle={[
            styles.contentContainer,
            showFixedBottomMenu ? styles.contentContainerWithFooterNav : null,
          ]}
          pointerEvents={shouldLockOuterScroll ? "box-none" : "auto"}
          scrollEnabled={!shouldLockOuterScroll}
          scrollIndicatorInsets={{ bottom: showFixedBottomMenu ? DASHBOARD_FOOTER_NAV_HEIGHT : 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {homeScreen !== "DASHBOARD" ? (
            <View style={styles.headerRow}>
              <View style={styles.headerTextWrap}>
                <Text style={[styles.title, ui.title]}>Recovery Mode</Text>
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
                  <Text style={styles.sectionMeta}>Step {setupStep} of 7</Text>
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
                      {wizardHasSponsor ? (
                        <>
                          <Text style={styles.label}>
                            Does your sponsor suggest you pray on your knees?
                          </Text>
                          <View style={styles.chipRow}>
                            <Pressable
                              style={[
                                styles.chip,
                                wizardSponsorKneesSuggested === true ? styles.chipSelected : null,
                              ]}
                              onPress={() => setWizardSponsorKneesSuggested(true)}
                            >
                              <Text
                                style={[
                                  styles.chipText,
                                  wizardSponsorKneesSuggested === true
                                    ? styles.chipTextSelected
                                    : null,
                                ]}
                              >
                                Yes
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[
                                styles.chip,
                                wizardSponsorKneesSuggested === false ? styles.chipSelected : null,
                              ]}
                              onPress={() => setWizardSponsorKneesSuggested(false)}
                            >
                              <Text
                                style={[
                                  styles.chipText,
                                  wizardSponsorKneesSuggested === false
                                    ? styles.chipTextSelected
                                    : null,
                                ]}
                              >
                                No
                              </Text>
                            </Pressable>
                          </View>
                          <Text style={styles.sectionMeta}>
                            This controls whether the On knees checklist toggle appears in daily
                            reading flows.
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.sectionMeta}>Sponsor is disabled for this setup.</Text>
                      )}
                    </>
                  ) : null}

                  {setupStep === 4 ? (
                    <>
                      {wizardHasSponsor ? (
                        <>
                          <Text style={styles.label}>Sponsor call time</Text>
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
                          <Text style={styles.sectionMeta}>
                            Next step configures calendar notifications and alerts for this call
                            time.
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.sectionMeta}>Sponsor is disabled for this setup.</Text>
                      )}
                    </>
                  ) : null}

                  {setupStep === 5 ? (
                    <>
                      {wizardHasSponsor ? (
                        <>
                          <Text style={styles.label}>
                            Do you want calendar notifications and alerts for your sponsor call
                            time?
                          </Text>
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
                              <Text style={styles.label}>Frequency</Text>
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
                                  <Text style={styles.label}>Day of week</Text>
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

                              <Text style={styles.label}>Reminder option</Text>
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
                          ) : null}
                        </>
                      ) : (
                        <Text style={styles.sectionMeta}>
                          Sponsor is disabled, so notifications and alerts are skipped.
                        </Text>
                      )}
                    </>
                  ) : null}

                  {setupStep === 6 ? (
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
                            {homeGroupUsesNextDayFallback
                              ? `No more meetings are available today. Showing ${homeGroupFallbackDayLabel} meetings.`
                              : "Select a home group from today's remaining meetings."}
                          </Text>
                          {homeGroupCandidateMeetings.length === 0 ? (
                            <Text style={styles.sectionMeta}>
                              No meetings loaded for today or upcoming days yet.
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
                                      {meetingDistanceLabel(
                                        meeting,
                                        meeting.distanceMeters,
                                        locationPermission,
                                        locationIssue,
                                      )}
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

                      <Text style={styles.label}>
                        Are you required to obtain a signature at meetings?
                      </Text>
                      <View style={styles.chipRow}>
                        <Pressable
                          style={[
                            styles.chip,
                            wizardMeetingSignatureRequired === true ? styles.chipSelected : null,
                          ]}
                          onPress={() => setWizardMeetingSignatureRequired(true)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              wizardMeetingSignatureRequired === true
                                ? styles.chipTextSelected
                                : null,
                            ]}
                          >
                            Yes
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.chip,
                            wizardMeetingSignatureRequired === false ? styles.chipSelected : null,
                          ]}
                          onPress={() => setWizardMeetingSignatureRequired(false)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              wizardMeetingSignatureRequired === false
                                ? styles.chipTextSelected
                                : null,
                            ]}
                          >
                            No
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  ) : null}

                  {setupStep === 7 ? (
                    <>
                      <Text style={styles.label}>Review</Text>
                      <Text style={styles.sectionMeta}>
                        Sobriety date: {sobrietyDateInput || "Not set"}
                      </Text>
                      <Text style={styles.sectionMeta}>90-day goal: {ninetyDayGoalTarget}</Text>
                      <Text style={styles.sectionMeta}>
                        Sponsor: {wizardHasSponsor ? "Enabled" : "Not enabled"}
                      </Text>
                      {wizardHasSponsor ? (
                        <Text style={styles.sectionMeta}>
                          Sponsor suggests knees prayer:{" "}
                          {wizardSponsorKneesSuggested === false ? "No" : "Yes"}
                        </Text>
                      ) : null}
                      <Text style={styles.sectionMeta}>
                        Calendar notifications and alerts:{" "}
                        {wizardWantsReminders ? "Enabled" : "Disabled"}
                      </Text>
                      <Text style={styles.sectionMeta}>
                        Home group:{" "}
                        {homeGroupMeetingIds.length > 0
                          ? (allMeetings.find((meeting) => meeting.id === homeGroupMeetingIds[0])
                              ?.name ?? "Selected")
                          : "Not selected"}
                      </Text>
                      <Text style={styles.sectionMeta}>
                        Signature required: {wizardMeetingSignatureRequired ? "Yes" : "No"}
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
                    {setupStep < 7 ? (
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
                  sobrietyDateIso={sobrietyDateIso}
                  sobrietyDateLabel={formatIsoToDdMmYyyy(sobrietyDateIso)}
                  insight={soberInsight}
                  locationEnabled={locationPermission === "granted"}
                  nextMeetings={dashboardNextFiveMeetings}
                  showingOnlineMeetingsFallback={dashboardShowsOnlineFallback}
                  chatEnabled={chatEnabled}
                  sponsorEnabled={sponsorEnabled}
                  wisdomText={dailyWisdomText}
                  dailyChecklist={dailyChecklistStatus}
                  homeGroupMeeting={
                    homeGroupUpcoming
                      ? {
                          ...homeGroupUpcoming,
                          distanceMeters: resolveMeetingDistanceMeters(
                            homeGroupUpcoming,
                            currentLocation,
                          ),
                        }
                      : null
                  }
                  meetingsAttendedInNinetyDays={meetingsAttendedInNinetyDays}
                  ninetyDayGoalTarget={ninetyDayGoalTarget}
                  ninetyDayProgressPct={ninetyDayProgressPct}
                  meetingsAttendedToday={{
                    count: meetingsAttendedTodayCount,
                    goal: DEFAULT_DAILY_MEETINGS_GOAL_TARGET,
                  }}
                  meetingBarsLast7={meetingsWeekBarsMonSun}
                  meetingPrimaryActionLabels={dashboardMeetingPrimaryActionLabels}
                  morningRoutine={morningRoutineStats}
                  nightlyInventory={nightlyInventoryStats}
                  routineInsights={routineInsights}
                  upcomingMeetingsPanel={
                    <GlassCard style={styles.card} strong>
                      <View style={styles.inlineRow}>
                        <Text style={styles.sectionTitle}>Current & Upcoming Meetings</Text>
                        <View style={styles.inlineRowGap}>
                          <Pressable
                            style={styles.viewModeButton}
                            onPress={() => {
                              if (!mapsRuntimeAvailable) {
                                setMeetingsStatus("Map view unavailable in this build.");
                                return;
                              }
                              setMeetingsViewMode((current) =>
                                current === "LIST" ? "MAP" : "LIST",
                              );
                              setSelectedLocationKey(null);
                            }}
                          >
                            <Text style={styles.viewModeButtonText}>
                              {meetingsViewMode === "LIST" ? "🗺 Map" : "☰ List"}
                            </Text>
                          </Pressable>
                          <AppButton
                            title="Open meetings"
                            variant="secondary"
                            onPress={openMeetingsHub}
                          />
                        </View>
                      </View>
                      <Text style={styles.sectionMeta}>
                        Upcoming meetings for {selectedDay.label} within {meetingRadiusMiles} miles.
                      </Text>
                      <Text style={styles.sectionMeta}>{meetingsStatus}</Text>
                      {dashboardShowsOnlineFallback && selectedDayIsToday ? (
                        <Text style={styles.sectionMeta}>
                          No in-person meetings remain today. Showing online fallback where
                          available.
                        </Text>
                      ) : null}
                      <Pressable
                        style={styles.dashboardMeetingsAttendancePill}
                        onPress={() => openAttendanceHub("dashboard")}
                        accessibilityRole="button"
                        accessibilityLabel="Open meetings attendance log page"
                      >
                        <Text style={styles.dashboardMeetingsAttendancePillText}>
                          Meetings Attendance Log
                        </Text>
                      </Pressable>
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
                                selectedDayOffset === option.offset
                                  ? styles.chipTextSelected
                                  : null,
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

                      {meetingsViewMode === "MAP" ? (
                        <>
                          {!mapsRuntimeAvailable ? (
                            <Text style={styles.sectionMeta}>
                              Map module unavailable in this build. Reinstall the latest app build.
                            </Text>
                          ) : (
                            <View style={styles.mapContainer}>
                              <MapViewCompat
                                ref={mapRef}
                                style={styles.map}
                                initialRegion={mapRenderRegion}
                                region={mapRenderRegion}
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
                          )}

                          {selectedLocationGroup ? (
                            <View style={styles.mapMeetingCard}>
                              <Text style={styles.meetingName}>
                                {selectedLocationGroup.meetings.length === 1
                                  ? selectedLocationGroup.meetings[0]?.name
                                  : "Meetings at this location"}
                              </Text>
                              <Text style={styles.sectionMeta}>
                                {selectedLocationGroup.address}
                              </Text>
                              {selectedLocationGroup.meetings.map((meeting) => (
                                <Pressable
                                  key={meeting.id}
                                  style={styles.mapMeetingRow}
                                  onPress={() => {
                                    openMeetingsHub();
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
                          ) : null}

                          {!loadingMeetings && meetingLocationGroups.length === 0 ? (
                            <Text style={styles.sectionMeta}>
                              No in-person meetings with coordinates for this day.
                            </Text>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {dashboardMeetingsForPanel.map((meeting) => (
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
                                •{" "}
                                {meetingDistanceLabel(
                                  meeting,
                                  meeting.distanceMeters,
                                  locationPermission,
                                  locationIssue,
                                )}
                              </Text>
                              <View style={styles.buttonRow}>
                                <AppButton
                                  title="Details"
                                  onPress={() => {
                                    openMeetingsHub();
                                    setSelectedMeeting(meeting);
                                    setScreen("DETAIL");
                                  }}
                                  variant="primary"
                                />
                                <View style={styles.buttonSpacer} />
                                <AppButton
                                  title={
                                    dashboardMeetingPrimaryActionLabels[meeting.id] ?? "Attend"
                                  }
                                  onPress={() =>
                                    void handleDashboardMeetingPrimaryAction(meeting.id)
                                  }
                                  variant="secondary"
                                />
                              </View>
                            </View>
                          ))}
                          {!loadingMeetings && meetingsForMeetingsScreen.length > 5 ? (
                            <Text style={styles.sectionMeta}>
                              Showing the first 5 meetings. Open Meetings for the full list.
                            </Text>
                          ) : null}
                          {!loadingMeetings && meetingsForMeetingsScreen.length === 0 ? (
                            <Text style={styles.sectionMeta}>
                              {selectedDayIsPast
                                ? "No upcoming meetings for a past day."
                                : selectedDayIsToday
                                  ? "No in-progress or upcoming meetings remaining today."
                                  : "No upcoming meetings for this day."}
                            </Text>
                          ) : null}
                        </>
                      )}
                    </GlassCard>
                  }
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
                  onOpenChat={openChatComingSoon}
                  onOpenMeetings={openMeetingsHub}
                  onOpenRecoverySettings={openSettingsHub}
                  onOpenPrivacyStatement={openPrivacyStatement}
                  onOpenAttendance={() => openAttendanceHub("dashboard")}
                  onOpenAttendanceToday={() => openAttendanceHub("dashboard")}
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
                    void handleDashboardMeetingPrimaryAction(meetingId);
                  }}
                  onCaptureSignature={(meetingId) => {
                    captureMeetingSignatureFromDashboard(meetingId);
                  }}
                  onLearnMore={openSettingsHub}
                />
              ) : null}

              {homeScreen === "PRIVACY" ? (
                <>
                  <GlassCard style={styles.card} strong>
                    <Text style={styles.sectionTitle}>Privacy Statement</Text>
                    <Text style={styles.sectionMeta}>Effective Date: March 6th, 2026</Text>
                    <Text style={styles.sectionMeta}>
                      Your privacy matters. This Sober AI-Sponsor App helps you track meetings,
                      routines, and sobriety progress. We minimize data collection and do not sell
                      your personal information.
                    </Text>
                    <View style={styles.buttonRow}>
                      <AppButton title="Back to Dashboard" onPress={openDashboard} />
                    </View>
                  </GlassCard>

                  <GlassCard style={styles.card} strong>
                    <Text style={styles.label}>What the app may store</Text>
                    <Text style={styles.sectionMeta}>
                      • Recovery settings (e.g., sobriety date, routine preferences)
                    </Text>
                    <Text style={styles.sectionMeta}>
                      • Meeting attendance logs (meeting name, time, duration)
                    </Text>
                    <Text style={styles.sectionMeta}>
                      • Notes you enter (morning routine, nightly inventory, reflections)
                    </Text>
                    <Text style={styles.sectionMeta}>
                      • Sponsor details you choose to enter (name/phone)
                    </Text>
                    <Text style={styles.sectionMeta}>
                      • Chair signatures (if you use signature capture)
                    </Text>
                  </GlassCard>

                  <GlassCard style={styles.card} strong>
                    <Text style={styles.label}>Location (optional)</Text>
                    <Text style={styles.sectionMeta}>If you allow Location, we may use it to:</Text>
                    <Text style={styles.sectionMeta}>• show meeting distance,</Text>
                    <Text style={styles.sectionMeta}>
                      • detect arrival/departure for attendance verification,
                    </Text>
                    <Text style={styles.sectionMeta}>• generate "leave now" alerts.</Text>
                    <Text style={styles.sectionMeta}>
                      You can disable Location (and Background Location) anytime in device settings.
                    </Text>
                  </GlassCard>

                  <GlassCard style={styles.card} strong>
                    <Text style={styles.label}>Notifications & Calendar (optional)</Text>
                    <Text style={styles.sectionMeta}>
                      If enabled, the app may schedule notifications (sponsor reminders, leave
                      alerts).
                    </Text>
                    <Text style={styles.sectionMeta}>
                      On iOS, if you grant Calendar access, the app may create events (e.g., "Call
                      Sponsor," meeting events).
                    </Text>
                  </GlassCard>

                  <GlassCard style={styles.card} strong>
                    <Text style={styles.label}>Data storage</Text>
                    <Text style={styles.sectionMeta}>
                      Most data is stored locally on your device. We do not store your recovery
                      notes, signatures, or meeting history on our servers unless you explicitly
                      share or export it.
                    </Text>
                  </GlassCard>

                  <GlassCard style={styles.card} strong>
                    <Text style={styles.label}>Sharing</Text>
                    <Text style={styles.sectionMeta}>We only share information when:</Text>
                    <Text style={styles.sectionMeta}>• you choose to share/export (PDF/text),</Text>
                    <Text style={styles.sectionMeta}>• required by law,</Text>
                    <Text style={styles.sectionMeta}>
                      • necessary to operate the app with service providers (if applicable).
                    </Text>
                    <Text style={styles.sectionMeta}>Contact: jason.lehman@flippos.com</Text>
                  </GlassCard>
                </>
              ) : null}

              {homeScreen === "CHAT" ? (
                <ChatComingSoonScreen enabled={chatEnabled} onBack={openDashboard} />
              ) : null}

              {homeScreen === "MEETINGS" ? (
                <>
                  <GlassCard style={styles.card} strong>
                    <View style={styles.inlineRow}>
                      <Text style={styles.sectionTitle}>Meetings</Text>
                      <View style={styles.inlineRowGap}>
                        <Pressable
                          style={styles.viewModeButton}
                          onPress={() => {
                            if (!mapsRuntimeAvailable) {
                              setMeetingsStatus("Map view unavailable in this build.");
                              return;
                            }
                            setMeetingsViewMode((current) => (current === "LIST" ? "MAP" : "LIST"));
                            setSelectedLocationKey(null);
                          }}
                        >
                          <Text style={styles.viewModeButtonText}>
                            {meetingsViewMode === "LIST" ? "🗺 Map" : "☰ List"}
                          </Text>
                        </Pressable>
                        <GlassCard style={styles.meetingsBackPill} darken blurIntensity={14}>
                          <Pressable onPress={openDashboard} style={styles.meetingsBackPillButton}>
                            <Text style={styles.meetingsBackPillText}>Back to Dashboard</Text>
                          </Pressable>
                        </GlassCard>
                      </View>
                    </View>

                    <Text style={styles.sectionMeta}>
                      Upcoming meetings for {selectedDay.label} within {meetingRadiusMiles} miles.
                    </Text>
                    <Text style={styles.sectionMeta}>{meetingsStatus}</Text>
                    {meetingsError ? <Text style={styles.errorText}>{meetingsError}</Text> : null}

                    <View style={styles.meetingsFiltersRow}>
                      <View style={styles.meetingsFilterItem}>
                        <Text style={styles.meetingsFilterLabel}>Style</Text>
                        <Pressable
                          style={[
                            styles.filterDropdownTrigger,
                            openMeetingsFilterDropdown === "FORMAT"
                              ? styles.filterDropdownTriggerOpen
                              : null,
                          ]}
                          onPress={() =>
                            setOpenMeetingsFilterDropdown((current) =>
                              current === "FORMAT" ? null : "FORMAT",
                            )
                          }
                        >
                          <Text
                            style={styles.filterDropdownValue}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {selectedMeetingsFormatLabel}
                          </Text>
                          <Text style={styles.filterDropdownChevron}>
                            {openMeetingsFilterDropdown === "FORMAT" ? "▲" : "▼"}
                          </Text>
                        </Pressable>
                        {openMeetingsFilterDropdown === "FORMAT" ? (
                          <View style={styles.filterDropdownMenu}>
                            {MEETINGS_FORMAT_OPTIONS.map((option) => {
                              const selected = meetingsFormatFilter === option.value;
                              return (
                                <Pressable
                                  key={option.value}
                                  style={styles.filterDropdownOption}
                                  onPress={() => {
                                    setMeetingsFormatFilter(option.value);
                                    setOpenMeetingsFilterDropdown(null);
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.filterDropdownOptionText,
                                      selected ? styles.filterDropdownOptionTextSelected : null,
                                    ]}
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                  >
                                    {option.label}
                                  </Text>
                                  {selected ? (
                                    <Text style={styles.filterDropdownOptionCheck}>✓</Text>
                                  ) : null}
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.meetingsFilterItem}>
                        <Text style={styles.meetingsFilterLabel}>Day</Text>
                        <Pressable
                          style={[
                            styles.filterDropdownTrigger,
                            openMeetingsFilterDropdown === "DAY"
                              ? styles.filterDropdownTriggerOpen
                              : null,
                          ]}
                          onPress={() =>
                            setOpenMeetingsFilterDropdown((current) =>
                              current === "DAY" ? null : "DAY",
                            )
                          }
                        >
                          <Text
                            style={styles.filterDropdownValue}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {selectedMeetingsDayLabel}
                          </Text>
                          <Text style={styles.filterDropdownChevron}>
                            {openMeetingsFilterDropdown === "DAY" ? "▲" : "▼"}
                          </Text>
                        </Pressable>
                        {openMeetingsFilterDropdown === "DAY" ? (
                          <View style={styles.filterDropdownMenu}>
                            {dayOptions.map((option) => {
                              const selected = selectedDayOffset === option.offset;
                              return (
                                <Pressable
                                  key={option.offset}
                                  style={styles.filterDropdownOption}
                                  onPress={() => {
                                    onDayPress(option);
                                    setOpenMeetingsFilterDropdown(null);
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.filterDropdownOptionText,
                                      selected ? styles.filterDropdownOptionTextSelected : null,
                                    ]}
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                  >
                                    {option.label}
                                  </Text>
                                  {selected ? (
                                    <Text style={styles.filterDropdownOptionCheck}>✓</Text>
                                  ) : null}
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.meetingsFilterItem}>
                        <Text style={styles.meetingsFilterLabel}>Time</Text>
                        <Pressable
                          style={[
                            styles.filterDropdownTrigger,
                            openMeetingsFilterDropdown === "TIME"
                              ? styles.filterDropdownTriggerOpen
                              : null,
                          ]}
                          onPress={() =>
                            setOpenMeetingsFilterDropdown((current) =>
                              current === "TIME" ? null : "TIME",
                            )
                          }
                        >
                          <Text
                            style={styles.filterDropdownValue}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {selectedMeetingsTimeLabel}
                          </Text>
                          <Text style={styles.filterDropdownChevron}>
                            {openMeetingsFilterDropdown === "TIME" ? "▲" : "▼"}
                          </Text>
                        </Pressable>
                        {openMeetingsFilterDropdown === "TIME" ? (
                          <View style={styles.filterDropdownMenu}>
                            {MEETINGS_TIME_OPTIONS.map((option) => {
                              const selected = meetingsTimeFilter === option.value;
                              return (
                                <Pressable
                                  key={option.value}
                                  style={styles.filterDropdownOption}
                                  onPress={() => {
                                    setMeetingsTimeFilter(option.value);
                                    setOpenMeetingsFilterDropdown(null);
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.filterDropdownOptionText,
                                      selected ? styles.filterDropdownOptionTextSelected : null,
                                    ]}
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                  >
                                    {option.label}
                                  </Text>
                                  {selected ? (
                                    <Text style={styles.filterDropdownOptionCheck}>✓</Text>
                                  ) : null}
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.meetingsFilterItem}>
                        <Text style={styles.meetingsFilterLabel}>Location</Text>
                        <Pressable
                          style={[
                            styles.filterDropdownTrigger,
                            openMeetingsFilterDropdown === "LOCATION"
                              ? styles.filterDropdownTriggerOpen
                              : null,
                          ]}
                          onPress={() =>
                            setOpenMeetingsFilterDropdown((current) =>
                              current === "LOCATION" ? null : "LOCATION",
                            )
                          }
                        >
                          <Text
                            style={styles.filterDropdownValue}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                          >
                            {selectedMeetingsLocationLabel}
                          </Text>
                          <Text style={styles.filterDropdownChevron}>
                            {openMeetingsFilterDropdown === "LOCATION" ? "▲" : "▼"}
                          </Text>
                        </Pressable>
                        {openMeetingsFilterDropdown === "LOCATION" ? (
                          <View style={styles.filterDropdownMenu}>
                            {MEETINGS_LOCATION_OPTIONS.map((option) => {
                              const selected = meetingsLocationFilter === option.value;
                              return (
                                <Pressable
                                  key={option.value}
                                  style={styles.filterDropdownOption}
                                  onPress={() => {
                                    const nextRadiusMiles = radiusMilesFromMeetingsLocationFilter(
                                      option.value,
                                      defaultMeetingRadiusMiles,
                                    );
                                    setMeetingsLocationFilter(option.value);
                                    setMeetingRadiusMiles(nextRadiusMiles);
                                    setOpenMeetingsFilterDropdown(null);
                                    void refreshMeetings({
                                      location: currentLocation,
                                      radiusMiles: nextRadiusMiles,
                                    });
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.filterDropdownOptionText,
                                      selected ? styles.filterDropdownOptionTextSelected : null,
                                    ]}
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                  >
                                    {option.label}
                                  </Text>
                                  {selected ? (
                                    <Text style={styles.filterDropdownOptionCheck}>✓</Text>
                                  ) : null}
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    </View>

                    {loadingMeetings ? (
                      <Text style={styles.sectionMeta}>Loading meetings...</Text>
                    ) : null}

                    {screen === "LIST" ? (
                      <>
                        {meetingsForMeetingsScreen.map((meeting) => {
                          const nowLocal = new Date(clockTickMs);
                          const nowMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();
                          const meetingInProgress =
                            selectedDayIsToday &&
                            isMeetingInProgress(meeting.startsAtLocal, nowMinutes);
                          const leaveBy = leaveByLabel(
                            selectedDay.date,
                            meeting.startsAtLocal,
                            meeting.distanceMeters,
                            travelTimeProvider,
                          );

                          return (
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
                                •{" "}
                                {meetingDistanceLabel(
                                  meeting,
                                  meeting.distanceMeters,
                                  locationPermission,
                                  locationIssue,
                                )}
                              </Text>
                              {leaveBy ? (
                                <Text style={styles.sectionMeta}>Leave by {leaveBy}</Text>
                              ) : null}
                              {meetingInProgress ? (
                                <Text style={styles.sectionMeta}>Happening now</Text>
                              ) : null}

                              <View style={styles.buttonRow}>
                                <AppButton
                                  title="Details"
                                  onPress={() => {
                                    setSelectedMeeting(meeting);
                                    setScreen("DETAIL");
                                  }}
                                  variant="primary"
                                />
                                <View style={styles.buttonSpacer} />
                                <AppButton
                                  title="Attend"
                                  onPress={() => void logUpcomingMeetingFromDashboard(meeting.id)}
                                  variant="secondary"
                                />
                              </View>

                              <View style={styles.buttonRow}>
                                <AppButton
                                  title="Signature"
                                  onPress={() => openMeetingSignatureCapture(meeting)}
                                  variant="secondary"
                                />
                              </View>
                            </View>
                          );
                        })}

                        {!loadingMeetings && meetingsForMeetingsScreen.length === 0 ? (
                          <Text style={styles.sectionMeta}>
                            {selectedDayIsPast
                              ? "No upcoming meetings for a past day."
                              : selectedDayIsToday
                                ? "No in-progress or upcoming meetings remaining today."
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
                          {meetingDistanceLabel(
                            selectedMeeting,
                            resolveMeetingDistanceMeters(selectedMeeting, currentLocation),
                            locationPermission,
                            locationIssue,
                          )}
                        </Text>
                        {(() => {
                          const leaveBy = leaveByLabel(
                            selectedDay.date,
                            selectedMeeting.startsAtLocal,
                            resolveMeetingDistanceMeters(selectedMeeting, currentLocation),
                            travelTimeProvider,
                          );
                          return leaveBy ? (
                            <Text style={styles.sectionMeta}>Leave by {leaveBy}</Text>
                          ) : null;
                        })()}
                        {__DEV__ ? (
                          <Text style={styles.sectionMeta}>
                            Geo debug:{" "}
                            {selectedMeeting.lat !== null && selectedMeeting.lng !== null
                              ? `${formatCoordinate(selectedMeeting.lat)}, ${formatCoordinate(selectedMeeting.lng)}`
                              : "Location unavailable"}{" "}
                            • {selectedMeeting.geoStatus ?? "unknown"}
                            {selectedMeeting.geoReason ? ` (${selectedMeeting.geoReason})` : ""}
                          </Text>
                        ) : null}
                        {selectedDayIsToday &&
                        isMeetingInProgress(
                          selectedMeeting.startsAtLocal,
                          new Date(clockTickMs).getHours() * 60 +
                            new Date(clockTickMs).getMinutes(),
                        ) ? (
                          <Text style={styles.sectionMeta}>Happening now</Text>
                        ) : null}

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
                            title="Open in Maps"
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
                            title="Attend"
                            onPress={() => void logUpcomingMeetingFromDashboard(selectedMeeting.id)}
                          />
                          <View style={styles.buttonSpacer} />
                          <AppButton
                            title="Signature"
                            onPress={() => openMeetingSignatureCapture(selectedMeeting)}
                            variant="secondary"
                          />
                        </View>
                      </View>
                    ) : null}
                  </GlassCard>
                </>
              ) : null}

              {homeScreen === "ATTENDANCE" ? (
                <GlassCard style={styles.card} strong>
                  <View style={styles.attendanceHeaderRow}>
                    <Text style={styles.sectionTitle}>Meetings Logged</Text>
                    <View style={styles.attendanceHeaderActions}>
                      <GlassCard style={styles.meetingsBackPill} darken blurIntensity={14}>
                        <Pressable
                          onPress={backFromAttendance}
                          style={styles.meetingsBackPillButton}
                          accessibilityRole="button"
                          accessibilityLabel={attendanceBackA11yLabel}
                        >
                          <Text style={styles.meetingsBackPillText}>{attendanceBackLabel}</Text>
                        </Pressable>
                      </GlassCard>
                    </View>
                  </View>
                  <Text style={styles.sectionMeta}>{attendanceStatus}</Text>
                  <View style={styles.buttonRow}>
                    <AppButton
                      title={
                        exportingAttendanceSelectionPdf
                          ? (attendanceExportProgressLabel ?? "Exporting...")
                          : "Export last 7 days"
                      }
                      onPress={() => void exportLast7DaysAttendance()}
                      disabled={exportingAttendanceSelectionPdf}
                    />
                  </View>
                  <Text style={styles.sectionMeta}>Custom export range (YYYY-MM-DD)</Text>
                  <View style={styles.inlineRowGap}>
                    <TextInput
                      style={styles.input}
                      value={attendanceExportStartDateInput}
                      onChangeText={setAttendanceExportStartDateInput}
                      placeholder="Start date (YYYY-MM-DD)"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TextInput
                      style={styles.input}
                      value={attendanceExportEndDateInput}
                      onChangeText={setAttendanceExportEndDateInput}
                      placeholder="End date (YYYY-MM-DD)"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  <View style={styles.buttonRow}>
                    <AppButton
                      title="Export custom range"
                      onPress={() => void exportCustomAttendanceRange()}
                      disabled={exportingAttendanceSelectionPdf}
                      variant="secondary"
                    />
                  </View>
                  <View style={styles.inlineRow}>
                    <Text style={styles.label}>Show inactive ({inactiveAttendanceCount})</Text>
                    <Switch
                      value={showInactiveAttendance}
                      onValueChange={setShowInactiveAttendance}
                    />
                  </View>
                  <Text style={styles.label}>Status filter</Text>
                  <View style={styles.attendanceFilterRow}>
                    <Pressable
                      style={[
                        styles.attendanceFilterChip,
                        attendanceValidityFilter === "ALL"
                          ? styles.attendanceFilterChipActive
                          : null,
                      ]}
                      onPress={() => setAttendanceValidityFilter("ALL")}
                    >
                      <Text
                        style={[
                          styles.attendanceFilterChipText,
                          attendanceValidityFilter === "ALL"
                            ? styles.attendanceFilterChipTextActive
                            : null,
                        ]}
                      >
                        Show all
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.attendanceFilterChip,
                        attendanceValidityFilter === "VALID_ONLY"
                          ? styles.attendanceFilterChipActive
                          : null,
                      ]}
                      onPress={() => setAttendanceValidityFilter("VALID_ONLY")}
                    >
                      <Text
                        style={[
                          styles.attendanceFilterChipText,
                          attendanceValidityFilter === "VALID_ONLY"
                            ? styles.attendanceFilterChipTextActive
                            : null,
                        ]}
                      >
                        Valid only
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.attendanceFilterChip,
                        attendanceValidityFilter === "INVALID_ONLY"
                          ? styles.attendanceFilterChipActive
                          : null,
                      ]}
                      onPress={() => setAttendanceValidityFilter("INVALID_ONLY")}
                    >
                      <Text
                        style={[
                          styles.attendanceFilterChipText,
                          attendanceValidityFilter === "INVALID_ONLY"
                            ? styles.attendanceFilterChipTextActive
                            : null,
                        ]}
                      >
                        Invalid only
                      </Text>
                    </Pressable>
                  </View>

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
                          ? (attendanceExportProgressLabel ?? "Exporting...")
                          : `Export selected (${selectedAttendanceVisibleCount})`
                      }
                      onPress={() => void exportSelectedAttendance()}
                      disabled={exportingAttendanceSelectionPdf}
                    />
                    <View style={styles.buttonSpacer} />
                    <AppButton
                      title={`Text selected (${selectedAttendanceVisibleCount})`}
                      onPress={() => void shareSelectedAttendanceText()}
                      variant="secondary"
                    />
                  </View>

                  {selectedAttendanceVisibleCount > 0 ? (
                    <View style={styles.buttonRow}>
                      <AppButton
                        title={`Make inactive (${selectedAttendanceVisibleCount})`}
                        onPress={makeSelectedAttendanceInactive}
                        variant="secondary"
                      />
                    </View>
                  ) : null}

                  {attendanceRecordsForView.length === 0 ? (
                    <Text style={styles.sectionMeta}>
                      {showInactiveAttendance
                        ? "No attendance records yet."
                        : inactiveAttendanceCount > 0
                          ? "No active attendance records. Turn on Show inactive to view archived logs."
                          : "No attendance records yet."}
                    </Text>
                  ) : (
                    attendanceRecordsForView.map((record) => {
                      const selected = selectedAttendanceIds.includes(record.id);
                      const validation = attendanceValidationById.get(record.id) ?? {
                        code: "INVALID" as const,
                        valid: false,
                        reason: "Validation unavailable",
                      };
                      const validationStatusLabel =
                        validation.code === "VALID"
                          ? "Valid"
                          : validation.code === "UNVERIFIED_LOCATION"
                            ? "Unverified"
                            : "Invalid";
                      const validationReason =
                        validation.code === "UNVERIFIED_LOCATION"
                          ? "Meeting location could not be verified"
                          : validation.reason;
                      const validationBadgeLabel = validation.code === "VALID" ? "☑" : "✕";
                      const signatureWindow = attendanceSignatureWindowById.get(record.id) ?? {
                        eligible: false,
                        reason: "Signature is unavailable because meeting start time is missing.",
                        windowStartMs: null,
                        windowEndMs: null,
                      };
                      return (
                        <Pressable
                          key={record.id}
                          style={[styles.historyCard, selected ? styles.chipSelected : null]}
                          onPress={() => toggleAttendanceSelection(record.id)}
                        >
                          <View style={styles.historyCardHeader}>
                            <Text style={styles.meetingName}>{record.meetingName}</Text>
                            <Text
                              style={[
                                styles.validationBadge,
                                validation.code === "VALID"
                                  ? styles.validationBadgeValid
                                  : styles.validationBadgeInvalid,
                              ]}
                            >
                              {validationBadgeLabel}
                            </Text>
                          </View>
                          <Text style={styles.sectionMeta}>
                            Start: {formatDateTimeLabel(new Date(record.startAt))}
                          </Text>
                          <Text style={styles.sectionMeta}>
                            End:{" "}
                            {record.endAt
                              ? formatDateTimeLabel(new Date(record.endAt))
                              : "In progress"}
                          </Text>
                          <Text style={styles.sectionMeta}>
                            Status: {validationStatusLabel} • {validationReason}
                          </Text>
                          <Text style={styles.sectionMeta}>
                            Duration: {formatDuration(record.durationSeconds)} • Signature:{" "}
                            {hasAttendanceSignature(record) ? "Yes" : "No"}
                          </Text>
                          {!signatureWindow.eligible ? (
                            <Text style={styles.sectionMeta}>
                              {signatureWindow.reason ?? SIGNATURE_WINDOW_HELP_TEXT}
                            </Text>
                          ) : null}
                          {record.inactive ? (
                            <Text style={styles.sectionMeta}>Archived after export</Text>
                          ) : null}
                          <Text style={styles.sectionMeta}>
                            {selected ? "Selected for export" : "Tap to select for export"}
                          </Text>
                          {!record.endAt ? (
                            <View style={styles.buttonRow}>
                              <AppButton
                                title="End meeting"
                                onPress={() => void endAttendanceByRecordId(record.id)}
                              />
                              <View style={styles.buttonSpacer} />
                              <AppButton
                                title={
                                  hasAttendanceSignature(record)
                                    ? "Update signature"
                                    : "Add signature"
                                }
                                onPress={() => openAttendanceRecordSignatureCapture(record.id)}
                                variant="secondary"
                                disabled={!signatureWindow.eligible}
                              />
                            </View>
                          ) : (
                            <View style={styles.buttonRow}>
                              <AppButton
                                title={
                                  hasAttendanceSignature(record)
                                    ? "Update signature"
                                    : "Add signature"
                                }
                                onPress={() => openAttendanceRecordSignatureCapture(record.id)}
                                variant="secondary"
                                disabled={!signatureWindow.eligible}
                              />
                            </View>
                          )}
                        </Pressable>
                      );
                    })
                  )}
                </GlassCard>
              ) : null}

              {homeScreen === "TOOLS" ? (
                <>
                  {routinesStatus && routinesStatus !== "Turn this checklist item on first." ? (
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
                        const checklistItem = routinesStore.morningTemplate.items.find(
                          (item) => item.id === itemId,
                        );
                        if (!checklistItem?.enabled) {
                          setRoutinesStatus("Turn this checklist item on first.");
                          return;
                        }
                        updateMorningDayState((day) => {
                          const completedByItemId = { ...day.completedByItemId };
                          if (completedByItemId[itemId]) {
                            delete completedByItemId[itemId];
                          } else {
                            completedByItemId[itemId] = new Date().toISOString();
                          }
                          const enabledItemIds = new Set(
                            routinesStore.morningTemplate.items
                              .filter((item) => item.enabled)
                              .map((item) => item.id),
                          );
                          const completedEnabledCount = Object.keys(completedByItemId).filter(
                            (completedItemId) => enabledItemIds.has(completedItemId),
                          ).length;
                          const nextCompletedAt =
                            enabledItemIds.size > 0 && completedEnabledCount >= enabledItemIds.size
                              ? new Date().toISOString()
                              : null;
                          return {
                            ...day,
                            completedByItemId,
                            completedAt: nextCompletedAt,
                          };
                        });
                      }}
                      onToggleItemEnabled={(itemId) => {
                        updateRoutinesStore((store) => {
                          const nextItems = store.morningTemplate.items.map((item) =>
                            item.id === itemId ? { ...item, enabled: !item.enabled } : item,
                          );
                          const currentDay = getMorningDayState(store, routineDateKey);
                          const completedByItemId = { ...currentDay.completedByItemId };
                          const nowIso = new Date().toISOString();
                          const nextCompletedAt = computeMorningCompletedAt(
                            nextItems,
                            completedByItemId,
                            currentDay.completedAt,
                            nowIso,
                          );

                          return {
                            ...store,
                            morningTemplate: {
                              ...store.morningTemplate,
                              items: nextItems,
                            },
                            morningByDate: {
                              ...store.morningByDate,
                              [routineDateKey]: {
                                ...currentDay,
                                completedByItemId,
                                completedAt: nextCompletedAt,
                              },
                            },
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
                      onOpenReader={openRoutineReader}
                      onReadDailyReflections={openDailyReflectionsRead}
                      onListenDailyReflections={() => {
                        void openDailyReflectionsListen();
                      }}
                      onSendAmTextSponsor={() => void sendMorningSponsorTextNow()}
                      onListenText={speakRoutineText}
                      onListenThirdStepPrayer={onListenThirdStepPrayer}
                      onPlayItem={(itemId) => void playRoutineItemAudio(itemId)}
                      onReadThirdStepPrayer={onReadThirdStepPrayer}
                      onReadSeventhStepPrayer={onReadSeventhStepPrayer}
                      onReadEleventhStepPrayer={onReadEleventhStepPrayer}
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
                            category === "resentful" ||
                            category === "selfSeeking" ||
                            category === "selfish" ||
                            category === "dishonest"
                              ? { id: createId(`nightly-${category}`), text: "", fear: null }
                              : { id: createId(`nightly-${category}`), text: "" },
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
                      onUpdateEntryFear={(category, id, fear) =>
                        updateNightlyDayState((day) => ({
                          ...day,
                          [category]: day[category].map((entry) =>
                            entry.id === id ? { ...entry, fear } : entry,
                          ),
                        }))
                      }
                      onSetNotes={(value) =>
                        updateNightlyDayState((day) => ({
                          ...day,
                          notes: value,
                        }))
                      }
                      onToggleEleventhStepPrayerEnabled={() =>
                        updateNightlyDayState((day) => ({
                          ...day,
                          eleventhStepPrayerEnabled: !day.eleventhStepPrayerEnabled,
                        }))
                      }
                      onListenEleventhStepPrayer={onListenNightlyPrayer}
                      onReadEleventhStepPrayer={onReadNightlyPrayer}
                      onToggleCompleted={() =>
                        updateNightlyDayState(
                          (day) => ({
                            ...day,
                            completedAt: day.completedAt ? null : new Date().toISOString(),
                          }),
                          "Nightly routine saved.",
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
                      bodyText={routineReader?.bodyText ?? null}
                      showGotOnKneesToggle={routineReaderShowsOnKneesToggle}
                      gotOnKneesCompleted={routineReaderOnKneesCompleted}
                      onToggleGotOnKnees={onToggleRoutineReaderOnKnees}
                      requiredSeconds={
                        routineReader?.requiredDwellSeconds ?? DEFAULT_MORNING_READ_DWELL_SECONDS
                      }
                      dwellResetKey={`${routineReaderBackScreen}:${routineReader?.itemId ?? routineReader?.title ?? "reader"}`}
                      onDwellEligible={
                        routineReaderBackScreen === "MORNING" && routineReader?.itemId
                          ? onRoutineReaderDwellEligible
                          : undefined
                      }
                      onBack={() => setToolsScreen(routineReaderBackScreen)}
                      onOpenLink={(url) => void openRoutineReaderLink(url)}
                    />
                  ) : null}
                </>
              ) : null}

              {homeScreen === "DIAGNOSTICS" ? (
                <DiagnosticsScreen
                  buildInfo={diagnosticsBuildInfo}
                  meetingsApiHealth={diagnosticsMeetingsApiHealth}
                  locationStatus={diagnosticsLocationStatus}
                  onRefreshLocation={() => {
                    void refreshDiagnosticsLocation();
                  }}
                  meetingIdInput={diagnosticsMeetingIdInput}
                  onMeetingIdInputChange={setDiagnosticsMeetingIdInput}
                  meetingGeoSample={diagnosticsMeetingGeoSample}
                  exportDebug={diagnosticsExportDebug}
                  lastExportAttempt={lastExportAttempt}
                  onRunExportDryRun={runDiagnosticsExportDryRun}
                  onCreateCompletedTestMeeting={createDiagnosticsCompletedTestMeeting}
                  onBack={closeDiagnostics}
                />
              ) : null}

              {homeScreen === "SETTINGS" ? (
                <>
                  <GlassCard style={styles.card} strong>
                    <Pressable
                      delayLongPress={1800}
                      onLongPress={openDiagnosticsFromSettings}
                      disabled={!isDiagnosticsEnabled}
                    >
                      <Text style={styles.sectionTitle}>Recovery Settings</Text>
                    </Pressable>
                    <Text style={styles.sectionMeta}>
                      Configure sponsor reminders, meeting planning, and attendance options.
                    </Text>
                    <Pressable
                      delayLongPress={1800}
                      onLongPress={openDiagnosticsFromSettings}
                      disabled={!isDiagnosticsEnabled}
                    >
                      <Text style={styles.sectionMeta}>
                        Version {appVersion} ({buildNumber})
                      </Text>
                    </Pressable>
                    {isDiagnosticsEnabled ? (
                      <Text style={styles.sectionMeta}>
                        Dev/Preview: long-press Recovery Settings or Version to open Diagnostics.
                      </Text>
                    ) : null}
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
                        <Text style={styles.sectionMeta}>
                          Notification status: {notificationStatus}
                        </Text>
                        <Text style={styles.sectionMeta}>Calendar status: {calendarStatus}</Text>
                        <AppButton
                          title={sponsorSaving ? "Saving..." : "Save Sponsor Config"}
                          onPress={() => void saveSponsorConfig()}
                          disabled={sponsorSaving}
                        />
                      </>
                    )}
                  </GlassCard>

                  <GlassCard style={styles.card} strong>
                    <View style={styles.inlineRow}>
                      <Text style={styles.sectionTitle}>Meetings</Text>
                      <Pressable
                        style={styles.viewModeButton}
                        onPress={() => {
                          if (!mapsRuntimeAvailable) {
                            setMeetingsStatus("Map view unavailable in this build.");
                            return;
                          }
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
                    <Text style={styles.sectionMeta}>
                      Location Always:{" "}
                      {locationAlwaysPermission === "granted" ? "Enabled" : "Not enabled"}
                    </Text>
                    {locationPermission === "denied" ? (
                      <Text style={styles.errorText}>
                        Location disabled - enable to see meetings near you.
                      </Text>
                    ) : null}
                    {locationIssue === "services_disabled" ? (
                      <Text style={styles.errorText}>
                        Turn on Location Services to resolve meeting distance and geofence.
                      </Text>
                    ) : null}
                    {locationAlwaysPermission === "denied" ? (
                      <Text style={styles.errorText}>
                        Always location denied - enable Always in device settings for auto-log.
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
                      <AppButton
                        title="While Using App"
                        onPress={() => {
                          void (async () => {
                            const position = await requestLocationPermission();
                            await refreshMeetings({ location: position });
                          })();
                        }}
                        variant="secondary"
                      />
                      <View style={styles.buttonSpacer} />
                      <AppButton
                        title="Always (recommended)"
                        onPress={() => {
                          void requestAlwaysLocationPermission();
                        }}
                        variant="secondary"
                      />
                    </View>
                    {locationPermission === "denied" || locationAlwaysPermission === "denied" ? (
                      <View style={styles.buttonRow}>
                        <AppButton
                          title="Open settings"
                          onPress={() => {
                            void Linking.openSettings();
                          }}
                          variant="secondary"
                        />
                      </View>
                    ) : null}

                    <View style={styles.inlineRow}>
                      <Text style={styles.label}>Auto-add attended meetings to calendar</Text>
                      <Switch
                        value={meetingAutoAddToCalendar}
                        onValueChange={setMeetingAutoAddToCalendar}
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
                        {!mapsRuntimeAvailable ? (
                          <Text style={styles.sectionMeta}>
                            Map module unavailable in this build. Reinstall the latest app build.
                          </Text>
                        ) : (
                          <View style={styles.mapContainer}>
                            <MapViewCompat
                              ref={mapRef}
                              style={styles.map}
                              initialRegion={mapRenderRegion}
                              region={mapRenderRegion}
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
                          const leaveBy = leaveByLabel(
                            selectedDay.date,
                            meeting.startsAtLocal,
                            meeting.distanceMeters,
                            travelTimeProvider,
                          );

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
                                •{" "}
                                {meetingDistanceLabel(
                                  meeting,
                                  meeting.distanceMeters,
                                  locationPermission,
                                  locationIssue,
                                )}
                              </Text>
                              {leaveBy ? (
                                <Text style={styles.sectionMeta}>Leave by {leaveBy}</Text>
                              ) : null}

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
                                      : start {formatTimeLabel(preview.meetingStartAt)}, travel{" "}
                                      {preview.travelMinutes}m, depart{" "}
                                      {formatTimeLabel(preview.departAt)}, notify{" "}
                                      {formatTimeLabel(preview.notifyAt)}
                                    </Text>
                                  ) : null}
                                </>
                              ) : null}

                              <View style={styles.buttonRow}>
                                <AppButton
                                  title="Details"
                                  onPress={() => {
                                    setSelectedMeeting(meeting);
                                    setScreen("DETAIL");
                                  }}
                                  variant="primary"
                                />
                                <View style={styles.buttonSpacer} />
                                <AppButton
                                  title="Attend"
                                  onPress={() => void logUpcomingMeetingFromDashboard(meeting.id)}
                                  variant="secondary"
                                />
                              </View>

                              {selectedDayIsToday &&
                              isMeetingInProgress(
                                meeting.startsAtLocal,
                                new Date(clockTickMs).getHours() * 60 +
                                  new Date(clockTickMs).getMinutes(),
                              ) ? (
                                <Text style={styles.sectionMeta}>Happening now</Text>
                              ) : null}

                              <View style={styles.buttonRow}>
                                <AppButton
                                  title="Signature"
                                  onPress={() => openMeetingSignatureCapture(meeting)}
                                  variant="secondary"
                                />
                              </View>
                            </View>
                          );
                        })}
                        {!loadingMeetings && meetingsForDay.length === 0 ? (
                          <Text style={styles.sectionMeta}>
                            {selectedDayIsPast
                              ? "No upcoming meetings for a past day."
                              : selectedDayIsToday
                                ? "No in-progress or upcoming meetings remaining today."
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
                          {meetingDistanceLabel(
                            selectedMeeting,
                            resolveMeetingDistanceMeters(selectedMeeting, currentLocation),
                            locationPermission,
                            locationIssue,
                          )}
                        </Text>
                        {(() => {
                          const leaveBy = leaveByLabel(
                            selectedDay.date,
                            selectedMeeting.startsAtLocal,
                            resolveMeetingDistanceMeters(selectedMeeting, currentLocation),
                            travelTimeProvider,
                          );
                          return leaveBy ? (
                            <Text style={styles.sectionMeta}>Leave by {leaveBy}</Text>
                          ) : null;
                        })()}
                        {__DEV__ ? (
                          <Text style={styles.sectionMeta}>
                            Geo debug:{" "}
                            {selectedMeeting.lat !== null && selectedMeeting.lng !== null
                              ? `${formatCoordinate(selectedMeeting.lat)}, ${formatCoordinate(selectedMeeting.lng)}`
                              : "Location unavailable"}{" "}
                            • {selectedMeeting.geoStatus ?? "unknown"}
                            {selectedMeeting.geoReason ? ` (${selectedMeeting.geoReason})` : ""}
                          </Text>
                        ) : null}

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
                            title="Open in Maps"
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
                            title="Attend"
                            onPress={() => void startAttendance(selectedMeeting)}
                          />
                          <View style={styles.buttonSpacer} />
                          <AppButton
                            title="Mark attended"
                            onPress={() => markMeetingAttended(selectedMeeting)}
                            variant="secondary"
                          />
                          <View style={styles.buttonSpacer} />
                          <AppButton
                            title="Signature"
                            onPress={() => openMeetingSignatureCapture(selectedMeeting)}
                            variant="secondary"
                          />
                        </View>

                        <Text style={styles.sectionMeta}>
                          Arrival watcher: you will be prompted when within ~200 ft on iOS.
                        </Text>
                      </View>
                    ) : null}
                  </GlassCard>

                  {activeAttendance &&
                  (!activeAttendance.endAt || screen === "SESSION" || screen === "SIGNATURE") ? (
                    <GlassCard style={styles.card} strong>
                      <Text style={styles.sectionTitle}>Verified Attendance</Text>
                      <Text style={styles.sectionMeta}>{attendanceStatus}</Text>
                      <Text style={styles.sectionMeta}>
                        Meeting: {activeAttendance.meetingName}
                      </Text>
                      <Text style={styles.sectionMeta}>
                        Started: {formatDateTimeLabel(new Date(activeAttendance.startAt))}
                      </Text>
                      <Text style={styles.sectionMeta}>
                        Duration: {formatDuration(openSessionDurationSeconds)}
                      </Text>
                      {activeAttendance.endAt ? (
                        <Text style={styles.sectionMeta}>
                          Ended: {formatDateTimeLabel(new Date(activeAttendance.endAt))}
                        </Text>
                      ) : null}
                      <Text style={styles.sectionMeta}>
                        Signature: {hasAttendanceSignature(activeAttendance) ? "Saved" : "Missing"}
                      </Text>
                      {activeAttendanceSignatureWindow &&
                      !activeAttendanceSignatureWindow.eligible ? (
                        <Text style={styles.sectionMeta}>
                          {activeAttendanceSignatureWindow.reason ?? SIGNATURE_WINDOW_HELP_TEXT}
                        </Text>
                      ) : (
                        <Text style={styles.sectionMeta}>{SIGNATURE_WINDOW_HELP_TEXT}</Text>
                      )}

                      <View style={styles.buttonRow}>
                        <AppButton
                          title={
                            hasAttendanceSignature(activeAttendance)
                              ? "Update signature"
                              : "Get signature"
                          }
                          onPress={() => openAttendanceRecordSignatureCapture(activeAttendance.id)}
                          disabled={!activeAttendanceSignatureWindow?.eligible}
                        />
                        {!activeAttendance.endAt ? (
                          <>
                            <View style={styles.buttonSpacer} />
                            <AppButton
                              title="End meeting"
                              onPress={() => void endAttendance()}
                              variant="secondary"
                            />
                          </>
                        ) : null}
                      </View>

                      {activeAttendance.endAt ? (
                        <>
                          <Text style={styles.sectionMeta}>
                            PDF: {activeAttendance.pdfUri ?? "Not exported"}
                          </Text>

                          <View style={styles.buttonRow}>
                            <AppButton title="Back to meetings" onPress={() => setScreen("LIST")} />
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
                        PDF file name: {ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX}.pdf
                      </Text>
                    </GlassCard>
                  ) : null}

                  <GlassCard style={styles.card} strong>
                    <Text style={styles.sectionTitle}>Recent Attendance</Text>
                    {attendanceRecords.slice(0, 5).map((record) => (
                      <View key={record.id} style={styles.historyCard}>
                        <Text style={styles.meetingName}>{record.meetingName}</Text>
                        <Text style={styles.sectionMeta}>
                          {formatDateTimeLabel(new Date(record.startAt))} •{" "}
                          {formatDuration(record.durationSeconds)}
                        </Text>
                        <Text style={styles.sectionMeta}>
                          {record.endAt ? "Completed" : "In progress"} • Signature:{" "}
                          {hasAttendanceSignature(record) ? "Yes" : "No"}
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
            mode === "B" ? (
              <SoberHouseSettingsScreen
                userId={devAuthUserId}
                actorId={devAuthUserId}
                actorName={devUserDisplayName}
                onBack={() => handleModeSelect("A")}
              />
            ) : (
              <>
                <GlassCard style={styles.card} strong>
                  <Text style={styles.sectionTitle}>Probation/Parole Settings</Text>
                  <Text style={styles.sectionMeta}>
                    Configure probation/parole rules, reporting windows, and reminder preferences.
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
            )
          ) : null}
        </ScrollView>

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
                  <Text style={styles.dashboardTabIcon}>☀️🌙</Text>
                  <Text
                    style={
                      homeScreen === "TOOLS"
                        ? styles.dashboardTabTextActive
                        : styles.dashboardTabText
                    }
                  >
                    AM/PM
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

        <Modal
          visible={Boolean(isSignatureCaptureVisible)}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setScreen(activeAttendance ? "SESSION" : "LIST")}
        >
          <View style={styles.signatureModalRoot}>
            <View style={styles.signatureModalHeader}>
              <Text style={styles.sectionTitle}>Signature Capture</Text>
              <Text style={styles.sectionMeta}>
                Draw chairperson signature with finger for{" "}
                {activeAttendance?.meetingName ?? signatureCaptureMeeting?.name ?? "meeting"}.
              </Text>
              {!activeAttendance ? (
                <Text style={styles.sectionMeta}>
                  Saving logs this meeting now. It will show with a red X until duration and
                  location requirements are met.
                </Text>
              ) : null}
            </View>

            <View style={styles.inlineRowGap}>
              <TextInput
                style={styles.input}
                value={signatureChairNameInput}
                onChangeText={setSignatureChairNameInput}
                placeholder="Chair printed name (optional)"
              />
              <TextInput
                style={styles.input}
                value={signatureChairRoleInput}
                onChangeText={setSignatureChairRoleInput}
                placeholder="Role: Chair / Secretary (optional)"
              />
            </View>

            <View style={styles.signatureModalCanvasWrap}>
              <View
                style={[styles.signatureCanvas, styles.signatureCanvasLandscape]}
                onLayout={(event) => {
                  setSignatureCanvasSize({
                    width: event.nativeEvent.layout.width,
                    height: event.nativeEvent.layout.height,
                  });
                }}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(event) => addSignaturePoint(event, true)}
                onResponderMove={addSignaturePoint}
              >
                <Svg
                  pointerEvents="none"
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${Math.max(1, signatureCanvasSize.width)} ${Math.max(1, signatureCanvasSize.height)}`}
                  style={styles.signatureSvgOverlay}
                >
                  {signaturePreviewPath.length > 0 ? (
                    <Path
                      d={signaturePreviewPath}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                </Svg>
              </View>
            </View>

            <View style={styles.signatureModalButtons}>
              <AppButton
                title="Back"
                onPress={() => setScreen(activeAttendance ? "SESSION" : "LIST")}
              />
              <View style={styles.buttonSpacer} />
              <AppButton title="Clear" onPress={() => setSignaturePoints([])} />
              <View style={styles.buttonSpacer} />
              <AppButton title="Save" onPress={() => void saveSignature()} />
            </View>
          </View>
        </Modal>
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
  meetingsFiltersWrap: {
    gap: 8,
  },
  meetingsFiltersRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    flexWrap: "wrap",
  },
  meetingsFilterItem: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 0,
    gap: 6,
  },
  meetingsFilterLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
    textTransform: "uppercase",
    paddingHorizontal: 2,
  },
  meetingsBackPill: {
    borderRadius: 999,
    borderColor: "rgba(196,181,253,0.42)",
    backgroundColor: "rgba(24,14,52,0.64)",
    maxWidth: "100%",
  },
  meetingsBackPillButton: {
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  meetingsBackPillText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
  },
  dashboardMeetingsAttendancePill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(196,181,253,0.42)",
    backgroundColor: "rgba(24,14,52,0.64)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dashboardMeetingsAttendancePillText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  filterDropdownTrigger: {
    borderWidth: 2,
    borderColor: "rgba(196,181,253,0.45)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "rgba(30,20,64,0.88)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  filterDropdownTriggerOpen: {
    borderColor: colors.neonLavender,
    backgroundColor: "rgba(61,34,126,0.9)",
  },
  filterDropdownValue: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
    flexShrink: 1,
  },
  filterDropdownChevron: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
  filterDropdownMenu: {
    borderWidth: 1,
    borderColor: "rgba(196,181,253,0.45)",
    borderRadius: 12,
    backgroundColor: "rgba(20,12,44,0.95)",
    overflow: "hidden",
  },
  filterDropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(196,181,253,0.2)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterDropdownOptionText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
    flexShrink: 1,
  },
  filterDropdownOptionTextSelected: {
    color: colors.textPrimary,
    fontWeight: "800",
  },
  filterDropdownOptionCheck: {
    color: colors.neonLavender,
    fontSize: 14,
    fontWeight: "800",
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  attendanceFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  attendanceFilterChip: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  attendanceFilterChipActive: {
    borderColor: colors.neonLavender,
    backgroundColor: "rgba(139,92,246,0.35)",
  },
  attendanceFilterChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  attendanceFilterChipTextActive: {
    color: colors.textPrimary,
  },
  attendanceHeaderRow: {
    gap: 8,
  },
  attendanceHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    flexWrap: "wrap",
    gap: 8,
    width: "100%",
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
    flex: 1,
    flexShrink: 1,
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
  signatureSvgOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  signatureModalRoot: {
    flex: 1,
    backgroundColor: "rgba(11,6,26,0.98)",
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 20,
    gap: 12,
  },
  signatureModalHeader: {
    gap: 6,
  },
  signatureModalCanvasWrap: {
    flex: 1,
  },
  signatureCanvasLandscape: {
    height: "100%",
    minHeight: 260,
  },
  signatureModalButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  historyCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  validationBadge: {
    minWidth: 30,
    textAlign: "center",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    fontSize: 16,
    fontWeight: "800",
    overflow: "hidden",
  },
  validationBadgeValid: {
    color: "#bbf7d0",
    backgroundColor: "rgba(34,197,94,0.25)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.6)",
  },
  validationBadgeInvalid: {
    color: "#fecaca",
    backgroundColor: "rgba(239,68,68,0.25)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.6)",
  },
  historyCard: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
    paddingTop: 8,
    gap: 2,
  },
});
