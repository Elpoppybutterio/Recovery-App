import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CommunicationNotificationSummary } from "../lib/communication/summary";
import { GlassCard } from "../lib/ui/GlassCard";
import { Design } from "../lib/ui/design";

type NotificationsScreenProps = {
  summary: CommunicationNotificationSummary;
  onBack: () => void;
};

function toneStyle(tone: CommunicationNotificationSummary["items"][number]["tone"]) {
  if (tone === "green") {
    return {
      borderColor: "rgba(134,239,172,0.48)",
      backgroundColor: "rgba(34,197,94,0.12)",
    };
  }
  if (tone === "yellow") {
    return {
      borderColor: "rgba(253,224,71,0.48)",
      backgroundColor: "rgba(245,158,11,0.12)",
    };
  }
  if (tone === "red") {
    return {
      borderColor: "rgba(252,165,165,0.48)",
      backgroundColor: "rgba(239,68,68,0.12)",
    };
  }
  return {
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  };
}

export function NotificationsScreen({ summary, onBack }: NotificationsScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <GlassCard style={styles.card} strong darken blurIntensity={14}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{summary.title}</Text>
            <Text style={styles.subtitle}>{summary.subtitle}</Text>
          </View>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {summary.badgeCount > 0 ? `${summary.badgeCount} active` : "All clear"}
          </Text>
        </View>

        {summary.items.length === 0 ? (
          <Text style={styles.emptyText}>No alerts or notifications are active right now.</Text>
        ) : (
          summary.items.map((item) => (
            <View key={item.id} style={[styles.itemCard, toneStyle(item.tone)]}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                {item.badgeLabel ? (
                  <View style={styles.itemBadge}>
                    <Text style={styles.itemBadgeText}>{item.badgeLabel}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.itemDetail}>{item.detail}</Text>
            </View>
          ))
        )}
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
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: Design.color.textPrimary,
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    color: Design.color.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
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
    borderColor: "rgba(196,181,253,0.55)",
    backgroundColor: "rgba(196,181,253,0.18)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: Design.color.textPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
  emptyText: {
    color: Design.color.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  itemCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 6,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  itemTitle: {
    color: Design.color.textPrimary,
    fontSize: 15,
    fontWeight: "800",
    flex: 1,
  },
  itemDetail: {
    color: Design.color.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  itemBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  itemBadgeText: {
    color: Design.color.textPrimary,
    fontSize: 10,
    fontWeight: "800",
  },
});
