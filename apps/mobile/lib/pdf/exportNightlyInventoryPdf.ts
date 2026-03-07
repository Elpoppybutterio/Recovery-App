export const NIGHTLY_INVENTORY_PDF_FILE_NAME_PREFIX = "Nightly Routine";

export type NightlyInventoryPdfPayload = {
  userLabel: string;
  dateKey: string;
  prompt: string;
  gotOnKneesCompleted: boolean;
  resentful: string[];
  selfSeeking: string[];
  selfish: string[];
  dishonest: string[];
  apology: string[];
  notes: string;
  completedAt: string | null;
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

function formatDateTime(valueIso: string | null): string {
  if (!valueIso) {
    return "Not marked complete";
  }
  const date = new Date(valueIso);
  return Number.isNaN(date.getTime()) ? valueIso : formatDateTimeLocal(date);
}

function buildFileName(dateKey: string): string {
  return `${NIGHTLY_INVENTORY_PDF_FILE_NAME_PREFIX} - ${dateKey}.pdf`;
}

function listMarkup(items: string[]): string {
  if (items.length === 0) {
    return "<li>None</li>";
  }
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function buildNightlyInventoryHtml(payload: NightlyInventoryPdfPayload): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset=\"UTF-8\" />
    <title>${escapeHtml(buildFileName(payload.dateKey))}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; padding: 24px; }
      h1 { margin: 0 0 8px 0; font-size: 22px; }
      h2 { margin: 20px 0 8px 0; font-size: 16px; }
      p { margin: 4px 0; font-size: 13px; }
      ul { margin: 6px 0 0 0; padding-left: 18px; }
      li { margin-bottom: 4px; font-size: 13px; }
      .box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; margin-top: 8px; }
      .muted { color: #6b7280; font-size: 12px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .gridFull { grid-column: span 2; }
    </style>
  </head>
  <body>
    <h1>Nightly Routine</h1>
    <p class=\"muted\">Date: ${escapeHtml(payload.dateKey)}</p>
    <p class=\"muted\">User: ${escapeHtml(payload.userLabel)}</p>
    <p class=\"muted\">Completed: ${escapeHtml(formatDateTime(payload.completedAt))}</p>
    <p class=\"muted\">Got on knees: ${payload.gotOnKneesCompleted ? "Yes" : "No"}</p>

    <h2>Prompt</h2>
    <div class=\"box\">${escapeHtml(payload.prompt)}</div>

    <div class=\"grid\">
      <div class=\"box\"><strong>Resentful</strong><ul>${listMarkup(payload.resentful)}</ul></div>
      <div class=\"box\"><strong>Self-seeking</strong><ul>${listMarkup(payload.selfSeeking)}</ul></div>
      <div class=\"box\"><strong>Selfish</strong><ul>${listMarkup(payload.selfish)}</ul></div>
      <div class=\"box\"><strong>Dishonest</strong><ul>${listMarkup(payload.dishonest)}</ul></div>
      <div class=\"box gridFull\"><strong>Owe An Apology?</strong><ul>${listMarkup(payload.apology)}</ul></div>
    </div>

    <h2>Notes</h2>
    <div class=\"box\">${escapeHtml(payload.notes || "None")}</div>
  </body>
</html>`;
}

export async function exportNightlyInventoryPdf(
  payload: NightlyInventoryPdfPayload,
): Promise<string> {
  const printModule = loadModule<PrintModule>("expo-print");
  const sharingModule = loadModule<SharingModule>("expo-sharing");
  const fileSystemModule = loadModule<FileSystemModule>("expo-file-system");

  if (!printModule || !sharingModule || !fileSystemModule) {
    throw new Error(
      "PDF export module unavailable. Install expo-print, expo-file-system, expo-sharing and restart Metro.",
    );
  }

  const html = buildNightlyInventoryHtml(payload);
  const printed = await printModule.printToFileAsync({ html, width: 612, height: 792 });

  const outputDirectory = fileSystemModule.documentDirectory ?? fileSystemModule.cacheDirectory;
  if (!outputDirectory) {
    throw new Error("No writable directory available for PDF export.");
  }

  const fileName = buildFileName(payload.dateKey);
  const targetUri = `${outputDirectory}${fileName}`;
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
      dialogTitle: fileName,
    });
  }

  return targetUri;
}
