import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRuntime = vi.hoisted(() => {
  const entries = new Map<string, { size: number }>();
  let printedIndex = 0;

  const estimateBase64Bytes = (value: string): number => {
    const normalized = value.trim();
    if (normalized.length === 0) {
      return 0;
    }
    const paddingLength = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((normalized.length * 3) / 4) - paddingLength);
  };

  const printToFileAsync = vi.fn(async ({ html }: { html: string }) => {
    printedIndex += 1;
    const uri = `file:///mock/cache/printed-${printedIndex}.pdf`;
    entries.set(uri, { size: Buffer.byteLength(html, "utf8") });
    return { uri };
  });

  const manipulateAsync = vi.fn(async (uri: string) => ({
    uri: `${uri}.compressed.jpg`,
  }));

  const fileSystemModule = {
    documentDirectory: "file:///mock/doc/",
    cacheDirectory: "file:///mock/cache/",
    EncodingType: {
      Base64: "base64",
    },
    async getInfoAsync(uri: string) {
      const entry = entries.get(uri);
      return {
        exists: Boolean(entry),
        size: entry?.size,
      };
    },
    async deleteAsync(uri: string) {
      entries.delete(uri);
    },
    async moveAsync(input: { from: string; to: string }) {
      const source = entries.get(input.from) ?? { size: 1280 };
      entries.set(input.to, source);
      entries.delete(input.from);
    },
    async makeDirectoryAsync() {
      // no-op for tests
    },
    async writeAsStringAsync(
      uri: string,
      contents: string,
      options?: {
        encoding?: string;
      },
    ) {
      const encoding = options?.encoding?.toLowerCase() ?? "utf8";
      const size =
        encoding === "base64" ? estimateBase64Bytes(contents) : Buffer.byteLength(contents, "utf8");
      entries.set(uri, { size });
    },
  };

  const reset = () => {
    entries.clear();
    printedIndex = 0;
    printToFileAsync.mockClear();
    manipulateAsync.mockClear();
  };

  return {
    entries,
    printToFileAsync,
    manipulateAsync,
    fileSystemModule,
    reset,
  };
});

vi.mock("expo-print", () => ({
  printToFileAsync: mockRuntime.printToFileAsync,
}));

vi.mock("expo-file-system", () => mockRuntime.fileSystemModule);

vi.mock("expo-image-manipulator", () => ({
  manipulateAsync: mockRuntime.manipulateAsync,
  SaveFormat: {
    JPEG: "jpeg",
  },
}));

import { generateAttendanceSlipPdf, type AttendanceSlipRecord } from "../lib/pdf/attendanceSlipPdf";

const originalDynamicRequire = (globalThis as { require?: (moduleName: string) => unknown })
  .require;

function createRecord(signature: string): AttendanceSlipRecord {
  return {
    id: "attendance-1",
    meetingName: "Billings AA",
    meetingAddress: "123 Main St, Billings, MT",
    startAtIso: "2026-03-03T19:00:00.000Z",
    endAtIso: "2026-03-03T20:05:00.000Z",
    durationSeconds: 3900,
    signatureSvgBase64: signature,
    chairName: "J. Doe",
    chairRole: "Chairperson",
    signatureCapturedAtIso: "2026-03-03T20:05:00.000Z",
    startLocation: {
      lat: 45.7833,
      lng: -108.5007,
      accuracyM: 12,
    },
    endLocation: {
      lat: 45.7834,
      lng: -108.5008,
      accuracyM: 13,
    },
  };
}

describe("attendance slip PDF export", () => {
  beforeEach(() => {
    mockRuntime.reset();
    (globalThis as { require?: (moduleName: string) => unknown }).require = (
      moduleName: string,
    ) => {
      if (moduleName === "expo-print") {
        return { printToFileAsync: mockRuntime.printToFileAsync };
      }
      if (moduleName === "expo-file-system") {
        return mockRuntime.fileSystemModule;
      }
      if (moduleName === "expo-image-manipulator") {
        return {
          manipulateAsync: mockRuntime.manipulateAsync,
          SaveFormat: {
            JPEG: "jpeg",
          },
        };
      }
      throw new Error(`Unexpected module requested: ${moduleName}`);
    };
  });

  afterEach(() => {
    (globalThis as { require?: (moduleName: string) => unknown }).require = originalDynamicRequire;
  });

  it("does not invoke image manipulation for SVG file URI signatures", async () => {
    mockRuntime.entries.set("file:///mock/doc/attendance-signatures/existing.svg", { size: 1400 });

    const uris = await generateAttendanceSlipPdf(
      [createRecord("file:///mock/doc/attendance-signatures/existing.svg")],
      { participantName: "Test User" },
      { fileName: "attendance-slip.pdf" },
    );

    expect(mockRuntime.printToFileAsync).toHaveBeenCalledTimes(1);
    expect(mockRuntime.manipulateAsync).not.toHaveBeenCalled();
    expect(uris).toHaveLength(1);
    expect(uris[0]).toMatch(/\.pdf$/);
  });

  it("does not invoke image manipulation for legacy SVG base64 signatures", async () => {
    const svgMarkup =
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><path d="M10 10 L90 90"/></svg>';
    const legacySignatureBase64 = Buffer.from(svgMarkup, "utf8").toString("base64");

    const uris = await generateAttendanceSlipPdf(
      [createRecord(legacySignatureBase64)],
      { participantName: "Test User" },
      { fileName: "attendance-slip.pdf" },
    );

    const generatedSvgFiles = Array.from(mockRuntime.entries.keys()).filter((uri) =>
      uri.endsWith(".svg"),
    );

    expect(mockRuntime.printToFileAsync).toHaveBeenCalledTimes(1);
    expect(mockRuntime.manipulateAsync).not.toHaveBeenCalled();
    expect(generatedSvgFiles.length).toBeGreaterThan(0);
    expect(uris).toHaveLength(1);
  });
});
