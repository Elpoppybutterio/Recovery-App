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

export enum IncidentType {
  WARNING = "WARNING",
  VIOLATION = "VIOLATION",
}

export enum IncidentStatus {
  OPEN = "OPEN",
  RESOLVED = "RESOLVED",
}

export enum ComplianceEventType {
  APP_REMOVED = "APP_REMOVED",
  PERMISSION_REVOKED = "PERMISSION_REVOKED",
  LOCATION_STALE = "LOCATION_STALE",
}

export enum SponsorRepeatRule {
  DAILY = "DAILY",
  WEEKDAYS = "WEEKDAYS",
  WEEKLY = "WEEKLY",
  BIWEEKLY = "BIWEEKLY",
  MONTHLY = "MONTHLY",
}

export enum SponsorRepeatUnit {
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
}

export enum SponsorRepeatDay {
  MON = "MON",
  TUE = "TUE",
  WED = "WED",
  THU = "THU",
  FRI = "FRI",
  SAT = "SAT",
  SUN = "SUN",
}

export const attendanceRecordSchema = z.object({
  userId: z.string().min(1),
  meetingId: z.string().min(1),
  checkInAt: z.string().datetime(),
  checkOutAt: z.string().datetime().optional(),
  status: z.enum(["INCOMPLETE", "PROVISIONAL", "VERIFIED"]),
});

const exclusionZoneBaseSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  label: z.string().min(1),
  active: z.boolean(),
});

const exclusionZoneCircleSchema = exclusionZoneBaseSchema.extend({
  type: z.literal("CIRCLE"),
  centerLat: z.number(),
  centerLng: z.number(),
  radiusM: z.number().int().positive(),
  polygonGeoJson: z.unknown().optional(),
});

const exclusionZonePolygonSchema = exclusionZoneBaseSchema.extend({
  type: z.literal("POLYGON"),
  centerLat: z.number().optional(),
  centerLng: z.number().optional(),
  radiusM: z.number().int().positive().optional(),
  polygonGeoJson: z.record(z.unknown()),
});

export const exclusionZoneSchema = z.discriminatedUnion("type", [
  exclusionZoneCircleSchema,
  exclusionZonePolygonSchema,
]);

export const userZoneRuleSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  zoneId: z.string().min(1),
  bufferM: z.number().int().nonnegative(),
  active: z.boolean(),
});

export const incidentSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  zoneId: z.string().min(1),
  type: z.nativeEnum(IncidentType),
  occurredAt: z.string().datetime(),
  status: z.nativeEnum(IncidentStatus),
  metadata: z.record(z.unknown()).optional(),
});

export const notificationEventSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  channel: z.enum(["EMAIL", "SMS"]),
  recipient: z.string().min(1),
  templateKey: z.string().min(1),
  payload: z.record(z.unknown()),
  status: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const locationPingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().int().nonnegative().optional(),
  recordedAt: z.string().datetime().optional(),
});

export const lastKnownLocationSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().int().nonnegative().nullable().optional(),
  recordedAt: z.string().datetime(),
  source: z.string().min(1),
});

export const complianceEventSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  eventType: z.nativeEnum(ComplianceEventType),
  occurredAt: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

export const sponsorConfigSchema = z
  .object({
    sponsorName: z.string().min(1),
    sponsorPhoneE164: z.string().regex(/^\+[1-9]\d{1,14}$/),
    callTimeLocalHhmm: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .refine((value) => {
        const [hoursText, minutesText] = value.split(":");
        const hours = Number(hoursText);
        const minutes = Number(minutesText);
        return (
          Number.isInteger(hours) &&
          Number.isInteger(minutes) &&
          hours >= 0 &&
          hours <= 23 &&
          minutes >= 0 &&
          minutes <= 59
        );
      }, "callTimeLocalHhmm must be a valid HH:mm value"),
    repeatUnit: z.nativeEnum(SponsorRepeatUnit),
    repeatInterval: z.number().int().positive(),
    repeatDays: z.array(z.nativeEnum(SponsorRepeatDay)),
    active: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    if (value.repeatUnit === SponsorRepeatUnit.MONTHLY) {
      if (value.repeatInterval !== 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "repeatInterval must be 1 for MONTHLY repeats",
          path: ["repeatInterval"],
        });
      }
      if (value.repeatDays.length !== 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "repeatDays must be empty for MONTHLY repeats",
          path: ["repeatDays"],
        });
      }
      return;
    }

    if (value.repeatInterval !== 1 && value.repeatInterval !== 2) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "repeatInterval must be 1 or 2 for WEEKLY repeats",
        path: ["repeatInterval"],
      });
    }

    if (value.repeatDays.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "repeatDays must include at least one day for WEEKLY repeats",
        path: ["repeatDays"],
      });
    }

    if (new Set(value.repeatDays).size !== value.repeatDays.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "repeatDays must not contain duplicates",
        path: ["repeatDays"],
      });
    }
  });

export type AttendanceRecord = z.infer<typeof attendanceRecordSchema>;
export type ExclusionZone = z.infer<typeof exclusionZoneSchema>;
export type UserZoneRule = z.infer<typeof userZoneRuleSchema>;
export type Incident = z.infer<typeof incidentSchema>;
export type NotificationEvent = z.infer<typeof notificationEventSchema>;
export type LocationPing = z.infer<typeof locationPingSchema>;
export type LastKnownLocation = z.infer<typeof lastKnownLocationSchema>;
export type ComplianceEvent = z.infer<typeof complianceEventSchema>;
export type SponsorConfig = z.infer<typeof sponsorConfigSchema>;
