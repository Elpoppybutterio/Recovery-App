export type SignatureMimeType = "image/png" | "image/jpeg" | "image/svg+xml";

export type SignatureRef = {
  uri: string;
  mimeType: SignatureMimeType;
};

export type SignatureFileSystemModule = {
  documentDirectory?: string;
  cacheDirectory?: string;
  EncodingType?: { Base64?: string; UTF8?: string };
  getInfoAsync(uri: string): Promise<{ exists: boolean; size?: number }>;
  makeDirectoryAsync(uri: string, options?: { intermediates?: boolean }): Promise<void>;
  writeAsStringAsync(uri: string, contents: string, options?: { encoding?: string }): Promise<void>;
  readAsStringAsync(uri: string, options?: { encoding?: string }): Promise<string>;
};

export type NormalizeSignatureOptions = {
  fileSystem: SignatureFileSystemModule | null;
  recordId: string;
  subdirectory?: string;
  verifyFileExists?: boolean;
};

export type NormalizeSignatureResult = {
  ref: SignatureRef | null;
  migrated: boolean;
  reason: string | null;
};

export function loadSignatureFileSystemModule(): SignatureFileSystemModule | null {
  try {
    const dynamicRequire: (moduleName: string) => unknown = require;
    return dynamicRequire("expo-file-system") as SignatureFileSystemModule;
  } catch {
    return null;
  }
}

export function looksLikeFileUri(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("file://")) {
    return true;
  }
  if (!trimmed.startsWith("/")) {
    return false;
  }
  // Guard against legacy raw base64 payloads that can begin with "/" (for example JPEG).
  if (trimmed.length > 4096) {
    return false;
  }
  if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return false;
  }
  return true;
}

function looksLikeSvgMarkup(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith("<svg") || (normalized.startsWith("<?xml") && normalized.includes("<svg"))
  );
}

function sanitizeBase64(value: string): string | null {
  const cleaned = value.replace(/[^A-Za-z0-9+/=]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

function inferMimeFromBase64(value: string): SignatureMimeType {
  const prefix = value.slice(0, 32);
  if (prefix.startsWith("PHN2Zy") || prefix.startsWith("PD94bW")) {
    return "image/svg+xml";
  }
  if (prefix.startsWith("iVBOR")) {
    return "image/png";
  }
  if (prefix.startsWith("/9j/")) {
    return "image/jpeg";
  }
  return "image/png";
}

function mimeTypeFromUri(uri: string): SignatureMimeType {
  const normalized = uri.split("?")[0]?.split("#")[0]?.toLowerCase() ?? uri.toLowerCase();
  if (normalized.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  return "image/png";
}

function extensionForMimeType(mimeType: SignatureMimeType): "svg" | "png" | "jpg" {
  if (mimeType === "image/svg+xml") {
    return "svg";
  }
  if (mimeType === "image/jpeg") {
    return "jpg";
  }
  return "png";
}

function createHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(16);
}

function toSafeFileNamePart(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, "-");
  return cleaned.length > 0 ? cleaned : "signature";
}

async function ensureDirectory(
  fileSystem: SignatureFileSystemModule,
  directoryUri: string,
): Promise<void> {
  try {
    await fileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
  } catch {
    // best-effort directory creation
  }
}

function resolveTargetDirectory(
  fileSystem: SignatureFileSystemModule,
  subdirectory: string,
): string | null {
  const base = fileSystem.documentDirectory ?? fileSystem.cacheDirectory;
  if (!base) {
    return null;
  }
  const normalizedSubdirectory = subdirectory.replace(/^\/+/, "").replace(/\/+$/, "");
  return `${base}${normalizedSubdirectory}/`;
}

function utf8Encoding(fileSystem: SignatureFileSystemModule): string {
  return fileSystem.EncodingType?.UTF8 ?? "utf8";
}

function base64Encoding(fileSystem: SignatureFileSystemModule): string {
  return fileSystem.EncodingType?.Base64 ?? "base64";
}

async function writeSignatureFile(
  fileSystem: SignatureFileSystemModule,
  directory: string,
  recordId: string,
  payload:
    | { kind: "base64"; base64: string; mimeType: SignatureMimeType }
    | { kind: "utf8"; text: string },
): Promise<SignatureRef | null> {
  const mimeType = payload.kind === "base64" ? payload.mimeType : "image/svg+xml";
  const extension = extensionForMimeType(mimeType);
  const payloadHash = createHash(
    payload.kind === "base64" ? payload.base64.slice(0, 256) : payload.text.slice(0, 256),
  );
  const safeId = toSafeFileNamePart(recordId);
  const targetUri = `${directory}${safeId}-${payloadHash}.${extension}`;

  await ensureDirectory(fileSystem, directory);

  try {
    const existing = await fileSystem.getInfoAsync(targetUri);
    if (!existing.exists) {
      if (payload.kind === "base64") {
        await fileSystem.writeAsStringAsync(targetUri, payload.base64, {
          encoding: base64Encoding(fileSystem),
        });
      } else {
        await fileSystem.writeAsStringAsync(targetUri, payload.text, {
          encoding: utf8Encoding(fileSystem),
        });
      }
    }
    return { uri: targetUri, mimeType };
  } catch {
    return null;
  }
}

function decodeSvgDataUriPayload(value: string): string | null {
  const trimmed = value.trim();
  const base64Match = trimmed.match(/^data:image\/svg\+xml(?:;charset=[^;,]+)?;base64,(.+)$/i);
  if (base64Match) {
    const base64 = sanitizeBase64(base64Match[1]);
    if (!base64) {
      return null;
    }
    return base64;
  }

  const utf8Match = trimmed.match(
    /^data:image\/svg\+xml(?:;charset=[^;,]+)?(?:;(?:utf8|utf-8))?,(.*)$/i,
  );
  if (!utf8Match) {
    return null;
  }

  try {
    return decodeURIComponent(utf8Match[1]);
  } catch {
    return utf8Match[1];
  }
}

function parseInput(
  value: string,
):
  | { kind: "file"; uri: string }
  | { kind: "svg"; svg: string }
  | { kind: "base64"; base64: string; mimeType: SignatureMimeType }
  | { kind: "none" } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { kind: "none" };
  }

  if (looksLikeFileUri(trimmed)) {
    return {
      kind: "file",
      uri: trimmed.startsWith("file://") ? trimmed : `file://${trimmed}`,
    };
  }

  if (looksLikeSvgMarkup(trimmed)) {
    return { kind: "svg", svg: trimmed };
  }

  const svgPayload = decodeSvgDataUriPayload(trimmed);
  if (svgPayload) {
    if (svgPayload.startsWith("<")) {
      return { kind: "svg", svg: svgPayload };
    }
    return { kind: "base64", base64: svgPayload, mimeType: "image/svg+xml" };
  }

  const dataUriMatch = trimmed.match(/^data:image\/([A-Za-z0-9.+-]+);base64,(.+)$/i);
  if (dataUriMatch) {
    const base64 = sanitizeBase64(dataUriMatch[2]);
    if (!base64) {
      return { kind: "none" };
    }
    const subtype = dataUriMatch[1].toLowerCase();
    const mimeType: SignatureMimeType = subtype.includes("png")
      ? "image/png"
      : subtype.includes("jpeg") || subtype.includes("jpg")
        ? "image/jpeg"
        : "image/svg+xml";
    return { kind: "base64", base64, mimeType };
  }

  const base64 = sanitizeBase64(trimmed);
  if (!base64 || base64.length < 64 || base64.length % 4 !== 0) {
    return { kind: "none" };
  }

  return { kind: "base64", base64, mimeType: inferMimeFromBase64(base64) };
}

export async function normalizeSignatureValueToRef(
  value: unknown,
  options: NormalizeSignatureOptions,
): Promise<NormalizeSignatureResult> {
  if (typeof value !== "string") {
    return { ref: null, migrated: false, reason: null };
  }

  const parsed = parseInput(value);
  if (parsed.kind === "none") {
    return { ref: null, migrated: false, reason: "empty" };
  }

  if (parsed.kind === "file") {
    if (!options.verifyFileExists) {
      return {
        ref: { uri: parsed.uri, mimeType: mimeTypeFromUri(parsed.uri) },
        migrated: false,
        reason: null,
      };
    }
    if (!options.fileSystem) {
      return { ref: null, migrated: false, reason: "filesystem_unavailable" };
    }
    try {
      const info = await options.fileSystem.getInfoAsync(parsed.uri);
      if (!info.exists) {
        return { ref: null, migrated: true, reason: "missing_file" };
      }
      return {
        ref: { uri: parsed.uri, mimeType: mimeTypeFromUri(parsed.uri) },
        migrated: false,
        reason: null,
      };
    } catch {
      return { ref: null, migrated: true, reason: "file_validation_failed" };
    }
  }

  if (!options.fileSystem) {
    return { ref: null, migrated: true, reason: "filesystem_unavailable" };
  }

  const directory = resolveTargetDirectory(
    options.fileSystem,
    options.subdirectory ?? "signatures",
  );
  if (!directory) {
    return { ref: null, migrated: true, reason: "no_writable_directory" };
  }

  if (parsed.kind === "svg") {
    const written = await writeSignatureFile(options.fileSystem, directory, options.recordId, {
      kind: "utf8",
      text: parsed.svg,
    });
    return {
      ref: written,
      migrated: true,
      reason: written ? null : "write_failed",
    };
  }

  const written = await writeSignatureFile(options.fileSystem, directory, options.recordId, {
    kind: "base64",
    base64: parsed.base64,
    mimeType: parsed.mimeType,
  });

  return {
    ref: written,
    migrated: true,
    reason: written ? null : "write_failed",
  };
}

export function estimateBase64Bytes(value: string): number {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return 0;
  }
  const paddingLength = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - paddingLength);
}

export async function signatureRefToDataUri(options: {
  fileSystem: SignatureFileSystemModule;
  ref: SignatureRef;
  maxBytes?: number;
}): Promise<{ dataUri: string | null; bytes: number }> {
  const encoding = base64Encoding(options.fileSystem);
  try {
    const base64 = await options.fileSystem.readAsStringAsync(options.ref.uri, { encoding });
    const cleaned = sanitizeBase64(base64);
    if (!cleaned) {
      return { dataUri: null, bytes: 0 };
    }
    const bytes = estimateBase64Bytes(cleaned);
    if (typeof options.maxBytes === "number" && options.maxBytes > 0 && bytes > options.maxBytes) {
      return { dataUri: null, bytes };
    }
    return {
      dataUri: `data:${options.ref.mimeType};base64,${cleaned}`,
      bytes,
    };
  } catch {
    return { dataUri: null, bytes: 0 };
  }
}

export const __signatureStoreTestUtils = {
  parseInput,
  mimeTypeFromUri,
};
