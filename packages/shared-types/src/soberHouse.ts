import { z } from "zod";

const isoTimestampSchema = z.string().datetime();
const nullableIsoTimestampSchema = isoTimestampSchema.nullable();
const nullableIdSchema = z.string().min(1).nullable();

export const soberHouseEntityStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export const soberHouseScheduledFrequencySchema = z.enum([
  "ONCE",
  "DAILY",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
]);
export const soberHouseScheduledWeekdayCodeSchema = z.enum([
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
]);
export const soberHouseRuleScopeTypeSchema = z.enum(["ORGANIZATION", "HOUSE_GROUP", "HOUSE"]);
export const soberHouseRecurringObligationTypeSchema = z.enum([
  "HOUSE_MEETING",
  "ONE_ON_ONE",
  "CHORE",
  "ALERT_ANNOUNCEMENT",
]);
export const soberHouseAccountabilityMethodSchema = z.enum([
  "NONE",
  "ACKNOWLEDGMENT",
  "CHECKLIST",
  "SIGNATURE",
  "PHOTO",
  "MANAGER_CONFIRMATION",
]);
export const soberHouseHouseMeetingKindSchema = z.enum([
  "HOUSE_MEETING",
  "HOUSE_BUSINESS",
  "PROGRAM",
  "OTHER",
]);
export const soberHouseChoreFrequencySchema = z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]);
export const soberHouseProofRequirementSchema = z.enum([
  "NONE",
  "CHECKLIST",
  "PHOTO",
  "MANAGER_CONFIRMATION",
  "SIGNATURE",
  "ACKNOWLEDGMENT",
]);
export const soberHouseManagerConfirmationStatusSchema = z.enum([
  "NOT_REQUIRED",
  "PENDING",
  "CONFIRMED",
  "REJECTED",
]);
export const soberHouseManagerConfirmationHandoffMethodSchema = z.enum([
  "SHARE_SHEET",
  "TEXT_MESSAGE",
]);
export const soberHouseEventCompletionStatusSchema = z.enum([
  "SCHEDULED",
  "COMPLETED",
  "MISSED",
  "EXCUSED",
]);
export const soberHouseScheduledItemTypeSchema = z.enum([
  "HOUSE_MEETING",
  "ONE_ON_ONE_SESSION",
  "HOUSE_CHORE",
]);
export const soberHouseAlertAcknowledgementStatusSchema = z.enum([
  "PENDING",
  "ACKNOWLEDGED",
  "WAIVED",
]);
export const soberHouseProofReviewCategorySchema = z.enum([
  "CHORES",
  "HOUSE_MEETINGS",
  "ONE_ON_ONES",
  "ALERT_ACKNOWLEDGEMENTS",
  "SPONSOR_CALLS",
  "JOB_SEARCH",
  "WORK",
]);
export const soberHouseProofReviewSourceRecordTypeSchema = z.enum([
  "SCHEDULED_ITEM_COMPLETION",
  "CHORE_COMPLETION",
  "HOUSE_MEETING_ATTENDANCE",
  "SPONSOR_CALL",
  "JOB_APPLICATION",
  "WORK_VERIFICATION",
]);
export const soberHouseProofReviewStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "FOLLOW_UP_REQUIRED",
]);
export const soberHouseProofReviewHistoryActionSchema = z.enum([
  "CREATED",
  "SET_PENDING",
  "APPROVED",
  "REJECTED",
  "FOLLOW_UP_REQUIRED",
  "NOTE_ADDED",
]);

export type SoberHouseEntityStatus = z.infer<typeof soberHouseEntityStatusSchema>;
export type SoberHouseScheduledFrequency = z.infer<typeof soberHouseScheduledFrequencySchema>;
export type SoberHouseScheduledWeekdayCode = z.infer<typeof soberHouseScheduledWeekdayCodeSchema>;
export type SoberHouseRuleScopeType = z.infer<typeof soberHouseRuleScopeTypeSchema>;
export type SoberHouseRecurringObligationType = z.infer<
  typeof soberHouseRecurringObligationTypeSchema
>;
export type SoberHouseAccountabilityMethod = z.infer<typeof soberHouseAccountabilityMethodSchema>;
export type SoberHouseHouseMeetingKind = z.infer<typeof soberHouseHouseMeetingKindSchema>;
export type SoberHouseChoreFrequency = z.infer<typeof soberHouseChoreFrequencySchema>;
export type SoberHouseProofRequirement = z.infer<typeof soberHouseProofRequirementSchema>;
export type SoberHouseManagerConfirmationStatus = z.infer<
  typeof soberHouseManagerConfirmationStatusSchema
>;
export type SoberHouseManagerConfirmationHandoffMethod = z.infer<
  typeof soberHouseManagerConfirmationHandoffMethodSchema
>;
export type SoberHouseEventCompletionStatus = z.infer<typeof soberHouseEventCompletionStatusSchema>;
export type SoberHouseScheduledItemType = z.infer<typeof soberHouseScheduledItemTypeSchema>;
export type SoberHouseAlertAcknowledgementStatus = z.infer<
  typeof soberHouseAlertAcknowledgementStatusSchema
>;
export type SoberHouseProofReviewCategory = z.infer<typeof soberHouseProofReviewCategorySchema>;
export type SoberHouseProofReviewSourceRecordType = z.infer<
  typeof soberHouseProofReviewSourceRecordTypeSchema
>;
export type SoberHouseProofReviewStatus = z.infer<typeof soberHouseProofReviewStatusSchema>;
export type SoberHouseProofReviewHistoryAction = z.infer<
  typeof soberHouseProofReviewHistoryActionSchema
>;

export const soberHouseActorRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

export type SoberHouseActorRef = z.infer<typeof soberHouseActorRefSchema>;

/**
 * Configuration record.
 *
 * Lifecycle:
 * resident is assigned to a house -> membership stays active while the resident belongs there
 * -> membership becomes inactive or gains a move-out date when the assignment ends.
 */
export const soberHouseResidentMembershipRecordSchema = z.object({
  id: z.string().min(1),
  residentId: z.string().min(1),
  linkedUserId: z.string().min(1),
  organizationId: nullableIdSchema,
  houseId: nullableIdSchema,
  roomOrBed: z.string(),
  moveInDate: z.string().min(1),
  moveOutDate: z.string().min(1).nullable(),
  isPrimary: z.boolean(),
  status: soberHouseEntityStatusSchema,
  notes: z.string(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export type SoberHouseResidentMembershipRecord = z.infer<
  typeof soberHouseResidentMembershipRecordSchema
>;

/**
 * Configuration record.
 *
 * Lifecycle:
 * operator configures the recurring rule -> the rule expands into concrete scheduled items
 * -> the rule is updated or deactivated without mutating historical resident actions.
 */
export const soberHouseRecurringObligationRecordSchema = z.object({
  id: z.string().min(1),
  organizationId: nullableIdSchema,
  scopeType: soberHouseRuleScopeTypeSchema,
  houseId: nullableIdSchema,
  houseGroupId: nullableIdSchema,
  residentId: nullableIdSchema,
  linkedUserId: nullableIdSchema,
  obligationType: soberHouseRecurringObligationTypeSchema,
  title: z.string().min(1),
  detail: z.string(),
  locationLabel: z.string(),
  frequency: soberHouseScheduledFrequencySchema,
  weekday: soberHouseScheduledWeekdayCodeSchema.nullable(),
  weekdayList: z.array(soberHouseScheduledWeekdayCodeSchema),
  monthlyOrdinal: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
    .nullable(),
  scheduledDate: z.string().min(1).nullable(),
  timeLocalHhmm: z.string().min(1),
  durationMinutes: z.number().int().nonnegative(),
  required: z.boolean(),
  reminderLeadMinutes: z.number().int().nonnegative(),
  inAppReminderEnabled: z.boolean(),
  addToCalendar: z.boolean(),
  accountabilityMethod: soberHouseAccountabilityMethodSchema,
  status: soberHouseEntityStatusSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export type SoberHouseRecurringObligationRecord = z.infer<
  typeof soberHouseRecurringObligationRecordSchema
>;

/**
 * Scheduled item record.
 *
 * Lifecycle:
 * created directly or expanded from a recurring obligation -> appears in resident and operator
 * timelines -> resident action is captured in a completion record -> the item ages out or is
 * inactivated, but its completion history remains separate.
 */
export const soberHouseHouseMeetingRecordSchema = z.object({
  id: z.string().min(1),
  organizationId: nullableIdSchema,
  houseId: nullableIdSchema,
  recurringObligationId: nullableIdSchema,
  title: z.string().min(1),
  description: z.string(),
  meetingKind: soberHouseHouseMeetingKindSchema,
  locationLabel: z.string(),
  startsAt: isoTimestampSchema,
  endsAt: nullableIsoTimestampSchema,
  required: z.boolean(),
  reminderLeadMinutes: z.number().int().nonnegative(),
  inAppReminderEnabled: z.boolean(),
  addToCalendar: z.boolean(),
  acknowledgmentRequired: z.boolean(),
  status: soberHouseEntityStatusSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export type SoberHouseHouseMeetingRecord = z.infer<typeof soberHouseHouseMeetingRecordSchema>;

/**
 * Scheduled item record.
 *
 * Lifecycle:
 * operator assigns the session -> resident sees one concrete session to attend -> resident or
 * staff records completion or an excuse -> proof review stays separate if the session needs it.
 */
export const soberHouseOneOnOneSessionRecordSchema = z.object({
  id: z.string().min(1),
  organizationId: nullableIdSchema,
  houseId: nullableIdSchema,
  residentId: z.string().min(1),
  linkedUserId: z.string().min(1),
  staffAssignmentId: nullableIdSchema,
  recurringObligationId: nullableIdSchema,
  title: z.string().min(1),
  notes: z.string(),
  scheduledAt: isoTimestampSchema,
  endsAt: nullableIsoTimestampSchema,
  required: z.boolean(),
  reminderLeadMinutes: z.number().int().nonnegative(),
  inAppReminderEnabled: z.boolean(),
  addToCalendar: z.boolean(),
  managerConfirmationRequired: z.boolean(),
  completionStatus: soberHouseEventCompletionStatusSchema,
  completedAt: nullableIsoTimestampSchema,
  completedByStaffAssignmentId: nullableIdSchema,
  excusedAt: nullableIsoTimestampSchema,
  excusedReason: z.string().nullable(),
  status: soberHouseEntityStatusSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export type SoberHouseOneOnOneSessionRecord = z.infer<typeof soberHouseOneOnOneSessionRecordSchema>;

/**
 * Scheduled item record.
 *
 * Lifecycle:
 * operator assigns the chore or recurring chore rule -> resident sees the concrete chore due
 * window -> resident submits a completion/proof record -> staff optionally reviews proof.
 */
export const soberHouseHouseChoreRecordSchema = z.object({
  id: z.string().min(1),
  organizationId: nullableIdSchema,
  houseId: nullableIdSchema,
  residentId: nullableIdSchema,
  linkedUserId: nullableIdSchema,
  recurringObligationId: nullableIdSchema,
  title: z.string().min(1),
  summary: z.string(),
  frequency: soberHouseChoreFrequencySchema,
  dueTimeLocalHhmm: z.string().min(1),
  weekday: soberHouseScheduledWeekdayCodeSchema.nullable(),
  scheduledDate: z.string().min(1).nullable(),
  required: z.boolean(),
  proofRequirement: z.array(soberHouseProofRequirementSchema),
  reminderLeadMinutes: z.number().int().nonnegative(),
  inAppReminderEnabled: z.boolean(),
  addToCalendar: z.boolean(),
  accountabilityRequired: z.boolean(),
  status: soberHouseEntityStatusSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export type SoberHouseHouseChoreRecord = z.infer<typeof soberHouseHouseChoreRecordSchema>;

export const soberHouseScheduledItemRecordSchema = z.union([
  soberHouseHouseMeetingRecordSchema,
  soberHouseOneOnOneSessionRecordSchema,
  soberHouseHouseChoreRecordSchema,
]);

export type SoberHouseScheduledItemRecord = z.infer<typeof soberHouseScheduledItemRecordSchema>;

/**
 * Resident action record.
 *
 * Lifecycle:
 * operator publishes an alert that requires acknowledgment -> resident sees a pending ack
 * -> resident acknowledges or staff waives the requirement -> the alert remains immutable history.
 */
export const soberHouseAlertAcknowledgementRecordSchema = z.object({
  id: z.string().min(1),
  residentId: z.string().min(1),
  linkedUserId: z.string().min(1),
  organizationId: nullableIdSchema,
  houseId: nullableIdSchema,
  alertId: z.string().min(1),
  required: z.boolean(),
  status: soberHouseAlertAcknowledgementStatusSchema,
  acknowledgedAt: nullableIsoTimestampSchema,
  note: z.string(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export type SoberHouseAlertAcknowledgementRecord = z.infer<
  typeof soberHouseAlertAcknowledgementRecordSchema
>;

/**
 * Resident action record.
 *
 * This is the canonical live-loop write model for resident proof. Legacy per-feature completion
 * arrays may still exist during migration, but new shared dashboard/iOS work should point review
 * and live status at this record shape.
 *
 * Lifecycle:
 * a scheduled item becomes due -> resident submits completion and proof -> the record remains
 * immutable apart from review-related metadata and staff confirmation fields.
 */
export const soberHouseScheduledItemCompletionRecordSchema = z.object({
  id: z.string().min(1),
  residentId: z.string().min(1),
  linkedUserId: z.string().min(1),
  organizationId: nullableIdSchema,
  houseId: nullableIdSchema,
  scheduledItemType: soberHouseScheduledItemTypeSchema,
  scheduledItemId: z.string().min(1),
  recurringObligationId: nullableIdSchema,
  scheduledAt: nullableIsoTimestampSchema,
  status: soberHouseEventCompletionStatusSchema,
  completedAt: nullableIsoTimestampSchema,
  excusedAt: nullableIsoTimestampSchema,
  excusedReason: z.string().nullable(),
  proofRequired: z.boolean(),
  proofRequirement: z.array(soberHouseProofRequirementSchema),
  proofProvided: z.boolean(),
  proofReference: z.string().nullable(),
  submittedAt: nullableIsoTimestampSchema,
  managerConfirmationRequired: z.boolean(),
  managerConfirmationStatus: soberHouseManagerConfirmationStatusSchema,
  managerConfirmationRequestedAt: nullableIsoTimestampSchema,
  managerConfirmationRequestedVia: soberHouseManagerConfirmationHandoffMethodSchema.nullable(),
  managerConfirmedAt: nullableIsoTimestampSchema,
  notes: z.string(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export type SoberHouseScheduledItemCompletionRecord = z.infer<
  typeof soberHouseScheduledItemCompletionRecordSchema
>;

export const soberHouseProofReviewHistoryEntrySchema = z.object({
  id: z.string().min(1),
  createdAt: isoTimestampSchema,
  actor: soberHouseActorRefSchema,
  action: soberHouseProofReviewHistoryActionSchema,
  note: z.string(),
  previousStatus: soberHouseProofReviewStatusSchema.nullable(),
  nextStatus: soberHouseProofReviewStatusSchema,
});

export type SoberHouseProofReviewHistoryEntry = z.infer<
  typeof soberHouseProofReviewHistoryEntrySchema
>;

/**
 * Review record.
 *
 * `sourceRecordType` + `sourceRecordId` is the canonical pointer to the resident action being
 * reviewed. For the live shared loop, prefer `SCHEDULED_ITEM_COMPLETION` as the source type.
 *
 * Lifecycle:
 * resident submits proof -> review starts as pending -> staff approves, rejects, or requests
 * follow-up -> the history keeps the full decision trail.
 */
export const soberHouseProofReviewRecordSchema = z.object({
  id: z.string().min(1),
  residentId: z.string().min(1),
  linkedUserId: z.string().min(1),
  houseId: nullableIdSchema,
  organizationId: nullableIdSchema,
  category: soberHouseProofReviewCategorySchema,
  sourceRecordType: soberHouseProofReviewSourceRecordTypeSchema,
  sourceRecordId: z.string().min(1),
  linkedEnforcementRecordId: nullableIdSchema,
  proofRequired: z.boolean(),
  proofProvided: z.boolean(),
  proofReference: z.string().nullable(),
  evidenceItemIds: z.array(z.string().min(1)),
  submittedAt: nullableIsoTimestampSchema,
  status: soberHouseProofReviewStatusSchema,
  reviewedAt: nullableIsoTimestampSchema,
  reviewedBy: soberHouseActorRefSchema.nullable(),
  history: z.array(soberHouseProofReviewHistoryEntrySchema),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export type SoberHouseProofReviewRecord = z.infer<typeof soberHouseProofReviewRecordSchema>;

export const soberHouseResidentActionObligationTypeSchema = z.enum([
  "HOUSE_MEETING",
  "ONE_ON_ONE",
  "CHORE",
]);

export type SoberHouseResidentActionObligationType = z.infer<
  typeof soberHouseResidentActionObligationTypeSchema
>;

export const soberHouseResidentCompletionRequestSchema = z.object({
  completedAt: isoTimestampSchema.optional(),
  submittedAt: isoTimestampSchema.optional(),
  proofMetadata: z.record(z.unknown()).nullable().optional(),
});

export type SoberHouseResidentCompletionRequest = z.infer<
  typeof soberHouseResidentCompletionRequestSchema
>;

export const soberHouseResidentProofSubmissionRequestSchema = z.object({
  completedAt: isoTimestampSchema.optional(),
  submittedAt: isoTimestampSchema.optional(),
  proofMetadata: z.record(z.unknown()),
});

export type SoberHouseResidentProofSubmissionRequest = z.infer<
  typeof soberHouseResidentProofSubmissionRequestSchema
>;

export const soberHouseResidentAlertAcknowledgementRequestSchema = z.object({
  acknowledgedAt: isoTimestampSchema.optional(),
  note: z.string().optional(),
});

export type SoberHouseResidentAlertAcknowledgementRequest = z.infer<
  typeof soberHouseResidentAlertAcknowledgementRequestSchema
>;

export const soberHouseOperatorProofReviewOutcomeSchema = z.enum(["APPROVED", "REJECTED"]);

export type SoberHouseOperatorProofReviewOutcome = z.infer<
  typeof soberHouseOperatorProofReviewOutcomeSchema
>;

export const soberHouseOperatorProofReviewRequestSchema = z.object({
  reviewOutcome: soberHouseOperatorProofReviewOutcomeSchema,
  reviewedAt: isoTimestampSchema.optional(),
  note: z.string().trim().max(280).optional(),
});

export type SoberHouseOperatorProofReviewRequest = z.infer<
  typeof soberHouseOperatorProofReviewRequestSchema
>;

export const soberHouseResidentObligationRecordSchema = z.object({
  obligationId: z.string().min(1),
  organizationId: z.string().min(1),
  houseId: z.string().min(1),
  residentUserId: z.string().min(1),
  obligationType: soberHouseResidentActionObligationTypeSchema,
  scheduledAt: isoTimestampSchema,
  dueAt: nullableIsoTimestampSchema,
  proofRequired: z.boolean(),
  obligationStatus: soberHouseEntityStatusSchema,
  completionRecordId: z.string().min(1).nullable(),
  completionStatus: soberHouseEventCompletionStatusSchema.nullable(),
  completedAt: nullableIsoTimestampSchema,
  proofReviewId: z.string().min(1).nullable(),
  proofReviewOutcome: soberHouseProofReviewStatusSchema.nullable(),
  reviewedAt: nullableIsoTimestampSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export type SoberHouseResidentObligationRecord = z.infer<
  typeof soberHouseResidentObligationRecordSchema
>;

export const soberHouseResidentObligationStatusRecordSchema = z.object({
  obligationId: z.string().min(1),
  obligationType: soberHouseResidentActionObligationTypeSchema,
  obligationStatus: soberHouseEntityStatusSchema,
  scheduledAt: isoTimestampSchema,
  dueAt: nullableIsoTimestampSchema,
  completionStatus: soberHouseEventCompletionStatusSchema.nullable(),
  proofRequired: z.boolean(),
  proofSubmitted: z.boolean(),
  proofReviewOutcome: soberHouseProofReviewStatusSchema.nullable(),
  reviewedAt: nullableIsoTimestampSchema,
});

export type SoberHouseResidentObligationStatusRecord = z.infer<
  typeof soberHouseResidentObligationStatusRecordSchema
>;

/**
 * Shared sober-house live-loop contract.
 *
 * Configuration records:
 * residentHouseMemberships
 * recurringObligations
 *
 * Scheduled item records:
 * houseMeetings
 * oneOnOneSessions
 * houseChores
 *
 * Resident action records:
 * alertAcknowledgementRecords
 * scheduledItemCompletionRecords
 *
 * Review records:
 * proofReviewRecords
 */
export const soberHouseLiveStoreSchema = z.object({
  residentHouseMemberships: z.array(soberHouseResidentMembershipRecordSchema),
  recurringObligations: z.array(soberHouseRecurringObligationRecordSchema),
  houseMeetings: z.array(soberHouseHouseMeetingRecordSchema),
  oneOnOneSessions: z.array(soberHouseOneOnOneSessionRecordSchema),
  houseChores: z.array(soberHouseHouseChoreRecordSchema),
  alertAcknowledgementRecords: z.array(soberHouseAlertAcknowledgementRecordSchema),
  scheduledItemCompletionRecords: z.array(soberHouseScheduledItemCompletionRecordSchema),
  proofReviewRecords: z.array(soberHouseProofReviewRecordSchema),
});

export type SoberHouseLiveStoreSlice = z.infer<typeof soberHouseLiveStoreSchema>;
