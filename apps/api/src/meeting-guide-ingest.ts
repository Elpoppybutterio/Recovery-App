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
}): Promise<IngestMeetingGuideResult> {
  const now = options.now ?? (() => new Date());
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const logger = options.logger;

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
  let feedsFailed = 0;
  let meetingsFetched = 0;
  let meetingsImported = 0;
  let meetingsSkipped = 0;
  let meetingsWithCoordinates = 0;
  let meetingsWithoutCoordinates = 0;

  const ingestEntriesForFeed = async (feedId: string, entries: unknown[], feedUrl: string) => {
    meetingsFetched += entries.length;

    const normalized = entries
      .map((entry) => normalizeMeetingGuideMeeting(entry))
      .filter((entry): entry is NonNullable<ReturnType<typeof normalizeMeetingGuideMeeting>> =>
        Boolean(entry),
      );
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

      const payload = await response.json();
      const entries = extractEntries(payload);
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
