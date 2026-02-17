import { describe, expect, it } from "vitest";
import { attendanceRecordSchema } from "../src";

describe("attendanceRecordSchema", () => {
  it("accepts a valid attendance payload", () => {
    const result = attendanceRecordSchema.safeParse({
      userId: "user-1",
      meetingId: "meeting-1",
      checkInAt: new Date().toISOString(),
      status: "PROVISIONAL",
    });

    expect(result.success).toBe(true);
  });
});
