export type MobileAppEnv = "development" | "preview" | "production";
export type ApiBackendSelection = "render_default" | "local_override";

export const DEFAULT_RENDER_API_URL = "https://sober-ai-api.onrender.com";
export const DEFAULT_LOCAL_API_URL = "http://127.0.0.1:3031";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeApiUrl(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return trimTrailingSlashes(fallback);
  }
  return trimTrailingSlashes(trimmed);
}

export function resolveMobileApiEnvironment(input: {
  appEnv: MobileAppEnv;
  apiBackendOverride?: string;
  localApiUrlOverride?: string;
}): {
  apiUrl: string;
  selection: ApiBackendSelection;
  localOverrideActive: boolean;
} {
  const backendOverride = input.apiBackendOverride?.trim().toLowerCase();
  if (backendOverride === "local" && input.appEnv === "development") {
    return {
      apiUrl: normalizeApiUrl(input.localApiUrlOverride, DEFAULT_LOCAL_API_URL),
      selection: "local_override",
      localOverrideActive: true,
    };
  }

  return {
    apiUrl: DEFAULT_RENDER_API_URL,
    selection: "render_default",
    localOverrideActive: false,
  };
}

export function resolveRuntimeApiBaseUrl(configuredApiUrl: string): string {
  return normalizeApiUrl(configuredApiUrl, DEFAULT_RENDER_API_URL);
}
