import { Pressable, StyleSheet, Text, View } from "react-native";
import { GlassCard } from "../ui/GlassCard";
import { Design } from "../ui/design";

type ChatTileProps = {
  enabled: boolean;
  hovered: boolean;
  onPress: () => void;
  onHoverIn: () => void;
  onHoverOut: () => void;
  title?: string;
  subtitle?: string;
  detail?: string;
  badgeLabel?: string;
};

export function ChatTile({
  enabled,
  hovered,
  onPress,
  onHoverIn,
  onHoverOut,
  title = "Intranet / Group Chat",
  subtitle = "Sponsor + sponsee messaging in one place",
  detail,
  badgeLabel,
}: ChatTileProps) {
  const resolvedDetail =
    detail ??
    (enabled
      ? "Feature flag enabled: placeholder route is active."
      : "Dormant for now. Tap to preview planned experience.");
  const resolvedBadgeLabel = badgeLabel ?? (enabled ? "Preview" : "Coming Soon");
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      accessibilityRole="button"
      accessibilityLabel="Open intranet and group chat"
    >
      <GlassCard
        strong
        blurIntensity={12}
        style={[
          styles.card,
          hovered ? styles.cardHover : null,
          !enabled ? styles.cardDormant : null,
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{resolvedBadgeLabel}</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <Text style={styles.detail}>{resolvedDetail}</Text>
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    gap: 8,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.01)",
    shadowColor: "rgba(31,38,135,1)",
    shadowOpacity: 0.154,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  cardHover: {
    borderColor: "rgba(255,255,255,0.4)",
    shadowColor: "rgba(160,196,255,1)",
    shadowOpacity: 0.34,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    elevation: 14,
    transform: [{ translateY: -2 }],
  },
  cardDormant: {
    opacity: 0.92,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: {
    color: Design.color.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    flex: 1,
  },
  subtitle: {
    color: Design.color.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  detail: {
    color: Design.color.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  badge: {
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.85)",
    backgroundColor: "rgba(251,191,36,0.2)",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeText: {
    color: "#fef3c7",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
