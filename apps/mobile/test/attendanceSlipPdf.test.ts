import { describe, expect, it } from "vitest";
import { buildAttendanceSlipHtmlForTest } from "../lib/pdf/attendanceSlipPdf";

describe("attendance slip html", () => {
  it("includes required court-friendly fields", () => {
    const html = buildAttendanceSlipHtmlForTest([
      {
        id: "att-1",
        meetingName: "Recovery Group",
        meetingAddress: "123 Main St",
        startAtIso: "2026-03-05T01:00:00.000Z",
        endAtIso: "2026-03-05T01:45:00.000Z",
        durationSeconds: 45 * 60,
        signatureSvgBase64: "file:///documents/signatures/att-1.svg",
        chairName: "Chair Name",
        chairRole: "Chair",
        signatureCapturedAtIso: "2026-03-05T01:45:00.000Z",
        startLocation: { lat: null, lng: null, accuracyM: null },
        endLocation: { lat: null, lng: null, accuracyM: null },
      },
    ]);

    expect(html).toContain("AA/NA ATTENDANCE SHEET");
    expect(html).toContain("Date");
    expect(html).toContain("Meeting Name");
    expect(html).toContain("Start Time");
    expect(html).toContain("Duration");
    expect(html).toContain("Signature");
    expect(html).toContain("Recovery Group");
    expect(html).toContain("45 min");
  });
});
