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
  compactPreview?: {
    visible: boolean;
    threadCount: number;
    unreadCount: number;
    acknowledgmentPending: boolean;
    threads: Array<{
      id: string;
      participantName: string;
      participantRole: string;
      preview: string;
      timestamp: string;
      unreadCount: number;
      acknowledgmentPending: boolean;
    }>;
  } | null;
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
  compactPreview = null,
}: ChatTileProps) {
  const resolvedDetail =
    detail ??
    (enabled
      ? "Feature flag enabled: placeholder route is active."
      : "Dormant for now. Tap to preview planned experience.");
  const resolvedBadgeLabel = badgeLabel ?? (enabled ? "Preview" : "Coming Soon");
  const showCompactPreview = compactPreview?.visible ?? false;
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
            <Text style={styles.badgeText}>
              {showCompactPreview
                ? compactPreview?.unreadCount
                  ? `${compactPreview.unreadCount} unread`
                  : compactPreview?.acknowledgmentPending
                    ? "Ack pending"
                    : "Inbox"
                : resolvedBadgeLabel}
            </Text>
          </View>
        </View>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {showCompactPreview ? (
          <>
            <View style={styles.compactHeaderRow}>
              <Text style={styles.compactMeta}>
                {compactPreview?.threadCount === 0
                  ? "No direct threads yet"
                  : `${compactPreview?.threadCount ?? 0} direct thread${
                      compactPreview?.threadCount === 1 ? "" : "s"
                    }`}
              </Text>
              <Text style={styles.compactMeta}>
                {compactPreview?.acknowledgmentPending ? "Acknowledgment needed" : "Open inbox"}
              </Text>
            </View>
            {compactPreview?.threads.length ? (
              compactPreview.threads.map((thread) => (
                <View key={thread.id} style={styles.previewRow}>
                  <View style={styles.previewAvatar}>
                    <Text style={styles.previewAvatarText}>
                      {thread.participantName
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part.charAt(0).toUpperCase())
                        .join("") || "HM"}
                    </Text>
                  </View>
                  <View style={styles.previewCopy}>
                    <View style={styles.previewHeader}>
                      <Text style={styles.previewName} numberOfLines={1}>
                        {thread.participantName}
                      </Text>
                      {thread.unreadCount > 0 ? (
                        <View style={styles.previewUnreadBadge}>
                          <Text style={styles.previewUnreadBadgeText}>{thread.unreadCount}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.previewRole}>{thread.participantRole}</Text>
                    <Text style={styles.previewText} numberOfLines={2}>
                      {thread.preview}
                    </Text>
                    <Text style={styles.previewTimestamp}>
                      {thread.acknowledgmentPending ? "Ack pending" : "Last update"} •{" "}
                      {new Date(thread.timestamp).toLocaleString()}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.detail}>
                Start a direct thread with your house manager to keep reminders, acknowledgments,
                and follow-up in one place.
              </Text>
            )}
            <View style={styles.compactActionRow}>
              <Text style={styles.compactActionText}>
                {compactPreview?.threadCount
                  ? "Tap to open the full inbox and continue the conversation."
                  : "Tap to open the inbox and start a direct thread."}
              </Text>
            </View>
          </>
        ) : (
          <Text style={styles.detail}>{resolvedDetail}</Text>
        )}
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
  compactHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  compactMeta: {
    color: Design.color.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 10,
  },
  previewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(196,181,253,0.24)",
  },
  previewAvatarText: {
    color: Design.color.textPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
  previewCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  previewName: {
    color: Design.color.textPrimary,
    fontSize: 14,
    fontWeight: "800",
    flex: 1,
  },
  previewRole: {
    color: Design.color.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  previewText: {
    color: Design.color.textPrimary,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  previewTimestamp: {
    color: Design.color.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  previewUnreadBadge: {
    borderRadius: 999,
    backgroundColor: "rgba(251,191,36,0.2)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.85)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  previewUnreadBadgeText: {
    color: "#fef3c7",
    fontSize: 10,
    fontWeight: "800",
  },
  compactActionRow: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    paddingTop: 8,
  },
  compactActionText: {
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
