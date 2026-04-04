import { afterEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";

describe("operator proof review proxy route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns a 500 json error when no upstream api base url is configured", async () => {
    const response = await PATCH(
      new Request("https://dashboard.local/api/operator/sober-house/proof-reviews/review-1", {
        method: "PATCH",
      }),
      { params: Promise.resolve({ reviewId: "review-1" }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "server_misconfigured",
      message: "Dashboard operator proxy is missing an upstream API base URL.",
    });
  });

  it("proxies patch requests through the same-origin route", async () => {
    vi.stubEnv("OPERATOR_API_BASE_URL", "https://sober-ai-api.onrender.com");
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe(
        "https://sober-ai-api.onrender.com/v1/operator/sober-house/proof-reviews/review-1",
      );
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer DEV_demo");
      expect(init?.method).toBe("PATCH");
      expect(init?.body).toBe(JSON.stringify({ reviewOutcome: "APPROVED" }));
      return new Response(JSON.stringify({ proofReview: { reviewId: "review-1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await PATCH(
      new Request("https://dashboard.local/api/operator/sober-house/proof-reviews/review-1", {
        method: "PATCH",
        headers: {
          authorization: "Bearer DEV_demo",
          "content-type": "application/json",
        },
        body: JSON.stringify({ reviewOutcome: "APPROVED" }),
      }),
      { params: Promise.resolve({ reviewId: "review-1" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      proofReview: { reviewId: "review-1" },
    });
  });
});
