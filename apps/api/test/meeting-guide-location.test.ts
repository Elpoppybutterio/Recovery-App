import { describe, expect, it } from "vitest";
import {
  parseMeetingGuideFeedsJson,
  selectMeetingGuideFeedsForLocation,
} from "../src/meeting-guide";

describe("meeting guide location routing", () => {
  it("parses coverage metadata from feed JSON", () => {
    const feeds = parseMeetingGuideFeedsJson(
      JSON.stringify([
        {
          name: "Colorado AA",
          url: "https://example.org/colorado.json",
          tenantId: "tenant-a",
          coverageCenterLat: 39.7392,
          coverageCenterLng: -104.9903,
          coverageRadiusMiles: 180,
          coverageStates: ["CO"],
          coverageCountryCodes: ["US"],
        },
      ]),
    );

    expect(feeds[0]).toMatchObject({
      name: "Colorado AA",
      coverageCenterLat: 39.7392,
      coverageCenterLng: -104.9903,
      coverageRadiusMiles: 180,
      coverageStates: ["CO"],
      coverageCountryCodes: ["US"],
    });
  });

  it("selects the closest feed whose coverage contains the current location", () => {
    const feeds = [
      {
        name: "Montana AA",
        url: "https://example.org/mt.json",
        coverageCenterLat: 45.7833,
        coverageCenterLng: -108.5007,
        coverageRadiusMiles: 80,
      },
      {
        name: "Colorado AA",
        url: "https://example.org/co.json",
        coverageCenterLat: 39.7392,
        coverageCenterLng: -104.9903,
        coverageRadiusMiles: 160,
      },
    ];

    const selected = selectMeetingGuideFeedsForLocation(feeds, {
      lat: 39.75,
      lng: -104.99,
      state: "CO",
      countryCode: "US",
    });

    expect(selected.map((feed) => feed.name)).toEqual(["Colorado AA"]);
  });

  it("falls back to admin coverage when a state-scoped feed matches", () => {
    const feeds = [
      {
        name: "California AA",
        url: "https://example.org/ca.json",
        coverageStates: ["CA"],
        coverageCountryCodes: ["US"],
      },
      {
        name: "Montana AA",
        url: "https://example.org/mt.json",
        coverageStates: ["MT"],
        coverageCountryCodes: ["US"],
      },
    ];

    const selected = selectMeetingGuideFeedsForLocation(feeds, {
      lat: 34.05,
      lng: -118.24,
      state: "CA",
      countryCode: "US",
    });

    expect(selected.map((feed) => feed.name)).toEqual(["California AA"]);
  });

  it("returns all feeds when no coverage metadata matches the location", () => {
    const feeds = [
      { name: "Feed A", url: "https://example.org/a.json" },
      { name: "Feed B", url: "https://example.org/b.json" },
    ];

    const selected = selectMeetingGuideFeedsForLocation(feeds, {
      lat: 40,
      lng: -105,
      state: "CO",
      countryCode: "US",
    });

    expect(selected.map((feed) => feed.name)).toEqual(["Feed A", "Feed B"]);
  });
});
