import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PUT } from "./route";

describe("operator control-plane proxy route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("fails clearly when OPERATOR_API_BASE_URL is missing", async () => {
    vi.stubEnv("OPERATOR_API_BASE_URL", "");

    const response = await GET(
      new NextRequest("http://localhost:3000/api/operator/sober-house/control-plane"),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "operator_api_base_url_missing",
      message: "OPERATOR_API_BASE_URL is required for the sober-house control-plane proxy route.",
    });
  });

  it("proxies GET with the exact authorization header and organizationId", async () => {
    vi.stubEnv("OPERATOR_API_BASE_URL", "https://sober-ai-api.onrender.com");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json", "x-upstream": "api" },
      }),
    );

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/operator/sober-house/control-plane?organizationId=org-alpine",
        {
          headers: {
            authorization: "Bearer DEV_enduser-a1",
          },
        },
      ),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://sober-ai-api.onrender.com/v1/operator/sober-house/control-plane?organizationId=org-alpine",
    );
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get("authorization")).toBe("Bearer DEV_enduser-a1");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-upstream")).toBe("api");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("proxies PUT with the request body and upstream status", async () => {
    vi.stubEnv("OPERATOR_API_BASE_URL", "https://sober-ai-api.onrender.com");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ saved: true }), {
        status: 202,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await PUT(
      new NextRequest(
        "http://localhost:3000/api/operator/sober-house/control-plane?organizationId=org-alpine",
        {
          method: "PUT",
          headers: {
            authorization: "Bearer DEV_enduser-a1",
            "content-type": "application/json",
          },
          body: JSON.stringify({ store: { version: 16, organization: { id: "org-alpine" } } }),
        },
      ),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get("authorization")).toBe("Bearer DEV_enduser-a1");
    expect(headers.get("content-type")).toBe("application/json");
    expect(init?.body).toBe(
      JSON.stringify({ store: { version: 16, organization: { id: "org-alpine" } } }),
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ saved: true });
  });
});
