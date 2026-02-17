import { describe, expect, it } from "vitest";
import { computeDwellTime, pointInGeofence } from "../src";

describe("pointInGeofence", () => {
  it("returns true for a nearby point", () => {
    const isInside = pointInGeofence(
      { lat: 33.755, lng: -84.39 },
      {
        center: { lat: 33.755, lng: -84.3901 },
        radiusMeters: 20,
      },
    );

    expect(isInside).toBe(true);
  });
});

describe("computeDwellTime", () => {
  it("returns milliseconds between check-in and check-out", () => {
    const dwell = computeDwellTime(
      new Date("2026-01-01T10:00:00Z"),
      new Date("2026-01-01T11:00:00Z"),
    );
    expect(dwell).toBe(3_600_000);
  });
});
