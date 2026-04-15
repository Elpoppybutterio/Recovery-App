import { beforeEach, describe, expect, it } from "vitest";
import type { InMemoryDb } from "./in-memory-db";
import { createTestApp, createTestDb, seedCoreFixtures } from "./test-helpers";

describe("sober-house control plane access", () => {
  let db: InMemoryDb;

  beforeEach(async () => {
    db = await createTestDb();
    await seedCoreFixtures(db);
  });

  it("allows resident users with org access to load the dashboard as staff viewers", async () => {
    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/operator/sober-house/control-plane",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      session: {
        operatorUserId: "enduser-a1",
        operatorRole: "STAFF_VIEWER",
        allowedRoles: ["STAFF_VIEWER"],
        availableOrganizations: [
          {
            organizationId: "org-alpine",
            operatorRole: "STAFF_VIEWER",
          },
        ],
      },
    });

    await app.close();
    await db.end?.();
  });

  it("persists PUT updates and returns the updated snapshot", async () => {
    const app = createTestApp(db);

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/v1/operator/sober-house/control-plane?organizationId=org-alpine",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
      payload: {
        store: {
          version: 16,
          organization: {
            id: "org-alpine",
            name: "Alpine Recovery Housing",
            primaryContactName: "",
            primaryPhone: "",
            primaryEmail: "",
            notes: "persisted from test",
            status: "ACTIVE",
            createdAt: "2026-04-02T12:00:00.000Z",
            updatedAt: "2026-04-02T12:00:00.000Z",
          },
        },
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      session: {
        organizationId: "org-alpine",
      },
      data: {
        store: {
          organization: {
            notes: "persisted from test",
          },
        },
      },
    });

    const getResponse = await app.inject({
      method: "GET",
      url: "/v1/operator/sober-house/control-plane?organizationId=org-alpine",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toMatchObject({
      data: {
        store: {
          organization: {
            notes: "persisted from test",
          },
        },
      },
    });

    await app.close();
    await db.end?.();
  });

  it("returns houses that exist only in persisted control-plane config after a mobile-style save", async () => {
    const app = createTestApp(db);

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/v1/operator/sober-house/control-plane?organizationId=org-alpine",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
      payload: {
        store: {
          version: 16,
          organization: {
            id: "org-alpine",
            name: "Alpine Recovery Housing",
            primaryContactName: "",
            primaryPhone: "",
            primaryEmail: "",
            notes: "persisted from mobile",
            status: "ACTIVE",
            createdAt: "2026-04-02T12:00:00.000Z",
            updatedAt: "2026-04-02T12:00:00.000Z",
          },
          houses: [
            {
              id: "house-alpine-1",
              organizationId: "org-alpine",
              houseGroupId: null,
              name: "Alpine House 1",
              address: "",
              phone: "",
              geofenceCenterLat: null,
              geofenceCenterLng: null,
              geofenceRadiusFeetDefault: 200,
              houseTypes: ["OTHER"],
              bedCount: 0,
              notes: "",
              status: "ACTIVE",
              createdAt: "2026-04-02T12:00:00.000Z",
              updatedAt: "2026-04-02T12:00:00.000Z",
            },
            {
              id: "house-mobile-1",
              organizationId: "org-alpine",
              houseGroupId: null,
              name: "Mobile Created House",
              address: "123 Main St",
              phone: "(555) 555-0000",
              geofenceCenterLat: 45.7833,
              geofenceCenterLng: -108.5007,
              geofenceRadiusFeetDefault: 200,
              houseTypes: ["MEN"],
              bedCount: 12,
              notes: "created from mobile",
              status: "ACTIVE",
              createdAt: "2026-04-02T12:00:00.000Z",
              updatedAt: "2026-04-02T12:00:00.000Z",
            },
          ],
        },
      },
    });

    expect(updateResponse.statusCode).toBe(200);

    const response = await app.inject({
      method: "GET",
      url: "/v1/operator/sober-house/control-plane?organizationId=org-alpine",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as {
      data: {
        store: {
          houses: Array<{ id: string; name: string }>;
        };
      };
    };

    expect(payload.data.store.houses.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["house-alpine-1", "house-mobile-1"]),
    );
    expect(payload.data.store.houses.find((entry) => entry.id === "house-mobile-1")?.name).toBe(
      "Mobile Created House",
    );

    await app.close();
    await db.end?.();
  });

  it("lets an approved housing admin bootstrap a first sober-housing organization", async () => {
    const app = createTestApp(db);

    const response = await app.inject({
      method: "PUT",
      url: "/v1/operator/sober-house/control-plane",
      headers: {
        authorization: "Bearer DEV_kacy-admin",
      },
      payload: {
        store: {
          version: 16,
          organization: {
            id: "org-a-sober-start-homes",
            name: "A Sober Start Homes",
            primaryContactName: "Kacy Housing Admin",
            primaryPhone: "(555) 555-1000",
            primaryEmail: "kacy@example.com",
            notes: "Created from mobile",
            status: "ACTIVE",
            createdAt: "2026-04-12T12:00:00.000Z",
            updatedAt: "2026-04-12T12:00:00.000Z",
          },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      session: {
        operatorUserId: "kacy-admin",
        organizationName: "A Sober Start Homes",
        availableOrganizations: [
          {
            organizationName: "A Sober Start Homes",
            operatorRole: "ORG_ADMIN",
          },
        ],
      },
      data: {
        store: {
          organization: {
            name: "A Sober Start Homes",
            primaryEmail: "kacy@example.com",
          },
        },
      },
    });

    await app.close();
    await db.end?.();
  });

  it("prevents a non-platform housing admin from creating a second organization", async () => {
    const app = createTestApp(db);

    const firstResponse = await app.inject({
      method: "PUT",
      url: "/v1/operator/sober-house/control-plane",
      headers: {
        authorization: "Bearer DEV_kacy-admin",
      },
      payload: {
        store: {
          version: 16,
          organization: {
            id: "org-a-sober-start-homes",
            name: "A Sober Start Homes",
            primaryContactName: "Kacy Housing Admin",
            primaryPhone: "(555) 555-1000",
            primaryEmail: "kacy@example.com",
            notes: "Created from mobile",
            status: "ACTIVE",
            createdAt: "2026-04-12T12:00:00.000Z",
            updatedAt: "2026-04-12T12:00:00.000Z",
          },
        },
      },
    });
    expect(firstResponse.statusCode).toBe(200);

    const secondResponse = await app.inject({
      method: "PUT",
      url: "/v1/operator/sober-house/control-plane",
      headers: {
        authorization: "Bearer DEV_kacy-admin",
      },
      payload: {
        store: {
          version: 16,
          organization: {
            id: "org-second-attempt",
            name: "Second Chance Homes",
            primaryContactName: "Kacy Housing Admin",
            primaryPhone: "(555) 555-1000",
            primaryEmail: "kacy@example.com",
            notes: "Should not create a second org",
            status: "ACTIVE",
            createdAt: "2026-04-12T12:10:00.000Z",
            updatedAt: "2026-04-12T12:10:00.000Z",
          },
        },
      },
    });

    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.json()).toMatchObject({
      session: {
        organizationName: "A Sober Start Homes",
        availableOrganizations: [
          {
            organizationName: "A Sober Start Homes",
          },
        ],
      },
      data: {
        store: {
          organization: {
            name: "A Sober Start Homes",
          },
        },
      },
    });

    await app.close();
    await db.end?.();
  });

  it("honors organizationId when a user can switch between organizations", async () => {
    db.addOrganization({
      id: "org-birch",
      tenant_id: "tenant-a",
      name: "Birch Recovery Housing",
    });
    db.addHouse({
      id: "house-birch-1",
      tenant_id: "tenant-a",
      organization_id: "org-birch",
      name: "Birch House 1",
    });
    db.addUserRole({
      tenant_id: "tenant-a",
      user_id: "enduser-a1",
      role: "resident_user",
      organization_id: "org-birch",
      granted_by_user_id: "admin-a",
    });

    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/operator/sober-house/control-plane?organizationId=org-birch",
      headers: {
        authorization: "Bearer DEV_enduser-a1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      session: {
        organizationId: "org-birch",
        organizationName: "Birch Recovery Housing",
      },
    });

    await app.close();
    await db.end?.();
  });

  it("allows demo platform owner access across all tenant organizations", async () => {
    db.addOrganization({
      id: "org-birch",
      tenant_id: "tenant-a",
      name: "Birch Recovery Housing",
    });
    db.addHouse({
      id: "house-birch-1",
      tenant_id: "tenant-a",
      organization_id: "org-birch",
      name: "Birch House 1",
    });

    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/operator/sober-house/control-plane",
      headers: {
        authorization: "Bearer DEV_demo",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      session: {
        operatorUserId: "demo",
        operatorRole: "ORG_ADMIN",
        allowedRoles: ["ORG_ADMIN", "HOUSE_MANAGER", "STAFF_VIEWER"],
        availableOrganizations: [
          {
            organizationId: "org-alpine",
            organizationName: "Alpine Recovery Housing",
            operatorRole: "ORG_ADMIN",
          },
          {
            organizationId: "org-birch",
            organizationName: "Birch Recovery Housing",
            operatorRole: "ORG_ADMIN",
          },
        ],
      },
    });

    await app.close();
    await db.end?.();
  });

  it("honors organizationId for demo platform owner sessions", async () => {
    db.addOrganization({
      id: "org-birch",
      tenant_id: "tenant-a",
      name: "Birch Recovery Housing",
    });
    db.addHouse({
      id: "house-birch-1",
      tenant_id: "tenant-a",
      organization_id: "org-birch",
      name: "Birch House 1",
    });

    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/operator/sober-house/control-plane?organizationId=org-birch",
      headers: {
        authorization: "Bearer DEV_demo",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      session: {
        operatorUserId: "demo",
        organizationId: "org-birch",
        organizationName: "Birch Recovery Housing",
      },
    });

    await app.close();
    await db.end?.();
  });

  it("keeps users without sober-house org access forbidden", async () => {
    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/operator/sober-house/control-plane",
      headers: {
        authorization: "Bearer DEV_enduser-b1",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "forbidden",
      message: "No sober-housing organization access is available for this account.",
    });

    await app.close();
    await db.end?.();
  });

  it("persists control-plane updates for demo", async () => {
    const app = createTestApp(db);

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/v1/operator/sober-house/control-plane?organizationId=org-alpine",
      headers: {
        authorization: "Bearer DEV_demo",
      },
      payload: {
        store: {
          version: 16,
          organization: {
            id: "org-alpine",
            name: "Alpine Recovery Housing",
            primaryContactName: "",
            primaryPhone: "",
            primaryEmail: "",
            notes: "saved by demo",
            status: "ACTIVE",
            createdAt: "2026-04-02T12:00:00.000Z",
            updatedAt: "2026-04-02T12:00:00.000Z",
          },
        },
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      data: {
        store: {
          organization: {
            notes: "saved by demo",
          },
        },
      },
    });

    await app.close();
    await db.end?.();
  });

  it("merges DB-backed sober-house rows with persisted control-plane houses", async () => {
    db.addParticipantProfile({
      user_id: "enduser-a1",
      tenant_id: "tenant-a",
      display_name: "Resident Alpine",
      participant_type: "resident_user",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      court_program_id: null,
      status: "ACTIVE",
      created_at: "2026-04-01T08:00:00.000Z",
      updated_at: "2026-04-01T08:00:00.000Z",
    });
    db.addObligation({
      id: "ob-meeting",
      tenant_id: "tenant-a",
      user_id: "enduser-a1",
      obligation_type: "meeting_attendance",
      source_track: "operations",
      title: "Weekly house meeting",
      description: "Bring the weekly update.",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      court_program_id: null,
      due_at: "2026-04-04T18:00:00.000Z",
      recurrence_json: {
        frequency: "WEEKLY",
        weekday: "FRI",
        timeLocalHhmm: "18:00",
        durationMinutes: 60,
      },
      priority: "MEDIUM",
      requires_proof: true,
      requires_signature: false,
      proof_type: "photo",
      verification_status: "PENDING",
      status: "ACTIVE",
      sync_source: "mobile_sync",
      sync_key: "ob-meeting",
      created_by_user_id: "manager-a",
      created_by_role: "HOUSE_MANAGER",
      created_at: "2026-04-01T08:00:00.000Z",
      updated_at: "2026-04-01T08:00:00.000Z",
    });
    db.addObligation({
      id: "ob-session",
      tenant_id: "tenant-a",
      user_id: "enduser-a1",
      obligation_type: "treatment_session",
      source_track: "treatment",
      title: "Manager one-on-one",
      description: "Weekly recovery check-in.",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      court_program_id: null,
      due_at: "2026-04-05T15:00:00.000Z",
      recurrence_json: {
        frequency: "WEEKLY",
        weekday: "SAT",
        timeLocalHhmm: "15:00",
        durationMinutes: 45,
      },
      priority: "HIGH",
      requires_proof: true,
      requires_signature: false,
      proof_type: "staff_verification",
      verification_status: "PENDING",
      status: "ACTIVE",
      sync_source: "mobile_sync",
      sync_key: "ob-session",
      created_by_user_id: "manager-a",
      created_by_role: "HOUSE_MANAGER",
      created_at: "2026-04-01T08:00:00.000Z",
      updated_at: "2026-04-01T08:00:00.000Z",
    });
    db.addObligation({
      id: "ob-chore",
      tenant_id: "tenant-a",
      user_id: "enduser-a1",
      obligation_type: "chore",
      source_track: "resident",
      title: "Kitchen reset",
      description: "Counters, floor, and trash.",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      court_program_id: null,
      due_at: "2026-04-03T19:00:00.000Z",
      recurrence_json: {
        frequency: "WEEKLY",
        weekday: "THU",
        timeLocalHhmm: "19:00",
      },
      priority: "MEDIUM",
      requires_proof: true,
      requires_signature: false,
      proof_type: "photo",
      verification_status: "PENDING",
      status: "ACTIVE",
      sync_source: "mobile_sync",
      sync_key: "ob-chore",
      created_by_user_id: "manager-a",
      created_by_role: "HOUSE_MANAGER",
      created_at: "2026-04-01T08:00:00.000Z",
      updated_at: "2026-04-01T08:00:00.000Z",
    });
    db.addComplianceEvent({
      id: "event-meeting",
      tenant_id: "tenant-a",
      user_id: "enduser-a1",
      obligation_id: "ob-meeting",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      court_program_id: null,
      event_type: "MEETING_ATTENDED",
      event_status: "COMPLETED",
      occurred_at: "2026-04-04T18:05:00.000Z",
      metadata_json: {},
      proof_uri: "proof://meeting-photo",
      proof_metadata_json: {},
      signature_present: false,
      proof_type: "photo",
      verification_status: "SUBMITTED",
      verified_by_role: null,
      verified_at: null,
      created_by_role: "MOBILE_APP",
      source_track: "operations",
      external_event_id: "meeting-1",
      created_at: "2026-04-04T18:05:00.000Z",
    });
    db.addComplianceEvent({
      id: "event-session",
      tenant_id: "tenant-a",
      user_id: "enduser-a1",
      obligation_id: "ob-session",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      court_program_id: null,
      event_type: "TREATMENT_SESSION_ATTENDED",
      event_status: "COMPLETED",
      occurred_at: "2026-04-05T15:10:00.000Z",
      metadata_json: {},
      proof_uri: null,
      proof_metadata_json: {},
      signature_present: false,
      proof_type: "staff_verification",
      verification_status: "VERIFIED",
      verified_by_role: "HOUSE_MANAGER",
      verified_at: "2026-04-05T15:30:00.000Z",
      created_by_role: "HOUSE_MANAGER",
      source_track: "treatment",
      external_event_id: "session-1",
      created_at: "2026-04-05T15:10:00.000Z",
    });
    db.addComplianceEvent({
      id: "event-chore",
      tenant_id: "tenant-a",
      user_id: "enduser-a1",
      obligation_id: "ob-chore",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      court_program_id: null,
      event_type: "CHORE_COMPLETED",
      event_status: "COMPLETED",
      occurred_at: "2026-04-03T19:05:00.000Z",
      metadata_json: {},
      proof_uri: "proof://chore-photo",
      proof_metadata_json: {},
      signature_present: false,
      proof_type: "photo",
      verification_status: "SUBMITTED",
      verified_by_role: null,
      verified_at: null,
      created_by_role: "MOBILE_APP",
      source_track: "resident",
      external_event_id: "chore-1",
      created_at: "2026-04-03T19:05:00.000Z",
    });

    const app = createTestApp(db);

    const updateResponse = await app.inject({
      method: "PUT",
      url: "/v1/operator/sober-house/control-plane?organizationId=org-alpine",
      headers: {
        authorization: "Bearer DEV_manager-a",
      },
      payload: {
        store: {
          version: 16,
          organization: {
            id: "org-alpine",
            name: "Alpine Recovery Housing",
            primaryContactName: "",
            primaryPhone: "",
            primaryEmail: "",
            notes: "persisted compatibility data",
            status: "ACTIVE",
            createdAt: "2026-04-01T08:00:00.000Z",
            updatedAt: "2026-04-01T08:00:00.000Z",
          },
          houses: [{ id: "fake-house", name: "Fake House" }],
          recurringObligations: [{ id: "fake-recurring" }],
          houseMeetings: [{ id: "fake-meeting" }],
          oneOnOneSessions: [{ id: "fake-session" }],
          houseChores: [{ id: "fake-chore" }],
          scheduledItemCompletionRecords: [{ id: "fake-completion" }],
          proofReviewRecords: [{ id: "fake-proof-review" }],
        },
      },
    });

    expect(updateResponse.statusCode).toBe(200);

    const response = await app.inject({
      method: "GET",
      url: "/v1/operator/sober-house/control-plane?organizationId=org-alpine",
      headers: {
        authorization: "Bearer DEV_manager-a",
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as {
      data: {
        store: {
          organization: { notes: string };
          houses: Array<{ id: string }>;
          residentHouseMemberships: Array<{ residentId: string }>;
          recurringObligations: Array<{ id: string }>;
          houseMeetings: Array<{ id: string }>;
          oneOnOneSessions: Array<{ id: string; completionStatus: string }>;
          houseChores: Array<{ id: string }>;
          scheduledItemCompletionRecords: Array<{ id: string }>;
          proofReviewRecords: Array<{ id: string }>;
        };
      };
    };

    expect(payload.data.store.organization.notes).toBe("persisted compatibility data");
    expect(payload.data.store.houses.map((entry) => entry.id)).toEqual([
      "house-alpine-1",
      "fake-house",
    ]);
    expect(payload.data.store.residentHouseMemberships.map((entry) => entry.residentId)).toEqual([
      "enduser-a1",
    ]);
    expect(payload.data.store.recurringObligations.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["ob-meeting", "ob-session", "ob-chore"]),
    );
    expect(payload.data.store.houseMeetings.map((entry) => entry.id)).toEqual([
      "live:house-meeting:ob-meeting",
    ]);
    expect(payload.data.store.oneOnOneSessions).toEqual([
      expect.objectContaining({
        id: "live:one-on-one:ob-session",
        completionStatus: "COMPLETED",
      }),
    ]);
    expect(payload.data.store.houseChores.map((entry) => entry.id)).toEqual([
      "live:house-chore:ob-chore",
    ]);
    expect(payload.data.store.scheduledItemCompletionRecords.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["event-meeting", "event-session", "event-chore"]),
    );
    expect(payload.data.store.proofReviewRecords.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "proof-review:event-meeting",
        "proof-review:event-session",
        "proof-review:event-chore",
      ]),
    );

    await app.close();
    await db.end?.();
  });

  it("computes deterministic live compliance summaries and scopes them by role-visible houses", async () => {
    db.addUser({
      id: "manager-b",
      tenant_id: "tenant-a",
      email: "manager-b@example.com",
      display_name: "Manager B",
    });
    db.addUserRole({
      tenant_id: "tenant-a",
      user_id: "manager-b",
      role: "house_manager",
      organization_id: "org-alpine",
      granted_by_user_id: "admin-a",
    });
    db.addHouse({
      id: "house-alpine-2",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      name: "Birch House 2",
    });
    db.addParticipantProfile({
      user_id: "enduser-a1",
      tenant_id: "tenant-a",
      participant_type: "resident_user",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      court_program_id: null,
      status: "ACTIVE",
    });
    db.addParticipantProfile({
      user_id: "enduser-a2",
      tenant_id: "tenant-a",
      participant_type: "resident_user",
      organization_id: "org-alpine",
      house_id: "house-alpine-2",
      court_program_id: null,
      status: "ACTIVE",
    });
    db.addResidentHouseMembership({
      id: "membership-a1",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "enduser-a1",
      status: "ACTIVE",
    });
    db.addResidentHouseMembership({
      id: "membership-a2",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-2",
      resident_user_id: "enduser-a2",
      status: "ACTIVE",
    });
    db.addSoberHouseObligation({
      id: "sho-due-today",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "enduser-a1",
      resident_house_membership_id: "membership-a1",
      obligation_type: "CHORE",
      scheduled_at: "2026-04-04T18:00:00.000Z",
      due_at: "2026-04-04T20:00:00.000Z",
      proof_required: false,
      status: "ACTIVE",
    });
    db.addSoberHouseObligation({
      id: "sho-pending-review",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "enduser-a1",
      resident_house_membership_id: "membership-a1",
      obligation_type: "HOUSE_MEETING",
      scheduled_at: "2026-04-04T08:00:00.000Z",
      due_at: "2026-04-04T09:00:00.000Z",
      proof_required: true,
      status: "ACTIVE",
    });
    db.addSoberHouseCompletionRecord({
      id: "completion-pending-review",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "enduser-a1",
      obligation_id: "sho-pending-review",
      completion_status: "COMPLETED",
      completed_at: "2026-04-04T09:15:00.000Z",
      submitted_at: "2026-04-04T09:20:00.000Z",
      proof_uri: "proof://pending",
      proof_metadata_json: { proofType: "photo" },
    });
    db.addSoberHouseProofReview({
      id: "review-pending-review",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "enduser-a1",
      completion_record_id: "completion-pending-review",
      review_outcome: "PENDING",
      reviewer_user_id: null,
      reviewed_at: null,
    });
    db.addSoberHouseObligation({
      id: "sho-overdue",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-2",
      resident_user_id: "enduser-a2",
      resident_house_membership_id: "membership-a2",
      obligation_type: "ONE_ON_ONE",
      scheduled_at: "2026-04-03T16:00:00.000Z",
      due_at: "2026-04-03T18:00:00.000Z",
      proof_required: false,
      status: "ACTIVE",
    });
    db.addSoberHouseObligation({
      id: "sho-rejected",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-2",
      resident_user_id: "enduser-a2",
      resident_house_membership_id: "membership-a2",
      obligation_type: "CHORE",
      scheduled_at: "2026-04-03T08:00:00.000Z",
      due_at: "2026-04-03T10:00:00.000Z",
      proof_required: true,
      status: "ACTIVE",
    });
    db.addSoberHouseCompletionRecord({
      id: "completion-rejected",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-2",
      resident_user_id: "enduser-a2",
      obligation_id: "sho-rejected",
      completion_status: "COMPLETED",
      completed_at: "2026-04-03T10:20:00.000Z",
      submitted_at: "2026-04-03T10:25:00.000Z",
      proof_uri: "proof://rejected",
      proof_metadata_json: { proofType: "photo" },
    });
    db.addSoberHouseProofReview({
      id: "review-rejected",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-2",
      resident_user_id: "enduser-a2",
      completion_record_id: "completion-rejected",
      review_outcome: "REJECTED",
      reviewer_user_id: "manager-a",
      reviewed_at: "2026-04-03T11:00:00.000Z",
    });

    const app = createTestApp(db, {
      now: () => new Date("2026-04-04T12:00:00.000Z"),
    });

    const orgAdminResponse = await app.inject({
      method: "GET",
      url: "/v1/operator/sober-house/control-plane?organizationId=org-alpine",
      headers: {
        authorization: "Bearer DEV_manager-a",
      },
    });
    expect(orgAdminResponse.statusCode).toBe(200);
    expect(orgAdminResponse.json()).toMatchObject({
      session: {
        operatorRole: "ORG_ADMIN",
      },
      data: {
        complianceSummary: {
          organization: {
            dueTodayCount: 1,
            completedTodayCount: 1,
            overdueCount: 1,
            pendingReviewCount: 1,
            rejectedProofCount: 1,
          },
          houses: expect.arrayContaining([
            expect.objectContaining({
              houseId: "house-alpine-1",
              dueTodayCount: 1,
              completedTodayCount: 1,
              overdueCount: 0,
              pendingReviewCount: 1,
              rejectedProofCount: 0,
            }),
            expect.objectContaining({
              houseId: "house-alpine-2",
              dueTodayCount: 0,
              completedTodayCount: 0,
              overdueCount: 1,
              pendingReviewCount: 0,
              rejectedProofCount: 1,
            }),
          ]),
        },
      },
    });

    const houseManagerResponse = await app.inject({
      method: "GET",
      url: "/v1/operator/sober-house/control-plane?organizationId=org-alpine",
      headers: {
        authorization: "Bearer DEV_manager-b",
      },
    });
    expect(houseManagerResponse.statusCode).toBe(200);
    expect(houseManagerResponse.json()).toMatchObject({
      session: {
        operatorRole: "HOUSE_MANAGER",
      },
      data: {
        complianceSummary: {
          organization: {
            dueTodayCount: 1,
            completedTodayCount: 1,
            overdueCount: 0,
            pendingReviewCount: 1,
            rejectedProofCount: 0,
          },
          houses: [
            expect.objectContaining({
              houseId: "house-alpine-1",
              dueTodayCount: 1,
              completedTodayCount: 1,
              overdueCount: 0,
              pendingReviewCount: 1,
              rejectedProofCount: 0,
            }),
          ],
        },
      },
    });

    await app.close();
    await db.end?.();
  });

  it("normalizes mixed runtime dueAt and scheduledAt shapes before sorting live obligations", async () => {
    db.addParticipantProfile({
      user_id: "enduser-a1",
      tenant_id: "tenant-a",
      participant_type: "resident_user",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      court_program_id: null,
      status: "ACTIVE",
    });
    db.addResidentHouseMembership({
      id: "membership-a1",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "enduser-a1",
      status: "ACTIVE",
    });
    db.addSoberHouseObligation({
      id: "sho-date-object",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "enduser-a1",
      resident_house_membership_id: "membership-a1",
      obligation_type: "CHORE",
      scheduled_at: new Date("2026-04-04T08:00:00.000Z") as unknown as string,
      due_at: new Date("2026-04-04T09:00:00.000Z") as unknown as string,
      proof_required: false,
      status: "ACTIVE",
    });
    db.addSoberHouseObligation({
      id: "sho-string",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "enduser-a1",
      resident_house_membership_id: "membership-a1",
      obligation_type: "HOUSE_MEETING",
      scheduled_at: "2026-04-04T10:00:00.000Z",
      due_at: "2026-04-04T11:00:00.000Z",
      proof_required: true,
      status: "ACTIVE",
    });
    db.addSoberHouseObligation({
      id: "sho-date-scheduled-only",
      tenant_id: "tenant-a",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      resident_user_id: "enduser-a1",
      resident_house_membership_id: "membership-a1",
      obligation_type: "ONE_ON_ONE",
      scheduled_at: new Date("2026-04-04T12:00:00.000Z") as unknown as string,
      due_at: null,
      proof_required: false,
      status: "ACTIVE",
    });

    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/operator/sober-house/control-plane?organizationId=org-alpine",
      headers: {
        authorization: "Bearer DEV_demo",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        residentLiveObligations: [
          expect.objectContaining({
            obligationId: "sho-date-object",
            scheduledAt: "2026-04-04T08:00:00.000Z",
            dueAt: "2026-04-04T09:00:00.000Z",
          }),
          expect.objectContaining({
            obligationId: "sho-string",
            scheduledAt: "2026-04-04T10:00:00.000Z",
            dueAt: "2026-04-04T11:00:00.000Z",
          }),
          expect.objectContaining({
            obligationId: "sho-date-scheduled-only",
            scheduledAt: "2026-04-04T12:00:00.000Z",
            dueAt: null,
          }),
        ],
      },
    });

    await app.close();
    await db.end?.();
  });

  it("normalizes participant profile created_at and updated_at before building resident memberships", async () => {
    db.addParticipantProfile({
      user_id: "enduser-a1",
      tenant_id: "tenant-a",
      participant_type: "resident_user",
      organization_id: "org-alpine",
      house_id: "house-alpine-1",
      court_program_id: null,
      status: "ACTIVE",
      created_at: new Date("2026-04-01T15:30:00.000Z") as unknown as string,
      updated_at: new Date("2026-04-02T09:45:00.000Z") as unknown as string,
    });

    const app = createTestApp(db);

    const response = await app.inject({
      method: "GET",
      url: "/v1/operator/sober-house/control-plane?organizationId=org-alpine",
      headers: {
        authorization: "Bearer DEV_demo",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        store: {
          residentHouseMemberships: [
            expect.objectContaining({
              residentId: "enduser-a1",
              moveInDate: "2026-04-01",
              createdAt: "2026-04-01T15:30:00.000Z",
              updatedAt: "2026-04-02T09:45:00.000Z",
            }),
          ],
        },
      },
    });

    await app.close();
    await db.end?.();
  });
});
