import { describe, expect, it } from "vitest";
import {
  buildHomeGroupBirthdayAnnouncementKey,
  buildHomeGroupBirthdayAnnouncementMessage,
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
        celebrantUserIds: ["user-b", "user-a"],
      }),
    ).toBe("home-group-birthday:group-1:2026-03-23:user-a,user-b");
  });

  it("formats first-name-only birthday messages", () => {
    expect(
      buildHomeGroupBirthdayAnnouncementMessage([
        { userId: "u1", firstName: "John", anniversaryYears: 7 },
      ]),
    ).toBe("John in your home group is celebrating 7 years sober today.");

    expect(
      buildHomeGroupBirthdayAnnouncementMessage([
        { userId: "u1", firstName: "John", anniversaryYears: 7 },
        { userId: "u2", firstName: "Maria", anniversaryYears: 3 },
      ]),
    ).toBe("John and Maria in your home group are celebrating sobriety birthdays today.");
  });
});
