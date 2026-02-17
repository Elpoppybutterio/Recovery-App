import "fastify";
import type { AuditLogger } from "./audit";
import type { DbPool } from "./db/client";
import type { ActorContext } from "./domain/actor";

declare module "fastify" {
  interface FastifyRequest {
    actor?: ActorContext;
  }

  interface FastifyInstance {
    db: DbPool;
    auditLogger: AuditLogger;
  }
}
