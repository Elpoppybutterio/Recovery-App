import { createLogger } from "@recovery/shared-utils";
import {
  IncidentStatus,
  IncidentType,
  Permission,
  Role,
  locationPingSchema,
  sponsorConfigSchema,
} from "@recovery/shared-types";
import Fastify from "fastify";
import { z } from "zod";
import { auditResponseIfNeeded, createAuditLogger } from "./audit";
import { buildAuthenticateRequest } from "./auth";
import type { DbPool } from "./db/client";
import { createPostgresPool } from "./db/postgres";
import { createRepositories, SignatureWindowError } from "./db/repositories";
import { AccessDeniedError, createTenantRepositories } from "./db/tenantRepositories";
import { loadApiEnv, type ApiEnv } from "./env";
import { bigBookPagesQuerySchema, getBigBookPagesForRange } from "./literature/bigbook";
import {
  ingestMeetingGuideFeedsForTenant,
  parseConfiguredMeetingGuideFeeds,
} from "./meeting-guide-ingest";
import { resolveMeetingGeoStatus } from "./meeting-geo";
import { mapTypeCodesToLabels } from "./meeting-guide";
import { requirePermission, requireRole, requireSupervisorAssignment } from "./rbac";
import { getDailyWisdomQuote, wisdomDailyQuerySchema } from "./wisdom";

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

const meetingsListQuerySchema = z
  .object({
    day: z.coerce.number().int().min(0).max(6).optional(),
    dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusMiles: z.coerce.number().positive().max(500).optional(),
  })
  .refine(
    (value) =>
      (typeof value.lat === "number" && typeof value.lng === "number") ||
      (typeof value.lat !== "number" && typeof value.lng !== "number"),
    {
      message: "lat and lng must be provided together",
      path: ["lat"],
    },
  );

const meetingsNearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusMiles: z.coerce.number().positive().max(200).default(20),
  format: z.enum(["in_person", "online", "any"]).default("any"),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
  when: z.enum(["upcoming", "all"]).default("upcoming"),
  now: z.string().datetime().optional(),
  types: z.string().optional(),
  timeFrom: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  timeTo: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

const meetingsIngestStatusQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).default(45.7833),
  lng: z.coerce.number().min(-180).max(180).default(-108.5007),
  radiusMiles: z.coerce.number().positive().max(200).default(20),
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
const MILES_TO_METERS = 1609.344;
const WARNING_DISTANCE_METERS = WARNING_DISTANCE_FEET * FEET_TO_METERS;
const INCIDENT_DEDUPE_WINDOW_MINUTES = 10;
const EARTH_RADIUS_METERS = 6371000;
const REQUIRED_MEETING_GUIDE_COLUMNS = [
  "geo_status",
  "geo_reason",
  "geo_updated_at",
  "geo_source",
  "geo_confidence",
  "geocoded_at",
] as const;

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

function shapeMeetingGuideGeoForApi(meeting: {
  lat: number | null;
  lng: number | null;
  formatted_address: string | null;
  address: string | null;
  geo_status: "ok" | "missing" | "invalid" | "partial" | "needs_geocode";
  geo_reason: string | null;
  geo_updated_at: string | null;
  geo_source: string | null;
  geo_confidence: number | null;
  geocoded_at: string | null;
}) {
  const resolved = resolveMeetingGeoStatus({
    lat: meeting.lat,
    lng: meeting.lng,
    formattedAddress: meeting.formatted_address ?? meeting.address,
  });
  const hasValidCoords =
    resolved.geoStatus === "ok" && resolved.lat !== null && resolved.lng !== null;
  const geoStatus = hasValidCoords
    ? meeting.geo_status
    : meeting.geo_status === "ok"
      ? "needs_geocode"
      : meeting.geo_status;

  return {
    lat: hasValidCoords ? resolved.lat : null,
    lng: hasValidCoords ? resolved.lng : null,
    geoStatus,
    geoReason: hasValidCoords
      ? (meeting.geo_reason ?? resolved.geoReason)
      : (meeting.geo_reason ?? resolved.geoReason ?? "invalid_coordinates"),
    geoUpdatedAt: meeting.geo_updated_at,
    geoSource: hasValidCoords ? meeting.geo_source : null,
    geoConfidence: hasValidCoords ? meeting.geo_confidence : null,
    geocodedAt: hasValidCoords ? meeting.geocoded_at : null,
  };
}

function isDevAuthHeader(value: string | undefined): boolean {
  if (typeof value !== "string") {
    return false;
  }
  return /^Bearer DEV_[A-Za-z0-9_-]+$/.test(value.trim());
}

async function validateMeetingGuideSchema(db: DbPool): Promise<void> {
  const result = await db.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'meeting_guide_meetings'
    `,
  );

  const available = new Set(result.rows.map((row) => row.column_name));
  const missing = REQUIRED_MEETING_GUIDE_COLUMNS.filter((column) => !available.has(column));
  if (missing.length === 0) {
    return;
  }

  logger.error("meeting_guide.schema.invalid", {
    fatal: true,
    migrationRequired: true,
    table: "meeting_guide_meetings",
    missingColumns: missing,
    message:
      "Missing required meeting_guide_meetings columns. Run API database migrations before starting the service.",
    runbook: "pnpm --filter @recovery/api run db:migrate",
  });
  throw new Error(
    `meeting_guide_meetings schema missing required columns: ${missing.join(", ")}. Run migrations and restart.`,
  );
}

export function buildApp(options: { db?: DbPool; env?: ApiEnv; now?: () => Date } = {}) {
  const env = options.env ?? loadApiEnv();
  const app = Fastify();
  const db = options.db ?? createPostgresPool(env.DATABASE_URL);
  const repositories = createRepositories(db);
  const tenantRepositories = createTenantRepositories(repositories);
  const isManagedDb = !options.db;
  const now = options.now ?? (() => new Date());
  let meetingGuideTimer: NodeJS.Timeout | undefined;
  let devMeetingRefreshLastRunAtMs = 0;
  const devMeetingNearbyWarmupByTenantMs = new Map<string, number>();

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
    app.addHook("onReady", async () => {
      await validateMeetingGuideSchema(db);
    });

    app.addHook("onClose", async () => {
      if (meetingGuideTimer) {
        clearInterval(meetingGuideTimer);
      }
      await db.end?.();
    });
  }

  const authenticateRequest = buildAuthenticateRequest(repositories, {
    enableDevAuth: env.ENABLE_DEV_AUTH,
  });

  const configuredMeetingGuideFeeds = parseConfiguredMeetingGuideFeeds(
    env.MEETING_GUIDE_FEEDS_JSON,
  );
  const legacyMeetingFeedUrls = Array.from(
    new Set(
      [...(env.MEETING_FEEDS_AA ?? "").split(","), ...(env.MEETING_FEEDS_NA ?? "").split(",")]
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  );
  let warnedNoMeetingGuideFeeds = false;

  logger.info("meeting_guide.config", {
    autoIngest: env.MEETING_GUIDE_AUTO_INGEST,
    geocodeMissingCoordinates: env.MEETING_GUIDE_GEOCODE_MISSING,
    defaultTenantId: env.MEETING_GUIDE_DEFAULT_TENANT_ID ?? null,
    refreshIntervalMs: env.MEETING_GUIDE_REFRESH_INTERVAL_MS,
    configuredFeedsCount: configuredMeetingGuideFeeds.length,
    legacyFeedsCount: legacyMeetingFeedUrls.length,
  });

  if (configuredMeetingGuideFeeds.length === 0 && legacyMeetingFeedUrls.length === 0) {
    logger.warn("meeting_guide.config.empty", {
      message:
        "No Meeting Guide feeds configured. Set MEETING_GUIDE_FEEDS_JSON or MEETING_FEEDS_AA/MEETING_FEEDS_NA.",
      developmentFallback:
        env.NODE_ENV !== "production"
          ? [
              "https://www.aa-montana.org/index.php?city=Billings",
              "https://www.aa-montana.org/index.php?city=Laurel",
            ]
          : null,
    });
  }

  const resolveTenantFeedConfigs = (tenantId: string) => {
    const scoped = configuredMeetingGuideFeeds.filter(
      (feed) => !feed.tenantId || feed.tenantId === tenantId,
    );

    if (scoped.length > 0) {
      return scoped;
    }

    if (legacyMeetingFeedUrls.length > 0) {
      return legacyMeetingFeedUrls.map((url) => ({
        name: "Legacy Meeting Feed",
        url,
      }));
    }

    if (env.NODE_ENV !== "production") {
      if (!warnedNoMeetingGuideFeeds) {
        warnedNoMeetingGuideFeeds = true;
        logger.warn("meeting_guide.config.dev_fallback", {
          tenantId,
          fallbackFeeds: [
            "https://www.aa-montana.org/index.php?city=Billings",
            "https://www.aa-montana.org/index.php?city=Laurel",
          ],
          message:
            "Using AA Montana city feeds because no external Meeting Guide feeds are configured.",
        });
      }
      return [
        {
          name: "AA Montana - Billings",
          url: "https://www.aa-montana.org/index.php?city=Billings",
          entity: "AA Montana",
          entityUrl: "https://www.aa-montana.org",
        },
        {
          name: "AA Montana - Laurel",
          url: "https://www.aa-montana.org/index.php?city=Laurel",
          entity: "AA Montana",
          entityUrl: "https://www.aa-montana.org",
        },
      ];
    }

    return legacyMeetingFeedUrls.map((url) => ({
      name: "Legacy Meeting Feed",
      url,
    }));
  };

  const runMeetingGuideIngestForTenant = async (tenantId: string) => {
    const feeds = resolveTenantFeedConfigs(tenantId);
    if (feeds.length === 0) {
      return {
        feedsAttempted: 0,
        feedsFailed: 0,
        meetingsFetched: 0,
        meetingsImported: 0,
        meetingsSkipped: 0,
        meetingsWithCoordinates: 0,
        meetingsWithoutCoordinates: 0,
      };
    }

    return ingestMeetingGuideFeedsForTenant({
      repositories,
      tenantId,
      configuredFeeds: feeds,
      now,
      logger,
      geocodeMissingCoordinates: env.MEETING_GUIDE_GEOCODE_MISSING,
      geocodeUserAgent: env.MEETING_GUIDE_GEOCODE_USER_AGENT,
    });
  };

  const autoIngestTenantId =
    env.MEETING_GUIDE_DEFAULT_TENANT_ID ??
    (env.NODE_ENV !== "production" && env.ENABLE_DEV_AUTH ? "tenant-a" : undefined);

  if (env.MEETING_GUIDE_AUTO_INGEST && autoIngestTenantId) {
    if (!env.MEETING_GUIDE_DEFAULT_TENANT_ID && env.NODE_ENV !== "production") {
      logger.warn("meeting_guide.config.dev_default_tenant_fallback", {
        tenantId: autoIngestTenantId,
        message:
          "MEETING_GUIDE_DEFAULT_TENANT_ID not set; using tenant-a fallback for dev auto-ingest.",
      });
    }

    void runMeetingGuideIngestForTenant(autoIngestTenantId).catch((error) => {
      logger.error("meeting_guide.ingest.startup_failed", {
        tenantId: autoIngestTenantId,
        reason: error instanceof Error ? error.message : "unknown",
      });
    });

    meetingGuideTimer = setInterval(() => {
      void runMeetingGuideIngestForTenant(autoIngestTenantId).catch((error) => {
        logger.error("meeting_guide.ingest.interval_failed", {
          tenantId: autoIngestTenantId,
          reason: error instanceof Error ? error.message : "unknown",
        });
      });
    }, env.MEETING_GUIDE_REFRESH_INTERVAL_MS);
  }

  app.get("/health", async () => {
    return {
      status: "ok",
      service: "api",
      ts: new Date().toISOString(),
    };
  });

  app.get(
    "/api/wisdom/daily",
    {
      preHandler: [
        authenticateRequest,
        requireRole(Role.END_USER, Role.SUPERVISOR, Role.ADMIN, Role.MEETING_VERIFIER),
      ],
    },
    async (request, reply) => {
      const parsedQuery = wisdomDailyQuerySchema.safeParse(request.query ?? {});
      if (!parsedQuery.success) {
        reply.code(400).send({
          error: "bad_request",
          message: "Invalid wisdom daily query",
          details: parsedQuery.error.flatten(),
        });
        return;
      }

      const { date, tz } = parsedQuery.data;
      return getDailyWisdomQuote(date, tz);
    },
  );

  app.get(
    "/v1/literature/bigbook/pages",
    {
      preHandler: [
        authenticateRequest,
        requireRole(Role.END_USER, Role.SUPERVISOR, Role.ADMIN, Role.MEETING_VERIFIER),
      ],
    },
    async (request, reply) => {
      const parsedQuery = bigBookPagesQuerySchema.safeParse(request.query ?? {});
      if (!parsedQuery.success) {
        reply.code(400).send({
          error: "bad_request",
          message: "Invalid Big Book pages query",
          details: parsedQuery.error.flatten(),
        });
        return;
      }

      const { start, end } = parsedQuery.data;
      const result = await getBigBookPagesForRange(start, end);
      return {
        edition: result.edition,
        licenseNotice: result.licenseNotice,
        range: { start, end },
        pages: result.pages,
      };
    },
  );

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
    "/v1/me/sponsor",
    {
      preHandler: [authenticateRequest, requireRole(Role.END_USER)],
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const config = await tenantRepositories.sponsorConfig.get(actor);

      await app.auditLogger.log({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "sponsor_config.viewed",
        subjectType: "sponsor_config",
        subjectId: actor.userId,
        metadata: {
          userId: actor.userId,
          configured: Boolean(config),
        },
      });

      if (!config) {
        return { sponsorConfig: null };
      }

      return {
        sponsorConfig: {
          id: config.id,
          userId: config.user_id,
          sponsorName: config.sponsor_name,
          sponsorPhoneE164: config.sponsor_phone_e164,
          callTimeLocalHhmm: config.call_time_local_hhmm,
          repeatRule: config.repeat_rule,
          repeatUnit: config.repeat_unit,
          repeatInterval: config.repeat_interval,
          repeatDays: config.repeat_days,
          active: config.active,
          createdAt: config.created_at,
          updatedAt: config.updated_at,
          updatedByUserId: config.updated_by_user_id,
        },
      };
    },
  );

  app.put(
    "/v1/me/sponsor",
    {
      preHandler: [authenticateRequest, requireRole(Role.END_USER)],
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const parsed = sponsorConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: "bad_request",
          message: "Invalid sponsor config payload",
          details: parsed.error.flatten(),
        });
        return;
      }

      const config = await tenantRepositories.sponsorConfig.upsert(actor, parsed.data);
      if (!config) {
        reply.code(404).send({ error: "not_found", message: "User not found" });
        return;
      }

      await app.auditLogger.log({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "sponsor_config.updated",
        subjectType: "sponsor_config",
        subjectId: actor.userId,
        metadata: {
          userId: actor.userId,
          repeatRule: config.repeat_rule,
          repeatUnit: config.repeat_unit,
          repeatInterval: config.repeat_interval,
          repeatDays: config.repeat_days,
          active: config.active,
        },
      });

      return {
        sponsorConfig: {
          id: config.id,
          userId: config.user_id,
          sponsorName: config.sponsor_name,
          sponsorPhoneE164: config.sponsor_phone_e164,
          callTimeLocalHhmm: config.call_time_local_hhmm,
          repeatRule: config.repeat_rule,
          repeatUnit: config.repeat_unit,
          repeatInterval: config.repeat_interval,
          repeatDays: config.repeat_days,
          active: config.active,
          createdAt: config.created_at,
          updatedAt: config.updated_at,
          updatedByUserId: config.updated_by_user_id,
        },
      };
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

      const parsedQuery = meetingsListQuerySchema.safeParse(request.query ?? {});
      if (!parsedQuery.success) {
        reply.code(400).send({
          error: "bad_request",
          message: "Invalid meetings query",
          details: parsedQuery.error.flatten(),
        });
        return;
      }

      const query = parsedQuery.data;
      const requestedDayOfWeek = query.dayOfWeek ?? query.day;
      const manualMeetings = await tenantRepositories.meetings.list(actor);
      let meetingGuideMeetings: Awaited<ReturnType<typeof tenantRepositories.meetingGuide.list>> =
        [];
      let meetingGuideWarning: string | null = null;
      try {
        meetingGuideMeetings = await tenantRepositories.meetingGuide.list(actor, {
          dayOfWeek: requestedDayOfWeek,
          limit: 1000,
        });
      } catch (error) {
        meetingGuideWarning = "Meeting Guide data temporarily unavailable";
        logger.error("meetings.list.meeting_guide_failed", {
          tenantId: actor.tenantId,
          reason: error instanceof Error ? error.message : "unknown",
        });
      }
      const resolvedRadiusMiles = query.radiusMiles ?? env.MEETING_IMPORT_RADIUS_MILES;
      const resolvedRadiusMeters = resolvedRadiusMiles * MILES_TO_METERS;
      const hasLocationFilter = typeof query.lat === "number" && typeof query.lng === "number";

      const scopedManualMeetings = hasLocationFilter
        ? manualMeetings.filter((meeting) => {
            const distanceM = distanceMetersBetween(
              query.lat!,
              query.lng!,
              meeting.lat,
              meeting.lng,
            );
            return distanceM <= resolvedRadiusMeters;
          })
        : manualMeetings;

      const scopedMeetingGuideMeetings = hasLocationFilter
        ? meetingGuideMeetings.filter((meeting) => {
            if (meeting.lat === null || meeting.lng === null) {
              return false;
            }
            const distanceM = distanceMetersBetween(
              query.lat!,
              query.lng!,
              meeting.lat,
              meeting.lng,
            );
            return distanceM <= resolvedRadiusMeters;
          })
        : meetingGuideMeetings;

      const mappedManualMeetings = scopedManualMeetings.map((meeting) => ({
        id: meeting.id,
        tenantId: meeting.tenant_id,
        name: meeting.name,
        address: meeting.address,
        lat: meeting.lat,
        lng: meeting.lng,
        radiusM: meeting.radius_m,
        createdAt: meeting.created_at,
        createdByUserId: meeting.created_by_user_id,
        dayOfWeek: requestedDayOfWeek ?? null,
        startsAtLocal: null,
        endsAtLocal: null,
        onlineUrl: null,
        types: [],
        typesDisplay: [],
        format: "IN_PERSON" as const,
        geoStatus: "ok" as const,
        geoReason: null,
        geoUpdatedAt: meeting.created_at,
        geoSource: "manual",
        geoConfidence: null,
        geocodedAt: null,
      }));

      const mappedMeetingGuideMeetings = scopedMeetingGuideMeetings.map((meeting) => {
        const typeCodes = Array.isArray(meeting.types_json)
          ? meeting.types_json
              .map((entry) => (typeof entry === "string" ? entry.toUpperCase() : null))
              .filter((entry): entry is string => entry !== null)
          : [];
        const hasOnline =
          typeof meeting.conference_url === "string" && meeting.conference_url.length > 0;
        const hasPhysical = meeting.lat !== null && meeting.lng !== null;
        const format = hasOnline && hasPhysical ? "HYBRID" : hasOnline ? "ONLINE" : "IN_PERSON";
        const fallbackAddress = [meeting.address, meeting.city, meeting.state]
          .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
          .join(", ");
        const address =
          meeting.formatted_address ??
          (fallbackAddress.length > 0 ? fallbackAddress : "Address unavailable");
        const geo = shapeMeetingGuideGeoForApi(meeting);

        return {
          id: meeting.id,
          tenantId: meeting.tenant_id,
          name: meeting.name,
          address,
          lat: geo.lat,
          lng: geo.lng,
          radiusM: null,
          createdAt: meeting.last_ingested_at,
          createdByUserId: "meeting-guide",
          dayOfWeek: meeting.day,
          startsAtLocal: meeting.time,
          endsAtLocal: meeting.end_time,
          onlineUrl: meeting.conference_url,
          types: typeCodes,
          typesDisplay: mapTypeCodesToLabels(typeCodes),
          format,
          geoStatus: geo.geoStatus,
          geoReason: geo.geoReason,
          geoUpdatedAt: geo.geoUpdatedAt,
          geoSource: geo.geoSource,
          geoConfidence: geo.geoConfidence,
          geocodedAt: geo.geocodedAt,
        };
      });

      const combinedById = new Map<string, Record<string, unknown>>();
      for (const meeting of mappedManualMeetings) {
        combinedById.set(meeting.id, meeting);
      }
      for (const meeting of mappedMeetingGuideMeetings) {
        combinedById.set(meeting.id, meeting);
      }
      const combinedMeetings = Array.from(combinedById.values());
      if (meetingGuideWarning && combinedMeetings.length === 0) {
        reply.code(503).send({
          code: "MEETINGS_FEED_UNAVAILABLE",
          message: "Meeting feed temporarily unavailable",
          meetings: [],
          filters: {
            dayOfWeek: requestedDayOfWeek ?? null,
            radiusMiles: resolvedRadiusMiles,
            locationScoped: hasLocationFilter,
          },
          warning: meetingGuideWarning,
        });
        return;
      }

      return {
        meetings: combinedMeetings,
        filters: {
          dayOfWeek: requestedDayOfWeek ?? null,
          radiusMiles: resolvedRadiusMiles,
          locationScoped: hasLocationFilter,
        },
        warning: meetingGuideWarning,
      };
    },
  );

  app.get(
    "/v1/meetings/nearby",
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

      const parsedQuery = meetingsNearbyQuerySchema.safeParse(request.query ?? {});
      if (!parsedQuery.success) {
        reply.code(400).send({
          error: "bad_request",
          message: "Invalid nearby meetings query",
          details: parsedQuery.error.flatten(),
        });
        return;
      }

      const typeFilters = parsedQuery.data.types
        ? parsedQuery.data.types
            .split(",")
            .map((entry) => entry.trim().toUpperCase())
            .filter((entry) => entry.length > 0)
        : [];

      let meetings: Awaited<ReturnType<typeof tenantRepositories.meetingGuide.nearby>> = [];
      let nearbyWarning: string | null = null;
      let meetingGuideUnavailable = false;
      try {
        meetings = await tenantRepositories.meetingGuide.nearby(
          actor,
          {
            lat: parsedQuery.data.lat,
            lng: parsedQuery.data.lng,
            radiusMiles: parsedQuery.data.radiusMiles,
          },
          {
            format: parsedQuery.data.format,
            dayOfWeek: parsedQuery.data.dayOfWeek,
            types: typeFilters,
            timeFrom: parsedQuery.data.timeFrom,
            timeTo: parsedQuery.data.timeTo,
            limit: parsedQuery.data.limit,
          },
        );
      } catch (error) {
        meetingGuideUnavailable = true;
        nearbyWarning = "Nearby Meeting Guide data temporarily unavailable";
        logger.error("meetings.nearby.meeting_guide_failed", {
          tenantId: actor.tenantId,
          reason: error instanceof Error ? error.message : "unknown",
        });
      }

      let scopedMeetings = meetings;
      if (
        scopedMeetings.length === 0 &&
        env.NODE_ENV !== "production" &&
        env.ENABLE_DEV_AUTH &&
        isDevAuthHeader(request.headers.authorization)
      ) {
        const minWarmupIntervalMs = 30_000;
        const lastWarmupMs = devMeetingNearbyWarmupByTenantMs.get(actor.tenantId) ?? 0;
        const elapsedMs = now().getTime() - lastWarmupMs;
        if (elapsedMs >= minWarmupIntervalMs) {
          devMeetingNearbyWarmupByTenantMs.set(actor.tenantId, now().getTime());
          try {
            const ingestResult = await runMeetingGuideIngestForTenant(actor.tenantId);
            logger.info("meeting_guide.nearby.dev_warmup", {
              tenantId: actor.tenantId,
              ...ingestResult,
            });

            scopedMeetings = await tenantRepositories.meetingGuide.nearby(
              actor,
              {
                lat: parsedQuery.data.lat,
                lng: parsedQuery.data.lng,
                radiusMiles: parsedQuery.data.radiusMiles,
              },
              {
                format: parsedQuery.data.format,
                dayOfWeek: parsedQuery.data.dayOfWeek,
                types: typeFilters,
                timeFrom: parsedQuery.data.timeFrom,
                timeTo: parsedQuery.data.timeTo,
                limit: parsedQuery.data.limit,
              },
            );
          } catch (error) {
            logger.error("meeting_guide.nearby.dev_warmup_failed", {
              tenantId: actor.tenantId,
              reason: error instanceof Error ? error.message : "unknown",
            });
          }
        }
      }
      if (meetingGuideUnavailable && scopedMeetings.length === 0) {
        reply.code(503).send({
          code: "MEETINGS_FEED_UNAVAILABLE",
          message: "Nearby meeting feed temporarily unavailable",
          meetings: [],
          warning: nearbyWarning,
        });
        return;
      }

      const parseMinutesFromHhmm = (value: string | null): number => {
        if (!value) {
          return Number.POSITIVE_INFINITY;
        }
        const match = value.match(/^(\d{2}):(\d{2})$/);
        if (!match) {
          return Number.POSITIVE_INFINITY;
        }
        return Number(match[1]) * 60 + Number(match[2]);
      };

      let filteredMeetings = scopedMeetings;
      if (parsedQuery.data.when === "upcoming" && parsedQuery.data.dayOfWeek !== undefined) {
        const referenceNow = parsedQuery.data.now ? new Date(parsedQuery.data.now) : now();
        if (
          !Number.isNaN(referenceNow.getTime()) &&
          parsedQuery.data.dayOfWeek === referenceNow.getDay()
        ) {
          const nowMinutes = referenceNow.getHours() * 60 + referenceNow.getMinutes();
          filteredMeetings = filteredMeetings.filter(
            (meeting) => parseMinutesFromHhmm(meeting.time) >= nowMinutes,
          );
        }
      }

      filteredMeetings = [...filteredMeetings].sort((left, right) => {
        if (parsedQuery.data.dayOfWeek !== undefined) {
          const byTime = parseMinutesFromHhmm(left.time) - parseMinutesFromHhmm(right.time);
          if (byTime !== 0) {
            return byTime;
          }
        }
        const leftDistance = left.distance_meters ?? Number.POSITIVE_INFINITY;
        const rightDistance = right.distance_meters ?? Number.POSITIVE_INFINITY;
        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance;
        }
        return left.name.localeCompare(right.name);
      });

      return {
        meetings: filteredMeetings.map((meeting) => {
          const geo = shapeMeetingGuideGeoForApi(meeting);
          return {
            id: meeting.id,
            name: meeting.name,
            address: meeting.formatted_address ?? meeting.address ?? "Address unavailable",
            format: meeting.inferred_format,
            dayOfWeek: meeting.day,
            startsAtLocal: meeting.time,
            endsAtLocal: meeting.end_time,
            lat: geo.lat,
            lng: geo.lng,
            onlineUrl: meeting.conference_url,
            types: meeting.types,
            typesDisplay: mapTypeCodesToLabels(meeting.types),
            distanceMeters: meeting.distance_meters,
            geoStatus: geo.geoStatus,
            geoReason: geo.geoReason,
            geoUpdatedAt: geo.geoUpdatedAt,
            geoSource: geo.geoSource,
            geoConfidence: geo.geoConfidence,
            geocodedAt: geo.geocodedAt,
          };
        }),
        warning: nearbyWarning,
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

      let result: Awaited<ReturnType<typeof tenantRepositories.signatures.sign>>;
      try {
        result = await tenantRepositories.signatures.sign(
          actor,
          parsedParams.data.attendanceId,
          parsedBody.data.signatureBlob,
          now(),
        );
      } catch (error) {
        if (error instanceof SignatureWindowError) {
          reply.code(422).send({
            error: "signature_window_closed",
            message: error.message,
            details: {
              checkInAt: error.checkInAtIso,
              windowEndsAt: error.windowEndsAtIso,
            },
          });
          return;
        }
        throw error;
      }
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

  const runMeetingGuideRefreshForActor = async (
    actor: { tenantId: string; userId: string },
    action: "meeting_guide.refresh" | "meeting_guide.refresh.dev",
  ) => {
    const result = await runMeetingGuideIngestForTenant(actor.tenantId);
    await app.auditLogger.log({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action,
      subjectType: "meeting_feed",
      subjectId: null,
      metadata: { ...result },
    });
    return result;
  };

  app.post(
    "/v1/admin/meetings/refresh",
    {
      preHandler: [authenticateRequest, requireRole(Role.ADMIN)],
    },
    async (request, reply) => {
      const actor = request.actor;
      if (!actor) {
        reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
        return;
      }

      const result = await runMeetingGuideRefreshForActor(actor, "meeting_guide.refresh");
      return { result };
    },
  );

  if (env.ENABLE_DEV_AUTH) {
    app.post(
      "/v1/dev/meetings/refresh",
      {
        preHandler: [authenticateRequest],
      },
      async (request, reply) => {
        const actor = request.actor;
        if (!actor) {
          reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
          return;
        }

        if (!isDevAuthHeader(request.headers.authorization)) {
          reply.code(403).send({
            error: "forbidden",
            message: "Dev meetings refresh requires Authorization: Bearer DEV_<userId>.",
          });
          return;
        }

        const elapsedMs = now().getTime() - devMeetingRefreshLastRunAtMs;
        const minIntervalMs = 30_000;
        if (elapsedMs >= 0 && elapsedMs < minIntervalMs) {
          const retryAfterSeconds = Math.ceil((minIntervalMs - elapsedMs) / 1000);
          reply.code(429).send({
            error: "too_many_requests",
            message: `Dev meetings refresh cooldown active. Retry in ${retryAfterSeconds}s.`,
          });
          return;
        }

        devMeetingRefreshLastRunAtMs = now().getTime();
        const result = await runMeetingGuideRefreshForActor(actor, "meeting_guide.refresh.dev");
        const feeds = await repositories.meetingFeeds.listActive(actor.tenantId);
        const errors = Array.from(
          new Set(
            feeds
              .map((feed) => feed.last_error)
              .filter((entry): entry is string => typeof entry === "string" && entry.length > 0),
          ),
        );

        return {
          feedsProcessed: result.feedsAttempted,
          meetingsImported: result.meetingsImported,
          errors,
        };
      },
    );

    app.get(
      "/v1/dev/meetings/status",
      {
        preHandler: [authenticateRequest],
      },
      async (request, reply) => {
        const actor = request.actor;
        if (!actor) {
          reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
          return;
        }

        if (!isDevAuthHeader(request.headers.authorization)) {
          reply.code(403).send({
            error: "forbidden",
            message: "Dev meetings status requires Authorization: Bearer DEV_<userId>.",
          });
          return;
        }

        const parsedQuery = meetingsIngestStatusQuerySchema.safeParse(request.query ?? {});
        if (!parsedQuery.success) {
          reply.code(400).send({
            error: "bad_request",
            message: "Invalid meetings status query",
            details: parsedQuery.error.flatten(),
          });
          return;
        }

        const feeds = await repositories.meetingFeeds.listActive(actor.tenantId);
        const counts = await db.query<{
          total_meetings: number;
          meetings_with_coordinates: number;
          meetings_without_coordinates: number;
          meetings_geo_ok: number;
          meetings_geo_missing: number;
          meetings_geo_partial: number;
          meetings_geo_invalid: number;
          meetings_geo_needs_geocode: number;
        }>(
          `
            SELECT
              COUNT(*)::int AS total_meetings,
              COUNT(*) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL)::int AS meetings_with_coordinates,
              COUNT(*) FILTER (WHERE lat IS NULL OR lng IS NULL)::int AS meetings_without_coordinates,
              COUNT(*) FILTER (WHERE geo_status = 'ok')::int AS meetings_geo_ok,
              COUNT(*) FILTER (WHERE geo_status = 'missing')::int AS meetings_geo_missing,
              COUNT(*) FILTER (WHERE geo_status = 'partial')::int AS meetings_geo_partial,
              COUNT(*) FILTER (WHERE geo_status = 'invalid')::int AS meetings_geo_invalid,
              COUNT(*) FILTER (WHERE geo_status = 'needs_geocode')::int AS meetings_geo_needs_geocode
            FROM meeting_guide_meetings
            WHERE tenant_id = $1
          `,
          [actor.tenantId],
        );

        const nearbySample = await tenantRepositories.meetingGuide.nearby(
          actor,
          {
            lat: parsedQuery.data.lat,
            lng: parsedQuery.data.lng,
            radiusMiles: parsedQuery.data.radiusMiles,
          },
          {
            format: "in_person",
            limit: 5,
          },
        );

        return {
          tenantId: actor.tenantId,
          query: parsedQuery.data,
          feedsCount: feeds.length,
          feeds: feeds.map((feed) => ({
            id: feed.id,
            name: feed.name,
            url: feed.url,
            lastFetchedAt: feed.last_fetched_at,
            lastError: feed.last_error,
          })),
          meetingStats: counts.rows[0] ?? {
            total_meetings: 0,
            meetings_with_coordinates: 0,
            meetings_without_coordinates: 0,
            meetings_geo_ok: 0,
            meetings_geo_missing: 0,
            meetings_geo_partial: 0,
            meetings_geo_invalid: 0,
            meetings_geo_needs_geocode: 0,
          },
          nearbySample: nearbySample.map((meeting) => {
            const geo = shapeMeetingGuideGeoForApi(meeting);
            return {
              id: meeting.id,
              name: meeting.name,
              lat: geo.lat,
              lng: geo.lng,
              time: meeting.time,
              day: meeting.day,
              distanceMeters: meeting.distance_meters,
              format: meeting.inferred_format,
              geoStatus: geo.geoStatus,
              geoReason: geo.geoReason,
              geoSource: geo.geoSource,
              geoConfidence: geo.geoConfidence,
            };
          }),
        };
      },
    );
  }

  return app;
}
