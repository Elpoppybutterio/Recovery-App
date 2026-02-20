import { describe, expect, it } from "vitest";
import {
  boundingBoxForRadius,
  haversineDistanceMeters,
  normalizeMeetingGuideMeeting,
} from "../src/meeting-guide";

describe("meeting-guide geo helpers", () => {
  it("computes haversine distance for nearby coordinates", () => {
    const distance = haversineDistanceMeters(40.0, -105.0, 40.01, -105.0);
    expect(distance).toBeGreaterThan(1000);
    expect(distance).toBeLessThan(1200);
  });

  it("builds a bounding box around a radius", () => {
    const bounds = boundingBoxForRadius({
      lat: 40.0,
      lng: -105.0,
      radiusMiles: 20,
    });
    expect(bounds.latMin).toBeLessThan(40.0);
    expect(bounds.latMax).toBeGreaterThan(40.0);
    expect(bounds.lngMin).toBeLessThan(-105.0);
    expect(bounds.lngMax).toBeGreaterThan(-105.0);
  });

  it("normalizes valid feed records and rejects invalid records", () => {
    const normalized = normalizeMeetingGuideMeeting({
      slug: "daily-noon",
      name: "Daily Noon",
      day: 2,
      time: "12:00",
      latitude: 40.1,
      longitude: -105.1,
      types: ["O", "SP"],
    });
    expect(normalized?.slug).toBe("daily-noon");
    expect(normalized?.types).toEqual(["O", "SP"]);

    expect(
      normalizeMeetingGuideMeeting({
        name: "Missing slug",
      }),
    ).toBeNull();
  });
});
