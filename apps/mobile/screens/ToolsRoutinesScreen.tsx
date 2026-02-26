import { Pressable, StyleSheet, Text, View } from "react-native";
import { LiquidGlassCard } from "../components/LiquidGlassCard";
import type {
  MorningRoutineStats,
  NightlyInventoryStats,
  RoutineInsights,
} from "../lib/routines/types";
import { routineTheme } from "../theme/tokens";

export function ToolsRoutinesScreen({
  morningStats,
  nightlyStats,
  insights,
  onOpenMorning,
  onOpenNightly,
}: {
  morningStats: MorningRoutineStats;
  nightlyStats: NightlyInventoryStats;
  insights: RoutineInsights;
  onOpenMorning: () => void;
  onOpenNightly: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <LiquidGlassCard style={styles.card}>
        <Text style={styles.title}>Recovery Routines</Text>
        <Text style={styles.meta}>AM routine + nightly routine, tracked daily.</Text>
      </LiquidGlassCard>

      <LiquidGlassCard style={styles.card}>
        <Text style={styles.cardTitle}>Morning Routine</Text>
        <Text style={styles.meta}>
          Today: {morningStats.todayCompletedCount}/{morningStats.todayTotalCount}
        </Text>
        <Text style={styles.meta}>Streak: {morningStats.streakDays} day(s)</Text>
        <Text style={styles.meta}>Last 30 days: {morningStats.last30CompletionPct}% complete</Text>
        <Pressable style={styles.actionBtn} onPress={onOpenMorning}>
          <Text style={styles.actionText}>Open Morning Routine</Text>
        </Pressable>
      </LiquidGlassCard>

      <LiquidGlassCard style={styles.card}>
        <Text style={styles.cardTitle}>Nightly Routine</Text>
        <Text style={styles.meta}>
          Today: {nightlyStats.todayCompleted ? "Completed" : "Not completed"}
        </Text>
        <Text style={styles.meta}>Issues logged today: {nightlyStats.todayIssueCount}</Text>
        <Pressable style={styles.actionBtn} onPress={onOpenNightly}>
          <Text style={styles.actionText}>Open Nightly Routine</Text>
        </Pressable>
      </LiquidGlassCard>

      <LiquidGlassCard style={styles.card}>
        <Text style={styles.cardTitle}>Insights (Last 30 Days)</Text>
        <Text style={styles.meta}>
          Avg issues on AM-complete days: {insights.averageIssuesOnMorningCompleteDays}
        </Text>
        <Text style={styles.meta}>
          Avg issues on AM-incomplete days: {insights.averageIssuesOnMorningIncompleteDays}
        </Text>
        <Text style={styles.meta}>Trend: {insights.trend.toUpperCase()}</Text>
      </LiquidGlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  card: {
    padding: 14,
    gap: 8,
  },
  title: {
    color: routineTheme.colors.textPrimary,
    fontSize: 20,
    fontWeight: "800",
  },
  cardTitle: {
    color: routineTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  meta: {
    color: routineTheme.colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  actionBtn: {
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: routineTheme.radii.pill,
    borderWidth: 1,
    borderColor: routineTheme.colors.cardStroke,
    backgroundColor: "rgba(124,58,237,0.34)",
    alignSelf: "flex-start",
  },
  actionText: {
    color: routineTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
});
