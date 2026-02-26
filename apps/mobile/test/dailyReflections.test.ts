import { describe, expect, it } from "vitest";
import {
  DAILY_REFLECTIONS_PENDING_WINDOW_MS,
  buildPendingDailyReflectionsCompletion,
  shouldCompletePendingDailyReflections,
} from "../lib/routines/dailyReflections";

describe("daily reflections pending completion", () => {
  it("creates pending payload with date key from started time", () => {
    const pending = buildPendingDailyReflectionsCompletion("read", Date.UTC(2026, 1, 26, 12, 0, 0));
    expect(pending.source).toBe("read");
    expect(pending.dateKey).toBe("2026-02-26");
  });

  it("completes when returning within window on same date", () => {
    const startedAtMs = Date.UTC(2026, 1, 26, 12, 0, 0);
    const pending = buildPendingDailyReflectionsCompletion("listen", startedAtMs);

    expect(
      shouldCompletePendingDailyReflections(
        pending,
        startedAtMs + DAILY_REFLECTIONS_PENDING_WINDOW_MS - 1,
        "2026-02-26",
      ),
    ).toBe(true);
  });

  it("does not complete outside time window", () => {
    const startedAtMs = Date.UTC(2026, 1, 26, 12, 0, 0);
    const pending = buildPendingDailyReflectionsCompletion("listen", startedAtMs);

    expect(
      shouldCompletePendingDailyReflections(
        pending,
        startedAtMs + DAILY_REFLECTIONS_PENDING_WINDOW_MS + 1,
        "2026-02-26",
      ),
    ).toBe(false);
  });

  it("does not complete after day rollover", () => {
    const startedAtMs = Date.UTC(2026, 1, 26, 23, 59, 0);
    const pending = buildPendingDailyReflectionsCompletion("read", startedAtMs);

    expect(shouldCompletePendingDailyReflections(pending, startedAtMs + 30_000, "2026-02-27")).toBe(
      false,
    );
  });
});
