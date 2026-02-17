import { z } from "zod";

export enum Role {
  END_USER = "END_USER",
  SPONSOR = "SPONSOR",
  MEETING_VERIFIER = "MEETING_VERIFIER",
  SUPERVISOR = "SUPERVISOR",
  ADMIN = "ADMIN",
}

export enum Permission {
  RECORD_ATTENDANCE = "RECORD_ATTENDANCE",
  VERIFY_ATTENDANCE = "VERIFY_ATTENDANCE",
  VIEW_ASSIGNED_USERS = "VIEW_ASSIGNED_USERS",
  MANAGE_EXCLUSION_ZONES = "MANAGE_EXCLUSION_ZONES",
  EXPORT_AUDIT_DATA = "EXPORT_AUDIT_DATA",
}

export const attendanceRecordSchema = z.object({
  userId: z.string().min(1),
  meetingId: z.string().min(1),
  checkInAt: z.string().datetime(),
  checkOutAt: z.string().datetime().optional(),
  status: z.enum(["INCOMPLETE", "PROVISIONAL", "VERIFIED"]),
});

export type AttendanceRecord = z.infer<typeof attendanceRecordSchema>;
