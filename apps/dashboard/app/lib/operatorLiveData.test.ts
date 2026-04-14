import { describe, expect, it, vi } from "vitest";
import { createDefaultSoberHouseSettingsStore } from "../../../mobile/lib/soberHouse/defaults";
import {
  buildDevOperatorAuthHeader,
  loadOperatorLiveSnapshot,
  normalizeDevOperatorUserId,
  persistOperatorLiveSnapshot,
  resolveDashboardApiUrl,
} from "./operatorLiveData";

function createSnapshotPayload() {
  const store = createDefaultSoberHouseSettingsStore();
  store.organization = {
    id: "org-1",
    name: "Bright Path Recovery",
    primaryContactName: "",
    primaryPhone: "",
    primaryEmail: "",
    notes: "",
    status: "ACTIVE",
    createdAt: "2026-04-02T12:00:00.000Z",
    updatedAt: "2026-04-02T12:00:00.000Z",
  };
  store.houses = [
    {
      id: "house-1",
      organizationId: "org-1",
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
      createdAt: "2026-04-02T12:00:00.000Z",
      updatedAt: "2026-04-02T12:00:00.000Z",
    },
  ];
  return {
    session: {
      operatorUserId: "org-admin-user",
      operatorDisplayName: "Olivia Operator",
      organizationId: "org-1",
      organizationName: "Bright Path Recovery",
      operatorRole: "ORG_ADMIN",
      allowedRoles: ["ORG_ADMIN", "HOUSE_MANAGER"],
      availableOrganizations: [
        {
          organizationId: "org-1",
          organizationName: "Bright Path Recovery",
          operatorRole: "ORG_ADMIN",
        },
      ],
    },
    data: {
      store,
      residentDirectory: [],
      roleDefaults: {
        ORG_ADMIN: { houseId: null },
        HOUSE_MANAGER: { houseId: null },
        STAFF_VIEWER: { houseId: null },
      },
      residentLiveObligations: [
        {
          obligationId: "obl-1",
          residentId: "resident-1",
          residentUserId: "enduser-a1",
          organizationId: "org-1",
          houseId: "house-1",
          obligationType: "CHORE",
          title: "Kitchen reset",
          scheduledAt: "2026-04-02T18:00:00.000Z",
          dueAt: "2026-04-02T18:00:00.000Z",
          proofRequired: true,
          obligationStatus: "ACTIVE",
          completionRecordId: "completion-1",
          completionStatus: "COMPLETED",
          completedAt: "2026-04-02T18:05:00.000Z",
          submittedAt: "2026-04-02T18:05:00.000Z",
          proofSubmitted: true,
          proofReviewId: "review-1",
          proofReviewOutcome: "PENDING",
          reviewedAt: null,
          createdAt: "2026-04-02T12:00:00.000Z",
          updatedAt: "2026-04-02T18:05:00.000Z",
        },
      ],
      complianceSummary: {
        organization: {
          dueTodayCount: 0,
          completedTodayCount: 1,
          overdueCount: 0,
          pendingReviewCount: 1,
          rejectedProofCount: 0,
        },
        houses: [
          {
            houseId: "house-1",
            houseName: "Maple House",
            dueTodayCount: 0,
            completedTodayCount: 1,
            overdueCount: 0,
            pendingReviewCount: 1,
            rejectedProofCount: 0,
          },
        ],
      },
    },
    generatedAt: "2026-04-02T12:00:00.000Z",
  };
}

describe("operator live data adapter", () => {
  it("normalizes DEV bearer ids and headers", () => {
    expect(normalizeDevOperatorUserId("DEV_org-admin-user")).toBe("org-admin-user");
    expect(buildDevOperatorAuthHeader("DEV_org-admin-user")).toEqual({
      Authorization: "Bearer DEV_org-admin-user",
    });
  });

  it("uses the configured dashboard api url when present", () => {
    expect(resolveDashboardApiUrl()).toBe("/api/operator/sober-house/control-plane");
  });

  it("returns unauthenticated when no dev user id is provided", async () => {
    const result = await loadOperatorLiveSnapshot({
      apiUrl: "https://api.example.com",
      devUserId: "   ",
      organizationId: null,
      fetchImpl: vi.fn(),
    });

    expect(result.status).toBe("unauthenticated");
  });

  it("loads and parses a live operator snapshot", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(createSnapshotPayload()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const result = await loadOperatorLiveSnapshot({
      apiUrl: "/api/operator/sober-house/control-plane",
      devUserId: "org-admin-user",
      organizationId: "org-1",
      fetchImpl,
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.snapshot.session.organizationName).toBe("Bright Path Recovery");
      expect(result.snapshot.data.store.organization?.id).toBe("org-1");
      expect(result.snapshot.data.store.houses.map((house) => house.id)).toEqual(["house-1"]);
      expect(result.snapshot.data.residentLiveObligations[0]?.proofReviewOutcome).toBe("PENDING");
      expect(result.snapshot.data.complianceSummary?.organization.pendingReviewCount).toBe(1);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/operator/sober-house/control-plane?organizationId=org-1",
      expect.objectContaining({
        cache: "no-store",
        headers: {
          Authorization: "Bearer DEV_org-admin-user",
        },
      }),
    );
  });

  it("returns forbidden when the live api denies org access", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "No sober-housing org access." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const result = await loadOperatorLiveSnapshot({
      apiUrl: "/api/operator/sober-house/control-plane",
      devUserId: "org-admin-user",
      organizationId: null,
      fetchImpl,
    });

    expect(result).toEqual({
      status: "forbidden",
      message: "No sober-housing org access.",
    });
  });

  it("persists a live operator store snapshot", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(createSnapshotPayload()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );

    const snapshot = await persistOperatorLiveSnapshot({
      apiUrl: "/api/operator/sober-house/control-plane",
      devUserId: "org-admin-user",
      organizationId: "org-1",
      store: createSnapshotPayload().data.store,
      fetchImpl,
    });

    expect(snapshot.session.operatorUserId).toBe("org-admin-user");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/operator/sober-house/control-plane?organizationId=org-1",
      expect.objectContaining({
        method: "PUT",
      }),
    );
  });
});
