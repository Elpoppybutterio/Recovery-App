import { ComplianceEventType, Role } from "@recovery/shared-types";
import { describe, expect, it, vi } from "vitest";
import type { ActorContext } from "../src/domain/actor";
import { createTenantRepositories } from "../src/db/tenantRepositories";

describe("tenantRepositories facade", () => {
  it("uses actor.tenantId and actor.userId for scoped calls", async () => {
    const repositories = {
      findTenantUser: vi.fn(),
      upsertTenantConfig: vi.fn(),
      isSupervisorAssignedToUser: vi.fn().mockResolvedValue(true),
      updateUserSupervision: vi.fn(),
      createMeeting: vi.fn(),
      listMeetings: vi.fn(),
      checkInAttendance: vi.fn(),
      checkOutAttendance: vi.fn(),
      listSupervisorAttendance: vi.fn(),
      signAttendance: vi.fn(),
      upsertLastKnownLocation: vi.fn(),
      getLastKnownLocation: vi.fn(),
      listSupervisorLiveLocations: vi.fn(),
      createComplianceEvent: vi.fn(),
      zoneRules: {
        assign: vi.fn(),
        listForUser: vi.fn(),
      },
      incidents: {
        findRecent: vi.fn(),
        report: vi.fn(),
      },
      notificationEvents: {
        create: vi.fn(),
      },
      zones: {
        create: vi.fn(),
        list: vi.fn(),
      },
      getTenantConfigValue: vi.fn(),
      supervisorIncidents: {
        list: vi.fn(),
      },
    };
    const tenantRepositories = createTenantRepositories(repositories as never);
    const actor: ActorContext = {
      userId: "supervisor-1",
      tenantId: "tenant-xyz",
      roles: [Role.SUPERVISOR],
    };

    await tenantRepositories.tenantUser.get(actor, "target-user-1");
    await tenantRepositories.tenantConfig.upsert(actor, "geo.buffer", { meters: 50 });
    await tenantRepositories.supervisor.isAssigned(actor, "target-user-1");
    await tenantRepositories.meetings.create(actor, {
      name: "Downtown AA",
      address: "123 Main",
      lat: 10,
      lng: 20,
      radiusM: 100,
    });
    await tenantRepositories.meetings.list(actor);
    await tenantRepositories.attendance.checkIn(
      actor,
      "meeting-1",
      new Date("2026-01-01T00:00:00.000Z"),
    );
    await tenantRepositories.attendance.checkOut(
      actor,
      "attendance-1",
      new Date("2026-01-01T01:00:00.000Z"),
    );
    await tenantRepositories.attendance.getForSupervisorList(actor, { userId: "target-user-1" });
    await tenantRepositories.signatures.sign(
      actor,
      "attendance-1",
      "base64-signature",
      new Date("2026-01-01T01:01:00.000Z"),
    );
    await tenantRepositories.locations.upsert(actor, {
      lat: 33.755,
      lng: -84.39,
      accuracyM: 15,
      recordedAt: new Date("2026-01-01T01:02:00.000Z"),
      source: "MOBILE",
    });
    await tenantRepositories.locations.get(actor, "target-user-1");
    await tenantRepositories.locations.listSupervisorLive(actor, { userId: "target-user-1" });
    await tenantRepositories.complianceEvents.create(
      actor,
      "target-user-1",
      ComplianceEventType.LOCATION_STALE,
      { staleBySeconds: 300 },
      new Date("2026-01-01T01:03:00.000Z"),
    );
    await tenantRepositories.users.updateSupervision(actor, "target-user-1", {
      enabled: true,
      supervisionEndDate: new Date("2026-02-01T00:00:00.000Z"),
    });

    expect(repositories.findTenantUser).toHaveBeenCalledWith("tenant-xyz", "target-user-1");
    expect(repositories.upsertTenantConfig).toHaveBeenCalledWith(
      "tenant-xyz",
      "geo.buffer",
      { meters: 50 },
      "supervisor-1",
    );
    expect(repositories.isSupervisorAssignedToUser).toHaveBeenCalledWith(
      "tenant-xyz",
      "supervisor-1",
      "target-user-1",
    );
    expect(repositories.createMeeting).toHaveBeenCalledWith("tenant-xyz", "supervisor-1", {
      name: "Downtown AA",
      address: "123 Main",
      lat: 10,
      lng: 20,
      radiusM: 100,
    });
    expect(repositories.listMeetings).toHaveBeenCalledWith("tenant-xyz");
    expect(repositories.checkInAttendance).toHaveBeenCalledWith(
      "tenant-xyz",
      "supervisor-1",
      "meeting-1",
      new Date("2026-01-01T00:00:00.000Z"),
    );
    expect(repositories.checkOutAttendance).toHaveBeenCalledWith(
      "tenant-xyz",
      "supervisor-1",
      "attendance-1",
      new Date("2026-01-01T01:00:00.000Z"),
    );
    expect(repositories.listSupervisorAttendance).toHaveBeenCalledWith(
      "tenant-xyz",
      "supervisor-1",
      false,
      { userId: "target-user-1" },
    );
    expect(repositories.signAttendance).toHaveBeenCalledWith(
      "tenant-xyz",
      "attendance-1",
      "supervisor-1",
      "base64-signature",
      new Date("2026-01-01T01:01:00.000Z"),
    );
    expect(repositories.upsertLastKnownLocation).toHaveBeenCalledWith(
      "tenant-xyz",
      "supervisor-1",
      {
        lat: 33.755,
        lng: -84.39,
        accuracyM: 15,
        recordedAt: new Date("2026-01-01T01:02:00.000Z"),
        source: "MOBILE",
      },
    );
    expect(repositories.getLastKnownLocation).toHaveBeenCalledWith("tenant-xyz", "target-user-1");
    expect(repositories.listSupervisorLiveLocations).toHaveBeenCalledWith(
      "tenant-xyz",
      "supervisor-1",
      false,
      { userId: "target-user-1" },
    );
    expect(repositories.createComplianceEvent).toHaveBeenCalledWith(
      "tenant-xyz",
      "target-user-1",
      "LOCATION_STALE",
      { staleBySeconds: 300 },
      new Date("2026-01-01T01:03:00.000Z"),
    );
    expect(repositories.updateUserSupervision).toHaveBeenCalledWith(
      "tenant-xyz",
      "target-user-1",
      true,
      new Date("2026-02-01T00:00:00.000Z"),
    );
  });
});
