import type { ChatThreadSummary } from "../soberHouse/chat";

export type CommunicationMode = "RECOVERY" | "SOBER_HOUSE" | "JUSTICE";
export type CommunicationNotificationTone = "green" | "yellow" | "red" | "gray";

export type CommunicationNotificationItem = {
  id: string;
  title: string;
  detail: string;
  tone: CommunicationNotificationTone;
  badgeLabel: string | null;
};

export type CommunicationNotificationSummary = {
  mode: CommunicationMode;
  badgeCount: number;
  title: string;
  subtitle: string;
  items: CommunicationNotificationItem[];
};

type Input = {
  mode: CommunicationMode;
  sponsorEnabled: boolean;
  sponsorActive: boolean;
  soberHouseSetupPending: boolean;
  soberHouseChatSummaries: ChatThreadSummary[];
  soberHouseViolationSummary: {
    activeCount: number;
    openCount: number;
    underReviewCount: number;
    correctiveActionCount: number;
    recentSummary: string;
  } | null;
};

function dedupeBadgeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function buildCommunicationNotificationSummary(
  input: Input,
): CommunicationNotificationSummary {
  const items: CommunicationNotificationItem[] = [];

  if (input.mode === "RECOVERY") {
    if (input.sponsorEnabled && input.sponsorActive) {
      items.push({
        id: "sponsor-reminders",
        title: "Sponsor reminders active",
        detail: "Sponsor call reminders are enabled from Recovery Settings.",
        tone: "green",
        badgeLabel: "Sponsor",
      });
    }

    return {
      mode: input.mode,
      badgeCount: items.length,
      title: "Messages & Alerts",
      subtitle: "Recovery reminders and sponsor communication status.",
      items,
    };
  }

  if (input.mode === "JUSTICE") {
    return {
      mode: input.mode,
      badgeCount: 0,
      title: "Messages & Alerts",
      subtitle: "Current accountability reminders and alerts for this profile.",
      items,
    };
  }

  if (input.soberHouseSetupPending) {
    items.push({
      id: "sober-house-setup",
      title: "Finish sober-house setup",
      detail:
        "Complete your resident profile to unlock house KPIs, messaging, and schedule tracking.",
      tone: "yellow",
      badgeLabel: "Setup",
    });
  }

  const unreadCount = input.soberHouseChatSummaries.reduce(
    (count, summary) => count + dedupeBadgeCount(summary.unreadCount),
    0,
  );
  if (unreadCount > 0) {
    items.push({
      id: "chat-unread",
      title: "Unread house messages",
      detail: `${unreadCount} unread direct message${unreadCount === 1 ? "" : "s"} from sober-house threads.`,
      tone: "yellow",
      badgeLabel: `${unreadCount}`,
    });
  }

  const acknowledgmentPending = input.soberHouseChatSummaries.some(
    (summary) => summary.acknowledgmentPending,
  );
  if (acknowledgmentPending) {
    items.push({
      id: "chat-ack",
      title: "Acknowledgment needed",
      detail: "A manager notice still requires your acknowledgment.",
      tone: "red",
      badgeLabel: "Ack",
    });
  }

  if (input.soberHouseViolationSummary?.activeCount) {
    items.push({
      id: "sober-house-violations",
      title: "Active sober-house issues",
      detail: input.soberHouseViolationSummary.recentSummary,
      tone: "red",
      badgeLabel: `${input.soberHouseViolationSummary.activeCount}`,
    });
  } else if (items.length === 0) {
    items.push({
      id: "sober-house-clear",
      title: "No active sober-house alerts",
      detail: "You are caught up on current house messages and operational alerts.",
      tone: "green",
      badgeLabel: null,
    });
  }

  return {
    mode: input.mode,
    badgeCount:
      dedupeBadgeCount(unreadCount) +
      (acknowledgmentPending ? 1 : 0) +
      dedupeBadgeCount(input.soberHouseViolationSummary?.activeCount ?? 0) +
      (input.soberHouseSetupPending ? 1 : 0),
    title: "Messages & Alerts",
    subtitle: "Unread messages, acknowledgments, and sober-house issues that need attention.",
    items,
  };
}
