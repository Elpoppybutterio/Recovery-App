export type MeetingGeoStatus = "ok" | "missing" | "invalid" | "partial" | "needs_geocode";

export type MeetingGeoResolution = {
  lat: number | null;
  lng: number | null;
  geoStatus: MeetingGeoStatus;
  geoReason: string | null;
  swapFixed: boolean;
};

type AddressParts = {
  formattedAddress?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

export type GeocodeResult = {
  coords: { lat: number; lng: number } | null;
  reason: string | null;
  source: "osm_nominatim" | null;
  confidence: number | null;
};

const BILLINGS_LAT_MIN = 45.6;
const BILLINGS_LAT_MAX = 45.9;
const BILLINGS_LNG_MIN = -108.7;
const BILLINGS_LNG_MAX = -108.3;
const BILLINGS_CENTER_LAT = 45.7833;
const BILLINGS_CENTER_LNG = -108.5007;
const BILLINGS_FAR_DISTANCE_MILES = 200;
const EARTH_RADIUS_METERS = 6_371_000;

type FetchLikeResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<FetchLikeResponse>;

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeAddressText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeStateCode(value: string | null | undefined): string | null {
  const normalized = normalizeAddressText(value);
  if (!normalized) {
    return null;
  }
  if (normalized.length === 2) {
    return normalized.toUpperCase();
  }
  return normalized;
}

export function normalizeAddressParts<T extends AddressParts>(value: T): T {
  const formattedAddress = normalizeAddressText(value.formattedAddress);
  const address = normalizeAddressText(value.address);
  const city = normalizeAddressText(value.city);
  const state = normalizeStateCode(value.state);
  const postalCode = normalizeAddressText(value.postalCode);
  const country = normalizeAddressText(value.country);

  const fallbackFormatted = [address, city, state, postalCode, country]
    .filter((entry): entry is string => Boolean(entry))
    .join(", ");

  return {
    ...value,
    formattedAddress: formattedAddress ?? (fallbackFormatted.length > 0 ? fallbackFormatted : null),
    address,
    city,
    state,
    postalCode,
    country,
  };
}

function isOnlineAddress(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "online" || normalized === "virtual";
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineDistanceMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);

  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

function inValidBounds(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function isLikelyBillingsAddress(parts: AddressParts): boolean {
  const normalized = normalizeAddressParts(parts);
  const city = normalized.city?.toLowerCase();
  if (city === "billings") {
    return true;
  }

  const state = normalized.state?.toUpperCase();
  const hasMontanaState = state === "MT" || state === "MONTANA";
  const haystack = [
    normalized.formattedAddress,
    normalized.address,
    normalized.city,
    normalized.state,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  if (haystack.includes("billings")) {
    return true;
  }
  return hasMontanaState && /\b591\d{2}\b/.test(haystack);
}

export function isWithinBillingsBounds(lat: number, lng: number): boolean {
  return (
    lat >= BILLINGS_LAT_MIN &&
    lat <= BILLINGS_LAT_MAX &&
    lng >= BILLINGS_LNG_MIN &&
    lng <= BILLINGS_LNG_MAX
  );
}

export function isFarOutsideBillingsRegion(lat: number, lng: number): boolean {
  const miles =
    haversineDistanceMeters({ lat: BILLINGS_CENTER_LAT, lng: BILLINGS_CENTER_LNG }, { lat, lng }) /
    1609.344;
  return miles > BILLINGS_FAR_DISTANCE_MILES;
}

export function buildGeocodeQuery(parts: AddressParts): string | null {
  const normalized = normalizeAddressParts(parts);
  if (isOnlineAddress(normalized.formattedAddress)) {
    return null;
  }

  if (normalized.formattedAddress) {
    return normalized.formattedAddress;
  }

  const segments = [
    normalized.address,
    normalized.city,
    normalized.state,
    normalized.postalCode,
    normalized.country,
  ].filter((entry): entry is string => Boolean(entry));

  if (segments.length === 0) {
    return null;
  }

  return Array.from(new Set(segments)).join(", ");
}

export function resolveMeetingGeoStatus(options: {
  lat: unknown;
  lng: unknown;
  formattedAddress?: string | null;
}): MeetingGeoResolution {
  let lat = asFiniteNumber(options.lat);
  let lng = asFiniteNumber(options.lng);
  const formattedAddress = normalizeAddressText(options.formattedAddress);
  const onlineAddress = isOnlineAddress(formattedAddress);
  const hasAddress = Boolean(formattedAddress) && !onlineAddress;
  let swapFixed = false;

  if (lat === null && lng === null) {
    if (onlineAddress) {
      return {
        lat: null,
        lng: null,
        geoStatus: "missing",
        geoReason: "online_meeting",
        swapFixed: false,
      };
    }
    if (!formattedAddress) {
      return {
        lat: null,
        lng: null,
        geoStatus: "missing",
        geoReason: "missing_address",
        swapFixed: false,
      };
    }
    return {
      lat: null,
      lng: null,
      geoStatus: "needs_geocode",
      geoReason: "missing_coordinates",
      swapFixed: false,
    };
  }

  if (lat === null || lng === null) {
    return {
      lat: null,
      lng: null,
      geoStatus: hasAddress ? "needs_geocode" : "partial",
      geoReason: lat === null ? "missing_latitude" : "missing_longitude",
      swapFixed: false,
    };
  }

  if ((lat < -90 || lat > 90) && Math.abs(lng) <= 90) {
    const swappedLat = lng;
    const swappedLng = lat;
    if (inValidBounds(swappedLat, swappedLng)) {
      lat = swappedLat;
      lng = swappedLng;
      swapFixed = true;
    }
  }

  if (!inValidBounds(lat, lng)) {
    return {
      lat: null,
      lng: null,
      geoStatus: hasAddress ? "needs_geocode" : "invalid",
      geoReason: "coordinate_out_of_range",
      swapFixed,
    };
  }

  if (lat === 0 && lng === 0) {
    return {
      lat: null,
      lng: null,
      geoStatus: hasAddress ? "needs_geocode" : "invalid",
      geoReason: "zero_coordinates",
      swapFixed,
    };
  }

  return {
    lat,
    lng,
    geoStatus: "ok",
    geoReason: swapFixed ? "swap_fixed_lat_lng" : null,
    swapFixed,
  };
}

export async function geocodeWithOpenStreetMap(options: {
  query: string;
  fetchImpl: FetchLike;
  userAgent: string;
}): Promise<GeocodeResult> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(options.query)}`;

  const response = await options.fetchImpl(url, {
    headers: {
      accept: "application/json",
      "user-agent": options.userAgent,
    },
  });
  if (!response.ok) {
    return {
      coords: null,
      reason: `provider_http_${response.status}`,
      source: "osm_nominatim",
      confidence: null,
    };
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload) || payload.length === 0) {
    return { coords: null, reason: "no_results", source: "osm_nominatim", confidence: null };
  }

  const first = payload[0] as
    | { lat?: string; lon?: string; importance?: number | string }
    | undefined;
  if (!first) {
    return { coords: null, reason: "invalid_payload", source: "osm_nominatim", confidence: null };
  }

  const resolved = resolveMeetingGeoStatus({
    lat: first.lat,
    lng: first.lon,
    formattedAddress: options.query,
  });

  if (resolved.geoStatus !== "ok" || resolved.lat === null || resolved.lng === null) {
    return {
      coords: null,
      reason: resolved.geoReason ?? "invalid_coordinates",
      source: "osm_nominatim",
      confidence: null,
    };
  }

  const importance = asFiniteNumber(first.importance);
  const confidence =
    importance === null ? null : Math.max(0, Math.min(1, Number(importance.toFixed(4))));

  return {
    coords: {
      lat: resolved.lat,
      lng: resolved.lng,
    },
    reason: null,
    source: "osm_nominatim",
    confidence,
  };
}
