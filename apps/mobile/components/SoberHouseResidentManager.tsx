import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  applyHouseDefaultsToResidentDraft,
  createResidentConsentRecordFromDraft,
  createResidentHousingProfileFromDraft,
  createResidentRequirementProfileFromDraft,
  createResidentWizardDraftFromProfiles,
  persistResidentConsentArtifact,
} from "../lib/soberHouse/resident";
import {
  saveResidentWizardDraft,
  upsertResidentConsentRecord,
  upsertResidentHousingProfile,
  upsertResidentRequirementProfile,
} from "../lib/soberHouse/mutations";
import type {
  AuditActor,
  ResidentOnboardingStep,
  ResidentWizardDraft,
  SoberHouseSettingsStore,
} from "../lib/soberHouse/types";
import { AppButton } from "../lib/ui/AppButton";
import { colors, radius, spacing, typography } from "../lib/theme/tokens";
import { GlassCard } from "../lib/ui/GlassCard";
import {
  loadSignatureFileSystemModule,
  normalizeSignatureValueToRef,
  type SignatureRef,
} from "../lib/signatures/signatureStore";

const INPUT_PLACEHOLDER_COLOR = "rgba(245,243,255,0.45)";
const STEP_TITLES: Record<ResidentOnboardingStep, string> = {
  1: "Identity and placement",
  2: "House role",
  3: "Employment",
  4: "Meetings",
  5: "Sponsor",
  6: "Curfew and exceptions",
  7: "Chores",
  8: "Consent",
};

type PersistOptions = {
  showStatus?: boolean;
};

type Props = {
  store: SoberHouseSettingsStore;
  actor: AuditActor;
  linkedUserId: string;
  isSaving: boolean;
  onPersist: (
    nextStore: SoberHouseSettingsStore,
    successMessage: string,
    options?: PersistOptions,
  ) => Promise<void>;
};

type SignaturePoint = {
  x: number;
  y: number;
  isStrokeStart: boolean;
};

function normalizeIntegerInput(value: string): string {
  return value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
}

function isValidDateInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTimeInput(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function parseNonNegativeInt(value: string, fallback = 0): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function buildSignatureSvgMarkup(
  points: SignaturePoint[],
  width: number,
  height: number,
): string | null {
  if (points.length < 1) {
    return null;
  }

  const sourcePoints =
    points.length === 1
      ? [
          points[0],
          { ...points[0], x: points[0].x + 0.1, y: points[0].y + 0.1, isStrokeStart: false },
        ]
      : points;
  const path = sourcePoints
    .map(
      (point, index) =>
        `${index === 0 || point.isStrokeStart ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
    )
    .join(" ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(
    height,
  )}" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function formatSignedAt(value: string | null): string {
  if (!value) {
    return "Not signed";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.chip, selected ? styles.chipSelected : null]} onPress={onPress}>
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

export function SoberHouseResidentManager({
  store,
  actor,
  linkedUserId,
  isSaving,
  onPersist,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [wizardStep, setWizardStep] = useState<ResidentOnboardingStep>(1);
  const [draft, setDraft] = useState<ResidentWizardDraft>(() =>
    createResidentWizardDraftFromProfiles(linkedUserId, store),
  );
  const [residentStatus, setResidentStatus] = useState<string | null>(null);
  const [signaturePoints, setSignaturePoints] = useState<SignaturePoint[]>([]);
  const [signatureCanvasSize, setSignatureCanvasSize] = useState({ width: 320, height: 160 });

  useEffect(() => {
    const nextDraft = createResidentWizardDraftFromProfiles(linkedUserId, store);
    setDraft(nextDraft);
    setWizardStep(nextDraft.currentStep);
  }, [
    linkedUserId,
    store.residentWizardDraft,
    store.residentHousingProfile,
    store.residentRequirementProfile,
    store.residentConsentRecord,
  ]);

  const signaturePreviewPath = useMemo(
    () =>
      signaturePoints
        .map(
          (point, index) =>
            `${index === 0 || point.isStrokeStart ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
        )
        .join(" "),
    [signaturePoints],
  );

  const assignedHouse = useMemo(
    () => store.houses.find((house) => house.id === draft.assignedHouseId) ?? null,
    [draft.assignedHouseId, store.houses],
  );

  const startWizard = useCallback(() => {
    const nextDraft = createResidentWizardDraftFromProfiles(linkedUserId, store);
    setDraft(nextDraft);
    setWizardStep(1);
    setResidentStatus(null);
    setSignaturePoints([]);
    setIsEditing(true);
  }, [linkedUserId, store]);

  const persistDraftAtStep = useCallback(
    async (nextDraft: ResidentWizardDraft, step: ResidentOnboardingStep) => {
      const draftWithStep = {
        ...nextDraft,
        currentStep: step,
        updatedAt: new Date().toISOString(),
      };
      setDraft(draftWithStep);
      setWizardStep(step);
      const nextStore = saveResidentWizardDraft(store, draftWithStep);
      await onPersist(nextStore, "Resident wizard draft saved.", { showStatus: false });
    },
    [onPersist, store],
  );

  const updateDraft = useCallback(
    (updater: (current: ResidentWizardDraft) => ResidentWizardDraft) => {
      setDraft((current) => updater(current));
    },
    [],
  );

  const nextStep = useCallback(async () => {
    setResidentStatus(null);
    if (wizardStep === 1) {
      if (!draft.firstName.trim() || !draft.lastName.trim()) {
        setResidentStatus("Resident first and last name are required.");
        return;
      }
      if (!draft.assignedHouseId) {
        setResidentStatus("Assign the resident to a house.");
        return;
      }
      if (!isValidDateInput(draft.moveInDate)) {
        setResidentStatus("Move-in date must be YYYY-MM-DD.");
        return;
      }
    }

    if (wizardStep === 3) {
      if (draft.workRequired && draft.currentlyEmployed) {
        if (!draft.employerName.trim() || !draft.employerAddress.trim()) {
          setResidentStatus("Employer name and address are required.");
          return;
        }
      }
      if (
        draft.workRequired &&
        !draft.currentlyEmployed &&
        draft.jobApplicationsRequiredPerWeek < 1
      ) {
        setResidentStatus("Enter required job applications per week.");
        return;
      }
    }

    if (wizardStep === 4 && draft.meetingsRequiredWeekly && draft.meetingsRequiredCount < 1) {
      setResidentStatus("Enter meetings required per week.");
      return;
    }

    if (wizardStep === 5 && draft.sponsorPresent) {
      if (
        !draft.sponsorName.trim() ||
        !draft.sponsorPhone.trim() ||
        !draft.sponsorContactFrequency.trim()
      ) {
        setResidentStatus("Sponsor name, phone, and contact cadence are required.");
        return;
      }
    }

    if (wizardStep === 6 && draft.residentCurfewOverrideEnabled) {
      if (
        !isValidTimeInput(draft.residentCurfewWeekday) ||
        !isValidTimeInput(draft.residentCurfewFriday) ||
        !isValidTimeInput(draft.residentCurfewSaturday) ||
        !isValidTimeInput(draft.residentCurfewSunday)
      ) {
        setResidentStatus("All curfew override times must be HH:MM.");
        return;
      }
    }

    if (wizardStep >= 8) {
      return;
    }
    await persistDraftAtStep(draft, (wizardStep + 1) as ResidentOnboardingStep);
  }, [draft, persistDraftAtStep, wizardStep]);

  const previousStep = useCallback(async () => {
    setResidentStatus(null);
    if (wizardStep <= 1) {
      return;
    }
    await persistDraftAtStep(draft, (wizardStep - 1) as ResidentOnboardingStep);
  }, [draft, persistDraftAtStep, wizardStep]);

  const addSignaturePoint = useCallback(
    (event: GestureResponderEvent, isStrokeStart = false) => {
      const x = Math.max(0, Math.min(signatureCanvasSize.width, event.nativeEvent.locationX));
      const y = Math.max(0, Math.min(signatureCanvasSize.height, event.nativeEvent.locationY));
      setSignaturePoints((previous) => {
        if (previous.length === 0 || isStrokeStart) {
          return [...previous, { x, y, isStrokeStart }];
        }

        const last = previous[previous.length - 1];
        const deltaX = x - last.x;
        const deltaY = y - last.y;
        const distance = Math.hypot(deltaX, deltaY);
        if (!Number.isFinite(distance) || distance < 0.8) {
          return previous;
        }

        const samples = Math.max(1, Math.ceil(distance / 1.5));
        const additions: SignaturePoint[] = [];
        for (let index = 1; index <= samples; index += 1) {
          const ratio = index / samples;
          additions.push({
            x: last.x + deltaX * ratio,
            y: last.y + deltaY * ratio,
            isStrokeStart: false,
          });
        }
        return [...previous, ...additions];
      });
    },
    [signatureCanvasSize.height, signatureCanvasSize.width],
  );

  const persistSignatureFromCanvas = useCallback(async (): Promise<SignatureRef | null> => {
    const svg = buildSignatureSvgMarkup(
      signaturePoints,
      signatureCanvasSize.width,
      signatureCanvasSize.height,
    );
    if (!svg) {
      return null;
    }
    const fileSystem = loadSignatureFileSystemModule();
    const result = await normalizeSignatureValueToRef(svg, {
      fileSystem,
      recordId: `resident-consent-${linkedUserId}`,
      subdirectory: `signatures/${linkedUserId}/resident-consent`,
      verifyFileExists: false,
    });
    return result.ref;
  }, [linkedUserId, signatureCanvasSize.height, signatureCanvasSize.width, signaturePoints]);

  const saveAndFinish = useCallback(async () => {
    setResidentStatus(null);
    if (
      !draft.consentToHouseRules ||
      !draft.consentToLocationVerification ||
      !draft.consentToComplianceDocumentation
    ) {
      setResidentStatus("All three acknowledgments are required.");
      return;
    }

    let signatureRef = draft.consentSignatureRef;
    let signedAt = draft.consentSignedAt;
    if (!signatureRef) {
      signatureRef = await persistSignatureFromCanvas();
      if (!signatureRef) {
        setResidentStatus("Draw a signature before finishing.");
        return;
      }
      signedAt = new Date().toISOString();
    }

    const now = new Date().toISOString();
    let nextStore = saveResidentWizardDraft(store, {
      ...draft,
      consentSignatureRef: signatureRef,
      consentSignedAt: signedAt,
      currentStep: 8,
      updatedAt: now,
    });
    const housingProfile = createResidentHousingProfileFromDraft(
      nextStore,
      linkedUserId,
      draft,
      now,
    );
    const housingResult = upsertResidentHousingProfile(nextStore, actor, housingProfile, now);
    nextStore = housingResult.store;

    const requirementProfile = createResidentRequirementProfileFromDraft(
      nextStore,
      linkedUserId,
      draft,
      now,
    );
    const requirementResult = upsertResidentRequirementProfile(
      nextStore,
      actor,
      requirementProfile,
      now,
    );
    nextStore = requirementResult.store;

    const consentDraft = {
      ...draft,
      consentSignatureRef: signatureRef,
      consentSignedAt: signedAt,
    };
    let consentRecord = createResidentConsentRecordFromDraft(
      nextStore,
      linkedUserId,
      consentDraft,
      now,
    );
    const artifactRef = await persistResidentConsentArtifact({
      consent: consentRecord,
      residentHousingProfile: housingProfile,
      residentRequirementProfile: requirementProfile,
    });
    consentRecord = {
      ...consentRecord,
      acknowledgmentArtifactRef: artifactRef,
      updatedAt: now,
    };
    const consentResult = upsertResidentConsentRecord(nextStore, actor, consentRecord, now);
    nextStore = saveResidentWizardDraft(consentResult.store, null);

    await onPersist(nextStore, "Resident sober-house profile saved.");
    setIsEditing(false);
    setSignaturePoints([]);
    setResidentStatus("Resident sober-house profile saved.");
  }, [actor, draft, linkedUserId, onPersist, persistSignatureFromCanvas, store]);

  const residentComplete =
    store.residentHousingProfile !== null &&
    store.residentRequirementProfile !== null &&
    store.residentConsentRecord !== null;

  return (
    <GlassCard style={styles.card} strong>
      <Text style={styles.title}>Resident Sober-House Profile</Text>
      <Text style={styles.meta}>
        Capture resident placement, requirement branches, and consent acknowledgment on top of the
        sober-house settings foundation.
      </Text>

      {!residentComplete && !isEditing ? (
        <View style={styles.buttonRow}>
          <AppButton title="Start resident wizard" onPress={startWizard} />
        </View>
      ) : null}

      {residentComplete && !isEditing ? (
        <>
          <View style={styles.entityCard}>
            <Text style={styles.entityTitle}>
              {store.residentHousingProfile?.firstName} {store.residentHousingProfile?.lastName}
            </Text>
            <Text style={styles.entityMeta}>
              House:{" "}
              {store.houses.find((house) => house.id === store.residentHousingProfile?.houseId)
                ?.name ?? "Unassigned"}
            </Text>
            <Text style={styles.entityMeta}>
              Move-in: {store.residentHousingProfile?.moveInDate || "Not set"} • Room/Bed:{" "}
              {store.residentHousingProfile?.roomOrBed || "Not set"}
            </Text>
            <Text style={styles.entityMeta}>
              Program phase: {store.residentHousingProfile?.programPhaseOnEntry || "Not set"}
            </Text>
            <Text style={styles.entityMeta}>
              Role flags: {store.residentRequirementProfile?.isHouseManager ? "House manager " : ""}
              {store.residentRequirementProfile?.isHouseOwner ? "House owner" : ""}
              {!store.residentRequirementProfile?.isHouseManager &&
              !store.residentRequirementProfile?.isHouseOwner
                ? "Resident"
                : ""}
            </Text>
            <Text style={styles.entityMeta}>
              Work:{" "}
              {store.residentRequirementProfile?.workRequired
                ? store.residentRequirementProfile.currentlyEmployed
                  ? `Required, employed at ${store.residentRequirementProfile.employerName || "Employer on file"}`
                  : `Required, ${store.residentRequirementProfile.jobApplicationsRequiredPerWeek} applications/week`
                : "Not required"}
            </Text>
            <Text style={styles.entityMeta}>
              Meetings:{" "}
              {store.residentRequirementProfile?.meetingsRequiredWeekly
                ? `${store.residentRequirementProfile.meetingsRequiredCount} per week`
                : "Not required"}
            </Text>
            <Text style={styles.entityMeta}>
              Sponsor:{" "}
              {store.residentRequirementProfile?.sponsorPresent
                ? `${store.residentRequirementProfile.sponsorName} • ${store.residentRequirementProfile.sponsorContactFrequency}`
                : "None"}
            </Text>
            <Text style={styles.entityMeta}>
              Curfew override:{" "}
              {store.residentRequirementProfile?.residentCurfewOverrideEnabled
                ? `${store.residentRequirementProfile.residentCurfewWeekday} weekdays`
                : "None"}
            </Text>
            <Text style={styles.entityMeta}>
              Chores: {store.residentRequirementProfile?.assignedChoreNotes || "None"}
            </Text>
            <Text style={styles.entityMeta}>
              Consent: signed {formatSignedAt(store.residentConsentRecord?.signedAt ?? null)}
            </Text>
          </View>
          <View style={styles.buttonRow}>
            <AppButton title="Edit resident profile" onPress={startWizard} variant="secondary" />
          </View>
        </>
      ) : null}

      {isEditing ? (
        <>
          <Text style={styles.stepText}>
            Step {wizardStep} of 8 • {STEP_TITLES[wizardStep]}
          </Text>

          {wizardStep === 1 ? (
            <>
              <Text style={styles.label}>First name</Text>
              <TextInput
                style={styles.input}
                value={draft.firstName}
                onChangeText={(value) =>
                  updateDraft((current) => ({ ...current, firstName: value }))
                }
                placeholder="First name"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />
              <Text style={styles.label}>Last name</Text>
              <TextInput
                style={styles.input}
                value={draft.lastName}
                onChangeText={(value) =>
                  updateDraft((current) => ({ ...current, lastName: value }))
                }
                placeholder="Last name"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />
              <Text style={styles.label}>Assigned house</Text>
              <View style={styles.chipRow}>
                {store.houses.map((house) => (
                  <Chip
                    key={house.id}
                    label={house.name}
                    selected={draft.assignedHouseId === house.id}
                    onPress={() =>
                      setDraft((current) =>
                        applyHouseDefaultsToResidentDraft(store, linkedUserId, house.id, current),
                      )
                    }
                  />
                ))}
              </View>
              <Text style={styles.label}>Move-in date</Text>
              <TextInput
                style={styles.input}
                value={draft.moveInDate}
                onChangeText={(value) =>
                  updateDraft((current) => ({ ...current, moveInDate: value }))
                }
                placeholder="YYYY-MM-DD"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />
              <Text style={styles.label}>Room / bed</Text>
              <TextInput
                style={styles.input}
                value={draft.roomOrBed}
                onChangeText={(value) =>
                  updateDraft((current) => ({ ...current, roomOrBed: value }))
                }
                placeholder="Room 2 / Bed B"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />
              <Text style={styles.label}>Emergency contact name</Text>
              <TextInput
                style={styles.input}
                value={draft.emergencyContactName}
                onChangeText={(value) =>
                  updateDraft((current) => ({ ...current, emergencyContactName: value }))
                }
                placeholder="Emergency contact"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />
              <Text style={styles.label}>Emergency contact phone</Text>
              <TextInput
                style={styles.input}
                value={draft.emergencyContactPhone}
                onChangeText={(value) =>
                  updateDraft((current) => ({ ...current, emergencyContactPhone: value }))
                }
                keyboardType="phone-pad"
                placeholder="(555) 555-1212"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />
              <Text style={styles.label}>Program phase on entry</Text>
              <TextInput
                style={styles.input}
                value={draft.programPhaseOnEntry}
                onChangeText={(value) =>
                  updateDraft((current) => ({ ...current, programPhaseOnEntry: value }))
                }
                placeholder="Phase 1"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
              />
              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={draft.housingNotes}
                onChangeText={(value) =>
                  updateDraft((current) => ({ ...current, housingNotes: value }))
                }
                placeholder="Optional housing notes"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                multiline
              />
            </>
          ) : null}

          {wizardStep === 2 ? (
            <>
              <ToggleRow
                label="House manager"
                value={draft.isHouseManager}
                onValueChange={(value) =>
                  updateDraft((current) => ({ ...current, isHouseManager: value }))
                }
              />
              <ToggleRow
                label="House owner"
                value={draft.isHouseOwner}
                onValueChange={(value) =>
                  updateDraft((current) => ({ ...current, isHouseOwner: value }))
                }
              />
              <ToggleRow
                label="Want real-time violation alerts"
                value={draft.wantsRealTimeViolationAlerts}
                onValueChange={(value) =>
                  updateDraft((current) => ({ ...current, wantsRealTimeViolationAlerts: value }))
                }
              />
              <ToggleRow
                label="Want near-miss alerts"
                value={draft.wantsNearMissAlerts}
                onValueChange={(value) =>
                  updateDraft((current) => ({ ...current, wantsNearMissAlerts: value }))
                }
              />
              <ToggleRow
                label="Want monthly summary reports"
                value={draft.wantsMonthlySummaryReports}
                onValueChange={(value) =>
                  updateDraft((current) => ({ ...current, wantsMonthlySummaryReports: value }))
                }
              />
            </>
          ) : null}

          {wizardStep === 3 ? (
            <>
              <ToggleRow
                label="Required to work"
                value={draft.workRequired}
                onValueChange={(value) =>
                  updateDraft((current) => ({
                    ...current,
                    workRequired: value,
                    currentlyEmployed: value ? current.currentlyEmployed : false,
                    employerName: value ? current.employerName : "",
                    employerAddress: value ? current.employerAddress : "",
                    employerPhone: value ? current.employerPhone : "",
                    expectedWorkScheduleNotes: value ? current.expectedWorkScheduleNotes : "",
                    jobApplicationsRequiredPerWeek: value
                      ? current.jobApplicationsRequiredPerWeek
                      : 0,
                  }))
                }
              />
              {draft.workRequired ? (
                <>
                  <ToggleRow
                    label="Currently employed"
                    value={draft.currentlyEmployed}
                    onValueChange={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        currentlyEmployed: value,
                        employerName: value ? current.employerName : "",
                        employerAddress: value ? current.employerAddress : "",
                        employerPhone: value ? current.employerPhone : "",
                        expectedWorkScheduleNotes: value ? current.expectedWorkScheduleNotes : "",
                      }))
                    }
                  />
                  {draft.currentlyEmployed ? (
                    <>
                      <Text style={styles.label}>Employer name</Text>
                      <TextInput
                        style={styles.input}
                        value={draft.employerName}
                        onChangeText={(value) =>
                          updateDraft((current) => ({ ...current, employerName: value }))
                        }
                        placeholder="Employer name"
                        placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                      />
                      <Text style={styles.label}>Employer address</Text>
                      <TextInput
                        style={styles.input}
                        value={draft.employerAddress}
                        onChangeText={(value) =>
                          updateDraft((current) => ({ ...current, employerAddress: value }))
                        }
                        placeholder="Employer address"
                        placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                      />
                      <Text style={styles.label}>Employer phone</Text>
                      <TextInput
                        style={styles.input}
                        value={draft.employerPhone}
                        onChangeText={(value) =>
                          updateDraft((current) => ({ ...current, employerPhone: value }))
                        }
                        keyboardType="phone-pad"
                        placeholder="(555) 555-3131"
                        placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                      />
                      <Text style={styles.label}>Expected work schedule notes</Text>
                      <TextInput
                        style={[styles.input, styles.multilineInput]}
                        value={draft.expectedWorkScheduleNotes}
                        onChangeText={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            expectedWorkScheduleNotes: value,
                          }))
                        }
                        placeholder="Expected schedule notes"
                        placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                        multiline
                      />
                    </>
                  ) : (
                    <>
                      <Text style={styles.label}>Job applications required per week</Text>
                      <TextInput
                        style={styles.input}
                        value={String(draft.jobApplicationsRequiredPerWeek)}
                        onChangeText={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            jobApplicationsRequiredPerWeek: parseNonNegativeInt(
                              normalizeIntegerInput(value),
                              0,
                            ),
                          }))
                        }
                        keyboardType="number-pad"
                        placeholder="5"
                        placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                      />
                    </>
                  )}
                </>
              ) : (
                <Text style={styles.meta}>Employment-specific fields are skipped.</Text>
              )}
            </>
          ) : null}

          {wizardStep === 4 ? (
            <>
              <ToggleRow
                label="Meetings required weekly"
                value={draft.meetingsRequiredWeekly}
                onValueChange={(value) =>
                  updateDraft((current) => ({
                    ...current,
                    meetingsRequiredWeekly: value,
                    meetingsRequiredCount: value ? current.meetingsRequiredCount : 0,
                  }))
                }
              />
              {draft.meetingsRequiredWeekly ? (
                <>
                  <Text style={styles.label}>Meetings required count</Text>
                  <TextInput
                    style={styles.input}
                    value={String(draft.meetingsRequiredCount)}
                    onChangeText={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        meetingsRequiredCount: parseNonNegativeInt(normalizeIntegerInput(value), 0),
                      }))
                    }
                    keyboardType="number-pad"
                    placeholder="4"
                    placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  />
                </>
              ) : (
                <Text style={styles.meta}>Meeting requirement details are skipped.</Text>
              )}
            </>
          ) : null}

          {wizardStep === 5 ? (
            <>
              <ToggleRow
                label="Sponsor present"
                value={draft.sponsorPresent}
                onValueChange={(value) =>
                  updateDraft((current) => ({
                    ...current,
                    sponsorPresent: value,
                    sponsorName: value ? current.sponsorName : "",
                    sponsorPhone: value ? current.sponsorPhone : "",
                    sponsorContactFrequency: value ? current.sponsorContactFrequency : "",
                  }))
                }
              />
              {draft.sponsorPresent ? (
                <>
                  <Text style={styles.label}>Sponsor name</Text>
                  <TextInput
                    style={styles.input}
                    value={draft.sponsorName}
                    onChangeText={(value) =>
                      updateDraft((current) => ({ ...current, sponsorName: value }))
                    }
                    placeholder="Sponsor name"
                    placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  />
                  <Text style={styles.label}>Sponsor phone</Text>
                  <TextInput
                    style={styles.input}
                    value={draft.sponsorPhone}
                    onChangeText={(value) =>
                      updateDraft((current) => ({ ...current, sponsorPhone: value }))
                    }
                    keyboardType="phone-pad"
                    placeholder="(555) 555-4242"
                    placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  />
                  <Text style={styles.label}>Required sponsor contact cadence</Text>
                  <TextInput
                    style={styles.input}
                    value={draft.sponsorContactFrequency}
                    onChangeText={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        sponsorContactFrequency: value,
                      }))
                    }
                    placeholder="3 per week"
                    placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  />
                </>
              ) : (
                <Text style={styles.meta}>Sponsor details are skipped.</Text>
              )}
            </>
          ) : null}

          {wizardStep === 6 ? (
            <>
              <ToggleRow
                label="Resident has curfew override"
                value={draft.residentCurfewOverrideEnabled}
                onValueChange={(value) =>
                  updateDraft((current) => ({
                    ...current,
                    residentCurfewOverrideEnabled: value,
                    residentCurfewWeekday: value ? current.residentCurfewWeekday : "",
                    residentCurfewFriday: value ? current.residentCurfewFriday : "",
                    residentCurfewSaturday: value ? current.residentCurfewSaturday : "",
                    residentCurfewSunday: value ? current.residentCurfewSunday : "",
                  }))
                }
              />
              {draft.residentCurfewOverrideEnabled ? (
                <>
                  <Text style={styles.label}>Weekday curfew</Text>
                  <TextInput
                    style={styles.input}
                    value={draft.residentCurfewWeekday}
                    onChangeText={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        residentCurfewWeekday: value,
                      }))
                    }
                    placeholder="22:00"
                    placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  />
                  <Text style={styles.label}>Friday curfew</Text>
                  <TextInput
                    style={styles.input}
                    value={draft.residentCurfewFriday}
                    onChangeText={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        residentCurfewFriday: value,
                      }))
                    }
                    placeholder="23:00"
                    placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  />
                  <Text style={styles.label}>Saturday curfew</Text>
                  <TextInput
                    style={styles.input}
                    value={draft.residentCurfewSaturday}
                    onChangeText={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        residentCurfewSaturday: value,
                      }))
                    }
                    placeholder="23:00"
                    placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  />
                  <Text style={styles.label}>Sunday curfew</Text>
                  <TextInput
                    style={styles.input}
                    value={draft.residentCurfewSunday}
                    onChangeText={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        residentCurfewSunday: value,
                      }))
                    }
                    placeholder="22:00"
                    placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  />
                </>
              ) : (
                <Text style={styles.meta}>Curfew override details are skipped.</Text>
              )}
              <Text style={styles.label}>Standing exception notes</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={draft.standingExceptionNotes}
                onChangeText={(value) =>
                  updateDraft((current) => ({ ...current, standingExceptionNotes: value }))
                }
                placeholder="Standing exception notes"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                multiline
              />
            </>
          ) : null}

          {wizardStep === 7 ? (
            <>
              <Text style={styles.label}>Assigned chore notes / summary</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={draft.assignedChoreNotes}
                onChangeText={(value) =>
                  updateDraft((current) => ({ ...current, assignedChoreNotes: value }))
                }
                placeholder="Assigned chores"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                multiline
              />
              <Text style={styles.label}>Resident-specific proof note / override</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={draft.proofTypeOverrideNotes}
                onChangeText={(value) =>
                  updateDraft((current) => ({ ...current, proofTypeOverrideNotes: value }))
                }
                placeholder="Proof-type override notes"
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                multiline
              />
            </>
          ) : null}

          {wizardStep === 8 ? (
            <>
              <ToggleRow
                label="Consent to house rules"
                value={draft.consentToHouseRules}
                onValueChange={(value) =>
                  updateDraft((current) => ({ ...current, consentToHouseRules: value }))
                }
              />
              <ToggleRow
                label="Consent to location verification"
                value={draft.consentToLocationVerification}
                onValueChange={(value) =>
                  updateDraft((current) => ({ ...current, consentToLocationVerification: value }))
                }
              />
              <ToggleRow
                label="Consent to compliance documentation"
                value={draft.consentToComplianceDocumentation}
                onValueChange={(value) =>
                  updateDraft((current) => ({
                    ...current,
                    consentToComplianceDocumentation: value,
                  }))
                }
              />
              <Text style={styles.meta}>
                House: {assignedHouse?.name ?? "Not assigned"} • Current signed status:{" "}
                {formatSignedAt(draft.consentSignedAt)}
              </Text>
              <View style={styles.signatureCanvasWrap}>
                <View
                  style={styles.signatureCanvas}
                  onLayout={(event) => {
                    const { width, height } = event.nativeEvent.layout;
                    if (width > 0 && height > 0) {
                      setSignatureCanvasSize({ width, height });
                    }
                  }}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={(event) => addSignaturePoint(event, true)}
                  onResponderMove={addSignaturePoint}
                >
                  <Svg
                    viewBox={`0 0 ${Math.max(1, signatureCanvasSize.width)} ${Math.max(
                      1,
                      signatureCanvasSize.height,
                    )}`}
                    style={styles.signatureSvgOverlay}
                  >
                    {signaturePreviewPath.length > 0 ? (
                      <Path
                        d={signaturePreviewPath}
                        fill="none"
                        stroke="#0f172a"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : null}
                  </Svg>
                </View>
              </View>
              <View style={styles.buttonRow}>
                <AppButton
                  title="Clear signature"
                  variant="secondary"
                  onPress={() => {
                    setSignaturePoints([]);
                    updateDraft((current) => ({
                      ...current,
                      consentSignatureRef: null,
                      consentSignedAt: null,
                    }));
                  }}
                />
              </View>
            </>
          ) : null}

          {residentStatus ? <Text style={styles.statusText}>{residentStatus}</Text> : null}

          <View style={styles.buttonRow}>
            {wizardStep > 1 ? (
              <>
                <AppButton title="Back" variant="secondary" onPress={() => void previousStep()} />
                <View style={styles.buttonSpacer} />
              </>
            ) : null}
            {wizardStep < 8 ? (
              <AppButton title="Next" onPress={() => void nextStep()} disabled={isSaving} />
            ) : (
              <AppButton
                title="Save resident profile"
                onPress={() => void saveAndFinish()}
                disabled={isSaving}
              />
            )}
          </View>

          <View style={styles.buttonRow}>
            <AppButton
              title="Cancel"
              variant="secondary"
              onPress={() => {
                setIsEditing(false);
                setResidentStatus(null);
                setSignaturePoints([]);
              }}
            />
          </View>
        </>
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.h2,
    fontWeight: "700",
  },
  meta: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 18,
  },
  stepText: {
    color: colors.neonLavender,
    fontSize: typography.small,
    fontWeight: "700",
  },
  label: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: "600",
  },
  input: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: typography.body,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  chipSelected: {
    borderColor: colors.neonLavender,
    backgroundColor: "rgba(139, 92, 246, 0.24)",
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: "600",
  },
  chipTextSelected: {
    color: colors.textPrimary,
  },
  toggleRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  buttonSpacer: {
    width: spacing.sm,
  },
  entityCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: spacing.sm,
    gap: 4,
  },
  entityTitle: {
    color: colors.textPrimary,
    fontSize: typography.h3,
    fontWeight: "700",
  },
  entityMeta: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 18,
  },
  signatureCanvasWrap: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  signatureCanvas: {
    height: 160,
    backgroundColor: "#ffffff",
  },
  signatureSvgOverlay: {
    width: "100%",
    height: "100%",
  },
  statusText: {
    color: colors.neonLavender,
    fontSize: typography.small,
    fontWeight: "600",
  },
});
