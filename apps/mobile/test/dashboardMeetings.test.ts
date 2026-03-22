import { describe, expect, it } from "vitest";
import {
  ONLINE_MEETING_DIRECTORY_URL,
  pickOnlineMeetingNow,
  sliceDashboardMeetingsPreview,
} from "../lib/meetings/dashboard";

describe("dashboard meetings helpers", () => {
  it("prefers an in-progress online meeting before a later upcoming one", () => {
    const meeting = pickOnlineMeetingNow(
      [
        { startsAtLocal: "18:30", onlineUrl: "https://example.com/later" },
        { startsAtLocal: "17:30", onlineUrl: "https://example.com/live" },
      ],
      18 * 60,
    );

    expect(meeting?.onlineUrl).toBe("https://example.com/live");
  });

  it("falls forward to the next online meeting when none are in progress", () => {
    const meeting = pickOnlineMeetingNow(
      [
        { startsAtLocal: "07:00", onlineUrl: "https://example.com/past" },
        { startsAtLocal: "19:30", onlineUrl: "https://example.com/next" },
      ],
      18 * 60,
    );

    expect(meeting?.onlineUrl).toBe("https://example.com/next");
  });

  it("returns null when no online url is available", () => {
    expect(
      pickOnlineMeetingNow(
        [{ startsAtLocal: "19:00", onlineUrl: null }, { startsAtLocal: "20:00" }],
        18 * 60,
      ),
    ).toBeNull();
  });

  it("defaults the dashboard preview to the next meeting and expands to five", () => {
    const meetings = [1, 2, 3, 4, 5, 6];

    expect(sliceDashboardMeetingsPreview(meetings, false)).toEqual([1]);
    expect(sliceDashboardMeetingsPreview(meetings, true)).toEqual([1, 2, 3, 4, 5]);
  });

  it("uses the official online aa directory as the fallback url", () => {
    expect(ONLINE_MEETING_DIRECTORY_URL).toBe("https://aa-intergroup.org/meetings/");
  });
});
