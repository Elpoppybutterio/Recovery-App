import { describe, expect, it } from "vitest";
import {
  buildMeetingCalendarEventInput,
  buildSponsorCalendarEventInput,
  CALENDAR_PERMISSION_FALLBACK_MESSAGE,
  CALENDAR_WRITE_FAILURE_MESSAGE,
  mapCalendarWriteErrorToUserMessage,
  resolveMeetingCalendarReminderPlan,
  shouldAttemptCalendarWrite,
} from "../lib/calendarWrite";

describe("calendar write helpers", () => {
  it("builds sponsor call calendar events with deterministic lead-time alarms", () => {
    const event = buildSponsorCalendarEventInput({
      sponsorName: "Casey",
      sponsorPhoneE164: "+13035551212",
      sponsorCallTimeLocalHhmm: "17:00",
      recurrenceSummary: "Weekly on Monday",
      startDate: new Date("2026-03-25T17:00:00.000Z"),
      endDate: new Date("2026-03-25T17:15:00.000Z"),
      leadMinutes: 10,
      recurrenceRule: {
        frequency: "weekly",
        interval: 1,
        daysOfTheWeek: [{ dayOfTheWeek: 2 }],
      },
    });

    expect(event.title).toBe("Call Sponsor");
    expect(event.notes).toContain("Sponsor: Casey");
    expect(event.notes).toContain("Phone: +13035551212");
    expect(event.alarms).toEqual([{ relativeOffset: -10 }]);
  });

  it("builds meeting attendance calendar events with meeting metadata", () => {
    const event = buildMeetingCalendarEventInput({
      meetingName: "Recovery Group",
      meetingAddress: "123 Main St",
      requiresSignature: true,
      startDate: new Date("2026-03-25T19:00:00.000Z"),
      endDate: new Date("2026-03-25T20:00:00.000Z"),
      relativeOffsetMinutes: -37,
    });

    expect(event.title).toBe("AA/NA Meeting - Recovery Group");
    expect(event.location).toBe("123 Main St");
    expect(event.notes).toContain("Signature required");
    expect(event.alarms).toEqual([{ relativeOffset: -37 }]);
  });

  it("guards calendar writes until runtime and sync policy allow them", () => {
    expect(shouldAttemptCalendarWrite({ runtimeEnabled: false, automaticSyncEnabled: true })).toBe(
      false,
    );
    expect(shouldAttemptCalendarWrite({ runtimeEnabled: true, automaticSyncEnabled: false })).toBe(
      false,
    );
    expect(shouldAttemptCalendarWrite({ runtimeEnabled: true, automaticSyncEnabled: true })).toBe(
      true,
    );
  });

  it("falls back from travel-time reminder timing to arrival buffer then default", () => {
    expect(
      resolveMeetingCalendarReminderPlan({
        travelDurationSeconds: 22 * 60,
        arrivalBufferMinutes: 15,
      }),
    ).toEqual({ relativeOffsetMinutes: -37, source: "travel" });

    expect(
      resolveMeetingCalendarReminderPlan({
        travelDurationSeconds: null,
        arrivalBufferMinutes: 20,
      }),
    ).toEqual({ relativeOffsetMinutes: -20, source: "buffer" });

    expect(
      resolveMeetingCalendarReminderPlan({
        travelDurationSeconds: null,
        arrivalBufferMinutes: 0,
      }),
    ).toEqual({ relativeOffsetMinutes: -15, source: "default" });
  });

  it("maps permission and unavailable errors to safe user-facing copy", () => {
    expect(
      mapCalendarWriteErrorToUserMessage({
        errorCode: "permission",
        reminderSavedInApp: true,
      }),
    ).toBe(CALENDAR_PERMISSION_FALLBACK_MESSAGE);
    expect(
      mapCalendarWriteErrorToUserMessage({
        errorCode: "unavailable",
        reminderSavedInApp: false,
      }),
    ).toBe(CALENDAR_WRITE_FAILURE_MESSAGE);
    expect(CALENDAR_PERMISSION_FALLBACK_MESSAGE).not.toContain("404");
    expect(CALENDAR_WRITE_FAILURE_MESSAGE).not.toContain("permission denied");
  });
});
