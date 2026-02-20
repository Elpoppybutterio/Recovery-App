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
  }
  return [];
}

export function parseConfiguredMeetingGuideFeeds(rawJson: string): MeetingGuideFeedConfig[] {
  return parseMeetingGuideFeedsJson(rawJson);
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

  for (const feed of feeds) {
    const requestHeaders: Record<string, string> = {};
    if (feed.etag) {
      requestHeaders["if-none-match"] = feed.etag;
    }
    if (feed.last_modified) {
      requestHeaders["if-modified-since"] = feed.last_modified;
    }

    try {
      const response = await fetchImpl(feed.url, {
        headers: requestHeaders,
      });

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
      meetingsFetched += entries.length;

      const normalized = entries
        .map((entry) => normalizeMeetingGuideMeeting(entry))
        .filter((entry): entry is NonNullable<ReturnType<typeof normalizeMeetingGuideMeeting>> =>
          Boolean(entry),
        );
      meetingsImported += normalized.length;
      meetingsSkipped += entries.length - normalized.length;

      const ingestedCount = await options.repositories.meetingGuideMeetings.upsertForFeed(
        options.tenantId,
        feed.id,
        normalized,
        now(),
      );

      await options.repositories.meetingFeeds.markFetchResult(options.tenantId, feed.id, {
        fetchedAt: now(),
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        lastError: null,
      });

      logger?.info("meeting_guide.ingest.feed_complete", {
        tenantId: options.tenantId,
        feedId: feed.id,
        feedUrl: feed.url,
        ingestedCount,
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
  };
  logger?.info("meeting_guide.ingest.complete", result);
  return result;
}
