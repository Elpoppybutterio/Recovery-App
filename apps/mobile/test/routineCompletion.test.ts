import { describe, expect, it } from "vitest";
import {
  completeMorningItemIfEnabled,
  computeMorningCompletedAt,
} from "../lib/routines/completion";
import type { MorningRoutineDayState, RoutineChecklistItem } from "../lib/routines/types";

const THIRD_STEP_PRAYER_ID = "prayer-third-step";

function createDayState(): MorningRoutineDayState {
  return {
    dateKey: "2026-02-26",
    completedByItemId: {},
    prayerOnKneesByItemId: {},
    notes: "",
    audioRefs: {},
    completedAt: null,
  };
}

function createItems(enabled: boolean): RoutineChecklistItem[] {
  return [
    {
      id: THIRD_STEP_PRAYER_ID,
      title: "3rd Step Prayer",
      enabled,
      voiceText: "3rd Step Prayer",
    },
    {
      id: "daily-reflections",
      title: "Daily Reflections",
      enabled: false,
    },
  ];
}

describe("morning routine completion", () => {
  it("marks 3rd Step Prayer complete when enabled", () => {
    const result = completeMorningItemIfEnabled(
      createDayState(),
      createItems(true),
      THIRD_STEP_PRAYER_ID,
      "2026-02-26T08:00:00.000Z",
    );

    expect(result.reason).toBe("completed");
    expect(result.changed).toBe(true);
    expect(result.nextDayState.completedByItemId[THIRD_STEP_PRAYER_ID]).toBe(
      "2026-02-26T08:00:00.000Z",
    );
  });

  it("does not mark complete when 3rd Step Prayer is disabled", () => {
    const result = completeMorningItemIfEnabled(
      createDayState(),
      createItems(false),
      THIRD_STEP_PRAYER_ID,
      "2026-02-26T08:00:00.000Z",
    );

    expect(result.reason).toBe("disabled");
    expect(result.changed).toBe(false);
    expect(result.nextDayState.completedByItemId[THIRD_STEP_PRAYER_ID]).toBeUndefined();
  });

  it("is idempotent for repeated completion actions", () => {
    const first = completeMorningItemIfEnabled(
      createDayState(),
      createItems(true),
      THIRD_STEP_PRAYER_ID,
      "2026-02-26T08:00:00.000Z",
    );

    const second = completeMorningItemIfEnabled(
      first.nextDayState,
      createItems(true),
      THIRD_STEP_PRAYER_ID,
      "2026-02-26T08:30:00.000Z",
    );

    expect(second.reason).toBe("already-complete");
    expect(second.changed).toBe(false);
    expect(second.nextDayState.completedByItemId[THIRD_STEP_PRAYER_ID]).toBe(
      "2026-02-26T08:00:00.000Z",
    );
  });

  it("computes completedAt only when all enabled items are complete", () => {
    const items: RoutineChecklistItem[] = [
      { id: "a", title: "A", enabled: true },
      { id: "b", title: "B", enabled: true },
      { id: "c", title: "C", enabled: false },
    ];
    expect(
      computeMorningCompletedAt(items, { a: "2026-02-26T08:00:00.000Z" }, null, "2026-02-26"),
    ).toBeNull();
    expect(
      computeMorningCompletedAt(
        items,
        { a: "2026-02-26T08:00:00.000Z", b: "2026-02-26T08:10:00.000Z" },
        null,
        "2026-02-26T08:10:00.000Z",
      ),
    ).toBe("2026-02-26T08:10:00.000Z");
  });

  it("marks Big Book reading complete when enabled", () => {
    const result = completeMorningItemIfEnabled(
      createDayState(),
      [{ id: "bb-86-88", title: "Big Book Reading #1: 86-88", enabled: true }],
      "bb-86-88",
      "2026-02-26T09:00:00.000Z",
    );

    expect(result.reason).toBe("completed");
    expect(result.nextDayState.completedByItemId["bb-86-88"]).toBe("2026-02-26T09:00:00.000Z");
  });
});
