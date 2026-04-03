import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, PUT } from "./route";

describe("operator control-plane proxy route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns a 500 json error when no upstream api base url is configured", async () => {
    const response = await GET(
      new Request("https://dashboard.local/api/operator/sober-house/control-plane"),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "server_misconfigured",
      message: "Dashboard operator proxy is missing an upstream API base URL.",
    });
  });

  it("proxies get requests through the same-origin route and strips unsafe upstream headers", async () => {
    vi.stubEnv("OPERATOR_API_BASE_URL", "https://sober-ai-api.onrender.com");
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe(
        "https://sober-ai-api.onrender.com/v1/operator/sober-house/control-plane?organizationId=org-1",
      );
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer DEV_demo");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-encoding": "gzip",
          "content-length": "14",
          "transfer-encoding": "chunked",
          connection: "keep-alive",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request(
        "https://dashboard.local/api/operator/sober-house/control-plane?organizationId=org-1",
        {
          headers: {
            authorization: "Bearer DEV_demo",
          },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("transfer-encoding")).toBeNull();
    expect(response.headers.get("connection")).toBeNull();
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("preserves upstream status codes for put responses", async () => {
    vi.stubEnv("OPERATOR_API_BASE_URL", "https://sober-ai-api.onrender.com");
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("PUT");
      expect(init?.body).toBe(JSON.stringify({ store: { version: 16 } }));
      return new Response(JSON.stringify({ message: "Forbidden" }), {
        status: 403,
        headers: {
          "content-type": "application/json",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await PUT(
      new Request("https://dashboard.local/api/operator/sober-house/control-plane", {
        method: "PUT",
        headers: {
          authorization: "Bearer DEV_demo",
          "content-type": "application/json",
        },
        body: JSON.stringify({ store: { version: 16 } }),
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ message: "Forbidden" });
  });

  it("returns a 502 json error when the upstream response is not valid json", async () => {
    vi.stubEnv("OPERATOR_API_BASE_URL", "https://sober-ai-api.onrender.com");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not-json", { status: 200 })),
    );

    const response = await GET(
      new Request("https://dashboard.local/api/operator/sober-house/control-plane"),
    );

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "bad_gateway",
      message: "Dashboard API could not decode upstream response.",
    });
  });
});
