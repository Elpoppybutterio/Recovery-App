import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { loadAttendanceRecords, loadMeetingAttendanceLogs } from "../lib/attendance/storage";
import { currentMonthKey } from "../lib/soberHouse/monthlyWindow";
import {
  generateHouseMonthlyReport,
  generateResidentMonthlyReport,
  listMonthlyReportsForViewer,
  recordMonthlyReportViewed,
} from "../lib/soberHouse/reports";
import { getMonthlyReportById } from "../lib/soberHouse/selectors";
import type {
  AuditActor,
  HouseMonthlyReportSnapshot,
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

function renderResidentReport(snapshot: ResidentMonthlyReportSnapshot) {
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
        {snapshot.violationsSummary.openCount}
        {" • "}Resolved {snapshot.violationsSummary.resolvedCount} • Dismissed{" "}
        {snapshot.violationsSummary.dismissedCount}
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

function renderHouseReport(snapshot: HouseMonthlyReportSnapshot) {
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
  const [selectedHouseId, setSelectedHouseId] = useState<string | null>(
    store.residentHousingProfile?.houseId ?? store.houses[0]?.id ?? null,
  );
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [lastViewedReportId, setLastViewedReportId] = useState<string | null>(null);

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
  const visibleReports = viewerMode === "resident" ? residentReports : managerReports;

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

  const generateResidentReport = useCallback(async () => {
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
  }, [actor, attendanceRecords, meetingAttendanceLogs, monthKey, onPersist, store]);

  const generateHouseReport = useCallback(async () => {
    if (!selectedHouseId) {
      setLocalStatus("Select a house before generating a house report.");
      return;
    }
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
  }, [
    actor,
    attendanceRecords,
    meetingAttendanceLogs,
    monthKey,
    onPersist,
    selectedHouseId,
    store,
  ]);

  return (
    <GlassCard style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.sectionTitle}>Monthly Reports</Text>
          <Text style={styles.sectionMeta}>
            Generate stable monthly snapshots for residents and houses, then review them in-app.
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

      <View style={styles.selectorRow}>
        <Chip
          label="Manager history"
          selected={viewerMode === "manager"}
          onPress={() => setViewerMode("manager")}
        />
        <Chip
          label="Resident history"
          selected={viewerMode === "resident"}
          onPress={() => setViewerMode("resident")}
        />
      </View>

      <View style={styles.inboxLayout}>
        <View style={styles.threadList}>
          <Text style={styles.subsectionTitle}>Report history</Text>
          {visibleReports.length === 0 ? (
            <Text style={styles.sectionMeta}>No reports generated for this view yet.</Text>
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
                  {report.summaryPayload.reportMonth} • {report.status}
                </Text>
                <Text style={styles.threadMeta}>Generated {formatIso(report.generatedAt)}</Text>
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
            <Text style={styles.sectionMeta}>
              Select a generated report to review the snapshot.
            </Text>
          ) : (
            <>
              <View style={styles.banner}>
                <Text style={styles.bannerTitle}>
                  {selectedReport.type === "RESIDENT_MONTHLY"
                    ? "Resident monthly report"
                    : "House monthly report"}
                </Text>
                <Text style={styles.bannerMeta}>
                  Generated {formatIso(selectedReport.generatedAt)} •{" "}
                  {selectedReport.summaryPayload.reportMonth}
                </Text>
                <Text style={styles.bannerMeta}>
                  Snapshot status {selectedReport.status} • Export ref{" "}
                  {selectedReport.exportRef ?? "Not exported"}
                </Text>
              </View>
              <ScrollView
                style={styles.messageList}
                contentContainerStyle={styles.messageListContent}
                showsVerticalScrollIndicator={false}
              >
                {selectedReport.summaryPayload.reportKind === "resident_monthly"
                  ? renderResidentReport(selectedReport.summaryPayload)
                  : renderHouseReport(selectedReport.summaryPayload)}
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
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  buttonSpacer: {
    width: spacing.sm,
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
  messageList: {
    maxHeight: 520,
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
  localStatus: {
    color: "#fde68a",
    fontSize: typography.small,
    fontWeight: "700",
  },
});
