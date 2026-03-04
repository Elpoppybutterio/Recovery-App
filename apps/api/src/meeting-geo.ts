export type MeetingGeoStatus = "ok" | "missing" | "invalid" | "partial";

export type MeetingGeoResolution = {
  lat: number | null;
  lng: number | null;
  geoStatus: MeetingGeoStatus;
  geoReason: string | null;
};

type AddressParts = {
  formattedAddress?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
};

export type GeocodeResult = {
  coords: { lat: number; lng: number } | null;
  reason: string | null;
};

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  county?: string;
  state?: string;
  state_code?: string;
  postcode?: string;
  road?: string;
  house_number?: string;
  country_code?: string;
};

type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: NominatimAddress;
};

type GoogleAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type GoogleGeocodeResult = {
  formatted_address?: string;
  address_components?: GoogleAddressComponent[];
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
};

type GoogleGeocodePayload = {
  status?: string;
  error_message?: string;
  results?: GoogleGeocodeResult[];
};

type FetchLikeResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<FetchLikeResponse>;

const US_STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};
const US_STATE_CODE_TO_NAME = Object.fromEntries(
  Object.entries(US_STATE_NAME_TO_CODE).map(([name, code]) => [code, name]),
) as Record<string, string>;
const STREET_TOKEN_STOPWORDS = new Set([
  "street",
  "st",
  "avenue",
  "ave",
  "road",
  "rd",
  "drive",
  "dr",
  "lane",
  "ln",
  "court",
  "ct",
  "boulevard",
  "blvd",
  "highway",
  "hwy",
  "north",
  "south",
  "east",
  "west",
  "n",
  "s",
  "e",
  "w",
]);

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeLooseText(value: string | null | undefined): string | null {
  const normalized = normalizeAddressText(value);
  if (!normalized) {
    return null;
  }
  const compact = normalized
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return compact.length > 0 ? compact : null;
}

function normalizePostalCode(value: string | null | undefined): string | null {
  const normalized = normalizeAddressText(value);
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match?.[1] ?? null;
}

function normalizeStateToken(value: string | null | undefined): string | null {
  const normalized = normalizeAddressText(value);
  if (!normalized) {
    return null;
  }
  const compact = normalized.toLowerCase().replace(/\./g, "");
  if (compact.length === 2) {
    return compact.toUpperCase();
  }
  const fromName = US_STATE_NAME_TO_CODE[compact];
  if (fromName) {
    return fromName;
  }
  const codeMatch = compact.match(/\b([a-z]{2})$/);
  return codeMatch ? codeMatch[1].toUpperCase() : null;
}

function extractHouseNumber(value: string | null | undefined): string | null {
  const normalized = normalizeAddressText(value);
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/\b(\d+[a-zA-Z]?)\b/);
  return match?.[1]?.toLowerCase() ?? null;
}

function normalizeStreetText(value: string | null | undefined): string | null {
  const loose = normalizeLooseText(value);
  if (!loose) {
    return null;
  }
  const withoutNumber = loose.replace(/^\d+[a-z]?\s+/, "").trim();
  return withoutNumber.length > 0 ? withoutNumber : null;
}

function stripUnitSuffix(value: string | null | undefined): string | null {
  const normalized = normalizeAddressText(value);
  if (!normalized) {
    return null;
  }

  // Unit markers (for example "#8", "Suite 3", "Apt B") frequently hurt geocoder match quality.
  const stripped = normalized
    .replace(/\s*,\s*(?:#|apt\.?|apartment|suite|ste\.?|unit|rm\.?|room)\s*[a-z0-9-]+$/i, "")
    .replace(/\s+(?:#|apt\.?|apartment|suite|ste\.?|unit|rm\.?|room)\s*[a-z0-9-]+$/i, "")
    .trim();

  return stripped.length > 0 ? stripped : normalized;
}

function extractCandidateCity(address: NominatimAddress | undefined): string | null {
  return normalizeLooseText(
    address?.city ??
      address?.town ??
      address?.village ??
      address?.hamlet ??
      address?.municipality ??
      address?.county,
  );
}

function hasStreetTokenMatch(expectedStreet: string, candidateStreet: string): boolean {
  const expectedTokens = expectedStreet
    .split(" ")
    .filter((token) => token.length >= 3 && !STREET_TOKEN_STOPWORDS.has(token));
  const candidateTokenSet = new Set(
    candidateStreet
      .split(" ")
      .filter((token) => token.length >= 3 && !STREET_TOKEN_STOPWORDS.has(token)),
  );
  if (expectedTokens.length === 0) {
    return true;
  }
  const overlap = expectedTokens.filter((token) => candidateTokenSet.has(token)).length;
  return overlap >= Math.min(2, expectedTokens.length);
}

function getGoogleAddressComponent(
  components: GoogleAddressComponent[] | undefined,
  type: string,
): GoogleAddressComponent | null {
  if (!Array.isArray(components)) {
    return null;
  }
  return components.find((component) => component.types?.includes(type)) ?? null;
}

function toNominatimCandidateFromGoogle(result: GoogleGeocodeResult): NominatimResult | null {
  const lat = asFiniteNumber(result.geometry?.location?.lat);
  const lng = asFiniteNumber(result.geometry?.location?.lng);
  if (lat === null || lng === null) {
    return null;
  }

  const components = result.address_components;
  const houseNumber =
    getGoogleAddressComponent(components, "street_number")?.long_name ?? undefined;
  const road = getGoogleAddressComponent(components, "route")?.long_name ?? undefined;
  const city =
    getGoogleAddressComponent(components, "locality")?.long_name ??
    getGoogleAddressComponent(components, "postal_town")?.long_name ??
    getGoogleAddressComponent(components, "administrative_area_level_2")?.long_name ??
    undefined;
  const stateLong =
    getGoogleAddressComponent(components, "administrative_area_level_1")?.long_name ?? undefined;
  const stateShort =
    getGoogleAddressComponent(components, "administrative_area_level_1")?.short_name ?? undefined;
  const postalCode = getGoogleAddressComponent(components, "postal_code")?.long_name ?? undefined;
  const countryCode =
    getGoogleAddressComponent(components, "country")?.short_name?.toLowerCase() ?? undefined;

  return {
    lat: String(lat),
    lon: String(lng),
    display_name: result.formatted_address,
    address: {
      house_number: houseNumber,
      road,
      city,
      state: stateLong,
      state_code: stateShort,
      postcode: postalCode,
      country_code: countryCode,
    },
  };
}

function evaluateAddressContextMismatch(
  expectedRaw: AddressParts,
  candidate: NominatimResult,
): string | null {
  const expected = normalizeAddressParts(expectedRaw);
  const expectedState = normalizeStateToken(expected.state);
  const expectedCity = normalizeLooseText(expected.city);
  const expectedPostal = normalizePostalCode(expected.postalCode);
  const expectedAddressText = expected.address ?? expected.formattedAddress;
  const expectedStreet = normalizeStreetText(expectedAddressText);
  const expectedHouseNumber = extractHouseNumber(expectedAddressText);

  const candidateAddress = candidate.address;
  const candidateState =
    normalizeStateToken(candidateAddress?.state_code) ??
    normalizeStateToken(candidateAddress?.state);
  const candidateCity = extractCandidateCity(candidateAddress);
  const candidatePostal = normalizePostalCode(candidateAddress?.postcode);
  const candidateStreet = normalizeStreetText(candidateAddress?.road ?? candidate.display_name);
  const candidateHouseNumber = extractHouseNumber(candidateAddress?.house_number);
  const candidateDisplay = normalizeLooseText(candidate.display_name);

  if (expectedState) {
    const displayHasExpectedStateName = candidateDisplay
      ? candidateDisplay.includes(
          US_STATE_CODE_TO_NAME[expectedState] ?? expectedState.toLowerCase(),
        )
      : false;
    if (!candidateState && !displayHasExpectedStateName) {
      return "context_state_mismatch";
    }
    if (candidateState && candidateState !== expectedState) {
      return "context_state_mismatch";
    }
  }

  if (expectedCity) {
    const cityMatches =
      (candidateCity &&
        (candidateCity === expectedCity ||
          candidateCity.includes(expectedCity) ||
          expectedCity.includes(candidateCity))) ||
      (candidateDisplay ? candidateDisplay.includes(expectedCity) : false);
    if (!cityMatches) {
      return "context_city_mismatch";
    }
  }

  if (expectedPostal && candidatePostal && candidatePostal !== expectedPostal) {
    return "context_postal_mismatch";
  }

  if (expectedHouseNumber && candidateHouseNumber && expectedHouseNumber !== candidateHouseNumber) {
    return "context_house_number_mismatch";
  }

  if (
    expectedStreet &&
    candidateStreet &&
    !hasStreetTokenMatch(expectedStreet, candidateStreet) &&
    !candidateStreet.includes(expectedStreet) &&
    !expectedStreet.includes(candidateStreet)
  ) {
    return "context_street_mismatch";
  }

  return null;
}

export function normalizeAddressText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeStateCode(value: string | null | undefined): string | null {
  const normalized = normalizeAddressText(value);
  if (!normalized) {
    return null;
  }
  if (normalized.length === 2) {
    return normalized.toUpperCase();
  }
  return normalized;
}

export function normalizeAddressParts<T extends AddressParts>(value: T): T {
  const formattedAddress = normalizeAddressText(value.formattedAddress);
  const address = normalizeAddressText(value.address);
  const city = normalizeAddressText(value.city);
  const state = normalizeStateCode(value.state);
  const postalCode = normalizeAddressText(value.postalCode);
  const country = normalizeAddressText(value.country);

  const fallbackFormatted = [address, city, state, postalCode, country]
    .filter((entry): entry is string => Boolean(entry))
    .join(", ");

  return {
    ...value,
    formattedAddress: formattedAddress ?? (fallbackFormatted.length > 0 ? fallbackFormatted : null),
    address,
    city,
    state,
    postalCode,
    country,
  };
}

function isOnlineAddress(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "online" || normalized === "virtual";
}

export function buildGeocodeQuery(parts: AddressParts): string | null {
  const normalized = normalizeAddressParts(parts);
  if (isOnlineAddress(normalized.formattedAddress)) {
    return null;
  }
  const geocodeFormattedAddress = stripUnitSuffix(normalized.formattedAddress);
  const geocodeAddress = stripUnitSuffix(normalized.address);

  const segments: string[] = [];
  const pushIfMissing = (value: string | null | undefined) => {
    if (!value) {
      return;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return;
    }
    const lowerTrimmed = trimmed.toLowerCase();
    const exists = segments.some((segment) => {
      const lowerSegment = segment.toLowerCase();
      if (lowerSegment.includes(lowerTrimmed)) {
        return true;
      }
      if (trimmed.length === 2) {
        const statePattern = new RegExp(`\\b${trimmed.toUpperCase()}\\b`);
        return statePattern.test(segment.toUpperCase());
      }
      return false;
    });
    if (!exists) {
      segments.push(trimmed);
    }
  };

  // Many feeds provide formattedAddress as street-only (for example "510 Cook Ave").
  // Keep it, but append missing city/state/postal context so geocoding does not drift to other states.
  pushIfMissing(geocodeFormattedAddress);
  pushIfMissing(geocodeAddress);
  pushIfMissing(normalized.city);
  pushIfMissing(normalized.state);
  pushIfMissing(normalized.postalCode);
  pushIfMissing(normalized.country);

  if (segments.length === 0) {
    return null;
  }

  return segments.join(", ");
}

export function resolveMeetingGeoStatus(options: {
  lat: unknown;
  lng: unknown;
  formattedAddress?: string | null;
}): MeetingGeoResolution {
  const lat = asFiniteNumber(options.lat);
  const lng = asFiniteNumber(options.lng);
  const formattedAddress = normalizeAddressText(options.formattedAddress);
  const onlineAddress = isOnlineAddress(formattedAddress);

  if (lat === null && lng === null) {
    if (onlineAddress) {
      return { lat: null, lng: null, geoStatus: "missing", geoReason: "online_meeting" };
    }
    if (!formattedAddress) {
      return { lat: null, lng: null, geoStatus: "missing", geoReason: "missing_address" };
    }
    return { lat: null, lng: null, geoStatus: "missing", geoReason: "missing_coordinates" };
  }

  if (lat === null || lng === null) {
    return {
      lat,
      lng,
      geoStatus: "partial",
      geoReason: lat === null ? "missing_latitude" : "missing_longitude",
    };
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { lat: null, lng: null, geoStatus: "invalid", geoReason: "coordinate_out_of_range" };
  }

  if (lat === 0 && lng === 0) {
    return { lat: null, lng: null, geoStatus: "invalid", geoReason: "zero_coordinates" };
  }

  return { lat, lng, geoStatus: "ok", geoReason: null };
}

export async function geocodeWithOpenStreetMap(options: {
  query: string;
  fetchImpl: FetchLike;
  userAgent: string;
  expectedAddressParts?: AddressParts;
}): Promise<GeocodeResult> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=3&q=` +
    encodeURIComponent(options.query);

  const response = await options.fetchImpl(url, {
    headers: {
      accept: "application/json",
      "user-agent": options.userAgent,
    },
  });
  if (!response.ok) {
    return { coords: null, reason: `provider_http_${response.status}` };
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload) || payload.length === 0) {
    return { coords: null, reason: "no_results" };
  }

  let mismatchReason: string | null = null;

  for (const item of payload.slice(0, 3)) {
    const candidate = (item ?? null) as NominatimResult | null;
    if (!candidate) {
      continue;
    }

    const resolved = resolveMeetingGeoStatus({
      lat: candidate.lat,
      lng: candidate.lon,
      formattedAddress: options.query,
    });

    if (resolved.geoStatus !== "ok" || resolved.lat === null || resolved.lng === null) {
      mismatchReason = mismatchReason ?? resolved.geoReason ?? "invalid_coordinates";
      continue;
    }

    if (options.expectedAddressParts) {
      const contextMismatch = evaluateAddressContextMismatch(
        options.expectedAddressParts,
        candidate,
      );
      if (contextMismatch) {
        mismatchReason = mismatchReason ?? contextMismatch;
        continue;
      }
    }

    return {
      coords: {
        lat: resolved.lat,
        lng: resolved.lng,
      },
      reason: null,
    };
  }

  return { coords: null, reason: mismatchReason ?? "no_trusted_results" };
}

export async function geocodeWithGoogleMaps(options: {
  query: string;
  fetchImpl: FetchLike;
  apiKey: string;
  expectedAddressParts?: AddressParts;
}): Promise<GeocodeResult> {
  const apiKey = options.apiKey.trim();
  if (apiKey.length === 0) {
    return { coords: null, reason: "missing_api_key" };
  }

  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?address=" +
    encodeURIComponent(options.query) +
    "&key=" +
    encodeURIComponent(apiKey);

  const response = await options.fetchImpl(url, {
    headers: {
      accept: "application/json",
    },
  });
  if (!response.ok) {
    return { coords: null, reason: `provider_http_${response.status}` };
  }

  const payload = (await response.json()) as GoogleGeocodePayload;
  const status = String(payload?.status ?? "UNKNOWN").toUpperCase();
  if (status !== "OK" || !Array.isArray(payload?.results) || payload.results.length === 0) {
    if (status === "ZERO_RESULTS") {
      return { coords: null, reason: "no_results" };
    }
    return { coords: null, reason: `provider_status_${status.toLowerCase()}` };
  }

  let mismatchReason: string | null = null;
  for (const result of payload.results.slice(0, 3)) {
    const candidate = toNominatimCandidateFromGoogle(result);
    if (!candidate) {
      mismatchReason = mismatchReason ?? "invalid_coordinates";
      continue;
    }

    const resolved = resolveMeetingGeoStatus({
      lat: candidate.lat,
      lng: candidate.lon,
      formattedAddress: options.query,
    });

    if (resolved.geoStatus !== "ok" || resolved.lat === null || resolved.lng === null) {
      mismatchReason = mismatchReason ?? resolved.geoReason ?? "invalid_coordinates";
      continue;
    }

    if (options.expectedAddressParts) {
      const contextMismatch = evaluateAddressContextMismatch(
        options.expectedAddressParts,
        candidate,
      );
      if (contextMismatch) {
        mismatchReason = mismatchReason ?? contextMismatch;
        continue;
      }
    }

    return {
      coords: {
        lat: resolved.lat,
        lng: resolved.lng,
      },
      reason: null,
    };
  }

  return { coords: null, reason: mismatchReason ?? "no_trusted_results" };
}
