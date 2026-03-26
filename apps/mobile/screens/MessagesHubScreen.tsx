import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type {
  CommunicationMode,
  CommunicationNotificationSummary,
} from "../lib/communication/summary";
import { GlassCard } from "../lib/ui/GlassCard";
import { Design } from "../lib/ui/design";

type MessagesHubScreenProps = {
  mode: CommunicationMode;
  summary: CommunicationNotificationSummary;
  sponsorName: string | null;
  sponsorPhone: string | null;
  sponsorStatus: string;
  notificationStatus: string;
  notificationsRuntimeEnabled: boolean;
  onBack: () => void;
  onCallSponsor?: () => void;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
};

type ScreenCopy = {
  title: string;
  subtitle: string;
  contactTitle: string;
  emptyContactTitle: string;
  emptyContactBody: string;
  supportTitle: string;
  supportBody: string;
  supportBullets: string[];
};

const COPY_BY_MODE: Record<CommunicationMode, ScreenCopy> = {
  RECOVERY: {
    title: "Messages & Support",
    subtitle: "Manage sponsor contact, reminder status, and recovery alerts in one place.",
    contactTitle: "Sponsor contact",
    emptyContactTitle: "Add a sponsor contact",
    emptyContactBody:
      "Save a sponsor name and phone number in Recovery Settings to enable one-tap calling and reminder scheduling.",
    supportTitle: "Available in Sober²",
    supportBody:
      "This screen keeps your current communication tools in one place without exposing unfinished features.",
    supportBullets: [
      "Call your sponsor from one place when a number is on file.",
      "Review recovery alerts and reminder status before you leave the app.",
      "Jump directly to settings when you need to update sponsor details or reminder preferences.",
    ],
  },
  JUSTICE: {
    title: "Messages & Accountability",
    subtitle:
      "Review support contact details, reminder status, and accountability alerts in one place.",
    contactTitle: "Primary support contact",
    emptyContactTitle: "Add a primary support contact",
    emptyContactBody:
      "Save a sponsor name and phone number in Recovery Settings to enable one-tap calling and reminder scheduling.",
    supportTitle: "Available in Sober²",
    supportBody:
      "This workspace focuses on active reminders, alerts, and contact access for the accountability flows supported in this build.",
    supportBullets: [
      "Check current alerts before court, probation, or recovery appointments.",
      "Keep sponsor and reminder details available from a single screen.",
      "Open notifications or settings directly when you need to review or change follow-up details.",
    ],
  },
  SOBER_HOUSE: {
    title: "Messages",
    subtitle: "Review current communication status.",
    contactTitle: "Primary contact",
    emptyContactTitle: "Add a primary contact",
    emptyContactBody: "Save a contact in settings to enable quick access from this screen.",
    supportTitle: "Available in Sober²",
    supportBody: "This screen organizes current communication tools and alerts.",
    supportBullets: [
      "Review alerts that need action.",
      "Open notifications quickly.",
      "Open settings when contact details change.",
    ],
  },
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

export function MessagesHubScreen({
  mode,
  summary,
  sponsorName,
  sponsorPhone,
  sponsorStatus,
  notificationStatus,
  notificationsRuntimeEnabled,
  onBack,
  onCallSponsor,
  onOpenNotifications,
  onOpenSettings,
}: MessagesHubScreenProps) {
  const copy = COPY_BY_MODE[mode];
  const sponsorConfigured = Boolean(sponsorName && sponsorPhone);

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <GlassCard style={styles.card} strong darken blurIntensity={14}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.subtitle}>{copy.subtitle}</Text>
          </View>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {summary.badgeCount > 0 ? `${summary.badgeCount} active` : "Up to date"}
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {sponsorConfigured ? copy.contactTitle : copy.emptyContactTitle}
            </Text>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>
                {sponsorConfigured ? "Configured" : "Setup"}
              </Text>
            </View>
          </View>
          {sponsorConfigured ? (
            <>
              <Text style={styles.contactName}>{sponsorName}</Text>
              <Text style={styles.contactMeta}>{sponsorPhone}</Text>
              <Text style={styles.bodyText}>{sponsorStatus}</Text>
            </>
          ) : (
            <Text style={styles.bodyText}>{copy.emptyContactBody}</Text>
          )}
          <View style={styles.actionRow}>
            {sponsorConfigured && onCallSponsor ? (
              <Pressable
                style={[styles.actionButton, styles.actionButtonPrimary]}
                onPress={onCallSponsor}
              >
                <Text style={[styles.actionButtonText, styles.actionButtonTextPrimary]}>
                  Call sponsor
                </Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.actionButton} onPress={onOpenSettings}>
              <Text style={styles.actionButtonText}>
                {sponsorConfigured ? "Edit settings" : "Open settings"}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Alerts</Text>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>
                {notificationsRuntimeEnabled ? "Enabled" : "Device limited"}
              </Text>
            </View>
          </View>
          <Text style={styles.bodyText}>{notificationStatus}</Text>
          {summary.items.length === 0 ? (
            <Text style={styles.bodyText}>No alerts or reminders need attention right now.</Text>
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
          <View style={styles.actionRow}>
            <Pressable style={styles.actionButton} onPress={onOpenNotifications}>
              <Text style={styles.actionButtonText}>Open alerts</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{copy.supportTitle}</Text>
          <Text style={styles.bodyText}>{copy.supportBody}</Text>
          {copy.supportBullets.map((bullet) => (
            <Text key={bullet} style={styles.bullet}>
              • {bullet}
            </Text>
          ))}
        </View>
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
    borderColor: "rgba(134,239,172,0.48)",
    backgroundColor: "rgba(34,197,94,0.14)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: Design.color.textPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
  sectionCard: {
    gap: 10,
    borderWidth: 1,
    borderRadius: 18,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionTitle: {
    color: Design.color.textPrimary,
    fontSize: 15,
    fontWeight: "800",
    flex: 1,
  },
  sectionBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sectionBadgeText: {
    color: Design.color.textPrimary,
    fontSize: 10,
    fontWeight: "800",
  },
  contactName: {
    color: Design.color.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  contactMeta: {
    color: Design.color.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  bodyText: {
    color: Design.color.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  bullet: {
    color: Design.color.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionButton: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  actionButtonPrimary: {
    borderColor: "rgba(125,211,252,0.45)",
    backgroundColor: "rgba(14,165,233,0.18)",
  },
  actionButtonText: {
    color: Design.color.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  actionButtonTextPrimary: {
    color: "#dbeafe",
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
