import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { loadAttendanceRecords, loadMeetingAttendanceLogs } from "../lib/attendance/storage";
import { getCurrentLocation, type LocationReadResult } from "../lib/services/locationService";
import {
  evaluateResidentCompliance,
  getEvaluationsNeedingAttention,
  statusToneForComplianceStatus,
} from "../lib/soberHouse/compliance";
import {
  upsertChoreCompletionRecord,
  upsertHouseMeetingAttendanceRecord,
  upsertJobApplicationRecord,
  upsertWorkVerificationRecord,
} from "../lib/soberHouse/mutations";
import {
  getHouseById,
  getHouseMeetingsInRange,
  getRuleSetForHouse,
} from "../lib/soberHouse/selectors";
import type {
  AuditActor,
  ComplianceEvaluation,
  SoberHouseSettingsStore,
} from "../lib/soberHouse/types";
import { colors, radius, spacing, typography } from "../lib/theme/tokens";
import { AppButton } from "../lib/ui/AppButton";
import { GlassCard } from "../lib/ui/GlassCard";

type OptionalImagePickerModule = {
  requestMediaLibraryPermissionsAsync: () => Promise<{ granted: boolean }>;
  launchImageLibraryAsync: (options: {
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
  readOnly?: boolean;
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

function formatProofRequirementList(values: string[]): string {
  return values
    .map((value) => value.replaceAll("_", " "))
    .join(", ")
    .toLowerCase();
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

function ComplianceRow({ evaluation }: { evaluation: ComplianceEvaluation }) {
  const palette = statusColors(evaluation.status);
  const metaBits: string[] = [];
  if (evaluation.effectiveTargetValue !== null) {
    metaBits.push(`Target: ${String(evaluation.effectiveTargetValue)}`);
  }
  if (evaluation.actualValue !== null) {
    metaBits.push(`Actual: ${String(evaluation.actualValue)}`);
  }
  if (evaluation.dueAt) {
    metaBits.push(`Due: ${formatIso(evaluation.dueAt)}`);
  }

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
      {metaBits.length > 0 ? (
        <Text style={styles.complianceMeta}>{metaBits.join(" • ")}</Text>
      ) : null}
    </View>
  );
}

function labelForRule(ruleType: ComplianceEvaluation["ruleType"]): string {
  switch (ruleType) {
    case "jobSearch":
      return "Job Search";
    default:
      return ruleType.charAt(0).toUpperCase() + ruleType.slice(1);
  }
}

export function SoberHouseComplianceSection({
  userId,
  store,
  actor,
  isSaving,
  readOnly = false,
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
  const [choreNotes, setChoreNotes] = useState("");
  const [choreProofProvided, setChoreProofProvided] = useState(false);
  const [choreProofUri, setChoreProofUri] = useState<string | null>(null);
  const [jobEmployerName, setJobEmployerName] = useState("");
  const [jobProofProvided, setJobProofProvided] = useState(false);
  const [jobProofUri, setJobProofUri] = useState<string | null>(null);
  const [jobNotes, setJobNotes] = useState("");
  const [workVerificationNotes, setWorkVerificationNotes] = useState("");

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

  const nowIso = useMemo(
    () => new Date().toISOString(),
    [attendanceRecords, locationResult?.coords, meetingAttendanceLogs, store],
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
  const attentionItems = useMemo(() => getEvaluationsNeedingAttention(summary), [summary]);
  const residentName = useMemo(() => {
    const housing = store.residentHousingProfile;
    return housing ? `${housing.firstName} ${housing.lastName}`.trim() : "Resident";
  }, [store.residentHousingProfile]);
  const ruleSet = useMemo(() => {
    const houseId = store.residentHousingProfile?.houseId;
    return houseId ? getRuleSetForHouse(store, houseId, nowIso) : null;
  }, [nowIso, store]);
  const house = useMemo(() => {
    const houseId = store.residentHousingProfile?.houseId;
    return houseId ? getHouseById(store, houseId) : null;
  }, [store]);
  const houseMeetingsThisWeek = useMemo(() => {
    const housing = store.residentHousingProfile;
    if (!housing?.houseId) {
      return [];
    }
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return getHouseMeetingsInRange(
      store,
      housing.houseId,
      weekStart.toISOString(),
      weekEnd.toISOString(),
    );
  }, [store]);
  const attendedHouseMeetingKeys = useMemo(
    () =>
      new Set(
        store.houseMeetingAttendanceRecords
          .filter((record) => record.residentId === store.residentHousingProfile?.residentId)
          .map(
            (record) =>
              `${record.recurringObligationId ?? record.houseMeetingId ?? "manual"}:${record.scheduledStartAt}`,
          ),
      ),
    [store],
  );
  const jobApplicationsTarget = useMemo(() => {
    const requirements = store.residentRequirementProfile;
    if (!requirements || requirements.currentlyEmployed) {
      return 0;
    }
    return Math.max(
      requirements.jobApplicationsRequiredPerWeek,
      ruleSet?.jobSearch.applicationsRequiredPerWeek ?? 0,
    );
  }, [ruleSet?.jobSearch.applicationsRequiredPerWeek, store.residentRequirementProfile]);
  const completedJobApplicationsThisWeek = useMemo(() => {
    const residentId = store.residentHousingProfile?.residentId;
    if (!residentId) {
      return 0;
    }
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return store.jobApplicationRecords.filter((record) => {
      if (record.residentId !== residentId) {
        return false;
      }
      const appliedAt = new Date(record.appliedAt).getTime();
      return (
        Number.isFinite(appliedAt) &&
        appliedAt >= weekStart.getTime() &&
        appliedAt < weekEnd.getTime() &&
        (!ruleSet?.jobSearch.proofRequired ||
          record.proofProvided ||
          Boolean(record.proofReference))
      );
    }).length;
  }, [
    ruleSet?.jobSearch.proofRequired,
    store.jobApplicationRecords,
    store.residentHousingProfile?.residentId,
  ]);

  const pickProofPhoto = useCallback(
    async (onSelect: (uri: string) => void, unavailableMessage: string) => {
      const imagePickerModule = await loadImagePickerModule();
      if (!imagePickerModule) {
        setStatusMessage(unavailableMessage);
        return;
      }
      try {
        const permission = await imagePickerModule.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setStatusMessage("Photo access is required to attach chore proof.");
          return;
        }
        const result = await imagePickerModule.launchImageLibraryAsync({
          mediaTypes: imagePickerModule.MediaTypeOptions.Images,
          allowsEditing: true,
          quality: 0.7,
        });
        if (result.canceled) {
          return;
        }
        const asset = result.assets?.[0];
        if (!asset?.uri) {
          setStatusMessage("Unable to attach the selected photo.");
          return;
        }
        onSelect(asset.uri);
      } catch {
        setStatusMessage("Photo proof is unavailable on this device right now.");
      }
    },
    [],
  );

  const pickChoreProof = useCallback(async () => {
    await pickProofPhoto((uri) => {
      setChoreProofUri(uri);
      setChoreProofProvided(true);
      setStatusMessage("Chore photo proof attached.");
    }, "Photo proof needs the latest soberai dev build. Rebuild the app to enable photo attachments.");
  }, [pickProofPhoto]);

  const pickJobApplicationProof = useCallback(async () => {
    await pickProofPhoto((uri) => {
      setJobProofUri(uri);
      setJobProofProvided(true);
      setStatusMessage("Application photo proof attached.");
    }, "Application proof needs the latest soberai dev build. Rebuild the app to enable photo attachments.");
  }, [pickProofPhoto]);

  const logChoreCompletion = useCallback(async () => {
    const housing = store.residentHousingProfile;
    if (!housing || !ruleSet) {
      setStatusMessage("Set up a resident housing profile before logging chores.");
      return;
    }
    const proofRequiresPhoto = ruleSet.chores.proofRequirement.includes("PHOTO");
    if (proofRequiresPhoto && !choreProofUri) {
      setStatusMessage("Attach a chore photo before marking this chore complete.");
      return;
    }
    const now = new Date().toISOString();
    const result = upsertChoreCompletionRecord(
      store,
      actor,
      {
        residentId: housing.residentId,
        linkedUserId: housing.linkedUserId,
        organizationId: housing.organizationId,
        houseId: housing.houseId,
        houseChoreId: null,
        completedAt: now,
        proofRequirement: ruleSet.chores.proofRequirement,
        proofProvided: choreProofProvided || Boolean(choreProofUri),
        proofReference: choreProofUri,
        notes: choreNotes.trim(),
      },
      now,
    );
    await onPersist(result.store, "Chore completion logged.");
    setChoreNotes("");
    setChoreProofProvided(false);
    setChoreProofUri(null);
  }, [actor, choreNotes, choreProofProvided, choreProofUri, onPersist, ruleSet, store]);

  const logHouseMeetingAttendance = useCallback(
    async (meetingId: string, recurringObligationId: string | null, scheduledStartAt: string) => {
      const housing = store.residentHousingProfile;
      if (!housing) {
        setStatusMessage(
          "Set up a resident housing profile before logging house meeting attendance.",
        );
        return;
      }
      const now = new Date().toISOString();
      const result = upsertHouseMeetingAttendanceRecord(
        store,
        actor,
        {
          residentId: housing.residentId,
          linkedUserId: housing.linkedUserId,
          organizationId: housing.organizationId,
          houseId: housing.houseId,
          houseMeetingId: meetingId,
          recurringObligationId,
          scheduledStartAt,
          attendedAt: now,
          notes: "",
        },
        now,
      );
      await onPersist(result.store, "House meeting attendance logged.");
    },
    [actor, onPersist, store],
  );

  const logJobApplication = useCallback(async () => {
    const housing = store.residentHousingProfile;
    if (!housing) {
      setStatusMessage("Set up a resident housing profile before logging job search progress.");
      return;
    }
    if (!jobEmployerName.trim()) {
      setStatusMessage("Employer name is required for a job application log.");
      return;
    }
    if (ruleSet?.jobSearch.proofRequired && !jobProofUri) {
      setStatusMessage("Attach application proof before marking this requirement complete.");
      return;
    }
    const now = new Date().toISOString();
    const result = upsertJobApplicationRecord(
      store,
      actor,
      {
        residentId: housing.residentId,
        linkedUserId: housing.linkedUserId,
        organizationId: housing.organizationId,
        houseId: housing.houseId,
        employerName: jobEmployerName.trim(),
        appliedAt: now,
        proofProvided: jobProofProvided || Boolean(jobProofUri),
        proofReference: jobProofUri,
        notes: jobNotes.trim(),
      },
      now,
    );
    await onPersist(result.store, "Job application logged.");
    setJobEmployerName("");
    setJobNotes("");
    setJobProofProvided(false);
    setJobProofUri(null);
  }, [
    actor,
    jobEmployerName,
    jobNotes,
    jobProofProvided,
    jobProofUri,
    onPersist,
    ruleSet?.jobSearch.proofRequired,
    store,
  ]);

  const logWorkVerification = useCallback(async () => {
    const housing = store.residentHousingProfile;
    if (!housing) {
      setStatusMessage("Set up a resident housing profile before logging work verification.");
      return;
    }
    const now = new Date().toISOString();
    const result = upsertWorkVerificationRecord(
      store,
      actor,
      {
        residentId: housing.residentId,
        linkedUserId: housing.linkedUserId,
        organizationId: housing.organizationId,
        houseId: housing.houseId,
        verifiedAt: now,
        verificationMethod: "SELF_REPORTED",
        notes: workVerificationNotes.trim(),
      },
      now,
    );
    await onPersist(result.store, "Work verification logged.");
    setWorkVerificationNotes("");
  }, [actor, onPersist, store, workVerificationNotes]);

  if (!summary) {
    return (
      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Compliance Summary</Text>
        <Text style={styles.sectionMeta}>
          Complete resident onboarding before running sober-house compliance evaluation.
        </Text>
      </GlassCard>
    );
  }

  return (
    <>
      <GlassCard style={styles.card}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.sectionTitle}>Resident Compliance Summary</Text>
            <Text style={styles.sectionMeta}>
              {residentName} • {house?.name ?? "No house"} • Evaluated{" "}
              {formatIso(summary.evaluatedAt)}
            </Text>
          </View>
          <AppButton
            title="Refresh"
            variant="secondary"
            onPress={() => void refreshContext(true)}
            disabled={isSaving}
          />
        </View>
        {summary.evaluations.map((evaluation) => (
          <ComplianceRow key={evaluation.ruleType} evaluation={evaluation} />
        ))}
        <Text style={styles.sectionMeta}>
          Location:{" "}
          {locationResult?.coords
            ? `${locationResult.coords.lat.toFixed(4)}, ${locationResult.coords.lng.toFixed(4)}`
            : locationResult?.failureReason === "permission_denied"
              ? "Permission denied"
              : "Unavailable"}
        </Text>
      </GlassCard>

      {!readOnly && ruleSet?.chores.enabled ? (
        <GlassCard style={styles.card}>
          <Text style={styles.sectionTitle}>Resident Actions</Text>
          <Text style={styles.subsectionTitle}>Log chore completion</Text>
          <Text style={styles.sectionMeta}>
            Proof requirement: {formatProofRequirementList(ruleSet.chores.proofRequirement)}
          </Text>
          {ruleSet.chores.proofRequirement.includes("PHOTO") ? (
            <>
              <View style={styles.inlineActions}>
                <AppButton
                  title={choreProofUri ? "Replace photo proof" : "Attach photo proof"}
                  variant="secondary"
                  onPress={() => void pickChoreProof()}
                  disabled={isSaving}
                />
                {choreProofUri ? (
                  <>
                    <View style={styles.buttonSpacer} />
                    <AppButton
                      title="Remove photo"
                      variant="secondary"
                      onPress={() => {
                        setChoreProofUri(null);
                        setChoreProofProvided(false);
                      }}
                      disabled={isSaving}
                    />
                  </>
                ) : null}
              </View>
              <Text style={styles.sectionMeta}>
                {choreProofUri
                  ? `Photo attached: ${choreProofUri}`
                  : "No chore proof photo attached yet."}
              </Text>
            </>
          ) : (
            <View style={styles.toggleRow}>
              <Text style={styles.label}>Proof provided</Text>
              <Switch value={choreProofProvided} onValueChange={setChoreProofProvided} />
            </View>
          )}
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={choreNotes}
            onChangeText={setChoreNotes}
            placeholder="Optional chore notes"
            placeholderTextColor="rgba(245,243,255,0.45)"
            multiline
          />
          <AppButton
            title="Log chore complete"
            onPress={() => void logChoreCompletion()}
            disabled={isSaving}
          />
        </GlassCard>
      ) : null}

      {!readOnly && houseMeetingsThisWeek.length > 0 ? (
        <GlassCard style={styles.card}>
          <Text style={styles.subsectionTitle}>House meetings this week</Text>
          <Text style={styles.sectionMeta}>
            Mark scheduled house meetings complete as you attend them.
          </Text>
          {houseMeetingsThisWeek.map((meeting) => {
            const attendanceKey = `${meeting.recurringObligationId ?? meeting.id}:${meeting.startsAt}`;
            const attended = attendedHouseMeetingKeys.has(attendanceKey);
            return (
              <View key={attendanceKey} style={styles.attentionRow}>
                <Text style={styles.attentionTitle}>{meeting.title}</Text>
                <Text style={styles.complianceReason}>
                  {new Date(meeting.startsAt).toLocaleString()} •{" "}
                  {meeting.locationLabel || "House location"}
                </Text>
                <View style={styles.inlineActions}>
                  <AppButton
                    title={attended ? "Marked attended" : "Mark attended"}
                    variant="secondary"
                    onPress={() =>
                      void logHouseMeetingAttendance(
                        meeting.id,
                        meeting.recurringObligationId,
                        meeting.startsAt,
                      )
                    }
                    disabled={isSaving || attended}
                  />
                </View>
              </View>
            );
          })}
        </GlassCard>
      ) : null}

      {!readOnly &&
      store.residentRequirementProfile?.workRequired &&
      !store.residentRequirementProfile.currentlyEmployed ? (
        <GlassCard style={styles.card}>
          <Text style={styles.subsectionTitle}>Job application checklist</Text>
          <Text style={styles.sectionMeta}>
            {completedJobApplicationsThisWeek}/{jobApplicationsTarget} applications logged this
            week.
          </Text>
          <Text style={styles.sectionMeta}>
            {ruleSet?.jobSearch.proofRequired
              ? "Photo proof is required for each application."
              : "Photo proof is optional for this house."}
          </Text>
          <TextInput
            style={styles.input}
            value={jobEmployerName}
            onChangeText={setJobEmployerName}
            placeholder="Employer name"
            placeholderTextColor="rgba(245,243,255,0.45)"
          />
          {ruleSet?.jobSearch.proofRequired ? (
            <>
              <View style={styles.inlineActions}>
                <AppButton
                  title={jobProofUri ? "Replace application proof" : "Attach application proof"}
                  variant="secondary"
                  onPress={() => void pickJobApplicationProof()}
                  disabled={isSaving}
                />
                {jobProofUri ? (
                  <>
                    <View style={styles.buttonSpacer} />
                    <AppButton
                      title="Remove photo"
                      variant="secondary"
                      onPress={() => {
                        setJobProofUri(null);
                        setJobProofProvided(false);
                      }}
                      disabled={isSaving}
                    />
                  </>
                ) : null}
              </View>
              <Text style={styles.sectionMeta}>
                {jobProofUri
                  ? `Application proof attached: ${jobProofUri}`
                  : "No application proof attached yet."}
              </Text>
            </>
          ) : (
            <View style={styles.toggleRow}>
              <Text style={styles.label}>Proof available</Text>
              <Switch value={jobProofProvided} onValueChange={setJobProofProvided} />
            </View>
          )}
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={jobNotes}
            onChangeText={setJobNotes}
            placeholder="Application notes"
            placeholderTextColor="rgba(245,243,255,0.45)"
            multiline
          />
          <AppButton
            title="Log job application"
            onPress={() => void logJobApplication()}
            disabled={isSaving}
          />
        </GlassCard>
      ) : null}

      {!readOnly &&
      store.residentRequirementProfile?.workRequired &&
      store.residentRequirementProfile.currentlyEmployed &&
      ruleSet?.employment.workplaceVerificationEnabled ? (
        <GlassCard style={styles.card}>
          <Text style={styles.subsectionTitle}>Log work verification</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={workVerificationNotes}
            onChangeText={setWorkVerificationNotes}
            placeholder="Shift notes or verification summary"
            placeholderTextColor="rgba(245,243,255,0.45)"
            multiline
          />
          <AppButton
            title="Log work verification"
            onPress={() => void logWorkVerification()}
            disabled={isSaving}
          />
        </GlassCard>
      ) : null}

      {!readOnly ? (
        <GlassCard style={styles.card}>
          <Text style={styles.sectionTitle}>Manager Attention View</Text>
          <Text style={styles.sectionMeta}>
            Highlights current sober-house items that need action or setup.
          </Text>
          {attentionItems.length === 0 ? (
            <Text style={styles.sectionMeta}>
              No active at-risk, violation, or setup issues right now.
            </Text>
          ) : (
            attentionItems.map((evaluation) => (
              <View key={`attention-${evaluation.ruleType}`} style={styles.attentionRow}>
                <Text style={styles.attentionTitle}>
                  {residentName} • {labelForRule(evaluation.ruleType)}
                </Text>
                <Text style={styles.complianceReason}>{evaluation.statusReason}</Text>
              </View>
            ))
          )}
        </GlassCard>
      ) : null}

      {!readOnly && statusMessage ? <Text style={styles.inlineStatus}>{statusMessage}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.h3,
    fontWeight: "700",
  },
  subsectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: "700",
  },
  sectionMeta: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 18,
  },
  complianceRow: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.22)",
    padding: spacing.md,
    gap: spacing.xs,
  },
  complianceRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  complianceRuleTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: "700",
  },
  complianceReason: {
    color: colors.textPrimary,
    fontSize: typography.body,
    lineHeight: 20,
  },
  complianceMeta: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 18,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusPillText: {
    fontSize: typography.small,
    fontWeight: "700",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  inlineActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  buttonSpacer: {
    width: spacing.sm,
  },
  label: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: "600",
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.22)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    backgroundColor: "rgba(15, 23, 42, 0.22)",
  },
  multilineInput: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  attentionRow: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.22)",
    padding: spacing.md,
    gap: spacing.xs,
  },
  attentionTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: "700",
  },
  inlineStatus: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
});
