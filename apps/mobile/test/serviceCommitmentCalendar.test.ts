import { describe, expect, it } from "vitest";
import {
  buildRecurringServiceCommitmentCalendarEventInput,
  getRecurringServiceCommitmentCalendarFingerprint,
  mapRecurringServiceCommitmentCalendarErrorToUserMessage,
  resolveRecurringServiceCommitmentReminderPlan,
  withRecurringServiceCommitmentCalendarSync,
} from "../lib/serviceCommitmentCalendar";
import {
  buildRecurringServiceCommitmentFromDraft,
  createDefaultRecurringServiceCommitmentDraft,
  normalizeRecurringServiceCommitments,
} from "../lib/recurringServiceCommitments";

describe("service commitment calendar sync", () => {
  it("maps a weekly recurring commitment into a weekly calendar series", () => {
    const commitment = buildRecurringServiceCommitmentFromDraft({
      id: "service-1",
      draft: {
        ...createDefaultRecurringServiceCommitmentDraft(),
        name: "Greeter every Thursday",
        type: "GREETER",
        startsAtLocal: "18:30",
        weeklyDays: ["THU"],
        arriveEarlyMinutes: "15",
      },
    });

    const event = buildRecurringServiceCommitmentCalendarEventInput({
      commitment,
      referenceDate: new Date("2026-03-25T12:00:00.000Z"),
      relativeOffsetMinutes: -25,
    });

    expect(event.title).toContain("Greeter");
    expect(event.recurrenceRule).toEqual({
      frequency: "weekly",
      interval: 1,
      daysOfTheWeek: [{ dayOfTheWeek: 5 }],
    });
    expect(event.alarms).toEqual([{ relativeOffset: -25 }]);
  });

  it("maps a monthly ordinal commitment into the correct recurrence rule", () => {
    const commitment = buildRecurringServiceCommitmentFromDraft({
      id: "service-2",
      draft: {
        ...createDefaultRecurringServiceCommitmentDraft(),
        name: "First Saturday intergroup",
        type: "INTERGROUP",
        startsAtLocal: "09:00",
        recurrenceKind: "MONTHLY_ORDINAL",
        monthlyOrdinal: 1,
        monthlyDay: "SAT",
      },
    });

    const event = buildRecurringServiceCommitmentCalendarEventInput({
      commitment,
      referenceDate: new Date("2026-03-25T12:00:00.000Z"),
      relativeOffsetMinutes: -15,
    });

    expect(event.recurrenceRule).toEqual({
      frequency: "monthly",
      interval: 1,
      daysOfTheWeek: [{ dayOfTheWeek: 7, weekNumber: 1 }],
    });
  });

  it("falls back reminder timing from travel to arrival buffer to default", () => {
    expect(
      resolveRecurringServiceCommitmentReminderPlan({
        travelDurationSeconds: 20 * 60,
        arrivalBufferMinutes: 10,
      }),
    ).toEqual({ relativeOffsetMinutes: -30, source: "travel" });

    expect(
      resolveRecurringServiceCommitmentReminderPlan({
        travelDurationSeconds: null,
        arrivalBufferMinutes: 12,
      }),
    ).toEqual({ relativeOffsetMinutes: -12, source: "buffer" });

    expect(
      resolveRecurringServiceCommitmentReminderPlan({
        travelDurationSeconds: null,
        arrivalBufferMinutes: 0,
      }),
    ).toEqual({ relativeOffsetMinutes: -15, source: "default" });
  });

  it("updates linkage deterministically without creating duplicate local references", () => {
    const commitment = buildRecurringServiceCommitmentFromDraft({
      id: "service-3",
      draft: {
        ...createDefaultRecurringServiceCommitmentDraft(),
        name: "Cleanup",
        type: "CLEANUP",
        startsAtLocal: "20:00",
        weeklyDays: ["TUE"],
      },
    });

    const synced = withRecurringServiceCommitmentCalendarSync(commitment, {
      calendarEventId: "event-1",
      calendarSeriesId: "series-1",
      calendarSyncFingerprint: getRecurringServiceCommitmentCalendarFingerprint(commitment),
    });

    expect(synced.calendarEventId).toBe("event-1");
    expect(synced.calendarSeriesId).toBe("series-1");
    expect(synced.calendarSyncFingerprint).toBe(
      getRecurringServiceCommitmentCalendarFingerprint(commitment),
    );
  });

  it("preserves calendar linkage across a simulated relaunch payload", () => {
    const commitment = withRecurringServiceCommitmentCalendarSync(
      buildRecurringServiceCommitmentFromDraft({
        id: "service-4",
        draft: {
          ...createDefaultRecurringServiceCommitmentDraft(),
          name: "Bridging the Gap",
          type: "BRIDGING_THE_GAP",
          startsAtLocal: "17:30",
          weeklyDays: ["MON"],
        },
      }),
      {
        calendarEventId: "event-4",
        calendarSeriesId: "series-4",
        calendarSyncFingerprint: "fingerprint-4",
      },
    );

    const restored = normalizeRecurringServiceCommitments(
      JSON.parse(JSON.stringify([commitment])) as unknown,
    );

    expect(restored[0]?.calendarEventId).toBe("event-4");
    expect(restored[0]?.calendarSeriesId).toBe("series-4");
    expect(restored[0]?.calendarSyncFingerprint).toBe("fingerprint-4");
  });

  it("maps technical calendar errors to safe user-facing messages", () => {
    expect(
      mapRecurringServiceCommitmentCalendarErrorToUserMessage({ errorCode: "permission" }),
    ).toBe(
      "Calendar access is unavailable right now. Your service commitment was still saved in the app.",
    );
    expect(
      mapRecurringServiceCommitmentCalendarErrorToUserMessage({ errorCode: "unavailable" }),
    ).toBe(
      "We couldn’t sync this commitment to your calendar. Please check permissions and try again.",
    );
  });
});
