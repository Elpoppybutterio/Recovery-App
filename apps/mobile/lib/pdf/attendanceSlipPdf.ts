export const ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX = "AA-NA Attendance Slip";
export const ATTENDANCE_SLIP_EXPORT_CHUNK_SIZE = 5;
const MAX_SIGNATURE_BASE64_CHARS = 20_000;
const MAX_SIGNATURE_BASE64_TOTAL_CHARS = 160_000;
const MAX_RECORDS_WITH_SIGNATURE_IMAGES = 10;

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

export type AttendanceSlipProgressCallback = (completedChunks: number, totalChunks: number) => void;

type PrintModule = {
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
  getInfoAsync(uri: string): Promise<{ exists: boolean }>;
  deleteAsync(uri: string, options?: { idempotent?: boolean }): Promise<void>;
  moveAsync(input: { from: string; to: string }): Promise<void>;
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

function asSafeOptionalText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function parseDateMs(value: string | null | undefined): number | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const date = new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function normalizeIso(value: unknown, fallbackIso: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallbackIso;
}

function normalizeOptionalIso(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

function sanitizeBase64Signature(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const cleaned = trimmed.replace(/[^A-Za-z0-9+/=]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeDurationSeconds(
  value: unknown,
  startAtIso: string,
  endAtIso: string | null,
): number | null {
  const provided = asFiniteOrNull(value);
  if (provided !== null) {
    return Math.max(0, Math.floor(provided));
  }

  const startMs = parseDateMs(startAtIso);
  const endMs = parseDateMs(endAtIso);
  if (startMs === null || endMs === null || endMs < startMs) {
    return null;
  }

  return Math.floor((endMs - startMs) / 1000);
}

function normalizeAttendanceSlipRecord(
  record: AttendanceSlipRecord | null | undefined,
  index: number,
): AttendanceSlipRecord {
  const fallbackIso = new Date().toISOString();
  const startAtIso = normalizeIso(record?.startAtIso, fallbackIso);
  const endAtIso = normalizeOptionalIso(record?.endAtIso ?? null);

  return {
    id: asSafeText(record?.id, `attendance-${index + 1}`),
    meetingName: asSafeText(record?.meetingName, "Recovery Meeting"),
    meetingAddress: asSafeText(record?.meetingAddress, "Address unavailable"),
    startAtIso,
    endAtIso,
    durationSeconds: normalizeDurationSeconds(record?.durationSeconds, startAtIso, endAtIso),
    signatureSvgBase64: sanitizeBase64Signature(record?.signatureSvgBase64),
    chairName: asSafeOptionalText(record?.chairName),
    chairRole: asSafeOptionalText(record?.chairRole),
    signatureCapturedAtIso: normalizeOptionalIso(record?.signatureCapturedAtIso),
    startLocation: normalizeLocationStamp(record?.startLocation),
    endLocation: normalizeLocationStamp(record?.endLocation),
  };
}

export function normalizeAttendanceSlipRecords(
  records: ReadonlyArray<AttendanceSlipRecord | null | undefined>,
): AttendanceSlipRecord[] {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.map((record, index) => normalizeAttendanceSlipRecord(record, index));
}

function compareAttendanceRecords(left: AttendanceSlipRecord, right: AttendanceSlipRecord): number {
  const leftMs = parseDateMs(left.startAtIso);
  const rightMs = parseDateMs(right.startAtIso);
  if (leftMs !== null && rightMs !== null && leftMs !== rightMs) {
    return leftMs - rightMs;
  }
  if (leftMs !== null && rightMs === null) {
    return -1;
  }
  if (leftMs === null && rightMs !== null) {
    return 1;
  }
  return left.id.localeCompare(right.id);
}

function shouldEmbedSignatures(records: AttendanceSlipRecord[]): boolean {
  if (records.length > MAX_RECORDS_WITH_SIGNATURE_IMAGES) {
    return false;
  }

  const totalChars = records.reduce((sum, record) => {
    const signature = sanitizeBase64Signature(record.signatureSvgBase64);
    return sum + (signature?.length ?? 0);
  }, 0);

  return totalChars <= MAX_SIGNATURE_BASE64_TOTAL_CHARS;
}

function buildSignatureMarkup(
  record: AttendanceSlipRecord,
  includeSignatureImages: boolean,
): string {
  if (!includeSignatureImages) {
    return '<p class="muted">Signature captured on file (image omitted for stable export).</p>';
  }

  const signature = sanitizeBase64Signature(record.signatureSvgBase64);
  if (!signature) {
    return '<p class="muted">Unsigned</p>';
  }

  if (signature.length > MAX_SIGNATURE_BASE64_CHARS) {
    return '<p class="muted">Signature captured on file (image omitted for stable export).</p>';
  }

  return `<img alt="Chair signature" src="data:image/svg+xml;base64,${signature}" style="width:100%;max-width:460px;border:1px solid #d5d9e4;border-radius:6px;"/>`;
}

function buildAttendancePage(
  record: AttendanceSlipRecord,
  profile: AttendanceSlipUserProfile,
  includeSignatureImages: boolean,
): string {
  const chairIdentity = [record.chairName?.trim() ?? "", record.chairRole?.trim() ?? ""]
    .filter((entry) => entry.length > 0)
    .join(" • ");

  return `<section class="page">
    <h1>AA/NA Attendance Slip</h1>
    <p class="muted">Generated ${escapeHtml(new Date().toLocaleString())}</p>

    <table>
      <tr><td><strong>Participant</strong></td><td>${escapeHtml(asSafeText(profile.participantName, "Unknown"))}</td></tr>
      <tr><td><strong>Date</strong></td><td>${escapeHtml(formatDateOnly(asSafeText(record.startAtIso, new Date().toISOString())))}</td></tr>
      <tr><td><strong>Meeting</strong></td><td>${escapeHtml(asSafeText(record.meetingName, "Recovery Meeting"))}</td></tr>
      <tr><td><strong>Location</strong></td><td>${escapeHtml(asSafeText(record.meetingAddress, "Address unavailable"))}</td></tr>
      <tr><td><strong>Start</strong></td><td>${escapeHtml(formatDateTime(record.startAtIso))}</td></tr>
      <tr><td><strong>End</strong></td><td>${escapeHtml(formatDateTime(record.endAtIso))}</td></tr>
      <tr><td><strong>Duration</strong></td><td>${escapeHtml(formatDuration(record.durationSeconds))}</td></tr>
      <tr><td><strong>GPS Snapshot (start)</strong></td><td>${escapeHtml(formatLocation(record.startLocation))}</td></tr>
      <tr><td><strong>GPS Snapshot (end)</strong></td><td>${escapeHtml(formatLocation(record.endLocation))}</td></tr>
    </table>

    <h2>Chair Signature</h2>
    ${buildSignatureMarkup(record, includeSignatureImages)}
    <p><strong>Chair Printed Name</strong>: ${escapeHtml(chairIdentity || "Not provided")}</p>
    <p class="muted">Electronically captured signature${record.signatureCapturedAtIso ? ` at ${escapeHtml(formatDateTime(record.signatureCapturedAtIso))}` : ""}.</p>
  </section>`;
}

function buildAttendanceHtml(
  records: AttendanceSlipRecord[],
  profile: AttendanceSlipUserProfile,
  onProgress?: AttendanceSlipProgressCallback,
): string {
  const includeSignatureImages = shouldEmbedSignatures(records);
  const totalChunks = Math.max(1, Math.ceil(records.length / ATTENDANCE_SLIP_EXPORT_CHUNK_SIZE));

  let pages = "";
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * ATTENDANCE_SLIP_EXPORT_CHUNK_SIZE;
    const end = Math.min(start + ATTENDANCE_SLIP_EXPORT_CHUNK_SIZE, records.length);
    const chunkRecords = records.slice(start, end);

    onProgress?.(chunkIndex + 1, totalChunks);

    for (const record of chunkRecords) {
      pages += `${buildAttendancePage(record, profile, includeSignatureImages)}\n`;
    }
  }

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

export async function generateAttendanceSlipPdf(
  records: AttendanceSlipRecord[],
  profile: AttendanceSlipUserProfile,
  options?: { fileName?: string; onProgress?: AttendanceSlipProgressCallback },
): Promise<string> {
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

  const normalized = normalizeAttendanceSlipRecords(records);
  if (normalized.length === 0) {
    throw new Error("No valid attendance records selected for export.");
  }

  const sorted = [...normalized].sort(compareAttendanceRecords);
  const html = buildAttendanceHtml(sorted, profile, options?.onProgress);
  const printed = await printModule.printToFileAsync({ html, width: 612, height: 792 });

  const outputDirectory = fileSystemModule.cacheDirectory ?? fileSystemModule.documentDirectory;
  if (!outputDirectory) {
    throw new Error("No writable directory available for attendance export.");
  }

  const defaultFileName = `${ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX} - ${new Date().toISOString().slice(0, 10)}.pdf`;
  const fileName = (options?.fileName ?? defaultFileName)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const targetUri = `${outputDirectory}${fileName}`;

  const existing = await fileSystemModule.getInfoAsync(targetUri);
  if (existing.exists) {
    await fileSystemModule.deleteAsync(targetUri, { idempotent: true });
  }

  await fileSystemModule.moveAsync({ from: printed.uri, to: targetUri });
  return targetUri;
}

export async function shareAttendanceSlipPdf(uri: string, fileName?: string): Promise<void> {
  const sharingModule = loadModule<SharingModule>("expo-sharing");
  if (!sharingModule) {
    throw new Error("Share module unavailable. Install expo-sharing then restart Metro.");
  }

  const canShare = await sharingModule.isAvailableAsync();
  if (!canShare) {
    throw new Error("Share sheet unavailable on this device.");
  }

  await sharingModule.shareAsync(uri, {
    UTI: "com.adobe.pdf",
    mimeType: "application/pdf",
    dialogTitle: fileName ?? ATTENDANCE_SLIP_PDF_FILE_NAME_PREFIX,
  });
}
