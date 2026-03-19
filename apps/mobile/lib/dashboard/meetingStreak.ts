function startOfWeekMonday(date: Date): Date {
  const next = new Date(date);
  const day = next.getDay();
  const offset = (day + 6) % 7;
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - offset);
  return next;
}

function weekKey(date: Date): string {
  const weekStart = startOfWeekMonday(date);
  return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
}

export function buildMeetingConsistencyTrend(
  attendedAtIsos: string[],
  nowMs: number,
  weeks = 6,
): number[] {
  if (weeks <= 0) {
    return [];
  }

  const countsByWeek = new Map<string, number>();
  for (const iso of attendedAtIsos) {
    const at = new Date(iso);
    const atMs = at.getTime();
    if (!Number.isFinite(atMs)) {
      continue;
    }
    const key = weekKey(at);
    countsByWeek.set(key, (countsByWeek.get(key) ?? 0) + 1);
  }

  const latestWeek = startOfWeekMonday(new Date(nowMs));
  const result: number[] = [];
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const cursor = new Date(latestWeek);
    cursor.setDate(cursor.getDate() - index * 7);
    result.push(countsByWeek.get(weekKey(cursor)) ?? 0);
  }
  return result;
}

export function computeMeetingConsistencyStreak(
  attendedAtIsos: string[],
  nowMs: number,
  qualifyingMeetingsPerWeek = 3,
): number {
  if (attendedAtIsos.length === 0) {
    return 0;
  }

  const countsByWeek = new Map<string, number>();
  for (const iso of attendedAtIsos) {
    const at = new Date(iso);
    const atMs = at.getTime();
    if (!Number.isFinite(atMs)) {
      continue;
    }
    const key = weekKey(at);
    countsByWeek.set(key, (countsByWeek.get(key) ?? 0) + 1);
  }

  let streak = 0;
  const currentWeekStart = startOfWeekMonday(new Date(nowMs));
  let cursor = currentWeekStart;
  for (;;) {
    const key = weekKey(cursor);
    const count = countsByWeek.get(key) ?? 0;
    if (count >= qualifyingMeetingsPerWeek) {
      streak += 1;
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() - 7);
      continue;
    }
    break;
  }

  if (streak > 0) {
    return streak;
  }

  const currentWeekKey = weekKey(currentWeekStart);
  const currentWeekCount = countsByWeek.get(currentWeekKey) ?? 0;
  const currentWeekHasProgress = currentWeekCount > 0;
  if (currentWeekHasProgress) {
    return 0;
  }

  const previousWeek = new Date(currentWeekStart);
  previousWeek.setDate(previousWeek.getDate() - 7);
  cursor = previousWeek;

  for (;;) {
    const key = weekKey(cursor);
    const count = countsByWeek.get(key) ?? 0;
    if (count >= qualifyingMeetingsPerWeek) {
      streak += 1;
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() - 7);
      continue;
    }
    break;
  }

  return streak;
}
