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
  officerName?: string | null;
  tenantLabel?: string | null;
};

export type AttendanceSlipExportProgress = {
  chunkIndex: number;
  chunkCount: number;
  processedRecords: number;
  totalRecords: number;
};

type PrintModule = {
  printAsync(input: { html?: string; uri?: string; printerUrl?: string }): Promise<void>;
  printToFileAsync(input: {
    html: string;
    width?: number;
    height?: number;
  }): Promise<{ uri: string }>;
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
  | { kind: "svg_markup"; svg: string }
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

function looksLikeSvgMarkup(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith("<svg") || (normalized.startsWith("<?xml") && normalized.includes("<svg"))
  );
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

  if (looksLikeSvgMarkup(trimmed)) {
    return { kind: "svg_markup", svg: trimmed };
  }

  const svgDataUriMatch = trimmed.match(
    /^data:image\/svg\+xml(?:;charset=[^;,]+)?(?:;(?:utf8|utf-8))?,(.*)$/i,
  );
  if (svgDataUriMatch) {
    try {
      return { kind: "svg_markup", svg: decodeURIComponent(svgDataUriMatch[1]) };
    } catch {
      return { kind: "svg_markup", svg: svgDataUriMatch[1] };
    }
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
  if (signaturePayload.kind === "svg_markup") {
    return null;
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
  } else if (signaturePayload.kind === "base64") {
    if (signaturePayload.extension === "svg") {
      return { signatureState: { state: "on_file" }, imageBytes: 0 };
    }
    expectedBytes = estimateBase64Bytes(signaturePayload.base64);
    if (expectedBytes <= 0) {
      return { signatureState: { state: "on_file" }, imageBytes: 0 };
    }
  } else {
    return { signatureState: { state: "on_file" }, imageBytes: 0 };
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

function formatTimeOnly(valueIso: string): string {
  const date = new Date(valueIso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function chunkRecords<T>(records: T[], chunkSize: number): T[][] {
  if (records.length === 0) {
    return [[]];
  }
  const chunks: T[][] = [];
  for (let index = 0; index < records.length; index += chunkSize) {
    chunks.push(records.slice(index, index + chunkSize));
  }
  return chunks;
}

function buildSignatureCell(
  record: PreparedAttendanceSlipRecord,
  forceOnFileFallback: boolean,
): string {
  const chairBits = [record.chairName?.trim() ?? "", record.chairRole?.trim() ?? ""].filter(
    (entry) => entry.length > 0,
  );
  const hasSignature = record.signatureState.state !== "unsigned";

  if (hasSignature && chairBits.length > 0) {
    return `${escapeHtml(chairBits.join(" - "))} (signed)`;
  }
  if (hasSignature) {
    return forceOnFileFallback || record.signatureState.state === "on_file"
      ? "Signature on file"
      : "Signed (digital)";
  }
  if (chairBits.length > 0) {
    return escapeHtml(chairBits.join(" - "));
  }
  return "";
}

function buildAttendanceRow(
  record: PreparedAttendanceSlipRecord,
  forceOnFileFallback: boolean,
): string {
  const meetingName = asSafeText(record.meetingName, "Recovery Meeting");
  const meetingAddress = asSafeText(record.meetingAddress, "");
  const groupCell = meetingAddress.length > 0 ? `${meetingName} - ${meetingAddress}` : meetingName;
  return `<tr>
    <td>${escapeHtml(formatDateOnly(record.startAtIso))}</td>
    <td>${escapeHtml(formatTimeOnly(record.startAtIso))}</td>
    <td>${escapeHtml(groupCell)}</td>
    <td>${buildSignatureCell(record, forceOnFileFallback)}</td>
  </tr>`;
}

function buildBlankRows(count: number): string {
  if (count <= 0) {
    return "";
  }
  return Array.from({ length: count })
    .map(() => "<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>")
    .join("");
}

function buildAttendancePage(
  pageRecords: PreparedAttendanceSlipRecord[],
  profile: AttendanceSlipUserProfile,
  forceOnFileFallback: boolean,
  pageNumber: number,
  totalPages: number,
): string {
  const rowCountPerPage = 22;
  const pageRows = pageRecords
    .map((entry) => buildAttendanceRow(entry, forceOnFileFallback))
    .join("\n");
  const blankRows = buildBlankRows(Math.max(0, rowCountPerPage - pageRecords.length));
  const participantName = escapeHtml(asSafeText(profile.participantName, ""));
  const officerName = escapeHtml(asSafeText(profile.officerName, ""));
  const generatedAt = escapeHtml(new Date().toLocaleString());

  return `<section class="page">
    <h1>AA/NA ATTENDANCE SHEET</h1>
    <div class="header-lines">
      <div class="line-item">
        <span class="label">Name:</span>
        <span class="line-value">${participantName}</span>
      </div>
      <div class="line-item">
        <span class="label">Officer's Name:</span>
        <span class="line-value">${officerName}</span>
      </div>
    </div>

    <p class="attestation">
      The following record is an accurate account of the AA meeting(s) I have attended. I understand
      that falsifying or altering this document may constitute a criminal offense if legally required.
    </p>

    <table class="attendance-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Time</th>
          <th>Group Name</th>
          <th>Signature</th>
        </tr>
      </thead>
      <tbody>
        ${pageRows}
        ${blankRows}
      </tbody>
    </table>

    <div class="footer-line">
      <span class="label">Meeting Person's Signature</span>
      <span class="line"></span>
    </div>

    <p class="meta">
      Generated ${generatedAt} • Page ${pageNumber} of ${totalPages}
    </p>
  </section>`;
}

function buildAttendanceHtml(
  records: PreparedAttendanceSlipRecord[],
  profile: AttendanceSlipUserProfile,
  forceOnFileFallback: boolean,
): string {
  const rowCountPerPage = 22;
  const pagesData = chunkRecords(records, rowCountPerPage);
  const pages = pagesData
    .map((pageRecords, index) =>
      buildAttendancePage(pageRecords, profile, forceOnFileFallback, index + 1, pagesData.length),
    )
    .join("\n");
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>${ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX}</title>
    <style>
      body { font-family: 'Times New Roman', serif; color: #111111; margin: 0; padding: 0; }
      .page { page-break-after: always; padding: 26px 28px; }
      .page:last-child { page-break-after: auto; }
      h1 { margin: 0 0 14px 0; font-size: 26px; letter-spacing: 0.6px; text-align: center; }
      .header-lines { display: flex; gap: 24px; margin-bottom: 12px; }
      .line-item { display: flex; align-items: center; flex: 1; gap: 8px; }
      .line-item .label { font-size: 13px; font-weight: 700; white-space: nowrap; }
      .line-value { border-bottom: 1px solid #111111; min-height: 18px; flex: 1; font-size: 12px; line-height: 18px; }
      .attestation { margin: 10px 0 14px 0; font-size: 11px; line-height: 1.35; }
      .attendance-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .attendance-table th, .attendance-table td { border: 1px solid #111111; font-size: 10px; padding: 4px 5px; vertical-align: middle; }
      .attendance-table th { background: #efefef; text-align: center; font-size: 10px; }
      .attendance-table td:nth-child(1), .attendance-table th:nth-child(1) { width: 16%; }
      .attendance-table td:nth-child(2), .attendance-table th:nth-child(2) { width: 12%; text-align: center; }
      .attendance-table td:nth-child(3), .attendance-table th:nth-child(3) { width: 42%; }
      .attendance-table td:nth-child(4), .attendance-table th:nth-child(4) { width: 30%; }
      .attendance-table tbody td { height: 19px; }
      .footer-line { margin-top: 14px; display: flex; align-items: center; gap: 10px; }
      .footer-line .label { font-size: 13px; font-weight: 700; white-space: nowrap; }
      .footer-line .line { border-bottom: 1px solid #111111; flex: 1; min-height: 16px; }
      .meta { margin-top: 8px; color: #444444; font-size: 10px; text-align: right; }
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

  // iOS stability mode:
  // Avoid native signature image processing during export (this has been a crash hot path
  // on some devices). We still export all meeting rows and mark signatures as "On file".
  const preparedRecords = prepareRecordsForPrint(records);
  const recordChunks = buildChunkPlan(preparedRecords, preferredChunkSize);
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

    const html = buildAttendanceHtml(chunkRecordsForPdf, profile, true);
    const printed = await printModule.printToFileAsync({ html, width: 612, height: 792 });

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
