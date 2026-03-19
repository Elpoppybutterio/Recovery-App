export type RecoveryMilestone = {
  id: string;
  label: string;
  coinLabel: string;
  milestoneDateIso: string;
  at: Date;
  kind: "days" | "months" | "years";
  value: number;
};

export type RecoveryMilestoneTileSummary = {
  id: string;
  label: string;
  coinLabel: string;
  milestoneDateIso: string;
  atIso: string;
  daysRemaining: number;
  isToday: boolean;
  heading: string;
  detail: string;
  supportiveText: string;
  celebrationKey: string;
};

export type RecoveryMilestoneRoadmapEntry = {
  id: string;
  label: string;
  coinLabel: string;
  milestoneDateIso: string;
  status: "achieved" | "today" | "upcoming";
  daysDelta: number;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

const RECOVERY_MILESTONE_YEARS_AHEAD = 50;

function parseDateParts(value: string | null): DateParts | null {
  if (!value) {
    return null;
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const utcMs = Date.UTC(year, month - 1, day);
  const probe = new Date(utcMs);
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function formatDatePartsIso(parts: DateParts): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function datePartsToUtcMs(parts: DateParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function datePartsToLocalNoon(parts: DateParts): Date {
  return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
}

function todayDateParts(nowMs: number): DateParts {
  const now = new Date(nowMs);
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

function addDaysToDateParts(parts: DateParts, days: number): DateParts {
  const next = new Date(datePartsToUtcMs(parts));
  next.setUTCDate(next.getUTCDate() + days);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonthsClamped(parts: DateParts, months: number): DateParts {
  const absoluteMonth = parts.month - 1 + months;
  const year = parts.year + Math.floor(absoluteMonth / 12);
  const monthIndex = ((absoluteMonth % 12) + 12) % 12;
  const month = monthIndex + 1;
  const day = Math.min(parts.day, daysInMonth(year, month));
  return { year, month, day };
}

function pluralize(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function createSobrietyDateAtNoon(dateIso: string): Date | null {
  const parts = parseDateParts(dateIso);
  return parts ? datePartsToLocalNoon(parts) : null;
}

export function getDaysSober(dateIso: string | null, nowMs: number): number {
  const start = parseDateParts(dateIso);
  if (!start) {
    return 0;
  }
  const today = todayDateParts(nowMs);
  const diffDays = Math.floor((datePartsToUtcMs(today) - datePartsToUtcMs(start)) / 86_400_000);
  return Math.max(0, diffDays);
}

function buildRecoveryBenchmarks(dateIso: string): RecoveryMilestone[] {
  const start = parseDateParts(dateIso);
  if (!start) {
    return [];
  }

  const thirtyDays = addDaysToDateParts(start, 30);
  const sixtyDays = addDaysToDateParts(start, 60);
  const ninetyDays = addDaysToDateParts(start, 90);
  const milestones: RecoveryMilestone[] = [
    {
      id: "30D",
      label: "30 Days",
      coinLabel: "30",
      kind: "days",
      value: 30,
      at: datePartsToLocalNoon(thirtyDays),
      milestoneDateIso: formatDatePartsIso(thirtyDays),
    },
    {
      id: "60D",
      label: "60 Days",
      coinLabel: "60",
      kind: "days",
      value: 60,
      at: datePartsToLocalNoon(sixtyDays),
      milestoneDateIso: formatDatePartsIso(sixtyDays),
    },
    {
      id: "90D",
      label: "90 Days",
      coinLabel: "90",
      kind: "days",
      value: 90,
      at: datePartsToLocalNoon(ninetyDays),
      milestoneDateIso: formatDatePartsIso(ninetyDays),
    },
  ];

  for (const monthValue of [6, 9, 12]) {
    const next = addMonthsClamped(start, monthValue);
    milestones.push({
      id: monthValue === 12 ? "1Y" : `${monthValue}M`,
      label: monthValue === 12 ? "1 Year" : `${monthValue} Months`,
      coinLabel: monthValue === 12 ? "1Y" : `${monthValue}M`,
      kind: monthValue === 12 ? "years" : "months",
      value: monthValue === 12 ? 1 : monthValue,
      at: datePartsToLocalNoon(next),
      milestoneDateIso: formatDatePartsIso(next),
    });
  }

  for (let yearValue = 2; yearValue <= RECOVERY_MILESTONE_YEARS_AHEAD; yearValue += 1) {
    const next = addMonthsClamped(start, yearValue * 12);
    milestones.push({
      id: `${yearValue}Y`,
      label: `${yearValue} Years`,
      coinLabel: `${yearValue}Y`,
      kind: "years",
      value: yearValue,
      at: datePartsToLocalNoon(next),
      milestoneDateIso: formatDatePartsIso(next),
    });
  }

  return milestones;
}

export function buildSobrietyMilestones(dateIso: string): RecoveryMilestone[] {
  return buildRecoveryBenchmarks(dateIso).filter((milestone) =>
    ["30D", "60D", "90D", "6M", "9M", "1Y"].includes(milestone.id),
  );
}

export function getExactRecoveryMilestone(
  dateIso: string | null,
  nowMs: number,
): RecoveryMilestone | null {
  if (!dateIso) {
    return null;
  }
  const todayIso = formatDatePartsIso(todayDateParts(nowMs));
  return (
    buildRecoveryBenchmarks(dateIso).find((milestone) => milestone.milestoneDateIso === todayIso) ??
    null
  );
}

export function getNextRecoveryMilestone(
  dateIso: string | null,
  nowMs: number,
): RecoveryMilestone | null {
  if (!dateIso) {
    return null;
  }
  const todayMs = datePartsToUtcMs(todayDateParts(nowMs));
  return (
    buildRecoveryBenchmarks(dateIso).find(
      (milestone) =>
        datePartsToUtcMs(parseDateParts(milestone.milestoneDateIso) as DateParts) >= todayMs,
    ) ?? null
  );
}

export function buildRecoveryMilestoneTileSummary(
  dateIso: string | null,
  nowMs: number,
): RecoveryMilestoneTileSummary | null {
  const milestone =
    getExactRecoveryMilestone(dateIso, nowMs) ?? getNextRecoveryMilestone(dateIso, nowMs);
  if (!milestone) {
    return null;
  }

  const todayMs = datePartsToUtcMs(todayDateParts(nowMs));
  const milestoneMs = datePartsToUtcMs(parseDateParts(milestone.milestoneDateIso) as DateParts);
  const daysRemaining = Math.max(0, Math.round((milestoneMs - todayMs) / 86_400_000));
  const isToday = daysRemaining === 0;

  return {
    id: milestone.id,
    label: milestone.label,
    coinLabel: milestone.coinLabel,
    milestoneDateIso: milestone.milestoneDateIso,
    atIso: milestone.at.toISOString(),
    daysRemaining,
    isToday,
    heading: isToday ? "Recovery Milestone Today" : "Next Recovery Milestone",
    detail: isToday
      ? `Today marks your ${milestone.label.toLowerCase()} recovery milestone.`
      : `${pluralize(daysRemaining, "day", "days")} left until your ${milestone.label.toLowerCase()} coin.`,
    supportiveText: isToday
      ? "Honor the win, stay grateful, and keep working the next right day."
      : "Keep stacking one day at a time. Your next benchmark is already in motion.",
    celebrationKey: `${milestone.id}:${milestone.milestoneDateIso}`,
  };
}

export function buildRecoveryMilestoneRoadmap(
  dateIso: string | null,
  nowMs: number,
  upcomingCount = 6,
): RecoveryMilestoneRoadmapEntry[] {
  if (!dateIso) {
    return [];
  }

  const todayMs = datePartsToUtcMs(todayDateParts(nowMs));
  const benchmarks = buildRecoveryBenchmarks(dateIso);
  const achieved: RecoveryMilestoneRoadmapEntry[] = [];
  const future: RecoveryMilestoneRoadmapEntry[] = [];

  for (const milestone of benchmarks) {
    const milestoneMs = datePartsToUtcMs(parseDateParts(milestone.milestoneDateIso) as DateParts);
    const daysDelta = Math.round((milestoneMs - todayMs) / 86_400_000);
    const status = daysDelta < 0 ? "achieved" : daysDelta === 0 ? "today" : "upcoming";
    const entry: RecoveryMilestoneRoadmapEntry = {
      id: milestone.id,
      label: milestone.label,
      coinLabel: milestone.coinLabel,
      milestoneDateIso: milestone.milestoneDateIso,
      status,
      daysDelta,
    };
    if (status === "achieved") {
      achieved.push(entry);
    } else {
      future.push(entry);
    }
  }

  return [...achieved, ...future.slice(0, upcomingCount)];
}
