import type { MeetingGeoStatus } from "./meeting-geo";

export type MeetingGuideFeedConfig = {
  name: string;
  url: string;
  tenantId?: string;
  entity?: string;
  entityUrl?: string;
};

export type NormalizedMeetingGuideMeeting = {
  slug: string;
  name: string;
  day: number | null;
  time: string | null;
  endTime: string | null;
  timezone: string | null;
  formattedAddress: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  region: string | null;
  location: string | null;
  notes: string | null;
  types: string[];
  conferenceUrl: string | null;
  conferencePhone: string | null;
  lat: number | null;
  lng: number | null;
  geoStatus?: MeetingGeoStatus;
  geoReason?: string | null;
  geoUpdatedAt?: string | null;
  updatedAtSource: string | null;
};

export type NearbyMeetingQuery = {
  lat: number;
  lng: number;
  radiusMiles: number;
};

export const EARTH_RADIUS_METERS = 6371000;
const MILES_TO_METERS = 1609.344;

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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

function normalizeDay(value: unknown): number | null {
  const day = asNumber(value);
  if (day === null) {
    return null;
  }
  if (day >= 0 && day <= 6) {
    return day;
  }
  if (day >= 1 && day <= 7) {
    return day % 7;
  }
  return null;
}

function normalizeTime(value: unknown): string | null {
  const text = asString(value);
  if (!text) {
    return null;
  }
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeTypes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim().toUpperCase();
      }
      const objectEntry = asObject(entry);
      return asString(objectEntry?.code)?.toUpperCase() ?? null;
    })
    .filter((entry): entry is string => Boolean(entry));
}

export function parseMeetingGuideFeedsJson(value: string): MeetingGuideFeedConfig[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => asObject(entry))
      .filter((entry): entry is Record<string, unknown> => entry !== null)
      .map((entry) => ({
        name: asString(entry.name) ?? "Meeting Guide Feed",
        url: asString(entry.url) ?? "",
        tenantId: asString(entry.tenantId) ?? undefined,
        entity: asString(entry.entity) ?? undefined,
        entityUrl: asString(entry.entityUrl) ?? undefined,
      }))
      .filter((entry) => entry.url.length > 0);
  } catch {
    return [];
  }
}

export function normalizeMeetingGuideMeeting(value: unknown): NormalizedMeetingGuideMeeting | null {
  const input = asObject(value);
  if (!input) {
    return null;
  }

  const slug = asString(input.slug);
  const name = asString(input.name);
  if (!slug || !name) {
    return null;
  }

  const lat = asNumber(input.latitude ?? input.lat);
  const lng = asNumber(input.longitude ?? input.lng);

  return {
    slug,
    name,
    day: normalizeDay(input.day ?? input.weekday_tinyint),
    time: normalizeTime(input.time ?? input.start_time),
    endTime: normalizeTime(input.end_time),
    timezone: asString(input.timezone),
    formattedAddress: asString(input.formatted_address),
    address: asString(input.address),
    city: asString(input.city),
    state: asString(input.state),
    postalCode: asString(input.postal_code),
    country: asString(input.country),
    region: asString(input.region),
    location: asString(input.location),
    notes: asString(input.notes),
    types: normalizeTypes(input.types),
    conferenceUrl: asString(input.conference_url),
    conferencePhone: asString(input.conference_phone),
    lat,
    lng,
    updatedAtSource: asString(input.updated),
  };
}

export function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineDistanceMeters(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): number {
  const latDelta = toRadians(toLat - fromLat);
  const lngDelta = toRadians(toLng - fromLng);
  const leftLat = toRadians(fromLat);
  const rightLat = toRadians(toLat);

  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export function boundingBoxForRadius(query: NearbyMeetingQuery) {
  const radiusMeters = Math.max(0, query.radiusMiles) * MILES_TO_METERS;
  const latRadius = radiusMeters / 111_320;
  const cosValue = Math.max(0.0001, Math.cos(toRadians(query.lat)));
  const lngRadius = radiusMeters / (111_320 * cosValue);
  return {
    latMin: query.lat - latRadius,
    latMax: query.lat + latRadius,
    lngMin: query.lng - lngRadius,
    lngMax: query.lng + lngRadius,
  };
}

export function inferMeetingFormat(value: {
  conferenceUrl: string | null;
  lat: number | null;
  lng: number | null;
  formattedAddress: string | null;
}): "IN_PERSON" | "ONLINE" | "HYBRID" {
  const hasOnline = Boolean(value.conferenceUrl);
  const hasCoords = value.lat !== null && value.lng !== null;
  const addressIsOnline = (value.formattedAddress ?? "").toLowerCase() === "online";

  if (hasOnline && (hasCoords || !addressIsOnline)) {
    return hasCoords ? "HYBRID" : "ONLINE";
  }
  if (hasOnline && !hasCoords) {
    return "ONLINE";
  }
  return "IN_PERSON";
}

function normalizeDedupeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStreetAddressForDedupe(value: string | null): string {
  const text = asString(value);
  if (!text) {
    return "";
  }
  const beforeComma = text.split(",")[0]?.trim() ?? text;
  return normalizeDedupeText(beforeComma);
}

export function buildMeetingDedupeKey(value: {
  name: string;
  day: number | null;
  time: string | null;
  formattedAddress: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
}): string {
  const day = value.day ?? -1;
  const time = value.time ?? "unknown";
  const name = normalizeDedupeText(value.name);
  const addressKey = normalizeStreetAddressForDedupe(value.formattedAddress ?? value.address);

  if (addressKey.length > 0) {
    return `${day}|${time}|${name}|addr:${addressKey}`;
  }

  if (value.lat !== null && value.lng !== null) {
    return `${day}|${time}|${name}|geo:${value.lat.toFixed(3)}|${value.lng.toFixed(3)}`;
  }

  return `${day}|${time}|${name}|unknown`;
}

let cachedTypeLabels: Record<string, string> | null = null;

export function mapTypeCodesToLabels(typeCodes: string[]): string[] {
  if (!cachedTypeLabels) {
    cachedTypeLabels = {};
    try {
      // Optional dependency at runtime; fall back to raw type codes when unavailable.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const specModule = require("@code4recovery/spec") as {
        getTypesForLanguage?: (language: string) => Array<{ code?: string; name?: string }>;
      };
      const entries = specModule.getTypesForLanguage?.("en") ?? [];
      for (const entry of entries) {
        const code = asString(entry.code)?.toUpperCase();
        const name = asString(entry.name);
        if (code && name) {
          cachedTypeLabels[code] = name;
        }
      }
    } catch {
      cachedTypeLabels = {};
    }
  }

  return typeCodes.map((code) => cachedTypeLabels?.[code] ?? code);
}
