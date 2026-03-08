import {
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

type SignatureModeCounts = {
  inline_svg: number;
  png_base64: number;
  placeholder: number;
  missing_file: number;
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
  | {
      state: "unsigned";
      mode: "placeholder";
      embeddedBytes: 0;
      hadSignatureInput: false;
      forcedPlaceholder: false;
    }
  | {
      state: "on_file";
      mode: "placeholder" | "missing_file";
      embeddedBytes: 0;
      hadSignatureInput: true;
      forcedPlaceholder: boolean;
    }
  | {
      state: "image";
      dataUri: string;
      mode: "inline_svg" | "png_base64";
      embeddedBytes: number;
      hadSignatureInput: true;
      forcedPlaceholder: false;
    };

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
};

type SignatureEmbedBudget = {
  usedBytes: number;
  maxBytes: number;
};

type PrepareRecordsResult = {
  records: PreparedRecord[];
  signatureModes: SignatureModeCounts;
  embedBudgetUsedBytes: number;
  forcedPlaceholderSignatures: boolean;
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

function utf8ByteLength(value: string): number {
  try {
    return new TextEncoder().encode(value).length;
  } catch {
    return value.length;
  }
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

function buildSignatureCell(record: PreparedRecord): string {
  const chairBits = [record.chairName ?? "", record.chairRole ?? ""].filter(
    (entry) => entry.trim().length > 0,
  );
  const chairLine = chairBits.length > 0 ? `<div>${escapeHtml(chairBits.join(" - "))}</div>` : "";

  if (record.signatureState.state === "image") {
    return `${chairLine}<div class="sig-image-wrap"><img alt="Signature" src="${escapeHtml(record.signatureState.dataUri)}" class="sig-image" /></div>`;
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

async function resolveSignatureState(
  fileSystemModule: SignatureFileSystemModule | null,
  record: AttendanceSlipRecord,
  subdirectory: string,
  embedBudget: SignatureEmbedBudget,
): Promise<SignatureRenderState> {
  const rawSignature = [record.signatureRefUri, record.legacySignatureSvgBase64]
    .find((entry) => typeof entry === "string" && entry.trim().length > 0)
    ?.trim();
  if (!rawSignature) {
    return {
      state: "unsigned",
      mode: "placeholder",
      embeddedBytes: 0,
      hadSignatureInput: false,
      forcedPlaceholder: false,
    };
  }
  if (!fileSystemModule) {
    return {
      state: "on_file",
      mode: "missing_file",
      embeddedBytes: 0,
      hadSignatureInput: true,
      forcedPlaceholder: false,
    };
  }

  const shouldVerifyFileExists = rawSignature.startsWith("file://") || rawSignature.startsWith("/");
  const normalized = await normalizeSignatureValueToRef(rawSignature, {
    fileSystem: fileSystemModule,
    recordId: asSafeText(record.id, "signature"),
    subdirectory,
    verifyFileExists: shouldVerifyFileExists,
  });
  if (!normalized.ref) {
    return {
      state: "on_file",
      mode: "missing_file",
      embeddedBytes: 0,
      hadSignatureInput: true,
      forcedPlaceholder: false,
    };
  }

  const isSvg = normalized.ref.mimeType === "image/svg+xml";
  const maxBytesForSignature = isSvg ? MAX_SIGNATURE_SVG_BYTES : MAX_SIGNATURE_PNG_BYTES;
  const encoded = await signatureRefToDataUri({
    fileSystem: fileSystemModule,
    ref: normalized.ref,
    maxBytes: maxBytesForSignature,
  });
  if (!encoded.dataUri) {
    return {
      state: "on_file",
      mode: encoded.bytes > maxBytesForSignature ? "placeholder" : "missing_file",
      embeddedBytes: 0,
      hadSignatureInput: true,
      forcedPlaceholder: encoded.bytes > maxBytesForSignature,
    };
  }

  if (embedBudget.usedBytes + encoded.bytes > embedBudget.maxBytes) {
    return {
      state: "on_file",
      mode: "placeholder",
      embeddedBytes: 0,
      hadSignatureInput: true,
      forcedPlaceholder: true,
    };
  }

  embedBudget.usedBytes += encoded.bytes;
  return {
    state: "image",
    dataUri: encoded.dataUri,
    mode: isSvg ? "inline_svg" : "png_base64",
    embeddedBytes: encoded.bytes,
    hadSignatureInput: true,
    forcedPlaceholder: false,
  };
}

function emptySignatureModeCounts(): SignatureModeCounts {
  return {
    inline_svg: 0,
    png_base64: 0,
    placeholder: 0,
    missing_file: 0,
  };
}

async function prepareRecordsForExport(
  records: AttendanceSlipRecord[],
  fileSystemModule: SignatureFileSystemModule | null,
): Promise<PrepareRecordsResult> {
  const prepared: PreparedRecord[] = [];
  const signatureSubdirectory = "attendance-signatures";
  const signatureModes = emptySignatureModeCounts();
  const embedBudget: SignatureEmbedBudget = {
    usedBytes: 0,
    maxBytes: MAX_SIGNATURE_EMBED_BUDGET_BYTES,
  };
  let forcedPlaceholderSignatures = false;

  for (const sourceRecord of records) {
    const startAtIso = normalizeIsoDate(sourceRecord.startAtIso, new Date().toISOString());
    const normalizedEndAtIso = sourceRecord.endAtIso
      ? normalizeIsoDate(sourceRecord.endAtIso, sourceRecord.endAtIso)
      : null;
    const endAtIso =
      normalizedEndAtIso && Number.isFinite(new Date(normalizedEndAtIso).getTime())
        ? normalizedEndAtIso
        : null;

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
      signatureState: await resolveSignatureState(
        fileSystemModule,
        sourceRecord,
        signatureSubdirectory,
        embedBudget,
      ),
    });

    const state = prepared[prepared.length - 1]?.signatureState;
    if (state) {
      signatureModes[state.mode] += 1;
      if (state.forcedPlaceholder) {
        forcedPlaceholderSignatures = true;
      }
    }
  }

  const sorted = prepared.sort(
    (left, right) => new Date(left.startAtIso).getTime() - new Date(right.startAtIso).getTime(),
  );
  return {
    records: sorted,
    signatureModes,
    embedBudgetUsedBytes: embedBudget.usedBytes,
    forcedPlaceholderSignatures,
  };
}

function summarizeExportPlan(input: {
  recordsCount: number;
  htmlBytes: number;
  signatureModes: SignatureModeCounts;
  embedBudgetUsedBytes: number;
  forcedPlaceholderSignatures: boolean;
  safeMode: boolean;
}): {
  records: number;
  htmlBytes: number;
  maxHtmlBytes: number;
  htmlUtilizationPct: number;
  signatureEmbedBudgetUsedBytes: number;
  signatureEmbedBudgetMaxBytes: number;
  signatureBudgetUtilizationPct: number;
  signatureModes: SignatureModeCounts;
  caps: {
    maxTotalHtmlBytes: number;
    maxSignatureEmbedBudgetBytes: number;
    maxSignatureSvgBytes: number;
    maxSignaturePngBytes: number;
  };
  approachingCaps: {
    approachingHtmlCap: boolean;
    approachingSigCap: boolean;
  };
  safeMode: boolean;
  forcedPlaceholderSignatures: boolean;
} {
  const htmlUtilizationPct =
    MAX_TOTAL_HTML_BYTES > 0
      ? Number(((input.htmlBytes / MAX_TOTAL_HTML_BYTES) * 100).toFixed(1))
      : 0;
  const signatureBudgetUtilizationPct =
    MAX_SIGNATURE_EMBED_BUDGET_BYTES > 0
      ? Number(((input.embedBudgetUsedBytes / MAX_SIGNATURE_EMBED_BUDGET_BYTES) * 100).toFixed(1))
      : 0;

  return {
    records: input.recordsCount,
    htmlBytes: input.htmlBytes,
    maxHtmlBytes: MAX_TOTAL_HTML_BYTES,
    htmlUtilizationPct,
    signatureEmbedBudgetUsedBytes: input.embedBudgetUsedBytes,
    signatureEmbedBudgetMaxBytes: MAX_SIGNATURE_EMBED_BUDGET_BYTES,
    signatureBudgetUtilizationPct,
    signatureModes: input.signatureModes,
    caps: {
      maxTotalHtmlBytes: MAX_TOTAL_HTML_BYTES,
      maxSignatureEmbedBudgetBytes: MAX_SIGNATURE_EMBED_BUDGET_BYTES,
      maxSignatureSvgBytes: MAX_SIGNATURE_SVG_BYTES,
      maxSignaturePngBytes: MAX_SIGNATURE_PNG_BYTES,
    },
    approachingCaps: {
      approachingHtmlCap: input.htmlBytes >= Math.floor(MAX_TOTAL_HTML_BYTES * 0.85),
      approachingSigCap:
        input.embedBudgetUsedBytes >= Math.floor(MAX_SIGNATURE_EMBED_BUDGET_BYTES * 0.85),
    },
    safeMode: input.safeMode,
    forcedPlaceholderSignatures: input.forcedPlaceholderSignatures,
  };
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

  let planForLogs: ReturnType<typeof summarizeExportPlan> | null = null;

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

    options?.onProgress?.({
      chunkIndex: 1,
      chunkCount: 1,
      processedRecords: 0,
      totalRecords: records.length,
    });

    const prepared = await prepareRecordsForExport(records, fileSystemModule);
    const html = buildAttendanceHtml(prepared.records, profile);
    const htmlBytes = utf8ByteLength(html);
    const safeMode =
      prepared.forcedPlaceholderSignatures ||
      htmlBytes >= MAX_TOTAL_HTML_BYTES * 0.9 ||
      prepared.embedBudgetUsedBytes >= MAX_SIGNATURE_EMBED_BUDGET_BYTES * 0.9;

    planForLogs = summarizeExportPlan({
      recordsCount: prepared.records.length,
      htmlBytes,
      signatureModes: prepared.signatureModes,
      embedBudgetUsedBytes: prepared.embedBudgetUsedBytes,
      forcedPlaceholderSignatures: prepared.forcedPlaceholderSignatures,
      safeMode,
    });
    console.log("[attendance-export] plan", planForLogs);

    if (htmlBytes > MAX_TOTAL_HTML_BYTES) {
      throw new Error("Export payload too large. Reduce selection and try again.");
    }

    const diagnostics: AttendanceExportDiagnostics = {
      safeMode,
      forcedPlaceholderSignatures: prepared.forcedPlaceholderSignatures,
      records: prepared.records.length,
      htmlBytes,
      maxHtmlBytes: MAX_TOTAL_HTML_BYTES,
      htmlUtilizationPct: planForLogs.htmlUtilizationPct,
      signatureEmbedBudgetUsedBytes: prepared.embedBudgetUsedBytes,
      signatureEmbedBudgetMaxBytes: MAX_SIGNATURE_EMBED_BUDGET_BYTES,
      signatureBudgetUtilizationPct: planForLogs.signatureBudgetUtilizationPct,
      signatureModes: prepared.signatureModes,
      caps: {
        maxSignatureSvgBytes: MAX_SIGNATURE_SVG_BYTES,
        maxSignaturePngBytes: MAX_SIGNATURE_PNG_BYTES,
      },
    };

    let printed: { uri: string };
    try {
      printed = await printModule.printToFileAsync({ html, width: 612, height: 792 });
    } catch {
      throw new Error("PDF export failed during print rendering.");
    }

    const targetUri = `${outputDirectory}${fileName}`;
    try {
      const existing = await fileSystemModule.getInfoAsync(targetUri);
      if (existing.exists) {
        await fileSystemModule.deleteAsync(targetUri, { idempotent: true });
      }
      await fileSystemModule.moveAsync({ from: printed.uri, to: targetUri });
    } catch {
      throw new Error("PDF export failed while writing output file.");
    }

    options?.onProgress?.({
      chunkIndex: 1,
      chunkCount: 1,
      processedRecords: records.length,
      totalRecords: records.length,
    });

    return { uri: targetUri, diagnostics };
  } catch (error) {
    console.log("[attendance-export] fail", {
      message: error instanceof Error ? error.message : String(error),
      plan: planForLogs,
    });
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
    if (!sharingModule) {
      throw new Error("Share module unavailable. Install expo-sharing then restart Metro.");
    }

    const uris = Array.isArray(uriOrUris)
      ? uriOrUris.filter((uri) => uri.trim().length > 0)
      : [uriOrUris];
    if (uris.length === 0) {
      throw new Error("No exported PDF file available to share.");
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
        ? {
            state: "on_file",
            mode: "placeholder",
            embeddedBytes: 0,
            hadSignatureInput: true,
            forcedPlaceholder: false,
          }
        : {
            state: "unsigned",
            mode: "placeholder",
            embeddedBytes: 0,
            hadSignatureInput: false,
            forcedPlaceholder: false,
          },
  }));
  return buildAttendanceHtml(prepared, { participantName: "Test Participant" });
}

export const __attendanceSlipPdfTestUtils = {
  buildAttendanceSlipHtmlForTest,
};
