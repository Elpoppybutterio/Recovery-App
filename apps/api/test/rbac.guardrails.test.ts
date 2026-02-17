import { Role } from "@recovery/shared-types";
import { describe, expect, it, vi } from "vitest";
import { requireSupervisorAssignment } from "../src/rbac";

function buildReply() {
  const state = {
    statusCode: 200,
    payload: undefined as unknown,
  };

  const reply = {
    code(statusCode: number) {
      state.statusCode = statusCode;
      return this;
    },
    send(payload: unknown) {
      state.payload = payload;
      return this;
    },
  };

  return { reply, state };
}

function buildRequest(role: Role, userId = "actor-user", targetUserId = "target-user") {
  return {
    actor: {
      userId,
      tenantId: "tenant-a",
      roles: [role],
    },
    params: {
      userId: targetUserId,
    },
  };
}

describe("requireSupervisorAssignment guardrails", () => {
  it("denies END_USER, SPONSOR, and MEETING_VERIFIER", async () => {
    const tenantRepositories = {
      supervisor: {
        isAssigned: vi.fn(),
      },
    };
    const middleware = requireSupervisorAssignment(tenantRepositories);

    for (const role of [Role.END_USER, Role.SPONSOR, Role.MEETING_VERIFIER]) {
      const { reply, state } = buildReply();
      const request = buildRequest(role);
      await middleware(request as never, reply as never);

      expect(state.statusCode).toBe(403);
      expect(state.payload).toMatchObject({
        error: "forbidden",
        message: "Requires role: SUPERVISOR",
      });
    }

    expect(tenantRepositories.supervisor.isAssigned).not.toHaveBeenCalled();
  });

  it("allows SUPERVISOR only when assignment exists", async () => {
    const tenantRepositories = {
      supervisor: {
        isAssigned: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
      },
    };
    const middleware = requireSupervisorAssignment(tenantRepositories);

    const first = buildReply();
    await middleware(buildRequest(Role.SUPERVISOR) as never, first.reply as never);
    expect(first.state.statusCode).toBe(403);
    expect(first.state.payload).toMatchObject({
      error: "forbidden",
      message: "Supervisor can only access assigned users",
    });

    const second = buildReply();
    await middleware(buildRequest(Role.SUPERVISOR) as never, second.reply as never);
    expect(second.state.statusCode).toBe(200);
    expect(second.state.payload).toBeUndefined();
  });

  it("allows ADMIN regardless of assignment", async () => {
    const tenantRepositories = {
      supervisor: {
        isAssigned: vi.fn().mockResolvedValue(false),
      },
    };
    const middleware = requireSupervisorAssignment(tenantRepositories);

    const { reply, state } = buildReply();
    await middleware(buildRequest(Role.ADMIN) as never, reply as never);

    expect(state.statusCode).toBe(200);
    expect(state.payload).toBeUndefined();
    expect(tenantRepositories.supervisor.isAssigned).not.toHaveBeenCalled();
  });
});
