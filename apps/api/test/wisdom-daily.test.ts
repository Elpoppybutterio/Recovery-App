import { describe, expect, it } from "vitest";
import { getAllNormalizedWisdomQuotes, normalizeWisdomText } from "../src/wisdom";
import { createTestApp, createTestDb, seedCoreFixtures } from "./test-helpers";

describe("GET /api/wisdom/daily", () => {
  it("returns a deterministic quote for date + timezone", async () => {
    const db = await createTestDb();
    await seedCoreFixtures(db);
    const app = createTestApp(db);

    const first = await app.inject({
      method: "GET",
      url: "/api/wisdom/daily?date=2026-02-28&tz=America/Denver",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
    });
    const second = await app.inject({
      method: "GET",
      url: "/api/wisdom/daily?date=2026-02-28&tz=America/Denver",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    const payload = first.json() as {
      id: string;
      date: string;
      tz: string;
      index: number;
      text: string;
    };
    const secondPayload = second.json() as {
      id: string;
      index: number;
      text: string;
    };

    expect(payload.date).toBe("2026-02-28");
    expect(payload.tz).toBe("America/Denver");
    expect(payload.index).toBeGreaterThanOrEqual(0);
    expect(payload.index).toBeLessThan(9);
    expect(payload.id).toBe(`wisdom_2026-02-28_${String(payload.index).padStart(2, "0")}`);
    expect(payload.text.trim().length).toBeGreaterThan(0);
    expect(payload.index).toBe(secondPayload.index);
    expect(payload.text).toBe(secondPayload.text);

    await app.close();
    await db.end?.();
  });

  it("rejects invalid date and timezone query values", async () => {
    const db = await createTestDb();
    await seedCoreFixtures(db);
    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/api/wisdom/daily?date=2026-02-31&tz=Nope/Not-A-Timezone",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
    });

    expect(response.statusCode).toBe(400);

    await app.close();
    await db.end?.();
  });

  it("defaults timezone to America/Denver when tz is omitted", async () => {
    const db = await createTestDb();
    await seedCoreFixtures(db);
    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/api/wisdom/daily?date=2026-02-28",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as { tz: string };
    expect(payload.tz).toBe("America/Denver");

    await app.close();
    await db.end?.();
  });

  it("returns 400 when date format is invalid", async () => {
    const db = await createTestDb();
    await seedCoreFixtures(db);
    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/api/wisdom/daily?date=20260228&tz=America/Denver",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
    });

    expect(response.statusCode).toBe(400);

    await app.close();
    await db.end?.();
  });

  it("yields potentially different quote selection for a different date", async () => {
    const db = await createTestDb();
    await seedCoreFixtures(db);
    const app = createTestApp(db);

    const first = await app.inject({
      method: "GET",
      url: "/api/wisdom/daily?date=2026-02-28&tz=America/Denver",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
    });
    expect(first.statusCode).toBe(200);
    const left = first.json() as { index: number; text: string };

    const candidateDates = [
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
    ];
    let foundDifferent = false;
    for (const date of candidateDates) {
      const response = await app.inject({
        method: "GET",
        url: `/api/wisdom/daily?date=${date}&tz=America/Denver`,
        headers: {
          authorization: "Bearer DEV_enduser-a1",
        },
      });
      expect(response.statusCode).toBe(200);
      const candidate = response.json() as { index: number; text: string };
      if (candidate.index !== left.index || candidate.text !== left.text) {
        foundDifferent = true;
        break;
      }
    }

    expect(foundDifferent).toBe(true);

    await app.close();
    await db.end?.();
  });
});

describe("wisdom normalization", () => {
  it("normalizes first and second person pronouns to first-person plural", () => {
    expect(
      normalizeWisdomText("If you think I'll quit, you're wrong. I trust my Higher Power."),
    ).toBe("If we think we'll quit, we're wrong. We trust our Higher Power.");
  });

  it("provides exactly the canonical nine-item quote set", () => {
    const all = getAllNormalizedWisdomQuotes();
    expect(all).toHaveLength(9);
  });
});
