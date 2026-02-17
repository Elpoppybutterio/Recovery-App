import { describe, expect, it } from "vitest";
import { createTestApp, createTestDb } from "./test-helpers";

describe("GET /health", () => {
  it("returns 200", async () => {
    const db = await createTestDb();
    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);

    await app.close();
    await db.end?.();
  });
});
