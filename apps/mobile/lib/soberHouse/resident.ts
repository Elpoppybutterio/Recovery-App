import { loadSignatureFileSystemModule } from "../signatures/signatureStore";
import { formatIsoToUsDate, parseUsDateToIso } from "../dateInput";
import { formatUsPhoneDisplay } from "../phone";
import { createEntityId } from "./defaults";
import { getRuleSetForHouse } from "./selectors";
import type {
  ResidentConsentRecord,
  ResidentHousingProfile,
  ResidentOnboardingStep,
  ResidentRequirementProfile,
  ResidentWizardDraft,
  SoberHouseSettingsStore,
} from "./types";

export type ResidentSetupState = {
  complete: boolean;
  missingItems: string[];
  nextStep: ResidentOnboardingStep;
};

export function createDefaultResidentWizardDraft(linkedUserId: string): ResidentWizardDraft {
  return {
    linkedUserId,
    currentStep: 1,
    firstName: "",
    lastName: "",
    assignedHouseId: null,
    moveInDate: "",
    roomOrBed: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    programPhaseOnEntry: "",
    housingNotes: "",
    isHouseManager: false,
    isHouseOwner: false,
    wantsRealTimeViolationAlerts: false,
    wantsNearMissAlerts: false,
    wantsMonthlySummaryReports: false,
    oneOnOneRequired: false,
    oneOnOneAssignedStaffAssignmentId: null,
    oneOnOneFrequency: "WEEKLY",
    oneOnOneWeekday: "TUE",
    oneOnOneScheduledDate: null,
    oneOnOneTimeLocalHhmm: "15:00",
    oneOnOneLeadTimeMinutes: 30,
    oneOnOneAddToCalendar: true,
    oneOnOneReminderEnabled: true,
    workRequired: false,
    currentlyEmployed: false,
    employerName: "",
    employerAddress: "",
    employerPhone: "",
    expectedWorkScheduleNotes: "",
    jobApplicationsRequiredPerWeek: 0,
    meetingsRequiredWeekly: false,
    meetingsRequiredCount: 0,
    sponsorPresent: false,
    sponsorName: "",
    sponsorPhone: "",
    sponsorContactFrequency: "",
    residentCurfewOverrideEnabled: false,
    residentCurfewWeekday: "",
    residentCurfewFriday: "",
    residentCurfewSaturday: "",
    residentCurfewSunday: "",
    standingExceptionNotes: "",
    assignedChoreNotes: "",
    proofTypeOverrideNotes: "",
    consentToHouseRules: false,
    consentToLocationVerification: false,
    consentToComplianceDocumentation: false,
    consentSignatureRef: null,
    consentSignedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

export function createResidentWizardDraftFromProfiles(
  linkedUserId: string,
  store: SoberHouseSettingsStore,
): ResidentWizardDraft {
  if (store.residentWizardDraft) {
    return {
      ...store.residentWizardDraft,
      consentSignatureRef: store.residentWizardDraft.consentSignatureRef
        ? { ...store.residentWizardDraft.consentSignatureRef }
        : null,
    };
  }

  const housing = store.residentHousingProfile;
  const requirement = store.residentRequirementProfile;
  const consent = store.residentConsentRecord;
  const draft = createDefaultResidentWizardDraft(linkedUserId);

  if (!housing || !requirement) {
    return draft;
  }

  return {
    ...draft,
    currentStep: consent ? 8 : 7,
    firstName: housing.firstName,
    lastName: housing.lastName,
    assignedHouseId: housing.houseId,
    moveInDate: formatIsoToUsDate(housing.moveInDate),
    roomOrBed: housing.roomOrBed,
    emergencyContactName: housing.emergencyContactName,
    emergencyContactPhone: formatUsPhoneDisplay(housing.emergencyContactPhone),
    programPhaseOnEntry: housing.programPhaseOnEntry,
    housingNotes: housing.notes,
    isHouseManager: requirement.isHouseManager,
    isHouseOwner: requirement.isHouseOwner,
    wantsRealTimeViolationAlerts: requirement.wantsRealTimeViolationAlerts,
    wantsNearMissAlerts: requirement.wantsNearMissAlerts,
    wantsMonthlySummaryReports: requirement.wantsMonthlySummaryReports,
    oneOnOneRequired: requirement.oneOnOneRequired,
    oneOnOneAssignedStaffAssignmentId: requirement.oneOnOneAssignedStaffAssignmentId,
    oneOnOneFrequency: requirement.oneOnOneFrequency,
    oneOnOneWeekday: requirement.oneOnOneWeekday,
    oneOnOneScheduledDate: formatIsoToUsDate(requirement.oneOnOneScheduledDate),
    oneOnOneTimeLocalHhmm: requirement.oneOnOneTimeLocalHhmm,
    oneOnOneLeadTimeMinutes: requirement.oneOnOneLeadTimeMinutes,
    oneOnOneAddToCalendar: requirement.oneOnOneAddToCalendar,
    oneOnOneReminderEnabled: requirement.oneOnOneReminderEnabled,
    workRequired: requirement.workRequired,
    currentlyEmployed: requirement.currentlyEmployed,
    employerName: requirement.employerName,
    employerAddress: requirement.employerAddress,
    employerPhone: formatUsPhoneDisplay(requirement.employerPhone),
    expectedWorkScheduleNotes: requirement.expectedWorkScheduleNotes,
    jobApplicationsRequiredPerWeek: requirement.jobApplicationsRequiredPerWeek,
    meetingsRequiredWeekly: requirement.meetingsRequiredWeekly,
    meetingsRequiredCount: requirement.meetingsRequiredCount,
    sponsorPresent: requirement.sponsorPresent,
    sponsorName: requirement.sponsorName,
    sponsorPhone: formatUsPhoneDisplay(requirement.sponsorPhone),
    sponsorContactFrequency: requirement.sponsorContactFrequency,
    residentCurfewOverrideEnabled: requirement.residentCurfewOverrideEnabled,
    residentCurfewWeekday: requirement.residentCurfewWeekday,
    residentCurfewFriday: requirement.residentCurfewFriday,
    residentCurfewSaturday: requirement.residentCurfewSaturday,
    residentCurfewSunday: requirement.residentCurfewSunday,
    standingExceptionNotes: requirement.standingExceptionNotes,
    assignedChoreNotes: requirement.assignedChoreNotes,
    proofTypeOverrideNotes: requirement.proofTypeOverrideNotes,
    consentToHouseRules: consent?.consentToHouseRules ?? false,
    consentToLocationVerification: consent?.consentToLocationVerification ?? false,
    consentToComplianceDocumentation: consent?.consentToComplianceDocumentation ?? false,
    consentSignatureRef: consent?.signatureRef ? { ...consent.signatureRef } : null,
    consentSignedAt: consent?.signedAt ?? null,
    updatedAt: new Date().toISOString(),
  };
}

export function applyHouseDefaultsToResidentDraft(
  store: SoberHouseSettingsStore,
  linkedUserId: string,
  houseId: string | null,
  baseDraft?: ResidentWizardDraft,
): ResidentWizardDraft {
  const draft = baseDraft ? { ...baseDraft } : createDefaultResidentWizardDraft(linkedUserId);
  if (!houseId) {
    return { ...draft, assignedHouseId: null, updatedAt: new Date().toISOString() };
  }

  const now = new Date().toISOString();
  const ruleSet = getRuleSetForHouse(store, houseId, now);
  return {
    ...draft,
    assignedHouseId: houseId,
    oneOnOneRequired: ruleSet.oneOnOne.enabled,
    oneOnOneFrequency: ruleSet.oneOnOne.defaultFrequency,
    oneOnOneWeekday: ruleSet.oneOnOne.defaultWeekday,
    oneOnOneScheduledDate:
      ruleSet.oneOnOne.defaultFrequency === "ONCE" ? draft.oneOnOneScheduledDate : null,
    oneOnOneTimeLocalHhmm: ruleSet.oneOnOne.defaultTimeLocalHhmm,
    oneOnOneLeadTimeMinutes: ruleSet.oneOnOne.defaultLeadTimeMinutes,
    oneOnOneAddToCalendar: ruleSet.oneOnOne.addToCalendarByDefault,
    oneOnOneReminderEnabled: ruleSet.oneOnOne.reminderEnabledByDefault,
    workRequired: ruleSet.employment.employmentRequired,
    jobApplicationsRequiredPerWeek: ruleSet.jobSearch.applicationsRequiredPerWeek,
    meetingsRequiredWeekly: ruleSet.meetings.meetingsRequired,
    meetingsRequiredCount: ruleSet.meetings.meetingsPerWeek,
    sponsorPresent: ruleSet.sponsorContact.enabled ? true : draft.sponsorPresent,
    sponsorContactFrequency:
      ruleSet.sponsorContact.contactsRequiredPerWeek > 0
        ? `${ruleSet.sponsorContact.contactsRequiredPerWeek} per week`
        : "",
    residentCurfewWeekday: ruleSet.curfew.weekdayCurfew,
    residentCurfewFriday: ruleSet.curfew.fridayCurfew,
    residentCurfewSaturday: ruleSet.curfew.saturdayCurfew,
    residentCurfewSunday: ruleSet.curfew.sundayCurfew,
    updatedAt: now,
  };
}

export function createResidentHousingProfileFromDraft(
  store: SoberHouseSettingsStore,
  linkedUserId: string,
  draft: ResidentWizardDraft,
  now: string,
): ResidentHousingProfile {
  const existing = store.residentHousingProfile;
  const residentId = existing?.residentId ?? createEntityId("resident");
  return {
    id: existing?.id ?? createEntityId("resident-housing"),
    residentId,
    linkedUserId,
    organizationId: store.organization?.id ?? null,
    houseId: draft.assignedHouseId,
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim(),
    moveInDate: parseUsDateToIso(draft.moveInDate) ?? draft.moveInDate,
    roomOrBed: draft.roomOrBed.trim(),
    emergencyContactName: draft.emergencyContactName.trim(),
    emergencyContactPhone: formatUsPhoneDisplay(draft.emergencyContactPhone),
    programPhaseOnEntry: draft.programPhaseOnEntry.trim(),
    status: "ACTIVE",
    notes: draft.housingNotes.trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function createResidentRequirementProfileFromDraft(
  store: SoberHouseSettingsStore,
  linkedUserId: string,
  draft: ResidentWizardDraft,
  now: string,
  workplaceGeofence?: {
    lat: number;
    lng: number;
    radiusFeet: number;
  } | null,
): ResidentRequirementProfile {
  const existing = store.residentRequirementProfile;
  const residentId =
    store.residentHousingProfile?.residentId ?? existing?.residentId ?? createEntityId("resident");
  const ruleSet = draft.assignedHouseId
    ? getRuleSetForHouse(store, draft.assignedHouseId, now)
    : null;
  return {
    id: existing?.id ?? createEntityId("resident-requirements"),
    residentId,
    linkedUserId,
    organizationId: store.organization?.id ?? null,
    houseId: draft.assignedHouseId,
    sourceHouseRuleSetId: ruleSet?.id ?? null,
    inheritanceInitializedAt: now,
    workRequired: draft.workRequired,
    currentlyEmployed: draft.currentlyEmployed,
    employerName: draft.currentlyEmployed ? draft.employerName.trim() : "",
    employerAddress: draft.currentlyEmployed ? draft.employerAddress.trim() : "",
    employerPhone: draft.currentlyEmployed ? formatUsPhoneDisplay(draft.employerPhone) : "",
    workplaceGeofenceLat: draft.currentlyEmployed
      ? (workplaceGeofence?.lat ?? existing?.workplaceGeofenceLat ?? null)
      : null,
    workplaceGeofenceLng: draft.currentlyEmployed
      ? (workplaceGeofence?.lng ?? existing?.workplaceGeofenceLng ?? null)
      : null,
    workplaceGeofenceRadiusFeet: draft.currentlyEmployed
      ? (workplaceGeofence?.radiusFeet ?? existing?.workplaceGeofenceRadiusFeet ?? null)
      : null,
    workplaceGeofenceResolvedAt: draft.currentlyEmployed
      ? workplaceGeofence
        ? now
        : (existing?.workplaceGeofenceResolvedAt ?? null)
      : null,
    expectedWorkScheduleNotes: draft.currentlyEmployed
      ? draft.expectedWorkScheduleNotes.trim()
      : "",
    jobApplicationsRequiredPerWeek:
      draft.workRequired && !draft.currentlyEmployed ? draft.jobApplicationsRequiredPerWeek : 0,
    meetingsRequiredWeekly: draft.meetingsRequiredWeekly,
    meetingsRequiredCount: draft.meetingsRequiredWeekly ? draft.meetingsRequiredCount : 0,
    sponsorPresent: draft.sponsorPresent,
    sponsorName: draft.sponsorPresent ? draft.sponsorName.trim() : "",
    sponsorPhone: draft.sponsorPresent ? formatUsPhoneDisplay(draft.sponsorPhone) : "",
    sponsorContactFrequency: draft.sponsorPresent ? draft.sponsorContactFrequency.trim() : "",
    residentCurfewOverrideEnabled: draft.residentCurfewOverrideEnabled,
    residentCurfewWeekday: draft.residentCurfewOverrideEnabled ? draft.residentCurfewWeekday : "",
    residentCurfewFriday: draft.residentCurfewOverrideEnabled ? draft.residentCurfewFriday : "",
    residentCurfewSaturday: draft.residentCurfewOverrideEnabled ? draft.residentCurfewSaturday : "",
    residentCurfewSunday: draft.residentCurfewOverrideEnabled ? draft.residentCurfewSunday : "",
    standingExceptionNotes: draft.standingExceptionNotes.trim(),
    assignedChoreNotes: draft.assignedChoreNotes.trim(),
    proofTypeOverrideNotes: draft.proofTypeOverrideNotes.trim(),
    isHouseManager: draft.isHouseManager,
    isHouseOwner: draft.isHouseOwner,
    wantsRealTimeViolationAlerts: draft.wantsRealTimeViolationAlerts,
    wantsNearMissAlerts: draft.wantsNearMissAlerts,
    wantsMonthlySummaryReports: draft.wantsMonthlySummaryReports,
    oneOnOneRequired: draft.oneOnOneRequired,
    oneOnOneAssignedStaffAssignmentId: draft.oneOnOneAssignedStaffAssignmentId,
    oneOnOneFrequency: draft.oneOnOneRequired ? draft.oneOnOneFrequency : "WEEKLY",
    oneOnOneWeekday:
      draft.oneOnOneRequired && draft.oneOnOneFrequency !== "ONCE" ? draft.oneOnOneWeekday : null,
    oneOnOneScheduledDate:
      draft.oneOnOneRequired && draft.oneOnOneFrequency === "ONCE"
        ? (parseUsDateToIso(draft.oneOnOneScheduledDate ?? "") ?? draft.oneOnOneScheduledDate)
        : null,
    oneOnOneTimeLocalHhmm: draft.oneOnOneRequired ? draft.oneOnOneTimeLocalHhmm : "",
    oneOnOneLeadTimeMinutes: draft.oneOnOneRequired ? draft.oneOnOneLeadTimeMinutes : 0,
    oneOnOneAddToCalendar: draft.oneOnOneRequired ? draft.oneOnOneAddToCalendar : false,
    oneOnOneReminderEnabled: draft.oneOnOneRequired ? draft.oneOnOneReminderEnabled : false,
    oneOnOneCalendarEventId: existing?.oneOnOneCalendarEventId ?? null,
    oneOnOneScheduleFingerprint: existing?.oneOnOneScheduleFingerprint ?? null,
    oneOnOneNotificationIds: existing?.oneOnOneNotificationIds ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function getResidentSetupState(
  store: SoberHouseSettingsStore,
  linkedUserId: string,
): ResidentSetupState {
  const housing = store.residentHousingProfile;
  const requirements = store.residentRequirementProfile;
  const consent = store.residentConsentRecord;
  const draft =
    store.residentWizardDraft?.linkedUserId === linkedUserId ? store.residentWizardDraft : null;
  const now = new Date().toISOString();
  const houseId = housing?.houseId ?? draft?.assignedHouseId ?? null;
  const rules = houseId ? getRuleSetForHouse(store, houseId, now) : null;
  const missingItems: string[] = [];
  let nextStep: ResidentOnboardingStep = 1;

  const markMissing = (label: string, step: ResidentOnboardingStep) => {
    missingItems.push(label);
    if (step < nextStep || missingItems.length === 1) {
      nextStep = step;
    }
  };

  if (!housing?.firstName.trim() || !housing?.lastName.trim()) {
    markMissing("resident name", 1);
  }
  if (!housing?.houseId) {
    markMissing("assigned house", 1);
  }
  if (!housing?.moveInDate) {
    markMissing("move-in date", 1);
  }
  const hasEmergencyName = Boolean(housing?.emergencyContactName.trim());
  const hasEmergencyPhone = Boolean(housing?.emergencyContactPhone.trim());
  if ((hasEmergencyName || hasEmergencyPhone) && !(hasEmergencyName && hasEmergencyPhone)) {
    markMissing("complete emergency contact", 1);
  }

  const employmentRequired =
    (requirements?.workRequired ?? false) || (rules?.employment.employmentRequired ?? false);
  if (!requirements) {
    markMissing("resident requirements", 3);
  } else if (employmentRequired) {
    if (requirements.currentlyEmployed) {
      if (!requirements.employerName.trim() || !requirements.employerAddress.trim()) {
        markMissing("employer and work location", 3);
      }
    } else {
      const jobTarget = Math.max(
        requirements.jobApplicationsRequiredPerWeek,
        rules?.jobSearch.applicationsRequiredPerWeek ?? 0,
      );
      if (jobTarget <= 0) {
        markMissing("job application requirement", 3);
      }
    }
  }

  const meetingsRequired =
    (requirements?.meetingsRequiredWeekly ?? false) || (rules?.meetings.meetingsRequired ?? false);
  const meetingsTarget = Math.max(
    requirements?.meetingsRequiredCount ?? 0,
    rules?.meetings.meetingsPerWeek ?? 0,
  );
  if (meetingsRequired && meetingsTarget <= 0) {
    markMissing("weekly meeting target", 4);
  }

  const sponsorRequired = rules?.sponsorContact.enabled ?? false;
  if (sponsorRequired) {
    if (!requirements?.sponsorPresent) {
      markMissing("sponsor details", 5);
    } else if (
      !requirements.sponsorName.trim() ||
      !requirements.sponsorPhone.trim() ||
      !requirements.sponsorContactFrequency.trim()
    ) {
      markMissing("complete sponsor details", 5);
    }
  }

  if (
    !consent ||
    !consent.signatureRef ||
    !consent.signedAt ||
    !consent.consentToHouseRules ||
    !consent.consentToLocationVerification ||
    !consent.consentToComplianceDocumentation
  ) {
    markMissing("signed resident consent", 8);
  }

  return {
    complete:
      missingItems.length === 0 && housing !== null && requirements !== null && consent !== null,
    missingItems,
    nextStep,
  };
}

export function buildRulesVersionReference(
  store: SoberHouseSettingsStore,
  houseId: string | null,
  now: string,
): string | null {
  if (!houseId) {
    return null;
  }
  const ruleSet = getRuleSetForHouse(store, houseId, now);
  return `rule-set:${ruleSet.id}@${ruleSet.updatedAt}`;
}

export async function persistResidentConsentArtifact(input: {
  consent: ResidentConsentRecord;
  residentHousingProfile: ResidentHousingProfile;
  residentRequirementProfile: ResidentRequirementProfile;
}): Promise<string | null> {
  const fileSystem = loadSignatureFileSystemModule();
  if (!fileSystem) {
    return null;
  }
  const base = fileSystem.documentDirectory ?? fileSystem.cacheDirectory;
  if (!base) {
    return null;
  }
  const directory = `${base}sober-house-acknowledgments/`;
  const targetUri = `${directory}${input.consent.residentId}-${Date.now().toString(36)}.json`;

  try {
    await fileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const contents = JSON.stringify(
      {
        consent: input.consent,
        residentHousingProfile: input.residentHousingProfile,
        residentRequirementProfile: input.residentRequirementProfile,
      },
      null,
      2,
    );
    await fileSystem.writeAsStringAsync(targetUri, contents, {
      encoding: fileSystem.EncodingType?.UTF8 ?? "utf8",
    });
    return targetUri;
  } catch {
    return null;
  }
}

export function createResidentConsentRecordFromDraft(
  store: SoberHouseSettingsStore,
  linkedUserId: string,
  draft: ResidentWizardDraft,
  now: string,
): ResidentConsentRecord {
  const existing = store.residentConsentRecord;
  const residentId =
    store.residentHousingProfile?.residentId ??
    store.residentRequirementProfile?.residentId ??
    existing?.residentId ??
    createEntityId("resident");
  return {
    id: existing?.id ?? createEntityId("resident-consent"),
    residentId,
    linkedUserId,
    organizationId: store.organization?.id ?? null,
    houseId: draft.assignedHouseId,
    consentToHouseRules: draft.consentToHouseRules,
    consentToLocationVerification: draft.consentToLocationVerification,
    consentToComplianceDocumentation: draft.consentToComplianceDocumentation,
    signatureRef: draft.consentSignatureRef ? { ...draft.consentSignatureRef } : null,
    signedAt: draft.consentSignedAt ?? now,
    acknowledgmentArtifactRef: existing?.acknowledgmentArtifactRef ?? null,
    rulesVersionReference: buildRulesVersionReference(store, draft.assignedHouseId, now),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}
