import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  attendanceStorageKey,
  loadAttendanceRecords,
  loadMeetingAttendanceLogs,
  meetingAttendanceLogStorageKey,
  saveAttendanceRecords,
  saveMeetingAttendanceLogs,
} from "../lib/attendance/storage";

const { storage } = vi.hoisted(() => ({
  storage: {
    getItem: vi.fn<(_: string) => Promise<string | null>>(),
    setItem: vi.fn<(_: string, __: string) => Promise<void>>(),
  },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: storage,
}));

describe("attendance storage", () => {
  beforeEach(() => {
    storage.getItem.mockReset();
    storage.setItem.mockReset();
  });

  it("persists and reloads attendance records for export/detail hydration", async () => {
    const records = [
      {
        id: "attendance-1",
        meetingId: "meeting-1",
        startAt: "2026-04-17T12:00:00.000Z",
        inactive: false,
      },
    ];
    storage.getItem.mockResolvedValueOnce(JSON.stringify(records));

    await saveAttendanceRecords("resident-user", records);
    const loaded = await loadAttendanceRecords("resident-user");

    expect(storage.setItem).toHaveBeenCalledWith(
      attendanceStorageKey("resident-user"),
      JSON.stringify(records),
    );
    expect(loaded).toEqual(records);
  });

  it("persists and reloads meeting attendance logs for dashboard fallback hydration", async () => {
    const logs = [
      {
        id: "log-1",
        meetingId: "meeting-1",
        atIso: "2026-04-17T13:00:00.000Z",
        method: "verified" as const,
      },
    ];
    storage.getItem.mockResolvedValueOnce(JSON.stringify(logs));

    await saveMeetingAttendanceLogs("resident-user", logs);
    const loaded = await loadMeetingAttendanceLogs("resident-user");

    expect(storage.setItem).toHaveBeenCalledWith(
      meetingAttendanceLogStorageKey("resident-user"),
      JSON.stringify(logs),
    );
    expect(loaded).toEqual(logs);
  });
});
