import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Rect } from "react-native-svg";
import { colors, radius, spacing, typography } from "../theme/tokens";
import { GlassCard } from "../ui/GlassCard";
import type { RecoveryInsight } from "../recoveryInsights";

type DashboardMeeting = {
  id: string;
  name: string;
  address: string;
  startsAtLocal: string;
  distanceMeters: number | null;
  format: "IN_PERSON" | "ONLINE" | "HYBRID";
};

type DashboardProps = {
  daysSober: number;
  sobrietyDateLabel: string;
  insight: RecoveryInsight;
  locationEnabled: boolean;
  nextMeetings: DashboardMeeting[];
  homeGroupMeeting: DashboardMeeting | null;
  meetingsAttendedInNinetyDays: number;
  ninetyDayGoalTarget: number;
  ninetyDayProgressPct: number;
  meetingBarsLast7: number[];
  sponsorAdherence: { days: number; completed: number; percent: number };
  sponsorBarsLast14: boolean[];
  onMeetingPress: (meetingId: string) => void;
  onSearchArea: () => void;
  onCallSponsor: () => void;
  onOpenSettings: () => void;
  onRefresh: () => void;
  onLogMeeting: () => void;
  onLearnMore: () => void;
};

function toTwelveHour(hhmm: string): string {
  const parts = hhmm.split(":");
  if (parts.length < 2) {
    return hhmm;
  }
  const hour24 = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isFinite(hour24) || !Number.isFinite(minute)) {
    return hhmm;
  }
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function distanceLabel(distanceMeters: number | null): string {
  if (distanceMeters === null) {
    return "Distance unavailable";
  }
  return `${(distanceMeters / 1609.344).toFixed(1)} mi`;
}

export function Dashboard({
  daysSober,
  sobrietyDateLabel,
  insight,
  locationEnabled,
  nextMeetings,
  homeGroupMeeting,
  meetingsAttendedInNinetyDays,
  ninetyDayGoalTarget,
  ninetyDayProgressPct,
  meetingBarsLast7,
  sponsorAdherence,
  sponsorBarsLast14,
  onMeetingPress,
  onSearchArea,
  onCallSponsor,
  onOpenSettings,
  onRefresh,
  onLogMeeting,
  onLearnMore,
}: DashboardProps) {
  const graphMax = Math.max(1, ...meetingBarsLast7);
  const barWidth = 22;
  const barGap = 10;
  const barsWidth = meetingBarsLast7.length * barWidth + (meetingBarsLast7.length - 1) * barGap;

  const sponsorDotGap = 16;
  const dotsWidth =
    sponsorBarsLast14.length > 0
      ? sponsorBarsLast14.length * 8 + (sponsorBarsLast14.length - 1) * sponsorDotGap
      : 0;

  return (
    <LinearGradient colors={[colors.bgTop, colors.bgMid, colors.bgBottom]} style={styles.gradient}>
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <GlassCard>
          <Text style={styles.heroLabel}>Days Sober</Text>
          <View style={styles.heroRow}>
            <Text style={styles.heroValue}>{daysSober}</Text>
            <View style={styles.streakPill}>
              <Text style={styles.streakPillText}>Today</Text>
            </View>
          </View>
          <Text style={styles.metaText}>Sobriety date: {sobrietyDateLabel || "Not set"}</Text>
          <Text style={styles.insightTitle}>Body & brain today</Text>
          <Text style={styles.insightBody}>{insight.body}</Text>
          <Pressable onPress={onLearnMore}>
            <Text style={styles.linkText}>Learn more</Text>
          </Pressable>
        </GlassCard>

        <GlassCard>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Next meetings (20 mi)</Text>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: locationEnabled
                    ? "rgba(52,211,153,0.16)"
                    : "rgba(251,113,133,0.2)",
                },
              ]}
            >
              <Text style={styles.statusPillText}>
                Location: {locationEnabled ? "Enabled" : "Off"}
              </Text>
            </View>
          </View>
          {nextMeetings.slice(0, 3).map((meeting) => (
            <Pressable
              key={meeting.id}
              style={styles.meetingRow}
              onPress={() => onMeetingPress(meeting.id)}
            >
              <View style={styles.meetingTimeCol}>
                <Text style={styles.meetingTime}>{toTwelveHour(meeting.startsAtLocal)}</Text>
              </View>
              <View style={styles.meetingBodyCol}>
                <Text numberOfLines={1} style={styles.meetingName}>
                  {meeting.name}
                </Text>
                <Text numberOfLines={1} style={styles.meetingMeta}>
                  {distanceLabel(meeting.distanceMeters)} •{" "}
                  {meeting.format === "IN_PERSON" ? "In-person" : "Online"}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
          {nextMeetings.length === 0 ? (
            <>
              <Text style={styles.emptyText}>No upcoming meetings within 20 miles.</Text>
              <Pressable style={styles.secondaryAction} onPress={onSearchArea}>
                <Text style={styles.secondaryActionText}>Search this area</Text>
              </Pressable>
            </>
          ) : null}
        </GlassCard>

        <GlassCard>
          <Text style={styles.sectionTitle}>Home Group</Text>
          {homeGroupMeeting ? (
            <>
              <Text style={styles.homeGroupName}>{homeGroupMeeting.name}</Text>
              <Text style={styles.meetingMeta}>
                {toTwelveHour(homeGroupMeeting.startsAtLocal)} •{" "}
                {distanceLabel(homeGroupMeeting.distanceMeters)}
              </Text>
              <Text numberOfLines={2} style={styles.meetingMeta}>
                {homeGroupMeeting.address}
              </Text>
            </>
          ) : (
            <Text style={styles.emptyText}>No home group selected yet.</Text>
          )}
        </GlassCard>

        <GlassCard>
          <Text style={styles.sectionTitle}>90 Day Meeting Goal</Text>
          <Text style={styles.metricText}>
            {meetingsAttendedInNinetyDays} / {ninetyDayGoalTarget}
          </Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.max(0, Math.min(100, ninetyDayProgressPct))}%` },
              ]}
            />
          </View>
          <Text style={styles.meetingMeta}>
            {daysSober < 90
              ? "Aim for 1 meeting today. Small wins compound."
              : "Keep momentum. Consistency protects recovery."}
          </Text>
          <Svg width={barsWidth} height={52}>
            {meetingBarsLast7.map((value, index) => {
              const ratio = Math.max(0.1, value / graphMax);
              const height = Math.round(36 * ratio);
              const x = index * (barWidth + barGap);
              const y = 46 - height;
              return (
                <Rect
                  key={`meeting-bar-${index}`}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={height}
                  rx={6}
                  fill={colors.neonLavender}
                  opacity={0.92}
                />
              );
            })}
          </Svg>
        </GlassCard>

        <GlassCard>
          <Text style={styles.sectionTitle}>Sponsor Call Consistency</Text>
          <Text style={styles.metricText}>{sponsorAdherence.percent.toFixed(1)}%</Text>
          <Text style={styles.meetingMeta}>
            {sponsorAdherence.completed} calls / {sponsorAdherence.days} days
          </Text>
          <Svg width={dotsWidth} height={20}>
            {sponsorBarsLast14.map((value, index) => (
              <Circle
                key={`sponsor-dot-${index}`}
                cx={index * (8 + sponsorDotGap) + 4}
                cy={10}
                r={4}
                fill={value ? colors.success : "rgba(255,255,255,0.28)"}
              />
            ))}
          </Svg>
          <Pressable style={styles.primaryAction} onPress={onCallSponsor}>
            <Text style={styles.primaryActionText}>Call sponsor</Text>
          </Pressable>
        </GlassCard>

        <GlassCard>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsRow}>
            <Pressable style={styles.secondaryAction} onPress={onOpenSettings}>
              <Text style={styles.secondaryActionText}>Settings</Text>
            </Pressable>
            <Pressable style={styles.secondaryAction} onPress={onRefresh}>
              <Text style={styles.secondaryActionText}>Refresh</Text>
            </Pressable>
            <Pressable style={styles.secondaryAction} onPress={onLogMeeting}>
              <Text style={styles.secondaryActionText}>Log meeting</Text>
            </Pressable>
          </View>
        </GlassCard>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    borderRadius: radius.lg,
    overflow: "hidden",
    padding: spacing.sm,
    gap: spacing.sm,
  },
  glowTop: {
    position: "absolute",
    top: -120,
    right: -100,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: "rgba(196,181,253,0.26)",
  },
  glowBottom: {
    position: "absolute",
    bottom: -130,
    left: -120,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: "rgba(240,171,252,0.22)",
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  heroLabel: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: typography.weightSemi,
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroValue: {
    color: colors.textPrimary,
    fontSize: typography.h1,
    fontWeight: typography.weightBold,
    lineHeight: 44,
  },
  streakPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
  },
  streakPillText: {
    color: colors.textPrimary,
    fontSize: typography.tiny,
    fontWeight: typography.weightSemi,
  },
  insightTitle: {
    color: colors.textPrimary,
    fontWeight: typography.weightSemi,
    fontSize: typography.body,
  },
  insightBody: {
    color: colors.textSecondary,
    fontSize: typography.body,
    lineHeight: 20,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: typography.small,
  },
  linkText: {
    color: colors.neonCyan,
    fontSize: typography.small,
    fontWeight: typography.weightSemi,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.h3,
    fontWeight: typography.weightBold,
  },
  statusPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusPillText: {
    color: colors.textPrimary,
    fontSize: typography.tiny,
    fontWeight: typography.weightSemi,
  },
  meetingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    paddingTop: spacing.sm,
  },
  meetingTimeCol: {
    minWidth: 80,
  },
  meetingBodyCol: {
    flex: 1,
    gap: 2,
  },
  meetingTime: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: typography.weightBold,
  },
  meetingName: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: typography.weightSemi,
  },
  meetingMeta: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  chevron: {
    color: colors.neonLavender,
    fontSize: 20,
    fontWeight: typography.weightBold,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: typography.body,
  },
  metricText: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: typography.weightBold,
  },
  progressTrack: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.16)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.purple400,
  },
  homeGroupName: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: typography.weightBold,
  },
  primaryAction: {
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    backgroundColor: colors.purple600,
  },
  primaryActionText: {
    color: colors.textPrimary,
    fontWeight: typography.weightSemi,
    fontSize: typography.body,
  },
  quickActionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  secondaryAction: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  secondaryActionText: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: typography.weightSemi,
  },
});
