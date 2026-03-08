import {
  estimateBase64Bytes,
  looksLikeFileUri,
  normalizeSignatureValueToRef,
  signatureRefToDataUri,
  type SignatureFileSystemModule,
} from "../signatures/signatureStore";

export const ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX = "AA-NA Attendance Slip";
const MAX_EXPORT_RECORDS = 25;
const MAX_SIGNATURE_SVG_BYTES = 150_000;
const MAX_SIGNATURE_PNG_BYTES = 250_000;
const MAX_TOTAL_HTML_BYTES = 1_200_000;
const MAX_SIGNATURE_EMBED_BUDGET_BYTES = 700_000;
const MAX_CHUNK_COUNT = 5;
const SIGNATURE_ROTATION_DEGREES = -45;

export type AttendanceSlipRecord = {
  id: string;
  meetingName: string;
  meetingAddress: string;
  startAtIso: string;
  endAtIso: string | null;
  durationSeconds: number | null;
  signatureRefUri: string | null;
  // Legacy compatibility for historical callers.
  legacySignatureSvgBase64?: string | null;
  chairName?: string | null;
  chairRole?: string | null;
  signatureCapturedAtIso?: string | null;
  startLocation: {
    lat: number | null;
    lng: number | null;
    accuracyM: number | null;
  };
  endLocation: {
    lat: number | null;
    lng: number | null;
    accuracyM: number | null;
  };
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

type FileSystemModule = SignatureFileSystemModule & {
  cacheDirectory?: string;
  documentDirectory?: string;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
  moveAsync(input: { from: string; to: string }): Promise<void>;
};

type GenerateAttendanceSlipOptions = {
  fileName?: string;
  maxRecordsPerChunk?: number;
  onProgress?: (progress: AttendanceSlipExportProgress) => void;
};

type SignatureMode = "file_svg" | "file_png" | "inline_svg" | "base64_png" | "placeholder";
type SignatureModeCounts = {
  file_svg: number;
  file_png: number;
  inline_svg: number;
  base64_png: number;
  placeholder: number;
};

export type AttendanceExportDiagnostics = {
  safeMode: boolean;
  forcedPlaceholderSignatures: boolean;
  records: number;
  htmlBytes: number;
  maxHtmlBytes: number;
  htmlUtilizationPct: number;
  signatureEmbedBudgetUsedBytes: number;
  signatureEmbedBudgetMaxBytes: number;
  signatureBudgetUtilizationPct: number;
  signatureModes: SignatureModeCounts;
  caps: {
    maxSignatureSvgBytes: number;
    maxSignaturePngBytes: number;
  };
};

type SignatureRenderState =
  | { state: "unsigned" }
  | { state: "on_file" }
  | { state: "image_data_uri"; dataUri: string }
  | { state: "image_inline_svg"; svgMarkup: string };

type PreparedRecord = {
  id: string;
  meetingName: string;
  meetingAddress: string;
  startAtIso: string;
  endAtIso: string | null;
  durationSeconds: number | null;
  chairName: string | null;
  chairRole: string | null;
  signatureState: SignatureRenderState;
  signatureMode: SignatureMode;
  signatureBytes: number;
  signatureCapBytes: number;
};

type HtmlChunkPlan = {
  chunkCount: number;
  chunks: { records: PreparedRecord[]; html: string; bytes: number }[];
  htmlBytesByChunk: number[];
  totalHtmlBytes: number;
  exceedsPerChunkCap: boolean;
  exceedsTotalCap: boolean;
};

let attendanceSlipExportInFlight = false;
let attendanceSlipShareInFlight = false;

function loadModule<T>(name: string): T | null {
  try {
    switch (name) {
      case "expo-print":
        return require("expo-print") as T;
      case "expo-sharing":
        return require("expo-sharing") as T;
      case "expo-file-system":
        try {
          return require("expo-file-system/legacy") as T;
        } catch {
          return require("expo-file-system") as T;
        }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function utf8ByteLength(value: string): number {
  try {
    return new TextEncoder().encode(value).length;
  } catch {
    return value.length;
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

function withChunkSuffix(fileName: string, chunkIndex: number, chunkCount: number): string {
  if (chunkCount <= 1) {
    return fileName;
  }
  const normalized = fileName.toLowerCase().endsWith(".pdf") ? fileName.slice(0, -4) : fileName;
  return sanitizePdfFileName(`${normalized} - Part ${chunkIndex}/${chunkCount}.pdf`);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateTimeLocal(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    return "";
  }
  const month = pad2(value.getMonth() + 1);
  const day = pad2(value.getDate());
  const year = value.getFullYear();
  const hour24 = value.getHours();
  const minute = pad2(value.getMinutes());
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${month}/${day}/${year} ${hour12}:${minute} ${meridiem}`;
}

function formatDateOnly(valueIso: string): string {
  const date = new Date(valueIso);
  if (Number.isNaN(date.getTime())) {
    return valueIso;
  }
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

function formatTimeOnly(valueIso: string): string {
  const date = new Date(valueIso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const hour24 = date.getHours();
  const minute = pad2(date.getMinutes());
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute} ${meridiem}`;
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

function sanitizeBase64(value: string): string | null {
  const cleaned = value.replace(/[^A-Za-z0-9+/=]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

function sanitizeSvgMarkup(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().includes("<svg")) {
    return null;
  }
  const withoutScripts = trimmed.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  const withoutHandlers = withoutScripts
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
  return withoutHandlers.length > 0 ? withoutHandlers : null;
}

function detectSignatureSourceMode(rawSignature: string): SignatureMode {
  const trimmed = rawSignature.trim();
  const lower = trimmed.toLowerCase();

  if (looksLikeFileUri(trimmed)) {
    return lower.endsWith(".svg") ? "file_svg" : "file_png";
  }
  if (
    lower.startsWith("<svg") ||
    lower.startsWith("<?xml") ||
    lower.startsWith("data:image/svg+xml") ||
    lower.startsWith("phn2zy") ||
    lower.startsWith("pd94bw")
  ) {
    return "inline_svg";
  }
  if (lower.startsWith("data:image/png") || lower.startsWith("data:image/jpeg")) {
    return "base64_png";
  }

  const cleaned = sanitizeBase64(trimmed);
  if (!cleaned) {
    return "placeholder";
  }
  return cleaned.startsWith("iVBOR") || cleaned.startsWith("/9j/") ? "base64_png" : "inline_svg";
}

function countSignatureModes(records: PreparedRecord[]): SignatureModeCounts {
  const counts: SignatureModeCounts = {
    file_svg: 0,
    file_png: 0,
    inline_svg: 0,
    base64_png: 0,
    placeholder: 0,
  };
  for (const record of records) {
    counts[record.signatureMode] += 1;
  }
  return counts;
}

function peakSignatureUsage(records: PreparedRecord[]): { bytes: number; cap: number } {
  return records.reduce(
    (acc, record) => {
      const ratio =
        record.signatureCapBytes > 0 ? record.signatureBytes / record.signatureCapBytes : 0;
      return ratio > acc.ratio
        ? { ratio, bytes: record.signatureBytes, cap: record.signatureCapBytes }
        : acc;
    },
    { ratio: 0, bytes: 0, cap: MAX_SIGNATURE_PNG_BYTES },
  );
}

function summarizeExportPlan(input: {
  recordsCount: number;
  htmlBytesByChunk: number[];
  signatureModes: SignatureModeCounts;
  maxSignatureBytes: number;
  maxSignatureCapBytes: number;
}) {
  const totalHtmlBytes = input.htmlBytesByChunk.reduce((sum, value) => sum + value, 0);
  const maxChunkBytes = input.htmlBytesByChunk.reduce((max, value) => Math.max(max, value), 0);
  const approachingHtmlCap = totalHtmlBytes >= Math.floor(MAX_TOTAL_HTML_BYTES * 0.85);
  const capUsed =
    input.maxSignatureCapBytes > 0 ? input.maxSignatureCapBytes : MAX_SIGNATURE_PNG_BYTES;
  const approachingSigCap = input.maxSignatureBytes > Math.floor(capUsed * 0.85);

  return {
    records: input.recordsCount,
    chunks: input.htmlBytesByChunk.length,
    htmlBytesByChunk: input.htmlBytesByChunk,
    totalHtmlBytes,
    maxChunkBytes,
    signatureModes: input.signatureModes,
    caps: {
      maxTotalHtmlBytes: MAX_TOTAL_HTML_BYTES,
      maxSignatureSvgBytes: MAX_SIGNATURE_SVG_BYTES,
      maxSignaturePngBytes: MAX_SIGNATURE_PNG_BYTES,
      maxSignatureEmbedBudgetBytes: MAX_SIGNATURE_EMBED_BUDGET_BYTES,
    },
    approachingCaps: {
      approachingHtmlCap,
      approachingSigCap,
    },
  };
}

function logExportPlan(plan: ReturnType<typeof summarizeExportPlan>) {
  console.log("[attendance-export] plan", plan);
}

function logExportDegrade(reason: string, plan: ReturnType<typeof summarizeExportPlan>) {
  console.log("[attendance-export] degrade", { reason, ...plan });
}

function logExportFail(error: unknown, plan: ReturnType<typeof summarizeExportPlan> | null) {
  console.log("[attendance-export] fail", {
    message: error instanceof Error ? error.message : String(error),
    plan,
  });
}

function isPlanWithinCaps(plan: HtmlChunkPlan): boolean {
  return !plan.exceedsPerChunkCap && !plan.exceedsTotalCap;
}

function buildSignatureCell(record: PreparedRecord): string {
  const chairBits = [record.chairName ?? "", record.chairRole ?? ""].filter(
    (entry) => entry.trim().length > 0,
  );
  const chairLine = chairBits.length > 0 ? `<div>${escapeHtml(chairBits.join(" - "))}</div>` : "";

  if (record.signatureState.state === "image_data_uri") {
    return `${chairLine}<div class="sig-image-wrap"><img alt="Signature" src="${escapeHtml(record.signatureState.dataUri)}" class="sig-image" /></div>`;
  }
  if (record.signatureState.state === "image_inline_svg") {
    return `${chairLine}<div class="sig-svg">${record.signatureState.svgMarkup}</div>`;
  }
  if (record.signatureState.state === "on_file") {
    return `${chairLine}<div class="sig-text">Signature on file</div>`;
  }
  return chairLine.length > 0 ? chairLine : `<div class="sig-text">Unsigned</div>`;
}

function buildAttendanceRow(record: PreparedRecord): string {
  return `<tr>
    <td>${escapeHtml(formatDateOnly(record.startAtIso))}</td>
    <td>${escapeHtml(asSafeText(record.meetingName, "Recovery Meeting"))}</td>
    <td>${escapeHtml(formatTimeOnly(record.startAtIso))}</td>
    <td>${escapeHtml(formatDuration(record.durationSeconds))}</td>
    <td>${buildSignatureCell(record)}</td>
  </tr>`;
}

function buildAttendanceHtml(
  records: PreparedRecord[],
  profile: AttendanceSlipUserProfile,
): string {
  const participantName = escapeHtml(asSafeText(profile.participantName, ""));
  const officerName = escapeHtml(asSafeText(profile.officerName, ""));
  const generatedAt = escapeHtml(formatDateTimeLocal(new Date()));

  const rows = records.map((entry) => buildAttendanceRow(entry)).join("\n");

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>${ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX}</title>
    <style>
      @page { size: letter portrait; margin: 18px; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #111111; margin: 0; }
      h1 { margin: 0 0 10px 0; font-size: 21px; letter-spacing: 0.2px; text-align: center; }
      .header { margin-bottom: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .line { border-bottom: 1px solid #111; min-height: 16px; font-size: 12px; }
      .label { font-size: 12px; font-weight: 700; margin-right: 6px; }
      .attestation { font-size: 11px; line-height: 1.35; margin: 8px 0 12px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #111; padding: 5px; vertical-align: middle; font-size: 10px; }
      th { background: #efefef; text-align: center; }
      td:nth-child(1), th:nth-child(1) { width: 14%; }
      td:nth-child(2), th:nth-child(2) { width: 34%; }
      td:nth-child(3), th:nth-child(3) { width: 13%; text-align: center; }
      td:nth-child(4), th:nth-child(4) { width: 13%; text-align: center; }
      td:nth-child(5), th:nth-child(5) { width: 26%; }
      .sig-image-wrap { display: flex; align-items: center; justify-content: center; min-height: 56px; overflow: hidden; }
      .sig-image { display: block; max-width: 100%; max-height: 52px; object-fit: contain; transform: rotate(${SIGNATURE_ROTATION_DEGREES}deg) scale(0.92); transform-origin: center center; }
      .sig-svg svg { display: block; max-width: 100%; max-height: 52px; }
      .sig-text { color: #444; font-size: 10px; }
      .meta { margin-top: 8px; color: #555; font-size: 10px; text-align: right; }
    </style>
  </head>
  <body>
    <h1>AA/NA ATTENDANCE SHEET</h1>

    <div class="header">
      <div><span class="label">Name:</span><span class="line">${participantName}</span></div>
      <div><span class="label">Officer:</span><span class="line">${officerName}</span></div>
    </div>

    <div class="attestation">
      The following record is an accurate account of the AA/NA meeting(s) I attended.
    </div>

    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Meeting Name</th>
          <th>Start Time</th>
          <th>Duration</th>
          <th>Signature</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="meta">Generated ${generatedAt}</div>
  </body>
</html>`;
}

function splitRecordsByChunkCount(
  records: PreparedRecord[],
  chunkCount: number,
): PreparedRecord[][] {
  const safeCount = Math.max(1, Math.min(chunkCount, records.length || 1));
  const recordsPerChunk = Math.ceil(records.length / safeCount);
  const chunks: PreparedRecord[][] = [];
  for (let index = 0; index < records.length; index += recordsPerChunk) {
    chunks.push(records.slice(index, index + recordsPerChunk));
  }
  return chunks;
}

function buildHtmlChunkPlan(
  records: PreparedRecord[],
  profile: AttendanceSlipUserProfile,
  requestedChunkCount: number,
): HtmlChunkPlan {
  const chunksByRecord = splitRecordsByChunkCount(records, requestedChunkCount);
  const chunks = chunksByRecord.map((chunkRecords) => {
    const html = buildAttendanceHtml(chunkRecords, profile);
    const bytes = utf8ByteLength(html);
    return { records: chunkRecords, html, bytes };
  });
  const htmlBytesByChunk = chunks.map((chunk) => chunk.bytes);
  const totalHtmlBytes = htmlBytesByChunk.reduce((sum, value) => sum + value, 0);
  const perChunkLimit = MAX_TOTAL_HTML_BYTES / Math.max(1, chunks.length);

  return {
    chunkCount: chunks.length,
    chunks,
    htmlBytesByChunk,
    totalHtmlBytes,
    exceedsPerChunkCap: chunks.some((chunk) => chunk.bytes > perChunkLimit),
    exceedsTotalCap: totalHtmlBytes > MAX_TOTAL_HTML_BYTES,
  };
}

function estimateSignatureBytes(raw: string, mode: SignatureMode): { bytes: number; cap: number } {
  if (mode === "file_svg" || mode === "inline_svg") {
    return { bytes: utf8ByteLength(raw), cap: MAX_SIGNATURE_SVG_BYTES };
  }
  if (mode === "file_png" || mode === "base64_png") {
    const cleaned = sanitizeBase64(raw.replace(/^data:[^,]+,/i, ""));
    return {
      bytes: cleaned ? estimateBase64Bytes(cleaned) : 0,
      cap: MAX_SIGNATURE_PNG_BYTES,
    };
  }
  return { bytes: 0, cap: MAX_SIGNATURE_PNG_BYTES };
}

async function resolveSignatureState(
  fileSystemModule: SignatureFileSystemModule | null,
  record: AttendanceSlipRecord,
  subdirectory: string,
  forcePlaceholder: boolean,
): Promise<{
  state: SignatureRenderState;
  mode: SignatureMode;
  signatureBytes: number;
  signatureCap: number;
}> {
  const rawSignature = [record.signatureRefUri, record.legacySignatureSvgBase64]
    .find((entry) => typeof entry === "string" && entry.trim().length > 0)
    ?.trim();
  if (!rawSignature) {
    return {
      state: { state: "unsigned" },
      mode: "placeholder",
      signatureBytes: 0,
      signatureCap: MAX_SIGNATURE_PNG_BYTES,
    };
  }

  const sourceMode = detectSignatureSourceMode(rawSignature);
  const estimated = estimateSignatureBytes(rawSignature, sourceMode);
  if (forcePlaceholder || !fileSystemModule) {
    return {
      state: { state: "on_file" },
      mode: "placeholder",
      signatureBytes: estimated.bytes,
      signatureCap: estimated.cap,
    };
  }

  const shouldVerifyFileExists = looksLikeFileUri(rawSignature);
  const normalized = await normalizeSignatureValueToRef(rawSignature, {
    fileSystem: fileSystemModule,
    recordId: asSafeText(record.id, "signature"),
    subdirectory,
    verifyFileExists: shouldVerifyFileExists,
  });

  if (!normalized.ref) {
    return {
      state: { state: "unsigned" },
      mode: "placeholder",
      signatureBytes: estimated.bytes,
      signatureCap: estimated.cap,
    };
  }

  try {
    const info = await fileSystemModule.getInfoAsync(normalized.ref.uri);
    const bytes =
      typeof info.size === "number" && Number.isFinite(info.size) ? info.size : estimated.bytes;

    if (normalized.ref.mimeType === "image/svg+xml") {
      if (bytes > MAX_SIGNATURE_SVG_BYTES) {
        return {
          state: { state: "on_file" },
          mode: "placeholder",
          signatureBytes: bytes,
          signatureCap: MAX_SIGNATURE_SVG_BYTES,
        };
      }

      const svgText = await fileSystemModule.readAsStringAsync(normalized.ref.uri, {
        encoding: fileSystemModule.EncodingType?.UTF8 ?? "utf8",
      });
      const sanitizedSvg = sanitizeSvgMarkup(svgText);
      if (!sanitizedSvg) {
        return {
          state: { state: "on_file" },
          mode: "placeholder",
          signatureBytes: bytes,
          signatureCap: MAX_SIGNATURE_SVG_BYTES,
        };
      }

      return {
        state: { state: "image_inline_svg", svgMarkup: sanitizedSvg },
        mode: sourceMode === "inline_svg" ? "inline_svg" : "file_svg",
        signatureBytes: bytes,
        signatureCap: MAX_SIGNATURE_SVG_BYTES,
      };
    }

    if (bytes > MAX_SIGNATURE_PNG_BYTES) {
      return {
        state: { state: "on_file" },
        mode: "placeholder",
        signatureBytes: bytes,
        signatureCap: MAX_SIGNATURE_PNG_BYTES,
      };
    }

    const encoded = await signatureRefToDataUri({
      fileSystem: fileSystemModule,
      ref: normalized.ref,
      maxBytes: MAX_SIGNATURE_PNG_BYTES,
    });
    if (!encoded.dataUri) {
      return {
        state: { state: "on_file" },
        mode: "placeholder",
        signatureBytes: encoded.bytes || bytes,
        signatureCap: MAX_SIGNATURE_PNG_BYTES,
      };
    }

    return {
      state: { state: "image_data_uri", dataUri: encoded.dataUri },
      mode: sourceMode === "base64_png" ? "base64_png" : "file_png",
      signatureBytes: encoded.bytes || bytes,
      signatureCap: MAX_SIGNATURE_PNG_BYTES,
    };
  } catch {
    return {
      state: { state: "on_file" },
      mode: "placeholder",
      signatureBytes: estimated.bytes,
      signatureCap: estimated.cap,
    };
  }
}

async function prepareRecordsForExport(
  records: AttendanceSlipRecord[],
  fileSystemModule: SignatureFileSystemModule | null,
  options: { forcePlaceholderSignatures: boolean },
): Promise<PreparedRecord[]> {
  const prepared: PreparedRecord[] = [];
  const signatureSubdirectory = "attendance-signatures";

  for (const sourceRecord of records) {
    const startAtIso = normalizeIsoDate(sourceRecord.startAtIso, new Date().toISOString());
    const normalizedEndAtIso = sourceRecord.endAtIso
      ? normalizeIsoDate(sourceRecord.endAtIso, sourceRecord.endAtIso)
      : null;
    const endAtIso =
      normalizedEndAtIso && Number.isFinite(new Date(normalizedEndAtIso).getTime())
        ? normalizedEndAtIso
        : null;

    const signature = await resolveSignatureState(
      fileSystemModule,
      sourceRecord,
      signatureSubdirectory,
      options.forcePlaceholderSignatures,
    );

    prepared.push({
      id: asSafeText(sourceRecord.id, `attendance-${prepared.length + 1}`),
      meetingName: asSafeText(sourceRecord.meetingName, "Recovery Meeting"),
      meetingAddress: asSafeText(sourceRecord.meetingAddress, "Address unavailable"),
      startAtIso,
      endAtIso,
      durationSeconds: normalizeDurationSeconds(sourceRecord.durationSeconds, startAtIso, endAtIso),
      chairName:
        typeof sourceRecord.chairName === "string" && sourceRecord.chairName.trim().length > 0
          ? sourceRecord.chairName.trim()
          : null,
      chairRole:
        typeof sourceRecord.chairRole === "string" && sourceRecord.chairRole.trim().length > 0
          ? sourceRecord.chairRole.trim()
          : null,
      signatureState: signature.state,
      signatureMode: signature.mode,
      signatureBytes: signature.signatureBytes,
      signatureCapBytes: signature.signatureCap,
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
): Promise<{ uri: string; diagnostics: AttendanceExportDiagnostics }> {
  if (attendanceSlipExportInFlight) {
    throw new Error("Export already in progress.");
  }
  attendanceSlipExportInFlight = true;

  let lastPlan: ReturnType<typeof summarizeExportPlan> | null = null;

  try {
    if (!Array.isArray(records) || records.length === 0) {
      throw new Error("No attendance records selected for export.");
    }
    if (records.length > MAX_EXPORT_RECORDS) {
      throw new Error(`Select ${MAX_EXPORT_RECORDS} or fewer attendance records per export.`);
    }

    const printModule = loadModule<PrintModule>("expo-print");
    const fileSystemModule = loadModule<FileSystemModule>("expo-file-system");

    if (!printModule || !fileSystemModule) {
      throw new Error(
        "PDF export module unavailable. Install expo-print and expo-file-system then restart Metro.",
      );
    }

    const outputDirectory = fileSystemModule.documentDirectory ?? fileSystemModule.cacheDirectory;
    if (!outputDirectory) {
      throw new Error("No writable directory available for attendance export.");
    }

    const defaultFileName = `${ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX} - ${new Date().toISOString().slice(0, 10)}.pdf`;
    const fileName = sanitizePdfFileName(options?.fileName ?? defaultFileName);

    const requestedChunkCount = Math.max(
      1,
      Math.min(
        MAX_CHUNK_COUNT,
        options?.maxRecordsPerChunk && Number.isFinite(options.maxRecordsPerChunk)
          ? Math.ceil(records.length / Math.max(1, Math.floor(options.maxRecordsPerChunk)))
          : 1,
      ),
    );

    options?.onProgress?.({
      chunkIndex: 1,
      chunkCount: requestedChunkCount,
      processedRecords: 0,
      totalRecords: records.length,
    });

    const buildPlanSummary = (
      currentPlan: HtmlChunkPlan,
      currentPrepared: PreparedRecord[],
    ): ReturnType<typeof summarizeExportPlan> => {
      const signatureModes = countSignatureModes(currentPrepared);
      const peakSignature = peakSignatureUsage(currentPrepared);
      return summarizeExportPlan({
        recordsCount: records.length,
        htmlBytesByChunk: currentPlan.htmlBytesByChunk,
        signatureModes,
        maxSignatureBytes: peakSignature.bytes,
        maxSignatureCapBytes: peakSignature.cap,
      });
    };

    let preparedRecords = await prepareRecordsForExport(records, fileSystemModule, {
      forcePlaceholderSignatures: false,
    });
    let plan = buildHtmlChunkPlan(preparedRecords, profile, requestedChunkCount);
    let summary = buildPlanSummary(plan, preparedRecords);
    lastPlan = summary;
    logExportPlan(summary);

    const exceededHtmlCap = plan.totalHtmlBytes > MAX_TOTAL_HTML_BYTES || plan.exceedsPerChunkCap;
    const gotChunked = plan.chunkCount > 1;

    if (exceededHtmlCap || gotChunked) {
      preparedRecords = await prepareRecordsForExport(records, fileSystemModule, {
        forcePlaceholderSignatures: true,
      });
      plan = buildHtmlChunkPlan(preparedRecords, profile, requestedChunkCount);
      summary = buildPlanSummary(plan, preparedRecords);
      lastPlan = summary;
      logExportDegrade(exceededHtmlCap ? "html_cap_exceeded" : "html_chunked", summary);
    }

    if (!isPlanWithinCaps(plan)) {
      for (
        let chunkCount = Math.max(2, requestedChunkCount + 1);
        chunkCount <= MAX_CHUNK_COUNT;
        chunkCount += 1
      ) {
        const candidatePlan = buildHtmlChunkPlan(preparedRecords, profile, chunkCount);
        const candidateSummary = buildPlanSummary(candidatePlan, preparedRecords);
        logExportDegrade("increase_chunk_count", candidateSummary);
        plan = candidatePlan;
        lastPlan = candidateSummary;
        if (isPlanWithinCaps(candidatePlan)) {
          break;
        }
      }
    }

    // Final gate: keep a single HTML payload for expo-print.
    if (
      !isPlanWithinCaps(plan) ||
      plan.chunkCount !== 1 ||
      plan.totalHtmlBytes > MAX_TOTAL_HTML_BYTES
    ) {
      throw new Error("Export too large. Reduce selected records or remove signatures.");
    }

    const printed = await printModule.printToFileAsync({ html: plan.chunks[0]?.html ?? "" });
    const targetUri = `${outputDirectory}${withChunkSuffix(fileName, 1, 1)}`;
    const existing = await fileSystemModule.getInfoAsync(targetUri);
    if (existing.exists) {
      await fileSystemModule.deleteAsync(targetUri, { idempotent: true });
    }
    await fileSystemModule.moveAsync({ from: printed.uri, to: targetUri });

    options?.onProgress?.({
      chunkIndex: 1,
      chunkCount: 1,
      processedRecords: records.length,
      totalRecords: records.length,
    });

    const diagnostics: AttendanceExportDiagnostics = {
      safeMode: summary.signatureModes.placeholder > 0,
      forcedPlaceholderSignatures: summary.signatureModes.placeholder > 0,
      records: records.length,
      htmlBytes: summary.totalHtmlBytes,
      maxHtmlBytes: MAX_TOTAL_HTML_BYTES,
      htmlUtilizationPct:
        MAX_TOTAL_HTML_BYTES > 0
          ? Number(((summary.totalHtmlBytes / MAX_TOTAL_HTML_BYTES) * 100).toFixed(1))
          : 0,
      signatureEmbedBudgetUsedBytes: Math.min(
        peakSignatureUsage(preparedRecords).bytes,
        MAX_SIGNATURE_EMBED_BUDGET_BYTES,
      ),
      signatureEmbedBudgetMaxBytes: MAX_SIGNATURE_EMBED_BUDGET_BYTES,
      signatureBudgetUtilizationPct:
        MAX_SIGNATURE_EMBED_BUDGET_BYTES > 0
          ? Number(
              (
                (Math.min(
                  peakSignatureUsage(preparedRecords).bytes,
                  MAX_SIGNATURE_EMBED_BUDGET_BYTES,
                ) /
                  MAX_SIGNATURE_EMBED_BUDGET_BYTES) *
                100
              ).toFixed(1),
            )
          : 0,
      signatureModes: summary.signatureModes,
      caps: {
        maxSignatureSvgBytes: MAX_SIGNATURE_SVG_BYTES,
        maxSignaturePngBytes: MAX_SIGNATURE_PNG_BYTES,
      },
    };

    return { uri: targetUri, diagnostics };
  } catch (error) {
    logExportFail(error, lastPlan);
    throw error;
  } finally {
    attendanceSlipExportInFlight = false;
  }
}

export async function printAttendanceSlipPdf(
  records: AttendanceSlipRecord[],
  profile: AttendanceSlipUserProfile,
  options?: GenerateAttendanceSlipOptions,
): Promise<void> {
  const exported = await generateAttendanceSlipPdf(records, profile, options);
  const printModule = loadModule<PrintModule>("expo-print");
  if (!printModule || typeof printModule.printAsync !== "function") {
    throw new Error("Print module unavailable. Install expo-print then restart Metro.");
  }

  try {
    await printModule.printAsync({ uri: exported.uri });
  } catch {
    throw new Error("PDF export failed while opening print dialog.");
  }
}

export async function shareAttendanceSlipPdf(
  uriOrUris: string | string[],
  fileName?: string,
): Promise<void> {
  if (attendanceSlipShareInFlight) {
    throw new Error("Share already in progress.");
  }
  attendanceSlipShareInFlight = true;

  try {
    const sharingModule = loadModule<SharingModule>("expo-sharing");
    const fileSystemModule = loadModule<FileSystemModule>("expo-file-system");
    if (!sharingModule || !fileSystemModule) {
      throw new Error(
        "Share module unavailable. Install expo-sharing and expo-file-system then restart Metro.",
      );
    }

    const uris = Array.isArray(uriOrUris)
      ? uriOrUris.filter((uri) => uri.trim().length > 0)
      : [uriOrUris];
    if (uris.length === 0) {
      throw new Error("No exported PDF file available to share.");
    }

    for (const uri of uris) {
      if (!uri.startsWith("file://")) {
        throw new Error("No exported PDF file available to share.");
      }
      const info = await fileSystemModule.getInfoAsync(uri);
      if (!info.exists) {
        throw new Error("No exported PDF file available to share.");
      }
    }

    let canShare = false;
    try {
      canShare = await sharingModule.isAvailableAsync();
    } catch {
      throw new Error("Share sheet unavailable on this device.");
    }
    if (!canShare) {
      throw new Error("Share sheet unavailable on this device.");
    }

    for (let index = 0; index < uris.length; index += 1) {
      const uri = uris[index];
      const dialogTitle =
        uris.length === 1
          ? (fileName ?? ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX)
          : `${fileName ?? ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX} (${index + 1}/${uris.length})`;

      try {
        await sharingModule.shareAsync(uri, {
          UTI: "com.adobe.pdf",
          mimeType: "application/pdf",
          dialogTitle,
        });
      } catch {
        throw new Error("PDF export failed while opening share sheet.");
      }
    }
  } finally {
    attendanceSlipShareInFlight = false;
  }
}

export function buildAttendanceSlipHtmlForTest(records: AttendanceSlipRecord[]): string {
  const prepared: PreparedRecord[] = records.map((record) => ({
    id: asSafeText(record.id, "attendance"),
    meetingName: asSafeText(record.meetingName, "Recovery Meeting"),
    meetingAddress: asSafeText(record.meetingAddress, "Address unavailable"),
    startAtIso: normalizeIsoDate(record.startAtIso, new Date().toISOString()),
    endAtIso: record.endAtIso,
    durationSeconds: normalizeDurationSeconds(
      record.durationSeconds,
      record.startAtIso,
      record.endAtIso,
    ),
    chairName: record.chairName ?? null,
    chairRole: record.chairRole ?? null,
    signatureState:
      (typeof record.signatureRefUri === "string" && record.signatureRefUri.trim().length > 0) ||
      (typeof record.legacySignatureSvgBase64 === "string" &&
        record.legacySignatureSvgBase64.trim().length > 0)
        ? { state: "on_file" }
        : { state: "unsigned" },
    signatureMode: "placeholder",
    signatureBytes: 0,
    signatureCapBytes: MAX_SIGNATURE_PNG_BYTES,
  }));
  return buildAttendanceHtml(prepared, { participantName: "Test Participant" });
}

export const __attendanceSlipPdfTestUtils = {
  buildAttendanceSlipHtmlForTest,
};
