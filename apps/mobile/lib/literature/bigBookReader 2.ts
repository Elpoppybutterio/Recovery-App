export type BigBookPagePayload = {
  page: number;
  html: string;
};

export type BigBookPagesPayload = {
  edition: string;
  updatedAt: string;
  copyrightNotice: string;
  range: {
    start: number;
    end: number;
  };
  pages: BigBookPagePayload[];
};

export type StorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

type LoadBigBookPagesWithCacheOptions = {
  storage: StorageLike;
  apiUrl: string;
  authHeader: string;
  startPage: number;
  endPage: number;
  fetchImpl?: FetchLike;
};

const RANGE_POINTER_PREFIX = "bigbook:range:";
const LAST_PAGE_PREFIX = "bigbook:lastPage:";

function normalizeApiUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function buildBigBookPagesUrl(apiUrl: string, startPage: number, endPage: number): string {
  const query = new URLSearchParams();
  query.set("start", String(startPage));
  query.set("end", String(endPage));
  return `${normalizeApiUrl(apiUrl)}/v1/literature/bigbook/pages?${query.toString()}`;
}

export function clampBigBookPage(page: number, startPage: number, endPage: number): number {
  if (page < startPage) {
    return startPage;
  }
  if (page > endPage) {
    return endPage;
  }
  return page;
}

function buildRangeId(startPage: number, endPage: number): string {
  return `${startPage}-${endPage}`;
}

function buildRangePointerKey(startPage: number, endPage: number): string {
  return `${RANGE_POINTER_PREFIX}${buildRangeId(startPage, endPage)}`;
}

export function buildBigBookCacheKey(edition: string, startPage: number, endPage: number): string {
  return `bigbook:${edition}:${buildRangeId(startPage, endPage)}`;
}

export function buildBigBookLastPageKey(startPage: number, endPage: number): string {
  return `${LAST_PAGE_PREFIX}${buildRangeId(startPage, endPage)}`;
}

export async function readCachedBigBookPages(
  storage: StorageLike,
  startPage: number,
  endPage: number,
): Promise<BigBookPagesPayload | null> {
  const pointerKey = buildRangePointerKey(startPage, endPage);
  const pointedEdition = await storage.getItem(pointerKey);
  const keysToTry = pointedEdition
    ? [buildBigBookCacheKey(pointedEdition, startPage, endPage)]
    : [
        buildBigBookCacheKey("aaws-4th-edition", startPage, endPage),
        buildBigBookCacheKey("edition-1", startPage, endPage),
      ];

  for (const key of keysToTry) {
    const raw = await storage.getItem(key);
    if (!raw) {
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as BigBookPagesPayload;
      if (
        typeof parsed.edition === "string" &&
        parsed.edition.length > 0 &&
        Array.isArray(parsed.pages)
      ) {
        return parsed;
      }
    } catch {
      // ignore malformed cache
    }
  }

  return null;
}

export async function persistCachedBigBookPages(
  storage: StorageLike,
  payload: BigBookPagesPayload,
): Promise<void> {
  const pointerKey = buildRangePointerKey(payload.range.start, payload.range.end);
  const cacheKey = buildBigBookCacheKey(payload.edition, payload.range.start, payload.range.end);
  await storage.setItem(cacheKey, JSON.stringify(payload));
  await storage.setItem(pointerKey, payload.edition);
}

export async function readLastBigBookPage(
  storage: StorageLike,
  startPage: number,
  endPage: number,
): Promise<number | null> {
  const raw = await storage.getItem(buildBigBookLastPageKey(startPage, endPage));
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return clampBigBookPage(parsed, startPage, endPage);
}

export async function persistLastBigBookPage(
  storage: StorageLike,
  startPage: number,
  endPage: number,
  page: number,
): Promise<void> {
  await storage.setItem(
    buildBigBookLastPageKey(startPage, endPage),
    String(clampBigBookPage(page, startPage, endPage)),
  );
}

export async function fetchBigBookPages(
  apiUrl: string,
  authHeader: string,
  startPage: number,
  endPage: number,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): Promise<BigBookPagesPayload> {
  const url = buildBigBookPagesUrl(apiUrl, startPage, endPage);
  const response = await fetchImpl(url, {
    headers: {
      Authorization: authHeader,
    },
  });

  if (!response.ok) {
    throw new Error(`Big Book API failed (${response.status})`);
  }

  const payload = (await response.json()) as BigBookPagesPayload;
  if (
    !payload ||
    typeof payload.edition !== "string" ||
    payload.edition.length === 0 ||
    typeof payload.updatedAt !== "string" ||
    payload.updatedAt.length === 0 ||
    typeof payload.copyrightNotice !== "string" ||
    payload.copyrightNotice.length === 0 ||
    !Array.isArray(payload.pages)
  ) {
    throw new Error("Big Book API returned an invalid response.");
  }

  return payload;
}

export async function loadBigBookPagesWithCache(
  options: LoadBigBookPagesWithCacheOptions,
): Promise<{ payload: BigBookPagesPayload; source: "api" | "cache" }> {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const cached = await readCachedBigBookPages(options.storage, options.startPage, options.endPage);

  try {
    const fresh = await fetchBigBookPages(
      options.apiUrl,
      options.authHeader,
      options.startPage,
      options.endPage,
      fetchImpl,
    );
    await persistCachedBigBookPages(options.storage, fresh);
    return { payload: fresh, source: "api" };
  } catch (error) {
    if (cached) {
      return { payload: cached, source: "cache" };
    }
    throw error;
  }
}
