import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { loadAttendanceRecords, loadMeetingAttendanceLogs } from "../lib/attendance/storage";
import { getCurrentLocation, type LocationReadResult } from "../lib/services/locationService";
import {
  evaluateResidentCompliance,
  getEvaluationsNeedingAttention,
  statusToneForComplianceStatus,
} from "../lib/soberHouse/compliance";
import {
  acknowledgeResidentSoberHouseAlert,
  completeResidentSoberHouseChore,
  completeResidentSoberHouseOneOnOne,
  loadResidentSoberHouseObligationsWithCache,
  submitResidentSoberHouseProof,
  type ResidentSoberHouseObligationViewModel,
  type ResidentSoberHouseObligationsSnapshot,
} from "../lib/soberHouse/liveObligations";
import { getActiveHouseAlertAnnouncements, getHouseById } from "../lib/soberHouse/selectors";
import type { ComplianceEvaluation, SoberHouseSettingsStore } from "../lib/soberHouse/types";
import { colors, radius, spacing, typography } from "../lib/theme/tokens";
import { AppButton } from "../lib/ui/AppButton";
import { GlassCard } from "../lib/ui/GlassCard";

type Props = {
  userId: string;
  apiUrl: string;
  authHeader: string | null;
  store: SoberHouseSettingsStore;
  isSaving: boolean;
  readOnly?: boolean;
  onOpenSetupCompletion?: (ruleType: ComplianceEvaluation["ruleType"]) => void;
};

type ProofComposerState = {
  obligationId: string;
  obligationType: ResidentSoberHouseObligationViewModel["obligationType"];
  title: string;
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

function obligationStatusPalette(item: ResidentSoberHouseObligationViewModel) {
  if (item.isCompletedToday) {
    return {
      borderColor: "rgba(25, 135, 84, 0.35)",
      backgroundColor: "rgba(25, 135, 84, 0.12)",
      pillBackground: "rgba(25, 135, 84, 0.18)",
      pillText: "#8AF2BA",
    };
  }
  if (item.isOverdue) {
    return {
      borderColor: "rgba(239, 68, 68, 0.35)",
      backgroundColor: "rgba(239, 68, 68, 0.10)",
      pillBackground: "rgba(239, 68, 68, 0.18)",
      pillText: "#FFB4B4",
    };
  }
  if (item.reviewPending) {
    return {
      borderColor: "rgba(245, 158, 11, 0.35)",
      backgroundColor: "rgba(245, 158, 11, 0.10)",
      pillBackground: "rgba(245, 158, 11, 0.18)",
      pillText: "#F8D47A",
    };
  }
  if (item.isDueToday) {
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

function alertTonePalette(severity: "INFO" | "ACTION_REQUIRED" | "URGENT") {
  if (severity === "URGENT") {
    return {
      borderColor: "rgba(239, 68, 68, 0.35)",
      backgroundColor: "rgba(239, 68, 68, 0.10)",
      pillBackground: "rgba(239, 68, 68, 0.18)",
      pillText: "#FFB4B4",
    };
  }
  if (severity === "ACTION_REQUIRED") {
    return {
      borderColor: "rgba(245, 158, 11, 0.35)",
      backgroundColor: "rgba(245, 158, 11, 0.10)",
      pillBackground: "rgba(245, 158, 11, 0.18)",
      pillText: "#F8D47A",
    };
  }
  return {
    borderColor: "rgba(59, 130, 246, 0.35)",
    backgroundColor: "rgba(59, 130, 246, 0.10)",
    pillBackground: "rgba(59, 130, 246, 0.18)",
    pillText: "#BFDBFE",
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

function LiveObligationRow({
  item,
  readOnly,
  busy,
  onComplete,
  onOpenProofComposer,
}: {
  item: ResidentSoberHouseObligationViewModel;
  readOnly: boolean;
  busy: boolean;
  onComplete: (item: ResidentSoberHouseObligationViewModel) => void;
  onOpenProofComposer: (item: ResidentSoberHouseObligationViewModel) => void;
}) {
  const palette = obligationStatusPalette(item);
  const canComplete =
    item.isActive &&
    !item.reviewPending &&
    (item.obligationType === "CHORE" || item.obligationType === "ONE_ON_ONE");
  const canSubmitProof = item.isActive && !item.reviewPending && !item.proofSubmitted;

  return (
    <View
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
          <Text style={styles.routineTitle}>{item.title}</Text>
          <Text style={styles.routineDetail}>{item.detail}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: palette.pillBackground }]}>
          <Text style={[styles.statusPillText, { color: palette.pillText }]}>
            {item.primaryStatusLabel}
          </Text>
        </View>
      </View>
      <View style={styles.routineMetaRow}>
        {item.metaBadges.map((badge) => (
          <Text key={`${item.id}-${badge}`} style={styles.routineMeta}>
            {badge}
          </Text>
        ))}
      </View>
      {!readOnly && (canComplete || canSubmitProof) ? (
        <View style={styles.inlineActions}>
          {canComplete ? (
            <AppButton
              title={item.obligationType === "CHORE" ? "Complete chore" : "Complete one-on-one"}
              variant="secondary"
              onPress={() => onComplete(item)}
              disabled={busy}
            />
          ) : null}
          {canSubmitProof ? (
            <AppButton
              title="Submit proof"
              variant="secondary"
              onPress={() => onOpenProofComposer(item)}
              disabled={busy}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function SoberHouseComplianceSection({
  userId,
  apiUrl,
  authHeader,
  store,
  isSaving,
  readOnly = false,
  onOpenSetupCompletion,
}: Props) {
  const [attendanceRecords, setAttendanceRecords] = useState<
    Awaited<ReturnType<typeof loadAttendanceRecords>>
  >([]);
  const [meetingAttendanceLogs, setMeetingAttendanceLogs] = useState<
    Awaited<ReturnType<typeof loadMeetingAttendanceLogs>>
  >([]);
  const [locationResult, setLocationResult] = useState<LocationReadResult | null>(null);
  const [liveSnapshot, setLiveSnapshot] = useState<ResidentSoberHouseObligationsSnapshot | null>(
    null,
  );
  const [liveLoading, setLiveLoading] = useState(true);
  const [liveRefreshing, setLiveRefreshing] = useState(false);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);
  const [proofComposer, setProofComposer] = useState<ProofComposerState | null>(null);
  const [proofNote, setProofNote] = useState("");

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

  const refreshLiveObligations = useCallback(
    async (showBlockingLoader: boolean) => {
      if (!authHeader) {
        setLiveSnapshot(null);
        setLiveLoading(false);
        setLiveRefreshing(false);
        setLiveNotice(null);
        setLiveError("Sign in to load live sober-house obligations.");
        return;
      }

      if (showBlockingLoader) {
        setLiveLoading(true);
      } else {
        setLiveRefreshing(true);
      }

      const result = await loadResidentSoberHouseObligationsWithCache({
        storage: AsyncStorage,
        identityKey: authHeader,
        apiUrl,
        authHeader,
      });

      if (result.ok) {
        setLiveSnapshot(result.snapshot);
        setLiveNotice(result.notice);
        setLiveError(null);
      } else {
        setLiveSnapshot(null);
        setLiveNotice(null);
        setLiveError(result.notice);
      }

      setLiveLoading(false);
      setLiveRefreshing(false);
    },
    [apiUrl, authHeader],
  );

  useEffect(() => {
    void refreshContext(false);
  }, [refreshContext]);

  useEffect(() => {
    void refreshLiveObligations(true);
  }, [refreshLiveObligations]);

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
  const routineSummary = useMemo(() => liveSnapshot, [liveSnapshot]);
  const attentionItems = useMemo(
    () => (summary ? getEvaluationsNeedingAttention(summary) : []),
    [summary],
  );
  const residentName = useMemo(() => {
    const housing = store.residentHousingProfile;
    return housing ? `${housing.firstName} ${housing.lastName}`.trim() : "Resident";
  }, [store.residentHousingProfile]);
  const housingProfile = store.residentHousingProfile;
  const house = useMemo(() => {
    const houseId = housingProfile?.houseId;
    return houseId ? getHouseById(store, houseId) : null;
  }, [housingProfile?.houseId, store]);
  const activeAnnouncements = useMemo(
    () => getActiveHouseAlertAnnouncements(store, housingProfile?.houseId ?? null, nowIso),
    [housingProfile?.houseId, nowIso, store],
  );
  const acknowledgedAlertIds = useMemo(
    () =>
      new Set(
        routineSummary?.alertAcknowledgements
          .filter((entry) => entry.status === "ACKNOWLEDGED")
          .map((entry) => entry.alertId) ?? [],
      ),
    [routineSummary?.alertAcknowledgements],
  );

  const runResidentAction = useCallback(
    async (actionKey: string, action: () => Promise<void>, successMessage: string) => {
      setActiveActionKey(actionKey);
      setActionStatus(null);
      setActionError(null);

      try {
        await action();
        await refreshLiveObligations(false);
        setActionStatus(successMessage);
      } catch (error) {
        setActionError(
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Resident action failed.",
        );
      } finally {
        setActiveActionKey(null);
      }
    },
    [refreshLiveObligations],
  );

  const handleCompleteObligation = useCallback(
    (item: ResidentSoberHouseObligationViewModel) => {
      if (!authHeader) {
        setActionError("Sign in to continue.");
        return;
      }

      const timestamp = new Date().toISOString();
      if (item.obligationType === "CHORE") {
        void runResidentAction(
          `complete:${item.id}`,
          () =>
            completeResidentSoberHouseChore({
              apiUrl,
              authHeader,
              obligationId: item.id,
              payload: { completedAt: timestamp },
            }),
          "Chore completion saved.",
        );
        return;
      }

      if (item.obligationType === "ONE_ON_ONE") {
        void runResidentAction(
          `complete:${item.id}`,
          () =>
            completeResidentSoberHouseOneOnOne({
              apiUrl,
              authHeader,
              obligationId: item.id,
              payload: { completedAt: timestamp },
            }),
          "One-on-one completion saved.",
        );
      }
    },
    [apiUrl, authHeader, runResidentAction],
  );

  const handleOpenProofComposer = useCallback((item: ResidentSoberHouseObligationViewModel) => {
    setProofComposer({
      obligationId: item.id,
      obligationType: item.obligationType,
      title: item.title,
    });
    setProofNote("");
    setActionStatus(null);
    setActionError(null);
  }, []);

  const handleSubmitProof = useCallback(() => {
    if (!proofComposer || !authHeader) {
      setActionError("Sign in to continue.");
      return;
    }
    const note = proofNote.trim();
    if (!note) {
      setActionError("Add a short proof note before submitting.");
      return;
    }

    const timestamp = new Date().toISOString();
    void runResidentAction(
      `proof:${proofComposer.obligationId}`,
      async () => {
        await submitResidentSoberHouseProof({
          apiUrl,
          authHeader,
          obligationId: proofComposer.obligationId,
          payload: {
            submittedAt: timestamp,
            proofMetadata: {
              source: "ios_resident_note",
              note,
              obligationType: proofComposer.obligationType,
            },
          },
        });
        setProofComposer(null);
        setProofNote("");
      },
      "Proof submission saved.",
    );
  }, [apiUrl, authHeader, proofComposer, proofNote, runResidentAction]);

  const handleAcknowledgeAlert = useCallback(
    (alertId: string) => {
      if (!authHeader) {
        setActionError("Sign in to continue.");
        return;
      }

      const timestamp = new Date().toISOString();
      void runResidentAction(
        `alert:${alertId}`,
        () =>
          acknowledgeResidentSoberHouseAlert({
            apiUrl,
            authHeader,
            alertId,
            payload: { acknowledgedAt: timestamp },
          }),
        "Alert acknowledgement saved.",
      );
    },
    [apiUrl, authHeader, runResidentAction],
  );

  if (!summary) {
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
            <Text style={styles.sectionTitle}>Live Sober House Obligations</Text>
            <Text style={styles.sectionMeta}>
              {residentName} • {house?.name ?? "Assigned house"} • Resident obligation reads now
              come from the soberai backend.
            </Text>
          </View>
          <AppButton
            title="Refresh"
            variant="secondary"
            onPress={() => {
              void refreshContext(false);
              void refreshLiveObligations(false);
            }}
            disabled={isSaving}
          />
        </View>
        {liveLoading && !routineSummary ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.textPrimary} />
            <Text style={styles.sectionMeta}>Loading live obligations...</Text>
          </View>
        ) : liveError && !routineSummary ? (
          <View style={styles.emptyStateWrap}>
            <Text style={styles.sectionMeta}>{liveError}</Text>
            <View style={styles.inlineActions}>
              <AppButton
                title="Retry"
                variant="secondary"
                onPress={() => void refreshLiveObligations(true)}
                disabled={isSaving}
              />
            </View>
          </View>
        ) : routineSummary ? (
          <>
            <View style={styles.progressRow}>
              <View style={styles.progressMetric}>
                <Text style={styles.progressValue}>{routineSummary.summary.active}</Text>
                <Text style={styles.progressLabel}>Active</Text>
              </View>
              <View style={styles.progressMetric}>
                <Text style={styles.progressValue}>{routineSummary.summary.dueToday}</Text>
                <Text style={styles.progressLabel}>Due Today</Text>
              </View>
              <View style={styles.progressMetric}>
                <Text style={styles.progressValue}>{routineSummary.summary.overdue}</Text>
                <Text style={styles.progressLabel}>Overdue</Text>
              </View>
              <View style={styles.progressMetric}>
                <Text style={styles.progressValue}>{routineSummary.summary.reviewPending}</Text>
                <Text style={styles.progressLabel}>Review Pending</Text>
              </View>
              <View style={styles.progressMetric}>
                <Text style={styles.progressValue}>{routineSummary.summary.completedToday}</Text>
                <Text style={styles.progressLabel}>Completed Today</Text>
              </View>
            </View>
            <Text style={styles.sectionMeta}>
              {routineSummary.source === "offline_cache"
                ? "Showing the last saved live snapshot from this device."
                : "Showing the latest obligation read returned by the backend."}{" "}
              Synced {formatIso(routineSummary.fetchedAt)}.
            </Text>
            {liveRefreshing ? (
              <Text style={styles.sectionMeta}>Refreshing live obligations...</Text>
            ) : null}
            {liveNotice ? <Text style={styles.offlineNotice}>{liveNotice}</Text> : null}
            {actionStatus ? <Text style={styles.successNotice}>{actionStatus}</Text> : null}
            {actionError ? <Text style={styles.errorNotice}>{actionError}</Text> : null}
          </>
        ) : null}
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
        <Text style={styles.sectionTitle}>Resident Obligation Queue</Text>
        <Text style={styles.sectionMeta}>
          Active, due-today, overdue, review-pending, and completed-today sections below are read
          from the live sober-house obligation APIs, and the first resident completion/proof actions
          now post back to the backend from this screen.
        </Text>
        {liveLoading && !routineSummary ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.textPrimary} />
            <Text style={styles.sectionMeta}>Loading resident obligations...</Text>
          </View>
        ) : liveError && !routineSummary ? (
          <View style={styles.emptyStateWrap}>
            <Text style={styles.sectionMeta}>{liveError}</Text>
          </View>
        ) : routineSummary ? (
          <View style={styles.sectionStack}>
            {routineSummary.sections.map((section) => (
              <View key={section.id} style={styles.liveSectionWrap}>
                <View style={styles.liveSectionHeader}>
                  <Text style={styles.liveSectionTitle}>{section.title}</Text>
                  <Text style={styles.liveSectionCount}>{section.items.length}</Text>
                </View>
                {section.items.length === 0 ? (
                  <Text style={styles.sectionMeta}>{section.emptyMessage}</Text>
                ) : (
                  section.items.map((item) => (
                    <LiveObligationRow
                      key={`${section.id}-${item.id}`}
                      item={item}
                      readOnly={readOnly}
                      busy={
                        activeActionKey === `complete:${item.id}` ||
                        activeActionKey === `proof:${item.id}`
                      }
                      onComplete={handleCompleteObligation}
                      onOpenProofComposer={handleOpenProofComposer}
                    />
                  ))
                )}
              </View>
            ))}
          </View>
        ) : null}
      </GlassCard>

      {!readOnly && proofComposer ? (
        <GlassCard style={styles.card}>
          <Text style={styles.sectionTitle}>Submit Proof</Text>
          <Text style={styles.sectionMeta}>
            Add a short note describing the proof for {proofComposer.title.toLowerCase()}.
          </Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={proofNote}
            onChangeText={setProofNote}
            placeholder="Proof note"
            placeholderTextColor="rgba(245,243,255,0.45)"
            multiline
          />
          <View style={styles.inlineActions}>
            <AppButton
              title="Send proof"
              onPress={handleSubmitProof}
              disabled={activeActionKey === `proof:${proofComposer.obligationId}` || isSaving}
            />
            <AppButton
              title="Cancel"
              variant="secondary"
              onPress={() => {
                setProofComposer(null);
                setProofNote("");
              }}
              disabled={activeActionKey === `proof:${proofComposer.obligationId}` || isSaving}
            />
          </View>
        </GlassCard>
      ) : null}

      {!readOnly ? (
        <GlassCard style={styles.card}>
          <Text style={styles.sectionTitle}>Active House Alerts</Text>
          <Text style={styles.sectionMeta}>
            Alert acknowledgements post to the live resident endpoint. Alert list display still
            comes from the current sober-house store until a resident alert read endpoint exists.
          </Text>
          {activeAnnouncements.length === 0 ? (
            <Text style={styles.sectionMeta}>No active house alerts right now.</Text>
          ) : (
            activeAnnouncements.map((announcement) => {
              const palette = alertTonePalette(announcement.severity);
              const acknowledged = acknowledgedAlertIds.has(announcement.id);
              return (
                <View
                  key={announcement.id}
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
                      <Text style={styles.routineTitle}>{announcement.title}</Text>
                      <Text style={styles.routineDetail}>{announcement.body}</Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: palette.pillBackground }]}>
                      <Text style={[styles.statusPillText, { color: palette.pillText }]}>
                        {announcement.severity === "ACTION_REQUIRED"
                          ? "Action required"
                          : announcement.severity === "URGENT"
                            ? "Urgent"
                            : "Info"}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.routineMetaRow}>
                    <Text style={styles.routineMeta}>
                      {announcement.acknowledgmentRequired
                        ? acknowledged
                          ? "Acknowledged"
                          : "Acknowledgement required"
                        : "Acknowledgement optional"}
                    </Text>
                    <Text style={styles.routineMeta}>
                      Started {formatIso(announcement.startsAt)}
                    </Text>
                  </View>
                  {announcement.acknowledgmentRequired && !acknowledged ? (
                    <View style={styles.inlineActions}>
                      <AppButton
                        title="Acknowledge"
                        variant="secondary"
                        onPress={() => handleAcknowledgeAlert(announcement.id)}
                        disabled={activeActionKey === `alert:${announcement.id}` || isSaving}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </GlassCard>
      ) : null}

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

      {liveError && routineSummary ? <Text style={styles.inlineStatus}>{liveError}</Text> : null}
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
  loadingWrap: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    alignItems: "flex-start",
  },
  emptyStateWrap: {
    gap: spacing.sm,
  },
  sectionStack: {
    gap: spacing.lg,
  },
  liveSectionWrap: {
    gap: spacing.sm,
  },
  liveSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  liveSectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: "700",
  },
  liveSectionCount: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: "700",
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
  offlineNotice: {
    color: "#F8D47A",
    fontSize: typography.small,
    lineHeight: 20,
  },
  successNotice: {
    color: "#8AF2BA",
    fontSize: typography.small,
    lineHeight: 20,
  },
  errorNotice: {
    color: "#FFB4B4",
    fontSize: typography.small,
    lineHeight: 20,
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
