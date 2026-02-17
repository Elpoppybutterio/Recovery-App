import { Role } from "@recovery/shared-types";
import { describe, expect, it, vi } from "vitest";
import type { ActorContext } from "../src/domain/actor";
import { createTenantRepositories } from "../src/db/tenantRepositories";

describe("tenantRepositories facade", () => {
  it("uses actor.tenantId and actor.userId for scoped calls", async () => {
    const repositories = {
      findTenantUser: vi.fn(),
      upsertTenantConfig: vi.fn(),
      isSupervisorAssignedToUser: vi.fn().mockResolvedValue(true),
      createMeeting: vi.fn(),
      listMeetings: vi.fn(),
      checkInAttendance: vi.fn(),
      checkOutAttendance: vi.fn(),
      listSupervisorAttendance: vi.fn(),
      signAttendance: vi.fn(),
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
  });
});
