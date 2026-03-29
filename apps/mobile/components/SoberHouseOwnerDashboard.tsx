import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMemo, useState } from "react";
import type { CommunicationNotificationSummary } from "../lib/communication/summary";
import {
  buildSoberHouseOwnerHouseDetail,
  buildSoberHouseOwnerDashboardSummary,
  type SoberHouseOwnerDashboardFilterOption,
  type SoberHouseOwnerDashboardKpiTile,
  type SoberHouseOwnerKpiTileId,
} from "../lib/soberHouse/orgDashboard";
import type { SoberHouseSettingsStore } from "../lib/soberHouse/types";
import { Design } from "../lib/ui/design";
import { AppButton } from "../lib/ui/AppButton";
import { GlassCard } from "../lib/ui/GlassCard";

type Props = {
  store: SoberHouseSettingsStore;
  notificationSummary?: CommunicationNotificationSummary | null;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onCreateHouse: () => void;
  onEditHouse: (houseId: string) => void;
  onToggleHouseStatus: (houseId: string, nextStatus: "ACTIVE" | "INACTIVE") => void;
  onCreateManager: () => void;
  onEditManager: (staffAssignmentId: string) => void;
  onToggleManagerStatus: (staffAssignmentId: string, nextStatus: "ACTIVE" | "INACTIVE") => void;
  onOpenChat: () => void;
  onCompileReportsNow: (houseIds: string[]) => void;
  compileStatus: string | null;
};

type OwnerDashboardView =
  | { kind: "HOME" }
  | { kind: "HOUSES" }
  | { kind: "HOUSE_DETAIL"; houseId: string }
  | { kind: "MANAGERS" }
  | { kind: "VIOLATIONS" }
  | { kind: "REPORTS" }
  | { kind: "HOUSE_VIOLATIONS"; houseId: string };

function toneStyle(tone: SoberHouseOwnerDashboardKpiTile["tone"]) {
  if (tone === "green") {
    return { borderColor: "rgba(136,255,179,0.5)", backgroundColor: "rgba(34,197,94,0.15)" };
  }
  if (tone === "yellow") {
    return { borderColor: "rgba(253,224,71,0.5)", backgroundColor: "rgba(245,158,11,0.16)" };
  }
  if (tone === "red") {
    return { borderColor: "rgba(252,165,165,0.5)", backgroundColor: "rgba(239,68,68,0.16)" };
  }
  return { borderColor: "rgba(255,255,255,0.2)", backgroundColor: "rgba(255,255,255,0.06)" };
}

function MultiSelectChips({
  options,
  selectedIds,
  onToggle,
}: {
  options: SoberHouseOwnerDashboardFilterOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  if (options.length === 0) {
    return <Text style={styles.metaText}>None configured yet.</Text>;
  }
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const selected = selectedIds.includes(option.id);
        return (
          <Pressable
            key={option.id}
            style={[styles.chip, selected ? styles.chipSelected : null]}
            onPress={() => onToggle(option.id)}
          >
            <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

export function SoberHouseOwnerDashboard({
  store,
  notificationSummary = null,
  onOpenNotifications,
  onOpenSettings,
  onCreateHouse,
  onEditHouse,
  onToggleHouseStatus,
  onCreateManager,
  onEditManager,
  onToggleManagerStatus,
  onOpenChat,
  onCompileReportsNow,
  compileStatus,
}: Props) {
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedHouseIds, setSelectedHouseIds] = useState<string[]>([]);
  const [houseGroupFilterId, setHouseGroupFilterId] = useState<string | null>(null);
  const [houseSearchQuery, setHouseSearchQuery] = useState("");
  const [view, setView] = useState<OwnerDashboardView>({ kind: "HOME" });
  const summary = useMemo(
    () => buildSoberHouseOwnerDashboardSummary({ store, selectedGroupIds, selectedHouseIds }),
    [selectedGroupIds, selectedHouseIds, store],
  );
  const scopedHouseRows = summary.houseRows;
  const housesWithViolations = useMemo(
    () =>
      scopedHouseRows.filter(
        (row) =>
          row.activeViolations > 0 ||
          row.underReviewViolations > 0 ||
          row.correctiveActionsOpen > 0,
      ),
    [scopedHouseRows],
  );
  const focusedHouseId =
    view.kind === "HOUSE_DETAIL" || view.kind === "HOUSE_VIOLATIONS" ? view.houseId : null;
  const focusedHouseDetail = useMemo(
    () => (focusedHouseId ? buildSoberHouseOwnerHouseDetail(store, focusedHouseId) : null),
    [focusedHouseId, store],
  );
  const scopedManagers = useMemo(
    () =>
      store.staffAssignments.sort((left, right) =>
        `${left.firstName} ${left.lastName}`.localeCompare(`${right.firstName} ${right.lastName}`),
      ),
    [store.staffAssignments],
  );
  const filteredHouseRows = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(houseSearchQuery);
    return scopedHouseRows.filter((row) => {
      const matchesGroup = houseGroupFilterId ? row.houseGroupId === houseGroupFilterId : true;
      const matchesSearch =
        normalizedQuery.length === 0
          ? true
          : [row.houseName, row.groupName].some((value) =>
              value.toLowerCase().includes(normalizedQuery),
            );
      return matchesGroup && matchesSearch;
    });
  }, [houseGroupFilterId, houseSearchQuery, scopedHouseRows]);
  const houseGroupOptions = useMemo(
    () =>
      summary.availableGroups.filter((group) =>
        scopedHouseRows.some((row) => row.houseGroupId === group.id),
      ),
    [scopedHouseRows, summary.availableGroups],
  );
  const showHouseSearch = scopedHouseRows.length > 10;

  const toggleValue = (id: string, current: string[], setter: (next: string[]) => void) => {
    setter(current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };

  const openTile = (tileId: SoberHouseOwnerKpiTileId) => {
    if (tileId === "chat") {
      onOpenChat();
      return;
    }
    if (tileId === "houses") {
      setView({ kind: "HOUSES" });
      return;
    }
    if (tileId === "violations") {
      setView({ kind: "VIOLATIONS" });
      return;
    }
    if (tileId === "corrective-actions") {
      setView({ kind: "VIOLATIONS" });
      return;
    }
    if (tileId === "reports") {
      setView({ kind: "REPORTS" });
      return;
    }
    if (tileId === "managers") {
      setView({ kind: "MANAGERS" });
      return;
    }
    onOpenSettings();
  };

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>
            {view.kind === "HOME"
              ? "Sober House Org Dashboard"
              : view.kind === "HOUSES"
                ? "Houses"
                : view.kind === "MANAGERS"
                  ? "Managers"
                  : view.kind === "VIOLATIONS"
                    ? "Violations by House"
                    : view.kind === "REPORTS"
                      ? "Current Reports"
                      : view.kind === "HOUSE_VIOLATIONS"
                        ? (focusedHouseDetail?.houseName ?? "House Violations")
                        : (focusedHouseDetail?.houseName ?? "House Overview")}
          </Text>
          <Text style={styles.subtitle}>
            {view.kind === "HOME"
              ? summary.organizationName
              : view.kind === "MANAGERS"
                ? "Add, edit, and activate staff assignments for the current scope."
                : view.kind === "VIOLATIONS"
                  ? "Choose a house to review its current violations."
                  : view.kind === "REPORTS"
                    ? "Review current report coverage across the houses in scope."
                    : view.kind === "HOUSE_VIOLATIONS"
                      ? "Violation detail for the selected house."
                      : "Operational detail for the selected house."}
          </Text>
        </View>
        <View style={styles.headerAction}>
          {view.kind === "HOME" ? (
            <Pressable onPress={onOpenNotifications} style={styles.bellButton}>
              <Text style={styles.bellIcon}>🔔</Text>
              {(notificationSummary?.badgeCount ?? 0) > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {(notificationSummary?.badgeCount ?? 0) > 9
                      ? "9+"
                      : String(notificationSummary?.badgeCount ?? 0)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ) : (
            <AppButton title="Back" variant="secondary" onPress={() => setView({ kind: "HOME" })} />
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {view.kind === "HOUSES" ? (
          <GlassCard style={styles.card} strong>
            <Text style={styles.sectionTitle}>Houses</Text>
            <Text style={styles.metaText}>
              Browse and manage houses. Filter by group when needed, and search once the list gets
              longer.
            </Text>
            <View style={styles.actionRow}>
              <AppButton title="Add house" onPress={onCreateHouse} />
              {houseGroupFilterId || houseSearchQuery.trim().length > 0 ? (
                <AppButton
                  title="Clear filters"
                  variant="secondary"
                  onPress={() => {
                    setHouseGroupFilterId(null);
                    setHouseSearchQuery("");
                  }}
                />
              ) : null}
            </View>
            {houseGroupOptions.length > 0 ? (
              <>
                <Text style={styles.fieldLabel}>Group filter</Text>
                <View style={styles.chipRow}>
                  <Pressable
                    style={[styles.chip, houseGroupFilterId === null ? styles.chipSelected : null]}
                    onPress={() => setHouseGroupFilterId(null)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        houseGroupFilterId === null ? styles.chipTextSelected : null,
                      ]}
                    >
                      All groups
                    </Text>
                  </Pressable>
                  {houseGroupOptions.map((group) => {
                    const selected = houseGroupFilterId === group.id;
                    return (
                      <Pressable
                        key={group.id}
                        style={[styles.chip, selected ? styles.chipSelected : null]}
                        onPress={() => setHouseGroupFilterId(group.id)}
                      >
                        <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>
                          {group.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
            {showHouseSearch ? (
              <>
                <Text style={styles.fieldLabel}>Search houses</Text>
                <TextInput
                  style={styles.searchInput}
                  value={houseSearchQuery}
                  onChangeText={setHouseSearchQuery}
                  placeholder="Search by house or group"
                  placeholderTextColor={Design.color.textSecondary}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </>
            ) : null}
            {filteredHouseRows.length === 0 ? (
              <Text style={styles.metaText}>No houses match the current filters.</Text>
            ) : (
              filteredHouseRows.map((row) => (
                <View key={row.houseId} style={styles.rowCard}>
                  <Text style={styles.rowTitle}>{row.houseName}</Text>
                  <Text style={styles.metaText}>
                    {row.groupName} • {row.status === "ACTIVE" ? "Active" : "Inactive"}
                  </Text>
                  <Text style={styles.metaText}>
                    Violations {row.activeViolations} • Under review {row.underReviewViolations} •
                    Corrective actions {row.correctiveActionsOpen} • Reports {row.currentReports}
                  </Text>
                  <View style={styles.actionRow}>
                    <AppButton
                      title="Open house"
                      variant="secondary"
                      onPress={() => setView({ kind: "HOUSE_DETAIL", houseId: row.houseId })}
                    />
                    <AppButton
                      title="Edit house"
                      variant="secondary"
                      onPress={() => onEditHouse(row.houseId)}
                    />
                    <AppButton
                      title={row.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                      variant={row.status === "ACTIVE" ? "danger" : "secondary"}
                      onPress={() =>
                        onToggleHouseStatus(
                          row.houseId,
                          row.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                        )
                      }
                    />
                  </View>
                </View>
              ))
            )}
          </GlassCard>
        ) : null}

        {view.kind === "MANAGERS" ? (
          <GlassCard style={styles.card} strong>
            <Text style={styles.sectionTitle}>Managers in Scope</Text>
            <Text style={styles.metaText}>
              Add, edit, and manage staff assignments connected to the current organization scope.
            </Text>
            <View style={styles.actionRow}>
              <AppButton title="Add manager" onPress={onCreateManager} />
              <AppButton title="Manage organization" variant="secondary" onPress={onOpenSettings} />
            </View>
            {scopedManagers.length === 0 ? (
              <Text style={styles.metaText}>
                No managers or staff assignments are configured yet.
              </Text>
            ) : (
              scopedManagers.map((assignment) => (
                <View key={assignment.id} style={styles.rowCard}>
                  <Text style={styles.rowTitle}>
                    {assignment.firstName} {assignment.lastName}
                  </Text>
                  <Text style={styles.metaText}>{assignment.role}</Text>
                  <Text style={styles.metaText}>
                    Houses:{" "}
                    {assignment.assignedHouseIds.length > 0
                      ? assignment.assignedHouseIds.length
                      : 0}
                  </Text>
                  <Text style={styles.metaText}>
                    {assignment.status === "ACTIVE" ? "Active" : "Inactive"}
                  </Text>
                  <Text style={styles.metaText}>
                    {assignment.receiveRealTimeViolationAlerts ? "Real-time " : ""}
                    {assignment.receiveNearMissAlerts ? "Near-miss " : ""}
                    {assignment.receiveMonthlyReports ? "Monthly reports" : "No alert routing"}
                  </Text>
                  <View style={styles.actionRow}>
                    <AppButton
                      title="Edit"
                      variant="secondary"
                      onPress={() => onEditManager(assignment.id)}
                    />
                    <AppButton
                      title={assignment.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                      variant={assignment.status === "ACTIVE" ? "danger" : "secondary"}
                      onPress={() =>
                        onToggleManagerStatus(
                          assignment.id,
                          assignment.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                        )
                      }
                    />
                  </View>
                </View>
              ))
            )}
          </GlassCard>
        ) : null}

        {view.kind === "VIOLATIONS" ? (
          <GlassCard style={styles.card} strong>
            <Text style={styles.sectionTitle}>House Violations</Text>
            <Text style={styles.metaText}>
              Select a house to review open and recent violations.
            </Text>
            {housesWithViolations.length === 0 ? (
              <Text style={styles.metaText}>
                No houses in the current scope have active issues.
              </Text>
            ) : (
              housesWithViolations.map((row) => (
                <Pressable
                  key={row.houseId}
                  style={[styles.rowCard, toneStyle(row.activeViolations > 0 ? "red" : "yellow")]}
                  onPress={() => setView({ kind: "HOUSE_VIOLATIONS", houseId: row.houseId })}
                >
                  <Text style={styles.rowTitle}>{row.houseName}</Text>
                  <Text style={styles.metaText}>{row.groupName}</Text>
                  <Text style={styles.metaText}>
                    {row.activeViolations} active • {row.underReviewViolations} under review •{" "}
                    {row.correctiveActionsOpen} corrective actions
                  </Text>
                </Pressable>
              ))
            )}
          </GlassCard>
        ) : null}

        {view.kind === "REPORTS" ? (
          <GlassCard style={styles.card} strong>
            <Text style={styles.sectionTitle}>Current Reports</Text>
            <Text style={styles.metaText}>
              Review current-version report coverage for the houses in scope.
            </Text>
            <View style={styles.actionRow}>
              <AppButton
                title="Compile reports now"
                onPress={() => onCompileReportsNow(summary.filteredHouseIds)}
                disabled={summary.filteredHouseIds.length === 0}
              />
              <AppButton title="Manage organization" variant="secondary" onPress={onOpenSettings} />
            </View>
            {compileStatus ? <Text style={styles.metaText}>{compileStatus}</Text> : null}
            {scopedHouseRows.length === 0 ? (
              <Text style={styles.metaText}>No houses match the current filter scope.</Text>
            ) : (
              scopedHouseRows.map((row) => (
                <Pressable
                  key={row.houseId}
                  style={styles.rowCard}
                  onPress={() => setView({ kind: "HOUSE_DETAIL", houseId: row.houseId })}
                >
                  <Text style={styles.rowTitle}>{row.houseName}</Text>
                  <Text style={styles.metaText}>
                    {row.groupName} • {row.status === "ACTIVE" ? "Active" : "Inactive"}
                  </Text>
                  <Text style={styles.metaText}>
                    Current reports {row.currentReports} • Violations {row.activeViolations} •
                    Corrective actions {row.correctiveActionsOpen}
                  </Text>
                </Pressable>
              ))
            )}
          </GlassCard>
        ) : null}

        {view.kind === "HOUSE_DETAIL" && focusedHouseDetail ? (
          <>
            <GlassCard style={styles.card} strong>
              <Text style={styles.sectionTitle}>House Overview</Text>
              <Text style={styles.metaText}>{focusedHouseDetail.address}</Text>
              <Text style={styles.metaText}>
                {focusedHouseDetail.groupName} •{" "}
                {focusedHouseDetail.status === "ACTIVE" ? "Active" : "Inactive"}
              </Text>
              <Text style={styles.metaText}>
                {focusedHouseDetail.houseTypesLabel} • Beds {focusedHouseDetail.bedCount} • Radius{" "}
                {focusedHouseDetail.geofenceRadiusFeetDefault} ft
              </Text>
              <Text style={styles.metaText}>
                Geofence:{" "}
                {focusedHouseDetail.geofenceResolved
                  ? "Derived from saved address"
                  : "Pending address resolution"}
              </Text>
              <Text style={styles.metaText}>
                Residents {focusedHouseDetail.activeResidents} • Staff{" "}
                {focusedHouseDetail.assignedStaffCount} • Reports{" "}
                {focusedHouseDetail.currentReports}
              </Text>
              <Text style={styles.metaText}>
                Violations {focusedHouseDetail.activeViolations} • Under review{" "}
                {focusedHouseDetail.underReviewViolations} • Corrective actions{" "}
                {focusedHouseDetail.openCorrectiveActions}
              </Text>
              {focusedHouseDetail.phone ? (
                <Text style={styles.metaText}>Phone: {focusedHouseDetail.phone}</Text>
              ) : null}
              {focusedHouseDetail.notes ? (
                <Text style={styles.metaText}>{focusedHouseDetail.notes}</Text>
              ) : null}
              <View style={styles.actionRow}>
                <AppButton
                  title="View house violations"
                  onPress={() =>
                    setView({ kind: "HOUSE_VIOLATIONS", houseId: focusedHouseDetail.houseId })
                  }
                />
                <AppButton
                  title="Edit house"
                  variant="secondary"
                  onPress={() => onEditHouse(focusedHouseDetail.houseId)}
                />
              </View>
            </GlassCard>

            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Recent Violations</Text>
              {focusedHouseDetail.violations.length === 0 ? (
                <Text style={styles.metaText}>No violations recorded for this house.</Text>
              ) : (
                focusedHouseDetail.violations.slice(0, 5).map((violation) => (
                  <View key={violation.violationId} style={styles.rowCard}>
                    <Text style={styles.rowTitle}>{violation.reasonSummary}</Text>
                    <Text style={styles.metaText}>
                      {violation.severity} • {violation.status}
                    </Text>
                    <Text style={styles.metaText}>
                      Triggered {new Date(violation.triggeredAt).toLocaleString()}
                    </Text>
                  </View>
                ))
              )}
            </GlassCard>
          </>
        ) : null}

        {view.kind === "HOUSE_VIOLATIONS" && focusedHouseDetail ? (
          <GlassCard style={styles.card} strong>
            <Text style={styles.sectionTitle}>House Violations</Text>
            <Text style={styles.metaText}>
              {focusedHouseDetail.houseName} • {focusedHouseDetail.groupName}
            </Text>
            {focusedHouseDetail.violations.length === 0 ? (
              <Text style={styles.metaText}>No violations recorded for this house.</Text>
            ) : (
              focusedHouseDetail.violations.map((violation) => (
                <View
                  key={violation.violationId}
                  style={[
                    styles.rowCard,
                    toneStyle(
                      violation.severity === "CRITICAL" || violation.severity === "VIOLATION"
                        ? "red"
                        : violation.status === "UNDER_REVIEW"
                          ? "yellow"
                          : "gray",
                    ),
                  ]}
                >
                  <Text style={styles.rowTitle}>{violation.reasonSummary}</Text>
                  <Text style={styles.metaText}>
                    {violation.severity} • {violation.status}
                  </Text>
                  <Text style={styles.metaText}>
                    Triggered {new Date(violation.triggeredAt).toLocaleString()}
                  </Text>
                  <Text style={styles.metaText}>
                    Open corrective actions: {violation.correctiveActionsOpen}
                  </Text>
                </View>
              ))
            )}
            <View style={styles.actionRow}>
              <AppButton
                title="House details"
                variant="secondary"
                onPress={() =>
                  setView({ kind: "HOUSE_DETAIL", houseId: focusedHouseDetail.houseId })
                }
              />
              <AppButton
                title="All houses"
                variant="secondary"
                onPress={() => setView({ kind: "HOUSES" })}
              />
            </View>
          </GlassCard>
        ) : null}

        {view.kind === "HOME" ? (
          <>
            <GlassCard style={styles.card} strong>
              <Text style={styles.sectionTitle}>Scope Filters</Text>
              <Text style={styles.metaText}>
                Filter KPI tiles and house concerns by group, house, or both.
              </Text>

              <Text style={styles.fieldLabel}>House groups</Text>
              <MultiSelectChips
                options={summary.availableGroups}
                selectedIds={selectedGroupIds}
                onToggle={(id) => toggleValue(id, selectedGroupIds, setSelectedGroupIds)}
              />

              <Text style={styles.fieldLabel}>Houses</Text>
              <MultiSelectChips
                options={summary.availableHouses}
                selectedIds={selectedHouseIds}
                onToggle={(id) => toggleValue(id, selectedHouseIds, setSelectedHouseIds)}
              />

              <View style={styles.buttonRow}>
                <AppButton title="Manage organization" onPress={onOpenSettings} />
                <View style={styles.buttonSpacer} />
                <AppButton title="Open chat" variant="secondary" onPress={onOpenChat} />
              </View>
              <View style={styles.buttonRow}>
                <AppButton
                  title="Compile reports now"
                  variant="secondary"
                  onPress={() => onCompileReportsNow(summary.filteredHouseIds)}
                  disabled={summary.filteredHouseIds.length === 0}
                />
              </View>
              {compileStatus ? <Text style={styles.metaText}>{compileStatus}</Text> : null}
            </GlassCard>

            <View style={styles.kpiGrid}>
              {summary.kpis.map((tile) => (
                <Pressable key={tile.id} onPress={() => openTile(tile.id)}>
                  <GlassCard style={[styles.kpiCard, toneStyle(tile.tone)]}>
                    <Text style={styles.kpiValue}>{tile.value}</Text>
                    <Text style={styles.kpiLabel}>{tile.label}</Text>
                    <Text style={styles.kpiDetail}>{tile.detail}</Text>
                  </GlassCard>
                </Pressable>
              ))}
            </View>

            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>House KPIs</Text>
              {summary.houseRows.length === 0 ? (
                <Text style={styles.metaText}>No houses match the current filter scope.</Text>
              ) : (
                summary.houseRows.map((row) => (
                  <Pressable
                    key={row.houseId}
                    style={styles.rowCard}
                    onPress={() => setView({ kind: "HOUSE_DETAIL", houseId: row.houseId })}
                  >
                    <Text style={styles.rowTitle}>{row.houseName}</Text>
                    <Text style={styles.metaText}>
                      {row.groupName} • {row.status === "ACTIVE" ? "Active" : "Inactive"}
                    </Text>
                    <Text style={styles.metaText}>
                      Violations {row.activeViolations} • Under review {row.underReviewViolations} •
                      Corrective actions {row.correctiveActionsOpen} • Reports {row.currentReports}
                    </Text>
                  </Pressable>
                ))
              )}
            </GlassCard>

            <GlassCard style={styles.card}>
              <Text style={styles.sectionTitle}>Areas of Concern</Text>
              {summary.concerns.map((concern) => (
                <Pressable
                  key={concern.id}
                  style={[styles.rowCard, toneStyle(concern.tone)]}
                  onPress={() =>
                    concern.id === "clear"
                      ? undefined
                      : setView({ kind: "HOUSE_VIOLATIONS", houseId: concern.id })
                  }
                  disabled={concern.id === "clear"}
                >
                  <Text style={styles.rowTitle}>{concern.title}</Text>
                  <Text style={styles.metaText}>{concern.detail}</Text>
                </Pressable>
              ))}
            </GlassCard>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: 12,
  },
  topBar: {
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerAction: {
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  title: {
    color: Design.color.textPrimary,
    fontSize: 26,
    fontWeight: "800",
  },
  subtitle: {
    color: Design.color.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  bellIcon: {
    fontSize: 20,
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingBottom: 24,
  },
  card: {
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    color: Design.color.textPrimary,
    fontSize: 20,
    fontWeight: "800",
  },
  metaText: {
    color: Design.color.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  fieldLabel: {
    color: Design.color.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  chipSelected: {
    backgroundColor: "rgba(168,85,247,0.28)",
    borderColor: "rgba(216,180,254,0.85)",
  },
  chipText: {
    color: Design.color.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  chipTextSelected: {
    color: Design.color.textPrimary,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: Design.color.textPrimary,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    fontWeight: "600",
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  buttonSpacer: {
    width: 8,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  kpiCard: {
    width: 166,
    minHeight: 112,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
  },
  kpiValue: {
    color: Design.color.textPrimary,
    fontSize: 28,
    fontWeight: "800",
  },
  kpiLabel: {
    color: Design.color.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  kpiDetail: {
    color: Design.color.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  rowCard: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.05)",
    gap: 4,
  },
  rowTitle: {
    color: Design.color.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
});
