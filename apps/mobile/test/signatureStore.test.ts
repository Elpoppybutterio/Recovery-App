import { describe, expect, it } from "vitest";
import {
  normalizeSignatureValueToRef,
  type SignatureFileSystemModule,
} from "../lib/signatures/signatureStore";

type MockFs = SignatureFileSystemModule & {
  files: Map<string, { contents: string; encoding: string | undefined }>;
};

function createMockFs(initialUris: string[] = []): MockFs {
  const files = new Map<string, { contents: string; encoding: string | undefined }>();
  for (const uri of initialUris) {
    files.set(uri, { contents: "", encoding: undefined });
  }

  return {
    documentDirectory: "file:///documents/",
    EncodingType: { Base64: "base64", UTF8: "utf8" },
    files,
    async getInfoAsync(uri: string) {
      const file = files.get(uri);
      if (!file) {
        return { exists: false };
      }
      return { exists: true, size: file.contents.length };
    },
    async makeDirectoryAsync() {
      // no-op for test
    },
    async writeAsStringAsync(uri: string, contents: string, options?: { encoding?: string }) {
      files.set(uri, { contents, encoding: options?.encoding });
    },
    async readAsStringAsync(uri: string) {
      const file = files.get(uri);
      if (!file) {
        throw new Error("missing file");
      }
      return file.contents;
    },
  };
}

describe("signature normalization", () => {
  it("accepts existing file uri", async () => {
    const existingUri = "file:///documents/signatures/existing.png";
    const fs = createMockFs([existingUri]);

    const result = await normalizeSignatureValueToRef(existingUri, {
      fileSystem: fs,
      recordId: "attendance-1",
      verifyFileExists: true,
    });

    expect(result.ref?.uri).toBe(existingUri);
    expect(result.migrated).toBe(false);
  });

  it("converts data-uri base64 to file ref", async () => {
    const fs = createMockFs();
    const pngDataUri =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2P8//8/AwAI/AL+KDv9GQAAAABJRU5ErkJggg==";

    const result = await normalizeSignatureValueToRef(pngDataUri, {
      fileSystem: fs,
      recordId: "attendance-2",
      verifyFileExists: true,
    });

    expect(result.ref?.uri.endsWith(".png")).toBe(true);
    expect(result.migrated).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("converts raw base64 to file ref", async () => {
    const fs = createMockFs();
    const rawBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2P8//8/AwAI/AL+KDv9GQAAAABJRU5ErkJggg==";

    const result = await normalizeSignatureValueToRef(rawBase64, {
      fileSystem: fs,
      recordId: "attendance-3",
      verifyFileExists: true,
    });

    expect(result.ref?.uri.endsWith(".png")).toBe(true);
    expect(result.migrated).toBe(true);
  });

  it("converts inline svg markup to svg file ref", async () => {
    const fs = createMockFs();
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><path d="M1 1 L20 20" /></svg>';

    const result = await normalizeSignatureValueToRef(svg, {
      fileSystem: fs,
      recordId: "attendance-4",
      verifyFileExists: true,
    });

    expect(result.ref?.uri.endsWith(".svg")).toBe(true);
    expect(result.migrated).toBe(true);
  });

  it("returns null for garbage payload", async () => {
    const fs = createMockFs();

    const result = await normalizeSignatureValueToRef("not-a-signature-payload$$$", {
      fileSystem: fs,
      recordId: "attendance-5",
      verifyFileExists: true,
    });

    expect(result.ref).toBeNull();
  });
});
