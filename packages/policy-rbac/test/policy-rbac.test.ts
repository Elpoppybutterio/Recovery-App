import { describe, expect, it } from "vitest";
import { Permission, Role } from "@recovery/shared-types";
import { hasPermission } from "../src";

describe("hasPermission", () => {
  it("grants export permission to admins", () => {
    expect(hasPermission(Role.ADMIN, Permission.EXPORT_AUDIT_DATA)).toBe(true);
  });

  it("does not grant export permission to end users", () => {
    expect(hasPermission(Role.END_USER, Permission.EXPORT_AUDIT_DATA)).toBe(false);
  });
});
