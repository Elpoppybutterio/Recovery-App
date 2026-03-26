import { z } from "zod";

export enum Role {
  END_USER = "END_USER",
  SPONSOR = "SPONSOR",
  MEETING_VERIFIER = "MEETING_VERIFIER",
  SUPERVISOR = "SUPERVISOR",
  ADMIN = "ADMIN",
}

export const accessGrantRoleSchema = z.enum([
  "recovery_user",
  "resident_user",
  "court_participant",
  "org_admin",
  "house_manager",
  "probation_officer",
  "parole_officer",
  "court_supervisor",
  "platform_owner",
]);

export type AccessGrantRole = z.infer<typeof accessGrantRoleSchema>;

export const participantTypeSchema = z.enum([
  "recovery_user",
  "resident_user",
  "court_participant",
]);

export const participantProfileStatusSchema = z.enum(["PENDING", "ACTIVE", "PAUSED", "INACTIVE"]);

export const obligationTypeSchema = z.enum([
  "meeting_attendance",
  "sponsor_contact",
  "treatment_session",
  "court_appearance",
  "drug_test",
  "chore",
  "curfew",
  "service_commitment",
  "proof_submission",
  "other",
]);

export const obligationSourceTrackSchema = z.enum([
  "recovery",
  "resident",
  "court",
  "service",
  "treatment",
  "sponsor",
  "operations",
  "other",
]);

export const obligationPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const obligationStatusSchema = z.enum([
  "ACTIVE",
  "COMPLETED",
  "MISSED",
  "CANCELED",
  "WAIVED",
]);

export const participantComplianceEventTypeSchema = z.enum([
  "MEETING_ATTENDED",
  "MEETING_MISSED",
  "SPONSOR_CONTACT_COMPLETED",
  "SPONSOR_CONTACT_MISSED",
  "TREATMENT_SESSION_ATTENDED",
  "TREATMENT_SESSION_MISSED",
  "COURT_APPEARANCE_ATTENDED",
  "COURT_APPEARANCE_MISSED",
  "DRUG_TEST_COMPLETED",
  "DRUG_TEST_MISSED",
  "CHORE_COMPLETED",
  "CHORE_MISSED",
  "CURFEW_CHECK_PASSED",
  "CURFEW_VIOLATION_DETECTED",
  "SERVICE_COMMITMENT_COMPLETED",
  "PROOF_UPLOADED",
  "SIGNATURE_CAPTURED",
  "GEOFENCE_ENTERED",
  "GEOFENCE_EXITED",
  "ADMIN_NOTE_ADDED",
  "OBLIGATION_SYNCED",
]);

export const participantComplianceEventStatusSchema = z.enum([
  "COMPLETED",
  "MISSED",
  "PASSED",
  "FAILED",
  "UPLOADED",
  "CAPTURED",
  "ENTERED",
  "EXITED",
  "NOTED",
]);

export const violationTypeSchema = z.enum([
  "missed_meeting",
  "missed_treatment",
  "missed_test",
  "missed_sponsor_contact",
  "missed_chore",
  "missed_curfew",
  "missing_signature",
  "missing_proof",
  "other",
]);

export const violationSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const violationStatusSchema = z.enum(["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"]);

export type ParticipantType = z.infer<typeof participantTypeSchema>;
export type ParticipantProfileStatus = z.infer<typeof participantProfileStatusSchema>;
export type ObligationType = z.infer<typeof obligationTypeSchema>;
export type ObligationSourceTrack = z.infer<typeof obligationSourceTrackSchema>;
export type ObligationPriority = z.infer<typeof obligationPrioritySchema>;
export type ObligationStatus = z.infer<typeof obligationStatusSchema>;
export type ParticipantComplianceEventType = z.infer<typeof participantComplianceEventTypeSchema>;
export type ParticipantComplianceEventStatus = z.infer<
  typeof participantComplianceEventStatusSchema
>;
export type ViolationType = z.infer<typeof violationTypeSchema>;
export type ViolationSeverity = z.infer<typeof violationSeveritySchema>;
export type ViolationStatus = z.infer<typeof violationStatusSchema>;

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

export const homeGroupBirthdayConfigSchema = z
  .object({
    homeGroupActive: z.boolean(),
    homeGroupKey: z.string().min(1).nullable(),
    homeGroupName: z.string().min(1).nullable(),
    birthdaysEnabled: z.boolean().default(false),
    firstName: z.string().trim().max(80).nullable().optional(),
    lastName: z.string().trim().max(80).nullable().optional(),
    sobrietyDateIso: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.homeGroupActive) {
      if (!value.homeGroupKey) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "homeGroupKey is required when home group is enabled",
          path: ["homeGroupKey"],
        });
      }
      if (!value.homeGroupName) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "homeGroupName is required when home group is enabled",
          path: ["homeGroupName"],
        });
      }
    }

    if (!value.homeGroupActive && value.birthdaysEnabled) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "birthdaysEnabled requires an active home group",
        path: ["birthdaysEnabled"],
      });
    }

    if (value.birthdaysEnabled) {
      if (!value.firstName || value.firstName.trim().length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "firstName is required when birthdays are enabled",
          path: ["firstName"],
        });
      }
      if (!value.sobrietyDateIso) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "sobrietyDateIso is required when birthdays are enabled",
          path: ["sobrietyDateIso"],
        });
      }
    }
  });

export const userProfileSchema = z.object({
  userId: z.string().min(1),
  tenantId: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const accessGrantSchema = z.object({
  id: z.string().min(1),
  role: accessGrantRoleSchema,
  organizationId: z.string().min(1).nullable(),
  organizationName: z.string().min(1).nullable(),
  courtProgramId: z.string().min(1).nullable(),
  courtProgramName: z.string().min(1).nullable(),
  courtProgramJurisdiction: z.string().min(1).nullable(),
  grantedAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
});

export const accessCapabilitiesSchema = z.object({
  participantRoles: z.array(accessGrantRoleSchema),
  protectedRoles: z.array(accessGrantRoleSchema),
  canManageOrganizations: z.boolean(),
  canManageCourtPrograms: z.boolean(),
  isPlatformOwner: z.boolean(),
});

export const accessContextResponseSchema = z.object({
  user: userProfileSchema,
  grants: z.array(accessGrantSchema),
  capabilities: accessCapabilitiesSchema,
});

export const participantProfileSchema = z.object({
  userId: z.string().min(1),
  participantType: participantTypeSchema,
  organizationId: z.string().min(1).nullable(),
  houseId: z.string().min(1).nullable(),
  courtProgramId: z.string().min(1).nullable(),
  status: participantProfileStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const obligationSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  obligationType: obligationTypeSchema,
  sourceTrack: obligationSourceTrackSchema,
  title: z.string().min(1),
  description: z.string().nullable(),
  organizationId: z.string().min(1).nullable(),
  houseId: z.string().min(1).nullable(),
  courtProgramId: z.string().min(1).nullable(),
  dueAt: z.string().datetime().nullable(),
  recurrence: z.record(z.unknown()).nullable(),
  priority: obligationPrioritySchema.nullable(),
  requiresProof: z.boolean(),
  requiresSignature: z.boolean(),
  status: obligationStatusSchema,
  syncSource: z.string().min(1).nullable(),
  syncKey: z.string().min(1).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const participantComplianceEventSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  obligationId: z.string().min(1).nullable(),
  organizationId: z.string().min(1).nullable(),
  houseId: z.string().min(1).nullable(),
  courtProgramId: z.string().min(1).nullable(),
  eventType: participantComplianceEventTypeSchema,
  eventStatus: participantComplianceEventStatusSchema,
  occurredAt: z.string().datetime(),
  metadata: z.record(z.unknown()),
  proofUri: z.string().nullable(),
  signaturePresent: z.boolean(),
  createdByRole: z.string().nullable(),
  sourceTrack: obligationSourceTrackSchema.nullable(),
  externalEventId: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const participantViolationSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  obligationId: z.string().min(1).nullable(),
  organizationId: z.string().min(1).nullable(),
  houseId: z.string().min(1).nullable(),
  courtProgramId: z.string().min(1).nullable(),
  violationType: violationTypeSchema,
  severity: violationSeveritySchema,
  status: violationStatusSchema,
  detectedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
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
export type HomeGroupBirthdayConfig = z.infer<typeof homeGroupBirthdayConfigSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type AccessGrant = z.infer<typeof accessGrantSchema>;
export type AccessCapabilities = z.infer<typeof accessCapabilitiesSchema>;
export type AccessContextResponse = z.infer<typeof accessContextResponseSchema>;
export type ParticipantProfile = z.infer<typeof participantProfileSchema>;
export type Obligation = z.infer<typeof obligationSchema>;
export type ParticipantComplianceEvent = z.infer<typeof participantComplianceEventSchema>;
export type ParticipantViolation = z.infer<typeof participantViolationSchema>;
