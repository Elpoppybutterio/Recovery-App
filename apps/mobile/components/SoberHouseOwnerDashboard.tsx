import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMemo, useState } from "react";
import type { CommunicationNotificationSummary } from "../lib/communication/summary";
import {
  buildSoberHouseOwnerDashboardSummary,
  type SoberHouseOwnerDashboardFilterOption,
  type SoberHouseOwnerDashboardKpiTile,
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
  onOpenChat: () => void;
  onCompileReportsNow: (houseIds: string[]) => void;
  compileStatus: string | null;
};

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

export function SoberHouseOwnerDashboard({
  store,
  notificationSummary = null,
  onOpenNotifications,
  onOpenSettings,
  onOpenChat,
  onCompileReportsNow,
  compileStatus,
}: Props) {
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedHouseIds, setSelectedHouseIds] = useState<string[]>([]);
  const summary = useMemo(
    () => buildSoberHouseOwnerDashboardSummary({ store, selectedGroupIds, selectedHouseIds }),
    [selectedGroupIds, selectedHouseIds, store],
  );

  const toggleValue = (id: string, current: string[], setter: (next: string[]) => void) => {
    setter(current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.title}>Sober House Org Dashboard</Text>
          <Text style={styles.subtitle}>{summary.organizationName}</Text>
        </View>
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
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
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
            <Pressable key={tile.id} onPress={tile.id === "chat" ? onOpenChat : onOpenSettings}>
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
              <View key={row.houseId} style={styles.rowCard}>
                <Text style={styles.rowTitle}>{row.houseName}</Text>
                <Text style={styles.metaText}>
                  {row.groupName} • {row.status === "ACTIVE" ? "Active" : "Inactive"}
                </Text>
                <Text style={styles.metaText}>
                  Violations {row.activeViolations} • Under review {row.underReviewViolations} •
                  Corrective actions {row.correctiveActionsOpen} • Reports {row.currentReports}
                </Text>
              </View>
            ))
          )}
        </GlassCard>

        <GlassCard style={styles.card}>
          <Text style={styles.sectionTitle}>Areas of Concern</Text>
          {summary.concerns.map((concern) => (
            <View key={concern.id} style={[styles.rowCard, toneStyle(concern.tone)]}>
              <Text style={styles.rowTitle}>{concern.title}</Text>
              <Text style={styles.metaText}>{concern.detail}</Text>
            </View>
          ))}
        </GlassCard>
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
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
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
