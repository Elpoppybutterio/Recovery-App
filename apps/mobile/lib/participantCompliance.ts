import type { AccessContext, AppAccessRole } from "./access";
import type { OnboardingPath } from "./onboarding";
import type { RecurringServiceCommitment } from "./recurringServiceCommitments";
import type { SoberHouseAccessRole } from "./soberHouse/types";

export type ParticipantProfileSyncPayload = {
  participantType: "recovery_user" | "resident_user" | "court_participant";
  organizationId: string | null;
  houseId: string | null;
  courtProgramId: string | null;
  status: "PENDING" | "ACTIVE" | "PAUSED" | "INACTIVE";
};

export type ObligationSnapshotPayload = {
  syncKey: string;
  obligationType:
    | "meeting_attendance"
    | "sponsor_contact"
    | "treatment_session"
    | "court_appearance"
    | "drug_test"
    | "chore"
    | "curfew"
    | "service_commitment"
    | "proof_submission"
    | "other";
  sourceTrack:
    | "recovery"
    | "resident"
    | "court"
    | "service"
    | "treatment"
    | "sponsor"
    | "operations"
    | "other";
  title: string;
  description: string | null;
  organizationId: string | null;
  houseId: string | null;
  courtProgramId: string | null;
  dueAt: string | null;
  recurrence: Record<string, unknown> | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  requiresProof: boolean;
  requiresSignature: boolean;
  status: "ACTIVE" | "COMPLETED" | "MISSED" | "CANCELED" | "WAIVED";
};

export type ComplianceEventPayload = {
  obligationId: string | null;
  eventType: "MEETING_ATTENDED" | "SPONSOR_CONTACT_COMPLETED";
  eventStatus: "COMPLETED";
  occurredAt: string;
  metadata: Record<string, unknown>;
  sourceTrack: "resident" | "sponsor";
  externalEventId: string;
};

export type BackendObligationRecord = {
  id: string;
  syncKey: string | null;
  title: string;
  obligationType: string;
  status: string;
  dueAt: string | null;
  sourceTrack: string;
};

export type BackendViolationRecord = {
  id: string;
  violationType: string;
  severity: string;
  status: string;
  detectedAt: string;
};

type SponsorInputs = {
  sponsorCallAvailable: boolean;
  sponsorName: string;
  sponsorPhoneE164: string | null;
  sponsorCallTimeLocalHhmm: string;
  sponsorRepeatDays: string[];
  sponsorRepeatInterval: number;
  sponsorRepeatUnit: "WEEKLY" | "MONTHLY";
};

type CourtInputs = {
  wizardJusticeTrack: "NONE" | "DRUG_COURT" | "PROBATION_PAROLE";
  wizardCourtProgramName: string;
  wizardCourtSupervisorName: string;
  wizardCourtRequirementsSummary: string;
  wizardCourtDeadlineSummary: string;
};

type ResidentRulesInputs = {
  meetingsRequired: boolean;
  meetingsPerWeek: number;
  meetingsProofMethod: string;
  sponsorContactEnabled: boolean;
  sponsorContactsRequiredPerWeek: number;
  sponsorProofType: string;
  curfewEnabled: boolean;
  weekdayCurfew: string;
  fridayCurfew: string;
  saturdayCurfew: string;
  sundayCurfew: string;
  choresEnabled: boolean;
  choresFrequency: string;
  choresDueTime: string;
  choresProofRequirement: string[];
};

type SyncInputs = {
  onboardingPath: OnboardingPath;
  setupComplete: boolean;
  appAccessRole: AppAccessRole;
  accessContext: AccessContext | null;
  soberHouseRole: SoberHouseAccessRole | null | undefined;
  houseId: string | null;
  sponsor: SponsorInputs;
  court: CourtInputs;
  recurringServiceCommitments: RecurringServiceCommitment[];
  residentRules: ResidentRulesInputs | null;
};

type SponsorCallLog = {
  id: string;
  atIso: string;
  sponsorPhoneE164: string | null;
  source: "button" | "notification";
  success: boolean;
};

type MeetingAttendanceLog = {
  id: string;
  meetingId: string;
  atIso: string;
  method: "manual" | "arrivalPrompt" | "verified";
};

function normalizeHhmmToIso(hhmm: string, now = new Date()): string | null {
  const parts = hhmm.split(":");
  if (parts.length !== 2) {
    return null;
  }
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }
  const dueAt = new Date(now);
  dueAt.setHours(hours, minutes, 0, 0);
  if (dueAt.getTime() < now.getTime()) {
    dueAt.setDate(dueAt.getDate() + 1);
  }
  return dueAt.toISOString();
}

function findGrant(
  accessContext: AccessContext | null,
  role: "resident_user" | "court_participant",
) {
  return accessContext?.grants.find((grant) => grant.role === role) ?? null;
}

export function buildParticipantProfileSyncPayload(
  input: Pick<
    SyncInputs,
    | "onboardingPath"
    | "setupComplete"
    | "appAccessRole"
    | "accessContext"
    | "soberHouseRole"
    | "houseId"
  >,
): ParticipantProfileSyncPayload | null {
  const residentGrant = findGrant(input.accessContext, "resident_user");
  const courtGrant = findGrant(input.accessContext, "court_participant");

  if (
    residentGrant ||
    input.soberHouseRole === "HOUSE_RESIDENT" ||
    input.onboardingPath === "SOBER_HOUSE_RESIDENT" ||
    input.appAccessRole === "SOBER_HOUSE_RESIDENT"
  ) {
    return {
      participantType: "resident_user",
      organizationId: residentGrant?.organizationId ?? null,
      houseId: input.houseId,
      courtProgramId: null,
      status: input.setupComplete ? "ACTIVE" : "PENDING",
    };
  }

  if (
    courtGrant ||
    input.soberHouseRole === "DRUG_COURT_PARTICIPANT" ||
    input.soberHouseRole === "PROBATION_PAROLE_PARTICIPANT" ||
    input.onboardingPath === "COURT_PROGRAM" ||
    input.appAccessRole === "COURT_PARTICIPANT"
  ) {
    return {
      participantType: "court_participant",
      organizationId: null,
      houseId: null,
      courtProgramId: courtGrant?.courtProgramId ?? null,
      status: input.setupComplete ? "ACTIVE" : "PENDING",
    };
  }

  if (input.onboardingPath === "SOBER_HOUSE_ORG_ADMIN") {
    return null;
  }

  return {
    participantType: "recovery_user",
    organizationId: null,
    houseId: null,
    courtProgramId: null,
    status: input.setupComplete ? "ACTIVE" : "PENDING",
  };
}

export function buildObligationSnapshotPayloads(input: SyncInputs): ObligationSnapshotPayload[] {
  const profile = buildParticipantProfileSyncPayload(input);
  if (!profile) {
    return [];
  }

  const obligations: ObligationSnapshotPayload[] = [];

  if (
    input.sponsor.sponsorCallAvailable &&
    input.sponsor.sponsorName.trim().length > 0 &&
    input.sponsor.sponsorPhoneE164
  ) {
    obligations.push({
      syncKey: "sponsor-contact-primary",
      obligationType: "sponsor_contact",
      sourceTrack: "sponsor",
      title: `Sponsor contact: ${input.sponsor.sponsorName.trim()}`,
      description: `Call schedule ${input.sponsor.sponsorCallTimeLocalHhmm}`,
      organizationId: profile.organizationId,
      houseId: profile.houseId,
      courtProgramId: profile.courtProgramId,
      dueAt: normalizeHhmmToIso(input.sponsor.sponsorCallTimeLocalHhmm),
      recurrence: {
        repeatUnit: input.sponsor.sponsorRepeatUnit,
        repeatInterval: input.sponsor.sponsorRepeatInterval,
        repeatDays: input.sponsor.sponsorRepeatDays,
      },
      priority: profile.participantType === "court_participant" ? "HIGH" : "MEDIUM",
      requiresProof: Boolean(input.residentRules?.sponsorContactEnabled),
      requiresSignature: false,
      status: "ACTIVE",
    });
  }

  for (const commitment of input.recurringServiceCommitments) {
    obligations.push({
      syncKey: `service-commitment:${commitment.id}`,
      obligationType: "service_commitment",
      sourceTrack: "service",
      title: commitment.name,
      description: commitment.location || commitment.notes || null,
      organizationId: profile.organizationId,
      houseId: profile.houseId,
      courtProgramId: profile.courtProgramId,
      dueAt: normalizeHhmmToIso(commitment.startsAtLocal),
      recurrence: commitment.recurrence as unknown as Record<string, unknown>,
      priority: "LOW",
      requiresProof: false,
      requiresSignature: false,
      status: "ACTIVE",
    });
  }

  if (profile.participantType === "court_participant") {
    const title =
      input.court.wizardCourtProgramName.trim().length > 0
        ? input.court.wizardCourtProgramName.trim()
        : input.court.wizardJusticeTrack === "DRUG_COURT"
          ? "Drug court requirements"
          : "Court / program requirements";
    obligations.push({
      syncKey: "court-program-primary",
      obligationType: "court_appearance",
      sourceTrack: "court",
      title,
      description:
        [
          input.court.wizardCourtSupervisorName.trim()
            ? `Supervising contact: ${input.court.wizardCourtSupervisorName.trim()}`
            : null,
          input.court.wizardCourtRequirementsSummary.trim()
            ? `Requirements: ${input.court.wizardCourtRequirementsSummary.trim()}`
            : null,
          input.court.wizardCourtDeadlineSummary.trim()
            ? `Upcoming: ${input.court.wizardCourtDeadlineSummary.trim()}`
            : null,
        ]
          .filter((entry): entry is string => Boolean(entry))
          .join(" • ") || null,
      organizationId: null,
      houseId: null,
      courtProgramId: profile.courtProgramId,
      dueAt: null,
      recurrence: {
        justiceTrack: input.court.wizardJusticeTrack,
      },
      priority: "HIGH",
      requiresProof: true,
      requiresSignature: false,
      status: "ACTIVE",
    });
  }

  if (profile.participantType === "resident_user" && input.residentRules) {
    if (input.residentRules.meetingsRequired && input.residentRules.meetingsPerWeek > 0) {
      obligations.push({
        syncKey: "resident-meetings-weekly",
        obligationType: "meeting_attendance",
        sourceTrack: "resident",
        title: `Attend ${input.residentRules.meetingsPerWeek} meetings each week`,
        description: `Proof method: ${input.residentRules.meetingsProofMethod}`,
        organizationId: profile.organizationId,
        houseId: profile.houseId,
        courtProgramId: null,
        dueAt: null,
        recurrence: {
          cadence: "WEEKLY",
          count: input.residentRules.meetingsPerWeek,
        },
        priority: "HIGH",
        requiresProof: input.residentRules.meetingsProofMethod !== "NONE",
        requiresSignature: input.residentRules.meetingsProofMethod.includes("SIGNATURE"),
        status: "ACTIVE",
      });
    }

    if (input.residentRules.curfewEnabled) {
      obligations.push({
        syncKey: "resident-curfew",
        obligationType: "curfew",
        sourceTrack: "resident",
        title: "Follow house curfew",
        description: `Weekdays ${input.residentRules.weekdayCurfew}, Fri ${input.residentRules.fridayCurfew}, Sat ${input.residentRules.saturdayCurfew}, Sun ${input.residentRules.sundayCurfew}`,
        organizationId: profile.organizationId,
        houseId: profile.houseId,
        courtProgramId: null,
        dueAt: normalizeHhmmToIso(input.residentRules.weekdayCurfew),
        recurrence: {
          weekday: input.residentRules.weekdayCurfew,
          friday: input.residentRules.fridayCurfew,
          saturday: input.residentRules.saturdayCurfew,
          sunday: input.residentRules.sundayCurfew,
        },
        priority: "HIGH",
        requiresProof: false,
        requiresSignature: false,
        status: "ACTIVE",
      });
    }

    if (input.residentRules.choresEnabled) {
      obligations.push({
        syncKey: "resident-chores",
        obligationType: "chore",
        sourceTrack: "resident",
        title: "Complete assigned house chores",
        description: `${input.residentRules.choresFrequency} by ${input.residentRules.choresDueTime}`,
        organizationId: profile.organizationId,
        houseId: profile.houseId,
        courtProgramId: null,
        dueAt: normalizeHhmmToIso(input.residentRules.choresDueTime),
        recurrence: {
          frequency: input.residentRules.choresFrequency,
        },
        priority: "MEDIUM",
        requiresProof: input.residentRules.choresProofRequirement.length > 0,
        requiresSignature:
          input.residentRules.choresProofRequirement.includes("MANAGER_CONFIRMATION"),
        status: "ACTIVE",
      });
    }
  }

  return obligations;
}

export function buildComplianceEventPayloads(input: {
  sponsorCallLogs: SponsorCallLog[];
  meetingAttendanceLogs: MeetingAttendanceLog[];
  obligations: BackendObligationRecord[];
}): ComplianceEventPayload[] {
  const sponsorObligation =
    input.obligations.find((obligation) => obligation.syncKey === "sponsor-contact-primary") ??
    null;
  const meetingObligation =
    input.obligations.find((obligation) => obligation.syncKey === "resident-meetings-weekly") ??
    null;

  const sponsorEvents = input.sponsorCallLogs
    .filter((entry) => entry.success)
    .map<ComplianceEventPayload>((entry) => ({
      obligationId: sponsorObligation?.id ?? null,
      eventType: "SPONSOR_CONTACT_COMPLETED",
      eventStatus: "COMPLETED",
      occurredAt: entry.atIso,
      metadata: {
        sponsorPhoneE164: entry.sponsorPhoneE164,
        source: entry.source,
      },
      sourceTrack: "sponsor",
      externalEventId: `sponsor-call:${entry.id}`,
    }));

  const meetingEvents = input.meetingAttendanceLogs.map<ComplianceEventPayload>((entry) => ({
    obligationId: meetingObligation?.id ?? null,
    eventType: "MEETING_ATTENDED",
    eventStatus: "COMPLETED",
    occurredAt: entry.atIso,
    metadata: {
      meetingId: entry.meetingId,
      method: entry.method,
    },
    sourceTrack: "resident",
    externalEventId: `meeting-attendance:${entry.id}`,
  }));

  return [...sponsorEvents, ...meetingEvents];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseBackendObligationsResponse(value: unknown): BackendObligationRecord[] {
  if (!isRecord(value) || !Array.isArray(value.obligations)) {
    return [];
  }

  return value.obligations
    .map((entry) => {
      if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.title !== "string") {
        return null;
      }
      return {
        id: entry.id,
        syncKey: typeof entry.sync_key === "string" ? entry.sync_key : null,
        title: entry.title,
        obligationType: typeof entry.obligation_type === "string" ? entry.obligation_type : "other",
        status: typeof entry.status === "string" ? entry.status : "ACTIVE",
        dueAt: typeof entry.due_at === "string" ? entry.due_at : null,
        sourceTrack: typeof entry.source_track === "string" ? entry.source_track : "other",
      };
    })
    .filter((entry): entry is BackendObligationRecord => entry !== null);
}

export function parseBackendViolationsResponse(value: unknown): BackendViolationRecord[] {
  if (!isRecord(value) || !Array.isArray(value.violations)) {
    return [];
  }

  return value.violations
    .map((entry) => {
      if (!isRecord(entry) || typeof entry.id !== "string") {
        return null;
      }
      return {
        id: entry.id,
        violationType: typeof entry.violation_type === "string" ? entry.violation_type : "other",
        severity: typeof entry.severity === "string" ? entry.severity : "LOW",
        status: typeof entry.status === "string" ? entry.status : "OPEN",
        detectedAt: typeof entry.detected_at === "string" ? entry.detected_at : "",
      };
    })
    .filter((entry): entry is BackendViolationRecord => entry !== null);
}
