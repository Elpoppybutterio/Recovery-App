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
      text: async () =>
        JSON.stringify([
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
        ]),
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

  it("parses AA Montana HTML table rows into meetings", async () => {
    const repositories = {
      meetingFeeds: {
        upsert: vi.fn().mockResolvedValue(undefined),
        listActive: vi.fn().mockResolvedValue([
          {
            id: "feed-aa-mt",
            url: "https://www.aa-montana.org/index.php?city=Billings",
            etag: null,
            last_modified: null,
          },
        ]),
        markFetchResult: vi.fn().mockResolvedValue(undefined),
      },
      meetingGuideMeetings: {
        upsertForFeed: vi
          .fn()
          .mockImplementation(async (_tenantId: string, _feedId: string, meetings: unknown[]) => {
            return meetings.length;
          }),
      },
    } as const;

    const html = `
      <html>
        <body>
          <table>
            <tbody id="fbody">
              <tr>
                <td>Recovery Group(C)</td>
                <td>Tuesday</td>
                <td></td>
                <td>8:00 pm</td>
                <td>131 Moore Lane</td>
              </tr>
              <tr>
                <td>Laurel Home Group(O)</td>
                <td>Wednesday</td>
                <td>AA literature study</td>
                <td>07:00 PM</td>
                <td>201 East Main St</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `;

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => html,
      json: async () => {
        throw new Error("not-json");
      },
    });

    const result = await ingestMeetingGuideFeedsForTenant({
      repositories: repositories as never,
      tenantId: "tenant-a",
      configuredFeeds: [
        {
          name: "AA Montana - Billings",
          url: "https://www.aa-montana.org/index.php?city=Billings",
        },
      ],
      fetchImpl,
      now: () => new Date("2026-02-20T12:00:00.000Z"),
    });

    expect(result).toEqual({
      feedsAttempted: 1,
      feedsFailed: 0,
      meetingsFetched: 2,
      meetingsImported: 2,
      meetingsSkipped: 0,
      meetingsWithCoordinates: 0,
      meetingsWithoutCoordinates: 2,
    });

    const meetingsArg = repositories.meetingGuideMeetings.upsertForFeed.mock.calls[0]?.[2] as
      | Array<{
          name: string;
          day: number | null;
          time: string | null;
          address: string | null;
          city: string | null;
          state: string | null;
          types: string[];
        }>
      | undefined;

    expect(meetingsArg).toBeDefined();
    expect(meetingsArg).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Recovery Group",
          day: 2,
          time: "20:00",
          address: "131 Moore Lane",
          city: "Billings",
          state: "MT",
          types: ["C"],
        }),
        expect.objectContaining({
          name: "Laurel Home Group",
          day: 3,
          time: "19:00",
          address: "201 East Main St",
          city: "Billings",
          state: "MT",
          types: ["O"],
        }),
      ]),
    );
  });

  it("geocodes missing coordinates and stores geo status/reason", async () => {
    const repositories = {
      meetingFeeds: {
        upsert: vi.fn().mockResolvedValue(undefined),
        listActive: vi.fn().mockResolvedValue([
          {
            id: "feed-geo",
            url: "https://example.org/geo.json",
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

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify([
            {
              slug: "missing-coords",
              name: "Missing Coordinates Meeting",
              day: 2,
              time: "19:00",
              formatted_address: "510 Cook Ave, Billings, MT 59101",
              city: "Billings",
              state: "MT",
              postal_code: "59101",
              country: "US",
            },
          ]),
        json: async () => [],
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => [{ lat: "45.7895", lon: "-108.4928" }],
        text: async () => "",
      });

    const result = await ingestMeetingGuideFeedsForTenant({
      repositories: repositories as never,
      tenantId: "tenant-a",
      configuredFeeds: [{ name: "Geo feed", url: "https://example.org/geo.json" }],
      fetchImpl,
      now: () => new Date("2026-02-20T12:00:00.000Z"),
      geocodeMissingCoordinates: true,
      geocodeUserAgent: "Recovery-Test/1.0",
    });

    expect(result).toEqual({
      feedsAttempted: 1,
      feedsFailed: 0,
      meetingsFetched: 1,
      meetingsImported: 1,
      meetingsSkipped: 0,
      meetingsWithCoordinates: 1,
      meetingsWithoutCoordinates: 0,
    });

    const meetingsArg = repositories.meetingGuideMeetings.upsertForFeed.mock.calls[0]?.[2] as
      | Array<{
          lat: number | null;
          lng: number | null;
          geoStatus?: string;
          geoReason?: string | null;
        }>
      | undefined;
    expect(meetingsArg?.[0]).toMatchObject({
      lat: 45.7895,
      lng: -108.4928,
      geoStatus: "ok",
      geoReason: null,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
