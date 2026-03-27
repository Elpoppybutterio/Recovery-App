import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCAL_API_URL,
  DEFAULT_RENDER_API_URL,
  resolveMobileApiEnvironment,
  resolveRuntimeApiBaseUrl,
} from "../lib/apiEnvironment";

describe("mobile api environment selection", () => {
  it("defaults to Render for development when no explicit local override is set", () => {
    expect(
      resolveMobileApiEnvironment({
        appEnv: "development",
      }),
    ).toEqual({
      apiUrl: DEFAULT_RENDER_API_URL,
      selection: "render_default",
      localOverrideActive: false,
    });
  });

  it("allows localhost only when explicitly selected in development", () => {
    expect(
      resolveMobileApiEnvironment({
        appEnv: "development",
        apiBackendOverride: "local",
      }),
    ).toEqual({
      apiUrl: DEFAULT_LOCAL_API_URL,
      selection: "local_override",
      localOverrideActive: true,
    });
  });

  it("keeps preview and production on Render even if local override is requested", () => {
    expect(
      resolveMobileApiEnvironment({
        appEnv: "preview",
        apiBackendOverride: "local",
        localApiUrlOverride: "http://192.168.0.50:3031",
      }),
    ).toEqual({
      apiUrl: DEFAULT_RENDER_API_URL,
      selection: "render_default",
      localOverrideActive: false,
    });
    expect(
      resolveMobileApiEnvironment({
        appEnv: "production",
        apiBackendOverride: "local",
      }),
    ).toEqual({
      apiUrl: DEFAULT_RENDER_API_URL,
      selection: "render_default",
      localOverrideActive: false,
    });
  });

  it("uses the configured api url at runtime without any localhost inference", () => {
    expect(resolveRuntimeApiBaseUrl("https://sober-ai-api.onrender.com/")).toBe(
      DEFAULT_RENDER_API_URL,
    );
    expect(resolveRuntimeApiBaseUrl("http://127.0.0.1:3031/")).toBe(DEFAULT_LOCAL_API_URL);
    expect(resolveRuntimeApiBaseUrl("")).toBe(DEFAULT_RENDER_API_URL);
  });
});
