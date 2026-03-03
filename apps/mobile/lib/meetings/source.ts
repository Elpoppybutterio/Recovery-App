import { normalizeCoordinates } from "./distance";

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
  distanceMeters?: number | null;
  geoStatus?: "ok" | "missing" | "invalid" | "partial" | "needs_geocode";
  geoReason?: string | null;
  geoUpdatedAt?: string | null;
  geoSource?: string | null;
  geoConfidence?: number | null;
  geocodedAt?: string | null;
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
  fallbackApiUrls?: string[];
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
    const trimmed = value.trim();
    const directional = trimmed.match(/^([+-]?\d+(?:[.,]\d+)?)([NSEW])$/i);
    if (directional) {
      const base = Number(directional[1].replace(",", "."));
      if (Number.isFinite(base)) {
        const suffix = directional[2].toUpperCase();
        if (suffix === "S" || suffix === "W") {
          return -Math.abs(base);
        }
        return Math.abs(base);
      }
    }

    const decimalComma = /^[-+]?\d+,\d+$/.test(trimmed) && !trimmed.includes(".");
    const normalized = decimalComma
      ? trimmed.replace(",", ".")
      : trimmed.replace(/,/g, "").replace(/\s+/g, "");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }

    const firstNumeric = normalized.match(/[-+]?\d+(?:\.\d+)?/);
    if (firstNumeric) {
      const extracted = Number(firstNumeric[0]);
      return Number.isFinite(extracted) ? extracted : null;
    }
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

function normalizeGeoStatus(
  value: unknown,
): "ok" | "missing" | "invalid" | "partial" | "needs_geocode" | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "ok" ||
    normalized === "missing" ||
    normalized === "invalid" ||
    normalized === "partial" ||
    normalized === "needs_geocode"
  ) {
    return normalized;
  }
  return null;
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

  const rawLat = asNumber(input.lat ?? input.latitude);
  const rawLng = asNumber(input.lng ?? input.longitude);
  const coords = normalizeCoordinates({ lat: rawLat, lng: rawLng });
  const lat = coords?.lat ?? null;
  const lng = coords?.lng ?? null;
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
    distanceMeters: null,
    geoStatus:
      lat !== null && lng !== null ? "ok" : lat === null && lng === null ? "missing" : "partial",
    geoReason:
      lat !== null && lng !== null
        ? null
        : lat === null && lng === null
          ? "missing_coordinates"
          : lat === null
            ? "missing_latitude"
            : "missing_longitude",
    geoUpdatedAt: null,
    geoSource: null,
    geoConfidence: null,
    geocodedAt: null,
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
  const rawLat = asNumber(input.lat ?? input.latitude);
  const rawLng = asNumber(input.lng ?? input.longitude);
  const coords = normalizeCoordinates({ lat: rawLat, lng: rawLng });
  const lat = coords?.lat ?? null;
  const lng = coords?.lng ?? null;
  const onlineUrl = asString(input.onlineUrl);
  const distanceMeters =
    asNumber(input.distanceMeters ?? input.distance_meters) ??
    (() => {
      const miles = asNumber(input.distanceMiles ?? input.distance_miles);
      return miles === null ? null : miles * 1609.344;
    })();
  const format = normalizeMeetingFormat(onlineUrl, lat, lng, address);
  const openness = normalizeOpenness(input.openness, input.types);
  const geoStatus =
    normalizeGeoStatus(input.geoStatus ?? input.geo_status) ??
    (lat !== null && lng !== null ? "ok" : lat === null && lng === null ? "missing" : "partial");
  const geoReason = asString(input.geoReason ?? input.geo_reason);
  const geoUpdatedAt = asString(input.geoUpdatedAt ?? input.geo_updated_at);
  const geoSource = asString(input.geoSource ?? input.geo_source);
  const geoConfidence = asNumber(input.geoConfidence ?? input.geo_confidence);
  const geocodedAt = asString(input.geocodedAt ?? input.geocoded_at);

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
    distanceMeters,
    geoStatus,
    geoReason,
    geoUpdatedAt,
    geoSource,
    geoConfidence,
    geocodedAt,
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
  const candidateApiUrls = Array.from(
    new Set(
      [config.apiUrl, ...(config.fallbackApiUrls ?? [])]
        .map((value) => value.trim().replace(/\/+$/, ""))
        .filter((value) => value.length > 0),
    ),
  );

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

      const hasLocation = typeof params.lat === "number" && typeof params.lng === "number";
      const failures: string[] = [];

      for (const apiBaseUrl of candidateApiUrls) {
        let nearbyMeetings: MeetingRecord[] = [];
        let apiWarning: string | undefined;

        if (hasLocation) {
          const nearbyQuery = new URLSearchParams();
          nearbyQuery.set("lat", String(params.lat));
          nearbyQuery.set("lng", String(params.lng));
          nearbyQuery.set("dayOfWeek", String(params.dayOfWeek));
          nearbyQuery.set("radiusMiles", String(params.radiusMiles ?? config.radiusMiles ?? 20));
          nearbyQuery.set("when", "all");

          const nearbyUrl = `${apiBaseUrl}/v1/meetings/nearby?${nearbyQuery.toString()}`;
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
              const nearbyPayload = asObject((await nearbyResponse.json()) as unknown);
              const nearbyMeetingsRaw = Array.isArray(nearbyPayload?.meetings)
                ? nearbyPayload.meetings
                : [];
              nearbyMeetings = dedupeMeetings(
                nearbyMeetingsRaw
                  .map((entry) => normalizeApiMeeting(entry, params.dayOfWeek))
                  .filter((entry): entry is MeetingRecord => entry !== null),
              );
            } else {
              let nearbyErrorSummary = "";
              try {
                const nearbyErrorPayload = asObject((await nearbyResponse.json()) as unknown);
                const code = asString(nearbyErrorPayload?.code);
                const message = asString(nearbyErrorPayload?.message);
                const warning = asString(nearbyErrorPayload?.warning);
                nearbyErrorSummary = [code, message ?? warning]
                  .filter((value): value is string => Boolean(value && value.length > 0))
                  .join(": ");
              } catch {
                nearbyErrorSummary = "";
              }
              apiWarning = `Nearby meetings unavailable (${nearbyResponse.status})${nearbyErrorSummary ? ` - ${nearbyErrorSummary}` : ""}; falling back to tenant meetings`;
            }
          } catch (error) {
            apiWarning = "Nearby meetings unavailable; falling back to tenant meetings";
            if (__DEV__) {
              console.log("[meetings] nearby fallback", {
                apiBaseUrl,
                reason: "request failed",
                error: error instanceof Error ? error.message : "unknown",
              });
            }
          }
        }

        const url = `${apiBaseUrl}/v1/meetings${meetingsQuery.size > 0 ? `?${meetingsQuery.toString()}` : ""}`;
        try {
          const response = await fetch(url, { headers });
          if (!response.ok) {
            let errorSummary = "";
            try {
              const errorPayload = asObject((await response.json()) as unknown);
              const code = asString(errorPayload?.code);
              const message = asString(errorPayload?.message);
              const warning = asString(errorPayload?.warning);
              errorSummary = [code, message ?? warning]
                .filter((value): value is string => Boolean(value && value.length > 0))
                .join(": ");
            } catch {
              errorSummary = "";
            }
            failures.push(
              `${apiBaseUrl}: ${response.status}${errorSummary ? ` (${errorSummary})` : ""}`,
            );
            continue;
          }

          const payload = asObject((await response.json()) as unknown);
          const meetingsRaw = Array.isArray(payload?.meetings) ? payload.meetings : [];
          const apiResponseWarning = asString(payload?.warning);
          const allMeetingsForDay = dedupeMeetings(
            meetingsRaw
              .map((entry) => normalizeApiMeeting(entry, params.dayOfWeek))
              .filter((entry): entry is MeetingRecord => entry !== null),
          );

          const meetings = hasLocation
            ? dedupeMeetings([...nearbyMeetings, ...allMeetingsForDay])
            : allMeetingsForDay;

          if (__DEV__) {
            const missingGeo = meetings
              .filter((meeting) => meeting.lat === null || meeting.lng === null)
              .slice(0, 8)
              .map((meeting) => ({
                id: meeting.id,
                name: meeting.name,
                geoStatus: meeting.geoStatus ?? "missing",
                geoReason: meeting.geoReason ?? "unknown",
              }));
            if (missingGeo.length > 0) {
              console.log("[meetings] location unavailable", {
                count: missingGeo.length,
                sample: missingGeo,
              });
            }
          }

          return {
            meetings,
            source: "api",
            warning:
              warning ??
              apiResponseWarning ??
              (apiBaseUrl !== config.apiUrl
                ? `Meetings loaded from fallback API (${apiBaseUrl}).${apiWarning ? ` ${apiWarning}` : ""}`
                : apiWarning),
          };
        } catch (error) {
          failures.push(
            `${apiBaseUrl}: ${error instanceof Error && error.message ? error.message : "request_failed"}`,
          );
        }
      }

      const failureSummary = failures.length > 0 ? ` — ${failures.join(" | ")}` : "";
      const hardFailureWarning = `Meetings API failed${failureSummary}`;
      if (__DEV__) {
        console.log("[meetings] api failure fallback", { failures });
      }
      return {
        meetings: [],
        source: "api",
        warning: warning ? `${warning}. ${hardFailureWarning}` : hardFailureWarning,
      };
    },
  };
}
