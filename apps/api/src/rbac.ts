import { hasPermission } from "@recovery/policy-rbac";
import { Permission, Role } from "@recovery/shared-types";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { TenantRepositories } from "./db/tenantRepositories";

function forbidden(reply: FastifyReply, message = "Forbidden") {
  reply.code(403).send({ error: "forbidden", message });
}

function getActor(request: FastifyRequest, reply: FastifyReply) {
  if (!request.actor) {
    reply.code(401).send({ error: "unauthorized", message: "Missing actor context" });
    return null;
  }
  return request.actor;
}

export function requireRole(...allowedRoles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = getActor(request, reply);
    if (!actor) {
      return;
    }

    if (!allowedRoles.some((role) => actor.roles.includes(role))) {
      forbidden(reply, `Requires role: ${allowedRoles.join(", ")}`);
      return;
    }
  };
}

export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = getActor(request, reply);
    if (!actor) {
      return;
    }

    const permitted = actor.roles.some((role) => hasPermission(role, permission));
    if (!permitted) {
      forbidden(reply, `Missing permission: ${permission}`);
      return;
    }
  };
}

export function requireSupervisorAssignment(
  tenantRepositories: Pick<TenantRepositories, "supervisor">,
  paramName = "userId",
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = getActor(request, reply);
    if (!actor) {
      return;
    }

    if (actor.roles.includes(Role.ADMIN)) {
      return;
    }

    if (!actor.roles.includes(Role.SUPERVISOR)) {
      forbidden(reply, `Requires role: ${Role.SUPERVISOR}`);
      return;
    }

    const params = request.params as Record<string, string | undefined>;
    const targetUserId = params[paramName];
    if (!targetUserId) {
      forbidden(reply, `Missing route param: ${paramName}`);
      return;
    }

    const assigned = await tenantRepositories.supervisor.isAssigned(actor, targetUserId);

    if (!assigned) {
      forbidden(reply, "Supervisor can only access assigned users");
      return;
    }
  };
}
