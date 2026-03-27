import { describe, expect, it } from "vitest";
import {
  buildHomeGroupBirthdayAnnouncementKey,
  buildHomeGroupBirthdayAnnouncementMessage,
  buildHomeGroupBirthdayDisplayName,
  getSobrietyBirthdayYears,
  isSobrietyBirthdayOnDate,
} from "../lib/homeGroupBirthdays";

describe("home group birthdays", () => {
  it("matches a standard sobriety anniversary", () => {
    expect(isSobrietyBirthdayOnDate("2020-03-23", "2026-03-23")).toBe(true);
    expect(getSobrietyBirthdayYears("2020-03-23", "2026-03-23")).toBe(6);
  });

  it("treats Feb 29 anniversaries as Feb 28 in non-leap years", () => {
    expect(isSobrietyBirthdayOnDate("2020-02-29", "2025-02-28")).toBe(true);
    expect(getSobrietyBirthdayYears("2020-02-29", "2025-02-28")).toBe(5);
  });

  it("builds a stable announcement key from group + day + celebrants", () => {
    expect(
      buildHomeGroupBirthdayAnnouncementKey({
        homeGroupKey: "group-1",
        todayIso: "2026-03-23",
        celebrantTokens: ["token-b", "token-a"],
      }),
    ).toBe("home-group-birthday:group-1:2026-03-23:token-a,token-b");
  });

  it("builds the display name exactly from the entered first and optional last value", () => {
    expect(buildHomeGroupBirthdayDisplayName({ firstName: "Jason", lastName: null })).toBe("Jason");
    expect(buildHomeGroupBirthdayDisplayName({ firstName: "Jason", lastName: "L" })).toBe(
      "Jason L",
    );
    expect(buildHomeGroupBirthdayDisplayName({ firstName: "Jason", lastName: "Lehman" })).toBe(
      "Jason Lehman",
    );
  });

  it("formats birthday messages using the saved display name", () => {
    expect(
      buildHomeGroupBirthdayAnnouncementMessage([
        { dedupeToken: "u1", displayName: "John", anniversaryYears: 7 },
      ]),
    ).toBe("John in your home group is celebrating 7 years sober today.");

    expect(
      buildHomeGroupBirthdayAnnouncementMessage([
        { dedupeToken: "u1", displayName: "John L", anniversaryYears: 7 },
        { dedupeToken: "u2", displayName: "Maria Garcia", anniversaryYears: 3 },
      ]),
    ).toBe("John L and Maria Garcia in your home group are celebrating sobriety birthdays today.");
  });
});
