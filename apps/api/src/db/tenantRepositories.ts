import { ComplianceEventType, IncidentType, Role, SponsorRepeatRule } from "@recovery/shared-types";
import type { ActorContext } from "../domain/actor";
import type {
  ExclusionZoneType,
  Repositories,
  SupervisorAttendanceFilters,
  SupervisorLiveLocationFilters,
  SupervisorIncidentFilters,
} from "./repositories";

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
      getValue(actor: ActorContext, key: string) {
        return repositories.getTenantConfigValue(actor.tenantId, key);
      },
    },
    sponsorConfig: {
      get(actor: ActorContext) {
        return repositories.getSponsorConfig(actor.tenantId, actor.userId);
      },
      upsert(
        actor: ActorContext,
        payload: {
          sponsorName: string;
          sponsorPhoneE164: string;
          callTimeLocalHhmm: string;
          repeatRule: SponsorRepeatRule;
          active: boolean;
        },
      ) {
        return repositories.upsertSponsorConfig(
          actor.tenantId,
          actor.userId,
          payload,
          actor.userId,
        );
      },
    },
    supervisor: {
      isAssigned(actor: ActorContext, targetUserId: string) {
        return repositories.isSupervisorAssignedToUser(actor.tenantId, actor.userId, targetUserId);
      },
    },
    users: {
      async updateSupervision(
        actor: ActorContext,
        targetUserId: string,
        payload: { enabled: boolean; supervisionEndDate: Date | null },
      ) {
        const isAdmin = actor.roles.includes(Role.ADMIN);
        if (!isAdmin) {
          if (!actor.roles.includes(Role.SUPERVISOR)) {
            throw new AccessDeniedError(`Requires role: ${Role.SUPERVISOR}`);
          }

          const assigned = await repositories.isSupervisorAssignedToUser(
            actor.tenantId,
            actor.userId,
            targetUserId,
          );
          if (!assigned) {
            throw new AccessDeniedError("Supervisor can only access assigned users");
          }
        }

        return repositories.updateUserSupervision(
          actor.tenantId,
          targetUserId,
          payload.enabled,
          payload.supervisionEndDate,
        );
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
    zones: {
      create(
        actor: ActorContext,
        payload: {
          label: string;
          type: ExclusionZoneType;
          active: boolean;
          centerLat?: number;
          centerLng?: number;
          radiusM?: number;
          polygonGeoJson?: unknown;
        },
      ) {
        return repositories.zones.create(actor.tenantId, actor.userId, payload);
      },
      list(actor: ActorContext) {
        return repositories.zones.list(actor.tenantId);
      },
    },
    zoneRules: {
      async assign(
        actor: ActorContext,
        targetUserId: string,
        payload: { zoneId: string; bufferM: number; active: boolean },
      ) {
        const isAdmin = actor.roles.includes(Role.ADMIN);
        if (!isAdmin) {
          if (!actor.roles.includes(Role.SUPERVISOR)) {
            throw new AccessDeniedError(`Requires role: ${Role.SUPERVISOR}`);
          }

          const assigned = await repositories.isSupervisorAssignedToUser(
            actor.tenantId,
            actor.userId,
            targetUserId,
          );
          if (!assigned) {
            throw new AccessDeniedError("Supervisor can only access assigned users");
          }
        }

        return repositories.zoneRules.assign(
          actor.tenantId,
          targetUserId,
          payload.zoneId,
          payload.bufferM,
          payload.active,
        );
      },
      listForUser(actor: ActorContext, userId: string) {
        return repositories.zoneRules.listForUser(actor.tenantId, userId);
      },
    },
    incidents: {
      findRecent(
        actor: ActorContext,
        payload: { userId: string; zoneId: string; type: IncidentType; since: Date },
      ) {
        return repositories.incidents.findRecent(
          actor.tenantId,
          payload.userId,
          payload.zoneId,
          payload.type,
          payload.since,
        );
      },
      report(
        actor: ActorContext,
        payload: {
          zoneId: string;
          type: IncidentType;
          occurredAt: Date;
          metadata?: Record<string, unknown>;
        },
      ) {
        if (!actor.roles.includes(Role.END_USER)) {
          throw new AccessDeniedError(`Requires role: ${Role.END_USER}`);
        }

        return repositories.incidents.report(
          actor.tenantId,
          actor.userId,
          payload.zoneId,
          payload.type,
          payload.occurredAt,
          payload.metadata,
        );
      },
    },
    locations: {
      upsert(
        actor: ActorContext,
        payload: {
          lat: number;
          lng: number;
          accuracyM?: number;
          recordedAt: Date;
          source?: string;
        },
      ) {
        return repositories.upsertLastKnownLocation(actor.tenantId, actor.userId, payload);
      },
      get(actor: ActorContext, userId: string) {
        return repositories.getLastKnownLocation(actor.tenantId, userId);
      },
      async listSupervisorLive(actor: ActorContext, filters: SupervisorLiveLocationFilters = {}) {
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

        return repositories.listSupervisorLiveLocations(
          actor.tenantId,
          actor.userId,
          isAdmin,
          filters,
        );
      },
    },
    complianceEvents: {
      create(
        actor: ActorContext,
        userId: string,
        type: ComplianceEventType,
        metadata: Record<string, unknown> | undefined,
        occurredAt: Date,
      ) {
        return repositories.createComplianceEvent(
          actor.tenantId,
          userId,
          type,
          metadata,
          occurredAt,
        );
      },
    },
    notificationEvents: {
      create(
        actor: ActorContext,
        payload: {
          userId: string;
          channel: "EMAIL" | "SMS";
          recipient: string;
          templateKey: string;
          payload: Record<string, unknown>;
          status?: string;
        },
      ) {
        return repositories.notificationEvents.create(actor.tenantId, payload.userId, {
          channel: payload.channel,
          recipient: payload.recipient,
          templateKey: payload.templateKey,
          payload: payload.payload,
          status: payload.status,
        });
      },
    },
    supervisorIncidents: {
      async list(actor: ActorContext, filters: SupervisorIncidentFilters = {}) {
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

        return repositories.supervisorIncidents.list(
          actor.tenantId,
          actor.userId,
          filters,
          isAdmin,
        );
      },
    },
  };
}

export type TenantRepositories = ReturnType<typeof createTenantRepositories>;
