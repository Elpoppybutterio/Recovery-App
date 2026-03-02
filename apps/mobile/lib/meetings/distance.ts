export const EARTH_RADIUS_METERS = 6_371_000;
export const METERS_PER_MILE = 1_609.344;
export const METERS_PER_KILOMETER = 1_000;

export type Coordinates = {
  lat: number;
  lng: number;
};

export function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeLatitude(value: unknown): number | null {
  const parsed = asFiniteNumber(value);
  if (parsed === null) {
    return null;
  }
  if (parsed < -90 || parsed > 90) {
    return null;
  }
  return parsed;
}

export function normalizeLongitude(value: unknown): number | null {
  const parsed = asFiniteNumber(value);
  if (parsed === null) {
    return null;
  }
  if (parsed < -180 || parsed > 180) {
    return null;
  }
  return parsed;
}

export function normalizeCoordinates(input: { lat: unknown; lng: unknown }): Coordinates | null {
  const lat = normalizeLatitude(input.lat);
  const lng = normalizeLongitude(input.lng);
  if (lat === null || lng === null) {
    return null;
  }
  return { lat, lng };
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineDistanceMeters(a: Coordinates, b: Coordinates): number {
  const latDelta = toRadians(b.lat - a.lat);
  const lngDelta = toRadians(b.lng - a.lng);
  const latA = toRadians(a.lat);
  const latB = toRadians(b.lat);

  const arc =
    Math.sin(latDelta / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(lngDelta / 2) ** 2;
  const centralAngle = 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
  return EARTH_RADIUS_METERS * centralAngle;
}

export function metersToMiles(distanceMeters: number): number {
  return distanceMeters / METERS_PER_MILE;
}

export function metersToKilometers(distanceMeters: number): number {
  return distanceMeters / METERS_PER_KILOMETER;
}

function roundMilesForDisplay(miles: number): number {
  const step = miles < 10 ? 0.1 : 0.5;
  return Math.round(miles / step) * step;
}

export function formatDistanceMiles(distanceMeters: number | null): string {
  if (distanceMeters === null || !Number.isFinite(distanceMeters)) {
    return "Distance unavailable";
  }
  const miles = metersToMiles(Math.max(0, distanceMeters));
  if (miles > 0 && miles < 0.1) {
    return "<0.1 mi";
  }

  const rounded = roundMilesForDisplay(miles);
  if (rounded >= 10 && Number.isInteger(rounded)) {
    return `${rounded.toFixed(0)} mi`;
  }
  return `${rounded.toFixed(1)} mi`;
}

export function formatDistanceKilometers(distanceMeters: number | null): string {
  if (distanceMeters === null || !Number.isFinite(distanceMeters)) {
    return "Distance unavailable";
  }
  const kilometers = metersToKilometers(Math.max(0, distanceMeters));
  const rounded =
    kilometers < 15 ? Math.round(kilometers * 10) / 10 : Math.round(kilometers * 2) / 2;
  if (rounded >= 15 && Number.isInteger(rounded)) {
    return `${rounded.toFixed(0)} km`;
  }
  return `${rounded.toFixed(1)} km`;
}
