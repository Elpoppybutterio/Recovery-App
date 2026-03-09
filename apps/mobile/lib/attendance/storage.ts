import AsyncStorage from "@react-native-async-storage/async-storage";

export type AttendanceRecordSummary = {
  id: string;
  meetingId: string;
  startAt: string;
  inactive?: boolean;
};

export type MeetingAttendanceLogRecord = {
  id: string;
  meetingId: string;
  atIso: string;
  method: "manual" | "arrivalPrompt" | "verified";
};

const ATTENDANCE_STORAGE_KEY_PREFIX = "recovery:verifiedAttendance:";
const MEETING_ATTENDANCE_LOG_STORAGE_KEY_PREFIX = "recovery:meetingsCompleted:";

export function attendanceStorageKey(userId: string): string {
  return `${ATTENDANCE_STORAGE_KEY_PREFIX}${userId}`;
}

export function meetingAttendanceLogStorageKey(userId: string): string {
  return `${MEETING_ATTENDANCE_LOG_STORAGE_KEY_PREFIX}${userId}`;
}

function asAttendanceRecords(value: unknown): AttendanceRecordSummary[] {
  return Array.isArray(value)
    ? (value.filter((entry) => entry && typeof entry === "object") as AttendanceRecordSummary[])
    : [];
}

function asMeetingAttendanceLogs(value: unknown): MeetingAttendanceLogRecord[] {
  return Array.isArray(value)
    ? (value.filter((entry) => entry && typeof entry === "object") as MeetingAttendanceLogRecord[])
    : [];
}

export async function loadAttendanceRecords(userId: string): Promise<AttendanceRecordSummary[]> {
  try {
    const raw = await AsyncStorage.getItem(attendanceStorageKey(userId));
    return raw ? asAttendanceRecords(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export async function loadMeetingAttendanceLogs(
  userId: string,
): Promise<MeetingAttendanceLogRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(meetingAttendanceLogStorageKey(userId));
    return raw ? asMeetingAttendanceLogs(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}
