export interface ImportedMeetingRecord {
  id: string;
  sourceFeed: string;
  slug: string;
  name: string;
  dayOfWeek: number;
  startsAtLocal: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  onlineUrl: string | null;
  importedAt: string;
}

export interface MeetingsIngestStore {
  upsertMeetings(records: ImportedMeetingRecord[]): Promise<void>;
}

interface LoggerLike {
  info(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (url: string) => Promise<FetchResponseLike>;

export interface IngestMeetingsFeedsOptions {
  feedUrls: string[];
  store: MeetingsIngestStore;
  fetchImpl?: FetchLike;
  now?: () => Date;
  logger?: LoggerLike;
}

export interface IngestMeetingsFeedsResult {
  feedsAttempted: number;
  feedsFailed: number;
  meetingsFetched: number;
  meetingsImported: number;
  meetingsSkipped: number;
}

export class InMemoryMeetingsIngestStore implements MeetingsIngestStore {
  private byKey = new Map<string, ImportedMeetingRecord>();

  async upsertMeetings(records: ImportedMeetingRecord[]): Promise<void> {
    for (const record of records) {
      this.byKey.set(`${record.sourceFeed}::${record.slug}`, { ...record });
    }
  }

  snapshot(): ImportedMeetingRecord[] {
    return Array.from(this.byKey.values()).sort((left, right) => left.id.localeCompare(right.id));
  }
}

export function parseMeetingFeedUrls(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  const seen = new Set<string>();
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .filter((item) => {
      if (seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeDayOfWeek(value: unknown): number {
  const day = asNumber(value);
  if (day === null) {
    return new Date().getDay();
  }
  if (day >= 0 && day <= 6) {
    return day;
  }
  if (day >= 1 && day <= 7) {
    return day % 7;
  }
  return new Date().getDay();
}

function normalizeTime(value: unknown): string {
  const text = asString(value);
  if (!text) {
    return "19:00";
  }

  const hhmm = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!hhmm) {
    return "19:00";
  }
  const hour = Number(hhmm[1]);
  const minute = Number(hhmm[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23) {
    return "19:00";
  }
  if (minute < 0 || minute > 59) {
    return "19:00";
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function extractFeedEntries(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const objectPayload = asObject(payload);
  if (!objectPayload) {
    return [];
  }
  if (Array.isArray(objectPayload.meetings)) {
    return objectPayload.meetings;
  }
  if (Array.isArray(objectPayload.items)) {
    return objectPayload.items;
  }
  return [];
}

function normalizeEntry(
  entry: unknown,
  sourceFeed: string,
  importedAt: string,
): ImportedMeetingRecord | null {
  const input = asObject(entry);
  if (!input) {
    return null;
  }

  const slug = asString(input.slug);
  const name = asString(input.name);
  if (!slug || !name) {
    return null;
  }

  const dayOfWeek = normalizeDayOfWeek(input.weekday_tinyint ?? input.day ?? input.dayOfWeek);
  const startsAtLocal = normalizeTime(input.start_time ?? input.time ?? input.startsAtLocal);
  const lat = asNumber(input.latitude ?? input.lat);
  const lng = asNumber(input.longitude ?? input.lng);

  return {
    id: `${sourceFeed}::${slug}`,
    sourceFeed,
    slug,
    name,
    dayOfWeek,
    startsAtLocal,
    address: asString(input.formatted_address ?? input.address),
    lat,
    lng,
    onlineUrl: asString(input.virtual_meeting_link ?? input.url ?? input.onlineUrl),
    importedAt,
  };
}

export async function ingestMeetingsFeeds(
  options: IngestMeetingsFeedsOptions,
): Promise<IngestMeetingsFeedsResult> {
  const fetchImpl = options.fetchImpl ?? ((url: string) => fetch(url));
  const now = options.now ?? (() => new Date());
  const log = options.logger;

  let feedsFailed = 0;
  let meetingsFetched = 0;
  let meetingsImported = 0;
  let meetingsSkipped = 0;

  for (const feedUrl of options.feedUrls) {
    try {
      const response = await fetchImpl(feedUrl);
      if (!response.ok) {
        feedsFailed += 1;
        log?.error("meetings.ingest.feed_failed", {
          feedUrl,
          status: response.status,
        });
        continue;
      }

      const payload = await response.json();
      const entries = extractFeedEntries(payload);
      meetingsFetched += entries.length;

      const importedAt = now().toISOString();
      const normalized = entries
        .map((entry) => normalizeEntry(entry, feedUrl, importedAt))
        .filter((entry): entry is ImportedMeetingRecord => entry !== null);
      meetingsImported += normalized.length;
      meetingsSkipped += entries.length - normalized.length;

      if (normalized.length > 0) {
        await options.store.upsertMeetings(normalized);
      }
    } catch (error) {
      feedsFailed += 1;
      log?.error("meetings.ingest.feed_exception", {
        feedUrl,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  const result: IngestMeetingsFeedsResult = {
    feedsAttempted: options.feedUrls.length,
    feedsFailed,
    meetingsFetched,
    meetingsImported,
    meetingsSkipped,
  };
  log?.info("meetings.ingest.complete", { ...result });
  return result;
}
