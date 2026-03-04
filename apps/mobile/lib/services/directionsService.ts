import { haversineDistanceMeters } from "../meetings/distance";

type Coordinate = {
  lat: number;
  lng: number;
};

export type DirectionsRequest = {
  origin: Coordinate;
  destination: Coordinate;
  arrivalTime?: Date;
};

export type DirectionsResult = {
  durationSeconds: number;
  trafficAware: boolean;
  source: "google-directions" | "distance-fallback";
};

const DEFAULT_SPEED_MPH = 25;
const MIN_TRAVEL_SECONDS = 5 * 60;
const MAX_TRAVEL_SECONDS = 4 * 60 * 60;

function clampTravelSeconds(value: number): number {
  return Math.max(MIN_TRAVEL_SECONDS, Math.min(MAX_TRAVEL_SECONDS, Math.round(value)));
}

function fallbackDurationSeconds(origin: Coordinate, destination: Coordinate): number {
  const distanceMeters = haversineDistanceMeters(origin, destination);
  const speedMetersPerSecond = (DEFAULT_SPEED_MPH * 1609.344) / 3600;
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0 || speedMetersPerSecond <= 0) {
    return MIN_TRAVEL_SECONDS;
  }
  return clampTravelSeconds(distanceMeters / speedMetersPerSecond);
}

function normalizeCoordinate(value: Coordinate): Coordinate | null {
  if (
    !Number.isFinite(value.lat) ||
    !Number.isFinite(value.lng) ||
    Math.abs(value.lat) > 90 ||
    Math.abs(value.lng) > 180
  ) {
    return null;
  }
  return value;
}

function parseGoogleDurationSeconds(
  payload: unknown,
): { seconds: number; trafficAware: boolean } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const root = payload as Record<string, unknown>;
  const routes = Array.isArray(root.routes) ? root.routes : [];
  const firstRoute = routes[0];
  if (!firstRoute || typeof firstRoute !== "object") {
    return null;
  }
  const routeObject = firstRoute as Record<string, unknown>;
  const legs = Array.isArray(routeObject.legs) ? routeObject.legs : [];
  const firstLeg = legs[0];
  if (!firstLeg || typeof firstLeg !== "object") {
    return null;
  }
  const legObject = firstLeg as Record<string, unknown>;
  const durationInTraffic =
    typeof legObject.duration_in_traffic === "object" && legObject.duration_in_traffic
      ? (legObject.duration_in_traffic as Record<string, unknown>)
      : null;
  const duration =
    typeof legObject.duration === "object" && legObject.duration
      ? (legObject.duration as Record<string, unknown>)
      : null;

  const trafficSeconds =
    durationInTraffic && typeof durationInTraffic.value === "number"
      ? durationInTraffic.value
      : null;
  if (trafficSeconds !== null && Number.isFinite(trafficSeconds) && trafficSeconds > 0) {
    return { seconds: clampTravelSeconds(trafficSeconds), trafficAware: true };
  }

  const regularSeconds = duration && typeof duration.value === "number" ? duration.value : null;
  if (regularSeconds !== null && Number.isFinite(regularSeconds) && regularSeconds > 0) {
    return { seconds: clampTravelSeconds(regularSeconds), trafficAware: false };
  }

  return null;
}

export async function getDirectionsDuration(
  request: DirectionsRequest,
  options?: { apiKey?: string | null },
): Promise<DirectionsResult> {
  void request.arrivalTime;
  const origin = normalizeCoordinate(request.origin);
  const destination = normalizeCoordinate(request.destination);
  if (!origin || !destination) {
    return {
      durationSeconds: MIN_TRAVEL_SECONDS,
      trafficAware: false,
      source: "distance-fallback",
    };
  }

  const apiKey = (options?.apiKey ?? process.env.EXPO_PUBLIC_DIRECTIONS_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      durationSeconds: fallbackDurationSeconds(origin, destination),
      trafficAware: false,
      source: "distance-fallback",
    };
  }

  try {
    const departureTimeUnix = Math.floor(Date.now() / 1000);
    const url =
      "https://maps.googleapis.com/maps/api/directions/json" +
      `?origin=${origin.lat},${origin.lng}` +
      `&destination=${destination.lat},${destination.lng}` +
      "&mode=driving" +
      `&departure_time=${departureTimeUnix}` +
      "&traffic_model=best_guess" +
      `&key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);
    if (!response.ok) {
      return {
        durationSeconds: fallbackDurationSeconds(origin, destination),
        trafficAware: false,
        source: "distance-fallback",
      };
    }

    const parsed = parseGoogleDurationSeconds((await response.json()) as unknown);
    if (!parsed) {
      return {
        durationSeconds: fallbackDurationSeconds(origin, destination),
        trafficAware: false,
        source: "distance-fallback",
      };
    }

    return {
      durationSeconds: parsed.seconds,
      trafficAware: parsed.trafficAware,
      source: "google-directions",
    };
  } catch {
    return {
      durationSeconds: fallbackDurationSeconds(origin, destination),
      trafficAware: false,
      source: "distance-fallback",
    };
  }
}
