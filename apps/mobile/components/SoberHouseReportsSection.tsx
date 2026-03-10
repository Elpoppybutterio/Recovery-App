import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { loadAttendanceRecords, loadMeetingAttendanceLogs } from "../lib/attendance/storage";
import { exportSoberHouseMonthlyReportPdf } from "../lib/pdf/exportSoberHouseMonthlyReportPdf";
import { currentMonthKey } from "../lib/soberHouse/monthlyWindow";
import {
  generateHouseMonthlyReport,
  generateResidentMonthlyReport,
  listMonthlyReportsForViewer,
  recordMonthlyReportViewed,
} from "../lib/soberHouse/reports";
import {
  canActorManageMonthlyReport,
  isMonthlyReportLocked,
  markMonthlyReportExported,
  transitionMonthlyReportStatus,
  updateMonthlyReportFinalNotes,
} from "../lib/soberHouse/reportWorkflow";
import { getMonthlyReportById } from "../lib/soberHouse/selectors";
import type {
  AuditActor,
  HouseMonthlyReportSnapshot,
  MonthlyReport,
  MonthlyReportStatus,
  ResidentMonthlyReportSnapshot,
  SoberHouseSettingsStore,
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
  onPersist: (
    nextStore: SoberHouseSettingsStore,
    successMessage: string,
    options?: PersistOptions,
  ) => Promise<void>;
};

type ViewerMode = "manager" | "resident";
type ReportTypeFilter = "ALL" | MonthlyReport["type"];
type ReportStatusFilter = "ALL" | MonthlyReportStatus;

const INPUT_PLACEHOLDER_COLOR = "rgba(245,243,255,0.45)";

function formatIso(value: string | null): string {
  if (!value) {
    return "Not available";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function percentLabel(value: number | null): string {
  return value === null ? "N/A" : `${Math.round(value * 100)}%`;
}

function labelForStatus(status: MonthlyReportStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");
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

function KpiCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiDetail}>{detail}</Text>
    </View>
  );
}

function RenderResidentReport({ snapshot }: { snapshot: ResidentMonthlyReportSnapshot }) {
  return (
    <View style={styles.detailStack}>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>{snapshot.resident.residentName}</Text>
        <Text style={styles.bannerMeta}>
          {snapshot.resident.houseName} • {snapshot.reportMonth}
        </Text>
        <Text style={styles.bannerMeta}>
          Move-in {snapshot.resident.moveInDate || "Not set"} • Phase{" "}
          {snapshot.resident.programPhaseOnEntry || "Not set"}
        </Text>
      </View>

      <View style={styles.kpiGrid}>
        <KpiCard
          label="Curfew compliance"
          value={percentLabel(snapshot.kpis.curfewComplianceRate.value)}
          detail={snapshot.complianceSummary.curfew.summary}
        />
        <KpiCard
          label="Chore completion"
          value={percentLabel(snapshot.kpis.choreCompletionRate.value)}
          detail={snapshot.complianceSummary.chores.summary}
        />
        <KpiCard
          label="Meeting compliance"
          value={percentLabel(snapshot.kpis.meetingComplianceRate.value)}
          detail={snapshot.complianceSummary.meetings.summary}
        />
        <KpiCard
          label="Ack completion"
          value={percentLabel(snapshot.kpis.acknowledgmentCompletionRate.value)}
          detail={snapshot.communicationSummary.acknowledgmentCompletionSummary}
        />
      </View>

      <Text style={styles.subsectionTitle}>Violations</Text>
      <Text style={styles.metaLine}>
        Total {snapshot.violationsSummary.totalViolations} • Open{" "}
        {snapshot.violationsSummary.openCount} • Resolved {snapshot.violationsSummary.resolvedCount}{" "}
        • Dismissed {snapshot.violationsSummary.dismissedCount}
      </Text>
      {snapshot.violationsSummary.notableIncidents.length === 0 ? (
        <Text style={styles.sectionMeta}>No notable incidents were recorded this month.</Text>
      ) : (
        snapshot.violationsSummary.notableIncidents.map((incident) => (
          <View key={incident.id} style={styles.listRow}>
            <Text style={styles.listTitle}>{incident.ruleType}</Text>
            <Text style={styles.metaLine}>{incident.reasonSummary}</Text>
            <Text style={styles.metaLine}>
              {incident.status} • {formatIso(incident.triggeredAt)}
            </Text>
          </View>
        ))
      )}

      <Text style={styles.subsectionTitle}>Final manager summary</Text>
      <View style={styles.listRow}>
        <Text style={styles.listTitle}>Monthly summary</Text>
        <Text style={styles.metaLine}>{snapshot.notesSection.monthlySummary || "None"}</Text>
        <Text style={styles.listTitle}>Progress summary</Text>
        <Text style={styles.metaLine}>{snapshot.notesSection.progressSummary || "None"}</Text>
        <Text style={styles.listTitle}>Concerns / priorities</Text>
        <Text style={styles.metaLine}>{snapshot.notesSection.concernsPriorities || "None"}</Text>
        <Text style={styles.listTitle}>Encouragement / strengths</Text>
        <Text style={styles.metaLine}>
          {snapshot.notesSection.encouragementStrengths || "None"}
        </Text>
      </View>

      <Text style={styles.subsectionTitle}>Wins and strengths</Text>
      {snapshot.winsSummary.length === 0 ? (
        <Text style={styles.sectionMeta}>No positive streaks were computable for this period.</Text>
      ) : (
        snapshot.winsSummary.map((win) => (
          <View key={win.id} style={styles.listRow}>
            <Text style={styles.listTitle}>
              {win.label} • {win.value}
            </Text>
            <Text style={styles.metaLine}>{win.detail}</Text>
          </View>
        ))
      )}
    </View>
  );
}

function RenderHouseReport({ snapshot }: { snapshot: HouseMonthlyReportSnapshot }) {
  return (
    <View style={styles.detailStack}>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>{snapshot.house.houseName}</Text>
        <Text style={styles.bannerMeta}>{snapshot.reportMonth}</Text>
        <Text style={styles.bannerMeta}>
          Active residents {snapshot.house.activeResidentCount} • Staff tracked{" "}
          {snapshot.house.staffSummary.length}
        </Text>
      </View>

      <View style={styles.kpiGrid}>
        <KpiCard
          label="Curfew compliance"
          value={percentLabel(snapshot.kpis.curfewComplianceRate.value)}
          detail="House monthly curfew compliance rate."
        />
        <KpiCard
          label="Chore compliance"
          value={percentLabel(snapshot.kpis.choreCompletionRate.value)}
          detail="House monthly chore completion rate."
        />
        <KpiCard
          label="Meeting compliance"
          value={percentLabel(snapshot.kpis.meetingComplianceRate.value)}
          detail="House monthly meeting goal rate."
        />
        <KpiCard
          label="Acknowledgments"
          value={percentLabel(snapshot.kpis.acknowledgmentCompletionRate.value)}
          detail={`${snapshot.kpis.acknowledgmentRequiredMessages} required notices sent.`}
        />
      </View>

      <Text style={styles.subsectionTitle}>Operations summary</Text>
      <Text style={styles.metaLine}>
        Good standing {snapshot.operationsSummary.residentsInGoodStandingCount} • Unresolved issues{" "}
        {snapshot.operationsSummary.residentsWithUnresolvedIssuesCount}
      </Text>
      <Text style={styles.metaLine}>
        Repeated violations {snapshot.operationsSummary.residentsWithRepeatedViolationsCount} • Ack
        required communications{" "}
        {snapshot.operationsSummary.acknowledgmentRequiredCommunicationCount}
      </Text>

      <Text style={styles.subsectionTitle}>Final manager summary</Text>
      <View style={styles.listRow}>
        <Text style={styles.listTitle}>Monthly summary</Text>
        <Text style={styles.metaLine}>{snapshot.notesSection.monthlySummary || "None"}</Text>
        <Text style={styles.listTitle}>Operational concerns</Text>
        <Text style={styles.metaLine}>{snapshot.notesSection.operationalConcerns || "None"}</Text>
        <Text style={styles.listTitle}>Follow-up priorities</Text>
        <Text style={styles.metaLine}>{snapshot.notesSection.followUpPriorities || "None"}</Text>
      </View>

      <Text style={styles.subsectionTitle}>Wins and strengths</Text>
      {snapshot.winsSummary.length === 0 ? (
        <Text style={styles.sectionMeta}>No house-wide wins were computable for this period.</Text>
      ) : (
        snapshot.winsSummary.map((win) => (
          <View key={win.id} style={styles.listRow}>
            <Text style={styles.listTitle}>
              {win.label} • {win.value}
            </Text>
            <Text style={styles.metaLine}>{win.detail}</Text>
          </View>
        ))
      )}
    </View>
  );
}

export function SoberHouseReportsSection({ userId, store, actor, isSaving, onPersist }: Props) {
  const [attendanceRecords, setAttendanceRecords] = useState<
    Awaited<ReturnType<typeof loadAttendanceRecords>>
  >([]);
  const [meetingAttendanceLogs, setMeetingAttendanceLogs] = useState<
    Awaited<ReturnType<typeof loadMeetingAttendanceLogs>>
  >([]);
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [viewerMode, setViewerMode] = useState<ViewerMode>("manager");
  const [reportTypeFilter, setReportTypeFilter] = useState<ReportTypeFilter>("ALL");
  const [reportStatusFilter, setReportStatusFilter] = useState<ReportStatusFilter>("ALL");
  const [selectedHouseId, setSelectedHouseId] = useState<string | null>(
    store.residentHousingProfile?.houseId ?? store.houses[0]?.id ?? null,
  );
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [lastViewedReportId, setLastViewedReportId] = useState<string | null>(null);
  const [residentNotesDraft, setResidentNotesDraft] = useState({
    monthlySummary: "",
    progressSummary: "",
    concernsPriorities: "",
    encouragementStrengths: "",
  });
  const [houseNotesDraft, setHouseNotesDraft] = useState({
    monthlySummary: "",
    operationalConcerns: "",
    followUpPriorities: "",
  });

  const canManageReports = store.residentHousingProfile?.linkedUserId !== actor.id;

  useEffect(() => {
    if (!canManageReports) {
      setViewerMode("resident");
    }
  }, [canManageReports]);

  useEffect(() => {
    void Promise.all([loadAttendanceRecords(userId), loadMeetingAttendanceLogs(userId)]).then(
      ([nextAttendance, nextLogs]) => {
        setAttendanceRecords(nextAttendance);
        setMeetingAttendanceLogs(nextLogs);
      },
    );
  }, [userId]);

  useEffect(() => {
    if (!selectedHouseId || store.houses.some((house) => house.id === selectedHouseId)) {
      return;
    }
    setSelectedHouseId(store.residentHousingProfile?.houseId ?? store.houses[0]?.id ?? null);
  }, [selectedHouseId, store.houses, store.residentHousingProfile?.houseId]);

  const residentReports = useMemo(
    () =>
      store.residentHousingProfile
        ? listMonthlyReportsForViewer(store, {
            kind: "resident",
            residentId: store.residentHousingProfile.residentId,
          })
        : [],
    [store],
  );

  const managerReports = useMemo(
    () => listMonthlyReportsForViewer(store, { kind: "manager", houseId: selectedHouseId }),
    [selectedHouseId, store],
  );

  const visibleReports = useMemo(() => {
    const base = viewerMode === "resident" ? residentReports : managerReports;
    return base
      .filter((report) => report.periodStart.slice(0, 7) === monthKey)
      .filter((report) => (reportTypeFilter === "ALL" ? true : report.type === reportTypeFilter))
      .filter((report) =>
        reportStatusFilter === "ALL" ? true : report.status === reportStatusFilter,
      );
  }, [managerReports, monthKey, reportStatusFilter, reportTypeFilter, residentReports, viewerMode]);

  useEffect(() => {
    setSelectedReportId((current) =>
      current && visibleReports.some((report) => report.id === current)
        ? current
        : (visibleReports[0]?.id ?? null),
    );
  }, [visibleReports]);

  const selectedReport = useMemo(
    () => (selectedReportId ? getMonthlyReportById(store, selectedReportId) : null),
    [selectedReportId, store],
  );
  const canManageSelectedReport = useMemo(
    () => canActorManageMonthlyReport(store, actor, selectedReport),
    [actor, selectedReport, store],
  );
  const reportLocked = selectedReport ? isMonthlyReportLocked(selectedReport) : true;
  const lastExport = selectedReport?.exportHistory[0] ?? null;

  useEffect(() => {
    if (!selectedReport || selectedReport.id === lastViewedReportId) {
      return;
    }
    const timestamp = new Date().toISOString();
    const result = recordMonthlyReportViewed(store, actor, selectedReport.id, timestamp);
    if (result.auditCount > 0) {
      void onPersist(result.store, "Report view logged.", { showStatus: false });
      setLastViewedReportId(selectedReport.id);
    }
  }, [actor, lastViewedReportId, onPersist, selectedReport, store]);

  useEffect(() => {
    if (!selectedReport) {
      return;
    }
    if (selectedReport.summaryPayload.reportKind === "resident_monthly") {
      setResidentNotesDraft({
        monthlySummary: selectedReport.summaryPayload.notesSection.monthlySummary || "",
        progressSummary: selectedReport.summaryPayload.notesSection.progressSummary || "",
        concernsPriorities: selectedReport.summaryPayload.notesSection.concernsPriorities || "",
        encouragementStrengths:
          selectedReport.summaryPayload.notesSection.encouragementStrengths || "",
      });
      return;
    }
    setHouseNotesDraft({
      monthlySummary: selectedReport.summaryPayload.notesSection.monthlySummary || "",
      operationalConcerns: selectedReport.summaryPayload.notesSection.operationalConcerns || "",
      followUpPriorities: selectedReport.summaryPayload.notesSection.followUpPriorities || "",
    });
  }, [selectedReport]);

  const generateResidentReport = useCallback(async () => {
    if (!canManageReports) {
      return;
    }
    try {
      const timestamp = new Date().toISOString();
      const result = generateResidentMonthlyReport({
        store,
        actor,
        monthKey,
        attendanceRecords,
        meetingAttendanceLogs,
        timestamp,
      });
      if (!result.report) {
        setLocalStatus("Resident report could not be generated for the current store state.");
        return;
      }
      await onPersist(result.store, "Resident monthly report generated.");
      setSelectedReportId(result.report.id);
      setViewerMode("manager");
      setLocalStatus(null);
    } catch (error) {
      setLocalStatus(
        error instanceof Error ? error.message : "Unable to generate resident report.",
      );
    }
  }, [
    actor,
    attendanceRecords,
    canManageReports,
    meetingAttendanceLogs,
    monthKey,
    onPersist,
    store,
  ]);

  const generateHouseReport = useCallback(async () => {
    if (!canManageReports) {
      return;
    }
    if (!selectedHouseId) {
      setLocalStatus("Select a house before generating a house report.");
      return;
    }
    try {
      const timestamp = new Date().toISOString();
      const result = generateHouseMonthlyReport({
        store,
        actor,
        houseId: selectedHouseId,
        monthKey,
        attendanceRecords,
        meetingAttendanceLogs,
        timestamp,
      });
      if (!result.report) {
        setLocalStatus("House report could not be generated for the selected house.");
        return;
      }
      await onPersist(result.store, "House monthly report generated.");
      setSelectedReportId(result.report.id);
      setViewerMode("manager");
      setLocalStatus(null);
    } catch (error) {
      setLocalStatus(error instanceof Error ? error.message : "Unable to generate house report.");
    }
  }, [
    actor,
    attendanceRecords,
    canManageReports,
    meetingAttendanceLogs,
    monthKey,
    onPersist,
    selectedHouseId,
    store,
  ]);

  const saveFinalNotes = useCallback(async () => {
    if (!selectedReport || !canManageSelectedReport || reportLocked) {
      return;
    }
    const timestamp = new Date().toISOString();
    const result =
      selectedReport.summaryPayload.reportKind === "resident_monthly"
        ? updateMonthlyReportFinalNotes(
            store,
            actor,
            selectedReport.id,
            {
              monthlySummary: residentNotesDraft.monthlySummary.trim() || null,
              progressSummary: residentNotesDraft.progressSummary.trim() || null,
              concernsPriorities: residentNotesDraft.concernsPriorities.trim() || null,
              encouragementStrengths: residentNotesDraft.encouragementStrengths.trim() || null,
            },
            timestamp,
          )
        : updateMonthlyReportFinalNotes(
            store,
            actor,
            selectedReport.id,
            {
              monthlySummary: houseNotesDraft.monthlySummary.trim() || null,
              operationalConcerns: houseNotesDraft.operationalConcerns.trim() || null,
              followUpPriorities: houseNotesDraft.followUpPriorities.trim() || null,
            },
            timestamp,
          );
    if (result.auditCount > 0) {
      await onPersist(result.store, "Final report notes updated.");
      setLocalStatus(null);
    }
  }, [
    actor,
    canManageSelectedReport,
    houseNotesDraft,
    onPersist,
    reportLocked,
    residentNotesDraft,
    selectedReport,
    store,
  ]);

  const moveReportToStatus = useCallback(
    async (nextStatus: MonthlyReportStatus, successMessage: string) => {
      if (!selectedReport || !canManageSelectedReport) {
        return;
      }
      const timestamp = new Date().toISOString();
      const result = transitionMonthlyReportStatus(
        store,
        actor,
        selectedReport.id,
        nextStatus,
        timestamp,
      );
      if (result.auditCount > 0) {
        await onPersist(result.store, successMessage);
        setLocalStatus(null);
        return;
      }
      setLocalStatus(`Unable to move report to ${labelForStatus(nextStatus)}.`);
    },
    [actor, canManageSelectedReport, onPersist, selectedReport, store],
  );

  const exportReport = useCallback(async () => {
    if (!selectedReport || !canManageSelectedReport) {
      return;
    }
    if (
      selectedReport.status !== "APPROVED" &&
      selectedReport.status !== "EXPORTED" &&
      selectedReport.status !== "SENT"
    ) {
      setLocalStatus("Approve the report before exporting.");
      return;
    }
    try {
      const exportRef = await exportSoberHouseMonthlyReportPdf(selectedReport);
      const timestamp = new Date().toISOString();
      const result = markMonthlyReportExported(
        store,
        actor,
        selectedReport.id,
        exportRef,
        timestamp,
      );
      if (result.auditCount > 0) {
        await onPersist(result.store, "Report exported to PDF.");
        setLocalStatus(null);
      }
    } catch (error) {
      setLocalStatus(error instanceof Error ? error.message : "Unable to export report.");
    }
  }, [actor, canManageSelectedReport, onPersist, selectedReport, store]);

  return (
    <GlassCard style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.sectionTitle}>Monthly Reports</Text>
          <Text style={styles.sectionMeta}>
            Generate, review, approve, and export stable monthly report snapshots.
          </Text>
        </View>
      </View>

      <View style={styles.controlsRow}>
        <View style={styles.controlBlock}>
          <Text style={styles.fieldLabel}>Report month</Text>
          <TextInput
            style={styles.input}
            value={monthKey}
            onChangeText={setMonthKey}
            placeholder="YYYY-MM"
            placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
            autoCapitalize="none"
          />
        </View>
        <View style={styles.controlBlock}>
          <Text style={styles.fieldLabel}>House scope</Text>
          <View style={styles.selectorRow}>
            {store.houses.map((house) => (
              <Chip
                key={house.id}
                label={house.name}
                selected={selectedHouseId === house.id}
                onPress={() => setSelectedHouseId(house.id)}
              />
            ))}
          </View>
        </View>
      </View>

      {canManageReports ? (
        <View style={styles.buttonRow}>
          <AppButton
            title="Generate resident report"
            onPress={() => void generateResidentReport()}
            disabled={isSaving}
          />
          <View style={styles.buttonSpacer} />
          <AppButton
            title="Generate house report"
            variant="secondary"
            onPress={() => void generateHouseReport()}
            disabled={isSaving || !selectedHouseId}
          />
        </View>
      ) : null}

      <View style={styles.selectorRow}>
        {canManageReports ? (
          <Chip
            label="Manager history"
            selected={viewerMode === "manager"}
            onPress={() => setViewerMode("manager")}
          />
        ) : null}
        <Chip
          label="Resident history"
          selected={viewerMode === "resident"}
          onPress={() => setViewerMode("resident")}
        />
      </View>

      <View style={styles.selectorRow}>
        <Chip
          label="All reports"
          selected={reportTypeFilter === "ALL"}
          onPress={() => setReportTypeFilter("ALL")}
        />
        <Chip
          label="Resident"
          selected={reportTypeFilter === "RESIDENT_MONTHLY"}
          onPress={() => setReportTypeFilter("RESIDENT_MONTHLY")}
        />
        <Chip
          label="House"
          selected={reportTypeFilter === "HOUSE_MONTHLY"}
          onPress={() => setReportTypeFilter("HOUSE_MONTHLY")}
        />
      </View>

      <View style={styles.selectorRow}>
        <Chip
          label="All statuses"
          selected={reportStatusFilter === "ALL"}
          onPress={() => setReportStatusFilter("ALL")}
        />
        {(["GENERATED", "IN_REVIEW", "APPROVED", "EXPORTED", "SENT"] as MonthlyReportStatus[]).map(
          (status) => (
            <Chip
              key={status}
              label={labelForStatus(status)}
              selected={reportStatusFilter === status}
              onPress={() => setReportStatusFilter(status)}
            />
          ),
        )}
      </View>

      <View style={styles.inboxLayout}>
        <View style={styles.threadList}>
          <Text style={styles.subsectionTitle}>Report history</Text>
          {visibleReports.length === 0 ? (
            <Text style={styles.sectionMeta}>No reports match the current filters.</Text>
          ) : (
            visibleReports.map((report) => (
              <Pressable
                key={report.id}
                style={[
                  styles.threadRow,
                  selectedReportId === report.id ? styles.threadRowSelected : null,
                ]}
                onPress={() => setSelectedReportId(report.id)}
              >
                <Text style={styles.threadTitle}>
                  {report.type === "RESIDENT_MONTHLY" ? "Resident monthly" : "House monthly"}
                </Text>
                <Text style={styles.threadMeta}>
                  {report.summaryPayload.reportMonth} • {labelForStatus(report.status)}
                </Text>
                <Text style={styles.threadMeta}>
                  Generated {formatIso(report.generatedAt)} • Version {report.versionNumber}
                  {report.isCurrentVersion ? " current" : ""}
                </Text>
                <Text style={styles.threadMeta}>
                  Exported {formatIso(report.exportHistory[0]?.exportedAt ?? null)}
                </Text>
                <Text style={styles.threadPreview}>
                  {report.summaryPayload.reportKind === "resident_monthly"
                    ? report.summaryPayload.resident.residentName
                    : report.summaryPayload.house.houseName}
                </Text>
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.threadDetail}>
          <Text style={styles.subsectionTitle}>Report detail</Text>
          {!selectedReport ? (
            <Text style={styles.sectionMeta}>Select a report to review the locked snapshot.</Text>
          ) : (
            <>
              <View style={styles.banner}>
                <Text style={styles.bannerTitle}>
                  {selectedReport.type === "RESIDENT_MONTHLY"
                    ? "Resident monthly report"
                    : "House monthly report"}
                </Text>
                <Text style={styles.bannerMeta}>
                  Status {labelForStatus(selectedReport.status)} • Version{" "}
                  {selectedReport.versionNumber}
                  {selectedReport.isCurrentVersion ? " current" : " archived"}
                </Text>
                <Text style={styles.bannerMeta}>
                  Generated {formatIso(selectedReport.generatedAt)} • Reviewed{" "}
                  {formatIso(selectedReport.reviewedAt)}
                </Text>
                <Text style={styles.bannerMeta}>
                  Approved {formatIso(selectedReport.approvedAt)} • Last exported{" "}
                  {formatIso(lastExport?.exportedAt ?? null)}
                </Text>
                <Text style={styles.bannerMeta}>
                  Export count {selectedReport.exportHistory.length} • Export ref{" "}
                  {selectedReport.exportRef ?? "Not exported"}
                </Text>
              </View>

              {canManageSelectedReport ? (
                <View style={styles.workflowCard}>
                  <Text style={styles.subsectionTitle}>Review workflow</Text>
                  <Text style={styles.sectionMeta}>
                    {reportLocked
                      ? "This report is locked because it has been approved or exported. Generate a new version to change content."
                      : "Add final notes, move the report into review, then approve before exporting."}
                  </Text>

                  {selectedReport.summaryPayload.reportKind === "resident_monthly" ? (
                    <>
                      <Text style={styles.fieldLabel}>Monthly summary</Text>
                      <TextInput
                        style={[styles.input, styles.multilineInput]}
                        value={residentNotesDraft.monthlySummary}
                        onChangeText={(value) =>
                          setResidentNotesDraft((current) => ({
                            ...current,
                            monthlySummary: value,
                          }))
                        }
                        editable={!reportLocked}
                        placeholder="Overall monthly summary"
                        placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                        multiline
                      />
                      <Text style={styles.fieldLabel}>Progress summary</Text>
                      <TextInput
                        style={[styles.input, styles.multilineInput]}
                        value={residentNotesDraft.progressSummary}
                        onChangeText={(value) =>
                          setResidentNotesDraft((current) => ({
                            ...current,
                            progressSummary: value,
                          }))
                        }
                        editable={!reportLocked}
                        placeholder="Progress made this month"
                        placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                        multiline
                      />
                      <Text style={styles.fieldLabel}>Concerns / priorities for next month</Text>
                      <TextInput
                        style={[styles.input, styles.multilineInput]}
                        value={residentNotesDraft.concernsPriorities}
                        onChangeText={(value) =>
                          setResidentNotesDraft((current) => ({
                            ...current,
                            concernsPriorities: value,
                          }))
                        }
                        editable={!reportLocked}
                        placeholder="Concerns and next-month priorities"
                        placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                        multiline
                      />
                      <Text style={styles.fieldLabel}>Encouragement / strengths</Text>
                      <TextInput
                        style={[styles.input, styles.multilineInput]}
                        value={residentNotesDraft.encouragementStrengths}
                        onChangeText={(value) =>
                          setResidentNotesDraft((current) => ({
                            ...current,
                            encouragementStrengths: value,
                          }))
                        }
                        editable={!reportLocked}
                        placeholder="Encouragement or strengths summary"
                        placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                        multiline
                      />
                    </>
                  ) : (
                    <>
                      <Text style={styles.fieldLabel}>House monthly note</Text>
                      <TextInput
                        style={[styles.input, styles.multilineInput]}
                        value={houseNotesDraft.monthlySummary}
                        onChangeText={(value) =>
                          setHouseNotesDraft((current) => ({ ...current, monthlySummary: value }))
                        }
                        editable={!reportLocked}
                        placeholder="House-level monthly summary"
                        placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                        multiline
                      />
                      <Text style={styles.fieldLabel}>Operational concerns</Text>
                      <TextInput
                        style={[styles.input, styles.multilineInput]}
                        value={houseNotesDraft.operationalConcerns}
                        onChangeText={(value) =>
                          setHouseNotesDraft((current) => ({
                            ...current,
                            operationalConcerns: value,
                          }))
                        }
                        editable={!reportLocked}
                        placeholder="Operational concerns"
                        placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                        multiline
                      />
                      <Text style={styles.fieldLabel}>Follow-up priorities</Text>
                      <TextInput
                        style={[styles.input, styles.multilineInput]}
                        value={houseNotesDraft.followUpPriorities}
                        onChangeText={(value) =>
                          setHouseNotesDraft((current) => ({
                            ...current,
                            followUpPriorities: value,
                          }))
                        }
                        editable={!reportLocked}
                        placeholder="Follow-up priorities"
                        placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                        multiline
                      />
                    </>
                  )}

                  <View style={styles.buttonRow}>
                    <AppButton
                      title="Save final note"
                      onPress={() => void saveFinalNotes()}
                      disabled={isSaving || reportLocked}
                    />
                    <View style={styles.buttonSpacer} />
                    <AppButton
                      title="Move to review"
                      variant="secondary"
                      onPress={() =>
                        void moveReportToStatus("IN_REVIEW", "Report moved into review.")
                      }
                      disabled={isSaving || reportLocked || selectedReport.status !== "GENERATED"}
                    />
                    <View style={styles.buttonSpacer} />
                    <AppButton
                      title="Approve"
                      variant="secondary"
                      onPress={() =>
                        void moveReportToStatus("APPROVED", "Report approved and locked.")
                      }
                      disabled={
                        isSaving ||
                        reportLocked ||
                        !(
                          selectedReport.status === "GENERATED" ||
                          selectedReport.status === "IN_REVIEW"
                        )
                      }
                    />
                  </View>

                  <AppButton
                    title="Export PDF"
                    variant="secondary"
                    onPress={() => void exportReport()}
                    disabled={
                      isSaving ||
                      !(
                        selectedReport.status === "APPROVED" ||
                        selectedReport.status === "EXPORTED" ||
                        selectedReport.status === "SENT"
                      )
                    }
                  />
                </View>
              ) : null}

              <ScrollView
                style={styles.messageList}
                contentContainerStyle={styles.messageListContent}
                showsVerticalScrollIndicator={false}
              >
                {selectedReport.summaryPayload.reportKind === "resident_monthly" ? (
                  <RenderResidentReport snapshot={selectedReport.summaryPayload} />
                ) : (
                  <RenderHouseReport snapshot={selectedReport.summaryPayload} />
                )}

                <View style={styles.listRow}>
                  <Text style={styles.listTitle}>Export history</Text>
                  {selectedReport.exportHistory.length === 0 ? (
                    <Text style={styles.metaLine}>No exports have been recorded yet.</Text>
                  ) : (
                    selectedReport.exportHistory.map((entry) => (
                      <View key={entry.id} style={styles.exportRow}>
                        <Text style={styles.metaLine}>
                          {formatIso(entry.exportedAt)} • {entry.exportedBy.name}
                        </Text>
                        <Text style={styles.metaLine}>{entry.exportRef}</Text>
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>
            </>
          )}
        </View>
      </View>

      {localStatus ? <Text style={styles.localStatus}>{localStatus}</Text> : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.h2,
    fontWeight: "800",
  },
  sectionMeta: {
    color: colors.textSecondary,
    fontSize: typography.body,
    lineHeight: 20,
  },
  controlsRow: {
    gap: spacing.md,
  },
  controlBlock: {
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: "700",
  },
  input: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    backgroundColor: "rgba(15,23,42,0.24)",
    fontSize: typography.body,
  },
  multilineInput: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  buttonSpacer: {
    width: spacing.sm,
    height: spacing.sm,
  },
  selectorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.32)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: "rgba(15,23,42,0.24)",
  },
  chipSelected: {
    borderColor: "rgba(96,165,250,0.8)",
    backgroundColor: "rgba(59,130,246,0.18)",
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: "700",
  },
  chipTextSelected: {
    color: colors.textPrimary,
  },
  inboxLayout: {
    gap: spacing.md,
  },
  threadList: {
    gap: spacing.sm,
  },
  threadDetail: {
    gap: spacing.sm,
  },
  subsectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.h3,
    fontWeight: "700",
  },
  threadRow: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
    backgroundColor: "rgba(15,23,42,0.24)",
    padding: spacing.md,
    gap: spacing.xs,
  },
  threadRowSelected: {
    borderColor: "rgba(96,165,250,0.8)",
    backgroundColor: "rgba(59,130,246,0.14)",
  },
  threadTitle: {
    color: colors.textPrimary,
    fontSize: typography.h3,
    fontWeight: "700",
  },
  threadMeta: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  threadPreview: {
    color: colors.textPrimary,
    fontSize: typography.body,
    lineHeight: 20,
  },
  banner: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.2)",
    padding: spacing.md,
    gap: spacing.xs,
    backgroundColor: "rgba(15,23,42,0.24)",
  },
  bannerTitle: {
    color: colors.textPrimary,
    fontSize: typography.h3,
    fontWeight: "700",
  },
  bannerMeta: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  workflowCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.2)",
    backgroundColor: "rgba(15,23,42,0.24)",
    padding: spacing.md,
    gap: spacing.sm,
  },
  messageList: {
    maxHeight: 560,
  },
  messageListContent: {
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  detailStack: {
    gap: spacing.md,
  },
  kpiGrid: {
    gap: spacing.sm,
  },
  kpiCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
    backgroundColor: "rgba(15,23,42,0.24)",
    padding: spacing.md,
    gap: spacing.xs,
  },
  kpiValue: {
    color: colors.textPrimary,
    fontSize: typography.h2,
    fontWeight: "800",
  },
  kpiLabel: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: "700",
  },
  kpiDetail: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 18,
  },
  listRow: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
    backgroundColor: "rgba(15,23,42,0.24)",
    padding: spacing.md,
    gap: spacing.xs,
  },
  listTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: "700",
  },
  metaLine: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 18,
  },
  exportRow: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  localStatus: {
    color: "#fde68a",
    fontSize: typography.small,
    fontWeight: "700",
  },
});
