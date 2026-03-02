export type MeetingGeoStatus = "ok" | "missing" | "invalid" | "partial";

export type MeetingGeoResolution = {
  lat: number | null;
  lng: number | null;
  geoStatus: MeetingGeoStatus;
  geoReason: string | null;
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
};

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
  const lat = asFiniteNumber(options.lat);
  const lng = asFiniteNumber(options.lng);
  const formattedAddress = normalizeAddressText(options.formattedAddress);
  const onlineAddress = isOnlineAddress(formattedAddress);

  if (lat === null && lng === null) {
    if (onlineAddress) {
      return { lat: null, lng: null, geoStatus: "missing", geoReason: "online_meeting" };
    }
    if (!formattedAddress) {
      return { lat: null, lng: null, geoStatus: "missing", geoReason: "missing_address" };
    }
    return { lat: null, lng: null, geoStatus: "missing", geoReason: "missing_coordinates" };
  }

  if (lat === null || lng === null) {
    return {
      lat,
      lng,
      geoStatus: "partial",
      geoReason: lat === null ? "missing_latitude" : "missing_longitude",
    };
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { lat: null, lng: null, geoStatus: "invalid", geoReason: "coordinate_out_of_range" };
  }

  if (lat === 0 && lng === 0) {
    return { lat: null, lng: null, geoStatus: "invalid", geoReason: "zero_coordinates" };
  }

  return { lat, lng, geoStatus: "ok", geoReason: null };
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
    return { coords: null, reason: `provider_http_${response.status}` };
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload) || payload.length === 0) {
    return { coords: null, reason: "no_results" };
  }

  const first = payload[0] as { lat?: string; lon?: string } | undefined;
  if (!first) {
    return { coords: null, reason: "invalid_payload" };
  }

  const resolved = resolveMeetingGeoStatus({
    lat: first.lat,
    lng: first.lon,
    formattedAddress: options.query,
  });

  if (resolved.geoStatus !== "ok" || resolved.lat === null || resolved.lng === null) {
    return { coords: null, reason: resolved.geoReason ?? "invalid_coordinates" };
  }

  return {
    coords: {
      lat: resolved.lat,
      lng: resolved.lng,
    },
    reason: null,
  };
}
