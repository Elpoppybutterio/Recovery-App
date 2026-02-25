import { createEmptyMorningRoutineDayState, createEmptyNightlyInventoryDayState } from "./defaults";
import { dateKeyForRoutines } from "./storage";
import type {
  MorningRoutineStats,
  NightlyInventoryStats,
  RecoveryRoutinesStore,
  RoutineInsights,
} from "./types";

function getDayWindow(date: Date, days: number): string[] {
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    keys.push(dateKeyForRoutines(new Date(date.getTime() - offset * 86_400_000)));
  }
  return keys;
}

function issueCountForNightlyDay(
  day: ReturnType<typeof createEmptyNightlyInventoryDayState>,
): number {
  return (
    day.resentful.length +
    day.selfish.length +
    day.dishonest.length +
    day.afraid.length +
    day.apology.length
  );
}

function countEnabledCompletions(
  completedByItemId: Record<string, string>,
  enabledItemIds: Set<string>,
): number {
  return Object.keys(completedByItemId).filter((itemId) => enabledItemIds.has(itemId)).length;
}

function isMorningComplete(
  completedByItemId: Record<string, string>,
  enabledItemIds: Set<string>,
): boolean {
  const totalCount = enabledItemIds.size;
  return totalCount > 0 && countEnabledCompletions(completedByItemId, enabledItemIds) >= totalCount;
}

export function computeMorningRoutineStats(
  store: RecoveryRoutinesStore,
  today: Date,
): MorningRoutineStats {
  const todayKey = dateKeyForRoutines(today);
  const todayDay = store.morningByDate[todayKey] ?? createEmptyMorningRoutineDayState(todayKey);
  const enabledItemIds = new Set(
    store.morningTemplate.items.filter((item) => item.enabled).map((item) => item.id),
  );
  const total = enabledItemIds.size;
  const todayCount = countEnabledCompletions(todayDay.completedByItemId, enabledItemIds);

  let streak = 0;
  for (let offset = 0; offset < 365; offset += 1) {
    const key = dateKeyForRoutines(new Date(today.getTime() - offset * 86_400_000));
    const day = store.morningByDate[key] ?? createEmptyMorningRoutineDayState(key);
    if (!isMorningComplete(day.completedByItemId, enabledItemIds)) {
      break;
    }
    streak += 1;
  }

  const last30Keys = getDayWindow(today, 30);
  const completeDays = last30Keys.filter((key) => {
    const day = store.morningByDate[key] ?? createEmptyMorningRoutineDayState(key);
    return isMorningComplete(day.completedByItemId, enabledItemIds);
  }).length;

  return {
    streakDays: streak,
    last30CompletionPct: Math.round((completeDays / 30) * 100),
    todayCompletedCount: todayCount,
    todayTotalCount: total,
  };
}

export function computeNightlyInventoryStats(
  store: RecoveryRoutinesStore,
  today: Date,
): NightlyInventoryStats {
  const todayKey = dateKeyForRoutines(today);
  const day = store.nightlyByDate[todayKey] ?? createEmptyNightlyInventoryDayState(todayKey);

  return {
    todayCompleted: Boolean(day.completedAt),
    todayIssueCount: issueCountForNightlyDay(day),
  };
}

export function computeRoutineInsights(store: RecoveryRoutinesStore, today: Date): RoutineInsights {
  const last30Keys = getDayWindow(today, 30);
  const enabledItemIds = new Set(
    store.morningTemplate.items.filter((item) => item.enabled).map((item) => item.id),
  );

  let completeIssueTotal = 0;
  let completeDays = 0;
  let missedIssueTotal = 0;
  let missedDays = 0;

  for (const key of last30Keys) {
    const morning = store.morningByDate[key] ?? createEmptyMorningRoutineDayState(key);
    const nightly = store.nightlyByDate[key] ?? createEmptyNightlyInventoryDayState(key);
    const issues = issueCountForNightlyDay(nightly);

    if (isMorningComplete(morning.completedByItemId, enabledItemIds)) {
      completeIssueTotal += issues;
      completeDays += 1;
    } else {
      missedIssueTotal += issues;
      missedDays += 1;
    }
  }

  const avgComplete = completeDays > 0 ? completeIssueTotal / completeDays : 0;
  const avgMissed = missedDays > 0 ? missedIssueTotal / missedDays : 0;
  const diff = avgMissed - avgComplete;
  const trend: RoutineInsights["trend"] = diff > 0.25 ? "down" : diff < -0.25 ? "up" : "flat";

  return {
    averageIssuesOnMorningCompleteDays: Number(avgComplete.toFixed(2)),
    averageIssuesOnMorningIncompleteDays: Number(avgMissed.toFixed(2)),
    trend,
  };
}
