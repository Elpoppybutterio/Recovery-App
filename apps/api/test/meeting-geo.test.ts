import { describe, expect, it } from "vitest";
import {
  buildGeocodeQuery,
  isFarOutsideBillingsRegion,
  isLikelyBillingsAddress,
  isWithinBillingsBounds,
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
      swapFixed: false,
    });

    expect(
      resolveMeetingGeoStatus({
        lat: 45.78,
        lng: null,
        formattedAddress: "510 Cook Ave, Billings, MT",
      }),
    ).toMatchObject({
      geoStatus: "needs_geocode",
      geoReason: "missing_longitude",
      lat: null,
      lng: null,
      swapFixed: false,
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
      swapFixed: false,
    });

    expect(
      resolveMeetingGeoStatus({
        lat: 0,
        lng: 0,
        formattedAddress: "Somewhere",
      }),
    ).toMatchObject({
      geoStatus: "needs_geocode",
      geoReason: "zero_coordinates",
      swapFixed: false,
    });
  });

  it("fixes common lat/lng swap cases", () => {
    expect(
      resolveMeetingGeoStatus({
        lat: -108.5052,
        lng: 45.7834,
        formattedAddress: "310 N 27th St, Billings, MT 59101",
      }),
    ).toMatchObject({
      lat: 45.7834,
      lng: -108.5052,
      geoStatus: "ok",
      geoReason: "swap_fixed_lat_lng",
      swapFixed: true,
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

  it("detects Billings context and bounds", () => {
    expect(
      isLikelyBillingsAddress({
        formattedAddress: "510 Cook Ave, Billings, MT 59101",
      }),
    ).toBe(true);
    expect(
      isLikelyBillingsAddress({
        formattedAddress: "101 Main St, Denver, CO 80202",
      }),
    ).toBe(false);

    expect(isWithinBillingsBounds(45.7834, -108.5052)).toBe(true);
    expect(isWithinBillingsBounds(39.7392, -104.9903)).toBe(false);
    expect(isFarOutsideBillingsRegion(39.7392, -104.9903)).toBe(true);
  });
});
