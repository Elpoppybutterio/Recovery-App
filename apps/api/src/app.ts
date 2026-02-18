import { createLogger } from "@recovery/shared-utils";
import {
  IncidentStatus,
  IncidentType,
  Permission,
  Role,
  locationPingSchema,
} from "@recovery/shared-types";
import Fastify from "fastify";
import { z } from "zod";
import { auditResponseIfNeeded, createAuditLogger } from "./audit";
import { buildAuthenticateRequest } from "./auth";
import type { DbPool } from "./db/client";
import { createPostgresPool } from "./db/postgres";
import { createRepositories } from "./db/repositories";
import { AccessDeniedError, createTenantRepositories } from "./db/tenantRepositories";
import { loadApiEnv, type ApiEnv } from "./env";
import { requirePermission, requireRole, requireSupervisorAssignment } from "./rbac";

const logger = createLogger("api");

const tenantConfigBodySchema = z.object({
  value: z.unknown(),
});

const meetingCreateBodySchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  radiusM: z.number().int().positive(),
});

const attendanceCheckInBodySchema = z.object({
  meetingId: z.string().min(1),
});

const attendanceCheckOutBodySchema = z.object({
  attendanceId: z.string().min(1),
});

const attendanceSignParamsSchema = z.object({
  attendanceId: z.string().min(1),
});

const attendanceSignBodySchema = z.object({
  signatureBlob: z.string().min(1),
});

const supervisorAttendanceQuerySchema = z.object({
  userId: z.string().min(1).optional(),
  meetingId: z.string().min(1).optional(),
});

const zoneCreateBodySchema = z.discriminatedUnion("type", [
  z.object({
    label: z.string().min(1),
    type: z.literal("CIRCLE"),
    active: z.boolean().optional(),
    centerLat: z.number(),
    centerLng: z.number(),
    radiusM: z.number().int().positive(),
    polygonGeoJson: z.unknown().optional(),
  }),
  z.object({
    label: z.string().min(1),
    type: z.literal("POLYGON"),
    active: z.boolean().optional(),
    centerLat: z.number().optional(),
    centerLng: z.number().optional(),
    radiusM: z.number().int().positive().optional(),
    polygonGeoJson: z.record(z.unknown()),
  }),
]);

const userZoneRuleBodySchema = z.object({
  zoneId: z.string().min(1),
  bufferM: z.number().int().nonnegative().default(0),
  active: z.boolean().default(true),
});

const incidentReportBodySchema = z.object({
  zoneId: z.string().min(1),
  type: z.nativeEnum(IncidentType),
  occurredAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const supervisorIncidentsQuerySchema = z.object({
  userId: z.string().min(1).optional(),
  zoneId: z.string().min(1).optional(),
  status: z.nativeEnum(IncidentStatus).optional(),
  type: z.nativeEnum(IncidentType).optional(),
});

const supervisorLiveQuerySchema = z.object({
  userId: z.string().min(1).optional(),
});

const supervisionUpdateParamsSchema = z.object({
  userId: z.string().min(1),
});

const supervisionUpdateBodySchema = z.object({
  enabled: z.boolean(),
  supervisionEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const WARNING_DISTANCE_FEET = 200;
const FEET_TO_METERS = 0.3048;
const WARNING_DISTANCE_METERS = WARNING_DISTANCE_FEET * FEET_TO_METERS;
const INCIDENT_DEDUPE_WINDOW_MINUTES = 10;
const EARTH_RADIUS_METERS = 6371000;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMetersBetween(
  leftLat: number,
  leftLng: number,
  rightLat: number,
  rightLng: number,
): number {
  const latDelta = toRadians(rightLat - leftLat);
  const lngDelta = toRadians(rightLng - leftLng);
  const leftLatRad = toRadians(leftLat);
  const rightLatRad = toRadians(rightLat);

  const value =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(leftLatRad) * Math.cos(rightLatRad) * Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2);
  const arc = 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  return EARTH_RADIUS_METERS * arc;
}

export function buildApp(options: { db?: DbPool; env?: ApiEnv; now?: () => Date } = {}) {
  const env = options.env ?? loadApiEnv();
  const app = Fastify();
  const db = options.db ?? createPostgresPool(env.DATABASE_URL);
  const repositories = createRepositories(db);
  const tenantRepositories = createTenantRepositories(repositories);
  const isManagedDb = !options.db;
  const now = options.now ?? (() => new Date());

  app.decorate("db", db);
  app.decorate("auditLogger", createAuditLogger(db));

  app.addHook("onRequest", async (request) => {
    logger.info("request.start", {
      method: request.method,
      url: request.url,
    });
  });

  app.addHook("onResponse", auditResponseIfNeeded);

  if (isManagedDb) {
    app.addHook("onClose", async () => {
      await db.end?.();
    });
  }

  const authenticateRequest = buildAuthenticateRequest(repositories, {
    enableDevAuth: env.ENABLE_DEV_AUTH,
  });

  app.get("/health", async () => {
    return {
      status: "ok",
      service: "api",
      ts: new Date().toISOString(),
    };
  });

  app.get(
    "/v1/me",
    {
      preHandler: [authenticateRequest],
      config: {
        audit: {
          action: "auth.me.read",
          subjectType: "user",
          subjectIdFrom: "actor",
          sensitiveRead: true,
        },
      },
    },
    async (request) => {
      return { actor: request.actor };
    },
  );

  app.get(
    "/v1/me/zones",
    {
      preHandler: [authenticateRequest, requireRole(Role.END_USER)],
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const rules = await tenantRepositories.zoneRules.listForUser(actor, actor.userId);
      return {
        zones: rules.map((rule) => ({
          ruleId: rule.id,
          userId: rule.user_id,
          zoneId: rule.zone_id,
          bufferM: rule.buffer_m,
          active: rule.active,
          zone: {
            id: rule.zone_id,
            label: rule.zone_label,
            type: rule.zone_type,
            active: rule.zone_active,
            centerLat: rule.center_lat,
            centerLng: rule.center_lng,
            radiusM: rule.radius_m,
            polygonGeoJson: rule.polygon_geojson,
          },
        })),
      };
    },
  );

  app.post(
    "/v1/location/ping",
    {
      preHandler: [authenticateRequest, requireRole(Role.END_USER)],
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const parsed = locationPingSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "bad_request",
          message: "Invalid location ping payload",
          details: parsed.error.flatten(),
        });
        return;
      }

      const recordedAt = parsed.data.recordedAt ? new Date(parsed.data.recordedAt) : now();
      const location = await tenantRepositories.locations.upsert(actor, {
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        accuracyM: parsed.data.accuracyM,
        recordedAt,
        source: "MOBILE",
      });
      if (!location) {
        reply.code(404).send({ error: "not_found", message: "User not found" });
        return;
      }

      const rules = await tenantRepositories.zoneRules.listForUser(actor, actor.userId);
      const incidentsCreated: Array<{
        id: string;
        zoneId: string;
        type: IncidentType;
        occurredAt: string;
      }> = [];
      const dedupeSince = new Date(recordedAt.getTime() - INCIDENT_DEDUPE_WINDOW_MINUTES * 60_000);
      const configValue = await tenantRepositories.tenantConfig.getValue(
        actor,
        "default_supervisor_email",
      );
      const supervisorRecipient =
        typeof configValue === "string" && configValue.trim().length > 0
          ? configValue.trim()
          : null;
      let notificationsQueued = 0;

      for (const rule of rules) {
        if (
          rule.zone_type !== "CIRCLE" ||
          rule.center_lat === null ||
          rule.center_lng === null ||
          rule.radius_m === null
        ) {
          continue;
        }

        const distanceM = distanceMetersBetween(
          parsed.data.lat,
          parsed.data.lng,
          rule.center_lat,
          rule.center_lng,
        );
        const boundaryM = rule.radius_m + rule.buffer_m;
        let incidentType: IncidentType | null = null;
        if (distanceM <= boundaryM) {
          incidentType = IncidentType.VIOLATION;
        } else if (distanceM <= boundaryM + WARNING_DISTANCE_METERS) {
          incidentType = IncidentType.WARNING;
        }

        if (!incidentType) {
          continue;
        }

        const existing = await tenantRepositories.incidents.findRecent(actor, {
          userId: actor.userId,
          zoneId: rule.zone_id,
          type: incidentType,
          since: dedupeSince,
        });
        if (existing) {
          continue;
        }

        const incident = await tenantRepositories.incidents.report(actor, {
          zoneId: rule.zone_id,
          type: incidentType,
          occurredAt: recordedAt,
          metadata: {
            source: "location_ping",
            distanceM: Math.round(distanceM),
            boundaryM,
            warningDistanceM: Math.round(WARNING_DISTANCE_METERS),
          },
        });
        if (!incident) {
          continue;
        }

        incidentsCreated.push({
          id: incident.id,
          zoneId: incident.zone_id,
          type: incident.incident_type,
          occurredAt: incident.occurred_at,
        });

        if (incidentType === IncidentType.VIOLATION && supervisorRecipient) {
          await tenantRepositories.notificationEvents.create(actor, {
            userId: actor.userId,
            channel: "EMAIL",
            recipient: supervisorRecipient,
            templateKey: "incident_violation",
            payload: {
              userId: actor.userId,
              zoneId: incident.zone_id,
              type: incident.incident_type,
              occurredAt: incident.occurred_at,
            },
          });
          notificationsQueued += 1;
        }
      }

      await app.auditLogger.log({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "location.ping",
        subjectType: "location",
        subjectId: actor.userId,
        metadata: {
          recordedAt: location.recorded_at,
          incidentsCreated: incidentsCreated.length,
          notificationsQueued,
        },
      });

      return {
        location: {
          userId: location.user_id,
          lat: location.lat,
          lng: location.lng,
          accuracyM: location.accuracy_m,
          recordedAt: location.recorded_at,
          source: location.source,
        },
        incidentsCreated,
        notificationsQueued,
      };
    },
  );

  app.get(
    "/v1/supervisor/live",
    {
      preHandler: [authenticateRequest, requireRole(Role.SUPERVISOR, Role.ADMIN)],
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const parsedQuery = supervisorLiveQuerySchema.safeParse(request.query ?? {});
      if (!parsedQuery.success) {
        reply.code(400).send({
          error: "bad_request",
          message: "Invalid live location filters",
          details: parsedQuery.error.flatten(),
        });
        return;
      }

      try {
        const records = await tenantRepositories.locations.listSupervisorLive(
          actor,
          parsedQuery.data,
        );
        const evaluatedAt = now();
        const locations = records.map((record) => {
          const freshnessSeconds = Math.max(
            0,
            Math.floor((evaluatedAt.getTime() - new Date(record.recorded_at).getTime()) / 1000),
          );
          return {
            userId: record.user_id,
            lat: record.lat,
            lng: record.lng,
            accuracyM: record.accuracy_m,
            recordedAt: record.recorded_at,
            freshnessSeconds,
            source: record.source,
          };
        });

        await app.auditLogger.log({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: "supervisor.live.view",
          subjectType: "live_location_list",
          subjectId: parsedQuery.data.userId ?? null,
          metadata: {
            userId: parsedQuery.data.userId ?? null,
            count: locations.length,
          },
        });

        return { locations };
      } catch (error) {
        if (error instanceof AccessDeniedError) {
          reply.code(403).send({ error: "forbidden", message: error.message });
          return;
        }
        throw error;
      }
    },
  );

  app.get(
    "/v1/users/:userId",
    {
      preHandler: [
        authenticateRequest,
        requirePermission(Permission.VIEW_ASSIGNED_USERS),
        requireSupervisorAssignment(tenantRepositories),
      ],
    },
    async (request, reply) => {
      const params = request.params as { userId: string };
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const user = await tenantRepositories.tenantUser.get(actor, params.userId);
      if (!user) {
        reply.code(404).send({ error: "not_found", message: "User not found" });
        return;
      }

      return {
        id: user.id,
        tenantId: user.tenant_id,
        email: user.email,
        displayName: user.display_name,
      };
    },
  );

  app.put(
    "/v1/users/:userId/supervision",
    {
      preHandler: [
        authenticateRequest,
        requireRole(Role.ADMIN, Role.SUPERVISOR),
        requireSupervisorAssignment(tenantRepositories),
      ],
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const parsedParams = supervisionUpdateParamsSchema.safeParse(request.params);
      const parsedBody = supervisionUpdateBodySchema.safeParse(request.body);
      if (!parsedParams.success || !parsedBody.success) {
        reply.code(400).send({
          error: "bad_request",
          message: "Invalid supervision update payload",
          details: {
            params: parsedParams.success ? undefined : parsedParams.error.flatten(),
            body: parsedBody.success ? undefined : parsedBody.error.flatten(),
          },
        });
        return;
      }

      const supervisionEndDate =
        parsedBody.data.enabled && parsedBody.data.supervisionEndDate
          ? new Date(`${parsedBody.data.supervisionEndDate}T23:59:59.999Z`)
          : null;

      try {
        const updated = await tenantRepositories.users.updateSupervision(
          actor,
          parsedParams.data.userId,
          {
            enabled: parsedBody.data.enabled,
            supervisionEndDate,
          },
        );
        if (!updated) {
          reply.code(404).send({ error: "not_found", message: "User not found" });
          return;
        }

        await app.auditLogger.log({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: "user.supervision.updated",
          subjectType: "user",
          subjectId: updated.id,
          metadata: {
            enabled: updated.supervision_enabled,
            supervisionEndDate: updated.supervision_end_date,
          },
        });

        return {
          userId: updated.id,
          supervisionEnabled: updated.supervision_enabled,
          supervisionEndDate: updated.supervision_end_date,
        };
      } catch (error) {
        if (error instanceof AccessDeniedError) {
          reply.code(403).send({ error: "forbidden", message: error.message });
          return;
        }
        throw error;
      }
    },
  );

  app.post(
    "/v1/meetings",
    {
      preHandler: [authenticateRequest, requireRole(Role.ADMIN, Role.SUPERVISOR)],
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const parsed = meetingCreateBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "bad_request",
          message: "Invalid meeting payload",
          details: parsed.error.flatten(),
        });
        return;
      }

      const meeting = await tenantRepositories.meetings.create(actor, parsed.data);
      reply.code(201).send({
        id: meeting.id,
        tenantId: meeting.tenant_id,
        name: meeting.name,
        address: meeting.address,
        lat: meeting.lat,
        lng: meeting.lng,
        radiusM: meeting.radius_m,
        createdAt: meeting.created_at,
        createdByUserId: meeting.created_by_user_id,
      });
    },
  );

  app.get(
    "/v1/meetings",
    {
      preHandler: [
        authenticateRequest,
        requireRole(Role.END_USER, Role.SUPERVISOR, Role.ADMIN, Role.MEETING_VERIFIER),
      ],
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const meetings = await tenantRepositories.meetings.list(actor);
      return {
        meetings: meetings.map((meeting) => ({
          id: meeting.id,
          tenantId: meeting.tenant_id,
          name: meeting.name,
          address: meeting.address,
          lat: meeting.lat,
          lng: meeting.lng,
          radiusM: meeting.radius_m,
          createdAt: meeting.created_at,
          createdByUserId: meeting.created_by_user_id,
        })),
      };
    },
  );

  app.post(
    "/v1/zones",
    {
      preHandler: [authenticateRequest, requireRole(Role.ADMIN, Role.SUPERVISOR)],
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const parsed = zoneCreateBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "bad_request",
          message: "Invalid zone payload",
          details: parsed.error.flatten(),
        });
        return;
      }

      const zone = await tenantRepositories.zones.create(actor, {
        label: parsed.data.label,
        type: parsed.data.type,
        active: parsed.data.active ?? true,
        centerLat: parsed.data.centerLat,
        centerLng: parsed.data.centerLng,
        radiusM: parsed.data.radiusM,
        polygonGeoJson: parsed.data.polygonGeoJson,
      });

      await app.auditLogger.log({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "zones.created",
        subjectType: "exclusion_zone",
        subjectId: zone.id,
        metadata: {
          zoneType: zone.zone_type,
          active: zone.active,
        },
      });

      reply.code(201).send({
        zone: {
          id: zone.id,
          tenantId: zone.tenant_id,
          label: zone.label,
          type: zone.zone_type,
          active: zone.active,
          centerLat: zone.center_lat,
          centerLng: zone.center_lng,
          radiusM: zone.radius_m,
          polygonGeoJson: zone.polygon_geojson,
          createdAt: zone.created_at,
          createdByUserId: zone.created_by_user_id,
        },
      });
    },
  );

  app.get(
    "/v1/zones",
    {
      preHandler: [authenticateRequest, requireRole(Role.ADMIN, Role.SUPERVISOR)],
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const zones = await tenantRepositories.zones.list(actor);
      return {
        zones: zones.map((zone) => ({
          id: zone.id,
          tenantId: zone.tenant_id,
          label: zone.label,
          type: zone.zone_type,
          active: zone.active,
          centerLat: zone.center_lat,
          centerLng: zone.center_lng,
          radiusM: zone.radius_m,
          polygonGeoJson: zone.polygon_geojson,
          createdAt: zone.created_at,
          createdByUserId: zone.created_by_user_id,
        })),
      };
    },
  );

  app.post(
    "/v1/users/:userId/zones",
    {
      preHandler: [
        authenticateRequest,
        requireRole(Role.ADMIN, Role.SUPERVISOR),
        requireSupervisorAssignment(tenantRepositories),
      ],
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const params = z.object({ userId: z.string().min(1) }).safeParse(request.params);
      const parsed = userZoneRuleBodySchema.safeParse(request.body);
      if (!params.success || !parsed.success) {
        reply.code(400).send({
          error: "bad_request",
          message: "Invalid user-zone rule payload",
          details: {
            params: params.success ? undefined : params.error.flatten(),
            body: parsed.success ? undefined : parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const rule = await tenantRepositories.zoneRules.assign(
          actor,
          params.data.userId,
          parsed.data,
        );
        if (!rule) {
          reply.code(404).send({ error: "not_found", message: "Exclusion zone not found" });
          return;
        }

        await app.auditLogger.log({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: "zone_rules.assigned",
          subjectType: "user_zone_rule",
          subjectId: rule.id,
          metadata: {
            userId: rule.user_id,
            zoneId: rule.zone_id,
            bufferM: rule.buffer_m,
            active: rule.active,
          },
        });

        reply.code(201).send({
          rule: {
            id: rule.id,
            tenantId: rule.tenant_id,
            userId: rule.user_id,
            zoneId: rule.zone_id,
            bufferM: rule.buffer_m,
            active: rule.active,
          },
        });
      } catch (error) {
        if (error instanceof AccessDeniedError) {
          reply.code(403).send({ error: "forbidden", message: error.message });
          return;
        }
        throw error;
      }
    },
  );

  app.post(
    "/v1/incidents/report",
    {
      preHandler: [authenticateRequest, requireRole(Role.END_USER)],
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const parsed = incidentReportBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "bad_request",
          message: "Invalid incident payload",
          details: parsed.error.flatten(),
        });
        return;
      }

      try {
        const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : now();
        const incident = await tenantRepositories.incidents.report(actor, {
          zoneId: parsed.data.zoneId,
          type: parsed.data.type,
          occurredAt,
          metadata: parsed.data.metadata,
        });
        if (!incident) {
          reply.code(404).send({ error: "not_found", message: "Exclusion zone not found" });
          return;
        }

        const configValue = await tenantRepositories.tenantConfig.getValue(
          actor,
          "default_supervisor_email",
        );
        let notificationsQueued = 0;
        if (typeof configValue === "string" && configValue.trim().length > 0) {
          await tenantRepositories.notificationEvents.create(actor, {
            userId: actor.userId,
            channel: "EMAIL",
            recipient: configValue,
            templateKey:
              parsed.data.type === IncidentType.VIOLATION
                ? "incident_violation"
                : "incident_warning",
            payload: {
              userId: actor.userId,
              zoneId: incident.zone_id,
              type: incident.incident_type,
              occurredAt: incident.occurred_at,
            },
          });
          notificationsQueued = 1;
        } else {
          // TODO(notifications): support tenant-level recipient fanout and delivery workers.
        }

        await app.auditLogger.log({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: "incident.reported",
          subjectType: "incident",
          subjectId: incident.id,
          metadata: {
            zoneId: incident.zone_id,
            type: incident.incident_type,
            notificationsQueued,
          },
        });

        reply.code(201).send({
          incident: {
            id: incident.id,
            tenantId: incident.tenant_id,
            userId: incident.user_id,
            zoneId: incident.zone_id,
            type: incident.incident_type,
            occurredAt: incident.occurred_at,
            status: incident.status,
            metadata: incident.metadata_json,
            createdAt: incident.created_at,
          },
          notificationsQueued,
        });
      } catch (error) {
        if (error instanceof AccessDeniedError) {
          reply.code(403).send({ error: "forbidden", message: error.message });
          return;
        }
        throw error;
      }
    },
  );

  app.get(
    "/v1/supervisor/incidents",
    {
      preHandler: [authenticateRequest, requireRole(Role.SUPERVISOR, Role.ADMIN)],
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const parsedQuery = supervisorIncidentsQuerySchema.safeParse(request.query ?? {});
      if (!parsedQuery.success) {
        reply.code(400).send({
          error: "bad_request",
          message: "Invalid incident filters",
          details: parsedQuery.error.flatten(),
        });
        return;
      }

      try {
        const incidents = await tenantRepositories.supervisorIncidents.list(
          actor,
          parsedQuery.data,
        );

        await app.auditLogger.log({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: "supervisor.incidents.list_view",
          subjectType: "incident_list",
          subjectId: parsedQuery.data.userId ?? null,
          metadata: {
            userId: parsedQuery.data.userId ?? null,
            zoneId: parsedQuery.data.zoneId ?? null,
            status: parsedQuery.data.status ?? null,
            type: parsedQuery.data.type ?? null,
            count: incidents.length,
          },
        });

        return {
          incidents: incidents.map((incident) => ({
            id: incident.id,
            tenantId: incident.tenant_id,
            userId: incident.user_id,
            zoneId: incident.zone_id,
            zoneLabel: incident.zone_label,
            type: incident.incident_type,
            occurredAt: incident.occurred_at,
            status: incident.status,
            metadata: incident.metadata_json,
            createdAt: incident.created_at,
          })),
        };
      } catch (error) {
        if (error instanceof AccessDeniedError) {
          reply.code(403).send({ error: "forbidden", message: error.message });
          return;
        }
        throw error;
      }
    },
  );

  app.post(
    "/v1/attendance/check-in",
    {
      preHandler: [authenticateRequest, requireRole(Role.END_USER)],
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const parsed = attendanceCheckInBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "bad_request",
          message: "Invalid check-in payload",
          details: parsed.error.flatten(),
        });
        return;
      }

      const attendance = await tenantRepositories.attendance.checkIn(
        actor,
        parsed.data.meetingId,
        now(),
      );
      if (!attendance) {
        reply.code(404).send({ error: "not_found", message: "Meeting not found" });
        return;
      }

      await app.auditLogger.log({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "attendance.check_in",
        subjectType: "attendance",
        subjectId: attendance.id,
        metadata: {
          meetingId: attendance.meeting_id,
          checkInAt: attendance.check_in_at,
        },
      });

      reply.code(201).send({
        attendance: {
          id: attendance.id,
          meetingId: attendance.meeting_id,
          userId: attendance.user_id,
          checkInAt: attendance.check_in_at,
          checkOutAt: attendance.check_out_at,
          dwellSeconds: attendance.dwell_seconds,
          status: attendance.status,
        },
      });
    },
  );

  app.post(
    "/v1/attendance/check-out",
    {
      preHandler: [authenticateRequest, requireRole(Role.END_USER)],
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const parsed = attendanceCheckOutBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "bad_request",
          message: "Invalid check-out payload",
          details: parsed.error.flatten(),
        });
        return;
      }

      const attendance = await tenantRepositories.attendance.checkOut(
        actor,
        parsed.data.attendanceId,
        now(),
      );
      if (!attendance) {
        reply.code(404).send({ error: "not_found", message: "Attendance record not found" });
        return;
      }

      await app.auditLogger.log({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "attendance.check_out",
        subjectType: "attendance",
        subjectId: attendance.id,
        metadata: {
          meetingId: attendance.meeting_id,
          dwellSeconds: attendance.dwell_seconds,
          status: attendance.status,
        },
      });

      return {
        attendance: {
          id: attendance.id,
          meetingId: attendance.meeting_id,
          userId: attendance.user_id,
          checkInAt: attendance.check_in_at,
          checkOutAt: attendance.check_out_at,
          dwellSeconds: attendance.dwell_seconds,
          status: attendance.status,
        },
      };
    },
  );

  app.post(
    "/v1/attendance/:attendanceId/sign",
    {
      preHandler: [authenticateRequest, requireRole(Role.MEETING_VERIFIER, Role.ADMIN)],
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const parsedParams = attendanceSignParamsSchema.safeParse(request.params);
      const parsedBody = attendanceSignBodySchema.safeParse(request.body);
      if (!parsedParams.success || !parsedBody.success) {
        reply.code(400).send({
          error: "bad_request",
          message: "Invalid signature payload",
          details: {
            params: parsedParams.success ? undefined : parsedParams.error.flatten(),
            body: parsedBody.success ? undefined : parsedBody.error.flatten(),
          },
        });
        return;
      }

      const result = await tenantRepositories.signatures.sign(
        actor,
        parsedParams.data.attendanceId,
        parsedBody.data.signatureBlob,
        now(),
      );
      if (!result) {
        reply.code(404).send({ error: "not_found", message: "Attendance record not found" });
        return;
      }

      await app.auditLogger.log({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "attendance.signed",
        subjectType: "attendance",
        subjectId: result.attendance.id,
        metadata: {
          signatureId: result.signatureId,
          alreadySigned: result.alreadySigned,
          status: result.attendance.status,
        },
      });

      return {
        attendance: {
          id: result.attendance.id,
          meetingId: result.attendance.meeting_id,
          userId: result.attendance.user_id,
          checkInAt: result.attendance.check_in_at,
          checkOutAt: result.attendance.check_out_at,
          dwellSeconds: result.attendance.dwell_seconds,
          status: result.attendance.status,
        },
        signatureId: result.signatureId,
        alreadySigned: result.alreadySigned,
      };
    },
  );

  app.get(
    "/v1/supervisor/attendance",
    {
      preHandler: [authenticateRequest, requireRole(Role.SUPERVISOR, Role.ADMIN)],
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const parsedQuery = supervisorAttendanceQuerySchema.safeParse(request.query ?? {});
      if (!parsedQuery.success) {
        reply.code(400).send({
          error: "bad_request",
          message: "Invalid attendance filters",
          details: parsedQuery.error.flatten(),
        });
        return;
      }

      try {
        const records = await tenantRepositories.attendance.getForSupervisorList(
          actor,
          parsedQuery.data,
        );

        await app.auditLogger.log({
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: "supervisor.attendance.list_view",
          subjectType: "attendance_list",
          subjectId: parsedQuery.data.userId ?? null,
          metadata: {
            userId: parsedQuery.data.userId ?? null,
            meetingId: parsedQuery.data.meetingId ?? null,
            count: records.length,
          },
        });

        return {
          attendance: records.map((record) => ({
            id: record.id,
            tenantId: record.tenant_id,
            userId: record.user_id,
            meetingId: record.meeting_id,
            meetingName: record.meeting_name,
            checkInAt: record.check_in_at,
            checkOutAt: record.check_out_at,
            dwellSeconds: record.dwell_seconds,
            status: record.status,
          })),
        };
      } catch (error) {
        if (error instanceof AccessDeniedError) {
          reply.code(403).send({ error: "forbidden", message: error.message });
          return;
        }
        throw error;
      }
    },
  );

  app.put(
    "/v1/admin/config/tenant/:key",
    {
      preHandler: [authenticateRequest, requireRole(Role.ADMIN)],
      config: {
        audit: {
          action: "admin.config.update",
          subjectType: "tenant_config",
          subjectIdFrom: "param:key",
          sensitiveRead: false,
        },
      },
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const params = request.params as { key: string };
      const parsed = tenantConfigBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "bad_request",
          message: "Invalid tenant config payload",
          details: parsed.error.flatten(),
        });
        return;
      }

      await tenantRepositories.tenantConfig.upsert(actor, params.key, parsed.data.value);
      return { key: params.key, value: parsed.data.value };
    },
  );

  return app;
}
