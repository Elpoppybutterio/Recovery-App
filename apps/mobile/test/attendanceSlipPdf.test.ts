import { describe, expect, it } from "vitest";
import { normalizeAttendanceSlipRecords } from "../lib/pdf/attendanceSlipPdf";

describe("attendance slip export normalization", () => {
  it("sanitizes records and computes duration when missing", () => {
    const normalized = normalizeAttendanceSlipRecords([
      {
        id: "",
        meetingName: "   ",
        meetingAddress: "",
        startAtIso: "2026-03-01T10:00:00.000Z",
        endAtIso: "2026-03-01T11:30:00.000Z",
        durationSeconds: null,
        signatureSvgBase64: "ab c+12=\n",
        chairName: "  ",
        chairRole: "Chair",
        signatureCapturedAtIso: "",
        startLocation: {
          lat: "45.5" as unknown as number,
          lng: -108.5,
          accuracyM: "8" as unknown as number,
        },
        endLocation: { lat: null, lng: null, accuracyM: null },
      },
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].id).toBe("attendance-1");
    expect(normalized[0].meetingName).toBe("Recovery Meeting");
    expect(normalized[0].meetingAddress).toBe("Address unavailable");
    expect(normalized[0].durationSeconds).toBe(5400);
    expect(normalized[0].signatureSvgBase64).toBe("abc+12=");
    expect(normalized[0].chairName).toBeNull();
    expect(normalized[0].chairRole).toBe("Chair");
    expect(normalized[0].signatureCapturedAtIso).toBeNull();
    expect(normalized[0].startLocation.lat).toBe(45.5);
    expect(normalized[0].startLocation.accuracyM).toBe(8);
  });
});
