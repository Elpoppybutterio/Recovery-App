import { describe, expect, it } from "vitest";
import {
  boundingBoxForRadius,
  buildMeetingDedupeKey,
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

  it("builds the same dedupe key when only city/state suffix differs", () => {
    const leftKey = buildMeetingDedupeKey({
      name: "Recovery Group",
      day: 2,
      time: "20:00",
      formattedAddress: "510 Cook Ave",
      address: null,
      lat: 45.7834,
      lng: -108.5052,
    });

    const rightKey = buildMeetingDedupeKey({
      name: "Recovery Group",
      day: 2,
      time: "20:00",
      formattedAddress: "510 Cook Ave, Billings, MT 59101",
      address: null,
      lat: 45.7834,
      lng: -108.5052,
    });

    expect(leftKey).toBe(rightKey);
  });

  it("builds different dedupe keys for different addresses", () => {
    const leftKey = buildMeetingDedupeKey({
      name: "Recovery Group",
      day: 2,
      time: "20:00",
      formattedAddress: "510 Cook Ave",
      address: null,
      lat: 45.7834,
      lng: -108.5052,
    });

    const rightKey = buildMeetingDedupeKey({
      name: "Recovery Group",
      day: 2,
      time: "20:00",
      formattedAddress: "511 Cook Ave",
      address: null,
      lat: 45.7834,
      lng: -108.5052,
    });

    expect(leftKey).not.toBe(rightKey);
  });
});
