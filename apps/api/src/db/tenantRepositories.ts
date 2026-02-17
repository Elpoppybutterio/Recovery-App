import { Role } from "@recovery/shared-types";
import type { ActorContext } from "../domain/actor";
import type { Repositories, SupervisorAttendanceFilters } from "./repositories";

export class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export function createTenantRepositories(repositories: Repositories) {
  return {
    tenantUser: {
      get(actor: ActorContext, userId: string) {
        return repositories.findTenantUser(actor.tenantId, userId);
      },
    },
    tenantConfig: {
      upsert(actor: ActorContext, key: string, value: unknown) {
        return repositories.upsertTenantConfig(actor.tenantId, key, value, actor.userId);
      },
    },
    supervisor: {
      isAssigned(actor: ActorContext, targetUserId: string) {
        return repositories.isSupervisorAssignedToUser(actor.tenantId, actor.userId, targetUserId);
      },
    },
    meetings: {
      create(
        actor: ActorContext,
        payload: { name: string; address: string; lat: number; lng: number; radiusM: number },
      ) {
        return repositories.createMeeting(actor.tenantId, actor.userId, payload);
      },
      list(actor: ActorContext) {
        return repositories.listMeetings(actor.tenantId);
      },
    },
    attendance: {
      checkIn(actor: ActorContext, meetingId: string, now: Date) {
        return repositories.checkInAttendance(actor.tenantId, actor.userId, meetingId, now);
      },
      checkOut(actor: ActorContext, attendanceId: string, now: Date) {
        return repositories.checkOutAttendance(actor.tenantId, actor.userId, attendanceId, now);
      },
      async getForSupervisorList(actor: ActorContext, filters: SupervisorAttendanceFilters = {}) {
        const isAdmin = actor.roles.includes(Role.ADMIN);
        if (!isAdmin && !actor.roles.includes(Role.SUPERVISOR)) {
          throw new AccessDeniedError(`Requires role: ${Role.SUPERVISOR}`);
        }

        if (!isAdmin && filters.userId) {
          const assigned = await repositories.isSupervisorAssignedToUser(
            actor.tenantId,
            actor.userId,
            filters.userId,
          );
          if (!assigned) {
            throw new AccessDeniedError("Supervisor can only access assigned users");
          }
        }

        return repositories.listSupervisorAttendance(
          actor.tenantId,
          actor.userId,
          isAdmin,
          filters,
        );
      },
    },
    signatures: {
      sign(actor: ActorContext, attendanceId: string, signatureBlob: string, now: Date) {
        return repositories.signAttendance(
          actor.tenantId,
          attendanceId,
          actor.userId,
          signatureBlob,
          now,
        );
      },
    },
  };
}

export type TenantRepositories = ReturnType<typeof createTenantRepositories>;
