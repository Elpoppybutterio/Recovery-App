import { createLogger } from "@recovery/shared-utils";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DbClient } from "./db/client";

const logger = createLogger("api");

export interface AuditEvent {
  tenantId: string;
  actorUserId: string;
  action: string;
  subjectType: string;
  subjectId?: string | null;
  metadata?: Record<string, unknown>;
}

interface AuditConfig {
  action: string;
  subjectType: string;
  subjectIdFrom?: "actor" | `param:${string}`;
  metadata?: Record<string, unknown>;
  sensitiveRead?: boolean;
}

function toJsonParam(value: unknown) {
  return JSON.stringify(value ?? {});
}

function getAuditConfig(request: FastifyRequest): AuditConfig | null {
  const config = request.routeOptions.config as { audit?: AuditConfig } | undefined;
  if (config?.audit) {
    return config.audit;
  }

  if (request.method === "GET" && request.url.startsWith("/v1/exports")) {
    return {
      action: "export.read",
      subjectType: "export",
      metadata: { inferred: true },
      sensitiveRead: true,
    };
  }

  return null;
}

function resolveSubjectId(request: FastifyRequest, config: AuditConfig): string | null {
  if (config.subjectIdFrom === "actor") {
    return request.actor?.userId ?? null;
  }

  if (config.subjectIdFrom?.startsWith("param:")) {
    const key = config.subjectIdFrom.slice("param:".length);
    const params = request.params as Record<string, string | undefined>;
    return params[key] ?? null;
  }

  return null;
}

export function createAuditLogger(db: DbClient) {
  return {
    async log(event: AuditEvent): Promise<void> {
      await db.query(
        `
        INSERT INTO audit_log (
          tenant_id,
          actor_user_id,
          action,
          subject_type,
          subject_id,
          metadata_json
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
        [
          event.tenantId,
          event.actorUserId,
          event.action,
          event.subjectType,
          event.subjectId ?? null,
          toJsonParam(event.metadata),
        ],
      );
    },
  };
}

export type AuditLogger = ReturnType<typeof createAuditLogger>;

export async function auditResponseIfNeeded(request: FastifyRequest, reply: FastifyReply) {
  if (reply.statusCode >= 400 || !request.actor) {
    return;
  }

  const config = getAuditConfig(request);
  if (!config) {
    return;
  }

  try {
    await request.server.auditLogger.log({
      tenantId: request.actor.tenantId,
      actorUserId: request.actor.userId,
      action: config.action,
      subjectType: config.subjectType,
      subjectId: resolveSubjectId(request, config),
      metadata: {
        ...(config.metadata ?? {}),
        method: request.method,
        url: request.url,
        sensitiveRead: config.sensitiveRead ?? false,
      },
    });
  } catch (error) {
    logger.warn("audit.log_failed", {
      error: error instanceof Error ? error.message : "unknown",
      url: request.url,
      method: request.method,
    });
  }
}
