export type HomeGroupBirthdayConfig = {
  homeGroupActive: boolean;
  homeGroupKey: string | null;
  homeGroupName: string | null;
  birthdaysEnabled: boolean;
  firstName: string;
  lastName: string;
  sobrietyDateIso: string | null;
};

export type HomeGroupBirthdayAnnouncement = {
  dedupeToken: string;
  displayName: string;
  anniversaryYears: number;
};

export function buildHomeGroupBirthdayDisplayName(input: {
  firstName: string | null;
  lastName: string | null;
}): string {
  const firstName = input.firstName?.trim() ?? "";
  const lastName = input.lastName?.trim() ?? "";
  if (!firstName) {
    return "";
  }
  return lastName ? `${firstName} ${lastName}` : firstName;
}

function parseIsoDateParts(value: string): { year: number; month: number; day: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return { year, month, day };
}

function isLeapYear(year: number): boolean {
  if (year % 400 === 0) {
    return true;
  }
  if (year % 100 === 0) {
    return false;
  }
  return year % 4 === 0;
}

function anniversaryMonthDay(parts: { month: number; day: number }, targetYear: number): string {
  if (parts.month === 2 && parts.day === 29 && !isLeapYear(targetYear)) {
    return "02-28";
  }
  return `${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function isSobrietyBirthdayOnDate(
  sobrietyDateIso: string | null,
  todayIso: string | null,
): boolean {
  const sobrietyParts = sobrietyDateIso ? parseIsoDateParts(sobrietyDateIso) : null;
  const todayParts = todayIso ? parseIsoDateParts(todayIso) : null;
  if (!sobrietyParts || !todayParts) {
    return false;
  }

  return (
    anniversaryMonthDay(sobrietyParts, todayParts.year) ===
    anniversaryMonthDay(todayParts, todayParts.year)
  );
}

export function getSobrietyBirthdayYears(
  sobrietyDateIso: string | null,
  todayIso: string | null,
): number | null {
  const sobrietyParts = sobrietyDateIso ? parseIsoDateParts(sobrietyDateIso) : null;
  const todayParts = todayIso ? parseIsoDateParts(todayIso) : null;
  if (!sobrietyParts || !todayParts) {
    return null;
  }

  if (!isSobrietyBirthdayOnDate(sobrietyDateIso, todayIso)) {
    return null;
  }

  const years = todayParts.year - sobrietyParts.year;
  return years >= 1 ? years : null;
}

export function buildHomeGroupBirthdayAnnouncementKey(input: {
  homeGroupKey: string;
  todayIso: string;
  celebrantTokens: string[];
}): string {
  return [
    "home-group-birthday",
    input.homeGroupKey,
    input.todayIso,
    [...input.celebrantTokens].sort().join(","),
  ].join(":");
}

export function buildHomeGroupBirthdayAnnouncementMessage(
  announcements: HomeGroupBirthdayAnnouncement[],
): string {
  if (announcements.length === 0) {
    return "Someone in your home group is celebrating a sobriety birthday today.";
  }

  if (announcements.length === 1) {
    const celebrant = announcements[0];
    const yearLabel =
      celebrant.anniversaryYears === 1
        ? "1 year sober"
        : `${celebrant.anniversaryYears} years sober`;
    return `${celebrant.displayName} in your home group is celebrating ${yearLabel} today.`;
  }

  const names = announcements.map((announcement) => announcement.displayName);
  const lead =
    names.length === 2
      ? `${names[0]} and ${names[1]}`
      : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  return `${lead} in your home group are celebrating sobriety birthdays today.`;
}
