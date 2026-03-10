import { createDefaultHouseRuleSet } from "./defaults";
import type {
  AlertPreference,
  ChatMessage,
  ChatMessageReceipt,
  ChatParticipant,
  ChatThread,
  CorrectiveAction,
  EvidenceItem,
  House,
  HouseRuleSet,
  MonthlyReport,
  SoberHouseSettingsStore,
  StaffAssignment,
  Violation,
} from "./types";

export function getActiveHouses(store: SoberHouseSettingsStore): House[] {
  return store.houses.filter((house) => house.status === "ACTIVE");
}

export function getHouseById(store: SoberHouseSettingsStore, houseId: string): House | null {
  return store.houses.find((house) => house.id === houseId) ?? null;
}

export function getStaffAssignmentById(
  store: SoberHouseSettingsStore,
  assignmentId: string,
): StaffAssignment | null {
  return store.staffAssignments.find((assignment) => assignment.id === assignmentId) ?? null;
}

export function getRuleSetForHouse(
  store: SoberHouseSettingsStore,
  houseId: string,
  now: string,
): HouseRuleSet {
  return (
    store.houseRuleSets.find((ruleSet) => ruleSet.houseId === houseId) ??
    createDefaultHouseRuleSet(now, houseId, store.organization?.id ?? null)
  );
}

export function getAlertPreferencesForHouse(
  store: SoberHouseSettingsStore,
  houseId: string | null,
): AlertPreference[] {
  return store.alertPreferences.filter((preference) =>
    preference.scope === "ORGANIZATION"
      ? houseId === null || preference.houseId === null
      : preference.houseId === houseId,
  );
}

export function getViolationById(
  store: SoberHouseSettingsStore,
  violationId: string,
): Violation | null {
  return store.violations.find((violation) => violation.id === violationId) ?? null;
}

export function getCorrectiveActionsForViolation(
  store: SoberHouseSettingsStore,
  violationId: string,
): CorrectiveAction[] {
  return store.correctiveActions.filter((action) => action.violationId === violationId);
}

export function getEvidenceItemsForViolation(
  store: SoberHouseSettingsStore,
  violationId: string,
): EvidenceItem[] {
  return store.evidenceItems.filter((item) => item.linkedViolationId === violationId);
}

export function getChatThreadById(
  store: SoberHouseSettingsStore,
  threadId: string,
): ChatThread | null {
  return store.chatThreads.find((thread) => thread.id === threadId) ?? null;
}

export function getChatParticipantsForThread(
  store: SoberHouseSettingsStore,
  threadId: string,
): ChatParticipant[] {
  return store.chatParticipants.filter((participant) => participant.threadId === threadId);
}

export function getChatMessagesForThread(
  store: SoberHouseSettingsStore,
  threadId: string,
): ChatMessage[] {
  return [...store.chatMessages]
    .filter((message) => message.threadId === threadId && message.active)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function getChatReceiptsForMessage(
  store: SoberHouseSettingsStore,
  messageId: string,
): ChatMessageReceipt[] {
  return store.chatMessageReceipts.filter((receipt) => receipt.messageId === messageId);
}

export function getChatReceiptForMessageAndUser(
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

export function getMonthlyReportById(
  store: SoberHouseSettingsStore,
  reportId: string,
): MonthlyReport | null {
  return store.monthlyReports.find((report) => report.id === reportId) ?? null;
}

export function getMonthlyReportsForHouse(
  store: SoberHouseSettingsStore,
  houseId: string,
): MonthlyReport[] {
  return store.monthlyReports.filter((report) => report.houseId === houseId);
}

export function getMonthlyReportsForResident(
  store: SoberHouseSettingsStore,
  residentId: string,
): MonthlyReport[] {
  return store.monthlyReports.filter((report) => report.residentId === residentId);
}

export function getCurrentMonthlyReports(store: SoberHouseSettingsStore): MonthlyReport[] {
  return store.monthlyReports.filter((report) => report.isCurrentVersion);
}

export function getResidentDisplayName(store: SoberHouseSettingsStore): string {
  const housing = store.residentHousingProfile;
  if (!housing) {
    return "Resident";
  }
  return `${housing.firstName} ${housing.lastName}`.trim() || "Resident";
}
