import { haversineDistanceMeters } from "./distance";
import type { MeetingRecord } from "./source";

const DEFAULT_MEETING_DURATION_MINUTES = 60;

export type HomeGroupWeekOption = {
  key: string;
  name: string;
  meetings: MeetingRecord[];
  occurrenceCount: number;
  nextMeeting: MeetingRecord | null;
  distanceMeters: number | null;
  areaSummary: string;
  formatSummary: string;
};

type LocationLike = {
  lat: number;
  lng: number;
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAddress(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "address unavailable") {
    return "";
  }
  if (trimmed.toLowerCase() === "online") {
    return "online";
  }
  const segments = trimmed
    .split(",")
    .map((segment) => normalizeText(segment))
    .filter((segment) => segment.length > 0);
  return segments.slice(0, 2).join("|");
}

function normalizeOnlineHost(url: string | null): string {
  if (!url) {
    return "";
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return normalizeText(url);
  }
}

export function buildHomeGroupSeriesKey(meeting: MeetingRecord): string {
  const nameKey = normalizeText(meeting.name);
  const addressKey = normalizeAddress(meeting.address);
  const onlineHost = normalizeOnlineHost(meeting.onlineUrl);

  if (addressKey && addressKey !== "online") {
    return `${nameKey}|addr:${addressKey}`;
  }

  if (meeting.lat !== null && meeting.lng !== null) {
    return `${nameKey}|geo:${meeting.lat.toFixed(3)}|${meeting.lng.toFixed(3)}`;
  }

  if (onlineHost) {
    return `${nameKey}|online:${onlineHost}`;
  }

  return `${nameKey}|fallback:${meeting.format}`;
}

function minutesFromHhmm(value: string): number {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return 0;
  }
  return hour * 60 + minute;
}

function sortMeetingsByWeekPosition(
  meetings: MeetingRecord[],
  nowDayOfWeek: number,
  nowMinutes: number,
): MeetingRecord[] {
  return [...meetings].sort((left, right) => {
    const leftMinutes = minutesFromHhmm(left.startsAtLocal);
    const rightMinutes = minutesFromHhmm(right.startsAtLocal);

    const leftDayDelta = (left.dayOfWeek - nowDayOfWeek + 7) % 7;
    const rightDayDelta = (right.dayOfWeek - nowDayOfWeek + 7) % 7;

    const leftInProgress =
      leftDayDelta === 0 &&
      nowMinutes >= leftMinutes &&
      nowMinutes < leftMinutes + DEFAULT_MEETING_DURATION_MINUTES;
    const rightInProgress =
      rightDayDelta === 0 &&
      nowMinutes >= rightMinutes &&
      nowMinutes < rightMinutes + DEFAULT_MEETING_DURATION_MINUTES;

    if (leftInProgress !== rightInProgress) {
      return leftInProgress ? -1 : 1;
    }

    const leftEffectiveDay =
      leftDayDelta === 0 && leftMinutes + DEFAULT_MEETING_DURATION_MINUTES <= nowMinutes
        ? 7
        : leftDayDelta;
    const rightEffectiveDay =
      rightDayDelta === 0 && rightMinutes + DEFAULT_MEETING_DURATION_MINUTES <= nowMinutes
        ? 7
        : rightDayDelta;

    if (leftEffectiveDay !== rightEffectiveDay) {
      return leftEffectiveDay - rightEffectiveDay;
    }

    if (leftMinutes !== rightMinutes) {
      return leftMinutes - rightMinutes;
    }

    return left.name.localeCompare(right.name);
  });
}

function formatAreaSummary(meetings: MeetingRecord[]): string {
  const firstPhysicalMeeting = meetings.find(
    (meeting) => meeting.address.trim().toLowerCase() !== "online",
  );
  if (!firstPhysicalMeeting) {
    return "Online";
  }

  const segments = firstPhysicalMeeting.address
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return firstPhysicalMeeting.address;
  }

  return segments.slice(0, 2).join(", ");
}

function formatMeetingStyleSummary(meetings: MeetingRecord[]): string {
  const formats = new Set(meetings.map((meeting) => meeting.format));
  if (formats.has("HYBRID")) {
    return "Hybrid";
  }
  if (formats.has("ONLINE") && formats.has("IN_PERSON")) {
    return "In-person / Online";
  }
  if (formats.has("ONLINE")) {
    return "Online";
  }
  return "In-person";
}

function findNearestDistanceMeters(
  meetings: MeetingRecord[],
  currentLocation: LocationLike | null,
): number | null {
  if (!currentLocation) {
    return null;
  }

  let bestDistance: number | null = null;
  for (const meeting of meetings) {
    if (meeting.lat === null || meeting.lng === null) {
      continue;
    }
    const distanceMeters = haversineDistanceMeters(currentLocation, {
      lat: meeting.lat,
      lng: meeting.lng,
    });
    if (bestDistance === null || distanceMeters < bestDistance) {
      bestDistance = distanceMeters;
    }
  }
  return bestDistance;
}

export function buildHomeGroupWeekOptions(params: {
  meetings: MeetingRecord[];
  now: Date;
  currentLocation: LocationLike | null;
}): HomeGroupWeekOption[] {
  const groups = new Map<string, MeetingRecord[]>();

  for (const meeting of params.meetings) {
    const key = buildHomeGroupSeriesKey(meeting);
    const current = groups.get(key);
    if (current) {
      current.push(meeting);
      continue;
    }
    groups.set(key, [meeting]);
  }

  const nowDayOfWeek = params.now.getDay();
  const nowMinutes = params.now.getHours() * 60 + params.now.getMinutes();

  return Array.from(groups.entries())
    .map(([key, meetings]) => {
      const sortedMeetings = sortMeetingsByWeekPosition(meetings, nowDayOfWeek, nowMinutes);
      return {
        key,
        name: sortedMeetings[0]?.name ?? "Recovery Group",
        meetings: sortedMeetings,
        occurrenceCount: sortedMeetings.length,
        nextMeeting: sortedMeetings[0] ?? null,
        distanceMeters: findNearestDistanceMeters(sortedMeetings, params.currentLocation),
        areaSummary: formatAreaSummary(sortedMeetings),
        formatSummary: formatMeetingStyleSummary(sortedMeetings),
      };
    })
    .sort((left, right) => {
      const leftDistance = left.distanceMeters ?? Number.POSITIVE_INFINITY;
      const rightDistance = right.distanceMeters ?? Number.POSITIVE_INFINITY;
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }

      const leftNext = left.nextMeeting;
      const rightNext = right.nextMeeting;
      if (leftNext && rightNext) {
        const leftDayDelta = (leftNext.dayOfWeek - nowDayOfWeek + 7) % 7;
        const rightDayDelta = (rightNext.dayOfWeek - nowDayOfWeek + 7) % 7;
        if (leftDayDelta !== rightDayDelta) {
          return leftDayDelta - rightDayDelta;
        }

        const leftMinutes = minutesFromHhmm(leftNext.startsAtLocal);
        const rightMinutes = minutesFromHhmm(rightNext.startsAtLocal);
        if (leftMinutes !== rightMinutes) {
          return leftMinutes - rightMinutes;
        }
      }

      if (left.occurrenceCount !== right.occurrenceCount) {
        return right.occurrenceCount - left.occurrenceCount;
      }

      return left.name.localeCompare(right.name);
    });
}
