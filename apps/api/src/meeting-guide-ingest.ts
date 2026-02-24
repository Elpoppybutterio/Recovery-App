import type { Repositories } from "./db/repositories";
import {
  normalizeMeetingGuideMeeting,
  parseMeetingGuideFeedsJson,
  type MeetingGuideFeedConfig,
} from "./meeting-guide";

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

function parseAaMontanaHtmlEntries(rawHtml: string, feedUrl: string): unknown[] {
  const withLineBreaks = rawHtml
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/div>/gi, "\n");

  const plainText = decodeBasicHtmlEntities(withLineBreaks).replace(/<[^>]+>/g, " ");
  const lines = plainText
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);

  const cityFromUrl = parseCityFromFeedUrl(feedUrl);
  const parsedEntries: unknown[] = [];

  for (const line of lines) {
    const dayMatch = line.match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i);
    if (!dayMatch || dayMatch.index === undefined) {
      continue;
    }

    const dayIndex = DAY_NAME_TO_INDEX[dayMatch[1].toLowerCase()];
    if (dayIndex === undefined) {
      continue;
    }

    const namePartRaw = line.slice(0, dayMatch.index).trim();
    const timeMatches = Array.from(
      line.matchAll(/(\d{1,2}:\d{2}\s*(?:A\.?M\.?|P\.?M\.?|AM|PM|am|pm))/g),
    );
    const lastTimeMatch = timeMatches[timeMatches.length - 1];
    if (!lastTimeMatch || lastTimeMatch.index === undefined) {
      continue;
    }

    const time24 = toTwentyFourHour(lastTimeMatch[1]);
    if (!time24) {
      continue;
    }

    const addressRaw = line
      .slice(lastTimeMatch.index + lastTimeMatch[0].length)
      .replace(/\s*!+\s*$/g, "")
      .trim();
    if (!addressRaw) {
      continue;
    }

    const opennessMatch = namePartRaw.match(/\((O|C)\)\s*$/i);
    const opennessCode = opennessMatch ? opennessMatch[1].toUpperCase() : null;
    const name = namePartRaw.replace(/\((O|C)\)\s*$/i, "").trim();
    if (!name) {
      continue;
    }

    const stateFromAddress = addressRaw.match(/\b([A-Z]{2})\b/);
    const postalFromAddress = addressRaw.match(/\b\d{5}(?:-\d{4})?\b/);
    const isOnline = /virtual|zoom|online/i.test(addressRaw);

    parsedEntries.push({
      slug: slugify(`${cityFromUrl ?? "montana"}-${name}-${dayMatch[1]}-${time24}`),
      name,
      day: dayIndex,
      time: time24,
      formatted_address: isOnline ? "Online" : addressRaw,
      address: isOnline ? null : addressRaw,
      city: cityFromUrl,
      state: stateFromAddress?.[1] ?? "MT",
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

function buildGeocodeQuery(entry: NormalizedMeeting): string | null {
  if (entry.lat !== null && entry.lng !== null) {
    return null;
  }
  if ((entry.formattedAddress ?? "").toLowerCase() === "online") {
    return null;
  }

  const parts = [
    entry.formattedAddress,
    entry.address,
    entry.city,
    entry.state,
    entry.postalCode,
    entry.country,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (parts.length === 0) {
    return null;
  }

  return Array.from(new Set(parts)).join(", ");
}

async function geocodeWithOpenStreetMap(options: {
  query: string;
  fetchImpl: FetchLike;
}): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(options.query)}`;
  const response = await options.fetchImpl(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Recovery-Accountability-Dev/0.1",
    },
  });
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const first = payload[0] as { lat?: string; lon?: string } | undefined;
  if (!first) {
    return null;
  }

  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

const BUILTIN_MEETING_GUIDE_FEEDS: Record<string, unknown[]> = {
  "builtin://billings-test": [
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
  ],
};

function extractEntries(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (typeof payload === "object" && payload !== null) {
    const recordPayload = payload as Record<string, unknown>;
    if (Array.isArray(recordPayload.meetings)) {
      return recordPayload.meetings;
    }
  }
  return [];
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
}): Promise<IngestMeetingGuideResult> {
  const now = options.now ?? (() => new Date());
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const logger = options.logger;
  const geocodeCache = new Map<string, { lat: number; lng: number } | null>();

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

  const ingestEntriesForFeed = async (feedId: string, entries: unknown[], feedUrl: string) => {
    meetingsFetched += entries.length;

    let normalized: NormalizedMeeting[] = entries
      .map((entry) => normalizeMeetingGuideMeeting(entry))
      .filter((entry): entry is NormalizedMeeting => Boolean(entry));

    if (options.geocodeMissingCoordinates) {
      const geocodedEntries: NormalizedMeeting[] = [];
      for (const entry of normalized) {
        const geocodeQuery = buildGeocodeQuery(entry);
        if (!geocodeQuery) {
          geocodedEntries.push(entry);
          continue;
        }

        let coordinates = geocodeCache.get(geocodeQuery);
        if (coordinates === undefined) {
          try {
            coordinates = await geocodeWithOpenStreetMap({
              query: geocodeQuery,
              fetchImpl,
            });
          } catch {
            coordinates = null;
          }
          geocodeCache.set(geocodeQuery, coordinates);
        }

        if (coordinates) {
          geocodedEntries.push({
            ...entry,
            lat: coordinates.lat,
            lng: coordinates.lng,
          });
        } else {
          geocodedEntries.push(entry);
        }
      }
      normalized = geocodedEntries;
    }
    meetingsImported += normalized.length;
    meetingsSkipped += entries.length - normalized.length;

    const withCoordinates = normalized.filter(
      (meeting) => meeting.lat !== null && meeting.lng !== null,
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
    });

    if (withoutCoordinates > 0) {
      logger?.warn?.("meeting_guide.ingest.feed_missing_coordinates", {
        tenantId: options.tenantId,
        feedId,
        feedUrl,
        withoutCoordinates,
        note: "Meetings without coordinates are stored with geo_status=missing and excluded from /v1/meetings/nearby.",
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
  logger?.info("meeting_guide.ingest.complete", result);
  return result;
}
