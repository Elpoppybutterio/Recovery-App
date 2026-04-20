import { describe, expect, it } from "vitest";
import { buildHousingAdminBootstrapStore } from "../lib/soberHouse/bootstrap";
import { normalizeSoberHouseSettingsStore } from "../lib/soberHouse/storage";

describe("housing admin bootstrap store", () => {
  it("builds a clean first-bootstrap store from the wizard fields", () => {
    const store = buildHousingAdminBootstrapStore({
      userId: "kacy-admin",
      actorName: "Kacy Housing Admin",
      timestamp: "2026-04-17T12:00:00.000Z",
      fields: {
        organizationId: null,
        organizationName: "A Sober Start Homes",
        primaryContactName: "Kacy Housing Admin",
        primaryPhone: "5555551000",
        primaryEmail: "kacy@example.com",
        notes: "Created from setup wizard",
      },
    });

    expect(store.organization).toMatchObject({
      name: "A Sober Start Homes",
      primaryContactName: "Kacy Housing Admin",
      primaryPhone: "(555) 555-1000",
      primaryEmail: "kacy@example.com",
      notes: "Created from setup wizard",
    });
    expect(store.userAccessProfile).toMatchObject({
      linkedUserId: "kacy-admin",
      role: "OWNER_OPERATOR",
      organizationId: store.organization?.id,
    });
    expect(store.staffAssignments).toHaveLength(1);
    expect(store.staffAssignments[0]).toMatchObject({
      firstName: "Kacy",
      lastName: "Housing Admin",
      email: "kacy@example.com",
      role: "OWNER",
    });
    expect(store.houses).toEqual([]);
    expect(store.houseGroups).toEqual([]);
  });

  it("rehydrates the saved bootstrap values without losing the org or operator profile", () => {
    const store = buildHousingAdminBootstrapStore({
      userId: "kacy-admin",
      actorName: "Kacy Housing Admin",
      timestamp: "2026-04-17T12:00:00.000Z",
      fields: {
        organizationId: null,
        organizationName: "A Sober Start Homes",
        primaryContactName: "Kacy Housing Admin",
        primaryPhone: "(555) 555-1000",
        primaryEmail: "kacy@example.com",
        notes: "Created from setup wizard",
      },
    });

    const hydrated = normalizeSoberHouseSettingsStore(JSON.parse(JSON.stringify(store)));

    expect(hydrated.organization).toMatchObject({
      name: "A Sober Start Homes",
      primaryContactName: "Kacy Housing Admin",
      primaryEmail: "kacy@example.com",
    });
    expect(hydrated.userAccessProfile).toMatchObject({
      linkedUserId: "kacy-admin",
      role: "OWNER_OPERATOR",
      organizationId: hydrated.organization?.id,
    });
    expect(hydrated.staffAssignments[0]?.email).toBe("kacy@example.com");
  });
});
