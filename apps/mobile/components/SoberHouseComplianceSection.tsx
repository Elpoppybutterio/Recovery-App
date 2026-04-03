import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { loadAttendanceRecords, loadMeetingAttendanceLogs } from "../lib/attendance/storage";
import { getCurrentLocation, type LocationReadResult } from "../lib/services/locationService";
import {
  evaluateResidentCompliance,
  getEvaluationsNeedingAttention,
  statusToneForComplianceStatus,
} from "../lib/soberHouse/compliance";
import { createEntityId } from "../lib/soberHouse/defaults";
import {
  upsertChoreCompletionRecord,
  upsertHouseMeetingAttendanceRecord,
  upsertJobApplicationRecord,
  upsertWorkVerificationRecord,
} from "../lib/soberHouse/mutations";
import {
  attachSoberHouseRoutineProof,
  buildSoberHouseRoutineSummary,
  type SoberHouseRoutineTask,
} from "../lib/soberHouse/routine";
import {
  choreRequiresManagerConfirmation,
  choreRequiresPhotoProof,
  formatChoreProofModeLabel,
  resolveChoreProofMode,
} from "../lib/soberHouse/proof";
import {
  getHouseById,
  getHouseChoresForResident,
  getRuleSetForHouse,
} from "../lib/soberHouse/selectors";
import type {
  AuditActor,
  ComplianceEvaluation,
  HouseChore,
  ManagerConfirmationHandoffMethod,
  SoberHouseSettingsStore,
} from "../lib/soberHouse/types";
import { colors, radius, spacing, typography } from "../lib/theme/tokens";
import { AppButton } from "../lib/ui/AppButton";
import { GlassCard } from "../lib/ui/GlassCard";

type OptionalImagePickerModule = {
  requestCameraPermissionsAsync: () => Promise<{ granted: boolean }>;
  launchCameraAsync: (options: {
    mediaTypes: unknown;
    allowsEditing: boolean;
    quality: number;
  }) => Promise<{ canceled: boolean; assets?: Array<{ uri?: string | null }> }>;
  MediaTypeOptions: {
    Images: unknown;
  };
};

let imagePickerModulePromise: Promise<OptionalImagePickerModule | null> | null = null;

async function loadImagePickerModule(): Promise<OptionalImagePickerModule | null> {
  if (!imagePickerModulePromise) {
    imagePickerModulePromise = import("expo-image-picker")
      .then((module) => module as OptionalImagePickerModule)
      .catch(() => null);
  }
  return imagePickerModulePromise;
}

type PersistOptions = {
  showStatus?: boolean;
};

type Props = {
  userId: string;
  store: SoberHouseSettingsStore;
  actor: AuditActor;
  isSaving: boolean;
  sponsorCallLogs: Array<{ id: string; atIso: string; success: boolean }>;
  readOnly?: boolean;
  onOpenSetupCompletion?: (ruleType: ComplianceEvaluation["ruleType"]) => void;
  onPersist: (
    nextStore: SoberHouseSettingsStore,
    successMessage: string,
    options?: PersistOptions,
  ) => Promise<void>;
};

function formatStatusLabel(status: ComplianceEvaluation["status"]): string {
  switch (status) {
    case "compliant":
      return "Compliant";
    case "at_risk":
      return "At risk";
    case "violation":
      return "Violation";
    case "incomplete_setup":
      return "Incomplete setup";
    default:
      return "Not applicable";
  }
}

function formatIso(value: string | null): string {
  if (!value) {
    return "None";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function formatEvaluationValue(value: ComplianceEvaluation["actualValue"]): string {
  if (value === null || value === undefined) {
    return "None";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return formatIso(value);
    }
    return value.replaceAll("_", " ");
  }
  return String(value);
}

function statusColors(status: ComplianceEvaluation["status"]) {
  const tone = statusToneForComplianceStatus(status);
  if (tone === "green") {
    return { backgroundColor: "rgba(25, 135, 84, 0.18)", textColor: "#8AF2BA" };
  }
  if (tone === "yellow") {
    return { backgroundColor: "rgba(245, 158, 11, 0.18)", textColor: "#F8D47A" };
  }
  if (tone === "red") {
    return { backgroundColor: "rgba(239, 68, 68, 0.18)", textColor: "#FFB4B4" };
  }
  return { backgroundColor: "rgba(148, 163, 184, 0.18)", textColor: colors.textSecondary };
}

function labelForRule(ruleType: ComplianceEvaluation["ruleType"]): string {
  switch (ruleType) {
    case "jobSearch":
      return "Job Search";
    default:
      return ruleType.charAt(0).toUpperCase() + ruleType.slice(1);
  }
}

function choreSubmitLabel(task: SoberHouseRoutineTask): string {
  switch (task.proofMode) {
    case "PHOTO":
      return "Complete with photo";
    case "MANAGER_CONFIRMATION":
      return "Submit for manager review";
    case "PHOTO_MANAGER_CONFIRMATION":
      return "Submit proof for manager review";
    default:
      return task.actionLabel ?? "Post completion";
  }
}

function attentionToneLabel(status: ComplianceEvaluation["status"]): string {
  switch (status) {
    case "violation":
      return "Violation";
    case "at_risk":
      return "At risk";
    case "incomplete_setup":
      return "Setup";
    default:
      return "Needs attention";
  }
}

function routineStatusPalette(task: SoberHouseRoutineTask) {
  if (task.status === "completed") {
    return {
      borderColor: "rgba(25, 135, 84, 0.35)",
      backgroundColor: "rgba(25, 135, 84, 0.12)",
      pillBackground: "rgba(25, 135, 84, 0.18)",
      pillText: "#8AF2BA",
    };
  }
  if (task.status === "overdue") {
    return {
      borderColor: "rgba(239, 68, 68, 0.35)",
      backgroundColor: "rgba(239, 68, 68, 0.10)",
      pillBackground: "rgba(239, 68, 68, 0.18)",
      pillText: "#FFB4B4",
    };
  }
  if (task.status === "setup") {
    return {
      borderColor: "rgba(245, 158, 11, 0.35)",
      backgroundColor: "rgba(245, 158, 11, 0.10)",
      pillBackground: "rgba(245, 158, 11, 0.18)",
      pillText: "#F8D47A",
    };
  }
  if (task.status === "pending") {
    return {
      borderColor: "rgba(59, 130, 246, 0.35)",
      backgroundColor: "rgba(59, 130, 246, 0.10)",
      pillBackground: "rgba(59, 130, 246, 0.18)",
      pillText: "#BFDBFE",
    };
  }
  return {
    borderColor: "rgba(148, 163, 184, 0.24)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    pillBackground: "rgba(148, 163, 184, 0.18)",
    pillText: colors.textSecondary,
  };
}

function ComplianceRow({
  evaluation,
  onOpenSetupCompletion,
}: {
  evaluation: ComplianceEvaluation;
  onOpenSetupCompletion?: (ruleType: ComplianceEvaluation["ruleType"]) => void;
}) {
  const palette = statusColors(evaluation.status);
  const metaRows = [
    evaluation.effectiveTargetValue !== null
      ? { label: "Target", value: formatEvaluationValue(evaluation.effectiveTargetValue) }
      : null,
    evaluation.actualValue !== null
      ? { label: "Actual", value: formatEvaluationValue(evaluation.actualValue) }
      : null,
    evaluation.dueAt ? { label: "Due", value: formatIso(evaluation.dueAt) } : null,
  ].filter((entry): entry is { label: string; value: string } => entry !== null);

  return (
    <View style={styles.complianceRow}>
      <View style={styles.complianceRowHeader}>
        <Text style={styles.complianceRuleTitle}>{labelForRule(evaluation.ruleType)}</Text>
        <View style={[styles.statusPill, { backgroundColor: palette.backgroundColor }]}>
          <Text style={[styles.statusPillText, { color: palette.textColor }]}>
            {formatStatusLabel(evaluation.status)}
          </Text>
        </View>
      </View>
      <Text style={styles.complianceReason}>{evaluation.statusReason}</Text>
      {metaRows.length > 0 ? (
        <View style={styles.complianceMetaList}>
          {metaRows.map((entry) => (
            <View key={`${evaluation.ruleType}-${entry.label}`} style={styles.complianceMetaCard}>
              <Text style={styles.complianceMetaLabel}>{entry.label}</Text>
              <Text style={styles.complianceMetaValue}>{entry.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {evaluation.status === "incomplete_setup" && onOpenSetupCompletion ? (
        <View style={styles.inlineActions}>
          <AppButton
            title="Complete setup"
            variant="secondary"
            onPress={() => onOpenSetupCompletion(evaluation.ruleType)}
          />
        </View>
      ) : null}
    </View>
  );
}

export function SoberHouseComplianceSection({
  userId,
  store,
  actor,
  isSaving,
  sponsorCallLogs,
  readOnly = false,
  onOpenSetupCompletion,
  onPersist,
}: Props) {
  const [attendanceRecords, setAttendanceRecords] = useState<
    Awaited<ReturnType<typeof loadAttendanceRecords>>
  >([]);
  const [meetingAttendanceLogs, setMeetingAttendanceLogs] = useState<
    Awaited<ReturnType<typeof loadMeetingAttendanceLogs>>
  >([]);
  const [locationResult, setLocationResult] = useState<LocationReadResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [composerTaskId, setComposerTaskId] = useState<string | null>(null);
  const [composerNotes, setComposerNotes] = useState("");
  const [composerEmployerName, setComposerEmployerName] = useState("");
  const [composerProofUris, setComposerProofUris] = useState<string[]>([]);
  const [composerManagerHandoffMethod, setComposerManagerHandoffMethod] =
    useState<ManagerConfirmationHandoffMethod | null>(null);

  const refreshContext = useCallback(
    async (requestPermission: boolean) => {
      const [nextAttendance, nextLogs, nextLocation] = await Promise.all([
        loadAttendanceRecords(userId),
        loadMeetingAttendanceLogs(userId),
        getCurrentLocation({ requestPermission, timeoutMs: 10_000 }),
      ]);
      setAttendanceRecords(nextAttendance);
      setMeetingAttendanceLogs(nextLogs);
      setLocationResult(nextLocation);
    },
    [userId],
  );

  useEffect(() => {
    void refreshContext(false);
  }, [refreshContext]);

  useEffect(() => {
    setComposerTaskId(null);
    setComposerNotes("");
    setComposerEmployerName("");
    setComposerProofUris([]);
    setComposerManagerHandoffMethod(null);
  }, [store]);

  const nowIso = useMemo(
    () => new Date().toISOString(),
    [attendanceRecords, locationResult?.coords, meetingAttendanceLogs, store, sponsorCallLogs],
  );
  const summary = useMemo(
    () =>
      evaluateResidentCompliance({
        store,
        nowIso,
        currentLocation: locationResult?.coords ?? null,
        attendanceRecords,
        meetingAttendanceLogs,
      }),
    [attendanceRecords, locationResult?.coords, meetingAttendanceLogs, nowIso, store],
  );
  const routineSummary = useMemo(
    () =>
      buildSoberHouseRoutineSummary({
        store,
        nowIso,
        attendanceRecords,
        meetingAttendanceLogs,
        sponsorCallLogs,
      }),
    [attendanceRecords, meetingAttendanceLogs, nowIso, sponsorCallLogs, store],
  );
  const attentionItems = useMemo(
    () => (summary ? getEvaluationsNeedingAttention(summary) : []),
    [summary],
  );
  const residentName = useMemo(() => {
    const housing = store.residentHousingProfile;
    return housing ? `${housing.firstName} ${housing.lastName}`.trim() : "Resident";
  }, [store.residentHousingProfile]);
  const housingProfile = store.residentHousingProfile;
  const ruleSet = useMemo(() => {
    const houseId = housingProfile?.houseId;
    return houseId ? getRuleSetForHouse(store, houseId, nowIso) : null;
  }, [housingProfile?.houseId, nowIso, store]);
  const house = useMemo(() => {
    const houseId = housingProfile?.houseId;
    return houseId ? getHouseById(store, houseId) : null;
  }, [housingProfile?.houseId, store]);
  const explicitChoreLookup = useMemo(() => {
    if (!housingProfile?.houseId || !housingProfile.residentId) {
      return new Map<string, HouseChore>();
    }
    return new Map(
      getHouseChoresForResident(store, housingProfile.residentId, housingProfile.houseId).map(
        (chore) => [chore.id, chore],
      ),
    );
  }, [housingProfile?.houseId, housingProfile?.residentId, store]);
  const activeComposerTask = useMemo(
    () => routineSummary?.tasks.find((task) => task.id === composerTaskId) ?? null,
    [composerTaskId, routineSummary?.tasks],
  );

  const clearComposer = useCallback(() => {
    setComposerTaskId(null);
    setComposerNotes("");
    setComposerEmployerName("");
    setComposerProofUris([]);
    setComposerManagerHandoffMethod(null);
  }, []);

  const captureProofPhoto = useCallback(async () => {
    const imagePickerModule = await loadImagePickerModule();
    if (!imagePickerModule) {
      setStatusMessage(
        "Photo capture needs the latest soberai dev build. Rebuild to enable camera proof.",
      );
      return;
    }
    try {
      const permission = await imagePickerModule.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setStatusMessage("Camera access is required to attach proof.");
        return;
      }
      const result = await imagePickerModule.launchCameraAsync({
        mediaTypes: imagePickerModule.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
      });
      if (result.canceled) {
        return;
      }
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        setStatusMessage("Unable to attach the captured photo.");
        return;
      }
      setComposerProofUris((current) => [...current, asset.uri as string]);
      setStatusMessage("Proof photo attached.");
    } catch {
      setStatusMessage("Photo proof is unavailable on this device right now.");
    }
  }, []);

  const shareTaskWithManager = useCallback(
    async (task: SoberHouseRoutineTask) => {
      if (!housingProfile) {
        setStatusMessage("Resident housing must be configured before sharing with a manager.");
        return;
      }
      const proofBits =
        composerProofUris.length > 0
          ? `Attached proof photos: ${composerProofUris.length}.`
          : "No proof photos attached yet.";
      const message = [
        `${residentName} submitted a sober-house ${task.kind.replaceAll("_", " ")} update.`,
        `Task: ${task.title}.`,
        proofBits,
        composerNotes.trim() ? `Notes: ${composerNotes.trim()}` : null,
        house?.name ? `House: ${house.name}.` : null,
        "Manager confirmation is still required.",
      ]
        .filter(Boolean)
        .join(" ");

      try {
        const result = await Share.share({
          title: `${task.title} manager handoff`,
          message,
        });
        if (result.action === Share.dismissedAction) {
          setStatusMessage("Manager handoff canceled.");
          return;
        }
        setComposerManagerHandoffMethod("SHARE_SHEET");
        setStatusMessage("Opened the manager handoff share sheet.");
      } catch {
        setStatusMessage("Manager handoff is unavailable on this device right now.");
      }
    },
    [composerNotes, composerProofUris.length, house?.name, housingProfile, residentName],
  );

  const persistChoreCompletion = useCallback(
    async (task: SoberHouseRoutineTask) => {
      if (!housingProfile || !ruleSet) {
        setStatusMessage("Set up a resident housing profile before logging chores.");
        return;
      }
      const chore = task.houseChoreId ? (explicitChoreLookup.get(task.houseChoreId) ?? null) : null;
      const proofRequirement = chore?.proofRequirement ?? ruleSet.chores.proofRequirement;
      const requiresPhotoProof = choreRequiresPhotoProof(proofRequirement);
      const requiresManagerConfirmation = choreRequiresManagerConfirmation(proofRequirement);
      if (requiresPhotoProof && composerProofUris.length === 0) {
        setStatusMessage("Attach chore proof before marking this task complete.");
        return;
      }
      const now = new Date().toISOString();
      const completionRecordId = createEntityId("chore-completion");
      const result = upsertChoreCompletionRecord(
        store,
        actor,
        {
          id: completionRecordId,
          residentId: housingProfile.residentId,
          linkedUserId: housingProfile.linkedUserId,
          organizationId: housingProfile.organizationId,
          houseId: housingProfile.houseId,
          houseChoreId: task.houseChoreId,
          completedAt: now,
          proofRequirement,
          proofProvided: composerProofUris.length > 0,
          proofReference: composerProofUris[0] ?? null,
          managerConfirmationRequired: requiresManagerConfirmation,
          managerConfirmationStatus: requiresManagerConfirmation ? "PENDING" : "NOT_REQUIRED",
          managerConfirmationRequestedAt: composerManagerHandoffMethod ? now : null,
          managerConfirmationRequestedVia: composerManagerHandoffMethod,
          managerConfirmedAt: null,
          notes: composerNotes.trim(),
        },
        now,
      );
      const nextStore = attachSoberHouseRoutineProof({
        store: result.store,
        actor,
        housingProfile,
        task,
        proofUris: composerProofUris,
        timestamp: now,
        completionRecordId,
        completionRecordType: "CHORE",
      });
      await onPersist(
        nextStore,
        requiresManagerConfirmation
          ? "Chore proof submitted. Awaiting manager confirmation."
          : "Chore completion posted.",
      );
      clearComposer();
      setStatusMessage(
        requiresManagerConfirmation
          ? "Chore proof submitted and waiting on manager confirmation."
          : "Chore completion posted.",
      );
      await refreshContext(false);
    },
    [
      actor,
      clearComposer,
      composerManagerHandoffMethod,
      composerNotes,
      composerProofUris,
      explicitChoreLookup,
      housingProfile,
      onPersist,
      refreshContext,
      ruleSet,
      store,
    ],
  );

  const persistJobApplication = useCallback(
    async (task: SoberHouseRoutineTask) => {
      if (!housingProfile) {
        setStatusMessage("Set up a resident housing profile before logging job search progress.");
        return;
      }
      if (!composerEmployerName.trim()) {
        setStatusMessage("Employer or application target is required.");
        return;
      }
      if (task.requiresProof && composerProofUris.length === 0) {
        setStatusMessage("Attach application proof before marking this task complete.");
        return;
      }
      const now = new Date().toISOString();
      const jobApplicationId = createEntityId("job-application");
      const result = upsertJobApplicationRecord(
        store,
        actor,
        {
          id: jobApplicationId,
          residentId: housingProfile.residentId,
          linkedUserId: housingProfile.linkedUserId,
          organizationId: housingProfile.organizationId,
          houseId: housingProfile.houseId,
          employerName: composerEmployerName.trim(),
          appliedAt: now,
          proofProvided: composerProofUris.length > 0,
          proofReference: composerProofUris[0] ?? null,
          notes: composerNotes.trim(),
        },
        now,
      );
      const nextStore = attachSoberHouseRoutineProof({
        store: result.store,
        actor,
        housingProfile,
        task,
        proofUris: composerProofUris,
        timestamp: now,
        completionRecordId: jobApplicationId,
        completionRecordType: "JOB_APPLICATION",
      });
      await onPersist(nextStore, "Job application posted.");
      clearComposer();
      setStatusMessage("Job application posted.");
    },
    [
      actor,
      clearComposer,
      composerEmployerName,
      composerNotes,
      composerProofUris,
      housingProfile,
      onPersist,
      store,
    ],
  );

  const persistWorkVerification = useCallback(async () => {
    if (!housingProfile) {
      setStatusMessage("Set up a resident housing profile before logging work verification.");
      return;
    }
    const now = new Date().toISOString();
    const result = upsertWorkVerificationRecord(
      store,
      actor,
      {
        residentId: housingProfile.residentId,
        linkedUserId: housingProfile.linkedUserId,
        organizationId: housingProfile.organizationId,
        houseId: housingProfile.houseId,
        verifiedAt: now,
        verificationMethod: "SELF_REPORTED",
        notes: composerNotes.trim(),
      },
      now,
    );
    await onPersist(result.store, "Work accountability posted.");
    clearComposer();
    setStatusMessage("Work accountability posted.");
  }, [actor, clearComposer, composerNotes, housingProfile, onPersist, store]);

  const persistHouseMeetingAttendance = useCallback(
    async (task: SoberHouseRoutineTask) => {
      if (!housingProfile || !task.houseMeetingId || !task.dueAtIso) {
        setStatusMessage("Unable to mark this house meeting complete.");
        return;
      }
      const now = new Date().toISOString();
      const result = upsertHouseMeetingAttendanceRecord(
        store,
        actor,
        {
          residentId: housingProfile.residentId,
          linkedUserId: housingProfile.linkedUserId,
          organizationId: housingProfile.organizationId,
          houseId: housingProfile.houseId,
          houseMeetingId: task.houseMeetingId,
          recurringObligationId: task.recurringObligationId,
          scheduledStartAt: task.dueAtIso,
          status: "COMPLETED",
          attendedAt: now,
          excusedAt: null,
          excusedReason: null,
          proofRequired: false,
          proofProvided: false,
          proofReference: null,
          notes: "",
        },
        now,
      );
      await onPersist(result.store, "House meeting attendance posted.");
      setStatusMessage("House meeting attendance posted.");
    },
    [actor, housingProfile, onPersist, store],
  );

  const handleTaskAction = useCallback(
    async (task: SoberHouseRoutineTask) => {
      if (readOnly || isSaving) {
        return;
      }
      if (task.kind === "house_meeting") {
        await persistHouseMeetingAttendance(task);
        return;
      }
      if (
        task.kind === "chores" ||
        task.kind === "job_applications" ||
        task.kind === "work_verification"
      ) {
        setComposerTaskId((current) => (current === task.id ? null : task.id));
        setComposerNotes("");
        setComposerEmployerName("");
        setComposerProofUris([]);
        setComposerManagerHandoffMethod(null);
      }
    },
    [isSaving, persistHouseMeetingAttendance, readOnly],
  );

  const handleComposerSubmit = useCallback(async () => {
    if (!activeComposerTask) {
      return;
    }
    if (activeComposerTask.kind === "chores") {
      await persistChoreCompletion(activeComposerTask);
      return;
    }
    if (activeComposerTask.kind === "job_applications") {
      await persistJobApplication(activeComposerTask);
      return;
    }
    if (activeComposerTask.kind === "work_verification") {
      await persistWorkVerification();
    }
  }, [activeComposerTask, persistChoreCompletion, persistJobApplication, persistWorkVerification]);

  if (!summary || !routineSummary) {
    return (
      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Sober House Routine</Text>
        <Text style={styles.sectionMeta}>
          Complete resident onboarding before this resident-safe routine can load inherited house
          requirements.
        </Text>
      </GlassCard>
    );
  }

  return (
    <>
      <GlassCard style={styles.card} strong>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.sectionTitle}>Sober House Routine</Text>
            <Text style={styles.sectionMeta}>
              {residentName} • {house?.name ?? routineSummary.houseName} • Inherited tasks stay
              locked on and are driven by effective sober-house rules.
            </Text>
          </View>
          <AppButton
            title="Refresh"
            variant="secondary"
            onPress={() => void refreshContext(true)}
            disabled={isSaving}
          />
        </View>
        <View style={styles.progressRow}>
          <View style={styles.progressMetric}>
            <Text style={styles.progressValue}>{routineSummary.percentComplete}%</Text>
            <Text style={styles.progressLabel}>Complete</Text>
          </View>
          <View style={styles.progressMetric}>
            <Text style={styles.progressValue}>{routineSummary.openRequiredCount}</Text>
            <Text style={styles.progressLabel}>Open</Text>
          </View>
          <View style={styles.progressMetric}>
            <Text style={styles.progressValue}>{routineSummary.overdueCount}</Text>
            <Text style={styles.progressLabel}>Overdue</Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${routineSummary.percentComplete}%` }]} />
        </View>
        <Text style={styles.sectionMeta}>
          {routineSummary.completedRequiredCount}/{routineSummary.totalRequiredCount} required tasks
          complete across your current house routine window.
        </Text>
      </GlassCard>

      {!readOnly ? (
        <GlassCard style={styles.card}>
          <Text style={styles.sectionTitle}>Items Needing Attention</Text>
          <Text style={styles.sectionMeta}>
            Highlights the current sober-house items that still need action or setup.
          </Text>
          {attentionItems.length === 0 ? (
            <Text style={styles.sectionMeta}>
              No active at-risk, violation, or setup issues right now.
            </Text>
          ) : (
            attentionItems.map((evaluation) => (
              <View key={`attention-${evaluation.ruleType}`} style={styles.attentionRow}>
                <View style={styles.attentionHeader}>
                  <Text style={styles.attentionTitle}>{labelForRule(evaluation.ruleType)}</Text>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: statusColors(evaluation.status).backgroundColor,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        { color: statusColors(evaluation.status).textColor },
                      ]}
                    >
                      {attentionToneLabel(evaluation.status)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.attentionMeta}>{residentName}</Text>
                <Text style={styles.complianceReason}>{evaluation.statusReason}</Text>
                {evaluation.status === "incomplete_setup" && onOpenSetupCompletion ? (
                  <View style={styles.inlineActions}>
                    <AppButton
                      title="Complete setup"
                      variant="secondary"
                      onPress={() => onOpenSetupCompletion(evaluation.ruleType)}
                    />
                  </View>
                ) : null}
              </View>
            ))
          )}
        </GlassCard>
      ) : null}

      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Checklist</Text>
        <Text style={styles.sectionMeta}>
          Required items below come from organization defaults, house-group templates, and house
          overrides. Residents cannot disable them.
        </Text>
        {routineSummary.tasks.map((task) => {
          const palette = routineStatusPalette(task);
          const isComposerOpen = composerTaskId === task.id;
          return (
            <View
              key={task.id}
              style={[
                styles.routineItem,
                {
                  borderColor: palette.borderColor,
                  backgroundColor: palette.backgroundColor,
                },
              ]}
            >
              <View style={styles.routineHeader}>
                <View style={styles.routineCopy}>
                  <Text style={styles.routineTitle}>{task.title}</Text>
                  <Text style={styles.routineDetail}>{task.detail}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: palette.pillBackground }]}>
                  <Text style={[styles.statusPillText, { color: palette.pillText }]}>
                    {task.statusLabel}
                  </Text>
                </View>
              </View>
              <View style={styles.routineMetaRow}>
                <Text style={styles.routineMeta}>Locked</Text>
                <Text style={styles.routineMeta}>{task.sourceLabel}</Text>
                {task.dueLabel ? <Text style={styles.routineMeta}>Due {task.dueLabel}</Text> : null}
                {task.proofLabel ? <Text style={styles.routineMeta}>{task.proofLabel}</Text> : null}
              </View>
              {task.kind === "chores" && task.status === "pending" ? (
                <Text style={styles.sectionMeta}>
                  Proof is on file, but this chore still needs manager confirmation before it counts
                  as complete.
                </Text>
              ) : null}
              {task.countsTowardProgress ? (
                <Text style={styles.routineProgressText}>
                  Progress {task.completedCount}/{task.requiredCount}
                </Text>
              ) : null}
              {!readOnly && task.actionLabel && task.status !== "completed" ? (
                <View style={styles.inlineActions}>
                  <AppButton
                    title={task.actionLabel ?? "Open"}
                    variant="secondary"
                    onPress={() => void handleTaskAction(task)}
                    disabled={isSaving}
                  />
                </View>
              ) : null}
              {isComposerOpen ? (
                <View style={styles.composerWrap}>
                  {task.kind === "job_applications" ? (
                    <TextInput
                      style={styles.input}
                      value={composerEmployerName}
                      onChangeText={setComposerEmployerName}
                      placeholder="Employer or application target"
                      placeholderTextColor="rgba(245,243,255,0.45)"
                    />
                  ) : null}
                  <TextInput
                    style={[styles.input, styles.multilineInput]}
                    value={composerNotes}
                    onChangeText={setComposerNotes}
                    placeholder={
                      task.kind === "work_verification"
                        ? "Shift notes or accountability summary"
                        : "Optional notes"
                    }
                    placeholderTextColor="rgba(245,243,255,0.45)"
                    multiline
                  />
                  {task.requiresProof ? (
                    <>
                      <Text style={styles.sectionMeta}>
                        {composerProofUris.length > 0
                          ? `${composerProofUris.length} proof photo${composerProofUris.length === 1 ? "" : "s"} attached.`
                          : "Add proof photos to satisfy this house requirement."}
                      </Text>
                      <View style={styles.inlineActions}>
                        <AppButton
                          title={composerProofUris.length > 0 ? "Add another photo" : "Take photo"}
                          variant="secondary"
                          onPress={() => void captureProofPhoto()}
                          disabled={isSaving}
                        />
                      </View>
                      {composerProofUris.length > 0 ? (
                        <View style={styles.proofList}>
                          {composerProofUris.map((uri, index) => (
                            <View key={`${uri}-${index}`} style={styles.proofRow}>
                              <Text style={styles.proofLabel}>Proof {index + 1}</Text>
                              <Text style={styles.proofUri} numberOfLines={1}>
                                {uri}
                              </Text>
                              <Pressable
                                onPress={() =>
                                  setComposerProofUris((current) =>
                                    current.filter((_, proofIndex) => proofIndex !== index),
                                  )
                                }
                              >
                                <Text style={styles.removeProofText}>Remove</Text>
                              </Pressable>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.sectionMeta}>No proof photos attached yet.</Text>
                      )}
                    </>
                  ) : null}
                  {task.kind === "chores" && task.managerConfirmationRequired ? (
                    <>
                      <Text style={styles.sectionMeta}>
                        This chore stays pending until a manager confirms the submission.
                      </Text>
                      {!task.requiresProof || composerProofUris.length > 0 ? (
                        <View style={styles.inlineActions}>
                          <AppButton
                            title={
                              composerManagerHandoffMethod
                                ? "Shared with manager"
                                : "Text / share to manager"
                            }
                            variant="secondary"
                            onPress={() => void shareTaskWithManager(task)}
                            disabled={isSaving}
                          />
                        </View>
                      ) : null}
                    </>
                  ) : null}
                  <View style={styles.buttonRow}>
                    <AppButton
                      title={
                        task.kind === "chores"
                          ? choreSubmitLabel(task)
                          : (task.actionLabel ?? "Post completion")
                      }
                      onPress={() => void handleComposerSubmit()}
                      disabled={isSaving}
                    />
                    <View style={styles.buttonSpacer} />
                    <AppButton
                      title="Cancel"
                      variant="secondary"
                      onPress={clearComposer}
                      disabled={isSaving}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </GlassCard>

      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Requirement Status</Text>
        <View style={styles.sectionMetaStack}>
          <Text style={styles.sectionMeta}>Evaluated {formatIso(summary.evaluatedAt)}</Text>
          <Text style={styles.sectionMeta}>
            Location{" "}
            {locationResult?.coords
              ? `${locationResult.coords.lat.toFixed(4)}, ${locationResult.coords.lng.toFixed(4)}`
              : locationResult?.failureReason === "permission_denied"
                ? "permission denied"
                : "unavailable"}
          </Text>
        </View>
        {summary.evaluations.map((evaluation) => (
          <ComplianceRow
            key={evaluation.ruleType}
            evaluation={evaluation}
            onOpenSetupCompletion={onOpenSetupCompletion}
          />
        ))}
      </GlassCard>

      {!readOnly && statusMessage ? <Text style={styles.inlineStatus}>{statusMessage}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.h3,
    fontWeight: "700",
  },
  sectionMeta: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
  },
  sectionMetaStack: {
    gap: spacing.xs,
  },
  progressRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  progressMetric: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: spacing.md,
    gap: spacing.xs,
  },
  progressValue: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "800",
  },
  progressLabel: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: "600",
  },
  progressTrack: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(148,163,184,0.18)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: "#8AF2BA",
  },
  routineItem: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  routineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  routineCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  routineTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: "700",
  },
  routineDetail: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 18,
  },
  routineMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  routineMeta: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  routineProgressText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: "600",
  },
  composerWrap: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(148,163,184,0.18)",
  },
  proofList: {
    gap: spacing.xs,
  },
  proofRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  proofLabel: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: "700",
  },
  proofUri: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  removeProofText: {
    color: "#FFB4B4",
    fontSize: typography.small,
    fontWeight: "700",
  },
  complianceRow: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,163,184,0.16)",
  },
  complianceRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  complianceRuleTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: "700",
    flex: 1,
  },
  complianceReason: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 22,
  },
  complianceMetaList: {
    gap: spacing.xs,
  },
  complianceMetaCard: {
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.14)",
  },
  complianceMetaLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  complianceMetaValue: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: "600",
    lineHeight: 20,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    backgroundColor: "rgba(255,255,255,0.06)",
    minHeight: 48,
  },
  multilineInput: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  attentionRow: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,163,184,0.16)",
  },
  attentionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  attentionTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: "700",
    flex: 1,
  },
  attentionMeta: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  buttonSpacer: {
    width: spacing.sm,
  },
  inlineStatus: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
});
