import { Role } from "@recovery/shared-types";
import { beforeEach, describe, expect, it } from "vitest";
import type { InMemoryDb } from "./in-memory-db";
import { createTestApp, createTestDb, seedCoreFixtures } from "./test-helpers";

describe("participant compliance foundation", () => {
  let db: InMemoryDb;

  beforeEach(async () => {
    db = await createTestDb();
    await seedCoreFixtures(db);
  });

  async function syncParticipantProfileAndObligation(input: {
    app: ReturnType<typeof createTestApp>;
    authUserId: string;
    participantType: "recovery_user" | "resident_user" | "court_participant";
    organizationId?: string | null;
    houseId?: string | null;
    courtProgramId?: string | null;
    syncKey?: string;
    obligationType?: "sponsor_contact" | "chore" | "court_appearance";
    sourceTrack?: "sponsor" | "resident" | "court";
  }) {
    const profileResponse = await input.app.inject({
      method: "PUT",
      url: "/v1/me/participant-profile",
      headers: { authorization: `Bearer DEV_${input.authUserId}` },
      payload: {
        participantType: input.participantType,
        organizationId: input.organizationId ?? null,
        houseId: input.houseId ?? null,
        courtProgramId: input.courtProgramId ?? null,
        status: "ACTIVE",
      },
    });
    expect(profileResponse.statusCode).toBe(200);

    const obligationsResponse = await input.app.inject({
      method: "PUT",
      url: "/v1/me/obligations/snapshot",
      headers: { authorization: `Bearer DEV_${input.authUserId}` },
      payload: {
        source: "mobile_sync",
        obligations: [
          {
            syncKey: input.syncKey ?? `${input.authUserId}-primary`,
            obligationType: input.obligationType ?? "sponsor_contact",
            sourceTrack: input.sourceTrack ?? "sponsor",
            title: `${input.authUserId} obligation`,
            description: "Synced from mobile participant flow",
            organizationId: input.organizationId ?? null,
            houseId: input.houseId ?? null,
            courtProgramId: input.courtProgramId ?? null,
            requiresProof: false,
            requiresSignature: false,
            status: "ACTIVE",
          },
        ],
      },
    });

    expect(obligationsResponse.statusCode).toBe(200);
    return obligationsResponse.json() as { obligations: Array<{ id: string; user_id: string }> };
  }

  it("lets participants read their own obligations only", async () => {
    const app = createTestApp(db);
    await syncParticipantProfileAndObligation({
      app,
      authUserId: "enduser-a1",
      participantType: "resident_user",
      organizationId: "org-alpine",
      houseId: "house-alpine-1",
      obligationType: "chore",
      sourceTrack: "resident",
    });

    const ownResponse = await app.inject({
      method: "GET",
      url: "/v1/me/obligations",
      headers: { authorization: "Bearer DEV_enduser-a1" },
    });
    expect(ownResponse.statusCode).toBe(200);
    expect(
      (ownResponse.json() as { obligations: Array<{ user_id: string }> }).obligations,
    ).toHaveLength(1);

    const forbidden = await app.inject({
      method: "GET",
      url: "/v1/participants/obligations?userId=enduser-a2",
      headers: { authorization: "Bearer DEV_enduser-a1" },
    });
    expect(forbidden.statusCode).toBe(403);

    await app.close();
    await db.end?.();
  });

  it("limits org-scoped admin queries to their authorized organization", async () => {
    const app = createTestApp(db);

    await syncParticipantProfileAndObligation({
      app,
      authUserId: "enduser-a1",
      participantType: "resident_user",
      organizationId: "org-alpine",
      houseId: "house-alpine-1",
      obligationType: "chore",
      sourceTrack: "resident",
    });

    db.addOrganization({
      id: "org-ember",
      tenant_id: "tenant-a",
      name: "Ember Recovery Housing",
    });
    db.addHouse({
      id: "house-ember-1",
      tenant_id: "tenant-a",
      organization_id: "org-ember",
      name: "Ember House 1",
    });
    db.addUser({
      id: "resident-ember",
      tenant_id: "tenant-a",
      email: "resident-ember@example.com",
      display_name: "Resident Ember",
    });
    db.addUserRole({ tenant_id: "tenant-a", user_id: "resident-ember", role: Role.END_USER });
    db.addParticipantProfile({
      user_id: "resident-ember",
      tenant_id: "tenant-a",
      participant_type: "resident_user",
      organization_id: "org-ember",
      house_id: "house-ember-1",
      court_program_id: null,
      status: "ACTIVE",
    });
    db.addObligation({
      id: "ob-ember",
      tenant_id: "tenant-a",
      user_id: "resident-ember",
      obligation_type: "chore",
      source_track: "resident",
      title: "Ember chore",
      description: null,
      organization_id: "org-ember",
      house_id: "house-ember-1",
      court_program_id: null,
      due_at: null,
      recurrence_json: null,
      priority: null,
      requires_proof: false,
      requires_signature: false,
      status: "ACTIVE",
      sync_source: "mobile_sync",
      sync_key: "resident-ember-primary",
      created_by_user_id: "resident-ember",
      created_by_role: "MOBILE_APP",
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/participants/obligations",
      headers: { authorization: "Bearer DEV_manager-a" },
    });

    expect(response.statusCode).toBe(200);
    expect(
      (response.json() as { obligations: Array<{ user_id: string }> }).obligations.map(
        (entry) => entry.user_id,
      ),
    ).toEqual(["enduser-a1"]);

    await app.close();
    await db.end?.();
  });

  it("limits court-scoped supervisor queries to their authorized court program", async () => {
    const app = createTestApp(db);

    await syncParticipantProfileAndObligation({
      app,
      authUserId: "enduser-a2",
      participantType: "court_participant",
      courtProgramId: "court-boulder",
      obligationType: "court_appearance",
      sourceTrack: "court",
    });

    db.addCourtProgram({
      id: "court-jefferson",
      tenant_id: "tenant-a",
      name: "Jefferson Recovery Court",
      jurisdiction: "Jefferson County",
    });
    db.addUser({
      id: "court-other",
      tenant_id: "tenant-a",
      email: "court-other@example.com",
      display_name: "Court Other",
    });
    db.addUserRole({ tenant_id: "tenant-a", user_id: "court-other", role: Role.END_USER });
    db.addParticipantProfile({
      user_id: "court-other",
      tenant_id: "tenant-a",
      participant_type: "court_participant",
      organization_id: null,
      house_id: null,
      court_program_id: "court-jefferson",
      status: "ACTIVE",
    });
    db.addObligation({
      id: "ob-court-other",
      tenant_id: "tenant-a",
      user_id: "court-other",
      obligation_type: "court_appearance",
      source_track: "court",
      title: "Jefferson check-in",
      description: null,
      organization_id: null,
      house_id: null,
      court_program_id: "court-jefferson",
      due_at: null,
      recurrence_json: null,
      priority: "HIGH",
      requires_proof: true,
      requires_signature: false,
      status: "ACTIVE",
      sync_source: "mobile_sync",
      sync_key: "court-other-primary",
      created_by_user_id: "court-other",
      created_by_role: "MOBILE_APP",
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/participants/obligations",
      headers: { authorization: "Bearer DEV_officer-a" },
    });

    expect(response.statusCode).toBe(200);
    expect(
      (response.json() as { obligations: Array<{ user_id: string }> }).obligations.map(
        (entry) => entry.user_id,
      ),
    ).toEqual(["enduser-a2"]);

    await app.close();
    await db.end?.();
  });

  it("records participant compliance events for synced obligations", async () => {
    const app = createTestApp(db);
    const synced = await syncParticipantProfileAndObligation({
      app,
      authUserId: "enduser-a1",
      participantType: "resident_user",
      organizationId: "org-alpine",
      houseId: "house-alpine-1",
      obligationType: "chore",
      sourceTrack: "resident",
    });
    const obligationId = synced.obligations[0]?.id;
    expect(obligationId).toBeTruthy();

    const response = await app.inject({
      method: "POST",
      url: "/v1/me/compliance-events",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: {
        obligationId,
        eventType: "CHORE_COMPLETED",
        eventStatus: "COMPLETED",
        occurredAt: "2026-03-26T12:00:00.000Z",
        metadata: { completedBy: "resident" },
        externalEventId: "evt-chore-complete-1",
        sourceTrack: "resident",
      },
    });

    expect(response.statusCode).toBe(201);

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/me/compliance-events",
      headers: { authorization: "Bearer DEV_enduser-a1" },
    });
    expect(listResponse.statusCode).toBe(200);
    expect(
      (listResponse.json() as { complianceEvents: Array<{ event_type: string }> }).complianceEvents,
    ).toHaveLength(1);

    await app.close();
    await db.end?.();
  });

  it("creates violations from missed obligation events", async () => {
    const app = createTestApp(db);
    const synced = await syncParticipantProfileAndObligation({
      app,
      authUserId: "enduser-a1",
      participantType: "resident_user",
      organizationId: "org-alpine",
      houseId: "house-alpine-1",
      obligationType: "chore",
      sourceTrack: "resident",
    });
    const obligationId = synced.obligations[0]?.id;
    expect(obligationId).toBeTruthy();

    const response = await app.inject({
      method: "POST",
      url: "/v1/me/compliance-events",
      headers: { authorization: "Bearer DEV_enduser-a1" },
      payload: {
        obligationId,
        eventType: "CHORE_MISSED",
        eventStatus: "MISSED",
        occurredAt: "2026-03-26T18:00:00.000Z",
        metadata: { reason: "missed house chore" },
        externalEventId: "evt-chore-missed-1",
        sourceTrack: "resident",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(
      (response.json() as { violation: { violation_type: string } | null }).violation,
    ).toMatchObject({
      violation_type: "missed_chore",
    });

    const violationsResponse = await app.inject({
      method: "GET",
      url: "/v1/me/violations?status=OPEN",
      headers: { authorization: "Bearer DEV_enduser-a1" },
    });
    expect(violationsResponse.statusCode).toBe(200);
    expect(
      (violationsResponse.json() as { violations: Array<{ violation_type: string }> }).violations,
    ).toHaveLength(1);

    await app.close();
    await db.end?.();
  });
});
