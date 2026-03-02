import { describe, expect, it } from "vitest";
import {
  formatDistanceMiles,
  haversineDistanceMeters,
  normalizeCoordinates,
} from "../lib/meetings/distance";

describe("meeting distance utilities", () => {
  it("normalizes numeric coordinate strings", () => {
    const coords = normalizeCoordinates({ lat: "45.7833", lng: "-108.5007" });
    expect(coords).toEqual({ lat: 45.7833, lng: -108.5007 });
  });

  it("rejects out-of-range coordinates", () => {
    expect(normalizeCoordinates({ lat: 91, lng: 10 })).toBeNull();
    expect(normalizeCoordinates({ lat: 10, lng: -181 })).toBeNull();
  });

  it("returns zero distance for identical points", () => {
    expect(
      haversineDistanceMeters({ lat: 45.7833, lng: -108.5007 }, { lat: 45.7833, lng: -108.5007 }),
    ).toBeCloseTo(0, 6);
  });

  it("formats miles with 0.1 precision under 10 miles", () => {
    // ~1.24 miles
    expect(formatDistanceMiles(2000)).toBe("1.2 mi");
  });

  it("formats miles with 0.5 precision at/over 10 miles", () => {
    // ~10.4 miles, rounded to nearest 0.5 => 10.5
    expect(formatDistanceMiles(16737)).toBe("10.5 mi");
  });
});
