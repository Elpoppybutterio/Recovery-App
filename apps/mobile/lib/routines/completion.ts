import type { MorningRoutineDayState, RoutineChecklistItem } from "./types";

export type MorningCompletionResult = {
  nextDayState: MorningRoutineDayState;
  changed: boolean;
  reason: "completed" | "disabled" | "already-complete";
};

export function computeMorningCompletedAt(
  items: RoutineChecklistItem[],
  completedByItemId: Record<string, string> | null | undefined,
  previousCompletedAt: string | null,
  nowIso: string,
): string | null {
  const enabledItemIds = new Set(items.filter((item) => item.enabled).map((item) => item.id));
  if (enabledItemIds.size === 0) {
    return null;
  }
  const safeCompletedByItemId =
    completedByItemId && typeof completedByItemId === "object" ? completedByItemId : {};
  const completedEnabledCount = Object.keys(safeCompletedByItemId).filter((itemId) =>
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
  const existingCompletedByItemId =
    dayState.completedByItemId && typeof dayState.completedByItemId === "object"
      ? dayState.completedByItemId
      : {};
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item?.enabled) {
    return {
      nextDayState: dayState,
      changed: false,
      reason: "disabled",
    };
  }

  if (existingCompletedByItemId[itemId]) {
    return {
      nextDayState: dayState,
      changed: false,
      reason: "already-complete",
    };
  }

  const completedByItemId = {
    ...existingCompletedByItemId,
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
