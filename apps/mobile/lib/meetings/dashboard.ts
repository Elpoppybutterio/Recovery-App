export const ONLINE_MEETING_DIRECTORY_URL = "https://aa-intergroup.org/meetings/";

type DashboardMeetingLike = {
  startsAtLocal: string;
  onlineUrl?: string | null;
};

function parseMinutesFromHhmm(value: string): number {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return 0;
  }
  return hour * 60 + minute;
}

function isMeetingInProgress(startsAtLocal: string, nowMinutes: number): boolean {
  const startMinutes = parseMinutesFromHhmm(startsAtLocal);
  const endMinutes = startMinutes + 60;
  return nowMinutes >= startMinutes && nowMinutes < endMinutes;
}

function isMeetingUpcomingOrInProgress(startsAtLocal: string, nowMinutes: number): boolean {
  const startMinutes = parseMinutesFromHhmm(startsAtLocal);
  const endMinutes = startMinutes + 60;
  return endMinutes > nowMinutes;
}

export function pickOnlineMeetingNow<T extends DashboardMeetingLike>(
  meetings: T[],
  nowMinutes: number,
): T | null {
  const withUrls = meetings.filter(
    (meeting): meeting is T & { onlineUrl: string } =>
      typeof meeting.onlineUrl === "string" && meeting.onlineUrl.trim().length > 0,
  );

  const inProgress = withUrls.find((meeting) =>
    isMeetingInProgress(meeting.startsAtLocal, nowMinutes),
  );
  if (inProgress) {
    return inProgress;
  }

  const upcoming = withUrls.find((meeting) =>
    isMeetingUpcomingOrInProgress(meeting.startsAtLocal, nowMinutes),
  );
  return upcoming ?? withUrls[0] ?? null;
}

export function sliceDashboardMeetingsPreview<T>(meetings: T[], expanded: boolean): T[] {
  return expanded ? meetings.slice(0, 5) : meetings.slice(0, 1);
}
