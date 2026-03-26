import {
  type ObligationPriority,
  type ObligationSourceTrack,
  type ObligationStatus,
  type ObligationType,
  type ParticipantProfileStatus,
  type ParticipantType,
  ComplianceEventType,
  IncidentType,
  Role,
  SponsorRepeatDay,
  SponsorRepeatUnit,
  type ViolationStatus,
  type ViolationType,
} from "@recovery/shared-types";
import type { ActorContext } from "../domain/actor";
import type {
  ExclusionZoneType,
  ObligationSnapshotInput,
  ParticipantComplianceEventInput,
  ParticipantProfileRow,
  MeetingGuideNearbyFilters,
  Repositories,
  SupervisorAttendanceFilters,
  SupervisorLiveLocationFilters,
  SupervisorIncidentFilters,
} from "./repositories";
import type { NormalizedMeetingGuideMeeting } from "../meeting-guide";

export class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessDeniedError";
  }
}

type ParticipantAccessScope = {
  isPlatformOwner: boolean;
  organizationIds: string[];
  courtProgramIds: string[];
};

const ORGANIZATION_MANAGER_ROLES = new Set(["org_admin", "house_manager"]);
const COURT_MANAGER_ROLES = new Set(["probation_officer", "parole_officer", "court_supervisor"]);

async function resolveParticipantAccessScope(
  repositories: Repositories,
  actor: ActorContext,
): Promise<ParticipantAccessScope> {
  const accessContext = await repositories.findAccessContextByUserId(actor.userId);
  if (!accessContext) {
    return {
      isPlatformOwner: false,
      organizationIds: [],
      courtProgramIds: [],
    };
  }

  return {
    isPlatformOwner: accessContext.capabilities.isPlatformOwner,
    organizationIds: Array.from(
      new Set(
        accessContext.grants
          .filter(
            (grant) =>
              (ORGANIZATION_MANAGER_ROLES.has(grant.role) || grant.role === "platform_owner") &&
              grant.organizationId,
          )
          .map((grant) => grant.organizationId as string),
      ),
    ),
    courtProgramIds: Array.from(
      new Set(
        accessContext.grants
          .filter(
            (grant) =>
              (COURT_MANAGER_ROLES.has(grant.role) || grant.role === "platform_owner") &&
              grant.courtProgramId,
          )
          .map((grant) => grant.courtProgramId as string),
      ),
    ),
  };
}

function isProfileVisibleToScope(
  scope: ParticipantAccessScope,
  profile: Pick<ParticipantProfileRow, "organization_id" | "court_program_id">,
): boolean {
  if (scope.isPlatformOwner) {
    return true;
  }
  if (profile.organization_id && scope.organizationIds.includes(profile.organization_id)) {
    return true;
  }
  if (profile.court_program_id && scope.courtProgramIds.includes(profile.court_program_id)) {
    return true;
  }
  return false;
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
          repeatUnit: SponsorRepeatUnit;
          repeatInterval: number;
          repeatDays: SponsorRepeatDay[];
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
    homeGroupBirthdays: {
      get(actor: ActorContext) {
        return repositories.getHomeGroupBirthdayMembership(actor.tenantId, actor.userId);
      },
      upsert(
        actor: ActorContext,
        payload: {
          homeGroupActive: boolean;
          homeGroupKey: string | null;
          homeGroupName: string | null;
          birthdaysEnabled: boolean;
          firstName: string | null;
          lastName: string | null;
          sobrietyDateIso: string | null;
        },
      ) {
        return repositories.upsertHomeGroupBirthdayMembership(
          actor.tenantId,
          actor.userId,
          payload,
          actor.userId,
        );
      },
      listAnnouncements(actor: ActorContext, todayIso: string) {
        return repositories.listHomeGroupBirthdayAnnouncements(
          actor.tenantId,
          actor.userId,
          todayIso,
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
    meetingGuide: {
      list(actor: ActorContext, filters: { dayOfWeek?: number; limit?: number } = {}) {
        return repositories.meetingGuideMeetings.list(actor.tenantId, filters);
      },
      nearby(
        actor: ActorContext,
        center: { lat: number; lng: number; radiusMiles: number },
        filters: MeetingGuideNearbyFilters = {},
      ) {
        return repositories.meetingGuideMeetings.listNearby(actor.tenantId, center, filters);
      },
      upsertForFeed(
        actor: ActorContext,
        sourceFeedId: string,
        meetings: NormalizedMeetingGuideMeeting[],
        now: Date,
      ) {
        return repositories.meetingGuideMeetings.upsertForFeed(
          actor.tenantId,
          sourceFeedId,
          meetings,
          now,
        );
      },
    },
    meetingFeeds: {
      upsert(
        actor: ActorContext,
        payload: {
          name: string;
          url: string;
          entity?: string;
          entityUrl?: string;
          active?: boolean;
        },
      ) {
        return repositories.meetingFeeds.upsert(actor.tenantId, payload);
      },
      listActive(actor: ActorContext) {
        return repositories.meetingFeeds.listActive(actor.tenantId);
      },
      markFetchResult(
        actor: ActorContext,
        feedId: string,
        payload: {
          etag?: string | null;
          lastModified?: string | null;
          lastError?: string | null;
          fetchedAt: Date;
        },
      ) {
        return repositories.meetingFeeds.markFetchResult(actor.tenantId, feedId, payload);
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
    participantProfiles: {
      upsertSelf(
        actor: ActorContext,
        payload: {
          participantType: ParticipantType;
          organizationId?: string | null;
          houseId?: string | null;
          courtProgramId?: string | null;
          status: ParticipantProfileStatus;
        },
      ) {
        return repositories.upsertParticipantProfile(actor.tenantId, actor.userId, payload);
      },
      getSelf(actor: ActorContext) {
        return repositories.getParticipantProfile(actor.tenantId, actor.userId);
      },
      async listScoped(
        actor: ActorContext,
        filters: {
          userId?: string;
          participantType?: ParticipantType;
          organizationId?: string;
          houseId?: string;
          courtProgramId?: string;
          status?: ParticipantProfileStatus;
        } = {},
      ) {
        const scope = await resolveParticipantAccessScope(repositories, actor);
        if (
          !scope.isPlatformOwner &&
          scope.organizationIds.length === 0 &&
          scope.courtProgramIds.length === 0
        ) {
          throw new AccessDeniedError("Protected participant scope is required.");
        }

        return (await repositories.listParticipantProfiles(actor.tenantId)).filter((profile) => {
          if (!isProfileVisibleToScope(scope, profile)) {
            return false;
          }
          if (filters.userId && profile.user_id !== filters.userId) {
            return false;
          }
          if (filters.participantType && profile.participant_type !== filters.participantType) {
            return false;
          }
          if (filters.organizationId && profile.organization_id !== filters.organizationId) {
            return false;
          }
          if (filters.houseId && profile.house_id !== filters.houseId) {
            return false;
          }
          if (filters.courtProgramId && profile.court_program_id !== filters.courtProgramId) {
            return false;
          }
          if (filters.status && profile.status !== filters.status) {
            return false;
          }
          return true;
        });
      },
    },
    participantObligations: {
      syncSelf(actor: ActorContext, source: string, obligations: ObligationSnapshotInput[]) {
        return repositories.syncParticipantObligations(
          actor.tenantId,
          actor.userId,
          source,
          obligations,
          actor.userId,
          "MOBILE_APP",
        );
      },
      listSelf(
        actor: ActorContext,
        filters: {
          status?: ObligationStatus;
          organizationId?: string;
          houseId?: string;
          courtProgramId?: string;
        } = {},
      ) {
        return repositories.listObligations(actor.tenantId, {
          userId: actor.userId,
          status: filters.status,
          organizationId: filters.organizationId,
          houseId: filters.houseId,
          courtProgramId: filters.courtProgramId,
        });
      },
      async listScoped(
        actor: ActorContext,
        filters: {
          userId?: string;
          status?: ObligationStatus;
          obligationType?: ObligationType;
          organizationId?: string;
          houseId?: string;
          courtProgramId?: string;
          sourceTrack?: ObligationSourceTrack;
          priority?: ObligationPriority;
        } = {},
      ) {
        const scope = await resolveParticipantAccessScope(repositories, actor);
        if (
          !scope.isPlatformOwner &&
          scope.organizationIds.length === 0 &&
          scope.courtProgramIds.length === 0
        ) {
          throw new AccessDeniedError("Protected participant scope is required.");
        }

        return (
          await repositories.listObligations(actor.tenantId, {
            userId: filters.userId,
            status: filters.status,
            organizationId: filters.organizationId,
            houseId: filters.houseId,
            courtProgramId: filters.courtProgramId,
          })
        ).filter((obligation) => {
          if (
            !scope.isPlatformOwner &&
            !(
              (obligation.organization_id &&
                scope.organizationIds.includes(obligation.organization_id)) ||
              (obligation.court_program_id &&
                scope.courtProgramIds.includes(obligation.court_program_id))
            )
          ) {
            return false;
          }
          if (filters.obligationType && obligation.obligation_type !== filters.obligationType) {
            return false;
          }
          if (filters.sourceTrack && obligation.source_track !== filters.sourceTrack) {
            return false;
          }
          if (filters.priority && obligation.priority !== filters.priority) {
            return false;
          }
          return true;
        });
      },
    },
    participantCompliance: {
      recordSelf(actor: ActorContext, payload: ParticipantComplianceEventInput) {
        return repositories.recordParticipantComplianceEvent(actor.tenantId, actor.userId, payload);
      },
      listSelf(
        actor: ActorContext,
        filters: {
          obligationId?: string;
          organizationId?: string;
          houseId?: string;
          courtProgramId?: string;
        } = {},
      ) {
        return repositories.listComplianceEvents(actor.tenantId, {
          userId: actor.userId,
          obligationId: filters.obligationId,
          organizationId: filters.organizationId,
          houseId: filters.houseId,
          courtProgramId: filters.courtProgramId,
        });
      },
      async listScoped(
        actor: ActorContext,
        filters: {
          userId?: string;
          obligationId?: string;
          organizationId?: string;
          houseId?: string;
          courtProgramId?: string;
        } = {},
      ) {
        const scope = await resolveParticipantAccessScope(repositories, actor);
        if (
          !scope.isPlatformOwner &&
          scope.organizationIds.length === 0 &&
          scope.courtProgramIds.length === 0
        ) {
          throw new AccessDeniedError("Protected participant scope is required.");
        }

        return (await repositories.listComplianceEvents(actor.tenantId, filters)).filter(
          (event) => {
            if (scope.isPlatformOwner) {
              return true;
            }
            return (
              (event.organization_id && scope.organizationIds.includes(event.organization_id)) ||
              (event.court_program_id && scope.courtProgramIds.includes(event.court_program_id))
            );
          },
        );
      },
    },
    participantViolations: {
      listSelf(
        actor: ActorContext,
        filters: {
          status?: ViolationStatus;
          violationType?: ViolationType;
          organizationId?: string;
          houseId?: string;
          courtProgramId?: string;
        } = {},
      ) {
        return repositories.listViolations(actor.tenantId, {
          userId: actor.userId,
          status: filters.status,
          violationType: filters.violationType,
          organizationId: filters.organizationId,
          houseId: filters.houseId,
          courtProgramId: filters.courtProgramId,
        });
      },
      async listScoped(
        actor: ActorContext,
        filters: {
          userId?: string;
          status?: ViolationStatus;
          violationType?: ViolationType;
          organizationId?: string;
          houseId?: string;
          courtProgramId?: string;
        } = {},
      ) {
        const scope = await resolveParticipantAccessScope(repositories, actor);
        if (
          !scope.isPlatformOwner &&
          scope.organizationIds.length === 0 &&
          scope.courtProgramIds.length === 0
        ) {
          throw new AccessDeniedError("Protected participant scope is required.");
        }

        return (await repositories.listViolations(actor.tenantId, filters)).filter((violation) => {
          if (scope.isPlatformOwner) {
            return true;
          }
          return (
            (violation.organization_id &&
              scope.organizationIds.includes(violation.organization_id)) ||
            (violation.court_program_id &&
              scope.courtProgramIds.includes(violation.court_program_id))
          );
        });
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
