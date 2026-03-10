export type MonthlyWindow = {
  monthKey: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  startDate: Date;
  endExclusiveDate: Date;
};

export type MonthlyWeekWindow = {
  key: string;
  startDate: Date;
  endExclusiveDate: Date;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function currentMonthKey(nowIso = new Date().toISOString()): string {
  return monthKeyFromDate(new Date(nowIso));
}

export function buildMonthlyWindow(monthKey: string): MonthlyWindow {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    throw new Error(`Invalid month key: ${monthKey}`);
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const startDate = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const endExclusiveDate = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);
  return {
    monthKey,
    label: startDate.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    periodStart: startDate.toISOString(),
    periodEnd: endExclusiveDate.toISOString(),
    startDate,
    endExclusiveDate,
  };
}

export function enumerateMonthDays(window: MonthlyWindow): Date[] {
  const days: Date[] = [];
  const cursor = new Date(window.startDate);
  while (cursor < window.endExclusiveDate) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function enumerateMonthWeeks(window: MonthlyWindow): MonthlyWeekWindow[] {
  const start = new Date(window.startDate);
  start.setHours(0, 0, 0, 0);
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);

  const weeks: MonthlyWeekWindow[] = [];
  const cursor = new Date(start);
  while (cursor < window.endExclusiveDate) {
    const endExclusiveDate = new Date(cursor);
    endExclusiveDate.setDate(endExclusiveDate.getDate() + 7);
    weeks.push({
      key: `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`,
      startDate: new Date(cursor),
      endExclusiveDate,
    });
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

export function toTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function isTimestampInWindow(
  value: string | null | undefined,
  window: MonthlyWindow,
): boolean {
  const timestamp = toTimestamp(value);
  return (
    timestamp !== null &&
    timestamp >= window.startDate.getTime() &&
    timestamp < window.endExclusiveDate.getTime()
  );
}

export function clampStartToWindow(
  startAt: string | null | undefined,
  window: MonthlyWindow,
): Date {
  const parsed = startAt ? new Date(startAt) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed < window.startDate) {
    return new Date(window.startDate);
  }
  return parsed;
}
