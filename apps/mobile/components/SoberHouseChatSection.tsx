import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  acknowledgeChatMessage,
  buildChatThreadSummaries,
  ensureDirectThreadForResident,
  getChatViewerContexts,
  getManagerViewerContexts,
  getThreadCorrectiveActions,
  isViewerAuthorizedForThread,
  labelForChatMessageType,
  markThreadRead,
  sendChatMessage,
  type ChatViewerContext,
  type ManagerChatViewerContext,
  type ResidentChatViewerContext,
} from "../lib/soberHouse/chat";
import { labelForViolationRuleType } from "../lib/soberHouse/interventions";
import {
  getChatMessagesForThread,
  getChatParticipantsForThread,
  getChatReceiptForMessageAndUser,
  getChatThreadById,
  getViolationById,
} from "../lib/soberHouse/selectors";
import type { AuditActor, ChatMessageType, SoberHouseSettingsStore } from "../lib/soberHouse/types";
import { CHAT_MESSAGE_TYPE_OPTIONS } from "../lib/soberHouse/types";
import { colors, radius, spacing, typography } from "../lib/theme/tokens";
import { AppButton } from "../lib/ui/AppButton";
import { GlassCard } from "../lib/ui/GlassCard";

type PersistOptions = {
  showStatus?: boolean;
};

type Props = {
  store: SoberHouseSettingsStore;
  actor: AuditActor;
  isSaving: boolean;
  chatIntent: { violationId: string; correctiveActionId?: string | null } | null;
  onChatIntentHandled: () => void;
  onPersist: (
    nextStore: SoberHouseSettingsStore,
    successMessage: string,
    options?: PersistOptions,
  ) => Promise<void>;
};

type ViewerMode = "resident" | "manager";

const INPUT_PLACEHOLDER_COLOR = "rgba(245,243,255,0.45)";

function formatIso(value: string | null): string {
  if (!value) {
    return "No timestamp";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function threadContextLabel(
  store: SoberHouseSettingsStore,
  violationId: string | null,
): string | null {
  if (!violationId) {
    return null;
  }
  const violation = getViolationById(store, violationId);
  if (!violation) {
    return "Linked to violation";
  }
  return `${labelForViolationRuleType(violation.ruleType)} violation`;
}

function TypeChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.chip, selected ? styles.chipSelected : null]} onPress={onPress}>
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

export function SoberHouseChatSection({
  store,
  actor,
  isSaving,
  chatIntent,
  onChatIntentHandled,
  onPersist,
}: Props) {
  const viewerContexts = useMemo(() => getChatViewerContexts(store), [store]);
  const residentContext = useMemo<ResidentChatViewerContext | null>(
    () =>
      viewerContexts.find(
        (context): context is ResidentChatViewerContext => context.kind === "resident",
      ) ?? null,
    [viewerContexts],
  );
  const managerContexts = useMemo(() => getManagerViewerContexts(store), [store]);
  const [viewerMode, setViewerMode] = useState<ViewerMode>(
    managerContexts.length > 0 ? "manager" : "resident",
  );
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(
    managerContexts[0]?.staffAssignmentId ?? null,
  );
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageType, setMessageType] = useState<ChatMessageType>("NORMAL");
  const [linkedCorrectiveActionId, setLinkedCorrectiveActionId] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);

  useEffect(() => {
    if (managerContexts.length === 0) {
      setViewerMode("resident");
      setSelectedManagerId(null);
      return;
    }
    setSelectedManagerId((current) =>
      current && managerContexts.some((context) => context.staffAssignmentId === current)
        ? current
        : (managerContexts[0]?.staffAssignmentId ?? null),
    );
  }, [managerContexts]);

  const activeViewer = useMemo<ChatViewerContext | null>(() => {
    if (viewerMode === "resident") {
      return residentContext;
    }
    return (
      managerContexts.find((context) => context.staffAssignmentId === selectedManagerId) ??
      managerContexts[0] ??
      residentContext
    );
  }, [managerContexts, residentContext, selectedManagerId, viewerMode]);

  const threadSummaries = useMemo(
    () => (activeViewer ? buildChatThreadSummaries(store, activeViewer) : []),
    [activeViewer, store],
  );

  useEffect(() => {
    setSelectedThreadId((current) =>
      current && threadSummaries.some((summary) => summary.thread.id === current)
        ? current
        : (threadSummaries[0]?.thread.id ?? null),
    );
  }, [threadSummaries]);

  const selectedThread = useMemo(
    () => (selectedThreadId ? getChatThreadById(store, selectedThreadId) : null),
    [selectedThreadId, store],
  );
  const selectedThreadMessages = useMemo(
    () => (selectedThread ? getChatMessagesForThread(store, selectedThread.id) : []),
    [selectedThread, store],
  );
  const selectedThreadParticipants = useMemo(
    () => (selectedThread ? getChatParticipantsForThread(store, selectedThread.id) : []),
    [selectedThread, store],
  );
  const selectedThreadActions = useMemo(
    () => getThreadCorrectiveActions(store, selectedThread),
    [selectedThread, store],
  );

  useEffect(() => {
    if (
      !activeViewer ||
      !selectedThread ||
      !isViewerAuthorizedForThread(store, activeViewer, selectedThread)
    ) {
      return;
    }
    const hasUnread = selectedThreadMessages.some((message) => {
      if (message.senderUserId === activeViewer.userId) {
        return false;
      }
      return (
        getChatReceiptForMessageAndUser(store, message.id, activeViewer.userId)?.readAt === null
      );
    });
    if (!hasUnread) {
      return;
    }
    const timestamp = new Date().toISOString();
    const result = markThreadRead(store, actor, activeViewer, selectedThread.id, timestamp);
    if (result.auditCount > 0) {
      void onPersist(result.store, "Chat read state updated.", { showStatus: false });
    }
  }, [activeViewer, actor, onPersist, selectedThread, selectedThreadMessages, store]);

  useEffect(() => {
    if (!chatIntent || managerContexts.length === 0) {
      return;
    }
    const timestamp = new Date().toISOString();
    const managerContext: ManagerChatViewerContext | null =
      managerContexts.find((context) => context.staffAssignmentId === selectedManagerId) ??
      managerContexts[0] ??
      null;
    if (!managerContext) {
      onChatIntentHandled();
      return;
    }
    const result = ensureDirectThreadForResident(
      store,
      actor,
      {
        managerStaffAssignmentId: managerContext.staffAssignmentId,
        linkedViolationId: chatIntent.violationId,
      },
      timestamp,
    );
    setViewerMode("manager");
    setSelectedManagerId(managerContext.staffAssignmentId);
    setLinkedCorrectiveActionId(chatIntent.correctiveActionId ?? null);
    if (result.thread) {
      setSelectedThreadId(result.thread.id);
    }
    if (result.auditCount > 0) {
      void onPersist(result.store, "Violation-linked chat thread ready.");
    }
    onChatIntentHandled();
  }, [
    actor,
    chatIntent,
    managerContexts,
    onChatIntentHandled,
    onPersist,
    selectedManagerId,
    store,
  ]);

  const createDirectThread = useCallback(async () => {
    if (!selectedManagerId) {
      setLocalStatus("Add an active manager assignment before starting chat.");
      return;
    }
    const timestamp = new Date().toISOString();
    const result = ensureDirectThreadForResident(
      store,
      actor,
      {
        managerStaffAssignmentId: selectedManagerId,
      },
      timestamp,
    );
    if (!result.thread) {
      setLocalStatus("Unable to create a direct thread for the current resident.");
      return;
    }
    setSelectedThreadId(result.thread.id);
    setViewerMode("manager");
    if (result.auditCount > 0) {
      await onPersist(result.store, "Direct chat thread created.");
    }
  }, [actor, onPersist, selectedManagerId, store]);

  const sendMessage = useCallback(async () => {
    if (!activeViewer || !selectedThread) {
      setLocalStatus("Choose a thread before sending a message.");
      return;
    }
    const timestamp = new Date().toISOString();
    const result = sendChatMessage(
      store,
      actor,
      activeViewer,
      {
        threadId: selectedThread.id,
        messageType: activeViewer.kind === "resident" ? "NORMAL" : messageType,
        bodyText: messageDraft,
        linkedViolationId: selectedThread.linkedViolationId,
        linkedCorrectiveActionId: activeViewer.kind === "manager" ? linkedCorrectiveActionId : null,
      },
      timestamp,
    );
    if (!result.message) {
      setLocalStatus("Enter a message before sending.");
      return;
    }
    await onPersist(result.store, "Message sent.");
    setMessageDraft("");
    if (activeViewer.kind === "manager") {
      setMessageType("NORMAL");
    }
    setLinkedCorrectiveActionId(null);
  }, [
    activeViewer,
    actor,
    linkedCorrectiveActionId,
    messageDraft,
    messageType,
    onPersist,
    selectedThread,
    store,
  ]);

  const acknowledgeMessage = useCallback(
    async (messageId: string) => {
      if (!activeViewer) {
        return;
      }
      const timestamp = new Date().toISOString();
      const result = acknowledgeChatMessage(store, actor, activeViewer, messageId, timestamp);
      if (result.auditCount > 0) {
        await onPersist(result.store, "Acknowledgment recorded.");
      }
    },
    [activeViewer, actor, onPersist, store],
  );

  if (!residentContext) {
    return (
      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Internal Chat</Text>
        <Text style={styles.sectionMeta}>
          Complete resident sober-house setup before opening direct manager chat.
        </Text>
      </GlassCard>
    );
  }

  return (
    <GlassCard style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.sectionTitle}>Internal Chat</Text>
          <Text style={styles.sectionMeta}>
            Structured sober-house direct messaging with unread and acknowledgment state.
          </Text>
        </View>
        {managerContexts.length > 0 ? (
          <AppButton
            title="Start direct thread"
            variant="secondary"
            onPress={() => void createDirectThread()}
            disabled={isSaving}
          />
        ) : null}
      </View>

      <View style={styles.modeRow}>
        <TypeChip
          label="Resident view"
          selected={viewerMode === "resident"}
          onPress={() => setViewerMode("resident")}
        />
        {managerContexts.length > 0 ? (
          <TypeChip
            label="Manager view"
            selected={viewerMode === "manager"}
            onPress={() => setViewerMode("manager")}
          />
        ) : null}
      </View>

      {viewerMode === "manager" && managerContexts.length > 0 ? (
        <View style={styles.selectorRow}>
          {managerContexts.map((context) => (
            <TypeChip
              key={context.staffAssignmentId}
              label={context.label}
              selected={selectedManagerId === context.staffAssignmentId}
              onPress={() => setSelectedManagerId(context.staffAssignmentId)}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.inboxLayout}>
        <View style={styles.threadList}>
          <Text style={styles.subsectionTitle}>Inbox</Text>
          {threadSummaries.length === 0 ? (
            <Text style={styles.sectionMeta}>
              {viewerMode === "manager"
                ? "No direct threads yet. Start one from here or from a violation."
                : "No manager messages yet."}
            </Text>
          ) : (
            threadSummaries.map((summary) => (
              <Pressable
                key={summary.thread.id}
                style={[
                  styles.threadRow,
                  summary.thread.id === selectedThreadId ? styles.threadRowSelected : null,
                ]}
                onPress={() => setSelectedThreadId(summary.thread.id)}
              >
                <Text style={styles.threadTitle}>{summary.otherParticipantName}</Text>
                <Text style={styles.threadMeta}>{summary.otherParticipantRole}</Text>
                {summary.thread.linkedViolationId ? (
                  <Text style={styles.threadMeta}>
                    {threadContextLabel(store, summary.thread.linkedViolationId)}
                  </Text>
                ) : null}
                <Text style={styles.threadPreview}>
                  {summary.lastMessage?.bodyText ?? "No messages yet."}
                </Text>
                <View style={styles.threadFooter}>
                  <Text style={styles.threadMeta}>
                    {formatIso(summary.lastMessage?.createdAt ?? summary.thread.createdAt)}
                  </Text>
                  {summary.unreadCount > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{summary.unreadCount}</Text>
                    </View>
                  ) : null}
                  {summary.acknowledgmentPending ? (
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>Ack pending</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.threadDetail}>
          <Text style={styles.subsectionTitle}>Thread detail</Text>
          {!selectedThread || !activeViewer ? (
            <Text style={styles.sectionMeta}>Select a thread to view the conversation.</Text>
          ) : (
            <>
              <View style={styles.banner}>
                <Text style={styles.bannerTitle}>
                  {threadSummaries.find((summary) => summary.thread.id === selectedThread.id)
                    ?.otherParticipantName ?? "Thread"}
                </Text>
                <Text style={styles.bannerMeta}>
                  Viewing as {activeViewer.label} •{" "}
                  {activeViewer.kind === "manager" ? "Manager" : "Resident"}
                </Text>
                {selectedThread.linkedViolationId ? (
                  <Text style={styles.bannerMeta}>
                    {threadContextLabel(store, selectedThread.linkedViolationId)}
                  </Text>
                ) : null}
              </View>

              <ScrollView
                style={styles.messageList}
                contentContainerStyle={styles.messageListContent}
              >
                {selectedThreadMessages.length === 0 ? (
                  <Text style={styles.sectionMeta}>No messages yet.</Text>
                ) : (
                  selectedThreadMessages.map((message) => {
                    const isMine = message.senderUserId === activeViewer.userId;
                    const recipientUserId =
                      selectedThreadParticipants.find(
                        (participant) => participant.userId !== message.senderUserId,
                      )?.userId ?? null;
                    const viewerReceipt = getChatReceiptForMessageAndUser(
                      store,
                      message.id,
                      activeViewer.userId,
                    );
                    const recipientReceipt =
                      recipientUserId === null
                        ? null
                        : getChatReceiptForMessageAndUser(store, message.id, recipientUserId);
                    const linkedAction = selectedThreadActions.find(
                      (action) => action.id === message.linkedCorrectiveActionId,
                    );
                    return (
                      <View
                        key={message.id}
                        style={[
                          styles.messageCard,
                          isMine ? styles.messageCardMine : styles.messageCardTheirs,
                        ]}
                      >
                        <Text style={styles.messageType}>
                          {labelForChatMessageType(message.messageType)}
                        </Text>
                        <Text style={styles.messageBody}>{message.bodyText}</Text>
                        {linkedAction ? (
                          <Text style={styles.messageMeta}>
                            Linked corrective action due {formatIso(linkedAction.dueAt)}
                          </Text>
                        ) : null}
                        <Text style={styles.messageMeta}>{formatIso(message.createdAt)}</Text>
                        {isMine ? (
                          <Text style={styles.messageMeta}>
                            {message.messageType === "ACKNOWLEDGMENT_REQUIRED"
                              ? recipientReceipt?.acknowledgedAt
                                ? "Acknowledged"
                                : "Awaiting acknowledgment"
                              : recipientReceipt?.readAt
                                ? "Read"
                                : "Delivered"}
                          </Text>
                        ) : message.messageType === "ACKNOWLEDGMENT_REQUIRED" &&
                          activeViewer.kind === "resident" &&
                          !viewerReceipt?.acknowledgedAt ? (
                          <AppButton
                            title="Acknowledge"
                            variant="secondary"
                            onPress={() => void acknowledgeMessage(message.id)}
                            disabled={isSaving}
                          />
                        ) : null}
                      </View>
                    );
                  })
                )}
              </ScrollView>

              {activeViewer.kind === "manager" ? (
                <>
                  <Text style={styles.fieldLabel}>Message type</Text>
                  <View style={styles.selectorRow}>
                    {CHAT_MESSAGE_TYPE_OPTIONS.map((option) => (
                      <TypeChip
                        key={option.value}
                        label={option.label}
                        selected={messageType === option.value}
                        onPress={() => setMessageType(option.value)}
                      />
                    ))}
                  </View>
                  {selectedThreadActions.length > 0 ? (
                    <>
                      <Text style={styles.fieldLabel}>Linked corrective action</Text>
                      <View style={styles.selectorRow}>
                        <TypeChip
                          label="None"
                          selected={linkedCorrectiveActionId === null}
                          onPress={() => setLinkedCorrectiveActionId(null)}
                        />
                        {selectedThreadActions.map((action) => (
                          <TypeChip
                            key={action.id}
                            label={formatIso(action.dueAt)}
                            selected={linkedCorrectiveActionId === action.id}
                            onPress={() => setLinkedCorrectiveActionId(action.id)}
                          />
                        ))}
                      </View>
                    </>
                  ) : null}
                </>
              ) : null}

              <Text style={styles.fieldLabel}>
                {activeViewer.kind === "manager" ? "Compose message" : "Reply"}
              </Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={messageDraft}
                onChangeText={setMessageDraft}
                placeholder={
                  activeViewer.kind === "manager"
                    ? "Send an operational message to the resident"
                    : "Reply to your manager"
                }
                placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                multiline
              />
              <AppButton
                title={activeViewer.kind === "manager" ? "Send message" : "Send reply"}
                onPress={() => void sendMessage()}
                disabled={isSaving}
              />
            </>
          )}
        </View>
      </View>

      {localStatus ? <Text style={styles.localStatus}>{localStatus}</Text> : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.h2,
    fontWeight: "800",
  },
  sectionMeta: {
    color: colors.textSecondary,
    fontSize: typography.body,
    lineHeight: 20,
  },
  subsectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.h3,
    fontWeight: "700",
  },
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  selectorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.32)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: "rgba(15,23,42,0.24)",
  },
  chipSelected: {
    borderColor: "rgba(96,165,250,0.8)",
    backgroundColor: "rgba(59,130,246,0.18)",
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: "700",
  },
  chipTextSelected: {
    color: colors.textPrimary,
  },
  inboxLayout: {
    gap: spacing.md,
  },
  threadList: {
    gap: spacing.sm,
  },
  threadDetail: {
    gap: spacing.sm,
  },
  threadRow: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
    backgroundColor: "rgba(15,23,42,0.24)",
    padding: spacing.md,
    gap: spacing.xs,
  },
  threadRowSelected: {
    borderColor: "rgba(96,165,250,0.8)",
    backgroundColor: "rgba(59,130,246,0.14)",
  },
  threadTitle: {
    color: colors.textPrimary,
    fontSize: typography.h3,
    fontWeight: "700",
  },
  threadMeta: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  threadPreview: {
    color: colors.textPrimary,
    fontSize: typography.body,
    lineHeight: 20,
  },
  threadFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  unreadBadge: {
    minWidth: 22,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: "rgba(239,68,68,0.22)",
  },
  unreadBadgeText: {
    color: "#fecaca",
    fontSize: typography.small,
    fontWeight: "800",
    textAlign: "center",
  },
  pendingBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: "rgba(245,158,11,0.22)",
  },
  pendingBadgeText: {
    color: "#fde68a",
    fontSize: typography.small,
    fontWeight: "800",
  },
  banner: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.2)",
    padding: spacing.md,
    gap: spacing.xs,
    backgroundColor: "rgba(15,23,42,0.24)",
  },
  bannerTitle: {
    color: colors.textPrimary,
    fontSize: typography.h3,
    fontWeight: "700",
  },
  bannerMeta: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  messageList: {
    maxHeight: 360,
  },
  messageListContent: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  messageCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  messageCardMine: {
    borderColor: "rgba(96,165,250,0.44)",
    backgroundColor: "rgba(59,130,246,0.18)",
  },
  messageCardTheirs: {
    borderColor: "rgba(148,163,184,0.18)",
    backgroundColor: "rgba(15,23,42,0.24)",
  },
  messageType: {
    color: "#bfdbfe",
    fontSize: typography.small,
    fontWeight: "800",
  },
  messageBody: {
    color: colors.textPrimary,
    fontSize: typography.body,
    lineHeight: 20,
  },
  messageMeta: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: "700",
  },
  input: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    backgroundColor: "rgba(15,23,42,0.24)",
    fontSize: typography.body,
  },
  multilineInput: {
    minHeight: 104,
    textAlignVertical: "top",
  },
  localStatus: {
    color: "#fde68a",
    fontSize: typography.small,
    fontWeight: "700",
  },
});
