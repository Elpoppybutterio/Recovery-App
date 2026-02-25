export type MeetingFormat = "IN_PERSON" | "ONLINE" | "HYBRID";
export type MeetingOpenness = "OPEN" | "CLOSED" | "UNKNOWN";

export type MeetingRecord = {
  id: string;
  name: string;
  address: string;
  startsAtLocal: string;
  dayOfWeek: number;
  format: MeetingFormat;
  openness: MeetingOpenness;
  lat: number | null;
  lng: number | null;
  onlineUrl: string | null;
};

export type ListMeetingsParams = {
  dayOfWeek: number;
  lat?: number;
  lng?: number;
  radiusMiles?: number;
};

export type ListMeetingsResult = {
  meetings: MeetingRecord[];
  source: "feed" | "api";
  warning?: string;
};

export type MeetingsSource = {
  listMeetings(params: ListMeetingsParams): Promise<ListMeetingsResult>;
};

type SourceConfig = {
  feedUrl?: string;
  apiUrl: string;
  authHeader: string;
  radiusMiles?: number;
};

const DAY_NAME_MAP: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeDayOfWeek(value: unknown, fallbackDay: number): number {
  const dayNumber = asNumber(value);
  if (dayNumber !== null) {
    if (dayNumber >= 0 && dayNumber <= 6) {
      return dayNumber;
    }
    if (dayNumber >= 1 && dayNumber <= 7) {
      return dayNumber % 7;
    }
  }

  const text = asString(value);
  if (!text) {
    return fallbackDay;
  }

  const compact = text.slice(0, 3).toUpperCase();
  if (compact in DAY_NAME_MAP) {
    return DAY_NAME_MAP[compact];
  }

  return fallbackDay;
}

function toHhmm(value: unknown, fallback = "19:00"): string {
  const text = asString(value);
  if (!text) {
    return fallback;
  }

  const hhmm = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (hhmm) {
    const hour = Number(hhmm[1]);
    const minute = Number(hhmm[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  const amPm = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (amPm) {
    const rawHour = Number(amPm[1]);
    const minute = Number(amPm[2]);
    const meridiem = amPm[3].toUpperCase();
    if (rawHour >= 1 && rawHour <= 12 && minute >= 0 && minute <= 59) {
      let hour = rawHour % 12;
      if (meridiem === "PM") {
        hour += 12;
      }
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  return fallback;
}

function hashStableId(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }
  return `feed-${Math.abs(hash)}`;
}

function normalizeDedupeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAddressForDedupe(address: string): string {
  const normalized = asString(address);
  if (!normalized || normalized.toLowerCase() === "address unavailable") {
    return "";
  }
  const beforeComma = normalized.split(",")[0]?.trim() ?? normalized;
  return normalizeDedupeText(beforeComma);
}

function buildMeetingDedupeKey(meeting: MeetingRecord): string {
  const name = normalizeDedupeText(meeting.name);
  const addressKey = normalizeAddressForDedupe(meeting.address);
  if (addressKey.length > 0) {
    return `${meeting.dayOfWeek}|${meeting.startsAtLocal}|${name}|addr:${addressKey}`;
  }
  if (meeting.lat !== null && meeting.lng !== null) {
    return `${meeting.dayOfWeek}|${meeting.startsAtLocal}|${name}|geo:${meeting.lat.toFixed(3)}|${meeting.lng.toFixed(3)}`;
  }
  return `${meeting.dayOfWeek}|${meeting.startsAtLocal}|${name}|unknown`;
}

function scoreMeetingRecord(meeting: MeetingRecord): number {
  let score = 0;
  if (meeting.lat !== null && meeting.lng !== null) {
    score += 2;
  }
  if (meeting.onlineUrl) {
    score += 1;
  }
  if (meeting.address !== "Address unavailable") {
    score += 1;
  }
  if (meeting.openness !== "UNKNOWN") {
    score += 1;
  }
  if (meeting.format === "HYBRID") {
    score += 1;
  }
  return score;
}

function dedupeMeetings(meetings: MeetingRecord[]): MeetingRecord[] {
  const dedupedByKey = new Map<string, MeetingRecord>();
  for (const meeting of meetings) {
    const dedupeKey = buildMeetingDedupeKey(meeting);
    const existing = dedupedByKey.get(dedupeKey);
    if (!existing) {
      dedupedByKey.set(dedupeKey, meeting);
      continue;
    }

    const existingScore = scoreMeetingRecord(existing);
    const candidateScore = scoreMeetingRecord(meeting);
    if (candidateScore > existingScore) {
      dedupedByKey.set(dedupeKey, meeting);
    }
  }
  return Array.from(dedupedByKey.values());
}

function normalizeOpenness(value: unknown, types: unknown): MeetingOpenness {
  const direct = asString(value)?.toUpperCase();
  if (direct?.includes("OPEN")) {
    return "OPEN";
  }
  if (direct?.includes("CLOSED")) {
    return "CLOSED";
  }

  const typeList = Array.isArray(types) ? types : [];
  const hasClosed = typeList.some((entry) => {
    const item = asObject(entry);
    const code = asString(item?.code) ?? asString(entry);
    return code?.toUpperCase() === "C";
  });
  if (hasClosed) {
    return "CLOSED";
  }

  const hasOpen = typeList.some((entry) => {
    const item = asObject(entry);
    const code = asString(item?.code) ?? asString(entry);
    return code?.toUpperCase() === "O";
  });
  if (hasOpen) {
    return "OPEN";
  }

  return "UNKNOWN";
}

function normalizeMeetingFormat(
  onlineUrl: string | null,
  lat: number | null,
  lng: number | null,
  address: string,
): MeetingFormat {
  const hasOnline = Boolean(onlineUrl);
  const hasPhysicalLocation = lat !== null && lng !== null && address.toLowerCase() !== "online";

  if (hasOnline && hasPhysicalLocation) {
    return "HYBRID";
  }
  if (hasOnline && !hasPhysicalLocation) {
    return "ONLINE";
  }
  return "IN_PERSON";
}

function normalizeFeedMeeting(value: unknown, fallbackDay: number): MeetingRecord | null {
  const input = asObject(value);
  if (!input) {
    return null;
  }

  const name =
    asString(input.name) ??
    asString(input.meeting_name) ??
    asString(input.group) ??
    "Recovery Meeting";
  const startsAtLocal = toHhmm(
    input.startsAtLocal ?? input.start_time ?? input.time ?? input.formatted_time,
  );

  const lat = asNumber(input.lat ?? input.latitude);
  const lng = asNumber(input.lng ?? input.longitude);
  const onlineUrl =
    asString(input.onlineUrl) ??
    asString(input.virtual_meeting_link) ??
    asString(input.url) ??
    asString(input.meeting_url);

  const address =
    asString(input.address) ??
    asString(input.formatted_address) ??
    asString(input.location_text) ??
    (onlineUrl ? "Online" : "Address unavailable");

  const dayOfWeek = normalizeDayOfWeek(
    input.dayOfWeek ?? input.day ?? input.weekday_tinyint,
    fallbackDay,
  );

  const openness = normalizeOpenness(input.openness ?? input.type, input.types);
  const format = normalizeMeetingFormat(onlineUrl, lat, lng, address);

  const idSeed =
    asString(input.id) ??
    `${name}|${startsAtLocal}|${dayOfWeek}|${address}|${lat ?? ""}|${lng ?? ""}|${onlineUrl ?? ""}`;

  return {
    id: asString(input.id) ?? hashStableId(idSeed),
    name,
    address,
    startsAtLocal,
    dayOfWeek,
    format,
    openness,
    lat,
    lng,
    onlineUrl,
  };
}

function normalizeApiMeeting(value: unknown, fallbackDayOfWeek: number): MeetingRecord | null {
  const input = asObject(value);
  if (!input) {
    return null;
  }

  const id = asString(input.id);
  const name = asString(input.name);
  if (!id || !name) {
    return null;
  }

  const address = asString(input.address) ?? "Address unavailable";
  const lat = asNumber(input.lat ?? input.latitude);
  const lng = asNumber(input.lng ?? input.longitude);
  const onlineUrl = asString(input.onlineUrl);
  const format = normalizeMeetingFormat(onlineUrl, lat, lng, address);
  const openness = normalizeOpenness(input.openness, input.types);

  return {
    id,
    name,
    address,
    startsAtLocal: toHhmm(input.startsAtLocal ?? input.startTimeLocal, "19:00"),
    dayOfWeek: normalizeDayOfWeek(input.dayOfWeek ?? input.day, fallbackDayOfWeek),
    format,
    openness,
    lat,
    lng,
    onlineUrl,
  };
}

function extractFeedMeetings(rawPayload: unknown, fallbackDay: number): MeetingRecord[] {
  const payload = asObject(rawPayload);
  const sourceList = Array.isArray(rawPayload)
    ? rawPayload
    : Array.isArray(payload?.meetings)
      ? payload.meetings
      : Array.isArray(payload?.items)
        ? payload.items
        : [];

  return sourceList
    .map((entry) => normalizeFeedMeeting(entry, fallbackDay))
    .filter((entry): entry is MeetingRecord => entry !== null);
}

export function createMeetingsSource(config: SourceConfig): MeetingsSource {
  const normalizedFeedUrl = config.feedUrl?.trim();

  return {
    async listMeetings(params: ListMeetingsParams): Promise<ListMeetingsResult> {
      let warning: string | undefined;

      if (normalizedFeedUrl) {
        try {
          const response = await fetch(normalizedFeedUrl);
          if (!response.ok) {
            warning = `Meeting feed failed (${response.status})`;
          } else {
            const payload = (await response.json()) as unknown;
            const meetings = dedupeMeetings(extractFeedMeetings(payload, params.dayOfWeek));
            if (meetings.length > 0) {
              return { meetings, source: "feed" };
            }
            warning = "Meeting feed returned no usable meetings";
          }
        } catch {
          warning = "Meeting feed unavailable";
        }
      }

      const headers = {
        Authorization: config.authHeader,
      };
      const meetingsQuery = new URLSearchParams();
      meetingsQuery.set("day", String(params.dayOfWeek));

      let nearbyMeetings: MeetingRecord[] = [];
      let meetings: MeetingRecord[] = [];
      let apiWarning: string | undefined;
      const hasLocation = typeof params.lat === "number" && typeof params.lng === "number";

      if (hasLocation) {
        const nearbyQuery = new URLSearchParams();
        nearbyQuery.set("lat", String(params.lat));
        nearbyQuery.set("lng", String(params.lng));
        nearbyQuery.set("dayOfWeek", String(params.dayOfWeek));
        nearbyQuery.set("radiusMiles", String(params.radiusMiles ?? config.radiusMiles ?? 20));
        nearbyQuery.set("when", "all");

        const nearbyUrl = `${config.apiUrl}/v1/meetings/nearby?${nearbyQuery.toString()}`;
        if (__DEV__) {
          console.log("[meetings] nearby request", {
            url: nearbyUrl,
            lat: params.lat,
            lng: params.lng,
            radiusMiles: params.radiusMiles ?? config.radiusMiles ?? 20,
          });
        }

        try {
          const nearbyResponse = await fetch(nearbyUrl, { headers });

          if (nearbyResponse.ok) {
            const nearbyPayload = (await nearbyResponse.json()) as { meetings?: unknown[] };
            nearbyMeetings = dedupeMeetings(
              (nearbyPayload.meetings ?? [])
                .map((entry) => normalizeApiMeeting(entry, params.dayOfWeek))
                .filter((entry): entry is MeetingRecord => entry !== null),
            );
          } else {
            apiWarning = `Nearby meetings unavailable (${nearbyResponse.status}); falling back to tenant meetings`;
            if (__DEV__) {
              console.log("[meetings] nearby fallback", {
                status: nearbyResponse.status,
                reason: "non-ok response",
              });
            }
          }
        } catch (error) {
          apiWarning = "Nearby meetings unavailable; falling back to tenant meetings";
          if (__DEV__) {
            console.log("[meetings] nearby fallback", {
              reason: "request failed",
              error: error instanceof Error ? error.message : "unknown",
            });
          }
        }
      }

      const url = `${config.apiUrl}/v1/meetings${meetingsQuery.size > 0 ? `?${meetingsQuery.toString()}` : ""}`;
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`Meetings API failed (${response.status})`);
      }

      const payload = (await response.json()) as { meetings?: unknown[] };
      const allMeetingsForDay = dedupeMeetings(
        (payload.meetings ?? [])
          .map((entry) => normalizeApiMeeting(entry, params.dayOfWeek))
          .filter((entry): entry is MeetingRecord => entry !== null),
      );

      meetings = hasLocation
        ? dedupeMeetings([...nearbyMeetings, ...allMeetingsForDay])
        : allMeetingsForDay;

      return {
        meetings,
        source: "api",
        warning: warning ?? apiWarning,
      };
    },
  };
}
