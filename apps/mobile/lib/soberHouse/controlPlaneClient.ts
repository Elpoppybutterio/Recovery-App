import type { SoberHouseSettingsStore } from "./types";
import { normalizeSoberHouseSettingsStore } from "./storage";

type FetchLike = typeof fetch;

type OperatorControlPlaneSnapshot = {
  organizationId: string;
  organizationName: string;
  store: SoberHouseSettingsStore;
  generatedAt: string;
};

function debugControlPlane(event: string, details: Record<string, unknown>) {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log(`[sober-house][control-plane] ${event}`, details);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function buildControlPlaneUrl(apiUrl: string, organizationId: string | null): string {
  const normalizedBaseUrl = apiUrl.replace(/\/+$/, "");
  const url = new URL(`${normalizedBaseUrl}/v1/operator/sober-house/control-plane`);
  if (organizationId) {
    url.searchParams.set("organizationId", organizationId);
  }
  return url.toString();
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const bodyText = await response.text();
  return bodyText.trim().length > 0 ? (JSON.parse(bodyText) as unknown) : null;
}

function parseSnapshot(payload: unknown): OperatorControlPlaneSnapshot {
  if (!isRecord(payload) || !isRecord(payload.session) || !isRecord(payload.data)) {
    throw new Error("Operator control plane returned an invalid payload.");
  }

  const organizationId = readString(payload.session.organizationId);
  const organizationName = readString(payload.session.organizationName);
  if (!organizationId || !organizationName) {
    throw new Error("Operator control plane response is missing organization scope.");
  }

  const store = normalizeSoberHouseSettingsStore(payload.data.store);
  const generatedAt = readString(payload.generatedAt) ?? new Date().toISOString();
  return {
    organizationId,
    organizationName,
    store,
    generatedAt,
  };
}

function buildErrorMessage(status: number, payload: unknown, fallback: string): string {
  if (isRecord(payload)) {
    const message = readString(payload.message);
    if (message) {
      return message;
    }
  }

  return `${fallback} (${status}).`;
}

export async function loadOperatorControlPlaneSnapshot(input: {
  apiUrl: string;
  authHeader: string;
  organizationId?: string | null;
  fetchImpl?: FetchLike;
}): Promise<OperatorControlPlaneSnapshot> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = buildControlPlaneUrl(input.apiUrl, input.organizationId ?? null);
  debugControlPlane("load.request", {
    url,
    organizationId: input.organizationId ?? null,
  });

  const response = await fetchImpl(url, {
    headers: {
      Authorization: input.authHeader,
    },
    cache: "no-store",
  });
  const payload = await readJsonPayload(response);
  if (!response.ok) {
    debugControlPlane("load.error", {
      status: response.status,
      organizationId: input.organizationId ?? null,
    });
    throw new Error(
      buildErrorMessage(response.status, payload, "Unable to load sober-house control plane"),
    );
  }

  const snapshot = parseSnapshot(payload);
  debugControlPlane("load.success", {
    organizationId: snapshot.organizationId,
    houseIds: snapshot.store.houses.map((house) => house.id),
    houseCount: snapshot.store.houses.length,
  });
  return snapshot;
}

export async function persistOperatorControlPlaneSnapshot(input: {
  apiUrl: string;
  authHeader: string;
  organizationId?: string | null;
  store: SoberHouseSettingsStore;
  fetchImpl?: FetchLike;
}): Promise<OperatorControlPlaneSnapshot> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = buildControlPlaneUrl(input.apiUrl, input.organizationId ?? null);
  debugControlPlane("save.request", {
    url,
    organizationId: input.organizationId ?? null,
    houseIds: input.store.houses.map((house) => house.id),
    houseCount: input.store.houses.length,
  });

  const response = await fetchImpl(url, {
    method: "PUT",
    headers: {
      Authorization: input.authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      store: input.store,
    }),
  });
  const payload = await readJsonPayload(response);
  if (!response.ok) {
    debugControlPlane("save.error", {
      status: response.status,
      organizationId: input.organizationId ?? null,
    });
    throw new Error(
      buildErrorMessage(response.status, payload, "Unable to persist sober-house control plane"),
    );
  }

  const snapshot = parseSnapshot(payload);
  debugControlPlane("save.success", {
    organizationId: snapshot.organizationId,
    houseIds: snapshot.store.houses.map((house) => house.id),
    houseCount: snapshot.store.houses.length,
    generatedAt: snapshot.generatedAt,
  });
  return snapshot;
}
