import { describe, expect, it } from "vitest";
import { parseAccessContextResponse } from "../lib/access";
import { buildParticipantProfileSyncPayload } from "../lib/participantCompliance";
import { createDefaultSoberHouseSettingsStore } from "../lib/soberHouse/defaults";
import { buildResidentAssignmentDisplayContext } from "../lib/soberHouse/dashboard";
import {
  upsertHouse,
  upsertHouseGroup,
  upsertOrganization,
  upsertResidentHousingProfile,
} from "../lib/soberHouse/mutations";

const ACTOR = { id: "seed-system", name: "Seed System" };

describe("participant compliance payloads", () => {
  it("uses the entered resident name and current assignment context for participant sync", () => {
    const accessContext = parseAccessContextResponse({
      user: {
        userId: "resident-user",
        tenantId: "tenant-a",
        email: "resident-user@example.com",
        displayName: "Account Display Name",
        createdAt: "2026-04-01T00:00:00.000Z",
      },
      grants: [
        {
          id: "grant-1",
          role: "resident_user",
          organizationId: "org-alpine",
          organizationName: "Alpine Recovery Housing",
          courtProgramId: null,
          courtProgramName: null,
          courtProgramJurisdiction: null,
          grantedAt: "2026-04-01T00:00:00.000Z",
          revokedAt: null,
        },
      ],
      capabilities: {
        participantRoles: ["resident_user"],
        protectedRoles: [],
        canManageOrganizations: false,
        canManageCourtPrograms: false,
        isPlatformOwner: false,
      },
    });

    const payload = buildParticipantProfileSyncPayload({
      onboardingPath: "SOBER_HOUSE_RESIDENT",
      setupComplete: true,
      appAccessRole: "SOBER_HOUSE_RESIDENT",
      accessContext,
      soberHouseRole: "HOUSE_RESIDENT",
      residentDisplayName: "Riley Resident",
      residentOrganizationId: "org-custom",
      houseId: "house-custom",
    });

    expect(payload).toMatchObject({
      displayName: "Riley Resident",
      participantType: "resident_user",
      organizationId: "org-custom",
      houseId: "house-custom",
      status: "ACTIVE",
    });
  });
});

describe("resident dashboard assignment context", () => {
  it("renders the entered resident name plus org, house, and group from the current store", () => {
    let store = createDefaultSoberHouseSettingsStore();
    store = upsertOrganization(
      store,
      ACTOR,
      {
        id: "org-sober-start",
        name: "A Sober Start Homes",
        primaryContactName: "Kacy Housing Admin",
        primaryPhone: "(555) 555-1000",
        primaryEmail: "kacy@example.com",
        notes: "",
        status: "ACTIVE",
      },
      "2026-04-01T00:00:00.000Z",
    ).store;
    store = upsertHouse(
      store,
      ACTOR,
      {
        id: "house-maple",
        name: "Maple House",
        address: "123 Main St",
        phone: "(555) 555-1001",
        geofenceCenterLat: null,
        geofenceCenterLng: null,
        geofenceRadiusFeetDefault: 200,
        houseTypes: ["MEN"],
        bedCount: 12,
        notes: "",
        status: "ACTIVE",
      },
      "2026-04-01T00:01:00.000Z",
    ).store;
    store = upsertHouseGroup(
      store,
      ACTOR,
      {
        id: "group-phase-1",
        name: "Phase One",
        notes: "",
        houseIds: ["house-maple"],
        status: "ACTIVE",
      },
      "2026-04-01T00:02:00.000Z",
    ).store;
    store = {
      ...store,
      houses: store.houses.map((house) =>
        house.id === "house-maple" ? { ...house, houseGroupId: "group-phase-1" } : house,
      ),
    };
    store = upsertResidentHousingProfile(
      store,
      ACTOR,
      {
        id: "resident-housing-1",
        residentId: "resident-1",
        linkedUserId: "resident-user",
        organizationId: "org-sober-start",
        houseId: "house-maple",
        firstName: "Riley",
        lastName: "Resident",
        moveInDate: "2026-04-01",
        roomOrBed: "2B",
        emergencyContactName: "Jamie Resident",
        emergencyContactPhone: "(555) 555-2222",
        programPhaseOnEntry: "Phase 1",
        status: "ACTIVE",
        notes: "",
        createdAt: "2026-04-01T00:03:00.000Z",
        updatedAt: "2026-04-01T00:03:00.000Z",
      },
      "2026-04-01T00:03:00.000Z",
    ).store;

    const context = buildResidentAssignmentDisplayContext(store, "Fallback User");

    expect(context).toEqual({
      residentName: "Riley Resident",
      organizationName: "A Sober Start Homes",
      houseName: "Maple House",
      groupName: "Phase One",
    });
  });
});
