import { describe, expect, it } from "vitest";
import { createTestApp, createTestDb, seedCoreFixtures } from "./test-helpers";

describe("GET /v1/literature/bigbook/pages", () => {
  it("returns page-numbered HTML for pages 60-63", async () => {
    const db = await createTestDb();
    await seedCoreFixtures(db);
    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/literature/bigbook/pages?start=60&end=63",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
    });

    expect(response.statusCode).toBe(200);

    const payload = response.json() as {
      edition: string;
      pages: Array<{ page: number; html: string }>;
    };

    expect(payload.edition.length).toBeGreaterThan(0);
    expect(payload.pages).toHaveLength(4);
    expect(payload.pages.map((entry) => entry.page)).toEqual([60, 61, 62, 63]);
    expect(payload.pages.every((entry) => entry.html.trim().length > 0)).toBe(true);

    await app.close();
    await db.end?.();
  });

  it("rejects oversized page ranges", async () => {
    const db = await createTestDb();
    await seedCoreFixtures(db);
    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/literature/bigbook/pages?start=60&end=90",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
    });

    expect(response.statusCode).toBe(400);

    await app.close();
    await db.end?.();
  });
});
