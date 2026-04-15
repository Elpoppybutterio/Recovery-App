import { describe, expect, it, vi } from "vitest";
import { createDefaultSoberHouseSettingsStore } from "../lib/soberHouse/defaults";
import {
  loadOperatorControlPlaneSnapshot,
  persistOperatorControlPlaneSnapshot,
} from "../lib/soberHouse/controlPlaneClient";

function createSnapshotPayload() {
  const store = createDefaultSoberHouseSettingsStore();
  store.organization = {
    id: "org-alpine",
    name: "Alpine Recovery Housing",
    primaryContactName: "",
    primaryPhone: "",
    primaryEmail: "",
    notes: "",
    status: "ACTIVE",
    createdAt: "2026-04-12T12:00:00.000Z",
    updatedAt: "2026-04-12T12:00:00.000Z",
  };
  store.houses = [
    {
      id: "house-alpine-2",
      organizationId: "org-alpine",
      houseGroupId: null,
      name: "Maple House",
      address: "123 Main St",
      phone: "",
      geofenceCenterLat: null,
      geofenceCenterLng: null,
      geofenceRadiusFeetDefault: 200,
      houseTypes: ["MEN"],
      bedCount: 12,
      notes: "",
      status: "ACTIVE",
      createdAt: "2026-04-12T12:00:00.000Z",
      updatedAt: "2026-04-12T12:00:00.000Z",
    },
  ];

  return {
    session: {
      organizationId: "org-alpine",
      organizationName: "Alpine Recovery Housing",
    },
    data: {
      store,
    },
    generatedAt: "2026-04-12T12:00:00.000Z",
  };
}

describe("mobile sober-house control plane client", () => {
  it("loads the remote control-plane snapshot with org-scoped auth", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(createSnapshotPayload()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const snapshot = await loadOperatorControlPlaneSnapshot({
      apiUrl: "https://sober-ai-api.onrender.com",
      authHeader: "Bearer DEV_demo",
      organizationId: "org-alpine",
      fetchImpl,
    });

    expect(snapshot.organizationId).toBe("org-alpine");
    expect(snapshot.store.houses.map((house) => house.id)).toEqual(["house-alpine-2"]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://sober-ai-api.onrender.com/v1/operator/sober-house/control-plane?organizationId=org-alpine",
      expect.objectContaining({
        cache: "no-store",
        headers: {
          Authorization: "Bearer DEV_demo",
        },
      }),
    );
  });

  it("persists a control-plane store and returns the synced snapshot", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(createSnapshotPayload()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const store = createDefaultSoberHouseSettingsStore();
    store.organization = createSnapshotPayload().data.store.organization;
    store.houses = createSnapshotPayload().data.store.houses;

    const snapshot = await persistOperatorControlPlaneSnapshot({
      apiUrl: "https://sober-ai-api.onrender.com",
      authHeader: "Bearer DEV_demo",
      organizationId: "org-alpine",
      store,
      fetchImpl,
    });

    expect(snapshot.store.houses[0]?.id).toBe("house-alpine-2");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://sober-ai-api.onrender.com/v1/operator/sober-house/control-plane?organizationId=org-alpine",
      expect.objectContaining({
        method: "PUT",
        headers: {
          Authorization: "Bearer DEV_demo",
          "Content-Type": "application/json",
        },
      }),
    );
  });

  it("allows the first organization bootstrap save without an organizationId query param", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(createSnapshotPayload()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const store = createDefaultSoberHouseSettingsStore();
    store.organization = {
      id: "org-sober-start",
      name: "A Sober Start Homes",
      primaryContactName: "Kacy Housing Admin",
      primaryPhone: "(555) 555-1000",
      primaryEmail: "kacy@example.com",
      notes: "",
      status: "ACTIVE",
      createdAt: "2026-04-12T12:00:00.000Z",
      updatedAt: "2026-04-12T12:00:00.000Z",
    };

    await persistOperatorControlPlaneSnapshot({
      apiUrl: "https://sober-ai-api.onrender.com",
      authHeader: "Bearer DEV_kacy-admin",
      organizationId: null,
      store,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://sober-ai-api.onrender.com/v1/operator/sober-house/control-plane",
      expect.objectContaining({
        method: "PUT",
        headers: {
          Authorization: "Bearer DEV_kacy-admin",
          "Content-Type": "application/json",
        },
      }),
    );
  });

  it("fails loudly when the remote save is rejected", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "Missing organization scope" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
    );

    await expect(
      persistOperatorControlPlaneSnapshot({
        apiUrl: "https://sober-ai-api.onrender.com",
        authHeader: "Bearer DEV_demo",
        organizationId: "org-alpine",
        store: createDefaultSoberHouseSettingsStore(),
        fetchImpl,
      }),
    ).rejects.toThrow("Missing organization scope");
  });
});
