export const ATTENDANCE_PDF_FILE_NAME = "AA-NA Meeting Attendance Sheet.pdf";
const MAX_SIGNATURE_BASE64_CHARS_IN_ATTENDANCE_PDF = 70000;

type LocationStamp = {
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
};

export type AttendancePdfPayload = {
  userLabel: string;
  meetingName: string;
  meetingAddress: string;
  startAtIso: string;
  endAtIso: string;
  durationSeconds: number;
  startLocation: LocationStamp;
  endLocation: LocationStamp;
  signatureSvgBase64: string | null;
};

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

function formatDateTime(valueIso: string): string {
  const date = new Date(valueIso);
  return Number.isNaN(date.getTime()) ? valueIso : formatDateTimeLocal(date);
}

function formatLocation(value: LocationStamp): string {
  if (value.lat === null || value.lng === null) {
    return "Unavailable";
  }

  const coordinates = `${value.lat.toFixed(6)}, ${value.lng.toFixed(6)}`;
  if (value.accuracyM === null) {
    return coordinates;
  }
  return `${coordinates} (±${Math.round(value.accuracyM)}m)`;
}

function looksLikeSvgMarkup(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith("<svg") || (normalized.startsWith("<?xml") && normalized.includes("<svg"))
  );
}

function resolveSignatureImageSrc(signature: string): string {
  const trimmed = signature.trim();
  if (trimmed.toLowerCase().startsWith("data:image/")) {
    return trimmed;
  }
  if (looksLikeSvgMarkup(trimmed)) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}`;
  }
  // Backward compatibility with existing base64 payloads.
  return `data:image/svg+xml;base64,${trimmed}`;
}

function buildAttendanceHtml(payload: AttendancePdfPayload): string {
  const signatureMarkup = payload.signatureSvgBase64
    ? payload.signatureSvgBase64.length <= MAX_SIGNATURE_BASE64_CHARS_IN_ATTENDANCE_PDF
      ? `<img alt="Signature" src="${escapeHtml(resolveSignatureImageSrc(payload.signatureSvgBase64))}" style="width: 100%; max-width: 420px; border: 1px solid #d0d5dd; border-radius: 8px;" />`
      : `<p style="color:#667085;">Signature captured (omitted in PDF to keep generation stable).</p>`
    : `<p style="color:#667085;">No signature captured.</p>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>${ATTENDANCE_PDF_FILE_NAME}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; padding: 24px; }
      h1 { margin: 0 0 8px 0; font-size: 22px; }
      h2 { margin: 20px 0 8px 0; font-size: 16px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      td { border: 1px solid #e5e7eb; padding: 8px; font-size: 13px; vertical-align: top; }
      .muted { color: #6b7280; font-size: 12px; }
      .footer { margin-top: 24px; color: #6b7280; font-size: 12px; }
    </style>
  </head>
  <body>
    <h1>AA-NA Meeting Attendance Sheet</h1>
    <p class="muted">Generated at ${escapeHtml(formatDateTimeLocal(new Date()))}</p>

    <table>
      <tr><td><strong>User</strong></td><td>${escapeHtml(payload.userLabel)}</td></tr>
      <tr><td><strong>Meeting</strong></td><td>${escapeHtml(payload.meetingName)}</td></tr>
      <tr><td><strong>Address</strong></td><td>${escapeHtml(payload.meetingAddress)}</td></tr>
      <tr><td><strong>Start Time</strong></td><td>${escapeHtml(formatDateTime(payload.startAtIso))}</td></tr>
      <tr><td><strong>End Time</strong></td><td>${escapeHtml(formatDateTime(payload.endAtIso))}</td></tr>
      <tr><td><strong>Duration</strong></td><td>${payload.durationSeconds} seconds</td></tr>
      <tr><td><strong>Start Coordinates</strong></td><td>${escapeHtml(formatLocation(payload.startLocation))}</td></tr>
      <tr><td><strong>End Coordinates</strong></td><td>${escapeHtml(formatLocation(payload.endLocation))}</td></tr>
    </table>

    <h2>Chairperson Signature</h2>
    ${signatureMarkup}

    <p class="footer">Generated by Sober AI</p>
  </body>
</html>`;
}

export async function exportAttendancePdf(payload: AttendancePdfPayload): Promise<string> {
  const printModule = loadModule<PrintModule>("expo-print");
  const sharingModule = loadModule<SharingModule>("expo-sharing");
  const fileSystemModule = loadModule<FileSystemModule>("expo-file-system");

  if (!printModule || !sharingModule || !fileSystemModule) {
    throw new Error(
      "PDF export module unavailable. Install expo-print, expo-file-system, expo-sharing and restart Metro.",
    );
  }

  const html = buildAttendanceHtml(payload);
  const printed = await printModule.printToFileAsync({ html, width: 612, height: 792 });
  const outputDirectory = fileSystemModule.documentDirectory ?? fileSystemModule.cacheDirectory;
  if (!outputDirectory) {
    throw new Error("No writable directory available for PDF export.");
  }

  const targetUri = `${outputDirectory}${ATTENDANCE_PDF_FILE_NAME}`;
  const existing = await fileSystemModule.getInfoAsync(targetUri);
  if (existing.exists) {
    await fileSystemModule.deleteAsync(targetUri, { idempotent: true });
  }

  await fileSystemModule.moveAsync({ from: printed.uri, to: targetUri });

  const canShare = await sharingModule.isAvailableAsync();
  if (canShare) {
    await sharingModule.shareAsync(targetUri, {
      UTI: "com.adobe.pdf",
      mimeType: "application/pdf",
      dialogTitle: ATTENDANCE_PDF_FILE_NAME,
    });
  }

  return targetUri;
}
