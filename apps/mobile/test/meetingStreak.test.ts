import { describe, expect, it } from "vitest";
import {
  buildMeetingConsistencyTrend,
  computeMeetingConsistencyStreak,
} from "../lib/dashboard/meetingStreak";

describe("meeting consistency streak", () => {
  it("counts consecutive qualifying calendar weeks at 3 or more meetings", () => {
    const streak = computeMeetingConsistencyStreak(
      [
        "2026-03-17T18:00:00.000Z",
        "2026-03-18T18:00:00.000Z",
        "2026-03-20T18:00:00.000Z",
        "2026-03-10T18:00:00.000Z",
        "2026-03-12T18:00:00.000Z",
        "2026-03-14T18:00:00.000Z",
      ],
      new Date("2026-03-20T19:00:00.000Z").getTime(),
      3,
    );

    expect(streak).toBe(2);
  });

  it("resets the streak when the current week is below the threshold", () => {
    const streak = computeMeetingConsistencyStreak(
      [
        "2026-03-17T18:00:00.000Z",
        "2026-03-10T18:00:00.000Z",
        "2026-03-12T18:00:00.000Z",
        "2026-03-14T18:00:00.000Z",
      ],
      new Date("2026-03-20T19:00:00.000Z").getTime(),
      3,
    );

    expect(streak).toBe(0);
  });

  it("uses the most recent completed qualifying week when the current week has no meetings yet", () => {
    const streak = computeMeetingConsistencyStreak(
      [
        "2026-03-10T18:00:00.000Z",
        "2026-03-12T18:00:00.000Z",
        "2026-03-14T18:00:00.000Z",
        "2026-03-03T18:00:00.000Z",
        "2026-03-05T18:00:00.000Z",
        "2026-03-07T18:00:00.000Z",
      ],
      new Date("2026-03-16T12:00:00.000Z").getTime(),
      3,
    );

    expect(streak).toBe(2);
  });

  it("returns zero when no qualifying weeks exist", () => {
    const streak = computeMeetingConsistencyStreak(
      ["2026-03-17T18:00:00.000Z", "2026-03-18T18:00:00.000Z"],
      new Date("2026-03-20T19:00:00.000Z").getTime(),
      3,
    );

    expect(streak).toBe(0);
  });

  it("builds a six-week trend ordered from oldest to newest week", () => {
    const trend = buildMeetingConsistencyTrend(
      [
        "2026-02-17T18:00:00.000Z",
        "2026-02-24T18:00:00.000Z",
        "2026-02-25T18:00:00.000Z",
        "2026-03-03T18:00:00.000Z",
        "2026-03-05T18:00:00.000Z",
        "2026-03-07T18:00:00.000Z",
        "2026-03-17T18:00:00.000Z",
        "2026-03-18T18:00:00.000Z",
        "2026-03-20T18:00:00.000Z",
      ],
      new Date("2026-03-20T19:00:00.000Z").getTime(),
      6,
    );

    expect(trend).toEqual([0, 1, 2, 3, 0, 3]);
  });
});
