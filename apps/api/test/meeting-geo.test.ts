import { describe, expect, it } from "vitest";
import {
  buildGeocodeQuery,
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
});
