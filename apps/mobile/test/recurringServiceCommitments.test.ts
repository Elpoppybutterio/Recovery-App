import { describe, expect, it } from "vitest";
import {
  buildRecurringServiceCommitmentFromDraft,
  buildRecurringServiceCommitmentSummary,
  createDefaultRecurringServiceCommitmentDraft,
  createRecurringServiceCommitmentDraftFromItem,
  hasUnsavedRecurringServiceCommitmentDraftChanges,
  normalizeRecurringServiceCommitments,
  RECURRING_SERVICE_COMMITMENTS_STEP_COPY,
  removeRecurringServiceCommitment,
  type RecurringServiceCommitmentDraft,
  upsertRecurringServiceCommitment,
} from "../lib/recurringServiceCommitments";

describe("recurring service commitments", () => {
  it("exposes the recurring service commitments wizard copy and field labels", () => {
    expect(RECURRING_SERVICE_COMMITMENTS_STEP_COPY.title).toBe("Recurring Service Commitments");
    expect(RECURRING_SERVICE_COMMITMENTS_STEP_COPY.labels.name).toBe("Commitment name");
    expect(RECURRING_SERVICE_COMMITMENTS_STEP_COPY.labels.type).toBe("Commitment type");
    expect(RECURRING_SERVICE_COMMITMENTS_STEP_COPY.labels.startsAt).toBe("Starts at");
  });

  it("builds a weekly recurring commitment", () => {
    const draft: RecurringServiceCommitmentDraft = {
      ...createDefaultRecurringServiceCommitmentDraft(),
      name: "Greeter every Thursday",
      type: "GREETER" as const,
      startsAtLocal: "18:30",
      weeklyDays: ["THU"],
      arriveEarlyMinutes: "15",
    };

    const commitment = buildRecurringServiceCommitmentFromDraft({
      id: "commitment-1",
      draft,
    });

    expect(commitment.recurrence).toEqual({ kind: "WEEKLY", days: ["THU"] });
    expect(commitment.arriveEarlyMinutes).toBe(15);
    expect(buildRecurringServiceCommitmentSummary(commitment)).toContain("Thu");
  });

  it("builds a monthly ordinal recurring commitment", () => {
    const draft: RecurringServiceCommitmentDraft = {
      ...createDefaultRecurringServiceCommitmentDraft(),
      name: "Intergroup",
      type: "INTERGROUP" as const,
      startsAtLocal: "09:00",
      recurrenceKind: "MONTHLY_ORDINAL" as const,
      monthlyOrdinal: 1 as const,
      monthlyDay: "SAT" as const,
    };

    const commitment = buildRecurringServiceCommitmentFromDraft({
      id: "commitment-2",
      draft,
    });

    expect(commitment.recurrence).toEqual({
      kind: "MONTHLY_ORDINAL",
      ordinal: 1,
      day: "SAT",
    });
    expect(buildRecurringServiceCommitmentSummary(commitment)).toContain("First Sat");
  });

  it("edits an existing commitment without truncating fields", () => {
    const initial = buildRecurringServiceCommitmentFromDraft({
      id: "commitment-3",
      draft: {
        ...createDefaultRecurringServiceCommitmentDraft(),
        name: "Close Tuesday meeting",
        startsAtLocal: "20:00",
        stayAfterMinutes: "30",
        weeklyDays: ["TUE"],
      },
    });

    const editedDraft = {
      ...createRecurringServiceCommitmentDraftFromItem(initial),
      name: "Close Tuesday meeting and bookstore duty",
      location: "Fellowship Hall",
    };
    const edited = buildRecurringServiceCommitmentFromDraft({
      id: initial.id,
      draft: editedDraft,
      existing: {
        ...initial,
        calendarEventId: "calendar-event-1",
        calendarSeriesId: "calendar-series-1",
        calendarSyncFingerprint: "fingerprint-1",
      },
    });

    const result = upsertRecurringServiceCommitment([initial], edited);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Close Tuesday meeting and bookstore duty");
    expect(result[0]?.location).toBe("Fellowship Hall");
    expect(result[0]?.calendarEventId).toBe("calendar-event-1");
    expect(result[0]?.calendarSeriesId).toBe("calendar-series-1");
    expect(result[0]?.calendarSyncFingerprint).toBe("fingerprint-1");
  });

  it("deletes an existing commitment", () => {
    const commitmentA = buildRecurringServiceCommitmentFromDraft({
      id: "commitment-a",
      draft: {
        ...createDefaultRecurringServiceCommitmentDraft(),
        name: "Greeter",
        startsAtLocal: "18:00",
      },
    });
    const commitmentB = buildRecurringServiceCommitmentFromDraft({
      id: "commitment-b",
      draft: {
        ...createDefaultRecurringServiceCommitmentDraft(),
        name: "Cleanup",
        startsAtLocal: "20:00",
      },
    });

    expect(removeRecurringServiceCommitment([commitmentA, commitmentB], "commitment-a")).toEqual([
      commitmentB,
    ]);
  });

  it("persists commitments across a simulated relaunch", () => {
    const commitments = [
      buildRecurringServiceCommitmentFromDraft({
        id: "commitment-4",
        draft: {
          ...createDefaultRecurringServiceCommitmentDraft(),
          name: "Bridging the Gap every Monday",
          type: "BRIDGING_THE_GAP",
          startsAtLocal: "17:45",
          weeklyDays: ["MON"],
          notes: "Call newcomer before leaving",
        },
      }),
    ];

    const restored = normalizeRecurringServiceCommitments(
      JSON.parse(JSON.stringify(commitments)) as unknown,
    );

    expect(restored).toEqual(commitments);
  });

  it("persists the attendance export inclusion flag across a simulated relaunch", () => {
    const commitment = buildRecurringServiceCommitmentFromDraft({
      id: "commitment-export",
      draft: {
        ...createDefaultRecurringServiceCommitmentDraft(),
        name: "Bookstore chair",
        startsAtLocal: "10:00",
        includeInAttendanceExport: true,
      },
    });

    const restored = normalizeRecurringServiceCommitments(
      JSON.parse(JSON.stringify([commitment])) as unknown,
    );

    expect(restored[0]?.includeInAttendanceExport).toBe(true);
  });

  it("allows skipping the step when there is no unsaved draft and handles invalid stored payloads safely", () => {
    expect(
      hasUnsavedRecurringServiceCommitmentDraftChanges(
        createDefaultRecurringServiceCommitmentDraft(),
      ),
    ).toBe(false);

    expect(
      normalizeRecurringServiceCommitments([
        {
          id: "broken",
          name: "Missing recurrence",
          startsAtLocal: "25:99",
        },
      ]),
    ).toEqual([]);
  });
});
