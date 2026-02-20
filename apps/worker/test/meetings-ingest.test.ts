import { describe, expect, it, vi } from "vitest";
import {
  InMemoryMeetingsIngestStore,
  ingestMeetingsFeeds,
  parseMeetingFeedUrls,
} from "../src/meetings-ingest";

describe("parseMeetingFeedUrls", () => {
  it("splits comma-separated URLs and removes blanks/duplicates", () => {
    expect(
      parseMeetingFeedUrls(
        " https://aa.example/meetings.json,https://na.example/meetings.json,,https://aa.example/meetings.json ",
      ),
    ).toEqual(["https://aa.example/meetings.json", "https://na.example/meetings.json"]);
  });
});

describe("ingestMeetingsFeeds", () => {
  it("normalizes valid records and skips invalid entries", async () => {
    const store = new InMemoryMeetingsIngestStore();
    const fetchImpl = vi.fn(async (url: string) => {
      if (url !== "https://aa.example/meetings.json") {
        throw new Error("unexpected url");
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          meetings: [
            {
              slug: "daily-noon",
              name: "Daily Noon",
              weekday_tinyint: 2,
              start_time: "12:00",
              latitude: 40.1,
              longitude: -105.1,
              formatted_address: "123 Main St",
            },
            {
              slug: "missing-name",
            },
          ],
        }),
      };
    });

    const result = await ingestMeetingsFeeds({
      feedUrls: ["https://aa.example/meetings.json"],
      store,
      fetchImpl,
      now: () => new Date("2026-02-20T17:00:00.000Z"),
      logger: { info: vi.fn(), error: vi.fn() },
    });

    expect(result).toEqual({
      feedsAttempted: 1,
      feedsFailed: 0,
      meetingsFetched: 2,
      meetingsImported: 1,
      meetingsSkipped: 1,
    });

    expect(store.snapshot()).toEqual([
      {
        id: "https://aa.example/meetings.json::daily-noon",
        sourceFeed: "https://aa.example/meetings.json",
        slug: "daily-noon",
        name: "Daily Noon",
        dayOfWeek: 2,
        startsAtLocal: "12:00",
        address: "123 Main St",
        lat: 40.1,
        lng: -105.1,
        onlineUrl: null,
        importedAt: "2026-02-20T17:00:00.000Z",
      },
    ]);
  });

  it("reports feed failures without throwing", async () => {
    const store = new InMemoryMeetingsIngestStore();
    const logger = { info: vi.fn(), error: vi.fn() };
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));

    const result = await ingestMeetingsFeeds({
      feedUrls: ["https://broken.example/feed.json"],
      store,
      fetchImpl,
      logger,
    });

    expect(result).toEqual({
      feedsAttempted: 1,
      feedsFailed: 1,
      meetingsFetched: 0,
      meetingsImported: 0,
      meetingsSkipped: 0,
    });
    expect(store.snapshot()).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith("meetings.ingest.feed_failed", {
      feedUrl: "https://broken.example/feed.json",
      status: 503,
    });
  });
});
