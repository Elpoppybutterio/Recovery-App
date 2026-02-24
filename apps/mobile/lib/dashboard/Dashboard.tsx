import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { GlassCard } from "../ui/GlassCard";
import { Design } from "../ui/design";
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
  morningRoutine: {
    streakDays: number;
    last30CompletionPct: number;
    todayCompletedCount: number;
    todayTotalCount: number;
  };
  nightlyInventory: {
    todayCompleted: boolean;
    todayIssueCount: number;
  };
  routineInsights: {
    averageIssuesOnMorningCompleteDays: number;
    averageIssuesOnMorningIncompleteDays: number;
    trend: "up" | "down" | "flat";
  };
  onMeetingPress: (meetingId: string) => void;
  onSearchArea: () => void;
  onCallSponsor: () => void;
  onOpenMorningRoutine: () => void;
  onOpenNightlyInventory: () => void;
  onOpenRecoverySettings: () => void;
  onOpenMeetings: () => void;
  onOpenAttendance: () => void;
  onOpenTools: () => void;
  onOpenSoberHousingSettings: () => void;
  onOpenProbationParoleSettings: () => void;
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
    return "Online";
  }
  const miles = distanceMeters / 1609.344;
  if (miles > 0 && miles < 0.1) {
    return "<0.1 mi";
  }
  return `${miles.toFixed(1)} mi`;
}

function meetingTypeLabel(meeting: DashboardMeeting): string {
  if (meeting.format === "ONLINE") {
    return "Online";
  }
  if (meeting.format === "HYBRID") {
    return `${distanceLabel(meeting.distanceMeters)} • In-Person / Online`;
  }
  return `${distanceLabel(meeting.distanceMeters)} • In-Person`;
}

const SPONSOR_WISDOM_TEXT =
  "Getting A Sponsor Is Simply A Suggestion, But So Is Pulling A Ripcord On A Parachute.";

export function Dashboard({
  daysSober,
  sobrietyDateLabel,
  insight,
  locationEnabled,
  nextMeetings,
  meetingsAttendedInNinetyDays,
  ninetyDayGoalTarget,
  ninetyDayProgressPct,
  sponsorAdherence,
  sponsorBarsLast14,
  morningRoutine,
  nightlyInventory,
  routineInsights,
  onMeetingPress,
  onSearchArea,
  onCallSponsor,
  onOpenMorningRoutine,
  onOpenNightlyInventory,
  onOpenRecoverySettings,
  onOpenMeetings,
  onOpenAttendance,
  onOpenTools,
  onOpenSoberHousingSettings,
  onOpenProbationParoleSettings,
  onRefresh,
  onLogMeeting,
}: DashboardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const successRate = Math.max(0, Math.min(100, Math.round(sponsorAdherence.percent)));
  const sponsorBars = sponsorBarsLast14.slice(-8);
  const sponsorStreakDays = Math.max(0, sponsorAdherence.completed);
  const upcoming = nextMeetings.slice(0, 3);

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable onPress={() => setMenuOpen((current) => !current)} style={styles.iconButton}>
          <Text style={styles.iconText}>☰</Text>
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.appTitle}>Sober AI</Text>
          <Text style={styles.appSubtitle}>Recovery</Text>
        </View>
        <Pressable onPress={onRefresh} style={styles.iconButton}>
          <Text style={styles.iconText}>🔔</Text>
        </Pressable>
      </View>

      {menuOpen ? (
        <View style={styles.menuWrap}>
          <GlassCard style={styles.menuCard}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                onOpenRecoverySettings();
              }}
            >
              <Text style={styles.menuItemText}>Recovery Settings</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                onOpenMeetings();
              }}
            >
              <Text style={styles.menuItemText}>Meetings</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                onOpenAttendance();
              }}
            >
              <Text style={styles.menuItemText}>Meeting Attendance</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                onOpenTools();
              }}
            >
              <Text style={styles.menuItemText}>Tools</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                onOpenSoberHousingSettings();
              }}
            >
              <Text style={styles.menuItemText}>Sober Housing Settings</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenuOpen(false);
                onOpenProbationParoleSettings();
              }}
            >
              <Text style={styles.menuItemText}>Probation/Parole Settings</Text>
            </Pressable>
          </GlassCard>
        </View>
      ) : null}

      <View style={styles.wave} />

      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.bodyScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroBlock}>
          <Text style={styles.welcomeText}>Sobriety date: {sobrietyDateLabel || "Not set"}</Text>
          <Text style={styles.daysText}>{daysSober} Days Sober</Text>
        </View>

        <GlassCard strong blurIntensity={12} style={[styles.factCard, styles.liquidGlassTile]}>
          <Text style={styles.factHeading}>💡 Wisdom To Know The Difference</Text>
          <View style={styles.separator} />
          <ScrollView
            style={styles.factScroll}
            contentContainerStyle={styles.factScrollContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator
          >
            <Text style={styles.factText}>{SPONSOR_WISDOM_TEXT}</Text>
          </ScrollView>
        </GlassCard>

        <View style={styles.metricsRow}>
          <GlassCard
            strong
            blurIntensity={12}
            darken
            gradientDark
            style={[styles.metricCard, styles.liquidGlassTile]}
          >
            <Text style={styles.metricHeading}>{ninetyDayGoalTarget} Meetings in 90 Days</Text>
            <View style={styles.separator} />
            <View style={styles.ringOuter}>
              <View style={styles.ringInner}>
                <Text style={styles.ringValue}>
                  {meetingsAttendedInNinetyDays}/{ninetyDayGoalTarget}
                </Text>
                <Text style={styles.ringGoal}>{ninetyDayProgressPct}% toward your 90-day goal</Text>
              </View>
            </View>
          </GlassCard>

          <GlassCard
            strong
            blurIntensity={12}
            darken
            gradientDark
            style={[styles.metricCard, styles.liquidGlassTile]}
          >
            <Text style={styles.metricHeading}>Sponsor Call Consistency</Text>
            <View style={styles.separator} />
            <Text style={styles.successText}>{successRate}% Success Rate</Text>
            <View style={styles.barChart}>
              {sponsorBars.map((hit, index) => (
                <View
                  key={`sponsor-bar-${index}`}
                  style={[
                    styles.chartBar,
                    {
                      height: hit ? 50 - (index % 3) * 6 : 30 - (index % 2) * 4,
                      backgroundColor: hit ? "rgba(228,246,102,0.94)" : "rgba(255,255,255,0.65)",
                    },
                  ]}
                />
              ))}
            </View>
            <Pressable style={styles.callNowButton} onPress={onCallSponsor}>
              <Text style={styles.callNowText}>📞 Call Now</Text>
            </Pressable>
            <Text style={styles.streakLabel}>{sponsorStreakDays} day streak</Text>
          </GlassCard>
        </View>

        <View style={styles.metricsRow}>
          <GlassCard strong blurIntensity={12} style={[styles.metricCard, styles.liquidGlassTile]}>
            <Text style={styles.metricHeading}>Morning Routine</Text>
            <View style={styles.separator} />
            <Text style={styles.metricMeta}>
              Today: {morningRoutine.todayCompletedCount}/{morningRoutine.todayTotalCount}
            </Text>
            <Text style={styles.metricMeta}>Streak: {morningRoutine.streakDays} days</Text>
            <Text style={styles.metricMeta}>
              Last 30 days: {morningRoutine.last30CompletionPct}%
            </Text>
            <Pressable style={styles.callNowButton} onPress={onOpenMorningRoutine}>
              <Text style={styles.callNowText}>Open Morning Routine</Text>
            </Pressable>
          </GlassCard>

          <GlassCard strong blurIntensity={12} style={[styles.metricCard, styles.liquidGlassTile]}>
            <Text style={styles.metricHeading}>Nightly Inventory</Text>
            <View style={styles.separator} />
            <Text style={styles.metricMeta}>
              Today: {nightlyInventory.todayCompleted ? "Completed" : "Not completed"}
            </Text>
            <Text style={styles.metricMeta}>Issues logged: {nightlyInventory.todayIssueCount}</Text>
            <Text style={styles.metricMeta}>
              Trend: {routineInsights.trend.toUpperCase()} (
              {routineInsights.averageIssuesOnMorningCompleteDays} vs{" "}
              {routineInsights.averageIssuesOnMorningIncompleteDays})
            </Text>
            <Pressable style={styles.callNowButton} onPress={onOpenNightlyInventory}>
              <Text style={styles.callNowText}>Open Nightly Inventory</Text>
            </Pressable>
          </GlassCard>
        </View>

        <GlassCard strong blurIntensity={12} style={[styles.upcomingCard, styles.liquidGlassTile]}>
          <View style={styles.upcomingHeader}>
            <Text style={styles.upcomingTitle}>Upcoming Meetings</Text>
            <View style={styles.dotRow}>
              <View style={styles.dot} />
              <View style={styles.dot} />
              <View style={styles.dot} />
            </View>
          </View>

          {upcoming.map((meeting, index) => (
            <Pressable
              key={meeting.id}
              style={styles.meetingItem}
              onPress={() => onMeetingPress(meeting.id)}
            >
              <View style={[styles.meetingIcon, index === 2 ? styles.meetingIconPink : null]}>
                <Text style={styles.meetingIconText}>
                  {index === 1 ? "🔒" : index === 2 ? "✦" : "↪"}
                </Text>
              </View>
              <View style={styles.meetingTextCol}>
                <Text numberOfLines={1} style={styles.meetingName}>
                  {meeting.name}
                </Text>
                <Text numberOfLines={1} style={styles.meetingMeta}>
                  {meetingTypeLabel(meeting)}
                </Text>
              </View>
              <Text style={styles.meetingTime}>{toTwelveHour(meeting.startsAtLocal)}</Text>
            </Pressable>
          ))}

          {upcoming.length === 0 ? (
            <Pressable style={styles.emptyMeetingCta} onPress={onSearchArea}>
              <Text style={styles.emptyMeetingText}>
                {locationEnabled
                  ? "No upcoming meetings in your area. Tap to search this area."
                  : "Location is off. Tap to refresh and try again."}
              </Text>
            </Pressable>
          ) : null}

          <Pressable style={styles.logMeetingButton} onPress={onLogMeeting}>
            <Text style={styles.logMeetingText}>☑ Log Meeting</Text>
          </Pressable>
        </GlassCard>

        <GlassCard strong blurIntensity={12} style={[styles.recoveryCard, styles.liquidGlassTile]}>
          <View style={styles.upcomingHeader}>
            <Text style={styles.recoveryTitle}>Physical Recovery</Text>
            <View style={styles.dotRow}>
              <View style={styles.dot} />
              <View style={styles.dot} />
              <View style={styles.dot} />
            </View>
          </View>
          <Text style={styles.recoveryText}>{insight.body}</Text>
        </GlassCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 2,
    paddingHorizontal: 6,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  iconText: {
    color: Design.color.textPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
  appTitle: {
    color: Design.color.textPrimary,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  titleWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  appSubtitle: {
    color: Design.color.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  wave: {
    height: 3,
    borderRadius: 99,
    backgroundColor: "rgba(48, 3, 106, 0.5)",
    marginHorizontal: 4,
  },
  menuWrap: {
    position: "absolute",
    top: 48,
    left: 6,
    zIndex: 20,
    width: 260,
  },
  menuCard: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    gap: 2,
  },
  menuItem: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  menuItemText: {
    color: Design.color.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  bodyScroll: {
    flex: 1,
    marginTop: 6,
  },
  bodyScrollContent: {
    gap: 12,
    paddingBottom: 10,
  },
  heroBlock: {
    alignItems: "center",
    gap: 4,
  },
  welcomeText: {
    color: Design.color.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
  daysText: {
    color: Design.color.textPrimary,
    fontSize: 38,
    lineHeight: 42,
    fontWeight: "800",
    textAlign: "center",
  },
  factCard: {
    padding: 14,
    gap: 10,
  },
  liquidGlassTile: {
    backgroundColor: "rgba(255,255,255,0.01)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
    shadowColor: "rgba(31,38,135,1)",
    shadowOpacity: 0.154,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  factHeading: {
    color: Design.color.textPrimary,
    fontSize: 17,
    fontWeight: "800",
    textAlign: "left",
  },
  separator: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  factText: {
    color: Design.color.textPrimary,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "600",
  },
  factScroll: {
    maxHeight: 170,
  },
  factScrollContent: {
    paddingBottom: 2,
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10,
  },
  metricCard: {
    flex: 1,
    padding: 12,
    gap: 8,
  },
  metricHeading: {
    color: Design.color.textPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
  ringOuter: {
    alignSelf: "center",
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 9,
    borderColor: "rgba(255,255,255,0.78)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,85,247,0.2)",
  },
  ringInner: {
    width: 102,
    height: 102,
    borderRadius: 51,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    backgroundColor: "rgba(39,12,87,0.92)",
  },
  ringValue: {
    color: Design.color.textPrimary,
    fontSize: 25,
    fontWeight: "800",
    textAlign: "center",
  },
  ringGoal: {
    color: Design.color.textSecondary,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  successText: {
    color: Design.color.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  metricMeta: {
    color: Design.color.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  barChart: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 58,
  },
  chartBar: {
    width: 12,
    borderRadius: 3,
  },
  callNowButton: {
    marginTop: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(90,44,206,0.8)",
    paddingVertical: 8,
    alignItems: "center",
  },
  callNowText: {
    color: Design.color.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  streakLabel: {
    color: Design.color.textSecondary,
    fontSize: 11,
    textAlign: "center",
  },
  upcomingCard: {
    padding: 12,
    gap: 8,
  },
  upcomingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  upcomingTitle: {
    color: Design.color.textPrimary,
    fontSize: 17,
    fontWeight: "800",
  },
  dotRow: {
    flexDirection: "row",
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  meetingItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 9,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  meetingIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6D4FD8",
  },
  meetingIconPink: {
    backgroundColor: "#DE56AE",
  },
  meetingIconText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  meetingTextCol: {
    flex: 1,
    gap: 1,
  },
  meetingName: {
    color: "#2B1F72",
    fontSize: 16,
    fontWeight: "700",
  },
  meetingMeta: {
    color: "#3F2E88",
    fontSize: 12,
    fontWeight: "600",
  },
  meetingTime: {
    color: "#2F2380",
    fontSize: 16,
    fontWeight: "800",
  },
  emptyMeetingCta: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  emptyMeetingText: {
    color: Design.color.textPrimary,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
  },
  logMeetingButton: {
    marginTop: 2,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(90,44,206,0.8)",
    paddingVertical: 9,
    alignItems: "center",
  },
  logMeetingText: {
    color: Design.color.textPrimary,
    fontSize: 18,
    fontWeight: "800",
  },
  recoveryCard: {
    padding: 12,
    gap: 8,
  },
  recoveryTitle: {
    color: Design.color.textPrimary,
    fontSize: 17,
    fontWeight: "800",
  },
  recoveryText: {
    color: Design.color.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },
});
