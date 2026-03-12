const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_MILE = 1_609.344;

export function asFiniteNumber(value: unknown): number | null {
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

export function normalizeCoordinates(value: {
  lat: unknown;
  lng: unknown;
}): { lat: number; lng: number } | null {
  const lat = asFiniteNumber(value.lat);
  const lng = asFiniteNumber(value.lng);
  if (lat === null || lng === null) {
    return null;
  }

  const latInRange = lat >= -90 && lat <= 90;
  const lngInRange = lng >= -180 && lng <= 180;
  let normalizedLat = lat;
  let normalizedLng = lng;

  if (!latInRange || !lngInRange) {
    const swappedLat = lng;
    const swappedLng = lat;
    const swappedValid =
      swappedLat >= -90 && swappedLat <= 90 && swappedLng >= -180 && swappedLng <= 180;
    if (!swappedValid) {
      return null;
    }
    normalizedLat = swappedLat;
    normalizedLng = swappedLng;
  }

  if (normalizedLat === 0 && normalizedLng === 0) {
    return null;
  }

  return { lat: normalizedLat, lng: normalizedLng };
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
