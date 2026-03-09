import { appendAuditEntries, buildAuditActionEntry } from "./audit";
import { getCorrectiveActionsForViolation } from "./selectors";
import {
  upsertChatMessage,
  upsertChatMessageReceipt,
  upsertChatParticipant,
  upsertChatThread,
} from "./mutations";
import type {
  AuditActor,
  ChatMessage,
  ChatMessageReceipt,
  ChatMessageType,
  ChatParticipant,
  ChatParticipantRole,
  ChatThread,
  CorrectiveAction,
  SoberHouseSettingsStore,
  StaffAssignment,
  StaffRole,
} from "./types";

const MANAGER_STAFF_ROLES: StaffRole[] = ["OWNER", "HOUSE_MANAGER", "ASSISTANT_MANAGER"];

export type ChatViewerContext = ResidentChatViewerContext | ManagerChatViewerContext;

export type ResidentChatViewerContext = {
  kind: "resident";
  userId: string;
  residentId: string;
  houseId: string | null;
  role: ChatParticipantRole;
  label: string;
};

export type ManagerChatViewerContext = {
  kind: "manager";
  userId: string;
  staffAssignmentId: string;
  houseIds: string[];
  role: ChatParticipantRole;
  label: string;
};

export type ChatThreadSummary = {
  thread: ChatThread;
  otherParticipantName: string;
  otherParticipantRole: string;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  acknowledgmentPending: boolean;
};

function activeParticipantsForThread(
  store: SoberHouseSettingsStore,
  threadId: string,
): ChatParticipant[] {
  return store.chatParticipants.filter(
    (participant) => participant.threadId === threadId && participant.active,
  );
}

function messagesForThread(store: SoberHouseSettingsStore, threadId: string): ChatMessage[] {
  return [...store.chatMessages]
    .filter((message) => message.threadId === threadId && message.active)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function receiptsForMessage(
  store: SoberHouseSettingsStore,
  messageId: string,
): ChatMessageReceipt[] {
  return store.chatMessageReceipts.filter((receipt) => receipt.messageId === messageId);
}

function receiptForMessageAndUser(
  store: SoberHouseSettingsStore,
  messageId: string,
  userId: string,
): ChatMessageReceipt | null {
  return (
    store.chatMessageReceipts.find(
      (receipt) => receipt.messageId === messageId && receipt.userId === userId,
    ) ?? null
  );
}

function participantRoleForStaffRole(role: StaffRole): ChatParticipantRole {
  if (role === "OWNER") {
    return "OWNER";
  }
  if (role === "ASSISTANT_MANAGER") {
    return "ASSISTANT_MANAGER";
  }
  return "MANAGER";
}

function roleLabel(role: ChatParticipantRole): string {
  switch (role) {
    case "ASSISTANT_MANAGER":
      return "Assistant manager";
    case "PROBATION_OFFICER":
      return "Probation officer";
    default:
      return role.charAt(0) + role.slice(1).toLowerCase().replaceAll("_", " ");
  }
}

export function labelForChatMessageType(type: ChatMessageType): string {
  switch (type) {
    case "ACKNOWLEDGMENT_REQUIRED":
      return "Acknowledgment required";
    case "CORRECTIVE_ACTION_NOTICE":
      return "Corrective action notice";
    case "SYSTEM_NOTICE":
      return "System notice";
    default:
      return type.charAt(0) + type.slice(1).toLowerCase().replaceAll("_", " ");
  }
}

export function staffAssignmentParticipantUserId(staffAssignmentId: string): string {
  return `staff-assignment:${staffAssignmentId}`;
}

export function staffAssignmentIdFromParticipantUserId(userId: string): string | null {
  return userId.startsWith("staff-assignment:") ? userId.slice("staff-assignment:".length) : null;
}

function residentViewerContext(store: SoberHouseSettingsStore): ResidentChatViewerContext | null {
  const housing = store.residentHousingProfile;
  if (!housing || housing.status !== "ACTIVE") {
    return null;
  }
  const label = `${housing.firstName} ${housing.lastName}`.trim() || "Resident";
  return {
    kind: "resident",
    userId: housing.linkedUserId,
    residentId: housing.residentId,
    houseId: housing.houseId,
    role: "RESIDENT",
    label,
  };
}

function isAuthorizedManagerAssignment(
  store: SoberHouseSettingsStore,
  assignment: StaffAssignment,
  residentHouseId: string | null,
): boolean {
  if (assignment.status !== "ACTIVE" || !MANAGER_STAFF_ROLES.includes(assignment.role)) {
    return false;
  }
  if (assignment.role === "OWNER") {
    return true;
  }
  if (residentHouseId === null) {
    return assignment.assignedHouseIds.length > 0;
  }
  return assignment.assignedHouseIds.includes(residentHouseId);
}

export function getManagerViewerContexts(
  store: SoberHouseSettingsStore,
): ManagerChatViewerContext[] {
  const residentHouseId = store.residentHousingProfile?.houseId ?? null;
  return store.staffAssignments
    .filter((assignment) => isAuthorizedManagerAssignment(store, assignment, residentHouseId))
    .map((assignment) => ({
      kind: "manager" as const,
      userId: staffAssignmentParticipantUserId(assignment.id),
      staffAssignmentId: assignment.id,
      houseIds: [...assignment.assignedHouseIds],
      role: participantRoleForStaffRole(assignment.role),
      label: `${assignment.firstName} ${assignment.lastName}`.trim() || "Manager",
    }));
}

export function getChatViewerContexts(store: SoberHouseSettingsStore): ChatViewerContext[] {
  const contexts: ChatViewerContext[] = [];
  const resident = residentViewerContext(store);
  if (resident) {
    contexts.push(resident);
  }
  return [...contexts, ...getManagerViewerContexts(store)];
}

export function isViewerAuthorizedForThread(
  store: SoberHouseSettingsStore,
  viewer: ChatViewerContext,
  thread: ChatThread,
): boolean {
  if (!thread.active || thread.moduleContext !== "SOBER_HOUSE") {
    return false;
  }
  const participant = activeParticipantsForThread(store, thread.id).find(
    (candidate) => candidate.userId === viewer.userId,
  );
  return Boolean(participant);
}

function findReusableThread(
  store: SoberHouseSettingsStore,
  participantUserIds: [string, string],
  linkedViolationId: string | null,
): ChatThread | null {
  const expectedUserIds = [...participantUserIds].sort();
  return (
    store.chatThreads.find((thread) => {
      if (!thread.active || thread.moduleContext !== "SOBER_HOUSE") {
        return false;
      }
      if ((linkedViolationId ?? null) !== (thread.linkedViolationId ?? null)) {
        return false;
      }
      if (linkedViolationId && thread.threadType !== "VIOLATION_LINKED_DIRECT") {
        return false;
      }
      if (!linkedViolationId && thread.threadType !== "DIRECT") {
        return false;
      }
      const participantUserIdsForThread = activeParticipantsForThread(store, thread.id)
        .map((participant) => participant.userId)
        .sort();
      if (participantUserIdsForThread.length !== 2) {
        return false;
      }
      return (
        participantUserIdsForThread[0] === expectedUserIds[0] &&
        participantUserIdsForThread[1] === expectedUserIds[1]
      );
    }) ?? null
  );
}

export function ensureDirectThreadForResident(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  input: {
    managerStaffAssignmentId: string;
    linkedViolationId?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
  },
  timestamp: string,
) {
  const resident = residentViewerContext(store);
  if (!resident) {
    return { store, auditCount: 0, thread: null as ChatThread | null };
  }

  const manager = getManagerViewerContexts(store).find(
    (context) =>
      context.kind === "manager" && context.staffAssignmentId === input.managerStaffAssignmentId,
  );
  if (!manager) {
    return { store, auditCount: 0, thread: null as ChatThread | null };
  }

  const linkedViolationId = input.linkedViolationId ?? null;
  const existing = findReusableThread(store, [resident.userId, manager.userId], linkedViolationId);
  if (existing) {
    return { store, auditCount: 0, thread: existing };
  }

  const threadResult = upsertChatThread(
    store,
    actor,
    {
      threadType: linkedViolationId ? "VIOLATION_LINKED_DIRECT" : "DIRECT",
      moduleContext: "SOBER_HOUSE",
      houseId: resident.houseId,
      residentId: resident.residentId,
      linkedViolationId,
      createdBy: actor,
      createdAt: timestamp,
      lastMessageAt: null,
      active: true,
      metadata: input.metadata ?? {},
    },
    timestamp,
  );
  let nextStore = threadResult.store;
  let auditCount = threadResult.auditCount;
  const thread =
    nextStore.chatThreads.find(
      (entry) =>
        entry.residentId === resident.residentId &&
        entry.linkedViolationId === linkedViolationId &&
        entry.createdAt === timestamp &&
        entry.createdBy.id === actor.id,
    ) ?? null;
  if (!thread) {
    return { store: nextStore, auditCount, thread: null as ChatThread | null };
  }

  const residentParticipant = upsertChatParticipant(
    nextStore,
    actor,
    {
      threadId: thread.id,
      userId: resident.userId,
      roleInThread: resident.role,
      joinedAt: timestamp,
      active: true,
      lastReadAt: null,
      notificationPreferences: {},
    },
    timestamp,
  );
  nextStore = residentParticipant.store;
  auditCount += residentParticipant.auditCount;

  const managerParticipant = upsertChatParticipant(
    nextStore,
    actor,
    {
      threadId: thread.id,
      userId: manager.userId,
      roleInThread: manager.role,
      joinedAt: timestamp,
      active: true,
      lastReadAt: null,
      notificationPreferences: {},
    },
    timestamp,
  );
  nextStore = managerParticipant.store;
  auditCount += managerParticipant.auditCount;

  if (linkedViolationId) {
    nextStore = appendAuditEntries(nextStore, [
      buildAuditActionEntry({
        actor,
        timestamp,
        entityType: "chatThread",
        entityId: thread.id,
        actionTaken: "chat_thread_linked_to_violation",
        fieldChanged: "linkedViolationId",
        oldValue: null,
        newValue: linkedViolationId,
      }),
    ]);
    auditCount += 1;
  }

  return {
    store: nextStore,
    auditCount,
    thread: nextStore.chatThreads.find((entry) => entry.id === thread.id) ?? thread,
  };
}

function updateParticipantLastRead(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  threadId: string,
  userId: string,
  timestamp: string,
) {
  const participant = store.chatParticipants.find(
    (entry) => entry.threadId === threadId && entry.userId === userId,
  );
  if (!participant) {
    return { store, auditCount: 0 };
  }
  return upsertChatParticipant(
    store,
    actor,
    {
      ...participant,
      lastReadAt: timestamp,
    },
    timestamp,
  );
}

export function sendChatMessage(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  viewer: ChatViewerContext,
  input: {
    threadId: string;
    messageType: ChatMessageType;
    bodyText: string;
    linkedViolationId?: string | null;
    linkedCorrectiveActionId?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
  },
  timestamp: string,
) {
  const thread = store.chatThreads.find((candidate) => candidate.id === input.threadId) ?? null;
  if (!thread || !isViewerAuthorizedForThread(store, viewer, thread)) {
    return { store, auditCount: 0, message: null as ChatMessage | null };
  }

  const bodyText = input.bodyText.trim();
  if (bodyText.length === 0) {
    return { store, auditCount: 0, message: null as ChatMessage | null };
  }

  let nextStore = store;
  let auditCount = 0;
  const messageResult = upsertChatMessage(
    nextStore,
    actor,
    {
      threadId: thread.id,
      senderUserId: viewer.userId,
      senderRole: viewer.role,
      messageType: input.messageType,
      bodyText,
      createdAt: timestamp,
      editedAt: null,
      active: true,
      linkedViolationId: input.linkedViolationId ?? thread.linkedViolationId,
      linkedCorrectiveActionId: input.linkedCorrectiveActionId ?? null,
      metadata: input.metadata ?? {},
    },
    timestamp,
  );
  nextStore = messageResult.store;
  auditCount += messageResult.auditCount;
  const message =
    nextStore.chatMessages.find(
      (entry) =>
        entry.createdAt === timestamp &&
        entry.threadId === thread.id &&
        entry.senderUserId === viewer.userId,
    ) ?? null;
  if (!message) {
    return { store: nextStore, auditCount, message: null as ChatMessage | null };
  }

  for (const participant of activeParticipantsForThread(nextStore, thread.id)) {
    const receiptResult = upsertChatMessageReceipt(
      nextStore,
      actor,
      {
        messageId: message.id,
        userId: participant.userId,
        deliveredAt: timestamp,
        readAt: participant.userId === viewer.userId ? timestamp : null,
        acknowledgedAt: null,
      },
      timestamp,
    );
    nextStore = receiptResult.store;
    auditCount += receiptResult.auditCount;
  }

  const participantResult = updateParticipantLastRead(
    nextStore,
    actor,
    thread.id,
    viewer.userId,
    timestamp,
  );
  nextStore = participantResult.store;
  auditCount += participantResult.auditCount;

  return {
    store: nextStore,
    auditCount,
    message: nextStore.chatMessages.find((entry) => entry.id === message.id) ?? message,
  };
}

export function markThreadRead(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  viewer: ChatViewerContext,
  threadId: string,
  timestamp: string,
) {
  const thread = store.chatThreads.find((candidate) => candidate.id === threadId) ?? null;
  if (!thread || !isViewerAuthorizedForThread(store, viewer, thread)) {
    return { store, auditCount: 0 };
  }

  let nextStore = store;
  let auditCount = 0;
  for (const message of messagesForThread(nextStore, threadId)) {
    if (message.senderUserId === viewer.userId) {
      continue;
    }
    const previousReceipt = receiptForMessageAndUser(nextStore, message.id, viewer.userId);
    if (previousReceipt?.readAt) {
      continue;
    }
    const receiptResult = upsertChatMessageReceipt(
      nextStore,
      actor,
      {
        id: previousReceipt?.id,
        messageId: message.id,
        userId: viewer.userId,
        deliveredAt: previousReceipt?.deliveredAt ?? timestamp,
        readAt: timestamp,
        acknowledgedAt: previousReceipt?.acknowledgedAt ?? null,
      },
      timestamp,
    );
    nextStore = receiptResult.store;
    auditCount += receiptResult.auditCount;
  }

  const participantResult = updateParticipantLastRead(
    nextStore,
    actor,
    threadId,
    viewer.userId,
    timestamp,
  );
  nextStore = participantResult.store;
  auditCount += participantResult.auditCount;

  return { store: nextStore, auditCount };
}

export function acknowledgeChatMessage(
  store: SoberHouseSettingsStore,
  actor: AuditActor,
  viewer: ChatViewerContext,
  messageId: string,
  timestamp: string,
) {
  const message = store.chatMessages.find((entry) => entry.id === messageId) ?? null;
  if (!message || message.messageType !== "ACKNOWLEDGMENT_REQUIRED") {
    return { store, auditCount: 0 };
  }
  const thread = store.chatThreads.find((entry) => entry.id === message.threadId) ?? null;
  if (
    !thread ||
    !isViewerAuthorizedForThread(store, viewer, thread) ||
    message.senderUserId === viewer.userId
  ) {
    return { store, auditCount: 0 };
  }

  const previousReceipt = receiptForMessageAndUser(store, message.id, viewer.userId);
  let nextStore = store;
  let auditCount = 0;
  const receiptResult = upsertChatMessageReceipt(
    nextStore,
    actor,
    {
      id: previousReceipt?.id,
      messageId: message.id,
      userId: viewer.userId,
      deliveredAt: previousReceipt?.deliveredAt ?? timestamp,
      readAt: previousReceipt?.readAt ?? timestamp,
      acknowledgedAt: timestamp,
    },
    timestamp,
  );
  nextStore = receiptResult.store;
  auditCount += receiptResult.auditCount;

  nextStore = appendAuditEntries(nextStore, [
    buildAuditActionEntry({
      actor,
      timestamp,
      entityType: "chatMessageReceipt",
      entityId:
        nextStore.chatMessageReceipts.find(
          (receipt) => receipt.messageId === message.id && receipt.userId === viewer.userId,
        )?.id ??
        previousReceipt?.id ??
        message.id,
      actionTaken: "chat_message_acknowledged",
      fieldChanged: "acknowledgedAt",
      oldValue: previousReceipt?.acknowledgedAt ?? null,
      newValue: timestamp,
    }),
  ]);
  auditCount += 1;

  const participantResult = updateParticipantLastRead(
    nextStore,
    actor,
    thread.id,
    viewer.userId,
    timestamp,
  );
  nextStore = participantResult.store;
  auditCount += participantResult.auditCount;

  return { store: nextStore, auditCount };
}

function participantDisplayName(
  store: SoberHouseSettingsStore,
  participant: ChatParticipant,
): string {
  if (participant.roleInThread === "RESIDENT") {
    return residentViewerContext(store)?.label ?? "Resident";
  }
  const assignmentId = staffAssignmentIdFromParticipantUserId(participant.userId);
  if (!assignmentId) {
    return roleLabel(participant.roleInThread);
  }
  const assignment = store.staffAssignments.find((entry) => entry.id === assignmentId);
  return assignment
    ? `${assignment.firstName} ${assignment.lastName}`.trim()
    : roleLabel(participant.roleInThread);
}

export function buildChatThreadSummaries(
  store: SoberHouseSettingsStore,
  viewer: ChatViewerContext,
): ChatThreadSummary[] {
  return [...store.chatThreads]
    .filter((thread) => isViewerAuthorizedForThread(store, viewer, thread))
    .sort((a, b) => {
      const right = new Date(b.lastMessageAt ?? b.createdAt).getTime();
      const left = new Date(a.lastMessageAt ?? a.createdAt).getTime();
      return right - left;
    })
    .map((thread) => {
      const participants = activeParticipantsForThread(store, thread.id);
      const otherParticipant =
        participants.find((participant) => participant.userId !== viewer.userId) ?? null;
      const threadMessages = messagesForThread(store, thread.id);
      const lastMessage = threadMessages.at(-1) ?? null;
      const unreadCount = threadMessages.reduce((count, message) => {
        if (message.senderUserId === viewer.userId) {
          return count;
        }
        return receiptForMessageAndUser(store, message.id, viewer.userId)?.readAt
          ? count
          : count + 1;
      }, 0);
      const acknowledgmentPending = threadMessages.some((message) => {
        if (
          message.messageType !== "ACKNOWLEDGMENT_REQUIRED" ||
          message.senderUserId === viewer.userId
        ) {
          return false;
        }
        return receiptForMessageAndUser(store, message.id, viewer.userId)?.acknowledgedAt === null;
      });

      return {
        thread,
        otherParticipantName: otherParticipant
          ? participantDisplayName(store, otherParticipant)
          : "Participant unavailable",
        otherParticipantRole: otherParticipant
          ? roleLabel(otherParticipant.roleInThread)
          : "Unknown",
        lastMessage,
        unreadCount,
        acknowledgmentPending,
      };
    });
}

export function getThreadCorrectiveActions(
  store: SoberHouseSettingsStore,
  thread: ChatThread | null,
): CorrectiveAction[] {
  if (!thread?.linkedViolationId) {
    return [];
  }
  return getCorrectiveActionsForViolation(store, thread.linkedViolationId);
}

export function getPendingAcknowledgmentReceipt(
  store: SoberHouseSettingsStore,
  messageId: string,
): ChatMessageReceipt | null {
  return (
    receiptsForMessage(store, messageId).find((receipt) => receipt.acknowledgedAt === null) ?? null
  );
}
