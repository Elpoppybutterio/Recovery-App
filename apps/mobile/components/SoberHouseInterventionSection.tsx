import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { loadAttendanceRecords, loadMeetingAttendanceLogs } from "../lib/attendance/storage";
import { getCurrentLocation, type LocationReadResult } from "../lib/services/locationService";
import { evaluateResidentCompliance } from "../lib/soberHouse/compliance";
import {
  addCorrectiveActionToViolation,
  addEvidenceLink,
  buildResidentViolationSummary,
  createManualViolation,
  getOpenViolationForEvaluation,
  labelForViolationRuleType,
  labelForViolationSeverity,
  labelForViolationStatus,
  syncViolationsFromComplianceSummary,
  transitionCorrectiveActionStatus,
  transitionViolationForManager,
} from "../lib/soberHouse/interventions";
import { upsertViolation } from "../lib/soberHouse/mutations";
import {
  getCorrectiveActionsForViolation,
  getEvidenceItemsForViolation,
  getHouseById,
  getResidentDisplayName,
  getViolationById,
} from "../lib/soberHouse/selectors";
import type {
  AuditActor,
  ComplianceEvaluation,
  CorrectiveActionStatus,
  CorrectiveActionType,
  EvidenceType,
  SoberHouseSettingsStore,
  Violation,
  ViolationRuleType,
  ViolationSeverity,
  ViolationStatus,
} from "../lib/soberHouse/types";
import {
  CORRECTIVE_ACTION_STATUS_OPTIONS,
  CORRECTIVE_ACTION_TYPE_OPTIONS,
  EVIDENCE_TYPE_OPTIONS,
  VIOLATION_RULE_TYPE_OPTIONS,
  VIOLATION_SEVERITY_OPTIONS,
  VIOLATION_STATUS_OPTIONS,
} from "../lib/soberHouse/types";
import { colors, radius, spacing, typography } from "../lib/theme/tokens";
import { AppButton } from "../lib/ui/AppButton";
import { GlassCard } from "../lib/ui/GlassCard";

type PersistOptions = {
  showStatus?: boolean;
};

type Props = {
  userId: string;
  store: SoberHouseSettingsStore;
  actor: AuditActor;
  isSaving: boolean;
  onOpenChat: (input: { violationId: string; correctiveActionId?: string | null }) => void;
  onPersist: (
    nextStore: SoberHouseSettingsStore,
    successMessage: string,
    options?: PersistOptions,
  ) => Promise<void>;
};

type QueueStatusFilter = "ALL" | ViolationStatus;
type QueueRuleFilter = "ALL" | ViolationRuleType;

const INPUT_PLACEHOLDER_COLOR = "rgba(245,243,255,0.45)";

function formatIso(value: string | null): string {
  if (!value) {
    return "None";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function statusPillStyle(status: ViolationStatus) {
  if (status === "RESOLVED") {
    return { backgroundColor: "rgba(25, 135, 84, 0.18)", color: "#8AF2BA" };
  }
  if (status === "DISMISSED") {
    return { backgroundColor: "rgba(148, 163, 184, 0.18)", color: colors.textSecondary };
  }
  if (status === "UNDER_REVIEW" || status === "CORRECTIVE_ACTION_ASSIGNED") {
    return { backgroundColor: "rgba(245, 158, 11, 0.18)", color: "#F8D47A" };
  }
  return { backgroundColor: "rgba(239, 68, 68, 0.18)", color: "#FFB4B4" };
}

function FilterChip({
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

function relatedAuditEntries(store: SoberHouseSettingsStore, violation: Violation) {
  const correctiveIds = new Set(violation.correctiveActionIds);
  const evidenceIds = new Set(violation.evidenceItemIds);
  return store.auditLogEntries.filter((entry) => {
    if (entry.entityType === "violation" && entry.entityId === violation.id) {
      return true;
    }
    if (entry.entityType === "correctiveAction" && correctiveIds.has(entry.entityId)) {
      return true;
    }
    if (entry.entityType === "evidenceItem" && evidenceIds.has(entry.entityId)) {
      return true;
    }
    return false;
  });
}

export function SoberHouseInterventionSection({
  userId,
  store,
  actor,
  isSaving,
  onOpenChat,
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
  const [selectedViolationId, setSelectedViolationId] = useState<string | null>(null);
  const [queueStatusFilter, setQueueStatusFilter] = useState<QueueStatusFilter>("ALL");
  const [queueRuleFilter, setQueueRuleFilter] = useState<QueueRuleFilter>("ALL");
  const [managerNotesDraft, setManagerNotesDraft] = useState("");
  const [resolutionNotesDraft, setResolutionNotesDraft] = useState("");
  const [correctiveActionType, setCorrectiveActionType] = useState<CorrectiveActionType>("WARNING");
  const [correctiveActionDueAt, setCorrectiveActionDueAt] = useState("");
  const [correctiveActionNotes, setCorrectiveActionNotes] = useState("");
  const [evidenceType, setEvidenceType] = useState<EvidenceType>("NOTE");
  const [evidenceAssetReference, setEvidenceAssetReference] = useState("");
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [selectedEvidenceActionId, setSelectedEvidenceActionId] = useState<string | null>(null);
  const [manualViolationRuleType, setManualViolationRuleType] =
    useState<ViolationRuleType>("other");
  const [manualViolationSeverity, setManualViolationSeverity] =
    useState<ViolationSeverity>("WARNING");
  const [manualViolationReason, setManualViolationReason] = useState("");

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
    [attendanceRecords, meetingAttendanceLogs, locationResult?.coords, store],
  );
  const complianceSummary = useMemo(
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

  const candidateViolations = useMemo(
    () =>
      (complianceSummary?.evaluations ?? [])
        .filter((evaluation) => evaluation.status === "violation")
        .map((evaluation) => ({
          evaluation,
          existing: getOpenViolationForEvaluation(store, evaluation),
        })),
    [complianceSummary, store],
  );

  const residentSummary = useMemo(() => buildResidentViolationSummary(store), [store]);
  const residentName = useMemo(() => getResidentDisplayName(store), [store]);
  const queueViolations = useMemo(() => {
    return [...store.violations]
      .filter((violation) =>
        queueStatusFilter === "ALL" ? true : violation.status === queueStatusFilter,
      )
      .filter((violation) =>
        queueRuleFilter === "ALL" ? true : violation.ruleType === queueRuleFilter,
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [queueRuleFilter, queueStatusFilter, store.violations]);

  const selectedViolation = useMemo(
    () => (selectedViolationId ? getViolationById(store, selectedViolationId) : null),
    [selectedViolationId, store],
  );
  const selectedViolationActions = useMemo(
    () => (selectedViolation ? getCorrectiveActionsForViolation(store, selectedViolation.id) : []),
    [selectedViolation, store],
  );
  const selectedViolationEvidence = useMemo(
    () => (selectedViolation ? getEvidenceItemsForViolation(store, selectedViolation.id) : []),
    [selectedViolation, store],
  );
  const selectedHouse = useMemo(
    () => (selectedViolation?.houseId ? getHouseById(store, selectedViolation.houseId) : null),
    [selectedViolation?.houseId, store],
  );
  const auditTrail = useMemo(
    () => (selectedViolation ? relatedAuditEntries(store, selectedViolation) : []),
    [selectedViolation, store],
  );

  useEffect(() => {
    if (selectedViolation) {
      setManagerNotesDraft(selectedViolation.managerNotes);
      setResolutionNotesDraft(selectedViolation.resolutionNotes);
    }
  }, [selectedViolation]);

  const evidenceSuggestions = useMemo(() => {
    const suggestions: Array<{
      label: string;
      evidenceType: EvidenceType;
      assetReference: string | null;
      description: string;
      metadata?: Record<string, string | number | boolean | null>;
    }> = [];

    if (store.residentConsentRecord?.signatureRef?.uri) {
      suggestions.push({
        label: "Resident consent signature",
        evidenceType: "SIGNATURE",
        assetReference: store.residentConsentRecord.signatureRef.uri,
        description: "Resident consent signature on file.",
      });
    }

    for (const completion of store.choreCompletionRecords.filter(
      (record) => record.proofReference,
    )) {
      suggestions.push({
        label: `Chore proof ${formatIso(completion.completedAt)}`,
        evidenceType: "PHOTO",
        assetReference: completion.proofReference,
        description: completion.notes || "Linked chore proof.",
        metadata: { choreCompletedAt: completion.completedAt },
      });
    }

    for (const record of attendanceRecords.slice(0, 5)) {
      suggestions.push({
        label: `Attendance ${record.meetingId} ${formatIso(record.startAt)}`,
        evidenceType: "ATTENDANCE_REFERENCE",
        assetReference: `attendance-record:${record.id}`,
        description: `Linked attendance record ${record.id}.`,
        metadata: { meetingId: record.meetingId, attendanceRecordId: record.id },
      });
    }

    return suggestions.slice(0, 10);
  }, [attendanceRecords, store.choreCompletionRecords, store.residentConsentRecord]);

  const syncViolations = useCallback(async () => {
    const timestamp = new Date().toISOString();
    const result = syncViolationsFromComplianceSummary(store, actor, complianceSummary, timestamp);
    await onPersist(
      result.store,
      result.violations.length > 0
        ? `Violation queue synced (${result.violations.length} active record${result.violations.length === 1 ? "" : "s"}).`
        : "No violation-state compliance items needed records.",
    );
  }, [actor, complianceSummary, onPersist, store]);

  const createViolationForEvaluation = useCallback(
    async (evaluation: ComplianceEvaluation) => {
      const timestamp = new Date().toISOString();
      const result = syncViolationsFromComplianceSummary(
        store,
        actor,
        {
          residentId: evaluation.residentId,
          houseId: evaluation.houseId,
          evaluatedAt: evaluation.evaluatedAt,
          evaluations: [evaluation],
        },
        timestamp,
      );
      await onPersist(result.store, "Violation record saved from compliance.");
      const created =
        result.violations[0] ?? getOpenViolationForEvaluation(result.store, evaluation) ?? null;
      if (created) {
        setSelectedViolationId(created.id);
      }
    },
    [actor, onPersist, store],
  );

  const saveManagerNotes = useCallback(async () => {
    if (!selectedViolation) {
      return;
    }
    const timestamp = new Date().toISOString();
    const result = upsertViolation(
      store,
      actor,
      {
        ...selectedViolation,
        managerNotes: managerNotesDraft.trim(),
      },
      timestamp,
    );
    await onPersist(result.store, "Violation notes updated.");
  }, [actor, managerNotesDraft, onPersist, selectedViolation, store]);

  const updateViolationSeverity = useCallback(
    async (severity: ViolationSeverity) => {
      if (!selectedViolation) {
        return;
      }
      const timestamp = new Date().toISOString();
      const result = upsertViolation(
        store,
        actor,
        {
          ...selectedViolation,
          severity,
        },
        timestamp,
      );
      await onPersist(result.store, "Violation severity updated.");
    },
    [actor, onPersist, selectedViolation, store],
  );

  const transitionViolation = useCallback(
    async (status: ViolationStatus) => {
      if (!selectedViolation) {
        return;
      }
      const timestamp = new Date().toISOString();
      const result = transitionViolationForManager(
        store,
        actor,
        selectedViolation.id,
        status,
        timestamp,
        status === "RESOLVED" || status === "DISMISSED"
          ? resolutionNotesDraft.trim()
          : managerNotesDraft.trim(),
      );
      await onPersist(result.store, `Violation moved to ${labelForViolationStatus(status)}.`);
    },
    [actor, managerNotesDraft, onPersist, resolutionNotesDraft, selectedViolation, store],
  );

  const addCorrectiveAction = useCallback(async () => {
    if (!selectedViolation) {
      return;
    }
    const timestamp = new Date().toISOString();
    const dueAt = correctiveActionDueAt.trim().length > 0 ? correctiveActionDueAt.trim() : null;
    const result = addCorrectiveActionToViolation(
      store,
      actor,
      selectedViolation.id,
      {
        actionType: correctiveActionType,
        dueAt,
        notes: correctiveActionNotes.trim(),
      },
      timestamp,
    );
    await onPersist(result.store, "Corrective action assigned.");
    setCorrectiveActionDueAt("");
    setCorrectiveActionNotes("");
  }, [
    actor,
    correctiveActionDueAt,
    correctiveActionNotes,
    correctiveActionType,
    onPersist,
    selectedViolation,
    store,
  ]);

  const updateCorrectiveActionStatus = useCallback(
    async (actionId: string, nextStatus: CorrectiveActionStatus) => {
      const timestamp = new Date().toISOString();
      const result = transitionCorrectiveActionStatus(
        store,
        actor,
        actionId,
        nextStatus,
        timestamp,
        nextStatus === "COMPLETED" ? "Completed by manager review." : "",
      );
      await onPersist(result.store, `Corrective action marked ${nextStatus.toLowerCase()}.`);
    },
    [actor, onPersist, store],
  );

  const addEvidence = useCallback(async () => {
    if (!selectedViolation) {
      return;
    }
    const assetReference =
      evidenceAssetReference.trim().length > 0 ? evidenceAssetReference.trim() : null;
    if (evidenceType !== "NOTE" && assetReference === null) {
      setStatusMessage("A real asset or reference is required for non-note evidence.");
      return;
    }
    if (evidenceDescription.trim().length === 0) {
      setStatusMessage("Evidence description is required.");
      return;
    }
    const timestamp = new Date().toISOString();
    const result = addEvidenceLink(
      store,
      actor,
      selectedViolation.id,
      {
        linkedCorrectiveActionId: selectedEvidenceActionId,
        evidenceType,
        assetReference,
        description: evidenceDescription.trim(),
      },
      timestamp,
    );
    await onPersist(result.store, "Evidence linked to violation.");
    setEvidenceAssetReference("");
    setEvidenceDescription("");
    setSelectedEvidenceActionId(null);
  }, [
    actor,
    evidenceAssetReference,
    evidenceDescription,
    evidenceType,
    onPersist,
    selectedEvidenceActionId,
    selectedViolation,
    store,
  ]);

  const createManualViolationRecord = useCallback(async () => {
    if (manualViolationReason.trim().length === 0) {
      setStatusMessage("Manual violation reason is required.");
      return;
    }
    const timestamp = new Date().toISOString();
    const result = createManualViolation(
      store,
      actor,
      {
        ruleType: manualViolationRuleType,
        severity: manualViolationSeverity,
        reasonSummary: manualViolationReason.trim(),
      },
      timestamp,
    );
    await onPersist(result.store, "Manual violation created.");
    setManualViolationReason("");
    if (result.violation) {
      setSelectedViolationId(result.violation.id);
    }
  }, [
    actor,
    manualViolationReason,
    manualViolationRuleType,
    manualViolationSeverity,
    onPersist,
    store,
  ]);

  if (!store.residentHousingProfile || !store.residentRequirementProfile) {
    return (
      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Violations and Actions</Text>
        <Text style={styles.sectionMeta}>
          Complete resident setup before managing sober-house intervention records.
        </Text>
      </GlassCard>
    );
  }

  return (
    <>
      <GlassCard style={styles.card}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.sectionTitle}>Violation Intake</Text>
            <Text style={styles.sectionMeta}>
              Convert live compliance failures into deduped violation records.
            </Text>
          </View>
          <AppButton
            title="Sync violations"
            variant="secondary"
            onPress={() => void syncViolations()}
            disabled={isSaving}
          />
        </View>
        {candidateViolations.length === 0 ? (
          <Text style={styles.sectionMeta}>No compliance violations are active right now.</Text>
        ) : (
          candidateViolations.map(({ evaluation, existing }) => (
            <View key={`${evaluation.ruleType}-${evaluation.evaluatedAt}`} style={styles.queueRow}>
              <View style={styles.queueCopy}>
                <Text style={styles.queueTitle}>
                  {residentName} • {labelForViolationRuleType(evaluation.ruleType)}
                </Text>
                <Text style={styles.sectionMeta}>{evaluation.statusReason}</Text>
                <Text style={styles.sectionMeta}>
                  Evaluated {formatIso(evaluation.evaluatedAt)}
                </Text>
              </View>
              <AppButton
                title={existing ? "View" : "Create"}
                variant="secondary"
                onPress={() =>
                  existing
                    ? setSelectedViolationId(existing.id)
                    : void createViolationForEvaluation(evaluation)
                }
                disabled={isSaving}
              />
            </View>
          ))
        )}
        <Text style={styles.subsectionTitle}>Manual violation</Text>
        <View style={styles.chipRow}>
          {VIOLATION_RULE_TYPE_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              selected={manualViolationRuleType === option.value}
              onPress={() => setManualViolationRuleType(option.value)}
            />
          ))}
        </View>
        <View style={styles.chipRow}>
          {VIOLATION_SEVERITY_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              selected={manualViolationSeverity === option.value}
              onPress={() => setManualViolationSeverity(option.value)}
            />
          ))}
        </View>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={manualViolationReason}
          onChangeText={setManualViolationReason}
          placeholder="Manual violation reason"
          placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
          multiline
        />
        <AppButton
          title="Create manual violation"
          onPress={() => void createManualViolationRecord()}
          disabled={isSaving}
        />
      </GlassCard>

      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Manager Review Queue</Text>
        <Text style={styles.sectionMeta}>
          Work open, under-review, action-assigned, and recent closed sober-house issues.
        </Text>
        <Text style={styles.filterLabel}>Status filter</Text>
        <View style={styles.chipRow}>
          <FilterChip
            label="All"
            selected={queueStatusFilter === "ALL"}
            onPress={() => setQueueStatusFilter("ALL")}
          />
          {VIOLATION_STATUS_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              selected={queueStatusFilter === option.value}
              onPress={() => setQueueStatusFilter(option.value)}
            />
          ))}
        </View>
        <Text style={styles.filterLabel}>Rule filter</Text>
        <View style={styles.chipRow}>
          <FilterChip
            label="All"
            selected={queueRuleFilter === "ALL"}
            onPress={() => setQueueRuleFilter("ALL")}
          />
          {VIOLATION_RULE_TYPE_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              selected={queueRuleFilter === option.value}
              onPress={() => setQueueRuleFilter(option.value)}
            />
          ))}
        </View>
        {queueViolations.length === 0 ? (
          <Text style={styles.sectionMeta}>No violations match the current filters.</Text>
        ) : (
          queueViolations.map((violation) => {
            const pill = statusPillStyle(violation.status);
            return (
              <Pressable
                key={violation.id}
                style={[
                  styles.queueRow,
                  selectedViolationId === violation.id ? styles.queueRowSelected : null,
                ]}
                onPress={() => setSelectedViolationId(violation.id)}
              >
                <View style={styles.queueCopy}>
                  <Text style={styles.queueTitle}>
                    {residentName} • {labelForViolationRuleType(violation.ruleType)}
                  </Text>
                  <Text style={styles.sectionMeta}>{violation.reasonSummary}</Text>
                  <Text style={styles.sectionMeta}>
                    {getHouseById(store, violation.houseId ?? "")?.name ?? "No house"} • Triggered{" "}
                    {formatIso(violation.triggeredAt)}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: pill.backgroundColor }]}>
                  <Text style={[styles.statusPillText, { color: pill.color }]}>
                    {labelForViolationStatus(violation.status)}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </GlassCard>

      {selectedViolation ? (
        <GlassCard style={styles.card}>
          <Text style={styles.sectionTitle}>Violation Detail</Text>
          <Text style={styles.sectionMeta}>
            {residentName} • {selectedHouse?.name ?? "No house"} •{" "}
            {labelForViolationRuleType(selectedViolation.ruleType)}
          </Text>
          <View style={styles.detailGrid}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Status</Text>
              <Text style={styles.detailValue}>
                {labelForViolationStatus(selectedViolation.status)}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Severity</Text>
              <Text style={styles.detailValue}>
                {labelForViolationSeverity(selectedViolation.severity)}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Triggered</Text>
              <Text style={styles.detailValue}>{formatIso(selectedViolation.triggeredAt)}</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Effective</Text>
              <Text style={styles.detailValue}>{formatIso(selectedViolation.effectiveAt)}</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Due / target</Text>
              <Text style={styles.detailValue}>{formatIso(selectedViolation.dueAt)}</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Grace used</Text>
              <Text style={styles.detailValue}>
                {selectedViolation.gracePeriodMinutesUsed === null
                  ? "None"
                  : `${selectedViolation.gracePeriodMinutesUsed} min`}
              </Text>
            </View>
          </View>
          <Text style={styles.subsectionTitle}>Reason summary</Text>
          <Text style={styles.bodyText}>{selectedViolation.reasonSummary}</Text>

          <Text style={styles.subsectionTitle}>Manager notes</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={managerNotesDraft}
            onChangeText={setManagerNotesDraft}
            placeholder="Manager review notes"
            placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
            multiline
          />
          <View style={styles.buttonRow}>
            <AppButton
              title="Save notes"
              onPress={() => void saveManagerNotes()}
              disabled={isSaving}
            />
            <View style={styles.buttonSpacer} />
            <AppButton
              title="Under review"
              variant="secondary"
              onPress={() => void transitionViolation("UNDER_REVIEW")}
              disabled={isSaving}
            />
          </View>
          <AppButton
            title="Open linked chat"
            variant="secondary"
            onPress={() => onOpenChat({ violationId: selectedViolation.id })}
            disabled={isSaving}
          />

          <Text style={styles.subsectionTitle}>Severity</Text>
          <View style={styles.chipRow}>
            {VIOLATION_SEVERITY_OPTIONS.map((option) => (
              <FilterChip
                key={option.value}
                label={option.label}
                selected={selectedViolation.severity === option.value}
                onPress={() => void updateViolationSeverity(option.value)}
              />
            ))}
          </View>

          <Text style={styles.subsectionTitle}>Corrective actions</Text>
          {selectedViolationActions.length === 0 ? (
            <Text style={styles.sectionMeta}>No corrective actions assigned yet.</Text>
          ) : (
            selectedViolationActions.map((action) => (
              <View key={action.id} style={styles.linkedRow}>
                <Text style={styles.queueTitle}>
                  {CORRECTIVE_ACTION_TYPE_OPTIONS.find(
                    (option) => option.value === action.actionType,
                  )?.label ?? action.actionType}
                </Text>
                <Text style={styles.sectionMeta}>
                  {action.status} • Due {formatIso(action.dueAt)}
                </Text>
                <Text style={styles.sectionMeta}>{action.notes || "No instructions."}</Text>
                <AppButton
                  title="Message in chat"
                  variant="secondary"
                  onPress={() =>
                    onOpenChat({
                      violationId: selectedViolation.id,
                      correctiveActionId: action.id,
                    })
                  }
                  disabled={isSaving}
                />
                <View style={styles.chipRow}>
                  {CORRECTIVE_ACTION_STATUS_OPTIONS.map((option) => (
                    <FilterChip
                      key={option.value}
                      label={option.label}
                      selected={action.status === option.value}
                      onPress={() => void updateCorrectiveActionStatus(action.id, option.value)}
                    />
                  ))}
                </View>
              </View>
            ))
          )}
          <View style={styles.chipRow}>
            {CORRECTIVE_ACTION_TYPE_OPTIONS.map((option) => (
              <FilterChip
                key={option.value}
                label={option.label}
                selected={correctiveActionType === option.value}
                onPress={() => setCorrectiveActionType(option.value)}
              />
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={correctiveActionDueAt}
            onChangeText={setCorrectiveActionDueAt}
            placeholder="Due date/time (optional ISO or YYYY-MM-DD)"
            placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
          />
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={correctiveActionNotes}
            onChangeText={setCorrectiveActionNotes}
            placeholder="Corrective action instructions"
            placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
            multiline
          />
          <AppButton
            title="Assign corrective action"
            onPress={() => void addCorrectiveAction()}
            disabled={isSaving}
          />

          <Text style={styles.subsectionTitle}>Evidence linkage</Text>
          {selectedViolationEvidence.length === 0 ? (
            <Text style={styles.sectionMeta}>No evidence linked yet.</Text>
          ) : (
            selectedViolationEvidence.map((item) => (
              <View key={item.id} style={styles.linkedRow}>
                <Text style={styles.queueTitle}>
                  {EVIDENCE_TYPE_OPTIONS.find((option) => option.value === item.evidenceType)
                    ?.label ?? item.evidenceType}
                </Text>
                <Text style={styles.sectionMeta}>{item.description}</Text>
                <Text style={styles.sectionMeta}>{item.assetReference ?? "Inline note only"}</Text>
              </View>
            ))
          )}
          <Text style={styles.filterLabel}>Suggested references</Text>
          <View style={styles.chipRow}>
            {evidenceSuggestions.map((suggestion) => (
              <FilterChip
                key={`${suggestion.label}-${suggestion.assetReference ?? "note"}`}
                label={suggestion.label}
                selected={
                  evidenceType === suggestion.evidenceType &&
                  evidenceAssetReference === (suggestion.assetReference ?? "")
                }
                onPress={() => {
                  setEvidenceType(suggestion.evidenceType);
                  setEvidenceAssetReference(suggestion.assetReference ?? "");
                  setEvidenceDescription(suggestion.description);
                }}
              />
            ))}
          </View>
          <View style={styles.chipRow}>
            {EVIDENCE_TYPE_OPTIONS.map((option) => (
              <FilterChip
                key={option.value}
                label={option.label}
                selected={evidenceType === option.value}
                onPress={() => setEvidenceType(option.value)}
              />
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={evidenceAssetReference}
            onChangeText={setEvidenceAssetReference}
            placeholder="Existing asset/reference URI"
            placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
          />
          <Text style={styles.filterLabel}>Link to corrective action</Text>
          <View style={styles.chipRow}>
            <FilterChip
              label="Violation only"
              selected={selectedEvidenceActionId === null}
              onPress={() => setSelectedEvidenceActionId(null)}
            />
            {selectedViolationActions.map((action) => (
              <FilterChip
                key={action.id}
                label={
                  CORRECTIVE_ACTION_TYPE_OPTIONS.find(
                    (option) => option.value === action.actionType,
                  )?.label ?? action.actionType
                }
                selected={selectedEvidenceActionId === action.id}
                onPress={() => setSelectedEvidenceActionId(action.id)}
              />
            ))}
          </View>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={evidenceDescription}
            onChangeText={setEvidenceDescription}
            placeholder="Evidence description"
            placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
            multiline
          />
          <AppButton title="Link evidence" onPress={() => void addEvidence()} disabled={isSaving} />

          <Text style={styles.subsectionTitle}>Resolution</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={resolutionNotesDraft}
            onChangeText={setResolutionNotesDraft}
            placeholder="Resolution or dismissal notes"
            placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
            multiline
          />
          <View style={styles.buttonRow}>
            <AppButton
              title="Resolve"
              onPress={() => void transitionViolation("RESOLVED")}
              disabled={isSaving}
            />
            <View style={styles.buttonSpacer} />
            <AppButton
              title="Dismiss"
              variant="secondary"
              onPress={() => void transitionViolation("DISMISSED")}
              disabled={isSaving}
            />
          </View>

          <Text style={styles.subsectionTitle}>History</Text>
          {auditTrail.length === 0 ? (
            <Text style={styles.sectionMeta}>No audit history for this intervention yet.</Text>
          ) : (
            auditTrail.slice(0, 20).map((entry) => (
              <View key={entry.id} style={styles.auditRow}>
                <Text style={styles.queueTitle}>
                  {entry.actor.name} • {entry.actionTaken ?? entry.fieldChanged}
                </Text>
                <Text style={styles.sectionMeta}>{formatIso(entry.timestamp)}</Text>
                <Text style={styles.sectionMeta}>
                  {entry.fieldChanged}: {entry.oldValue ?? "None"} → {entry.newValue ?? "None"}
                </Text>
              </View>
            ))
          )}
        </GlassCard>
      ) : null}

      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Resident View</Text>
        <Text style={styles.sectionMeta}>
          Clear, limited visibility into recorded issues and assigned follow-up.
        </Text>
        {residentSummary.violations.length === 0 ? (
          <Text style={styles.sectionMeta}>No violations recorded for this resident.</Text>
        ) : (
          residentSummary.violations.map((violation) => (
            <View key={violation.id} style={styles.linkedRow}>
              <Text style={styles.queueTitle}>{labelForViolationRuleType(violation.ruleType)}</Text>
              <Text style={styles.sectionMeta}>
                {labelForViolationStatus(violation.status)} •{" "}
                {labelForViolationSeverity(violation.severity)}
              </Text>
              <Text style={styles.sectionMeta}>{violation.reasonSummary}</Text>
            </View>
          ))
        )}
        <Text style={styles.subsectionTitle}>Assigned corrective actions</Text>
        {residentSummary.activeCorrectiveActions.length === 0 ? (
          <Text style={styles.sectionMeta}>No open corrective actions.</Text>
        ) : (
          residentSummary.activeCorrectiveActions.map((action) => (
            <View key={action.id} style={styles.linkedRow}>
              <Text style={styles.queueTitle}>
                {CORRECTIVE_ACTION_TYPE_OPTIONS.find((option) => option.value === action.actionType)
                  ?.label ?? action.actionType}
              </Text>
              <Text style={styles.sectionMeta}>
                {action.status} • Due {formatIso(action.dueAt)}
              </Text>
              <Text style={styles.sectionMeta}>{action.notes || "No instructions."}</Text>
            </View>
          ))
        )}
      </GlassCard>

      {statusMessage ? <Text style={styles.inlineStatus}>{statusMessage}</Text> : null}
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
  queueRow: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.22)",
    padding: spacing.md,
    gap: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  queueRowSelected: {
    borderColor: colors.neonCyan,
  },
  queueCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  queueTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: "700",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.22)",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: "rgba(15, 23, 42, 0.18)",
  },
  chipSelected: {
    borderColor: colors.neonCyan,
    backgroundColor: "rgba(34, 211, 238, 0.12)",
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  chipTextSelected: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  filterLabel: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: "700",
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
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  detailItem: {
    width: "47%",
    gap: spacing.xs,
  },
  detailLabel: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  detailValue: {
    color: colors.textPrimary,
    fontSize: typography.body,
  },
  bodyText: {
    color: colors.textPrimary,
    fontSize: typography.body,
    lineHeight: 20,
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
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  buttonSpacer: {
    width: spacing.sm,
  },
  linkedRow: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.22)",
    padding: spacing.md,
    gap: spacing.xs,
  },
  auditRow: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.22)",
    padding: spacing.md,
    gap: spacing.xs,
  },
  inlineStatus: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
});
