import type { MorningRoutineDayState, RoutineChecklistItem } from "./types";

export type MorningCompletionResult = {
  nextDayState: MorningRoutineDayState;
  changed: boolean;
  reason: "completed" | "disabled" | "already-complete";
};

export function computeMorningCompletedAt(
  items: RoutineChecklistItem[],
  completedByItemId: Record<string, string>,
  previousCompletedAt: string | null,
  nowIso: string,
): string | null {
  const enabledItemIds = new Set(items.filter((item) => item.enabled).map((item) => item.id));
  if (enabledItemIds.size === 0) {
    return null;
  }
  const completedEnabledCount = Object.keys(completedByItemId).filter((itemId) =>
    enabledItemIds.has(itemId),
  ).length;
  if (completedEnabledCount >= enabledItemIds.size) {
    return previousCompletedAt ?? nowIso;
  }
  return null;
}

export function completeMorningItemIfEnabled(
  dayState: MorningRoutineDayState,
  items: RoutineChecklistItem[],
  itemId: string,
  nowIso: string,
): MorningCompletionResult {
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item?.enabled) {
    return {
      nextDayState: dayState,
      changed: false,
      reason: "disabled",
    };
  }

  if (dayState.completedByItemId[itemId]) {
    return {
      nextDayState: dayState,
      changed: false,
      reason: "already-complete",
    };
  }

  const completedByItemId = {
    ...dayState.completedByItemId,
    [itemId]: nowIso,
  };
  return {
    nextDayState: {
      ...dayState,
      completedByItemId,
      completedAt: computeMorningCompletedAt(
        items,
        completedByItemId,
        dayState.completedAt,
        nowIso,
      ),
    },
    changed: true,
    reason: "completed",
  };
}
