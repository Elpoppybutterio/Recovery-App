import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Repositories } from "./db/repositories";

const bearerSchema = z
  .string()
  .regex(/^Bearer DEV_[A-Za-z0-9_-]+$/, "Expected Authorization: Bearer DEV_<userId>");

function unauthorized(reply: FastifyReply, message = "Unauthorized") {
  reply.code(401).send({ error: "unauthorized", message });
}

export function buildAuthenticateRequest(
  repositories: Repositories,
  options: {
    enableDevAuth: boolean;
  },
) {
  return async function authenticateRequest(request: FastifyRequest, reply: FastifyReply) {
    if (!options.enableDevAuth) {
      // TODO(auth): Replace DEV_<userId> auth with real OIDC/JWT before production launch.
      reply.code(503).send({
        error: "dev_auth_disabled",
        message: "Dev auth is disabled. Configure production auth provider integration.",
      });
      return;
    }

    const parsed = bearerSchema.safeParse(request.headers.authorization);
    if (!parsed.success) {
      unauthorized(reply, "Missing or invalid Authorization header");
      return;
    }

    const userId = parsed.data.slice("Bearer DEV_".length);
    const actor = await repositories.findActorByUserId(userId);
    if (!actor) {
      unauthorized(reply, "Unknown development user");
      return;
    }

    request.actor = actor;
  };
}
