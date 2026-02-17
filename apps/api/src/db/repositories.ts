import { Role } from "@recovery/shared-types";
import { randomUUID } from "node:crypto";
import type { ActorContext } from "../domain/actor";
import type { DbClient } from "./client";

interface UserRow {
  id: string;
  tenant_id: string;
}

export interface TenantUserRow {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
}

interface RoleRow {
  role: string;
}

export type AttendanceStatus = "INCOMPLETE" | "PROVISIONAL" | "VERIFIED";

export interface MeetingRow {
  id: string;
  tenant_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  radius_m: number;
  created_at: string;
  created_by_user_id: string;
}

export interface AttendanceRow {
  id: string;
  tenant_id: string;
  user_id: string;
  meeting_id: string;
  check_in_at: string;
  check_out_at: string | null;
  dwell_seconds: number | null;
  status: AttendanceStatus;
  created_at: string;
}

interface SignatureRow {
  id: string;
}

export interface SupervisorAttendanceRow {
  id: string;
  tenant_id: string;
  user_id: string;
  meeting_id: string;
  meeting_name: string;
  check_in_at: string;
  check_out_at: string | null;
  dwell_seconds: number | null;
  status: AttendanceStatus;
}

export interface SupervisorAttendanceFilters {
  userId?: string;
  meetingId?: string;
}

export interface SignAttendanceResult {
  attendance: AttendanceRow;
  signatureId: string;
  alreadySigned: boolean;
}

const CHECK_OUT_DWELL_THRESHOLD_SECONDS = 3600;

function toRole(role: string): Role | null {
  return Object.values(Role).includes(role as Role) ? (role as Role) : null;
}

function toJsonParam(value: unknown) {
  return JSON.stringify(value ?? {});
}

export function createRepositories(db: DbClient) {
  return {
    async findActorByUserId(userId: string): Promise<ActorContext | null> {
      const userResult = await db.query<UserRow>(
        "SELECT id, tenant_id FROM users WHERE id = $1 LIMIT 1",
        [userId],
      );
      const user = userResult.rows[0];
      if (!user) {
        return null;
      }

      const rolesResult = await db.query<RoleRow>(
        "SELECT role FROM user_roles WHERE tenant_id = $1 AND user_id = $2",
        [user.tenant_id, user.id],
      );
      const roles = rolesResult.rows
        .map((row) => toRole(row.role))
        .filter((role): role is Role => role !== null);

      return {
        userId: user.id,
        tenantId: user.tenant_id,
        roles,
      };
    },

    async findTenantUser(tenantId: string, userId: string): Promise<TenantUserRow | null> {
      const result = await db.query<TenantUserRow>(
        `
        SELECT id, tenant_id, email, display_name
        FROM users
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1
      `,
        [tenantId, userId],
      );
      return result.rows[0] ?? null;
    },

    async isSupervisorAssignedToUser(
      tenantId: string,
      supervisorUserId: string,
      assignedUserId: string,
    ): Promise<boolean> {
      const result = await db.query<{ id: string }>(
        `
        SELECT id
        FROM supervisor_assignments
        WHERE tenant_id = $1
          AND supervisor_user_id = $2
          AND assigned_user_id = $3
        LIMIT 1
      `,
        [tenantId, supervisorUserId, assignedUserId],
      );
      return Boolean(result.rows[0]);
    },

    async upsertTenantConfig(
      tenantId: string,
      configKey: string,
      value: unknown,
      updatedByUserId: string,
    ): Promise<void> {
      await db.query(
        `
        INSERT INTO tenant_config (tenant_id, config_key, value_json, updated_by_user_id)
        VALUES ($1, $2, $3::jsonb, $4)
        ON CONFLICT (tenant_id, config_key)
        DO UPDATE SET
          value_json = EXCLUDED.value_json,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = NOW()
      `,
        [tenantId, configKey, toJsonParam(value), updatedByUserId],
      );
    },

    async createMeeting(
      tenantId: string,
      createdByUserId: string,
      payload: { name: string; address: string; lat: number; lng: number; radiusM: number },
    ): Promise<MeetingRow> {
      const result = await db.query<MeetingRow>(
        `
        INSERT INTO meetings (
          id,
          tenant_id,
          name,
          address,
          lat,
          lng,
          radius_m,
          created_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
          id,
          tenant_id,
          name,
          address,
          lat,
          lng,
          radius_m,
          created_at,
          created_by_user_id
      `,
        [
          randomUUID(),
          tenantId,
          payload.name,
          payload.address,
          payload.lat,
          payload.lng,
          payload.radiusM,
          createdByUserId,
        ],
      );

      return result.rows[0];
    },

    async listMeetings(tenantId: string): Promise<MeetingRow[]> {
      const result = await db.query<MeetingRow>(
        `
        SELECT
          id,
          tenant_id,
          name,
          address,
          lat,
          lng,
          radius_m,
          created_at,
          created_by_user_id
        FROM meetings
        WHERE tenant_id = $1
        ORDER BY created_at DESC
      `,
        [tenantId],
      );
      return result.rows;
    },

    async checkInAttendance(
      tenantId: string,
      userId: string,
      meetingId: string,
      now: Date,
    ): Promise<AttendanceRow | null> {
      const meeting = await db.query<{ id: string }>(
        `
        SELECT id
        FROM meetings
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1
      `,
        [tenantId, meetingId],
      );
      if (!meeting.rows[0]) {
        return null;
      }

      const result = await db.query<AttendanceRow>(
        `
        INSERT INTO attendance (
          id,
          tenant_id,
          user_id,
          meeting_id,
          check_in_at,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id,
          tenant_id,
          user_id,
          meeting_id,
          check_in_at,
          check_out_at,
          dwell_seconds,
          status,
          created_at
      `,
        [randomUUID(), tenantId, userId, meetingId, now.toISOString(), "INCOMPLETE"],
      );

      return result.rows[0];
    },

    async checkOutAttendance(
      tenantId: string,
      userId: string,
      attendanceId: string,
      now: Date,
    ): Promise<AttendanceRow | null> {
      const existing = await db.query<AttendanceRow>(
        `
        SELECT
          id,
          tenant_id,
          user_id,
          meeting_id,
          check_in_at,
          check_out_at,
          dwell_seconds,
          status,
          created_at
        FROM attendance
        WHERE tenant_id = $1 AND id = $2 AND user_id = $3
        LIMIT 1
      `,
        [tenantId, attendanceId, userId],
      );
      const attendance = existing.rows[0];
      if (!attendance) {
        return null;
      }

      const checkInAt = new Date(attendance.check_in_at);
      const dwellSeconds = Math.max(0, Math.floor((now.getTime() - checkInAt.getTime()) / 1000));
      const status: AttendanceStatus =
        dwellSeconds >= CHECK_OUT_DWELL_THRESHOLD_SECONDS ? "PROVISIONAL" : "INCOMPLETE";

      const updated = await db.query<AttendanceRow>(
        `
        UPDATE attendance
        SET check_out_at = $1,
            dwell_seconds = $2,
            status = $3
        WHERE tenant_id = $4 AND id = $5
        RETURNING
          id,
          tenant_id,
          user_id,
          meeting_id,
          check_in_at,
          check_out_at,
          dwell_seconds,
          status,
          created_at
      `,
        [now.toISOString(), dwellSeconds, status, tenantId, attendanceId],
      );

      return updated.rows[0] ?? null;
    },

    async signAttendance(
      tenantId: string,
      attendanceId: string,
      verifierUserId: string,
      signatureBlob: string,
      now: Date,
    ): Promise<SignAttendanceResult | null> {
      const attendance = await db.query<AttendanceRow>(
        `
        SELECT
          id,
          tenant_id,
          user_id,
          meeting_id,
          check_in_at,
          check_out_at,
          dwell_seconds,
          status,
          created_at
        FROM attendance
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1
      `,
        [tenantId, attendanceId],
      );
      if (!attendance.rows[0]) {
        return null;
      }

      const existingSignature = await db.query<SignatureRow>(
        `
        SELECT id
        FROM verifier_signatures
        WHERE tenant_id = $1 AND attendance_id = $2
        LIMIT 1
      `,
        [tenantId, attendanceId],
      );

      if (existingSignature.rows[0]) {
        await db.query(`UPDATE attendance SET status = $1 WHERE tenant_id = $2 AND id = $3`, [
          "VERIFIED",
          tenantId,
          attendanceId,
        ]);
        const refreshed = await db.query<AttendanceRow>(
          `
          SELECT
            id,
            tenant_id,
            user_id,
            meeting_id,
            check_in_at,
            check_out_at,
            dwell_seconds,
            status,
            created_at
          FROM attendance
          WHERE tenant_id = $1 AND id = $2
          LIMIT 1
        `,
          [tenantId, attendanceId],
        );
        return {
          attendance: refreshed.rows[0],
          signatureId: existingSignature.rows[0].id,
          alreadySigned: true,
        };
      }

      const signatureId = randomUUID();
      await db.query(
        `
        INSERT INTO verifier_signatures (
          id,
          tenant_id,
          attendance_id,
          verifier_user_id,
          signed_at,
          signature_blob
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
        [signatureId, tenantId, attendanceId, verifierUserId, now.toISOString(), signatureBlob],
      );

      const updated = await db.query<AttendanceRow>(
        `
        UPDATE attendance
        SET status = $1
        WHERE tenant_id = $2 AND id = $3
        RETURNING
          id,
          tenant_id,
          user_id,
          meeting_id,
          check_in_at,
          check_out_at,
          dwell_seconds,
          status,
          created_at
      `,
        ["VERIFIED", tenantId, attendanceId],
      );

      return {
        attendance: updated.rows[0],
        signatureId,
        alreadySigned: false,
      };
    },

    async listSupervisorAttendance(
      tenantId: string,
      supervisorUserId: string,
      includeAllUsers: boolean,
      filters: SupervisorAttendanceFilters = {},
    ): Promise<SupervisorAttendanceRow[]> {
      const rows = includeAllUsers
        ? await db.query<SupervisorAttendanceRow>(
            `
            SELECT
              a.id,
              a.tenant_id,
              a.user_id,
              a.meeting_id,
              m.name AS meeting_name,
              a.check_in_at,
              a.check_out_at,
              a.dwell_seconds,
              a.status
            FROM attendance a
            INNER JOIN meetings m
              ON m.tenant_id = a.tenant_id
             AND m.id = a.meeting_id
            WHERE a.tenant_id = $1
            ORDER BY a.check_in_at DESC
          `,
            [tenantId],
          )
        : await db.query<SupervisorAttendanceRow>(
            `
            SELECT
              a.id,
              a.tenant_id,
              a.user_id,
              a.meeting_id,
              m.name AS meeting_name,
              a.check_in_at,
              a.check_out_at,
              a.dwell_seconds,
              a.status
            FROM attendance a
            INNER JOIN meetings m
              ON m.tenant_id = a.tenant_id
             AND m.id = a.meeting_id
            INNER JOIN supervisor_assignments sa
              ON sa.tenant_id = a.tenant_id
             AND sa.supervisor_user_id = $2
             AND sa.assigned_user_id = a.user_id
            WHERE a.tenant_id = $1
            ORDER BY a.check_in_at DESC
          `,
            [tenantId, supervisorUserId],
          );

      return rows.rows.filter((row) => {
        if (filters.userId && row.user_id !== filters.userId) {
          return false;
        }
        if (filters.meetingId && row.meeting_id !== filters.meetingId) {
          return false;
        }
        return true;
      });
    },
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
