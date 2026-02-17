export type Point = {
  lat: number;
  lng: number;
};

export type CircularGeofence = {
  center: Point;
  radiusMeters: number;
};

function degreesToMeters(latDiff: number, lngDiff: number): number {
  const metersPerDegreeLat = 111_132;
  const metersPerDegreeLng = 111_320;
  return Math.sqrt((latDiff * metersPerDegreeLat) ** 2 + (lngDiff * metersPerDegreeLng) ** 2);
}

export function pointInGeofence(point: Point, geofence: CircularGeofence): boolean {
  // TODO: Expand to polygon geofences and confidence scoring.
  const distance = degreesToMeters(
    point.lat - geofence.center.lat,
    point.lng - geofence.center.lng,
  );
  return distance <= geofence.radiusMeters;
}

export function computeDwellTime(checkInAt: Date, checkOutAt: Date): number {
  // TODO: Add robust timezone/outlier handling once tracking pipeline is implemented.
  return Math.max(0, checkOutAt.getTime() - checkInAt.getTime());
}
