import {
  classifyGeo,
  distanceMiles,
  isTrustedGeoStatus,
  type MeetingGeoSource,
  type MeetingGeoStatus,
} from "../geo/geoTrust";

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
  geoStatus?: MeetingGeoStatus;
  geoSource?: MeetingGeoSource;
  geoReason?: string | null;
  geoUpdatedAt?: string | null;
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

export type MeetingsApiHealthEvent = {
  endpointPath: string;
  method: "GET";
  statusCode: number | null;
  errorMessage: string | null;
  errorBodySnippet: string | null;
  timestampIso: string;
  source: "feed" | "nearby" | "meetings";
};

type SourceConfig = {
  feedUrl?: string;
  apiUrl: string;
  fallbackApiUrls?: string[];
  authHeader: string;
  radiusMiles?: number;
  onApiEvent?: (event: MeetingsApiHealthEvent) => void;
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

function normalizeGeoStatus(value: unknown): MeetingGeoStatus | null {
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

function normalizeGeoSource(value: unknown): MeetingGeoSource | null {
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
  const geo = classifyGeo({ lat: rawLat, lng: rawLng, address });
  const lat = isTrustedGeoStatus(geo.geoStatus) ? geo.lat : null;
  const lng = isTrustedGeoStatus(geo.geoStatus) ? geo.lng : null;

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
    geoStatus: geo.geoStatus,
    geoSource: "feed",
    geoReason: geo.geoReason,
    geoUpdatedAt: null,
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
  const geo = classifyGeo({ lat: rawLat, lng: rawLng, address });
  const normalizedIncomingGeoStatus = normalizeGeoStatus(input.geoStatus ?? input.geo_status);
  const incomingGeoReason = asString(input.geoReason ?? input.geo_reason);
  const geoStatus: MeetingGeoStatus =
    normalizedIncomingGeoStatus === "missing" || normalizedIncomingGeoStatus === "suspect"
      ? normalizedIncomingGeoStatus
      : geo.geoStatus;
  const lat = isTrustedGeoStatus(geoStatus) ? geo.lat : null;
  const lng = isTrustedGeoStatus(geoStatus) ? geo.lng : null;
  const onlineUrl = asString(input.onlineUrl);
  const distanceMeters =
    asNumber(input.distanceMeters ?? input.distance_meters) ??
    (() => {
      const miles = asNumber(input.distanceMiles ?? input.distance_miles);
      return miles === null ? null : miles * 1609.344;
    })();
  const format = normalizeMeetingFormat(onlineUrl, lat, lng, address);
  const openness = normalizeOpenness(input.openness, input.types);
  const geoReason = incomingGeoReason ?? geo.geoReason;
  const geoUpdatedAt = asString(input.geoUpdatedAt ?? input.geo_updated_at);
  const geoSource =
    normalizeGeoSource(input.geoSource ?? input.geo_source) ??
    (isTrustedGeoStatus(geoStatus) ? "api" : "unknown");

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
    geoSource,
    geoReason,
    geoUpdatedAt,
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

function endpointPathFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function resolveUserRegionHint(lat: number, lng: number): string | null {
  const inMontanaBounds = lat >= 44 && lat <= 49.5 && lng >= -116 && lng <= -104;
  return inMontanaBounds ? "MT" : null;
}

function normalizeMeetingsForLocationContext(
  meetings: MeetingRecord[],
  context: { lat: number; lng: number; radiusMiles: number },
): MeetingRecord[] {
  const userRegionHint = resolveUserRegionHint(context.lat, context.lng);
  const radiusMiles = Math.max(1, context.radiusMiles);

  const normalized: MeetingRecord[] = meetings.map((meeting) => {
    const meetingStatus = normalizeGeoStatus(meeting.geoStatus) ?? "missing";

    if (!isTrustedGeoStatus(meetingStatus)) {
      return {
        ...meeting,
        geoStatus: meetingStatus,
        distanceMeters: null,
      };
    }
    if (meeting.lat === null || meeting.lng === null) {
      return {
        ...meeting,
        geoStatus: "missing",
        geoReason: "missing_coordinates",
        distanceMeters: null,
      };
    }

    const miles = distanceMiles(
      { lat: context.lat, lng: context.lng },
      { lat: meeting.lat, lng: meeting.lng },
    );
    const geoTrust = classifyGeo({
      lat: meeting.lat,
      lng: meeting.lng,
      address: meeting.address,
      userRegionHint,
      distanceFromUserMiles: miles,
    });

    if (!isTrustedGeoStatus(geoTrust.geoStatus) || geoTrust.lat === null || geoTrust.lng === null) {
      return {
        ...meeting,
        lat: null,
        lng: null,
        geoStatus: geoTrust.geoStatus as MeetingGeoStatus,
        geoReason: geoTrust.geoReason,
        distanceMeters: null,
      };
    }

    return {
      ...meeting,
      lat: geoTrust.lat,
      lng: geoTrust.lng,
      geoStatus: geoTrust.geoStatus as MeetingGeoStatus,
      geoReason: geoTrust.geoReason,
      distanceMeters: miles * 1609.344,
    };
  });

  const nearbyTrusted = normalized.filter((meeting) => {
    const status = normalizeGeoStatus(meeting.geoStatus) ?? "missing";
    if (!isTrustedGeoStatus(status) || meeting.lat === null || meeting.lng === null) {
      return false;
    }
    const miles = distanceMiles(
      { lat: context.lat, lng: context.lng },
      { lat: meeting.lat, lng: meeting.lng },
    );
    return miles <= radiusMiles;
  });

  const unresolved = normalized.filter((meeting) => {
    const status = normalizeGeoStatus(meeting.geoStatus) ?? "missing";
    return status === "missing" || status === "suspect";
  });

  return dedupeMeetings([...nearbyTrusted, ...unresolved]);
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
      const emitApiEvent = (event: Omit<MeetingsApiHealthEvent, "timestampIso" | "method">) => {
        config.onApiEvent?.({
          method: "GET",
          timestampIso: new Date().toISOString(),
          ...event,
        });
      };

      if (normalizedFeedUrl) {
        try {
          const response = await fetch(normalizedFeedUrl);
          if (!response.ok) {
            let errorBodySnippet: string | null = null;
            try {
              const text = await response.text();
              errorBodySnippet = text.slice(0, 500);
            } catch {
              errorBodySnippet = null;
            }
            emitApiEvent({
              endpointPath: endpointPathFromUrl(normalizedFeedUrl),
              statusCode: response.status,
              errorMessage: `Meeting feed failed (${response.status})`,
              errorBodySnippet,
              source: "feed",
            });
            warning = `Meeting feed failed (${response.status})`;
          } else {
            emitApiEvent({
              endpointPath: endpointPathFromUrl(normalizedFeedUrl),
              statusCode: response.status,
              errorMessage: null,
              errorBodySnippet: null,
              source: "feed",
            });
            const payload = (await response.json()) as unknown;
            const meetings = dedupeMeetings(extractFeedMeetings(payload, params.dayOfWeek));
            if (meetings.length > 0) {
              return { meetings, source: "feed" };
            }
            warning = "Meeting feed returned no usable meetings";
          }
        } catch {
          emitApiEvent({
            endpointPath: endpointPathFromUrl(normalizedFeedUrl),
            statusCode: null,
            errorMessage: "Meeting feed unavailable",
            errorBodySnippet: null,
            source: "feed",
          });
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
          nearbyQuery.set("radiusMiles", String(params.radiusMiles ?? config.radiusMiles ?? 50));
          nearbyQuery.set("when", "all");

          const nearbyUrl = `${apiBaseUrl}/v1/meetings/nearby?${nearbyQuery.toString()}`;
          if (__DEV__) {
            console.log("[meetings] nearby request", {
              url: nearbyUrl,
              lat: params.lat,
              lng: params.lng,
              radiusMiles: params.radiusMiles ?? config.radiusMiles ?? 50,
            });
          }

          try {
            const nearbyResponse = await fetch(nearbyUrl, { headers });
            if (nearbyResponse.ok) {
              emitApiEvent({
                endpointPath: endpointPathFromUrl(nearbyUrl),
                statusCode: nearbyResponse.status,
                errorMessage: null,
                errorBodySnippet: null,
                source: "nearby",
              });
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
              let errorBodySnippet: string | null = null;
              try {
                const text = await nearbyResponse.text();
                errorBodySnippet = text.slice(0, 500);
              } catch {
                errorBodySnippet = null;
              }
              emitApiEvent({
                endpointPath: endpointPathFromUrl(nearbyUrl),
                statusCode: nearbyResponse.status,
                errorMessage: `Nearby meetings unavailable (${nearbyResponse.status})`,
                errorBodySnippet,
                source: "nearby",
              });
              apiWarning = `Nearby meetings unavailable (${nearbyResponse.status}); falling back to tenant meetings`;
            }
          } catch (error) {
            apiWarning = "Nearby meetings unavailable; falling back to tenant meetings";
            emitApiEvent({
              endpointPath: endpointPathFromUrl(nearbyUrl),
              statusCode: null,
              errorMessage:
                error instanceof Error && error.message
                  ? error.message
                  : "Nearby meetings request failed",
              errorBodySnippet: null,
              source: "nearby",
            });
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
            let errorBodySnippet: string | null = null;
            try {
              const text = await response.text();
              errorBodySnippet = text.slice(0, 500);
            } catch {
              errorBodySnippet = null;
            }
            emitApiEvent({
              endpointPath: endpointPathFromUrl(url),
              statusCode: response.status,
              errorMessage: `Meetings endpoint failed (${response.status})`,
              errorBodySnippet,
              source: "meetings",
            });
            failures.push(`${apiBaseUrl}: ${response.status}`);
            continue;
          }
          emitApiEvent({
            endpointPath: endpointPathFromUrl(url),
            statusCode: response.status,
            errorMessage: null,
            errorBodySnippet: null,
            source: "meetings",
          });

          const payload = asObject((await response.json()) as unknown);
          const meetingsRaw = Array.isArray(payload?.meetings) ? payload.meetings : [];
          const allMeetingsForDay = dedupeMeetings(
            meetingsRaw
              .map((entry) => normalizeApiMeeting(entry, params.dayOfWeek))
              .filter((entry): entry is MeetingRecord => entry !== null),
          );

          const meetings = hasLocation
            ? normalizeMeetingsForLocationContext(
                dedupeMeetings([...nearbyMeetings, ...allMeetingsForDay]),
                {
                  lat: params.lat as number,
                  lng: params.lng as number,
                  radiusMiles: params.radiusMiles ?? config.radiusMiles ?? 50,
                },
              )
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
              (apiBaseUrl !== config.apiUrl
                ? `Meetings loaded from fallback API (${apiBaseUrl}).${apiWarning ? ` ${apiWarning}` : ""}`
                : apiWarning),
          };
        } catch (error) {
          emitApiEvent({
            endpointPath: endpointPathFromUrl(url),
            statusCode: null,
            errorMessage:
              error instanceof Error && error.message ? error.message : "Meetings request failed",
            errorBodySnippet: null,
            source: "meetings",
          });
          failures.push(
            `${apiBaseUrl}: ${error instanceof Error && error.message ? error.message : "request_failed"}`,
          );
        }
      }

      const failureSummary = failures.length > 0 ? ` — ${failures.join(" | ")}` : "";
      throw new Error(`Meetings API failed${failureSummary}`);
    },
  };
}
