import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  FlatList,
  Platform,
  Pressable,
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

type SponsorRepeatRule = "DAILY" | "WEEKDAYS" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";

type SponsorConfigPayload = {
  sponsorName: string;
  sponsorPhoneE164: string;
  callTimeLocalHhmm: string;
  repeatRule: SponsorRepeatRule;
  active: boolean;
};

const SPONSOR_REPEAT_OPTIONS: Array<{ value: SponsorRepeatRule; label: string }> = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKDAYS", label: "M-F" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Bi-weekly" },
  { value: "MONTHLY", label: "Monthly" },
];

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
const SPONSOR_ALERT_LEAD_PRESETS_MINUTES = [0, 5, 10, 15, 30, 60];
const SPONSOR_ALERT_LEAD_MAX_MINUTES = 24 * 60;
const SPONSOR_CALENDAR_EVENT_KEY_PREFIX = "recovery:sponsorCalendarEventId:";
const SPONSOR_ALERT_LEAD_KEY_PREFIX = "recovery:sponsorAlertLeadMinutes:";

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
  MONDAY: number;
  TUESDAY: number;
  WEDNESDAY: number;
  THURSDAY: number;
  FRIDAY: number;
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
  return value.replace(/\D/g, "").slice(0, 10);
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

function isDueOnDate(date: Date, repeatRule: SponsorRepeatRule): boolean {
  const day = date.getDay();
  switch (repeatRule) {
    case "DAILY":
      return true;
    case "WEEKDAYS":
      return day >= 1 && day <= 5;
    case "WEEKLY":
    case "BIWEEKLY":
    case "MONTHLY":
      return true;
    default:
      return false;
  }
}

function computeNextCall(
  now: Date,
  callTimeLocalHhmm: string,
  repeatRule: SponsorRepeatRule,
): { nextAt: Date; dueToday: boolean } {
  const [hoursText, minutesText] = callTimeLocalHhmm.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  const todayAtCallTime = new Date(now);
  todayAtCallTime.setHours(hours, minutes, 0, 0);
  const dueToday = isDueOnDate(now, repeatRule);

  if (dueToday && todayAtCallTime.getTime() >= now.getTime()) {
    return { nextAt: todayAtCallTime, dueToday: true };
  }

  const next = new Date(todayAtCallTime);
  switch (repeatRule) {
    case "DAILY":
      next.setDate(next.getDate() + 1);
      break;
    case "WEEKDAYS": {
      do {
        next.setDate(next.getDate() + 1);
      } while (!isDueOnDate(next, "WEEKDAYS"));
      break;
    }
    case "WEEKLY":
      next.setDate(next.getDate() + 7);
      break;
    case "BIWEEKLY":
      next.setDate(next.getDate() + 14);
      break;
    case "MONTHLY":
      next.setMonth(next.getMonth() + 1);
      break;
  }

  return { nextAt: next, dueToday };
}

function sponsorCalendarEventStorageKey(userId: string): string {
  return `${SPONSOR_CALENDAR_EVENT_KEY_PREFIX}${userId}`;
}

function sponsorAlertLeadStorageKey(userId: string): string {
  return `${SPONSOR_ALERT_LEAD_KEY_PREFIX}${userId}`;
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
    MONDAY: calendar.Weekday?.MONDAY ?? 2,
    TUESDAY: calendar.Weekday?.TUESDAY ?? 3,
    WEDNESDAY: calendar.Weekday?.WEDNESDAY ?? 4,
    THURSDAY: calendar.Weekday?.THURSDAY ?? 5,
    FRIDAY: calendar.Weekday?.FRIDAY ?? 6,
  };
}

function buildCalendarRecurrenceRule(
  repeatRule: SponsorRepeatRule,
  calendar: CalendarModule,
): CalendarRecurrenceRuleInput {
  switch (repeatRule) {
    case "DAILY":
      return { frequency: calendar.RecurrenceFrequency.DAILY };
    case "WEEKDAYS": {
      const weekdays = resolveCalendarWeekdayMap(calendar);
      return {
        frequency: calendar.RecurrenceFrequency.WEEKLY,
        daysOfTheWeek: [
          { dayOfTheWeek: weekdays.MONDAY },
          { dayOfTheWeek: weekdays.TUESDAY },
          { dayOfTheWeek: weekdays.WEDNESDAY },
          { dayOfTheWeek: weekdays.THURSDAY },
          { dayOfTheWeek: weekdays.FRIDAY },
        ],
      };
    }
    case "WEEKLY":
      return { frequency: calendar.RecurrenceFrequency.WEEKLY };
    case "BIWEEKLY":
      return {
        frequency: calendar.RecurrenceFrequency.WEEKLY,
        interval: 2,
      };
    case "MONTHLY":
      return { frequency: calendar.RecurrenceFrequency.MONTHLY };
  }
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
  const [sponsorRepeatRule, setSponsorRepeatRule] = useState<SponsorRepeatRule>("WEEKDAYS");
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
      Boolean(sponsorRepeatRule),
    [callTimeLocalHhmm, normalizedSponsorName, sponsorPhoneE164, sponsorRepeatRule],
  );
  const sponsorScheduleSummary = useMemo(() => {
    if (!sponsorActive) {
      return "Sponsor reminders disabled.";
    }

    const result = computeNextCall(new Date(), callTimeLocalHhmm, sponsorRepeatRule);
    return `Next scheduled call: ${result.nextAt.toLocaleString()} • Due today: ${
      result.dueToday ? "Yes" : "No"
    }`;
  }, [callTimeLocalHhmm, sponsorActive, sponsorRepeatRule]);

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

      const payload = (await response.json()) as { sponsorConfig?: SponsorConfigPayload | null };
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
      setSponsorRepeatRule(config.repeatRule);
      setSponsorActive(config.active);
      setSponsorStatusMessage(
        `Loaded sponsor config (${formatCallTime12Hour(config.callTimeLocalHhmm)}).`,
      );
    } catch {
      setSponsorStatusMessage("Sponsor config load failed: network.");
    }
  }

  function incrementHour(delta: number) {
    setSponsorHour12((previous) => {
      const next = previous + delta;
      if (next < 1) {
        return 12;
      }
      if (next > 12) {
        return 1;
      }
      return next;
    });
  }

  function incrementMinute(delta: number) {
    setSponsorMinute((previous) => {
      const next = previous + delta;
      if (next < 0) {
        return 59;
      }
      if (next > 59) {
        return 0;
      }
      return next;
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

      const nextCall = computeNextCall(new Date(), callTimeLocalHhmm, sponsorRepeatRule).nextAt;
      const eventDetails: CalendarEventInput = {
        title: "Call Sponsor",
        notes: [
          `Sponsor: ${normalizedSponsorName}`,
          `Phone: ${sponsorPhoneE164}`,
          `Repeat: ${sponsorRepeatRule}`,
        ].join("\n"),
        startDate: nextCall,
        endDate: new Date(nextCall.getTime() + 15 * 60 * 1000),
        recurrenceRule: buildCalendarRecurrenceRule(sponsorRepeatRule, calendarModule),
        alarms: [{ relativeOffset: -normalizeAlertLeadMinutes(alertLeadMinutes) }],
      };
      const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (localTimezone) {
        eventDetails.timeZone = localTimezone;
      }

      const asyncStorage = loadAsyncStorageModule();
      const eventStorageKey = sponsorCalendarEventStorageKey(devAuthUserId);
      const storedEventId =
        calendarEventId ??
        (asyncStorage ? await asyncStorage.getItem(eventStorageKey) : null) ??
        null;

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
      setCalendarStatusMessage(
        updatedExistingEvent
          ? "Sponsor calendar event updated."
          : "Sponsor calendar event created.",
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

    const payload: SponsorConfigPayload = {
      sponsorName: normalizedName,
      sponsorPhoneE164: phoneE164,
      callTimeLocalHhmm: to24HourText(sponsorHour12, sponsorMinute, sponsorMeridiem),
      repeatRule: sponsorRepeatRule,
      active: sponsorActive,
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
      setSponsorStatusMessage(
        `Sponsor config saved (${formatCallTime12Hour(payload.callTimeLocalHhmm)} ${payload.repeatRule}).`,
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
    <View style={styles.container}>
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
          value={sponsorPhoneDigits}
          onChangeText={(value) => setSponsorPhoneDigits(normalizePhoneDigits(value))}
          placeholder="Sponsor phone (10 digits)"
          keyboardType="phone-pad"
          maxLength={10}
        />

        <Text style={styles.sponsorLabel}>Call time</Text>
        <View style={styles.pickerRow}>
          <Pressable style={styles.pickerButton} onPress={() => incrementHour(-1)}>
            <Text style={styles.pickerButtonText}>-</Text>
          </Pressable>
          <Text style={styles.pickerValue}>{String(sponsorHour12).padStart(2, "0")}</Text>
          <Pressable style={styles.pickerButton} onPress={() => incrementHour(1)}>
            <Text style={styles.pickerButtonText}>+</Text>
          </Pressable>

          <Text style={styles.pickerDivider}>:</Text>

          <Pressable style={styles.pickerButton} onPress={() => incrementMinute(-1)}>
            <Text style={styles.pickerButtonText}>-</Text>
          </Pressable>
          <Text style={styles.pickerValue}>{String(sponsorMinute).padStart(2, "0")}</Text>
          <Pressable style={styles.pickerButton} onPress={() => incrementMinute(1)}>
            <Text style={styles.pickerButtonText}>+</Text>
          </Pressable>

          <Pressable
            style={styles.pickerMeridiemButton}
            onPress={() => setSponsorMeridiem((value) => (value === "AM" ? "PM" : "AM"))}
          >
            <Text style={styles.pickerMeridiemText}>{sponsorMeridiem}</Text>
          </Pressable>
        </View>

        <Text style={styles.sponsorLabel}>Repeat</Text>
        <View style={styles.repeatRow}>
          {SPONSOR_REPEAT_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.repeatChip,
                sponsorRepeatRule === option.value ? styles.repeatChipSelected : null,
              ]}
              onPress={() => setSponsorRepeatRule(option.value)}
            >
              <Text
                style={[
                  styles.repeatChipText,
                  sponsorRepeatRule === option.value ? styles.repeatChipTextSelected : null,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

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
                {minutes}m
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
      </View>

      <FlatList
        style={styles.list}
        data={meetings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.itemTitle}>{item.name}</Text>
            <Text style={styles.itemAddress}>{item.address}</Text>
            <Button title="Check In" onPress={() => void handleCheckIn(item.id)} />
          </View>
        )}
        ListEmptyComponent={!loadingMeetings ? <Text>No meetings found.</Text> : null}
      />
      <View style={styles.checkoutBox}>
        <Text>Last attendance: {lastAttendanceId ?? "None"}</Text>
        <Text>Last status: {lastAttendanceStatus ?? "N/A"}</Text>
        <Button title="Check Out Last Attendance" onPress={() => void handleCheckOut()} />
      </View>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 64,
    paddingHorizontal: 16,
    backgroundColor: "#f4f7fb",
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
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  pickerButton: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#f8fafc",
  },
  pickerButtonText: {
    fontWeight: "700",
  },
  pickerValue: {
    minWidth: 24,
    textAlign: "center",
    fontWeight: "600",
  },
  pickerDivider: {
    fontWeight: "700",
  },
  pickerMeridiemButton: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#f8fafc",
  },
  pickerMeridiemText: {
    fontWeight: "600",
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
  },
});
