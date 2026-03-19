import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { GlassCard } from "../lib/ui/GlassCard";
import { Design } from "../lib/ui/design";

type ChatComingSoonScreenProps = {
  enabled: boolean;
  onBack: () => void;
  mode: "RECOVERY" | "SOBER_HOUSE" | "JUSTICE";
};

export function ChatComingSoonScreen({ enabled, onBack, mode }: ChatComingSoonScreenProps) {
  const content =
    mode === "RECOVERY"
      ? {
          title: "Recovery Chat",
          body: "Sponsor direct chat and recovery group chat will live here.",
          bullets: [
            "• Sponsor direct chat",
            "• Recovery group chat",
            "• Shared message history across recovery mode",
            "• Notifications and deep links into active threads",
          ],
        }
      : mode === "JUSTICE"
        ? {
            title: "Probation / Parole Chat",
            body: "Direct supervision communication will live here.",
            bullets: [
              "• Direct officer/client messaging",
              "• Audit-safe message history",
              "• Acknowledgment-required notices",
              "• Mode-safe separation from recovery and sober-house chat",
            ],
          }
        : {
            title: "Sober House Chat",
            body: "Direct house-manager threads and resident group chat live here.",
            bullets: [
              "• House manager direct chat",
              "• Resident house group chat",
              "• Acknowledgment and corrective-action notices",
              "• Operational follow-up in one place",
            ],
          };
  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <GlassCard style={styles.card} strong darken blurIntensity={14}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{content.title}</Text>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>Back to Dashboard</Text>
          </Pressable>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{enabled ? "Preview" : "Coming Soon"}</Text>
        </View>
        <Text style={styles.body}>{content.body}</Text>
        <Text style={styles.section}>Planned capabilities</Text>
        {content.bullets.map((bullet) => (
          <Text key={bullet} style={styles.bullet}>
            {bullet}
          </Text>
        ))}
        <Text style={styles.notifyPlaceholder}>Notify me when released (coming soon)</Text>
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
    paddingBottom: 16,
  },
  card: {
    padding: 14,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    color: Design.color.textPrimary,
    fontSize: 22,
    fontWeight: "800",
    flex: 1,
  },
  backButton: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  backText: {
    color: Design.color.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.85)",
    backgroundColor: "rgba(251,191,36,0.2)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: "#fef3c7",
    fontSize: 12,
    fontWeight: "800",
  },
  body: {
    color: Design.color.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  section: {
    color: Design.color.textPrimary,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
  },
  bullet: {
    color: Design.color.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  notifyPlaceholder: {
    marginTop: 6,
    color: Design.color.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
});
