import { describe, expect, it, vi } from "vitest";
import { ingestMeetingGuideFeedsForTenant } from "../src/meeting-guide-ingest";

describe("meeting-guide ingest", () => {
  it("upserts configured feeds and ingests valid meetings", async () => {
    const repositories = {
      meetingFeeds: {
        upsert: vi.fn().mockResolvedValue(undefined),
        listActive: vi.fn().mockResolvedValue([
          {
            id: "feed-1",
            url: "https://example.org/meetings.json",
            etag: null,
            last_modified: null,
          },
        ]),
        markFetchResult: vi.fn().mockResolvedValue(undefined),
      },
      meetingGuideMeetings: {
        upsertForFeed: vi.fn().mockResolvedValue(1),
      },
    } as const;

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (header: string) =>
          header.toLowerCase() === "etag"
            ? "etag-1"
            : header.toLowerCase() === "last-modified"
              ? "Wed, 21 Oct 2026 07:28:00 GMT"
              : null,
      },
      json: async () => [
        {
          slug: "downtown-noon",
          name: "Downtown Noon",
          day: 2,
          time: "12:00",
          latitude: 40.1,
          longitude: -105.1,
        },
        {
          slug: "missing-name",
        },
      ],
    });

    const result = await ingestMeetingGuideFeedsForTenant({
      repositories: repositories as never,
      tenantId: "tenant-a",
      configuredFeeds: [{ name: "Example", url: "https://example.org/meetings.json" }],
      fetchImpl,
      now: () => new Date("2026-02-20T12:00:00.000Z"),
    });

    expect(result).toEqual({
      feedsAttempted: 1,
      feedsFailed: 0,
      meetingsFetched: 2,
      meetingsImported: 1,
      meetingsSkipped: 1,
      meetingsWithCoordinates: 1,
      meetingsWithoutCoordinates: 0,
    });
    expect(repositories.meetingFeeds.upsert).toHaveBeenCalledWith("tenant-a", {
      name: "Example",
      url: "https://example.org/meetings.json",
      entity: undefined,
      entityUrl: undefined,
      active: true,
    });
    expect(repositories.meetingGuideMeetings.upsertForFeed).toHaveBeenCalledTimes(1);
  });

  it("supports the built-in Billings test feed without external fetch", async () => {
    const repositories = {
      meetingFeeds: {
        upsert: vi.fn().mockResolvedValue(undefined),
        listActive: vi.fn().mockResolvedValue([
          {
            id: "feed-billings",
            url: "builtin://billings-test",
            etag: null,
            last_modified: null,
          },
        ]),
        markFetchResult: vi.fn().mockResolvedValue(undefined),
      },
      meetingGuideMeetings: {
        upsertForFeed: vi.fn().mockResolvedValue(4),
      },
    } as const;

    const fetchImpl = vi.fn();

    const result = await ingestMeetingGuideFeedsForTenant({
      repositories: repositories as never,
      tenantId: "tenant-a",
      configuredFeeds: [{ name: "Billings Test Feed", url: "builtin://billings-test" }],
      fetchImpl: fetchImpl as never,
      now: () => new Date("2026-02-20T12:00:00.000Z"),
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.feedsFailed).toBe(0);
    expect(result.meetingsFetched).toBeGreaterThan(0);
    expect(result.meetingsWithCoordinates).toBeGreaterThan(0);
    expect(repositories.meetingGuideMeetings.upsertForFeed).toHaveBeenCalledTimes(1);
  });
});
