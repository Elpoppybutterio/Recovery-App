import { asFiniteNumber, haversineDistanceMeters } from "../meetings/distance";

export type MeetingGeoStatus = "verified" | "estimated" | "missing" | "suspect";
export type MeetingGeoSource =
  | "feed"
  | "api"
  | "device_geocode"
  | "backend_geocode"
  | "nominatim"
  | "unknown";

const MONTANA_DISTANCE_ANOMALY_MILES = 200;
const METERS_PER_MILE = 1609.344;

type NormalizedPair = {
  lat: number | null;
  lng: number | null;
};

type ClassifyGeoInput = {
  lat: unknown;
  lng: unknown;
  address?: string | null;
  userRegionHint?: string | null;
  distanceFromUserMiles?: number | null;
};

export type GeoClassification = {
  lat: number | null;
  lng: number | null;
  swapped: boolean;
  geoStatus: MeetingGeoStatus;
  geoReason: string | null;
};

function normalizePair(lat: unknown, lng: unknown): NormalizedPair {
  return {
    lat: asFiniteNumber(lat),
    lng: asFiniteNumber(lng),
  };
}

function isMontanaLikeHint(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const text = value.toLowerCase();
  return (
    /\bbillings\b/.test(text) ||
    /\blaurel\b/.test(text) ||
    /\bmt\b/.test(text) ||
    /\bmontana\b/.test(text)
  );
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  const pair = normalizePair(lat, lng);
  if (pair.lat === null || pair.lng === null) {
    return false;
  }
  if (pair.lat < -90 || pair.lat > 90 || pair.lng < -180 || pair.lng > 180) {
    return false;
  }
  if (pair.lat === 0 && pair.lng === 0) {
    return false;
  }
  return true;
}

export function maybeSwapLatLng(
  lat: unknown,
  lng: unknown,
): { lat: number | null; lng: number | null; swapped: boolean } {
  const pair = normalizePair(lat, lng);
  if (pair.lat === null || pair.lng === null) {
    return { lat: pair.lat, lng: pair.lng, swapped: false };
  }

  const shouldSwap =
    Math.abs(pair.lat) > 90 && Math.abs(pair.lat) <= 180 && Math.abs(pair.lng) <= 90;
  if (!shouldSwap) {
    return { lat: pair.lat, lng: pair.lng, swapped: false };
  }
  return {
    lat: pair.lng,
    lng: pair.lat,
    swapped: true,
  };
}

export function distanceMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const meters = haversineDistanceMeters(a, b);
  return meters / METERS_PER_MILE;
}

export function isTrustedGeoStatus(status: MeetingGeoStatus | null | undefined): boolean {
  return status === "verified" || status === "estimated";
}

export function classifyGeo(input: ClassifyGeoInput): GeoClassification {
  const swapped = maybeSwapLatLng(input.lat, input.lng);

  if (swapped.lat === null || swapped.lng === null) {
    return {
      lat: null,
      lng: null,
      swapped: false,
      geoStatus: "missing",
      geoReason: "missing_coordinates",
    };
  }

  if (!isValidLatLng(swapped.lat, swapped.lng)) {
    return {
      lat: null,
      lng: null,
      swapped: swapped.swapped,
      geoStatus: "suspect",
      geoReason: "invalid_coordinates",
    };
  }

  const hasMontanaHint =
    isMontanaLikeHint(input.address) || isMontanaLikeHint(input.userRegionHint);
  if (
    hasMontanaHint &&
    typeof input.distanceFromUserMiles === "number" &&
    Number.isFinite(input.distanceFromUserMiles) &&
    input.distanceFromUserMiles > MONTANA_DISTANCE_ANOMALY_MILES
  ) {
    return {
      lat: null,
      lng: null,
      swapped: swapped.swapped,
      geoStatus: "suspect",
      geoReason: "distance_anomaly",
    };
  }

  if (swapped.swapped) {
    return {
      lat: swapped.lat,
      lng: swapped.lng,
      swapped: true,
      geoStatus: "estimated",
      geoReason: "swapped_lat_lng",
    };
  }

  return {
    lat: swapped.lat,
    lng: swapped.lng,
    swapped: false,
    geoStatus: "verified",
    geoReason: null,
  };
}
