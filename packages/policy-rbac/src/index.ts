import { Permission, Role } from "@recovery/shared-types";

export const rolePermissions: Record<Role, Permission[]> = {
  [Role.END_USER]: [Permission.RECORD_ATTENDANCE],
  [Role.SPONSOR]: [Permission.RECORD_ATTENDANCE],
  [Role.MEETING_VERIFIER]: [Permission.VERIFY_ATTENDANCE],
  [Role.SUPERVISOR]: [Permission.VIEW_ASSIGNED_USERS, Permission.MANAGE_EXCLUSION_ZONES],
  [Role.ADMIN]: [
    Permission.RECORD_ATTENDANCE,
    Permission.VERIFY_ATTENDANCE,
    Permission.VIEW_ASSIGNED_USERS,
    Permission.MANAGE_EXCLUSION_ZONES,
    Permission.EXPORT_AUDIT_DATA,
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role]?.includes(permission) ?? false;
}
