import type { OnboardingPath, SetupJusticeTrack } from "./onboarding";
import type { SoberHouseAccessRole } from "./soberHouse/types";

export type ParticipantTrackType = "recovery_only" | "sober_housing_resident" | "court_participant";
export type ParticipantTrackStatus = "ACTIVE" | "INACTIVE";
export type ParticipantTrackSetupStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";

export type ParticipantTrackEnrollment = {
  id: string;
  trackType: ParticipantTrackType;
  status: ParticipantTrackStatus;
  setupStatus: ParticipantTrackSetupStatus;
  startedAt: string;
  endedAt: string | null;
  linkedOrganizationId: string | null;
  linkedHouseId: string | null;
  linkedCourtProgramId: string | null;
  linkedCourtProgramName: string | null;
  courtTrackKind: Exclude<SetupJusticeTrack, "NONE"> | null;
};

export type ParticipantTrackState = {
  recoveryProfileCreatedAt: string | null;
  enrollments: ParticipantTrackEnrollment[];
};

type LegacyTrackInput = {
  setupComplete?: boolean;
  onboardingPath?: OnboardingPath;
  wizardJusticeTrack?: SetupJusticeTrack;
  soberHouseRole?: SoberHouseAccessRole | null;
  houseId?: string | null;
  organizationId?: string | null;
  courtProgramName?: string | null;
  nowIso?: string;
};

function createTrackId(trackType: ParticipantTrackType, timestamp: string): string {
  return `${trackType}-${Date.parse(timestamp).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isParticipantTrackType(value: unknown): value is ParticipantTrackType {
  return (
    value === "recovery_only" || value === "sober_housing_resident" || value === "court_participant"
  );
}

function isParticipantTrackStatus(value: unknown): value is ParticipantTrackStatus {
  return value === "ACTIVE" || value === "INACTIVE";
}

function isParticipantTrackSetupStatus(value: unknown): value is ParticipantTrackSetupStatus {
  return value === "NOT_STARTED" || value === "IN_PROGRESS" || value === "COMPLETE";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEnrollment(value: unknown): ParticipantTrackEnrollment | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isParticipantTrackType(value.trackType)
  ) {
    return null;
  }

  return {
    id: value.id,
    trackType: value.trackType,
    status: isParticipantTrackStatus(value.status) ? value.status : "ACTIVE",
    setupStatus: isParticipantTrackSetupStatus(value.setupStatus)
      ? value.setupStatus
      : value.status === "INACTIVE"
        ? "COMPLETE"
        : "IN_PROGRESS",
    startedAt: typeof value.startedAt === "string" ? value.startedAt : new Date().toISOString(),
    endedAt: typeof value.endedAt === "string" ? value.endedAt : null,
    linkedOrganizationId:
      typeof value.linkedOrganizationId === "string" ? value.linkedOrganizationId : null,
    linkedHouseId: typeof value.linkedHouseId === "string" ? value.linkedHouseId : null,
    linkedCourtProgramId:
      typeof value.linkedCourtProgramId === "string" ? value.linkedCourtProgramId : null,
    linkedCourtProgramName:
      typeof value.linkedCourtProgramName === "string" ? value.linkedCourtProgramName : null,
    courtTrackKind:
      value.courtTrackKind === "DRUG_COURT" || value.courtTrackKind === "PROBATION_PAROLE"
        ? value.courtTrackKind
        : null,
  };
}

export function createDefaultParticipantTrackState(
  nowIso = new Date().toISOString(),
): ParticipantTrackState {
  return {
    recoveryProfileCreatedAt: nowIso,
    enrollments: [
      {
        id: createTrackId("recovery_only", nowIso),
        trackType: "recovery_only",
        status: "ACTIVE",
        setupStatus: "COMPLETE",
        startedAt: nowIso,
        endedAt: null,
        linkedOrganizationId: null,
        linkedHouseId: null,
        linkedCourtProgramId: null,
        linkedCourtProgramName: null,
        courtTrackKind: null,
      },
    ],
  };
}

function inferLegacyEnrollments(input: LegacyTrackInput): ParticipantTrackEnrollment[] {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const enrollments: ParticipantTrackEnrollment[] = [];
  const shouldAddRecovery =
    input.setupComplete === true && input.onboardingPath !== "SOBER_HOUSE_ORG_ADMIN";

  if (shouldAddRecovery) {
    enrollments.push({
      id: createTrackId("recovery_only", nowIso),
      trackType: "recovery_only",
      status: "ACTIVE",
      setupStatus: "COMPLETE",
      startedAt: nowIso,
      endedAt: null,
      linkedOrganizationId: null,
      linkedHouseId: null,
      linkedCourtProgramId: null,
      linkedCourtProgramName: null,
      courtTrackKind: null,
    });
  }

  const residentLegacy =
    input.soberHouseRole === "HOUSE_RESIDENT" || input.onboardingPath === "SOBER_HOUSE_RESIDENT";
  if (residentLegacy) {
    enrollments.push({
      id: createTrackId("sober_housing_resident", nowIso),
      trackType: "sober_housing_resident",
      status: "ACTIVE",
      setupStatus: input.setupComplete ? "COMPLETE" : "IN_PROGRESS",
      startedAt: nowIso,
      endedAt: null,
      linkedOrganizationId: input.organizationId ?? null,
      linkedHouseId: input.houseId ?? null,
      linkedCourtProgramId: null,
      linkedCourtProgramName: null,
      courtTrackKind: null,
    });
  }

  const courtLegacy =
    input.soberHouseRole === "DRUG_COURT_PARTICIPANT" ||
    input.soberHouseRole === "PROBATION_PAROLE_PARTICIPANT" ||
    input.onboardingPath === "COURT_PROGRAM";
  if (courtLegacy) {
    enrollments.push({
      id: createTrackId("court_participant", nowIso),
      trackType: "court_participant",
      status: "ACTIVE",
      setupStatus: input.setupComplete ? "COMPLETE" : "IN_PROGRESS",
      startedAt: nowIso,
      endedAt: null,
      linkedOrganizationId: input.organizationId ?? null,
      linkedHouseId: null,
      linkedCourtProgramId: null,
      linkedCourtProgramName: input.courtProgramName ?? null,
      courtTrackKind:
        input.wizardJusticeTrack === "DRUG_COURT" || input.wizardJusticeTrack === "PROBATION_PAROLE"
          ? input.wizardJusticeTrack
          : input.soberHouseRole === "PROBATION_PAROLE_PARTICIPANT"
            ? "PROBATION_PAROLE"
            : "DRUG_COURT",
    });
  }

  if (enrollments.length === 0 && input.setupComplete) {
    return createDefaultParticipantTrackState(nowIso).enrollments;
  }

  return enrollments;
}

export function normalizeParticipantTrackState(
  value: unknown,
  legacyInput: LegacyTrackInput = {},
): ParticipantTrackState {
  if (isRecord(value) && Array.isArray(value.enrollments)) {
    const enrollments = value.enrollments
      .map((entry) => parseEnrollment(entry))
      .filter((entry): entry is ParticipantTrackEnrollment => entry !== null);
    if (enrollments.length > 0) {
      return {
        recoveryProfileCreatedAt:
          typeof value.recoveryProfileCreatedAt === "string"
            ? value.recoveryProfileCreatedAt
            : (enrollments[0]?.startedAt ?? new Date().toISOString()),
        enrollments,
      };
    }
  }

  const inferredEnrollments = inferLegacyEnrollments(legacyInput);
  return {
    recoveryProfileCreatedAt: legacyInput.nowIso ?? new Date().toISOString(),
    enrollments: inferredEnrollments,
  };
}

export function getActiveParticipantTracks(
  state: ParticipantTrackState,
  options?: { includeIncomplete?: boolean },
): ParticipantTrackEnrollment[] {
  const includeIncomplete = options?.includeIncomplete === true;
  return state.enrollments.filter(
    (entry) =>
      entry.status === "ACTIVE" &&
      (includeIncomplete ||
        entry.setupStatus === "COMPLETE" ||
        entry.trackType === "recovery_only"),
  );
}

export function getLatestTrackEnrollment(
  state: ParticipantTrackState,
  trackType: ParticipantTrackType,
): ParticipantTrackEnrollment | null {
  return state.enrollments.find((entry) => entry.trackType === trackType) ?? null;
}

export function hasActiveParticipantTrack(
  state: ParticipantTrackState,
  trackType: ParticipantTrackType,
  options?: { includeIncomplete?: boolean },
): boolean {
  return getActiveParticipantTracks(state, options).some((entry) => entry.trackType === trackType);
}

export function activateParticipantTrack(
  state: ParticipantTrackState,
  trackType: ParticipantTrackType,
  timestamp: string,
  overrides: Partial<Omit<ParticipantTrackEnrollment, "id" | "trackType" | "startedAt">> = {},
): ParticipantTrackState {
  const existingActive = state.enrollments.find(
    (entry) => entry.trackType === trackType && entry.status === "ACTIVE",
  );
  if (existingActive) {
    return {
      ...state,
      enrollments: state.enrollments.map((entry) =>
        entry.id !== existingActive.id
          ? entry
          : {
              ...entry,
              ...overrides,
              status: "ACTIVE",
              endedAt: null,
            },
      ),
    };
  }

  const nextEnrollment: ParticipantTrackEnrollment = {
    id: createTrackId(trackType, timestamp),
    trackType,
    status: "ACTIVE",
    setupStatus:
      overrides.setupStatus ?? (trackType === "recovery_only" ? "COMPLETE" : "IN_PROGRESS"),
    startedAt: timestamp,
    endedAt: null,
    linkedOrganizationId: overrides.linkedOrganizationId ?? null,
    linkedHouseId: overrides.linkedHouseId ?? null,
    linkedCourtProgramId: overrides.linkedCourtProgramId ?? null,
    linkedCourtProgramName: overrides.linkedCourtProgramName ?? null,
    courtTrackKind: overrides.courtTrackKind ?? null,
  };

  return {
    recoveryProfileCreatedAt: state.recoveryProfileCreatedAt ?? timestamp,
    enrollments: [nextEnrollment, ...state.enrollments],
  };
}

export function updateParticipantTrackSetup(
  state: ParticipantTrackState,
  trackType: ParticipantTrackType,
  setupStatus: ParticipantTrackSetupStatus,
  timestamp: string,
  overrides: Partial<Omit<ParticipantTrackEnrollment, "id" | "trackType" | "startedAt">> = {},
): ParticipantTrackState {
  const active = getLatestTrackEnrollment(state, trackType);
  if (!active || active.status !== "ACTIVE") {
    return activateParticipantTrack(state, trackType, timestamp, {
      ...overrides,
      setupStatus,
      status: "ACTIVE",
      endedAt: null,
    });
  }

  return {
    ...state,
    enrollments: state.enrollments.map((entry) =>
      entry.id !== active.id
        ? entry
        : {
            ...entry,
            ...overrides,
            setupStatus,
            status: "ACTIVE",
            endedAt: null,
          },
    ),
  };
}

export function endParticipantTrack(
  state: ParticipantTrackState,
  trackType: Exclude<ParticipantTrackType, "recovery_only">,
  timestamp: string,
): ParticipantTrackState {
  return {
    ...state,
    enrollments: state.enrollments.map((entry) =>
      entry.trackType !== trackType || entry.status !== "ACTIVE"
        ? entry
        : {
            ...entry,
            status: "INACTIVE",
            endedAt: timestamp,
          },
    ),
  };
}

export function buildEffectiveOnboardingPathFromTracks(
  state: ParticipantTrackState,
): OnboardingPath {
  if (hasActiveParticipantTrack(state, "sober_housing_resident")) {
    return "SOBER_HOUSE_RESIDENT";
  }
  if (hasActiveParticipantTrack(state, "court_participant")) {
    return "COURT_PROGRAM";
  }
  return "RECOVERY";
}

export function buildLegacyWizardStateFromTracks(state: ParticipantTrackState): {
  onboardingPath: OnboardingPath;
  wizardSupervisionMode: "INDEPENDENT" | "SOBER_HOUSE_RESIDENT";
  wizardJusticeTrack: SetupJusticeTrack;
} {
  const residentTrack = getLatestTrackEnrollment(state, "sober_housing_resident");
  const courtTrack = getLatestTrackEnrollment(state, "court_participant");
  if (residentTrack?.status === "ACTIVE" && residentTrack.setupStatus === "COMPLETE") {
    return {
      onboardingPath: "SOBER_HOUSE_RESIDENT",
      wizardSupervisionMode: "SOBER_HOUSE_RESIDENT",
      wizardJusticeTrack: "NONE",
    };
  }
  if (courtTrack?.status === "ACTIVE" && courtTrack.setupStatus === "COMPLETE") {
    return {
      onboardingPath: "COURT_PROGRAM",
      wizardSupervisionMode: "INDEPENDENT",
      wizardJusticeTrack: courtTrack.courtTrackKind ?? "DRUG_COURT",
    };
  }
  return {
    onboardingPath: "RECOVERY",
    wizardSupervisionMode: "INDEPENDENT",
    wizardJusticeTrack: "NONE",
  };
}

export function labelForParticipantTrack(trackType: ParticipantTrackType): string {
  switch (trackType) {
    case "recovery_only":
      return "Recovery";
    case "sober_housing_resident":
      return "Sober Housing Resident";
    case "court_participant":
      return "Court Participant";
    default:
      return "Program";
  }
}

export function participantTrackDescription(track: ParticipantTrackEnrollment): string {
  if (track.trackType === "recovery_only") {
    return "Your base recovery profile and routines.";
  }
  if (track.trackType === "sober_housing_resident") {
    return track.linkedHouseId
      ? `Resident track linked to house ${track.linkedHouseId}.`
      : "Resident requirements and sober-house accountability.";
  }
  return track.linkedCourtProgramName
    ? `Court/program track for ${track.linkedCourtProgramName}.`
    : "Court or supervision requirements.";
}

export function canSelfManageParticipantTrack(trackType: ParticipantTrackType): boolean {
  return trackType === "sober_housing_resident" || trackType === "court_participant";
}
