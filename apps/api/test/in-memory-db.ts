import type { DbPool, DbQueryResult } from "../src/db/client";
import type { AttendanceStatus } from "../src/db/repositories";

type Tenant = {
  id: string;
  name: string;
};

type User = {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
};

type UserRole = {
  tenant_id: string;
  user_id: string;
  role: string;
};

type SupervisorAssignment = {
  id: number;
  tenant_id: string;
  supervisor_user_id: string;
  assigned_user_id: string;
};

type TenantConfig = {
  id: number;
  tenant_id: string;
  config_key: string;
  value_json: unknown;
  updated_by_user_id: string;
  updated_at: string;
};

type AuditLog = {
  id: number;
  tenant_id: string;
  actor_user_id: string;
  action: string;
  subject_type: string;
  subject_id: string | null;
  metadata_json: unknown;
  created_at: string;
};

type Meeting = {
  id: string;
  tenant_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  radius_m: number;
  created_at: string;
  created_by_user_id: string;
};

type Attendance = {
  id: string;
  tenant_id: string;
  user_id: string;
  meeting_id: string;
  check_in_at: string;
  check_out_at: string | null;
  dwell_seconds: number | null;
  status: AttendanceStatus;
  created_at: string;
};

type VerifierSignature = {
  id: string;
  tenant_id: string;
  attendance_id: string;
  verifier_user_id: string;
  signed_at: string;
  signature_blob: string;
  created_at: string;
};

export class InMemoryDb implements DbPool {
  private tenants: Tenant[] = [];
  private users: User[] = [];
  private userRoles: UserRole[] = [];
  private supervisorAssignments: SupervisorAssignment[] = [];
  private tenantConfigs: TenantConfig[] = [];
  private auditLogs: AuditLog[] = [];
  private meetings: Meeting[] = [];
  private attendance: Attendance[] = [];
  private verifierSignatures: VerifierSignature[] = [];
  private supervisorAssignmentId = 1;
  private tenantConfigId = 1;
  private auditId = 1;

  addTenant(record: Tenant) {
    this.tenants.push(record);
  }

  addUser(record: User) {
    this.users.push(record);
  }

  addUserRole(record: UserRole) {
    this.userRoles.push(record);
  }

  addSupervisorAssignment(record: Omit<SupervisorAssignment, "id">) {
    this.supervisorAssignments.push({
      id: this.supervisorAssignmentId++,
      ...record,
    });
  }

  getLatestAuditForActor(actorUserId: string): AuditLog | null {
    const row = this.auditLogs
      .filter((entry) => entry.actor_user_id === actorUserId)
      .sort((left, right) => right.id - left.id)[0];
    return row ?? null;
  }

  addMeeting(record: Omit<Meeting, "created_at"> & { created_at?: string }) {
    this.meetings.push({
      created_at: record.created_at ?? new Date().toISOString(),
      ...record,
    });
  }

  getAttendanceById(attendanceId: string): Attendance | null {
    return this.attendance.find((entry) => entry.id === attendanceId) ?? null;
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ): Promise<DbQueryResult<Row>> {
    const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.includes("select id, tenant_id from users where id = $1")) {
      const [userId] = params as [string];
      const user = this.users.find((entry) => entry.id === userId);
      return {
        rowCount: user ? 1 : 0,
        rows: user ? ([{ id: user.id, tenant_id: user.tenant_id }] as Row[]) : [],
      };
    }

    if (normalized.includes("select role from user_roles where tenant_id = $1 and user_id = $2")) {
      const [tenantId, userId] = params as [string, string];
      const rows = this.userRoles
        .filter((entry) => entry.tenant_id === tenantId && entry.user_id === userId)
        .map((entry) => ({ role: entry.role })) as Row[];
      return {
        rowCount: rows.length,
        rows,
      };
    }

    if (normalized.includes("from users where tenant_id = $1 and id = $2")) {
      const [tenantId, userId] = params as [string, string];
      const user = this.users.find((entry) => entry.tenant_id === tenantId && entry.id === userId);
      if (!user) {
        return { rowCount: 0, rows: [] };
      }
      return {
        rowCount: 1,
        rows: [
          {
            id: user.id,
            tenant_id: user.tenant_id,
            email: user.email,
            display_name: user.display_name,
          } as Row,
        ],
      };
    }

    if (
      normalized.includes("from supervisor_assignments") &&
      normalized.includes("tenant_id = $1") &&
      normalized.includes("supervisor_user_id = $2") &&
      normalized.includes("assigned_user_id = $3")
    ) {
      const [tenantId, supervisorUserId, assignedUserId] = params as [string, string, string];
      const assignment = this.supervisorAssignments.find(
        (entry) =>
          entry.tenant_id === tenantId &&
          entry.supervisor_user_id === supervisorUserId &&
          entry.assigned_user_id === assignedUserId,
      );
      return {
        rowCount: assignment ? 1 : 0,
        rows: assignment ? ([{ id: assignment.id }] as Row[]) : [],
      };
    }

    if (normalized.includes("insert into tenant_config")) {
      const [tenantId, configKey, valueJson, updatedByUserId] = params as [
        string,
        string,
        string,
        string,
      ];

      const existing = this.tenantConfigs.find(
        (entry) => entry.tenant_id === tenantId && entry.config_key === configKey,
      );
      const parsedValue = JSON.parse(valueJson) as unknown;
      if (existing) {
        existing.value_json = parsedValue;
        existing.updated_by_user_id = updatedByUserId;
        existing.updated_at = new Date().toISOString();
        return { rowCount: 1, rows: [] };
      }

      this.tenantConfigs.push({
        id: this.tenantConfigId++,
        tenant_id: tenantId,
        config_key: configKey,
        value_json: parsedValue,
        updated_by_user_id: updatedByUserId,
        updated_at: new Date().toISOString(),
      });
      return { rowCount: 1, rows: [] };
    }

    if (normalized.includes("insert into audit_log")) {
      const [tenantId, actorUserId, action, subjectType, subjectId, metadataJson] = params as [
        string,
        string,
        string,
        string,
        string | null,
        string,
      ];

      this.auditLogs.push({
        id: this.auditId++,
        tenant_id: tenantId,
        actor_user_id: actorUserId,
        action,
        subject_type: subjectType,
        subject_id: subjectId,
        metadata_json: JSON.parse(metadataJson) as unknown,
        created_at: new Date().toISOString(),
      });
      return { rowCount: 1, rows: [] };
    }

    if (normalized.includes("insert into meetings")) {
      const [id, tenantId, name, address, lat, lng, radiusM, createdByUserId] = params as [
        string,
        string,
        string,
        string,
        number,
        number,
        number,
        string,
      ];
      const meeting: Meeting = {
        id,
        tenant_id: tenantId,
        name,
        address,
        lat,
        lng,
        radius_m: radiusM,
        created_by_user_id: createdByUserId,
        created_at: new Date().toISOString(),
      };
      this.meetings.push(meeting);
      return {
        rowCount: 1,
        rows: [meeting as Row],
      };
    }

    if (normalized.includes("from meetings where tenant_id = $1 order by created_at desc")) {
      const [tenantId] = params as [string];
      const rows = this.meetings
        .filter((entry) => entry.tenant_id === tenantId)
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .map((entry) => ({ ...entry })) as Row[];
      return {
        rowCount: rows.length,
        rows,
      };
    }

    if (normalized.includes("select id from meetings where tenant_id = $1 and id = $2 limit 1")) {
      const [tenantId, meetingId] = params as [string, string];
      const meeting = this.meetings.find(
        (entry) => entry.tenant_id === tenantId && entry.id === meetingId,
      );
      return {
        rowCount: meeting ? 1 : 0,
        rows: meeting ? ([{ id: meeting.id }] as Row[]) : [],
      };
    }

    if (normalized.includes("insert into attendance")) {
      const [id, tenantId, userId, meetingId, checkInAt, status] = params as [
        string,
        string,
        string,
        string,
        string,
        AttendanceStatus,
      ];
      const record: Attendance = {
        id,
        tenant_id: tenantId,
        user_id: userId,
        meeting_id: meetingId,
        check_in_at: checkInAt,
        check_out_at: null,
        dwell_seconds: null,
        status,
        created_at: new Date().toISOString(),
      };
      this.attendance.push(record);
      return {
        rowCount: 1,
        rows: [record as Row],
      };
    }

    if (
      normalized.includes("from attendance") &&
      normalized.includes("where tenant_id = $1 and id = $2 and user_id = $3")
    ) {
      const [tenantId, attendanceId, userId] = params as [string, string, string];
      const row = this.attendance.find(
        (entry) =>
          entry.tenant_id === tenantId && entry.id === attendanceId && entry.user_id === userId,
      );
      return {
        rowCount: row ? 1 : 0,
        rows: row ? ([{ ...row }] as Row[]) : [],
      };
    }

    if (normalized.includes("update attendance set check_out_at = $1")) {
      const [checkOutAt, dwellSeconds, status, tenantId, attendanceId] = params as [
        string,
        number,
        AttendanceStatus,
        string,
        string,
      ];
      const row = this.attendance.find(
        (entry) => entry.tenant_id === tenantId && entry.id === attendanceId,
      );
      if (!row) {
        return { rowCount: 0, rows: [] };
      }
      row.check_out_at = checkOutAt;
      row.dwell_seconds = dwellSeconds;
      row.status = status;
      return {
        rowCount: 1,
        rows: [{ ...row } as Row],
      };
    }

    if (
      normalized.includes("from attendance") &&
      normalized.includes("where tenant_id = $1 and id = $2") &&
      normalized.includes("limit 1")
    ) {
      const [tenantId, attendanceId] = params as [string, string];
      const row = this.attendance.find(
        (entry) => entry.tenant_id === tenantId && entry.id === attendanceId,
      );
      return {
        rowCount: row ? 1 : 0,
        rows: row ? ([{ ...row }] as Row[]) : [],
      };
    }

    if (
      normalized.includes("select id from verifier_signatures") &&
      normalized.includes("tenant_id = $1 and attendance_id = $2")
    ) {
      const [tenantId, attendanceId] = params as [string, string];
      const row = this.verifierSignatures.find(
        (entry) => entry.tenant_id === tenantId && entry.attendance_id === attendanceId,
      );
      return {
        rowCount: row ? 1 : 0,
        rows: row ? ([{ id: row.id }] as Row[]) : [],
      };
    }

    if (
      normalized.startsWith(
        "update attendance set status = $1 where tenant_id = $2 and id = $3 returning",
      )
    ) {
      const [status, tenantId, attendanceId] = params as [AttendanceStatus, string, string];
      const row = this.attendance.find(
        (entry) => entry.tenant_id === tenantId && entry.id === attendanceId,
      );
      if (!row) {
        return { rowCount: 0, rows: [] };
      }
      row.status = status;
      return {
        rowCount: 1,
        rows: [{ ...row } as Row],
      };
    }

    if (
      normalized.startsWith("update attendance set status = $1 where tenant_id = $2 and id = $3")
    ) {
      const [status, tenantId, attendanceId] = params as [AttendanceStatus, string, string];
      const row = this.attendance.find(
        (entry) => entry.tenant_id === tenantId && entry.id === attendanceId,
      );
      if (row) {
        row.status = status;
      }
      return {
        rowCount: row ? 1 : 0,
        rows: [],
      };
    }

    if (normalized.includes("insert into verifier_signatures")) {
      const [id, tenantId, attendanceId, verifierUserId, signedAt, signatureBlob] = params as [
        string,
        string,
        string,
        string,
        string,
        string,
      ];
      const row: VerifierSignature = {
        id,
        tenant_id: tenantId,
        attendance_id: attendanceId,
        verifier_user_id: verifierUserId,
        signed_at: signedAt,
        signature_blob: signatureBlob,
        created_at: new Date().toISOString(),
      };
      this.verifierSignatures.push(row);
      return {
        rowCount: 1,
        rows: [],
      };
    }

    if (
      normalized.includes("from attendance a") &&
      normalized.includes("inner join meetings m") &&
      normalized.includes("where a.tenant_id = $1") &&
      normalized.includes("order by a.check_in_at desc")
    ) {
      const [tenantId, supervisorUserId] = params as [string, string | undefined];
      const rows = this.attendance
        .filter((entry) => entry.tenant_id === tenantId)
        .filter((entry) => {
          if (!normalized.includes("inner join supervisor_assignments sa")) {
            return true;
          }
          return this.supervisorAssignments.some(
            (assignment) =>
              assignment.tenant_id === entry.tenant_id &&
              assignment.supervisor_user_id === supervisorUserId &&
              assignment.assigned_user_id === entry.user_id,
          );
        })
        .map((entry) => {
          const meeting = this.meetings.find(
            (item) => item.tenant_id === entry.tenant_id && item.id === entry.meeting_id,
          );
          return {
            id: entry.id,
            tenant_id: entry.tenant_id,
            user_id: entry.user_id,
            meeting_id: entry.meeting_id,
            meeting_name: meeting?.name ?? "Unknown meeting",
            check_in_at: entry.check_in_at,
            check_out_at: entry.check_out_at,
            dwell_seconds: entry.dwell_seconds,
            status: entry.status,
          };
        })
        .sort((left, right) => right.check_in_at.localeCompare(left.check_in_at)) as Row[];
      return {
        rowCount: rows.length,
        rows,
      };
    }

    throw new Error(`Unsupported query in InMemoryDb: ${normalized}`);
  }

  async end(): Promise<void> {
    return;
  }
}
