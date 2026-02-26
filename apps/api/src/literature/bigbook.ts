import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const PAGE_RANGE_MAX_SIZE = 25;

const pageSchema = z.object({
  page: z.number().int().positive(),
  html: z.string().min(1),
});

const fileSchema = z.object({
  edition: z.string().min(1),
  updatedAt: z.string().datetime(),
  copyrightNotice: z.string().min(1),
  pages: z.array(pageSchema),
});

export type BigBookPage = z.infer<typeof pageSchema>;
export type BigBookContentFile = z.infer<typeof fileSchema>;

let cachedContent: BigBookContentFile | null = null;
const ALLOWED_TAGS = new Set(["h1", "h2", "h3", "p", "em", "strong", "ul", "ol", "li", "br"]);

function sanitizeHtml(html: string): string {
  const withoutScripts = html
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script>/gi, "")
    .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style>/gi, "");

  return withoutScripts.replace(/<\/?([a-z0-9-]+)(\s[^>]*)?>/gi, (full, rawTag: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      return "";
    }

    const isClosing = full.startsWith("</");
    const isSelfClosing = full.endsWith("/>");
    if (tag === "br") {
      return "<br>";
    }
    if (isClosing) {
      return `</${tag}>`;
    }
    if (isSelfClosing) {
      return `<${tag}>`;
    }
    return `<${tag}>`;
  });
}

function getCandidatePaths(): string[] {
  const relativePath = path.join("literature", "bigbook", "edition-aaws-4", "pages-60-63.json");
  return [
    path.resolve(process.cwd(), "src", relativePath),
    path.resolve(process.cwd(), "apps", "api", "src", relativePath),
    path.resolve(__dirname, relativePath),
    path.resolve(__dirname, "..", relativePath),
  ];
}

async function loadRawContentFile(): Promise<BigBookContentFile> {
  const candidates = getCandidatePaths();
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, "utf8");
      const parsed = fileSchema.parse(JSON.parse(raw) as unknown);
      return parsed;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Unable to load Big Book content file from known paths. Last error: ${String(lastError)}`,
  );
}

export async function loadBigBookContent(): Promise<BigBookContentFile> {
  if (cachedContent) {
    return cachedContent;
  }
  cachedContent = await loadRawContentFile();
  return cachedContent;
}

export const bigBookPagesQuerySchema = z
  .object({
    start: z.coerce.number().int().positive(),
    end: z.coerce.number().int().positive(),
  })
  .superRefine((value, context) => {
    if (value.start > value.end) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "start must be less than or equal to end",
        path: ["start"],
      });
    }

    if (value.end - value.start > PAGE_RANGE_MAX_SIZE) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Requested range is too large. Maximum end-start is ${PAGE_RANGE_MAX_SIZE}`,
        path: ["end"],
      });
    }
  });

export async function getBigBookPagesForRange(start: number, end: number) {
  const content = await loadBigBookContent();
  const pagesByNumber = new Map(content.pages.map((entry) => [entry.page, entry] as const));
  const pages: Array<{ page: number; html: string }> = [];

  for (let page = start; page <= end; page += 1) {
    const entry = pagesByNumber.get(page);
    if (entry) {
      pages.push({ page: entry.page, html: sanitizeHtml(entry.html) });
    }
  }

  return {
    edition: content.edition,
    updatedAt: content.updatedAt,
    copyrightNotice: content.copyrightNotice,
    start,
    end,
    pages,
  };
}
