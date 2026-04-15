import {
  accessGrantRoleSchema,
  type AccessGrantRole,
  ComplianceEventType,
  IncidentStatus,
  IncidentType,
  obligationPrioritySchema,
  obligationSourceTrackSchema,
  obligationStatusSchema,
  obligationTypeSchema,
  participantComplianceEventStatusSchema,
  participantComplianceEventTypeSchema,
  participantProfileStatusSchema,
  participantTypeSchema,
  proofTypeSchema,
  Role,
  soberHouseAlertAcknowledgementStatusSchema,
  soberHouseEntityStatusSchema,
  soberHouseEventCompletionStatusSchema,
  soberHouseProofReviewStatusSchema,
  SponsorRepeatDay,
  SponsorRepeatRule,
  SponsorRepeatUnit,
  verificationStatusSchema,
  violationSeveritySchema,
  violationStatusSchema,
  violationTypeSchema,
  type ObligationPriority,
  type ObligationSourceTrack,
  type ObligationStatus,
  type ObligationType,
  type ParticipantComplianceEventStatus,
  type ParticipantComplianceEventType,
  type ParticipantProfileStatus,
  type ParticipantType,
  type ProofType,
  type SoberHouseAlertAcknowledgementStatus,
  type SoberHouseEntityStatus,
  type SoberHouseEventCompletionStatus,
  type SoberHouseProofReviewStatus,
  type VerificationStatus,
  type ViolationSeverity,
  type ViolationStatus,
  type ViolationType,
} from "@recovery/shared-types";
import { createHash, randomUUID } from "node:crypto";
import type { ActorContext } from "../domain/actor";
import type { DbClient } from "./client";
import {
  boundingBoxForRadius,
  buildMeetingDedupeKey,
  haversineDistanceMeters,
  inferMeetingFormat,
  type NormalizedMeetingGuideMeeting,
} from "../meeting-guide";

interface UserRow {
  id: string;
  tenant_id: string;
}

export interface UserProfileRow {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  created_at: string;
}

export interface UserSupervisionRow {
  id: string;
  tenant_id: string;
  supervision_enabled: boolean;
  supervision_end_date: string | null;
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

interface AccessGrantRow {
  id: number;
  role: string;
  organization_id: string | null;
  organization_name: string | null;
  court_program_id: string | null;
  court_program_name: string | null;
  court_program_jurisdiction: string | null;
  granted_at: string;
  revoked_at: string | null;
}

export interface UserAccessGrantRow {
  id: string;
  role: AccessGrantRole;
  organizationId: string | null;
  organizationName: string | null;
  courtProgramId: string | null;
  courtProgramName: string | null;
  courtProgramJurisdiction: string | null;
  grantedAt: string;
  revokedAt: string | null;
}

export interface UserAccessCapabilities {
  participantRoles: AccessGrantRole[];
  protectedRoles: AccessGrantRole[];
  canManageOrganizations: boolean;
  canManageCourtPrograms: boolean;
  isPlatformOwner: boolean;
}

export interface UserAccessContext {
  user: {
    userId: string;
    tenantId: string;
    email: string;
    displayName: string;
    createdAt: string;
  };
  grants: UserAccessGrantRow[];
  capabilities: UserAccessCapabilities;
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

export class SignatureWindowError extends Error {
  readonly checkInAtIso: string;
  readonly windowEndsAtIso: string;

  constructor(checkInAtIso: string, windowEndsAtIso: string) {
    super("Signature is available from meeting start until 90 minutes after start.");
    this.name = "SignatureWindowError";
    this.checkInAtIso = checkInAtIso;
    this.windowEndsAtIso = windowEndsAtIso;
  }
}

export type ExclusionZoneType = "CIRCLE" | "POLYGON";

export interface ExclusionZoneRow {
  id: string;
  tenant_id: string;
  label: string;
  zone_type: ExclusionZoneType;
  active: boolean;
  center_lat: number | null;
  center_lng: number | null;
  radius_m: number | null;
  polygon_geojson: unknown | null;
  created_at: string;
  created_by_user_id: string;
}

export interface UserZoneRuleRow {
  id: string;
  tenant_id: string;
  user_id: string;
  zone_id: string;
  buffer_m: number;
  active: boolean;
}

export interface IncidentRow {
  id: string;
  tenant_id: string;
  user_id: string;
  zone_id: string;
  incident_type: IncidentType;
  occurred_at: string;
  status: IncidentStatus;
  metadata_json: unknown;
  created_at: string;
}

export interface NotificationEventRow {
  id: string;
  tenant_id: string;
  user_id: string;
  channel: "EMAIL" | "SMS";
  recipient: string;
  template_key: string;
  payload_json: unknown;
  status: string;
  created_at: string;
}

export interface LastKnownLocationRow {
  tenant_id: string;
  user_id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  recorded_at: string;
  source: string;
}

export interface SupervisorLiveLocationFilters {
  userId?: string;
}

export interface ComplianceEventRow {
  id: string;
  tenant_id: string;
  user_id: string;
  obligation_id: string | null;
  organization_id: string | null;
  house_id: string | null;
  court_program_id: string | null;
  event_type: ComplianceEventType | ParticipantComplianceEventType;
  event_status: ParticipantComplianceEventStatus | null;
  occurred_at: string;
  metadata_json: unknown;
  proof_uri: string | null;
  proof_metadata_json: unknown;
  signature_present: boolean;
  proof_type: ProofType | null;
  verification_status: VerificationStatus | null;
  verified_by_role: string | null;
  verified_at: string | null;
  created_by_role: string | null;
  source_track: ObligationSourceTrack | null;
  external_event_id: string | null;
  created_at: string;
}

export interface HouseRow {
  id: string;
  tenant_id: string;
  organization_id: string;
  name: string;
  created_at: string;
}

export interface OrganizationRow {
  id: string;
  tenant_id: string;
  name: string;
  created_at: string;
}

export interface ParticipantProfileRow {
  user_id: string;
  tenant_id: string;
  display_name: string | null;
  participant_type: ParticipantType;
  organization_id: string | null;
  house_id: string | null;
  court_program_id: string | null;
  status: ParticipantProfileStatus;
  created_at: string;
  updated_at: string;
}

export type SoberHouseObligationType = "HOUSE_MEETING" | "ONE_ON_ONE" | "CHORE";

export interface ResidentHouseMembershipRow {
  id: string;
  tenant_id: string;
  organization_id: string;
  house_id: string;
  resident_user_id: string;
  status: SoberHouseEntityStatus;
  created_at: string;
  updated_at: string;
}

export interface SoberHouseObligationRow {
  id: string;
  tenant_id: string;
  organization_id: string;
  house_id: string;
  resident_user_id: string;
  resident_house_membership_id: string | null;
  obligation_type: SoberHouseObligationType;
  scheduled_at: string;
  due_at: string | null;
  proof_required: boolean;
  status: SoberHouseEntityStatus;
  created_at: string;
  updated_at: string;
}

export interface SoberHouseCompletionRecordRow {
  id: string;
  tenant_id: string;
  organization_id: string;
  house_id: string;
  resident_user_id: string;
  obligation_id: string;
  completion_status: SoberHouseEventCompletionStatus;
  completed_at: string | null;
  proof_metadata_json: unknown | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SoberHouseProofReviewRow {
  id: string;
  tenant_id: string;
  organization_id: string;
  house_id: string;
  resident_user_id: string;
  completion_record_id: string;
  review_outcome: SoberHouseProofReviewStatus;
  reviewer_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SoberHouseAlertAcknowledgementRow {
  id: string;
  tenant_id: string;
  organization_id: string;
  house_id: string | null;
  resident_user_id: string;
  alert_id: string;
  status: SoberHouseAlertAcknowledgementStatus;
  acknowledged_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResidentHouseObligationRecord {
  obligation: SoberHouseObligationRow;
  completion: SoberHouseCompletionRecordRow | null;
  proofReview: SoberHouseProofReviewRow | null;
}

export interface ObligationRow {
  id: string;
  tenant_id: string;
  user_id: string;
  obligation_type: ObligationType;
  source_track: ObligationSourceTrack;
  title: string;
  description: string | null;
  organization_id: string | null;
  house_id: string | null;
  court_program_id: string | null;
  due_at: string | null;
  recurrence_json: unknown;
  priority: ObligationPriority | null;
  requires_proof: boolean;
  requires_signature: boolean;
  proof_type: ProofType | null;
  verification_status: VerificationStatus;
  status: ObligationStatus;
  sync_source: string | null;
  sync_key: string | null;
  created_by_user_id: string | null;
  created_by_role: string | null;
  created_at: string;
  updated_at: string;
}

export interface ViolationRow {
  id: string;
  tenant_id: string;
  user_id: string;
  obligation_id: string | null;
  organization_id: string | null;
  house_id: string | null;
  court_program_id: string | null;
  violation_type: ViolationType;
  severity: ViolationSeverity;
  status: ViolationStatus;
  detected_at: string;
  resolved_at: string | null;
  notes: string | null;
  detected_from_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ObligationSnapshotInput {
  syncKey: string;
  obligationType: ObligationType;
  sourceTrack: ObligationSourceTrack;
  title: string;
  description?: string | null;
  organizationId?: string | null;
  houseId?: string | null;
  courtProgramId?: string | null;
  dueAt?: string | null;
  recurrence?: Record<string, unknown> | null;
  priority?: ObligationPriority | null;
  requiresProof?: boolean;
  requiresSignature?: boolean;
  proofType?: ProofType | null;
  verificationStatus?: VerificationStatus | null;
  status: ObligationStatus;
}

export interface ParticipantComplianceEventInput {
  obligationId?: string | null;
  eventType: ParticipantComplianceEventType;
  eventStatus: ParticipantComplianceEventStatus;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
  proofUri?: string | null;
  proofMetadata?: Record<string, unknown> | null;
  signaturePresent?: boolean;
  proofType?: ProofType | null;
  verificationStatus?: VerificationStatus | null;
  verifiedByRole?: string | null;
  verifiedAt?: Date | null;
  createdByRole?: string | null;
  sourceTrack?: ObligationSourceTrack | null;
  externalEventId?: string | null;
}

export interface RecordParticipantComplianceEventResult {
  event: ComplianceEventRow;
  violation: ViolationRow | null;
}

export interface RecordSoberHouseCompletionInput {
  obligationId: string;
  completionStatus: SoberHouseEventCompletionStatus;
  completedAt?: Date | null;
  proofMetadata?: Record<string, unknown> | null;
  submittedAt?: Date | null;
}

export interface RecordSoberHouseCompletionResult {
  completion: SoberHouseCompletionRecordRow;
  proofReview: SoberHouseProofReviewRow | null;
}

export interface PendingSoberHouseProofReviewRecord {
  review: SoberHouseProofReviewRow;
  completion: SoberHouseCompletionRecordRow;
  obligation: SoberHouseObligationRow;
}

export type SoberHouseProofReviewOutcome = Exclude<SoberHouseProofReviewStatus, "PENDING">;

export interface UpdateSoberHouseProofReviewInput {
  reviewOutcome: SoberHouseProofReviewOutcome;
  reviewerUserId: string;
  reviewedAt?: Date | null;
}

export interface AcknowledgeSoberHouseAlertInput {
  organizationId: string;
  houseId?: string | null;
  acknowledgedAt?: Date | null;
  note?: string | null;
}

export interface SponsorConfigRow {
  id: string;
  tenant_id: string;
  user_id: string;
  sponsor_name: string;
  sponsor_phone_e164: string;
  call_time_local_hhmm: string;
  repeat_rule: SponsorRepeatRule;
  repeat_unit: SponsorRepeatUnit;
  repeat_interval: number;
  repeat_days: SponsorRepeatDay[];
  active: boolean;
  created_at: string;
  updated_at: string;
  updated_by_user_id: string;
}

export interface HomeGroupBirthdayMembershipRow {
  id: string;
  tenant_id: string;
  user_id: string;
  home_group_active: boolean;
  home_group_key: string | null;
  home_group_name: string | null;
  birthday_opt_in: boolean;
  first_name: string | null;
  last_name: string | null;
  sobriety_date: string | null;
  created_at: string;
  updated_at: string;
  updated_by_user_id: string;
}

export interface HomeGroupBirthdayAnnouncementRow {
  id: string;
  first_name: string;
  last_name: string | null;
  sobriety_date: string;
}

export interface MeetingFeedRow {
  id: string;
  tenant_id: string;
  name: string;
  url: string;
  entity: string | null;
  entity_url: string | null;
  active: boolean;
  last_fetched_at: string | null;
  etag: string | null;
  last_modified: string | null;
  last_error: string | null;
}

export interface MeetingGuideMeetingRow {
  id: string;
  tenant_id: string;
  source_feed_id: string;
  slug: string;
  name: string;
  day: number | null;
  time: string | null;
  end_time: string | null;
  timezone: string | null;
  formatted_address: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  region: string | null;
  location: string | null;
  notes: string | null;
  types_json: unknown;
  conference_url: string | null;
  conference_phone: string | null;
  lat: number | null;
  lng: number | null;
  geo_status: "ok" | "missing" | "invalid" | "partial";
  geo_reason: string | null;
  geo_updated_at: string | null;
  updated_at_source: string | null;
  last_ingested_at: string;
}

function parseIsoDateParts(value: string): { year: number; month: number; day: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return { year, month, day };
}

function isLeapYear(year: number): boolean {
  if (year % 400 === 0) {
    return true;
  }
  if (year % 100 === 0) {
    return false;
  }
  return year % 4 === 0;
}

function anniversaryMonthDay(parts: { month: number; day: number }, targetYear: number): string {
  if (parts.month === 2 && parts.day === 29 && !isLeapYear(targetYear)) {
    return "02-28";
  }
  return `${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function sobrietyBirthdayYearsForDate(sobrietyDateIso: string, todayIso: string): number | null {
  const sobrietyParts = parseIsoDateParts(sobrietyDateIso);
  const todayParts = parseIsoDateParts(todayIso);
  if (!sobrietyParts || !todayParts) {
    return null;
  }

  if (
    anniversaryMonthDay(sobrietyParts, todayParts.year) !==
    anniversaryMonthDay(todayParts, todayParts.year)
  ) {
    return null;
  }

  const years = todayParts.year - sobrietyParts.year;
  return years >= 1 ? years : null;
}

export interface MeetingGuideNearbyFilters {
  format?: "in_person" | "online" | "any";
  dayOfWeek?: number;
  types?: string[];
  timeFrom?: string;
  timeTo?: string;
  limit?: number;
}

export interface NearbyMeetingRow extends MeetingGuideMeetingRow {
  distance_meters: number | null;
  inferred_format: "IN_PERSON" | "ONLINE" | "HYBRID";
  types: string[];
}

export interface UserZoneRuleWithZoneRow {
  id: string;
  tenant_id: string;
  user_id: string;
  zone_id: string;
  buffer_m: number;
  active: boolean;
  zone_label: string;
  zone_type: ExclusionZoneType;
  zone_active: boolean;
  center_lat: number | null;
  center_lng: number | null;
  radius_m: number | null;
  polygon_geojson: unknown | null;
}

export interface SupervisorIncidentRow extends IncidentRow {
  zone_label: string;
}

export interface SupervisorIncidentFilters {
  userId?: string;
  zoneId?: string;
  status?: IncidentStatus;
  type?: IncidentType;
}

const CHECK_OUT_DWELL_THRESHOLD_SECONDS = 3600;
const SIGNATURE_WINDOW_MINUTES = 90;
const SIGNATURE_WINDOW_MS = SIGNATURE_WINDOW_MINUTES * 60 * 1000;

function toRole(role: string): Role | null {
  return Object.values(Role).includes(role as Role) ? (role as Role) : null;
}

function toAccessGrantRole(role: string): AccessGrantRole | null {
  const parsed = accessGrantRoleSchema.safeParse(role);
  return parsed.success ? parsed.data : null;
}

function toParticipantType(value: string): ParticipantType | null {
  const parsed = participantTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toParticipantProfileStatus(value: string): ParticipantProfileStatus | null {
  const parsed = participantProfileStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toSoberHouseEntityStatus(value: string): SoberHouseEntityStatus | null {
  const parsed = soberHouseEntityStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toSoberHouseObligationType(value: string): SoberHouseObligationType | null {
  switch (value) {
    case "HOUSE_MEETING":
    case "ONE_ON_ONE":
    case "CHORE":
      return value;
    default:
      return null;
  }
}

function toSoberHouseCompletionStatus(value: string): SoberHouseEventCompletionStatus | null {
  const parsed = soberHouseEventCompletionStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toSoberHouseProofReviewStatus(value: string): SoberHouseProofReviewStatus | null {
  const parsed = soberHouseProofReviewStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toSoberHouseAlertAcknowledgementStatus(
  value: string,
): SoberHouseAlertAcknowledgementStatus | null {
  const parsed = soberHouseAlertAcknowledgementStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toObligationType(value: string): ObligationType | null {
  const parsed = obligationTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toObligationSourceTrack(value: string): ObligationSourceTrack | null {
  const parsed = obligationSourceTrackSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toObligationPriority(value: string | null): ObligationPriority | null {
  if (!value) {
    return null;
  }
  const parsed = obligationPrioritySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toObligationStatus(value: string): ObligationStatus | null {
  const parsed = obligationStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toProofType(value: string | null): ProofType | null {
  if (!value) {
    return null;
  }
  const parsed = proofTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toVerificationStatus(value: string | null): VerificationStatus | null {
  if (!value) {
    return null;
  }
  const parsed = verificationStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toParticipantComplianceEventType(
  value: string,
): ComplianceEventType | ParticipantComplianceEventType | null {
  if (Object.values(ComplianceEventType).includes(value as ComplianceEventType)) {
    return value as ComplianceEventType;
  }
  const parsed = participantComplianceEventTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toParticipantComplianceEventStatus(
  value: string | null,
): ParticipantComplianceEventStatus | null {
  if (!value) {
    return null;
  }
  const parsed = participantComplianceEventStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toViolationType(value: string): ViolationType | null {
  const parsed = violationTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toViolationSeverity(value: string): ViolationSeverity | null {
  const parsed = violationSeveritySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function toViolationStatus(value: string): ViolationStatus | null {
  const parsed = violationStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const organizationManagerRoles: AccessGrantRole[] = [
  "org_admin",
  "house_manager",
  "platform_owner",
];

const courtManagerRoles: AccessGrantRole[] = [
  "probation_officer",
  "parole_officer",
  "court_supervisor",
  "platform_owner",
];

const participantAccessRoles: AccessGrantRole[] = [
  "recovery_user",
  "resident_user",
  "court_participant",
];

function mapViolationTypeFromEvent(
  eventType: ParticipantComplianceEventType,
): ViolationType | null {
  switch (eventType) {
    case "MEETING_MISSED":
      return "missed_meeting";
    case "SPONSOR_CONTACT_MISSED":
      return "missed_sponsor_contact";
    case "TREATMENT_SESSION_MISSED":
      return "missed_treatment";
    case "COURT_APPEARANCE_MISSED":
      return "other";
    case "DRUG_TEST_MISSED":
      return "missed_test";
    case "CHORE_MISSED":
      return "missed_chore";
    case "CURFEW_VIOLATION_DETECTED":
      return "missed_curfew";
    case "SIGNATURE_CAPTURED":
      return "missing_signature";
    case "PROOF_UPLOADED":
      return "missing_proof";
    case "OBLIGATION_MISSED":
      return "other";
    default:
      return null;
  }
}

function shouldCreateViolationFromEvent(input: {
  eventType: ParticipantComplianceEventType;
  eventStatus: ParticipantComplianceEventStatus;
  proofUri?: string | null;
  signaturePresent?: boolean;
  proofType?: ProofType | null;
  verificationStatus?: VerificationStatus | null;
}): boolean {
  if (
    input.eventType === "SIGNATURE_CAPTURED" &&
    input.eventStatus === "FAILED" &&
    input.signaturePresent === false
  ) {
    return true;
  }
  if (input.eventType === "PROOF_UPLOADED" && input.eventStatus === "FAILED" && !input.proofUri) {
    return true;
  }
  if (input.verificationStatus === "REJECTED") {
    return true;
  }
  return input.eventStatus === "MISSED" || input.eventType === "CURFEW_VIOLATION_DETECTED";
}

function resolveViolationTypeForEvent(input: {
  eventType: ParticipantComplianceEventType;
  proofUri?: string | null;
  signaturePresent?: boolean;
  proofType?: ProofType | null;
  verificationStatus?: VerificationStatus | null;
}): ViolationType | null {
  if (
    input.verificationStatus === "REJECTED" &&
    (input.proofType === "selfie" ||
      input.proofType === "photo" ||
      input.proofType === "officer_verification" ||
      input.proofType === "staff_verification")
  ) {
    return "failed_identity_verification";
  }
  if (input.eventType === "SIGNATURE_CAPTURED" && input.signaturePresent === false) {
    return "missing_signature";
  }
  if (input.eventType === "PROOF_UPLOADED" && !input.proofUri) {
    return "missing_proof";
  }
  return mapViolationTypeFromEvent(input.eventType);
}

function violationSeverityFromEvent(eventType: ParticipantComplianceEventType): ViolationSeverity {
  switch (eventType) {
    case "CURFEW_VIOLATION_DETECTED":
    case "DRUG_TEST_MISSED":
    case "COURT_APPEARANCE_MISSED":
      return "HIGH";
    case "MEETING_MISSED":
    case "TREATMENT_SESSION_MISSED":
    case "CHORE_MISSED":
    case "SPONSOR_CONTACT_MISSED":
      return "MEDIUM";
    case "PROOF_UPLOADED":
    case "SIGNATURE_CAPTURED":
      return "LOW";
    case "OBLIGATION_MISSED":
      return "MEDIUM";
    default:
      return "MEDIUM";
  }
}

function uniqueAccessRoles(roles: AccessGrantRole[]): AccessGrantRole[] {
  return Array.from(new Set(roles));
}

function toJsonParam(value: unknown) {
  return JSON.stringify(value ?? {});
}

function shouldCreateSoberHouseProofReview(
  obligation: Pick<SoberHouseObligationRow, "proof_required">,
  proofMetadata: Record<string, unknown> | null | undefined,
) {
  return (
    obligation.proof_required || Boolean(proofMetadata && Object.keys(proofMetadata).length > 0)
  );
}

function inferGeoStatusFromCoordinates(
  lat: number | null,
  lng: number | null,
): "ok" | "missing" | "invalid" | "partial" {
  if (lat !== null && lng !== null) {
    return "ok";
  }
  if (lat === null && lng === null) {
    return "missing";
  }
  return "partial";
}

function inferGeoReasonFromCoordinates(lat: number | null, lng: number | null): string | null {
  if (lat !== null && lng !== null) {
    return null;
  }
  if (lat === null && lng === null) {
    return "missing_coordinates";
  }
  return lat === null ? "missing_latitude" : "missing_longitude";
}

function inferLegacyGeoStatusFromCoordinates(
  lat: number | null,
  lng: number | null,
): "present" | "missing" {
  return lat !== null && lng !== null ? "present" : "missing";
}

type DbErrorShape = {
  code?: string;
  message?: string;
};

function isMissingMeetingGuideGeoColumnsError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as DbErrorShape;
  const message = String(candidate.message ?? "").toLowerCase();
  const isUndefinedColumn = candidate.code === "42703";
  if (!isUndefinedColumn) {
    return false;
  }
  return (
    message.includes("meeting_guide_meetings") &&
    (message.includes("geo_status") ||
      message.includes("geo_reason") ||
      message.includes("geo_updated_at"))
  );
}

function isLegacyMeetingGuideGeoStatusConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as DbErrorShape;
  if (candidate.code !== "23514") {
    return false;
  }
  const message = String(candidate.message ?? "").toLowerCase();
  return (
    message.includes("meeting_guide_meetings_geo_status_check") ||
    (message.includes("meeting_guide_meetings") && message.includes("geo_status"))
  );
}

function toComparableTimestamp(value: string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function scoreNearbyMeetingMetadata(meeting: NearbyMeetingRow): number {
  let score = 0;
  if (meeting.formatted_address) {
    score += 2;
  }
  if (meeting.address) {
    score += 1;
  }
  if (meeting.city) {
    score += 1;
  }
  if (meeting.state) {
    score += 1;
  }
  if (meeting.postal_code) {
    score += 1;
  }
  if (meeting.location) {
    score += 1;
  }
  if (meeting.notes) {
    score += 1;
  }
  if (meeting.conference_url) {
    score += 1;
  }
  if (meeting.conference_phone) {
    score += 1;
  }
  if (meeting.end_time) {
    score += 1;
  }
  if (meeting.types.length > 0) {
    score += Math.min(meeting.types.length, 3);
  }
  return score;
}

function preferNearbyMeeting(
  existing: NearbyMeetingRow,
  candidate: NearbyMeetingRow,
): NearbyMeetingRow {
  const existingDistance = existing.distance_meters ?? Number.POSITIVE_INFINITY;
  const candidateDistance = candidate.distance_meters ?? Number.POSITIVE_INFINITY;
  if (Math.abs(existingDistance - candidateDistance) > 1) {
    return candidateDistance < existingDistance ? candidate : existing;
  }

  const existingScore = scoreNearbyMeetingMetadata(existing);
  const candidateScore = scoreNearbyMeetingMetadata(candidate);
  if (candidateScore !== existingScore) {
    return candidateScore > existingScore ? candidate : existing;
  }

  const existingUpdated = Math.max(
    toComparableTimestamp(existing.updated_at_source),
    toComparableTimestamp(existing.last_ingested_at),
  );
  const candidateUpdated = Math.max(
    toComparableTimestamp(candidate.updated_at_source),
    toComparableTimestamp(candidate.last_ingested_at),
  );
  if (candidateUpdated !== existingUpdated) {
    return candidateUpdated > existingUpdated ? candidate : existing;
  }

  return candidate.id.localeCompare(existing.id) < 0 ? candidate : existing;
}

export function createRepositories(db: DbClient) {
  async function syncResidentHouseMembership(
    tenantId: string,
    userId: string,
    payload: {
      participantType: ParticipantType;
      organizationId?: string | null;
      houseId?: string | null;
      status: ParticipantProfileStatus;
    },
  ) {
    if (
      payload.participantType !== "resident_user" ||
      !payload.organizationId ||
      !payload.houseId
    ) {
      await db.query(
        `
        UPDATE resident_house_memberships
        SET status = 'INACTIVE',
            updated_at = NOW()
        WHERE tenant_id = $1
          AND resident_user_id = $2
      `,
        [tenantId, userId],
      );
      return;
    }

    await db.query(
      `
      UPDATE resident_house_memberships
      SET status = 'INACTIVE',
          updated_at = NOW()
      WHERE tenant_id = $1
        AND resident_user_id = $2
        AND house_id <> $3
    `,
      [tenantId, userId, payload.houseId],
    );

    await db.query<ResidentHouseMembershipRow>(
      `
      INSERT INTO resident_house_memberships (
        id,
        tenant_id,
        organization_id,
        house_id,
        resident_user_id,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id, house_id, resident_user_id)
      DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING
        id,
        tenant_id,
        organization_id,
        house_id,
        resident_user_id,
        status,
        created_at,
        updated_at
    `,
      [
        `rhm:${tenantId}:${payload.houseId}:${userId}`,
        tenantId,
        payload.organizationId,
        payload.houseId,
        userId,
        payload.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
      ],
    );
  }

  async function listResidentHouseMembershipRows(
    tenantId: string,
  ): Promise<ResidentHouseMembershipRow[]> {
    const result = await db.query<ResidentHouseMembershipRow>(
      `
      SELECT
        id,
        tenant_id,
        organization_id,
        house_id,
        resident_user_id,
        status,
        created_at,
        updated_at
      FROM resident_house_memberships
      WHERE tenant_id = $1
      ORDER BY updated_at DESC, created_at DESC
    `,
      [tenantId],
    );

    return result.rows
      .map((row) => {
        const status = toSoberHouseEntityStatus(String(row.status));
        if (!status) {
          return null;
        }
        return {
          ...row,
          status,
        };
      })
      .filter((row): row is ResidentHouseMembershipRow => row !== null);
  }

  async function listSoberHouseObligationRows(
    tenantId: string,
  ): Promise<SoberHouseObligationRow[]> {
    const result = await db.query<SoberHouseObligationRow>(
      `
      SELECT
        id,
        tenant_id,
        organization_id,
        house_id,
        resident_user_id,
        resident_house_membership_id,
        obligation_type,
        scheduled_at,
        due_at,
        proof_required,
        status,
        created_at,
        updated_at
      FROM sober_house_obligations
      WHERE tenant_id = $1
      ORDER BY COALESCE(due_at, scheduled_at) ASC, created_at DESC
    `,
      [tenantId],
    );

    return result.rows
      .map((row) => {
        const obligationType = toSoberHouseObligationType(String(row.obligation_type));
        const status = toSoberHouseEntityStatus(String(row.status));
        if (!obligationType || !status) {
          return null;
        }
        return {
          ...row,
          obligation_type: obligationType,
          status,
        };
      })
      .filter((row): row is SoberHouseObligationRow => row !== null);
  }

  async function listSoberHouseCompletionRows(
    tenantId: string,
  ): Promise<SoberHouseCompletionRecordRow[]> {
    const result = await db.query<SoberHouseCompletionRecordRow>(
      `
      SELECT
        id,
        tenant_id,
        organization_id,
        house_id,
        resident_user_id,
        obligation_id,
        completion_status,
        completed_at,
        proof_metadata_json,
        submitted_at,
        created_at,
        updated_at
      FROM sober_house_completion_records
      WHERE tenant_id = $1
      ORDER BY COALESCE(submitted_at, completed_at, updated_at) DESC, created_at DESC
    `,
      [tenantId],
    );

    return result.rows
      .map((row) => {
        const completionStatus = toSoberHouseCompletionStatus(String(row.completion_status));
        if (!completionStatus) {
          return null;
        }
        return {
          ...row,
          completion_status: completionStatus,
        };
      })
      .filter((row): row is SoberHouseCompletionRecordRow => row !== null);
  }

  async function listSoberHouseProofReviewRows(
    tenantId: string,
  ): Promise<SoberHouseProofReviewRow[]> {
    const result = await db.query<SoberHouseProofReviewRow>(
      `
      SELECT
        id,
        tenant_id,
        organization_id,
        house_id,
        resident_user_id,
        completion_record_id,
        review_outcome,
        reviewer_user_id,
        reviewed_at,
        created_at,
        updated_at
      FROM sober_house_proof_reviews
      WHERE tenant_id = $1
      ORDER BY created_at DESC, updated_at DESC
    `,
      [tenantId],
    );

    return result.rows
      .map((row) => {
        const reviewOutcome = toSoberHouseProofReviewStatus(String(row.review_outcome));
        if (!reviewOutcome) {
          return null;
        }
        return {
          ...row,
          review_outcome: reviewOutcome,
        };
      })
      .filter((row): row is SoberHouseProofReviewRow => row !== null);
  }

  async function listSoberHouseAlertAcknowledgementRows(
    tenantId: string,
  ): Promise<SoberHouseAlertAcknowledgementRow[]> {
    const result = await db.query<SoberHouseAlertAcknowledgementRow>(
      `
      SELECT
        id,
        tenant_id,
        organization_id,
        house_id,
        resident_user_id,
        alert_id,
        status,
        acknowledged_at,
        note,
        created_at,
        updated_at
      FROM sober_house_alert_acknowledgements
      WHERE tenant_id = $1
      ORDER BY COALESCE(acknowledged_at, updated_at) DESC, created_at DESC
    `,
      [tenantId],
    );

    return result.rows
      .map((row) => {
        const status = toSoberHouseAlertAcknowledgementStatus(String(row.status));
        if (!status) {
          return null;
        }
        return {
          ...row,
          status,
        };
      })
      .filter((row): row is SoberHouseAlertAcknowledgementRow => row !== null);
  }

  async function listResidentHouseObligationRecordsForTenant(
    tenantId: string,
    filters: {
      residentUserId?: string;
      organizationId?: string;
      houseId?: string;
      status?: SoberHouseEntityStatus;
      obligationType?: SoberHouseObligationType;
    } = {},
  ): Promise<ResidentHouseObligationRecord[]> {
    const [obligations, completions, proofReviews] = await Promise.all([
      listSoberHouseObligationRows(tenantId),
      listSoberHouseCompletionRows(tenantId),
      listSoberHouseProofReviewRows(tenantId),
    ]);

    const completionByObligationId = new Map(
      completions.map((completion) => [completion.obligation_id, completion] as const),
    );
    const proofReviewByCompletionId = new Map(
      proofReviews.map((review) => [review.completion_record_id, review] as const),
    );

    return obligations
      .filter((obligation) => {
        if (filters.residentUserId && obligation.resident_user_id !== filters.residentUserId) {
          return false;
        }
        if (filters.organizationId && obligation.organization_id !== filters.organizationId) {
          return false;
        }
        if (filters.houseId && obligation.house_id !== filters.houseId) {
          return false;
        }
        if (filters.status && obligation.status !== filters.status) {
          return false;
        }
        if (filters.obligationType && obligation.obligation_type !== filters.obligationType) {
          return false;
        }
        return true;
      })
      .map((obligation) => {
        const completion = completionByObligationId.get(obligation.id) ?? null;
        return {
          obligation,
          completion,
          proofReview: completion ? (proofReviewByCompletionId.get(completion.id) ?? null) : null,
        };
      });
  }

  async function listPendingSoberHouseProofReviewRecordsForTenant(
    tenantId: string,
    filters: {
      residentUserId?: string;
      organizationId?: string;
      houseId?: string;
    } = {},
  ): Promise<PendingSoberHouseProofReviewRecord[]> {
    const [proofReviews, completions, obligations] = await Promise.all([
      listSoberHouseProofReviewRows(tenantId),
      listSoberHouseCompletionRows(tenantId),
      listSoberHouseObligationRows(tenantId),
    ]);

    const completionById = new Map(
      completions.map((completion) => [completion.id, completion] as const),
    );
    const obligationById = new Map(
      obligations.map((obligation) => [obligation.id, obligation] as const),
    );

    return proofReviews
      .filter((review) => review.review_outcome === "PENDING")
      .map((review) => {
        const completion = completionById.get(review.completion_record_id) ?? null;
        const obligation = completion
          ? (obligationById.get(completion.obligation_id) ?? null)
          : null;
        if (!completion || !obligation) {
          return null;
        }
        return {
          review,
          completion,
          obligation,
        };
      })
      .filter((record): record is PendingSoberHouseProofReviewRecord => record !== null)
      .filter((record) => {
        if (filters.residentUserId && record.review.resident_user_id !== filters.residentUserId) {
          return false;
        }
        if (filters.organizationId && record.review.organization_id !== filters.organizationId) {
          return false;
        }
        if (filters.houseId && record.review.house_id !== filters.houseId) {
          return false;
        }
        return true;
      });
  }

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
        `
        SELECT role
        FROM user_roles
        WHERE tenant_id = $1
          AND user_id = $2
          AND is_active = TRUE
          AND revoked_at IS NULL
      `,
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

    async findUserProfileByUserId(userId: string): Promise<UserProfileRow | null> {
      const result = await db.query<UserProfileRow>(
        `
        SELECT id, tenant_id, email, display_name, created_at
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
        [userId],
      );

      return result.rows[0] ?? null;
    },

    async findAccessContextByUserId(userId: string): Promise<UserAccessContext | null> {
      const userResult = await db.query<UserProfileRow>(
        `
        SELECT id, tenant_id, email, display_name, created_at
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
        [userId],
      );
      const user = userResult.rows[0];
      if (!user) {
        return null;
      }

      const grantsResult = await db.query<AccessGrantRow>(
        `
        SELECT
          ur.id,
          ur.role,
          ur.organization_id,
          org.name AS organization_name,
          ur.court_program_id,
          cp.name AS court_program_name,
          cp.jurisdiction AS court_program_jurisdiction,
          ur.granted_at,
          ur.revoked_at
        FROM user_roles ur
        LEFT JOIN organizations org
          ON org.id = ur.organization_id
         AND org.tenant_id = ur.tenant_id
        LEFT JOIN court_programs cp
          ON cp.id = ur.court_program_id
         AND cp.tenant_id = ur.tenant_id
        WHERE ur.tenant_id = $1
          AND ur.user_id = $2
          AND ur.is_active = TRUE
          AND ur.revoked_at IS NULL
        ORDER BY ur.granted_at DESC, ur.id DESC
      `,
        [user.tenant_id, user.id],
      );

      const grants = grantsResult.rows
        .map((row): UserAccessGrantRow | null => {
          const role = toAccessGrantRole(row.role);
          if (!role) {
            return null;
          }

          return {
            id: String(row.id),
            role,
            organizationId: row.organization_id,
            organizationName: row.organization_name,
            courtProgramId: row.court_program_id,
            courtProgramName: row.court_program_name,
            courtProgramJurisdiction: row.court_program_jurisdiction,
            grantedAt: row.granted_at,
            revokedAt: row.revoked_at,
          };
        })
        .filter((row): row is UserAccessGrantRow => row !== null);

      const participantRoles = uniqueAccessRoles(
        grants
          .filter((grant) => participantAccessRoles.includes(grant.role))
          .map((grant) => grant.role),
      );
      const protectedRoles = uniqueAccessRoles(
        grants
          .filter((grant) => !participantAccessRoles.includes(grant.role))
          .map((grant) => grant.role),
      );

      return {
        user: {
          userId: user.id,
          tenantId: user.tenant_id,
          email: user.email,
          displayName: user.display_name,
          createdAt: user.created_at,
        },
        grants,
        capabilities: {
          participantRoles,
          protectedRoles,
          canManageOrganizations: grants.some((grant) =>
            organizationManagerRoles.includes(grant.role),
          ),
          canManageCourtPrograms: grants.some((grant) => courtManagerRoles.includes(grant.role)),
          isPlatformOwner: grants.some((grant) => grant.role === "platform_owner"),
        },
      };
    },

    async listOrganizations(
      tenantId: string,
      organizationIds?: string[],
    ): Promise<OrganizationRow[]> {
      const result = await db.query<OrganizationRow>(
        `
        SELECT
          id,
          tenant_id,
          name,
          created_at
        FROM organizations
        WHERE tenant_id = $1
        ORDER BY name ASC, created_at ASC
      `,
        [tenantId],
      );

      const allowedIds = organizationIds ? new Set(organizationIds) : null;
      return result.rows.filter((row) => (allowedIds ? allowedIds.has(row.id) : true));
    },

    async upsertOrganization(
      tenantId: string,
      payload: { id: string; name: string },
    ): Promise<OrganizationRow> {
      const result = await db.query<OrganizationRow>(
        `
        INSERT INTO organizations (id, tenant_id, name)
        VALUES ($1, $2, $3)
        ON CONFLICT (tenant_id, id) DO UPDATE
        SET name = EXCLUDED.name
        RETURNING
          id,
          tenant_id,
          name,
          created_at
      `,
        [payload.id, tenantId, payload.name],
      );

      return result.rows[0] as OrganizationRow;
    },

    async grantOrganizationRole(
      tenantId: string,
      payload: {
        userId: string;
        role: "org_admin" | "house_manager" | "resident_user";
        organizationId: string;
        grantedByUserId: string;
      },
    ): Promise<void> {
      await db.query(
        `
        INSERT INTO user_roles (
          tenant_id,
          user_id,
          role,
          organization_id,
          court_program_id,
          is_active,
          granted_by_user_id
        )
        VALUES ($1, $2, $3, $4, NULL, TRUE, $5)
        ON CONFLICT DO NOTHING
      `,
        [tenantId, payload.userId, payload.role, payload.organizationId, payload.grantedByUserId],
      );
    },

    async listHouses(
      tenantId: string,
      filters: { organizationId?: string } = {},
    ): Promise<HouseRow[]> {
      const result = await db.query<HouseRow>(
        `
        SELECT
          id,
          tenant_id,
          organization_id,
          name,
          created_at
        FROM houses
        WHERE tenant_id = $1
        ORDER BY name ASC, created_at ASC
      `,
        [tenantId],
      );

      return result.rows.filter((row) =>
        filters.organizationId ? row.organization_id === filters.organizationId : true,
      );
    },

    async upsertParticipantProfile(
      tenantId: string,
      userId: string,
      payload: {
        participantType: ParticipantType;
        displayName?: string | null;
        organizationId?: string | null;
        houseId?: string | null;
        courtProgramId?: string | null;
        status: ParticipantProfileStatus;
      },
    ): Promise<ParticipantProfileRow | null> {
      const result = await db.query<ParticipantProfileRow>(
        `
        INSERT INTO participant_profiles (
          user_id,
          tenant_id,
          display_name,
          participant_type,
          organization_id,
          house_id,
          court_program_id,
          status
        )
        VALUES (
          $1,
          $2,
          COALESCE($3, (SELECT display_name FROM users WHERE tenant_id = $2 AND id = $1 LIMIT 1)),
          $4,
          $5,
          $6,
          $7,
          $8
        )
        ON CONFLICT (user_id)
        DO UPDATE SET
          display_name = EXCLUDED.display_name,
          participant_type = EXCLUDED.participant_type,
          organization_id = EXCLUDED.organization_id,
          house_id = EXCLUDED.house_id,
          court_program_id = EXCLUDED.court_program_id,
          status = EXCLUDED.status,
          updated_at = NOW()
        RETURNING
          user_id,
          tenant_id,
          display_name,
          participant_type,
          organization_id,
          house_id,
          court_program_id,
          status,
          created_at,
          updated_at
      `,
        [
          userId,
          tenantId,
          payload.displayName ?? null,
          payload.participantType,
          payload.organizationId ?? null,
          payload.houseId ?? null,
          payload.courtProgramId ?? null,
          payload.status,
        ],
      );

      const row = result.rows[0] ?? null;
      if (!row) {
        return null;
      }

      await syncResidentHouseMembership(tenantId, userId, payload);

      const participantType = toParticipantType(String(row.participant_type));
      const status = toParticipantProfileStatus(String(row.status));
      if (!participantType || !status) {
        return null;
      }

      return {
        ...row,
        participant_type: participantType,
        status,
      };
    },

    async getParticipantProfile(
      tenantId: string,
      userId: string,
    ): Promise<ParticipantProfileRow | null> {
      const result = await db.query<ParticipantProfileRow>(
        `
        SELECT
          user_id,
          tenant_id,
          display_name,
          participant_type,
          organization_id,
          house_id,
          court_program_id,
          status,
          created_at,
          updated_at
        FROM participant_profiles
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
        [tenantId, userId],
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const participantType = toParticipantType(String(row.participant_type));
      const status = toParticipantProfileStatus(String(row.status));
      if (!participantType || !status) {
        return null;
      }

      return {
        ...row,
        participant_type: participantType,
        status,
      };
    },

    async listParticipantProfiles(tenantId: string): Promise<ParticipantProfileRow[]> {
      const result = await db.query<ParticipantProfileRow>(
        `
        SELECT
          user_id,
          tenant_id,
          display_name,
          participant_type,
          organization_id,
          house_id,
          court_program_id,
          status,
          created_at,
          updated_at
        FROM participant_profiles
        WHERE tenant_id = $1
        ORDER BY updated_at DESC
      `,
        [tenantId],
      );

      return result.rows
        .map((row) => {
          const participantType = toParticipantType(String(row.participant_type));
          const status = toParticipantProfileStatus(String(row.status));
          if (!participantType || !status) {
            return null;
          }
          return {
            ...row,
            participant_type: participantType,
            status,
          };
        })
        .filter((row): row is ParticipantProfileRow => row !== null);
    },

    async listResidentHouseMemberships(
      tenantId: string,
      filters: {
        residentUserId?: string;
        organizationId?: string;
        houseId?: string;
        status?: SoberHouseEntityStatus;
      } = {},
    ): Promise<ResidentHouseMembershipRow[]> {
      return (await listResidentHouseMembershipRows(tenantId)).filter((membership) => {
        if (filters.residentUserId && membership.resident_user_id !== filters.residentUserId) {
          return false;
        }
        if (filters.organizationId && membership.organization_id !== filters.organizationId) {
          return false;
        }
        if (filters.houseId && membership.house_id !== filters.houseId) {
          return false;
        }
        if (filters.status && membership.status !== filters.status) {
          return false;
        }
        return true;
      });
    },

    async listResidentHouseObligations(
      tenantId: string,
      filters: {
        residentUserId?: string;
        organizationId?: string;
        houseId?: string;
        status?: SoberHouseEntityStatus;
        obligationType?: SoberHouseObligationType;
      } = {},
    ): Promise<ResidentHouseObligationRecord[]> {
      return listResidentHouseObligationRecordsForTenant(tenantId, filters);
    },

    async recordSoberHouseCompletion(
      tenantId: string,
      residentUserId: string,
      payload: RecordSoberHouseCompletionInput,
    ): Promise<RecordSoberHouseCompletionResult | null> {
      const obligation =
        (
          await listResidentHouseObligationRecordsForTenant(tenantId, {
            residentUserId,
          })
        ).find((entry) => entry.obligation.id === payload.obligationId)?.obligation ?? null;

      if (!obligation || obligation.resident_user_id !== residentUserId) {
        return null;
      }

      const submittedAtIso =
        payload.submittedAt?.toISOString() ??
        (shouldCreateSoberHouseProofReview(obligation, payload.proofMetadata)
          ? new Date().toISOString()
          : null);

      const existingCompletion =
        (
          await listResidentHouseObligationRecordsForTenant(tenantId, {
            residentUserId,
          })
        ).find((entry) => entry.obligation.id === obligation.id)?.completion ?? null;

      const completionResult = await db.query<SoberHouseCompletionRecordRow>(
        `
        INSERT INTO sober_house_completion_records (
          id,
          tenant_id,
          organization_id,
          house_id,
          resident_user_id,
          obligation_id,
          completion_status,
          completed_at,
          proof_metadata_json,
          submitted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
        ON CONFLICT (tenant_id, obligation_id)
        DO UPDATE SET
          completion_status = EXCLUDED.completion_status,
          completed_at = EXCLUDED.completed_at,
          proof_metadata_json = EXCLUDED.proof_metadata_json,
          submitted_at = EXCLUDED.submitted_at,
          updated_at = NOW()
        RETURNING
          id,
          tenant_id,
          organization_id,
          house_id,
          resident_user_id,
          obligation_id,
          completion_status,
          completed_at,
          proof_metadata_json,
          submitted_at,
          created_at,
          updated_at
      `,
        [
          existingCompletion?.id ?? randomUUID(),
          tenantId,
          obligation.organization_id,
          obligation.house_id,
          residentUserId,
          obligation.id,
          payload.completionStatus,
          payload.completedAt?.toISOString() ?? null,
          JSON.stringify(payload.proofMetadata ?? null),
          submittedAtIso,
        ],
      );

      const completionRow = completionResult.rows[0] ?? null;
      const completionStatus = completionRow
        ? toSoberHouseCompletionStatus(String(completionRow.completion_status))
        : null;
      const completion =
        completionRow && completionStatus
          ? {
              ...completionRow,
              completion_status: completionStatus,
            }
          : null;

      if (!completion) {
        return null;
      }

      if (!shouldCreateSoberHouseProofReview(obligation, payload.proofMetadata)) {
        return {
          completion,
          proofReview: null,
        };
      }

      const existingReview =
        (
          await listPendingSoberHouseProofReviewRecordsForTenant(tenantId, {
            residentUserId,
            organizationId: obligation.organization_id,
            houseId: obligation.house_id,
          })
        ).find((entry) => entry.completion.id === completion.id)?.review ??
        (await listSoberHouseProofReviewRows(tenantId)).find(
          (review) => review.completion_record_id === completion.id,
        ) ??
        null;

      const reviewResult = await db.query<SoberHouseProofReviewRow>(
        `
        INSERT INTO sober_house_proof_reviews (
          id,
          tenant_id,
          organization_id,
          house_id,
          resident_user_id,
          completion_record_id,
          review_outcome,
          reviewer_user_id,
          reviewed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', NULL, NULL)
        ON CONFLICT (completion_record_id)
        DO UPDATE SET
          review_outcome = 'PENDING',
          reviewer_user_id = NULL,
          reviewed_at = NULL,
          updated_at = NOW()
        RETURNING
          id,
          tenant_id,
          organization_id,
          house_id,
          resident_user_id,
          completion_record_id,
          review_outcome,
          reviewer_user_id,
          reviewed_at,
          created_at,
          updated_at
      `,
        [
          existingReview?.id ?? randomUUID(),
          tenantId,
          obligation.organization_id,
          obligation.house_id,
          residentUserId,
          completion.id,
        ],
      );

      const reviewRow = reviewResult.rows[0] ?? null;
      const reviewOutcome = reviewRow
        ? toSoberHouseProofReviewStatus(String(reviewRow.review_outcome))
        : null;
      const proofReview =
        reviewRow && reviewOutcome
          ? {
              ...reviewRow,
              review_outcome: reviewOutcome,
            }
          : null;

      return {
        completion,
        proofReview,
      };
    },

    async listPendingSoberHouseProofReviews(
      tenantId: string,
      filters: {
        residentUserId?: string;
        organizationId?: string;
        houseId?: string;
      } = {},
    ): Promise<PendingSoberHouseProofReviewRecord[]> {
      return listPendingSoberHouseProofReviewRecordsForTenant(tenantId, filters);
    },

    async updateSoberHouseProofReviewOutcome(
      tenantId: string,
      reviewId: string,
      payload: UpdateSoberHouseProofReviewInput,
    ): Promise<SoberHouseProofReviewRow | null> {
      const result = await db.query<SoberHouseProofReviewRow>(
        `
        UPDATE sober_house_proof_reviews
        SET review_outcome = $1,
            reviewer_user_id = $2,
            reviewed_at = $3,
            updated_at = NOW()
        WHERE tenant_id = $4
          AND id = $5
        RETURNING
          id,
          tenant_id,
          organization_id,
          house_id,
          resident_user_id,
          completion_record_id,
          review_outcome,
          reviewer_user_id,
          reviewed_at,
          created_at,
          updated_at
      `,
        [
          payload.reviewOutcome,
          payload.reviewerUserId,
          (payload.reviewedAt ?? new Date()).toISOString(),
          tenantId,
          reviewId,
        ],
      );

      const row = result.rows[0] ?? null;
      const reviewOutcome = row ? toSoberHouseProofReviewStatus(String(row.review_outcome)) : null;
      if (!row || !reviewOutcome) {
        return null;
      }

      return {
        ...row,
        review_outcome: reviewOutcome,
      };
    },

    async listSoberHouseAlertAcknowledgements(
      tenantId: string,
      filters: {
        residentUserId?: string;
        organizationId?: string;
        houseId?: string;
        status?: SoberHouseAlertAcknowledgementStatus;
      } = {},
    ): Promise<SoberHouseAlertAcknowledgementRow[]> {
      return (await listSoberHouseAlertAcknowledgementRows(tenantId)).filter((acknowledgement) => {
        if (filters.residentUserId && acknowledgement.resident_user_id !== filters.residentUserId) {
          return false;
        }
        if (filters.organizationId && acknowledgement.organization_id !== filters.organizationId) {
          return false;
        }
        if (filters.houseId && acknowledgement.house_id !== filters.houseId) {
          return false;
        }
        if (filters.status && acknowledgement.status !== filters.status) {
          return false;
        }
        return true;
      });
    },

    async acknowledgeSoberHouseAlert(
      tenantId: string,
      residentUserId: string,
      alertId: string,
      payload: AcknowledgeSoberHouseAlertInput,
    ): Promise<SoberHouseAlertAcknowledgementRow> {
      const existing =
        (await listSoberHouseAlertAcknowledgementRows(tenantId)).find(
          (acknowledgement) =>
            acknowledgement.resident_user_id === residentUserId &&
            acknowledgement.alert_id === alertId,
        ) ?? null;

      const result = await db.query<SoberHouseAlertAcknowledgementRow>(
        `
        INSERT INTO sober_house_alert_acknowledgements (
          id,
          tenant_id,
          organization_id,
          house_id,
          resident_user_id,
          alert_id,
          status,
          acknowledged_at,
          note
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'ACKNOWLEDGED', $7, $8)
        ON CONFLICT (tenant_id, resident_user_id, alert_id)
        DO UPDATE SET
          organization_id = EXCLUDED.organization_id,
          house_id = EXCLUDED.house_id,
          status = 'ACKNOWLEDGED',
          acknowledged_at = EXCLUDED.acknowledged_at,
          note = EXCLUDED.note,
          updated_at = NOW()
        RETURNING
          id,
          tenant_id,
          organization_id,
          house_id,
          resident_user_id,
          alert_id,
          status,
          acknowledged_at,
          note,
          created_at,
          updated_at
      `,
        [
          existing?.id ?? randomUUID(),
          tenantId,
          payload.organizationId,
          payload.houseId ?? null,
          residentUserId,
          alertId,
          (payload.acknowledgedAt ?? new Date()).toISOString(),
          payload.note ?? null,
        ],
      );

      const row = result.rows[0];
      const status = row ? toSoberHouseAlertAcknowledgementStatus(String(row.status)) : null;
      if (!row || !status) {
        throw new Error("Failed to acknowledge sober-house alert");
      }

      return {
        ...row,
        status,
      };
    },

    async syncParticipantObligations(
      tenantId: string,
      userId: string,
      source: string,
      obligations: ObligationSnapshotInput[],
      createdByUserId: string,
      createdByRole: string,
    ): Promise<ObligationRow[]> {
      const existingResult = await db.query<ObligationRow>(
        `
        SELECT
          id,
          tenant_id,
          user_id,
          obligation_type,
          source_track,
          title,
          description,
          organization_id,
          house_id,
          court_program_id,
          due_at,
          recurrence_json,
          priority,
          requires_proof,
          requires_signature,
          proof_type,
          verification_status,
          status,
          sync_source,
          sync_key,
          created_by_user_id,
          created_by_role,
          created_at,
          updated_at
        FROM obligations
        WHERE tenant_id = $1
          AND user_id = $2
          AND sync_source = $3
      `,
        [tenantId, userId, source],
      );
      const existingByKey = new Map(
        existingResult.rows
          .filter((row) => row.sync_key)
          .map((row) => [String(row.sync_key), row] as const),
      );
      const incomingKeys = new Set(obligations.map((obligation) => obligation.syncKey));
      const nextRows: ObligationRow[] = [];

      for (const obligation of obligations) {
        const existing = existingByKey.get(obligation.syncKey);
        const result = await db.query<ObligationRow>(
          `
          INSERT INTO obligations (
            id,
            tenant_id,
            user_id,
            obligation_type,
            source_track,
            title,
            description,
            organization_id,
            house_id,
            court_program_id,
            due_at,
            recurrence_json,
            priority,
            requires_proof,
            requires_signature,
            proof_type,
            verification_status,
            status,
            sync_source,
            sync_key,
            created_by_user_id,
            created_by_role
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12::jsonb,
            $13,
            $14,
            $15,
            $16,
            $17,
            $18,
            $19,
            $20,
            $21,
            $22
          )
          ON CONFLICT (tenant_id, user_id, sync_source, sync_key)
          DO UPDATE SET
            obligation_type = EXCLUDED.obligation_type,
            source_track = EXCLUDED.source_track,
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            organization_id = EXCLUDED.organization_id,
            house_id = EXCLUDED.house_id,
            court_program_id = EXCLUDED.court_program_id,
            due_at = EXCLUDED.due_at,
            recurrence_json = EXCLUDED.recurrence_json,
            priority = EXCLUDED.priority,
            requires_proof = EXCLUDED.requires_proof,
            requires_signature = EXCLUDED.requires_signature,
            proof_type = EXCLUDED.proof_type,
            verification_status = EXCLUDED.verification_status,
            status = EXCLUDED.status,
            created_by_user_id = EXCLUDED.created_by_user_id,
            created_by_role = EXCLUDED.created_by_role,
            updated_at = NOW()
          RETURNING
            id,
            tenant_id,
            user_id,
            obligation_type,
            source_track,
            title,
            description,
            organization_id,
            house_id,
            court_program_id,
            due_at,
            recurrence_json,
            priority,
            requires_proof,
            requires_signature,
            proof_type,
            verification_status,
            status,
            sync_source,
            sync_key,
            created_by_user_id,
            created_by_role,
            created_at,
            updated_at
        `,
          [
            existing?.id ?? randomUUID(),
            tenantId,
            userId,
            obligation.obligationType,
            obligation.sourceTrack,
            obligation.title,
            obligation.description ?? null,
            obligation.organizationId ?? null,
            obligation.houseId ?? null,
            obligation.courtProgramId ?? null,
            obligation.dueAt ?? null,
            toJsonParam(obligation.recurrence ?? null),
            obligation.priority ?? null,
            obligation.requiresProof ?? false,
            obligation.requiresSignature ?? false,
            obligation.proofType ?? null,
            obligation.verificationStatus ??
              (obligation.requiresProof || obligation.requiresSignature
                ? "PENDING"
                : "NOT_REQUIRED"),
            obligation.status,
            source,
            obligation.syncKey,
            createdByUserId,
            createdByRole,
          ],
        );
        if (result.rows[0]) {
          nextRows.push(result.rows[0]);
        }
      }

      for (const existing of existingResult.rows) {
        if (!existing.sync_key || incomingKeys.has(existing.sync_key)) {
          continue;
        }
        await db.query(
          `
          UPDATE obligations
          SET status = 'CANCELED',
              updated_at = NOW()
          WHERE tenant_id = $1
            AND user_id = $2
            AND id = $3
        `,
          [tenantId, userId, existing.id],
        );
      }

      return this.listObligations(tenantId, { userId, syncSource: source });
    },

    async listObligations(
      tenantId: string,
      filters: {
        userId?: string;
        status?: ObligationStatus;
        organizationId?: string;
        houseId?: string;
        courtProgramId?: string;
        syncSource?: string;
        requiresProof?: boolean;
        proofType?: ProofType;
        verificationStatus?: VerificationStatus;
      } = {},
    ): Promise<ObligationRow[]> {
      const result = await db.query<ObligationRow>(
        `
        SELECT
          id,
          tenant_id,
          user_id,
          obligation_type,
          source_track,
          title,
          description,
          organization_id,
          house_id,
          court_program_id,
          due_at,
          recurrence_json,
          priority,
          requires_proof,
          requires_signature,
          proof_type,
          verification_status,
          status,
          sync_source,
          sync_key,
          created_by_user_id,
          created_by_role,
          created_at,
          updated_at
        FROM obligations
        WHERE tenant_id = $1
        ORDER BY COALESCE(due_at, updated_at) ASC, created_at DESC
      `,
        [tenantId],
      );

      return result.rows
        .map((row) => {
          const obligationType = toObligationType(String(row.obligation_type));
          const sourceTrack = toObligationSourceTrack(String(row.source_track));
          const status = toObligationStatus(String(row.status));
          const priority = toObligationPriority(row.priority);
          const proofType = toProofType(row.proof_type);
          const verificationStatus = toVerificationStatus(row.verification_status);
          if (!obligationType || !sourceTrack || !status) {
            return null;
          }

          return {
            ...row,
            obligation_type: obligationType,
            source_track: sourceTrack,
            priority,
            proof_type: proofType,
            verification_status: verificationStatus ?? "NOT_REQUIRED",
            status,
          };
        })
        .filter((row): row is ObligationRow => row !== null)
        .filter((row) => {
          if (filters.userId && row.user_id !== filters.userId) {
            return false;
          }
          if (filters.status && row.status !== filters.status) {
            return false;
          }
          if (filters.organizationId && row.organization_id !== filters.organizationId) {
            return false;
          }
          if (filters.houseId && row.house_id !== filters.houseId) {
            return false;
          }
          if (filters.courtProgramId && row.court_program_id !== filters.courtProgramId) {
            return false;
          }
          if (filters.syncSource && row.sync_source !== filters.syncSource) {
            return false;
          }
          if (
            typeof filters.requiresProof === "boolean" &&
            row.requires_proof !== filters.requiresProof
          ) {
            return false;
          }
          if (filters.proofType && row.proof_type !== filters.proofType) {
            return false;
          }
          if (
            filters.verificationStatus &&
            row.verification_status !== filters.verificationStatus
          ) {
            return false;
          }
          return true;
        });
    },

    async getObligationById(tenantId: string, obligationId: string): Promise<ObligationRow | null> {
      const obligations = await this.listObligations(tenantId);
      return obligations.find((row) => row.id === obligationId) ?? null;
    },

    async recordParticipantComplianceEvent(
      tenantId: string,
      userId: string,
      payload: ParticipantComplianceEventInput,
    ): Promise<RecordParticipantComplianceEventResult | null> {
      const profile = await this.getParticipantProfile(tenantId, userId);
      if (!profile) {
        return null;
      }

      const obligation = payload.obligationId
        ? await this.getObligationById(tenantId, payload.obligationId)
        : null;
      if (payload.obligationId && (!obligation || obligation.user_id !== userId)) {
        return null;
      }

      const existingByExternalEvent = payload.externalEventId
        ? ((
            await db.query<ComplianceEventRow>(
              `
              SELECT
                id,
                tenant_id,
                user_id,
                obligation_id,
                organization_id,
                house_id,
                court_program_id,
                event_type,
                event_status,
                occurred_at,
                metadata_json,
                proof_uri,
                proof_metadata_json,
                signature_present,
                proof_type,
                verification_status,
                verified_by_role,
                verified_at,
                created_by_role,
                source_track,
                external_event_id,
                created_at
              FROM compliance_events
              WHERE tenant_id = $1
                AND user_id = $2
                AND external_event_id = $3
              LIMIT 1
            `,
              [tenantId, userId, payload.externalEventId],
            )
          ).rows[0] ?? null)
        : null;

      const eventResult = await db.query<ComplianceEventRow>(
        `
        INSERT INTO compliance_events (
          id,
          tenant_id,
          user_id,
          obligation_id,
          organization_id,
          house_id,
          court_program_id,
          event_type,
          event_status,
          occurred_at,
          metadata_json,
          proof_uri,
          proof_metadata_json,
          signature_present,
          proof_type,
          verification_status,
          verified_by_role,
          verified_at,
          created_by_role,
          source_track,
          external_event_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11::jsonb,
          $12,
          $13::jsonb,
          $14,
          $15,
          $16,
          $17,
          $18,
          $19,
          $20,
          $21
        )
        ON CONFLICT (tenant_id, user_id, external_event_id)
        DO UPDATE SET
          event_status = EXCLUDED.event_status,
          occurred_at = EXCLUDED.occurred_at,
          metadata_json = EXCLUDED.metadata_json,
          proof_uri = EXCLUDED.proof_uri,
          proof_metadata_json = EXCLUDED.proof_metadata_json,
          signature_present = EXCLUDED.signature_present,
          proof_type = EXCLUDED.proof_type,
          verification_status = EXCLUDED.verification_status,
          verified_by_role = EXCLUDED.verified_by_role,
          verified_at = EXCLUDED.verified_at,
          created_by_role = EXCLUDED.created_by_role,
          source_track = EXCLUDED.source_track
        RETURNING
          id,
          tenant_id,
          user_id,
          obligation_id,
          organization_id,
          house_id,
          court_program_id,
          event_type,
          event_status,
          occurred_at,
          metadata_json,
          proof_uri,
          proof_metadata_json,
          signature_present,
          proof_type,
          verification_status,
          verified_by_role,
          verified_at,
          created_by_role,
          source_track,
          external_event_id,
          created_at
      `,
        [
          existingByExternalEvent?.id ?? randomUUID(),
          tenantId,
          userId,
          payload.obligationId ?? null,
          obligation?.organization_id ?? profile.organization_id ?? null,
          obligation?.house_id ?? profile.house_id ?? null,
          obligation?.court_program_id ?? profile.court_program_id ?? null,
          payload.eventType,
          payload.eventStatus,
          payload.occurredAt.toISOString(),
          toJsonParam(payload.metadata ?? {}),
          payload.proofUri ?? null,
          toJsonParam(payload.proofMetadata ?? null),
          payload.signaturePresent ?? false,
          payload.proofType ?? obligation?.proof_type ?? null,
          payload.verificationStatus ??
            (payload.proofUri || payload.signaturePresent
              ? "SUBMITTED"
              : (obligation?.verification_status ?? null)),
          payload.verifiedByRole ?? null,
          payload.verifiedAt?.toISOString() ?? null,
          payload.createdByRole ?? null,
          payload.sourceTrack ?? obligation?.source_track ?? null,
          payload.externalEventId ?? null,
        ],
      );

      const event = eventResult.rows[0];
      if (!event) {
        return null;
      }

      let violation: ViolationRow | null = null;
      if (
        shouldCreateViolationFromEvent({
          eventType: payload.eventType,
          eventStatus: payload.eventStatus,
          proofUri: payload.proofUri,
          signaturePresent: payload.signaturePresent,
          proofType: payload.proofType ?? obligation?.proof_type ?? null,
          verificationStatus: payload.verificationStatus ?? null,
        })
      ) {
        const violationType =
          resolveViolationTypeForEvent({
            eventType: payload.eventType,
            proofUri: payload.proofUri,
            signaturePresent: payload.signaturePresent,
            proofType: payload.proofType ?? obligation?.proof_type ?? null,
            verificationStatus: payload.verificationStatus ?? null,
          }) ?? "other";
        const violationResult = await db.query<ViolationRow>(
          `
          INSERT INTO violations (
            id,
            tenant_id,
            user_id,
            obligation_id,
            organization_id,
            house_id,
            court_program_id,
            violation_type,
            severity,
            status,
            detected_at,
            notes,
            detected_from_event_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'OPEN', $10, $11, $12)
          ON CONFLICT (detected_from_event_id)
          DO UPDATE SET
            notes = EXCLUDED.notes,
            updated_at = NOW()
          RETURNING
            id,
            tenant_id,
            user_id,
            obligation_id,
            organization_id,
            house_id,
            court_program_id,
            violation_type,
            severity,
            status,
            detected_at,
            resolved_at,
            notes,
            detected_from_event_id,
            created_at,
            updated_at
        `,
          [
            randomUUID(),
            tenantId,
            userId,
            payload.obligationId ?? null,
            obligation?.organization_id ?? profile.organization_id ?? null,
            obligation?.house_id ?? profile.house_id ?? null,
            obligation?.court_program_id ?? profile.court_program_id ?? null,
            violationType,
            violationSeverityFromEvent(payload.eventType),
            payload.occurredAt.toISOString(),
            obligation?.title ?? payload.eventType,
            event.id,
          ],
        );
        violation = violationResult.rows[0] ?? null;
      }

      return { event, violation };
    },

    async listComplianceEvents(
      tenantId: string,
      filters: {
        userId?: string;
        obligationId?: string;
        organizationId?: string;
        houseId?: string;
        courtProgramId?: string;
        verificationStatus?: VerificationStatus;
        proofType?: ProofType;
      } = {},
    ): Promise<ComplianceEventRow[]> {
      const result = await db.query<ComplianceEventRow>(
        `
        SELECT
          id,
          tenant_id,
          user_id,
          obligation_id,
          organization_id,
          house_id,
          court_program_id,
          event_type,
          event_status,
          occurred_at,
          metadata_json,
          proof_uri,
          proof_metadata_json,
          signature_present,
          proof_type,
          verification_status,
          verified_by_role,
          verified_at,
          created_by_role,
          source_track,
          external_event_id,
          created_at
        FROM compliance_events
        WHERE tenant_id = $1
        ORDER BY occurred_at DESC, created_at DESC
      `,
        [tenantId],
      );

      return result.rows
        .map((row) => {
          const eventType = toParticipantComplianceEventType(String(row.event_type));
          const eventStatus = toParticipantComplianceEventStatus(row.event_status);
          const proofType = toProofType(row.proof_type);
          const verificationStatus = toVerificationStatus(row.verification_status);
          const sourceTrack = row.source_track
            ? toObligationSourceTrack(String(row.source_track))
            : null;
          if (!eventType) {
            return null;
          }
          return {
            ...row,
            event_type: eventType,
            event_status: eventStatus,
            proof_type: proofType,
            verification_status: verificationStatus,
            source_track: sourceTrack,
          };
        })
        .filter((row): row is ComplianceEventRow => row !== null)
        .filter((row) => {
          if (filters.userId && row.user_id !== filters.userId) {
            return false;
          }
          if (filters.obligationId && row.obligation_id !== filters.obligationId) {
            return false;
          }
          if (filters.organizationId && row.organization_id !== filters.organizationId) {
            return false;
          }
          if (filters.houseId && row.house_id !== filters.houseId) {
            return false;
          }
          if (filters.courtProgramId && row.court_program_id !== filters.courtProgramId) {
            return false;
          }
          if (
            filters.verificationStatus &&
            row.verification_status !== filters.verificationStatus
          ) {
            return false;
          }
          if (filters.proofType && row.proof_type !== filters.proofType) {
            return false;
          }
          return true;
        });
    },

    async listViolations(
      tenantId: string,
      filters: {
        userId?: string;
        obligationId?: string;
        organizationId?: string;
        houseId?: string;
        courtProgramId?: string;
        status?: ViolationStatus;
        violationType?: ViolationType;
        severity?: ViolationSeverity;
      } = {},
    ): Promise<ViolationRow[]> {
      const result = await db.query<ViolationRow>(
        `
        SELECT
          id,
          tenant_id,
          user_id,
          obligation_id,
          organization_id,
          house_id,
          court_program_id,
          violation_type,
          severity,
          status,
          detected_at,
          resolved_at,
          notes,
          detected_from_event_id,
          created_at,
          updated_at
        FROM violations
        WHERE tenant_id = $1
        ORDER BY detected_at DESC, created_at DESC
      `,
        [tenantId],
      );

      return result.rows
        .map((row) => {
          const violationType = toViolationType(String(row.violation_type));
          const severity = toViolationSeverity(String(row.severity));
          const status = toViolationStatus(String(row.status));
          if (!violationType || !severity || !status) {
            return null;
          }
          return {
            ...row,
            violation_type: violationType,
            severity,
            status,
          };
        })
        .filter((row): row is ViolationRow => row !== null)
        .filter((row) => {
          if (filters.userId && row.user_id !== filters.userId) {
            return false;
          }
          if (filters.obligationId && row.obligation_id !== filters.obligationId) {
            return false;
          }
          if (filters.organizationId && row.organization_id !== filters.organizationId) {
            return false;
          }
          if (filters.houseId && row.house_id !== filters.houseId) {
            return false;
          }
          if (filters.courtProgramId && row.court_program_id !== filters.courtProgramId) {
            return false;
          }
          if (filters.status && row.status !== filters.status) {
            return false;
          }
          if (filters.violationType && row.violation_type !== filters.violationType) {
            return false;
          }
          if (filters.severity && row.severity !== filters.severity) {
            return false;
          }
          return true;
        });
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

    async getTenantConfigValue(tenantId: string, configKey: string): Promise<unknown | null> {
      const result = await db.query<{ value_json: unknown }>(
        `
        SELECT value_json
        FROM tenant_config
        WHERE tenant_id = $1
          AND config_key = $2
        LIMIT 1
      `,
        [tenantId, configKey],
      );

      return result.rows[0]?.value_json ?? null;
    },

    async getSponsorConfig(tenantId: string, userId: string): Promise<SponsorConfigRow | null> {
      const result = await db.query<SponsorConfigRow>(
        `
        SELECT
          id,
          tenant_id,
          user_id,
          sponsor_name,
          sponsor_phone_e164,
          call_time_local_hhmm,
          repeat_rule,
          repeat_unit,
          repeat_interval,
          repeat_days,
          active,
          created_at,
          updated_at,
          updated_by_user_id
        FROM sponsor_config
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
        [tenantId, userId],
      );

      return result.rows[0] ?? null;
    },

    async upsertSponsorConfig(
      tenantId: string,
      userId: string,
      payload: {
        sponsorName: string;
        sponsorPhoneE164: string;
        callTimeLocalHhmm: string;
        repeatUnit: SponsorRepeatUnit;
        repeatInterval: number;
        repeatDays: SponsorRepeatDay[];
        active: boolean;
      },
      updatedByUserId: string,
    ): Promise<SponsorConfigRow | null> {
      const user = await db.query<{ id: string }>(
        `
        SELECT id
        FROM users
        WHERE tenant_id = $1
          AND id = $2
        LIMIT 1
      `,
        [tenantId, userId],
      );
      if (!user.rows[0]) {
        return null;
      }

      const result = await db.query<SponsorConfigRow>(
        `
        INSERT INTO sponsor_config (
          id,
          tenant_id,
          user_id,
          sponsor_name,
          sponsor_phone_e164,
          call_time_local_hhmm,
          repeat_rule,
          repeat_unit,
          repeat_interval,
          repeat_days,
          active,
          updated_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (tenant_id, user_id)
        DO UPDATE SET
          sponsor_name = EXCLUDED.sponsor_name,
          sponsor_phone_e164 = EXCLUDED.sponsor_phone_e164,
          call_time_local_hhmm = EXCLUDED.call_time_local_hhmm,
          repeat_rule = EXCLUDED.repeat_rule,
          repeat_unit = EXCLUDED.repeat_unit,
          repeat_interval = EXCLUDED.repeat_interval,
          repeat_days = EXCLUDED.repeat_days,
          active = EXCLUDED.active,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = NOW()
        RETURNING
          id,
          tenant_id,
          user_id,
          sponsor_name,
          sponsor_phone_e164,
          call_time_local_hhmm,
          repeat_rule,
          repeat_unit,
          repeat_interval,
          repeat_days,
          active,
          created_at,
          updated_at,
          updated_by_user_id
      `,
        [
          randomUUID(),
          tenantId,
          userId,
          payload.sponsorName,
          payload.sponsorPhoneE164,
          payload.callTimeLocalHhmm,
          payload.repeatUnit === SponsorRepeatUnit.MONTHLY
            ? SponsorRepeatRule.MONTHLY
            : payload.repeatInterval === 2
              ? SponsorRepeatRule.BIWEEKLY
              : SponsorRepeatRule.WEEKLY,
          payload.repeatUnit,
          payload.repeatInterval,
          payload.repeatDays,
          payload.active,
          updatedByUserId,
        ],
      );

      return result.rows[0] ?? null;
    },

    async getHomeGroupBirthdayMembership(
      tenantId: string,
      userId: string,
    ): Promise<HomeGroupBirthdayMembershipRow | null> {
      const result = await db.query<HomeGroupBirthdayMembershipRow>(
        `
        SELECT
          id,
          tenant_id,
          user_id,
          home_group_active,
          home_group_key,
          home_group_name,
          birthday_opt_in,
          first_name,
          last_name,
          sobriety_date,
          created_at,
          updated_at,
          updated_by_user_id
        FROM home_group_birthday_memberships
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
        [tenantId, userId],
      );

      return result.rows[0] ?? null;
    },

    async upsertHomeGroupBirthdayMembership(
      tenantId: string,
      userId: string,
      payload: {
        homeGroupActive: boolean;
        homeGroupKey: string | null;
        homeGroupName: string | null;
        birthdaysEnabled: boolean;
        firstName: string | null;
        lastName: string | null;
        sobrietyDateIso: string | null;
      },
      updatedByUserId: string,
    ): Promise<HomeGroupBirthdayMembershipRow | null> {
      const user = await db.query<{ id: string }>(
        `
        SELECT id
        FROM users
        WHERE tenant_id = $1
          AND id = $2
        LIMIT 1
      `,
        [tenantId, userId],
      );
      if (!user.rows[0]) {
        return null;
      }

      const result = await db.query<HomeGroupBirthdayMembershipRow>(
        `
        INSERT INTO home_group_birthday_memberships (
          id,
          tenant_id,
          user_id,
          home_group_active,
          home_group_key,
          home_group_name,
          birthday_opt_in,
          first_name,
          last_name,
          sobriety_date,
          updated_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (tenant_id, user_id)
        DO UPDATE SET
          home_group_active = EXCLUDED.home_group_active,
          home_group_key = EXCLUDED.home_group_key,
          home_group_name = EXCLUDED.home_group_name,
          birthday_opt_in = EXCLUDED.birthday_opt_in,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          sobriety_date = EXCLUDED.sobriety_date,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = NOW()
        RETURNING
          id,
          tenant_id,
          user_id,
          home_group_active,
          home_group_key,
          home_group_name,
          birthday_opt_in,
          first_name,
          last_name,
          sobriety_date,
          created_at,
          updated_at,
          updated_by_user_id
      `,
        [
          randomUUID(),
          tenantId,
          userId,
          payload.homeGroupActive,
          payload.homeGroupActive ? payload.homeGroupKey : null,
          payload.homeGroupActive ? payload.homeGroupName : null,
          payload.homeGroupActive && payload.birthdaysEnabled,
          payload.homeGroupActive ? payload.firstName : payload.firstName,
          payload.homeGroupActive ? payload.lastName : payload.lastName,
          payload.homeGroupActive ? payload.sobrietyDateIso : payload.sobrietyDateIso,
          updatedByUserId,
        ],
      );

      return result.rows[0] ?? null;
    },

    async listHomeGroupBirthdayAnnouncements(
      tenantId: string,
      userId: string,
      todayIso: string,
    ): Promise<
      Array<{
        dedupeToken: string;
        displayName: string;
        anniversaryYears: number;
      }>
    > {
      const membership = await db.query<{
        home_group_active: boolean;
        home_group_key: string | null;
      }>(
        `
        SELECT home_group_active, home_group_key
        FROM home_group_birthday_memberships
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
        [tenantId, userId],
      );
      const viewer = membership.rows[0];
      if (!viewer?.home_group_active || !viewer.home_group_key) {
        return [];
      }

      const result = await db.query<HomeGroupBirthdayAnnouncementRow>(
        `
        SELECT id, first_name, last_name, sobriety_date
        FROM home_group_birthday_memberships
        WHERE tenant_id = $1
          AND home_group_active = TRUE
          AND birthday_opt_in = TRUE
          AND home_group_key = $2
          AND user_id <> $3
          AND first_name IS NOT NULL
          AND sobriety_date IS NOT NULL
      `,
        [tenantId, viewer.home_group_key, userId],
      );

      return result.rows
        .map((row) => {
          const anniversaryYears = sobrietyBirthdayYearsForDate(row.sobriety_date, todayIso);
          if (!anniversaryYears) {
            return null;
          }
          const displayName = [row.first_name.trim(), row.last_name?.trim() ?? ""]
            .filter((part) => part.length > 0)
            .join(" ");
          if (!displayName) {
            return null;
          }
          return {
            dedupeToken: createHash("sha256")
              .update(`${tenantId}|${userId}|${todayIso}|${row.id}`)
              .digest("hex")
              .slice(0, 16),
            displayName,
            anniversaryYears,
          };
        })
        .filter(
          (
            row,
          ): row is {
            dedupeToken: string;
            displayName: string;
            anniversaryYears: number;
          } => row !== null,
        );
    },

    async updateUserSupervision(
      tenantId: string,
      userId: string,
      enabled: boolean,
      endDate: Date | null,
    ): Promise<UserSupervisionRow | null> {
      const result = await db.query<UserSupervisionRow>(
        `
        UPDATE users
        SET supervision_enabled = $1,
            supervision_end_date = $2
        WHERE tenant_id = $3
          AND id = $4
        RETURNING
          id,
          tenant_id,
          supervision_enabled,
          supervision_end_date
      `,
        [enabled, endDate?.toISOString() ?? null, tenantId, userId],
      );

      return result.rows[0] ?? null;
    },

    async upsertLastKnownLocation(
      tenantId: string,
      userId: string,
      payload: {
        lat: number;
        lng: number;
        accuracyM?: number;
        recordedAt: Date;
        source?: string;
      },
    ): Promise<LastKnownLocationRow | null> {
      const user = await db.query<{ id: string }>(
        `
        SELECT id
        FROM users
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1
      `,
        [tenantId, userId],
      );
      if (!user.rows[0]) {
        return null;
      }

      const result = await db.query<LastKnownLocationRow>(
        `
        INSERT INTO last_known_locations (
          tenant_id,
          user_id,
          lat,
          lng,
          accuracy_m,
          recorded_at,
          source
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, user_id)
        DO UPDATE SET
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          accuracy_m = EXCLUDED.accuracy_m,
          recorded_at = EXCLUDED.recorded_at,
          source = EXCLUDED.source
        RETURNING
          tenant_id,
          user_id,
          lat,
          lng,
          accuracy_m,
          recorded_at,
          source
      `,
        [
          tenantId,
          userId,
          payload.lat,
          payload.lng,
          payload.accuracyM ?? null,
          payload.recordedAt.toISOString(),
          payload.source ?? "MOBILE",
        ],
      );

      return result.rows[0] ?? null;
    },

    async getLastKnownLocation(
      tenantId: string,
      userId: string,
    ): Promise<LastKnownLocationRow | null> {
      const result = await db.query<LastKnownLocationRow>(
        `
        SELECT
          tenant_id,
          user_id,
          lat,
          lng,
          accuracy_m,
          recorded_at,
          source
        FROM last_known_locations
        WHERE tenant_id = $1
          AND user_id = $2
        LIMIT 1
      `,
        [tenantId, userId],
      );

      return result.rows[0] ?? null;
    },

    async listSupervisorLiveLocations(
      tenantId: string,
      supervisorUserId: string,
      includeAllUsers: boolean,
      filters: SupervisorLiveLocationFilters = {},
    ): Promise<LastKnownLocationRow[]> {
      const rows = includeAllUsers
        ? await db.query<LastKnownLocationRow>(
            `
            SELECT
              l.tenant_id,
              l.user_id,
              l.lat,
              l.lng,
              l.accuracy_m,
              l.recorded_at,
              l.source
            FROM last_known_locations l
            WHERE l.tenant_id = $1
            ORDER BY l.recorded_at DESC
          `,
            [tenantId],
          )
        : await db.query<LastKnownLocationRow>(
            `
            SELECT
              l.tenant_id,
              l.user_id,
              l.lat,
              l.lng,
              l.accuracy_m,
              l.recorded_at,
              l.source
            FROM last_known_locations l
            INNER JOIN supervisor_assignments sa
              ON sa.tenant_id = l.tenant_id
             AND sa.supervisor_user_id = $2
             AND sa.assigned_user_id = l.user_id
            WHERE l.tenant_id = $1
            ORDER BY l.recorded_at DESC
          `,
            [tenantId, supervisorUserId],
          );

      return rows.rows.filter((row) => {
        if (filters.userId && row.user_id !== filters.userId) {
          return false;
        }
        return true;
      });
    },

    async createComplianceEvent(
      tenantId: string,
      userId: string,
      eventType: ComplianceEventType,
      metadata: Record<string, unknown> | undefined,
      occurredAt: Date,
    ): Promise<ComplianceEventRow | null> {
      const user = await db.query<{ id: string }>(
        `
        SELECT id
        FROM users
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1
      `,
        [tenantId, userId],
      );
      if (!user.rows[0]) {
        return null;
      }

      const result = await db.query<ComplianceEventRow>(
        `
        INSERT INTO compliance_events (
          id,
          tenant_id,
          user_id,
          event_type,
          occurred_at,
          metadata_json,
          event_status,
          proof_uri,
          proof_metadata_json,
          signature_present,
          proof_type,
          verification_status,
          verified_by_role,
          verified_at,
          created_by_role,
          source_track,
          external_event_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::jsonb,
          NULL,
          NULL,
          NULL,
          FALSE,
          NULL,
          NULL,
          NULL,
          NULL,
          'SYSTEM',
          NULL,
          NULL
        )
        RETURNING
          id,
          tenant_id,
          user_id,
          obligation_id,
          organization_id,
          house_id,
          court_program_id,
          event_type,
          event_status,
          occurred_at,
          metadata_json,
          proof_uri,
          proof_metadata_json,
          signature_present,
          proof_type,
          verification_status,
          verified_by_role,
          verified_at,
          created_by_role,
          source_track,
          external_event_id,
          created_at
      `,
        [
          randomUUID(),
          tenantId,
          userId,
          eventType,
          occurredAt.toISOString(),
          toJsonParam(metadata),
        ],
      );

      return result.rows[0] ?? null;
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

    meetingFeeds: {
      async upsert(
        tenantId: string,
        payload: {
          name: string;
          url: string;
          entity?: string;
          entityUrl?: string;
          active?: boolean;
        },
      ): Promise<MeetingFeedRow> {
        const result = await db.query<MeetingFeedRow>(
          `
          INSERT INTO meeting_feeds (
            id,
            tenant_id,
            name,
            url,
            entity,
            entity_url,
            active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (tenant_id, url)
          DO UPDATE SET
            name = EXCLUDED.name,
            entity = EXCLUDED.entity,
            entity_url = EXCLUDED.entity_url,
            active = EXCLUDED.active,
            updated_at = NOW()
          RETURNING
            id,
            tenant_id,
            name,
            url,
            entity,
            entity_url,
            active,
            last_fetched_at,
            etag,
            last_modified,
            last_error
        `,
          [
            randomUUID(),
            tenantId,
            payload.name,
            payload.url,
            payload.entity ?? null,
            payload.entityUrl ?? null,
            payload.active ?? true,
          ],
        );

        return result.rows[0];
      },

      async listActive(tenantId: string): Promise<MeetingFeedRow[]> {
        const result = await db.query<MeetingFeedRow>(
          `
          SELECT
            id,
            tenant_id,
            name,
            url,
            entity,
            entity_url,
            active,
            last_fetched_at,
            etag,
            last_modified,
            last_error
          FROM meeting_feeds
          WHERE tenant_id = $1
            AND active = TRUE
          ORDER BY name ASC
        `,
          [tenantId],
        );
        return result.rows;
      },

      async markFetchResult(
        tenantId: string,
        feedId: string,
        payload: {
          etag?: string | null;
          lastModified?: string | null;
          lastError?: string | null;
          fetchedAt: Date;
        },
      ): Promise<void> {
        await db.query(
          `
          UPDATE meeting_feeds
          SET
            last_fetched_at = $1,
            etag = COALESCE($2, etag),
            last_modified = COALESCE($3, last_modified),
            last_error = $4,
            updated_at = NOW()
          WHERE tenant_id = $5
            AND id = $6
        `,
          [
            payload.fetchedAt.toISOString(),
            payload.etag ?? null,
            payload.lastModified ?? null,
            payload.lastError ?? null,
            tenantId,
            feedId,
          ],
        );
      },
    },

    meetingGuideMeetings: {
      async upsertForFeed(
        tenantId: string,
        sourceFeedId: string,
        meetings: NormalizedMeetingGuideMeeting[],
        now: Date,
      ): Promise<number> {
        let upserted = 0;
        for (const meeting of meetings) {
          const stableId = `${tenantId}:${sourceFeedId}:${meeting.slug}`;
          const resolvedGeoStatus =
            meeting.geoStatus ?? inferGeoStatusFromCoordinates(meeting.lat, meeting.lng);
          const resolvedGeoReason =
            meeting.geoReason ?? inferGeoReasonFromCoordinates(meeting.lat, meeting.lng);
          const resolvedGeoUpdatedAt = meeting.geoUpdatedAt ?? now.toISOString();

          try {
            await db.query(
              `
              INSERT INTO meeting_guide_meetings (
                id,
                tenant_id,
                source_feed_id,
                slug,
                name,
                day,
                time,
                end_time,
                timezone,
                formatted_address,
                address,
                city,
                state,
                postal_code,
                country,
                region,
                location,
                notes,
                types_json,
                conference_url,
                conference_phone,
                lat,
                lng,
                geo_status,
                geo_reason,
                geo_updated_at,
                updated_at_source,
                last_ingested_at
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20,
                $21, $22, $23, $24, $25, $26, $27, $28
              )
              ON CONFLICT (tenant_id, source_feed_id, slug)
              DO UPDATE SET
                name = EXCLUDED.name,
                day = EXCLUDED.day,
                time = EXCLUDED.time,
                end_time = EXCLUDED.end_time,
                timezone = EXCLUDED.timezone,
                formatted_address = EXCLUDED.formatted_address,
                address = EXCLUDED.address,
                city = EXCLUDED.city,
                state = EXCLUDED.state,
                postal_code = EXCLUDED.postal_code,
                country = EXCLUDED.country,
                region = EXCLUDED.region,
                location = EXCLUDED.location,
                notes = EXCLUDED.notes,
                types_json = EXCLUDED.types_json,
                conference_url = EXCLUDED.conference_url,
                conference_phone = EXCLUDED.conference_phone,
                lat = CASE
                  WHEN EXCLUDED.geo_status = 'ok' THEN EXCLUDED.lat
                  WHEN EXCLUDED.geo_reason LIKE 'geocode_context_%' THEN EXCLUDED.lat
                  WHEN meeting_guide_meetings.geo_status = 'ok' THEN meeting_guide_meetings.lat
                  ELSE EXCLUDED.lat
                END,
                lng = CASE
                  WHEN EXCLUDED.geo_status = 'ok' THEN EXCLUDED.lng
                  WHEN EXCLUDED.geo_reason LIKE 'geocode_context_%' THEN EXCLUDED.lng
                  WHEN meeting_guide_meetings.geo_status = 'ok' THEN meeting_guide_meetings.lng
                  ELSE EXCLUDED.lng
                END,
                geo_status = CASE
                  WHEN EXCLUDED.geo_status = 'ok' THEN EXCLUDED.geo_status
                  WHEN EXCLUDED.geo_reason LIKE 'geocode_context_%' THEN EXCLUDED.geo_status
                  WHEN meeting_guide_meetings.geo_status = 'ok' THEN meeting_guide_meetings.geo_status
                  ELSE EXCLUDED.geo_status
                END,
                geo_reason = CASE
                  WHEN EXCLUDED.geo_status = 'ok' THEN NULL
                  WHEN EXCLUDED.geo_reason LIKE 'geocode_context_%' THEN EXCLUDED.geo_reason
                  WHEN meeting_guide_meetings.geo_status = 'ok' THEN meeting_guide_meetings.geo_reason
                  ELSE EXCLUDED.geo_reason
                END,
                geo_updated_at = CASE
                  WHEN EXCLUDED.geo_status = 'ok' THEN EXCLUDED.geo_updated_at
                  WHEN EXCLUDED.geo_reason LIKE 'geocode_context_%' THEN EXCLUDED.geo_updated_at
                  WHEN meeting_guide_meetings.geo_status = 'ok' THEN meeting_guide_meetings.geo_updated_at
                  ELSE EXCLUDED.geo_updated_at
                END,
                updated_at_source = EXCLUDED.updated_at_source,
                last_ingested_at = EXCLUDED.last_ingested_at,
                updated_at = NOW()
            `,
              [
                stableId,
                tenantId,
                sourceFeedId,
                meeting.slug,
                meeting.name,
                meeting.day,
                meeting.time,
                meeting.endTime,
                meeting.timezone,
                meeting.formattedAddress,
                meeting.address,
                meeting.city,
                meeting.state,
                meeting.postalCode,
                meeting.country,
                meeting.region,
                meeting.location,
                meeting.notes,
                toJsonParam(meeting.types),
                meeting.conferenceUrl,
                meeting.conferencePhone,
                meeting.lat,
                meeting.lng,
                resolvedGeoStatus,
                resolvedGeoReason,
                resolvedGeoUpdatedAt,
                meeting.updatedAtSource,
                now.toISOString(),
              ],
            );
          } catch (error) {
            if (
              !isMissingMeetingGuideGeoColumnsError(error) &&
              !isLegacyMeetingGuideGeoStatusConstraintError(error)
            ) {
              throw error;
            }

            const legacyGeoStatus = inferLegacyGeoStatusFromCoordinates(meeting.lat, meeting.lng);
            await db.query(
              `
              INSERT INTO meeting_guide_meetings (
                id,
                tenant_id,
                source_feed_id,
                slug,
                name,
                day,
                time,
                end_time,
                timezone,
                formatted_address,
                address,
                city,
                state,
                postal_code,
                country,
                region,
                location,
                notes,
                types_json,
                conference_url,
                conference_phone,
                lat,
                lng,
                geo_status,
                updated_at_source,
                last_ingested_at
              )
              VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20,
                $21, $22, $23, $24, $25, $26
              )
              ON CONFLICT (tenant_id, source_feed_id, slug)
              DO UPDATE SET
                name = EXCLUDED.name,
                day = EXCLUDED.day,
                time = EXCLUDED.time,
                end_time = EXCLUDED.end_time,
                timezone = EXCLUDED.timezone,
                formatted_address = EXCLUDED.formatted_address,
                address = EXCLUDED.address,
                city = EXCLUDED.city,
                state = EXCLUDED.state,
                postal_code = EXCLUDED.postal_code,
                country = EXCLUDED.country,
                region = EXCLUDED.region,
                location = EXCLUDED.location,
                notes = EXCLUDED.notes,
                types_json = EXCLUDED.types_json,
                conference_url = EXCLUDED.conference_url,
                conference_phone = EXCLUDED.conference_phone,
                lat = CASE
                  WHEN EXCLUDED.geo_status = 'present' THEN EXCLUDED.lat
                  WHEN meeting_guide_meetings.geo_status = 'present' THEN meeting_guide_meetings.lat
                  ELSE EXCLUDED.lat
                END,
                lng = CASE
                  WHEN EXCLUDED.geo_status = 'present' THEN EXCLUDED.lng
                  WHEN meeting_guide_meetings.geo_status = 'present' THEN meeting_guide_meetings.lng
                  ELSE EXCLUDED.lng
                END,
                geo_status = CASE
                  WHEN EXCLUDED.geo_status = 'present' THEN EXCLUDED.geo_status
                  WHEN meeting_guide_meetings.geo_status = 'present' THEN meeting_guide_meetings.geo_status
                  ELSE EXCLUDED.geo_status
                END,
                updated_at_source = EXCLUDED.updated_at_source,
                last_ingested_at = EXCLUDED.last_ingested_at,
                updated_at = NOW()
            `,
              [
                stableId,
                tenantId,
                sourceFeedId,
                meeting.slug,
                meeting.name,
                meeting.day,
                meeting.time,
                meeting.endTime,
                meeting.timezone,
                meeting.formattedAddress,
                meeting.address,
                meeting.city,
                meeting.state,
                meeting.postalCode,
                meeting.country,
                meeting.region,
                meeting.location,
                meeting.notes,
                toJsonParam(meeting.types),
                meeting.conferenceUrl,
                meeting.conferencePhone,
                meeting.lat,
                meeting.lng,
                legacyGeoStatus,
                meeting.updatedAtSource,
                now.toISOString(),
              ],
            );
          }
          upserted += 1;
        }
        return upserted;
      },

      async list(
        tenantId: string,
        filters: { dayOfWeek?: number; limit?: number } = {},
      ): Promise<MeetingGuideMeetingRow[]> {
        const limit = Math.max(1, Math.min(filters.limit ?? 500, 2000));
        try {
          const result = await db.query<MeetingGuideMeetingRow>(
            `
            SELECT
              id,
              tenant_id,
              source_feed_id,
              slug,
              name,
              day,
              time,
              end_time,
              timezone,
              formatted_address,
              address,
              city,
              state,
              postal_code,
              country,
              region,
              location,
              notes,
              types_json,
              conference_url,
              conference_phone,
              lat,
              lng,
              geo_status,
              geo_reason,
              geo_updated_at,
              updated_at_source,
              last_ingested_at
            FROM meeting_guide_meetings
            WHERE tenant_id = $1
              AND ($2::int IS NULL OR day = $2)
            ORDER BY
              day ASC NULLS LAST,
              time ASC NULLS LAST,
              name ASC
            LIMIT $3
          `,
            [tenantId, filters.dayOfWeek ?? null, limit],
          );

          return result.rows;
        } catch (error) {
          if (!isMissingMeetingGuideGeoColumnsError(error)) {
            throw error;
          }

          type LegacyMeetingGuideMeetingRow = Omit<
            MeetingGuideMeetingRow,
            "geo_status" | "geo_reason" | "geo_updated_at"
          >;

          const legacy = await db.query<LegacyMeetingGuideMeetingRow>(
            `
            SELECT
              id,
              tenant_id,
              source_feed_id,
              slug,
              name,
              day,
              time,
              end_time,
              timezone,
              formatted_address,
              address,
              city,
              state,
              postal_code,
              country,
              region,
              location,
              notes,
              types_json,
              conference_url,
              conference_phone,
              lat,
              lng,
              updated_at_source,
              last_ingested_at
            FROM meeting_guide_meetings
            WHERE tenant_id = $1
              AND ($2::int IS NULL OR day = $2)
            ORDER BY
              day ASC NULLS LAST,
              time ASC NULLS LAST,
              name ASC
            LIMIT $3
          `,
            [tenantId, filters.dayOfWeek ?? null, limit],
          );

          return legacy.rows.map((row) => ({
            ...row,
            geo_status: inferGeoStatusFromCoordinates(row.lat, row.lng),
            geo_reason: inferGeoReasonFromCoordinates(row.lat, row.lng),
            geo_updated_at: row.last_ingested_at,
          }));
        }
      },

      async listNearby(
        tenantId: string,
        center: { lat: number; lng: number; radiusMiles: number },
        filters: MeetingGuideNearbyFilters = {},
      ): Promise<NearbyMeetingRow[]> {
        const bounds = boundingBoxForRadius(center);
        const limit = Math.max(1, Math.min(filters.limit ?? 500, 500));
        const format = filters.format ?? "any";

        let candidates: { rows: MeetingGuideMeetingRow[] };

        try {
          candidates = await db.query<MeetingGuideMeetingRow>(
            `
            SELECT
              id,
              tenant_id,
              source_feed_id,
              slug,
              name,
              day,
              time,
              end_time,
              timezone,
              formatted_address,
              address,
              city,
              state,
              postal_code,
              country,
              region,
              location,
              notes,
              types_json,
              conference_url,
              conference_phone,
              lat,
              lng,
              geo_status,
              geo_reason,
              geo_updated_at,
              updated_at_source,
              last_ingested_at
            FROM meeting_guide_meetings
            WHERE tenant_id = $1
              AND geo_status = 'ok'
              AND ($2::int IS NULL OR day = $2)
              AND ($3::text IS NULL OR time >= $3)
              AND ($4::text IS NULL OR time <= $4)
              AND (
                lat BETWEEN $5 AND $6 AND lng BETWEEN $7 AND $8
              )
            ORDER BY updated_at DESC
            LIMIT $9
          `,
            [
              tenantId,
              filters.dayOfWeek ?? null,
              filters.timeFrom ?? null,
              filters.timeTo ?? null,
              bounds.latMin,
              bounds.latMax,
              bounds.lngMin,
              bounds.lngMax,
              limit * 2,
            ],
          );
        } catch (error) {
          if (!isMissingMeetingGuideGeoColumnsError(error)) {
            throw error;
          }
          type LegacyMeetingGuideMeetingRow = Omit<
            MeetingGuideMeetingRow,
            "geo_status" | "geo_reason" | "geo_updated_at"
          >;
          const legacyResult = await db.query<LegacyMeetingGuideMeetingRow>(
            `
            SELECT
              id,
              tenant_id,
              source_feed_id,
              slug,
              name,
              day,
              time,
              end_time,
              timezone,
              formatted_address,
              address,
              city,
              state,
              postal_code,
              country,
              region,
              location,
              notes,
              types_json,
              conference_url,
              conference_phone,
              lat,
              lng,
              updated_at_source,
              last_ingested_at
            FROM meeting_guide_meetings
            WHERE tenant_id = $1
              AND ($2::int IS NULL OR day = $2)
              AND ($3::text IS NULL OR time >= $3)
              AND ($4::text IS NULL OR time <= $4)
              AND (
                lat BETWEEN $5 AND $6 AND lng BETWEEN $7 AND $8
              )
            ORDER BY updated_at DESC
            LIMIT $9
          `,
            [
              tenantId,
              filters.dayOfWeek ?? null,
              filters.timeFrom ?? null,
              filters.timeTo ?? null,
              bounds.latMin,
              bounds.latMax,
              bounds.lngMin,
              bounds.lngMax,
              limit * 2,
            ],
          );
          candidates = {
            rows: legacyResult.rows.map((row) => ({
              ...row,
              geo_status: inferGeoStatusFromCoordinates(row.lat, row.lng),
              geo_reason: inferGeoReasonFromCoordinates(row.lat, row.lng),
              geo_updated_at: row.last_ingested_at,
            })),
          };
        }

        const normalized = candidates.rows
          .map((row): NearbyMeetingRow | null => {
            const rawTypes = Array.isArray(row.types_json) ? row.types_json : [];
            const types = rawTypes
              .map((entry) => (typeof entry === "string" ? entry.toUpperCase() : null))
              .filter((entry): entry is string => entry !== null);
            const inferredFormat = inferMeetingFormat({
              conferenceUrl: row.conference_url,
              lat: row.lat,
              lng: row.lng,
              formattedAddress: row.formatted_address,
            });

            let distanceMeters: number | null = null;
            if (row.lat !== null && row.lng !== null) {
              distanceMeters = haversineDistanceMeters(center.lat, center.lng, row.lat, row.lng);
              if (distanceMeters > center.radiusMiles * 1609.344) {
                return null;
              }
            } else {
              return null;
            }

            if (filters.types && filters.types.length > 0) {
              const target = new Set(filters.types.map((entry) => entry.toUpperCase()));
              if (!types.some((code) => target.has(code))) {
                return null;
              }
            }

            if (format === "in_person" && inferredFormat === "ONLINE") {
              return null;
            }
            if (format === "online" && inferredFormat === "IN_PERSON") {
              return null;
            }

            return {
              ...row,
              distance_meters: distanceMeters,
              inferred_format: inferredFormat,
              types,
            };
          })
          .filter((row): row is NearbyMeetingRow => row !== null);

        const dedupedByKey = new Map<string, NearbyMeetingRow>();
        for (const meeting of normalized) {
          const dedupeKey = buildMeetingDedupeKey({
            name: meeting.name,
            day: meeting.day,
            time: meeting.time,
            formattedAddress: meeting.formatted_address,
            address: meeting.address,
            lat: meeting.lat,
            lng: meeting.lng,
          });
          const existing = dedupedByKey.get(dedupeKey);
          if (!existing) {
            dedupedByKey.set(dedupeKey, meeting);
            continue;
          }
          dedupedByKey.set(dedupeKey, preferNearbyMeeting(existing, meeting));
        }

        const dedupedMeetings = Array.from(dedupedByKey.values());
        const sorted = dedupedMeetings.sort((left, right) => {
          if (filters.dayOfWeek !== undefined) {
            const leftTime = left.time ?? "99:99";
            const rightTime = right.time ?? "99:99";
            if (leftTime !== rightTime) {
              return leftTime.localeCompare(rightTime);
            }
          }

          const leftDistance = left.distance_meters ?? Number.POSITIVE_INFINITY;
          const rightDistance = right.distance_meters ?? Number.POSITIVE_INFINITY;
          if (leftDistance !== rightDistance) {
            return leftDistance - rightDistance;
          }

          return (left.time ?? "99:99").localeCompare(right.time ?? "99:99");
        });

        return sorted.slice(0, limit);
      },
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
      const checkInAtIso = attendance.rows[0].check_in_at;
      const checkInAtMs = Date.parse(checkInAtIso);
      if (!Number.isNaN(checkInAtMs)) {
        const windowEndsAtMs = checkInAtMs + SIGNATURE_WINDOW_MS;
        const nowMs = now.getTime();
        if (nowMs < checkInAtMs || nowMs > windowEndsAtMs) {
          throw new SignatureWindowError(checkInAtIso, new Date(windowEndsAtMs).toISOString());
        }
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

    zones: {
      async create(
        tenantId: string,
        actorUserId: string,
        payload: {
          label: string;
          type: ExclusionZoneType;
          active: boolean;
          centerLat?: number;
          centerLng?: number;
          radiusM?: number;
          polygonGeoJson?: unknown;
        },
      ): Promise<ExclusionZoneRow> {
        const result = await db.query<ExclusionZoneRow>(
          `
          INSERT INTO exclusion_zones (
            id,
            tenant_id,
            label,
            zone_type,
            active,
            center_lat,
            center_lng,
            radius_m,
            polygon_geojson,
            created_by_user_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
          RETURNING
            id,
            tenant_id,
            label,
            zone_type,
            active,
            center_lat,
            center_lng,
            radius_m,
            polygon_geojson,
            created_at,
            created_by_user_id
        `,
          [
            randomUUID(),
            tenantId,
            payload.label,
            payload.type,
            payload.active,
            payload.centerLat ?? null,
            payload.centerLng ?? null,
            payload.radiusM ?? null,
            toJsonParam(payload.polygonGeoJson ?? null),
            actorUserId,
          ],
        );

        return result.rows[0];
      },

      async list(tenantId: string): Promise<ExclusionZoneRow[]> {
        const result = await db.query<ExclusionZoneRow>(
          `
          SELECT
            id,
            tenant_id,
            label,
            zone_type,
            active,
            center_lat,
            center_lng,
            radius_m,
            polygon_geojson,
            created_at,
            created_by_user_id
          FROM exclusion_zones
          WHERE tenant_id = $1
          ORDER BY created_at DESC
        `,
          [tenantId],
        );

        return result.rows;
      },
    },

    zoneRules: {
      async assign(
        tenantId: string,
        userId: string,
        zoneId: string,
        bufferM: number,
        active: boolean,
      ): Promise<UserZoneRuleRow | null> {
        const zone = await db.query<{ id: string }>(
          `
          SELECT id
          FROM exclusion_zones
          WHERE tenant_id = $1 AND id = $2
          LIMIT 1
        `,
          [tenantId, zoneId],
        );
        if (!zone.rows[0]) {
          return null;
        }

        const result = await db.query<UserZoneRuleRow>(
          `
          INSERT INTO user_zone_rules (
            id,
            tenant_id,
            user_id,
            zone_id,
            buffer_m,
            active
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (tenant_id, user_id, zone_id)
          DO UPDATE SET
            buffer_m = EXCLUDED.buffer_m,
            active = EXCLUDED.active
          RETURNING
            id,
            tenant_id,
            user_id,
            zone_id,
            buffer_m,
            active
        `,
          [randomUUID(), tenantId, userId, zoneId, bufferM, active],
        );

        return result.rows[0] ?? null;
      },

      async listForUser(tenantId: string, userId: string): Promise<UserZoneRuleWithZoneRow[]> {
        const result = await db.query<UserZoneRuleWithZoneRow>(
          `
          SELECT
            r.id,
            r.tenant_id,
            r.user_id,
            r.zone_id,
            r.buffer_m,
            r.active,
            z.label AS zone_label,
            z.zone_type,
            z.active AS zone_active,
            z.center_lat,
            z.center_lng,
            z.radius_m,
            z.polygon_geojson
          FROM user_zone_rules r
          INNER JOIN exclusion_zones z
            ON z.tenant_id = r.tenant_id
           AND z.id = r.zone_id
          WHERE r.tenant_id = $1
            AND r.user_id = $2
            AND r.active = TRUE
            AND z.active = TRUE
          ORDER BY z.created_at DESC
        `,
          [tenantId, userId],
        );

        return result.rows;
      },
    },

    incidents: {
      async findRecent(
        tenantId: string,
        userId: string,
        zoneId: string,
        type: IncidentType,
        since: Date,
      ): Promise<IncidentRow | null> {
        const result = await db.query<IncidentRow>(
          `
          SELECT
            id,
            tenant_id,
            user_id,
            zone_id,
            incident_type,
            occurred_at,
            status,
            metadata_json,
            created_at
          FROM incidents
          WHERE tenant_id = $1
            AND user_id = $2
            AND zone_id = $3
            AND incident_type = $4
            AND occurred_at >= $5
          ORDER BY occurred_at DESC
          LIMIT 1
        `,
          [tenantId, userId, zoneId, type, since.toISOString()],
        );

        return result.rows[0] ?? null;
      },

      async report(
        tenantId: string,
        userId: string,
        zoneId: string,
        type: IncidentType,
        occurredAt: Date,
        metadata?: Record<string, unknown>,
      ): Promise<IncidentRow | null> {
        const zone = await db.query<{ id: string }>(
          `
          SELECT id
          FROM exclusion_zones
          WHERE tenant_id = $1 AND id = $2
          LIMIT 1
        `,
          [tenantId, zoneId],
        );
        if (!zone.rows[0]) {
          return null;
        }

        const result = await db.query<IncidentRow>(
          `
          INSERT INTO incidents (
            id,
            tenant_id,
            user_id,
            zone_id,
            incident_type,
            occurred_at,
            status,
            metadata_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
          RETURNING
            id,
            tenant_id,
            user_id,
            zone_id,
            incident_type,
            occurred_at,
            status,
            metadata_json,
            created_at
        `,
          [
            randomUUID(),
            tenantId,
            userId,
            zoneId,
            type,
            occurredAt.toISOString(),
            IncidentStatus.OPEN,
            toJsonParam(metadata),
          ],
        );

        return result.rows[0] ?? null;
      },
    },

    notificationEvents: {
      async create(
        tenantId: string,
        userId: string,
        payload: {
          channel: "EMAIL" | "SMS";
          recipient: string;
          templateKey: string;
          payload: Record<string, unknown>;
          status?: string;
        },
      ): Promise<NotificationEventRow> {
        const result = await db.query<NotificationEventRow>(
          `
          INSERT INTO notification_events (
            id,
            tenant_id,
            user_id,
            channel,
            recipient,
            template_key,
            payload_json,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
          RETURNING
            id,
            tenant_id,
            user_id,
            channel,
            recipient,
            template_key,
            payload_json,
            status,
            created_at
        `,
          [
            randomUUID(),
            tenantId,
            userId,
            payload.channel,
            payload.recipient,
            payload.templateKey,
            toJsonParam(payload.payload),
            payload.status ?? "PENDING",
          ],
        );

        return result.rows[0];
      },
    },

    supervisorIncidents: {
      async list(
        tenantId: string,
        supervisorUserId: string,
        filters: SupervisorIncidentFilters = {},
        includeAllUsers = false,
      ): Promise<SupervisorIncidentRow[]> {
        const rows = includeAllUsers
          ? await db.query<SupervisorIncidentRow>(
              `
              SELECT
                i.id,
                i.tenant_id,
                i.user_id,
                i.zone_id,
                i.incident_type,
                i.occurred_at,
                i.status,
                i.metadata_json,
                i.created_at,
                z.label AS zone_label
              FROM incidents i
              INNER JOIN exclusion_zones z
                ON z.tenant_id = i.tenant_id
               AND z.id = i.zone_id
              WHERE i.tenant_id = $1
              ORDER BY i.occurred_at DESC
            `,
              [tenantId],
            )
          : await db.query<SupervisorIncidentRow>(
              `
              SELECT
                i.id,
                i.tenant_id,
                i.user_id,
                i.zone_id,
                i.incident_type,
                i.occurred_at,
                i.status,
                i.metadata_json,
                i.created_at,
                z.label AS zone_label
              FROM incidents i
              INNER JOIN exclusion_zones z
                ON z.tenant_id = i.tenant_id
               AND z.id = i.zone_id
              INNER JOIN supervisor_assignments sa
                ON sa.tenant_id = i.tenant_id
               AND sa.supervisor_user_id = $2
               AND sa.assigned_user_id = i.user_id
              WHERE i.tenant_id = $1
              ORDER BY i.occurred_at DESC
            `,
              [tenantId, supervisorUserId],
            );

        return rows.rows.filter((row) => {
          if (filters.userId && row.user_id !== filters.userId) {
            return false;
          }
          if (filters.zoneId && row.zone_id !== filters.zoneId) {
            return false;
          }
          if (filters.status && row.status !== filters.status) {
            return false;
          }
          if (filters.type && row.incident_type !== filters.type) {
            return false;
          }
          return true;
        });
      },
    },
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
