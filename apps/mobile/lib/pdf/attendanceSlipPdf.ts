export const ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX = "AA-NA Attendance Slip";
const MAX_SIGNATURE_EMBED_SINGLE_BYTES = 350 * 1024;
const MAX_SIGNATURE_EMBED_TOTAL_BYTES_PER_CHUNK = 2 * 1024 * 1024;
const DEFAULT_RECORDS_PER_CHUNK = 5;
const MAX_SIGNATURE_WIDTH_PX = 800;
const SIGNATURE_COMPRESS_QUALITY = 0.7;
const CHUNK_FALLBACK_RECORD_COUNTS = [DEFAULT_RECORDS_PER_CHUNK, 3, 1] as const;

type LocationStamp = {
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
};

export type AttendanceSlipRecord = {
  id: string;
  meetingName: string;
  meetingAddress: string;
  startAtIso: string;
  endAtIso: string | null;
  durationSeconds: number | null;
  signatureSvgBase64: string | null;
  chairName?: string | null;
  chairRole?: string | null;
  signatureCapturedAtIso?: string | null;
  startLocation: LocationStamp;
  endLocation: LocationStamp;
};

export type AttendanceSlipUserProfile = {
  participantName: string;
  tenantLabel?: string | null;
};

export type AttendanceSlipExportProgress = {
  chunkIndex: number;
  chunkCount: number;
  processedRecords: number;
  totalRecords: number;
};

type PrintModule = {
  printToFileAsync(input: {
    html: string;
    width?: number;
    height?: number;
  }): Promise<{ uri: string }>;
  printAsync?(input: { html: string }): Promise<void>;
};

type SharingModule = {
  isAvailableAsync(): Promise<boolean>;
  shareAsync(
    uri: string,
    options?: {
      UTI?: string;
      mimeType?: string;
      dialogTitle?: string;
    },
  ): Promise<void>;
};

type FileSystemModule = {
  documentDirectory?: string;
  cacheDirectory?: string;
  EncodingType?: { Base64?: string };
  getInfoAsync(uri: string): Promise<{ exists: boolean; size?: number }>;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
  moveAsync(input: { from: string; to: string }): Promise<void>;
  makeDirectoryAsync(uri: string, options?: { intermediates?: boolean }): Promise<void>;
  writeAsStringAsync(uri: string, contents: string, options?: { encoding?: string }): Promise<void>;
};

type ImageManipulatorModule = {
  manipulateAsync?: (
    uri: string,
    actions: Array<{ resize: { width: number } }>,
    saveOptions?: { compress?: number; format?: string; base64?: boolean },
  ) => Promise<{ uri: string }>;
  SaveFormat?: { JPEG?: string };
};

type GenerateAttendanceSlipOptions = {
  fileName?: string;
  maxRecordsPerChunk?: number;
  onProgress?: (progress: AttendanceSlipExportProgress) => void;
};

type PreparedSignatureState =
  | { state: "unsigned" }
  | { state: "on_file" }
  | { state: "image"; src: string };

type PreparedAttendanceSlipRecord = {
  id: string;
  meetingName: string;
  meetingAddress: string;
  startAtIso: string;
  endAtIso: string | null;
  durationSeconds: number | null;
  chairName?: string | null;
  chairRole?: string | null;
  signatureCapturedAtIso?: string | null;
  startLocation: LocationStamp;
  endLocation: LocationStamp;
  signatureState: PreparedSignatureState;
  signatureImageBytes: number;
};

type SignaturePayload =
  | { kind: "none" }
  | { kind: "file"; uri: string }
  | {
      kind: "base64";
      base64: string;
      extension: "svg" | "png" | "jpg";
    };

type SignaturePreparationRuntime = {
  fileSystem: FileSystemModule;
  imageManipulator: ImageManipulatorModule | null;
  signatureDirectory: string;
  cacheByAttendanceId: Map<string, string>;
};

type PreparedSignatureResult = {
  signatureState: PreparedSignatureState;
  imageBytes: number;
};

function loadModule<T>(name: string): T | null {
  try {
    const dynamicRequire: (moduleName: string) => unknown = require;
    return dynamicRequire(name) as T;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asSafeText(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function formatDateOnly(valueIso: string): string {
  const date = new Date(valueIso);
  if (Number.isNaN(date.getTime())) {
    return valueIso;
  }
  return date.toLocaleDateString();
}

function formatDateTime(valueIso: string | null): string {
  if (!valueIso) {
    return "In progress";
  }
  const date = new Date(valueIso);
  if (Number.isNaN(date.getTime())) {
    return valueIso;
  }
  return date.toLocaleString();
}

function formatDuration(durationSeconds: number | null): string {
  if (
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 0
  ) {
    return "Unknown";
  }
  const totalMinutes = Math.floor(durationSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes} min`;
  }
  return `${hours}h ${minutes}m`;
}

function asFiniteOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeLocationStamp(value: LocationStamp | null | undefined): LocationStamp {
  return {
    lat: asFiniteOrNull(value?.lat),
    lng: asFiniteOrNull(value?.lng),
    accuracyM: asFiniteOrNull(value?.accuracyM),
  };
}

function formatLocation(value: LocationStamp): string {
  const normalized = normalizeLocationStamp(value);
  if (normalized.lat === null || normalized.lng === null) {
    return "Unavailable";
  }
  const base = `${normalized.lat.toFixed(6)}, ${normalized.lng.toFixed(6)}`;
  if (normalized.accuracyM === null || !Number.isFinite(normalized.accuracyM)) {
    return base;
  }
  return `${base} (±${Math.round(normalized.accuracyM)}m)`;
}

function sanitizePdfFileName(fileName: string): string {
  const stripped = fileName
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length === 0) {
    return `${ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX}.pdf`;
  }
  return stripped.toLowerCase().endsWith(".pdf") ? stripped : `${stripped}.pdf`;
}

function fileNameWithoutPdfExtension(fileName: string): string {
  return fileName.replace(/\.pdf$/i, "");
}

function looksLikeFileUri(value: string): boolean {
  return value.startsWith("file://") || value.startsWith("/");
}

function estimateBase64Bytes(value: string): number {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return 0;
  }
  const paddingLength = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - paddingLength);
}

function normalizeIsoDate(value: unknown, fallback: string): string {
  const text = asSafeText(value, fallback);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
}

function normalizeDurationSeconds(
  value: unknown,
  startAtIso: string,
  endAtIso: string | null,
): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (!endAtIso) {
    return null;
  }
  const startMs = new Date(startAtIso).getTime();
  const endMs = new Date(endAtIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  return Math.floor((endMs - startMs) / 1000);
}

function sanitizeBase64Value(value: string): string | null {
  const cleaned = value.replace(/[^A-Za-z0-9+/=]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

function inferBase64ImageExtension(value: string): "svg" | "png" | "jpg" {
  const prefix = value.slice(0, 32);
  if (prefix.startsWith("PHN2Zy") || prefix.startsWith("PD94bW")) {
    return "svg";
  }
  if (prefix.startsWith("iVBOR")) {
    return "png";
  }
  if (prefix.startsWith("/9j/")) {
    return "jpg";
  }
  return "svg";
}

function parseSignaturePayload(value: unknown): SignaturePayload {
  if (typeof value !== "string") {
    return { kind: "none" };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { kind: "none" };
  }

  if (looksLikeFileUri(trimmed)) {
    return { kind: "file", uri: trimmed };
  }

  const dataUriMatch = trimmed.match(/^data:image\/([A-Za-z0-9.+-]+);base64,(.+)$/i);
  if (dataUriMatch) {
    const base64 = sanitizeBase64Value(dataUriMatch[2]);
    if (!base64) {
      return { kind: "none" };
    }
    const mimeSubtype = dataUriMatch[1].toLowerCase();
    const extension: "svg" | "png" | "jpg" = mimeSubtype.includes("png")
      ? "png"
      : mimeSubtype.includes("jpeg") || mimeSubtype.includes("jpg")
        ? "jpg"
        : "svg";
    return { kind: "base64", base64, extension };
  }

  const base64 = sanitizeBase64Value(trimmed);
  if (!base64) {
    return { kind: "none" };
  }

  return {
    kind: "base64",
    base64,
    extension: inferBase64ImageExtension(base64),
  };
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
  return cleaned.length > 0 ? cleaned : "attendance";
}

async function ensureDirectory(fileSystem: FileSystemModule, directoryUri: string): Promise<void> {
  try {
    await fileSystem.makeDirectoryAsync(directoryUri, { intermediates: true });
  } catch {
    // best-effort directory creation
  }
}

function getBase64EncodingLabel(fileSystem: FileSystemModule): string {
  return fileSystem.EncodingType?.Base64 ?? "base64";
}

async function getFileSizeBytes(fileSystem: FileSystemModule, uri: string): Promise<number | null> {
  try {
    const info = await fileSystem.getInfoAsync(uri);
    if (!info.exists) {
      return null;
    }
    if (typeof info.size === "number" && Number.isFinite(info.size) && info.size >= 0) {
      return info.size;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeBase64SignatureToFile(
  runtime: SignaturePreparationRuntime,
  attendanceId: string,
  base64: string,
  extension: "svg" | "png" | "jpg",
): Promise<string> {
  const safeAttendanceId = toSafeFileNamePart(attendanceId);
  const hash = createHash(base64.slice(0, 256));
  const targetUri = `${runtime.signatureDirectory}${safeAttendanceId}-${hash}.${extension}`;
  const existing = await runtime.fileSystem.getInfoAsync(targetUri);
  if (!existing.exists) {
    await runtime.fileSystem.writeAsStringAsync(targetUri, base64, {
      encoding: getBase64EncodingLabel(runtime.fileSystem),
    });
  }
  return targetUri;
}

async function compressSignatureIfPossible(
  runtime: SignaturePreparationRuntime,
  attendanceId: string,
  signatureUri: string,
  options?: { allowCompression?: boolean },
): Promise<string> {
  if (options?.allowCompression === false) {
    runtime.cacheByAttendanceId.set(attendanceId, signatureUri);
    return signatureUri;
  }

  const cached = runtime.cacheByAttendanceId.get(attendanceId);
  if (cached) {
    return cached;
  }

  const manipulator = runtime.imageManipulator;
  if (!manipulator?.manipulateAsync) {
    runtime.cacheByAttendanceId.set(attendanceId, signatureUri);
    return signatureUri;
  }

  const jpegFormat = manipulator.SaveFormat?.JPEG;
  try {
    const result = await manipulator.manipulateAsync(
      signatureUri,
      [{ resize: { width: MAX_SIGNATURE_WIDTH_PX } }],
      {
        compress: SIGNATURE_COMPRESS_QUALITY,
        format: jpegFormat,
        base64: false,
      },
    );
    const normalized =
      typeof result?.uri === "string" && result.uri.length > 0 ? result.uri : signatureUri;
    runtime.cacheByAttendanceId.set(attendanceId, normalized);
    return normalized;
  } catch {
    runtime.cacheByAttendanceId.set(attendanceId, signatureUri);
    return signatureUri;
  }
}

function hasRasterImageFileExtension(uri: string): boolean {
  const normalizedUri = uri.split("?")[0]?.split("#")[0]?.toLowerCase() ?? uri.toLowerCase();
  return (
    normalizedUri.endsWith(".png") ||
    normalizedUri.endsWith(".jpg") ||
    normalizedUri.endsWith(".jpeg") ||
    normalizedUri.endsWith(".webp") ||
    normalizedUri.endsWith(".heic")
  );
}

async function getCompressedSignatureUri(
  runtime: SignaturePreparationRuntime,
  attendanceId: string,
  signaturePngBase64: unknown,
): Promise<string | null> {
  const signaturePayload = parseSignaturePayload(signaturePngBase64);
  if (signaturePayload.kind === "none") {
    return null;
  }

  if (signaturePayload.kind === "file") {
    return compressSignatureIfPossible(runtime, attendanceId, signaturePayload.uri, {
      // iOS can hard-crash when manipulating vector files (especially SVG).
      allowCompression: hasRasterImageFileExtension(signaturePayload.uri),
    });
  }

  const expectedBytes = estimateBase64Bytes(signaturePayload.base64);
  if (expectedBytes <= 0) {
    return null;
  }

  const rawUri = await writeBase64SignatureToFile(
    runtime,
    attendanceId,
    signaturePayload.base64,
    signaturePayload.extension,
  );
  return compressSignatureIfPossible(runtime, attendanceId, rawUri, {
    allowCompression: signaturePayload.extension !== "svg",
  });
}

async function prepareSignatureState(
  runtime: SignaturePreparationRuntime,
  attendanceId: string,
  rawSignature: unknown,
): Promise<PreparedSignatureResult> {
  const signaturePayload = parseSignaturePayload(rawSignature);
  if (signaturePayload.kind === "none") {
    return { signatureState: { state: "unsigned" }, imageBytes: 0 };
  }

  let expectedBytes: number | null = null;

  if (signaturePayload.kind === "file") {
    if (!hasRasterImageFileExtension(signaturePayload.uri)) {
      return { signatureState: { state: "on_file" }, imageBytes: 0 };
    }
    expectedBytes = await getFileSizeBytes(runtime.fileSystem, signaturePayload.uri);
  } else {
    if (signaturePayload.extension === "svg") {
      return { signatureState: { state: "on_file" }, imageBytes: 0 };
    }
    expectedBytes = estimateBase64Bytes(signaturePayload.base64);
    if (expectedBytes <= 0) {
      return { signatureState: { state: "on_file" }, imageBytes: 0 };
    }
  }

  const compressedUri = await getCompressedSignatureUri(runtime, attendanceId, rawSignature);
  if (!compressedUri) {
    return { signatureState: { state: "on_file" }, imageBytes: 0 };
  }
  const compressedSize = await getFileSizeBytes(runtime.fileSystem, compressedUri);
  const estimatedSize = compressedSize ?? expectedBytes ?? 0;

  if (estimatedSize <= 0) {
    return { signatureState: { state: "on_file" }, imageBytes: 0 };
  }
  if (estimatedSize > MAX_SIGNATURE_EMBED_SINGLE_BYTES) {
    return { signatureState: { state: "on_file" }, imageBytes: 0 };
  }

  return { signatureState: { state: "image", src: compressedUri }, imageBytes: estimatedSize };
}

function sumEmbeddedSignatureBytes(records: PreparedAttendanceSlipRecord[]): number {
  return records.reduce((sum, record) => {
    if (record.signatureState.state !== "image" || record.signatureImageBytes <= 0) {
      return sum;
    }
    return sum + record.signatureImageBytes;
  }, 0);
}

function countEmbeddedSignatures(records: PreparedAttendanceSlipRecord[]): number {
  return records.reduce((sum, record) => {
    if (record.signatureState.state !== "image" || record.signatureImageBytes <= 0) {
      return sum;
    }
    return sum + 1;
  }, 0);
}

function enforceChunkSignatureBudget(
  records: PreparedAttendanceSlipRecord[],
): PreparedAttendanceSlipRecord[] {
  let runningTotal = 0;
  return records.map((record) => {
    if (record.signatureState.state !== "image" || record.signatureImageBytes <= 0) {
      return record;
    }
    if (runningTotal + record.signatureImageBytes > MAX_SIGNATURE_EMBED_TOTAL_BYTES_PER_CHUNK) {
      return {
        ...record,
        signatureState: { state: "on_file" },
        signatureImageBytes: 0,
      };
    }
    runningTotal += record.signatureImageBytes;
    return record;
  });
}

function buildChunkPlan(
  records: PreparedAttendanceSlipRecord[],
  preferredChunkSize: number,
): PreparedAttendanceSlipRecord[][] {
  const fallbackSizes = Array.from(new Set([preferredChunkSize, ...CHUNK_FALLBACK_RECORD_COUNTS]))
    .filter((size) => Number.isFinite(size) && size >= 1)
    .sort((left, right) => right - left);

  const chunks: PreparedAttendanceSlipRecord[][] = [];
  let cursor = 0;

  while (cursor < records.length) {
    const remaining = records.length - cursor;
    let selectedCount = 1;

    for (const candidate of fallbackSizes) {
      const bounded = Math.max(1, Math.min(candidate, remaining));
      const tentative = records.slice(cursor, cursor + bounded);
      if (sumEmbeddedSignatureBytes(tentative) <= MAX_SIGNATURE_EMBED_TOTAL_BYTES_PER_CHUNK) {
        selectedCount = bounded;
        break;
      }
      if (bounded === 1) {
        selectedCount = 1;
      }
    }

    chunks.push(records.slice(cursor, cursor + selectedCount));
    cursor += selectedCount;
  }

  return chunks;
}

function buildSignatureMarkup(
  signatureState: PreparedSignatureState,
  forceOnFileFallback: boolean,
): string {
  if (signatureState.state === "unsigned") {
    return '<p class="muted">Unsigned</p>';
  }
  if (forceOnFileFallback || signatureState.state === "on_file") {
    return '<p class="muted">Signature: On file (image unavailable)</p>';
  }
  return `<img alt="Chair signature" src="${escapeHtml(signatureState.src)}" style="width:100%;max-width:460px;border:1px solid #d5d9e4;border-radius:6px;"/>`;
}

function buildAttendancePage(
  record: PreparedAttendanceSlipRecord,
  profile: AttendanceSlipUserProfile,
  forceOnFileFallback: boolean,
): string {
  const chairIdentity = [record.chairName?.trim() ?? "", record.chairRole?.trim() ?? ""]
    .filter((entry) => entry.length > 0)
    .join(" • ");

  return `<section class="page">
    <h1>AA/NA Attendance Slip</h1>
    <p class="muted">Generated ${escapeHtml(new Date().toLocaleString())}</p>

    <table>
      <tr><td><strong>Participant</strong></td><td>${escapeHtml(asSafeText(profile.participantName, "Unknown"))}</td></tr>
      <tr><td><strong>Date</strong></td><td>${escapeHtml(formatDateOnly(record.startAtIso))}</td></tr>
      <tr><td><strong>Meeting</strong></td><td>${escapeHtml(asSafeText(record.meetingName, "Recovery Meeting"))}</td></tr>
      <tr><td><strong>Location</strong></td><td>${escapeHtml(asSafeText(record.meetingAddress, "Address unavailable"))}</td></tr>
      <tr><td><strong>Start</strong></td><td>${escapeHtml(formatDateTime(record.startAtIso))}</td></tr>
      <tr><td><strong>End</strong></td><td>${escapeHtml(formatDateTime(record.endAtIso))}</td></tr>
      <tr><td><strong>Duration</strong></td><td>${escapeHtml(formatDuration(record.durationSeconds))}</td></tr>
      <tr><td><strong>GPS Snapshot (start)</strong></td><td>${escapeHtml(formatLocation(record.startLocation))}</td></tr>
      <tr><td><strong>GPS Snapshot (end)</strong></td><td>${escapeHtml(formatLocation(record.endLocation))}</td></tr>
    </table>

    <h2>Chair Signature</h2>
    ${buildSignatureMarkup(record.signatureState, forceOnFileFallback)}
    <p><strong>Chair Printed Name</strong>: ${escapeHtml(chairIdentity || "Not provided")}</p>
    <p class="muted">Electronically captured signature${record.signatureCapturedAtIso ? ` at ${escapeHtml(formatDateTime(record.signatureCapturedAtIso))}` : ""}.</p>
  </section>`;
}

function buildAttendanceHtml(
  records: PreparedAttendanceSlipRecord[],
  profile: AttendanceSlipUserProfile,
  forceOnFileFallback: boolean,
): string {
  const pages = records
    .map((record) => buildAttendancePage(record, profile, forceOnFileFallback))
    .join("\n");
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>${ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #101828; margin: 0; padding: 0; }
      .page { page-break-after: always; padding: 24px; }
      .page:last-child { page-break-after: auto; }
      h1 { margin: 0 0 8px 0; font-size: 22px; }
      h2 { margin: 18px 0 8px 0; font-size: 16px; }
      p { margin: 6px 0; font-size: 13px; }
      .muted { color: #667085; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      td { border: 1px solid #e4e7ec; padding: 8px; font-size: 12px; vertical-align: top; }
      strong { font-weight: 600; }
    </style>
  </head>
  <body>
    ${pages}
  </body>
</html>`;
}

async function prepareRecordsForExport(
  records: AttendanceSlipRecord[],
  fileSystem: FileSystemModule,
  imageManipulator: ImageManipulatorModule | null,
  outputDirectory: string,
): Promise<PreparedAttendanceSlipRecord[]> {
  const signatureDirectory = `${outputDirectory}attendance-signatures/`;
  await ensureDirectory(fileSystem, signatureDirectory);

  const runtime: SignaturePreparationRuntime = {
    fileSystem,
    imageManipulator,
    signatureDirectory,
    cacheByAttendanceId: new Map<string, string>(),
  };

  const prepared: PreparedAttendanceSlipRecord[] = [];

  for (const sourceRecord of records) {
    const startAtIso = normalizeIsoDate(sourceRecord.startAtIso, new Date().toISOString());
    const normalizedEndAtIso = sourceRecord.endAtIso
      ? normalizeIsoDate(sourceRecord.endAtIso, sourceRecord.endAtIso)
      : null;
    const endAtIso =
      normalizedEndAtIso && Number.isFinite(new Date(normalizedEndAtIso).getTime())
        ? normalizedEndAtIso
        : null;

    const signatureResult = await prepareSignatureState(
      runtime,
      asSafeText(sourceRecord.id, `attendance-${prepared.length + 1}`),
      sourceRecord.signatureSvgBase64,
    );

    prepared.push({
      id: asSafeText(sourceRecord.id, `attendance-${prepared.length + 1}`),
      meetingName: asSafeText(sourceRecord.meetingName, "Recovery Meeting"),
      meetingAddress: asSafeText(sourceRecord.meetingAddress, "Address unavailable"),
      startAtIso,
      endAtIso,
      durationSeconds: normalizeDurationSeconds(sourceRecord.durationSeconds, startAtIso, endAtIso),
      chairName: sourceRecord.chairName ?? null,
      chairRole: sourceRecord.chairRole ?? null,
      signatureCapturedAtIso: sourceRecord.signatureCapturedAtIso ?? null,
      startLocation: normalizeLocationStamp(sourceRecord.startLocation),
      endLocation: normalizeLocationStamp(sourceRecord.endLocation),
      signatureState: signatureResult.signatureState,
      signatureImageBytes: signatureResult.imageBytes,
    });
  }

  return prepared.sort(
    (left, right) => new Date(left.startAtIso).getTime() - new Date(right.startAtIso).getTime(),
  );
}

function prepareRecordsForPrint(records: AttendanceSlipRecord[]): PreparedAttendanceSlipRecord[] {
  const prepared: PreparedAttendanceSlipRecord[] = [];

  for (const sourceRecord of records) {
    const startAtIso = normalizeIsoDate(sourceRecord.startAtIso, new Date().toISOString());
    const normalizedEndAtIso = sourceRecord.endAtIso
      ? normalizeIsoDate(sourceRecord.endAtIso, sourceRecord.endAtIso)
      : null;
    const endAtIso =
      normalizedEndAtIso && Number.isFinite(new Date(normalizedEndAtIso).getTime())
        ? normalizedEndAtIso
        : null;
    const signaturePayload = parseSignaturePayload(sourceRecord.signatureSvgBase64);
    const signatureState: PreparedSignatureState =
      signaturePayload.kind === "none" ? { state: "unsigned" } : { state: "on_file" };

    prepared.push({
      id: asSafeText(sourceRecord.id, `attendance-${prepared.length + 1}`),
      meetingName: asSafeText(sourceRecord.meetingName, "Recovery Meeting"),
      meetingAddress: asSafeText(sourceRecord.meetingAddress, "Address unavailable"),
      startAtIso,
      endAtIso,
      durationSeconds: normalizeDurationSeconds(sourceRecord.durationSeconds, startAtIso, endAtIso),
      chairName: sourceRecord.chairName ?? null,
      chairRole: sourceRecord.chairRole ?? null,
      signatureCapturedAtIso: sourceRecord.signatureCapturedAtIso ?? null,
      startLocation: normalizeLocationStamp(sourceRecord.startLocation),
      endLocation: normalizeLocationStamp(sourceRecord.endLocation),
      signatureState,
      signatureImageBytes: 0,
    });
  }

  return prepared.sort(
    (left, right) => new Date(left.startAtIso).getTime() - new Date(right.startAtIso).getTime(),
  );
}

export async function generateAttendanceSlipPdf(
  records: AttendanceSlipRecord[],
  profile: AttendanceSlipUserProfile,
  options?: GenerateAttendanceSlipOptions,
): Promise<string[]> {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("No attendance records selected for export.");
  }

  const printModule = loadModule<PrintModule>("expo-print");
  const fileSystemModule = loadModule<FileSystemModule>("expo-file-system");
  const imageManipulatorModule = loadModule<ImageManipulatorModule>("expo-image-manipulator");

  if (!printModule || !fileSystemModule) {
    throw new Error(
      "PDF export module unavailable. Install expo-print and expo-file-system then restart Metro.",
    );
  }

  const outputDirectory = fileSystemModule.cacheDirectory ?? fileSystemModule.documentDirectory;
  if (!outputDirectory) {
    throw new Error("No writable directory available for attendance export.");
  }

  const defaultFileName = `${ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX} - ${new Date().toISOString().slice(0, 10)}.pdf`;
  const fileName = sanitizePdfFileName(options?.fileName ?? defaultFileName);
  const baseFileName = fileNameWithoutPdfExtension(fileName);
  const preferredChunkSize = Math.max(
    1,
    Math.floor(options?.maxRecordsPerChunk ?? DEFAULT_RECORDS_PER_CHUNK),
  );

  const preparedRecords = await prepareRecordsForExport(
    records,
    fileSystemModule,
    imageManipulatorModule,
    outputDirectory,
  );
  const recordChunks = buildChunkPlan(preparedRecords, preferredChunkSize).map((chunk) =>
    enforceChunkSignatureBudget(chunk),
  );
  const outputUris: string[] = [];
  const chunkEmbeddedBytes: number[] = [];
  const chunkEmbeddedCount: number[] = [];
  const finalPdfBytes: number[] = [];
  let processedRecords = 0;

  for (let chunkIndex = 0; chunkIndex < recordChunks.length; chunkIndex += 1) {
    const chunkRecordsForPdf = recordChunks[chunkIndex];
    processedRecords += chunkRecordsForPdf.length;
    chunkEmbeddedBytes.push(sumEmbeddedSignatureBytes(chunkRecordsForPdf));
    chunkEmbeddedCount.push(countEmbeddedSignatures(chunkRecordsForPdf));
    options?.onProgress?.({
      chunkIndex: chunkIndex + 1,
      chunkCount: recordChunks.length,
      processedRecords,
      totalRecords: preparedRecords.length,
    });

    let printed = null as { uri: string } | null;
    try {
      const html = buildAttendanceHtml(chunkRecordsForPdf, profile, false);
      printed = await printModule.printToFileAsync({ html, width: 612, height: 792 });
    } catch {
      // Retry this chunk in explicit fallback mode so export succeeds without crashing.
      const fallbackHtml = buildAttendanceHtml(chunkRecordsForPdf, profile, true);
      printed = await printModule.printToFileAsync({ html: fallbackHtml, width: 612, height: 792 });
    }

    const chunkFileName =
      recordChunks.length === 1
        ? fileName
        : `${baseFileName} (Part ${chunkIndex + 1} of ${recordChunks.length}).pdf`;
    const targetUri = `${outputDirectory}${sanitizePdfFileName(chunkFileName)}`;
    const existing = await fileSystemModule.getInfoAsync(targetUri);
    if (existing.exists) {
      await fileSystemModule.deleteAsync(targetUri, { idempotent: true });
    }
    await fileSystemModule.moveAsync({ from: printed.uri, to: targetUri });
    outputUris.push(targetUri);
    finalPdfBytes.push((await getFileSizeBytes(fileSystemModule, targetUri)) ?? 0);
  }

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[attendance-export][pdf-debug]", {
      selectedCount: records.length,
      chunkCount: recordChunks.length,
      signaturesEmbedded: chunkEmbeddedCount.reduce((sum, value) => sum + value, 0),
      chunkEmbeddedBytes,
      finalPdfBytes,
      totalFinalPdfBytes: finalPdfBytes.reduce((sum, value) => sum + value, 0),
    });
  }

  return outputUris;
}

export async function printAttendanceSlipPdf(
  records: AttendanceSlipRecord[],
  profile: AttendanceSlipUserProfile,
  options?: GenerateAttendanceSlipOptions,
): Promise<void> {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("No attendance records selected for export.");
  }

  const printModule = loadModule<PrintModule>("expo-print");
  if (!printModule || typeof printModule.printAsync !== "function") {
    throw new Error("Print module unavailable. Install expo-print then restart Metro.");
  }

  const preferredChunkSize = Math.max(
    1,
    Math.floor(options?.maxRecordsPerChunk ?? DEFAULT_RECORDS_PER_CHUNK),
  );

  // Printing route is intentionally lightweight: avoid image manipulation/file rewriting
  // because iOS can crash in native modules on some signature payloads.
  const preparedRecords = prepareRecordsForPrint(records);
  const recordChunks = buildChunkPlan(preparedRecords, preferredChunkSize);

  let processedRecords = 0;
  for (let chunkIndex = 0; chunkIndex < recordChunks.length; chunkIndex += 1) {
    const chunkRecordsForPdf = recordChunks[chunkIndex];
    processedRecords += chunkRecordsForPdf.length;
    options?.onProgress?.({
      chunkIndex: chunkIndex + 1,
      chunkCount: recordChunks.length,
      processedRecords,
      totalRecords: preparedRecords.length,
    });

    const html = buildAttendanceHtml(chunkRecordsForPdf, profile, true);
    await printModule.printAsync({ html });
  }
}

export async function shareAttendanceSlipPdf(
  uriOrUris: string | string[],
  fileName?: string,
): Promise<void> {
  const sharingModule = loadModule<SharingModule>("expo-sharing");
  if (!sharingModule) {
    throw new Error("Share module unavailable. Install expo-sharing then restart Metro.");
  }

  const uris = Array.isArray(uriOrUris)
    ? uriOrUris.filter((uri) => uri.trim().length > 0)
    : [uriOrUris];
  if (uris.length === 0) {
    throw new Error("No exported PDF file available to share.");
  }

  const canShare = await sharingModule.isAvailableAsync();
  if (!canShare) {
    throw new Error("Share sheet unavailable on this device.");
  }

  for (let index = 0; index < uris.length; index += 1) {
    const uri = uris[index];
    const dialogTitle =
      uris.length === 1
        ? (fileName ?? ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX)
        : `${fileName ?? ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX} (${index + 1}/${uris.length})`;

    await sharingModule.shareAsync(uri, {
      UTI: "com.adobe.pdf",
      mimeType: "application/pdf",
      dialogTitle,
    });
  }
}
