const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_MILE = 1_609.344;

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

export function normalizeCoordinates(value: {
  lat: unknown;
  lng: unknown;
}): { lat: number; lng: number } | null {
  const lat = asFiniteNumber(value.lat);
  const lng = asFiniteNumber(value.lng);
  if (lat === null || lng === null) {
    return null;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  if (lat === 0 && lng === 0) {
    return null;
  }
  return { lat, lng };
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineDistanceMeters(
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

export function formatDistanceMiles(distanceMeters: number | null | undefined): string {
  if (
    typeof distanceMeters !== "number" ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters < 0
  ) {
    return "Location unavailable";
  }

  const miles = distanceMeters / METERS_PER_MILE;
  if (miles < 0.1) {
    return "<0.1 mi";
  }

  const rounded = miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles * 2) / 2;
  const display = Number.isInteger(rounded)
    ? rounded.toFixed(0)
    : rounded.toFixed(1).replace(/\.0$/, "");
  return `${display} mi`;
}
