import { dateKeyForRoutines } from "./storage";

export const DAILY_REFLECTIONS_ITEM_ID = "daily-reflections";
export const DAILY_REFLECTIONS_URL = "https://www.aa.org/daily-reflections";
export const DAILY_REFLECTIONS_PENDING_WINDOW_MS = 10 * 60 * 1000;
export const DAILY_REFLECTIONS_MIN_DWELL_MS = 20 * 1000;

export type DailyReflectionsSource = "read" | "listen";

export type PendingDailyReflectionsCompletion = {
  dateKey: string;
  startedAtMs: number;
  source: DailyReflectionsSource;
};

export function buildPendingDailyReflectionsCompletion(
  source: DailyReflectionsSource,
  startedAtMs: number,
): PendingDailyReflectionsCompletion {
  return {
    source,
    startedAtMs,
    dateKey: dateKeyForRoutines(new Date(startedAtMs)),
  };
}

export function shouldCompletePendingDailyReflections(
  pending: PendingDailyReflectionsCompletion,
  nowMs: number,
  currentDateKey: string,
  maxWindowMs: number = DAILY_REFLECTIONS_PENDING_WINDOW_MS,
  minDwellMs: number = DAILY_REFLECTIONS_MIN_DWELL_MS,
): boolean {
  if (pending.dateKey !== currentDateKey) {
    return false;
  }
  const elapsedMs = nowMs - pending.startedAtMs;
  if (elapsedMs < minDwellMs || elapsedMs > maxWindowMs) {
    return false;
  }
  return true;
}
