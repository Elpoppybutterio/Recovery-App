import type { Repositories } from "./db/repositories";
import {
  normalizeMeetingGuideMeeting,
  parseMeetingGuideFeedsJson,
  type MeetingGuideFeedConfig,
} from "./meeting-guide";
import {
  buildGeocodeQuery,
  geocodeWithGoogleMaps,
  geocodeWithOpenStreetMap,
  normalizeAddressParts,
  resolveMeetingGeoStatus,
  type GeocodeResult,
} from "./meeting-geo";

interface LoggerLike {
  info(message: string, context?: Record<string, unknown>): void;
  warn?(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

interface FetchLikeResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<FetchLikeResponse>;

export interface IngestMeetingGuideResult {
  feedsAttempted: number;
  feedsFailed: number;
  meetingsFetched: number;
  meetingsImported: number;
  meetingsSkipped: number;
  meetingsWithCoordinates: number;
  meetingsWithoutCoordinates: number;
}

const BUILTIN_MEETING_GUIDE_FEEDS: Record<string, unknown[]> = {
  "builtin://billings-test": [
    {
      slug: "billings-sunday-step-study",
      name: "Billings Sunday Step Study",
      day: 0,
      time: "09:00",
      formatted_address: "308 N 27th St, Billings, MT 59101",
      address: "308 N 27th St",
      city: "Billings",
      state: "MT",
      postal_code: "59101",
      country: "US",
      latitude: 45.7863,
      longitude: -108.5059,
      types: ["O", "ST"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-noon-aa-mon",
      name: "Billings Noon Recovery",
      day: 1,
      time: "12:00",
      formatted_address: "2919 2nd Ave N, Billings, MT 59101",
      address: "2919 2nd Ave N",
      city: "Billings",
      state: "MT",
      postal_code: "59101",
      country: "US",
      latitude: 45.7836,
      longitude: -108.5002,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-evening-aa-tue",
      name: "Downtown Serenity Group",
      day: 2,
      time: "18:30",
      formatted_address: "115 N 30th St, Billings, MT 59101",
      address: "115 N 30th St",
      city: "Billings",
      state: "MT",
      postal_code: "59101",
      country: "US",
      latitude: 45.7831,
      longitude: -108.5095,
      types: ["C"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-early-na-wed",
      name: "Southside NA Morning",
      day: 3,
      time: "07:00",
      formatted_address: "3940 Rimrock Rd, Billings, MT 59102",
      address: "3940 Rimrock Rd",
      city: "Billings",
      state: "MT",
      postal_code: "59102",
      country: "US",
      latitude: 45.7555,
      longitude: -108.6031,
      types: ["O", "SP"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-online-thu",
      name: "Online Open Recovery",
      day: 4,
      time: "20:00",
      formatted_address: "Online",
      conference_url: "https://example.org/online-room",
      types: ["O", "ONL"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-saturday-speaker",
      name: "Billings Saturday Speaker Meeting",
      day: 6,
      time: "19:00",
      formatted_address: "404 N 30th St, Billings, MT 59101",
      address: "404 N 30th St",
      city: "Billings",
      state: "MT",
      postal_code: "59101",
      country: "US",
      latitude: 45.7877,
      longitude: -108.5078,
      types: ["O", "SP"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-trackside-mon",
      name: "Trackside Group",
      day: 1,
      time: "06:45",
      formatted_address: "2315 4th Ave N, Billings, MT 59101",
      address: "2315 4th Ave N",
      city: "Billings",
      state: "MT",
      postal_code: "59101",
      country: "US",
      latitude: 45.7911,
      longitude: -108.5108,
      types: ["C"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-downtown-mon",
      name: "Downtown Group",
      day: 1,
      time: "12:00",
      formatted_address: "17 N 31st St, Billings, MT 59101",
      address: "17 N 31st St",
      city: "Billings",
      state: "MT",
      postal_code: "59101",
      country: "US",
      latitude: 45.7829,
      longitude: -108.5092,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-home-group-mon",
      name: "Home Group",
      day: 1,
      time: "18:00",
      formatted_address: "1801 Broadwater Ave, Billings, MT 59102",
      address: "1801 Broadwater Ave",
      city: "Billings",
      state: "MT",
      postal_code: "59102",
      country: "US",
      latitude: 45.7893,
      longitude: -108.5645,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-trackside-tue",
      name: "Trackside Group",
      day: 2,
      time: "06:45",
      formatted_address: "2315 4th Ave N, Billings, MT 59101",
      address: "2315 4th Ave N",
      city: "Billings",
      state: "MT",
      postal_code: "59101",
      country: "US",
      latitude: 45.7911,
      longitude: -108.5108,
      types: ["C"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-644-tue",
      name: "644 Group",
      day: 2,
      time: "20:00",
      formatted_address: "510 Cook Ave, Billings, MT 59101",
      address: "510 Cook Ave",
      city: "Billings",
      state: "MT",
      postal_code: "59101",
      country: "US",
      latitude: 45.7895,
      longitude: -108.4928,
      types: ["C"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-great-reality-tue",
      name: "The Great Reality",
      day: 2,
      time: "19:00",
      formatted_address: "310 N 27th St, Billings, MT 59101",
      address: "310 N 27th St",
      city: "Billings",
      state: "MT",
      postal_code: "59101",
      country: "US",
      latitude: 45.7861,
      longitude: -108.5026,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-trackside-wed",
      name: "Trackside Group",
      day: 3,
      time: "06:45",
      formatted_address: "2315 4th Ave N, Billings, MT 59101",
      address: "2315 4th Ave N",
      city: "Billings",
      state: "MT",
      postal_code: "59101",
      country: "US",
      latitude: 45.7911,
      longitude: -108.5108,
      types: ["C"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-sunlight-wed",
      name: "Sunlight of the Spirit",
      day: 3,
      time: "19:00",
      formatted_address: "17 N 31st St, Billings, MT 59101",
      address: "17 N 31st St",
      city: "Billings",
      state: "MT",
      postal_code: "59101",
      country: "US",
      latitude: 45.7829,
      longitude: -108.5092,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-black-orchid-wed",
      name: "Black Orchid Group",
      day: 3,
      time: "20:00",
      formatted_address: "2049 Broadwater Ave, Billings, MT 59102",
      address: "2049 Broadwater Ave",
      city: "Billings",
      state: "MT",
      postal_code: "59102",
      country: "US",
      latitude: 45.7891,
      longitude: -108.5714,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-trackside-thu",
      name: "Trackside Group",
      day: 4,
      time: "06:45",
      formatted_address: "2315 4th Ave N, Billings, MT 59101",
      address: "2315 4th Ave N",
      city: "Billings",
      state: "MT",
      postal_code: "59101",
      country: "US",
      latitude: 45.7911,
      longitude: -108.5108,
      types: ["C"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-brown-baggers-thu",
      name: "Brown Baggers",
      day: 4,
      time: "12:00",
      formatted_address: "1241 Crawford Dr, Billings, MT 59102",
      address: "1241 Crawford Dr",
      city: "Billings",
      state: "MT",
      postal_code: "59102",
      country: "US",
      latitude: 45.7711,
      longitude: -108.5474,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-billw-thu",
      name: "Bill W. Speaker Meeting",
      day: 4,
      time: "19:00",
      formatted_address: "17 N 31st St, Billings, MT 59101",
      address: "17 N 31st St",
      city: "Billings",
      state: "MT",
      postal_code: "59101",
      country: "US",
      latitude: 45.7829,
      longitude: -108.5092,
      types: ["O", "SP"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-trackside-fri",
      name: "Trackside Group",
      day: 5,
      time: "06:45",
      formatted_address: "2315 4th Ave N, Billings, MT 59101",
      address: "2315 4th Ave N",
      city: "Billings",
      state: "MT",
      postal_code: "59101",
      country: "US",
      latitude: 45.7911,
      longitude: -108.5108,
      types: ["C"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-main-street-fri",
      name: "Main Street Group",
      day: 5,
      time: "12:00",
      formatted_address: "17 N 31st St, Billings, MT 59101",
      address: "17 N 31st St",
      city: "Billings",
      state: "MT",
      postal_code: "59101",
      country: "US",
      latitude: 45.7829,
      longitude: -108.5092,
      types: ["C"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-district11-sat",
      name: "District 11 Business Meeting",
      day: 6,
      time: "10:00",
      formatted_address: "2931 Colton Blvd, Billings, MT 59102",
      address: "2931 Colton Blvd",
      city: "Billings",
      state: "MT",
      postal_code: "59102",
      country: "US",
      latitude: 45.7669,
      longitude: -108.5892,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-trackside-sat",
      name: "Trackside Group",
      day: 6,
      time: "06:45",
      formatted_address: "2315 4th Ave N, Billings, MT 59101",
      address: "2315 4th Ave N",
      city: "Billings",
      state: "MT",
      postal_code: "59101",
      country: "US",
      latitude: 45.7911,
      longitude: -108.5108,
      types: ["C"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-644-sun",
      name: "644 Group",
      day: 0,
      time: "20:00",
      formatted_address: "510 Cook Ave, Billings, MT 59101",
      address: "510 Cook Ave",
      city: "Billings",
      state: "MT",
      postal_code: "59101",
      country: "US",
      latitude: 45.7895,
      longitude: -108.4928,
      types: ["C"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-downtown-sun",
      name: "Downtown Group",
      day: 0,
      time: "12:00",
      formatted_address: "17 N 31st St, Billings, MT 59101",
      address: "17 N 31st St",
      city: "Billings",
      state: "MT",
      postal_code: "59101",
      country: "US",
      latitude: 45.7829,
      longitude: -108.5092,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-west-end-sun",
      name: "West End Group",
      day: 0,
      time: "19:00",
      formatted_address: "3721 Grand Ave, Billings, MT 59102",
      address: "3721 Grand Ave",
      city: "Billings",
      state: "MT",
      postal_code: "59102",
      country: "US",
      latitude: 45.7833,
      longitude: -108.6109,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "laurel-recovery-sun",
      name: "Laurel Recovery Group",
      day: 0,
      time: "19:00",
      formatted_address: "202 E 1st St, Laurel, MT 59044",
      address: "202 E 1st St",
      city: "Laurel",
      state: "MT",
      postal_code: "59044",
      country: "US",
      latitude: 45.6705,
      longitude: -108.7708,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-west-end-mon",
      name: "West End Group",
      day: 1,
      time: "19:00",
      formatted_address: "3721 Grand Ave, Billings, MT 59102",
      address: "3721 Grand Ave",
      city: "Billings",
      state: "MT",
      postal_code: "59102",
      country: "US",
      latitude: 45.7833,
      longitude: -108.6109,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "laurel-recovery-mon",
      name: "Laurel Recovery Group",
      day: 1,
      time: "19:00",
      formatted_address: "202 E 1st St, Laurel, MT 59044",
      address: "202 E 1st St",
      city: "Laurel",
      state: "MT",
      postal_code: "59044",
      country: "US",
      latitude: 45.6705,
      longitude: -108.7708,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-west-end-tue",
      name: "West End Group",
      day: 2,
      time: "19:00",
      formatted_address: "3721 Grand Ave, Billings, MT 59102",
      address: "3721 Grand Ave",
      city: "Billings",
      state: "MT",
      postal_code: "59102",
      country: "US",
      latitude: 45.7833,
      longitude: -108.6109,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "laurel-recovery-tue",
      name: "Laurel Recovery Group",
      day: 2,
      time: "19:00",
      formatted_address: "202 E 1st St, Laurel, MT 59044",
      address: "202 E 1st St",
      city: "Laurel",
      state: "MT",
      postal_code: "59044",
      country: "US",
      latitude: 45.6705,
      longitude: -108.7708,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-west-end-wed",
      name: "West End Group",
      day: 3,
      time: "19:00",
      formatted_address: "3721 Grand Ave, Billings, MT 59102",
      address: "3721 Grand Ave",
      city: "Billings",
      state: "MT",
      postal_code: "59102",
      country: "US",
      latitude: 45.7833,
      longitude: -108.6109,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "laurel-recovery-wed",
      name: "Laurel Recovery Group",
      day: 3,
      time: "19:00",
      formatted_address: "202 E 1st St, Laurel, MT 59044",
      address: "202 E 1st St",
      city: "Laurel",
      state: "MT",
      postal_code: "59044",
      country: "US",
      latitude: 45.6705,
      longitude: -108.7708,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-west-end-thu",
      name: "West End Group",
      day: 4,
      time: "19:00",
      formatted_address: "3721 Grand Ave, Billings, MT 59102",
      address: "3721 Grand Ave",
      city: "Billings",
      state: "MT",
      postal_code: "59102",
      country: "US",
      latitude: 45.7833,
      longitude: -108.6109,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "laurel-recovery-thu",
      name: "Laurel Recovery Group",
      day: 4,
      time: "19:00",
      formatted_address: "202 E 1st St, Laurel, MT 59044",
      address: "202 E 1st St",
      city: "Laurel",
      state: "MT",
      postal_code: "59044",
      country: "US",
      latitude: 45.6705,
      longitude: -108.7708,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-west-end-fri",
      name: "West End Group",
      day: 5,
      time: "19:00",
      formatted_address: "3721 Grand Ave, Billings, MT 59102",
      address: "3721 Grand Ave",
      city: "Billings",
      state: "MT",
      postal_code: "59102",
      country: "US",
      latitude: 45.7833,
      longitude: -108.6109,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "laurel-recovery-fri",
      name: "Laurel Recovery Group",
      day: 5,
      time: "19:00",
      formatted_address: "202 E 1st St, Laurel, MT 59044",
      address: "202 E 1st St",
      city: "Laurel",
      state: "MT",
      postal_code: "59044",
      country: "US",
      latitude: 45.6705,
      longitude: -108.7708,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "billings-west-end-sat",
      name: "West End Group",
      day: 6,
      time: "19:00",
      formatted_address: "3721 Grand Ave, Billings, MT 59102",
      address: "3721 Grand Ave",
      city: "Billings",
      state: "MT",
      postal_code: "59102",
      country: "US",
      latitude: 45.7833,
      longitude: -108.6109,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
    {
      slug: "laurel-recovery-sat",
      name: "Laurel Recovery Group",
      day: 6,
      time: "19:00",
      formatted_address: "202 E 1st St, Laurel, MT 59044",
      address: "202 E 1st St",
      city: "Laurel",
      state: "MT",
      postal_code: "59044",
      country: "US",
      latitude: 45.6705,
      longitude: -108.7708,
      types: ["O"],
      updated: "2026-02-20T12:00:00Z",
    },
  ],
};

const DAY_NAME_TO_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function toTwentyFourHour(value: string): string | null {
  const normalized = value.replace(/\./g, "").replace(/\s+/g, " ").trim().toUpperCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return null;
  }

  let convertedHour = hour % 12;
  if (match[3] === "PM") {
    convertedHour += 12;
  }

  return `${String(convertedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function parseCityFromFeedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const city = parsed.searchParams.get("city");
    return city?.trim() ?? null;
  } catch {
    return null;
  }
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#8217;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractStateCodeFromAddress(value: string): string | null {
  const normalized = value.replace(/\s+/g, " ").trim().toUpperCase();

  // Accept state only when it's in a trailing context, not inside street names (for example "31ST ST").
  const stateBeforeZip = normalized.match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/);
  if (stateBeforeZip) {
    return stateBeforeZip[1];
  }

  const trailingState = normalized.match(/,\s*([A-Z]{2})\s*$/);
  if (trailingState) {
    return trailingState[1];
  }

  return null;
}

function parseAaMontanaHtmlEntries(rawHtml: string, feedUrl: string): unknown[] {
  const cityFromUrl = parseCityFromFeedUrl(feedUrl);
  const parsedEntries: unknown[] = [];

  const stripCellHtml = (value: string): string =>
    decodeBasicHtmlEntities(value)
      .replace(/<\s*br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const tableBodyMatch = rawHtml.match(/<tbody[^>]*id=["']fbody["'][^>]*>([\s\S]*?)<\/tbody>/i);
  const rowsSource = tableBodyMatch?.[1] ?? rawHtml;
  const rowMatches = Array.from(rowsSource.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));

  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1] ?? "";
    const cells = Array.from(rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map((match) =>
      stripCellHtml(match[1] ?? ""),
    );

    if (cells.length < 5) {
      continue;
    }

    const namePartRaw = cells[0];
    const dayText = cells[1];
    const timeText = cells[3];
    const addressRaw = cells[4];
    if (!namePartRaw || !dayText || !timeText || !addressRaw) {
      continue;
    }

    const dayIndex = DAY_NAME_TO_INDEX[dayText.toLowerCase()];
    if (dayIndex === undefined) {
      continue;
    }

    const time24 = toTwentyFourHour(timeText);
    if (!time24) {
      continue;
    }

    const opennessMatch = namePartRaw.match(/\((O|C)\)\s*$/i);
    const opennessCode = opennessMatch ? opennessMatch[1].toUpperCase() : null;
    const name = namePartRaw.replace(/\((O|C)\)\s*$/i, "").trim();
    if (!name) {
      continue;
    }

    const stateFromAddress = extractStateCodeFromAddress(addressRaw);
    const postalFromAddress = addressRaw.match(/\b\d{5}(?:-\d{4})?\b/);
    const isOnline = /virtual|zoom|online/i.test(addressRaw);

    parsedEntries.push({
      slug: slugify(`${cityFromUrl ?? "montana"}-${name}-${dayText}-${time24}`),
      name,
      day: dayIndex,
      time: time24,
      formatted_address: isOnline ? "Online" : addressRaw,
      address: isOnline ? null : addressRaw,
      city: cityFromUrl,
      state: stateFromAddress ?? "MT",
      postal_code: postalFromAddress?.[0] ?? null,
      country: "US",
      latitude: null,
      longitude: null,
      types: opennessCode ? [opennessCode] : [],
      updated: new Date().toISOString(),
    });
  }

  return parsedEntries;
}

type NormalizedMeeting = NonNullable<ReturnType<typeof normalizeMeetingGuideMeeting>>;

function normalizeMeetingAddress(entry: NormalizedMeeting): NormalizedMeeting {
  const normalized = normalizeAddressParts({
    formattedAddress: entry.formattedAddress,
    address: entry.address,
    city: entry.city,
    state: entry.state,
    postalCode: entry.postalCode,
    country: entry.country,
  });
  return {
    ...entry,
    formattedAddress: normalized.formattedAddress ?? null,
    address: normalized.address ?? null,
    city: normalized.city ?? null,
    state: normalized.state ?? null,
    postalCode: normalized.postalCode ?? null,
    country: normalized.country ?? null,
  };
}

function normalizeMeetingGeo(entry: NormalizedMeeting): NormalizedMeeting {
  const resolved = resolveMeetingGeoStatus({
    lat: entry.lat,
    lng: entry.lng,
    formattedAddress: entry.formattedAddress,
  });
  return {
    ...entry,
    lat: resolved.lat,
    lng: resolved.lng,
    geoStatus: resolved.geoStatus,
    geoReason: resolved.geoReason,
  };
}

function extractEntries(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (typeof payload === "object" && payload !== null) {
    const recordPayload = payload as Record<string, unknown>;
    if (Array.isArray(recordPayload.meetings)) {
      return recordPayload.meetings;
    }
    const encodedContent =
      typeof recordPayload.content === "string" ? recordPayload.content.trim() : null;
    const encoding =
      typeof recordPayload.encoding === "string"
        ? recordPayload.encoding.trim().toLowerCase()
        : null;
    if (encodedContent && encoding === "base64") {
      try {
        const decodedText = Buffer.from(encodedContent.replace(/\s+/g, ""), "base64").toString(
          "utf8",
        );
        const decodedPayload = JSON.parse(decodedText) as unknown;
        return extractEntries(decodedPayload);
      } catch {
        return [];
      }
    }
  }
  return [];
}

function isGitHubApiUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === "api.github.com";
  } catch {
    return false;
  }
}

export function parseConfiguredMeetingGuideFeeds(rawJson: string): MeetingGuideFeedConfig[] {
  return parseMeetingGuideFeedsJson(rawJson);
}

function getBuiltInFeedEntries(url: string): unknown[] | null {
  return BUILTIN_MEETING_GUIDE_FEEDS[url] ?? null;
}

export async function ingestMeetingGuideFeedsForTenant(options: {
  repositories: Repositories;
  tenantId: string;
  configuredFeeds: MeetingGuideFeedConfig[];
  now?: () => Date;
  fetchImpl?: FetchLike;
  logger?: LoggerLike;
  geocodeMissingCoordinates?: boolean;
  geocodeVerifyExistingCoordinates?: boolean;
  googleVerifyCoordinates?: boolean;
  googleMapsApiKey?: string;
  geocodeUserAgent?: string;
  githubToken?: string;
}): Promise<IngestMeetingGuideResult> {
  const now = options.now ?? (() => new Date());
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const logger = options.logger;
  const geocodeCache = new Map<string, GeocodeResult>();
  const googleVerificationCache = new Map<string, GeocodeResult>();

  for (const configured of options.configuredFeeds) {
    await options.repositories.meetingFeeds.upsert(options.tenantId, {
      name: configured.name,
      url: configured.url,
      entity: configured.entity,
      entityUrl: configured.entityUrl,
      active: true,
    });
  }

  const feeds = await options.repositories.meetingFeeds.listActive(options.tenantId);
  const configuredUrlSet = new Set(options.configuredFeeds.map((feed) => feed.url));
  let feedsFailed = 0;
  let meetingsFetched = 0;
  let meetingsImported = 0;
  let meetingsSkipped = 0;
  let meetingsWithCoordinates = 0;
  let meetingsWithoutCoordinates = 0;
  let geocodeAttemptsTotal = 0;
  let geocodeSuccessTotal = 0;
  let geocodeFailedTotal = 0;
  let googleVerifyAttemptsTotal = 0;
  let googleVerifySuccessTotal = 0;
  let googleVerifyFailedTotal = 0;

  const shouldGoogleVerify =
    options.googleVerifyCoordinates === true &&
    typeof options.googleMapsApiKey === "string" &&
    options.googleMapsApiKey.trim().length > 0;

  const ingestEntriesForFeed = async (feedId: string, entries: unknown[], feedUrl: string) => {
    meetingsFetched += entries.length;

    const normalizedInput: NormalizedMeeting[] = entries
      .map((entry) => normalizeMeetingGuideMeeting(entry))
      .filter((entry): entry is NormalizedMeeting => Boolean(entry));
    let normalized = normalizedInput.map(normalizeMeetingAddress).map(normalizeMeetingGeo);

    const missingReasonCounts = new Map<string, number>();
    const bumpMissingReason = (reason: string | null) => {
      const key = reason ?? "unknown";
      missingReasonCounts.set(key, (missingReasonCounts.get(key) ?? 0) + 1);
    };

    const shouldGeocodeMissingCoordinates = options.geocodeMissingCoordinates !== false;
    const shouldVerifyExistingCoordinates = options.geocodeVerifyExistingCoordinates === true;
    if (shouldGeocodeMissingCoordinates) {
      const geocodedEntries: NormalizedMeeting[] = [];
      for (const entry of normalized) {
        if (entry.geoStatus === "ok" && !shouldVerifyExistingCoordinates) {
          geocodedEntries.push(entry);
          continue;
        }

        const geocodeQuery = buildGeocodeQuery({
          formattedAddress: entry.formattedAddress,
          address: entry.address,
          city: entry.city,
          state: entry.state,
          postalCode: entry.postalCode,
          country: entry.country,
        });
        if (!geocodeQuery) {
          geocodedEntries.push(entry);
          continue;
        }

        let geocodeResult = geocodeCache.get(geocodeQuery);
        if (geocodeResult === undefined) {
          geocodeAttemptsTotal += 1;
          try {
            geocodeResult = await geocodeWithOpenStreetMap({
              query: geocodeQuery,
              fetchImpl,
              userAgent:
                options.geocodeUserAgent ?? "Recovery-Accountability/0.1 (+https://sober-ai.app)",
              expectedAddressParts: {
                formattedAddress: entry.formattedAddress,
                address: entry.address,
                city: entry.city,
                state: entry.state,
                postalCode: entry.postalCode,
                country: entry.country,
              },
            });
          } catch (error) {
            geocodeResult = {
              coords: null,
              reason: error instanceof Error ? "provider_exception" : "provider_unknown_error",
            };
          }
          if (geocodeResult.coords) {
            geocodeSuccessTotal += 1;
          } else {
            geocodeFailedTotal += 1;
          }
          geocodeCache.set(geocodeQuery, geocodeResult);
        }

        if (shouldGoogleVerify && geocodeResult.coords) {
          const googleCacheKey = geocodeQuery;
          let googleVerifiedResult = googleVerificationCache.get(googleCacheKey);
          if (googleVerifiedResult === undefined) {
            googleVerifyAttemptsTotal += 1;
            try {
              googleVerifiedResult = await geocodeWithGoogleMaps({
                query: geocodeQuery,
                fetchImpl,
                apiKey: options.googleMapsApiKey as string,
                expectedAddressParts: {
                  formattedAddress: entry.formattedAddress,
                  address: entry.address,
                  city: entry.city,
                  state: entry.state,
                  postalCode: entry.postalCode,
                  country: entry.country,
                },
              });
            } catch (error) {
              googleVerifiedResult = {
                coords: null,
                reason: error instanceof Error ? "provider_exception" : "provider_unknown_error",
              };
            }
            if (googleVerifiedResult.coords) {
              googleVerifySuccessTotal += 1;
            } else {
              googleVerifyFailedTotal += 1;
            }
            googleVerificationCache.set(googleCacheKey, googleVerifiedResult);
          }

          if (googleVerifiedResult.coords) {
            geocodeResult = googleVerifiedResult;
          } else {
            const reason = googleVerifiedResult.reason ?? "no_trusted_results";
            geocodeResult = {
              coords: null,
              reason: reason.startsWith("google_verify_") ? reason : `google_verify_${reason}`,
            };
          }
        }

        if (geocodeResult.coords) {
          const resolved = resolveMeetingGeoStatus({
            lat: geocodeResult.coords.lat,
            lng: geocodeResult.coords.lng,
            formattedAddress: entry.formattedAddress,
          });
          geocodedEntries.push({
            ...entry,
            lat: resolved.lat,
            lng: resolved.lng,
            geoStatus: resolved.geoStatus,
            geoReason: resolved.geoReason,
            geoUpdatedAt: now().toISOString(),
          });
        } else {
          const fallbackReason = geocodeResult.reason ? `geocode_${geocodeResult.reason}` : null;
          const contextMismatch = geocodeResult.reason?.includes("context_") ?? false;
          if (entry.geoStatus === "ok" && contextMismatch) {
            geocodedEntries.push({
              ...entry,
              lat: null,
              lng: null,
              geoStatus: "partial",
              geoReason: fallbackReason ?? "geocode_context_mismatch",
              geoUpdatedAt: now().toISOString(),
            });
            continue;
          }
          geocodedEntries.push({
            ...entry,
            geoReason: fallbackReason ?? entry.geoReason,
            geoUpdatedAt: now().toISOString(),
          });
        }
      }
      normalized = geocodedEntries;
    }

    for (const meeting of normalized) {
      if (meeting.geoStatus !== "ok") {
        bumpMissingReason(meeting.geoReason ?? null);
      }
      if (!meeting.geoUpdatedAt) {
        meeting.geoUpdatedAt = now().toISOString();
      }
    }
    meetingsImported += normalized.length;
    meetingsSkipped += entries.length - normalizedInput.length;

    const withCoordinates = normalized.filter(
      (meeting) => meeting.geoStatus === "ok" && meeting.lat !== null && meeting.lng !== null,
    ).length;
    const withoutCoordinates = normalized.length - withCoordinates;
    meetingsWithCoordinates += withCoordinates;
    meetingsWithoutCoordinates += withoutCoordinates;

    const ingestedCount = await options.repositories.meetingGuideMeetings.upsertForFeed(
      options.tenantId,
      feedId,
      normalized,
      now(),
    );

    logger?.info("meeting_guide.ingest.feed_complete", {
      tenantId: options.tenantId,
      feedId,
      feedUrl,
      ingestedCount,
      withCoordinates,
      withoutCoordinates,
      meetings_ingested_total: normalized.length,
      meetings_missing_coords_total: withoutCoordinates,
      geocode_attempts_total: geocodeAttemptsTotal,
      geocode_success_total: geocodeSuccessTotal,
      geocode_failed_total: geocodeFailedTotal,
      google_verify_attempts_total: googleVerifyAttemptsTotal,
      google_verify_success_total: googleVerifySuccessTotal,
      google_verify_failed_total: googleVerifyFailedTotal,
    });

    if (withoutCoordinates > 0) {
      logger?.warn?.("meeting_guide.ingest.feed_missing_coordinates", {
        tenantId: options.tenantId,
        feedId,
        feedUrl,
        withoutCoordinates,
        reasons: Object.fromEntries(missingReasonCounts.entries()),
        note: "Meetings without coordinates are stored with geo_status and geo_reason, and excluded from /v1/meetings/nearby until fixed.",
      });
    }
  };

  for (const feed of feeds) {
    if (configuredUrlSet.size > 0 && !configuredUrlSet.has(feed.url)) {
      continue;
    }

    const requestHeaders: Record<string, string> = {};
    if (feed.etag) {
      requestHeaders["if-none-match"] = feed.etag;
    }
    if (feed.last_modified) {
      requestHeaders["if-modified-since"] = feed.last_modified;
    }
    if (isGitHubApiUrl(feed.url)) {
      requestHeaders.accept = "application/vnd.github+json";
      requestHeaders["x-github-api-version"] = "2022-11-28";
      requestHeaders["user-agent"] =
        options.geocodeUserAgent ?? "Recovery-Accountability/0.1 (+https://sober-ai.app)";
      if (typeof options.githubToken === "string" && options.githubToken.trim().length > 0) {
        requestHeaders.authorization = `Bearer ${options.githubToken.trim()}`;
      }
    }

    try {
      const builtInEntries = getBuiltInFeedEntries(feed.url);
      if (builtInEntries) {
        await ingestEntriesForFeed(feed.id, builtInEntries, feed.url);
        await options.repositories.meetingFeeds.markFetchResult(options.tenantId, feed.id, {
          fetchedAt: now(),
          lastError: null,
        });
        continue;
      }

      const response = await fetchImpl(feed.url, { headers: requestHeaders });

      if (response.status === 304) {
        await options.repositories.meetingFeeds.markFetchResult(options.tenantId, feed.id, {
          fetchedAt: now(),
          lastError: null,
        });
        continue;
      }

      if (!response.ok) {
        feedsFailed += 1;
        await options.repositories.meetingFeeds.markFetchResult(options.tenantId, feed.id, {
          fetchedAt: now(),
          lastError: `Feed fetch failed (${response.status})`,
        });
        continue;
      }

      const payloadText = await response.text();
      let entries: unknown[] = [];
      try {
        entries = extractEntries(JSON.parse(payloadText) as unknown);
      } catch {
        entries = parseAaMontanaHtmlEntries(payloadText, feed.url);
      }
      await ingestEntriesForFeed(feed.id, entries, feed.url);

      await options.repositories.meetingFeeds.markFetchResult(options.tenantId, feed.id, {
        fetchedAt: now(),
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        lastError: null,
      });
    } catch (error) {
      feedsFailed += 1;
      await options.repositories.meetingFeeds.markFetchResult(options.tenantId, feed.id, {
        fetchedAt: now(),
        lastError: error instanceof Error ? error.message : "unknown",
      });
      logger?.error("meeting_guide.ingest.feed_exception", {
        tenantId: options.tenantId,
        feedId: feed.id,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  const result = {
    feedsAttempted: feeds.length,
    feedsFailed,
    meetingsFetched,
    meetingsImported,
    meetingsSkipped,
    meetingsWithCoordinates,
    meetingsWithoutCoordinates,
  };
  logger?.info("meeting_guide.ingest.complete", {
    ...result,
    meetings_ingested_total: meetingsImported,
    meetings_missing_coords_total: meetingsWithoutCoordinates,
    geocode_attempts_total: geocodeAttemptsTotal,
    geocode_success_total: geocodeSuccessTotal,
    geocode_failed_total: geocodeFailedTotal,
    google_verify_attempts_total: googleVerifyAttemptsTotal,
    google_verify_success_total: googleVerifySuccessTotal,
    google_verify_failed_total: googleVerifyFailedTotal,
  });
  return result;
}
