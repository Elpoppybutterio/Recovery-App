import { describe, expect, it, vi } from "vitest";
import {
  buildGeocodeQuery,
  geocodeWithGoogleMaps,
  geocodeWithOpenStreetMap,
  normalizeAddressParts,
  resolveMeetingGeoStatus,
} from "../src/meeting-geo";

describe("meeting geo helpers", () => {
  it("normalizes address text and state code", () => {
    const normalized = normalizeAddressParts({
      formattedAddress: "  ",
      address: " 510  Cook   Ave ",
      city: " Billings ",
      state: " mt ",
      postalCode: " 59101 ",
      country: " us ",
    });

    expect(normalized.formattedAddress).toBe("510 Cook Ave, Billings, MT, 59101, us");
    expect(normalized.state).toBe("MT");
  });

  it("resolves valid/partial/missing/invalid coordinate states", () => {
    expect(
      resolveMeetingGeoStatus({
        lat: 45.78,
        lng: -108.5,
        formattedAddress: "510 Cook Ave, Billings, MT",
      }),
    ).toMatchObject({
      lat: 45.78,
      lng: -108.5,
      geoStatus: "ok",
      geoReason: null,
    });

    expect(
      resolveMeetingGeoStatus({
        lat: 45.78,
        lng: null,
        formattedAddress: "510 Cook Ave, Billings, MT",
      }),
    ).toMatchObject({
      geoStatus: "partial",
      geoReason: "missing_longitude",
    });

    expect(
      resolveMeetingGeoStatus({
        lat: null,
        lng: null,
        formattedAddress: "",
      }),
    ).toMatchObject({
      geoStatus: "missing",
      geoReason: "missing_address",
    });

    expect(
      resolveMeetingGeoStatus({
        lat: 0,
        lng: 0,
        formattedAddress: "Somewhere",
      }),
    ).toMatchObject({
      geoStatus: "invalid",
      geoReason: "zero_coordinates",
    });
  });

  it("builds geocode query from available address parts", () => {
    expect(
      buildGeocodeQuery({
        address: "510 Cook Ave",
        city: "Billings",
        state: "MT",
      }),
    ).toBe("510 Cook Ave, Billings, MT");

    expect(
      buildGeocodeQuery({
        formattedAddress: "Online",
        address: null,
        city: null,
        state: null,
      }),
    ).toBeNull();
  });

  it("enriches street-only formatted address with city/state context", () => {
    expect(
      buildGeocodeQuery({
        formattedAddress: "510 Cook Ave",
        address: "510 Cook Ave",
        city: "Billings",
        state: "MT",
        postalCode: null,
        country: null,
      }),
    ).toBe("510 Cook Ave, Billings, MT");
  });

  it("strips unit markers from geocode query addresses", () => {
    expect(
      buildGeocodeQuery({
        formattedAddress: "848 Main Street, #8",
        address: "848 Main Street, #8",
        city: "Billings",
        state: "MT",
      }),
    ).toBe("848 Main Street, Billings, MT");
  });

  it("accepts geocode results when address context matches", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          lat: "45.7895",
          lon: "-108.4928",
          display_name: "510 Cook Ave, Billings, Yellowstone County, Montana, 59101, United States",
          address: {
            house_number: "510",
            road: "Cook Ave",
            city: "Billings",
            state: "Montana",
            state_code: "US-MT",
            postcode: "59101",
          },
        },
      ],
    });

    const result = await geocodeWithOpenStreetMap({
      query: "510 Cook Ave, Billings, MT 59101, US",
      fetchImpl,
      userAgent: "Recovery-Test/1.0",
      expectedAddressParts: {
        address: "510 Cook Ave",
        city: "Billings",
        state: "MT",
        postalCode: "59101",
        country: "US",
      },
    });

    expect(result).toEqual({
      coords: { lat: 45.7895, lng: -108.4928 },
      reason: null,
    });
  });

  it("rejects geocode results when address context mismatches", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          lat: "42.4323358",
          lon: "-75.5526534",
          display_name: "131 Moore Ln, Norwich, New York, 13815, United States",
          address: {
            house_number: "131",
            road: "Moore Ln",
            city: "Norwich",
            state: "New York",
            state_code: "US-NY",
            postcode: "13815",
          },
        },
      ],
    });

    const result = await geocodeWithOpenStreetMap({
      query: "131 Moore Lane, Billings, MT 59101, US",
      fetchImpl,
      userAgent: "Recovery-Test/1.0",
      expectedAddressParts: {
        address: "131 Moore Lane",
        city: "Billings",
        state: "MT",
        postalCode: "59101",
        country: "US",
      },
    });

    expect(result.coords).toBeNull();
    expect(result.reason).toBe("context_state_mismatch");
  });

  it("accepts google geocode results when address context matches", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "OK",
        results: [
          {
            formatted_address: "131 Moore Ln, Billings, MT 59101, USA",
            geometry: { location: { lat: 45.7567, lng: -108.6107 } },
            address_components: [
              { long_name: "131", short_name: "131", types: ["street_number"] },
              { long_name: "Moore Lane", short_name: "Moore Ln", types: ["route"] },
              { long_name: "Billings", short_name: "Billings", types: ["locality"] },
              {
                long_name: "Montana",
                short_name: "MT",
                types: ["administrative_area_level_1"],
              },
              { long_name: "59101", short_name: "59101", types: ["postal_code"] },
              { long_name: "United States", short_name: "US", types: ["country"] },
            ],
          },
        ],
      }),
    });

    const result = await geocodeWithGoogleMaps({
      query: "131 Moore Lane, Billings, MT 59101, US",
      fetchImpl,
      apiKey: "test-key",
      expectedAddressParts: {
        address: "131 Moore Lane",
        city: "Billings",
        state: "MT",
        postalCode: "59101",
      },
    });

    expect(result).toEqual({
      coords: { lat: 45.7567, lng: -108.6107 },
      reason: null,
    });
  });

  it("rejects google geocode results when address context mismatches", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: "OK",
        results: [
          {
            formatted_address: "131 Moore Ln, Norwich, NY 13815, USA",
            geometry: { location: { lat: 42.4323358, lng: -75.5526534 } },
            address_components: [
              { long_name: "131", short_name: "131", types: ["street_number"] },
              { long_name: "Moore Lane", short_name: "Moore Ln", types: ["route"] },
              { long_name: "Norwich", short_name: "Norwich", types: ["locality"] },
              {
                long_name: "New York",
                short_name: "NY",
                types: ["administrative_area_level_1"],
              },
              { long_name: "13815", short_name: "13815", types: ["postal_code"] },
              { long_name: "United States", short_name: "US", types: ["country"] },
            ],
          },
        ],
      }),
    });

    const result = await geocodeWithGoogleMaps({
      query: "131 Moore Lane, Billings, MT 59101, US",
      fetchImpl,
      apiKey: "test-key",
      expectedAddressParts: {
        address: "131 Moore Lane",
        city: "Billings",
        state: "MT",
        postalCode: "59101",
      },
    });

    expect(result.coords).toBeNull();
    expect(result.reason).toBe("context_state_mismatch");
  });
});
