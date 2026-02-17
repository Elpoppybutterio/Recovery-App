import { createLogger } from "@recovery/shared-utils";
import { Permission, Role } from "@recovery/shared-types";
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
