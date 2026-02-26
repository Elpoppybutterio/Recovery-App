import { describe, expect, it } from "vitest";
import {
  buildBigBookPagesUrl,
  clampBigBookPage,
  loadBigBookPagesWithCache,
  persistLastBigBookPage,
  persistCachedBigBookPages,
  readLastBigBookPage,
  type BigBookPagesPayload,
  type StorageLike,
} from "../lib/literature/bigBookReader";

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike {
  const state = new Map(Object.entries(initial));
  return {
    async getItem(key: string) {
      return state.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      state.set(key, value);
    },
  };
}

describe("bigBookReader utils", () => {
  it("builds the API URL for a page range", () => {
    const url = buildBigBookPagesUrl("https://sober-ai-api.onrender.com/", 60, 63);
    expect(url).toBe(
      "https://sober-ai-api.onrender.com/v1/literature/bigbook/pages?start=60&end=63",
    );
  });

  it("falls back to cached pages when API fails", async () => {
    const cached: BigBookPagesPayload = {
      edition: "aaws-4th-edition",
      updatedAt: "2026-02-26T00:00:00.000Z",
      copyrightNotice: "Licensed",
      range: { start: 60, end: 63 },
      pages: [
        { page: 60, html: "<p>Page 60</p>" },
        { page: 61, html: "<p>Page 61</p>" },
      ],
    };

    const storage = createMemoryStorage();
    await persistCachedBigBookPages(storage, cached);

    const loaded = await loadBigBookPagesWithCache({
      storage,
      apiUrl: "https://api.example.com",
      authHeader: "Bearer DEV_enduser-a1",
      startPage: 60,
      endPage: 63,
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });

    expect(loaded.source).toBe("cache");
    expect(loaded.payload.pages[0]?.page).toBe(60);
  });

  it("clamps pagination boundaries to the requested range", () => {
    expect(clampBigBookPage(55, 60, 63)).toBe(60);
    expect(clampBigBookPage(61, 60, 63)).toBe(61);
    expect(clampBigBookPage(80, 60, 63)).toBe(63);
  });

  it("persists and restores last page for resume behavior", async () => {
    const storage = createMemoryStorage();
    await persistLastBigBookPage(storage, 60, 63, 62);

    const restored = await readLastBigBookPage(storage, 60, 63);
    expect(restored).toBe(62);
  });
});
